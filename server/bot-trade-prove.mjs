// Bot seats and the ask-the-table trade (#363, #414), against host.mjs. Three hand-built rooms are saved to disk and the
// host restores them, so every hand is known:
//   A. A person asks with a bot seated: the bot declines an ask that does not help it and takes one that does, each
//      after the bot's delay, never at once. Its No counts, so the offer closes when the last person declines too.
//   B. A bot asks on its own turn; the other bot (which cannot pay) declines, and a person takes it.
//   C. A bot asks and nobody answers: no bot answers its own ask, the offer runs out, and the bot's turn plays on.
//   D. An offer open when its asker wins (by a build that does not spend the offered goods) is gone at the win, and
//      after the rematch (#405) a late Yes to it moves nothing.
//   E. A bot's fully declined proposal stays suppressed on its next turn.
// Every wait is on a message; nothing sleeps a fixed time.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
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
  host?.kill("SIGKILL");
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
function quiet(g) {
  for (const h of g.hexes) h.pip = null;
  for (const v of g.vertices) v.harbor = null;
  g.deck = [];
  for (const p of g.players) p.hidden = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
  return g;
}

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
// Rooms carry a seat per person only; a bot player needs no seat.
function saveRoom(code, g, botDeclined = {}) {
  const seats = g.players
    .filter((p) => p.kind === "human")
    .map((p, i) => ({ id: `s${i}`, name: p.name, color: PLAYER_COLORS[i], ready: true, pid: p.id, secret: `${code}-${p.id}-secret` }));
  writeFileSync(path.join(ROOMS_DIR, `${code}.json`), JSON.stringify({ code, host: "s0", next: seats.length, chat: [], chatSeq: 0, game: g, seats, botDeclined, shape: 2, savedAt: Date.now() }));
  return seats;
}
function waitForSavedRoom(code, ready) {
  const file = path.join(ROOMS_DIR, `${code}.json`);
  return new Promise((resolve, reject) => {
    let watcher;
    const timer = setTimeout(() => finish(new Error(`room ${code} was not saved`)), 5000);
    const finish = (error, saved) => {
      clearTimeout(timer);
      watcher?.close();
      if (error) reject(error);
      else resolve(saved);
    };
    const check = () => {
      try {
        const saved = JSON.parse(readFileSync(file, "utf8"));
        if (ready(saved)) finish(null, saved);
      } catch {}
    };
    watcher = watch(ROOMS_DIR, { persistent: false }, (_event, name) => {
      if (String(name) === `${code}.json`) check();
    });
    check();
  });
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
const gC = quiet(game(["Ember", "Tide"], 1, "p2", { p0: {}, p1: {}, p2: { grain: 2, ore: 2, wool: 2 } }, 13));
const askC = chooseTradeAsk(gC, "p2");
if (!askC) fail("room C: the bot does not ask");
// D: three people; Ember holds 2 outposts and 7 hidden points, and the goods for a stronghold besides the offered wool.
const gD = game(["Ember", "Tide", "Pine"], 0, "p0", { p0: { grain: 3, ore: 2, wool: 1 }, p1: { timber: 1 }, p2: { clay: 1 } }, 14);
gD.players[0].hidden.vp = 7;
const gE = quiet(game(["Ember", "Tide"], 1, "p2", { p0: {}, p1: {}, p2: { grain: 2, ore: 2, wool: 2 } }, 15));
const askE = chooseTradeAsk(gE, "p2");
if (!askE) fail("E: the bot has no first ask");
const gF = quiet(game(["Ember", "Tide"], 1, "p2", { p0: {}, p1: {}, p2: { grain: 2, ore: 2, wool: 3 } }, 16));
const askF = chooseTradeAsk(gF, "p2");
if (JSON.stringify(askF) !== JSON.stringify(askE)) fail("F: changed hand changed the ask", askF);
const gG = quiet(game(["Ember", "Tide"], 1, "p2", { p0: {}, p1: {}, p2: { grain: 3, ore: 1, wool: 3 } }, 17));
const askG = chooseTradeAsk(gG, "p2");
if (!askG || JSON.stringify(askG) === JSON.stringify(askE)) fail("G: no changed useful ask", askG);
const seatsA = saveRoom("BTAA", gA);
const seatsB = saveRoom("BTBB", gB);
const seatsC = saveRoom("BTCC", gC);
const seatsD = saveRoom("BTDD", gD);
const seatsE = saveRoom("BTEE", gE);
const seatsF = saveRoom("BTFF", gF, { p2: askE });
const seatsG = saveRoom("BTGG", gG, { p2: askE });

host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0", ACT_RATE: "1000", ACT_CAP: "1000", SAVE_MS: "5", ROOMS_DIR },
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
  c.send = (msg) => ws.send(JSON.stringify({ ...c.state?.actionStamp, cid: crypto.randomUUID(), ...msg }));
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
const CT = rejoin("BTCC", seatsC.find((s) => s.pid === "p1"));
const roomC = (async () => {
  await Promise.all([C, CT].map((c) => c.until("seats", (m) => m.seats.every((s) => !s.away))));
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

// D. The asker wins with the offer open, then the host starts a rematch.
const D = ["p0", "p1", "p2"].map((pid) => rejoin("BTDD", seatsD.find((s) => s.pid === pid)));
const [ED, TD] = D;
await Promise.all(D.map((c) => c.until("seats", (m) => m.seats.every((s) => !s.away))));
await ED.until("state", (m) => m.legal.stronghold.length > 0);
ED.send({ type: "tradeAsk", give: { wool: 1 }, want: { timber: 1 } });
offer = (await Promise.all(D.map((c) => c.next("tradeOffer"))))[0];
ED.send({ type: "place", kind: "stronghold", id: ED.state.legal.stronghold[0] });
for (const c of D) {
  const closed = await c.next("tradeClosed");
  if (closed.tradeId !== offer.tradeId || closed.taker) fail(`D: ${c.name} tradeClosed at the win`, closed);
  await c.until("state", (m) => m.game.phase === "over");
}
ED.send({ type: "again" });
await Promise.all(D.map((c) => c.until("state", (m) => m.game.phase !== "over")));
const dSeq = TD.state.game.seq;
TD.send({ type: "tradeAnswer", tradeId: offer.tradeId, yes: true });
const gone = await TD.next("error");
if (gone.message !== "Offer is gone.") fail("D: a late Yes after the rematch", gone.message);
if (TD.state.game.seq !== dSeq || D.some((c) => c.inbox.some((m) => m.type === "tradeClosed" && m.taker))) fail("D: a late Yes after the rematch moved the table");
console.log("D: the offer open at Ember's win closed at every seat; after the rematch a late Yes got:", gone.message);

// E. A person declines the bot's ask. Once the bot reaches another turn, the same ask remains closed.
const E = rejoin("BTEE", seatsE.find((s) => s.pid === "p0"));
const ET = rejoin("BTEE", seatsE.find((s) => s.pid === "p1"));
await Promise.all([E, ET].map((c) => c.until("seats", (m) => m.seats.every((s) => !s.away))));
offer = await E.next("tradeOffer");
if (offer.from !== "p2" || JSON.stringify({ give: offer.give, want: offer.want }) !== JSON.stringify(askE)) fail("E: the first bot ask", offer);
await Promise.all([E, ET].map((c) => c.until("state", (m) => m.game.current === "p2" && m.game.phase === "main")));
E.send({ type: "tradeAnswer", tradeId: offer.tradeId, yes: false });
ET.send({ type: "tradeAnswer", tradeId: offer.tradeId, yes: false });
const declines = await Promise.all([E, ET].map((c) => c.until("tradeDeclined", (m) => m.by === c.pid)));
if (declines.some((m) => !["p0", "p1"].includes(m.by))) fail("E: the humans' declines", declines);
await E.until("tradeClosed", (m) => m.tradeId === offer.tradeId);
const eTurn = E.state.game.turn;
await rollAndPass(E);
await rollAndPass(ET);
await E.until("state", (m) => m.game.turn > eTurn && m.game.current === "p0" && m.game.phase === "roll");
const savedE = await waitForSavedRoom("BTEE", (saved) => saved.game?.turn > eTurn && JSON.stringify(saved.botDeclined?.p2) === JSON.stringify(askE));
const savedBotHand = savedE.game.players.find((p) => p.id === "p2").resources;
if (JSON.stringify(savedBotHand) !== JSON.stringify(gE.players.find((p) => p.id === "p2").resources)) fail("E: the quiet bot hand changed before the next ask", { savedBotHand, original: gE.players.find((p) => p.id === "p2").resources, phase: savedE.game.phase, log: savedE.game.log.slice(-8), deck: savedE.game.deck.length });
const repeatE = structuredClone(savedE.game);
repeatE.current = "p2";
repeatE.phase = "main";
repeatE.turn++;
const secondAsk = chooseTradeAsk(repeatE, "p2");
if (JSON.stringify(secondAsk) !== JSON.stringify(askE)) fail("E: the bot's unfiltered second-turn proposal changed", secondAsk);
if (E.seen.filter((m) => m.type === "tradeOffer" && m.from === "p2").length !== 1) fail("E: the declined offer reopened on the bot's next turn", E.seen.filter((m) => m.type === "tradeOffer"));
console.log("E: the person declined the bot's offer; its unchanged proposal stayed suppressed on its next turn");

// F: a fixture with the same stored decline and one more spare wool stays closed through the real host path.
const F = rejoin("BTFF", seatsF.find((s) => s.pid === "p0"));
const FT = rejoin("BTFF", seatsF.find((s) => s.pid === "p1"));
await Promise.all([F, FT].map((c) => c.until("seats", (m) => m.seats.every((s) => !s.away))));
await F.until("state", (m) => m.game.current === "p0" && m.game.phase === "roll");
if (F.seen.some((m) => m.type === "tradeOffer" && m.from === "p2")) fail("F: same ask reopened after a hand-only change", F.seen.filter((m) => m.type === "tradeOffer"));
console.log("F: the host kept the same ask closed after the bot gained wool");

// G: the stored decline blocks the old proposal but lets a different useful proposal open.
const G = rejoin("BTGG", seatsG.find((s) => s.pid === "p0"));
const GT = rejoin("BTGG", seatsG.find((s) => s.pid === "p1"));
await Promise.all([G, GT].map((c) => c.until("seats", (m) => m.seats.every((s) => !s.away))));
const offerG = await G.next("tradeOffer");
if (offerG.from !== "p2" || JSON.stringify({ give: offerG.give, want: offerG.want }) !== JSON.stringify(askG)) fail("G: changed useful proposal did not open", offerG);
console.log("G: a different useful proposal opened through the host");

const cMs = await roomC;
console.log(`C: nobody answered the bot's ask; no bot answered it; it closed after ${cMs} ms and the bot's turn played on`);
async function rollAndPass(c) {
  const pid = c.pid;
  if (c.state?.game.current !== pid || c.state.game.phase !== "roll") {
    await c.until("state", (m) => m.game.current === pid && m.game.phase === "roll");
  }
  const seq = c.state.game.seq;
  c.send({ type: "roll" });
  let state = await c.until("state", (m) => m.game.current === pid && m.game.seq > seq);
  if (state.game.phase === "robber") {
    const hexId = state.legal.wayfarer.find((h) => (state.legal.steal[h]?.length ?? 0) === 0) ?? state.legal.wayfarer[0];
    c.send({ type: "rob", hexId, stealFrom: state.legal.steal[hexId]?.[0] ?? null });
    const robSeq = state.game.seq;
    state = await c.until("state", (m) => m.game.current === pid && m.game.seq > robSeq);
  }
  if (state.game.phase !== "main") fail(`${c.name}: the turn did not reach main`, state.game.phase);
  c.send({ type: "pass" });
}
await rollAndPass(C);
await rollAndPass(CT);
const savedC = await waitForSavedRoom("BTCC", (saved) => saved.game?.turn > gC.turn && saved.game.current === "p2" && saved.game.phase === "main");
const retryC = structuredClone(savedC.game);
const rawRetry = chooseTradeAsk(retryC, "p2");
if (JSON.stringify(rawRetry) !== JSON.stringify(askC)) fail("C boundary: the raw offer changed before the retry", { rawRetry, askC, hand: savedC.game.players.find((p) => p.id === "p2").resources, declined: savedC.botDeclined });
const retry = await C.next("tradeOffer");
if (retry.from !== "p2" || JSON.stringify({ give: retry.give, want: retry.want }) !== JSON.stringify(askC)) fail("C boundary: the expired offer was remembered or changed", retry);
console.log("C boundary: a 20-second expiry does not suppress the same proposal on a later turn");

host.kill("SIGKILL");
console.log("bot trade prove ok");
process.exit(0);
