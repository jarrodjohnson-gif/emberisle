// Hand-written logs for the roll-off order oracle (#1337). No browser.
// Run: npm run roll-off-oracle-prove
import assert from "node:assert/strict";
import { expectedRollOffOrder, rollOffOrderOk } from "./roll-off-oracle.mjs";

// Build a minimal game state to test rollOffOrderOk with a hand-written seated order.
function game(players, lines, rolls, seatedIds) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const seated = seatedIds.map((id) => byId.get(id));
  return {
    players: seated,
    current: seated[0].id,
    phase: "setupSettle",
    setupIndex: 0,
    log: lines,
    rollOff: { rolls, pending: [] },
  };
}

const ada = { name: "Ada", id: "p0" };
const bea = { name: "Bea", id: "p1" };
const cal = { name: "Cal", id: "p2" };

// 1. No tie. Three rollers, distinct dice.
{
  const lines = [
    "The isle is dealt. Roll for first place.",
    "Ada rolls a 2.",
    "Bea rolls a 5.",
    "Cal rolls a 4.",
    "Bea places first, then Cal and Ada.",
  ];
  const order = expectedRollOffOrder(lines, [ada, bea, cal]);
  assert.deepEqual(order, ["p1", "p2", "p0"], "no tie: highest die first, then the others by die descending");
  const g = game([ada, bea, cal], lines, { p0: 2, p1: 5, p2: 4 }, ["p1", "p2", "p0"]);
  assert.equal(rollOffOrderOk(g), true, "no tie: seated order passes");
}

// 2. Two-way tie for first, then a reroll that breaks it.
{
  const lines = [
    "Ada rolls a 4.",
    "Bea rolls a 4.",
    "Ada and Bea tie at 4 and roll again.",
    "Ada rolls a 2.",
    "Bea rolls a 6.",
    "Bea places first, then Ada.",
  ];
  const order = expectedRollOffOrder(lines, [ada, bea]);
  assert.deepEqual(order, ["p1", "p0"], "two-way tie: the reroll winner places first");
  const g = game([ada, bea], lines, { p0: 2, p1: 6 }, ["p1", "p0"]);
  assert.equal(rollOffOrderOk(g), true, "two-way tie: seated order passes");
}

// 3. A tie for the highest after an earlier elimination.
// Round 1: Ada, Bea and Cal tie at 5 and roll again.
// Round 2: Ada and Bea tie at 4; Cal rolls 2 and drops out.
// Round 3: Bea rolls 6, Ada rolls 3. Bea places first.
// Seated order by hand: winner (Bea: p1), reroll loser (Ada: p0), earlier out (Cal: p2).
{
  const lines = [
    "The isle is dealt. Roll for first place.",
    "Ada rolls a 5.",
    "Bea rolls a 5.",
    "Cal rolls a 5.",
    "Ada, Bea and Cal tie at 5 and roll again.",
    "Ada rolls a 4.",
    "Bea rolls a 4.",
    "Cal rolls a 2.",
    "Ada and Bea tie at 4 and roll again.",
    "Ada rolls a 3.",
    "Bea rolls a 6.",
    "Bea places first, then Ada and Cal.",
  ];
  const order = expectedRollOffOrder(lines, [ada, bea, cal]);
  assert.deepEqual(order, ["p1", "p0", "p2"], "tie after an earlier elimination: winner, reroll loser, then earlier out");
  const g = game([ada, bea, cal], lines, { p0: 3, p1: 6, p2: 2 }, ["p1", "p0", "p2"]);
  assert.equal(rollOffOrderOk(g), true, "tie after an earlier elimination: seated order passes");
}

// 4. Equal dice that are not the winner: join order puts the lower id first (p1 before p2).
// Cal is logged before Bea; both rolled 4. Sort is b.die - a.die || joinOrder(a.id) - joinOrder(b.id).
{
  const lines = [
    "Cal rolls a 4.",
    "Bea rolls a 4.",
    "Ada rolls a 5.",
    "Ada places first, then Bea and Cal.",
  ];
  const order = expectedRollOffOrder(lines, [ada, bea, cal]);
  assert.deepEqual(order, ["p0", "p1", "p2"], "equal dice: p1 before p2 by join order, not log order");
  const g = game([ada, bea, cal], lines, { p0: 5, p1: 4, p2: 4 }, ["p0", "p1", "p2"]);
  assert.equal(rollOffOrderOk(g), true, "join-order tie-break: seated order passes");
}

// 5. A passing state, then two player ids swapped in g.players, must be rejected.
{
  const lines = [
    "Ada rolls a 2.",
    "Bea rolls a 5.",
    "Cal rolls a 4.",
    "Bea places first, then Cal and Ada.",
  ];
  const g = game([ada, bea, cal], lines, { p0: 2, p1: 5, p2: 4 }, ["p1", "p2", "p0"]);
  assert.equal(rollOffOrderOk(g), true, "unswapped order passes");
  const wrong = structuredClone(g);
  [wrong.players[1], wrong.players[2]] = [wrong.players[2], wrong.players[1]];
  assert.deepEqual(wrong.players.map((p) => p.id), ["p1", "p0", "p2"], "two player ids swapped");
  assert.equal(rollOffOrderOk(wrong), false, "swapped player ids are rejected");
  assert.equal(rollOffOrderOk(g), true, "unswapped state is still true");
}

console.log("ok roll-off-oracle-prove");
