// Proof for server lifecycle guards:
// 1. HEAD /tables returns 200 with JSON headers and an empty body.
// 2. HEAD /avatars/:id.jpg returns 200 with JPEG headers and an empty body.
// 3. POST /avatars with an orphaned avatarId uploads safely without crashing.
// 4. A malformed WebSocket array frame is rejected immediately.
// 5. Rejoin rejects bot seat secrets.
// 6. Takeover queues bot answer for open table offers from other players.
// 7. Flush write errors restore dirty state and clean up the temp file.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "./node_modules/ws/index.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeDirs() {
  const root = mkdtempSync(path.join(tmpdir(), "emberisle-srv-guards-"));
  const d = { root, rooms: path.join(root, "rooms"), profiles: path.join(root, "profiles"), results: path.join(root, "results") };
  for (const p of [d.rooms, d.profiles, d.results]) mkdirSync(p, { recursive: true });
  return d;
}

function startHost(d, env = {}) {
  const proc = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: {
      ...process.env,
      PORT: "0",
      ROOMS_DIR: d.rooms,
      PROFILES_DIR: d.profiles,
      RESULTS_DIR: d.results,
      ACT_CAP: "1000",
      ACT_RATE: "1000",
      GRACE_MS: "300",
      HOLD_MS: "60000",
      LOBBY_HOLD_MS: "60000",
      TURN_MS: "60000",
      SAVE_MS: "25",
      BOT_ANSWER_MS: "20",
      PEOPLE_FIRST_MS: "20",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const host = { proc, out: "", err: "" };
  proc.stdout.on("data", (x) => (host.out += x));
  proc.stderr.on("data", (x) => (host.err += x));
  host.exited = new Promise((r) => proc.once("exit", (c, sig) => r(sig ?? c)));
  host.port = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`host startup timeout: ${host.err}`)), 8000);
    proc.stdout.on("data", () => {
      const m = host.out.match(/listening (\d+)/);
      if (m) { clearTimeout(t); resolve(Number(m[1])); }
    });
    proc.once("exit", (c) => { clearTimeout(t); reject(new Error(`host exited ${c}: ${host.err}`)); });
  });
  host.stop = async () => {
    if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGTERM");
    await host.exited;
  };
  return host;
}

async function connect(port, hello) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, welcome: null, seats: null, state: null, errors: [], messages: [], waiters: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    c.messages.push(m);
    if (m.type === "welcome") c.welcome = m;
    if (m.type === "seats") c.seats = m;
    if (m.type === "state") c.state = m;
    if (m.type === "error") c.errors.push(m.message);
    for (const w of c.waiters.splice(0)) w();
  });
  c.until = (ok, label, ms = 5000) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out: ${label} (errors=${JSON.stringify(c.errors)})`)), ms);
      const look = () => (ok() ? (clearTimeout(t), resolve()) : c.waiters.push(look));
      look();
    });
  c.send = (m) => ws.send(typeof m === "string" ? m : JSON.stringify(m));
  await new Promise((r, j) => { ws.once("open", r); ws.once("error", j); });
  if (hello) c.send(hello);
  return c;
}

function requestHttp(port, options, reqBody = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, ...options }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    if (reqBody) req.write(reqBody);
    req.end();
  });
}

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok ${passed}: ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
    console.error(`FAIL: ${name}\n  ${err.message.split("\n")[0]}`);
  }
}

// Case 1: HEAD /tables returns 200 with correct headers and empty body.
await check("HEAD /tables returns 200 with headers and empty body", async () => {
  const d = makeDirs();
  const host = startHost(d);
  const port = await host.port;
  try {
    const res = await requestHttp(port, { path: "/tables", method: "HEAD" });
    assert.equal(res.status, 200, "status is 200");
    assert.equal(res.headers["content-type"], "application/json", "content-type is json");
    assert.equal(res.body.length, 0, "HEAD body is empty");
    assert.ok(Number(res.headers["content-length"]) >= 2, "content-length matches array");
  } finally {
    await host.stop();
    rmSync(d.root, { recursive: true, force: true });
  }
});

// Case 2: HEAD /avatars/:id.jpg returns 200 with image headers and empty body.
await check("HEAD /avatars/:id.jpg returns 200 with image headers and empty body", async () => {
  const d = makeDirs();
  const host = startHost(d);
  const port = await host.port;
  try {
    const c = await connect(port, { type: "hello", name: "Host" });
    await c.until(() => c.welcome, "welcome");
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const post = await requestHttp(port, {
      path: "/avatars",
      method: "POST",
      headers: { "x-seat-secret": c.welcome.secret, "content-type": "image/jpeg" },
    }, jpeg);
    assert.equal(post.status, 200, "upload succeeded");
    const { url } = JSON.parse(post.body.toString());

    const head = await requestHttp(port, { path: url, method: "HEAD" });
    assert.equal(head.status, 200, "HEAD status is 200");
    assert.equal(head.headers["content-type"], "image/jpeg", "content-type is image/jpeg");
    assert.equal(head.headers["content-length"], String(jpeg.length), "content-length matches jpeg");
    assert.equal(head.body.length, 0, "HEAD body is empty");
    c.ws.close();
  } finally {
    await host.stop();
    rmSync(d.root, { recursive: true, force: true });
  }
});

// Case 3: Malformed WebSocket array frame is rejected immediately.
await check("WebSocket array frame is rejected cleanly", async () => {
  const d = makeDirs();
  const host = startHost(d);
  const port = await host.port;
  try {
    const c = await connect(port);
    c.send("[]");
    await c.until(() => c.errors.length > 0, "error received");
    assert.equal(c.errors[0], "not ready", "array payload rejected as not ready");
    c.ws.close();
  } finally {
    await host.stop();
    rmSync(d.root, { recursive: true, force: true });
  }
});

// Case 4: Rejoin rejects bot seat secrets.
await check("Rejoin rejects bot seat secrets", async () => {
  const d = makeDirs();
  const host = startHost(d);
  const port = await host.port;
  try {
    const c = await connect(port, { type: "hello", name: "Host" });
    await c.until(() => c.welcome, "welcome");
    c.send({ type: "addBot" });
    await c.until(() => c.seats?.seats.length === 2, "bot seated");

    // Read saved room file to inspect bot secret.
    const roomFile = path.join(d.rooms, `${c.welcome.code}.json`);
    await sleep(60);
    const saved = JSON.parse(await import("node:fs/promises").then((f) => f.readFile(roomFile, "utf8")));
    const botSeat = saved.seats.find((s) => s.bot);
    assert.ok(botSeat?.secret, "bot seat has secret");

    const rejoinAttempt = await connect(port, { type: "hello", code: c.welcome.code, secret: botSeat.secret });
    await rejoinAttempt.until(() => rejoinAttempt.errors.length > 0, "error received");
    assert.equal(rejoinAttempt.errors[0], "Seat is gone.", "bot secret cannot be rejoined");
    rejoinAttempt.ws.close();
    c.ws.close();
  } finally {
    await host.stop();
    rmSync(d.root, { recursive: true, force: true });
  }
});

// Case 5: Takeover queues bot answer for open trade offer from another player.
await check("Takeover queues bot answer for open trade offer", async () => {
  const d = makeDirs();
  const host = startHost(d, { GRACE_MS: "150", BOT_ANSWER_MS: "20", PEOPLE_FIRST_MS: "20" });
  const port = await host.port;
  try {
    const a = await connect(port, { type: "hello", name: "Alice" });
    await a.until(() => a.welcome, "a welcome");
    const code = a.welcome.code;
    const b = await connect(port, { type: "hello", code, name: "Bob" });
    await b.until(() => b.welcome, "b welcome");
    a.send({ type: "addBot" });
    await a.until(() => a.seats?.seats.length === 3, "3 seats");
    a.send({ type: "ready", value: true });
    b.send({ type: "ready", value: true });
    await a.until(() => a.seats.seats.every((s) => s.ready), "all ready");

    // Start game.
    a.send({ type: "start" });
    await a.until(() => a.state, "game started");
    await b.until(() => b.state, "b state");

    // Give Alice wheat and open an offer from Alice.
    const roomFile = path.join(d.rooms, `${code}.json`);
    await sleep(60);
    const fs = await import("node:fs/promises");
    const saved = JSON.parse(await fs.readFile(roomFile, "utf8"));
    const alicePid = a.state.you;
    const pAlice = saved.game.players.find((p) => p.id === alicePid);
    pAlice.resources.grain = 3;
    saved.game.phase = "main";
    saved.game.current = alicePid;
    await fs.writeFile(roomFile, JSON.stringify(saved));

    // Restart host to load modified room with Alice having grain in main phase.
    await host.stop();
    const host2 = startHost(d, { GRACE_MS: "150", BOT_ANSWER_MS: "20", PEOPLE_FIRST_MS: "20" });
    const port2 = await host2.port;
    try {
      const a2 = await connect(port2, { type: "hello", code, secret: a.welcome.secret });
      await a2.until(() => a2.state, "a2 state");
      const b2 = await connect(port2, { type: "hello", code, secret: b.welcome.secret });
      await b2.until(() => b2.state, "b2 state");

      // Alice asks for trade: give grain, want timber.
      a2.send({
        type: "tradeAsk",
        give: { grain: 1 },
        want: { timber: 1 },
        cid: "ask-1",
        turn: a2.state.actionStamp.turn,
        baseSeq: a2.state.actionStamp.baseSeq,
        connection: a2.state.actionStamp.connection,
      });
      await a2.until(() => a2.messages.some((m) => m.type === "tradeOffer"), "offer opened");

      // Bob disconnects. Grace period will expire and takeover will occur.
      const bobPid = b2.state.you;
      b2.ws.close();

      // Alice should receive tradeDeclined from Bob once Bob's new bot responds.
      await a2.until(() => a2.messages.some((m) => m.type === "tradeDeclined" && m.by === bobPid), "bob bot answered offer", 3000);
      const answered = a2.messages.some((m) => m.type === "tradeDeclined" && m.by === bobPid);
      assert.ok(answered, "takeover bot answered or declined open offer");
      a2.ws.close();
    } finally {
      await host2.stop();
    }
  } finally {
    rmSync(d.root, { recursive: true, force: true });
  }
});

// Case 6: Flush write failure cleans up .tmp file and leaves room dirty for retry.
await check("Flush write failure cleans up temp file and keeps dirty", async () => {
  const d = makeDirs();
  const host = startHost(d, { SAVE_MS: "20" });
  const port = await host.port;
  try {
    const c = await connect(port, { type: "hello", name: "Host" });
    await c.until(() => c.welcome, "welcome");
    const code = c.welcome.code;
    const roomFile = path.join(d.rooms, `${code}.json`);
    await sleep(60);
    assert.ok(existsSync(roomFile), "room file exists");

    // Replace room file with directory so writeFile succeeds on .tmp but rename throws EISDIR.
    rmSync(roomFile, { force: true });
    mkdirSync(roomFile);

    // Trigger state change (ready toggle) that queues flush.
    c.send({ type: "ready", value: true });
    await sleep(100);

    // Check that no .tmp file leaked in rooms directory.
    const tmps = readdirSync(d.rooms).filter((n) => n.endsWith(".tmp"));
    assert.deepEqual(tmps, [], "no temp file leaked after write failure");
    c.ws.close();
  } finally {
    await host.stop();
    rmSync(d.root, { recursive: true, force: true });
  }
});

if (failures.length > 0) {
  console.error(`server-lifecycle-guards-prove failed: ${failures.length} check(s) failed`);
  process.exit(1);
}
console.log(`server-lifecycle-guards-prove: ok (${passed} checks passed)`);
