// Roll-off tie re-rolls get a fresh turn-extension budget, while one roll keeps its key across chat, rejoin and restart.
// Mirrors host.mjs turnOf (#1681): a roll-off roll is keyed by seq, so tying into a re-roll cancels an open vote and
// clears any prior roll's used flag, granted extra time, and stale vote result.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { createGame } from "../src/lib/game/board.ts";
import { createExpandedGame } from "../src/lib/game/expanded.ts";
import { extensionKey } from "./turn-extension.mjs";

const SERVER = fileURLToPath(new URL(".", import.meta.url));
const TURN = 4000;
const TOTAL = 5500;
const EXTRA = 3000;
const TOL = 500;
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-rolloff-ext-"));
const sockets = [];
let host = null;

process.on("exit", () => {
  host?.proc.kill("SIGKILL");
  for (const c of sockets) c.ws.terminate();
  rmSync(dir, { recursive: true, force: true });
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));

let checks = 0;
const ok = (cond, msg, detail) => {
  assert.ok(cond, detail === undefined ? msg : `${msg}: ${JSON.stringify(detail)}`);
  checks++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  checks++;
};
const near = (got, want, msg, tol = TOL) => ok(Math.abs(got - want) <= tol, `${msg} (got ${got}, want ${want} +/- ${tol})`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Deterministic die: every roll returns face 3, so a roll-off against a bot on 3 ties cleanly.
writeFileSync(
  path.join(dir, "dice.mjs"),
  `crypto.getRandomValues = (buf) => { buf.fill(2); return buf; };\n`,
);

// Unit checks on extensionKey directly.
{
  const k1 = extensionKey({ turn: 0, current: "p0", phase: "rollOff", seq: 1 });
  const k2 = extensionKey({ turn: 0, current: "p0", phase: "rollOff", seq: 4 });
  eq(k1, "0:p0:rollOff:1", "unit: rollOff key carries seq");
  eq(k2, "0:p0:rollOff:4", "unit: tied re-roll carries its new seq");
  ok(k1 !== k2, "unit: re-roll produces a distinct extension key");
  eq(extensionKey({ turn: 0, current: "p0", phase: "setupSettle", setupIndex: 2, seq: 9 }), "0:p0:setup:2", "unit: setup key unchanged");
  eq(extensionKey({ turn: 2, current: "p1", phase: "main", role: "partner", activation: 7, seq: 20 }), "2:p1:play:7", "unit: paired key unchanged");
  eq(extensionKey({ turn: 5, current: "p0", phase: "over", seq: 99 }), null, "unit: finished game has no key");
}

const NAMES = ["Ember", "Tide", "Pine", "Stone", "Cove"];

function writeRollOffRoom(code, expanded, highBot = 3) {
  const count = expanded ? 5 : 3;
  const g = expanded
    ? createExpandedGame({ humans: NAMES.slice(0, count).map((name) => ({ name })), bots: 0, seed: 1751 })
    : createGame({ humans: NAMES.slice(0, count).map((name) => ({ name })), bots: 0, seed: 1751 });
  const [p0, p1, ...bots] = g.players.map((p) => p.id);
  for (const p of g.players) p.kind = bots.includes(p.id) ? "bot" : "human";
  const rolls = { [p1]: 1, ...Object.fromEntries(bots.map((b, i) => [b, i === 0 ? highBot : 1])) };
  Object.assign(g, { current: p0, rollOff: { rolls, pending: [p0] } });
  const seats = g.players.map((p, i) => ({
    id: `s${i}`,
    name: p.name,
    color: p.color,
    ready: true,
    pid: p.id,
    secret: `${code}-${p.id}`,
    ...(bots.includes(p.id) ? { bot: true } : {}),
  }));
  const room = { code, host: "s0", next: count, chat: [], chatSeq: 0, game: g, seats, shape: 3, savedAt: Date.now() };
  if (expanded) room.size = count;
  writeFileSync(path.join(dir, `${code}.json`), JSON.stringify(room));
  return { p0, p1, bot: bots[0], seq: g.seq };
}

const rPass = writeRollOffRoom("RPASS", false, 3);
const rFail = writeRollOffRoom("RFAIL", true, 3);
const rFly = writeRollOffRoom("RFLY", false, 3);
const rKeep = writeRollOffRoom("RKEEP", false, 2);

function boot() {
  const proc = spawn(process.execPath, ["--import", path.join(dir, "dice.mjs"), "--import", "./register.mjs", "host.mjs"], {
    cwd: SERVER,
    env: {
      ...process.env,
      PORT: "0",
      ROOMS_DIR: dir,
      RESULTS_DIR: `${dir}/results`,
      PROFILES_DIR: `${dir}/profiles`,
      SAVE_MS: "20",
      ACT_CAP: "1000",
      ACT_RATE: "1000",
      GRACE_MS: "600000",
      HOLD_MS: "600000",
      TURN_MS: String(TURN),
      TURN_TOTAL_MS: String(TOTAL),
      TURN_EXTENSION_MS: String(EXTRA),
      TURN_VOTE_MS: "5000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const h = { proc, out: "", err: "" };
  proc.stdout.on("data", (d) => (h.out += d));
  proc.stderr.on("data", (d) => (h.err += d));
  return new Promise((resolve, reject) => {
    proc.stdout.on("data", () => {
      const m = h.out.match(/listening (\d+)/);
      if (m && !h.port) resolve(Object.assign(h, { port: Number(m[1]) }));
    });
    proc.on("exit", (c) => reject(new Error(`host exited ${c}: ${h.err}`)));
  });
}

async function kill9() {
  const h = host;
  h.proc.removeAllListeners("exit");
  h.proc.kill("SIGKILL");
  await new Promise((r) => (h.proc.exitCode !== null || h.proc.signalCode ? r() : h.proc.once("exit", r)));
  for (const c of sockets) c.ws.terminate();
  sockets.length = 0;
  host = null;
}

async function client(code, pid) {
  const ws = new WebSocket(`ws://127.0.0.1:${host.port}`);
  const c = { ws, pid, state: null, errors: [], inbox: [], waiters: [] };
  sockets.push(c);
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    c.inbox.push(msg);
    if (msg.type === "state") c.state = msg;
    if (msg.type === "error") c.errors.push(msg.message);
    for (const w of c.waiters.splice(0)) w();
  });
  c.until = (pred, label, ms = 5000) =>
    new Promise((resolve, reject) => {
      const hit = pred();
      if (hit) return resolve(hit);
      const t = setTimeout(() => reject(new Error(`timeout ${code}/${pid}: ${label}; err=${host?.err}`)), ms);
      const check = () => {
        const v = pred();
        if (v) {
          clearTimeout(t);
          resolve(v);
        } else c.waiters.push(check);
      };
      c.waiters.push(check);
    });
  c.send = (msg) => ws.send(JSON.stringify({ ...c.state?.actionStamp, cid: randomUUID(), ...msg }));
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  ws.send(JSON.stringify({ type: "hello", caps: ["expanded"], code, secret: `${code}-${pid}` }));
  await c.until(() => c.state, "initial state");
  return c;
}

async function savedRoom(code, pred, label, ms = 3000) {
  const file = path.join(dir, `${code}.json`);
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = JSON.parse(readFileSync(file, "utf8"));
      if (pred(r)) return r;
    } catch {}
    await sleep(20);
  }
  throw new Error(`timeout saved ${code}: ${label}`);
}

try {
  host = await boot();

  // ---- Case 1: passed extension on roll 1 does not leak into tied roll 2 ----
  {
    const c0 = await client("RPASS", rPass.p0);
    const c1 = await client("RPASS", rPass.p1);
    const ext1 = c0.state.turnExtension;
    eq([ext1.target, ext1.used], [rPass.p0, false], "RPASS: roll 1 starts with an unused extension");
    const base1 = c0.state.turnDeadline;
    c1.send({ type: "turnExtensionAsk", target: rPass.p0, key: ext1.key });
    const passed1 = await c0.until(() => c0.state.turnExtension?.result?.outcome === "passed" && c0.state, "RPASS: roll 1 vote passes");
    near(passed1.turnDeadline, base1 + EXTRA, "RPASS: roll 1 deadline grows by EXTRA", 50);
    await savedRoom("RPASS", (r) => r.seats.find((s) => s.pid === rPass.p0)?.extension?.extra === EXTRA, "RPASS: roll 1 extra saved");

    // Roll 3 -> ties bot's 3 -> roll 2 starts with p0 first.
    const beforeRoll2 = Date.now();
    c0.send({ type: "roll" });
    const roll2 = await c0.until(
      () => c0.state.game.seq > rPass.seq && c0.state.game.phase === "rollOff" && c0.state.game.current === rPass.p0 && c0.state,
      "RPASS: tied roll 2 starts",
    );
    const ext2 = roll2.turnExtension;
    eq([ext2.target, ext2.used, ext2.vote, ext2.result], [rPass.p0, false, null, null], "RPASS: roll 2 clears used, vote, and stale result");
    ok(ext2.key !== ext1.key, "RPASS: roll 2 issues a fresh extension token");
    near(roll2.turnDeadline, beforeRoll2 + TURN, "RPASS: roll 2 gets a plain TURN window with no leaked EXTRA");
    const saved2 = await savedRoom(
      "RPASS",
      (r) => r.game.seq === roll2.game.seq && r.seats.find((s) => s.pid === rPass.p0)?.extension?.key === `0:${rPass.p0}:rollOff:${roll2.game.seq}`,
      "RPASS: roll 2 extension key saved with new seq",
    );
    eq(saved2.seats.find((s) => s.pid === rPass.p0).extension.extra, 0, "RPASS: roll 2 saved extra is 0");
    eq(saved2.seats.find((s) => s.pid === rPass.p0).extension.used, false, "RPASS: roll 2 saved used is false");

    // A fresh extension on roll 2 succeeds.
    const base2 = roll2.turnDeadline;
    c1.send({ type: "turnExtensionAsk", target: rPass.p0, key: ext2.key });
    const passed2 = await c0.until(() => c0.state.turnExtension?.result?.outcome === "passed" && c0.state, "RPASS: roll 2 vote passes");
    near(passed2.turnDeadline, base2 + EXTRA, "RPASS: roll 2 deadline grows by EXTRA", 50);
    c0.ws.terminate();
    c1.ws.terminate();
    console.log("ok   passed roll-off extension does not leak into tied re-roll (3 seats)");
  }

  // ---- Case 2: failed vote on roll 1 does not block a fresh vote on tied roll 2 (5 seats) ----
  {
    const c0 = await client("RFAIL", rFail.p0);
    const c1 = await client("RFAIL", rFail.p1);
    const ext1 = c0.state.turnExtension;
    c0.send({ type: "turnExtensionAsk", target: rFail.p0, key: ext1.key });
    const ballot1 = await c1.until(() => c1.state.turnExtension?.vote, "RFAIL: roll 1 vote opens");
    c1.send({ type: "turnExtensionAnswer", voteId: ballot1.id, yes: false });
    await c0.until(() => c0.state.turnExtension?.result?.outcome === "failed", "RFAIL: roll 1 vote fails");
    eq(c0.state.turnExtension.used, true, "RFAIL: failed vote marks roll 1 used");

    // Second request on roll 1 is refused.
    const errCount = c1.errors.length;
    c1.send({ type: "turnExtensionAsk", target: rFail.p0, key: c0.state.turnExtension.key });
    await c1.until(() => c1.errors.length > errCount, "RFAIL: second request on roll 1 refused");

    // Roll 3 -> ties bot's 3 -> roll 2 starts.
    c0.send({ type: "roll" });
    const roll2 = await c0.until(
      () => c0.state.game.seq > rFail.seq && c0.state.game.phase === "rollOff" && c0.state.game.current === rFail.p0 && c0.state,
      "RFAIL: tied roll 2 starts",
    );
    const ext2 = roll2.turnExtension;
    eq([ext2.used, ext2.result], [false, null], "RFAIL: roll 2 resets used flag and failed result");
    ok(ext2.key !== ext1.key, "RFAIL: roll 2 issues a new token");

    // Fresh request on roll 2 succeeds.
    c1.send({ type: "turnExtensionAsk", target: rFail.p0, key: ext2.key });
    await c0.until(() => c0.state.turnExtension?.result?.outcome === "passed", "RFAIL: roll 2 fresh vote passes");
    c0.ws.terminate();
    c1.ws.terminate();
    console.log("ok   failed roll-off vote does not block fresh vote on tied re-roll (5 seats)");
  }

  // ---- Case 3: in-flight vote cancels immediately when the roller ties into roll 2 ----
  {
    const c0 = await client("RFLY", rFly.p0);
    const c1 = await client("RFLY", rFly.p1);
    const ext1 = c0.state.turnExtension;
    c0.send({ type: "turnExtensionAsk", target: rFly.p0, key: ext1.key });
    const ballot1 = await c1.until(() => c1.state.turnExtension?.vote, "RFLY: roll 1 vote opens");
    eq(ballot1.voters, [rFly.p1], "RFLY: p1 is the voter");

    // Roll 3 while vote is still open -> ties bot's 3 -> roll 2 starts.
    c0.send({ type: "roll" });
    const roll2 = await c0.until(
      () => c0.state.game.seq > rFly.seq && c0.state.game.phase === "rollOff" && c0.state.game.current === rFly.p0 && c0.state,
      "RFLY: tied roll 2 starts",
    );
    const ext2 = roll2.turnExtension;
    eq([ext2.vote, ext2.used, ext2.result], [null, false, null], "RFLY: in-flight vote cancelled and roll 2 is fresh");
    ok(ext2.key !== ext1.key, "RFLY: roll 2 token differs from roll 1 token");

    // Stale Yes answer for roll 1's ballot is refused and does not move roll 2's deadline.
    const deadline2 = roll2.turnDeadline;
    const errCount = c1.errors.length;
    c1.send({ type: "turnExtensionAnswer", voteId: ballot1.id, yes: true });
    await c1.until(() => c1.errors.length > errCount, "RFLY: stale ballot answer refused");
    eq(c0.state.turnDeadline, deadline2, "RFLY: stale ballot cannot extend roll 2");

    // A fresh vote on roll 2 works.
    c1.send({ type: "turnExtensionAsk", target: rFly.p0, key: ext2.key });
    await c0.until(() => c0.state.turnExtension?.result?.outcome === "passed", "RFLY: roll 2 vote passes");
    c0.ws.terminate();
    c1.ws.terminate();
    console.log("ok   in-flight roll-off vote cancels on tied re-roll and stale answer is refused");
  }

  // ---- Case 4: within one roll-off roll, chat, rejoin, and kill -9 preserve key, token, and used flag ----
  {
    let c0 = await client("RKEEP", rKeep.p0);
    let c1 = await client("RKEEP", rKeep.p1);
    const ext1 = c0.state.turnExtension;
    c1.send({ type: "turnExtensionAsk", target: rKeep.p0, key: ext1.key });
    await c0.until(() => c0.state.turnExtension?.result?.outcome === "passed", "RKEEP: roll 1 vote passes");
    await savedRoom("RKEEP", (r) => r.seats.find((s) => s.pid === rKeep.p0)?.extension?.used === true, "RKEEP: used saved");

    // Chat and rejoin within the same roll keep the token and used state.
    c0.send({ type: "chat", text: "still rolling" });
    await c1.until(() => c1.inbox.some((m) => m.type === "chat" && m.text === "still rolling"), "RKEEP: chat delivered");
    c1.ws.terminate();
    await c0.until(() => c0.inbox.some((m) => m.type === "log" && m.text.includes("lost connection")), "RKEEP: p1 dropped");
    c1 = await client("RKEEP", rKeep.p1);
    eq([c1.state.turnExtension.key, c1.state.turnExtension.used], [ext1.key, true], "RKEEP: chat and rejoin keep roll 1 key and used");

    // Kill -9 and restart preserve the roll's key, token, and used state.
    await kill9();
    host = await boot();
    c0 = await client("RKEEP", rKeep.p0);
    c1 = await client("RKEEP", rKeep.p1);
    eq([c0.state.turnExtension.key, c0.state.turnExtension.used], [ext1.key, true], "RKEEP: restart preserves roll 1 token and used");
    const errCount = c1.errors.length;
    c1.send({ type: "turnExtensionAsk", target: rKeep.p0, key: ext1.key });
    await c1.until(() => c1.errors.length > errCount, "RKEEP: duplicate ask after restart refused");
    console.log("ok   same roll-off roll keeps extension token and used state across chat, rejoin, and restart");
  }

  console.log(`rolloff-extension-prove: ok (${checks} checks)`);
} finally {
  host?.proc.kill("SIGKILL");
}
