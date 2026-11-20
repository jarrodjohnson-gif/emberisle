// Rematch extension results stay isolated per game. A finished or cancelled vote in game 1 must not resurface on the
// matching turn key in game 2 (where TurnExtensionVote.tsx hides the Ask button whenever result is non-null).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { turnExtensions } from "./turn-extension.mjs";

const SERVER = fileURLToPath(new URL(".", import.meta.url));
const TURN = 10_000;
const TOTAL = 20_000;
const EXTRA = 5_000;
const VOTE = 5_000;
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-rematch-ext-"));
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

// ---- Unit checks on turnExtensions ----
{
  const liveWs = { readyState: 1, OPEN: 1 };
  const players = [{ id: "p0", kind: "human" }, { id: "p1", kind: "human" }, { id: "p2", kind: "human" }];
  const makeRoom = (roster = null) => ({
    roster,
    game: { turn: 1, current: "p0", phase: "main", seq: 10, players },
    seats: [
      { pid: "p0", bot: false, ws: liveWs, turnDeadline: Date.now() + 30_000 },
      { pid: "p1", bot: false, ws: liveWs, turnDeadline: null },
      { pid: "p2", bot: false, ws: liveWs, turnDeadline: null },
    ],
  });

  // 1. Legacy room without roster: passing through phase "over" clears result before rematch.
  {
    const room = makeRoom(null);
    const ext = turnExtensions(room, { changed() {}, extend(s, ms) { s.turnDeadline += ms; } });
    eq(ext.ask(room.seats[1], { target: "p0", key: ext.state().key }), null, "unit: legacy ask accepted");
    eq(ext.answer(room.seats[2], { voteId: ext.state().vote.id, yes: true }), null, "unit: legacy answer passes");
    eq(ext.state().result?.outcome, "passed", "unit: passed result visible on active turn");
    ok(!Object.hasOwn(ext.state().result, "key") && !Object.hasOwn(ext.state().result, "gameId"), "unit: publicResult hides internal keys");
    room.game = { turn: 1, current: "p1", phase: "over", seq: 11, players };
    room.seats[0].turnDeadline = null;
    ext.sync();
    eq(ext.state().result, null, "unit: over clears result");
    room.game = { turn: 1, current: "p0", phase: "roll", seq: 10, players };
    room.seats[0].turnDeadline = Date.now() + 30_000;
    ext.sync();
    eq(ext.state().result, null, "unit: rematch same turn key keeps result null");
  }

  // 2. Tracked room: changing roster.gameId clears result and cancels open vote even on the same key.
  {
    const room = makeRoom({ gameId: "g1" });
    const ext = turnExtensions(room, { changed() {}, extend(s, ms) { s.turnDeadline += ms; } });
    eq(ext.ask(room.seats[0], { target: "p0", key: ext.state().key }), null, "unit: tracked vote opens");
    ok(!Object.hasOwn(ext.state().vote, "gameId"), "unit: publicVote hides gameId");
    room.roster = { gameId: "g2" };
    ext.sync();
    eq(ext.state().vote, null, "unit: new gameId cancels open vote");
    eq(ext.state().result, null, "unit: cancelled cross-game vote leaves result null");
  }

  // 3. Target drop mid-turn keeps cancelled result on that turn, then clears on turn advance.
  {
    const room = makeRoom({ gameId: "g3" });
    const ext = turnExtensions(room, { changed() {}, extend(s, ms) { s.turnDeadline += ms; } });
    eq(ext.ask(room.seats[0], { target: "p0", key: ext.state().key }), null, "unit: mid-turn vote opens");
    room.seats[0].ws = null;
    room.seats[0].turnDeadline = null;
    ext.sync();
    eq(ext.state().result?.outcome, "cancelled", "unit: same-turn target drop reports cancelled");
    room.game = { turn: 1, current: "p1", phase: "roll", seq: 11, players };
    ext.sync();
    eq(ext.state().result, null, "unit: advancing turn clears cancelled result");
  }

  // 4. close() clears vote, result, and timer cleanly.
  {
    let changedCalls = 0;
    const room = makeRoom({ gameId: "g4" });
    const ext = turnExtensions(room, { changed() { changedCalls++; }, extend(s, ms) { s.turnDeadline += ms; }, voteMs: 30 });
    eq(ext.ask(room.seats[1], { target: "p0", key: ext.state().key }), null, "unit: vote before close");
    eq(ext.answer(room.seats[2], { voteId: ext.state().vote.id, yes: true }), null, "unit: passed before close");
    eq(ext.state().result?.outcome, "passed", "unit: result exists before close");
    ext.close();
    eq(ext.state().vote, null, "unit: close clears vote");
    eq(ext.state().result, null, "unit: close clears result");
    const afterClose = changedCalls;
    await new Promise((r) => setTimeout(r, 50));
    eq(changedCalls, afterClose, "unit: close stops timer callbacks");
  }
  console.log("ok   unit: stale result clearing across over, gameId change, turn advance, and close");
}

// ---- Real host scenarios ----
function writeSeedRoom(code) {
  let game = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 19 });
  while (game.phase !== "roll") {
    const next = applyAction(game, game.current, chooseBotAction(game, game.current));
    assert.ifError(next.error);
    game = next.state;
  }
  game.players.sort((a, b) => a.id.localeCompare(b.id));
  for (const p of game.players) for (const k of Object.keys(p.resources)) p.resources[k] = 0;
  // p1 holds 10 hidden VP, so p0's pass wins game 1 at p1's turn start.
  game.players[1].hidden.vp = 10;
  Object.assign(game, { current: "p0", phase: "main", turn: 1, seq: 20 });
  const seats = game.players.map((p, i) => ({
    id: `s${i}`,
    name: p.name,
    color: p.color,
    ready: true,
    pid: p.id,
    secret: `${code}-${p.id}`,
  }));
  const roster = {
    v: 1,
    gameId: randomUUID(),
    startedAt: Date.now() - 10_000,
    policy: 1,
    eligible: true,
    players: seats.map((s) => ({ pid: s.pid, seat: s.id, profileId: null, name: s.name, color: s.color, kind: "human" })),
  };
  writeFileSync(
    path.join(dir, `${code}.json`),
    JSON.stringify({ code, host: "s0", next: 3, chat: [], chatSeq: 0, game, seats, roster, shape: 3, savedAt: Date.now() }),
  );
}

for (const code of ["RMPS", "RMFL", "RMCN"]) writeSeedRoom(code);

function boot() {
  const proc = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
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
      TURN_VOTE_MS: String(VOTE),
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

async function client(code, pid) {
  const ws = new WebSocket(`ws://127.0.0.1:${host.port}`);
  const c = { ws, pid, state: null, frames: [], errors: [], waiters: [] };
  sockets.push(c);
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    c.frames.push(msg);
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
  ws.send(JSON.stringify({ type: "hello", code, secret: `${code}-${pid}` }));
  await c.until(() => c.state, "initial state");
  return c;
}

function toIntent(action) {
  if (action.type === "roll") return { type: "roll" };
  if (action.type === "setupSettle") return { type: "place", kind: "outpost", id: action.vertexId };
  if (action.type === "setupRoad") return { type: "place", kind: "path", id: action.edgeId };
  throw new Error(`unexpected setup action ${action.type}`);
}

async function finishRematchAndReachTurn1(cs, label) {
  // Game 1: p0 passes -> p1 wins on turn start.
  cs[0].send({ type: "pass" });
  await Promise.all(cs.map((c) => c.until(() => c.state.game.phase === "over", `${label}: game 1 over`)));
  for (const c of cs) {
    eq(c.state.turnExtension.vote, null, `${label}: game over has no vote`);
    eq(c.state.turnExtension.result, null, `${label}: game over has no stale result`);
  }

  // Host (s0 = cs[0]) starts rematch.
  cs[0].send({ type: "again" });
  await Promise.all(cs.map((c) => c.until(() => c.state.game.phase === "rollOff", `${label}: game 2 rollOff`)));

  // Advance game 2 through rollOff and setup to turn 1 p0.
  while (cs[0].state.game.phase !== "roll") {
    const curPid = cs[0].state.game.current;
    const actor = cs.find((c) => c.state.you === curPid);
    const seq = actor.state.game.seq;
    actor.send(toIntent(chooseBotAction(actor.state.game, curPid)));
    await Promise.all(cs.map((c) => c.until(() => c.state.game.seq > seq, `${label}: advance seq ${seq}`)));
  }

  // Verify game 2 turn 1 p0 starts with a clean extension state and accepts a fresh vote.
  eq([cs[0].state.game.turn, cs[0].state.game.current], [1, "p0"], `${label}: game 2 reached turn 1 p0`);
  for (const c of cs) {
    const ext = c.state.turnExtension;
    eq(ext.target, "p0", `${label}: game 2 target is p0`);
    eq(ext.used, false, `${label}: game 2 turn 1 is unused`);
    eq(ext.vote, null, `${label}: game 2 turn 1 has no open vote`);
    eq(ext.result, null, `${label}: game 1 result did not leak into game 2 turn 1`);
  }

  // Verify a fresh extension vote passes on game 2 turn 1 p0.
  const targetClient = cs.find((c) => c.state.you === "p0");
  const voters = cs.filter((c) => c !== targetClient);
  const before = targetClient.state.turnDeadline;
  voters[0].send({ type: "turnExtensionAsk", target: "p0", key: targetClient.state.turnExtension.key });
  const ballot = await voters[1].until(() => voters[1].state.turnExtension?.vote, `${label}: game 2 vote opens`);
  voters[1].send({ type: "turnExtensionAnswer", voteId: ballot.id, yes: true });
  await Promise.all(cs.map((c) => c.until(() => c.state.turnExtension?.result?.outcome === "passed", `${label}: game 2 vote passes`)));
  eq(targetClient.state.turnDeadline, before + EXTRA, `${label}: game 2 vote adds +EXTRA ms`);
}

try {
  host = await boot();

  // Case 1: passed vote on turn 1 p0 in game 1 must not resurface on turn 1 p0 in game 2.
  {
    const cs = await Promise.all(["p0", "p1", "p2"].map((pid) => client("RMPS", pid)));
    cs[1].send({ type: "turnExtensionAsk", target: "p0", key: cs[0].state.turnExtension.key });
    const v1 = await cs[2].until(() => cs[2].state.turnExtension?.vote, "RMPS: vote 1");
    cs[2].send({ type: "turnExtensionAnswer", voteId: v1.id, yes: true });
    await Promise.all(cs.map((c) => c.until(() => c.state.turnExtension?.result?.outcome === "passed", "RMPS: vote 1 passed")));
    await finishRematchAndReachTurn1(cs, "RMPS");
    for (const c of cs) c.ws.terminate();
    console.log("ok   RMPS: passed game 1 result cleared before rematch turn 1");
  }

  // Case 2: failed vote on turn 1 p0 in game 1 must not resurface on turn 1 p0 in game 2.
  {
    const cs = await Promise.all(["p0", "p1", "p2"].map((pid) => client("RMFL", pid)));
    cs[0].send({ type: "turnExtensionAsk", target: "p0", key: cs[0].state.turnExtension.key });
    const v1 = await cs[1].until(() => cs[1].state.turnExtension?.vote, "RMFL: vote 1");
    cs[1].send({ type: "turnExtensionAnswer", voteId: v1.id, yes: false });
    cs[2].send({ type: "turnExtensionAnswer", voteId: v1.id, yes: false });
    await Promise.all(cs.map((c) => c.until(() => c.state.turnExtension?.result?.outcome === "failed", "RMFL: vote 1 failed")));
    await finishRematchAndReachTurn1(cs, "RMFL");
    for (const c of cs) c.ws.terminate();
    console.log("ok   RMFL: failed game 1 result cleared before rematch turn 1");
  }

  // Case 3: in-flight vote cancelled by the winning pass must not resurface on turn 1 p0 in game 2.
  {
    const cs = await Promise.all(["p0", "p1", "p2"].map((pid) => client("RMCN", pid)));
    cs[0].send({ type: "turnExtensionAsk", target: "p0", key: cs[0].state.turnExtension.key });
    await cs[1].until(() => cs[1].state.turnExtension?.vote, "RMCN: vote 1 open");
    await finishRematchAndReachTurn1(cs, "RMCN");
    for (const c of cs) c.ws.terminate();
    console.log("ok   RMCN: cancelled game 1 vote cleared before rematch turn 1");
  }

  // Privacy and host error checks across every received frame.
  let extFrames = 0;
  for (const c of sockets) {
    for (const frame of c.frames) {
      const ext = frame.type === "turnExtension" ? frame : frame.turnExtension;
      if (!ext) continue;
      extFrames++;
      assert.ok(!ext.vote || (!Object.hasOwn(ext.vote, "key") && !Object.hasOwn(ext.vote, "gameId")), "wire vote hides key and gameId");
      assert.ok(!ext.result || (!Object.hasOwn(ext.result, "key") && !Object.hasOwn(ext.result, "gameId")), "wire result hides key and gameId");
    }
  }
  ok(extFrames >= 90, "checked wire privacy across all extension frames", extFrames);
  eq(host.err, "", "host produced no stderr");
  console.log(`rematch-extension-prove: ok (${checks} checks, ${extFrames} frames inspected)`);
} finally {
  host?.proc.kill("SIGKILL");
}
