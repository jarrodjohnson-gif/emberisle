// Board math and coordinate bounds proof:
// 1. mulberry32 handles non-finite, negative, and overflowing seeds deterministically.
// 2. createGame normalizes seeds to finite unsigned 32-bit integers (no NaN, negative, or floats).
// 3. adjacentPips safely traverses sparse arrays, nullish slots, and non-6/8 pips without throwing.
// 4. hexNeighbors and hexBounds calculate accurate axial bounds and neighbors on custom/sparse boards.
// 5. worldOfHex guards against null/NaN coordinates.
// 6. makePlayer clamps negative indices and provides cyclic name/color fallbacks.
// 7. Resource transaction guards (clampRes, deductRes, addRes) prevent arithmetic underflow.
import assert from "node:assert/strict";
import {
  adjacentPips,
  createGame,
  demoBoard,
  emptyRes,
  clampRes,
  deductRes,
  addRes,
  hexBounds,
  hexNeighbors,
  makePlayer,
  worldOfHex,
} from "../src/lib/game/board.ts";
import { mulberry32 } from "../src/lib/game/random.ts";

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  checks++;
};

// 1. mulberry32 seed robustness
{
  for (const seed of [NaN, Infinity, -Infinity, -1, -100, 12.34, 5e10, 0, 42]) {
    const rand = mulberry32(seed);
    const val = rand();
    ok(typeof val === "number" && Number.isFinite(val) && val >= 0 && val < 1, `mulberry32(${seed}) in [0, 1)`);
  }
  // Determinism check: identical seed produces identical stream
  const r1 = mulberry32(12345);
  const r2 = mulberry32(12345);
  eq([r1(), r1(), r1()], [r2(), r2(), r2()], "mulberry32 stream deterministic");
}

// 2. createGame seed normalization
{
  const nanGame = createGame({ seed: NaN, humans: [{ name: "A" }], bots: 2 });
  ok(Number.isInteger(nanGame.seed) && nanGame.seed >= 0 && nanGame.seed <= 0xffffffff, "createGame(NaN) seed is uint32");
  ok(!Number.isNaN(nanGame.seed), "createGame(NaN) seed is not NaN");

  const negGame = createGame({ seed: -42, humans: [{ name: "A" }], bots: 2 });
  ok(Number.isInteger(negGame.seed) && negGame.seed >= 0 && negGame.seed <= 0xffffffff, "createGame(-42) seed is uint32");
  eq(negGame.seed, (-42 >>> 0), "createGame(-42) seed coerced to uint32");

  const floatGame = createGame({ seed: 12.34, humans: [{ name: "A" }], bots: 2 });
  ok(Number.isInteger(floatGame.seed) && floatGame.seed >= 0, "createGame(12.34) seed is integer");
  eq(floatGame.seed, 12, "createGame(12.34) seed truncated to 12");

  const overGame = createGame({ seed: 5e10, humans: [{ name: "A" }], bots: 2 });
  ok(Number.isInteger(overGame.seed) && overGame.seed >= 0 && overGame.seed <= 0xffffffff, "createGame(5e10) seed is uint32");
  eq(overGame.seed, (5e10 >>> 0), "createGame(5e10) seed coerced to uint32");
}

// 3. adjacentPips on sparse / custom layouts
{
  const sparseHexes = [
    { id: "0,0", q: 0, r: 0, pip: 6, terrain: "timber", blocked: false },
    undefined,
    null,
    { id: "1,0", q: 1, r: 0, pip: 8, terrain: "clay", blocked: false },
  ];
  eq(adjacentPips(sparseHexes, "0,0", 6), true, "sparse hexes finds adjacent 8 for 6");
  eq(adjacentPips(sparseHexes, "0,0", 5), false, "non-6/8 pip returns false immediately");
  eq(adjacentPips(sparseHexes, "missing", 6), false, "missing id returns false");
  eq(adjacentPips([], "0,0", 6), false, "empty hex list returns false");
  eq(adjacentPips(null, "0,0", 6), false, "null hex list returns false");
}

// 4. hexNeighbors and hexBounds
{
  const hexes = [
    { id: "0,0", q: 0, r: 0, pip: 6, terrain: "timber", blocked: false },
    { id: "1,0", q: 1, r: 0, pip: 8, terrain: "clay", blocked: false },
    { id: "0,1", q: 0, r: 1, pip: 4, terrain: "wool", blocked: false },
  ];
  const neighbors = hexNeighbors(hexes, 0, 0);
  eq(neighbors.map((h) => h.id).sort(), ["0,1", "1,0"], "hexNeighbors finds axial neighbors");
  eq(hexNeighbors(hexes, 5, 5), [], "hexNeighbors out-of-bounds returns empty");
  eq(hexNeighbors(null, 0, 0), [], "hexNeighbors null list returns empty");

  const bounds = hexBounds(hexes);
  eq(bounds, { minQ: 0, maxQ: 1, minR: 0, maxR: 1 }, "hexBounds matches extent");
  eq(hexBounds([]), { minQ: 0, maxQ: 0, minR: 0, maxR: 0 }, "hexBounds empty returns zeroes");
}

// 5. worldOfHex robustness
{
  const normal = worldOfHex({ id: "0,0", q: 0, r: 0, pip: 6, terrain: "timber", blocked: false });
  eq(normal, { x: 0, z: 0 }, "worldOfHex origin is at (0, 0)");
  const nanCoord = worldOfHex({ id: "nan", q: NaN, r: NaN, pip: null, terrain: "waste", blocked: false });
  eq(nanCoord, { x: 0, z: 0 }, "worldOfHex with NaN coordinates falls back safely");
  const nullCoord = worldOfHex(null);
  eq(nullCoord, { x: 0, z: 0 }, "worldOfHex with null hex falls back safely");
}

// 6. makePlayer bounds and fallbacks
{
  const pNeg = makePlayer(-1, "Player", "human");
  eq(pNeg.id, "p0", "makePlayer(-1) clamps id to p0");
  const pOver = makePlayer(4, "", "bot");
  ok(pOver.name.length > 0, "makePlayer(4) provides non-empty fallback name");
  ok(pOver.color.startsWith("#"), "makePlayer(4) provides valid hex color");
}

// 7. Resource transaction guards
{
  const base = emptyRes();
  eq(base, { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 }, "emptyRes returns zeroed counts");

  const clamped = clampRes({ timber: -5, clay: 3.8, ore: NaN, grain: 4 });
  eq(clamped, { timber: 0, clay: 3, wool: 0, grain: 4, ore: 0 }, "clampRes sanitizes invalid values");
  eq(clampRes(null), base, "clampRes(null) returns zeroes");

  const starting = { timber: 2, clay: 1, wool: 0, grain: 0, ore: 0 };
  const okDeduct = deductRes(starting, { timber: 2, clay: 1 });
  eq(okDeduct.success, true, "deductRes succeeds when enough goods");
  eq(okDeduct.resources, { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 }, "deductRes balance zeroed");

  const failDeduct = deductRes(starting, { timber: 3 });
  eq(failDeduct.success, false, "deductRes fails when shortage");
  eq(failDeduct.resources, starting, "deductRes leaves resources unchanged on failure");

  const added = addRes(starting, { wool: 3, ore: 2.9, timber: -1, grain: NaN });
  eq(added, { timber: 2, clay: 1, wool: 3, grain: 0, ore: 2 }, "addRes handles valid additions and ignores invalid");
}

// 8. demoBoard smoke test
{
  const demo = demoBoard();
  ok(demo.hexes.length === 19, "demoBoard has 19 hexes");
  ok(demo.players.length === 3, "demoBoard has 3 players");
}

console.log(`board-math-bounds-prove: ok (${checks} checks)`);
