// G9: a waited-on seat's window survives a host restart, and its total-turn budget survives a drop and rejoin.
// 1. TURN_MS=8000: seat A is waited on (deadline D), the host is killed -9 and restarted, A rejoins about 4 s in, and
//    the `state`'s deadline is D again (within 1 s), not a fresh 8 s from the rejoin.
// 2. The host is down past D: the rejoin spends the window at once ("took too long"), no new window is armed.
// 3. TURN_MS=1500, TURN_TOTAL_MS=3000: A drops, another seat joins (a state push while A is away), A rejoins at 2 s:
//    its window is the 1 s the budget has left, so the deadline stays at the 3 s cap, not 1.5 s past the rejoin.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";

const dirs = [];
let host;
process.on("exit", () => { host?.kill("SIGKILL"); for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function seed(dir, code) {
  let g = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 11 });
  while (g.phase !== "roll") {
    const result = applyAction(g, g.current, chooseBotAction(g, g.current));
    assert.ifError(result.error);
    g = result.state;
  }
  g.current = "p0";
  g.phase = "main";
  g.players.sort((a, b) => a.id.localeCompare(b.id));
  const seats = g.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `${code}-${p.id}` }));
  writeFileSync(path.join(dir, `${code}.json`), JSON.stringify({ code, host: "s0", next: 3, chat: [], chatSeq: 0, game: g, seats, shape: 2, savedAt: Date.now() }));
}

async function start(dir, env) {
  let stderr = "";
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR: dir, ACT_CAP: "1000", ACT_RATE: "1000", GRACE_MS: "60000", HOLD_MS: "60000", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  host.stderr.on("data", (d) => { stderr += d; });
  return new Promise((resolve, reject) => {
    host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
    host.on("exit", (c) => reject(new Error(`host exited ${c}: ${stderr}`)));
  });
}

async function kill9() {
  const h = host;
  h.removeAllListeners("exit");
  h.kill("SIGKILL");
  await new Promise((r) => h.once("exit", r));
}

async function client(port, code, pid) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, state: null, logs: [], waiters: [] };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") c.state = msg;
    if (msg.type === "log") c.logs.push(msg.text);
    for (const w of c.waiters.splice(0)) w();
  });
  c.until = (ok, ms, label) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out: ${label}`)), ms);
    const check = () => { if (ok()) { clearTimeout(t); resolve(); } else c.waiters.push(check); };
    check();
  });
  await new Promise((resolve) => ws.once("open", resolve));
  ws.send(JSON.stringify({ type: "hello", code, secret: `${code}-${pid}` }));
  await c.until(() => c.state, 5000, `${pid} state`);
  return c;
}

try {
  // 1. The window survives a restart.
  let dir = mkdtempSync(path.join(tmpdir(), "emberisle-restart-"));
  dirs.push(dir);
  let code = "RSAA";
  seed(dir, code);
  const env1 = { TURN_MS: "8000", TURN_TOTAL_MS: "60000" };
  let port = await start(dir, env1);
  let a = await client(port, code, "p0");
  const d1 = a.state.turnDeadline;
  assert(d1 > Date.now() + 6000, "A has a fresh 8 s window");
  await sleep(700);
  const saved = JSON.parse(readFileSync(path.join(dir, `${code}.json`), "utf8")).seats.find((s) => s.pid === "p0");
  assert.equal(saved.turnDeadline, d1, "the room file carries the deadline");
  a.ws.terminate();
  await kill9();
  await sleep(1500);
  port = await start(dir, env1);
  await sleep(1000);
  a = await client(port, code, "p0");
  const rejoinAt = Date.now();
  assert(Math.abs(a.state.turnDeadline - d1) < 1000, `restored deadline ${a.state.turnDeadline - d1} ms from the original`);
  assert(a.state.turnDeadline < rejoinAt + 7000, "not a fresh 8 s from the rejoin");
  console.log(`restart: deadline ${d1}, killed -9 and restarted, rejoined with ${d1 - rejoinAt} ms left, state deadline off by ${a.state.turnDeadline - d1} ms`);
  a.ws.terminate();
  await kill9();

  // 2. A deadline that ran out while the host was down is spent on the rejoin.
  dir = mkdtempSync(path.join(tmpdir(), "emberisle-restart-"));
  dirs.push(dir);
  code = "RSBB";
  seed(dir, code);
  const env2 = { TURN_MS: "2500", TURN_TOTAL_MS: "60000" };
  port = await start(dir, env2);
  a = await client(port, code, "p0");
  const d2 = a.state.turnDeadline;
  await sleep(700);
  a.ws.terminate();
  await kill9();
  await sleep(Math.max(0, d2 + 500 - Date.now()));
  port = await start(dir, env2);
  a = await client(port, code, "p0");
  await a.until(() => a.logs.includes("Ember took too long; the table moved on."), 2000, "turnOut on rejoin");
  await a.until(() => a.state.game.current !== "p0", 2000, "the turn passes");
  assert.equal(a.state.game.players.find((p) => p.id === "p0").kind, "human", "the seat stays human");
  console.log(`expired: host down ${Date.now() - d2} ms past the deadline, rejoin fires "took too long" and the turn moves on, Ember is still human`);
  a.ws.terminate();
  await kill9();

  // 3. The budget survives a drop and rejoin.
  dir = mkdtempSync(path.join(tmpdir(), "emberisle-restart-"));
  dirs.push(dir);
  code = "RSCC";
  seed(dir, code);
  port = await start(dir, { TURN_MS: "1500", TURN_TOTAL_MS: "3000" });
  a = await client(port, code, "p0");
  const b = await client(port, code, "p1");
  const start3 = a.state.turnDeadline - 1500;
  await sleep(800);
  a.ws.terminate();
  await sleep(400);
  const c = await client(port, code, "p2");
  await sleep(Math.max(0, start3 + 2000 - Date.now()));
  a = await client(port, code, "p0");
  const off = a.state.turnDeadline - (start3 + 3000);
  assert(Math.abs(off) < 200, `deadline ${off} ms from the 3 s cap (a reset would be ~+500)`);
  await a.until(() => a.logs.includes("Ember took too long; the table moved on."), 2500, "passed at the cap");
  const late = Date.now() - (start3 + 3000);
  assert(late < 800, `passed ${late} ms past the cap`);
  console.log(`budget: dropped, another seat joined, rejoined at 2 s: deadline ${off} ms from the cap, passed ${late} ms past it`);
  for (const x of [a, b, c]) x.ws.terminate();
  console.log("restart prove ok");
  process.exit(0);
} catch (e) {
  console.log("FAIL", e.message);
  process.exit(1);
}
