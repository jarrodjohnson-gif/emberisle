// #1452 and #1453 design: play one whole four-seat game with the real rules (rules.ts) and the real bot brain (ai.ts),
// and count the facts a build would make the host record. Throwaway: the counters live here, not in rules.ts.
// The dice are the real crypto dice, so each run is a different game. capture.mjs saves the one it pictured in game.json.
import { createGame } from "../../../src/lib/game/board.ts";
import { applyAction, totalVP } from "../../../src/lib/game/rules.ts";
import { chooseBotAction, chooseTradeAsk, shouldAcceptTrade } from "../../../src/lib/game/ai.ts";

const GOODS = ["timber", "clay", "wool", "grain", "ore"];

export function play(names, seed) {
  let s = createGame({ humans: names.map((name) => ({ name })), bots: 0, seed });
  s.rollOff = null;
  s.phase = "setupSettle";
  s.victoryTarget = 10;
  const tally = Object.fromEntries(s.players.map((p) => [p.id, { earned: Object.fromEntries(GOODS.map((r) => [r, 0])), discarded: 0, stole: 0, tableTrades: 0, bankTrades: 0 }]));
  const rollSums = Array(11).fill(0);
  let asked = false, last = null;

  const act = (actor, action) => {
    const before = s;
    const r = applyAction(before, actor, action);
    if (r.error) throw new Error(`${actor} ${action.type}: ${r.error}`);
    const after = r.state;
    // The facts, counted where a build's rules.ts would count them (README, "What the host records").
    if (action.type === "roll" && before.phase === "roll") {
      const sum = after.dice[0] + after.dice[1];
      rollSums[sum - 2]++;
      if (sum !== 7) for (const p of after.players) for (const g of GOODS) {
        const d = p.resources[g] - before.players.find((x) => x.id === p.id).resources[g];
        if (d > 0) tally[p.id].earned[g] += d;
      }
    }
    if (action.type === "discard") tally[actor].discarded += before.discardNeeded[actor];
    if (action.type === "moveRobber" || action.type === "playKnight") for (const p of after.players) {
      tally[actor].stole += (p.goodsLost ?? 0) - (before.players.find((x) => x.id === p.id).goodsLost ?? 0);
    }
    if (action.type === "respondTrade" && action.accept) { tally[before.trade.from].tableTrades++; tally[actor].tableTrades++; }
    if (action.type === "bankTrade") tally[actor].bankTrades++;
    if (after.phase === "over") last = { before: structuredClone(before), actor, action };
    s = after;
  };

  for (let step = 0; s.phase !== "over"; step++) {
    if (step > 20000) throw new Error("game did not end");
    if (s.phase === "discard") { const pid = Object.keys(s.discardNeeded)[0]; act(pid, chooseBotAction(s, pid)); continue; }
    if (s.trade) { act(s.trade.to, { type: "respondTrade", accept: shouldAcceptTrade(s, s.trade.to, s.trade) }); continue; }
    const pid = s.current;
    if (s.phase === "main" && !asked) {
      asked = true;
      const ask = chooseTradeAsk(s, pid);
      const to = ask && s.players.find((p) => p.id !== pid && shouldAcceptTrade(s, p.id, { from: pid, ...ask }));
      if (to) { act(pid, { type: "offerTrade", to: to.id, ...ask }); continue; }
    }
    const a = chooseBotAction(s, pid);
    if (a.type === "endTurn") asked = false;
    act(pid, a);
  }
  // Attach the counters as the proposed optional fields, on both the final state and the state one action before the win.
  for (const g of [s, last.before]) {
    g.rollSums = rollSums.slice();
    for (const p of g.players) p.tally = structuredClone(tally[p.id]);
  }
  return { final: s, last, totals: Object.fromEntries(s.players.map((p) => [p.name, totalVP(s, p.id)])) };
}
