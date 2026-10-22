// #911: production bot choices spend the dock rate and try a bank-stocked short good.
import assert from "node:assert/strict";
import { createGame } from "../src/lib/game/board.ts";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { applyAction, harborRate, legalCities, legalSettle } from "../src/lib/game/rules.ts";
import { COST, RESOURCES } from "../src/lib/game/types.ts";

function position(harbor, timber) {
  let game = createGame({ humans: [], bots: 3, seed: 7 });
  game.phase = "setupSettle";
  game.rollOff = null;
  while (game.phase === "setupSettle" || game.phase === "setupRoad") {
    let action = chooseBotAction(game, game.current);
    if (game.phase === "setupSettle" && game.current === "p0") {
      const alreadyOwns = game.vertices.some((v) => v.building?.playerId === "p0");
      const desired = alreadyOwns ? null : harbor;
      const legal = new Set(legalSettle(game, "p0", true));
      const vertex = game.vertices.find((v) => legal.has(v.id) && v.harbor === desired);
      assert(vertex, "the generated board offers a legal setup corner for this dock fixture");
      action = { type: "setupSettle", vertexId: vertex.id };
    }
    const next = applyAction(game, game.current, action);
    assert.ifError(next.error);
    game = next.state;
  }
  game.phase = "main";
  game.current = "p0";
  for (const p of game.players) p.resources = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  game.players[0].resources.timber = timber;
  const owned = game.vertices.filter((v) => v.building?.playerId === "p0");
  assert.equal(owned.length, 2, "legal setup gives the bot two owned corners");
  assert.deepEqual(owned.map((v) => v.harbor).filter(Boolean), harbor ? [harbor] : [], "the bot owns only the requested generated dock");
  assert(legalCities(game, "p0").length > 0, "the bot saves for its next stronghold");
  assert.equal(game.players[0].hidden.knight, 0);
  for (const r of RESOURCES) game.bank[r] = 19 - game.players.reduce((n, p) => n + p.resources[r], 0);
  return game;
}

function trade(game, rate, want) {
  const before = structuredClone(game);
  const action = chooseBotAction(game, "p0");
  assert.deepEqual(action, { type: "bankTrade", give: "timber", want }, "the production AI chooses the dock trade");
  assert.deepEqual(game, before, "choosing an action leaves the position unchanged");
  assert.equal(harborRate(game, "p0", "timber"), rate);
  const next = applyAction(game, "p0", action);
  assert.ifError(next.error);
  assert.equal(next.state.players[0].resources.timber, game.players[0].resources.timber - rate);
  assert.equal(next.state.players[0].resources[want], game.players[0].resources[want] + 1);
  assert.equal(next.state.bank.timber, game.bank.timber + rate);
  assert.equal(next.state.bank[want], game.bank[want] - 1);
  return next.state;
}

for (const [harbor, rate] of [["timber", 2], ["any", 3]]) {
  const game = position(harbor, rate);
  assert.equal(game.players[0].resources.grain, 0);
  trade(game, rate, "grain");
  console.log(`${rate}:1 dock: bot gives exactly ${rate} timber for one grain; player and bank balances agree`);
}

{
  const game = position("timber", 2);
  // Grain precedes ore in RESOURCES and both are short for the stronghold goal.
  assert(RESOURCES.indexOf("grain") < RESOURCES.indexOf("ore"));
  assert.equal(game.players[0].resources.grain, 0);
  assert.equal(game.players[0].resources.ore, 0);
  game.players[1].resources.grain = game.bank.grain;
  game.bank.grain = 0;
  trade(game, 2, "ore");
  console.log("first short grain unavailable from bank: bot trades 2 timber toward its second short good, ore");
}

{
  const game = position(null, 3);
  assert.equal(harborRate(game, "p0", "timber"), 4);
  assert.notEqual(chooseBotAction(game, "p0").type, "bankTrade", "three goods cannot pay the ordinary 4:1 rate");
  game.players[0].resources.timber = 4;
  game.bank.timber--;
  trade(game, 4, "grain");
  console.log("no dock: bot refuses an unaffordable 3-card trade and uses the ordinary 4:1 rate with four spare goods");
}

{
  const game = position("grain", 0);
  const me = game.players[0];
  me.resources.grain = COST.stronghold.grain + 1;
  me.resources.ore = COST.stronghold.ore - 1;
  for (const r of RESOURCES) game.bank[r] = 19 - game.players.reduce((n, p) => n + p.resources[r], 0);
  assert.equal(harborRate(game, "p0", "grain"), 2);
  const missing = (hand) => RESOURCES.reduce((n, r) => n + Math.max(0, (COST.stronghold[r] ?? 0) - hand[r]), 0);
  assert.equal(chooseBotAction(game, "p0").type, "endTurn", "one spare grain cannot pay a 2:1 rate without spending the goal's grain");
  const sacrificed = applyAction(game, "p0", { type: "bankTrade", give: "grain", want: "ore" });
  assert.ifError(sacrificed.error);
  assert.equal(missing(sacrificed.state.players[0].resources), missing(me.resources), "spending reserved grain does not reduce missing goal cards");
  console.log("reservation diagnostic: 4 grain / 1 ore keeps the 3-grain stronghold goal; sacrificing 2 grain for ore leaves one card missing");
}

console.log("PASS bot-harbor-prove");
