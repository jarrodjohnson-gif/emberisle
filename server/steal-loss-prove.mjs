// #550: track goods each seat loses to successful wayfarer steals and reveal at game over.
// - Steal counts increment only on successful steals.
// - Impossible steals (0 cards) and declined steals do not increment counts.
// - Counts remain private on the host during play (excluded from active seat views and spectator views).
// - Revealed on game over with exact per-seat totals (including zero).
// - Preserved across room save, host restart, and player rejoin.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { viewFor } from "./host.mjs";

const dirs = [];
let host;
process.on("exit", () => {
  host?.kill("SIGKILL");
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));

const check = (ok, what) => {
  assert.ok(ok, what);
  console.log("ok  ", what);
};

// --- Part 1: Rules & Privacy Projection Unit Verification ---

console.log("--- Part 1: Rules & Host View Projections ---");

let g = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 42 });
const [p0, p1, p2] = g.players;

check(p0.stealsLost === 0 && p1.stealsLost === 0 && p2.stealsLost === 0, "initial stealsLost is 0 for all seats");

// Fast-forward setup to roll/main phase
g.phase = "robber";
g.current = "p0";
p1.resources.timber = 2;
p2.resources.clay = 1;
p0.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };

// Find a hex adjacent to p1
const hexP1 = g.hexes.find((h) => h.id !== g.robberHex && g.vertices.some((v) => v.hexes.includes(h.id) && v.building?.playerId === "p1"))?.id ?? g.hexes[1].id;
// Put p1 building there if not present
const v1 = g.vertices.find((v) => v.hexes.includes(hexP1));
v1.building = { playerId: "p1", kind: "outpost" };

// p0 steals from p1
const r1 = applyAction(g, "p0", { type: "moveRobber", hexId: hexP1, stealFrom: "p1" });
assert.ifError(r1.error);
g = r1.state;

check(g.players.find((p) => p.id === "p1").stealsLost === 1, "p1 stealsLost incremented to 1 after successful steal");
check(g.players.find((p) => p.id === "p2").stealsLost === 0, "p2 stealsLost remains 0");
check(g.players.find((p) => p.id === "p0").stealsLost === 0, "p0 (thief) stealsLost remains 0");

// p0 steals from p2
const hexP2 = g.hexes.find((h) => h.id !== g.robberHex && h.id !== hexP1)?.id ?? g.hexes[2].id;
const v2 = g.vertices.find((v) => v.hexes.includes(hexP2));
v2.building = { playerId: "p2", kind: "outpost" };
g.phase = "robber";
const r2 = applyAction(g, "p0", { type: "moveRobber", hexId: hexP2, stealFrom: "p2" });
assert.ifError(r2.error);
g = r2.state;

check(g.players.find((p) => p.id === "p1").stealsLost === 1, "p1 stealsLost remains 1");
check(g.players.find((p) => p.id === "p2").stealsLost === 1, "p2 stealsLost incremented to 1 after successful steal");
check(g.players.find((p) => p.id === "p0").stealsLost === 0, "p0 stealsLost remains 0");

// Impossible steal: attempting to steal from p2 who has 0 cards fails with error and does not increment
check(Object.values(g.players.find((p) => p.id === "p2").resources).reduce((a, b) => a + b, 0) === 0, "p2 has 0 cards left");
const hexP2Again = g.hexes.find((h) => h.id !== g.robberHex && h.id !== hexP2)?.id ?? g.hexes[3].id;
const v2b = g.vertices.find((v) => v.hexes.includes(hexP2Again));
v2b.building = { playerId: "p2", kind: "outpost" };
g.phase = "robber";
const rImp = applyAction(g, "p0", { type: "moveRobber", hexId: hexP2Again, stealFrom: "p2" });
check(rImp.error === "Cannot steal from them.", "impossible steal from cardless player returns error");
check(g.players.find((p) => p.id === "p2").stealsLost === 1, "impossible steal does not increment p2 stealsLost");

// Declined steal: stealFrom is null
const rDec = applyAction(g, "p0", { type: "moveRobber", hexId: hexP2Again, stealFrom: null });
assert.ifError(rDec.error);
g = rDec.state;
check(g.players.find((p) => p.id === "p2").stealsLost === 1, "declined steal does not increment p2 stealsLost");

// Mid-game view privacy
const vP0 = viewFor(g, "p0");
const vP1 = viewFor(g, "p1");
const vWatch = viewFor(g, null); // watcher closed view

check(vP0.players.every((p) => p.stealsLost === undefined), "p0 active seat view strips stealsLost during play");
check(vP1.players.every((p) => p.stealsLost === undefined), "p1 active seat view strips stealsLost during play");
check(vWatch.players.every((p) => p.stealsLost === undefined), "spectator view strips stealsLost during play");

// Game over reveal
g.phase = "over";
g.winner = "p0";
const vOverP0 = viewFor(g, "p0");
const vOverWatch = viewFor(g, null);

check(vOverP0.players.find((p) => p.id === "p0").stealsLost === 0, "revealed p0 stealsLost is 0 at game over");
check(vOverP0.players.find((p) => p.id === "p1").stealsLost === 1, "revealed p1 stealsLost is 1 at game over");
check(vOverP0.players.find((p) => p.id === "p2").stealsLost === 1, "revealed p2 stealsLost is 1 at game over");
check(vOverWatch.players.find((p) => p.id === "p1").stealsLost === 1, "revealed watcher view shows exact stealsLost at game over");

// --- Part 2: Real Server Save, Restart & Rejoin Integration ---

console.log("--- Part 2: Real Host Save, Restart & WebSocket Rejoin ---");

const tmpDir = mkdtempSync(path.join(tmpdir(), "emberisle-steals-"));
dirs.push(tmpDir);

const CODE = "STLS";
function seedRoom(dir, code, gameState) {
  const seats = gameState.players.map((p, i) => ({
    id: `s${i}`,
    name: p.name,
    color: p.color,
    ready: true,
    pid: p.id,
    secret: `${code}-${p.id}`,
  }));
  writeFileSync(
    path.join(dir, `${code}.json`),
    JSON.stringify({
      code,
      host: "s0",
      next: 3,
      chat: [],
      chatSeq: 0,
      game: gameState,
      seats,
      shape: 2,
      savedAt: Date.now(),
    }),
  );
}

// Seed active game with stealsLost
g.phase = "main";
delete g.winner;
seedRoom(tmpDir, CODE, g);

async function startHost(dir) {
  let stderr = "";
  const h = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR: dir, SAVE_MS: "50", ACT_CAP: "1000", ACT_RATE: "1000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  h.stderr.on("data", (d) => { stderr += d; });
  const port = await new Promise((resolve, reject) => {
    h.stdout.on("data", (d) => {
      const m = String(d).match(/listening (\d+)/);
      if (m) resolve(Number(m[1]));
    });
    h.on("exit", (c) => reject(new Error(`host exited ${c}: ${stderr}`)));
  });
  return { host: h, port };
}

async function connectClient(port, code, pid, isWatch = false) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, state: null, waiters: [] };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") c.state = msg;
    for (const w of c.waiters.splice(0)) w();
  });
  c.until = (ok, ms, label) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out: ${label}`)), ms);
      const test = () => {
        if (ok()) {
          clearTimeout(t);
          resolve();
        } else {
          c.waiters.push(test);
        }
      };
      test();
    });
  await new Promise((resolve) => ws.once("open", resolve));
  if (isWatch) {
    ws.send(JSON.stringify({ type: "hello", code, watch: true }));
  } else {
    ws.send(JSON.stringify({ type: "hello", code, secret: `${code}-${pid}` }));
  }
  await c.until(() => c.state, 5000, `${pid ?? "watcher"} state`);
  return c;
}

const { host: h1, port: port1 } = await startHost(tmpDir);
host = h1;

const cP0 = await connectClient(port1, CODE, "p0");
const cP1 = await connectClient(port1, CODE, "p1");
const cWatch = await connectClient(port1, CODE, null, true);

check(cP0.state.game.players.every((p) => p.stealsLost === undefined), "active seat p0 over WS does not see stealsLost during play");
check(cP1.state.game.players.every((p) => p.stealsLost === undefined), "active seat p1 over WS does not see stealsLost during play");
check(cWatch.state.game.players.every((p) => p.stealsLost === undefined), "watcher over WS does not see stealsLost during play");

// Restart host
cP0.ws.close();
cP1.ws.close();
cWatch.ws.close();
h1.removeAllListeners("exit");
h1.kill("SIGKILL");
await new Promise((r) => h1.once("exit", r));

// Check disk persistence
const diskRoom = JSON.parse(readFileSync(path.join(tmpDir, `${CODE}.json`), "utf8"));
check(diskRoom.game.players.find((p) => p.id === "p1").stealsLost === 1, "disk snapshot preserved p1 stealsLost: 1");
check(diskRoom.game.players.find((p) => p.id === "p2").stealsLost === 1, "disk snapshot preserved p2 stealsLost: 1");
check(diskRoom.game.players.find((p) => p.id === "p0").stealsLost === 0, "disk snapshot preserved p0 stealsLost: 0");

// Now update diskRoom to phase "over" to test the revealed state upon rejoin
diskRoom.game.phase = "over";
diskRoom.game.winner = "p0";
writeFileSync(path.join(tmpDir, `${CODE}.json`), JSON.stringify(diskRoom));

const { host: h2, port: port2 } = await startHost(tmpDir);
host = h2;

const cP0After = await connectClient(port2, CODE, "p0");
const cWatchAfter = await connectClient(port2, CODE, null, true);

const finalP0 = cP0After.state.game.players;
check(finalP0.find((p) => p.id === "p0").stealsLost === 0, "rejoined p0 sees p0 stealsLost: 0 at game over");
check(finalP0.find((p) => p.id === "p1").stealsLost === 1, "rejoined p0 sees p1 stealsLost: 1 at game over");
check(finalP0.find((p) => p.id === "p2").stealsLost === 1, "rejoined p0 sees p2 stealsLost: 1 at game over");

const finalWatch = cWatchAfter.state.game.players;
check(finalWatch.find((p) => p.id === "p0").stealsLost === 0, "reconnected watcher sees p0 stealsLost: 0 at game over");
check(finalWatch.find((p) => p.id === "p1").stealsLost === 1, "reconnected watcher sees p1 stealsLost: 1 at game over");
check(finalWatch.find((p) => p.id === "p2").stealsLost === 1, "reconnected watcher sees p2 stealsLost: 1 at game over");

cP0After.ws.close();
cWatchAfter.ws.close();
h2.removeAllListeners("exit");
h2.kill("SIGKILL");
await new Promise((r) => h2.once("exit", r));
host = null;

console.log("steal-loss-prove: ok");
process.exit(0);
