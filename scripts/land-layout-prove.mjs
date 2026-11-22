// #1838: the Hex Jelly land layout is deterministic and keeps its landform at the back. Node only, no browser:
// `node --import ./server/register.mjs scripts/land-layout-prove.mjs`. Reads layoutOf and rng32 from src/lib/scene/hex-jelly.ts.
// GOLDEN below pins the layout stream. Changing a golden value moves every hill on every board and needs the owner's yes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { layoutOf, rng32 } from "../src/lib/scene/hex-jelly.ts";

const KINDS = ["timber", "clay", "wool", "grain", "ore", "waste"];
const SEEDS = Array.from({ length: 200 }, (_, i) => i);
const ok = (name) => console.log(`ok - ${name}`);

// The hash of a layout: sha256 of its JSON, first 16 hex digits.
const hashOf = (L) => createHash("sha256").update(JSON.stringify(L)).digest("hex").slice(0, 16);

// 1. Determinism.
for (const kind of KINDS) for (const seed of SEEDS) assert.deepEqual(layoutOf(kind, seed), layoutOf(kind, seed), `${kind} ${seed}`);
ok(`layoutOf is deterministic for ${KINDS.length} terrains x ${SEEDS.length} seeds`);

// 2. rng32.
for (const seed of SEEDS) {
  const [a, b] = [rng32(seed), rng32(seed)];
  for (let i = 0; i < 16; i++) {
    const v = a();
    assert.equal(v, b(), `rng32(${seed}) value ${i}`);
    assert.ok(v >= 0 && v < 1, `rng32(${seed}) value ${i} in [0, 1)`);
  }
}
ok("rng32 repeats per seed and stays in [0, 1)");
for (let s = 0; s < 199; s++) {
  const [a, b] = [rng32(s), rng32(s + 1)];
  let differ = false;
  for (let i = 0; i < 8; i++) if (a() !== b()) differ = true;
  assert.ok(differ, `rng32 seeds ${s} and ${s + 1} differ within 8 values`);
}
ok("rng32 neighbouring seeds differ within 8 values");

// 3. The back rule: the crest faces 240 or 300 degrees, within the 6 degree spread, and both sides occur.
const deg = (L) => ((((L.hillAt * 180) / Math.PI) % 360) + 360) % 360;
for (const kind of KINDS) {
  let at240 = 0;
  let at300 = 0;
  for (const seed of SEEDS) {
    const d = deg(layoutOf(kind, seed));
    if (Math.abs(d - 240) <= 6 + 1e-9) at240++;
    else if (Math.abs(d - 300) <= 6 + 1e-9) at300++;
    else assert.fail(`${kind} seed ${seed}: hillAt ${d} degrees is not 240 or 300 within 6`);
  }
  assert.ok(at240 > 0 && at300 > 0, `${kind}: both back edges occur (${at240} / ${at300})`);
}
ok("hillAt is within 240 or 300 +/- 6 degrees for every terrain and seed, and both sides occur");

// 4. Every number is finite; no radius is negative. A height is never negative either, except the wool tile's one deliberate
// dip (a spot at h -0.022 that hollows the ground), which the issue's wording did not know about.
const finite = (v, where) => assert.ok(Number.isFinite(v), `${where} is finite: ${v}`);
const spotOk = (p, where, allowDip) => {
  for (const k of ["x", "z", "r", "h"]) finite(p[k], `${where}.${k}`);
  assert.ok(p.r >= 0, `${where} radius ${p.r} is not negative`);
  assert.ok(p.h >= 0 || (allowDip && p.h === -0.022), `${where} height ${p.h} is not negative`);
};
const ptOk = (p, where) => {
  for (const k of Object.keys(p)) finite(p[k], `${where}.${k}`);
};
let dips = 0;
for (const kind of KINDS)
  for (const seed of SEEDS) {
    const L = layoutOf(kind, seed);
    L.spots.forEach((p, i) => {
      if (p.h < 0) dips++;
      spotOk(p, `${kind} ${seed} spots[${i}]`, kind === "wool");
    });
    L.peaks.forEach((p, i) => spotOk(p, `${kind} ${seed} peaks[${i}]`, false));
    L.stream.forEach((p, i) => ptOk(p, `${kind} ${seed} stream[${i}]`));
    if (L.pool) ptOk(L.pool, `${kind} ${seed} pool`), assert.ok(L.pool.r >= 0);
    if (L.camp) ptOk(L.camp, `${kind} ${seed} camp`);
    if (L.deer) ptOk(L.deer, `${kind} ${seed} deer`);
  }
assert.equal(dips, SEEDS.length, "only the wool tile has a dip, one per seed");
ok("spots, peaks, stream, pool, camp and deer are finite with no negative radius or height (wool dip aside)");

// 5. Golden hashes for seeds 1, 2 and 3 of each terrain.
const GOLDEN = {
  "timber:1": "e3119bf2bfd6f147",
  "timber:2": "1f4942e49089972a",
  "timber:3": "06ea2b1a633566cf",
  "clay:1": "3ada2d68c8462bc9",
  "clay:2": "a6d1ce22f6d115b6",
  "clay:3": "e910004602fa8ed7",
  "wool:1": "e0e1a4832df97271",
  "wool:2": "e937ab2b1c76424e",
  "wool:3": "4f9d318131000210",
  "grain:1": "bffdc64603483442",
  "grain:2": "2acaef05803b839d",
  "grain:3": "dee21f8e99b330e4",
  "ore:1": "c83bd4c63f093523",
  "ore:2": "2ba244580fdd0d66",
  "ore:3": "955e4482f0ec7e8f",
  "waste:1": "dc3cce6f40f9177f",
  "waste:2": "db85b77887587b96",
  "waste:3": "e59ec6cf64ae9fcd"
};
if (process.argv.includes("--print")) {
  const g = {};
  for (const kind of KINDS) for (const seed of [1, 2, 3]) g[`${kind}:${seed}`] = hashOf(layoutOf(kind, seed));
  console.log(JSON.stringify(g, null, 2));
  process.exit(0);
}
for (const kind of KINDS)
  for (const seed of [1, 2, 3]) {
    assert.equal(hashOf(layoutOf(kind, seed)), GOLDEN[`${kind}:${seed}`], `${kind} seed ${seed}: the layout moved. Changing a golden value moves every board and needs the owner's yes.`);
  }
ok(`golden layout hashes hold for seeds 1 to 3 of ${KINDS.length} terrains`);
