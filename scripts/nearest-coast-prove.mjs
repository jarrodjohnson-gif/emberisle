// #1836: nearestCoast (src/lib/scene/crystal-water.ts) is the geometry the water, the foam and the ocean visitors lean on:
// how far a point is from the coast (o), the unit way back to it (ix, iz), and whether the point is out at sea (offshore).
// A hand-built closed coast, a square of side 2 centred on the origin, checked inside, outside, past a corner, on the line,
// then rotated and mirrored. Node only; no source file changes.
import assert from "node:assert/strict";
import { nearestCoast } from "../src/lib/scene/crystal-water.ts";

const TOL = 1e-9;
let checks = 0;
const near = (a, b) => Math.abs(a - b) <= TOL;
function check(label, ok, data) {
  assert.ok(ok, `${label} ${JSON.stringify(data ?? {})}`);
  checks++;
  console.log(`ok ${label}${data === undefined ? "" : " " + JSON.stringify(data)}`);
}

// Counter-clockwise corners; mx, mz are each corner's outward miter, as the renderer's coast carries them.
const square = [
  { x: 1, z: 1 },
  { x: -1, z: 1 },
  { x: -1, z: -1 },
  { x: 1, z: -1 },
].map((p) => ({ ...p, mx: p.x / Math.SQRT2, mz: p.z / Math.SQRT2 }));
// Maps of the plane the answers should follow: a rotation by `a` radians, and a mirror across the z axis.
const rotate = (a) => ({ name: `rotated ${Math.round((a * 180) / Math.PI)} deg`, f: (x, z) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)] });
const mirror = { name: "mirrored", f: (x, z) => [-x, z] };
const identity = { name: "square", f: (x, z) => [x, z] };
const mapCoast = (coast, { f }) => coast.map((p) => { const [x, z] = f(p.x, p.z); const [mx, mz] = f(p.mx, p.mz); return { x, z, mx, mz }; });
const round = (v) => +v.toFixed(12);

// Each case in the square's own frame: the point, the distance, the unit way to the nearest coast point, and offshore.
const s = Math.SQRT1_2;
const cases = [
  { name: "inside, 0.25 from the east edge", p: [0.75, 0.1], o: 0.25, dir: [1, 0], offshore: false },
  { name: "inside, 0.25 from the north edge", p: [-0.3, 0.75], o: 0.25, dir: [0, 1], offshore: false },
  { name: "outside, 0.5 past the west edge", p: [-1.5, 0.2], o: 0.5, dir: [1, 0], offshore: true },
  { name: "outside, 0.5 past the south edge", p: [0.4, -1.5], o: 0.5, dir: [0, 1], offshore: true },
  { name: "beyond the north-east corner", p: [1.5, 1.5], o: Math.hypot(0.5, 0.5), dir: [-s, -s], offshore: true },
  { name: "beyond the south-west corner, off the diagonal", p: [-1.3, -1.4], o: Math.hypot(0.3, 0.4), dir: [0.6, 0.8], offshore: true },
];

for (const map of [identity, rotate(Math.PI / 6), rotate((-3 * Math.PI) / 4), mirror]) {
  const coast = mapCoast(square, map);
  for (const c of cases) {
    const [x, z] = map.f(...c.p);
    const [dx, dz] = map.f(...c.dir);
    const r = nearestCoast(coast, x, z);
    const got = { o: round(r.o), ix: round(r.ix), iz: round(r.iz), offshore: r.offshore };
    check(`${map.name}: ${c.name}`, near(r.o, c.o) && near(r.ix, dx) && near(r.iz, dz) && r.offshore === c.offshore && near(Math.hypot(r.ix, r.iz), 1), got);
  }
  // On the coast line itself: no distance (within the tolerance) and a finite direction, never NaN, because the code divides
  // by `d || 1`. Rounding can leave d a few 1e-17 above 0, and the direction is then some unit vector, so only finiteness
  // is asserted.
  for (const p of [[1, 0.3], [-0.6, -1], [1, 1]]) {
    const [x, z] = map.f(...p);
    const r = nearestCoast(coast, x, z);
    check(`${map.name}: on the coast at (${p})`, near(r.o, 0) && Number.isFinite(r.ix) && Number.isFinite(r.iz) && typeof r.offshore === "boolean", { o: r.o, ix: r.ix, iz: r.iz, offshore: r.offshore });
  }
}

// The way back always leads to a point on the coast: stepping o along (ix, iz) lands on the coast (distance 0 from it).
{
  let worst = 0;
  for (let k = 0; k < 200; k++) {
    const a = (k / 200) * Math.PI * 2;
    const rad = 0.2 + (k % 7) * 0.35;
    const x = rad * Math.cos(a), z = rad * Math.sin(a);
    const r = nearestCoast(square, x, z);
    const back = nearestCoast(square, x + r.ix * r.o, z + r.iz * r.o);
    worst = Math.max(worst, back.o);
    if (Math.max(Math.abs(x), Math.abs(z)) !== 1) assert.equal(r.offshore, Math.max(Math.abs(x), Math.abs(z)) > 1, `offshore at (${x}, ${z})`);
  }
  check("200 points round the square: stepping o along (ix, iz) lands on the coast, and offshore is true exactly outside", worst <= TOL, { worst });
}

console.log("nearest-coast-prove: skipped the real island's coast: the renderer builds it in coastLoop (src/lib/scene/isle-renderer.ts), which is not exported");
console.log(`nearest-coast-prove: ${checks} checks pass`);
