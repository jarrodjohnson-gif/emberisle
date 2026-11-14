// #1605: paired turns for five and six seat games (docs/design/six-players.md, "Rules, setup, turns, and scoring";
// accepted decision 1), and classic turn parity. Node only: it imports the rules directly, like expanded-board-prove.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, playable, totalVP } from "../src/lib/game/rules.ts";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { EXPANDED_BANK, PARTNER_NO_TRADE, createAnyGame } from "../src/lib/game/expanded.ts";

const RES = ["timber", "clay", "wool", "grain", "ore"];
const BOUGHT = "A fortune cannot be played the turn it is bought.";
let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  checks++;
};

// Dice: rollDie reads crypto.getRandomValues. Queued faces come first; otherwise a seeded xorshift keeps runs repeatable.
const queue = [];
let s = 1;
const word = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
const realRandom = crypto.getRandomValues;
crypto.getRandomValues = (buf) => {
  for (let i = 0; i < buf.length; i++) buf[i] = queue.length ? queue.shift() - 1 : word();
  return buf;
};
const reseed = (seed) => { s = (Math.imul(seed + 1, 2654435761) >>> 0) || 1; queue.length = 0; };

function act(g, actor, action, msg) {
  const r = applyAction(g, actor, action);
  assert.equal(r.error, undefined, `${msg ?? action.type}: ${r.error}`);
  checks++;
  return r.state;
}
function refuse(g, actor, action, error, msg) {
  const r = applyAction(g, actor, action);
  eq(r.error, error, msg);
  eq(r.state, g, `${msg}: state unchanged`);
}
const pos = (g, id) => g.players.findIndex((p) => p.id === id);
const who = (g, id) => g.players.find((p) => p.id === id);
const hand = (p) => RES.reduce((n, r) => n + p.resources[r], 0);
// Move goods from the bank into a hand, so the supply stays whole.
function grant(g, pid, bag) {
  g = structuredClone(g);
  for (const [r, n] of Object.entries(bag)) {
    who(g, pid).resources[r] += n;
    g.bank[r] -= n;
  }
  return g;
}
// Put a fortune of `kind` on top of the deck.
function stack(g, kind) {
  g = structuredClone(g);
  g.deck.splice(g.deck.indexOf(kind), 1);
  g.deck.unshift(kind);
  return g;
}
function supplyWhole(g, msg) {
  for (const r of RES) eq(g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0), EXPANDED_BANK, `${msg}: ${r} supply`);
}
function roll(g, a, b, msg) {
  queue.push(a, b);
  const next = act(g, g.current, { type: "roll" }, msg);
  eq(queue.length, 0, `${msg}: dice used`);
  return next;
}

// 1. Setup: the roll-off, then the snake 1..n then n..1, with goods from the second outpost only.
function setUp(seats, seed) {
  reseed(seed);
  let g = createAnyGame({ seed, humans: [], bots: seats });
  eq(g.variant.turns, { rule: "paired", version: 1 }, `${seats} seats: the turn rule is fixed before setup`);
  eq([g.primary, g.role, g.activation], [undefined, undefined, undefined], `${seats} seats: no actor fields before setup`);
  while (g.phase === "rollOff") g = act(g, g.current, { type: "roll" }, "roll-off");
  eq(g.phase, "setupSettle", `${seats} seats: the roll-off ends in setup`);
  const order = [];
  while (g.phase === "setupSettle" || g.phase === "setupRoad") {
    const actor = g.current;
    const action = chooseBotAction(g, actor);
    const before = g;
    g = act(g, actor, action, `setup ${action.type}`);
    if (action.type !== "setupSettle") continue;
    order.push(pos(before, actor));
    const second = before.setupIndex >= seats;
    const want = Object.fromEntries(RES.map((r) => [r, 0]));
    if (second) {
      const v = before.vertices.find((x) => x.id === action.vertexId);
      for (const hid of v.hexes) {
        const h = before.hexes.find((x) => x.id === hid);
        if (h.terrain !== "waste") want[h.terrain] += 1;
      }
    }
    for (const p of g.players) {
      const was = who(before, p.id);
      const got = Object.fromEntries(RES.map((r) => [r, p.resources[r] - was.resources[r]]));
      eq(got, p.id === actor ? want : Object.fromEntries(RES.map((r) => [r, 0])), `${seats} seats: setup outpost ${order.length} goods for ${p.id}`);
    }
    if (second) ok(hand(who(g, actor)) > 0 || Object.values(want).every((n) => n === 0), `${seats} seats: second outpost pays`);
  }
  const snake = [...Array(seats).keys()];
  eq(order, [...snake, ...snake.slice().reverse()], `${seats} seats: setup order ${seats === 6 ? "1-2-3-4-5-6-6-5-4-3-2-1" : "1-2-3-4-5-5-4-3-2-1"}`);
  eq([g.phase, g.current, g.primary, g.role, g.activation, g.turn], ["roll", g.players[0].id, g.players[0].id, "primary", 1, 1], `${seats} seats: the first primary activation`);
  supplyWhole(g, `${seats} seats after setup`);
  return g;
}

const starts = {};
for (const seats of [5, 6]) starts[seats] = setUp(seats, 1605 + seats);

// 2. The full activation cycle, over more than two rounds: who is current and primary, the role, and when `turn` rises.
for (const seats of [5, 6]) {
  let g = starts[seats];
  const tag = `${seats} seats`;
  let rolls = g.rolls;
  for (let k = 0; k < seats * 2 + 2; k++) {
    const i = k % seats;
    const P = g.players[i].id;
    const R = g.players[(i + 3) % seats].id;
    const turn = 1 + Math.floor(k / seats);
    const act0 = 1 + 2 * k;
    eq([g.current, g.primary, g.role, g.phase, g.turn, g.activation], [P, P, "primary", "roll", turn, act0], `${tag}: primary activation ${k}`);
    // A primary must roll before anything else; nobody else may act.
    refuse(g, P, { type: "endTurn" }, "Finish your turn first.", `${tag}: primary ${k} cannot end before rolling`);
    refuse(g, P, { type: "buyCard" }, "Cannot buy now.", `${tag}: primary ${k} cannot buy before rolling`);
    refuse(g, R, { type: "roll" }, "Not your turn.", `${tag}: the partner cannot roll for the primary`);
    g = roll(g, 1, 4, `${tag}: primary ${k} rolls`);
    eq(g.rolls, ++rolls, `${tag}: a primary roll counts`);
    eq(g.phase, "main", `${tag}: primary ${k} acts after the roll`);
    refuse(g, P, { type: "roll" }, "Cannot roll now.", `${tag}: primary ${k} rolls once`);
    const dice = g.dice;
    g = act(g, P, { type: "endTurn" }, `${tag}: primary ${k} ends`);
    eq([g.current, g.primary, g.role, g.phase, g.turn, g.activation], [R, P, "partner", "main", turn, act0 + 1], `${tag}: partner activation ${k}`);
    eq(g.dice, dice, `${tag}: the primary's dice stay for the paired turn`);
    eq(g.discardNeeded, {}, `${tag}: no discard on a partner activation`);
    refuse(g, R, { type: "roll" }, "Cannot roll now.", `${tag}: partner ${k} cannot roll`);
    refuse(g, P, { type: "endTurn" }, "Not your turn.", `${tag}: the primary cannot act during its partner's activation`);
    const before = g.players.map((p) => p.resources);
    // A partner may end at once, without acting.
    g = act(g, R, { type: "endTurn" }, `${tag}: partner ${k} ends`);
    eq(g.players.map((p) => p.resources), before, `${tag}: a partner activation produces nothing`);
    eq(g.rolls, rolls, `${tag}: a partner activation never rolls`);
    eq(g.dice, null, `${tag}: the next primary rolls fresh`);
    eq(g.primary, g.players[(i + 1) % seats].id, `${tag}: the dice pass one seat after both finish`);
  }
  eq(g.turn, 3, `${tag}: two full rounds raise turn twice`);
}

// 3. Production and sevens only on primary activations: discard, wayfarer and steal, then a partner with a full hand.
for (const seats of [5, 6]) {
  const tag = `${seats} seats`;
  let g = starts[seats];
  const P = g.players[0].id;
  const R = g.players[3 % seats].id;
  const V = g.players[1].id;
  // A paying roll: the token on a hex next to a starting outpost.
  const built = g.vertices.find((v) => v.building && v.hexes.some((h) => { const x = g.hexes.find((y) => y.id === h); return x.pip && x.pip !== 7 && !x.blocked; }));
  const paying = g.hexes.find((h) => built.hexes.includes(h.id) && h.pip && !h.blocked).pip;
  const before = structuredClone(g);
  g = roll(g, Math.min(6, paying - 1), paying - Math.min(6, paying - 1), `${tag}: a paying primary roll`);
  ok(g.lastProduction.length > 0, `${tag}: the primary's roll pays`);
  ok(g.players.some((p) => hand(p) > hand(who(before, p.id))), `${tag}: hands grow on a primary roll`);
  // A seven on the next primary: V holds nine cards and discards four, then the wayfarer moves and steals.
  g = act(g, P, { type: "endTurn" });
  g = act(g, R, { type: "endTurn" });
  eq(g.current, V, `${tag}: V is the next primary`);
  const VP = g.players[(1 + 3) % seats].id;
  g = grant(g, V, { timber: 3, clay: 3, wool: 3 });
  const vHand = hand(who(g, V));
  g = roll(g, 3, 4, `${tag}: a primary rolls 7`);
  eq(g.phase, "discard", `${tag}: a primary's 7 opens the discard`);
  eq(g.discardNeeded[V], Math.floor(vHand / 2), `${tag}: the primary discards half`);
  const discard = {};
  let left = g.discardNeeded[V];
  for (const r of RES) { const n = Math.min(left, who(g, V).resources[r]); if (n) discard[r] = n; left -= n; }
  for (const [pid, n] of Object.entries(g.discardNeeded)) {
    if (pid === V) continue;
    g = act(g, pid, chooseBotAction(g, pid), `${tag}: ${pid} discards ${n}`);
  }
  g = act(g, V, { type: "discard", resources: discard }, `${tag}: V discards`);
  eq(g.phase, "robber", `${tag}: the wayfarer moves after the discard`);
  const victimHex = g.hexes.find((h) => h.id !== g.robberHex && g.vertices.some((v) => v.hexes.includes(h.id) && v.building && v.building.playerId !== V && hand(who(g, v.building.playerId)) > 0));
  const victim = g.vertices.find((v) => v.hexes.includes(victimHex.id) && v.building && v.building.playerId !== V && hand(who(g, v.building.playerId)) > 0).building.playerId;
  const vBefore = hand(who(g, V));
  g = act(g, V, { type: "moveRobber", hexId: victimHex.id, stealFrom: victim }, `${tag}: the wayfarer moves and steals`);
  eq([g.phase, g.role, hand(who(g, V))], ["main", "primary", vBefore + 1], `${tag}: the steal lands on the primary activation`);
  // The partner starts with eight cards in hand: still no discard, no roll, no production.
  g = grant(g, VP, { grain: 4, ore: 4 });
  const atPartner = structuredClone(g);
  g = act(g, V, { type: "endTurn" });
  eq([g.current, g.role, g.phase], [VP, "partner", "main"], `${tag}: the partner enters the action phase`);
  ok(hand(who(g, VP)) > 7, `${tag}: the partner holds more than seven`);
  eq(g.discardNeeded, {}, `${tag}: a partner activation creates no discard`);
  eq(g.players.map((p) => p.resources), atPartner.players.map((p) => p.resources), `${tag}: starting a partner activation moves no goods`);
  eq(g.rolls, atPartner.rolls, `${tag}: no roll on a partner activation`);
  supplyWhole(g, `${tag} after the seven`);
}

// 4. Player trades: allowed on a primary activation, refused on a partner activation, including stale offers; offers
// close before either actor changes.
for (const seats of [5, 6]) {
  const tag = `${seats} seats`;
  let g = grant(starts[seats], starts[seats].players[0].id, { wool: 2 });
  const [P, X] = [g.players[0].id, g.players[1].id];
  const R = g.players[3 % seats].id;
  g = grant(g, R, { grain: 2 });
  g = grant(g, X, { ore: 2 });
  g = roll(g, 1, 1, `${tag}: primary rolls`);
  g = act(g, P, { type: "offerTrade", to: R, give: { wool: 1 }, want: { grain: 1 } }, `${tag}: the primary may offer`);
  ok(g.trade, `${tag}: the offer is open`);
  g = act(g, P, { type: "endTurn" });
  eq([g.current, g.trade], [R, null], `${tag}: the offer closes before the partner acts`);
  refuse(g, R, { type: "offerTrade", to: X, give: { grain: 1 }, want: { ore: 1 } }, PARTNER_NO_TRADE, `${tag}: a partner cannot offer`);
  const stale = structuredClone(g);
  stale.trade = { from: P, to: R, give: { wool: 1 }, want: { grain: 1 } };
  refuse(stale, R, { type: "respondTrade", accept: true }, PARTNER_NO_TRADE, `${tag}: a partner cannot accept a stale offer`);
  const stale2 = structuredClone(g);
  stale2.trade = { from: R, to: X, give: { grain: 1 }, want: { ore: 1 } };
  refuse(stale2, X, { type: "respondTrade", accept: true }, PARTNER_NO_TRADE, `${tag}: nobody accepts the partner's stale offer`);
  const declined = act(stale, R, { type: "respondTrade", accept: false }, `${tag}: a stale offer may be declined`);
  eq(declined.trade, null, `${tag}: the decline clears it`);
  // A bank trade is fine for a partner.
  const banked = act(grant(g, R, { grain: 2 }), R, { type: "bankTrade", give: "grain", want: "ore" }, `${tag}: a partner may trade with the bank`);
  eq(banked.role, "partner", `${tag}: still the partner after a bank trade`);
  const next = act(stale, R, { type: "endTurn" });
  eq([next.current, next.role, next.trade], [g.players[1].id, "primary", null], `${tag}: an open offer closes when the partner ends`);
}

// 5. One fortune per activation, and purchases locked only for the activation they were bought in, for both roles.
for (const seats of [5, 6]) {
  const tag = `${seats} seats`;
  let g = starts[seats];
  const P = g.players[0].id;
  const advanceTo = (g, pid, role) => {
    for (let guard = 0; guard < 4 * seats; guard++) {
      if (g.current === pid && g.role === role) return g;
      eq(g.current === pid, false, `${tag}: ${pid} does not act out of turn`);
      if (g.phase === "roll") g = roll(g, 1, 1, `${tag}: filler roll`);
      g = act(g, g.current, { type: "endTurn" }, `${tag}: filler end`);
      eq(g.playedCard, false, `${tag}: playedCard resets at each activation`);
    }
    throw new Error(`${pid} never became ${role}`);
  };
  // As primary: buy a knight, which cannot be played now.
  g = roll(g, 1, 1, `${tag}: P rolls`);
  g = stack(grant(g, P, { wool: 2, grain: 2, ore: 2 }), "knight");
  g = act(g, P, { type: "buyCard" }, `${tag}: P buys a knight as primary`);
  const hexId = g.hexes.find((h) => h.id !== g.robberHex && !g.vertices.some((v) => v.hexes.includes(h.id) && v.building)).id;
  refuse(g, P, { type: "playKnight", hexId, stealFrom: null }, BOUGHT, `${tag}: a knight bought as primary waits`);
  g = act(g, P, { type: "endTurn" });
  eq(who(g, P).boughtThisTurn.knight, 1, `${tag}: the lock holds until P's next activation`);
  // P's next activation is as a partner: the knight is playable now, one fortune only, and a fresh plenty waits.
  g = advanceTo(g, P, "partner");
  eq([who(g, P).boughtThisTurn.knight, playable(who(g, P), "knight"), g.playedCard], [0, 1, false], `${tag}: the lock expires at P's partner activation`);
  g = stack(g, "plenty");
  g = act(g, P, { type: "buyCard" }, `${tag}: P buys plenty as partner`);
  refuse(g, P, { type: "playPlenty", resources: ["grain", "ore"] }, BOUGHT, `${tag}: plenty bought as partner waits`);
  g = act(g, P, { type: "playKnight", hexId, stealFrom: null }, `${tag}: P plays the knight as partner`);
  eq([g.playedCard, g.role, g.phase, g.robberHex], [true, "partner", "main", hexId], `${tag}: the partner's knight moves the wayfarer`);
  g = stack(grant(g, P, { wool: 1, grain: 1, ore: 1 }), "knight");
  g = act(g, P, { type: "buyCard" }, `${tag}: P buys a second knight as partner`);
  // A second fortune in the same activation is refused.
  refuse(g, P, { type: "playKnight", hexId: g.hexes.find((h) => h.id !== g.robberHex).id, stealFrom: null }, "Already played a fortune.", `${tag}: one fortune per activation`);
  g = act(g, P, { type: "endTurn" });
  eq([who(g, P).boughtThisTurn.plenty, who(g, P).boughtThisTurn.knight], [1, 1], `${tag}: partner purchases stay locked after the activation`);
  // And the reverse: P's next activation is as primary, where the plenty bought as partner is playable.
  g = advanceTo(g, P, "primary");
  eq([who(g, P).boughtThisTurn.plenty, playable(who(g, P), "plenty"), g.playedCard], [0, 1, false], `${tag}: the lock expires at P's primary activation`);
  g = roll(g, 1, 1, `${tag}: P rolls as primary`);
  const grainBefore = who(g, P).resources.grain;
  g = act(g, P, { type: "playPlenty", resources: ["grain", "grain"] }, `${tag}: plenty bought as partner plays as primary`);
  eq(who(g, P).resources.grain, grainBefore + 2, `${tag}: plenty pays`);
  supplyWhole(g, `${tag} after the fortunes`);
}

// 6. Victory at once, for a primary and for a partner; then no activation follows. Also an award won at activation start.
for (const seats of [5, 6]) {
  const tag = `${seats} seats`;
  const nine = (g, pid) => {
    g = structuredClone(g);
    who(g, pid).hidden.vp = 0;
    who(g, pid).hidden.vp = 9 - totalVP(g, pid);
    return g;
  };
  let g = starts[seats];
  const P = g.players[0].id;
  const R = g.players[3 % seats].id;
  const outpostOf = (g, pid) => g.vertices.find((v) => v.building?.playerId === pid && v.building.kind === "outpost").id;
  // The primary.
  let a = roll(nine(g, P), 1, 1, `${tag}: P rolls`);
  a = grant(a, P, { grain: 3, ore: 2 });
  a = act(a, P, { type: "buildStronghold", vertexId: outpostOf(a, P) }, `${tag}: P builds the winning stronghold`);
  eq([a.phase, a.winner, a.winReason.trigger, a.winReason.points, a.current, a.role], ["over", P, "stronghold", 10, P, "primary"], `${tag}: the primary wins at once`);
  refuse(a, P, { type: "endTurn" }, "The game is over.", `${tag}: no partner activation after the primary wins`);
  // The partner.
  let b = roll(nine(g, R), 1, 1, `${tag}: P rolls`);
  b = act(b, P, { type: "endTurn" });
  b = grant(b, R, { grain: 3, ore: 2 });
  b = act(b, R, { type: "buildStronghold", vertexId: outpostOf(b, R) }, `${tag}: the partner builds the winning stronghold`);
  eq([b.phase, b.winner, b.winReason.trigger, b.current, b.primary, b.role], ["over", R, "stronghold", R, P, "partner"], `${tag}: the partner wins at once`);
  refuse(b, R, { type: "endTurn" }, "The game is over.", `${tag}: the dice never advance after the partner wins`);
  // A fortune point bought as partner also wins at once.
  let c = roll(nine(g, R), 1, 1, `${tag}: P rolls`);
  c = act(c, P, { type: "endTurn" });
  c = act(stack(grant(c, R, { wool: 1, grain: 1, ore: 1 }), "vp"), R, { type: "buyCard" }, `${tag}: the partner draws a point`);
  eq([c.phase, c.winner, c.winReason.trigger], ["over", R, "pointFortune"], `${tag}: a partner's point fortune wins at once`);
  // Ten points reached while another seat acted win as that seat's activation starts.
  let d = roll(g, 1, 1, `${tag}: P rolls`);
  d = structuredClone(d);
  who(d, R).hidden.vp = 10 - totalVP(d, R) + who(d, R).hidden.vp;
  d = act(d, P, { type: "endTurn" });
  eq([d.phase, d.winner, d.winReason.trigger, d.current, d.role], ["over", R, "turnStart", R, "partner"], `${tag}: a partner wins as its activation starts`);
}

// 7. Classic parity: three and four seat games through applyAction, a scripted sequence of bot moves, offers, answers and
// refused out-of-turn moves, with seeded dice. The hashes were generated from origin/main af826235 (before this change)
// with a throwaway script holding this same classicScript; each run hashes every action, its error and the state after.
function classicScript({ createGame, applyAction, chooseBotAction }, seats, seed, steps) {
  let s = (Math.imul(seed + 1, 2654435761) >>> 0) || 1;
  const word = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  const original = crypto.getRandomValues;
  crypto.getRandomValues = (buf) => { for (let i = 0; i < buf.length; i++) buf[i] = word(); return buf; };
  try {
    let g = createGame({ seed, humans: [], bots: seats, victoryTarget: seed % 2 ? 7 : 10 });
    const h = createHash("sha256");
    let i = 0, errors = 0, trades = 0;
    for (; i < steps && g.phase !== "over"; i++) {
      let actor, action;
      if (g.trade) {
        const me = g.players.find((p) => p.id === g.trade.to);
        actor = me.id;
        action = { type: "respondTrade", accept: i % 3 !== 0 && RES.every((r) => me.resources[r] >= (g.trade.want[r] ?? 0)) };
      } else if (g.phase === "discard") {
        actor = Object.keys(g.discardNeeded)[0];
        action = chooseBotAction(g, actor);
      } else if (i % 11 === 0) {
        // A seat that is not current tries to act: the rules refuse it.
        actor = g.players.find((p) => p.id !== g.current).id;
        action = i % 2 ? { type: "roll" } : { type: "endTurn" };
      } else {
        actor = g.current;
        const at = g.players.findIndex((p) => p.id === actor);
        const me = g.players[at];
        const give = RES.find((r) => me.resources[r] > 0);
        const want = RES.find((r) => r !== give);
        if (g.phase === "main" && i % 5 === 0 && give) {
          action = { type: "offerTrade", to: g.players[(at + 1) % g.players.length].id, give: { [give]: 1 }, want: { [want]: 1 } };
        } else action = chooseBotAction(g, actor) ?? { type: "endTurn" };
      }
      const r = applyAction(g, actor, action);
      if (r.error) errors++;
      if (!r.error && action.type === "respondTrade" && action.accept) trades++;
      h.update(JSON.stringify([actor, action, r.error ?? null]));
      g = r.state;
      h.update(JSON.stringify(g));
    }
    return { hash: h.digest("hex").slice(0, 16), steps: i, errors, trades, phase: g.phase, turn: g.turn, final: g };
  } finally {
    crypto.getRandomValues = original;
  }
}
const mainRuns = [{"seats":3,"seed":0,"hash":"7540fdca064687dc","steps":600,"errors":45,"trades":13,"phase":"main","turn":48},{"seats":3,"seed":1,"hash":"2616a78f69166a41","steps":355,"errors":28,"trades":12,"phase":"over","turn":26},{"seats":3,"seed":7,"hash":"157d9ae6c4e11e87","steps":214,"errors":17,"trades":9,"phase":"over","turn":16},{"seats":3,"seed":42,"hash":"2e5d3759e35ff0f8","steps":432,"errors":33,"trades":7,"phase":"over","turn":31},{"seats":3,"seed":1049,"hash":"dc8cf59365c31ccc","steps":218,"errors":18,"trades":6,"phase":"over","turn":16},{"seats":3,"seed":20261113,"hash":"f6856f946ffc7ff0","steps":324,"errors":28,"trades":4,"phase":"over","turn":25},{"seats":4,"seed":0,"hash":"211942b8691f9377","steps":442,"errors":36,"trades":21,"phase":"over","turn":24},{"seats":4,"seed":1,"hash":"ec6e5084f29e747c","steps":405,"errors":34,"trades":20,"phase":"over","turn":21},{"seats":4,"seed":7,"hash":"c8eb002ba4488e54","steps":414,"errors":33,"trades":8,"phase":"over","turn":23},{"seats":4,"seed":42,"hash":"54ba484bff789aba","steps":479,"errors":40,"trades":7,"phase":"over","turn":26},{"seats":4,"seed":1049,"hash":"9df7ede75bd25ae4","steps":284,"errors":25,"trades":11,"phase":"over","turn":15},{"seats":4,"seed":20261113,"hash":"d2abdb441075272b","steps":248,"errors":22,"trades":1,"phase":"over","turn":14}];
let classicActions = 0;
for (const want of mainRuns) {
  const { final, ...got } = classicScript({ createGame, applyAction, chooseBotAction }, want.seats, want.seed, 600);
  eq({ seats: want.seats, seed: want.seed, ...got }, want, `classic parity, ${want.seats} seats, seed ${want.seed}`);
  ok(got.steps >= 30, `classic parity, ${want.seats} seats, seed ${want.seed}: at least 30 actions`);
  eq(["variant", "primary", "role", "activation"].filter((k) => k in final), [], `classic ${want.seats} seats, seed ${want.seed}: no paired-turn fields`);
  classicActions += got.steps;
}
// classicScript put the queued dice back when it finished.

// 8. Seeded full games with today's bots in every seat, primary and partner alike, to a win or a cap. Every action
// chooseBotAction picks is legal, and the paired-turn state holds after every step.
const CAP = 6000;
let fullGames = 0, finished = 0, fullActions = 0, partnerActions = 0;
for (const seats of [5, 6]) for (let seed = 0; seed < 12; seed++) {
  const tag = `bots, ${seats} seats, seed ${seed}`;
  reseed(seed);
  let g = createAnyGame({ seed, humans: [], bots: seats, victoryTarget: seed % 3 ? 10 : 7, wayfarerMode: seed % 4 === 3 ? "off" : "on" });
  let wraps = 0;
  for (let step = 0; step < CAP && g.phase !== "over"; step++) {
    const actor = g.phase === "discard" ? Object.keys(g.discardNeeded)[0] : g.current;
    const action = chooseBotAction(g, actor);
    assert.ok(action, `${tag}: a bot action at step ${step}`);
    const prev = g;
    const r = applyAction(prev, actor, action);
    assert.equal(r.error, undefined, `${tag}: step ${step} ${action.type} by ${actor} (${prev.role ?? "setup"}): ${r.error}`);
    g = r.state;
    fullActions++;
    if (prev.role === "partner") partnerActions++;
    // Invariants.
    for (const res of RES) assert.equal(g.bank[res] + g.players.reduce((n, p) => n + p.resources[res], 0), EXPANDED_BANK, `${tag}: ${res} supply`);
    if (!g.role) continue;
    const at = pos(g, g.primary);
    assert.equal(g.current, g.role === "primary" ? g.primary : g.players[(at + 3) % seats].id, `${tag}: current matches the role`);
    if (g.role === "partner") {
      assert.ok(g.phase === "main" || g.phase === "over", `${tag}: a partner is only ever in the action phase (${g.phase})`);
      assert.deepEqual(g.discardNeeded, {}, `${tag}: no discard on a partner activation`);
      assert.equal(g.rolls, prev.rolls, `${tag}: a partner never rolls`);
    }
    if (prev.role && g.current !== prev.current) {
      assert.equal(g.activation, prev.activation + 1, `${tag}: one activation per actor change`);
      assert.equal(g.trade, null, `${tag}: offers close when the actor changes`);
      assert.equal(g.playedCard, false, `${tag}: playedCard resets`);
      assert.deepEqual(Object.values(who(g, g.current).boughtThisTurn), [0, 0, 0, 0, 0], `${tag}: the new actor's lock expires`);
      if (g.role === "primary" && pos(g, g.primary) === 0) wraps++;
    }
    assert.equal(g.turn, 1 + wraps, `${tag}: turn rises only when the primary wraps to the first seat`);
  }
  checks++;
  fullGames++;
  if (g.phase === "over") {
    finished++;
    eq(totalVP(g, g.winner) >= (seed % 3 ? 10 : 7), true, `${tag}: the winner has the points`);
    eq(g.winner, g.current, `${tag}: the acting seat wins`);
  }
}
ok(finished > 0, "some bot games finish");
ok(partnerActions > 0, "bots act on partner activations");
crypto.getRandomValues = realRandom;

console.log(`expanded-turns-prove: 5 and 6 seats; ${mainRuns.length} classic parity games (${classicActions} actions); ${fullGames} bot games, ${finished} won within ${CAP} actions (${fullActions} actions, ${partnerActions} by partners); ${checks} checks passed`);
