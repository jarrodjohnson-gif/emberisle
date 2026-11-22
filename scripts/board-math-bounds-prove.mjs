// Board guards that change nothing for a seed the game uses:
// 1. createGame takes a random seed when the seed is not a finite number (NaN or Infinity used to be stored as the seed).
// 2. Every finite seed is stored as given, and the boards for seeds 0 to 499 in both token modes hash to the value from main.
// 3. adjacentPips reads past an empty slot in a sparse hex list.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { adjacentPips, createGame } from "../src/lib/game/board.ts";

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  checks++;
};
const humans = [{ name: "A" }];

// 1. A seed that is not finite is replaced, never stored.
for (const seed of [NaN, Infinity, -Infinity]) {
  const game = createGame({ seed, humans, bots: 2 });
  ok(Number.isFinite(game.seed), `createGame(${seed}) stores a finite seed`);
}
const numeric = createGame({ seed: "7", humans, bots: 2 });
ok(Number.isFinite(numeric.seed), "createGame with a non-number seed stores a finite seed");

// 2. A finite seed is stored as given, and the boards match main's byte for byte.
for (const seed of [0, 42, -42, 12.34, 5e10]) eq(createGame({ seed, humans, bots: 2 }).seed, seed, `createGame(${seed}) keeps its seed`);
const hash = createHash("sha256");
for (let seed = 0; seed < 500; seed++) {
  for (const numberTokens of ["official", "random"]) hash.update(JSON.stringify(createGame({ seed, numberTokens, humans, bots: 2 })));
}
eq(hash.digest("hex"), "189f61d1d264865f30e1dbd6cc9bdc964709e8763e7e363e415faaf05705b5ac", "boards for seeds 0 to 499 match main");

// 3. A sparse hex list (an empty slot) does not throw.
{
  const hexes = [
    { id: "0,0", q: 0, r: 0, pip: 6, terrain: "timber", blocked: false },
    undefined,
    null,
    { id: "1,0", q: 1, r: 0, pip: 8, terrain: "clay", blocked: false },
  ];
  eq(adjacentPips(hexes, "0,0", 6), true, "a 6 next to an 8 is found past empty slots");
  eq(adjacentPips(hexes, "1,0", 8), true, "an 8 next to a 6 is found past empty slots");
  eq(adjacentPips(hexes, "missing", 6), false, "a missing id is false");
}

console.log(`board-math-bounds-prove: ok (${checks} checks)`);
