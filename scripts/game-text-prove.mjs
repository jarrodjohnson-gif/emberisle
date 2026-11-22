// #1339: Node proof for bagText, fortuneBreakdown and wayfarerRules.
// Reads expected words from README Names section, not from code under test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bagText } from "../src/lib/game/trade.ts";
import { fortuneBreakdown, wayfarerRules, WAYFARER_EFFECT } from "../src/lib/game/fortunes.ts";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const namesMatch = readme.match(/^## Names\n[\s\S]*?^Say (.*)\. The window title is Emberisle\.$/m);
assert.ok(namesMatch, "README Names section must be present");

// Vocabulary from README Names: "wood, brick, sheep, wheat, stone, outpost, stronghold, path, fortune, and wayfarer"
const namesList = namesMatch[1]
  .split(/,\s*(?:and\s*)?/)
  .map((s) => s.trim());

const wood = namesList.find((w) => w === "wood");
const sheep = namesList.find((w) => w === "sheep");
const wayfarer = namesList.find((w) => w === "wayfarer");

assert.equal(wood, "wood", "README Names section has wood");
assert.equal(sheep, "sheep", "README Names section has sheep");
assert.equal(wayfarer, "wayfarer", "README Names section has wayfarer");

// bagText assertions
const expectedBag = `2 ${wood}, 1 ${sheep}`;
assert.equal(bagText({ timber: 2, wool: 1 }), expectedBag);
assert.equal(bagText({ timber: 2, wool: 1 }), "2 wood, 1 sheep");
assert.equal(bagText({}), "");

// fortuneBreakdown assertions
const hand = {
  hidden: { knight: 1, road: 0, plenty: 0, monopoly: 0, vp: 2 },
  boughtThisTurn: { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 1 },
};
const expectedFortune = `${wayfarer} ×1 · points ×2 (1 new)`;
assert.equal(fortuneBreakdown(hand), expectedFortune);
assert.equal(fortuneBreakdown(hand), "wayfarer ×1 · points ×2 (1 new)");

const emptyHand = {
  hidden: { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 },
  boughtThisTurn: { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 },
};
assert.equal(fortuneBreakdown(emptyHand), "");

// wayfarerRules assertions matching fortunes.ts:25-28
const expectedWayfarerOn =
  "On a seven, anyone with more than seven goods discards half. Move and block a hex; the wayfarer takes a card from an adjacent seat. Blocked land pays nothing.";
const expectedWayfarerOff =
  "On a seven, anyone with more than seven goods discards half. No movement, blocked land or taking cards. Wayfarer fortunes add 1 to the army.";

assert.equal(wayfarerRules("on"), expectedWayfarerOn);
assert.equal(wayfarerRules("off"), expectedWayfarerOff);

// WAYFARER_EFFECT assertions
assert.ok(WAYFARER_EFFECT.off.startsWith("Muster"));
assert.equal(WAYFARER_EFFECT.off, "Muster: add 1 to your army. No target needed.");
assert.equal(WAYFARER_EFFECT.on, "Move and block a hex. The wayfarer takes a card.");

console.log("ok   game-text-prove: bagText, fortuneBreakdown and wayfarerRules verified");
