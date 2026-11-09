// #1338: Proof for heldRates, payingHexes and hiddenCount rules helpers.
// Proves:
// 1. heldRates returns [4], [4,3], [4,2] or [4,3,2] for a seat holding no dock,
//    a 3-for-1 dock, the matching 2-for-1 dock, or both.
// 2. payingHexes returns each paid hex once, and [] with no lastProduction.
// 3. hiddenCount sums the hidden counts.
// Run: npm run rules-view-helpers-prove
import assert from "node:assert/strict";
import { createGame } from "../src/lib/game/board.ts";
import { heldRates, payingHexes, hiddenCount } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";

const g = createGame({ seed: 42, humans: [{ name: "Ember" }], bots: 3 });
const p0 = g.players[0];

// --- 1. heldRates ---
// A seat with no buildings on docks has only the bank 4:1 rate for every resource.
const noHarborV = g.vertices.find((v) => !v.harbor);
assert.ok(noHarborV, "found vertex with no harbor");
noHarborV.building = { playerId: p0.id, kind: "outpost" };
for (const r of RESOURCES) {
  assert.deepEqual(heldRates(g, p0.id, r), [4], `no dock: ${r} rate is [4]`);
}
console.log("ok   heldRates: no dock returns [4] for all resources");

// A seat with a 3:1 dock (harbor === 'any') gets [4, 3] for every resource.
const anyHarborV = g.vertices.find((v) => v.harbor === "any");
assert.ok(anyHarborV, "found 3:1 harbor vertex");
anyHarborV.building = { playerId: p0.id, kind: "outpost" };
for (const r of RESOURCES) {
  assert.deepEqual(heldRates(g, p0.id, r), [4, 3], `3:1 dock: ${r} rate is [4, 3]`);
}
console.log("ok   heldRates: 3-for-1 dock returns [4, 3] for all resources");

// A seat with only a 2:1 dock (e.g. grain) gets [4, 2] for grain, and [4] for others.
noHarborV.building = undefined;
anyHarborV.building = undefined;
const grainHarborV = g.vertices.find((v) => v.harbor === "grain");
assert.ok(grainHarborV, "found grain 2:1 harbor vertex");
grainHarborV.building = { playerId: p0.id, kind: "outpost" };
assert.deepEqual(heldRates(g, p0.id, "grain"), [4, 2], "grain dock: grain rate is [4, 2]");
assert.deepEqual(heldRates(g, p0.id, "ore"), [4], "grain dock only: ore rate is [4]");
console.log("ok   heldRates: matching 2-for-1 dock returns [4, 2], others return [4]");

// A seat with both a 3:1 dock and a 2:1 dock gets [4, 3, 2] for the matching resource,
// and [4, 3] for all other resources.
anyHarborV.building = { playerId: p0.id, kind: "outpost" };
assert.deepEqual(heldRates(g, p0.id, "grain"), [4, 3, 2], "both docks: grain rate is [4, 3, 2]");
assert.deepEqual(heldRates(g, p0.id, "wool"), [4, 3], "both docks: wool rate is [4, 3]");
console.log("ok   heldRates: both 3-for-1 and 2-for-1 docks return [4, 3, 2]");

// Strongholds on docks also grant harbor rates.
grainHarborV.building = { playerId: p0.id, kind: "stronghold" };
assert.deepEqual(heldRates(g, p0.id, "grain"), [4, 3, 2], "stronghold on dock preserves rates");
console.log("ok   heldRates: stronghold on dock grants harbor rates");

// Opponent docks do not bleed into player rates.
const p1 = g.players[1];
assert.deepEqual(heldRates(g, p1.id, "grain"), [4], "opponent with no docks gets [4]");
console.log("ok   heldRates: opponent docks do not affect another player");

// --- 2. payingHexes ---
// Undefined or missing lastProduction returns []
delete g.lastProduction;
assert.deepEqual(payingHexes(g), [], "undefined lastProduction returns []");

// Empty lastProduction returns []
g.lastProduction = [];
assert.deepEqual(payingHexes(g), [], "empty lastProduction returns []");

// Grants for multiple players on the same hex and on distinct hexes return each paid hex once.
g.lastProduction = [
  { hex: "-1,0", player: "p0", resource: "grain", count: 1 },
  { hex: "-1,0", player: "p1", resource: "grain", count: 2 },
  { hex: "0,1", player: "p0", resource: "timber", count: 1 },
  { hex: "-1,0", player: "p2", resource: "grain", count: 1 },
  { hex: "1,-1", player: "p3", resource: "wool", count: 1 },
];
assert.deepEqual(payingHexes(g), ["-1,0", "0,1", "1,-1"], "each paid hex is returned exactly once without duplicates");
console.log("ok   payingHexes: returns unique paid hexes and [] without production");

// --- 3. hiddenCount ---
// Sums all hidden cards in the player's hand.
p0.hidden = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
assert.equal(hiddenCount(p0), 0, "all 0 hidden cards returns 0");

p0.hidden = { knight: 1, road: 0, plenty: 0, monopoly: 0, vp: 0 };
assert.equal(hiddenCount(p0), 1, "single knight returns 1");

p0.hidden = { knight: 3, road: 2, plenty: 1, monopoly: 1, vp: 2 };
assert.equal(hiddenCount(p0), 9, "sum across all hidden fortune types");
console.log("ok   hiddenCount: accurately sums player hidden cards");

console.log("rules-view-helpers-prove: all checks passed");
