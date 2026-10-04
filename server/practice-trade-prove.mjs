// Bots and the ask-the-table trade in practice (#363, #445), against the browser's own store (store.ts), as host.mjs
// does online (bot-trade-prove.mjs). The clock is faked, so every delay is ticked, never slept:
//   A. The person asks: bots it does not help say No, never before 1 s; when all three have, it closes at once.
//   B. The person asks for what one bot needs: that bot takes it within 2 s and the goods move.
//   C. A bot asks on its own turn and its turn waits; the other bots say No, the person's Yes moves the goods, and the
//      bot plays on without asking again.
//   D. A bot asks and the person stays silent: it closes at 20 s and the bot plays on.
//   E. The person's offer closes when their turn ends, and its bots' answers never land.
//   F. Leaving for the Title, or starting a new practice game, drops an open offer, and its bots' answers never land.
import { mock } from "node:test";
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
if (!logHas(`${p2} accepts Ember's trade.`)) fail("B: no accept line in the log", s().gameLog);
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

mock.timers.reset();
console.log("practice trade prove ok");
