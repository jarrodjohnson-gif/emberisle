import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adjacentPips, createGame, hexHeight } from "../src/lib/game/board.ts";
import { createExpandedGame } from "../src/lib/game/expanded.ts";
import { AXIAL_DIRS, axialKey } from "../src/lib/game/hex.ts";
import { RESOURCES } from "../src/lib/game/types.ts";

let cases = 0;
function check(name, run) {
  run();
  cases++;
  console.log(`ok ${name}`);
}
const cell = (q, r, pip = null) => ({ id: `${q},${r}`, q, r, pip });
assert.equal(AXIAL_DIRS.length, 6);
assert.equal(new Set(AXIAL_DIRS.map(([q, r]) => `${q},${r}`)).size, 6);
for (const [q, r] of AXIAL_DIRS) {
  for (const neighbour of [6, 8]) {
    check(`adjacent ${q},${r} with ${neighbour}: red candidates true, 5/9 false`, () => {
      const hexes = [cell(0, 0), cell(q, r, neighbour)];
      for (const pip of [6, 8]) assert.equal(adjacentPips(hexes, "0,0", pip), true);
      for (const pip of [5, 9]) assert.equal(adjacentPips(hexes, "0,0", pip), false);
    });
  }
  check(`non-red/null neighbour ${q},${r} never counts`, () => {
    for (const value of [null, 5, 9]) for (const pip of [6, 8]) {
      assert.equal(adjacentPips([cell(0, 0), cell(q, r, value)], "0,0", pip), false);
    }
  });
}
check("two hexes away and unknown id are false", () => {
  for (const [q, r] of AXIAL_DIRS) {
    assert.equal(adjacentPips([cell(0, 0), cell(q * 2, r * 2, 6)], "0,0", 6), false);
  }
  assert.equal(adjacentPips([cell(0, 0, 6)], "missing", 8), false);
  assert.equal(adjacentPips([], "missing", 6), false);
});

// Terrain is erased at runtime. Read its declared union so new literals cannot silently escape the loop.
const types = readFileSync(new URL("../src/lib/game/types.ts", import.meta.url), "utf8");
const union = types.match(/export type Terrain\s*=\s*([^;]+);/);
assert.ok(union, "Terrain union exists");
const terrains = union[1].split("|").flatMap(part => {
  const type = part.trim();
  if (type === "Resource") return [...RESOURCES];
  assert.match(type, /^"[a-z]+"$/, "new Terrain expression needs an explicit test enumeration");
  return [JSON.parse(type)];
});
const heights = { timber: .16, clay: .2, wool: .15, grain: .15, ore: .24, waste: .12 };
assert.deepEqual([...terrains].sort(), Object.keys(heights).sort(), "every Terrain has an expected height; update deliberately for new terrain");
for (const terrain of terrains) check(`hexHeight ${terrain} = ${heights[terrain]}`, () => {
  assert.equal(hexHeight(terrain), heights[terrain]);
});
for (const [q, r, expected] of [[0, 0, "0,0"], [3, 7, "3,7"], [-3, 7, "-3,7"], [3, -7, "3,-7"], [-3, -7, "-3,-7"]]) {
  check(`axialKey ${expected}`, () => assert.equal(axialKey(q, r), expected));
}

let deals = 0;
for (const numberTokens of [undefined, "random"]) {
console.log(`layout: ${numberTokens ?? "default"}`);
for (const [kind, create, seats, seeds] of [
  ["classic", createGame, 3, 200], ["classic", createGame, 4, 200],
  ["expanded", createExpandedGame, 5, 50], ["expanded", createExpandedGame, 6, 50],
]) {
  check(`${kind} ${seats} seats: seeds 1..${seeds} have no adjacent red tokens`, () => {
    for (let seed = 1; seed <= seeds; seed++) {
      const game = create({ seed, humans: [{ name: "Fixture" }], bots: seats - 1, numberTokens });
      deals++;
      assert.equal(game.players.length, seats);
      const red = game.hexes.filter(h => h.terrain !== "waste" && (h.pip === 6 || h.pip === 8));
      assert.ok(red.length > 0, `${kind} ${seats} seed ${seed}: red tokens exist`);
      for (const a of red) for (const b of red) if (a !== b) {
        const dq = a.q - b.q, dr = a.r - b.r;
        assert.notEqual(Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)), 1,
          `${kind} ${seats} seed ${seed}: adjacent red pair ${a.id}/${b.id}`);
      }
    }
  });
}
}
console.log(`board-helpers-prove: PASS ${cases} cases; ${deals} seeded deals`);
