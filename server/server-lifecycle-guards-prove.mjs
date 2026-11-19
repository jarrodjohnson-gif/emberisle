// Proof for server lifecycle guards:
// 1. HEAD /tables returns 200 with JSON headers and an empty body.
// 2. HEAD /avatars/:id.jpg returns 200 with JPEG headers and an empty body.
// 3. Rejoin rejects bot seat secrets.
// 4. POST /avatars rejects bot seat secrets via seatOf.
// 5. Async flush write failure cleans up temp file and keeps room dirty.
// 6. Process exit flushAll write failure cleans up temp file.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
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

// Case 3: Rejoin rejects bot seat secrets.
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

// Case 4: POST /avatars rejects bot seat secrets via seatOf.
await check("POST /avatars rejects bot seat secrets via seatOf", async () => {
  const d = makeDirs();
  const host = startHost(d);
  const port = await host.port;
  try {
    const c = await connect(port, { type: "hello", name: "Host" });
    await c.until(() => c.welcome, "welcome");
    c.send({ type: "addBot" });
    await c.until(() => c.seats?.seats.length === 2, "bot seated");

    const roomFile = path.join(d.rooms, `${c.welcome.code}.json`);
    await sleep(60);
    const saved = JSON.parse(await import("node:fs/promises").then((f) => f.readFile(roomFile, "utf8")));
    const botSeat = saved.seats.find((s) => s.bot);
    assert.ok(botSeat?.secret, "bot seat has secret");

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const post = await requestHttp(port, {
      path: "/avatars",
      method: "POST",
      headers: { "x-seat-secret": botSeat.secret, "content-type": "image/jpeg" },
    }, jpeg);
    assert.equal(post.status, 403, "bot secret upload is forbidden");
    c.ws.close();
  } finally {
    await host.stop();
    rmSync(d.root, { recursive: true, force: true });
  }
});

// Case 5: Async flush write failure cleans up temp file and keeps room dirty.
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

    // Remove the blocking directory so subsequent retry flush can succeed.
    rmSync(roomFile, { recursive: true, force: true });
    await sleep(80);
    assert.ok(existsSync(roomFile), "room file written by retry flush because dirty was restored");
    const saved = JSON.parse(readFileSync(roomFile, "utf8"));
    assert.equal(saved.seats[0].ready, true, "saved state includes the updated ready value");
    c.ws.close();
  } finally {
    await host.stop();
    rmSync(d.root, { recursive: true, force: true });
  }
});

// Case 6: Process exit flushAll write failure cleans up temp file.
await check("Exit flushAll write failure cleans up temp file", async () => {
  const d = makeDirs();
  const host = startHost(d, { SAVE_MS: "25" });
  const port = await host.port;
  try {
    const c = await connect(port, { type: "hello", name: "Host" });
    await c.until(() => c.welcome, "welcome");
    const code = c.welcome.code;
    const roomFile = path.join(d.rooms, `${code}.json`);
    await sleep(60);
    assert.ok(existsSync(roomFile), "room file exists");

    // Replace room file with directory so writeFileSync succeeds on .tmp but renameSync throws EISDIR.
    rmSync(roomFile, { force: true });
    mkdirSync(roomFile);

    // Dirty the room immediately before stopping host so flushAll runs on exit.
    c.send({ type: "ready", value: true });
    await host.stop();

    const tmps = readdirSync(d.rooms).filter((n) => n.endsWith(".tmp"));
    assert.deepEqual(tmps, [], "no temp file leaked after exit flush failure");
  } finally {
    rmSync(d.root, { recursive: true, force: true });
  }
});

if (failures.length > 0) {
  console.error(`server-lifecycle-guards-prove failed: ${failures.length} check(s) failed`);
  process.exit(1);
}
console.log(`server-lifecycle-guards-prove: ok (${passed} checks passed)`);
