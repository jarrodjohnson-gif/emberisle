// Paired-turn post-win trade guard and classic need-expiry proof:
// 1. pairedStep (src/lib/game/expanded.ts) returns "The game is over." (not PARTNER_NO_TRADE) for offerTrade and
//    respondTrade(accept: true) once a 5- or 6-seat game ends during a partner activation, while preserving
//    PARTNER_NO_TRADE during active partner turns.
// 2. advanceNeed still clears on partner bank trades, game over, and classic 3- and 4-seat own turns.
import assert from "node:assert/strict";
import { createGame } from "../src/lib/game/board.ts";
import { PARTNER_NO_TRADE, createExpandedGame } from "../src/lib/game/expanded.ts";
import { advanceNeed } from "../src/lib/game/needs.ts";
import { applyAction, harborRate, legalCities, victoryTarget } from "../src/lib/game/rules.ts";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { RESOURCES } from "../src/lib/game/types.ts";

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  checks++;
};

// Seeded deterministic RNG so every run is repeatable without ports or timers.
const queue = [];
let rngWord = 1;
const nextWord = () => {
  rngWord ^= rngWord << 13;
  rngWord >>>= 0;
  rngWord ^= rngWord >>> 17;
  rngWord ^= rngWord << 5;
  rngWord >>>= 0;
  return rngWord;
};
const realRandom = crypto.getRandomValues.bind(crypto);
crypto.getRandomValues = (buf) => {
  for (let i = 0; i < buf.length; i++) buf[i] = queue.length ? queue.shift() - 1 : nextWord();
  return buf;
};
const reseed = (seed) => {
  rngWord = (Math.imul(seed + 1, 2654435761) >>> 0) || 1;
  queue.length = 0;
};

function act(g, pid, action, label) {
  const r = applyAction(g, pid, action);
  assert.equal(r.error, undefined, `${label}: ${r.error}`);
  checks++;
  return r.state;
}

function refuse(g, pid, action, wantError, label) {
  const before = JSON.stringify(g);
  const r = applyAction(g, pid, action);
  eq(r.error, wantError, `${label}: error`);
  eq(r.state, g, `${label}: returned prev reference`);
  eq(JSON.stringify(g), before, `${label}: input unmutated`);
}

function finishSetup(g, label) {
  while (g.phase === "rollOff" || g.phase === "setupSettle" || g.phase === "setupRoad") {
    const a = chooseBotAction(g, g.current);
    ok(Boolean(a), `${label}: bot picks setup move`);
    g = act(g, g.current, a, `${label} ${g.phase}`);
  }
  return g;
}

try {
  // 1. Post-win partner trade guards and partner bank/game-over need clears across 5- and 6-seat tables.
  for (const seats of [5, 6]) {
    reseed(1770 + seats);
    const tag = `${seats} seats`;
    let g = finishSetup(createExpandedGame({ seed: 1770 + seats, humans: [], bots: seats }), tag);
    eq(g.phase, "roll", `${tag}: enters first primary roll`);
    eq(g.role, "primary", `${tag}: starts as primary`);

    // Partner bank/dock trade gaining a needed good clears immediately.
    while (g.role !== "partner") {
      if (g.phase === "roll") {
        queue.push(2, 3);
        g = act(g, g.current, { type: "roll" }, `${tag}: advance to partner roll`);
      }
      g = act(g, g.current, { type: "endTurn" }, `${tag}: advance to partner endTurn`);
    }
    eq(g.role, "partner", `${tag}: on partner activation for bank trade`);
    const partnerId = g.current;
    const bankBefore = structuredClone(g);
    const partner = bankBefore.players.find((p) => p.id === partnerId);
    const rate = harborRate(bankBefore, partnerId, "timber");
    partner.resources.timber = Math.max(partner.resources.timber, rate);
    bankBefore.bank.grain = Math.max(bankBefore.bank.grain, 1);
    const bankAfter = act(bankBefore, partnerId, { type: "bankTrade", give: "timber", want: "grain" }, `${tag}: partner bankTrade`);
    eq(
      advanceNeed({ kinds: ["grain"], turnsLeft: 2 }, partnerId, bankBefore, bankAfter, true),
      undefined,
      `${tag}: partner bankTrade gaining needed good clears need immediately`,
    );

    // 2. Post-win trade guard when a 5- or 6-seat game ends during a partner activation.
    const otherId = g.players.find((p) => p.id !== partnerId).id;
    const activePartner = structuredClone(g);
    const activeP = activePartner.players.find((p) => p.id === partnerId);
    const activeO = activePartner.players.find((p) => p.id === otherId);
    activeP.resources.timber = 2;
    activeO.resources.clay = 2;
    activePartner.trade = { from: otherId, to: partnerId, give: { clay: 1 }, want: { timber: 1 } };

    // Active partner turn still returns PARTNER_NO_TRADE.
    refuse(activePartner, partnerId, { type: "offerTrade", to: otherId, give: { timber: 1 }, want: { clay: 1 } }, PARTNER_NO_TRADE, `${tag}: active partner offerTrade`);
    refuse(activePartner, partnerId, { type: "respondTrade", accept: true }, PARTNER_NO_TRADE, `${tag}: active partner respondTrade accept`);

    // Partner wins on their partner activation via buildStronghold.
    const winBefore = structuredClone(g);
    const wp = winBefore.players.find((p) => p.id === partnerId);
    const target = victoryTarget(winBefore);
    wp.hidden.vp = Math.max(0, target - 3);
    wp.resources.grain = 3;
    wp.resources.ore = 2;
    wp.strongholdsLeft = Math.max(1, wp.strongholdsLeft);
    const citySpot = legalCities(winBefore, partnerId)[0];
    ok(Boolean(citySpot), `${tag}: partner has an outpost to upgrade`);
    const overOnPartner = act(winBefore, partnerId, { type: "buildStronghold", vertexId: citySpot }, `${tag}: partner wins`);
    eq(overOnPartner.phase, "over", `${tag}: game is over`);
    eq(overOnPartner.role, "partner", `${tag}: role remains partner after partner win`);
    eq(overOnPartner.winner, partnerId, `${tag}: partner is winner`);

    // Needs clear immediately when a partner win ends the game.
    eq(
      advanceNeed({ kinds: ["grain"], turnsLeft: 2 }, otherId, winBefore, overOnPartner, false),
      undefined,
      `${tag}: game over on partner turn clears needs`,
    );

    // Post-win trade actions must return "The game is over.", never PARTNER_NO_TRADE.
    const overWithStaleOffer = structuredClone(overOnPartner);
    overWithStaleOffer.players.find((p) => p.id === partnerId).resources.timber = 2;
    overWithStaleOffer.players.find((p) => p.id === otherId).resources.clay = 2;
    overWithStaleOffer.trade = { from: otherId, to: partnerId, give: { clay: 1 }, want: { timber: 1 } };
    refuse(overWithStaleOffer, partnerId, { type: "offerTrade", to: otherId, give: { timber: 1 }, want: { clay: 1 } }, "The game is over.", `${tag}: post-win partner offerTrade`);
    refuse(overWithStaleOffer, partnerId, { type: "respondTrade", accept: true }, "The game is over.", `${tag}: post-win partner respondTrade accept`);
    refuse(overWithStaleOffer, partnerId, { type: "respondTrade", accept: false }, "The game is over.", `${tag}: post-win partner respondTrade decline`);
    refuse(overWithStaleOffer, partnerId, { type: "endTurn" }, "The game is over.", `${tag}: post-win partner endTurn`);
    refuse(overWithStaleOffer, partnerId, { type: "bankTrade", give: "timber", want: "clay" }, "The game is over.", `${tag}: post-win partner bankTrade`);
  }

  // 3. Classic 3- and 4-seat parity: advanceNeed still ages on every own main-phase endTurn.
  for (const seats of [3, 4]) {
    reseed(1780 + seats);
    const tag = `classic ${seats} seats`;
    let g = finishSetup(createGame({ seed: 1780 + seats, humans: [], bots: seats }), tag);
    const tracked = g.current;
    queue.push(2, 3);
    g = act(g, tracked, { type: "roll" }, `${tag}: roll`);
    let need = { kinds: ["ore"], turnsLeft: 2 };
    let ownEnds = 0;
    for (let step = 0; step < seats * 3 && ownEnds < 2; step++) {
      if (g.phase === "roll") {
        queue.push(2, 3);
        const before = g;
        g = act(g, g.current, { type: "roll" }, `${tag}: roll ${step}`);
        need = advanceNeed(need, tracked, before, g, false);
      }
      const before = g;
      const actor = g.current;
      g = act(g, actor, { type: "endTurn" }, `${tag}: endTurn ${step}`);
      need = advanceNeed(need, tracked, before, g, false);
      if (actor === tracked) {
        ownEnds++;
        eq(need, ownEnds === 1 ? { kinds: ["ore"], turnsLeft: 1 } : undefined, `${tag}: own turn ${ownEnds} ages need`);
      }
    }
    eq(ownEnds, 2, `${tag}: completed two own turns`);
  }

  // Sanity: all RESOURCES constants intact.
  eq(RESOURCES.length, 5, "five resources");
  console.log(`paired-needs-guards-prove: ok (${checks} checks)`);
} finally {
  crypto.getRandomValues = realRandom;
}
