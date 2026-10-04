// Bot seats and the ask-the-table trade (#363, #414), against host.mjs. Three hand-built rooms are saved to disk and the
// host restores them, so every hand is known:
//   A. A person asks with a bot seated: the bot declines an ask that does not help it and takes one that does, each
//      after the bot's delay, never at once. Its No counts, so the offer closes when the last person declines too.
//   B. A bot asks on its own turn; the other bot (which cannot pay) declines, and a person takes it.
//   C. A bot asks and nobody answers: no bot answers its own ask, the offer runs out, and the bot's turn plays on.
// Every wait is on a message; nothing sleeps a fixed time.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { chooseBotAction, chooseTradeAsk, shouldAcceptTrade } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { PLAYER_COLORS, RESOURCES } from "../src/lib/game/types.ts";

// host.mjs's default: a bot answers BOT_ANSWER_MS to twice that after the ask.
const BOT_ANSWER_MS = 1000;
const OFFER_MS = 20000;

let host;
function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  host?.kill();
  process.exit(1);
}

// A game past setup and into `main` for `current`, with these hands; the bank holds the rest of the 19 of each.
function game(humans, bots, current, hands, seed) {
  let g = createGame({ humans: humans.map((name) => ({ name })), bots, seed });
  while (g.phase !== "roll") {
    const next = applyAction(g, g.current, chooseBotAction(g, g.current));
    if (next.error) fail(`setup seed ${seed}`, next.error);
    g = next.state;
  }
  // Seat order p0, p1, p2 whatever the roll-off gave, so the seat after the bot p2 is always Ember's.
  g.players.sort((a, b) => a.id.localeCompare(b.id));
  g.phase = "main";
  g.current = current;
  g.dice = [3, 4];
  for (const p of g.players) p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0, ...hands[p.id] };
  for (const r of RESOURCES) g.bank[r] = 19 - g.players.reduce((n, p) => n + p.resources[r], 0);
  return g;
}

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
// Rooms carry a seat per person only; a bot player needs no seat.
function saveRoom(code, g) {
  const seats = g.players
    .filter((p) => p.kind === "human")
    .map((p, i) => ({ id: `s${i}`, name: p.name, color: PLAYER_COLORS[i], ready: true, pid: p.id, secret: `${code}-${p.id}-secret` }));
  writeFileSync(path.join(ROOMS_DIR, `${code}.json`), JSON.stringify({ code, host: "s0", next: seats.length, chat: [], chatSeq: 0, game: g, seats, shape: 2, savedAt: Date.now() }));
  return seats;
}

// A: Ember (p0) asks; Tide (p1) is a person; the bot p2 saves for a stronghold (3 grain, 2 ore) and lacks one grain.
const gA = game(["Ember", "Tide"], 1, "p0", { p0: { ore: 1, timber: 1, grain: 1 }, p1: { clay: 1 }, p2: { grain: 2, ore: 2, wool: 2 } }, 11);
const helps = { from: "p0", give: { grain: 1 }, want: { wool: 1 } };
const useless = { from: "p0", give: { timber: 1 }, want: { wool: 1 } };
if (!shouldAcceptTrade(gA, "p2", helps) || shouldAcceptTrade(gA, "p2", useless)) fail("room A hands do not give a helpful and a useless ask");
// B: the bot p2 has the turn and lacks one grain; the bot p1 holds no grain, so it cannot pay and says No.
const gB = game(["Ember"], 2, "p2", { p0: { grain: 1, clay: 1 }, p1: { timber: 1, clay: 1 }, p2: { grain: 2, ore: 2, wool: 2 } }, 12);
const askB = chooseTradeAsk(gB, "p2");
if (!askB || shouldAcceptTrade(gB, "p1", { from: "p2", ...askB })) fail("room B: the bot does not ask, or the other bot would take it", askB);
// C: the same bot ask with only people to answer it, who stay silent.
const gC = game(["Ember", "Tide"], 1, "p2", { p0: { grain: 1 }, p1: { clay: 1 }, p2: { grain: 2, ore: 2, wool: 2 } }, 13);
if (!chooseTradeAsk(gC, "p2")) fail("room C: the bot does not ask");
const seatsA = saveRoom("BTAA", gA);
const seatsB = saveRoom("BTBB", gB);
const seatsC = saveRoom("BTCC", gC);

host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0", ACT_RATE: "1000", ACT_CAP: "1000", ROOMS_DIR },
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

// One person rejoining a restored seat. `next(type)` takes the first message of that type, waiting up to `ms`.
function rejoin(code, seat) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { name: `${code} ${seat.name}`, pid: seat.pid, ws, inbox: [], seen: [], waiters: [], state: null };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    msg.at = Date.now();
    if (msg.type === "state") c.state = msg;
    c.inbox.push(msg);
    c.seen.push(msg);
    for (const w of c.waiters.splice(0)) w();
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.next = async (type, ms = 5000) => {
    const until = Date.now() + ms;
    for (;;) {
      const i = c.inbox.findIndex((m) => m.type === type);
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      if (Date.now() > until) fail(`${c.name} waited ${ms} ms for ${type}`, c.seen.map((m) => (m.type === "log" ? m.text : m.type)));
      await new Promise((res) => {
        c.waiters.push(res);
        setTimeout(res, until - Date.now() + 1);
      });
    }
  };
  // The first message of that type that `pred` holds for; earlier ones of that type are dropped.
  c.until = async (type, pred, ms) => {
    for (;;) {
      const m = await c.next(type, ms);
      if (pred(m)) return m;
    }
  };
  ws.on("open", () => c.send({ type: "hello", code, secret: seat.secret }));
  return c;
}
const hand = (c) => c.state.game.players.find((p) => p.id === c.pid).resources;
// A bot answer must come after its delay, never at once, and well inside the offer.
function delayed(offer, msg, what) {
  const ms = msg.at - offer.at;
  if (ms < BOT_ANSWER_MS - 50 || ms > 2 * BOT_ANSWER_MS + 500) fail(`${what} came ${ms} ms after the ask, not ${BOT_ANSWER_MS}-${2 * BOT_ANSWER_MS} ms`);
  return ms;
}

// C runs alongside A and B, since its offer has to run out.
const C = rejoin("BTCC", seatsC.find((s) => s.pid === "p0"));
const roomC = (async () => {
  const offer = await C.next("tradeOffer");
  if (offer.from !== "p2") fail("C: the ask is not the bot's", offer);
  const closed = await C.next("tradeClosed", OFFER_MS + 5000);
  if (closed.tradeId !== offer.tradeId || closed.taker) fail("C: the bot's offer closed with a taker", closed);
  const ms = closed.at - offer.at;
  if (ms < OFFER_MS - 100) fail(`C: the offer closed after ${ms} ms, before it ran out`);
  const answers = C.seen.filter((m) => m.type === "tradeDeclined");
  if (answers.length) fail("C: a bot answered its own ask", answers);
  // The bot's turn plays on to the next person's roll: the table never stalls behind the ask.
  await C.until("state", (m) => m.game.current === "p0" && m.game.phase === "roll");
  return ms;
})();

// A. A person asks the table with a bot seated.
const [EA, TA] = ["p0", "p1"].map((pid) => rejoin("BTAA", seatsA.find((s) => s.pid === pid)));
await Promise.all([EA, TA].map((c) => c.until("seats", (m) => m.seats.every((s) => !s.away))));
const ask = async (give, want) => {
  EA.send({ type: "tradeAsk", give, want });
  const [o] = await Promise.all([EA, TA].map((c) => c.next("tradeOffer")));
  return o;
};
let offer = await ask(useless.give, useless.want);
const no = await EA.next("tradeDeclined");
await TA.next("tradeDeclined");
if (no.tradeId !== offer.tradeId || no.by !== "p2") fail("A: the useless ask was not declined by the bot", no);
const noMs = delayed(offer, no, "A: the bot's No");
if (EA.inbox.some((m) => m.type === "tradeClosed")) fail("A: the offer closed while Tide could still answer");
TA.send({ type: "tradeAnswer", tradeId: offer.tradeId, yes: false });
for (const c of [EA, TA]) {
  const closed = await c.next("tradeClosed");
  if (closed.tradeId !== offer.tradeId || closed.taker) fail(`${c.name}: tradeClosed after every seat said No`, closed);
}
console.log(`A: bot declined ${JSON.stringify(useless.give)} for ${JSON.stringify(useless.want)} after ${noMs} ms; Tide's No then closed it`);

const before = { ...hand(EA) };
const yesSeq = EA.state.game.seq;
offer = await ask(helps.give, helps.want);
const yes = await EA.next("tradeClosed");
await TA.next("tradeClosed");
if (yes.tradeId !== offer.tradeId || yes.taker !== "p2") fail("A: the helpful ask was not taken by the bot", yes);
const yesMs = delayed(offer, yes, "A: the bot's Yes");
await EA.until("state", (m) => m.game.seq > yesSeq);
const after = hand(EA);
if (after.grain !== before.grain - 1 || after.wool !== before.wool + 1) fail("A: Ember's hand after the bot took the trade", [before, after]);
console.log(`A: bot took ${JSON.stringify(helps.give)} for ${JSON.stringify(helps.want)} after ${yesMs} ms; Ember's hand moved`);

// B. A bot asks on its turn; the other bot says No, and a person takes it.
const EB = rejoin("BTBB", seatsB.find((s) => s.pid === "p0"));
offer = await EB.next("tradeOffer");
if (offer.from !== "p2" || JSON.stringify(offer.give) !== JSON.stringify(askB.give) || JSON.stringify(offer.want) !== JSON.stringify(askB.want)) {
  fail("B: the bot's ask", offer);
}
const otherNo = await EB.next("tradeDeclined");
if (otherNo.tradeId !== offer.tradeId || otherNo.by !== "p1") fail("B: the other bot's answer", otherNo);
delayed(offer, otherNo, "B: the other bot's No");
await EB.next("state");
const bBefore = { ...hand(EB) };
const bSeq = EB.state.game.seq;
EB.send({ type: "tradeAnswer", tradeId: offer.tradeId, yes: true });
const took = await EB.next("tradeClosed");
if (took.tradeId !== offer.tradeId || took.taker !== "p0") fail("B: Ember did not take the bot's ask", took);
// The bot's turn plays on from the trade, and the one state after it is Ember's roll.
const s = (await EB.until("state", (m) => m.game.seq > bSeq)).game;
if (s.current !== "p0" || s.phase !== "roll") fail("B: the bot's turn did not play on after the trade", { current: s.current, phase: s.phase });
const bAfter = hand(EB);
const [give] = Object.keys(askB.give);
const [want] = Object.keys(askB.want);
if (bAfter[give] !== bBefore[give] + 1 || bAfter[want] !== bBefore[want] - 1) fail("B: Ember's hand after taking the bot's ask", [bBefore, bAfter]);
if (EB.seen.some((m) => m.type === "tradeDeclined" && m.by === "p2")) fail("B: the asking bot answered its own ask");
// One ask per bot turn: the bot played the rest of its turn without asking again.
if (EB.seen.filter((m) => m.type === "tradeOffer").length !== 1) fail("B: the bot asked more than once in its turn");
console.log(`B: bot asked ${JSON.stringify(askB.give)} for ${JSON.stringify(askB.want)}; the other bot said No; Ember took it; the bot's turn played on`);

const cMs = await roomC;
console.log(`C: nobody answered the bot's ask; no bot answered it; it closed after ${cMs} ms and the bot's turn played on`);

host.kill();
console.log("bot trade prove ok");
process.exit(0);
