// A connected player who does nothing on their turn is moved past by the host's bot after TURN_MS (#344, Jarrod's
// call on #324). A seat that acts within the window is never moved, an idle discard is halved, and a dropped seat
// still follows GRACE_MS. Every wait here is for a message; the only sleep is a deliberate pause inside the window.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const TURN = 300;
const GRACE = 5 * TURN;
const HOLD = 20000;
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0", TURN_MS: String(TURN), GRACE_MS: String(GRACE), HOLD_MS: String(HOLD), ACT_RATE: "1000", ACT_CAP: "1000", ROOMS_DIR },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const port = await new Promise((resolve, reject) => {
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  host.on("exit", (c) => reject(new Error(`host exited ${c}`)));
});

function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  host.kill();
  process.exit(1);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tooLong = (name) => `${name} took too long; the table moved on.`;
const handOf = (state, pid) => Object.values(state.game.players.find((p) => p.id === pid).resources).reduce((a, b) => a + b, 0);

async function client(name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { name, ws, inbox: [], logs: [], waiters: [], state: null, auto: false, acted: -1 };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") {
      c.state = msg;
      if (c.auto) drive(c);
    }
    if (msg.type === "log") c.logs.push(msg.text);
    if (msg.type === "error") fail(`${name} got an error`, msg.message);
    c.inbox.push(msg);
    for (const w of c.waiters.splice(0)) w();
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  // The first message of `type` that passes `ok`, waiting up to `ms`.
  c.next = async (type, ok = () => true, ms = 3000) => {
    const until = Date.now() + ms;
    for (;;) {
      const i = c.inbox.findIndex((m) => m.type === type && ok(m));
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      const left = until - Date.now();
      if (left <= 0) fail(`${name} waited for ${type}`);
      await new Promise((res) => {
        c.waiters.push(res);
        setTimeout(res, left);
      });
    }
  };
  c.close = () => new Promise((res) => (ws.readyState === ws.CLOSED ? res() : (ws.once("close", res), ws.close())));
  await new Promise((res) => ws.on("open", res));
  return c;
}

// A seat that plays at once: setup placements, roll, wayfarer, pass. It never discards, so a 7 that costs cards leaves
// the owing seats idle for the timer. One action per state, so a stale state never doubles an action.
function drive(c) {
  const { legal, game } = c.state;
  if (c.acted === game.seq) return;
  let msg = null;
  if (legal.outpost.length && game.phase === "setupSettle") msg = { type: "place", kind: "outpost", id: legal.outpost[0] };
  else if (legal.path.length && game.phase === "setupRoad") msg = { type: "place", kind: "path", id: legal.path[0] };
  else if (legal.actions.includes("roll")) msg = { type: "roll" };
  else if (legal.wayfarer.length) {
    const hexId = legal.wayfarer.find((h) => legal.steal[h]) ?? legal.wayfarer[0];
    msg = { type: "rob", hexId, stealFrom: legal.steal[hexId]?.[0] ?? null };
  } else if (legal.actions.includes("pass")) msg = { type: "pass" };
  if (!msg) return;
  c.acted = game.seq;
  c.send(msg);
}

const a = await client("Ember");
const b = await client("Tide");
const c = await client("Pine");
const all = [a, b, c];
a.send({ type: "hello", name: "Ember" });
const wa = await a.next("welcome");
const code = wa.code;
b.send({ type: "hello", code, name: "Tide" });
c.send({ type: "hello", code, name: "Pine" });
await b.next("welcome");
await c.next("welcome");
for (const x of all) x.send({ type: "ready", value: true });
await a.next("seats", (m) => m.seats.length === 3 && m.seats.every((s) => s.ready));
a.send({ type: "start" });
const t0 = Date.now();
const first = await Promise.all(all.map((x) => x.next("state")));
const ember = a.state.you;
const byPid = Object.fromEntries(all.map((x) => [x.state.you, x]));
if (a.state.game.current !== ember || a.state.game.phase !== "setupSettle") fail("Ember places first", a.state.game);
console.log(`table ${code}: 3 seats, Ember (${ember}) places first, TURN_MS ${TURN}, GRACE_MS ${GRACE}`);

// 1. Nobody moves. Within about a second the log says so, the bot has placed Ember's outpost, and she is still human.
for (const st of first) {
  if (typeof st.turnDeadline !== "number" || st.turnDeadline < t0 + TURN - 50 || st.turnDeadline > t0 + TURN + 1000) fail("state carries the deadline", st.turnDeadline);
}
await b.next("log", (m) => m.text === tooLong("Ember"), TURN + 1000);
const took = Date.now() - t0;
if (took < TURN - 50 || took > 1000) fail(`the table moved after ${took} ms, wanted about ${TURN}`);
const placed = await b.next("state", (m) => m.game.phase === "setupRoad", 1000);
if (placed.game.current !== ember) fail("still Ember's setup after the outpost", placed.game.current);
if (placed.game.players.find((p) => p.id === ember).kind !== "human") fail("Ember stays human");
if (!placed.game.vertices.some((v) => v.building?.playerId === ember)) fail("the bot placed Ember's outpost");
// Idle again: the path goes down and play moves to the next seat.
const moved = await b.next("state", (m) => m.game.current !== ember, TURN + 1000);
if (b.logs.filter((t) => t === tooLong("Ember")).length !== 2) fail("one log line per idle move", b.logs);
console.log(`idle setup: "${tooLong("Ember")}" after ${took} ms, outpost and path placed, play moved to ${moved.game.current}, Ember is human`);

// 2. Tide acts inside the window (a deliberate pause of a third of it): accepted, never moved, and her deadline restarts.
const tide = b.state.you;
if (moved.game.current !== tide) fail("Tide places second", moved.game.current);
const deadline0 = b.state.turnDeadline;
await wait(TURN / 3);
b.send({ type: "place", kind: "outpost", id: b.state.legal.outpost[0] });
const road = await b.next("state", (m) => m.game.phase === "setupRoad" && m.game.current === tide, 1000);
if (!(road.turnDeadline > deadline0)) fail("an accepted action restarts the window", { deadline0, next: road.turnDeadline });
b.send({ type: "place", kind: "path", id: road.legal.path[0] });
await b.next("state", (m) => m.game.current !== tide, 1000);
if (all.some((x) => x.logs.includes(tooLong("Tide")))) fail("a seat that acts in time was moved", b.logs);
console.log(`in time: Tide placed after ${TURN / 3} ms, deadline ${deadline0} -> ${road.turnDeadline}, never moved`);

// 3. Everyone plays at once until a 7 costs a seat cards; the owing seats go idle and the bot halves each hand.
for (const x of all) {
  x.auto = true;
  drive(x);
}
const owed = await Promise.race(all.map((x) => x.next("state", (m) => m.game.phase === "discard", 60000)));
for (const x of all) x.auto = false;
const owing = Object.entries(owed.game.discardNeeded).filter(([, n]) => n > 0);
if (!owing.length) fail("a discard phase with nobody owing", owed.game.discardNeeded);
if (b.logs.filter((t) => t.endsWith("took too long; the table moved on.")).length !== 2) fail("auto play was moved on", b.logs);
for (const [pid, n] of owing) {
  const x = byPid[pid];
  const before = handOf(x.state, pid);
  if (n !== Math.floor(before / 2)) fail("the discard is half the hand", { pid, before, n });
  await x.next("log", (m) => m.text === tooLong(x.name), TURN + 1000);
  const halved = await x.next("state", (m) => m.game.seq > owed.game.seq && !(m.game.discardNeeded[pid] > 0), 1000);
  const after = handOf(halved, pid);
  if (after !== before - n) fail("the idle hand was halved", { pid, before, n, after });
  if (!x.logs.includes(`${x.name} discards ${n}.`)) fail("the discard is logged", x.logs.slice(-5));
  console.log(`idle discard: ${x.name} held ${before}, owed ${n}, holds ${after}`);
}
// The wayfarer then moves for the idle roller, and the idle main turn is passed with nothing spent.
const roller = byPid[owed.game.current];
const robbed = await roller.next("state", (m) => m.game.seq > owed.game.seq && m.game.phase === "main" && m.game.current === roller.state.you, TURN + 1000);
const goods = handOf(robbed, roller.state.you);
const passed = await roller.next("state", (m) => m.game.seq > robbed.game.seq && m.game.current !== roller.state.you, TURN + 1000);
if (handOf(passed, roller.state.you) !== goods) fail("an idle main turn spends nothing", { goods, after: handOf(passed, roller.state.you) });
if (passed.game.players.find((p) => p.id === roller.state.you).kind !== "human") fail("the roller stays human");
console.log(`idle wayfarer and pass: ${roller.name} moved on with ${goods} goods, phase ${passed.game.phase}, now ${passed.game.current}`);

// 4. The next seat drops on its roll: the table waits the whole grace (not the turn window), then the bot takes over.
const dropper = byPid[passed.game.current];
const watcher = all.find((x) => x !== dropper);
if (passed.game.phase !== "roll") fail("the next seat is on its roll", passed.game.phase);
watcher.inbox = watcher.inbox.filter((m) => m.type !== "state");
const seen = watcher.logs.length;
const t1 = Date.now();
await dropper.close();
await watcher.next("log", (m) => m.text === `${dropper.name} lost connection.`, 1000);
const taken = await watcher.next("log", (m) => m.text === `${dropper.name} is played by the bot until they return.`, GRACE + 2000);
const graced = Date.now() - t1;
if (graced < GRACE - 50) fail(`the bot took the dropped seat after ${graced} ms, grace is ${GRACE}`);
if (watcher.logs.slice(seen).includes(tooLong(dropper.name))) fail("the turn timer fired for a dropped seat", watcher.logs.slice(seen));
const stale = watcher.inbox.filter((m) => m.type === "state" && m.game.seq !== passed.game.seq);
if (stale.length) fail("the table moved inside the grace", stale.length);
const bot = await watcher.next("state", (m) => m.game.seq > passed.game.seq && m.game.players.find((p) => p.id === dropper.state.you).kind === "bot", 2000);
console.log(`dropped seat: ${dropper.name} held ${graced} ms (TURN_MS ${TURN}, GRACE_MS ${GRACE}), no turn-timer line, then "${taken.text}", seq ${passed.game.seq} -> ${bot.game.seq}`);

host.removeAllListeners("exit");
host.kill();
console.log("turn prove ok");
process.exit(0);
