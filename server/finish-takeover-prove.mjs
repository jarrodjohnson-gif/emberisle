// A finished game (phase === "over") must never trigger bot takeover: dropping on the results screen, winning while
// another seat's grace timer is ticking, or restarting a host with a finished room on disk must keep every player's
// kind, name, assisted list, recovery list, and log untouched. An active game still takes over after GRACE_MS.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { createExpandedGame } from "../src/lib/game/expanded.ts";
import { applyAction, legalCities, totalVP } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";

const SERVER = fileURLToPath(new URL(".", import.meta.url));
const GRACE = 400;
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-finish-takeover-"));
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ["Ember", "Tide", "Pine", "Stone", "Cove"];

function mainGame(expanded, seed) {
  const count = expanded ? 5 : 3;
  let g = expanded
    ? createExpandedGame({ humans: NAMES.slice(0, count).map((name) => ({ name })), bots: 0, victoryTarget: 10, seed })
    : createGame({ humans: NAMES.slice(0, count).map((name) => ({ name })), bots: 0, victoryTarget: 10, seed });
  for (let i = 0; i < 400 && g.phase !== "main"; i++) {
    const a = chooseBotAction(g, g.current);
    const next = applyAction(g, g.current, a);
    assert.ifError(next.error);
    g = next.state;
  }
  eq(g.phase, "main", "fixture reached main phase");
  return g;
}

function writeRoom(code, g, expanded = false) {
  const seats = g.players.map((p, i) => ({
    id: `s${i}`,
    name: p.name,
    color: p.color,
    ready: true,
    pid: p.id,
    secret: `${code}-${p.id}`,
  }));
  const room = {
    code,
    host: "s0",
    next: seats.length,
    chat: [],
    chatSeq: 0,
    game: g,
    seats,
    assisted: [],
    recoveryPids: [],
    shape: 3,
    savedAt: Date.now(),
  };
  if (expanded) {
    room.variant = "expanded";
    room.size = seats.length;
  }
  writeFileSync(path.join(dir, `${code}.json`), JSON.stringify(room));
  return g.players.map((p) => p.id);
}

// OVDR: classic 3-seat finished room.
const gOver = mainGame(false, 1801);
Object.assign(gOver, { phase: "over", winner: gOver.players[0].id, winReason: "points" });
const ovdrPids = writeRoom("OVDR", gOver, false);

// OVWN: classic 3-seat main room where current player is 1 stronghold away from winning.
const gWin = mainGame(false, 1802);
const winnerPid = gWin.current;
const winPlayer = gWin.players.find((p) => p.id === winnerPid);
const winCity = legalCities(gWin, winnerPid)[0];
ok(Boolean(winCity), "OVWN: current player has an outpost ready to upgrade");
winPlayer.resources = { timber: 0, clay: 0, wool: 0, grain: 3, ore: 2 };
winPlayer.hidden = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 9 - totalVP(gWin, winnerPid) };
for (const r of RESOURCES) gWin.bank[r] = 19 - gWin.players.reduce((n, p) => n + p.resources[r], 0);
const ovwnPids = writeRoom("OVWN", gWin, false);
const ovwnOther = ovwnPids.find((id) => id !== winnerPid);

// OVRS: expanded 5-seat finished room on disk before host boot.
const gRest = mainGame(true, 1803);
Object.assign(gRest, { phase: "over", winner: gRest.players[0].id, winReason: "points" });
const ovrsPids = writeRoom("OVRS", gRest, true);

// OVAC: active 3-seat main room (control case: bot takeover still fires after GRACE_MS).
const gAct = mainGame(false, 1804);
const ovacPids = writeRoom("OVAC", gAct, false);

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
      GRACE_MS: String(GRACE),
      HOLD_MS: "60000",
      TURN_MS: "60000",
      TURN_TOTAL_MS: "120000",
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
  const c = { ws, pid, state: null, logs: [], errors: [], waiters: [] };
  sockets.push(c);
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") c.state = msg;
    if (msg.type === "log") c.logs.push(msg.text);
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

const readRoom = (code) => JSON.parse(readFileSync(path.join(dir, `${code}.json`), "utf8"));

try {
  host = await boot();
  // Seat active rooms immediately after boot so their load() grace timers clear before Case 1 sleeps.
  // OVRS stays unconnected on purpose to verify load() never triggers takeover on a restored finished room.
  const ovwnClients = Object.fromEntries(await Promise.all(ovwnPids.map(async (pid) => [pid, await client("OVWN", pid)])));
  const ovacClients = Object.fromEntries(await Promise.all(ovacPids.map(async (pid) => [pid, await client("OVAC", pid)])));

  // ---- Case 1: dropping on the results screen never triggers bot takeover ----
  {
    const c0 = await client("OVDR", ovdrPids[0]);
    const c1 = await client("OVDR", ovdrPids[1]);
    const c2 = await client("OVDR", ovdrPids[2]);
    const origName = c0.state.game.players.find((p) => p.id === ovdrPids[1]).name;
    c1.ws.terminate();
    await c0.until(() => c0.logs.some((l) => l.includes("lost connection")), "OVDR: drop logged");
    await sleep(GRACE + 300);
    const p1 = c0.state.game.players.find((p) => p.id === ovdrPids[1]);
    eq([p1.kind, p1.name], ["human", origName], "OVDR: dropped player stays human with original name on results screen");
    ok(!c0.logs.some((l) => l.includes("played by the bot")), "OVDR: no takeover log on finished game", c0.logs);
    const saved = readRoom("OVDR");
    eq(saved.assisted, [], "OVDR: assisted stays empty on disk");
    eq(saved.recoveryPids, [], "OVDR: recoveryPids stays empty on disk");
    eq(saved.game.players.find((p) => p.id === ovdrPids[1]).kind, "human", "OVDR: disk player stays human");
    const c1Back = await client("OVDR", ovdrPids[1]);
    eq(c1Back.state.game.phase, "over", "OVDR: returning player sees finished results");
    c0.ws.terminate();
    c2.ws.terminate();
    c1Back.ws.terminate();
    console.log("ok   drop on finished results screen never triggers bot takeover");
  }

  // ---- Case 2: winning while another seat's grace timer is ticking disarms takeover ----
  {
    const cWin = ovwnClients[winnerPid];
    const cDrop = ovwnClients[ovwnOther];
    const dropName = cWin.state.game.players.find((p) => p.id === ovwnOther).name;
    cDrop.ws.terminate();
    await cWin.until(() => cWin.logs.some((l) => l.includes("lost connection")), "OVWN: drop logged");
    // Win immediately before GRACE_MS expires.
    cWin.send({ type: "place", kind: "stronghold", id: winCity });
    await cWin.until(() => cWin.state.game.phase === "over", "OVWN: game ended by stronghold");
    await sleep(GRACE + 300);
    const pDrop = cWin.state.game.players.find((p) => p.id === ovwnOther);
    eq([pDrop.kind, pDrop.name], ["human", dropName], "OVWN: seat dropped right before win never becomes a bot");
    ok(!cWin.logs.some((l) => l.includes("played by the bot")), "OVWN: no takeover log after win", cWin.logs);
    const saved = readRoom("OVWN");
    eq(saved.assisted, [], "OVWN: assisted stays empty after win before grace");
    eq(saved.recoveryPids, [], "OVWN: recoveryPids stays empty after win before grace");
    for (const c of Object.values(ovwnClients)) c.ws.terminate();
    console.log("ok   win before grace expiry cancels armed bot takeover");
  }

  // ---- Case 3: host restart with a finished 5-seat room on disk never triggers takeover ----
  {
    // Host booted at top of script; we have already slept well past 2 * GRACE_MS while OVRS had 0 sockets.
    const c0 = await client("OVRS", ovrsPids[0]);
    eq(c0.state.game.phase, "over", "OVRS: restored finished 5-seat room stays over");
    eq(
      c0.state.game.players.map((p) => p.kind),
      ["human", "human", "human", "human", "human"],
      "OVRS: all five restored seats stay human after GRACE_MS",
    );
    ok(
      c0.state.game.players.every((p) => !p.name.includes("(bot)")),
      "OVRS: no restored seat renamed to (bot)",
      c0.state.game.players.map((p) => p.name),
    );
    const saved = readRoom("OVRS");
    eq(saved.assisted, [], "OVRS: restored finished room assisted stays empty");
    eq(saved.recoveryPids, [], "OVRS: restored finished room recoveryPids stays empty");
    c0.ws.terminate();
    console.log("ok   restored finished 5-seat room never triggers bot takeover");
  }

  // ---- Case 4 (control): active game still takes over after GRACE_MS ----
  {
    const c0 = ovacClients[ovacPids[0]];
    const c1 = ovacClients[ovacPids[1]];
    const dropName = c0.state.game.players.find((p) => p.id === ovacPids[1]).name;
    c1.ws.terminate();
    await c0.until(() => c0.logs.includes(`${dropName} is played by the bot until they return.`), "OVAC: active game takeover fires");
    const p1 = await c0.until(() => {
      const p = c0.state.game.players.find((x) => x.id === ovacPids[1]);
      return p.kind === "bot" && p;
    }, "OVAC: state pushes bot takeover");
    eq([p1.kind, p1.name], ["bot", `${dropName} (bot)`], "OVAC: control confirms active game takeover still works");
    for (const c of Object.values(ovacClients)) c.ws.terminate();
    console.log("ok   control: active game still triggers bot takeover after GRACE_MS");
  }

  console.log(`finish-takeover-prove: ok (${checks} checks)`);
} finally {
  host?.proc.kill("SIGKILL");
}
