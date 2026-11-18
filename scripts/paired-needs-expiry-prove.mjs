// Partner-turn need expiry proof (parked pending owner decision on whether partner turns age needs).
// advanceNeed (src/lib/game/needs.ts) does not burn a turnsLeft tick when a 5- or 6-seat partner activation
// ends, while still clearing on matching partner bank/dock trades and classic 3-4 seat turns.
import assert from "node:assert/strict";
import { createExpandedGame } from "../src/lib/game/expanded.ts";
import { advanceNeed } from "../src/lib/game/needs.ts";
import { applyAction, harborRate } from "../src/lib/game/rules.ts";
import { chooseBotAction } from "../src/lib/game/ai.ts";

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  checks++;
};

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

function finishSetup(g, label) {
  while (g.phase === "rollOff" || g.phase === "setupSettle" || g.phase === "setupRoad") {
    const a = chooseBotAction(g, g.current);
    ok(Boolean(a), `${label}: bot picks setup move`);
    g = act(g, g.current, a, `${label} ${g.phase}`);
  }
  return g;
}

try {
  for (const seats of [5, 6]) {
    reseed(1770 + seats);
    const tag = `${seats} seats`;
    let g = finishSetup(createExpandedGame({ seed: 1770 + seats, humans: [], bots: seats }), tag);
    eq(g.phase, "roll", `${tag}: enters first primary roll`);
    eq(g.role, "primary", `${tag}: starts as primary`);

    const tracked = g.current;
    queue.push(2, 3);
    g = act(g, tracked, { type: "roll" }, `${tag}: first primary roll`);
    eq(g.phase, "main", `${tag}: first primary main`);

    let need = { kinds: ["grain"], turnsLeft: 2 };
    let sawPartnerEnd = false;
    let sawSecondPrimaryEnd = false;

    for (let step = 0; step < seats * 5 && !sawSecondPrimaryEnd; step++) {
      if (g.phase === "roll") {
        queue.push(2, 3);
        const before = g;
        g = act(g, g.current, { type: "roll" }, `${tag}: roll ${step}`);
        need = advanceNeed(need, tracked, before, g, false);
      }
      const before = g;
      const actor = g.current;
      const wasRole = g.role;
      g = act(g, actor, { type: "endTurn" }, `${tag}: endTurn ${step}`);
      const nextNeed = advanceNeed(need, tracked, before, g, false);

      if (actor === tracked && wasRole === "primary") {
        if (!sawPartnerEnd) {
          eq(nextNeed, { kinds: ["grain"], turnsLeft: 1 }, `${tag}: first primary turn ages need 2 -> 1`);
        } else {
          eq(nextNeed, undefined, `${tag}: second primary turn expires need 1 -> undefined`);
          sawSecondPrimaryEnd = true;
        }
      } else if (actor === tracked && wasRole === "partner") {
        eq(nextNeed, { kinds: ["grain"], turnsLeft: 1 }, `${tag}: partner turn does not age need`);
        sawPartnerEnd = true;
      } else {
        eq(nextNeed, need, `${tag}: other seat activation leaves need unchanged`);
      }
      need = nextNeed;
    }
    ok(sawPartnerEnd, `${tag}: visited tracked player's partner activation`);
    ok(sawSecondPrimaryEnd, `${tag}: visited tracked player's second primary activation`);

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
  }
  console.log(`paired-needs-expiry-prove: ok (${checks} checks)`);
} finally {
  crypto.getRandomValues = realRandom;
}
