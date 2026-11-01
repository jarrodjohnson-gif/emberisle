// #1245 (owner q-trade-hold B): a person's table offer holds until it is answered. Against the real host:
//   A. Ember asks; the offer comes with no run-out (seconds null) and is still open after 60 s. Tide's Yes then ends it
//      and moves the goods.
//   B. Ember asks; the bot and Tide both say No, and the offer ends at once with no taker.
//   C. Ember asks; Tide cannot cancel it (not the asker), Ember's Cancel ends it with no taker for every seat, and a
//      late answer is refused.
//   D. Ember asks, drops and comes back: the rejoin re-sends her own held offer (seconds null), and her Cancel then ends
//      it for both seats.
// A bot's offer keeps its 20 s run-out: that is bot-trade-prove C and practice-trade-prove D.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { PLAYER_COLORS, RESOURCES } from "../src/lib/game/types.ts";

const HOLD_MS = 60_000;

let host;
function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  host?.kill("SIGKILL");
  process.exit(1);
}

// A game past setup and into `main` for Ember (p0), with these hands; the bank holds the rest of the 19 of each.
function game(hands, seed) {
  let g = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }], bots: 1, seed });
  while (g.phase !== "roll") {
    const next = applyAction(g, g.current, chooseBotAction(g, g.current));
    if (next.error) fail(`setup seed ${seed}`, next.error);
    g = next.state;
  }
  g.players.sort((a, b) => a.id.localeCompare(b.id));
  g.phase = "main";
  g.current = "p0";
  g.dice = [3, 4];
  for (const h of g.hexes) h.pip = null;
  for (const v of g.vertices) v.harbor = null;
  g.deck = [];
  for (const p of g.players) {
    p.hidden = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
    p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0, ...hands[p.id] };
  }
  for (const r of RESOURCES) g.bank[r] = 19 - g.players.reduce((n, p) => n + p.resources[r], 0);
  return g;
}

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
function saveRoom(code, g) {
  const seats = g.players
    .filter((p) => p.kind === "human")
    .map((p, i) => ({ id: `s${i}`, name: p.name, color: PLAYER_COLORS[i], ready: true, pid: p.id, secret: `${code}-${p.id}-secret` }));
  writeFileSync(path.join(ROOMS_DIR, `${code}.json`), JSON.stringify({ code, host: "s0", next: seats.length, chat: [], chatSeq: 0, game: g, seats, botDeclined: {}, shape: 2, savedAt: Date.now() }));
  return seats;
}

// Tide (p1) holds the wool Ember wants; the bot (p2) holds nothing, so it can never pay and always says No.
const hands = { p0: { timber: 1 }, p1: { wool: 1 }, p2: {} };
const ask = { give: { timber: 1 }, want: { wool: 1 } };
const seatsA = saveRoom("THAA", game(hands, 21));
const seatsB = saveRoom("THBB", game(hands, 22));
const seatsC = saveRoom("THCC", game(hands, 23));
const seatsD = saveRoom("THDD", game(hands, 24));

host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0", ACT_RATE: "1000", ACT_CAP: "1000", SAVE_MS: "5", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results` },
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
      if (Date.now() > until) fail(`${c.name} waited ${ms} ms for ${type}`, c.seen.map((m) => (m.type === "error" ? `error: ${m.message}` : m.type)));
      await new Promise((res) => {
        c.waiters.push(res);
        setTimeout(res, until - Date.now() + 1);
      });
    }
  };
  c.until = async (type, pred, ms) => {
    for (;;) {
      const m = await c.next(type, ms);
      if (pred(m)) return m;
    }
  };
  ws.on("open", () => c.send({ type: "hello", code, secret: seat.secret }));
  return c;
}
async function seated(cs) {
  await Promise.all(cs.map((c) => c.until("seats", (m) => m.seats.every((s) => !s.away))));
  await Promise.all(cs.map(async (c) => {
    while (!c.state) await new Promise((res) => { c.waiters.push(res); setTimeout(res, 50); });
  }));
}
const hand = (c) => c.state.game.players.find((p) => p.id === c.pid).resources;
const table = (code, seats) => seats.map((s) => rejoin(code, s));
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const roomA = (async () => {
  const [E, T] = table("THAA", seatsA);
  await seated([E, T]);
  E.send({ type: "tradeAsk", ...ask });
  const offers = await Promise.all([E, T].map((c) => c.next("tradeOffer")));
  for (const o of offers) if (o.seconds !== null) fail(`A: a person's offer came with seconds ${o.seconds}, not null`, o);
  const botNo = await E.until("tradeDeclined", (m) => m.by === "p2");
  if (botNo.tradeId !== offers[0].tradeId) fail("A: the bot's No was for another offer", botNo);
  await sleep(HOLD_MS);
  if ([E, T].some((c) => c.seen.some((m) => m.type === "tradeClosed"))) fail(`A: the offer closed within ${HOLD_MS} ms`, E.seen.map((m) => m.type));
  const before = { ember: { ...hand(E) }, tide: { ...hand(T) } };
  const seq = T.state.game.seq;
  T.send({ type: "tradeAnswer", tradeId: offers[0].tradeId, yes: true });
  for (const c of [E, T]) {
    const closed = await c.next("tradeClosed");
    if (closed.tradeId !== offers[0].tradeId || closed.taker !== "p1") fail(`A: ${c.name}'s tradeClosed after Tide's Yes`, closed);
  }
  await Promise.all([E, T].map((c) => c.until("state", (m) => m.game.seq > seq)));
  if (hand(E).wool !== before.ember.wool + 1 || hand(E).timber !== before.ember.timber - 1) fail("A: Ember's hand after the trade", [before.ember, hand(E)]);
  if (hand(T).timber !== before.tide.timber + 1 || hand(T).wool !== before.tide.wool - 1) fail("A: Tide's hand after the trade", [before.tide, hand(T)]);
  const held = Math.round((T.seen.find((m) => m.type === "tradeClosed").at - offers[1].at) / 1000);
  console.log(`A ok: Ember's offer came with seconds null, was still open after ${HOLD_MS / 1000} s (bot's No in between), and Tide's Yes at ${held} s took it`);
  E.ws.close();
  T.ws.close();
})();

const roomB = (async () => {
  const [E, T] = table("THBB", seatsB);
  await seated([E, T]);
  E.send({ type: "tradeAsk", ...ask });
  const [offer] = await Promise.all([E, T].map((c) => c.next("tradeOffer")));
  await E.until("tradeDeclined", (m) => m.by === "p2");
  T.send({ type: "tradeAnswer", tradeId: offer.tradeId, yes: false });
  for (const c of [E, T]) {
    const closed = await c.next("tradeClosed");
    if (closed.tradeId !== offer.tradeId || closed.taker) fail(`B: ${c.name}'s tradeClosed after every No`, closed);
  }
  const ms = E.seen.find((m) => m.type === "tradeClosed").at - E.seen.find((m) => m.type === "tradeDeclined" && m.by === "p1").at;
  if (ms > 500) fail(`B: the offer closed ${ms} ms after the last No, not at once`);
  console.log(`B ok: the bot's and Tide's No end the offer with no taker, ${ms} ms after the last No`);
  E.ws.close();
  T.ws.close();
})();

const roomC = (async () => {
  const [E, T] = table("THCC", seatsC);
  await seated([E, T]);
  E.send({ type: "tradeAsk", ...ask });
  const [offer] = await Promise.all([E, T].map((c) => c.next("tradeOffer")));
  T.send({ type: "tradeCancel", tradeId: offer.tradeId });
  const refused = await T.next("error");
  if (refused.message !== "Offer is gone.") fail("C: Tide's cancel of Ember's offer was not refused", refused);
  if (E.seen.some((m) => m.type === "tradeClosed")) fail("C: Tide's cancel closed Ember's offer");
  const before = { ember: { ...hand(E) }, tide: { ...hand(T) } };
  E.send({ type: "tradeCancel", tradeId: offer.tradeId });
  for (const c of [E, T]) {
    const closed = await c.next("tradeClosed");
    if (closed.tradeId !== offer.tradeId || closed.taker) fail(`C: ${c.name}'s tradeClosed after Ember's Cancel`, closed);
  }
  T.send({ type: "tradeAnswer", tradeId: offer.tradeId, yes: true });
  const late = await T.next("error");
  if (late.message !== "Offer is gone.") fail("C: a Yes after the Cancel was not refused", late);
  if (JSON.stringify(hand(E)) !== JSON.stringify(before.ember) || JSON.stringify(hand(T)) !== JSON.stringify(before.tide)) fail("C: goods moved on a cancelled offer");
  console.log("C ok: only the asker can cancel; Ember's Cancel ends the offer for both with no taker, and a late Yes is refused");
  E.ws.close();
  T.ws.close();
})();

const roomD = (async () => {
  const [E, T] = table("THDD", seatsD);
  await seated([E, T]);
  E.send({ type: "tradeAsk", ...ask });
  const [offer] = await Promise.all([E, T].map((c) => c.next("tradeOffer")));
  E.ws.close();
  await T.until("seats", (m) => m.seats.some((s) => s.away));
  const E2 = rejoin("THDD", seatsD[0]);
  await E2.next("state");
  const again = await E2.next("tradeOffer");
  if (again.tradeId !== offer.tradeId || again.from !== "p0" || again.seconds !== null) fail("D: the rejoined asker did not get her own held offer back", again);
  if (T.seen.some((m) => m.type === "tradeClosed")) fail("D: the asker's drop closed her offer");
  E2.send({ type: "tradeCancel", tradeId: offer.tradeId });
  for (const c of [E2, T]) {
    const closed = await c.next("tradeClosed");
    if (closed.tradeId !== offer.tradeId || closed.taker) fail(`D: ${c.name}'s tradeClosed after the rejoined asker's Cancel`, closed);
  }
  console.log("D ok: a rejoined asker gets her held offer back (seconds null), and her Cancel ends it for both seats");
  E2.ws.close();
  T.ws.close();
})();

await Promise.all([roomA, roomB, roomC, roomD]);
host.kill("SIGKILL");
console.log("trade hold prove ok");
process.exit(0);
