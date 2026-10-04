// #347: a spectator socket (hello {code, watch:true}) on a started table. It has no seat and gets the opponent view:
// every state the seats get, with no hand, hidden card, deck, seed or rng, and at the win the same reveal as the seats
// minus the seed and rng. The seats see a watcher count and a coalesced log line, every message a watcher sends is refused
// with one error, the turn timer only ever moves a seat, with every seat dropped the bots wait as they do with nobody
// connected (#349), and the last seat letting go closes the watchers. Three src/lib/net/table.ts clients play the game
// to the win on the practice bot.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { RESOURCES } from "../src/lib/game/types.ts";
import { connectTable } from "../src/lib/net/table.ts";

const MAX_ACTIONS = 5000;
const STEP_MS = 5000;
// Wide enough that the bot-driven seats never idle this long on a loaded CI box; the only idle wait is deliberate.
const TURN = 1200;
const WATCH_MAX = 2;
// Every seat drops mid-game: after GRACE the bot takes each seat (and waits, with no seat connected); the seats rejoin
// well inside HOLD. Once the game is over every seat closes; after HOLD the room is dropped under the last watcher.
const GRACE = 300;
const HOLD = 5000;
const DEV_KINDS = ["knight", "road", "plenty", "monopoly", "vp"];

let host;
function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  host?.kill();
  process.exit(1);
}
setTimeout(() => fail("the proof ran past 120 s"), 120_000);

// Rooms go to a temp folder, dropped on exit, so the real host never restores this proof's tables (#207).
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0", ACT_RATE: "1000", ACT_CAP: "1000", TURN_MS: String(TURN), GRACE_MS: String(GRACE), HOLD_MS: String(HOLD), SPECTATOR_MAX: String(WATCH_MAX), ROOMS_DIR },
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
const url = `ws://127.0.0.1:${port}`;

// Every wait is woken by a message, never by a fixed sleep.
const waiters = new Set();
function wake() {
  for (const w of waiters) {
    if (!w.cond()) continue;
    waiters.delete(w);
    clearTimeout(w.timer);
    w.resolve();
  }
}
function until(cond, what, ms = STEP_MS) {
  if (cond()) return Promise.resolve();
  return new Promise((resolve) => {
    const w = { cond, resolve, timer: setTimeout(() => fail(`timed out: ${typeof what === "function" ? what() : what}`), ms) };
    waiters.add(w);
  });
}

function player(name) {
  const p = { name, state: null, legal: null, code: null, you: null, secret: null, seats: null, seatsSeen: [], errors: [], logs: [], chats: [], seqs: [] };
  attach(p);
  return p;
}

// A fresh table.ts client for `p`; a rejoin after a drop keeps the same record and its history.
function attach(p) {
  const on = (fn) => (m) => {
    fn(m);
    wake();
  };
  p.t = connectTable(url, {
    welcome: on((m) => {
      p.code = m.code;
      p.secret = m.secret;
    }),
    seats: on((m) => {
      p.seats = m.seats;
      p.seatsSeen.push(m);
    }),
    state: on((m) => {
      p.state = m.game;
      p.legal = m.legal;
      p.you = m.you;
      p.seqs.push(m.game.seq);
    }),
    log: on((text) => p.logs.push(text)),
    chat: on((line) => p.chats.push(line)),
    error: on((e) => p.errors.push(e)),
  }, WebSocket);
}

// A raw socket that keeps every message it is sent, so the proof can read all of them back.
async function watcher(name) {
  const ws = new WebSocket(url);
  const w = { name, ws, raws: [], inbox: [], states: [], errors: [], logs: [], chats: [], seatsSeen: [], closed: false };
  ws.on("message", (raw) => {
    const text = String(raw);
    const msg = JSON.parse(text);
    w.raws.push(text);
    w.inbox.push(msg);
    if (msg.type === "state") w.states.push(msg);
    if (msg.type === "error") w.errors.push(msg.message);
    if (msg.type === "log") w.logs.push(msg.text);
    if (msg.type === "chat") w.chats.push(msg);
    if (msg.type === "seats") w.seatsSeen.push(msg);
    wake();
  });
  ws.on("close", () => {
    w.closed = true;
    wake();
  });
  w.send = (msg) => ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
  w.state = () => w.states[w.states.length - 1];
  w.close = () => new Promise((res) => (ws.readyState === ws.CLOSED ? res() : (ws.once("close", res), ws.close())));
  await new Promise((res) => ws.on("open", res));
  return w;
}

// The opponent view: counts only, every hidden card zeroed, no deck, no seed or rng, nothing legal.
function checkClosed(m, where) {
  const g = m.game;
  if (m.you !== null) fail(`${where}: a watcher state has you=${JSON.stringify(m.you)}`);
  if ("seed" in g || "rng" in g) fail(`${where}: seed or rng reached a watcher at seq ${g.seq}`);
  if (!Array.isArray(g.deck) || g.deck.length !== 0) fail(`${where}: the deck reached a watcher at seq ${g.seq}`, g.deck);
  if (typeof g.deckLeft !== "number") fail(`${where}: no deckLeft at seq ${g.seq}`);
  for (const q of g.players) {
    if ("resources" in q) fail(`${where}: ${q.id}'s hand reached a watcher at seq ${g.seq}`, q.resources);
    if (typeof q.goods !== "number" || typeof q.fortunes !== "number") fail(`${where}: ${q.id} has no counts at seq ${g.seq}`, q);
    if (DEV_KINDS.some((k) => q.hidden[k] !== 0 || q.boughtThisTurn[k] !== 0)) fail(`${where}: ${q.id}'s hidden cards reached a watcher at seq ${g.seq}`, q.hidden);
  }
  const l = m.legal;
  if (l.actions.length || l.outpost.length || l.path.length || l.stronghold.length || l.wayfarer.length || l.discard || Object.keys(l.steal).length) {
    fail(`${where}: a watcher has legal moves at seq ${g.seq}`, l);
  }
}

// --- The table: three seats in the lobby.
const [a, b, c] = [player("Ember"), player("Tide"), player("Pine")];
const all = [a, b, c];
a.t.open({ name: "Ember" });
await until(() => a.code, "welcome");
const code = a.code;
b.t.join(code, { name: "Tide" });
c.t.join(code, { name: "Pine" });
await until(() => b.code && c.code, "joins");
const names = all.map((p) => p.name);

// --- 1. Before the start a watch request is refused, and a watch hello never opens or sits at a table.
const w0 = await watcher("w0");
w0.send({ type: "hello", code: code.toLowerCase(), watch: true });
await until(() => w0.errors.length >= 1, "watch before the start");
if (w0.errors[0] !== "Not started yet.") fail("a watch request before the start", w0.errors[0]);
w0.send({ type: "hello", watch: true });
w0.send({ type: "hello", code: "ZZZZ", watch: true });
await until(() => w0.errors.length >= 3, "watch with no code and a bad code");
if (w0.errors[1] !== "No table with that code" || w0.errors[2] !== "No table with that code") fail("watch with no code or a bad code", w0.errors.slice(1));
if (w0.inbox.some((m) => m.type !== "error")) fail("a refused watch sent more than the error", w0.inbox);
await w0.close();
console.log(`before the start: "${w0.errors[0]}"; no code and a bad code: "${w0.errors[1]}"`);

for (const p of all) p.t.ready(true);
await until(() => a.seats?.length === 3 && a.seats.every((s) => s.ready), "all ready");
if (a.seatsSeen.some((m) => m.watching !== 0)) fail("the lobby's seats carry watching: 0", a.seatsSeen.map((m) => m.watching));
a.t.start();
await until(() => all.every((p) => p.state), "start");
if (a.state.phase !== "rollOff") fail("the game opens with the roll-off", a.state.phase);

// --- 2. After the start: welcome {spectator}, then seats, then the redacted state; the seats hear and count it.
const logsAtJoin = all.map((p) => p.logs.length);
const seatsAtJoin = a.seatsSeen.length;
const w1 = await watcher("w1");
w1.send({ type: "hello", code, watch: true });
await until(() => w1.states.length >= 1, "the watcher's first state");
// The table's "Someone is watching." log reaches the watcher too; the seat-shaped messages come in this order.
const [welcome, seatsMsg, first] = w1.inbox.filter((m) => m.type !== "log");
if (welcome?.type !== "welcome" || welcome.spectator !== true || welcome.code !== code || !Array.isArray(welcome.chat)) fail("the watcher's welcome", welcome);
if ("you" in welcome || "host" in welcome || "secret" in welcome) fail("a watcher's welcome carries a seat", welcome);
if (seatsMsg?.type !== "seats" || seatsMsg.seats.length !== 3 || seatsMsg.watching !== 1) fail("the watcher's seats", seatsMsg);
if (first?.type !== "state" || first.game.phase !== "rollOff" || first.game.seq !== a.state.seq) fail("the watcher's first state", { type: first?.type, phase: first?.game?.phase });
if (typeof first.turnDeadline !== "number") fail("the watcher's state carries the table's deadline", first.turnDeadline);
checkClosed(first, "first state");
await until(() => all.every((p, i) => p.logs.length > logsAtJoin[i]), "the seats hear the watcher");
for (const [i, p] of all.entries()) if (!p.logs.slice(logsAtJoin[i]).includes("Someone is watching.")) fail(`${p.name} is told`, p.logs.slice(logsAtJoin[i]));
for (const p of all) if (p.seatsSeen[p.seatsSeen.length - 1].watching !== 1) fail(`${p.name} counts the watcher`, p.seatsSeen[p.seatsSeen.length - 1]);
const w2 = await watcher("w2");
w2.send({ type: "hello", code, watch: true });
const counted = (x) => x.seatsSeen[x.seatsSeen.length - 1]?.watching === 2;
await until(() => w2.states.length >= 1 && all.every(counted) && counted(w1), "a second watcher counted");
// The second join, within WATCH_LOG_MS of the first, is counted but not logged again.
if (a.logs.slice(logsAtJoin[0]).filter((t) => t === "Someone is watching.").length !== 1) fail("one log line for two watchers inside the window", a.logs.slice(logsAtJoin[0]));
if (w1.seatsSeen[w1.seatsSeen.length - 1].watching !== 2) fail("the first watcher sees the second", w1.seatsSeen[w1.seatsSeen.length - 1]);
if (a.seatsSeen.slice(seatsAtJoin).some((m) => m.seats.length !== 3)) fail("a watcher is never a seat", a.seatsSeen.slice(seatsAtJoin).map((m) => m.seats.length));
const w3 = await watcher("w3");
w3.send({ type: "hello", code, watch: true });
await until(() => w3.errors.length >= 1, "the cap");
if (w3.errors[0] !== "Table is full to watch." || w3.inbox.length !== 1) fail(`watcher ${WATCH_MAX + 1} past SPECTATOR_MAX=${WATCH_MAX}`, w3.inbox);
await w3.close();
console.log(`after the start: welcome {spectator:true}, seats {watching:1}, redacted state at seq ${first.game.seq}; two watchers counted at every seat, one log line, a third gets "${w3.errors[0]}"`);

// --- 3. The turn timer: every seat idles on the roll-off with two watchers connected. It moves a seat, not a watcher.
const opener = all.find((p) => p.you === a.state.current);
await until(() => w1.logs.some((t) => t.endsWith("took too long; the table moved on.")), "the idle roll-off being moved on", TURN + 3000);
const moved = w1.logs.filter((t) => t.endsWith("took too long; the table moved on."));
if (moved.length !== 1 || moved[0] !== `${opener.name} took too long; the table moved on.`) fail("the timer moved the idle seat", { moved, opener: opener.name });
await until(() => w1.state().game.seq > first.game.seq, "the timer's roll reaching the watcher");
if (w1.errors.length || w2.errors.length) fail("the timer touched a watcher", { w1: w1.errors, w2: w2.errors });
console.log(`turn timer: idle roll-off, "${moved[0]}" (a seat, never a watcher), watcher at seq ${w1.state().game.seq}`);

// --- 4. The seats play to the win on the practice bot. Every watcher state on the way is the opponent view.
async function act(p, action) {
  const seq = p.state.seq;
  const errs = p.errors.length;
  p.t.act(action);
  await until(() => all.every((x) => x.state.seq > seq) || p.errors.length > errs, `${action.type} by ${p.you} at seq ${seq}`);
  return p.errors.length > errs ? p.errors[p.errors.length - 1] : null;
}
let actions = 0;
async function playUntil(stop) {
  for (; actions < MAX_ACTIONS && !stop(a.state); actions++) {
    const g = a.state;
    const p = g.phase === "discard" ? all.find((x) => x.legal.discard > 0) : all.find((x) => x.state.current === x.you);
    if (!p) fail(`nobody to act at seq ${g.seq}`, { phase: g.phase, current: g.current });
    const view = { ...p.state, deck: Array.from({ length: p.state.deckLeft }) };
    const action = chooseBotAction(view, p.you) ?? { type: "endTurn" };
    const err = await act(p, action);
    // A refused move becomes a pass, as runBots does; a refusal because the table already moved (the timer) is fine.
    if (err && a.state.seq === g.seq) {
      const again = await act(p, { type: "endTurn" });
      if (again && a.state.seq === g.seq) fail(`${p.you} ${JSON.stringify(action)} refused (${err}) and so was the pass`, again);
    }
  }
}

// --- 4b. Every seat drops mid-game with both watchers connected. After the grace the bot takes each seat, but with no
// seat connected the bots wait, exactly as with nobody connected at all: a watcher never keeps the game moving. The
// fence is the first "is back." line of the rejoin: a bot's push would have arrived before it on the same socket.
await playUntil((g) => g.phase === "main");
const seqAtDrop = a.state.seq;
// The watchers' copy of the last push rides its own socket, so it can land after the seats' did.
await until(() => [w1, w2].every((w) => w.state().game.seq === seqAtDrop), "the watchers catching up before the drop");
const inboxAtDrop = w1.inbox.length;
const inboxAtDrop2 = w2.inbox.length;
for (const p of all) p.t.close();
const taken = (w, from) => names.every((n) => w.inbox.slice(from).some((m) => m.type === "log" && m.text === `${n} is played by the bot until they return.`));
await until(() => taken(w1, inboxAtDrop) && taken(w2, inboxAtDrop2), "the bot taking every dropped seat", GRACE * 3 + 3000);
if (w1.closed || w2.closed) fail("the room closed under its watchers inside the hold");
if (!w1.seatsSeen[w1.seatsSeen.length - 1].seats.every((s) => s.away)) fail("every seat is marked away", w1.seatsSeen[w1.seatsSeen.length - 1].seats);
for (const p of all) {
  const seqs = p.seqs.length;
  attach(p);
  p.t.rejoin(code, p.secret);
  await until(() => p.seqs.length > seqs, `${p.name}'s rejoin state`);
}
const backAt = w1.inbox.findIndex((m, i) => i >= inboxAtDrop && m.type === "log" && m.text === "Ember is back.");
if (backAt < 0) fail("the watcher heard the first rejoin", w1.logs.slice(-5));
const pushedWhileEmpty = w1.inbox.slice(inboxAtDrop, backAt).filter((m) => m.type === "state");
if (pushedWhileEmpty.length) fail("the bots played with only watchers connected", { seqAtDrop, pushed: pushedWhileEmpty.map((m) => m.game.seq) });
if (w1.inbox.slice(inboxAtDrop, backAt).some((m) => m.type === "error")) fail("a watcher was touched by the drops", w1.errors.slice(-3));
await until(() => all.every((p) => p.state.players.every((q) => q.kind === "human")), "every seat human again");
console.log(`every seat dropped at seq ${seqAtDrop}: after GRACE_MS=${GRACE} the bot took all three and waited (0 states pushed to the watchers); all three rejoined, seq ${a.state.seq}, every seat human`);

await playUntil((g) => g.phase === "over");
if (a.state.phase !== "over") fail(`no winner after ${MAX_ACTIONS} actions`, { phase: a.state.phase, turn: a.state.turn });
await until(() => all.every((x) => x.state.phase === "over") && [w1, w2].every((w) => w.state().game.phase === "over"), "the end reaching every socket");
for (const w of [w1, w2]) {
  for (const m of w.states) if (m.game.phase !== "over") checkClosed(m, `${w.name} seq ${m.game.seq}`);
  // Every push the seats got from the watcher's first state on reached the watcher too, and nothing else did.
  const seatSeqs = a.seqs.filter((s) => s >= w.states[0].game.seq);
  const got = w.states.map((m) => m.game.seq);
  if (JSON.stringify(got) !== JSON.stringify(seatSeqs)) fail(`${w.name} missed or invented a state`, { got: got.length, seats: seatSeqs.length });
}
for (const w of [w1, w2]) if (!w.inbox.some((m) => m.type === "rolled" && Array.isArray(m.dice))) fail(`${w.name} never got a rolled message`);
console.log(`played to the win in ${actions} actions: ${w1.states.length} watcher states, every one before the end the opponent view, same seqs as the seats; the rolled messages reached the watchers`);

// --- 5. At the win: the full reveal, minus the seed and rng. Everything else equals the seats' own final state.
const finalW = w1.state();
const { seed, rng, ...seatFinal } = a.state;
if (seed === undefined || rng === undefined) fail("the seats' reveal carries the seed and rng");
if ("seed" in finalW.game || "rng" in finalW.game) fail("the seed or rng reached a watcher at the win");
if (JSON.stringify(finalW.game) !== JSON.stringify(seatFinal)) fail("the watcher's reveal differs from the seats' minus seed and rng");
for (const q of finalW.game.players) {
  if (RESOURCES.some((r) => typeof q.resources?.[r] !== "number")) fail(`${q.id}'s hand is not revealed to the watcher`, q.resources);
  if (DEV_KINDS.some((k) => typeof q.hidden?.[k] !== "number")) fail(`${q.id}'s hidden cards are not revealed to the watcher`, q.hidden);
}
if (!Array.isArray(finalW.game.deck) || finalW.game.deck.length !== finalW.game.deckLeft) fail("the deck is not revealed to the watcher", { deck: finalW.game.deck, deckLeft: finalW.game.deckLeft });
if (JSON.stringify(w2.state().game) !== JSON.stringify(finalW.game)) fail("the two watchers' reveals differ");
for (const w of [w1, w2]) for (const p of all) if (w.raws.some((t) => t.includes(p.secret))) fail(`${p.name}'s secret reached ${w.name}`);
console.log(`at the win: ${finalW.game.winner} wins; the watcher holds every hand and hidden card and the deck (${finalW.game.deck.length}), no seed or rng`);

// --- 6. Everything a watcher sends is refused with one error and changes nothing. The pre-seat bucket answers a burst
// of 5 and is then silent (1 token a second), so w1 sends nine in one tick and must get exactly five replies, and w2
// five for five. A seat's chat still reaches the watchers, and is the fence: it is sent after the nine and arrives on
// the same ordered socket, so a late reply would have come before it.
const seqAtWin = a.state.seq;
const aErrs = a.errors.length;
const aLogs = a.logs.length;
const errs1 = w1.errors.length;
const burst = [{ type: "hello", code, secret: a.secret }, { type: "roll" }, { type: "chat", text: "hello from the stands" }, { type: "tradeAnswer", tradeId: "t1", yes: true }, "not json"];
for (const m of [...burst, { type: "ready", value: true }, { type: "start" }, { type: "peek", code }, { type: "hello", code, watch: true }]) w1.send(m);
const errs2 = w2.errors.length;
const burst2 = [{ type: "place", kind: "outpost", id: "v:0,0,0" }, { type: "pass" }, { type: "buy" }, { type: "tradeAsk", give: { wool: 1 }, want: { ore: 1 } }, { type: "react", emote: "wave" }];
for (const m of burst2) w2.send(m);
await until(() => w1.errors.length >= errs1 + burst.length && w2.errors.length >= errs2 + burst2.length, () => `refusals: w1 ${JSON.stringify(w1.errors.slice(errs1))}, w2 ${JSON.stringify(w2.errors.slice(errs2))}`);
const chats0 = w1.chats.length;
a.t.say("gg");
await until(() => w1.chats.length > chats0 && w2.chats.length > 0, "a seat's chat reaching the watchers");
if (w1.chats[w1.chats.length - 1].text !== "gg") fail("the watcher hears the table", w1.chats[w1.chats.length - 1]);
for (const [w, n, from] of [[w1, burst.length, errs1], [w2, burst2.length, errs2]]) {
  const refused = w.errors.slice(from);
  if (refused.length !== n || refused.some((e) => e !== "Watching only.")) fail(`${w.name}: ${n} refusals with Watching only., then silence`, refused);
}
if (w1.inbox.some((m) => m.type === "seats" && m.seats.length !== 3)) fail("a peek from a watcher was answered", w1.inbox.filter((m) => m.type === "seats"));
if (all.some((p) => p.chats.some((l) => l.text === "hello from the stands"))) fail("a watcher's chat reached a seat");
if (w1.inbox.some((m) => m.type === "chat" && m.text === "hello from the stands")) fail("a watcher's chat was echoed");
if (all.some((p) => p.state.seq !== seqAtWin) || w1.state().game.seq !== seqAtWin || w2.state().game.seq !== seqAtWin) fail("the state moved on a watcher's message");
if (a.errors.length !== aErrs || a.seats.some((s) => s.away) || a.logs.slice(aLogs).some((t) => t === "Ember is back." || t === "Ember lost connection.")) fail("a watcher's hello {code, secret} touched the seat", { errors: a.errors.slice(aErrs), seats: a.seats });
console.log(`refusals: a seat's secret, roll, chat, tradeAnswer, junk, place, pass, buy, tradeAsk, react -> 10 x "Watching only."; ready, start, peek and a second watch past the burst -> silence; nothing moved; "gg" from a seat reached both watchers`);

// --- 7. A watcher leaving is counted down at once and logged at most once per window; the seats are untouched.
const logsAtLeave = a.logs.length;
await w1.close();
await until(() => all.every((p) => p.seatsSeen[p.seatsSeen.length - 1].watching === 1), "the count going down");
const leftLines = a.logs.slice(logsAtLeave).filter((t) => t === "A watcher left.").length;
if (leftLines > 1) fail("the leave line is coalesced", a.logs.slice(logsAtLeave));
if (a.logs.slice(logsAtLeave).some((t) => t !== "A watcher left.")) fail("a watcher leaving said more than its line", a.logs.slice(logsAtLeave));
if (a.seats.length !== 3 || a.seats.some((s) => s.away)) fail("a watcher leaving touched a seat", a.seats);
console.log(`leaving: watching 2 -> 1 at every seat, ${leftLines} "A watcher left." line(s) (coalesced), three seats still seated`);

// --- 8. Every seat closes after the win; after HOLD_MS the last is let go and the room drops under the remaining watcher.
for (const p of all) p.t.close();
await until(() => w2.closed, "the room closing under the watcher", HOLD * 3 + 3000);
if (w2.errors[w2.errors.length - 1] !== "The table closed.") fail("a dropped room tells its watcher", w2.errors.slice(-3));
console.log(`dropped room: every seat gone, after HOLD_MS=${HOLD} the watcher got "The table closed." and its socket closed`);

host.removeAllListeners("exit");
host.kill();
console.log("watch prove ok");
process.exit(0);
