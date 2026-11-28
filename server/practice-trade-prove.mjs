// Bots and the ask-the-table trade in practice (#363, #445), against the browser's own store (store.ts), as host.mjs
// does online (bot-trade-prove.mjs). The clock is faked, so every delay is ticked, never slept:
//   A. The person asks: bots it does not help say No, never before 1 s; when all three have, it closes at once.
//   B. The person asks for what one bot needs: that bot takes it within 2 s and the goods move.
//   C. A bot asks on its own turn and its turn waits; the other bots say No, the person's Yes moves the goods, and the
//      bot plays on without asking again.
//   D. A bot asks and the person stays silent: it closes at 20 s and the bot plays on.
//   E. The person's offer closes when their turn ends, and its bots' answers never land.
//   F. Leaving for the Title, or starting a new practice game, drops an open offer, and its bots' answers never land.
//   H. A bot asks and another bot wants it: with the person silent, that bot's Yes waits until 8 s (#850).
//   I. The same ask, and the person's Yes at 5 s takes it before the bot that wanted it (#850).
//   J. The same ask, and the person's No at 3 s lets the waiting bot take it at once (#850).
//   K. The person cancels their own ask before any bot answers: it ends with no taker, and no bot answer lands (#1245).
import { mock } from "node:test";
import assert from "node:assert/strict";
import { chooseBotAction, chooseTradeAsk, shouldAcceptTrade } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";

mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1_000_000 });
const { useGame } = await import("../src/lib/game/store.ts");

function fail(why, extra) {
  console.log("FAIL", why, extra === undefined ? "" : JSON.stringify(extra));
  process.exit(1);
}

// A practice game past setup and into `main` for `current`, with these hands; the bank holds the rest of the 19 of each.
function game(current, hands, seed) {
  let g = createGame({ humans: [{ name: "Ember" }], bots: 3, seed });
  while (g.phase !== "roll") {
    const next = applyAction(g, g.current, chooseBotAction(g, g.current));
    if (next.error) fail(`setup seed ${seed}`, next.error);
    g = next.state;
  }
  g.players.sort((a, b) => a.id.localeCompare(b.id));
  g.phase = "main";
  g.current = current;
  g.dice = [3, 4];
  for (const p of g.players) p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0, ...hands[p.id] };
  for (const r of RESOURCES) g.bank[r] = 19 - g.players.reduce((n, p) => n + p.resources[r], 0);
  return g;
}

// A practice table holding `g`, the way startAi leaves one.
function practice(g) {
  useGame.getState().goTitle();
  useGame.getState().startAi();
  useGame.setState({ state: g, gameLog: [] });
}

const s = () => useGame.getState();
const hand = (pid) => s().state.players.find((p) => p.id === pid).resources;
const logHas = (text) => s().gameLog.some((l) => l.text === text);
const names = (ids) => ids.map((id) => s().state.players.find((p) => p.id === id).name);
function rebalance(g) {
  for (const r of RESOURCES) g.bank[r] = 19 - g.players.reduce((n, p) => n + p.resources[r], 0);
}

// The bot p2 saves for a stronghold (3 grain, 2 ore) and lacks one grain; p1 and p3 hold no wool and no grain.
const HANDS = { p0: { ore: 1, timber: 1, grain: 1 }, p1: { clay: 1 }, p2: { grain: 2, ore: 2, wool: 2 }, p3: { timber: 1 } };
const gA = game("p0", HANDS, 11);
const helps = { give: { grain: 1 }, want: { wool: 1 } };
const useless = { give: { timber: 1 }, want: { wool: 1 } };
if (!shouldAcceptTrade(gA, "p2", { from: "p0", ...helps })) fail("hands: p2 would not take the helpful ask");
for (const b of ["p1", "p2", "p3"]) if (shouldAcceptTrade(gA, b, { from: "p0", ...useless })) fail(`hands: ${b} would take the useless ask`);
for (const b of ["p1", "p3"]) if (shouldAcceptTrade(gA, b, { from: "p0", ...helps })) fail(`hands: ${b} would take the helpful ask`);

// A: the useless ask. Nobody answers before BOT_ANSWER_MS; all three No by twice that, and the offer closes then.
practice(structuredClone(gA));
s().askTable(useless.give, useless.want);
if (!s().offer || s().offer.from !== "p0") fail("A: the person's ask opened no offer", s().error);
mock.timers.tick(999);
if (!s().offer || s().declined.length) fail("A: a bot answered before 1 s", s().declined);
mock.timers.tick(1001);
if (s().offer) fail("A: every bot said No by 2 s but the offer is still open", s().declined);
if (s().tradeOutcome !== "Nobody took it.") fail("A: the asker's outcome", s().tradeOutcome);
for (const n of names(["p1", "p2", "p3"])) {
  if (!logHas(`${n} declines.`)) fail(`A: no "${n} declines." in the log`, s().gameLog);
}
if (JSON.stringify(hand("p0")) !== JSON.stringify(gA.players[0].resources)) fail("A: goods moved on a declined ask");
console.log("A ok: a useless ask gets three bot Nos between 1 and 2 s and closes at once");

// B: the helpful ask. p2 takes it: Ember's grain for p2's wool.
practice(structuredClone(gA));
s().askTable(helps.give, helps.want);
mock.timers.tick(999);
if (hand("p2").wool !== 2) fail("B: a bot took the ask before 1 s");
mock.timers.tick(1001);
if (s().offer) fail("B: the offer is still open after p2's Yes");
if (hand("p0").grain !== 0 || hand("p0").wool !== 1 || hand("p2").grain !== 3 || hand("p2").wool !== 1) fail("B: the goods did not move", [hand("p0"), hand("p2")]);
const p2 = names(["p2"])[0];
if (s().tradeOutcome !== `${p2} takes it.`) fail("B: the asker's outcome", s().tradeOutcome);
if (!logHas(`Ember traded 1 wheat to ${p2} for 1 sheep.`)) fail("B: no accept line in the log", s().gameLog);
console.log(`B ok: ${p2} takes the ask that helps it, 1-2 s after it`);

// C: p2 has the turn and lacks one grain; Ember holds a grain, p1 and p3 hold none.
const gC = game("p2", { ...HANDS, p0: { grain: 1, clay: 1 } }, 11);
const askC = chooseTradeAsk(gC, "p2");
if (!askC) fail("C: the bot would not ask");
practice(structuredClone(gC));
s().runBots();
const offerC = s().offer;
if (offerC?.from !== "p2" || JSON.stringify(offerC.want) !== JSON.stringify(askC.want)) fail("C: the bot did not ask on its turn", offerC);
const seqC = s().state.seq;
s().runBots();
if (s().state.seq !== seqC || s().offer !== offerC) fail("C: the bot played on while its ask was open");
mock.timers.tick(2000);
if (JSON.stringify([...s().declined].sort()) !== JSON.stringify(["p1", "p3"])) fail("C: the other bots did not both say No", s().declined);
if (s().offer !== offerC) fail("C: the offer closed without the person's answer");
s().answerTrade(true);
if (s().offer) fail("C: the person's Yes left the offer open", s().error);
if (hand("p0").grain !== 0 || hand("p2").grain !== 3) fail("C: the goods did not move", [hand("p0"), hand("p2")]);
s().runBots();
if (s().offer) fail("C: the bot asked twice in one turn");
// The trade is two engine steps (offerTrade, respondTrade); the bot's next move is a third.
if (s().state.seq <= seqC + 2) fail("C: the bot did not play on after the trade", s().state.seq);
console.log("C ok: a bot asks once on its turn, waits, and plays on after the person's Yes");

// D: the same ask, and the person never answers.
practice(structuredClone(gC));
s().runBots();
if (s().offer?.from !== "p2") fail("D: the bot did not ask");
const seqD = s().state.seq;
mock.timers.tick(19_999);
if (!s().offer) fail("D: the offer closed before 20 s");
mock.timers.tick(1);
if (s().offer) fail("D: the offer is still open at 20 s");
s().runBots();
if (s().offer || s().state.seq === seqD) fail("D: the bot did not play on after its ask ran out");
console.log("D ok: a bot's unanswered ask closes at 20 s and its turn plays on");
const expiredRetry = structuredClone(gC);
expiredRetry.turn = s().state.turn + 1;
const expiredAsk = chooseTradeAsk(expiredRetry, "p2");
if (!expiredAsk || JSON.stringify(expiredAsk) !== JSON.stringify(askC)) fail("D: the expired proposal changed", expiredAsk);
useGame.setState({ state: expiredRetry, offer: null, declined: [] });
s().runBots();
if (!s().offer || s().offer.from !== "p2") fail("D: an expired ask was remembered as declined", s().offer);
console.log("D boundary ok: an expired ask does not create declined-proposal memory");

// E: the person asks the helpful ask and ends the turn before any bot answers.
practice(structuredClone(gA));
s().askTable(helps.give, helps.want);
s().dispatch({ type: "endTurn" });
if (s().offer) fail("E: the offer outlived its asker's turn");
const after = JSON.stringify(s().state.players.map((p) => p.resources));
mock.timers.tick(20_000);
if (s().declined.length || JSON.stringify(s().state.players.map((p) => p.resources)) !== after) fail("E: a bot answered a closed offer");
console.log("E ok: ending the turn closes the person's offer, and no bot answers it");

// F: the person asks, then leaves; and asks again, then starts a fresh game straight from the store.
for (const [how, leave] of [["goTitle", () => s().goTitle()], ["startAi", () => s().startAi()]]) {
  practice(structuredClone(gA));
  s().askTable(helps.give, helps.want);
  leave();
  if (s().offer) fail(`F: ${how} left the offer open`);
  const held = JSON.stringify(s().state?.players.map((p) => p.resources) ?? null);
  mock.timers.tick(20_000);
  if (s().offer || s().declined.length || JSON.stringify(s().state?.players.map((p) => p.resources) ?? null) !== held) fail(`F: a bot answered after ${how}`);
}
console.log("F ok: goTitle and startAi drop an open offer, and no bot answers it");

// G: a bot's all-declined ask stays closed on a later turn despite a hand change, while a changed useful ask opens.
practice(structuredClone(gC));
s().runBots();
const declinedOffer = s().offer;
if (!declinedOffer || declinedOffer.from !== "p2") fail("G: the bot did not open its first ask", declinedOffer);
mock.timers.tick(2000);
if (JSON.stringify([...s().declined].sort()) !== JSON.stringify(["p1", "p3"])) fail("G: the other bots did not decline", s().declined);
s().answerTrade(false);
if (s().offer) fail("G: the person's No did not close the offer");
const repeat = structuredClone(s().state);
repeat.turn++;
repeat.phase = "main";
repeat.current = "p2";
const unchangedProposal = chooseTradeAsk(repeat, "p2");
if (!unchangedProposal || JSON.stringify(unchangedProposal) !== JSON.stringify({ give: declinedOffer.give, want: declinedOffer.want })) fail("G: unfiltered proposal changed on the next turn", unchangedProposal);
useGame.setState({ state: repeat, offer: null, declined: [] });
s().runBots();
if (s().offer) fail("G: the same declined proposal reopened on a new turn with the same hand", s().offer);

const changedHand = structuredClone(repeat);
changedHand.turn++;
changedHand.players.find((p) => p.id === "p2").resources.wool++;
rebalance(changedHand);
const repeatProposal = chooseTradeAsk(changedHand, "p2");
if (!repeatProposal || JSON.stringify(repeatProposal) !== JSON.stringify(unchangedProposal)) fail("G: hand change altered the proposal", repeatProposal);
useGame.setState({ state: changedHand, offer: null, declined: [] });
s().runBots();
if (s().offer) fail("G: the same declined proposal reopened after a hand-only change", s().offer);

const changed = structuredClone(changedHand);
changed.turn++;
changed.players.find((p) => p.id === "p2").resources = { grain: 3, ore: 1, wool: 3, timber: 0, clay: 0 };
rebalance(changed);
const useful = chooseTradeAsk(changed, "p2");
if (!useful || JSON.stringify(useful) === JSON.stringify(repeatProposal)) fail("G: changed useful proposal was not available", useful);
useGame.setState({ state: changed, offer: null, declined: [] });
s().runBots();
if (!s().offer || JSON.stringify({ give: s().offer.give, want: s().offer.want }) !== JSON.stringify(useful)) fail("G: changed useful proposal did not open", s().offer);
console.log("G ok: an all-declined proposal stays suppressed on the next turn with the same hand and after a hand-only change; a changed proposal opens");

// H, I, J: p2 asks 1 ore for 1 grain. p3, one ore short of a stronghold with grain to spare, wants it; p1 cannot pay.
const gH = game("p2", { p0: { grain: 1, clay: 1 }, p1: { clay: 1 }, p2: { grain: 2, ore: 3 }, p3: { grain: 4, ore: 1 } }, 11);
const askH = chooseTradeAsk(gH, "p2");
if (!askH || !shouldAcceptTrade(gH, "p3", { from: "p2", ...askH }) || shouldAcceptTrade(gH, "p1", { from: "p2", ...askH })) fail("H: hands do not give an ask only p3 takes", askH);
const p3 = names(["p3"])[0];
const askedH = () => {
  practice(structuredClone(gH));
  s().runBots();
  if (s().offer?.from !== "p2") fail("H: the bot did not ask", s().offer);
};

askedH();
mock.timers.tick(2000);
if (JSON.stringify(s().declined) !== JSON.stringify(["p1"])) fail("H: p1's No did not show by 2 s", s().declined);
mock.timers.tick(5999);
if (!s().offer || hand("p3").ore !== 1) fail("H: a bot's Yes landed before 8 s while the person had not answered");
mock.timers.tick(1);
if (s().offer || s().tradeTaker !== "p3" || hand("p3").ore !== 2) fail("H: p3's held Yes did not land at 8 s", { offer: s().offer, taker: s().tradeTaker });
console.log(`H ok: ${p3}'s Yes waits for the person until 8 s, then takes it`);

askedH();
mock.timers.tick(5000);
s().answerTrade(true);
if (s().offer || s().tradeTaker !== "p0" || hand("p0").grain !== 0 || hand("p3").ore !== 1) fail("I: the person's Yes at 5 s did not beat the bot", { taker: s().tradeTaker, error: s().error });
console.log(`I ok: the person's Yes at 5 s takes the ask ${p3} wanted`);

askedH();
mock.timers.tick(3000);
if (!s().offer) fail("J: the offer closed before the person answered");
s().answerTrade(false);
if (s().offer || s().tradeTaker !== "p3" || hand("p3").ore !== 2) fail("J: the bot's held Yes did not land at once after the person's No", { taker: s().tradeTaker });
console.log(`J ok: the person's No at 3 s lets ${p3} take it at once`);

// K: the person asks the helpful ask and takes it back before any bot answers (#1245).
practice(structuredClone(gA));
s().askTable(helps.give, helps.want);
if (!s().offer || s().offer.until !== null) fail("K: the person's offer is not held (until should be null)", s().offer);
const handsK = JSON.stringify(s().state.players.map((p) => p.resources));
s().cancelTrade();
if (s().offer) fail("K: cancelTrade left the offer open");
if (s().tradeTaker) fail("K: a cancelled offer has a taker", s().tradeTaker);
mock.timers.tick(20_000);
if (s().offer || s().declined.length || JSON.stringify(s().state.players.map((p) => p.resources)) !== handsK) fail("K: a bot answered a cancelled offer, or goods moved");
console.log("K ok: the person's Cancel ends the held offer with no taker, and no bot answers it");

// #1761: counter terms are from the asker's side, against the real store and the same fake clock as A-K.
const counterHands = { p0: { timber: 2, grain: 2, ore: 1 }, p1: { clay: 2, wool: 1 }, p2: { grain: 2, ore: 2, wool: 2 }, p3: { timber: 1 } };
function humanOffer(give = { timber: 1 }, want = { clay: 1 }) {
  const g = game("p0", counterHands, 11);
  g.players.find(p => p.id === "p1").kind = "human";
  practice(g);
  s().askTable(give, want);
  assert.equal(s().offer?.counter, true);
  return s().offer.tradeId;
}
function as(id) { useGame.setState({ localId: id }); }
async function sendCounter(id, give = { grain: 1 }, want = { clay: 1 }) {
  as("p1"); await s().counterTrade(id, give, want); as("p0");
  return s().counters.at(-1);
}
const allHands = () => JSON.stringify(s().state?.players.map(p => p.resources) ?? null);

// Exact IDs, positive/disjoint/different bags, no self/second counter; no funds reserved.
let id = humanOffer();
as("p1");
const loadingCounter = s().counterTrade(id, { grain: 1 }, { clay: 1 });
s().goTitle();
await loadingCounter;
assert.equal(s().offer, null);
assert.equal(s().state, null);
assert.equal(s().counters.length, 0);
assert.equal(s().error, null);
console.log("first-load ok: leaving while the counter module loads drops the pending action");
id = humanOffer();
const beforeInvalid = allHands();
await s().counterTrade(id, { grain: 1 }, { clay: 1 });
assert.equal(s().error, "Bad trade.");
as("p1");
for (const [tradeId, give, want, error] of [
  ["old", { grain: 1 }, { clay: 1 }, "Offer is gone."],
  [id, {}, { clay: 1 }, "Bad trade."],
  [id, { grain: -1 }, { clay: 1 }, "Bad trade."],
  [id, { grain: 0.5 }, { clay: 1 }, "Bad trade."],
  [id, { grain: 1 }, { grain: 1 }, "Bad trade."],
  [id, { timber: 1 }, { clay: 1 }, "Bad trade."],
  [id, { grain: 1 }, { ore: 1 }, "You lack those goods."],
]) {
  await s().counterTrade(tradeId, give, want);
  assert.equal(s().error, error);
  assert.equal(s().counters.length, 0);
}
assert.equal(allHands(), beforeInvalid);
const giveCopy = { grain: 1 }, wantCopy = { clay: 1 };
await s().counterTrade(id, giveCopy, wantCopy);
const c = s().counters[0];
giveCopy.grain = 99; wantCopy.clay = 99;
assert.deepEqual([c.give, c.want], [{ grain: 1 }, { clay: 1 }]);
assert.equal(allHands(), beforeInvalid);
await s().answerCounter(id, c.counterId, true);
assert.equal(s().error, "Offer is gone."); // Only the original asker answers.
as("p0");
await s().answerCounter("old", c.counterId, true);
assert.equal(s().counters.length, 1);
await s().answerCounter(id, "old", true);
assert.equal(s().counters.length, 1);
const n = s().localTrade;
await s().answerCounter(id, c.counterId, true);
assert.equal(s().offer, null);
assert.equal(s().counters.length, 0);
assert.equal(s().localTrade, n + 1);
assert.equal(hand("p0").grain, 1);
assert.equal(hand("p0").clay, 1);
assert.equal(hand("p1").grain, 1);
assert.equal(hand("p1").clay, 1);
const once = allHands();
await s().answerCounter(id, c.counterId, true);
assert.equal(allHands(), once);
console.log("L ok: exact ids/roles/bags, immutable terms, no reservation, exactly one counter settlement");

for (const why of ["no", "back"]) {
  id = humanOffer();
  const c = await sendCounter(id);
  const hands = allHands();
  if (why === "no") await s().answerCounter(id, c.counterId, false);
  else { as("p1"); await s().cancelCounter(id, c.counterId); }
  assert.equal(s().offer.tradeId, id);
  assert.equal(s().counterClosed.why, why);
  assert.equal(allHands(), hands);
  as("p1"); await s().counterTrade(id, { ore: 1 }, { clay: 1 });
  assert.equal(s().error, "Bad trade.");
  s().answerTrade(true);
  assert.equal(s().offer, null);
  assert.equal(s().tradeTaker, "p1");
}
console.log("M ok: No/back keep the original payable; per-seat allowance stays spent");

id = humanOffer();
let pending = await sendCounter(id);
s().state.players.find(p => p.id === "p0").resources.grain = 0;
await s().answerCounter(id, pending.counterId, true);
assert.equal(s().error, "You lack those goods.");
assert.equal(s().counters.length, 1);
assert.equal(s().offer.tradeId, id);
s().state.players.find(p => p.id === "p0").resources.grain = 2;
s().state.players.find(p => p.id === "p1").resources.clay = 0;
await s().answerCounter(id, pending.counterId, true);
assert.equal(s().counterClosed.why, "gone");
assert.equal(s().counters.length, 0);
assert.equal(s().offer.tradeId, id);
id = humanOffer({ timber: 1 }, { ore: 1 });
assert.equal(hand("p1").ore, 0);
pending = await sendCounter(id);
assert.equal(s().counters.length, 1);
await s().answerCounter(id, pending.counterId, true);
assert.equal(s().tradeTaker, "p1");
console.log("N ok: both hands revalidated; short asker keeps counter, short sender closes only counter");

id = humanOffer({ timber: 1 }, { wool: 1 });
pending = await sendCounter(id);
as("p1"); s().answerTrade(false); as("p0");
mock.timers.tick(2000);
assert.equal(s().offer.tradeId, id);
assert.equal(s().counters.length, 1);
await s().answerCounter(id, pending.counterId, false);
assert.equal(s().offer, null);
console.log("O ok: all Nos hold the offer while a counter waits; last counter close ends it");

id = humanOffer(); pending = await sendCounter(id);
mock.timers.tick(60000);
assert.equal(s().offer.tradeId, id);
assert.equal(s().counters[0], pending);
for (const end of [() => s().cancelTrade(), () => s().dispatch({ type: "endTurn" }), () => s().goTitle(), () => s().startAi()]) {
  id = humanOffer(); pending = await sendCounter(id); end();
  assert.equal(s().offer, null);
  assert.equal(s().counters.length, 0);
  const hands = allHands(); mock.timers.tick(20000); assert.equal(allHands(), hands);
}
console.log("P ok: human counter has no timeout; cancel/turn/title/new deal clear counters and timers");

// The helpful counter gives the bot two grain instead of one; sender holds all of it at submission.
function botOffer() {
  const g = structuredClone(gH);
  g.players.find(p => p.id === "p0").resources.grain = 3;
  g.players.find(p => p.id === "p3").resources.grain = 0;
  rebalance(g); practice(g); s().runBots();
  assert.equal(s().offer.from, "p2");
  assert.equal(shouldAcceptTrade(g, "p2", { from: "p0", give: { grain: 2 }, want: { ore: 1 } }), true);
  return s().offer.tradeId;
}
id = botOffer();
await s().counterTrade(id, { ore: 1 }, { grain: 2 });
assert.equal(s().counters.length, 1);
const beforeBot = allHands();
mock.timers.tick(999); assert.equal(allHands(), beforeBot);
mock.timers.tick(1001);
assert.equal(s().offer, null);
assert.equal(s().tradeTaker, "p0");
assert.equal(hand("p0").grain, 1);
assert.equal(hand("p0").ore, 1);
console.log("Q ok: bot answers useful counter in 1-2 seconds through paired pricing");

id = botOffer(); mock.timers.tick(19000);
await s().counterTrade(id, { ore: 1 }, { grain: 2 });
mock.timers.tick(999); assert.equal(s().offer.tradeId, id);
mock.timers.tick(1); assert.equal(s().offer, null); assert.equal(s().tradeTaker, "p0");
const expiredHands = allHands(); mock.timers.tick(2000); assert.equal(allHands(), expiredHands);
console.log("R ok: pending counter answered before 20-second offer expiry, later answer cannot settle twice");

for (const closeEarly of [true, false]) {
  id = humanOffer(helps.give, helps.want);
  pending = await sendCounter(id, { timber: 1 }, { clay: 1 });
  as("p1"); s().answerTrade(false); as("p0");
  mock.timers.tick(2000); assert.equal(s().offer.tradeId, id);
  if (closeEarly) {
    mock.timers.tick(1000); await s().answerCounter(id, pending.counterId, false);
  } else {
    mock.timers.tick(5999); assert.equal(s().offer.tradeId, id); mock.timers.tick(1);
  }
  assert.equal(s().offer, null); assert.equal(s().tradeTaker, "p2"); assert.equal(s().counters.length, 0);
}
console.log("S ok: closing last counter releases held Yes; pending counter cannot extend the 8-second cap");

id = humanOffer({ grain: 1 }, { timber: 1 });
for (const p of s().state.players) p.kind = "human";
pending = await sendCounter(id);
as("p2"); await s().counterTrade(id, { ore: 1 }, { wool: 1 });
assert.equal(s().counters.length, 2);
assert.notEqual(s().counters[0].counterId, s().counters[1].counterId);
as("p3"); s().answerTrade(true);
assert.equal(s().offer, null); assert.equal(s().counters.length, 0); assert.equal(s().tradeTaker, "p3");
console.log("T ok: two immutable counter ids; another seat can take the original and closes both");

id = humanOffer(); as("p1");
useGame.setState({ spectator: true }); await s().counterTrade(id, { grain: 1 }, { clay: 1 }); assert.equal(s().counters.length, 0);
useGame.setState({ spectator: false });
s().state.role = "partner"; await s().counterTrade(id, { grain: 1 }, { clay: 1 }); assert.equal(s().error, "Cannot trade now."); assert.equal(s().counters.length, 0);
s().goTitle();
console.log("U ok: watcher and partner cannot counter");

// Online commands keep the host's ids/terms and authority; a watcher sends none.
const sent = [];
useGame.setState({ mode: "online", spectator: false, net: {
  tradeCounter: (...args) => sent.push(["make", ...args]),
  tradeCounterAnswer: (...args) => sent.push(["answer", ...args]),
  tradeCounterCancel: (...args) => sent.push(["cancel", ...args]),
  close: () => {},
} });
await s().counterTrade("remote-offer", { grain: 1 }, { clay: 1 });
await s().answerCounter("remote-offer", "remote-counter", true);
await s().cancelCounter("remote-offer", "remote-counter");
assert.deepEqual(sent, [
  ["make", "remote-offer", { grain: 1 }, { clay: 1 }],
  ["answer", "remote-offer", "remote-counter", true],
  ["cancel", "remote-offer", "remote-counter"],
]);
useGame.setState({ spectator: true });
await s().counterTrade("remote-offer", { grain: 1 }, { clay: 1 });
await s().answerCounter("remote-offer", "remote-counter", false);
await s().cancelCounter("remote-offer", "remote-counter");
assert.equal(sent.length, 3);
s().goTitle();
console.log("V ok: online command forwarding preserves exact ids/terms; watcher sends nothing");

// W. Incoming online counters go through the store's own handlers (table.ts parses the socket messages). They land
// on their own offer, keep their order when two events arrive back to back, and one for a closed offer is dropped.
{
  const sockets = [];
  globalThis.WebSocket = class { constructor() { this.readyState = 1; sockets.push(this); } send() {} close() {} };
  globalThis.window = { location: { href: "http://127.0.0.1/?host=ws%3A%2F%2F127.0.0.1%3A1" }, addEventListener() {}, removeEventListener() {} };
  s().goTitle();
  s().joinTable("ABCD");
  for (const t0 = performance.now(); !sockets.length && performance.now() - t0 < 10000;) await new Promise((r) => setImmediate(r));
  assert.equal(sockets.length, 1, "the store dialed the table");
  const deliver = async (msg) => { sockets[0].onmessage({ data: JSON.stringify(msg) }); for (let i = 0; i < 20; i++) await Promise.resolve(); };
  const terms = { give: { ore: 1 }, want: { grain: 2 } };
  const c = (tradeId, counterId, by) => ({ type: "tradeCounter", tradeId, counterId, by, name: by, ...terms });
  useGame.setState({ localId: "p0" });
  await deliver({ type: "tradeOffer", tradeId: "t1", from: "p0", give: { grain: 1 }, want: { timber: 1 }, seconds: null, counter: true });
  await deliver(c("other-offer", "x-c1", "p1"));
  assert.equal(s().counters.length, 0, "a counter for another offer is not shown");
  await deliver(c("t1", "t1-c1", "p1"));
  await deliver(c("t1", "t1-c1", "p1"));
  assert.deepEqual(s().counters.map((x) => x.counterId), ["t1-c1"]);
  assert.deepEqual(s().counterUsed, ["p1"]);
  // Back to back: a counter and its close reach the store in the order sent (reversed, the close finds nothing and the counter stays).
  sockets[0].onmessage({ data: JSON.stringify(c("t1", "t1-c2", "p2")) });
  sockets[0].onmessage({ data: JSON.stringify({ type: "tradeCounterClosed", tradeId: "t1", counterId: "t1-c2", why: "no" }) });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.deepEqual(s().counters.map((x) => x.counterId), ["t1-c1"]);
  assert.deepEqual(s().counterClosed, { tradeId: "t1", counterId: "t1-c2", by: "p2", why: "no" });
  await deliver(c("t1", "t1-c3", "p3"));
  assert.deepEqual(s().counters.map((x) => x.counterId), ["t1-c1", "t1-c3"]);
  await deliver({ type: "tradeClosed", tradeId: "t1" });
  assert.equal(s().offer, null); assert.equal(s().counters.length, 0);
  await deliver(c("t1", "t1-c4", "p2"));
  assert.equal(s().counters.length, 0, "a counter arriving after its offer closed is dropped");
  s().goTitle();
}
console.log("W ok: incoming online counters land on their offer, keep order, and a late one is dropped");

mock.timers.reset();
console.log("practice trade prove ok");
