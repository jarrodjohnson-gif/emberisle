// A connected player who does nothing on their turn is moved past by the host's bot after TURN_MS (#344, Jarrod's
// call on #324). A seat that acts within the window is never moved, an idle discard is halved, and a dropped seat
// still follows GRACE_MS. Every wait here is for a message; the only sleep is a deliberate pause inside the window.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

// A window wide enough that a seat acting a third of the way in still beats the timer on a loaded CI box.
const TURN = 1200;
const GRACE = 5 * TURN;
const HOLD = 20000;
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0", TURN_MS: String(TURN), GRACE_MS: String(GRACE), HOLD_MS: String(HOLD), ACT_RATE: "1000", ACT_CAP: "1000", ROOMS_DIR },
});
process.on("exit", () => host.kill("SIGKILL"));
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
  host.kill("SIGKILL");
  process.exit(1);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tooLong = (name) => `${name} took too long; the table moved on.`;
// A seat's own view carries its hand; every other seat's hand arrives as the `goods` count.
const handOf = (state, pid) => {
  const p = state.game.players.find((x) => x.id === pid);
  return p.resources ? Object.values(p.resources).reduce((a, b) => a + b, 0) : p.goods;
};

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
  c.send = (msg) => ws.send(JSON.stringify({ ...c.state?.actionStamp, cid: crypto.randomUUID(), ...msg }));
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

async function stateBarrier(peers, seq) {
  await Promise.all(peers.map((peer) => peer.state?.game.seq >= seq ? Promise.resolve() : peer.next("state", (m) => m.game.seq >= seq)));
}

// A seat that plays at once (or, in "rollOff" mode, only its roll-off rolls): setup placements, roll, wayfarer, pass. It never discards, so a 7 that costs cards leaves
// the owing seats idle for the timer. One action per state, so a stale state never doubles an action.
function drive(c) {
  const { legal, game } = c.state;
  if (c.acted === game.seq || (c.auto === "rollOff" && game.phase !== "rollOff")) return;
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
const byPid = Object.fromEntries(all.map((x) => [x.state.you, x]));
if (a.state.game.phase !== "rollOff") fail("the game opens with the roll-off", a.state.game.phase);
const opener = byPid[a.state.game.current];
const w0 = all.find((x) => x !== opener);
console.log(`table ${code}: 3 seats, ${opener.name} (${opener.state.you}) opens the roll-off, TURN_MS ${TURN}, GRACE_MS ${GRACE}`);

// 0. The opener idles on the roll-off: the deadline is in the state and the bot rolls for them. The rest roll themselves.
for (const st of first) {
  if (typeof st.turnDeadline !== "number" || st.turnDeadline < t0 + TURN - 50 || st.turnDeadline > t0 + TURN + 1000) fail("state carries the deadline", st.turnDeadline);
}
await w0.next("log", (m) => m.text === tooLong(opener.name), TURN + 1000);
const took = Date.now() - t0;
if (took < TURN - 50 || took > TURN + 1000) fail(`the table moved after ${took} ms, wanted about ${TURN}`);
const die = await w0.next("log", (m) => new RegExp(`^Bot rolled for ${opener.name}: roll-off die \\d+\\.$`).test(m.text));
await Promise.all(all.map((seat) => seat.logs.includes(die.text) ? Promise.resolve() : seat.next("log", (m) => m.text === die.text)));
for (const seat of all) if (seat.logs.filter((line) => line === die.text).length !== 1) fail("every seat receives one bot roll line", seat.logs.slice(-5));
// The roll's state push follows its log lines, so the next state (not the stale pre-roll one) starts the rolling.
for (const x of all) x.auto = "rollOff";
const settle = await w0.next("state", (m) => m.game.phase === "setupSettle", 10000);
await stateBarrier(all, settle.game.seq);
for (const x of all) x.auto = false;
const placer = byPid[settle.game.current];
const w = all.find((x) => x !== placer);
// Every seat is waited on in the roll-off, so an idle placer's own roll-off timer can log "took too long" there too
// (it fires the same TURN after the deal, and the rest only start rolling once the opener's has). That line is
// buffered by now and must not pass for the setup move: start from w's own copy of the setupSettle state, which
// follows every roll-off log, and drop what came before it (w0 already took its copy as `settle`).
const mine = w === w0 ? settle : await w.next("state", (m) => m.game.phase === "setupSettle" && m.game.seq === settle.game.seq, 10000);
w.inbox = w.inbox.filter((m) => m.type !== "log");
const seen0 = w.logs.length;
console.log(`idle roll-off: "${tooLong(opener.name)}" after ${took} ms, "${die.text}", the rest rolled themselves, ${placer.name} places first`);

// 1. Nobody moves. Within the window the log says so, the bot has placed the outpost, and the placer is still human.
await w.next("log", (m) => m.text === tooLong(placer.name), TURN + 1000);
const late = Date.now() - mine.turnDeadline;
if (late < -50 || late > 1000) fail(`the table moved ${late} ms from the deadline`);
const placed = await w.next("state", (m) => m.game.seq > settle.game.seq && m.game.phase === "setupRoad");
if (placed.game.current !== placer.state.you) fail("still the placer's setup after the outpost", placed.game.current);
if (placed.game.players.find((p) => p.id === placer.state.you).kind !== "human") fail("the placer stays human");
if (!placed.game.vertices.some((v) => v.building?.playerId === placer.state.you)) fail("the bot placed the outpost");
const outpostLine = `Bot built an outpost for ${placer.name}.`;
if (placed.game.log.filter((line) => line === outpostLine).length !== 1) fail("one canonical setup action line", placed.game.log.slice(-8));
await stateBarrier(all, placed.game.seq);
await Promise.all(all.map((seat) => seat.logs.includes(outpostLine) ? Promise.resolve() : seat.next("log", (m) => m.text === outpostLine)));
for (const seat of all) if (seat.logs.filter((line) => line === outpostLine).length !== 1) fail("every seated client receives one setup action line", seat.logs.slice(-8));
// Idle again: the path goes down and play moves to the next seat.
const moved = await w.next("state", (m) => m.game.seq > placed.game.seq && m.game.current !== placer.state.you, TURN + 1000);
if (w.logs.slice(seen0).filter((t) => t === tooLong(placer.name)).length !== 2) fail("one log line per idle move", w.logs.slice(seen0));
const pathLine = `Bot built a path for ${placer.name}.`;
if (moved.game.log.filter((line) => line === pathLine).length !== 1) fail("one canonical setup path line", moved.game.log.slice(-8));
await stateBarrier(all, moved.game.seq);
await Promise.all(all.map((seat) => seat.logs.includes(pathLine) ? Promise.resolve() : seat.next("log", (m) => m.text === pathLine)));
for (const seat of all) if (seat.logs.filter((line) => line === pathLine).length !== 1) fail("every seated client receives one setup path line", seat.logs.slice(-8));
console.log(`idle setup: "${tooLong(placer.name)}" ${late} ms past the deadline, outpost and path placed, play moved to ${moved.game.current}, ${placer.name} is human`);

// 2. The second seat acts inside the window (a deliberate pause of a third of it): accepted, never moved, deadline restarts.
const second = byPid[moved.game.current];
const deadline0 = second.state.turnDeadline;
await wait(TURN / 3);
second.send({ type: "place", kind: "outpost", id: second.state.legal.outpost[0] });
const road = await second.next("state", (m) => m.game.seq > moved.game.seq && m.game.phase === "setupRoad" && m.game.current === second.state.you);
if (!(road.turnDeadline > deadline0)) fail("an accepted action restarts the window", { deadline0, next: road.turnDeadline });
second.send({ type: "place", kind: "path", id: road.legal.path[0] });
await second.next("state", (m) => m.game.seq > road.game.seq && m.game.current !== second.state.you);
if (w.logs.slice(seen0).includes(tooLong(second.name))) fail("a seat that acts in time was moved", w.logs.slice(seen0));
console.log(`in time: ${second.name} placed after ${TURN / 3} ms, deadline ${deadline0} -> ${road.turnDeadline}, never moved`);

// 3. Everyone plays at once until a 7 costs a seat cards; the owing seats go idle and the bot halves each hand.
for (const x of all) {
  x.auto = true;
  drive(x);
}
const owed = await Promise.race(all.map((x) => x.next("state", (m) => m.game.phase === "discard", 60000)));
for (const x of all) x.auto = false;
const owing = Object.entries(owed.game.discardNeeded).filter(([, n]) => n > 0);
if (!owing.length) fail("a discard phase with nobody owing", owed.game.discardNeeded);
if (w.logs.slice(seen0).filter((t) => t.endsWith("took too long; the table moved on.")).length !== 2) fail("auto play was moved on", w.logs.slice(seen0));
for (const [pid, n] of owing) {
  const x = byPid[pid];
  // Both owing timers fire together, so the hand before comes from the discard-phase state, not whatever x holds now.
  const before = handOf(owed, pid);
  if (n !== Math.floor(before / 2)) fail("the discard is half the hand", { pid, before, n });
  await x.next("log", (m) => m.text === tooLong(x.name), TURN + 1000);
  const halved = await x.next("state", (m) => m.game.seq > owed.game.seq && !(m.game.discardNeeded[pid] > 0));
  const after = handOf(halved, pid);
  if (after !== before - n) fail("the idle hand was halved", { pid, before, n, after });
  const discardLine = `Bot discarded for ${x.name} (${n}).`;
  if (halved.game.log.filter((line) => line === discardLine).length !== 1) fail("the discard action is logged once", { logs: x.logs.slice(-8), game: halved.game.log.slice(-8) });
  await stateBarrier(all, halved.game.seq);
  await Promise.all(all.map((seat) => seat.logs.includes(discardLine) ? Promise.resolve() : seat.next("log", (m) => m.text === discardLine)));
  for (const seat of all) if (seat.logs.filter((line) => line === discardLine).length !== 1) fail("each seat receives one discard line", seat.logs.slice(-8));
  console.log(`idle discard: ${x.name} held ${before}, owed ${n}, holds ${after}`);
}
// The wayfarer then moves for the idle roller, and the idle main turn is passed with nothing spent.
const roller = byPid[owed.game.current];
const robbed = await roller.next("state", (m) => m.game.seq > owed.game.seq && m.game.phase === "main" && m.game.current === roller.state.you, TURN + 1000);
const goods = handOf(robbed, roller.state.you);
const recoveryMove = robbed.game.log.filter((line) => line.startsWith(`Bot moved the Wayfarer for ${roller.name}`));
if (recoveryMove.length !== 1 || recoveryMove[0].includes("steals a card from") || recoveryMove[0].includes("sends the wayfarer")) fail("connected timeout wayfarer is one public action line", robbed.game.log.slice(-8));
await stateBarrier(all, robbed.game.seq);
await Promise.all(all.map((seat) => seat.logs.includes(recoveryMove[0]) ? Promise.resolve() : seat.next("log", (m) => m.text === recoveryMove[0])));
for (const seat of all) if (seat.logs.filter((line) => line === recoveryMove[0]).length !== 1) fail("every seated client receives one connected timeout wayfarer line", seat.logs.slice(-8));
const passed = await roller.next("state", (m) => m.game.seq > robbed.game.seq && m.game.current !== roller.state.you, TURN + 1000);
if (handOf(passed, roller.state.you) !== goods) fail("an idle main turn spends nothing", { goods, after: handOf(passed, roller.state.you) });
if (passed.game.players.find((p) => p.id === roller.state.you).kind !== "human") fail("the roller stays human");
const passLine = `Bot passed for ${roller.name}; ${passed.game.players.find((p) => p.id === passed.game.current).name}'s turn.`;
if (passed.game.log.filter((line) => line === passLine).length !== 1) fail("connected timeout pass is one canonical line", passed.game.log.slice(-8));
await stateBarrier(all, passed.game.seq);
await Promise.all(all.map((seat) => seat.logs.includes(passLine) ? Promise.resolve() : seat.next("log", (m) => m.text === passLine)));
for (const seat of all) if (seat.logs.filter((line) => line === passLine).length !== 1) fail("every seated client receives one connected timeout pass", seat.logs.slice(-8));
console.log(`idle wayfarer and pass: ${roller.name} moved on with ${goods} goods, phase ${passed.game.phase}, now ${passed.game.current}`);

// 4. The next seat drops on its roll: the table waits the whole grace (not the turn window), then the bot takes over.
const dropper = byPid[passed.game.current];
const watcher = all.find((x) => x !== dropper);
if (passed.game.phase !== "roll") fail("the next seat is on its roll", passed.game.phase);
watcher.inbox = watcher.inbox.filter((m) => m.type !== "state");
const seen = watcher.logs.length;
const t1 = Date.now();
await dropper.close();
await watcher.next("log", (m) => m.text === `${dropper.name} lost connection.`);
const taken = await watcher.next("log", (m) => m.text === `${dropper.name} is played by the bot until they return.`, GRACE + 2000);
const graced = Date.now() - t1;
if (graced < GRACE - 50) fail(`the bot took the dropped seat after ${graced} ms, grace is ${GRACE}`);
if (watcher.logs.slice(seen).includes(tooLong(dropper.name))) fail("the turn timer fired for a dropped seat", watcher.logs.slice(seen));
// The takeover state follows its log at once, so only a state where the dropper is still human counts as movement.
const stale = watcher.inbox.filter((m) => m.type === "state" && m.game.seq !== passed.game.seq && m.game.players.find((p) => p.id === dropper.state.you).kind === "human");
if (stale.length) fail("the table moved inside the grace", stale.length);
const bot = await watcher.next("state", (m) => m.game.seq > passed.game.seq && m.game.players.find((p) => p.id === dropper.state.you).kind === "bot", 2000);
console.log(`dropped seat: ${dropper.name} held ${graced} ms (TURN_MS ${TURN}, GRACE_MS ${GRACE}), no turn-timer line, then "${taken.text}", seq ${passed.game.seq} -> ${bot.game.seq}`);

host.removeAllListeners("exit");
host.kill("SIGKILL");
console.log("turn prove ok");
process.exit(0);
