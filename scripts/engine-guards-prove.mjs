// Engine guard parity proof:
// 1. chooseBotAction returns null for every non-current seat across setupSettle, setupRoad, rollOff, roll, robber,
//    main, over, and non-discarding discard, matching chooseRecoveryAction on 3-6 seat tables.
// 2. applyAction(offerTrade) refuses empty and all-zero bags with "Offer something." while preserving one-sided
//    non-empty offers and partner-turn refusal, matching server/host.mjs and src/lib/game/store.ts.
// 3. Expanded 5-6 seat random-token deals, winnerFirst roll-offs, and short-bank production preserve invariants.
import assert from "node:assert/strict";
import { createGame } from "../src/lib/game/board.ts";
import { EXPANDED_BANK, PARTNER_NO_TRADE, createAnyGame, createExpandedGame } from "../src/lib/game/expanded.ts";
import { applyAction, bankShort } from "../src/lib/game/rules.ts";
import { chooseBotAction, chooseRecoveryAction } from "../src/lib/game/ai.ts";
import { AXIAL_DIRS } from "../src/lib/game/hex.ts";
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

// Deterministic dice queue with seeded fallback so every run is repeatable.
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

try {
  // 1. chooseBotAction out-of-turn guard across all phases for 3, 4, 5, and 6 seats.
  for (const seats of [3, 4, 5, 6]) {
    reseed(1700 + seats);
    let g = createAnyGame({ seed: 1700 + seats, humans: [], bots: seats });
    const tag = `${seats} seats`;

    // rollOff
    while (g.phase === "rollOff") {
      for (const p of g.players) {
        if (p.id === g.current) {
          eq(chooseBotAction(g, p.id)?.type, "roll", `${tag} rollOff: current bot rolls`);
        } else {
          eq(chooseBotAction(g, p.id), null, `${tag} rollOff: non-current bot returns null`);
          eq(chooseRecoveryAction(g, p.id), null, `${tag} rollOff: non-current recovery returns null`);
        }
      }
      g = act(g, g.current, chooseBotAction(g, g.current), `${tag} rollOff`);
    }

    // setupSettle and setupRoad (verify every step across both snake rounds)
    let sawSettle = false;
    let sawRoad = false;
    while (g.phase === "setupSettle" || g.phase === "setupRoad") {
      const phase = g.phase;
      if (phase === "setupSettle") sawSettle = true;
      if (phase === "setupRoad") sawRoad = true;
      for (const p of g.players) {
        if (p.id === g.current) continue;
        eq(chooseBotAction(g, p.id), null, `${tag} ${phase}: non-current ${p.id} returns null`);
        eq(chooseRecoveryAction(g, p.id), null, `${tag} ${phase}: non-current recovery ${p.id} returns null`);
      }
      const action = chooseBotAction(g, g.current);
      eq(action?.type, phase, `${tag} ${phase}: current bot picks ${phase}`);
      g = act(g, g.current, action, `${tag} ${phase}`);
    }
    ok(sawSettle && sawRoad, `${tag}: visited both setupSettle and setupRoad`);

    // roll phase
    eq(g.phase, "roll", `${tag}: enters roll phase`);
    for (const p of g.players) {
      if (p.id === g.current) continue;
      eq(chooseBotAction(g, p.id), null, `${tag} roll: non-current ${p.id} returns null`);
    }

    // discard phase: non-current seat with >7 cards must still discard; current seat with <=7 returns null.
    const dState = structuredClone(g);
    const other = dState.players.find((p) => p.id !== dState.current);
    const cur = dState.players.find((p) => p.id === dState.current);
    for (const r of RESOURCES) {
      cur.resources[r] = 0;
      other.resources[r] = 0;
    }
    other.resources.timber = 8;
    queue.push(3, 4);
    const after7 = act(dState, dState.current, { type: "roll" }, `${tag} roll 7`);
    eq(after7.phase, "discard", `${tag} discard: enters discard`);
    eq(chooseBotAction(after7, after7.current), null, `${tag} discard: current seat not needing discard returns null`);
    const discAction = chooseBotAction(after7, other.id);
    eq(discAction?.type, "discard", `${tag} discard: non-current seat needing discard picks discard`);
    const afterDisc = act(after7, other.id, discAction, `${tag} discard`);

    // robber phase
    eq(afterDisc.phase, "robber", `${tag} robber: enters robber`);
    for (const p of afterDisc.players) {
      if (p.id === afterDisc.current) continue;
      eq(chooseBotAction(afterDisc, p.id), null, `${tag} robber: non-current ${p.id} returns null`);
    }
    const afterRob = act(afterDisc, afterDisc.current, chooseBotAction(afterDisc, afterDisc.current), `${tag} robber`);

    // main phase + over phase
    eq(afterRob.phase, "main", `${tag} main: enters main`);
    for (const p of afterRob.players) {
      if (p.id === afterRob.current) continue;
      eq(chooseBotAction(afterRob, p.id), null, `${tag} main: non-current ${p.id} returns null`);
    }
    const over = { ...afterRob, phase: "over", winner: afterRob.current };
    for (const p of over.players) {
      eq(chooseBotAction(over, p.id), null, `${tag} over: ${p.id} returns null`);
    }
  }

  // 2. offerTrade empty-bag refusal parity (classic 3-4 seat and expanded 5-6 seat).
  for (const seats of [3, 4, 5, 6]) {
    reseed(2700 + seats);
    let g = createAnyGame({ seed: 2700 + seats, humans: [], bots: seats });
    while (g.phase !== "roll") g = act(g, g.current, chooseBotAction(g, g.current), `${seats}p setup`);
    queue.push(1, 2);
    g = act(g, g.current, { type: "roll" }, `${seats}p roll`);
    const me = g.players.find((p) => p.id === g.current);
    const target = g.players.find((p) => p.id !== g.current);
    me.resources.timber = Math.max(me.resources.timber, 2);
    target.resources.clay = Math.max(target.resources.clay, 2);

    refuse(g, me.id, { type: "offerTrade", to: target.id, give: {}, want: {} }, "Offer something.", `${seats}p empty bags`);
    refuse(
      g,
      me.id,
      { type: "offerTrade", to: target.id, give: { timber: 0, clay: 0 }, want: { wool: 0, grain: 0, ore: 0 } },
      "Offer something.",
      `${seats}p all-zero bags`,
    );

    // Non-empty offers (two-way, one-sided gift, one-sided ask) still succeed, matching host.mjs & store.ts.
    const twoWay = act(g, me.id, { type: "offerTrade", to: target.id, give: { timber: 1 }, want: { clay: 1 } }, `${seats}p two-way`);
    eq(twoWay.trade, { from: me.id, to: target.id, give: { timber: 1 }, want: { clay: 1 } }, `${seats}p two-way trade stored`);
    const gift = act(g, me.id, { type: "offerTrade", to: target.id, give: { timber: 1 }, want: {} }, `${seats}p gift`);
    eq(gift.trade, { from: me.id, to: target.id, give: { timber: 1 }, want: {} }, `${seats}p gift stored`);
    const ask = act(g, me.id, { type: "offerTrade", to: target.id, give: {}, want: { clay: 1 } }, `${seats}p ask`);
    eq(ask.trade, { from: me.id, to: target.id, give: {}, want: { clay: 1 } }, `${seats}p ask stored`);

    // On expanded partner turns, PARTNER_NO_TRADE still refuses before bag checks.
    if (seats >= 5) {
      const partnerState = act(g, me.id, { type: "endTurn" }, `${seats}p enter partner`);
      eq(partnerState.role, "partner", `${seats}p partner role`);
      const partner = partnerState.current;
      const other = partnerState.players.find((p) => p.id !== partner).id;
      refuse(partnerState, partner, { type: "offerTrade", to: other, give: {}, want: {} }, PARTNER_NO_TRADE, `${seats}p partner empty offer`);
    }
  }

  // 3. Expanded 5-6 seat random tokens, winnerFirst roll-offs, and 6-seat short-bank production.
  for (let seed = 1; seed <= 50; seed++) {
    const g = createExpandedGame({ seed, humans: [], bots: 6, numberTokens: "random" });
    const land = g.hexes.filter((h) => h.terrain !== "waste");
    const wastes = g.hexes.filter((h) => h.terrain === "waste");
    eq(land.length, 28, `random expanded seed ${seed}: 28 land hexes`);
    eq(wastes.length, 2, `random expanded seed ${seed}: 2 wastes`);
    ok(land.every((h) => Number.isInteger(h.pip) && h.pip >= 2 && h.pip <= 12 && h.pip !== 7), `random expanded seed ${seed}: valid pips`);
    ok(wastes.every((h) => h.pip === null), `random expanded seed ${seed}: wastes have null pip`);
    for (const h of land) {
      if (h.pip !== 6 && h.pip !== 8) continue;
      for (const [dq, dr] of AXIAL_DIRS) {
        const nb = g.hexes.find((x) => x.q === h.q + dq && x.r === h.r + dr);
        ok(!(nb && (nb.pip === 6 || nb.pip === 8)), `random expanded seed ${seed}: no adjacent 6/8`);
      }
    }
  }

  for (const seats of [5, 6]) {
    reseed(3700 + seats);
    const prevPlayers = Array.from({ length: seats }, (_, i) => ({
      name: `Seat${i + 1}`,
      seat: seats - i,
      color: `#${String(i + 1).repeat(6)}`,
    }));
    let g = createExpandedGame({ seed: 3700 + seats, humans: prevPlayers, bots: 0, winnerFirst: true });
    eq(g.rollOff.first, "p0", `${seats}p winnerFirst: p0 sits out`);
    eq(g.current, "p1", `${seats}p winnerFirst: p1 rolls first`);
    eq(g.players.map((p) => p.seat), prevPlayers.map((p) => p.seat), `${seats}p winnerFirst: seats preserved`);
    eq(g.players.map((p) => p.color), prevPlayers.map((p) => p.color), `${seats}p winnerFirst: colors preserved`);
    refuse(g, "p0", { type: "roll" }, "Not your turn.", `${seats}p winnerFirst: p0 cannot roll`);
    while (g.phase === "rollOff") g = act(g, g.current, { type: "roll" }, `${seats}p winnerFirst rollOff`);
    eq([g.phase, g.players[0].id, g.current], ["setupSettle", "p0", "p0"], `${seats}p winnerFirst: p0 places first`);
  }

  // 6-seat bank exhaustion: single owed seat takes remainder; two owed seats trigger bankShort.
  {
    const g = createExpandedGame({ seed: 42, humans: [], bots: 6 });
    g.phase = "roll";
    g.current = "p0";
    g.primary = "p0";
    g.role = "primary";
    g.activation = 1;
    for (const v of g.vertices) v.building = null;
    const h = g.hexes.find((x) => x.terrain !== "waste" && !x.blocked && x.pip !== null && x.pip >= 3 && x.pip <= 11);
    const res = h.terrain;
    const corners = g.vertices.filter((v) => v.hexes.includes(h.id));
    // Single player owed 2 with 1 in bank takes the last card; bank is not reported short.
    const single = structuredClone(g);
    single.vertices.find((v) => v.id === corners[0].id).building = { playerId: "p0", kind: "stronghold" };
    single.bank[res] = 1;
    single.players[5].resources[res] = EXPANDED_BANK - 1;
    const d1 = Math.min(6, h.pip - 1);
    queue.push(d1, h.pip - d1);
    const singleAfter = act(single, "p0", { type: "roll" }, "6p single owed short bank");
    eq(singleAfter.players[0].resources[res], 1, "6p single owed takes last card");
    eq(singleAfter.bank[res], 0, "6p bank empties to 0");
    eq(bankShort(singleAfter), [], "6p single owed not reported short");
    eq(singleAfter.bank[res] + singleAfter.players.reduce((n, p) => n + p.resources[res], 0), EXPANDED_BANK, "6p supply conserved");

    // Two players owed 2 total with 1 in bank: nobody gathers it and bankShort reports res.
    const multi = structuredClone(g);
    multi.vertices.find((v) => v.id === corners[0].id).building = { playerId: "p0", kind: "outpost" };
    multi.vertices.find((v) => v.id === corners[2].id).building = { playerId: "p1", kind: "outpost" };
    multi.bank[res] = 1;
    multi.players[5].resources[res] = EXPANDED_BANK - 1;
    queue.push(d1, h.pip - d1);
    const multiAfter = act(multi, "p0", { type: "roll" }, "6p multi owed short bank");
    eq(multiAfter.players[0].resources[res], 0, "6p multi short bank pays p0 nothing");
    eq(multiAfter.players[1].resources[res], 0, "6p multi short bank pays p1 nothing");
    eq(multiAfter.bank[res], 1, "6p multi short bank keeps 1");
    ok(bankShort(multiAfter).includes(res), "6p multi short bank reports resource");
    eq(multiAfter.bank[res] + multiAfter.players.reduce((n, p) => n + p.resources[res], 0), EXPANDED_BANK, "6p multi supply conserved");
  }

  console.log(`engine-guards-prove: ok (${checks} checks)`);
} finally {
  crypto.getRandomValues = realRandom;
}
