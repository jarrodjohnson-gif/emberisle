// G3: a seat that keeps acting can't keep the clock alive forever. Under TURN_MS=1500 and TURN_TOTAL_MS=3600 a seat
// sends a legal bank trade every 400 ms (each well inside TURN_MS), and the host's bot passes for it at the cap, not
// later. The deadline in every `state` never passes the cap, the log says the table moved on, the seat stays human,
// and the next seat's turn starts a fresh budget and restarts normally on an action.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";

const TURN = 1500;
const TOTAL = 3600;
const EVERY = 400;
const code = "CPAA";
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-cap-"));
let host;
let stderr = "";
process.on("exit", () => { host?.kill("SIGKILL"); rmSync(dir, { recursive: true, force: true }); });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));

let g = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 11 });
while (g.phase !== "roll") {
  const result = applyAction(g, g.current, chooseBotAction(g, g.current));
  assert.ifError(result.error);
  g = result.state;
}
g.current = "p0";
g.phase = "main";
g.turn = 7;
g.seq = 50;
for (const p of g.players) p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
g.players.find((p) => p.id === "p0").resources = { timber: 15, clay: 0, wool: 0, grain: 15, ore: 0 };
for (const r of RESOURCES) g.bank[r] = 19 - g.players.reduce((n, p) => n + p.resources[r], 0);
g.players.sort((a, b) => a.id.localeCompare(b.id));
const seats = g.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `${code}-${p.id}` }));
writeFileSync(path.join(dir, `${code}.json`), JSON.stringify({ code, host: "s0", next: 3, chat: [], chatSeq: 0, game: g, seats, shape: 2, savedAt: Date.now() }));

host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR: dir, ACT_CAP: "1000", ACT_RATE: "1000", GRACE_MS: "60000", HOLD_MS: "60000", TURN_MS: String(TURN), TURN_TOTAL_MS: String(TOTAL) },
  stdio: ["ignore", "pipe", "pipe"],
});
host.stderr.on("data", (d) => { stderr += d; });
const port = await new Promise((resolve, reject) => {
  host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
  host.on("exit", (c) => reject(new Error(`host exited ${c}: ${stderr}`)));
});

async function client(pid) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, state: null, logs: [], states: [], waiters: [] };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") { c.state = msg; c.states.push(msg); }
    if (msg.type === "log") c.logs.push(msg.text);
    for (const w of c.waiters.splice(0)) w();
  });
  // Resolves when `ok` holds for the client, or rejects after `ms`.
  c.until = (ok, ms, label) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out: ${label}: ${stderr}`)), ms);
    const check = () => { if (ok()) { clearTimeout(t); resolve(); } else c.waiters.push(check); };
    check();
  });
  c.send = (msg) => ws.send(JSON.stringify({ ...msg, ...c.state.actionStamp, cid: randomUUID() }));
  await new Promise((resolve) => ws.once("open", resolve));
  ws.send(JSON.stringify({ type: "hello", code, secret: `${code}-${pid}` }));
  await c.until(() => c.state, 5000, `${pid} state`);
  return c;
}

try {
  const a = await client("p0");
  const b = await client("p1");
  await client("p2");
  const start = a.states[0].turnDeadline - TURN;
  const cap = start + TOTAL;
  const moved = `Ember took too long; the table moved on.`;

  // Ember acts every EVERY ms: each action restarts the TURN window, so only the cap can end the turn.
  let sent = 0;
  let give = "timber";
  const ticker = setInterval(() => {
    if (a.state.game.current !== "p0") return;
    a.send({ type: "tradeBank", give, take: give === "timber" ? "grain" : "timber" });
    give = give === "timber" ? "grain" : "timber";
    sent++;
  }, EVERY);
  await a.until(() => a.state.game.current !== "p0", TOTAL + 3000, "the turn passes at the cap");
  clearInterval(ticker);
  const passedAt = Date.now();
  assert(sent >= Math.floor(TOTAL / EVERY) - 3, `Ember kept acting (${sent} actions)`);
  assert(passedAt >= cap - 50 && passedAt <= cap + 1000, `passed ${passedAt - cap} ms from the cap`);
  assert(a.logs.includes(moved), `log says the table moved on: ${a.logs.slice(-4)}`);
  assert(a.states.every((s) => s.turnDeadline === null || s.turnDeadline <= cap || s.game.current !== "p0"), "no p0 deadline past the cap");
  assert.equal(a.state.game.players.find((p) => p.id === "p0").kind, "human", "the seat stays human");
  assert.equal(a.state.game.phase, "roll");
  console.log(`capped: ${sent} actions every ${EVERY} ms (TURN_MS ${TURN}), passed ${passedAt - cap} ms past the cap (TURN_TOTAL_MS ${TOTAL}), "${moved}", Ember is still human`);

  // The next seat has a fresh budget: its first deadline is a full window, and an action restarts it uncapped.
  await b.until(() => b.state.game.current === "p1" && b.state.turnDeadline, 2000, "Tide's deadline");
  const d0 = b.state.turnDeadline;
  assert(d0 - passedAt > TURN - 600 && d0 - passedAt <= TURN + 100, `Tide gets a full window (${d0 - passedAt} ms)`);
  await new Promise((r) => setTimeout(r, TURN / 3));
  const seq = b.state.game.seq;
  b.send({ type: "roll" });
  await b.until(() => b.state.game.seq > seq && b.state.turnDeadline > d0, 2000, "Tide's deadline restarts");
  assert(!b.logs.includes("Tide took too long; the table moved on."), "a seat that acts in time is never moved");
  console.log(`normal turn: Tide acted after ${TURN / 3} ms, deadline ${d0} -> ${b.state.turnDeadline}, never moved`);
  console.log("cap prove ok");
  process.exit(0);
} catch (e) {
  console.log("FAIL", e.message);
  process.exit(1);
}
