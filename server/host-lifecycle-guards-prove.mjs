// Lifecycle guards for server/host.mjs:
// 1. startGame aborts when a guest disconnects while the durable start write is in flight.
// 2. startGame aborts when the host disconnects and hands off host while the durable start write is in flight.
// 3. startGame aborts when a seat drops and rejoins unready while the durable start write is in flight.
// 4. watch() includes the finished game's profile result, matching pushState(), and omits it mid-game.
// 5. POST /avatars re-checks AVATAR_MAX on request end so concurrent uploads never exceed the store cap.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, legalRoads, legalSettle } from "../src/lib/game/rules.ts";
import { PLAYER_COLORS } from "../src/lib/game/types.ts";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Proof-only preload: pauses one durable room .json rename (writeDurable uses a leading-dot temp file, unlike flush).
const RENAME_GATE = `data:text/javascript,${encodeURIComponent(`
import fs from "node:fs/promises";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
const orig = fs.rename.bind(fs);
let arm = false;
let release = null;
process.on("message", (m) => {
  if (m?.type === "arm") arm = true;
  if (m?.type === "release" && release) { const r = release; release = null; r(); }
});
fs.rename = async (src, dst) => {
  if (arm && String(dst).endsWith(".json") && path.basename(String(src)).startsWith(".")) {
    arm = false;
    await new Promise((r) => { release = r; process.send?.({ type: "paused", dst: String(dst) }); });
  }
  return orig(src, dst);
};
syncBuiltinESMExports();
`)}`;

function makeDirs() {
  const root = mkdtempSync(path.join(tmpdir(), "emberisle-host-guards-"));
  const d = { root, rooms: path.join(root, "rooms"), profiles: path.join(root, "profiles"), results: path.join(root, "results") };
  for (const p of [d.rooms, d.profiles, d.results]) mkdirSync(p, { recursive: true });
  return d;
}

function startHost(d, env = {}, { gate = false } = {}) {
  const args = ["--import", "./register.mjs", ...(gate ? ["--import", RENAME_GATE] : []), "host.mjs"];
  const proc = spawn(process.execPath, args, {
    cwd: new URL(".", import.meta.url),
    env: {
      ...process.env,
      PORT: "0",
      ROOMS_DIR: d.rooms,
      PROFILES_DIR: d.profiles,
      RESULTS_DIR: d.results,
      ACT_CAP: "1000",
      ACT_RATE: "1000",
      GRACE_MS: "60000",
      HOLD_MS: "60000",
      LOBBY_HOLD_MS: "60000",
      TURN_MS: "60000",
      SAVE_MS: "25",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe", ...(gate ? ["ipc"] : [])],
  });
  const host = { proc, out: "", err: "", ipc: [], ipcWaiters: [] };
  proc.stdout.on("data", (x) => (host.out += x));
  proc.stderr.on("data", (x) => (host.err += x));
  if (gate) {
    proc.on("message", (m) => {
      host.ipc.push(m);
      for (const w of host.ipcWaiters.splice(0)) w();
    });
  }
  host.exited = new Promise((r) => proc.once("exit", (c, sig) => r(sig ?? c)));
  host.port = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`host startup timeout: ${host.err}`)), 8000);
    proc.stdout.on("data", () => {
      const m = host.out.match(/listening (\d+)/);
      if (m) { clearTimeout(t); resolve(Number(m[1])); }
    });
    proc.once("exit", (c) => { clearTimeout(t); reject(new Error(`host exited ${c}: ${host.err}`)); });
  });
  host.waitIpc = (type, ms = 5000) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out waiting for ipc ${type}`)), ms);
      const look = () => {
        const i = host.ipc.findIndex((m) => m?.type === type);
        if (i >= 0) { clearTimeout(t); resolve(host.ipc.splice(i, 1)[0]); }
        else host.ipcWaiters.push(look);
      };
      look();
    });
  host.stop = async () => {
    if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGTERM");
    await host.exited;
  };
  return host;
}

async function connect(port, hello) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, welcome: null, seats: null, state: null, states: [], errors: [], waiters: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "welcome") c.welcome = m;
    if (m.type === "seats") c.seats = m;
    if (m.type === "state") { c.state = m; c.states.push(m); }
    if (m.type === "error") c.errors.push(m.message);
    for (const w of c.waiters.splice(0)) w();
  });
  c.until = (ok, label, ms = 5000) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out: ${label} (errors=${JSON.stringify(c.errors)})`)), ms);
      const look = () => (ok() ? (clearTimeout(t), resolve()) : c.waiters.push(look));
      look();
    });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.act = (m) => c.send({ ...m, cid: randomUUID(), turn: c.state.actionStamp.turn, baseSeq: c.state.actionStamp.baseSeq, connection: c.state.actionStamp.connection });
  await new Promise((r, j) => { ws.once("open", r); ws.once("error", j); });
  if (hello) c.send(hello);
  return c;
}

async function openReadyLobby(port) {
  const a = await connect(port, { type: "hello", name: "Ember" });
  await a.until(() => a.welcome, "a welcome");
  const code = a.welcome.code;
  const b = await connect(port, { type: "hello", code, name: "Tide" });
  await b.until(() => b.welcome, "b welcome");
  const c = await connect(port, { type: "hello", code, name: "Cove" });
  await c.until(() => c.welcome, "c welcome");
  for (const p of [a, b, c]) p.send({ type: "ready", value: true });
  await a.until(() => a.seats?.seats.length === 3 && a.seats.seats.every((s) => s.ready), "all 3 ready");
  return { code, a, b, c };
}

function seedProfiles(d, names) {
  const doc = { schemaVersion: 1, profiles: {}, logins: {}, reservedLogins: {}, tombstones: {}, devices: {}, unknownLogins: {} };
  const ids = [];
  const now = Date.now();
  for (const name of names) {
    const id = randomUUID();
    const login = `${name.toLowerCase()}-${randomBytes(3).toString("hex")}`;
    doc.profiles[id] = {
      id, displayName: name, login, color: PLAYER_COLORS[1], backupColor: PLAYER_COLORS[0], catchphrase: "", winSongId: null, mediaKey: null, createdAt: now, updatedAt: now,
      pin: { alg: "scrypt", N: 16384, r: 8, p: 1, salt: randomBytes(16).toString("base64"), hash: randomBytes(32).toString("base64") },
      guard: { times: [], pending: {}, lifetime: 0 },
    };
    doc.logins[login] = id;
    const token = randomBytes(32).toString("base64url");
    doc.devices[createHash("sha256").update(token).digest("hex")] = { profileId: id, createdAt: now, expiresAt: now + 86_400_000 };
    ids.push(id);
  }
  writeFileSync(path.join(d.profiles, "profiles.json"), JSON.stringify(doc));
  return ids;
}

function seedNearWinRoom(d, code, profileIds) {
  let g = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Cove" }], bots: 0, seed: 42 });
  while (g.phase === "rollOff") g = applyAction(g, g.current, { type: "roll" }).state;
  while (g.phase === "setupSettle" || g.phase === "setupRoad") {
    const r = g.phase === "setupSettle"
      ? applyAction(g, g.current, { type: "setupSettle", vertexId: legalSettle(g, g.current, true)[0] })
      : applyAction(g, g.current, { type: "setupRoad", edgeId: legalRoads(g, g.current, true)[0] });
    g = r.state;
  }
  g.players.sort((a, b) => a.id.localeCompare(b.id));
  for (const p of g.players) for (const k of Object.keys(p.resources)) p.resources[k] = 0;
  g.players[1].hidden.vp = 10;
  g.current = "p0";
  g.phase = "main";
  const seats = g.players.map((p, i) => ({
    id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `${code}-${p.id}`,
    ...(profileIds[i] ? { profileId: profileIds[i] } : {}),
  }));
  const roster = {
    v: 1, gameId: randomUUID(), startedAt: Date.now() - 60_000, policy: 1, eligible: true,
    players: seats.map((s) => ({ pid: s.pid, seat: s.id, profileId: s.profileId ?? null, name: s.name, color: s.color, kind: "human" })),
  };
  writeFileSync(path.join(d.rooms, `${code}.json`), JSON.stringify({
    code, host: "s0", next: 3, chat: [], chatSeq: 0, game: g, seats, roster, recoveryPids: [], assisted: [], shape: 3, savedAt: Date.now(),
  }));
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

const d = makeDirs();
const sockets = [];
const track = (c) => (sockets.push(c.ws), c);

try {
  // Scenarios 1-3: startGame mid-commit races on one gated host.
  const gated = startHost(d, {}, { gate: true });
  try {
    const port = await gated.port;

    await check("startGame aborts when a guest disconnects during durableStart", async () => {
      const { code, a, b, c } = await openReadyLobby(port);
      track(a); track(b); track(c);
      gated.proc.send({ type: "arm" });
      a.send({ type: "start" });
      await gated.waitIpc("paused");
      b.ws.terminate();
      await a.until(() => a.seats?.seats.find((s) => s.id === b.welcome.you)?.away === true, "a sees b away");
      gated.proc.send({ type: "release" });
      await a.until(() => a.errors.includes("The table changed. Try again.") || a.states.length > 0, "startGame resolves");
      assert.equal(a.states.length, 0, "game must not start after guest dropped mid-commit");
      assert.ok(a.errors.includes("The table changed. Try again."), "host receives table-changed error");
      // Recovery: b rejoins, readies up, and start succeeds cleanly.
      const b2 = track(await connect(port, { type: "hello", code, secret: b.welcome.secret }));
      await b2.until(() => b2.welcome, "b2 rejoined lobby");
      b2.send({ type: "ready", value: true });
      await a.until(() => a.seats?.seats.every((s) => s.ready && !s.away), "all ready after rejoin");
      a.send({ type: "start" });
      await a.until(() => a.state?.game.phase === "rollOff", "start succeeds after b rejoins and readies");
    });

    await check("startGame aborts when the host disconnects and hands off host during durableStart", async () => {
      const { code, a, b, c } = await openReadyLobby(port);
      track(a); track(b); track(c);
      gated.proc.send({ type: "arm" });
      a.send({ type: "start" });
      await gated.waitIpc("paused");
      a.ws.terminate();
      await b.until(() => b.seats?.seats.find((s) => s.id === b.welcome.you)?.host === true, "b becomes host");
      gated.proc.send({ type: "release" });
      // Probe with b's start once room.busy clears: must refuse as unready lobby, never start the game.
      const a2 = track(await connect(port, { type: "hello", code, secret: a.welcome.secret }));
      await a2.until(() => a2.welcome, "a2 rejoined lobby");
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && b.states.length === 0 && !b.errors.some((e) => e !== "The table has updated. Please try again.")) {
        const before = b.errors.length;
        b.send({ type: "start" });
        await b.until(() => b.errors.length > before || b.states.length > 0, "b start probe reply");
        if (b.states.length > 0 || b.errors.some((e) => e !== "The table has updated. Please try again.")) break;
        await sleep(10);
      }
      assert.equal(b.states.length, 0, "game must not start after host dropped mid-commit");
      assert.equal(c.states.length, 0, "c must not receive game state after host dropped mid-commit");
      assert.ok(b.errors.includes("Not everyone is ready."), `expected lobby refusal, got ${JSON.stringify(b.errors)}`);
      a2.send({ type: "ready", value: true });
      await b.until(() => b.seats?.seats.every((s) => s.ready && !s.away), "all ready with b as host");
      b.send({ type: "start" });
      await b.until(() => b.state?.game.phase === "rollOff", "new host b starts game cleanly");
    });

    await check("startGame aborts when a guest drops and rejoins unready during durableStart", async () => {
      const { code, a, b, c } = await openReadyLobby(port);
      track(a); track(b); track(c);
      gated.proc.send({ type: "arm" });
      a.send({ type: "start" });
      await gated.waitIpc("paused");
      b.ws.terminate();
      await a.until(() => a.seats?.seats.find((s) => s.id === b.welcome.you)?.away === true, "a sees b away");
      const b2 = track(await connect(port, { type: "hello", code, secret: b.welcome.secret }));
      await b2.until(() => b2.welcome, "b2 rejoined mid-commit");
      await a.until(() => {
        const seat = a.seats?.seats.find((s) => s.id === b.welcome.you);
        return seat && !seat.away && !seat.ready;
      }, "a sees b back and unready");
      gated.proc.send({ type: "release" });
      await a.until(() => a.errors.includes("The table changed. Try again.") || a.states.length > 0, "startGame resolves");
      assert.equal(a.states.length, 0, "game must not start while rejoined seat is unready");
      assert.ok(a.errors.includes("The table changed. Try again."), "host receives table-changed error");
      b2.send({ type: "ready", value: true });
      await a.until(() => a.seats?.seats.every((s) => s.ready && !s.away), "all ready after b2 readies");
      a.send({ type: "start" });
      await a.until(() => a.state?.game.phase === "rollOff", "start succeeds once b2 is ready");
    });
  } finally {
    for (const ws of sockets.splice(0)) try { ws.close(); } catch {}
    await gated.stop();
  }

  // Scenario 4: watch() includes result on finished profiled games, and omits it mid-game.
  const d4 = makeDirs();
  try {
    const [p0Id, p1Id] = seedProfiles(d4, ["Ember", "Tide"]);
    seedNearWinRoom(d4, "WRES", [p0Id, p1Id, null]);

    const h4 = startHost(d4);
    try {
      const port = await h4.port;
      const a = track(await connect(port, { type: "hello", code: "WRES", secret: "WRES-p0" }));
      await a.until(() => a.state?.game.phase === "main", "a rejoined main");
      const wMid = track(await connect(port, { type: "hello", code: "WRES", watch: true }));
      await wMid.until(() => wMid.state?.game.phase === "main", "mid-game watcher state");
      assert.equal("result" in wMid.state, false, "mid-game watcher state omits result");

      // Win the game and wait for profile result recording to commit.
      a.act({ type: "pass" });
      await a.until(() => a.state?.game.phase === "over" && a.state.result?.tracked === true && a.state.result.wins.p1 === 1, "seated player receives recorded result");
      await wMid.until(() => wMid.state?.game.phase === "over" && wMid.state.result?.tracked === true && wMid.state.result.wins.p1 === 1, "existing watcher receives recorded result");

      await check("late-joining watcher receives finished game's profile result", async () => {
        const wLate = track(await connect(port, { type: "hello", code: "WRES", watch: true }));
        await wLate.until(() => wLate.state?.game.phase === "over", "late watcher initial state");
        assert.deepEqual(wLate.state.result, a.state.result, "late watcher initial state matches seated player's recorded result");
        assert.deepEqual(wLate.state.result, { tracked: true, wins: { p0: 0, p1: 1 } });
      });
    } finally {
      for (const ws of sockets.splice(0)) try { ws.close(); } catch {}
      await h4.stop();
    }
  } finally {
    rmSync(d4.root, { recursive: true, force: true });
  }

  // Scenario 5: POST /avatars concurrent AVATAR_MAX cap.
  const d5 = makeDirs();
  const h5 = startHost(d5, { AVATAR_MAX: "1" });
  try {
    const port = await h5.port;
    const a = track(await connect(port, { type: "hello", name: "Ember" }));
    await a.until(() => a.welcome, "a welcome");
    const b = track(await connect(port, { type: "hello", code: a.welcome.code, name: "Tide" }));
    await b.until(() => b.welcome, "b welcome");

    await check("POST /avatars enforces AVATAR_MAX under concurrent uploads", async () => {
      const head = Buffer.from([0xff, 0xd8, 0xff]);
      const tail = Buffer.from([0xe0, 0x00, 0x10]);
      const startUpload = (secret) => {
        const req = http.request({
          hostname: "127.0.0.1", port, path: "/avatars", method: "POST",
          headers: { "x-seat-secret": secret, "content-length": String(head.length + tail.length), "content-type": "image/jpeg" },
        });
        const done = new Promise((resolve, reject) => {
          req.on("response", (res) => {
            const chunks = [];
            res.on("data", (ch) => chunks.push(ch));
            res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
          });
          req.on("error", reject);
        });
        const flushed = new Promise((resolve) => req.write(head, resolve));
        return { req, flushed, done };
      };
      const u1 = startUpload(a.welcome.secret);
      const u2 = startUpload(b.welcome.secret);
      await Promise.all([u1.flushed, u2.flushed]);
      await sleep(50);
      u1.req.end(tail);
      u2.req.end(tail);
      const [r1, r2] = await Promise.all([u1.done, u2.done]);
      const statuses = [r1.status, r2.status].sort((x, y) => x - y);
      assert.deepEqual(statuses, [200, 503], `concurrent uploads at AVATAR_MAX=1 must be [200, 503], got ${JSON.stringify(statuses)}`);

      // The seat that won the slot can still replace its own avatar at AVATAR_MAX=1.
      const winnerSecret = r1.status === 200 ? a.welcome.secret : b.welcome.secret;
      const rep = startUpload(winnerSecret);
      rep.req.end(tail);
      const rRep = await rep.done;
      assert.equal(rRep.status, 200, "winning seat can replace its own avatar at AVATAR_MAX=1");
    });
  } finally {
    for (const ws of sockets.splice(0)) try { ws.close(); } catch {}
    await h5.stop();
    rmSync(d5.root, { recursive: true, force: true });
  }

  assert.equal(failures.length, 0, `${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
  console.log(`host-lifecycle-guards-prove: ${passed} checks passed`);
} finally {
  rmSync(d.root, { recursive: true, force: true });
}
