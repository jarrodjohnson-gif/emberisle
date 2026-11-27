// #1840: coastOf, hexDist, dirAt and smooth agree with the hex grid.
// Node only, no browser, no source change:
// node --experimental-transform-types --import ./server/register.mjs scripts/classic-geometry-prove.mjs
// Node's type stripping rejects the parameter property on PropKit. The transform flag loads the module as it is.
// Convention read from terrain-classic.ts: SQ3 is Math.sqrt(3). Flat-top hex. Flats face 0 + 60k degrees.
// Corners sit HEX_SIZE out at 30 + 60k degrees. The apothem is HEX_SIZE * SQ3 / 2.
// hexDist is the max of |x| and the two projections at ±60 degrees, so the boundary is one value, the apothem.
// A corner's Euclidean radius is larger than that apothem by 2/SQ3.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coastOf, dirAt, hexDist, smooth } from "../src/lib/scene/terrain-classic.ts";
import { smooth as terrainSmooth } from "../src/lib/scene/terrain.ts";
import { createGame } from "../src/lib/game/board.ts";
import { HEX_SIZE, hexToWorld, hexesInRadius } from "../src/lib/game/hex.ts";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const classicSrc = read("../src/lib/scene/terrain-classic.ts");
const terrainSrc = read("../src/lib/scene/terrain.ts");
const jellySrc = read("../src/lib/scene/hex-jelly.ts");

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const check = (name) => console.log(`ok - ${name}`);

assert.match(classicSrc, /const SQ3 = Math\.sqrt\(3\);/);
const SQ3 = Math.sqrt(3);
const apothem = (HEX_SIZE * SQ3) / 2;
console.log("convention: flat-top, SQ3 = Math.sqrt(3), flats at 60k degrees, apothem = HEX_SIZE * SQ3 / 2, corner radius / apothem = 2/SQ3, hexDist equals the apothem on the boundary");

const step = classicSrc.match(/const FLAT_STEP: \[number, number\]\[\] = (\[[^\n]*\]);/);
assert.ok(step, "FLAT_STEP is declared in terrain-classic.ts");
const FLAT_STEP = JSON.parse(step[1]);
assert.equal(FLAT_STEP.length, 6, "FLAT_STEP has six edges");

// Edge k's axial step points at dirAt(60k), from more than one hex centre.
for (const centre of [
  { q: 0, r: 0 },
  { q: 2, r: -1 },
]) {
  for (let k = 0; k < 6; k++) {
    const [dq, dr] = FLAT_STEP[k];
    const a = hexToWorld(centre.q, centre.r);
    const b = hexToWorld(centre.q + dq, centre.r + dr);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const want = dirAt(60 * k);
    assert.ok(len > 0, `edge ${k} from ${centre.q},${centre.r} has a neighbour`);
    assert.ok(near(dx / len, want.x, 1e-9) && near(dz / len, want.z, 1e-9), `edge ${k} from ${centre.q},${centre.r} is (${dx / len}, ${dz / len}), want dirAt(${60 * k}) (${want.x}, ${want.z})`);
  }
}
check("each edge k points at dirAt(60 k) within 1e-9");

const h = { q: 3, r: -2 };
assert.deepEqual(
  coastOf(h, () => true),
  [false, false, false, false, false, false],
);
check("coastOf with every neighbour land is six false");
assert.deepEqual(
  coastOf(h, () => false),
  [true, true, true, true, true, true],
);
check("coastOf with no neighbour land is six true");
for (let k = 0; k < 6; k++) {
  const [dq, dr] = FLAT_STEP[k];
  const flags = coastOf(h, (q, r) => q !== h.q + dq || r !== h.r + dr);
  assert.deepEqual(
    flags,
    [0, 1, 2, 3, 4, 5].map((i) => i === k),
    `only step ${k} missing`,
  );
}
check("coastOf flags only the missing step, for every k");

const game = createGame({ seed: 1, humans: [{ name: "A" }], bots: 3 });
const island = hexesInRadius(2);
const key = (q, r) => `${q},${r}`;
const keys = new Set(game.hexes.map((hex) => key(hex.q, hex.r)));
assert.equal(island.length, 19);
assert.deepEqual([...keys].sort(), island.map((hex) => key(hex.q, hex.r)).sort());
const land = (q, r) => keys.has(key(q, r));
let coasts = 0;
for (const hex of game.hexes) {
  const flags = coastOf(hex, land);
  assert.equal(flags.length, 6);
  flags.forEach((flag, k) => {
    const [dq, dr] = FLAT_STEP[k];
    const present = keys.has(key(hex.q + dq, hex.r + dr));
    assert.equal(flag, !present, `coast at ${hex.q},${hex.r} edge ${k}`);
    if (flag) coasts++;
  });
}
assert.equal(coasts, 30);
check("the 19-hex island has 30 coast edges, and each flag matches a missing neighbour");

assert.equal(hexDist(0, 0), 0);
check("hexDist(0, 0) is 0");
for (let k = 0; k < 6; k++) {
  const mid = dirAt(60 * k);
  const got = hexDist(mid.x * apothem, mid.z * apothem);
  assert.ok(near(got, apothem, 1e-12), `flat ${k}: hexDist ${got}, apothem ${apothem}`);
}
check("hexDist at each flat midpoint equals the apothem HEX_SIZE * SQ3 / 2");
const ratio = 2 / SQ3;
for (let k = 0; k < 6; k++) {
  const corner = dirAt(30 + 60 * k);
  const x = corner.x * HEX_SIZE;
  const z = corner.z * HEX_SIZE;
  const radius = Math.hypot(x, z);
  const got = hexDist(x, z);
  assert.ok(near(radius / apothem, ratio, 1e-12), `corner ${k} radius ratio ${radius / apothem}, want ${ratio}`);
  assert.ok(radius > apothem, `corner ${k} is farther out than the flat`);
  assert.ok(near(got, apothem, 1e-12), `corner ${k}: hexDist ${got}, apothem ${apothem}`);
}
check("each corner is farther than the apothem by 2/SQ3, and hexDist there still equals the apothem");

const smoothBody = (src, file) => {
  const found = src.match(/(?:export )?const smooth = \(a: number, b: number, x: number\) => \{\n([\s\S]*?)\n\};/);
  assert.ok(found, `${file} declares smooth`);
  return found[1];
};
const classicBody = smoothBody(classicSrc, "terrain-classic.ts");
const jellyBody = smoothBody(jellySrc, "hex-jelly.ts");
assert.equal(smoothBody(terrainSrc, "terrain.ts"), classicBody);
assert.equal(jellyBody, classicBody);
const jellySmooth = new Function("a", "b", "x", jellyBody);

for (const [a, b] of [
  [0, 1],
  [-2, 3],
  [0.2, 0.8],
]) {
  for (const x of [a, a - 1e-6, a - 1, a - 10]) assert.equal(smooth(a, b, x), 0, `smooth(${a}, ${b}, ${x})`);
  for (const x of [b, b + 1e-6, b + 1, b + 10]) assert.equal(smooth(a, b, x), 1, `smooth(${a}, ${b}, ${x})`);
  assert.ok(near(smooth(a, b, (a + b) / 2), 0.5, 1e-12), `midpoint of ${a}..${b}`);
  let prev = -1;
  for (let i = 0; i <= 100; i++) {
    const x = a + ((b - a) * i) / 100;
    const y = smooth(a, b, x);
    assert.ok(y + 1e-15 >= prev, `smooth(${a}, ${b}) step ${i} went down`);
    prev = y;
    assert.equal(y, terrainSmooth(a, b, x));
    assert.equal(y, jellySmooth(a, b, x));
  }
  for (const x of [a - 1, b + 1, (a + b) / 2]) {
    assert.equal(smooth(a, b, x), terrainSmooth(a, b, x));
    assert.equal(smooth(a, b, x), jellySmooth(a, b, x));
  }
}
check("smooth is 0 at and below a, 1 at and above b, 0.5 at the midpoint, and monotonic across 100 steps");
check("smooth matches terrain.ts and hex-jelly.ts at those points");

const d0 = dirAt(0);
assert.deepEqual(d0, { x: 1, z: 0 });
const d90 = dirAt(90);
assert.ok(near(d90.x, 0, 1e-12) && near(d90.z, 1, 1e-12), `dirAt(90) is (${d90.x}, ${d90.z})`);
check("dirAt(0) is (1, 0) and dirAt(90) is (0, 1) within 1e-12");
for (let deg = 0; deg < 360; deg++) {
  const d = dirAt(deg);
  assert.ok(near(Math.hypot(d.x, d.z), 1, 1e-12), `dirAt(${deg}) length ${Math.hypot(d.x, d.z)}`);
}
check("every dirAt result has length 1 within 1e-12");
