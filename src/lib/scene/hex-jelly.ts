// Hex Jelly (#599, docs/design/hex-jelly-prompt.md): one tile of the Material Studies look, built to the prompt. A moulded hex
// block (rounded corners and top edge) whose top is a dense heightfield with a big landform, coloured by slope and height and
// darkened by baked horizon AO; candy strata on the cut sides with pebble speckles; props as chunky instanced blobs. The
// studio (scripts/hex-jelly.html) shows one tile; the board port follows once the look is approved.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { Terrain } from "@/lib/game/types";
import { LIGHT } from "@/lib/scene/palette";

const SQ3 = Math.sqrt(3);
// The block: corner radius, height of the pad (the top's level under the token), corner and top-edge rounding.
export const CORNER_R = 1.12;
const INR = (CORNER_R * SQ3) / 2;
export const BLOCK_H = 0.3;
const ROUND_C = 0.12;
const ROUND_E = 0.05;
const RIM_ROWS = 5;
// Gameplay ground: the token's pad, the corner discs, the edge band roads lie on.
const PAD_R = 0.33;
const CORNER_DISC = 0.14;
const EDGE_BAND = 0.18;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hexDist = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(0.5 * x + (SQ3 / 2) * z), Math.abs(0.5 * x - (SQ3 / 2) * z));

export function rng32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix: number, iy: number, seed: number) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const fbm = (x: number, y: number, seed: number) => 0.55 * noise(x, y, seed) + 0.3 * noise(x * 2.03, y * 2.03, seed + 1) + 0.15 * noise(x * 4.1, y * 4.1, seed + 2);

// --- the rounded outline

// The exact signed distance to a regular hexagon (flats facing 60 k degrees) of inradius r.
function sdHex(x: number, z: number, r: number) {
  // Fold into the sector round +x (a flat facing +x), then measure against that flat and its two corners.
  let a = Math.atan2(z, x);
  const sector = Math.round(a / (Math.PI / 3));
  a -= sector * (Math.PI / 3);
  const l = Math.hypot(x, z);
  const px = l * Math.cos(a);
  const pz = Math.abs(l * Math.sin(a));
  const half = r / SQ3;
  const dz = Math.max(pz - half, 0);
  const dx = px - r;
  if (dx > 0) return Math.hypot(dx, dz);
  return pz > half ? Math.max(dx, -Math.hypot(dx, pz - half)) : dx;
}
// The rounded hexagon of inradius `inr` with corners rounded to `rc`.
const sdRound = (x: number, z: number, inr: number, rc: number) => sdHex(x, z, inr - rc) - rc;
// Where a ray from the centre at angle t leaves that outline.
function outlineAt(t: number, inr: number, rc: number) {
  const [c, s] = [Math.cos(t), Math.sin(t)];
  let [lo, hi] = [0, inr * 1.2];
  for (let i = 0; i < 32; i++) {
    const m = (lo + hi) / 2;
    if (sdRound(c * m, s * m, inr, rc) < 0) lo = m;
    else hi = m;
  }
  return lo;
}
// The outline's outward normal at a point on it, from the distance field's gradient.
function outlineNormal(x: number, z: number, inr: number, rc: number) {
  const e = 1e-4;
  const nx = sdRound(x + e, z, inr, rc) - sdRound(x - e, z, inr, rc);
  const nz = sdRound(x, z + e, inr, rc) - sdRound(x, z - e, inr, rc);
  const l = Math.hypot(nx, nz);
  return [nx / l, nz / l] as const;
}

// --- the landform

export type Spot = { x: number; z: number; r: number; h: number; sx?: number };
const bump = (x: number, z: number, p: Spot) => {
  const d2 = ((x - p.x) ** 2 + (z - p.z) ** 2) / (p.r * p.r);
  return d2 < 1 ? p.h * (1 - d2) * (1 - d2) : 0;
};
const CORNERS = Array.from({ length: 6 }, (_, k) => [Math.cos(((30 + 60 * k) * Math.PI) / 180) * (CORNER_R - 0.06), Math.sin(((30 + 60 * k) * Math.PI) / 180) * (CORNER_R - 0.06)]);
const nearestCorner = (x: number, z: number) => Math.min(...CORNERS.map(([cx, cz]) => Math.hypot(x - cx!, z - cz!)));

type Pt = { x: number; z: number };
// The forest's features (prompt "TIMBER"): a spring high on the hill, the stream's course down round one side of the clearing,
// the pool it fills, the campsite across the clearing, the deer's bank, the fairy ring.
export type Layout = {
  kind: Terrain;
  seed: number;
  hillAt: number;
  spots: Spot[];
  stream: Pt[];
  pool: (Pt & { r: number }) | null;
  camp: (Pt & { a: number }) | null;
  deer: (Pt & { face: number }) | null;
  ring: Pt | null;
  // Long swells along a segment (the pasture's ridge), and named story spots for the other tiles.
  ridges: { a: Pt; b: Pt; w: number; h: number }[];
  marks: Record<string, Pt>;
  // Grain: the field's four strips across the front, each a band of the field's `u` (along the back edge) and what grows there.
  strips: { u0: number; u1: number; crop: "wheat" | "cut" | "plough" }[];
};

// The size ladder (prompt "SCALE"): every figure and building is built at a base size and drawn SIZE[k] times larger, so all
// six tiles share one toy-town scale: not life-size ratios, but always the same ones. Drawn heights: a person 0.13, a sheep
// 0.09 long, a deer 0.12 at the shoulder, a tent 0.12, a shepherd's hut 0.2, a farmhouse 0.24 to the ridge, a barn 0.28, a
// silo 0.32, a windmill 0.4 to the cap; a tree 0.25 to 0.5. scripts/hex-jelly.mjs --lineup draws them side by side.
export const SIZE = {
  person: 1.15,
  sheep: 1.45,
  dog: 1.35,
  deer: 1.15,
  hare: 1.3,
  small: 1.5,
  tent: 1.15,
  hut: 1.5,
  trough: 1.35,
  gate: 1.35,
  wagon: 1.4,
  barrow: 1.3,
  scarecrow: 1.25,
  stook: 1.3,
  bale: 1.1,
  house: 2.1,
  barn: 1.9,
  silo: 2.0,
  mill: 1.5,
};
const at = (a: number, d: number) => ({ x: Math.cos(a) * d, z: Math.sin(a) * d });
const DEG = Math.PI / 180;

// The landform sits toward the back (away from the diorama eye, which looks from +z): its crest faces one of the two back edge
// midpoints (240 or 300 degrees), chosen by the seed, so it never hides the token.
export function layoutOf(kind: Terrain, seed: number): Layout {
  const r = rng32(seed);
  const hillAt = ((r() < 0.5 ? 240 : 300) + (r() - 0.5) * 12) * DEG;
  const L: Layout = { kind, seed, hillAt, spots: [], stream: [], pool: null, camp: null, deer: null, ring: null, ridges: [], marks: {}, strips: [] };
  if (kind === "timber") {
    // The stream runs away from the hill's crest toward the front, on the side `s` (round toward the nearer front edge).
    const s = hillAt < 270 * DEG ? -1 : 1;
    L.spots.push({ ...at(hillAt, 0.6), r: 0.5, h: 0.42 + r() * 0.06 });
    L.spots.push({ ...at(hillAt, 0.6), r: 0.75, h: 0.14 });
    L.spots.push({ ...at(hillAt - s * 1.15, 0.62), r: 0.38, h: 0.22 + r() * 0.05 });
    const course: [number, number][] = [[10, 0.5], [30, 0.58], [55, 0.63], [80, 0.63], [102, 0.6]];
    L.stream = course.map(([o, d]) => at(hillAt + s * o * DEG, d));
    const pa = hillAt + s * 126 * DEG;
    L.pool = { ...at(pa, 0.56), r: 0.17 };
    L.stream.push({ x: L.pool.x, z: L.pool.z });
    // The camp across the clearing from the pool, on the other front flank.
    const ca = pa + s * 98 * DEG;
    L.camp = { ...at(ca, 0.6), a: ca };
    // The deer stand on the pool's bank on the side away from the stream's mouth, facing the water.
    const inflow = Math.atan2(L.stream[L.stream.length - 2]!.z - L.pool.z, L.stream[L.stream.length - 2]!.x - L.pool.x);
    let best: (Pt & { face: number }) | null = null;
    let bestScore = -Infinity;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const p = { x: L.pool.x + Math.cos(a) * 0.26, z: L.pool.z + Math.sin(a) * 0.26 };
      const away = Math.abs(Math.atan2(Math.sin(a - inflow), Math.cos(a - inflow)));
      if (Math.hypot(p.x, p.z) < 0.46 || nearestCorner(p.x, p.z) < 0.24 || hexDist(p.x, p.z) > 0.76) continue;
      // Away from the inflow, and toward the eye (+z) so the deer read side-on.
      const score = away + p.z * 0.8;
      if (score > bestScore) (bestScore = score), (best = { ...p, face: Math.atan2(L.pool.z - p.z, L.pool.x - p.x) });
    }
    L.deer = best;
    L.ring = at(hillAt - s * 0.6, 0.55);
  }
  if (kind === "grain") {
    // The back rise with the windmill, the field across the front in four strips: standing wheat, half-cut, ploughed.
    L.spots.push({ ...at(hillAt, 0.62), r: 0.46, h: 0.3 + r() * 0.04 }, { ...at(hillAt, 0.6), r: 0.7, h: 0.06 });
    const crops: ("wheat" | "cut" | "plough")[] = ["wheat", "wheat", "cut", "plough"];
    for (let i = crops.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [crops[i], crops[j]] = [crops[j]!, crops[i]!];
    }
    const edges = [-0.95, -0.47, 0, 0.47, 0.95];
    L.strips = crops.map((crop, i) => ({ u0: edges[i]! + (i ? 0.025 : 0), u1: edges[i + 1]! - (i < 3 ? 0.025 : 0), crop }));
    // The farmstead at the rise's foot on one side, the duck pond on the other.
    const s = r() < 0.5 ? -1 : 1;
    L.pool = { ...at(hillAt - s * 62 * DEG, 0.6), r: 0.13 };
    L.marks = { mill: at(hillAt, 0.6), yard: at(hillAt + s * 74 * DEG, 0.6), side: { x: s, z: 0 } };
  }
  if (kind === "clay") {
    // The open-cut quarry across the back, a trench slot running from its end toward one front flank, the kiln yard on the
    // other; a muddy pool of jelly water in the quarry floor's low corner.
    const s = r() < 0.5 ? -1 : 1;
    // The quarry sits on a front flank, where the eye looks down into it; tall things (kiln, cottage, cypresses) stand at
    // the back.
    const qAng = hillAt + Math.PI - s * 0.5;
    const qc = at(qAng, 0.62);
    const [tx, tz] = [-Math.sin(qAng), Math.cos(qAng)];
    const [hx, hz] = [Math.cos(qAng), Math.sin(qAng)];
    const q = (u: number, v: number) => ({ x: qc.x + tx * u + hx * v, z: qc.z + tz * u + hz * v });
    L.marks = {
      quarry: qc,
      qaxis: { x: qAng, z: 0 },
      side: { x: s, z: 0 },
      kiln: at(hillAt + s * 0.55, 0.6),
      trA: q(s * 0.44, -0.03),
      trB: at(qAng + s * 0.82, 0.62),
      shaft: q(-s * 0.2, -0.02),
      deck: q(s * 0.03, 0.1),
      mill: at(hillAt + s * 1.6, 0.6),
    };
    L.pool = { ...q(s * 0.22, -0.05), r: 0.085 };
  }
  if (kind === "wool") {
    // The ridge runs along the back edge, tangent to it; the wall along its crest; the oak on it toward one end.
    const s = r() < 0.5 ? -1 : 1;
    const c = at(hillAt, 0.6);
    const [tx, tz] = [-Math.sin(hillAt), Math.cos(hillAt)];
    const half = 0.4;
    L.ridges.push({ a: { x: c.x - tx * half, z: c.z - tz * half }, b: { x: c.x + tx * half, z: c.z + tz * half }, w: 0.3, h: 0.3 + r() * 0.05 });
    L.spots.push({ ...at(hillAt + Math.PI - 0.55, 0.62), r: 0.26, h: 0.05 }, { ...at(hillAt + Math.PI + 0.6, 0.64), r: 0.22, h: 0.04 });
    L.spots.push({ ...at(hillAt + Math.PI, 0.6), r: 0.2, h: -0.022 });
    L.marks = {
      oak: { x: c.x + tx * half * 0.45 * s, z: c.z + tz * half * 0.45 * s },
      gate: { x: c.x - tx * half * 0.55 * s, z: c.z - tz * half * 0.55 * s },
      hut: at(hillAt - s * 62 * DEG, 0.62),
      flock: at(hillAt + Math.PI - s * 0.62, 0.6),
      shear: at(hillAt + Math.PI + s * 0.78, 0.58),
      trough: at(hillAt + Math.PI - s * 1.25, 0.6),
    };
  }
  return L;
}

// The nearest distance from a point to the stream's course.
function streamDist(L: Layout, x: number, z: number) {
  let d = Infinity;
  for (let i = 0; i + 1 < L.stream.length; i++) {
    const [a, b] = [L.stream[i]!, L.stream[i + 1]!];
    const [dx, dz] = [b.x - a.x, b.z - a.z];
    const u = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    d = Math.min(d, Math.hypot(x - a.x - u * dx, z - a.z - u * dz));
  }
  return d;
}
const STREAM_W = 0.05;
const STREAM_D = 0.03;
const POOL_D = 0.08;
// The water's level in the pool, under the pad's.
const POOL_LEVEL = -0.014;

// The ground's height over the pad at a hex-local point: the landform, held flat on the pad, the corner discs and the edge band;
// then the stream's channel and the pool's bowl cut into it (they may come nearer the pad and the rim, never into a corner).
export function heightAt(L: Layout, x: number, z: number) {
  let raw = 0.018 * fbm(x * 3, z * 3, L.seed);
  for (const p of L.spots) raw += bump(x, z, p);
  for (const g of L.ridges) {
    const [dx, dz] = [g.b.x - g.a.x, g.b.z - g.a.z];
    const u = Math.min(1, Math.max(0, ((x - g.a.x) * dx + (z - g.a.z) * dz) / (dx * dx + dz * dz)));
    const d2 = ((x - g.a.x - u * dx) ** 2 + (z - g.a.z - u * dz) ** 2) / (g.w * g.w);
    if (d2 < 1) raw += g.h * (1 - d2) * (1 - d2) * (1 - (2 * u - 1) ** 4 * 0.5);
  }
  const pad = smooth(PAD_R, PAD_R + 0.3, Math.hypot(x, z));
  if (L.strips.length) {
    // Furrows: a ridge every FURROW across each strip (deeper where it is ploughed), none on the tracks.
    const f = fieldAt(L, x, z);
    if (f.strip >= 0) {
      const crop = L.strips[f.strip]!.crop;
      const ridge = 0.5 + 0.5 * Math.cos(((f.u - L.strips[f.strip]!.u0) / FURROW) * Math.PI * 2);
      raw += (crop === "plough" ? 0.014 : 0.008) * ridge * smooth(0, 0.02, f.inside) * f.keep;
    }
  }
  const corner = smooth(CORNER_DISC, CORNER_DISC + 0.16, nearestCorner(x, z));
  const edge = 1 - smooth(INR - EDGE_BAND - 0.1, INR - EDGE_BAND, hexDist(x, z));
  let h = raw * pad * corner * edge;
  const cut = smooth(PAD_R, PAD_R + 0.05, Math.hypot(x, z)) * smooth(CORNER_DISC, CORNER_DISC + 0.04, nearestCorner(x, z));
  if (L.stream.length) {
    const d = streamDist(L, x, z) / STREAM_W;
    if (d < 1) h -= STREAM_D * (1 - d * d) * (1 - d * d) * cut;
  }
  if (L.kind === "clay") {
    const Q = quarryAt(L, x, z);
    // The quarry's rim: a rocky lip, highest at the back, broken by noise; it rises, so it keeps the game's masks.
    const back = smooth(-0.12, 0.2, Q.v);
    const lip = smooth(0.88, 1.0, Q.d) * (1 - smooth(1.0, 1.55, Q.d)) * (0.06 + 0.1 * back);
    h += (lip + 0.035 * Math.max(0, noise(x * 11, z * 11, L.seed + 13)) * smooth(0.95, 1.05, Q.d) * (1 - smooth(1.05, 1.4, Q.d))) * pad * corner * edge;
    // The cut: the floor, a bench halfway up, the walls; and the trench. Both fade out before the block's own side.
    const keep = cut * (1 - smooth(INR - 0.26, INR - 0.08, hexDist(x, z))) * smooth(CORNER_DISC + 0.02, CORNER_DISC + 0.16, nearestCorner(x, z));
    if (Q.d < 1) {
      const step = 1 - 0.45 * smooth(0.55, 0.63, Q.d) - 0.55 * smooth(0.88, 0.97, Q.d);
      h = h * smooth(0.88, 1, Q.d) - Q_D * step * keep + 0.008 * noise(x * 14, z * 14, L.seed + 3) * keep;
    }
    if (Q.trench < 1) h = Math.min(h, -0.14 * (1 - smooth(0.6, 1, Q.trench)) * keep);
    return h;
  }
  if (L.pool) {
    const q = Math.hypot(x - L.pool.x, z - L.pool.z) / L.pool.r;
    if (q < 1) h = Math.min(h, -POOL_D * (1 - q * q) * (1 - q * q) * cut + h * q * q);
  }
  return h;
}
// Clay's open-cut quarry: half-length along the back edge, half-width toward the token, depth. `quarryAt` gives a point's
// place in it: `d` < 1 inside (its edge broken by noise), `v` toward the back, `trench` < 1 inside the trench slot.
const QA = 0.6;
const QB = 0.33;
const Q_D = 0.17;
const PIT_WATER = -Q_D + 0.02;
const MESA_STEP = 0.06;
function quarryAt(L: Layout, x: number, z: number) {
  const qc = L.marks.quarry!;
  const ax = L.marks.qaxis!.x;
  const [tx, tz] = [-Math.sin(ax), Math.cos(ax)];
  const [hx, hz] = [Math.cos(ax), Math.sin(ax)];
  const [dx, dz] = [x - qc.x, z - qc.z];
  const u = dx * tx + dz * tz;
  const v = dx * hx + dz * hz;
  const d = Math.hypot(u / QA, v / QB) * (1 + 0.13 * noise(Math.atan2(v, u) * 2.2, 0.5, L.seed + 21));
  const [a, b] = [L.marks.trA!, L.marks.trB!];
  const [sx, sz] = [b.x - a.x, b.z - a.z];
  const w = Math.min(1, Math.max(0, ((x - a.x) * sx + (z - a.z) * sz) / (sx * sx + sz * sz)));
  const trench = Math.hypot(x - a.x - w * sx, z - a.z - w * sz) / (0.045 * (1 - 0.4 * w));
  return { d, u, v, trench };
}
// Grain's field frame at a point: `u` along the back edge, `v` toward the back rise; which strip it is in (or -1 on a track,
// on the rise or on the pad), and how far inside that strip's edges it is.
export function fieldAt(L: Layout, x: number, z: number) {
  const [hx, hz] = [Math.cos(L.hillAt), Math.sin(L.hillAt)];
  const u = x * -hz + z * hx;
  const v = x * hx + z * hz;
  let strip = -1;
  let inside = 0;
  L.strips.forEach((s, i) => {
    if (u >= s.u0 && u <= s.u1) (strip = i), (inside = Math.min(u - s.u0, s.u1 - u));
  });
  // The field stops at the rise's foot and round the pad.
  const keep = (1 - smooth(-0.08, 0.02, v)) * smooth(0.36, 0.42, Math.hypot(x, z)) * (1 - smooth(INR - 0.12, INR - 0.06, hexDist(x, z)));
  return { u, v, strip, inside, keep };
}
const FURROW = 0.05;

// How much of the bed under the water a point is (0 dry, 1 deep), for its colour.
function wetAt(L: Layout, x: number, z: number) {
  let w = 0;
  if (L.stream.length) w = 1 - smooth(STREAM_W * 0.35, STREAM_W * 0.8, streamDist(L, x, z));
  if (L.pool && L.kind === "clay") w = Math.max(w, 1 - smooth(L.pool.r * 0.75, L.pool.r * 1.05, Math.hypot(x - L.pool.x, z - L.pool.z)));
  else if (L.pool) w = Math.max(w, 1 - smooth(L.pool.r * 0.55, L.pool.r * 0.82, Math.hypot(x - L.pool.x, z - L.pool.z)));
  return w;
}

// --- colour

const BANK = new THREE.Color("#d9cf9e");
const BED = new THREE.Color("#2f8f8a");
const WETROCK = new THREE.Color("#6f8a72");

const C = (h: string) => new THREE.Color(h);
type Paint = { low: THREE.Color; high: THREE.Color; steep: THREE.Color; crease: THREE.Color; pad: THREE.Color; lip: string };
const PAINTS: Partial<Record<Terrain, Paint>> = {
  timber: { low: C("#5fae47"), high: C("#8cc65a"), steep: C("#7d8a4a"), crease: C("#2f5a2e"), pad: C("#a9cf7c"), lip: "#6db64f" },
  grain: { low: C("#86c450"), high: C("#a8d468"), steep: C("#8db45a"), crease: C("#4a8a38"), pad: C("#e6e2ae"), lip: "#96cf5a" },
  clay: { low: C("#dc7a4a"), high: C("#eba56e"), steep: C("#b9542f"), crease: C("#8a3a22"), pad: C("#f2cfa4"), lip: "#dc7a4a" },
  wool: { low: C("#86cc52"), high: C("#b6e070"), steep: C("#93b85a"), crease: C("#4a8a38"), pad: C("#c6e49c"), lip: "#96d45c" },
};

// --- materials

// The soft three-step toon ramp on direct light and a sky-tinted Fresnel sheen (docs/design/terrain.md "Colour and light").
const DIFFUSE = "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );";
const RAMPED =
  "float toonStep( float x ) { return 0.45 + 0.4 * smoothstep( 0.05, 0.4, x ) + 0.15 * smoothstep( 0.7, 0.98, x ); }\n" +
  THREE.ShaderChunk.lights_physical_pars_fragment.replace(DIFFUSE, DIFFUSE.replace("irradiance", "toonStep( dotNL ) * directLight.color"));
const SKY = new THREE.Color(LIGHT.sky);
const SHEEN = `\n\treflectedLight.indirectDiffuse += mix( material.diffuseColor, vec3( ${SKY.r.toFixed(3)}, ${SKY.g.toFixed(3)}, ${SKY.b.toFixed(3)} ), 0.55 ) * 0.35 * pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 2.5 );`;
// The tile being built: its robber dulling and its roll flash, which every jelly material it makes shares (buildTile sets it).
let TU = { dull: { value: 0 }, flash: { value: 0 } };
function jellyfy(m: THREE.MeshStandardMaterial, key: string, extra?: (sh: THREE.WebGLProgramParametersWithUniforms) => void) {
  const tu = TU;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDull = tu.dull;
    sh.uniforms.uFlash = tu.flash;
    sh.fragmentShader =
      "uniform float uDull;\nuniform float uFlash;\n" +
      sh.fragmentShader
        .replace("#include <lights_physical_pars_fragment>", RAMPED)
        .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>" + SHEEN)
        .replace(
          "#include <dithering_fragment>",
          `#include <dithering_fragment>
          gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( dot( gl_FragColor.rgb, vec3( 0.3, 0.55, 0.15 ) ) ) * 0.92, uDull * 0.6 );
          gl_FragColor.rgb += uFlash * vec3( 0.22, 0.16, 0.05 );`,
        );
    extra?.(sh);
  };
  m.customProgramCacheKey = () => key;
  return m;
}
const topMat = () => jellyfy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }), "jelly-top");
const blobMat = () => jellyfy(new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0 }), "jelly-blob");

// The strata on the cut side, drawn in the fragment shader from the side's local height and angle: a lip of the surface's own
// colour, pale sand with white pebbles, a shell band, caramel soil with dark grit, chocolate rock with pale flecks; the
// borders wave round the tile.
// The five bands per kind (prompt "Strata per kind"): sand, shell, soil, rock, and the grit and flecks in them.
const STRATA_KIND: Record<string, { sand: string; shell: string; soil: string; rock: string; grit: string; fleck: string }> = {
  timber: { sand: "#ecdbb2", shell: "#f7f0e2", soil: "#bb7a42", rock: "#5f4234", grit: "#7a4a26", fleck: "#8a6a58" },
  wool: { sand: "#efe0b8", shell: "#f8f2e4", soil: "#c4874c", rock: "#6a4a38", grit: "#8a5a32", fleck: "#9a7a66" },
  grain: { sand: "#f0d48c", shell: "#faf2dc", soil: "#a8683a", rock: "#5a3a26", grit: "#7a4422", fleck: "#8a6a50" },
  clay: { sand: "#f0c8a0", shell: "#f8ece0", soil: "#c4562e", rock: "#7a2e1e", grit: "#8a3418", fleck: "#b0604a" },
  ore: { sand: "#d8d8d2", shell: "#f2f2ee", soil: "#7a7066", rock: "#4a4e56", grit: "#55504a", fleck: "#8a909a" },
  waste: { sand: "#f2dca8", shell: "#faf0dc", soil: "#c9913e", rock: "#8a4a2a", grit: "#9a6a2a", fleck: "#b07a5a" },
};
function strataMat(lip: string, kind: Terrain) {
  const L = new THREE.Color(lip);
  const K = STRATA_KIND[kind]!;
  const v = (c: string) => {
    const k = new THREE.Color(c);
    return `vec3(${k.r.toFixed(4)}, ${k.g.toFixed(4)}, ${k.b.toFixed(4)})`;
  };
  return jellyfy(new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 }), `jelly-strata-${kind}`, (sh) => {
    sh.vertexShader = "varying vec3 vLocal;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvLocal = position;");
    sh.fragmentShader =
      `varying vec3 vLocal;
      float h21( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      // A pebble field: one disc per cell, at a random spot, of a random size, present in about half the cells.
      float pebbles( vec2 p, float cell, float size ) {
        vec2 c = floor( p / cell );
        vec2 f = p / cell - c;
        float h = h21( c );
        vec2 o = vec2( h21( c + 7.1 ), h21( c + 3.3 ) ) * 0.6 + 0.2;
        float r = size * ( 0.5 + 0.5 * h21( c + 1.9 ) );
        return step( 0.5, h ) * ( 1.0 - smoothstep( r * 0.7, r, length( ( f - o ) * vec2( 1.0, 1.6 ) ) ) );
      }
      ` +
      sh.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float ang = atan( vLocal.z, vLocal.x );
        vec2 uv = vec2( ang * 1.12, vLocal.y );
        float y = vLocal.y + 0.007 * sin( ang * 7.0 + 1.3 ) + 0.004 * sin( ang * 17.0 );
        vec3 col = ${v(K.rock)};
        col = mix( col, ${v(K.soil)}, step( 0.07, y ) );
        col = mix( col, ${v(K.shell)}, step( 0.152, y ) );
        col = mix( col, ${v(K.sand)}, step( 0.166, y ) );
        col = mix( col, vec3(${L.r.toFixed(4)}, ${L.g.toFixed(4)}, ${L.b.toFixed(4)}), step( 0.232, y ) );
        float sand = step( 0.166, y ) * ( 1.0 - step( 0.232, y ) );
        float soil = step( 0.07, y ) * ( 1.0 - step( 0.152, y ) );
        float rock = 1.0 - step( 0.07, y );
        col = mix( col, vec3( 1.0, 0.99, 0.96 ), sand * pebbles( uv, 0.016, 0.32 ) );
        col = mix( col, ${v(K.grit)}, soil * pebbles( uv + 3.1, 0.014, 0.3 ) );
        col = mix( col, ${v(K.fleck)}, rock * pebbles( uv + 7.7, 0.02, 0.34 ) );
        // A soft darkening toward the base, so the block sits on the paper.
        col *= 0.82 + 0.18 * smoothstep( 0.0, 0.08, vLocal.y );
        diffuseColor.rgb = col;`,
      );
  });
}

// --- the block


// The block with its top, rim and strata: a hex lattice of `rings` rings warped onto the rounded outline, a rim that rolls
// over ROUND_E, the side straight down to the base. `occlude` darkens the ground under a prop (canopy cover, contact).
function block(L: Layout, rings: number, occlude: (x: number, z: number) => number, tint?: (x: number, z: number, y: number, c: THREE.Color) => void) {
  const P = PAINTS[L.kind]!;
  const inrTop = INR - ROUND_E;
  const rcTop = ROUND_C - ROUND_E;
  const R = rings;
  const s = inrTop / (SQ3 / 2) / R;
  const S = 2 * R + 1;
  const grid = new Int32Array(S * S).fill(-1);
  const xs: number[] = [];
  const zs: number[] = [];
  for (let a = -R; a <= R; a++) {
    for (let b = Math.max(-R, -a - R); b <= Math.min(R, -a + R); b++) {
      grid[(a + R) * S + b + R] = xs.length;
      // The exact hexagon, warped along each ray onto the rounded outline.
      const x = (SQ3 / 2) * s * a;
      const z = 0.5 * s * a + s * b;
      const l = Math.hypot(x, z);
      if (l < 1e-9) {
        xs.push(0);
        zs.push(0);
        continue;
      }
      const t = Math.atan2(z, x);
      const sixth = Math.PI / 3;
      const off = (((t % sixth) + sixth) % sixth);
      const hexR = inrTop / Math.cos(Math.min(off, sixth - off));
      const f = outlineAt(t, inrTop, rcTop) / hexR;
      xs.push(x * f);
      zs.push(z * f);
    }
  }
  const id = (a: number, b: number) => (Math.abs(a) > R || Math.abs(b) > R ? -1 : grid[(a + R) * S + b + R]!);
  const n = xs.length;
  const hs = new Float32Array(n);
  for (let i = 0; i < n; i++) hs[i] = heightAt(L, xs[i]!, zs[i]!);
  const index: number[] = [];
  for (let a = -R; a < R; a++)
    for (let b = -R; b < R; b++) {
      const [p0, p1, p2, p3] = [id(a, b), id(a + 1, b), id(a, b + 1), id(a + 1, b + 1)];
      if (p0 >= 0 && p1 >= 0 && p2 >= 0) index.push(p0, p2, p1);
      if (p1 >= 0 && p3 >= 0 && p2 >= 0) index.push(p1, p2, p3);
    }
  // The boundary ring, corner to corner.
  const steps: [number, number][] = [[-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]];
  const cs: [number, number][] = [[R, 0], [0, R], [-R, R], [-R, 0], [0, -R], [R, -R]];
  const ring: number[] = [];
  for (let k = 0; k < 6; k++) for (let i = 0; i < R; i++) ring.push(id(cs[k]![0] + steps[k]![0] * i, cs[k]![1] + steps[k]![1] * i));
  const N = ring.length;

  // Positions: the top, then the rim's rows round the ring.
  const pos: number[] = [];
  for (let i = 0; i < n; i++) pos.push(xs[i]!, BLOCK_H + hs[i]!, zs[i]!);
  const outward: (readonly [number, number])[] = ring.map((p) => outlineNormal(xs[p]!, zs[p]!, inrTop, rcTop));
  const rimRow = (j: number) => (j === 0 ? -1 : n + (j - 1) * N);
  for (let j = 1; j <= RIM_ROWS; j++) {
    const a = (j / RIM_ROWS) * (Math.PI / 2);
    for (let i = 0; i < N; i++) {
      const p = ring[i]!;
      const [ox, oz] = outward[i]!;
      pos.push(xs[p]! + ox * ROUND_E * Math.sin(a), BLOCK_H + hs[p]! - ROUND_E * (1 - Math.cos(a)), zs[p]! + oz * ROUND_E * Math.sin(a));
    }
  }
  const at = (i: number, j: number) => (j === 0 ? ring[i]! : rimRow(j) + i);
  for (let j = 0; j < RIM_ROWS; j++)
    for (let i = 0; i < N; i++) {
      const i1 = (i + 1) % N;
      // The ring runs counter-clockwise seen from above; outward-and-down faces outward with this winding.
      index.push(at(i, j), at(i1, j), at(i, j + 1), at(i1, j), at(i1, j + 1), at(i, j + 1));
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  // Fix the winding if the rim faces in (the top's own winding decides; check one rim triangle's normal against outward).
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  if (nor.getY(0) < 0) {
    for (let k = 0; k < index.length; k += 3) [index[k + 1], index[k + 2]] = [index[k + 2]!, index[k + 1]!];
    geo.setIndex(index);
    geo.computeVertexNormals();
  }

  // Colour: slope and height, horizon AO, the pad, the props' shade.
  const total = pos.length / 3;
  const col = new Float32Array(total * 3);
  const c = new THREE.Color();
  const DIRS = 8;
  for (let v = 0; v < total; v++) {
    const [x, y, z] = [pos[v * 3]!, pos[v * 3 + 1]! - BLOCK_H, pos[v * 3 + 2]!];
    const ny = nor.getY(v);
    // Horizon AO over the heightfield: the mean sine of the steepest horizon in eight directions.
    let occ = 0;
    if (v < n) {
      for (let d = 0; d < DIRS; d++) {
        const a = (d / DIRS) * Math.PI * 2;
        let best = 0;
        for (const r of [0.03, 0.07, 0.12, 0.2, 0.3, 0.42]) {
          const hx = x + Math.cos(a) * r;
          const hz = z + Math.sin(a) * r;
          if (sdRound(hx, hz, inrTop, rcTop) > 0) break;
          best = Math.max(best, (heightAt(L, hx, hz) - y) / r);
        }
        occ += best / Math.hypot(1, best);
      }
      occ /= DIRS;
    }
    const steep = smooth(0.82, 0.55, ny);
    c.copy(P.low).lerp(P.high, smooth(0.0, 0.45, y)).lerp(P.steep, steep * 0.7);
    if (tint && v < n) tint(x, z, y, c);
    c.lerp(P.pad, 0.6 * (1 - smooth(PAD_R - 0.04, PAD_R + 0.03, Math.hypot(x, z))));
    // Creases go warm and soft, never black.
    c.lerp(P.crease, Math.min(0.75, occ * 1.6 + occlude(x, z) * 0.6));
    // Under the water: a sandy bank, then the teal bed darkening with depth.
    const wet = v < n ? wetAt(L, x, z) : 0;
    // On the flat a sandy bank; where the stream falls down the hill, wet mossy rock.
    if (wet > 0) c.lerp(steep > 0.3 ? WETROCK : BANK, smooth(0.25, 0.6, wet) * 0.85).lerp(BED, smooth(0.45, 1, wet) * Math.min(1, Math.max(0, -y * 14)));
    c.toArray(col, v * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const top = new THREE.Mesh(geo, topMat());
  top.receiveShadow = true;
  top.castShadow = true;

  // The side: straight down from the rim's foot to the base, two rows; the strata are the shader's.
  const sp: number[] = [];
  const sn: number[] = [];
  const si: number[] = [];
  for (let i = 0; i < N; i++) {
    const p = ring[i]!;
    const [ox, oz] = outward[i]!;
    const [x, z] = [xs[p]! + ox * ROUND_E, zs[p]! + oz * ROUND_E];
    sp.push(x, BLOCK_H + hs[p]! - ROUND_E, z, x, 0, z);
    sn.push(ox, 0, oz, ox, 0, oz);
  }
  for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N;
    si.push(i * 2, i1 * 2, i * 2 + 1, i1 * 2, i1 * 2 + 1, i * 2 + 1);
  }
  const sideGeo = new THREE.BufferGeometry();
  sideGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  sideGeo.setAttribute("normal", new THREE.Float32BufferAttribute(sn, 3));
  sideGeo.setIndex(si);
  // Wind the side outward.
  {
    const a = new THREE.Vector3().fromArray(sp, 0);
    const b = new THREE.Vector3().fromArray(sp, 6);
    const d = new THREE.Vector3().fromArray(sp, 3);
    const fn = b.clone().sub(a).cross(d.clone().sub(a));
    if (fn.x * sn[0]! + fn.z * sn[2]! < 0) {
      for (let k = 0; k < si.length; k += 3) [si[k + 1], si[k + 2]] = [si[k + 2]!, si[k + 1]!];
      sideGeo.setIndex(si);
    }
  }
  const side = new THREE.Mesh(sideGeo, strataMat(P.lip, L.kind));
  side.castShadow = true;
  side.receiveShadow = true;
  return { top, side, tris: index.length / 3 + si.length / 3 };
}

// --- props: lumpy blobs and trunks

// A lumpy unit blob: an icosphere pushed in and out by smooth noise, merged so its normals are smooth.
function blobGeo(seed: number) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 2), 1e-4);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.1 * noise(v.x * 1.7 + v.y * 0.9, v.z * 1.7 - v.y * 0.6, seed) + 0.05 * noise(v.x * 4 + 2, v.z * 4 + v.y * 3, seed + 3);
    v.multiplyScalar(k);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

type Inst = { m: THREE.Matrix4; c: THREE.Color };
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const mat = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

function instanced(geo: THREE.BufferGeometry, list: Inst[], material: THREE.Material) {
  const m = new THREE.InstancedMesh(geo, material, list.length);
  list.forEach((it, i) => {
    m.setMatrixAt(i, it.m);
    m.setColorAt(i, it.c);
  });
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// --- small crafted things: coloured parts merged into one geometry per creature or prop

const critterMat = () => jellyfy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 }), "jelly-critter");
// A part: a geometry, coloured, placed by position, rotation (XYZ) and scale; non-indexed so any mix merges.
function part(g: THREE.BufferGeometry, hex: string, p: [number, number, number], r: [number, number, number] = [0, 0, 0], k: [number, number, number] = [1, 1, 1]) {
  const geo = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(
    new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...k)),
  );
  geo.deleteAttribute("uv");
  const c = new THREE.Color(hex);
  const a = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) c.toArray(a, i);
  geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return geo;
}
const merge = (parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
};
const sphere = (n = 12) => new THREE.SphereGeometry(1, n, Math.max(6, n * 0.7));
const cyl = (rt: number, rb: number, n = 10) => new THREE.CylinderGeometry(rt, rb, 1, n);
const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
  const o = new THREE.Mesh(g, m);
  o.castShadow = o.receiveShadow = true;
  return o;
};

// A deer, facing +x, hooves at y 0: tan body, cream belly and tail, dark nose; the neck and head on their own pivot at the
// shoulder so she can lower her head to drink. `fawn` adds white spots.
function deer(fawn: boolean, m: THREE.Material) {
  const TAN = fawn ? "#c48b55" : "#b77a46";
  const g = new THREE.Group();
  const body: THREE.BufferGeometry[] = [
    part(sphere(), TAN, [0, 0.07, 0], [0, 0, 0.05], [0.046, 0.024, 0.021]),
    part(sphere(), "#ecd9b8", [0, 0.062, 0], [0, 0, 0.05], [0.036, 0.016, 0.018]),
    part(sphere(8), "#f6efe2", [-0.047, 0.078, 0], [0, 0, 0.6], [0.009, 0.012, 0.008]),
  ];
  for (const [x, z] of [[0.03, 0.011], [0.03, -0.011], [-0.03, 0.011], [-0.03, -0.011]]) {
    body.push(part(cyl(0.0045, 0.0035, 6), TAN, [x!, 0.03, z!], [0, 0, 0], [1, 0.062, 1]));
    body.push(part(cyl(0.0036, 0.0036, 6), "#3b2a20", [x!, 0.003, z!], [0, 0, 0], [1, 0.007, 1]));
  }
  if (fawn) for (let i = 0; i < 7; i++) body.push(part(sphere(6), "#fbf4e6", [-0.03 + i * 0.01, 0.091 + (i % 2) * 0.002, (i % 2 ? 1 : -1) * 0.008], [0, 0, 0], [0.004, 0.002, 0.004]));
  g.add(mesh(merge(body), m));
  const neck = new THREE.Group();
  neck.position.set(0.036, 0.082, 0);
  const head: THREE.BufferGeometry[] = [
    part(cyl(0.008, 0.011, 8), TAN, [0.014, 0.018, 0], [0, 0, -0.75], [1, 0.045, 1]),
    part(sphere(), TAN, [0.03, 0.04, 0], [0, 0, -0.35], [0.019, 0.012, 0.011]),
    part(sphere(8), "#8a5a35", [0.046, 0.034, 0], [0, 0, -0.35], [0.008, 0.007, 0.007]),
    part(sphere(6), "#2a1d17", [0.052, 0.032, 0], [0, 0, 0], [0.003, 0.003, 0.003]),
    part(sphere(6), "#1d1410", [0.035, 0.046, 0.009], [0, 0, 0], [0.0025, 0.0025, 0.0025]),
    part(sphere(6), "#1d1410", [0.035, 0.046, -0.009], [0, 0, 0], [0.0025, 0.0025, 0.0025]),
  ];
  neck.add(mesh(merge(head), m));
  const ears: THREE.Mesh[] = [];
  for (const side of [1, -1]) {
    const ear = mesh(merge([part(new THREE.ConeGeometry(1, 1, 8), TAN, [0, 0.008, 0], [0, 0, 0], [0.006, 0.016, 0.003]), part(new THREE.ConeGeometry(1, 1, 8), "#e9c9a6", [0, 0.008, 0.0012 * side], [0, 0, 0], [0.004, 0.012, 0.002])]), m);
    ear.position.set(0.024, 0.05, 0.009 * side);
    ear.rotation.set(0.6 * side, 0, 0.3);
    neck.add(ear);
    ears.push(ear);
  }
  g.add(neck);
  g.scale.setScalar(SIZE.deer * (fawn ? 0.66 : 1));
  g.userData.ref = fawn ? "fawn" : "deer";
  return { g, neck, ears };
}

// A salmon along +x: coral flanks, a darker back, a cream belly and a forked tail.
function salmonGeo() {
  return merge([
    part(sphere(), "#f08a6c", [0, 0, 0], [0, 0, 0], [0.03, 0.011, 0.009]),
    part(sphere(), "#a8564a", [0.002, 0.004, 0], [0, 0, 0], [0.026, 0.008, 0.007]),
    part(sphere(), "#f7d9c4", [0, -0.004, 0], [0, 0, 0], [0.024, 0.006, 0.0075]),
    part(new THREE.ConeGeometry(1, 1, 6), "#d9705a", [-0.034, 0.004, 0], [0, 0, -1.1], [0.007, 0.016, 0.002]),
    part(new THREE.ConeGeometry(1, 1, 6), "#d9705a", [-0.034, -0.004, 0], [0, 0, -2.0], [0.007, 0.016, 0.002]),
    part(new THREE.ConeGeometry(1, 1, 6), "#c8604c", [0.0, 0.012, 0], [0, 0, -0.3], [0.006, 0.01, 0.0015]),
    part(sphere(6), "#1a1414", [0.022, 0.003, 0.006], [0, 0, 0], [0.0022, 0.0022, 0.0022]),
    part(sphere(6), "#1a1414", [0.022, 0.003, -0.006], [0, 0, 0], [0.0022, 0.0022, 0.0022]),
  ]);
}

// The jelly water: milky turquoise, translucent, a pale rim of light, slow ripples; the stream's band carries a flow of light.
function waterMat(flow: boolean) {
  const m = jellyfy(new THREE.MeshStandardMaterial({ color: "#78d4cc", roughness: 0.18, metalness: 0, transparent: true, opacity: 0.82 }), `jelly-water-${flow}`, (sh) => {
    sh.uniforms.uTime = m.userData.time;
    sh.vertexShader = "uniform float uTime;\nvarying vec2 vFlow;\n" + sh.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vFlow = uv;
      transformed.y += 0.0018 * sin( position.x * 70.0 + uTime * 2.1 ) * sin( position.z * 63.0 - uTime * 1.7 );`,
    );
    sh.fragmentShader = "uniform float uTime;\nvarying vec2 vFlow;\n" + sh.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      ${flow
        ? "float st = smoothstep( 0.55, 1.0, sin( vFlow.y * 90.0 - uTime * 6.0 + sin( vFlow.x * 9.0 ) * 1.5 ) ) * 0.35; diffuseColor.rgb += st; diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.96, 0.99, 0.96 ), smoothstep( 0.38, 0.5, abs( vFlow.x - 0.5 ) ) * 0.7 );"
        : "float rr = length( vFlow - 0.5 ) * 2.0; diffuseColor.rgb = mix( vec3( 0.18, 0.56, 0.56 ), diffuseColor.rgb, smoothstep( 0.0, 0.9, rr ) ); diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.97, 0.99, 0.95 ), smoothstep( 0.9, 0.99, rr ) * 0.85 ); diffuseColor.rgb += 0.06 * sin( rr * 40.0 - uTime * 2.0 ) * ( 1.0 - rr );"}`,
    );
  });
  m.userData.time = { value: 0 };
  return m;
}
// A soft warm halo of light (a sprite with a radial falloff drawn once on a small canvas, added over what is behind it): the glow
// round a fire, a lit window or a lantern at night. Its opacity follows the night.
let haloTex: THREE.CanvasTexture | null = null;
function halo(hex: string, size: number) {
  if (!haloTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.35, "rgba(255,255,255,0.45)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    haloTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: hex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  s.scale.setScalar(size);
  s.userData.loose = true;
  return s;
}
const basic = (hex: string, opacity = 1) => new THREE.MeshBasicMaterial({ color: hex, transparent: opacity < 1, opacity, toneMapped: false });

type Life = (t: number) => void;
type Built = { g: THREE.Group; stands: { x: number; z: number; r: number }[]; life: Life[] };
// What the board tells a tile (prompt "THE TILE IN PLAY"): night (0 day to 1 night), whether the robber stands on it, and the
// roll payoff's progress (0 to 1 while it plays, -1 otherwise). Every life loop reads it.
export type Env = { night: number; robber: boolean; roll: number };
const ease = (u: number) => u * u * (3 - 2 * u);

// TIMBER, "The Salmon Run" (docs/design/hex-jelly-prompt.md): the wooded hill and its canopy, the spring, the stream and its
// falls, the pool with leaping salmon, the doe and fawn drinking, the campsite and its bonfire, the axe stump and log stack,
// the fairy ring, ferns and mossy boulders, and the owl's eyes in a pine.
function forest(L: Layout, ground: (x: number, z: number) => number, r: () => number, env: Env): Built {
  const g = new THREE.Group();
  const life: Life[] = [];
  const stands: { x: number; z: number; r: number }[] = [];
  const Y = (x: number, z: number) => BLOCK_H + ground(x, z);
  const cm = critterMat();
  const pool = L.pool!;
  const camp = L.camp!;
  // The camp: the fire toward the clearing, the tent behind it, the logs either side.
  const fire = at(camp.a, 0.5);
  const tentAt = at(camp.a + 0.12, 0.7);
  // The woodcutter's spot, on the far side of the camp from the tent, and the tree he is felling just beyond him.
  const cutAt = at(camp.a - 0.55, 0.52);
  // Whether (x, z) is clear of the eye's sightline to p (nothing tall in front of it).
  const inViewOf = (p: Pt, x: number, z: number) => {
    const [dx, dz] = [x - p.x, z - p.z];
    const along = dx * Math.sin(20 * DEG) + dz * Math.cos(20 * DEG);
    return !(along > 0 && along < 0.4 && Math.abs(dx * Math.cos(20 * DEG) - dz * Math.sin(20 * DEG)) < 0.14);
  };
  // Keep-outs for the trees: water, camp, deer, the ring's middle.
  const clear = (x: number, z: number, room: number) =>
    streamDist(L, x, z) > 0.06 + room &&
    Math.hypot(x - pool.x, z - pool.z) > pool.r + 0.05 + room &&
    Math.hypot(x - fire.x, z - fire.z) > 0.16 + room &&
    Math.hypot(x - tentAt.x, z - tentAt.z) > 0.1 + room &&
    (!L.deer || Math.hypot(x - L.deer.x, z - L.deer.z) > 0.1 + room) &&
    Math.hypot(x - L.ring!.x, z - L.ring!.z) > 0.06 + room &&
    Math.hypot(x - cutAt.x, z - cutAt.z) > 0.17 + room &&
    inViewOf(cutAt, x, z);
  // Nothing tall stands between the eye and a story spot (the pool, the deer, the fire, the tent).
  const EYE = { x: Math.sin(20 * DEG), z: Math.cos(20 * DEG) };
  const spots = [pool, fire, tentAt, ...(L.deer ? [L.deer] : [])];
  const inView = (x: number, z: number) =>
    spots.some((p) => {
      const [dx, dz] = [x - p.x, z - p.z];
      const along = dx * EYE.x + dz * EYE.z;
      return along > 0 && along < 0.32 && Math.abs(dx * EYE.z - dz * EYE.x) < 0.13;
    });
  const ok = (x: number, z: number, room: number) =>
    !inView(x, z) &&
    Math.hypot(x, z) > 0.37 + room && nearestCorner(x, z) > 0.22 && hexDist(x, z) < INR - 0.16 && clear(x, z, room) && stands.every((s) => Math.hypot(s.x - x, s.z - z) > (s.r + room) * 0.62);

  // The canopy.
  type Blob = { x: number; y: number; z: number; s: number; kind: "leaf" | "pine" | "bush" };
  const blobs: Blob[] = [];
  const trunks: Inst[] = [];
  const pines: { x: number; z: number; y: number; s: number }[] = [];
  const BARK = new THREE.Color("#6e4128");
  for (let tries = 0; tries < 4000 && stands.length < 72; tries++) {
    const a = r() * Math.PI * 2;
    const d = 0.38 + Math.sqrt(r()) * 0.52;
    const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
    const h = ground(x, z);
    if (r() > 0.1 + h * 4) continue;
    const pine = h > 0.32 && r() < 0.6;
    const size = (pine ? 0.075 : 0.065 + r() * 0.03) * (0.9 + Math.min(1, h * 2) * 0.3);
    if (!ok(x, z, size)) continue;
    stands.push({ x, z, r: size });
    const y0 = BLOCK_H + h;
    if (pine) {
      const th = size * 0.9;
      trunks.push({ m: mat(x, y0 + th / 2, z, size * 0.22, th, size * 0.22), c: BARK });
      for (let t = 0; t < 4; t++) blobs.push({ x, y: y0 + th + t * size * 0.62, z, s: size * (0.55 + 0.75 * (1 - t / 4)), kind: "pine" });
      pines.push({ x, z, y: y0 + th, s: size });
    } else {
      const th = size * 0.8;
      trunks.push({ m: mat(x, y0 + th / 2, z, size * 0.26, th, size * 0.26), c: BARK });
      const n = 3 + Math.floor(r() * 4);
      blobs.push({ x, y: y0 + th + size, z, s: size * 1.05, kind: "leaf" });
      for (let i = 1; i < n; i++) {
        const a2 = r() * Math.PI * 2;
        blobs.push({ x: x + Math.cos(a2) * size * 0.75, y: y0 + th + size * (0.6 + r() * 0.8), z: z + Math.sin(a2) * size * 0.75, s: size * (0.6 + r() * 0.3), kind: "leaf" });
      }
    }
  }
  for (let tries = 0, k = 0; tries < 400 && k < 8; tries++) {
    const a = r() * Math.PI * 2;
    const d = 0.42 + r() * 0.42;
    const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
    if (!ok(x, z, 0.04)) continue;
    stands.push({ x, z, r: 0.04 });
    const y0 = Y(x, z);
    for (let i = 0; i < 3; i++) blobs.push({ x: x + (r() - 0.5) * 0.05, y: y0 + 0.022 + r() * 0.02, z: z + (r() - 0.5) * 0.05, s: 0.03 + r() * 0.014, kind: "bush" });
    k++;
  }
  const LEAF = [new THREE.Color("#2f7a34"), new THREE.Color("#4f9a3c"), new THREE.Color("#7cbb4a")];
  const PINE = [new THREE.Color("#1f5a34"), new THREE.Color("#2f7340"), new THREE.Color("#4a8d4c")];
  const BUSH = [new THREE.Color("#3f8a3a"), new THREE.Color("#5fa544"), new THREE.Color("#8cc65a")];
  const ymin = Math.min(...blobs.map((b) => b.y));
  const ymax = Math.max(...blobs.map((b) => b.y));
  const leaves: Inst[] = blobs.map((b, i) => {
    let buried = 0;
    blobs.forEach((o, j) => {
      if (j === i) return;
      const d = Math.hypot(o.x - b.x, o.y - b.y, o.z - b.z);
      if (d < (o.s + b.s) * 1.1) buried += (o.y > b.y ? 1 : 0.4) * (1 - d / ((o.s + b.s) * 1.1));
    });
    const pal = b.kind === "pine" ? PINE : b.kind === "bush" ? BUSH : LEAF;
    const t = Math.min(1, Math.max(0, (b.y - ymin) / (ymax - ymin + 1e-6)) * 0.6 + r() * 0.4);
    const c = pal[0]!.clone().lerp(pal[1]!, Math.min(1, t * 2)).lerp(pal[2]!, Math.max(0, t * 2 - 1) * 0.8);
    c.multiplyScalar(1 - Math.min(0.35, buried * 0.18));
    const flat = b.kind === "pine" ? 0.55 : b.kind === "bush" ? 0.8 : 0.92;
    return { m: mat(b.x, b.y, b.z, b.s, b.s * flat, b.s, r() * 6.28), c };
  });
  g.add(instanced(blobGeo(L.seed % 97), leaves, blobMat()));

  // Wood: trunks, the stumps, the axe stump, the split logs, the sitting logs.
  const wood: Inst[] = [...trunks];
  const CUT = new THREE.Color("#e2ae74");
  const LOGC = new THREE.Color("#7a4a2c");
  const stump = (x: number, z: number, h = 0.04, rr = 0.032) => {
    wood.push({ m: mat(x, Y(x, z) + h / 2, z, rr, h, rr), c: BARK });
    wood.push({ m: mat(x, Y(x, z) + h + 0.0015, z, rr * 0.86, 0.003, rr * 0.86), c: CUT });
    stands.push({ x, z, r: rr });
  };
  // A log lying along angle `a` at (x, z).
  const log = (x: number, z: number, a: number, len: number, rr: number, y = Y(x, z) + rr) => {
    wood.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, Math.PI / 2, "YXZ")), new THREE.Vector3(rr, len, rr)), c: LOGC });
  };
  // The fire's sitting logs, tangent to it.
  const toCentre = Math.atan2(-fire.z, -fire.x);
  for (const side of [-1, 1]) {
    const p = { x: fire.x + Math.cos(toCentre + side * 1.57) * 0.1, z: fire.z + Math.sin(toCentre + side * 1.57) * 0.1 };
    log(p.x, p.z, toCentre, 0.09, 0.017);
  }
  // The axe stump and the split-log stack beside the tent.
  const axeAt = at(camp.a - 0.32, 0.66);
  stump(axeAt.x, axeAt.z, 0.035, 0.03);
  const stackAt = at(camp.a + 0.36, 0.66);
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 3 - row; i++) {
      const off = (i - (2 - row) / 2) * 0.022;
      const ta = camp.a + Math.PI / 2;
      log(stackAt.x + Math.cos(ta) * off, stackAt.z + Math.sin(ta) * off, camp.a, 0.06, 0.011, Y(stackAt.x, stackAt.z) + 0.011 + row * 0.019);
    }
  stands.push({ x: stackAt.x, z: stackAt.z, r: 0.05 });
  // A couple of old stumps in the trees.
  for (let k = 0, tries = 0; k < 2 && tries < 300; tries++) {
    const a = r() * Math.PI * 2;
    const d = 0.42 + r() * 0.35;
    const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
    if (!ok(x, z, 0.04)) continue;
    stump(x, z);
    k++;
  }
  g.add(instanced(cyl(0.85, 1), wood, blobMat()));

  // The axe, bitten into the stump.
  const axe = mesh(merge([part(new THREE.BoxGeometry(1, 1, 1), "#c49a62", [0, 0.03, 0], [0, 0, 0], [0.005, 0.06, 0.005]), part(new THREE.BoxGeometry(1, 1, 1), "#9aa3a8", [0.008, 0.002, 0], [0, 0, 0], [0.02, 0.012, 0.004])]), cm);
  axe.position.set(axeAt.x, Y(axeAt.x, axeAt.z) + 0.04, axeAt.z);
  axe.rotation.set(0, camp.a, 0.55);
  g.add(axe);

  // The woodcutter: a villager in a red shirt swinging an axe into a tree, chips flying; on a roll he chops double time.
  {
    const toEye = Math.atan2(Math.cos(20 * DEG), Math.sin(20 * DEG));
    // The tree stands beside him, side-on to the eye, so the swing reads.
    const side = { x: Math.cos(toEye + Math.PI / 2), z: Math.sin(toEye + Math.PI / 2) };
    const treeAt = { x: cutAt.x + side.x * 0.07, z: cutAt.z + side.z * 0.07 };
    const ty = Y(treeAt.x, treeAt.z);
    const tree: THREE.BufferGeometry[] = [part(cyl(0.75, 1, 10), "#6e4128", [treeAt.x, ty + 0.05, treeAt.z], [0, 0, 0], [0.016, 0.1, 0.016])];
    tree.push(part(cyl(1, 1, 10), "#e2ae74", [treeAt.x - side.x * 0.011, ty + 0.025, treeAt.z - side.z * 0.011], [0, -Math.atan2(side.z, side.x), Math.PI / 2], [0.009, 0.01, 0.009]));
    // A pine: four flattened tiers, so its crown sits above the woodcutter's head.
    for (let k = 0; k < 4; k++) tree.push(part(blobGeo(260 + k), ["#1f5a34", "#2f7340", "#3a8545", "#4a8d4c"][k]!, [treeAt.x, ty + 0.14 + k * 0.04, treeAt.z], [0, k, 0], [0.06 - k * 0.011, 0.028, 0.06 - k * 0.011]));
    g.add(mesh(merge(tree), cm));
    const man = person(cm, "#c4402f", 0.1, "#6a4a32");
    man.g.position.set(cutAt.x, Y(cutAt.x, cutAt.z), cutAt.z);
    man.g.rotation.y = -Math.atan2(treeAt.z - cutAt.z, treeAt.x - cutAt.x);
    const axeH = new THREE.Group();
    axeH.add(mesh(merge([part(cyl(0.0018, 0.0018, 6), "#b08a5a", [0.02, 0.045, 0], [0, 0, -0.9], [1, 0.05, 1]), part(new THREE.BoxGeometry(1, 1, 1), "#aab2b8", [0.038, 0.06, 0], [0, 0, -0.9], [0.012, 0.008, 0.003])]), cm));
    axeH.position.set(0, 0.03, 0);
    man.top.add(axeH);
    g.add(man.g);
    const chips = Array.from({ length: 5 }, (_, i) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, 0.004), basic("#efc890"));
      o.userData.loose = true;
      g.add(o);
      return { o, i };
    });
    stands.push({ x: cutAt.x, z: cutAt.z, r: 0.05 }, { x: treeAt.x, z: treeAt.z, r: 0.06 });
    life.push((t) => {
      const speed = env.roll >= 0 ? 2.2 : 1;
      const ph = (t * 1.3 * speed) % 1;
      // Wind up slowly, strike fast.
      const swing = ph < 0.7 ? -0.9 * ease(ph / 0.7) : -0.9 + 1.5 * ease((ph - 0.7) / 0.3);
      man.top.rotation.z = -0.1 - swing * 0.6;
      axeH.rotation.z = swing;
      for (const c of chips) {
        const u = (ph - 0.95 + 1) % 1;
        const k = u * 4 + c.i * 0.07;
        c.o.visible = k < 1 && !env.robber;
        c.o.position.set(treeAt.x - side.x * 0.015 + (c.i - 2) * 0.006 * k, ty + 0.03 + 0.05 * k - 0.07 * k * k, treeAt.z - side.z * 0.015 - 0.02 * k);
        c.o.rotation.set(k * 9, c.i, k * 7);
      }
    });
  }

  // The tent: an orange canvas A-frame, its door to the fire, a ridge pole showing at each end.
  const tri = new THREE.Shape();
  tri.moveTo(-0.075, 0);
  tri.lineTo(0.075, 0);
  tri.lineTo(0, 0.1);
  tri.closePath();
  const canvas = new THREE.ExtrudeGeometry(tri, { depth: 0.15, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 2 }).translate(0, 0, -0.075);
  const door = new THREE.Shape();
  door.moveTo(-0.032, 0);
  door.lineTo(0.032, 0);
  door.lineTo(0, 0.062);
  door.closePath();
  const tent = new THREE.Group();
  tent.add(mesh(merge([part(canvas, "#e8793a", [0, 0, 0]), part(new THREE.ShapeGeometry(door), "#5a2612", [0, 0.002, 0.0815]), part(cyl(0.003, 0.003, 6), "#7a4a2c", [0, 0.104, 0], [Math.PI / 2, 0, 0], [1, 0.19, 1]), part(cyl(0.0025, 0.0025, 6), "#7a4a2c", [0, 0.05, 0.088], [0, 0, 0], [1, 0.11, 1])]), cm));
  tent.scale.setScalar(SIZE.tent);
  tent.userData.ref = "tent";
  tent.position.set(tentAt.x, Y(tentAt.x, tentAt.z), tentAt.z);
  // Door (+z) toward the fire, turned a little toward the eye so it shows.
  const toFire = Math.atan2(fire.x - tentAt.x, fire.z - tentAt.z);
  const toEye = Math.atan2(Math.sin(20 * DEG), Math.cos(20 * DEG));
  tent.rotation.y = toFire + Math.atan2(Math.sin(toEye - toFire), Math.cos(toEye - toFire)) * 0.5;
  g.add(tent);
  stands.push({ x: tentAt.x, z: tentAt.z, r: 0.08 });

  // The bonfire: a ring of stones, crossed logs, three flame blobs that flicker, a warm light, embers and smoke rising.
  const fy = Y(fire.x, fire.z);
  const stones: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    stones.push(part(blobGeo(i + 5), i % 2 ? "#85857e" : "#9c9a91", [Math.cos(a) * 0.04, 0.008, Math.sin(a) * 0.04], [0, a, 0], [0.013, 0.01, 0.012]));
  }
  for (let i = 0; i < 3; i++) stones.push(part(cyl(1, 1, 8), "#5a3622", [0, 0.012, 0], [Math.PI / 2, (i / 3) * Math.PI, 0.25], [0.007, 0.06, 0.007]));
  const ring = mesh(merge(stones), cm);
  ring.position.set(fire.x, fy, fire.z);
  g.add(ring);
  stands.push({ x: fire.x, z: fire.z, r: 0.06 });
  // Flame tongues: teardrops (a ball drawn up into a point), red-orange outside, orange, a yellow heart, each flickering on
  // its own beat.
  const tongue = () => {
    const t = new THREE.SphereGeometry(1, 14, 12);
    const p = t.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const k = y > 0 ? 1 - y * 0.82 : 1;
      p.setXYZ(i, p.getX(i) * k, y > 0 ? y * 2.4 : y * 0.7, p.getZ(i) * k);
    }
    t.computeVertexNormals();
    return t.translate(0, 0.7, 0);
  };
  const flames = [
    ...[0, 1, 2, 3, 4].map((i) => ({ hex: "#ef5a2a", s: [0.011, 0.016, 0.011] as const, x: Math.cos(i * 1.26) * 0.011, z: Math.sin(i * 1.26) * 0.011 })),
    ...[0, 1, 2].map((i) => ({ hex: "#ff9d2f", s: [0.01, 0.019, 0.01] as const, x: Math.cos(i * 2.1 + 0.5) * 0.006, z: Math.sin(i * 2.1 + 0.5) * 0.006 })),
    { hex: "#ffe36e", s: [0.009, 0.02, 0.009] as const, x: 0, z: 0 },
  ].map((f, i) => {
    const o = new THREE.Mesh(tongue(), basic(f.hex));
    o.position.set(fire.x + f.x, fy + 0.012, fire.z + f.z);
    o.scale.set(f.s[0], f.s[1], f.s[2]);
    o.renderOrder = 2 + Math.floor(i / 4);
    g.add(o);
    return { o, s: f.s, i };
  });
  const warm = new THREE.PointLight(0xffa04a, 0.06, 0.3, 1);
  warm.position.set(fire.x, fy + 0.08, fire.z);
  g.add(warm);
  const fireGlow = halo("#ff9a3a", 0.42);
  fireGlow.position.set(fire.x, fy + 0.05, fire.z);
  g.add(fireGlow);
  const embers = Array.from({ length: 14 }, (_, i) => {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 6, 4), basic(i % 3 ? "#ffb347" : "#ffe08a"));
    o.userData.loose = true;
    g.add(o);
    return { o, ph: i / 14, sx: (r() - 0.5) * 0.03, sz: (r() - 0.5) * 0.03, sp: 0.8 + r() * 0.5 };
  });
  const smokes = Array.from({ length: 5 }, (_, i) => {
    const o = new THREE.Mesh(blobGeo(40 + i), new THREE.MeshStandardMaterial({ color: "#d9d4cc", roughness: 1, transparent: true, opacity: 0.5, depthWrite: false }));
    o.userData.loose = true;
    g.add(o);
    return { o, ph: i / 5 };
  });
  life.push((t) => {
    // The robber puts the fire out; at night it burns brighter and lights the clearing.
    for (const f of flames) f.o.visible = !env.robber;
    for (const e of embers) e.o.visible = !env.robber;
    warm.visible = !env.robber;
    for (const f of flames) {
      const k = (1 + env.night * 0.3) + 0.22 * Math.sin(t * (9 + f.i * 2.3) + f.i * 1.7) + 0.1 * Math.sin(t * 21 + f.i * 2);
      f.o.scale.set(f.s[0] * (1.05 - 0.05 * k), f.s[1] * k, f.s[2] * (1.05 - 0.05 * k));
      f.o.rotation.z = 0.08 * Math.sin(t * 7 + f.i);
    }
    warm.intensity = (0.06 + 0.015 * Math.sin(t * 13) + 0.008 * Math.sin(t * 29)) * (1 + env.night * 9);
    warm.distance = 0.3 + env.night * 0.5;
    fireGlow.visible = !env.robber;
    fireGlow.material.opacity = env.night * (0.7 + 0.1 * Math.sin(t * 11));
    for (const e of embers) {
      const u = (t * 0.45 * e.sp + e.ph) % 1;
      e.o.position.set(fire.x + e.sx * u + 0.006 * Math.sin(t * 5 + e.ph * 20), fy + 0.04 + u * 0.2, fire.z + e.sz * u);
      e.o.scale.setScalar(1 - u);
    }
    for (const s of smokes) {
      const u = (t * 0.12 + s.ph) % 1;
      s.o.position.set(fire.x + u * 0.05, fy + 0.08 + u * 0.24, fire.z - u * 0.08);
      s.o.scale.setScalar(0.01 + u * 0.026);
      (s.o.material as THREE.MeshStandardMaterial).opacity = 0.32 * Math.sin(Math.PI * u);
    }
  });

  // The water: the stream's ribbon down its channel (foam where it falls), the pool's disc.
  const wm = waterMat(true);
  const pm = waterMat(false);
  {
    const pts: Pt[] = [];
    for (let i = 0; i + 1 < L.stream.length; i++) {
      const [a, b] = [L.stream[i]!, L.stream[i + 1]!];
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.012);
      for (let k = 0; k < n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
    }
    // Stop where the pool's water begins.
    const end = pts.findIndex((p) => Math.hypot(p.x - pool.x, p.z - pool.z) < pool.r * 0.7);
    const run = pts.slice(0, end > 0 ? end + 1 : pts.length);
    // Smooth the course a little so the ribbon bends rather than kinks.
    for (let pass = 0; pass < 3; pass++)
      for (let i = 1; i + 1 < run.length; i++) run[i] = { x: (run[i - 1]!.x + run[i]!.x * 2 + run[i + 1]!.x) / 4, z: (run[i - 1]!.z + run[i]!.z * 2 + run[i + 1]!.z) / 4 };
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let along = 0;
    let prevY = 0;
    const foam: THREE.BufferGeometry[] = [];
    run.forEach((p, i) => {
      const q = run[Math.min(run.length - 1, i + 1)]!;
      const o = run[Math.max(0, i - 1)]!;
      const [tx, tz] = [q.x - o.x, q.z - o.z];
      const tl = Math.hypot(tx, tz) || 1;
      const [nx, nz] = [-tz / tl, tx / tl];
      const w = 0.022 + 0.004 * Math.sin(i * 0.7);
      const y = Math.max(Y(p.x, p.z) + STREAM_D * 0.55, BLOCK_H + POOL_LEVEL);
      if (i) along += Math.hypot(p.x - run[i - 1]!.x, p.z - run[i - 1]!.z);
      pos.push(p.x + nx * w, y, p.z + nz * w, p.x - nx * w, y, p.z - nz * w);
      uv.push(0, along, 1, along);
      if (i) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
      // Foam where the stream drops steeply: the little falls.
      if (i && prevY - y > 0.006)
        for (let k = 0; k < 3; k++) foam.push(part(blobGeo(k + i), "#f4fbf8", [p.x + (r() - 0.5) * 0.025, y + 0.002, p.z + (r() - 0.5) * 0.025], [0, r() * 6, 0], [0.008 + r() * 0.004, 0.003, 0.008 + r() * 0.004]));
      prevY = y;
    });
    // Foam where the stream enters the pool.
    const mouth = run[run.length - 1]!;
    for (let k = 0; k < 4; k++) foam.push(part(blobGeo(k + 50), "#f4fbf8", [mouth.x + (r() - 0.5) * 0.04, BLOCK_H + POOL_LEVEL + 0.003, mouth.z + (r() - 0.5) * 0.04], [0, r() * 6, 0], [0.012, 0.004, 0.012]));
    const ribbon = new THREE.BufferGeometry();
    ribbon.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    ribbon.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    ribbon.setIndex(idx);
    ribbon.computeVertexNormals();
    const rib = new THREE.Mesh(ribbon, wm);
    rib.receiveShadow = true;
    rib.renderOrder = 1;
    g.add(rib);
    if (foam.length) g.add(mesh(merge(foam), cm));
  }
  const poolR = pool.r * 0.8;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(poolR, 48).rotateX(-Math.PI / 2), pm);
  disc.position.set(pool.x, BLOCK_H + POOL_LEVEL, pool.z);
  disc.receiveShadow = true;
  disc.renderOrder = 1;
  g.add(disc);
  life.push((t) => {
    wm.userData.time.value = t;
    pm.userData.time.value = t;
  });

  // Mossy boulders at the spring and by the pool.
  const rocks: THREE.BufferGeometry[] = [];
  const spring = L.stream[0]!;
  for (const [p, k] of [[at(Math.atan2(spring.z, spring.x) + 0.12, Math.hypot(spring.x, spring.z) + 0.02), 0.04], [at(Math.atan2(spring.z, spring.x) - 0.1, Math.hypot(spring.x, spring.z) - 0.03), 0.032], [{ x: pool.x + (pool.x > 0 ? -1 : 1) * pool.r * 0.7, z: pool.z - pool.r * 0.75 }, 0.03]] as [Pt, number][]) {
    rocks.push(part(blobGeo(Math.round(k * 1000)), "#9aa095", [p.x, Y(p.x, p.z) + k * 0.35, p.z], [0, k * 50, 0], [k, k * 0.75, k * 0.9]));
    rocks.push(part(blobGeo(Math.round(k * 900)), "#6e9a4a", [p.x, Y(p.x, p.z) + k * 0.62, p.z], [0, k * 30, 0], [k * 0.75, k * 0.3, k * 0.7]));
    stands.push({ x: p.x, z: p.z, r: k });
  }
  g.add(mesh(merge(rocks), cm));

  // Ferns along the stream.
  const ferns: THREE.BufferGeometry[] = [];
  for (let k = 0, tries = 0; k < 7 && tries < 400; tries++) {
    const i = Math.floor(r() * (L.stream.length - 1));
    const [a, b] = [L.stream[i]!, L.stream[i + 1]!];
    const u = r();
    const side = r() < 0.5 ? -1 : 1;
    const [dx, dz] = [b.x - a.x, b.z - a.z];
    const l = Math.hypot(dx, dz);
    const x = a.x + dx * u + (-dz / l) * side * 0.06;
    const z = a.z + dz * u + (dx / l) * side * 0.06;
    if (Math.hypot(x, z) < 0.4 || nearestCorner(x, z) < 0.18 || hexDist(x, z) > INR - 0.17) continue;
    const y = Y(x, z);
    for (let f = 0; f < 7; f++) {
      const fa = (f / 7) * Math.PI * 2 + r();
      ferns.push(part(sphere(8), f % 2 ? "#4f9e3f" : "#6bb34a", [x + Math.cos(fa) * 0.016, y + 0.008, z + Math.sin(fa) * 0.016], [0, -fa, 0.5], [0.022, 0.003, 0.007]));
    }
    k++;
  }
  if (ferns.length) g.add(mesh(merge(ferns), cm));

  // The fairy ring: seven red-capped toadstools with white spots.
  {
    const ring = L.ring!;
    const t: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const [x, z] = [ring.x + Math.cos(a) * 0.045, ring.z + Math.sin(a) * 0.045];
      const y = Y(x, z);
      const k = 0.8 + (i % 3) * 0.15;
      t.push(part(cyl(0.004, 0.005, 8), "#f3ead8", [x, y + 0.008 * k, z], [0, 0, 0], [k, 0.016 * k, k]));
      t.push(part(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), "#d8392b", [x, y + 0.015 * k, z], [0, 0, 0], [0.012 * k, 0.009 * k, 0.012 * k]));
      for (let d = 0; d < 3; d++) t.push(part(sphere(6), "#fff6ea", [x + Math.cos(d * 2.1) * 0.006 * k, y + 0.022 * k, z + Math.sin(d * 2.1) * 0.006 * k], [0, 0, 0], [0.0022, 0.0012, 0.0022]));
    }
    g.add(mesh(merge(t), cm));
  }

  // The doe and her fawn on the bank: the doe dips her head to drink, lifts it, looks round, flicks her ears.
  if (L.deer) {
    const doe = deer(false, cm);
    const fawn = deer(true, cm);
    const face = L.deer.face;
    doe.g.position.set(L.deer.x, Y(L.deer.x, L.deer.z), L.deer.z);
    doe.g.rotation.y = -face;
    const fp = { x: L.deer.x - Math.cos(face) * 0.05 + Math.cos(face + 1.57) * 0.1, z: L.deer.z - Math.sin(face) * 0.05 + Math.sin(face + 1.57) * 0.1 };
    fawn.g.position.set(fp.x, Y(fp.x, fp.z), fp.z);
    fawn.g.rotation.y = -face + 0.5;
    g.add(doe.g, fawn.g);
    stands.push({ x: L.deer.x, z: L.deer.z, r: 0.06 }, { x: fp.x, z: fp.z, r: 0.04 });
    life.push((t) => {
      const cyc = (t % 6) / 6;
      const down = env.roll >= 0 ? 0 : smooth(0.05, 0.2, cyc) * (1 - smooth(0.55, 0.7, cyc));
      doe.neck.rotation.z = -1.6 * down + 0.15 * (1 - down) * Math.sin(t * 0.8);
      doe.neck.rotation.y = (1 - down) * 0.35 * Math.sin(t * 0.9);
      fawn.neck.rotation.z = 0.12 * Math.sin(t * 1.3 + 1);
      fawn.neck.rotation.y = 0.4 * Math.sin(t * 0.6 + 2);
      const flick = env.roll >= 0 ? 1 : Math.max(0, Math.sin(t * 3.1)) ** 16;
      doe.ears.forEach((e, i) => (e.rotation.x = (i ? -1 : 1) * (0.6 + 0.5 * flick)));
      fawn.ears.forEach((e, i) => (e.rotation.x = (i ? -1 : 1) * (0.6 + 0.5 * Math.max(0, Math.sin(t * 2.3 + 1)) ** 16)));
    });
  }

  // Salmon: two take turns leaping out of the pool in an arc and splashing back, a ring rippling out where each lands; fish
  // shadows drift under the surface.
  const sg = salmonGeo().scale(1.3, 1.3, 1.3);
  const wy = BLOCK_H + POOL_LEVEL;
  const ringMat = () => new THREE.MeshBasicMaterial({ color: "#f4fbf8", transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const leaps = [0, 1].map((i) => {
    const fish = mesh(sg, cm);
    const ringA = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2), ringMat());
    const ringB = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2), ringMat());
    g.add(fish, ringA, ringB);
    const a = r() * Math.PI * 2 + i * 2;
    return { fish, ringA, ringB, a, ph: i * 1.6 };
  });
  const shadows = [0, 1, 2].map((i) => {
    const o = new THREE.Mesh(sphere(8), new THREE.MeshBasicMaterial({ color: "#1f5f5c", transparent: true, opacity: 0.35, depthWrite: false }));
    o.scale.set(0.022, 0.002, 0.008);
    g.add(o);
    return { o, ph: i * 2.1, rr: pool.r * (0.25 + i * 0.12) };
  });
  const PERIOD = 3.2;
  const AIR = 0.7;
  life.push((t) => {
    for (const [i, L2] of leaps.entries()) {
      // On a roll both leap high together, the second a beat behind.
      const rolling = env.roll >= 0;
      const u = rolling ? Math.min(1.5, Math.max(0, (env.roll - i * 0.12) / 0.55)) : ((t + L2.ph) % PERIOD) / AIR;
      const a = L2.a + Math.floor((t + L2.ph) / PERIOD) * 2.3;
      const [ax, az] = [pool.x + Math.cos(a) * pool.r * 0.35, pool.z + Math.sin(a) * pool.r * 0.35];
      const [bx, bz] = [pool.x - Math.cos(a) * pool.r * 0.1, pool.z - Math.sin(a) * pool.r * 0.1];
      if (u < 1) {
        const h = (rolling ? 0.2 : 0.1) * 4 * u * (1 - u);
        L2.fish.visible = true;
        L2.fish.position.set(ax + (bx - ax) * u, wy - 0.008 + h, az + (bz - az) * u);
        L2.fish.rotation.set(0, Math.atan2(-(bz - az), bx - ax), Math.atan2(0.4 * (1 - 2 * u), 0.15) * 0.9 + 0.2 * Math.sin(t * 25));
      } else L2.fish.visible = false;
      const ripple = (o: THREE.Mesh, x: number, z: number, since: number) => {
        const k = since / 0.9;
        const m = o.material as THREE.MeshBasicMaterial;
        if (k < 0 || k > 1) return void (m.opacity = 0);
        o.position.set(x, wy + 0.001, z);
        o.scale.setScalar(0.01 + k * 0.05);
        m.opacity = 0.8 * (1 - k);
      };
      const tl = rolling ? env.roll * ROLL_S - i * 0.12 * ROLL_S : (t + L2.ph) % PERIOD;
      ripple(L2.ringA, ax, az, tl);
      ripple(L2.ringB, bx, bz, tl - AIR);
    }
    for (const s of shadows) {
      const a = t * 0.5 + s.ph;
      s.o.position.set(pool.x + Math.cos(a) * s.rr, wy - 0.012, pool.z + Math.sin(a) * s.rr);
      s.o.rotation.y = -a - Math.PI / 2;
    }
  });

  // The owl: two yellow eyes in the dark of the pine nearest the eye's side of the crest, blinking now and then.
  const towardEye = { x: Math.sin(20 * DEG), z: Math.cos(20 * DEG) };
  const perch = pines.sort((p, q) => q.y + q.z * 0.2 - (p.y + p.z * 0.2))[0];
  if (perch) {
    const eyes = new THREE.Group();
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 10, 8), basic("#ffd23a"));
      e.position.set(-towardEye.z * side * 0.008, 0, towardEye.x * side * 0.008);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0026, 8, 6), basic("#1a120c"));
      pupil.position.set(towardEye.x * 0.004, 0, towardEye.z * 0.004);
      e.add(pupil);
      eyes.add(e);
    }
    const dark = new THREE.Mesh(sphere(10), basic("#173a24"));
    dark.scale.set(0.016, 0.011, 0.016);
    eyes.add(dark);
    dark.position.set(-towardEye.x * 0.004, 0, -towardEye.z * 0.004);
    eyes.position.set(perch.x + towardEye.x * perch.s * 1.0, perch.y + perch.s * 0.75, perch.z + towardEye.z * perch.s * 1.0);
    g.add(eyes);
    life.push((t) => {
      const b = (t % 3.7) < 0.14 ? 0.1 : 1;
      eyes.children.forEach((c, i) => i < 2 && c.scale.set(1, b, 1));
    });
  }

  // Night: the tent glows from inside (a lit panel in its door), fireflies drift over the pool.
  {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.05).translate(0, 0.025, 0), basic("#ffc46a", 0));
    glow.position.set(0, 0.001, 0.08);
    tent.add(glow);
    const tentHalo = halo("#ffb860", 0.16);
    tentHalo.position.set(0, 0.03, 0.09);
    tent.add(tentHalo);
    const flies = Array.from({ length: 12 }, (_, i) => {
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 6, 4), basic("#fff07a", 0));
      o.userData.loose = true;
      g.add(o);
      return { o, ph: i * 0.83, rr: pool.r * (0.4 + (i % 4) * 0.25) };
    });
    life.push((t) => {
      (glow.material as THREE.MeshBasicMaterial).opacity = env.night * 0.95;
      tentHalo.material.opacity = env.night * 0.6;
      for (const f of flies) {
        const a = t * 0.3 + f.ph;
        f.o.position.set(pool.x + Math.cos(a) * f.rr, wy + 0.03 + 0.02 * Math.sin(t * 1.3 + f.ph * 3), pool.z + Math.sin(a * 1.3) * f.rr);
        (f.o.material as THREE.MeshBasicMaterial).opacity = env.night * (0.5 + 0.5 * Math.sin(t * 4 + f.ph * 5));
      }
    });
  }
  return { g, stands, life };
}

// --- pasture folk

// A sheep along +x, hooves at y 0: a body of cream wool blobs, black legs, and a black head with ears on its own pivot so it can
// graze. `lying` folds the legs under; `shorn` leaves the near side (+z) bare pink; `lamb` is small and whiter.
function sheep(m: THREE.Material, o: { lying?: boolean; shorn?: boolean; lamb?: boolean } = {}) {
  const WOOL = o.lamb ? "#fbf8f1" : "#f3ecdf";
  const g = new THREE.Group();
  const lift = o.lying ? 0.012 : 0.034;
  const body: THREE.BufferGeometry[] = [];
  const puffs: [number, number, number, number][] = [
    [0, 0.02, 0, 0.026], [0.018, 0.022, 0.008, 0.02], [-0.018, 0.022, -0.008, 0.021], [0.016, 0.018, -0.012, 0.019],
    [-0.016, 0.018, 0.012, 0.02], [0, 0.034, 0, 0.02], [-0.026, 0.02, 0, 0.017], [0.024, 0.026, 0, 0.017],
  ];
  puffs.forEach(([x, y, z, rr], i) => {
    if (o.shorn && z > 0.004) return;
    body.push(part(blobGeo(i + 3), WOOL, [x, y + lift, z], [0, i, 0], [rr, rr * 0.9, rr]));
  });
  if (o.shorn) body.push(part(sphere(), "#efc3b4", [0, 0.022 + lift, 0.004], [0, 0, 0], [0.032, 0.02, 0.018]));
  if (!o.lying)
    for (const [x, z] of [[0.017, 0.009], [0.017, -0.009], [-0.017, 0.009], [-0.017, -0.009]]) body.push(part(cyl(0.004, 0.0035, 6), "#2a2422", [x!, 0.017, z!], [0, 0, 0], [1, 0.034, 1]));
  g.add(mesh(merge(body), m));
  const head = new THREE.Group();
  head.position.set(0.03, 0.036 + lift - 0.034 + 0.034, 0);
  head.add(
    mesh(
      merge([
        part(sphere(), "#2b2523", [0.012, -0.002, 0], [0, 0, -0.5], [0.013, 0.01, 0.009]),
        part(blobGeo(9), WOOL, [0.002, 0.006, 0], [0, 0, 0], [0.009, 0.007, 0.009]),
        part(sphere(8), "#2b2523", [0.004, 0.002, 0.011], [0.9, 0, 0], [0.008, 0.003, 0.004]),
        part(sphere(8), "#2b2523", [0.004, 0.002, -0.011], [-0.9, 0, 0], [0.008, 0.003, 0.004]),
        part(sphere(6), "#f6f0e2", [0.016, 0.002, 0.006], [0, 0, 0], [0.002, 0.002, 0.002]),
        part(sphere(6), "#f6f0e2", [0.016, 0.002, -0.006], [0, 0, 0], [0.002, 0.002, 0.002]),
      ]),
      m,
    ),
  );
  g.add(head);
  g.scale.setScalar(SIZE.sheep * (o.lamb ? 0.62 : 1));
  g.userData.ref = o.lamb ? "lamb" : "sheep";
  return { g, head };
}

// A person 0.11 tall facing +x: boots, trousers, a smock, arms, a head and a straw hat; `bend` tips the body forward from the hips.
function person(m: THREE.Material, smock: string, bend = 0, hat = "#e8c56a") {
  const g = new THREE.Group();
  g.add(
    mesh(
      merge([
        part(cyl(0.006, 0.006, 8), "#3d3530", [0, 0.004, 0.007], [0, 0, 0], [1, 0.008, 1.1]),
        part(cyl(0.006, 0.006, 8), "#3d3530", [0, 0.004, -0.007], [0, 0, 0], [1, 0.008, 1.1]),
        part(cyl(0.0055, 0.0055, 8), "#5a4a3c", [0, 0.026, 0.007], [0, 0, 0], [1, 0.042, 1]),
        part(cyl(0.0055, 0.0055, 8), "#5a4a3c", [0, 0.026, -0.007], [0, 0, 0], [1, 0.042, 1]),
      ]),
      m,
    ),
  );
  const top = new THREE.Group();
  top.position.y = 0.046;
  top.rotation.z = -bend;
  top.add(
    mesh(
      merge([
        part(cyl(0.011, 0.015, 10), smock, [0, 0.019, 0], [0, 0, 0], [1, 0.04, 1]),
        part(cyl(0.004, 0.004, 6), smock, [0.006, 0.02, 0.016], [0, 0, 0.9], [1, 0.03, 1]),
        part(cyl(0.004, 0.004, 6), smock, [0.006, 0.02, -0.016], [0, 0, 0.9], [1, 0.03, 1]),
        part(sphere(8), "#f0c49c", [0.018, 0.012, 0.016], [0, 0, 0], [0.004, 0.004, 0.004]),
        part(sphere(8), "#f0c49c", [0.018, 0.012, -0.016], [0, 0, 0], [0.004, 0.004, 0.004]),
        part(sphere(), "#f0c49c", [0, 0.05, 0], [0, 0, 0], [0.011, 0.012, 0.011]),
        part(cyl(1, 1, 16), hat, [0, 0.058, 0], [0, 0, 0], [0.019, 0.002, 0.019]),
        part(cyl(0.8, 1, 12), hat, [0, 0.064, 0], [0, 0, 0], [0.01, 0.01, 0.01]),
        part(cyl(1, 1, 12), "#b8463a", [0, 0.061, 0], [0, 0, 0], [0.0102, 0.002, 0.0102]),
      ]),
      m,
    ),
  );
  g.add(top);
  g.scale.setScalar(SIZE.person);
  g.userData.ref = "person";
  return { g, top };
}

// A black-and-white collie facing +x, legs on their own meshes so it can trot.
function dog(m: THREE.Material) {
  const g = new THREE.Group();
  g.add(
    mesh(
      merge([
        part(sphere(), "#222022", [0, 0.034, 0], [0, 0, 0.05], [0.026, 0.012, 0.011]),
        part(sphere(), "#f5f1ea", [0.014, 0.03, 0], [0, 0, 0.3], [0.012, 0.01, 0.009]),
        part(sphere(), "#222022", [0.03, 0.048, 0], [0, 0, 0], [0.01, 0.009, 0.008]),
        part(sphere(), "#f5f1ea", [0.039, 0.045, 0], [0, 0, -0.2], [0.007, 0.004, 0.0045]),
        part(sphere(6), "#1a1414", [0.045, 0.046, 0], [0, 0, 0], [0.002, 0.002, 0.002]),
        part(new THREE.ConeGeometry(1, 1, 6), "#222022", [0.027, 0.058, 0.005], [0.3, 0, 0], [0.0035, 0.008, 0.003]),
        part(new THREE.ConeGeometry(1, 1, 6), "#222022", [0.027, 0.058, -0.005], [-0.3, 0, 0], [0.0035, 0.008, 0.003]),
        part(sphere(8), "#222022", [-0.03, 0.044, 0], [0, 0, 0.9], [0.013, 0.004, 0.004]),
        part(sphere(8), "#f5f1ea", [-0.04, 0.052, 0], [0, 0, 0.9], [0.004, 0.003, 0.003]),
      ]),
      m,
    ),
  );
  const legs = [[0.015, 0.006], [0.015, -0.006], [-0.016, 0.006], [-0.016, -0.006]].map(([x, z], i) => {
    const l = mesh(merge([part(cyl(0.003, 0.0028, 6), i < 2 ? "#f5f1ea" : "#222022", [0, -0.012, 0], [0, 0, 0], [1, 0.024, 1])]), m);
    l.position.set(x!, 0.026, z!);
    g.add(l);
    return l;
  });
  g.scale.setScalar(SIZE.dog);
  g.userData.ref = "dog";
  return { g, legs };
}

// WOOL, "Shearing Day" (docs/design/hex-jelly-prompt.md): the ridge with its dry-stone wall, gate and oak; the flock grazing,
// lying, a lamb hopping, another on a boulder; the collie trotting round them; the shepherd shearing a half-shorn ewe by the
// fleece pile and wool sacks; the shepherd's hut with its stove smoke; the trough; clover and flowers.
function pasture(L: Layout, ground: (x: number, z: number) => number, r: () => number, env: Env): Built {
  const g = new THREE.Group();
  const life: Life[] = [];
  const stands: { x: number; z: number; r: number }[] = [];
  const Y = (x: number, z: number) => BLOCK_H + ground(x, z);
  const cm = critterMat();
  const M = L.marks;
  const ridge = L.ridges[0]!;
  const place = (o: THREE.Object3D, p: Pt, face: number, lift = 0) => {
    o.position.set(p.x, Y(p.x, p.z) + lift, p.z);
    o.rotation.y = -face;
    g.add(o);
  };
  const faceTo = (a: Pt, b: Pt) => Math.atan2(b.z - a.z, b.x - a.x);
  const EYE = { x: Math.sin(20 * DEG), z: Math.cos(20 * DEG) };

  // The dry-stone wall along the crest, two courses of grey blob stones, broken where the gate stands.
  const [dx, dz] = [ridge.b.x - ridge.a.x, ridge.b.z - ridge.a.z];
  const len = Math.hypot(dx, dz);
  const [tx, tz] = [dx / len, dz / len];
  const wall: THREE.BufferGeometry[] = [];
  const STONE = ["#a7a59b", "#b9b6aa", "#958f86", "#c6c1b2"];
  for (let d = 0.04; d < len - 0.04; d += 0.034) {
    const p = { x: ridge.a.x + tx * d, z: ridge.a.z + tz * d };
    if (Math.hypot(p.x - M.gate!.x, p.z - M.gate!.z) < 0.075 || nearestCorner(p.x, p.z) < 0.18 || hexDist(p.x, p.z) > INR - 0.17) continue;
    const y = Y(p.x, p.z);
    for (let c = 0; c < 2; c++) {
      const k = 0.018 + r() * 0.005 - c * 0.003;
      wall.push(part(blobGeo(Math.floor(r() * 50)), STONE[Math.floor(r() * 4)]!, [p.x + (r() - 0.5) * 0.008, y + 0.011 + c * 0.024, p.z + (r() - 0.5) * 0.008], [0, r() * 6, 0], [k * 1.2, k * 0.75, k]));
    }
    // A little moss on the top course now and then.
    if (r() < 0.3) wall.push(part(blobGeo(7), "#7fae4f", [p.x, y + 0.043, p.z], [0, r() * 6, 0], [0.008, 0.003, 0.008]));
    stands.push({ x: p.x, z: p.z, r: 0.02 });
  }
  g.add(mesh(merge(wall), cm));

  // The gate across the gap: two posts, three rails and a brace.
  {
    const gate = new THREE.Group();
    const W = "#a87c4f";
    gate.add(
      mesh(
        merge([
          part(cyl(0.004, 0.004, 6), "#7a5434", [0, 0.022, -0.04], [0, 0, 0], [1, 0.046, 1]),
          part(cyl(0.004, 0.004, 6), "#7a5434", [0, 0.022, 0.04], [0, 0, 0], [1, 0.046, 1]),
          ...[0.012, 0.024, 0.036].map((y) => part(new THREE.BoxGeometry(1, 1, 1), W, [0, y, 0], [0, 0, 0], [0.003, 0.004, 0.078])),
          part(new THREE.BoxGeometry(1, 1, 1), W, [0, 0.024, 0], [0.42, 0, 0], [0.003, 0.004, 0.08]),
        ]),
        cm,
      ),
    );
    gate.scale.setScalar(SIZE.gate);
    gate.userData.ref = "gate";
    place(gate, M.gate!, Math.atan2(tz, tx) + Math.PI / 2);
    gate.rotation.y = -Math.atan2(tz, tx);
  }

  // The oak on the crest: a fat trunk and a big round crown of blobs.
  {
    const o = M.oak!;
    const y = Y(o.x, o.z);
    const leaves: THREE.BufferGeometry[] = [part(cyl(0.7, 1, 10), "#6e4128", [o.x, y + 0.06, o.z], [0, 0, 0], [0.028, 0.12, 0.028])];
    const LEAF = ["#3f8c38", "#58a443", "#7cbd4f"];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const up = i % 3;
      leaves.push(part(blobGeo(i + 20), LEAF[up]!, [o.x + Math.cos(a) * 0.07, y + 0.14 + up * 0.04, o.z + Math.sin(a) * 0.07], [0, a, 0], [0.07, 0.062, 0.07]));
    }
    leaves.push(part(blobGeo(33), LEAF[2]!, [o.x, y + 0.23, o.z], [0, 0, 0], [0.075, 0.062, 0.075]));
    g.add(mesh(merge(leaves), cm));
    stands.push({ x: o.x, z: o.z, r: 0.14 });
  }

  // The shepherd's hut: green-planked walls, a curved red roof, wheels, a step to the door, a stove pipe and its smoke.
  {
    const h = new THREE.Group();
    const roof = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, 0, Math.PI);
    h.add(
      mesh(
        merge([
          part(new THREE.BoxGeometry(1, 1, 1), "#4f7d64", [0, 0.05, 0], [0, 0, 0], [0.11, 0.05, 0.065]),
          part(roof, "#c6423a", [0, 0.075, 0], [Math.PI / 2, 0, Math.PI / 2], [0.038, 0.122, 0.022]),
          part(new THREE.BoxGeometry(1, 1, 1), "#f3e9d6", [0.0555, 0.05, 0], [0, 0, 0], [0.002, 0.034, 0.02]),
          part(new THREE.BoxGeometry(1, 1, 1), "#f3e9d6", [0, 0.055, 0.0335], [0, 0, 0], [0.024, 0.016, 0.002]),
          ...[-0.035, 0.035].flatMap((x) => [-0.034, 0.034].map((z) => part(cyl(1, 1, 12), "#3a2a24", [x, 0.016, z], [Math.PI / 2, 0, 0], [0.016, 0.006, 0.016]))),
          ...[-0.035, 0.035].flatMap((x) => [-0.034, 0.034].map((z) => part(cyl(1, 1, 12), "#c6423a", [x, 0.016, z + Math.sign(z) * 0.0032], [Math.PI / 2, 0, 0], [0.006, 0.001, 0.006]))),
          part(new THREE.BoxGeometry(1, 1, 1), "#8a6440", [0.068, 0.01, 0], [0, 0, 0], [0.018, 0.004, 0.02]),
          part(cyl(0.004, 0.004, 8), "#2f2b2a", [-0.03, 0.11, 0.01], [0, 0, 0], [1, 0.03, 1]),
        ]),
        cm,
      ),
    );
    h.scale.setScalar(SIZE.hut);
    h.userData.ref = "hut";
    // Its door toward the clearing.
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.014), basic("#ffc46a", 0));
    win.position.set(0, 0.055, 0.0347);
    h.add(win);
    const winHalo = halo("#ffb860", 0.09);
    winHalo.position.set(0, 0.055, 0.04);
    h.add(winHalo);
    life.push(() => {
      (win.material as THREE.MeshBasicMaterial).opacity = env.night;
      winHalo.material.opacity = env.night * 0.7;
    });
    place(h, M.hut!, faceTo(M.hut!, { x: 0, z: 0 }));
    stands.push({ x: M.hut!.x, z: M.hut!.z, r: 0.14 });
    const pipe = new THREE.Vector3(-0.03, 0.13, 0.01).multiplyScalar(SIZE.hut).applyEuler(h.rotation).add(h.position);
    const smokes = Array.from({ length: 4 }, (_, i) => {
      const o = new THREE.Mesh(blobGeo(60 + i), new THREE.MeshStandardMaterial({ color: "#e4e0d8", roughness: 1, transparent: true, opacity: 0.4, depthWrite: false }));
      o.userData.loose = true;
      g.add(o);
      return { o, ph: i / 4 };
    });
    life.push((t) => {
      for (const s of smokes) {
        const u = (t * 0.1 + s.ph) % 1;
        s.o.position.set(pipe.x + u * 0.04, pipe.y + u * 0.16, pipe.z - u * 0.03);
        s.o.scale.setScalar(0.007 + u * 0.018);
        (s.o.material as THREE.MeshStandardMaterial).opacity = 0.3 * Math.sin(Math.PI * u);
      }
    });
  }

  // The trough: a plank box of jelly water.
  {
    const tr = new THREE.Group();
    tr.add(
      mesh(
        merge([
          part(new THREE.BoxGeometry(1, 1, 1), "#9a7048", [0, 0.012, 0], [0, 0, 0], [0.07, 0.022, 0.028]),
          ...[-0.03, 0.03].map((x) => part(new THREE.BoxGeometry(1, 1, 1), "#7a5434", [x, 0.008, 0], [0, 0, 0], [0.006, 0.016, 0.034])),
        ]),
        cm,
      ),
    );
    const water = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.022).rotateX(-Math.PI / 2), waterMat(false));
    water.position.y = 0.0235;
    tr.add(water);
    tr.scale.setScalar(SIZE.trough);
    tr.userData.ref = "trough";
    place(tr, M.trough!, faceTo(M.trough!, { x: 0, z: 0 }) + Math.PI / 2);
    stands.push({ x: M.trough!.x, z: M.trough!.z, r: 0.08 });
    life.push((t) => ((water.material as THREE.MeshStandardMaterial).userData.time.value = t));
  }

  // Boulders; a lamb stands on the biggest.
  const boulders: (Pt & { k: number })[] = [];
  for (let tries = 0; tries < 300 && boulders.length < 3; tries++) {
    const a = r() * Math.PI * 2;
    const d = 0.45 + r() * 0.35;
    const p = { x: Math.cos(a) * d, z: Math.sin(a) * d, k: boulders.length ? 0.03 + r() * 0.012 : 0.048 };
    if (nearestCorner(p.x, p.z) < 0.22 || hexDist(p.x, p.z) > INR - 0.18 || stands.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + 0.07)) continue;
    boulders.push(p);
    stands.push({ x: p.x, z: p.z, r: p.k });
  }
  g.add(mesh(merge(boulders.map((b, i) => part(blobGeo(70 + i), "#a9a79d", [b.x, Y(b.x, b.z) + b.k * 0.45, b.z], [0, i * 2, 0], [b.k * 1.1, b.k * 0.8, b.k]))), cm));

  // The flock: three grazing, one lying, a lamb that hops; the second lamb on the boulder.
  const flock: { s: ReturnType<typeof sheep>; ph: number; graze: boolean; hop?: boolean; base: number; home?: THREE.Vector3 }[] = [];
  const spots: Pt[] = [];
  for (let tries = 0; tries < 600 && spots.length < 7; tries++) {
    const p = { x: M.flock!.x + (r() - 0.5) * 0.42, z: M.flock!.z + (r() - 0.5) * 0.42 };
    if (Math.hypot(p.x, p.z) < 0.42 || nearestCorner(p.x, p.z) < 0.2 || hexDist(p.x, p.z) > INR - 0.18 || spots.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.12) || stands.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + 0.07)) continue;
    spots.push(p);
  }
  spots.forEach((p, i) => {
    const kind = i === 3 ? { lying: true } : i === 4 || i === 6 ? { lamb: true } : {};
    const sh = sheep(cm, kind);
    // Mostly side-on to the eye, so their silhouettes read.
    const face = Math.atan2(EYE.x, -EYE.z) + (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.9;
    place(sh.g, p, face);
    stands.push({ x: p.x, z: p.z, r: 0.06 });
    flock.push({ s: sh, ph: r() * 6, graze: i < 3 || i === 5, hop: i === 4, base: sh.g.position.y });
  });
  if (boulders[0]) {
    const lamb = sheep(cm, { lamb: true });
    place(lamb.g, boulders[0], faceTo(boulders[0], { x: 0, z: 0 }) + 0.8, boulders[0].k * 1.2);
    flock.push({ s: lamb, ph: 1, graze: false, base: lamb.g.position.y });
  }
  life.push((t) => {
    for (const f of flock) {
      f.home ??= f.s.g.position.clone();
      const c = ((t + f.ph) % 5) / 5;
      if (f.graze && env.roll < 0) f.s.head.rotation.z = -0.9 * smooth(0.1, 0.25, c) * (1 - smooth(0.7, 0.85, c));
      else f.s.head.rotation.y = 0.4 * Math.sin(t * 0.7 + f.ph);
      // The robber: the flock huddles toward its middle, heads up.
      const huddle = env.robber ? 0.45 : 0;
      f.s.g.position.x = f.home.x + (M.flock!.x - f.home.x) * huddle;
      f.s.g.position.z = f.home.z + (M.flock!.z - f.home.z) * huddle;
      if (env.robber) f.s.head.rotation.z = 0.2;
      let y = f.base;
      if (f.hop) {
        const u = (t + f.ph) % 2.4;
        y += u < 0.35 ? 0.03 * Math.sin((u / 0.35) * Math.PI) : 0;
      }
      // On a roll the whole flock hops, two bounces, staggered.
      if (env.roll >= 0) {
        const u = Math.min(1, Math.max(0, env.roll * 1.3 - f.ph * 0.04));
        y = f.base + 0.04 * Math.abs(Math.sin(u * Math.PI * 2));
      }
      f.s.g.position.y = y;
    }
  });

  // The shearing: the shepherd bent over a half-shorn ewe, the fleece pile, two wool sacks.
  {
    const sp = M.shear!;
    const ewe = sheep(cm, { shorn: true });
    // The bare side toward the eye.
    const side = Math.atan2(EYE.x, -EYE.z);
    place(ewe.g, sp, side);
    const fwd = { x: Math.cos(side), z: Math.sin(side) };
    const across = { x: -fwd.z, z: fwd.x };
    const shepherd = person(cm, "#3e6fb0", 0.55);
    const pp = { x: sp.x - across.x * 0.07, z: sp.z - across.z * 0.07 };
    place(shepherd.g, pp, faceTo(pp, sp));
    const fleece: THREE.BufferGeometry[] = [];
    const fp = { x: sp.x - fwd.x * 0.11 + across.x * 0.03, z: sp.z - fwd.z * 0.11 + across.z * 0.03 };
    for (let i = 0; i < 9; i++) fleece.push(part(blobGeo(80 + i), "#f3ecdf", [fp.x + (r() - 0.5) * 0.05, Y(fp.x, fp.z) + 0.012 + (i > 5 ? 0.018 : 0), fp.z + (r() - 0.5) * 0.05], [0, i, 0], [0.022, 0.016, 0.022]));
    for (const k of [-1, 1]) {
      const q = { x: sp.x + fwd.x * 0.05 * k - across.x * 0.14, z: sp.z + fwd.z * 0.05 * k - across.z * 0.14 };
      fleece.push(part(blobGeo(90 + k), "#d9c79e", [q.x, Y(q.x, q.z) + 0.035, q.z], [0, k, 0], [0.027, 0.038, 0.027]));
      fleece.push(part(cyl(1, 1, 8), "#9a7a4e", [q.x, Y(q.x, q.z) + 0.073, q.z], [0, 0, 0], [0.009, 0.009, 0.009]));
    }
    g.add(mesh(merge(fleece), cm));
    stands.push({ x: sp.x, z: sp.z, r: 0.2 });
    life.push((t) => {
      shepherd.top.rotation.z = -0.55 - 0.08 * Math.sin(t * 3);
      ewe.head.rotation.y = 0.3 * Math.sin(t * 0.9);
    });
  }

  // The collie trots a slow loop round the flock.
  {
    const d = dog(cm);
    g.add(d.g);
    const c = M.flock!;
    let lap = 0;
    life.push((t) => {
      // On a roll the collie dashes a fast lap.
      if (env.roll >= 0) lap = ease(env.roll) * Math.PI * 2;
      const a = t * 0.35 + lap;
      let [x, z] = [c.x + Math.cos(a) * 0.27, c.z + Math.sin(a) * 0.2];
      // Never over the pad or past the rim.
      const k = Math.min(1, (INR - 0.2) / Math.max(1e-6, hexDist(x, z)));
      [x, z] = [x * k, z * k];
      const rr = Math.hypot(x, z);
      if (rr < 0.4) [x, z] = [(x / rr) * 0.4, (z / rr) * 0.4];
      d.g.position.set(x, Y(x, z) + Math.abs(Math.sin(t * 9)) * 0.004, z);
      d.g.rotation.y = -(a + Math.PI / 2 - 0.3);
      d.legs.forEach((l, i) => (l.rotation.z = 0.6 * Math.sin(t * 9 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0))));
    });
  }

  // The pen by the shearing: hurdle panels round a square, two ewes waiting their turn.
  {
    const sp = M.shear!;
    const side = Math.atan2(EYE.x, -EYE.z);
    const fwd = { x: Math.cos(side), z: Math.sin(side) };
    for (const [k, off] of [[1, 0], [-1, 0], [1, 0.12], [-1, 0.12], [1, -0.12], [-1, -0.12]] as [number, number][]) {
      const c = { x: sp.x + fwd.x * 0.22 * k - fwd.z * off, z: sp.z + fwd.z * 0.22 * k + fwd.x * off };
      if (Math.hypot(c.x, c.z) < 0.47 || nearestCorner(c.x, c.z) < 0.24 || hexDist(c.x, c.z) > INR - 0.22 || stands.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < q.r + 0.06)) continue;
      const pen: THREE.BufferGeometry[] = [];
      const H = 0.085;
      for (let e = 0; e < 4; e++) {
        const a = side + (e * Math.PI) / 2;
        const [ex, ez] = [Math.cos(a), Math.sin(a)];
        const [ax, az] = [-ez, ex];
        // The front panel (toward the shearer) stays open.
        if (e === (k > 0 ? 2 : 0)) continue;
        for (const u of [-1, 0, 1]) {
          const px = c.x + ex * H + ax * H * u;
          const pz = c.z + ez * H + az * H * u;
          pen.push(part(cyl(0.004, 0.004, 6), "#7a5434", [px, Y(px, pz) + 0.022, pz], [0, 0, 0], [1, 0.044, 1]));
        }
        for (const y of [0.016, 0.032]) {
          const px = c.x + ex * H;
          const pz = c.z + ez * H;
          pen.push(part(new THREE.BoxGeometry(1, 1, 1), "#b08a5a", [px, Y(px, pz) + y, pz], [0, -Math.atan2(az, ax), 0], [H * 2, 0.005, 0.004]));
        }
      }
      g.add(mesh(merge(pen), cm));
      for (let i = 0; i < 2; i++) {
        const w = sheep(cm);
        place(w.g, { x: c.x + (i ? 0.03 : -0.03) * fwd.z, z: c.z - (i ? 0.03 : -0.03) * fwd.x }, side + (i ? 0.4 : Math.PI - 0.3));
        flock.push({ s: w, ph: i * 2, graze: true, base: w.g.position.y });
      }
      stands.push({ x: c.x, z: c.z, r: 0.12 });
      break;
    }
  }

  // A hedgerow along one front flank and two round trees, so the field has edges and shade.
  {
    const hedge: THREE.BufferGeometry[] = [];
    const s0 = L.hillAt + Math.PI + (r() < 0.5 ? 1 : -1) * 1.05;
    for (let k = -4; k <= 4; k++) {
      const p = at(s0 + k * 0.075, 0.72);
      if (nearestCorner(p.x, p.z) < 0.24 || hexDist(p.x, p.z) > INR - 0.17 || stands.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + 0.03)) continue;
      const y = Y(p.x, p.z);
      for (let i = 0; i < 2; i++) hedge.push(part(blobGeo(100 + k * 2 + i), i ? "#5aa443" : "#3f8a3a", [p.x + (r() - 0.5) * 0.02, y + 0.024 + i * 0.02, p.z + (r() - 0.5) * 0.02], [0, r() * 6, 0], [0.034, 0.03, 0.034]));
      if (r() < 0.35) hedge.push(part(sphere(6), "#f7f2ff", [p.x, y + 0.058, p.z + 0.01], [0, 0, 0], [0.005, 0.005, 0.005]));
      stands.push({ x: p.x, z: p.z, r: 0.04 });
    }
    for (let t = 0, tries = 0; t < 2 && tries < 300; tries++) {
      const a = r() * Math.PI * 2;
      const d = 0.5 + r() * 0.25;
      const p = { x: Math.cos(a) * d, z: Math.sin(a) * d };
      if (nearestCorner(p.x, p.z) < 0.24 || hexDist(p.x, p.z) > INR - 0.18 || stands.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + 0.09)) continue;
      // Not between the eye and the flock or the shearing.
      if ([M.flock!, M.shear!].some((q) => {
        const [dx, dz] = [p.x - q.x, p.z - q.z];
        const along = dx * EYE.x + dz * EYE.z;
        return along > 0 && along < 0.35 && Math.abs(dx * EYE.z - dz * EYE.x) < 0.18;
      })) continue;
      const y = Y(p.x, p.z);
      hedge.push(part(cyl(0.7, 1, 8), "#6e4128", [p.x, y + 0.035, p.z], [0, 0, 0], [0.016, 0.07, 0.016]));
      for (let i = 0; i < 5; i++) {
        const b = (i / 5) * Math.PI * 2;
        hedge.push(part(blobGeo(120 + i + t * 5), ["#3f8c38", "#58a443", "#7cbd4f"][i % 3]!, [p.x + Math.cos(b) * 0.03, y + 0.09 + (i % 2) * 0.02, p.z + Math.sin(b) * 0.03], [0, b, 0], [0.042, 0.038, 0.042]));
      }
      hedge.push(part(blobGeo(140 + t), "#7cbd4f", [p.x, y + 0.13, p.z], [0, 0, 0], [0.045, 0.038, 0.045]));
      stands.push({ x: p.x, z: p.z, r: 0.08 });
      t++;
    }
    if (hedge.length) g.add(mesh(merge(hedge), cm));
  }

  // Clover patches and flower specks over the grass, kept off the pad, the corners and the things standing there.
  {
    const dots: Inst[] = [];
    const COL = [new THREE.Color("#ffffff"), new THREE.Color("#ffe14d"), new THREE.Color("#f6f1ff"), new THREE.Color("#ffd23a")];
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.36 + Math.sqrt(r()) * 0.55;
      const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
      if (hexDist(x, z) > INR - 0.08 || stands.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 0.01)) continue;
      const clover = i % 4 === 0;
      const k = clover ? 0.012 : 0.0035;
      dots.push({ m: mat(x, Y(x, z) + (clover ? 0.001 : 0.004), z, k, clover ? 0.002 : k, k), c: clover ? new THREE.Color("#5ea640") : COL[i % 4]! });
    }
    g.add(instanced(sphere(8), dots, blobMat()));
    // Grass tufts: little three-blade cones, darker and lighter, so the turf has a nap.
    const tufts: Inst[] = [];
    const TUFT = [new THREE.Color("#5a9e3c"), new THREE.Color("#79b84a"), new THREE.Color("#4a8a34")];
    for (let i = 0; i < 420; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.35 + Math.sqrt(r()) * 0.57;
      const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
      if (hexDist(x, z) > INR - 0.07 || stands.some((q) => Math.hypot(q.x - x, q.z - z) < q.r)) continue;
      const k = 0.006 + r() * 0.005;
      tufts.push({ m: mat(x, Y(x, z) + k * 0.8, z, k * 0.7, k * 1.8, k * 0.7, r() * 6, (r() - 0.5) * 0.4, (r() - 0.5) * 0.4), c: TUFT[i % 3]! });
    }
    g.add(instanced(new THREE.ConeGeometry(1, 1, 3), tufts, blobMat()));
  }
  return { g, stands, life };
}

// --- the farm

// A wheat tuft: four stalks leaning out a little, each with a plump ear; the material sways it in a travelling wind wave.
function tuftGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const lean = 0.12 + (i % 2) * 0.1;
    const [x, z] = [Math.cos(a) * 0.004, Math.sin(a) * 0.004];
    const h = 0.052 + (i % 3) * 0.006;
    parts.push(part(cyl(0.0012, 0.0016, 3), "#c99a3a", [x, h / 2, z], [Math.sin(a) * lean, 0, -Math.cos(a) * lean], [1, h, 1]));
    parts.push(part(new THREE.SphereGeometry(1, 5, 4), "#f2c95a", [x + Math.cos(a) * h * lean, h + 0.006, z + Math.sin(a) * h * lean], [Math.sin(a) * lean, 0, -Math.cos(a) * lean], [0.0042, 0.011, 0.0042]));
  }
  return merge(parts);
}
function swayMat(seed: number) {
  const m = jellyfy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 }), `jelly-sway-${seed}`, (sh) => {
    sh.uniforms.uTime = m.userData.time;
    sh.uniforms.uGust = m.userData.gust;
    sh.vertexShader = "uniform float uTime;\nuniform float uGust;\n" + sh.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec3 root = instanceMatrix[3].xyz;
      float gust = ( sin( uTime * 1.6 - root.x * 6.0 - root.z * 4.0 ) * 0.6 + sin( uTime * 2.9 - root.x * 13.0 ) * 0.25 ) * uGust;
      transformed.x += position.y * position.y * 9.0 * gust;
      transformed.z += position.y * position.y * 4.0 * gust;
      #endif`,
    );
  });
  m.userData.time = { value: 0 };
  m.userData.gust = { value: 1 };
  return m;
}

// A round hay bale lying on its side along x: gold, two darker bands, a darker rolled core on each face.
function baleGeo() {
  const p: THREE.BufferGeometry[] = [part(cyl(1, 1, 18), "#e2b54c", [0, 0, 0], [0, 0, Math.PI / 2], [0.036, 0.05, 0.036])];
  for (const x of [-0.012, 0.012]) p.push(part(cyl(1, 1, 18), "#bf8f2f", [x, 0, 0], [0, 0, Math.PI / 2], [0.0368, 0.004, 0.0368]));
  for (const x of [-0.0252, 0.0252]) {
    p.push(part(cyl(1, 1, 18), "#cfa040", [x, 0, 0], [0, 0, Math.PI / 2], [0.03, 0.002, 0.03]));
    p.push(part(cyl(1, 1, 14), "#a87a26", [x * 1.02, 0, 0], [0, 0, Math.PI / 2], [0.014, 0.002, 0.014]));
  }
  return merge(p);
}
// A stook: five sheaves leaned together, tied at the waist, ears up.
function stookGeo() {
  const p: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    p.push(part(cyl(0.006, 0.009, 6), "#d9ad4a", [Math.cos(a) * 0.007, 0.022, Math.sin(a) * 0.007], [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25], [1, 0.044, 1]));
    p.push(part(sphere(6), "#f0c860", [Math.cos(a) * 0.004, 0.048, Math.sin(a) * 0.004], [0, 0, 0], [0.008, 0.01, 0.008]));
  }
  p.push(part(cyl(1, 1, 10), "#a5762a", [0, 0.026, 0], [0, 0, 0], [0.011, 0.003, 0.011]));
  return merge(p);
}
// A crow facing +x: black body, a grey-black head, a dark beak; wings on their own so it can flap off.
function crow(m: THREE.Material) {
  const g = new THREE.Group();
  g.add(
    mesh(
      merge([
        part(sphere(), "#1f1d24", [0, 0.012, 0], [0, 0, 0.3], [0.012, 0.008, 0.007]),
        part(sphere(), "#2a2830", [0.011, 0.019, 0], [0, 0, 0], [0.006, 0.006, 0.0055]),
        part(new THREE.ConeGeometry(1, 1, 5), "#3a3532", [0.019, 0.018, 0], [0, 0, -Math.PI / 2], [0.0022, 0.007, 0.0022]),
        part(sphere(6), "#e8d36a", [0.014, 0.021, 0.004], [0, 0, 0], [0.0012, 0.0012, 0.0012]),
        part(sphere(6), "#e8d36a", [0.014, 0.021, -0.004], [0, 0, 0], [0.0012, 0.0012, 0.0012]),
        part(new THREE.BoxGeometry(1, 1, 1), "#1f1d24", [-0.013, 0.012, 0], [0, 0, 0.3], [0.01, 0.002, 0.007]),
        part(cyl(0.0008, 0.0008, 4), "#3a3532", [0.002, 0.003, 0.003], [0, 0, 0], [1, 0.006, 1]),
        part(cyl(0.0008, 0.0008, 4), "#3a3532", [0.002, 0.003, -0.003], [0, 0, 0], [1, 0.006, 1]),
      ]),
      m,
    ),
  );
  const wings = [1, -1].map((side) => {
    const w = mesh(merge([part(sphere(8), "#26242c", [0, 0, 0.011 * side], [0, 0, 0], [0.01, 0.0015, 0.012])]), m);
    w.position.set(0, 0.015, 0.002 * side);
    g.add(w);
    return w;
  });
  g.scale.setScalar(SIZE.small);
  g.userData.ref = "crow";
  return { g, wings };
}

// A seagull gliding along +x (prompt "Board-wide life"): a white body and head, a yellow bill with its red spot, a grey tail
// band, and long grey wings in two joints with black tips, so it can glide with a slight lift and now and then flap.
export function gull(m: THREE.Material) {
  const g = new THREE.Group();
  g.add(
    mesh(
      merge([
        part(sphere(), "#fbfaf6", [0, 0, 0], [0, 0, 0], [0.024, 0.009, 0.009]),
        part(sphere(), "#fbfaf6", [0.022, 0.004, 0], [0, 0, 0], [0.008, 0.007, 0.007]),
        part(new THREE.ConeGeometry(1, 1, 6), "#f2c230", [0.033, 0.002, 0], [0, 0, -Math.PI / 2 - 0.15], [0.0025, 0.01, 0.0025]),
        part(sphere(6), "#d8392b", [0.034, 0.0, 0], [0, 0, 0], [0.0015, 0.0015, 0.0015]),
        part(sphere(6), "#1a1414", [0.026, 0.006, 0.005], [0, 0, 0], [0.0012, 0.0012, 0.0012]),
        part(sphere(6), "#1a1414", [0.026, 0.006, -0.005], [0, 0, 0], [0.0012, 0.0012, 0.0012]),
        part(new THREE.BoxGeometry(1, 1, 1), "#fbfaf6", [-0.026, 0.002, 0], [0, 0, 0], [0.014, 0.002, 0.012]),
        part(new THREE.BoxGeometry(1, 1, 1), "#9aa3ab", [-0.032, 0.0025, 0], [0, 0, 0], [0.004, 0.0022, 0.0125]),
      ]),
      m,
    ),
  );
  const wings = [1, -1].map((side) => {
    const inner = new THREE.Group();
    inner.position.set(0.003, 0.004, 0.006 * side);
    inner.add(mesh(merge([part(sphere(8), "#a9b2ba", [0, 0, 0.018 * side], [0, 0, 0], [0.011, 0.0018, 0.02])]), m));
    const outer = new THREE.Group();
    outer.position.set(0, 0, 0.036 * side);
    outer.add(
      mesh(
        merge([
          part(sphere(8), "#a9b2ba", [-0.004, 0, 0.014 * side], [0, 0.35 * side, 0], [0.008, 0.0016, 0.017]),
          part(sphere(8), "#1d1c20", [-0.008, 0, 0.027 * side], [0, 0.35 * side, 0], [0.005, 0.0015, 0.008]),
        ]),
        m,
      ),
    );
    inner.add(outer);
    g.add(inner);
    return { inner, outer, side };
  });
  g.traverse((o) => ((o as THREE.Mesh).isMesh && ((o.castShadow = true), (o.receiveShadow = false))));
  // Glide with the wings lifted a little; `flap` (0 to 1) beats them.
  const pose = (t: number, flap: number) => {
    for (const w of wings) {
      const beat = flap * Math.sin(t * 14);
      w.inner.rotation.x = -w.side * (0.15 + 0.7 * beat);
      w.outer.rotation.x = -w.side * (0.1 + 0.5 * beat);
    }
  };
  return { g, pose };
}

// GRAIN, "Harvest" (docs/design/hex-jelly-prompt.md): the field in four strips (standing wheat swaying in a wind wave, a
// half-cut strip with stubble, stooks and the farmer scything, a ploughed strip the crows work), the windmill on the back rise
// turning, three round bales, a red wheelbarrow of sheaves, the scarecrow, poppies and cornflowers, and a hare sitting up.
function farm(L: Layout, ground: (x: number, z: number) => number, r: () => number, env: Env): Built {
  const g = new THREE.Group();
  const life: Life[] = [];
  const stands: { x: number; z: number; r: number }[] = [];
  const Y = (x: number, z: number) => BLOCK_H + ground(x, z);
  const cm = critterMat();
  const [hx, hz] = [Math.cos(L.hillAt), Math.sin(L.hillAt)];
  // From field (u, v) back to the tile.
  const xz = (u: number, v: number) => ({ x: -hz * u + hx * v, z: hx * u + hz * v });
  const EYE = { x: Math.sin(20 * DEG), z: Math.cos(20 * DEG) };
  const ok = (x: number, z: number, room: number) =>
    Math.hypot(x, z) > 0.4 + room && nearestCorner(x, z) > 0.2 + room && hexDist(x, z) < INR - 0.14 - room && stands.every((q) => Math.hypot(q.x - x, q.z - z) > q.r + room);
  const strip = (crop: string) => L.strips.find((s) => s.crop === crop)!;
  const cut = strip("cut");
  const split = -0.42 + r() * 0.1;
  const mid = (s: { u0: number; u1: number }) => (s.u0 + s.u1) / 2;

  // The windmill on the rise: a cream tower, a red cap, a door and windows, four sails turning toward the token.
  {
    const m = L.marks.mill!;
    const y = Y(m.x, m.z);
    const face = Math.atan2(-m.z, -m.x);
    const mill = new THREE.Group();
    mill.add(
      mesh(
        merge([
          part(cyl(0.75, 1, 14), "#efe4cc", [0, 0.1, 0], [0, 0, 0], [0.05, 0.2, 0.05]),
          part(new THREE.ConeGeometry(1, 1, 14), "#c44a36", [0, 0.235, 0], [0, 0, 0], [0.048, 0.07, 0.048]),
          part(cyl(1, 1, 14), "#a33a2a", [0, 0.2, 0], [0, 0, 0], [0.042, 0.006, 0.042]),
          part(new THREE.BoxGeometry(1, 1, 1), "#6a4a32", [0.048, 0.025, 0], [0, 0, 0], [0.006, 0.045, 0.026]),
          part(new THREE.BoxGeometry(1, 1, 1), "#3e5a6a", [0.043, 0.11, 0], [0, 0, 0], [0.004, 0.022, 0.016]),
          part(new THREE.BoxGeometry(1, 1, 1), "#3e5a6a", [0.0, 0.1, 0.044], [0, 0, 0], [0.014, 0.02, 0.004]),
          part(cyl(1, 1, 8), "#6a4a32", [0.05, 0.2, 0], [0, 0, Math.PI / 2], [0.008, 0.03, 0.008]),
        ]),
        cm,
      ),
    );
    const sails = new THREE.Group();
    sails.position.set(0.068, 0.2, 0);
    const blades: THREE.BufferGeometry[] = [part(sphere(8), "#6a4a32", [0, 0, 0], [0, 0, 0], [0.012, 0.012, 0.012])];
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const [cy, cz] = [Math.cos(a), Math.sin(a)];
      blades.push(part(new THREE.BoxGeometry(1, 1, 1), "#7a5434", [0, cy * 0.08, cz * 0.08], [a, 0, 0], [0.004, 0.16, 0.004]));
      // The canvas on the trailing side of each arm, framed.
      const [ox, oz] = [-Math.sin(a), Math.cos(a)];
      blades.push(part(new THREE.BoxGeometry(1, 1, 1), "#f5ecd8", [0.002, cy * 0.095 + ox * 0.018, cz * 0.095 + oz * 0.018], [a, 0, 0], [0.002, 0.12, 0.032]));
      for (const t of [0.05, 0.095, 0.14]) blades.push(part(new THREE.BoxGeometry(1, 1, 1), "#7a5434", [0.003, cy * t + ox * 0.018, cz * t + oz * 0.018], [a, 0, 0], [0.002, 0.003, 0.036]));
    }
    sails.add(mesh(merge(blades), cm));
    mill.add(sails);
    mill.scale.setScalar(SIZE.mill);
    mill.userData.ref = "windmill";
    mill.position.set(m.x, y - 0.01, m.z);
    mill.rotation.y = -face;
    g.add(mill);
    stands.push({ x: m.x, z: m.z, r: 0.12 });
    let spun = 0;
    let cur = 0;
    life.push((t) => {
      // On a roll the sails spin up for a few extra turns.
      if (env.roll >= 0) cur = ease(env.roll) * Math.PI * 6;
      else if (cur) (spun += cur), (cur = 0);
      sails.rotation.x = t * 0.9 + spun + cur;
    });
  }

  // A gable roof along x: a triangular prism of `w` across, `h` high, `d` long.
  const gable = (w: number, h: number, d: number) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, 0);
    sh.lineTo(w / 2, 0);
    sh.lineTo(0, h);
    sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2).rotateY(Math.PI / 2);
  };
  const box = () => new THREE.BoxGeometry(1, 1, 1);

  // The farmstead at the rise's foot: a red barn with white trim and a hay loft, the farmhouse with its chimney smoke, a silo,
  // a hay wagon, and hens pecking in the yard.
  {
    const yard = L.marks.yard!;
    const out = Math.atan2(yard.z, yard.x);
    // The buildings face the clearing, side by side along the tile's rim.
    const along = { x: -Math.sin(out), z: Math.cos(out) };
    const inward = { x: -Math.cos(out), z: -Math.sin(out) };
    const spot = (k: number, d: number) => ({ x: yard.x + along.x * k + inward.x * d, z: yard.z + along.z * k + inward.z * d });
    const facing = Math.atan2(inward.z, inward.x);
    const set = (o: THREE.Object3D, p: Pt, scale: number) => {
      o.scale.setScalar(scale);
      o.position.set(p.x, Y(p.x, p.z), p.z);
      o.rotation.y = -facing;
      g.add(o);
    };
    const barnAt = spot(0, 0);
    const barn = new THREE.Group();
    barn.add(
      mesh(
        merge([
          part(box(), "#c23b30", [0, 0.045, 0], [0, 0, 0], [0.11, 0.09, 0.14]),
          part(gable(0.13, 0.06, 0.15), "#4d4a52", [0, 0.09, 0]),
          part(box(), "#f4efe4", [0.0555, 0.045, 0], [0, 0, 0], [0.002, 0.07, 0.05]),
          part(box(), "#c23b30", [0.057, 0.045, 0], [0, 0, 0], [0.002, 0.062, 0.042]),
          part(box(), "#f4efe4", [0.058, 0.045, 0], [0.98, 0, 0], [0.002, 0.075, 0.004]),
          part(box(), "#f4efe4", [0.058, 0.045, 0], [-0.98, 0, 0], [0.002, 0.075, 0.004]),
          part(box(), "#f4efe4", [0.0555, 0.105, 0], [0, 0, 0], [0.002, 0.024, 0.024]),
          part(box(), "#e2b54c", [0.057, 0.102, 0], [0, 0, 0], [0.002, 0.016, 0.016]),
          part(box(), "#f4efe4", [0, 0.091, 0], [0, 0, 0], [0.114, 0.003, 0.144]),
        ]),
        cm,
      ),
    );
    const loft = new THREE.Mesh(new THREE.PlaneGeometry(0.016, 0.016).rotateY(Math.PI / 2), basic("#ffc46a", 0));
    loft.position.set(0.0585, 0.102, 0);
    barn.add(loft);
    set(barn, barnAt, SIZE.barn);
    barn.userData.ref = "barn";
    stands.push({ x: barnAt.x, z: barnAt.z, r: 0.18 });

    const houseAt = spot(-0.28, 0.04);
    const house = new THREE.Group();
    house.add(
      mesh(
        merge([
          part(box(), "#f2e6cc", [0, 0.032, 0], [0, 0, 0], [0.07, 0.064, 0.09]),
          part(gable(0.086, 0.048, 0.1), "#8a4a2c", [0, 0.064, 0]),
          part(box(), "#6a4a32", [0.036, 0.018, 0], [0, 0, 0], [0.002, 0.034, 0.016]),
          part(box(), "#5f8fb0", [0.036, 0.042, 0.026], [0, 0, 0], [0.002, 0.014, 0.012]),
          part(box(), "#5f8fb0", [0.036, 0.042, -0.026], [0, 0, 0], [0.002, 0.014, 0.012]),
          part(box(), "#a85a3a", [-0.015, 0.1, 0.03], [0, 0, 0], [0.012, 0.03, 0.012]),
          part(box(), "#4f8a3a", [0.04, 0.006, 0.02], [0, 0, 0], [0.008, 0.012, 0.03]),
        ]),
        cm,
      ),
    );
    const lights = [0.026, -0.026].map((z) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.014).rotateY(Math.PI / 2), basic("#ffc46a", 0));
      w.position.set(0.0372, 0.042, z);
      house.add(w);
      return w;
    });
    const halos = [...lights, loft].map((w) => {
      const h = halo("#ffb860", 0.07);
      h.position.copy(w.position).add(new THREE.Vector3(0.006, 0, 0));
      w.parent!.add(h);
      return h;
    });
    life.push(() => {
      [...lights, loft].forEach((w) => ((w.material as THREE.MeshBasicMaterial).opacity = env.night));
      halos.forEach((h) => (h.material.opacity = env.night * 0.75));
    });
    set(house, houseAt, SIZE.house);
    house.userData.ref = "house";
    stands.push({ x: houseAt.x, z: houseAt.z, r: 0.14 });
    const chimney = new THREE.Vector3(-0.015, 0.12, 0.03).multiplyScalar(SIZE.house).applyEuler(house.rotation).add(house.position);
    const smokes = Array.from({ length: 4 }, (_, i) => {
      const o = new THREE.Mesh(blobGeo(200 + i), new THREE.MeshStandardMaterial({ color: "#e4e0d8", roughness: 1, transparent: true, opacity: 0.4, depthWrite: false }));
      o.userData.loose = true;
      g.add(o);
      return { o, ph: i / 4 };
    });
    life.push((t) => {
      for (const sm of smokes) {
        const u = (t * 0.1 + sm.ph) % 1;
        sm.o.position.set(chimney.x + u * 0.04, chimney.y + u * 0.16, chimney.z - u * 0.03);
        sm.o.scale.setScalar(0.008 + u * 0.02);
        (sm.o.material as THREE.MeshStandardMaterial).opacity = 0.32 * Math.sin(Math.PI * u);
      }
    });

    const siloAt = spot(0.21, -0.02);
    const silo = new THREE.Group();
    silo.add(
      mesh(
        merge([
          part(cyl(1, 1, 16), "#b9c4cc", [0, 0.07, 0], [0, 0, 0], [0.026, 0.14, 0.026]),
          part(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), "#8a9aa6", [0, 0.14, 0], [0, 0, 0], [0.027, 0.02, 0.027]),
          ...[0.035, 0.07, 0.105].map((y) => part(cyl(1, 1, 16), "#8a9aa6", [0, y, 0], [0, 0, 0], [0.0268, 0.004, 0.0268])),
        ]),
        cm,
      ),
    );
    set(silo, siloAt, SIZE.silo);
    silo.userData.ref = "silo";
    stands.push({ x: siloAt.x, z: siloAt.z, r: 0.06 });

    // The hay wagon in front of the barn, piled high.
    const wagonAt = spot(0.03, 0.24);
    const wagon = new THREE.Group();
    wagon.add(
      mesh(
        merge([
          part(box(), "#9a6e44", [0, 0.022, 0], [0, 0, 0], [0.07, 0.006, 0.04]),
          ...[-0.022, 0.022].flatMap((x) => [-0.024, 0.024].map((z) => part(cyl(1, 1, 12), "#5a3a26", [x, 0.012, z], [Math.PI / 2, 0, 0], [0.012, 0.005, 0.012]))),
          part(blobGeo(210), "#e8c25a", [0, 0.04, 0], [0, 0, 0], [0.04, 0.024, 0.024]),
          part(blobGeo(211), "#f0cf6a", [0.01, 0.055, 0.004], [0, 1, 0], [0.026, 0.016, 0.018]),
          part(cyl(0.0018, 0.0018, 6), "#7a5434", [0.05, 0.016, 0], [0, 0, 1.3], [1, 0.04, 1]),
        ]),
        cm,
      ),
    );
    if (ok(wagonAt.x, wagonAt.z, 0.02)) {
      set(wagon, wagonAt, SIZE.wagon);
      wagon.userData.ref = "wagon";
      wagon.rotation.y += 1.2;
      stands.push({ x: wagonAt.x, z: wagonAt.z, r: 0.07 });
    }

    // Hens pecking about the yard.
    const hens = [0, 1, 2, 3].map((i) => {
      const h = new THREE.Group();
      const body = mesh(
        merge([
          part(sphere(), i === 3 ? "#a8643a" : "#f6f1e6", [0, 0.008, 0], [0, 0, 0.2], [0.009, 0.007, 0.007]),
          part(sphere(8), "#d8392b", [0.008, 0.016, 0], [0, 0, 0], [0.002, 0.003, 0.0015]),
          part(new THREE.ConeGeometry(1, 1, 5), "#f0a830", [0.012, 0.012, 0], [0, 0, -Math.PI / 2], [0.0015, 0.004, 0.0015]),
          part(sphere(6), i === 3 ? "#7a4428" : "#efe8da", [-0.009, 0.012, 0], [0, 0, 0.6], [0.004, 0.005, 0.003]),
        ]),
        cm,
      );
      h.add(body);
      h.scale.setScalar(SIZE.small);
      h.userData.ref = "hen";
      g.add(h);
      const p = spot(-0.14 + i * 0.06, 0.2 + (i % 2) * 0.05);
      return { h, body, p, ph: i * 1.3 };
    });
    life.push((t) => {
      for (const k of hens) {
        const x = k.p.x + Math.sin(t * 0.5 + k.ph) * 0.025;
        const z = k.p.z + Math.cos(t * 0.4 + k.ph) * 0.02;
        k.h.position.set(x, Y(x, z), z);
        k.h.rotation.y = -(t * 0.5 + k.ph);
        k.body.rotation.z = -0.5 * Math.max(0, Math.sin(t * 5 + k.ph * 3)) ** 6;
      }
    });
  }

  // The duck pond: a jelly disc, reeds, two ducks paddling round.
  if (L.pool) {
    const pool = L.pool;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(pool.r * 0.8, 40).rotateX(-Math.PI / 2), waterMat(false));
    disc.position.set(pool.x, BLOCK_H + POOL_LEVEL, pool.z);
    disc.renderOrder = 1;
    g.add(disc);
    const reeds: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + r() * 0.3;
      if (Math.sin(a - Math.atan2(EYE.z, EYE.x)) > 0.3 && i % 2) continue;
      const [x, z] = [pool.x + Math.cos(a) * pool.r * 0.85, pool.z + Math.sin(a) * pool.r * 0.85];
      const y = Y(x, z);
      for (let k = 0; k < 3; k++) reeds.push(part(cyl(0.0015, 0.002, 4), "#5a8f3a", [x + (r() - 0.5) * 0.01, y + 0.02, z + (r() - 0.5) * 0.01], [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3], [1, 0.04 + r() * 0.02, 1]));
      if (i % 3 === 0) reeds.push(part(cyl(1, 1, 6), "#6a4428", [x, y + 0.045, z], [0, 0, 0], [0.003, 0.012, 0.003]));
    }
    g.add(mesh(merge(reeds), cm));
    stands.push({ x: pool.x, z: pool.z, r: pool.r + 0.03 });
    const ducks = [0, 1].map((i) => {
      const d = new THREE.Group();
      d.add(
        mesh(
          merge([
            part(sphere(), "#f6f1e6", [0, 0.004, 0], [0, 0, 0], [0.011, 0.006, 0.007]),
            part(sphere(), i ? "#2f6a46" : "#f6f1e6", [0.008, 0.012, 0], [0, 0, 0], [0.005, 0.005, 0.005]),
            part(new THREE.ConeGeometry(1, 1, 5), "#f0a830", [0.014, 0.011, 0], [0, 0, -Math.PI / 2], [0.002, 0.005, 0.0025]),
            part(sphere(6), "#efe8da", [-0.01, 0.007, 0], [0, 0, 0.8], [0.004, 0.003, 0.003]),
          ]),
          cm,
        ),
      );
      d.scale.setScalar(SIZE.small);
      d.userData.ref = "duck";
      g.add(d);
      return { d, ph: i * Math.PI };
    });
    life.push((t) => {
      disc.material && ((disc.material as THREE.MeshStandardMaterial).userData.time.value = t);
      for (const k of ducks) {
        const a = t * 0.35 + k.ph;
        k.d.position.set(pool.x + Math.cos(a) * pool.r * 0.45, BLOCK_H + POOL_LEVEL + 0.002 * Math.sin(t * 3 + k.ph), pool.z + Math.sin(a) * pool.r * 0.45);
        k.d.rotation.y = -(a + Math.PI / 2);
      }
    });
  }

  // Hedgerows between the strips and along the field's back edge: the patchwork's seams.
  {
    const hedge: THREE.BufferGeometry[] = [];
    const lines: [number, number, number, number][] = [];
    for (let i = 1; i < L.strips.length; i++) {
      const u = (L.strips[i - 1]!.u1 + L.strips[i]!.u0) / 2;
      lines.push([u, -1, u, -0.03]);
    }
    for (const [u0, v0, u1, v1] of lines) {
      const n = Math.ceil(Math.hypot(u1 - u0, v1 - v0) / 0.036);
      for (let k = 0; k <= n; k++) {
        const p = xz(u0 + ((u1 - u0) * k) / n, v0 + ((v1 - v0) * k) / n);
        if (Math.hypot(p.x, p.z) < 0.42 || nearestCorner(p.x, p.z) < 0.22 || hexDist(p.x, p.z) > INR - 0.14) continue;
        const y = Y(p.x, p.z);
        hedge.push(part(blobGeo(220 + (k % 9)), k % 3 ? "#3f8a3a" : "#5aa443", [p.x + (r() - 0.5) * 0.01, y + 0.018, p.z + (r() - 0.5) * 0.01], [0, r() * 6, 0], [0.024, 0.022, 0.024]));
        if (k % 7 === 3) hedge.push(part(blobGeo(240 + k), "#6aad47", [p.x, y + 0.05, p.z], [0, 0, 0], [0.03, 0.032, 0.03]));
        stands.push({ x: p.x, z: p.z, r: 0.022 });
      }
    }
    if (hedge.length) g.add(mesh(merge(hedge), cm));
  }

  // The scarecrow in a standing strip, the hare between two rows of another.
  const wheatStrips = L.strips.filter((s) => s.crop === "wheat");
  const sc = xz(mid(wheatStrips[0]!) + 0.012, -0.5);
  const hareAt = xz(wheatStrips[1]!.u0 + FURROW * 2.5, -0.55);
  for (const p of [sc, hareAt]) stands.push({ x: p.x, z: p.z, r: 0.05 });

  // The cut strip's front: stooks in rows, three bales, the barrow at its edge; the farmer at the line of standing wheat.
  const stooks: Inst[] = [];
  const bales: Inst[] = [];
  for (let v = split - 0.08; v > -0.95; v -= 0.12)
    for (const u of [cut.u0 + 0.1, cut.u1 - 0.1]) {
      const p = xz(u + (r() - 0.5) * 0.03, v);
      if (!ok(p.x, p.z, 0.03)) continue;
      stooks.push({ m: mat(p.x, Y(p.x, p.z), p.z, SIZE.stook, SIZE.stook, SIZE.stook, r() * 6), c: new THREE.Color(1, 1, 1) });
      stands.push({ x: p.x, z: p.z, r: 0.035 });
    }
  // Bales: one on the stubble, the rest in the meadow beside the rise, where the field stops.
  for (let k = 0, tries = 0; k < 4 && tries < 600; tries++) {
    const onCut = k < 1 && tries < 150;
    const p = onCut ? xz(mid(cut) + (r() - 0.5) * 0.2, split - 0.15 - r() * 0.3) : xz((r() < 0.5 ? -1 : 1) * (0.35 + r() * 0.45), 0.12 + r() * 0.3);
    if (!ok(p.x, p.z, 0.05) || (!onCut && ground(p.x, p.z) > 0.14)) continue;
    const a = r() * Math.PI;
    bales.push({ m: mat(p.x, Y(p.x, p.z) + 0.036 * SIZE.bale, p.z, SIZE.bale, SIZE.bale, SIZE.bale, a), c: new THREE.Color(1, 1, 1) });
    stands.push({ x: p.x, z: p.z, r: 0.07 });
    k++;
  }
  // Round trees and a hedge clump in the meadow corners beside the rise.
  {
    const trees: THREE.BufferGeometry[] = [];
    for (let k = 0, tries = 0; k < 4 && tries < 600; tries++) {
      const p = xz((r() < 0.5 ? -1 : 1) * (0.3 + r() * 0.55), 0.05 + r() * 0.4);
      if (!ok(p.x, p.z, 0.06) || ground(p.x, p.z) > 0.08) continue;
      const y = Y(p.x, p.z);
      const big = k < 2;
      const sz = big ? 1 : 0.6;
      if (big) trees.push(part(cyl(0.7, 1, 8), "#6e4128", [p.x, y + 0.035, p.z], [0, 0, 0], [0.016, 0.07, 0.016]));
      for (let i = 0; i < 5; i++) {
        const b = (i / 5) * Math.PI * 2;
        trees.push(part(blobGeo(150 + i + k * 5), ["#4f9a3c", "#6aad47", "#8cc65a"][i % 3]!, [p.x + Math.cos(b) * 0.03 * sz, y + (big ? 0.09 : 0.025) + (i % 2) * 0.02 * sz, p.z + Math.sin(b) * 0.03 * sz], [0, b, 0], [0.042 * sz, 0.036 * sz, 0.042 * sz]));
      }
      if (big) trees.push(part(blobGeo(170 + k), "#8cc65a", [p.x, y + 0.13, p.z], [0, 0, 0], [0.045, 0.038, 0.045]));
      stands.push({ x: p.x, z: p.z, r: big ? 0.08 : 0.05 });
      k++;
    }
    if (trees.length) g.add(mesh(merge(trees), cm));
  }
  if (stooks.length) g.add(instanced(stookGeo(), stooks, critterMat()));
  if (bales.length) g.add(instanced(baleGeo(), bales, critterMat()));
  // Any fixed vertexColors instanced mesh needs white instance colour; set above.

  // The farmer, scything into the standing wheat.
  {
    const p = xz(mid(cut), split - 0.05);
    const f = person(cm, "#c4553f", 0.25, "#e8c56a");
    f.g.position.set(p.x, Y(p.x, p.z), p.z);
    const face = Math.atan2(hz, hx);
    f.g.rotation.y = -face;
    const scythe = new THREE.Group();
    scythe.add(
      mesh(
        merge([
          part(cyl(0.0018, 0.0018, 6), "#9a6e44", [0, 0, 0], [0, 0, 0.9], [1, 0.11, 1]),
          part(new THREE.TorusGeometry(0.035, 0.0025, 4, 14, 1.4), "#c9ced2", [-0.045, -0.035, 0.02], [Math.PI / 2, 0, 0.3], [1, 1, 0.6]),
        ]),
        cm,
      ),
    );
    scythe.position.set(0.02, 0.01, 0);
    f.top.add(scythe);
    g.add(f.g);
    stands.push({ x: p.x, z: p.z, r: 0.06 });
    life.push((t) => {
      const sw = Math.sin(t * 2.2);
      f.top.rotation.y = 0.7 * sw;
      f.top.rotation.z = -0.25 - 0.1 * Math.abs(sw);
    });
  }

  // The red wheelbarrow, sheaves in it, on the track beside the cut strip.
  {
    const p = xz(cut.u0 - 0.025, split - 0.25);
    if (ok(p.x, p.z, 0.02)) {
      const b = new THREE.Group();
      b.add(
        mesh(
          merge([
            part(new THREE.BoxGeometry(1, 1, 1), "#c8392f", [0, 0.022, 0], [0, 0, 0.12], [0.05, 0.016, 0.034]),
            part(cyl(1, 1, 12), "#3a2a24", [0.03, 0.01, 0], [Math.PI / 2, 0, 0], [0.01, 0.006, 0.01]),
            part(cyl(0.0018, 0.0018, 6), "#7a5434", [-0.035, 0.022, 0.012], [0, 0, 1.35], [1, 0.05, 1]),
            part(cyl(0.0018, 0.0018, 6), "#7a5434", [-0.035, 0.022, -0.012], [0, 0, 1.35], [1, 0.05, 1]),
            part(cyl(0.0016, 0.0016, 6), "#7a5434", [-0.012, 0.008, 0.012], [0, 0, 0], [1, 0.016, 1]),
            part(cyl(0.0016, 0.0016, 6), "#7a5434", [-0.012, 0.008, -0.012], [0, 0, 0], [1, 0.016, 1]),
            ...[0, 1, 2].map((i) => part(cyl(0.006, 0.007, 6), "#e2b54c", [-0.005 + i * 0.01, 0.036, (i - 1) * 0.008], [0.2 * (i - 1), 0, 1.4], [1, 0.05, 1])),
          ]),
          cm,
        ),
      );
      b.scale.setScalar(SIZE.barrow);
      b.userData.ref = "barrow";
      b.position.set(p.x, Y(p.x, p.z), p.z);
      b.rotation.y = -Math.atan2(hz, hx) + 0.6;
      g.add(b);
      stands.push({ x: p.x, z: p.z, r: 0.06 });
    }
  }

  // The scarecrow: a post and crossbar, a patched blue shirt, a sack head, a straw hat, straw at the cuffs.
  {
    const s = new THREE.Group();
    s.add(
      mesh(
        merge([
          part(cyl(0.003, 0.003, 6), "#7a5434", [0, 0.05, 0], [0, 0, 0], [1, 0.1, 1]),
          part(cyl(0.0025, 0.0025, 6), "#7a5434", [0, 0.075, 0], [Math.PI / 2, 0, 0], [1, 0.07, 1]),
          part(cyl(0.012, 0.015, 8), "#4a74b4", [0, 0.068, 0], [0, 0, 0], [1, 0.035, 1]),
          part(new THREE.BoxGeometry(1, 1, 1), "#c8392f", [0.012, 0.064, 0.004], [0, 0, 0], [0.003, 0.008, 0.008]),
          part(cyl(0.005, 0.005, 6), "#4a74b4", [0, 0.076, 0.022], [Math.PI / 2, 0, 0], [1, 0.024, 1]),
          part(cyl(0.005, 0.005, 6), "#4a74b4", [0, 0.076, -0.022], [Math.PI / 2, 0, 0], [1, 0.024, 1]),
          part(sphere(6), "#e8c060", [0, 0.074, 0.036], [0, 0, 0], [0.004, 0.005, 0.006]),
          part(sphere(6), "#e8c060", [0, 0.074, -0.036], [0, 0, 0], [0.004, 0.005, 0.006]),
          part(sphere(), "#dcc79a", [0, 0.097, 0], [0, 0, 0], [0.011, 0.012, 0.011]),
          part(sphere(6), "#3a2a24", [0.01, 0.099, 0.004], [0, 0, 0], [0.0015, 0.0015, 0.0015]),
          part(sphere(6), "#3a2a24", [0.01, 0.099, -0.004], [0, 0, 0], [0.0015, 0.0015, 0.0015]),
          part(cyl(1, 1, 14), "#e0b85a", [0, 0.107, 0], [0, 0, 0.1], [0.022, 0.002, 0.022]),
          part(cyl(0.7, 1, 10), "#e0b85a", [0, 0.114, 0], [0, 0, 0.1], [0.011, 0.012, 0.011]),
        ]),
        cm,
      ),
    );
    s.scale.setScalar(SIZE.scarecrow);
    s.userData.ref = "scarecrow";
    s.position.set(sc.x, Y(sc.x, sc.z), sc.z);
    s.rotation.y = -Math.atan2(EYE.z, EYE.x);
    g.add(s);
  }

  // Crows on the ploughed strip: hopping, and now and then one flaps up and settles again.
  {
    const s = strip("plough");
    const crows = [0, 1, 2].map((i) => {
      const c = crow(cm);
      g.add(c.g);
      const p = xz(mid(s) + (i - 1) * 0.1, -0.4 - i * 0.12);
      return { c, p, ph: i * 1.7 };
    });
    life.push((t) => {
      for (const k of crows) {
        const u = (t + k.ph) % 6;
        // On a roll they all take off at once.
        const fly = env.roll >= 0 ? Math.sin(Math.min(1, env.roll * 1.2) * Math.PI) : u > 4.2 && u < 5.6 ? Math.sin(((u - 4.2) / 1.4) * Math.PI) : 0;
        const hop = Math.abs(Math.sin((t + k.ph) * 4)) * 0.006;
        const x = k.p.x + Math.sin((t + k.ph) * 0.4) * 0.03;
        const z = k.p.z + Math.cos((t + k.ph) * 0.3) * 0.03;
        k.c.g.position.set(x, Y(x, z) + hop + fly * 0.12, z);
        k.c.g.rotation.y = -(t * 0.4 + k.ph);
        k.c.wings.forEach((w, i) => (w.rotation.x = (i ? -1 : 1) * (fly > 0 ? 0.9 * Math.sin(t * 30) : 0.05)));
      }
    });
  }

  // The hare, sitting up between two rows, ears twitching.
  {
    const h = new THREE.Group();
    h.add(
      mesh(
        merge([
          part(sphere(), "#a8784e", [0, 0.022, 0], [0, 0, -0.9], [0.013, 0.02, 0.012]),
          part(sphere(), "#e9dcc4", [0.006, 0.02, 0], [0, 0, -0.9], [0.008, 0.013, 0.009]),
          part(sphere(), "#a8784e", [0.01, 0.043, 0], [0, 0, 0], [0.009, 0.008, 0.008]),
          part(sphere(6), "#2a1d17", [0.017, 0.045, 0.004], [0, 0, 0], [0.0015, 0.0015, 0.0015]),
          part(sphere(6), "#2a1d17", [0.017, 0.045, -0.004], [0, 0, 0], [0.0015, 0.0015, 0.0015]),
          part(sphere(6), "#f6efe2", [-0.012, 0.012, 0], [0, 0, 0], [0.005, 0.005, 0.005]),
          part(sphere(8), "#a8784e", [0.006, 0.062, 0.004], [0.15, 0, 0.2], [0.003, 0.016, 0.004]),
          part(sphere(8), "#a8784e", [0.006, 0.062, -0.004], [-0.15, 0, 0.2], [0.003, 0.016, 0.004]),
        ]),
        cm,
      ),
    );
    h.scale.setScalar(SIZE.hare);
    h.userData.ref = "hare";
    h.position.set(hareAt.x, Y(hareAt.x, hareAt.z), hareAt.z);
    h.rotation.y = -Math.atan2(EYE.z, -EYE.x);
    g.add(h);
    life.push((t) => (h.rotation.z = 0.08 * Math.max(0, Math.sin(t * 2.7)) ** 8));
  }

  // The wheat: tufts along every furrow ridge of the standing strips and the cut strip's back half; stubble in its front half.
  const tufts: Inst[] = [];
  const stubble: Inst[] = [];
  const GOLD = [new THREE.Color(1, 1, 1), new THREE.Color(1.06, 1.0, 0.85), new THREE.Color(0.92, 0.9, 0.86)];
  L.strips.forEach((s) => {
    if (s.crop === "plough") return;
    for (let u = s.u0 + FURROW * 0.5; u < s.u1 - FURROW * 0.3; u += FURROW / 2) {
      const onRidge = Math.round((u - s.u0) / (FURROW / 2)) % 2 === 0;
      for (let v = -0.98; v < 0.25; v += 0.024) {
        const w = { u: u + (r() - 0.5) * 0.008, v: v + (r() - 0.5) * 0.012 };
        const p = xz(w.u, w.v);
        const f = fieldAt(L, p.x, p.z);
        if (f.keep < 0.6 || f.strip < 0 || hexDist(p.x, p.z) > INR - 0.1) continue;
        if (stands.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r * 0.8)) continue;
        if (s.crop === "cut" && w.v < split) {
          if (onRidge && r() < 0.8) stubble.push({ m: mat(p.x, Y(p.x, p.z) + 0.004, p.z, 0.006, 0.008, 0.006, r() * 6), c: new THREE.Color("#d8b860") });
          continue;
        }
        if (!onRidge && r() < 0.5) continue;
        const k = 1 + (r() - 0.5) * 0.3;
        tufts.push({ m: mat(p.x, Y(p.x, p.z) - 0.002, p.z, k * 1.15, k * (1.1 + r() * 0.2), k * 1.15, r() * 6), c: GOLD[Math.floor(r() * 3)]! });
      }
    }
  });
  const sway = swayMat(L.seed);
  g.add(instanced(tuftGeo(), tufts, sway));
  if (stubble.length) g.add(instanced(cyl(0.6, 1, 4), stubble, blobMat()));
  life.push((t) => {
    sway.userData.time.value = t;
    // A gust rolls through on a roll; the wheat falls still under the robber.
    sway.userData.gust.value = env.robber ? 0 : 1 + (env.roll >= 0 ? 2.5 * Math.sin(env.roll * Math.PI) : 0);
  });

  // Poppies and cornflowers along the tracks and the field's edge.
  {
    const dots: Inst[] = [];
    for (let i = 0; i < 500 && dots.length < 180; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.4 + Math.sqrt(r()) * 0.52;
      const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
      const f = fieldAt(L, x, z);
      // Only along the field's margins: the tracks between strips and the strips' outer edges.
      const margin = f.keep > 0.3 && (f.strip < 0 || f.inside < 0.03);
      if (hexDist(x, z) > INR - 0.07 || !margin) continue;
      const blue = i % 5 === 0;
      dots.push({ m: mat(x, Y(x, z) + 0.012, z, 0.006, 0.004, 0.006), c: new THREE.Color(blue ? "#5a7fe0" : "#e0312a") });
      dots.push({ m: mat(x, Y(x, z) + 0.005, z, 0.0012, 0.008, 0.0012), c: new THREE.Color("#4f8a34") });
    }
    g.add(instanced(sphere(6), dots, blobMat()));
  }
  return { g, stands, life };
}

// Grain's ground paint: the tracks sandy, standing wheat's soil a deep gold, stubble pale straw, the ploughed strip brown with
// darker grooves.
function farmTint(L: Layout) {
  const WHEAT = new THREE.Color("#d4a63c");
  const STUB = new THREE.Color("#ead07a");
  const SOIL = new THREE.Color("#8d5a34");
  const GROOVE = new THREE.Color("#6a4126");
  return (x: number, z: number, y: number, c: THREE.Color) => {
    const f = fieldAt(L, x, z);
    if (f.keep < 0.02) return;
    if (f.strip < 0) return;
    const s = L.strips[f.strip]!;
    const edge = smooth(0, 0.02, f.inside) * f.keep;
    const ridge = 0.5 + 0.5 * Math.cos(((f.u - s.u0) / FURROW) * Math.PI * 2);
    if (s.crop === "plough") c.lerp(SOIL, edge).lerp(GROOVE, edge * (1 - ridge) * 0.7);
    else if (s.crop === "cut" && f.v < 0) c.lerp(STUB, edge * 0.9);
    else c.lerp(WHEAT, edge * 0.85);
  };
}

// --- the brickworks

// A beam of radius r from a to b, coloured: a cylinder turned onto the segment.
function beamGeo(a: THREE.Vector3, b: THREE.Vector3, r: number, hex: string) {
  const d = b.clone().sub(a);
  const g = part(cyl(r, r, 6), hex, [0, 0, 0], [0, 0, 0], [1, d.length(), 1]);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// A sand martin facing +x: dark blue-brown back, white belly, forked tail, wings to beat.
function martin(m: THREE.Material) {
  const g = new THREE.Group();
  g.add(
    mesh(
      merge([
        part(sphere(), "#3a3a4e", [0, 0, 0], [0, 0, 0], [0.011, 0.005, 0.005]),
        part(sphere(), "#f4efe6", [0.002, -0.002, 0], [0, 0, 0], [0.008, 0.0035, 0.0042]),
        part(sphere(6), "#3a3a4e", [0.01, 0.002, 0], [0, 0, 0], [0.0045, 0.004, 0.004]),
        part(new THREE.ConeGeometry(1, 1, 4), "#2a2a3a", [-0.014, 0, 0.002], [0, 0, Math.PI / 2], [0.002, 0.01, 0.0015]),
        part(new THREE.ConeGeometry(1, 1, 4), "#2a2a3a", [-0.014, 0, -0.002], [0, 0, Math.PI / 2], [0.002, 0.01, 0.0015]),
      ]),
      m,
    ),
  );
  const wings = [1, -1].map((side) => {
    const w = new THREE.Group();
    w.add(mesh(merge([part(sphere(6), "#34344a", [0, 0, 0.012 * side], [0, 0.4 * side, 0], [0.006, 0.0012, 0.013])]), m));
    w.position.z = 0.003 * side;
    g.add(w);
    return { w, side };
  });
  g.scale.setScalar(SIZE.small * 0.6);
  return { g, wings };
}

// A donkey facing +x: grey-brown, pale muzzle and belly, long ears, a dark mane; legs and head on their own for walking.
function donkey(m: THREE.Material) {
  const g = new THREE.Group();
  g.add(
    mesh(
      merge([
        part(sphere(), "#8c8178", [0, 0.05, 0], [0, 0, 0], [0.034, 0.018, 0.015]),
        part(sphere(), "#d8cfc4", [0.002, 0.044, 0], [0, 0, 0], [0.026, 0.011, 0.012]),
        part(sphere(8), "#3a3230", [-0.034, 0.05, 0], [0, 0, 0.9], [0.012, 0.003, 0.003]),
      ]),
      m,
    ),
  );
  const head = new THREE.Group();
  head.position.set(0.03, 0.062, 0);
  head.add(
    mesh(
      merge([
        part(cyl(0.008, 0.01, 8), "#8c8178", [0.008, 0.008, 0], [0, 0, -0.7], [1, 0.03, 1]),
        part(sphere(), "#8c8178", [0.02, 0.016, 0], [0, 0, -0.5], [0.014, 0.008, 0.008]),
        part(sphere(8), "#d8cfc4", [0.03, 0.01, 0], [0, 0, -0.5], [0.007, 0.006, 0.0065]),
        part(new THREE.ConeGeometry(1, 1, 6), "#7a6f66", [0.012, 0.032, 0.005], [0.25, 0, 0], [0.003, 0.018, 0.0022]),
        part(new THREE.ConeGeometry(1, 1, 6), "#7a6f66", [0.012, 0.032, -0.005], [-0.25, 0, 0], [0.003, 0.018, 0.0022]),
        part(new THREE.BoxGeometry(1, 1, 1), "#3a3230", [0.002, 0.016, 0], [0, 0, -0.7], [0.004, 0.02, 0.003]),
        part(sphere(6), "#1a1414", [0.022, 0.02, 0.005], [0, 0, 0], [0.0015, 0.0015, 0.0015]),
        part(sphere(6), "#1a1414", [0.022, 0.02, -0.005], [0, 0, 0], [0.0015, 0.0015, 0.0015]),
      ]),
      m,
    ),
  );
  g.add(head);
  const legs = [[0.02, 0.008], [0.02, -0.008], [-0.022, 0.008], [-0.022, -0.008]].map(([x, z]) => {
    const l = mesh(merge([part(cyl(0.0042, 0.0036, 6), "#8c8178", [0, -0.017, 0], [0, 0, 0], [1, 0.034, 1]), part(cyl(0.0042, 0.0042, 6), "#3a3230", [0, -0.033, 0], [0, 0, 0], [1, 0.004, 1])]), m);
    l.position.set(x!, 0.036, z!);
    g.add(l);
    return l;
  });
  g.scale.setScalar(SIZE.sheep);
  g.userData.ref = "donkey";
  return { g, legs, head };
}

// A coyote facing +x: tawny grey with a pale belly, big pointed ears, a bushy tail tipped dark. Asleep it curls nose to tail.
function coyote(m: THREE.Material, asleep: boolean) {
  const g = new THREE.Group();
  const C = { fur: "#b39066", back: "#8a7056", belly: "#eadcc2", tip: "#3a2e26" };
  let legs: THREE.Mesh[] | undefined;
  if (asleep) {
    g.add(
      mesh(
        merge([
          part(new THREE.TorusGeometry(0.016, 0.01, 8, 18, Math.PI * 1.55), C.fur, [0, 0.009, 0], [Math.PI / 2, 0, 0]),
          part(new THREE.TorusGeometry(0.016, 0.006, 6, 14, Math.PI * 1.2), C.back, [0, 0.015, 0], [Math.PI / 2, 0, 0.3]),
          part(sphere(), C.fur, [0.014, 0.01, 0.011], [0, -0.6, 0], [0.01, 0.007, 0.008]),
          part(sphere(8), C.belly, [0.022, 0.008, 0.016], [0, -0.6, 0], [0.006, 0.004, 0.004]),
          part(new THREE.ConeGeometry(1, 1, 5), C.back, [0.01, 0.019, 0.006], [0.3, 0, 0.2], [0.0035, 0.009, 0.0025]),
          part(new THREE.ConeGeometry(1, 1, 5), C.back, [0.016, 0.019, 0.004], [0.3, 0, -0.2], [0.0035, 0.009, 0.0025]),
          part(sphere(8), C.fur, [-0.004, 0.008, 0.022], [0, 0.6, 0], [0.014, 0.006, 0.006]),
          part(sphere(6), C.tip, [0.008, 0.008, 0.024], [0, 0, 0], [0.004, 0.004, 0.004]),
        ]),
        m,
      ),
    );
  } else {
    g.add(
      mesh(
        merge([
          part(sphere(), C.fur, [0, 0.036, 0], [0, 0, 0.05], [0.026, 0.012, 0.01]),
          part(sphere(), C.back, [0, 0.042, 0], [0, 0, 0.05], [0.022, 0.006, 0.008]),
          part(sphere(), C.belly, [0.004, 0.031, 0], [0, 0, 0], [0.018, 0.006, 0.008]),
          part(sphere(), C.fur, [0.032, 0.048, 0], [0, 0, 0], [0.009, 0.008, 0.007]),
          part(new THREE.ConeGeometry(1, 1, 6), C.fur, [0.043, 0.045, 0], [0, 0, -Math.PI / 2], [0.004, 0.012, 0.004]),
          part(sphere(6), C.tip, [0.049, 0.045, 0], [0, 0, 0], [0.0018, 0.0018, 0.0018]),
          part(new THREE.ConeGeometry(1, 1, 5), C.back, [0.03, 0.06, 0.004], [0.2, 0, 0], [0.004, 0.011, 0.003]),
          part(new THREE.ConeGeometry(1, 1, 5), C.back, [0.03, 0.06, -0.004], [-0.2, 0, 0], [0.004, 0.011, 0.003]),
          part(sphere(8), C.fur, [-0.03, 0.032, 0], [0, 0, 0.7], [0.016, 0.006, 0.006]),
          part(sphere(6), C.tip, [-0.042, 0.022, 0], [0, 0, 0.7], [0.005, 0.004, 0.004]),
        ]),
        m,
      ),
    );
    legs = [[0.016, 0.006], [0.016, -0.006], [-0.016, 0.006], [-0.016, -0.006]].map(([x, z]) => {
      const l = mesh(merge([part(cyl(0.003, 0.0026, 6), C.fur, [0, -0.0135, 0], [0, 0, 0], [1, 0.027, 1])]), m);
      l.position.set(x!, 0.028, z!);
      g.add(l);
      return l;
    });
  }
  const base = SIZE.dog * 1.15;
  g.scale.setScalar(base);
  g.userData.ref = asleep ? "coyote-asleep" : "coyote";
  return { g, legs, base };
}

// CLAY, "Terracotta Hills" (docs/design/hex-jelly-prompt.md): the terraced, banded mesa with its cypresses and the martins'
// nest holes; the stepped pit with its turquoise pool and the derrick hauling a bucket; the kiln with its glowing mouth, smoke
// and the cat asleep on top; brick stacks, the drying rack, scrub and poppies.
function brickworks(L: Layout, ground: (x: number, z: number) => number, r: () => number, env: Env): Built {
  const g = new THREE.Group();
  const life: Life[] = [];
  const stands: { x: number; z: number; r: number }[] = [];
  const Y = (x: number, z: number) => BLOCK_H + ground(x, z);
  const cm = critterMat();
  const M = L.marks;
  const QAX = M.qaxis!.x;
  const pit = L.pool!;
  const EYE = { x: Math.sin(20 * DEG), z: Math.cos(20 * DEG) };
  const out = (p: Pt) => Math.atan2(p.z, p.x);
  // The whole quarry and trench keep other things out.
  const inQuarry = (x: number, z: number, room = 0) => {
    const Q = quarryAt(L, x, z);
    return Q.d < 1.12 + room * 4 || Q.trench < 1.6 + room * 20;
  };
  const ok = (x: number, z: number, room: number) =>
    Math.hypot(x, z) > 0.4 + room && nearestCorner(x, z) > 0.2 + room && hexDist(x, z) < INR - 0.14 - room && stands.every((q) => Math.hypot(q.x - x, q.z - z) > q.r + room) && !inQuarry(x, z, room);
  const clearOf = (p: Pt, x: number, z: number, w = 0.14) => {
    const [dx, dz] = [x - p.x, z - p.z];
    const along = dx * EYE.x + dz * EYE.z;
    return !(along > 0 && along < 0.4 && Math.abs(dx * EYE.z - dz * EYE.x) < w);
  };

  // The pit's water.
  const pool = new THREE.Mesh(new THREE.CircleGeometry(pit.r, 32).rotateX(-Math.PI / 2), waterMat(false));
  pool.scale.set(1.4, 1, 0.8);
  pool.rotation.y = -QAX;
  pool.position.set(pit.x, BLOCK_H + PIT_WATER, pit.z);
  pool.renderOrder = 1;
  g.add(pool);
  // The whole quarry and trench keep other things out.

  life.push((t) => ((pool.material as THREE.MeshStandardMaterial).userData.time.value = t));

  // The kiln: a beehive dome of brick, banded, a dark arched mouth with the fire glowing in it, a short flue; smoke, sparks.
  const kp = M.kiln!;
  const ky = Y(kp.x, kp.z);
  const kiln = new THREE.Group();
  const dome = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  kiln.add(
    mesh(
      merge([
        part(cyl(1, 1, 20), "#a8492a", [0, 0.012, 0], [0, 0, 0], [0.07, 0.024, 0.07]),
        part(dome, "#c25a33", [0, 0.022, 0], [0, 0, 0], [0.066, 0.085, 0.066]),
        ...[0.04, 0.065, 0.085].map((y, i) => part(cyl(1, 1, 20), "#a8492a", [0, y, 0], [0, 0, 0], [0.066 * Math.cos(Math.asin((y - 0.022) / 0.085)) + 0.001, 0.003, 0.066 * Math.cos(Math.asin((y - 0.022) / 0.085)) + 0.001 + i * 0])),
        part(cyl(0.7, 1, 10), "#8a3a22", [0, 0.11, 0], [0, 0, 0], [0.014, 0.02, 0.014]),
        part(cyl(1, 1, 16, ), "#3a1c12", [0.058, 0.03, 0], [0, 0, Math.PI / 2], [0.022, 0.016, 0.022]),
      ]),
      cm,
    ),
  );
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16).rotateY(Math.PI / 2), basic("#ff8a2a"));
  mouth.position.set(0.0665, 0.03, 0);
  kiln.add(mouth);
  const mouthHalo = halo("#ff8a3a", 0.12);
  mouthHalo.position.set(0.08, 0.03, 0);
  kiln.add(mouthHalo);
  // The cat, curled asleep on the warm dome: an orange ring of body, a tucked head, a tail wrapped round, breathing.
  const cat = mesh(
    merge([
      part(new THREE.TorusGeometry(0.012, 0.007, 8, 16, Math.PI * 1.6), "#e0913e", [0, 0, 0], [Math.PI / 2, 0, 0]),
      part(sphere(), "#e0913e", [0.011, 0.002, 0.006], [0, 0, 0], [0.008, 0.007, 0.0075]),
      part(new THREE.ConeGeometry(1, 1, 4), "#c8742c", [0.013, 0.009, 0.01], [0, 0, 0.3], [0.0028, 0.005, 0.0022]),
      part(new THREE.ConeGeometry(1, 1, 4), "#c8742c", [0.009, 0.009, 0.013], [0.3, 0, 0], [0.0028, 0.005, 0.0022]),
      part(new THREE.TorusGeometry(0.014, 0.0028, 6, 12, Math.PI * 0.8), "#c8742c", [0, -0.002, 0], [Math.PI / 2, 0, 2.4]),
      part(sphere(6), "#f4ead8", [0.004, 0.004, 0.003], [0, 0, 0], [0.006, 0.004, 0.005]),
    ]),
    cm,
  );
  cat.position.set(-0.012, 0.104, 0.012);
  cat.rotation.z = -0.25;
  kiln.add(cat);
  kiln.scale.setScalar(SIZE.house);
  kiln.position.set(kp.x, ky, kp.z);
  // Mouth toward the eye and the clearing.
  kiln.rotation.y = -Math.atan2((EYE.z * 0.6 - kp.z * 0.4), (EYE.x * 0.6 - kp.x * 0.4));
  kiln.userData.ref = "kiln";
  g.add(kiln);
  stands.push({ x: kp.x, z: kp.z, r: 0.16 });
  const flue = new THREE.Vector3(0, 0.125, 0).multiplyScalar(SIZE.house).add(kiln.position);
  const smokes = Array.from({ length: 5 }, (_, i) => {
    const o = new THREE.Mesh(blobGeo(300 + i), new THREE.MeshStandardMaterial({ color: "#ebe4da", roughness: 1, transparent: true, opacity: 0.4, depthWrite: false }));
    o.userData.loose = true;
    g.add(o);
    return { o, ph: i / 5 };
  });
  const sparks = Array.from({ length: 12 }, (_, i) => {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.003, 6, 4), basic(i % 2 ? "#ffb347" : "#ffe08a"));
    o.userData.loose = true;
    g.add(o);
    return { o, a: (i / 12) * Math.PI * 2, sp: 0.7 + r() * 0.6 };
  });
  life.push((t) => {
    const puff = env.roll >= 0 ? Math.sin(env.roll * Math.PI) : 0;
    for (const sm of smokes) {
      const u = (t * 0.1 + sm.ph) % 1;
      sm.o.visible = !env.robber;
      sm.o.position.set(flue.x + u * 0.05, flue.y + u * (0.2 + puff * 0.15), flue.z - u * 0.03);
      sm.o.scale.setScalar((0.009 + u * 0.024) * (1 + puff * 1.4));
      (sm.o.material as THREE.MeshStandardMaterial).opacity = (0.3 + puff * 0.3) * Math.sin(Math.PI * u);
    }
    for (const sp of sparks) {
      const u = env.roll >= 0 ? Math.min(1, env.roll * 1.6 * sp.sp) : -1;
      sp.o.visible = u >= 0 && u < 1;
      if (u >= 0) sp.o.position.set(flue.x + Math.cos(sp.a) * 0.04 * u, flue.y + 0.02 + 0.16 * u - 0.1 * u * u, flue.z + Math.sin(sp.a) * 0.04 * u);
    }
    const hot = env.robber ? 0.15 : 0.75 + 0.25 * Math.sin(t * 3) * Math.sin(t * 7.3) + puff * 0.5;
    (mouth.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.45 + 0.15 * hot, 0.12);
    mouth.visible = !env.robber;
    mouthHalo.material.opacity = env.robber ? 0 : 0.25 * hot + env.night * 0.7;
    cat.scale.y = 1 + 0.05 * Math.sin(t * 1.6);
  });

  // Brick stacks beside the kiln (fired red, each brick its own instance) and a rack of pale unfired bricks drying.
  {
    const bricks: Inst[] = [];
    const RED = ["#b8452e", "#a83c28", "#c4553a", "#9a3424"].map((c) => new THREE.Color(c));
    const along = { x: -Math.sin(out(kp)), z: Math.cos(out(kp)) };
    for (const [k, rows] of [[1, 5], [-1, 4]] as [number, number][]) {
      const c = { x: kp.x + along.x * 0.2 * k + (-kp.x) * 0.15, z: kp.z + along.z * 0.2 * k + (-kp.z) * 0.15 };
      if (!ok(c.x, c.z, 0.04)) continue;
      const y0 = Y(c.x, c.z);
      const a = Math.atan2(along.z, along.x);
      for (let row = 0; row < rows; row++)
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 2; j++) {
            const turn = row % 2 ? Math.PI / 2 : 0;
            const [u, v] = row % 2 ? [(j - 0.5) * 0.024, (i - 1) * 0.016] : [(i - 1) * 0.016, (j - 0.5) * 0.024];
            const x = c.x + Math.cos(a) * u - Math.sin(a) * v;
            const z = c.z + Math.sin(a) * u + Math.cos(a) * v;
            bricks.push({ m: mat(x, y0 + 0.006 + row * 0.0125, z, 0.015, 0.011, 0.023, -(a + turn)), c: RED[Math.floor(r() * 4)]! });
          }
      stands.push({ x: c.x, z: c.z, r: 0.05 });
    }
    // The drying rack: a plank on two trestles, a row of pale bricks on it and one under it with a hand-print.
    const rk = { x: kp.x + along.x * -0.02 + -kp.x * 0.27, z: kp.z + along.z * -0.02 + -kp.z * 0.27 };
    if (ok(rk.x, rk.z, 0.03)) {
      const y0 = Y(rk.x, rk.z);
      const a = Math.atan2(along.z, along.x);
      const P = (u: number, y: number, v = 0) => new THREE.Vector3(rk.x + Math.cos(a) * u - Math.sin(a) * v, y0 + y, rk.z + Math.sin(a) * u + Math.cos(a) * v);
      const rack: THREE.BufferGeometry[] = [];
      for (const u of [-0.05, 0.05]) for (const v of [-0.01, 0.01]) rack.push(beamGeo(P(u, 0, v), P(u, 0.03, 0), 0.0022, "#7a5434"));
      const plank = part(new THREE.BoxGeometry(1, 1, 1), "#a87c4f", [rk.x, y0 + 0.032, rk.z], [0, -a, 0], [0.13, 0.004, 0.03]);
      rack.push(plank);
      g.add(mesh(merge(rack), cm));
      for (let i = 0; i < 6; i++) {
        const p = P(-0.05 + i * 0.02, 0.0405);
        bricks.push({ m: mat(p.x, p.y, p.z, 0.015, 0.011, 0.023, -a), c: new THREE.Color(i % 2 ? "#e2cdb0" : "#d8c2a2") });
      }
      stands.push({ x: rk.x, z: rk.z, r: 0.07 });
    }
    g.add(instanced(new THREE.BoxGeometry(1, 1, 1), bricks, blobMat()));
  }

  // In the quarry: the headframe over the shaft (two timber A-frames, a crossbeam, a wheel that turns, a rope and a bucket
  // that rises out of the shaft and sinks back), its lantern; a scaffold deck against the back wall with ladders; rubble,
  // crates and barrows on the floor; rough rocks along the rim.
  {
    const [tx, tz] = [-Math.sin(QAX), Math.cos(QAX)];
    const [hx, hz] = [Math.cos(QAX), Math.sin(QAX)];
    const V = (p: Pt, du: number, dv: number, y: number) => new THREE.Vector3(p.x + tx * du + hx * dv, y, p.z + tz * du + hz * dv);
    const sh = M.shaft!;
    const fy = Y(sh.x, sh.z);
    const wood: THREE.BufferGeometry[] = [];
    // The shaft: a dark square mouth with a timber collar.
    wood.push(part(new THREE.BoxGeometry(1, 1, 1), "#1a0e0a", [sh.x, fy + 0.002, sh.z], [0, -QAX, 0], [0.07, 0.004, 0.07]));
    for (const [du, dv, len, along] of [[0, 0.04, 0.09, true], [0, -0.04, 0.09, true], [0.04, 0, 0.09, false], [-0.04, 0, 0.09, false]] as [number, number, number, boolean][]) {
      const c = V(sh, du, dv, fy + 0.007);
      wood.push(part(new THREE.BoxGeometry(1, 1, 1), "#8a5e38", [c.x, c.y, c.z], [0, -QAX + (along ? 0 : Math.PI / 2), 0], [0.012, 0.012, len]));
    }
    // The headframe: two A-frames across the shaft, a crossbeam, braces.
    const H = 0.27;
    const topY = fy + H;
    for (const du of [-0.045, 0.045]) {
      const apex = V(sh, du, 0, topY);
      for (const dv of [-0.06, 0.06]) wood.push(beamGeo(V(sh, du, dv, fy), apex, 0.005, "#8a5e38"));
      wood.push(beamGeo(V(sh, du, -0.04, fy + H * 0.33), V(sh, du, 0.04, fy + H * 0.33), 0.0035, "#7a5434"));
    }
    wood.push(beamGeo(V(sh, -0.055, 0, topY), V(sh, 0.055, 0, topY), 0.006, "#7a5434"));
    // The scaffold deck against the back wall: four posts, a plank deck, a rail, a ladder from the floor.
    const dk = M.deck!;
    const dy = Y(dk.x, dk.z);
    const deckY = dy + 0.085;
    for (const du of [-0.06, 0.06]) for (const dv of [-0.03, 0.03]) wood.push(beamGeo(V(dk, du, dv, Y(V(dk, du, dv, 0).x, V(dk, du, dv, 0).z)), V(dk, du, dv, deckY + 0.03), 0.0045, "#8a5e38"));
    for (let i = 0; i < 6; i++) {
      const c = V(dk, -0.055 + i * 0.022, 0, deckY);
      wood.push(part(new THREE.BoxGeometry(1, 1, 1), i % 2 ? "#c49a62" : "#b58a55", [c.x, c.y, c.z], [0, -QAX, 0], [0.075, 0.004, 0.019]));
    }
    wood.push(beamGeo(V(dk, -0.065, -0.032, deckY + 0.03), V(dk, 0.065, -0.032, deckY + 0.03), 0.0025, "#7a5434"));
    const ladder = (foot: THREE.Vector3, top: THREE.Vector3) => {
      const side = new THREE.Vector3(tx, 0, tz).multiplyScalar(0.011);
      wood.push(beamGeo(foot.clone().add(side), top.clone().add(side), 0.0022, "#a07848"));
      wood.push(beamGeo(foot.clone().sub(side), top.clone().sub(side), 0.0022, "#a07848"));
      for (let k = 1; k < 7; k++) {
        const p = foot.clone().lerp(top, k / 7);
        wood.push(beamGeo(p.clone().add(side), p.clone().sub(side), 0.0016, "#a07848"));
      }
    };
    ladder(V(dk, 0.03, -0.075, dy), V(dk, 0.03, -0.035, deckY + 0.004));
    // A second ladder from the bench up over the rim, at the quarry's other end.
    const rimA = V(M.quarry!, -(L.marks.side!.x) * 0.33, -0.12, 0);
    rimA.y = Y(rimA.x, rimA.z);
    const rimB = V(M.quarry!, -(L.marks.side!.x) * 0.33, -0.2, 0);
    rimB.y = Y(rimB.x, rimB.z) + 0.01;
    ladder(rimA, rimB);
    g.add(mesh(merge(wood), cm));
    stands.push({ x: sh.x, z: sh.z, r: 0.08 }, { x: dk.x, z: dk.z, r: 0.08 });

    // The wheel, the rope and the bucket; the lantern on the crossbeam.
    const wheel = new THREE.Group();
    wheel.add(mesh(merge([part(new THREE.TorusGeometry(0.026, 0.004, 6, 18), "#6a4a32", [0, 0, 0]), ...[0, 1, 2, 3].map((k) => part(new THREE.BoxGeometry(1, 1, 1), "#6a4a32", [0, 0, 0], [0, 0, (k * Math.PI) / 4], [0.05, 0.003, 0.003]))]), cm));
    wheel.position.copy(V(sh, 0, 0, topY + 0.004));
    wheel.rotation.y = -QAX + Math.PI / 2;
    g.add(wheel);
    const rope = new THREE.Mesh(cyl(1, 1, 5).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: "#d9c79a", roughness: 0.9 }));
    const ropeTop = V(sh, 0, 0.026, topY);
    rope.position.copy(ropeTop);
    rope.scale.set(0.0016, 0.1, 0.0016);
    g.add(rope);
    const bucket = new THREE.Group();
    bucket.add(mesh(merge([part(cyl(1, 0.8, 12), "#8a5e38", [0, 0, 0], [0, 0, 0], [0.014, 0.02, 0.014]), part(cyl(1, 1, 12), "#4a4a4a", [0, 0.006, 0], [0, 0, 0], [0.0145, 0.003, 0.0145])]), cm));
    const load = mesh(merge([part(blobGeo(330), "#c4562e", [0, 0.011, 0], [0, 0, 0], [0.012, 0.007, 0.012])]), cm);
    bucket.add(load);
    g.add(bucket);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), basic("#ffd27a", 0));
    lantern.position.copy(V(sh, 0.05, -0.01, topY - 0.025));
    g.add(lantern);
    const lanternHalo = halo("#ffbf6a", 0.14);
    lanternHalo.position.copy(lantern.position);
    g.add(lanternHalo);
    const low = fy - 0.03;
    const high = topY - 0.05;
    let spin = 0;
    let last = 0;
    life.push((t) => {
      const c = (t % 7) / 7;
      let y = c < 0.4 ? low + (high - low) * ease(c / 0.4) : c < 0.55 ? high : c < 0.95 ? high + (low - high) * ease((c - 0.55) / 0.4) : low;
      let full = c < 0.55;
      if (env.roll >= 0) (y = low + (high - low) * ease(Math.min(1, env.roll * 1.6))), (full = true);
      spin += (y - last) * 40;
      last = y;
      wheel.rotation.z = spin;
      bucket.position.set(ropeTop.x, y, ropeTop.z);
      bucket.visible = y > fy - 0.012;
      load.visible = full;
      rope.scale.y = Math.max(0.001, ropeTop.y - y - 0.01);
      (lantern.material as THREE.MeshBasicMaterial).opacity = env.night;
      lanternHalo.material.opacity = env.night * 0.85;
    });

    // Rubble, crates and a barrow on the quarry floor; rough rocks along the rim, biggest at the back.
    const rocks: Inst[] = [];
    const ROCK = ["#b4552f", "#9a4426", "#c86a3e", "#8a3a22"].map((c) => new THREE.Color(c));
    for (let i = 0; i < 900 && rocks.length < 70; i++) {
      const a = r() * Math.PI * 2;
      const rim = i % 3 !== 0;
      const dd = rim ? 1.0 + r() * 0.16 : 0.15 + r() * 0.7;
      const p = V(M.quarry!, Math.cos(a) * QA * dd, Math.sin(a) * QB * dd, 0);
      const Qp = quarryAt(L, p.x, p.z);
      if (rim && (Qp.d < 0.95 || Qp.v < -0.08)) continue;
      if (!rim && (Qp.d > 0.9 || Math.hypot(p.x - pit.x, p.z - pit.z) < pit.r * 1.3 || stands.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r))) continue;
      if (hexDist(p.x, p.z) > INR - 0.07 || Math.hypot(p.x, p.z) < 0.4) continue;
      const k = rim ? 0.022 + r() * 0.03 * (0.5 + smooth(-0.1, 0.25, Qp.v)) : 0.008 + r() * 0.01;
      rocks.push({ m: mat(p.x, Y(p.x, p.z) + k * 0.25, p.z, k * 1.2, k * 0.8, k, r() * 6, (r() - 0.5) * 0.4), c: ROCK[Math.floor(r() * 4)]! });
    }
    g.add(instanced(new THREE.DodecahedronGeometry(1, 0), rocks, jellyfy(new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), "jelly-rock")));
    const crates: THREE.BufferGeometry[] = [];
    for (const [du, dv, k] of [[0.08, -0.08, 0.018], [0.1, -0.06, 0.014], [-0.24, 0.02, 0.016]] as [number, number, number][]) {
      const p = V(M.quarry!, du * L.marks.side!.x, dv, 0);
      if (Math.hypot(p.x - pit.x, p.z - pit.z) < pit.r * 1.2) continue;
      crates.push(part(new THREE.BoxGeometry(1, 1, 1), "#9a7048", [p.x, Y(p.x, p.z) + k / 2, p.z], [0, du * 20, 0], [k, k, k]));
      crates.push(part(new THREE.BoxGeometry(1, 1, 1), "#7a5434", [p.x, Y(p.x, p.z) + k / 2, p.z], [0, du * 20, 0], [k * 1.02, k * 0.2, k * 1.02]));
    }
    if (crates.length) g.add(mesh(merge(crates), cm));

    // A plank ramp up the back wall from the floor to the rim; rails across the floor from the shaft to its foot with an ore
    // cart that rolls between them.
    const side = L.marks.side!.x;
    const extra: THREE.BufferGeometry[] = [];
    const rA = V(M.quarry!, side * 0.14, 0.12, 0);
    rA.y = Y(rA.x, rA.z) + 0.004;
    const rB = V(M.quarry!, side * 0.5, 0.2, 0);
    rB.y = Y(rB.x, rB.z) + 0.006;
    const dir = rB.clone().sub(rA);
    const acr = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.022);
    extra.push(beamGeo(rA.clone().add(acr), rB.clone().add(acr), 0.003, "#7a5434"), beamGeo(rA.clone().sub(acr), rB.clone().sub(acr), 0.003, "#7a5434"));
    for (let k = 0; k <= 12; k++) {
      const p = rA.clone().lerp(rB, k / 12).add(new THREE.Vector3(0, 0.003, 0));
      extra.push(beamGeo(p.clone().add(acr.clone().multiplyScalar(1.15)), p.clone().sub(acr.clone().multiplyScalar(1.15)), 0.0035, k % 2 ? "#c49a62" : "#b58a55"));
    }
    for (const k of [0.33, 0.66]) {
      const p = rA.clone().lerp(rB, k);
      const foot = new THREE.Vector3(p.x, Y(p.x, p.z), p.z);
      if (p.y - foot.y > 0.01) extra.push(beamGeo(foot, p, 0.0025, "#7a5434"));
    }
    const c0 = V(M.quarry!, -side * 0.12, 0.05, 0);
    const c1 = V(M.quarry!, side * 0.1, 0.05, 0);
    const railAcross = new THREE.Vector3(Math.cos(QAX), 0, Math.sin(QAX)).multiplyScalar(0.009);
    for (const sgn of [1, -1]) {
      const a = c0.clone().addScaledVector(railAcross, sgn);
      const b = c1.clone().addScaledVector(railAcross, sgn);
      a.y = Y(a.x, a.z) + 0.003;
      b.y = Y(b.x, b.z) + 0.003;
      extra.push(beamGeo(a, b, 0.0012, "#5a5a62"));
    }
    for (let k = 0; k <= 8; k++) {
      const p = c0.clone().lerp(c1, k / 8);
      p.y = Y(p.x, p.z) + 0.0015;
      extra.push(part(new THREE.BoxGeometry(1, 1, 1), "#6a4a32", [p.x, p.y, p.z], [0, -QAX, 0], [0.026, 0.002, 0.005]));
    }
    g.add(mesh(merge(extra), cm));
    const cart = new THREE.Group();
    cart.add(
      mesh(
        merge([
          part(new THREE.BoxGeometry(1, 1, 1), "#6a6a72", [0, 0.016, 0], [0, 0, 0], [0.034, 0.016, 0.024]),
          part(blobGeo(420), "#c4562e", [0, 0.026, 0], [0, 0, 0], [0.015, 0.008, 0.011]),
          ...[-0.011, 0.011].flatMap((x) => [-0.009, 0.009].map((z) => part(cyl(1, 1, 10), "#2a2a30", [x, 0.006, z], [Math.PI / 2, 0, 0], [0.006, 0.003, 0.006]))),
        ]),
        cm,
      ),
    );
    g.add(cart);
    life.push((t) => {
      const u = 0.5 - 0.5 * Math.cos(t * 0.5);
      const p = c0.clone().lerp(c1, u);
      cart.position.set(p.x, Y(p.x, p.z), p.z);
      cart.rotation.y = -Math.atan2(c1.z - c0.z, c1.x - c0.x);
    });
  }

  // Two villagers carry clay in hods from the quarry's rim to the kiln and walk back for more.
  {
    const side = L.marks.side!.x;
    const [tx, tz] = [-Math.sin(QAX), Math.cos(QAX)];
    const qa = { x: M.quarry!.x - tx * side * 0.45 - Math.cos(QAX) * 0.12, z: M.quarry!.z - tz * side * 0.45 - Math.sin(QAX) * 0.12 };
    const kb = { x: kp.x * 0.78, z: kp.z * 0.78 };
    // Bend the walk outward round the token's pad.
    const midA = Math.atan2((qa.z + kb.z) / 2, (qa.x + kb.x) / 2);
    const mid = { x: Math.cos(midA) * 0.62, z: Math.sin(midA) * 0.62 };
    const at2 = (u: number) => {
      const a = (1 - u) * (1 - u);
      const b = 2 * u * (1 - u);
      const c = u * u;
      return { x: qa.x * a + mid.x * b + kb.x * c, z: qa.z * a + mid.z * b + kb.z * c };
    };
    const walkers = [0, 1].map((i) => {
      const p = person(cm, i ? "#5a7fb0" : "#c48a3a", 0.08, i ? "#e8c56a" : "#6a4a32");
      const hod = mesh(merge([part(new THREE.BoxGeometry(1, 1, 1), "#9a7048", [0, 0, 0], [0, 0, 0], [0.016, 0.012, 0.022]), part(blobGeo(390 + i), "#c4562e", [0, 0.008, 0], [0, 0, 0], [0.012, 0.006, 0.016])]), cm);
      hod.position.set(-0.004, 0.06, 0.012);
      p.top.add(hod);
      g.add(p.g);
      return { p, hod, ph: i * 0.5 };
    });
    life.push((t) => {
      const speed = env.roll >= 0 ? 2.2 : 1;
      for (const w of walkers) {
        const c = ((t * 0.07 * speed + w.ph) % 1) * 2;
        const going = c < 1;
        const u = going ? c : 2 - c;
        const p = at2(u);
        const q = at2(Math.min(1, Math.max(0, u + (going ? 0.01 : -0.01))));
        w.p.g.position.set(p.x, Y(p.x, p.z) + Math.abs(Math.sin(t * 9 * speed + w.ph * 3)) * 0.004, p.z);
        w.p.g.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
        w.hod.visible = going;
        w.p.top.rotation.x = 0.05 * Math.sin(t * 9 * speed);
      }
    });
  }

  // The potter's cottage beside the kiln: cream walls, a terracotta tiled roof, green shutters, a bench; and a row of
  // amphorae drying in the sun.
  {
    const along = { x: -Math.sin(out(kp)), z: Math.cos(out(kp)) };
    const side = L.marks.side!.x;
    const cp = { x: kp.x + along.x * 0.27 * side + kp.x * 0.05, z: kp.z + along.z * 0.27 * side + kp.z * 0.05 };
    if (ok(cp.x, cp.z, 0.06)) {
      const house = new THREE.Group();
      const sh = new THREE.Shape();
      sh.moveTo(-0.045, 0);
      sh.lineTo(0.045, 0);
      sh.lineTo(0, 0.026);
      sh.closePath();
      const roof = new THREE.ExtrudeGeometry(sh, { depth: 0.074, bevelEnabled: false }).translate(0, 0, -0.037).rotateY(Math.PI / 2);
      const parts = [
        part(new THREE.BoxGeometry(1, 1, 1), "#b8513a", [0, 0.025, 0], [0, 0, 0], [0.064, 0.05, 0.08]),
        // Mortar courses round the brick walls.
        ...[0.008, 0.016, 0.024, 0.032, 0.04].map((y) => part(new THREE.BoxGeometry(1, 1, 1), "#e8d2b8", [0, y, 0], [0, 0, 0], [0.0645, 0.0012, 0.0805])),
        part(new THREE.BoxGeometry(1, 1, 1), "#f3e7cf", [0, 0.002, 0], [0, 0, 0], [0.068, 0.004, 0.084]),
        part(roof, "#5a5058", [0, 0.05, 0], [0, 0, 0], [1.1, 1, 1.1]),
        part(new THREE.BoxGeometry(1, 1, 1), "#6a4a32", [0.0325, 0.016, 0.012], [0, 0, 0], [0.002, 0.03, 0.014]),
        part(new THREE.BoxGeometry(1, 1, 1), "#4f8a5a", [0.0325, 0.032, -0.018], [0, 0, 0], [0.002, 0.014, 0.016]),
        part(new THREE.BoxGeometry(1, 1, 1), "#8a6440", [0.045, 0.008, -0.018], [0, 0, 0], [0.01, 0.003, 0.024]),
      ];
      // Roof tile ridges.
      for (let i = -3; i <= 3; i++) parts.push(part(cyl(1, 1, 6), "#4a424a", [0, 0.06, i * 0.011], [0, 0, Math.PI / 2], [0.003, 0.098, 0.003]));
      house.add(mesh(merge(parts), cm));
      house.scale.setScalar(SIZE.house);
      house.position.set(cp.x, Y(cp.x, cp.z), cp.z);
      house.rotation.y = -Math.atan2(-cp.z + EYE.z * 0.4, -cp.x + EYE.x * 0.4);
      house.userData.ref = "cottage";
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.012).rotateY(Math.PI / 2), basic("#ffc46a", 0));
      win.position.set(0.0332, 0.032, -0.018);
      house.add(win);
      const wh = halo("#ffb860", 0.07);
      wh.position.set(0.04, 0.032, -0.018);
      house.add(wh);
      life.push(() => {
        (win.material as THREE.MeshBasicMaterial).opacity = env.night;
        wh.material.opacity = env.night * 0.75;
      });
      g.add(house);
      stands.push({ x: cp.x, z: cp.z, r: 0.14 });
    }
    // Amphorae: a lathe pot with two handles, terracotta and cream, standing in a row toward the clearing.
    const pot = (hex: string) => {
      const pts = [[0, 0], [0.008, 0], [0.013, 0.01], [0.015, 0.022], [0.011, 0.034], [0.005, 0.04], [0.005, 0.046], [0.007, 0.048]].map(([x, y]) => new THREE.Vector2(x, y));
      return merge([
        part(new THREE.LatheGeometry(pts, 12), hex, [0, 0, 0]),
        part(new THREE.TorusGeometry(0.006, 0.0015, 4, 8, Math.PI), hex, [0.008, 0.038, 0], [0, 0, -1.2]),
        part(new THREE.TorusGeometry(0.006, 0.0015, 4, 8, Math.PI), hex, [-0.008, 0.038, 0], [0, Math.PI, -1.2]),
      ]);
    };
    const row = { x: kp.x - kp.x * 0.32 - along.x * 0.14 * side, z: kp.z - kp.z * 0.32 - along.z * 0.14 * side };
    const pots: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const p = { x: row.x + along.x * (i - 1.5) * 0.04, z: row.z + along.z * (i - 1.5) * 0.04 };
      if (!ok(p.x, p.z, 0.015)) continue;
      const g2 = pot(i % 2 ? "#e9d3ae" : "#c96a3e");
      g2.scale(SIZE.person, SIZE.person, SIZE.person);
      g2.translate(p.x, Y(p.x, p.z), p.z);
      pots.push(g2);
      stands.push({ x: p.x, z: p.z, r: 0.02 });
    }
    if (pots.length) g.add(mesh(merge(pots), cm));
  }

  // The brickworks chimney: a tall square brick stack beside the kiln, tapering, banded near the top, smoke drifting off it.
  {
    const along = { x: -Math.sin(out(kp)), z: Math.cos(out(kp)) };
    const side = L.marks.side!.x;
    const cp = { x: kp.x - along.x * 0.2 * side + kp.x * 0.08, z: kp.z - along.z * 0.2 * side + kp.z * 0.08 };
    if (Math.hypot(cp.x, cp.z) > 0.45 && nearestCorner(cp.x, cp.z) > 0.22 && hexDist(cp.x, cp.z) < INR - 0.16) {
      const y = Y(cp.x, cp.z);
      const H = 0.44;
      const parts: THREE.BufferGeometry[] = [part(new THREE.BoxGeometry(1, 1, 1), "#9a3f2a", [cp.x, y + 0.012, cp.z], [0, 0, 0], [0.07, 0.024, 0.07])];
      const stack = new THREE.CylinderGeometry(0.019, 0.028, H, 4, 1).rotateY(Math.PI / 4);
      parts.push(part(stack, "#b4492f", [cp.x, y + 0.024 + H / 2, cp.z]));
      for (let i = 1; i < 12; i++) {
        const f = i / 12;
        const w = (0.028 - 0.009 * f) * Math.SQRT2 + 0.0005;
        parts.push(part(new THREE.CylinderGeometry(w / Math.SQRT2, w / Math.SQRT2, 0.0015, 4).rotateY(Math.PI / 4), "#e2c7a8", [cp.x, y + 0.024 + H * f, cp.z]));
      }
      parts.push(part(new THREE.CylinderGeometry(0.026, 0.024, 0.024, 4).rotateY(Math.PI / 4), "#8a3424", [cp.x, y + 0.024 + H - 0.01, cp.z]));
      parts.push(part(new THREE.CylinderGeometry(0.017, 0.017, 0.004, 4).rotateY(Math.PI / 4), "#1a0e0a", [cp.x, y + 0.024 + H + 0.003, cp.z]));
      const ch = mesh(merge(parts), cm);
      ch.userData.ref = "chimney";
      g.add(ch);
      stands.push({ x: cp.x, z: cp.z, r: 0.06 });
      const top = new THREE.Vector3(cp.x, y + 0.03 + H, cp.z);
      const puffs = Array.from({ length: 6 }, (_, i) => {
        const o = new THREE.Mesh(blobGeo(400 + i), new THREE.MeshStandardMaterial({ color: "#e9e3da", roughness: 1, transparent: true, opacity: 0.4, depthWrite: false }));
        o.userData.loose = true;
        g.add(o);
        return { o, ph: i / 6 };
      });
      life.push((t) => {
        const big = env.roll >= 0 ? Math.sin(env.roll * Math.PI) : 0;
        for (const p of puffs) {
          const u = (t * 0.09 + p.ph) % 1;
          p.o.visible = !env.robber;
          p.o.position.set(top.x + u * 0.12, top.y + u * 0.18, top.z - u * 0.05);
          p.o.scale.setScalar((0.012 + u * 0.03) * (1 + big));
          (p.o.material as THREE.MeshStandardMaterial).opacity = (0.35 + big * 0.25) * Math.sin(Math.PI * u);
        }
      });
    }
  }

  // The drying yard: long rows ("hacks") of green bricks stacked in open lattice courses, each under a little plank roof on
  // posts, on the back flank across from the kiln; a few pallets of finished red bricks stacked high by the kiln.
  {
    const side = L.marks.side!.x;
    const centre = at(L.hillAt - side * 0.45, 0.6);
    const a = Math.atan2(centre.z, centre.x) + Math.PI / 2;
    const [ax, az] = [Math.cos(a), Math.sin(a)];
    const [rx, rz] = [Math.cos(a - Math.PI / 2), Math.sin(a - Math.PI / 2)];
    const bricks: Inst[] = [];
    const roofs: THREE.BufferGeometry[] = [];
    const GREEN = ["#d9b48a", "#cfa67c", "#e2bf98"].map((c) => new THREE.Color(c));
    for (let row = -1; row <= 1; row++) {
      const rc = { x: centre.x + rx * row * 0.075, z: centre.z + rz * row * 0.075 };
      for (let i = -4; i <= 4; i++) {
        const p = { x: rc.x + ax * i * 0.026, z: rc.z + az * i * 0.026 };
        if (Math.hypot(p.x, p.z) < 0.42 || nearestCorner(p.x, p.z) < 0.2 || hexDist(p.x, p.z) > INR - 0.12) continue;
        const y0 = Y(p.x, p.z);
        // Six courses, each turned a quarter from the last, bricks set apart so air can pass.
        for (let c = 0; c < 6; c++) {
          const turn = c % 2 ? Math.PI / 2 : 0;
          for (const o of [-0.007, 0.007]) {
            const [ox, oz] = c % 2 ? [ax * o, az * o] : [rx * o, rz * o];
            bricks.push({ m: mat(p.x + ox, y0 + 0.005 + c * 0.0105, p.z + oz, 0.022, 0.0095, 0.009, -(a + turn)), c: GREEN[(((i + c + row) % 3) + 3) % 3]! });
          }
        }
        stands.push({ x: p.x, z: p.z, r: 0.016 });
      }
      // The hack's roof: a shallow plank cover on posts at each end.
      const ends = [-4.6, 4.6].map((i) => ({ x: rc.x + ax * i * 0.026, z: rc.z + az * i * 0.026 }));
      if (ends.every((e) => hexDist(e.x, e.z) < INR - 0.1 && Math.hypot(e.x, e.z) > 0.4)) {
        const yr = Math.max(...ends.map((e) => Y(e.x, e.z))) + 0.078;
        for (const e of ends) roofs.push(beamGeo(new THREE.Vector3(e.x, Y(e.x, e.z), e.z), new THREE.Vector3(e.x, yr, e.z), 0.003, "#7a5434"));
        roofs.push(part(new THREE.BoxGeometry(1, 1, 1), "#9a7048", [rc.x, yr + 0.003, rc.z], [0, -a, 0.12 * row], [0.26, 0.004, 0.05]));
      }
    }
    // Pallets of finished bricks by the kiln, stacked high.
    const RED = ["#b8452e", "#a83c28", "#c4553a"].map((c) => new THREE.Color(c));
    const along = { x: -Math.sin(out(kp)), z: Math.cos(out(kp)) };
    for (const k of [0.32, 0.4]) {
      const c = { x: kp.x * 0.72 + along.x * k * side, z: kp.z * 0.72 + along.z * k * side };
      if (Math.hypot(c.x, c.z) < 0.42 || hexDist(c.x, c.z) > INR - 0.12 || stands.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < q.r + 0.02)) continue;
      const y0 = Y(c.x, c.z);
      const pa = Math.atan2(along.z, along.x);
      roofs.push(part(new THREE.BoxGeometry(1, 1, 1), "#a87c4f", [c.x, y0 + 0.004, c.z], [0, -pa, 0], [0.06, 0.008, 0.05]));
      for (let row = 0; row < 7; row++)
        for (let i = -1; i <= 1; i++)
          for (let j = -1; j <= 1; j++) {
            const [u, v] = [i * 0.019, j * 0.015];
            bricks.push({ m: mat(c.x + Math.cos(pa) * u - Math.sin(pa) * v, y0 + 0.013 + row * 0.0105, c.z + Math.sin(pa) * u + Math.cos(pa) * v, 0.018, 0.0095, 0.014, -pa), c: RED[(i + j + row + 3) % 3]! });
          }
      stands.push({ x: c.x, z: c.z, r: 0.04 });
    }
    g.add(instanced(new THREE.BoxGeometry(1, 1, 1), bricks, blobMat()));
    if (roofs.length) g.add(mesh(merge(roofs), cm));
  }

  // The pug mill, where the clay is mixed: a wooden tub with a post and a sweep arm, a donkey walking it round in a worn ring.
  {
    const mp = M.mill!;
    if (nearestCorner(mp.x, mp.z) > 0.25 && hexDist(mp.x, mp.z) < INR - 0.18) {
      const y = Y(mp.x, mp.z);
      const tub = mesh(
        merge([
          part(cyl(1, 0.9, 16), "#8a5e38", [0, 0.02, 0], [0, 0, 0], [0.032, 0.04, 0.032]),
          part(cyl(1, 1, 16), "#4a4a4a", [0, 0.032, 0], [0, 0, 0], [0.0325, 0.003, 0.0325]),
          part(cyl(1, 1, 16), "#4a4a4a", [0, 0.01, 0], [0, 0, 0], [0.031, 0.003, 0.031]),
          part(blobGeo(430), "#c4562e", [0, 0.041, 0], [0, 0, 0], [0.026, 0.005, 0.026]),
          part(cyl(1, 1, 8), "#7a5434", [0, 0.06, 0], [0, 0, 0], [0.005, 0.05, 0.005]),
        ]),
        cm,
      );
      tub.position.set(mp.x, y, mp.z);
      g.add(tub);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.125, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#c46a40", roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }));
      ring.position.set(mp.x, y + 0.0015, mp.z);
      ring.receiveShadow = true;
      g.add(ring);
      const arm = new THREE.Group();
      arm.position.set(mp.x, y + 0.075, mp.z);
      arm.add(mesh(merge([part(cyl(1, 1, 6), "#8a5e38", [0.055, 0, 0], [0, 0, Math.PI / 2], [0.0035, 0.11, 0.0035])]), cm));
      g.add(arm);
      const donk = donkey(cm);
      g.add(donk.g);
      stands.push({ x: mp.x, z: mp.z, r: 0.15 });
      life.push((t) => {
        const sp = env.roll >= 0 ? 2 : 1;
        const a = t * 0.45 * sp;
        arm.rotation.y = -a;
        const R2 = 0.107;
        donk.g.position.set(mp.x + Math.cos(a) * R2, y, mp.z + Math.sin(a) * R2);
        donk.g.rotation.y = -(a + Math.PI / 2);
        donk.legs.forEach((l, i) => (l.rotation.z = 0.5 * Math.sin(t * 7 * sp + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0))));
        donk.head.rotation.z = 0.08 * Math.sin(t * 3.5 * sp);
      });
    }
  }

  // Desert plants (Arizona): prickly pear clusters with pink fruit, blue-green agave rosettes.
  {
    const plants: THREE.BufferGeometry[] = [];
    for (let k = 0, tries = 0; k < 9 && tries < 1500; tries++) {
      const a = r() * Math.PI * 2;
      const d = 0.45 + r() * 0.42;
      const p = { x: Math.cos(a) * d, z: Math.sin(a) * d };
      if (!ok(p.x, p.z, 0.03) || !clearOf(kp, p.x, p.z) || !clearOf(M.shaft!, p.x, p.z, 0.2)) continue;
      const y = Y(p.x, p.z);
      if (k % 2 === 0) {
        // Prickly pear: paddles on paddles.
        const pads: [number, number, number, number][] = [[0, 0.02, 0, 0], [0.012, 0.042, 0.004, 0.5], [-0.012, 0.04, -0.003, -0.5], [0.004, 0.06, 0, 0.2], [0.02, 0.022, -0.012, 0.9]];
        const turn = r() * Math.PI;
        for (const [px, py, pz, tilt] of pads) {
          const [cx, cz] = [px * Math.cos(turn) - pz * Math.sin(turn), px * Math.sin(turn) + pz * Math.cos(turn)];
          plants.push(part(sphere(10), "#6a9a4a", [p.x + cx, y + py, p.z + cz], [0, turn, tilt], [0.016, 0.02, 0.005]));
          if (py > 0.035) plants.push(part(sphere(6), "#e0457a", [p.x + cx, y + py + 0.019, p.z + cz], [0, 0, 0], [0.0035, 0.004, 0.0035]));
        }
        stands.push({ x: p.x, z: p.z, r: 0.03 });
      } else {
        // Agave: a rosette of stiff blue-green leaves.
        for (let i = 0; i < 11; i++) {
          const b = (i / 11) * Math.PI * 2;
          const up = i % 2 ? 0.5 : 0.9;
          plants.push(part(new THREE.ConeGeometry(1, 1, 4), i % 3 ? "#6f9a8a" : "#86ae9c", [p.x + Math.cos(b) * 0.01, y + 0.014, p.z + Math.sin(b) * 0.01], [Math.sin(b) * up, 0, -Math.cos(b) * up], [0.005, 0.032, 0.003]));
        }
        stands.push({ x: p.x, z: p.z, r: 0.03 });
      }
      k++;
    }
    g.add(mesh(merge(plants), cm));
  }

  // The rattlesnake, coiled on a warm flat rock, head raised, tail rattling now and then.
  {
    for (let tries = 0; tries < 400; tries++) {
      const a = r() * Math.PI * 2;
      const d = 0.45 + r() * 0.35;
      const p = { x: Math.cos(a) * d, z: Math.sin(a) * d };
      if (!ok(p.x, p.z, 0.04)) continue;
      const y = Y(p.x, p.z);
      const snake = new THREE.Group();
      const body: THREE.BufferGeometry[] = [part(new THREE.DodecahedronGeometry(1, 0), "#c9a27a", [0, 0.006, 0], [0, 0.4, 0], [0.04, 0.012, 0.034])];
      const N = 46;
      for (let i = 0; i < N; i++) {
        const f = i / N;
        const ang = f * Math.PI * 2 * 2.3;
        const rad = 0.022 - f * 0.016;
        const dark = i % 4 === 0;
        body.push(part(sphere(8), dark ? "#6a4a2a" : "#b89a62", [Math.cos(ang) * rad, 0.016 + (1 - f) * 0.0, Math.sin(ang) * rad], [0, 0, 0], [0.0052 - f * 0.0016, 0.0042, 0.0052 - f * 0.0016]));
      }
      // The neck rising from the coil's middle, the head.
      for (let i = 0; i < 6; i++) body.push(part(sphere(8), i % 3 ? "#b89a62" : "#6a4a2a", [0.002 + i * 0.002, 0.02 + i * 0.004, 0], [0, 0, 0], [0.004, 0.004, 0.004]));
      body.push(part(sphere(8), "#8a6a3a", [0.016, 0.044, 0], [0, 0, -0.2], [0.008, 0.0045, 0.0055]));
      body.push(part(sphere(6), "#1a1414", [0.019, 0.047, 0.004], [0, 0, 0], [0.0012, 0.0012, 0.0012]));
      body.push(part(sphere(6), "#1a1414", [0.019, 0.047, -0.004], [0, 0, 0], [0.0012, 0.0012, 0.0012]));
      snake.add(mesh(merge(body), cm));
      const rattle = new THREE.Group();
      rattle.position.set(0.022, 0.016, 0);
      rattle.add(mesh(merge([0, 1, 2, 3].map((i) => part(sphere(6), "#e8d6a8", [0, 0.003 + i * 0.0035, 0], [0, 0, 0], [0.003 - i * 0.0004, 0.002, 0.003 - i * 0.0004]))), cm));
      snake.add(rattle);
      snake.scale.setScalar(SIZE.small * 1.2);
      snake.position.set(p.x, y, p.z);
      snake.rotation.y = -Math.atan2(EYE.z, EYE.x) + 1.4;
      snake.userData.ref = "rattlesnake";
      g.add(snake);
      stands.push({ x: p.x, z: p.z, r: 0.05 });
      life.push((t) => {
        const shake = env.roll >= 0 || (t % 5) < 0.9 ? 1 : 0;
        rattle.rotation.x = shake * 0.4 * Math.sin(t * 60);
      });
      break;
    }
  }

  // Coyotes: one asleep, curled in the cottage's shade; one trotting a slow loop across the back.
  {
    for (let tries = 0; tries < 400; tries++) {
      const a = Math.atan2(kp.z, kp.x) + (r() - 0.5) * 1.2;
      const d = 0.5 + r() * 0.35;
      const p = { x: Math.cos(a) * d, z: Math.sin(a) * d };
      if (!ok(p.x, p.z, 0.03)) continue;
      const c = coyote(cm, true);
      c.g.position.set(p.x, Y(p.x, p.z), p.z);
      c.g.rotation.y = r() * 6;
      g.add(c.g);
      stands.push({ x: p.x, z: p.z, r: 0.05 });
      life.push((t) => (c.g.scale.y = c.base * (1 + 0.04 * Math.sin(t * 1.5))));
      break;
    }
    const walker = coyote(cm, false);
    g.add(walker.g);
    const centre = at(L.hillAt - L.marks.side!.x * 1.25, 0.6);
    life.push((t) => {
      const a = t * 0.22;
      let [x, z] = [centre.x + Math.cos(a) * 0.17, centre.z + Math.sin(a) * 0.11];
      const k = Math.min(1, (INR - 0.14) / Math.max(1e-6, hexDist(x, z)));
      [x, z] = [x * k, z * k];
      const rr = Math.hypot(x, z);
      if (rr < 0.42) [x, z] = [(x / rr) * 0.42, (z / rr) * 0.42];
      walker.g.position.set(x, Y(x, z), z);
      walker.g.rotation.y = -(a + Math.PI / 2);
      walker.legs!.forEach((l, i) => (l.rotation.z = 0.55 * Math.sin(t * 8 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0))));
    });
  }

  // An old wagon wheel leaning against the kiln yard's wall.
  {
    for (let tries = 0; tries < 300; tries++) {
      const a = Math.atan2(kp.z, kp.x) + (r() - 0.5) * 0.9;
      const p = { x: Math.cos(a) * (0.42 + r() * 0.15), z: Math.sin(a) * (0.42 + r() * 0.15) };
      if (!ok(p.x, p.z, 0.02)) continue;
      const w = mesh(
        merge([
          part(new THREE.TorusGeometry(0.026, 0.003, 6, 20), "#7a5434", [0, 0, 0]),
          part(new THREE.TorusGeometry(0.026, 0.0012, 4, 20), "#5a5a62", [0, 0, 0.002]),
          part(cyl(1, 1, 8), "#6a4a32", [0, 0, 0], [Math.PI / 2, 0, 0], [0.006, 0.008, 0.006]),
          ...[0, 1, 2, 3, 4, 5].map((k) => part(new THREE.BoxGeometry(1, 1, 1), "#8a6440", [0, 0, 0], [0, 0, (k * Math.PI) / 6], [0.05, 0.0025, 0.0025])),
        ]),
        cm,
      );
      w.position.set(p.x, Y(p.x, p.z) + 0.024, p.z);
      w.rotation.set(0.35, -Math.atan2(EYE.z, EYE.x) + Math.PI / 2, 0, "YXZ");
      g.add(w);
      stands.push({ x: p.x, z: p.z, r: 0.03 });
      break;
    }
  }

  // Sun-cracked ground: dried mud plates on the flats and the quarry floor, their cracks thin dark slivers along the edges of a
  // jittered cell pattern, in patches.
  {
    const CELL = 0.05;
    const seeds: Pt[] = [];
    for (let i = -26; i <= 26; i++)
      for (let j = -26; j <= 26; j++) {
        const x = (i + 0.5 + hash2(i, j, L.seed + 50) * 0.42) * CELL;
        const z = (j + 0.5 + hash2(i, j, L.seed + 51) * 0.42) * CELL;
        if (hexDist(x, z) < INR - 0.05) seeds.push({ x, z });
      }
    const cracks: Inst[] = [];
    const DARK = new THREE.Color("#a8482a");
    for (let i = 0; i < seeds.length; i++)
      for (let j = i + 1; j < seeds.length; j++) {
        const [a, b] = [seeds[i]!, seeds[j]!];
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d > CELL * 1.5) continue;
        const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        const h = ground(m.x, m.z);
        const flat = Math.abs(h) < 0.02 || h < -Q_D + 0.03;
        if (!flat || Math.hypot(m.x, m.z) < 0.37 || hexDist(m.x, m.z) > INR - 0.07 || noise(m.x * 3.2, m.z * 3.2, L.seed + 60) < 0.3) continue;
        if (stands.some((q) => Math.hypot(q.x - m.x, q.z - m.z) < q.r + 0.005) || Math.hypot(m.x - pit.x, m.z - pit.z) < pit.r * 1.1) continue;
        const ang = Math.atan2(b.z - a.z, b.x - a.x) + Math.PI / 2;
        cracks.push({ m: mat(m.x, Y(m.x, m.z) + 0.0008, m.z, d * 0.62, 0.0012, 0.0024, -ang), c: DARK });
      }
    if (cracks.length) g.add(instanced(new THREE.BoxGeometry(1, 1, 1), cracks, blobMat()));
  }

  // Nest holes in the mesa's cliffs that face the eye, and the martins flitting in and out.
  {
    const holes: Inst[] = [];
    const nests: THREE.Vector3[] = [];
    const m = L.marks.quarry!;
    const e = 0.01;
    for (let i = 0; i < 900 && holes.length < 12; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * QA;
      const [x, z] = [m.x + Math.cos(a) * d, m.z + Math.sin(a) * d];
      if (hexDist(x, z) > INR - 0.16) continue;
      const gx = (ground(x + e, z) - ground(x - e, z)) / (2 * e);
      const gz = (ground(x, z + e) - ground(x, z - e)) / (2 * e);
      const toward = -(gx * EYE.x + gz * EYE.z);
      if (toward < 1.4 || ground(x, z) > -0.02) continue;
      if (nests.some((q) => Math.hypot(q.x - x, q.z - z) < 0.035)) continue;
      const n = new THREE.Vector3(-gx, 1, -gz).normalize();
      const at = new THREE.Vector3(x, Y(x, z), z).addScaledVector(n, 0.002);
      nests.push(at);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      holes.push({ m: new THREE.Matrix4().compose(at, q, new THREE.Vector3(0.007, 0.002, 0.005)), c: new THREE.Color("#3a1a10") });
    }
    if (holes.length) g.add(instanced(sphere(10), holes, blobMat()));
    const birds = Array.from({ length: Math.min(5, nests.length) }, (_, i) => {
      const b = martin(cm);
      g.add(b.g);
      return { ...b, home: nests[i]!, ph: i * 1.37 };
    });
    life.push((t) => {
      for (const b of birds) {
        b.g.visible = !env.robber;
        // A darting loop out from its hole and back; on a roll they all burst out wide.
        const burst = env.roll >= 0 ? Math.sin(env.roll * Math.PI) : 0;
        const u = (t * 0.4 + b.ph) % 1;
        const out2 = Math.sin(u * Math.PI);
        const a = u * Math.PI * 2 + b.ph;
        const R2 = (0.06 + 0.12 * burst) * out2;
        const x = b.home.x + EYE.x * R2 * 1.2 + Math.cos(a) * R2;
        const z = b.home.z + EYE.z * R2 * 1.2 + Math.sin(a) * R2;
        b.g.position.set(x, b.home.y + 0.03 * out2 + 0.04 * burst * Math.sin(a * 2), z);
        b.g.rotation.y = -(a + Math.PI / 2);
        b.wings.forEach((w) => (w.w.rotation.x = -w.side * (0.2 + 0.8 * Math.sin(t * 30 + b.ph))));
      }
    });
  }

  // Green scrub, grass tufts and poppies against the orange.
  {
    const dots: Inst[] = [];
    const tufts: Inst[] = [];
    const SCRUB = ["#7d8f4a", "#93a35a", "#6a7a3e"].map((c) => new THREE.Color(c));
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.37 + Math.sqrt(r()) * 0.56;
      const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
      if (hexDist(x, z) > INR - 0.08 || ground(x, z) < -0.005 || stands.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 0.01)) continue;
      const y = Y(x, z);
      if (i % 9 === 0) {
        const k = 0.02 + r() * 0.015;
        tufts.push({ m: mat(x, y + k * 0.5, z, k, k * 0.8, k, r() * 6), c: SCRUB[i % 3]! });
      } else if (i % 5 === 0) dots.push({ m: mat(x, y + 0.006, z, 0.005, 0.004, 0.005), c: new THREE.Color(i % 2 ? "#f2c230" : "#f6efe0") });
      else if (i % 2 === 0) dots.push({ m: mat(x, y + 0.004, z, 0.004, 0.009, 0.004, r() * 6, (r() - 0.5) * 0.5), c: SCRUB[i % 3]! });
    }
    g.add(instanced(blobGeo(360), tufts, blobMat()));
    g.add(instanced(sphere(6), dots, blobMat()));
  }
  return { g, stands, life };
}

// Clay's ground paint: the mesa's terraces banded cream, apricot and rust like a canyon wall; the pit's walls darker and wet.
function clayTint(L: Layout) {
  const BANDS = ["#e89a63", "#f3d4a8", "#c9603a", "#eaa877", "#f6dcb4"].map((c) => new THREE.Color(c));
  const WET = new THREE.Color("#a5482a");
  return (x: number, z: number, y: number, c: THREE.Color) => {
    // The quarry's walls show the layers it cut through, banded by depth; its floor is darker and damp.
    if (y < -0.012) {
      const k = Math.floor(-y / MESA_STEP * 1.6);
      c.lerp(BANDS[k % BANDS.length]!, 0.7).lerp(WET, Math.min(0.45, -y * 2.5));
    } else if (y > 0.03) c.lerp(new THREE.Color("#b4552f"), Math.min(0.6, (y - 0.03) * 6));
  };
}

// --- the tile

export type Tile = {
  group: THREE.Group;
  layout: Layout;
  ground: (x: number, z: number) => number;
  env: Env;
  // Advance the tile's life to time t (seconds).
  update: (t: number) => void;
  // Start the roll payoff at time t0; place or lift the robber at time t; set night (0 to 1).
  roll: (t0: number) => void;
  robber: (on: boolean, t: number) => void;
};

const ROLL_S = 2.4;
export function buildTile(kind: Terrain, seed: number, rings = 64): Tile {
  const L = layoutOf(kind, seed);
  const ground = (x: number, z: number) => heightAt(L, x, z);
  const group = new THREE.Group();
  const r = rng32(seed ^ 0x9e3779b9);
  const env: Env = { night: 0, robber: false, roll: -1 };
  TU = { dull: { value: 0 }, flash: { value: 0 } };
  const tu = TU;
  const props = kind === "timber" ? forest(L, ground, r, env) : kind === "wool" ? pasture(L, ground, r, env) : kind === "grain" ? farm(L, ground, r, env) : kind === "clay" ? brickworks(L, ground, r, env) : null;
  const stands = props?.stands ?? [];
  // Canopy cover and contact: the ground darkens under each stand.
  const occlude = (x: number, z: number) => {
    let o = 0;
    for (const s of stands) {
      const d = Math.hypot(x - s.x, z - s.z) / (s.r * 1.6);
      if (d < 1) o = Math.max(o, (1 - d * d) * 0.8);
    }
    return o;
  };
  const b = block(L, rings, occlude, kind === "grain" ? farmTint(L) : kind === "clay" ? clayTint(L) : undefined);
  group.add(b.top, b.side);
  if (props) group.add(props.g);
  const life = props?.life ?? [];
  let rollAt = -Infinity;
  let stoppedAt = 0;
  return {
    group,
    layout: L,
    env,
    ground: (x, z) => BLOCK_H + ground(x, z),
    roll: (t0) => (rollAt = t0),
    robber: (on, t) => {
      env.robber = on;
      stoppedAt = t;
      tu.dull.value = on ? 1 : 0;
    },
    update: (t) => {
      const u = (t - rollAt) / ROLL_S;
      env.roll = u >= 0 && u <= 1 && !env.robber ? u : -1;
      // The jelly wobble: two damped bounces, squash and stretch, and a warm flash that fades.
      const k = env.roll >= 0 ? Math.sin(env.roll * Math.PI * 4) * (1 - env.roll) ** 1.5 : 0;
      group.scale.set(1 - 0.03 * k, 1 + 0.07 * k, 1 - 0.03 * k);
      tu.flash.value = env.roll >= 0 ? 0.6 * Math.sin(Math.min(1, env.roll * 3) * Math.PI) * (1 - env.roll) : 0;
      const at = env.robber ? stoppedAt : t;
      life.forEach((f) => f(at));
    },
  };
}
