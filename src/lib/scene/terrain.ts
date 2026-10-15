import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { HEX_SIZE } from "@/lib/game/hex";
import type { HexCell, Terrain } from "@/lib/game/types";
import { PAINT, PROP, STRATA } from "@/lib/scene/palette";

// The sculpted tiles (#599, docs/design/terrain.md): a raised slab per hex whose top is a heightfield on a triangular lattice,
// flat where the token and the pieces stand, a rounded lip over a sand beach, and a side cut into sand, soil and rock strata.

const SQ3 = Math.sqrt(3);
// Lattice rings across the top (6 R^2 triangles). The rim: its width and drop (corner-radius units), its segments, how far
// the rounded lip stands out over the strata (the cut-cake overhang) and how far it tucks back under before they start.
const RINGS = 18;
const BEVEL_W = 0.06;
const BEVEL_H = 0.04;
const BEVEL_SEGS = 3;
const OVERHANG = 0.014;
const TUCK = 0.014;
// The side runs a little below the tile's base, so no seam shows through the crystal sea.
const SKIRT = 0.04;
// The beach along the rim dips this far below topOf between the corners and the edge midpoints (where pieces and paths rest).
const SHORE_DIP = 0.016;
// The key lamp's direction (lightRig): a slope that faces it takes the sunlit tint, one that faces away the shade.
const KEY = new THREE.Vector3(8, 16, 6).normalize();

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Distance to the hex's flats in the direction of the farthest one: the flats face +-x and +-60 degrees from it.
export function hexDist(x: number, z: number) {
  return Math.max(Math.abs(x), Math.abs(0.5 * x + (SQ3 / 2) * z), Math.abs(0.5 * x - (SQ3 / 2) * z));
}

function lattice(ix: number, iy: number, seed: number) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

// Smooth value noise in [-1, 1].
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = lattice(ix, iy, seed);
  const b = lattice(ix + 1, iy, seed);
  const c = lattice(ix, iy + 1, seed);
  const d = lattice(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

const fbm = (x: number, y: number, seed: number) => 0.68 * noise(x, y, seed) + 0.32 * noise(x * 2.1 + 5.3, y * 2.1 - 1.7, seed + 7);

// A unit vector at a corner (j even) or a flat's normal (j odd), in 30 degree steps from +x: corners sit at 30 + 60 n.
export const dirAt = (deg: number) => ({ x: Math.cos((deg * Math.PI) / 180), z: Math.sin((deg * Math.PI) / 180) });

// --- where the ground may move

// The six corners (where pieces stand, HEX_SIZE out) and the six edge midpoints (where a path rests), x and z interleaved.
const CORNERS = Float32Array.from({ length: 12 }, (_, i) => (i % 2 ? Math.sin : Math.cos)(((30 + 60 * (i >> 1)) * Math.PI) / 180) * HEX_SIZE);
const MIDS = Float32Array.from({ length: 12 }, (_, i) => (i % 2 ? Math.sin : Math.cos)(((60 * (i >> 1)) * Math.PI) / 180) * ((HEX_SIZE * SQ3) / 2));
function nearest(pts: Float32Array, x: number, z: number) {
  let d = Infinity;
  for (let i = 0; i < 12; i += 2) d = Math.min(d, (x - pts[i]!) ** 2 + (z - pts[i + 1]!) ** 2);
  return Math.sqrt(d);
}

// What the ground may do at a hex-local point. `rise`: how much of a rise it takes; none under the token (within 0.40 of the
// centre) nor round a corner (a piece's base), fading out before the band along each edge that a path covers. `dip`: how
// much of a hollow; none under the token, in a small disc at each corner or at an edge's midpoint (a path rests there).
// `band[k]`: how far into edge k's beach it is (edge k's flat faces 60 k degrees), which a coastal edge paints as sand;
// `shore[k]`: how much of that beach's dip it takes, none in the corner discs where pieces land.
type Masks = { rise: number; dip: number; band: Float32Array; shore: Float32Array };
// The lattice's own edge, as a distance from the centre to its flats.
const TOP_INR = ((HEX_SIZE * 0.995 - BEVEL_W) * SQ3) / 2;
const FLAT_COS = [0, 1, 2, 3, 4, 5].map((k) => Math.cos((k * Math.PI) / 3));
const FLAT_SIN = [0, 1, 2, 3, 4, 5].map((k) => Math.sin((k * Math.PI) / 3));
function masksAt(x: number, z: number, m: Masks, o = 0) {
  const r = Math.hypot(x, z);
  const d = hexDist(x, z);
  const token = smooth(0.4, 0.52, r);
  const dc = nearest(CORNERS, x, z);
  const corner = smooth(0.14, 0.3, dc);
  m.rise = token * smooth(0.22, 0.42, dc) * (1 - smooth(0.62, 0.78, d));
  m.dip = token * corner * smooth(0.16, 0.3, nearest(MIDS, x, z));
  // A beach reaches 0.11 in from its edge; nearer the centre than that from every edge, there is none.
  const near = d > TOP_INR - 0.11;
  for (let k = 0; k < 6; k++) {
    const e = TOP_INR - (x * FLAT_COS[k]! + z * FLAT_SIN[k]!);
    m.band[o + k] = near ? 1 - smooth(0.015, 0.085, e) : 0;
    m.shore[o + k] = near ? (1 - smooth(0, 0.11, e)) * corner : 0;
  }
  return m;
}

// Which of a hex's six edges face the sea: edge k is the flat facing 60 k degrees, whose neighbour is at these axial steps.
const FLAT_STEP: [number, number][] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
export const coastOf = (h: { q: number; r: number }, land: (q: number, r: number) => boolean) => FLAT_STEP.map(([dq, dr]) => !land(h.q + dq, h.r + dr));

// --- the per-hex layout

// A soft bump (h > 0) or hollow (h < 0) of radius r; `bump` adds it, with a smooth (C1) edge.
export type Spot = { x: number; z: number; r: number; h: number };
const bump = (x: number, z: number, p: Spot) => {
  const d2 = ((x - p.x) ** 2 + (z - p.z) ** 2) / (p.r * p.r);
  return d2 < 1 ? p.h * (1 - d2) * (1 - d2) : 0;
};

// The per-hex layout, drawn from the hex's own seeded stream: a rotation in 60 degree steps, the noise seed, the relief's
// strength, where the terrain's feature sits (the clay pit, the ore peaks) in hex-local coordinates, the ground's mounds and
// hollows, and for a forest where each pine stands (its trunk in a rooty bump). `room` keeps what is placed, so the props
// that follow (decorate, a frame later) find their own spots around it.
export type Layout = {
  k: number;
  rot: number;
  seed: number;
  amp: number;
  feature: { x: number; z: number; r: number };
  spots: Spot[];
  stands: { x: number; z: number; s: number }[];
  // A long soft swell along a segment (a, b) of half-width w and height h: the pasture's ridge, the ore's spine.
  ridge: { ax: number; az: number; bx: number; bz: number; w: number; h: number } | null;
  // Grain: the saddle's rising axis, as an angle from +x.
  axis: number;
  room: Room;
};

export type Sculpt = {
  geo: THREE.BufferGeometry;
  layout: Layout;
  // The world y of the top at a hex-local point.
  ground: (lx: number, lz: number) => number;
};

export function layoutOf(rng: () => number, t: Terrain): Layout {
  const k = Math.floor(rng() * 6);
  const rot = (k * Math.PI) / 3;
  const seed = Math.floor(rng() * 1e6);
  const amp = 0.8 + rng() * 0.4;
  // The feature leans toward a corner, where the hex has the most room between the token and the rim.
  const c = dirAt(30 + 60 * k);
  const feature = { x: c.x * 0.7, z: c.z * 0.7, r: 0.33 };
  const room = new Room(rng, (HEX_SIZE * 0.995 * SQ3) / 2);
  // The saddle's diagonals (its paths) run corner to corner and midpoint to midpoint.
  const L: Layout = { k, rot, seed, amp, feature, spots: [], stands: [], ridge: null, axis: rot + Math.PI / 6 + Math.PI / 4, room };
  if (t === "timber") forestLayout(L, rng);
  if (t === "wool") pastureLayout(L, rng);
  return L;
}

// Forest: three clumps of pines round the token, each an arc on a soft mound with its tallest pine at the heart, and a hollow
// (a clearing) in the widest gap between two of them. Every trunk stands in a small rooty bump. The ring between the token's
// clearing and the band the paths and pieces take is only about 0.2 wide, so a clump runs along it.
function forestLayout(L: Layout, rng: () => number) {
  const a0 = L.rot + rng() * 0.8;
  const angles = [a0, a0 + 1.95 + rng() * 0.5, a0 + 4.05 + rng() * 0.5];
  for (const a of angles) {
    L.spots.push({ x: Math.cos(a) * 0.68, z: Math.sin(a) * 0.68, r: 0.3 + rng() * 0.06, h: (0.07 + rng() * 0.03) * L.amp });
    const n = 4 + Math.floor(rng() * 2);
    for (let i = 0, placed = 0; i < 60 && placed < n; i++) {
      // The tallest at the heart; the rest smaller toward the token, so the clump rises away from the clearing.
      const heart = placed === 0;
      const ang = a + (rng() - 0.5) * (heart ? 0.2 : 1.1);
      const rad = heart ? 0.65 + rng() * 0.06 : 0.56 + rng() * 0.24;
      const s = heart ? 1.1 + rng() * 0.15 : 0.7 + (rad - 0.56) * 1.1 + rng() * 0.12;
      const [x, z] = [Math.cos(ang) * rad, Math.sin(ang) * rad];
      if (!L.room.free(x, z, 0.15 * s, 0.72, true)) continue;
      L.room.claim(x, z, 0.15 * s);
      L.stands.push({ x, z, s });
      L.spots.push({ x, z, r: 0.085 * s, h: 0.024 * s });
      placed++;
    }
  }
  // The clearing: the middle of the widest gap between clumps.
  let best = 0;
  for (let i = 0; i < 3; i++) {
    const gap = (angles[(i + 1) % 3]! - angles[i]! + Math.PI * 4) % (Math.PI * 2);
    if (gap > best) (best = gap), (L.feature = { x: Math.cos(angles[i]! + gap / 2) * 0.64, z: Math.sin(angles[i]! + gap / 2) * 0.64, r: 0.22 });
  }
  L.spots.push({ x: L.feature.x, z: L.feature.z, r: L.feature.r, h: -0.05 * L.amp });
}

// Pasture: one gentle ridge tangent to the ring on one side (a hedgerow will run along its crest) and two or three rolling
// swells round the rest, where the sheep graze.
function pastureLayout(L: Layout, rng: () => number) {
  const a = L.rot + (rng() - 0.5) * 0.6;
  const [cx, cz, tx, tz] = [Math.cos(a) * 0.66, Math.sin(a) * 0.66, -Math.sin(a), Math.cos(a)];
  const half = 0.3 + rng() * 0.08;
  L.ridge = { ax: cx - tx * half, az: cz - tz * half, bx: cx + tx * half, bz: cz + tz * half, w: 0.17, h: (0.07 + rng() * 0.02) * L.amp };
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const b = a + Math.PI + ((i - (n - 1) / 2) * 2.2) / n + (rng() - 0.5) * 0.4;
    L.spots.push({ x: Math.cos(b) * (0.62 + rng() * 0.08), z: Math.sin(b) * (0.62 + rng() * 0.08), r: 0.3 + rng() * 0.08, h: (0.05 + rng() * 0.025) * L.amp });
  }
}

// The ridge's height at a point: a soft swell along the segment, its crest rising a little toward the middle.
function ridgeAt(x: number, z: number, g: NonNullable<Layout["ridge"]>) {
  const [dx, dz] = [g.bx - g.ax, g.bz - g.az];
  const u = Math.min(1, Math.max(0, ((x - g.ax) * dx + (z - g.az) * dz) / (dx * dx + dz * dz)));
  const d2 = ((x - g.ax - u * dx) ** 2 + (z - g.az - u * dz) ** 2) / (g.w * g.w);
  return d2 < 1 ? g.h * (1 - d2) * (1 - d2) * (0.75 + u * (1 - u)) : 0;
}

// The terrain's own relief, before the masks that hold the token, the corners and the path rests. Positive is up.
function relief(t: Terrain, x: number, z: number, L: Layout): number {
  switch (t) {
    case "timber": {
      let h = 0.012 * fbm(x * 3.2, z * 3.2, L.seed);
      for (const p of L.spots) h += bump(x, z, p);
      return h;
    }
    case "wool": {
      let h = 0.02 * fbm(x * 1.6, z * 1.6, L.seed) + ridgeAt(x, z, L.ridge!);
      for (const p of L.spots) h += bump(x, z, p);
      return h;
    }
    case "grain":
      return GRAIN_SADDLE * L.amp * saddle(x, z, L.axis) * (1 - smooth(0.68, 0.86, hexDist(x, z))) + 0.006 * fbm(x * 2, z * 2, L.seed);
    case "clay": {
      const p = pitLevel(x, z, L);
      return 0.025 * L.amp * fbm(x * 2.4, z * 2.4, L.seed) - 0.045 * p.step;
    }
    case "ore": {
      const n = 1 - Math.abs(noise(x * 2.6, z * 2.6, L.seed));
      return 0.075 * L.amp * n * n - 0.012;
    }
    case "waste": {
      const u = x * Math.cos(L.rot) + z * Math.sin(L.rot);
      const dune = Math.sin(u * 4.2 + 1.4 * noise(x * 1.3, z * 1.3, L.seed));
      const ripple = Math.sin(u * 24 + 3 * noise(x * 2, z * 2, L.seed + 3));
      return 0.04 * L.amp * dune + 0.006 * ripple;
    }
  }
}

// Grain: a shallow saddle, its saddle point under the token: the ground rises along `axis` and falls across it, fading out
// before the rim. `saddle` gives u^2 - v^2 in the saddle's frame (u along the axis), whose level sets the furrows follow.
const GRAIN_SADDLE = 0.075;
const saddle = (x: number, z: number, axis: number) => {
  const [c, s] = [Math.cos(axis), Math.sin(axis)];
  const [u, v] = [x * c + z * s, -x * s + z * c];
  return u * u - v * v;
};
// How far a point is from the saddle's two diagonals, where its level sets run out from the centre: the paths between plots.
const pathDist = (x: number, z: number, axis: number) => {
  const [c, s] = [Math.cos(axis), Math.sin(axis)];
  const [u, v] = [x * c + z * s, -x * s + z * c];
  return Math.abs(Math.abs(u) - Math.abs(v)) * Math.SQRT1_2;
};
// The ploughed field: four plots in the ring between the token's clearing and an unploughed headland, split by the paths,
// clear of the corners' discs.
const fieldOf = (r: number, d: number, dc: number, path: number) => smooth(0.46, 0.52, r) * (1 - smooth(0.66, 0.73, d)) * smooth(0.3, 0.38, dc) * smooth(0.035, 0.065, path);
const fieldAt = (x: number, z: number, axis: number) => fieldOf(Math.hypot(x, z), hexDist(x, z), nearest(CORNERS, x, z), pathDist(x, z, axis));
// The furrows: a ridge every FURROW_DC of u^2 - v^2 (0.095 apart beside the token, 0.068 at the headland), each ridge 0.7 of
// its spacing wide.
const FURROW_DC = 0.095;
const FURROW_H = 0.021;

// Each furrow ridge across the field, as runs of [x, z, how much of the field holds there]: the saddle's level sets
// u^2 - v^2 = c, traced as hyperbola branches (by v where c > 0, by u where c < 0).
function furrows(axis: number) {
  const [cs, sn] = [Math.cos(axis), Math.sin(axis)];
  const runs: number[][] = [];
  for (let k = -6; k < 6; k++) {
    const c = (k + 0.5) * FURROW_DC;
    for (const side of [-1, 1]) {
      // The field reaches 0.85 from the centre at most: u^2 + v^2 = 2 t^2 + |c| <= 0.72.
      const reach = Math.sqrt(Math.max(0, (0.72 - Math.abs(c)) / 2));
      let run: number[] = [];
      for (let t = -reach; t <= reach; t += 0.022) {
        const u = c > 0 ? side * Math.sqrt(c + t * t) : t;
        const v = c > 0 ? t : side * Math.sqrt(t * t - c);
        const x = u * cs - v * sn;
        const z = u * sn + v * cs;
        const w = fieldAt(x, z, axis);
        if (w > 0.02) run.push(x, z, w);
        else if (run.length) {
          if (run.length >= 9) runs.push(run);
          run = [];
        }
      }
      if (run.length >= 9) runs.push(run);
    }
  }
  return runs;
}

// Clay: a quarry pit of three terraces, each ledge flat and each riser short and steep.
function pitLevel(x: number, z: number, L: Layout) {
  const d = Math.hypot(x - L.feature.x, z - L.feature.z) / L.feature.r;
  if (d >= 1) return { step: 0, riser: false, level: 0 };
  const level = (1 - d) * 3;
  const f = level - Math.floor(level);
  const step = Math.min(3, Math.floor(level) + smooth(0.72, 1, f));
  return { step, riser: f > 0.72 && level < 3, level: Math.floor(level) };
}

const col = (hex: string) => new THREE.Color(hex);

// The top's lattice for RINGS and the tile's size, the same for every hex: the points (x, z), the upward triangles, each
// point's four lattice neighbours (q +- 1, r +- 1; -1 off the lattice) for its normal, the boundary ring corner to corner,
// and each point's masks.
type Lattice = {
  count: number;
  // Each point's index by (q + R) * (2 R + 1) + r + R, -1 off the hexagon.
  grid: Int32Array;
  x: Float32Array;
  z: Float32Array;
  // Each point's distance from the centre, from it to the flats (hexDist) and to the nearest corner.
  r: Float32Array;
  d: Float32Array;
  dc: Float32Array;
  index: Uint16Array;
  nb: Int32Array;
  ring: Uint16Array;
  rise: Float32Array;
  dip: Float32Array;
  band: Float32Array;
  shore: Float32Array;
};
const lattices = new Map<number, Lattice>();
function latticeOf(R: number, s: number): Lattice {
  let t = lattices.get(R);
  if (t) return t;
  // Each lattice point's index by (q, r) on a dense grid, -1 off the hexagon.
  const S = 2 * R + 1;
  const grid = new Int32Array(S * S).fill(-1);
  const id = (q: number, r: number) => (Math.abs(q) > R || Math.abs(r) > R ? -1 : grid[(q + R) * S + r + R]!);
  const qs: number[] = [];
  const rs: number[] = [];
  for (let a = -R; a <= R; a++) {
    for (let b = Math.max(-R, -a - R); b <= Math.min(R, -a + R); b++) {
      grid[(a + R) * S + b + R] = qs.length;
      qs.push(a);
      rs.push(b);
    }
  }
  // Counter-clockwise seen from above (+y): the lattice's x runs along q and z along r + q / 2.
  const index: number[] = [];
  for (let a = -R; a < R; a++) {
    for (let b = -R; b < R; b++) {
      const [p0, p1, p2, p3] = [id(a, b), id(a + 1, b), id(a, b + 1), id(a + 1, b + 1)];
      if (p0 >= 0 && p1 >= 0 && p2 >= 0) index.push(p0, p2, p1);
      if (p1 >= 0 && p3 >= 0 && p2 >= 0) index.push(p1, p2, p3);
    }
  }
  const n = qs.length;
  const nb = new Int32Array(n * 4);
  const [x, z] = [new Float32Array(n), new Float32Array(n)];
  const [rise, dip] = [new Float32Array(n), new Float32Array(n)];
  const [rr, dd, dc] = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const m: Masks = { rise: 0, dip: 0, band: new Float32Array(n * 6), shore: new Float32Array(n * 6) };
  for (let i = 0; i < n; i++) {
    const [a, b] = [qs[i]!, rs[i]!];
    nb[i * 4] = id(a + 1, b);
    nb[i * 4 + 1] = id(a - 1, b);
    nb[i * 4 + 2] = id(a, b + 1);
    nb[i * 4 + 3] = id(a, b - 1);
    x[i] = (SQ3 / 2) * s * a;
    z[i] = 0.5 * s * a + s * b;
    masksAt(x[i]!, z[i]!, m, i * 6);
    [rise[i], dip[i]] = [m.rise, m.dip];
    [rr[i], dd[i], dc[i]] = [Math.hypot(x[i]!, z[i]!), hexDist(x[i]!, z[i]!), nearest(CORNERS, x[i]!, z[i]!)];
  }
  // The boundary ring, corner to corner.
  const steps: [number, number][] = [[-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]];
  const corners: [number, number][] = [[R, 0], [0, R], [-R, R], [-R, 0], [0, -R], [R, -R]];
  const ring: number[] = [];
  for (let k = 0; k < 6; k++) for (let i = 0; i < R; i++) ring.push(id(corners[k]![0] + steps[k]![0] * i, corners[k]![1] + steps[k]![1] * i));
  t = { count: n, grid, x, z, r: rr, d: dd, dc, index: Uint16Array.from(index), nb, ring: Uint16Array.from(ring), rise, dip, band: m.band, shore: m.shore };
  lattices.set(R, t);
  return t;
}

// Every hex: a slab of `size` (corner radius) and `slabH`, base at y 0 in its own frame, standing at `tileY` in the world;
// `coast[k]` when the edge facing 60 k degrees faces the sea (a sand beach dips to it there).
export function sculptHex(h: HexCell, size: number, slabH: number, tileY: number, rng: () => number, coast: boolean[]): Sculpt {
  const t = h.terrain;
  const L = layoutOf(rng, t);
  const top = size - BEVEL_W;
  const s = top / RINGS;
  const R = RINGS;
  const T = latticeOf(R, s);
  // The ground at any hex-local point (props stand on it); the lattice samples the same function once per point.
  const m: Masks = { rise: 0, dip: 0, band: new Float32Array(6), shore: new Float32Array(6) };
  const shoreOf = (sh: Float32Array, o: number) => {
    let w = 0;
    for (let k = 0; k < 6; k++) if (coast[k]) w = Math.max(w, sh[o + k]!);
    return SHORE_DIP * w;
  };
  const height = (x: number, z: number) => {
    if (x * x + z * z < 0.16) return 0;
    masksAt(x, z, m);
    const raw = relief(t, x, z, L);
    return (raw > 0 ? raw * m.rise : raw * m.dip) - shoreOf(m.shore, 0);
  };
  const [base, shade, sun] = PAINT[t].map(col) as [THREE.Color, THREE.Color, THREE.Color];
  const crest = base.clone().lerp(sun, 0.5);
  const terrace = base.clone().lerp(WHITE, 0.11);
  const pit = shade.clone().multiplyScalar(0.8);
  const sand = col(STRATA.sand);
  const soil = col(PROP.furrow);
  // One scratch colour: `paint` fills it, the caller reads it at once.
  const c = new THREE.Color();
  // Two tones per surface: a hollow leans to the shade and a crest to the sunlit tint, then a slope that faces the key lamp
  // warms toward the sunlit tint and one that faces away cools toward the shade; the beach is sand.
  const paint = (x: number, z: number, hh: number, lit: number, beach: number, field = 0) => {
    c.copy(base);
    if (hh < 0) c.lerp(shade, Math.min(1, -hh * 14));
    else c.lerp(crest, Math.min(1, hh * 9));
    const f = (lit - KEY.y) * 4;
    if (f > 0) c.lerp(sun, Math.min(0.7, f));
    else c.lerp(shade, Math.min(0.7, -f));
    // Between the furrow ridges the field is turned soil; the paths between plots are sandy.
    if (t === "grain") {
      const path = pathDist(x, z, L.axis);
      c.lerp(soil, 0.9 * field);
      c.lerp(sand, 0.7 * (1 - smooth(0.02, 0.06, path)) * smooth(0.44, 0.5, Math.hypot(x, z)));
    }
    if (t === "clay") {
      const p = pitLevel(x, z, L);
      if (p.riser) c.copy(shade);
      else if (p.step > 0.5) c.copy(p.level % 2 ? base : terrace);
      if (p.step >= 2.99) c.copy(pit);
    }
    return c.lerp(sand, beach);
  };

  const N = 6 * R;
  const W = BEVEL_SEGS + 2;
  const FACE = R + 1;
  const ridges = t === "grain" ? furrows(L.axis) : [];
  const ridgePts = ridges.reduce((a, r) => a + r.length / 3, 0);
  const verts = T.count + N * (W - 1) + 6 * FACE * 8 + ridgePts * 3;
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const cols = new Float32Array(verts * 3);
  const glow = new Float32Array(verts).fill(1);
  const idx = new Uint16Array(T.index.length + N * (W - 1) * 6 + 6 * R * 4 * 6 + (ridgePts - ridges.length) * 12);
  idx.set(T.index);
  let nv = 0;
  let ni = T.index.length;
  const vert = (px: number, py: number, pz: number, nx: number, ny: number, nz: number, col: THREE.Color, g: number) => {
    const o = nv * 3;
    pos[o] = px;
    pos[o + 1] = py;
    pos[o + 2] = pz;
    nor[o] = nx;
    nor[o + 1] = ny;
    nor[o + 2] = nz;
    cols[o] = col.r;
    cols[o + 1] = col.g;
    cols[o + 2] = col.b;
    glow[nv] = g;
    return nv++;
  };
  // Whether the triangle (a, b, d) as given faces against (rx, ry, rz): a strip of quads laid out the same way round all
  // winds the same, so each strip asks once.
  const flipped = (a: number, b: number, d: number, rx: number, ry: number, rz: number) => {
    const [ux, uy, uz] = [pos[b * 3]! - pos[a * 3]!, pos[b * 3 + 1]! - pos[a * 3 + 1]!, pos[b * 3 + 2]! - pos[a * 3 + 2]!];
    const [vx, vy, vz] = [pos[d * 3]! - pos[a * 3]!, pos[d * 3 + 1]! - pos[a * 3 + 1]!, pos[d * 3 + 2]! - pos[a * 3 + 2]!];
    return (uy * vz - uz * vy) * rx + (uz * vx - ux * vz) * ry + (ux * vy - uy * vx) * rz < 0;
  };
  // The quad a-b along the strip, c-d the next row: two triangles, wound by `flip`.
  const quad = (a: number, b: number, cc: number, d: number, flip: boolean) => {
    idx[ni] = idx[ni + 3] = a;
    idx[ni + 1] = flip ? d : b;
    idx[ni + 2] = flip ? b : d;
    idx[ni + 4] = flip ? cc : d;
    idx[ni + 5] = flip ? d : cc;
    ni += 6;
  };

  // The top: one height per lattice point, its normal from its lattice neighbours' heights, its colour from the height, the
  // slope's light and the beach. The lattice (which points, which triangles, the masks) is the same for every hex.
  const hs = new Float32Array(T.count);
  const sea = new Float32Array(T.count);
  for (let i = 0; i < T.count; i++) {
    const shore = shoreOf(T.shore, i * 6);
    for (let k = 0; k < 6; k++) if (coast[k]) sea[i] = Math.max(sea[i]!, T.band[i * 6 + k]!);
    if (T.rise[i] === 0 && T.dip[i] === 0) hs[i] = -shore;
    else {
      const raw = relief(t, T.x[i]!, T.z[i]!, L);
      hs[i] = (raw > 0 ? raw * T.rise[i]! : raw * T.dip[i]!) - shore;
    }
  }
  for (let i = 0; i < T.count; i++) {
    const h0 = hs[i]!;
    const at = (j: number) => {
      const n = T.nb[i * 4 + j]!;
      return n < 0 ? h0 : hs[n]!;
    };
    // Central differences along q and r (one-sided at the boundary), then to x and z.
    const [hq, hr] = [(at(0) - at(1)) / (T.nb[i * 4]! < 0 || T.nb[i * 4 + 1]! < 0 ? 1 : 2), (at(2) - at(3)) / (T.nb[i * 4 + 2]! < 0 || T.nb[i * 4 + 3]! < 0 ? 1 : 2)];
    const gz = hr / s;
    const gx = (hq - 0.5 * hr) / ((SQ3 / 2) * s);
    const il = 1 / Math.hypot(gx, 1, gz);
    const [nx, ny, nz] = [-gx * il, il, -gz * il];
    const field = t === "grain" ? fieldOf(T.r[i]!, T.d[i]!, T.dc[i]!, pathDist(T.x[i]!, T.z[i]!, L.axis)) : 0;
    paint(T.x[i]!, T.z[i]!, h0, nx * KEY.x + ny * KEY.y + nz * KEY.z, sea[i]!, field);
    vert(T.x[i]!, slabH + h0, T.z[i]!, nx, ny, nz, c, 1);
  }

  // The rim: the top's boundary ring rolls over a rounded lip that stands OVERHANG out past the strata and tucks back under.
  // Row 0 is the lattice's own boundary; the quarter round's rows follow, then the tuck. Outward is a corner's own direction,
  // or its flat's.
  const outward = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const p = T.ring[i]!;
    const o = i % R === 0 ? { x: T.x[p]! / top, z: T.z[p]! / top } : dirAt(60 + 60 * Math.floor(i / R));
    outward[i * 2] = o.x;
    outward[i * 2 + 1] = o.z;
  }
  const rim = new Int32Array(N * W);
  const lipC = new THREE.Color();
  const under = shade.clone().lerp(sand, 0.15);
  for (let i = 0; i < N; i++) {
    const p = T.ring[i]!;
    const [ox, oz] = [outward[i * 2]!, outward[i * 2 + 1]!];
    const y0 = slabH + hs[p]!;
    rim[i * W] = p;
    lipC.setRGB(cols[p * 3]!, cols[p * 3 + 1]!, cols[p * 3 + 2]!);
    const lipTo = sea[p]! > 0.5 ? sand : under;
    for (let j = 1; j < W; j++) {
      const tuck = j === W - 1;
      const a = (Math.min(j, BEVEL_SEGS) / BEVEL_SEGS) * (Math.PI / 2);
      const f = tuck ? size / top : (top + (size + OVERHANG - top) * Math.sin(a)) / top;
      const y = tuck ? y0 - BEVEL_H - TUCK : y0 - BEVEL_H * (1 - Math.cos(a));
      // The quarter round's normal turns from up to outward; the tuck's faces down and out.
      const [nh, ny] = tuck ? [0.45, -0.89] : [BEVEL_H * Math.sin(a), (size + OVERHANG - top) * Math.cos(a)];
      const il = 1 / Math.hypot(nh, ny);
      c.copy(lipC).lerp(lipTo, j / (W - 1));
      rim[i * W + j] = vert(T.x[p]! * f, y, T.z[p]! * f, ox * nh * il, ny * il, oz * nh * il, c, tuck ? 0 : 1);
    }
  }
  for (let j = 0; j < W - 1; j++) {
    const flip = flipped(rim[j]!, rim[W + j]!, rim[W + j + 1]!, outward[0]!, j === W - 2 ? -1 : 1, outward[1]!);
    for (let i = 0; i < N; i++) {
      const i1 = (i + 1) % N;
      quad(rim[i * W + j]!, rim[i1 * W + j]!, rim[i * W + j + 1]!, rim[i1 * W + j + 1]!, flip);
    }
  }

  // The side, under the tuck: four bands with wavy borders (sand, a thin shell band, caramel soil, chocolate rock), flat per
  // face; each face's points are shared along it.
  const bands = [sand, col(STRATA.shell), col(STRATA.soil), col(STRATA.rock)];
  const H = slabH - BEVEL_H - TUCK;
  const k = size / top;
  for (let face = 0; face < 6; face++) {
    const n = dirAt(60 + 60 * face);
    const first = nv;
    for (let i = 0; i <= R; i++) {
      const ri = (face * R + i) % N;
      const p = T.ring[ri]!;
      const u = ri / N;
      const borders = [
        H + hs[p]!,
        H * 0.56 + 0.025 * noise(u * 9, 3.5, L.seed),
        H * 0.5 + 0.025 * noise(u * 9, 3.5, L.seed),
        H * 0.2 + 0.018 * noise(u * 11, 9.5, L.seed),
        -SKIRT,
      ];
      for (let band = 0; band < 4; band++) {
        vert(T.x[p]! * k, borders[band]!, T.z[p]! * k, n.x, 0, n.z, bands[band]!, 0);
        vert(T.x[p]! * k, borders[band + 1]!, T.z[p]! * k, n.x, 0, n.z, bands[band]!, 0);
      }
    }
    const flip = flipped(first, first + 8, first + 9, n.x, 0, n.z);
    for (let i = 0; i < R; i++) {
      for (let band = 0; band < 4; band++) {
        const a = first + i * 8 + band * 2;
        quad(a, a + 8, a + 1, a + 9, flip);
      }
    }
  }

  // Grain's furrow ridges, draped on the rendered ground (the lattice's own triangles): each point a crest between two feet;
  // the crest catches the light, a flank facing the lamp warms and one facing away cools, and the feet melt into the soil.
  const surface = (x: number, z: number) => {
    const qf = x / ((SQ3 / 2) * s);
    const rf = z / s - 0.5 * qf;
    const [q0, r0] = [Math.floor(qf), Math.floor(rf)];
    const [fq, fr] = [qf - q0, rf - r0];
    const at = (q: number, r: number) => hs[T.grid[(q + R) * (2 * R + 1) + r + R]!] ?? 0;
    if (fq + fr <= 1) return at(q0, r0) + fq * (at(q0 + 1, r0) - at(q0, r0)) + fr * (at(q0, r0 + 1) - at(q0, r0));
    return at(q0 + 1, r0 + 1) + (1 - fq) * (at(q0, r0 + 1) - at(q0 + 1, r0 + 1)) + (1 - fr) * (at(q0 + 1, r0) - at(q0 + 1, r0 + 1));
  };
  const crestC = base.clone().lerp(sun, 0.3);
  for (const run of ridges) {
    const n = run.length / 3;
    const first = nv;
    for (let i = 0; i < n; i++) {
      const px = run[i * 3]!;
      const pz = run[i * 3 + 1]!;
      const a = Math.max(0, i - 1) * 3;
      const b = Math.min(n - 1, i + 1) * 3;
      const tl = Math.hypot(run[b]! - run[a]!, run[b + 1]! - run[a + 1]!) || 1;
      // Across the furrow (to the left of its run), its half-width (0.35 of the spacing there) and its height, tapering at
      // the run's ends and where the field fades.
      const nx = -(run[b + 1]! - run[a + 1]!) / tl;
      const nz = (run[b]! - run[a]!) / tl;
      const hh = FURROW_H * Math.min(1, run[i * 3 + 2]! * 1.4, i / 2, (n - 1 - i) / 2);
      const half = (0.35 * FURROW_DC) / (2 * Math.hypot(px, pz));
      const fl = 1 / Math.hypot(hh, half);
      for (let sd = -1; sd <= 1; sd++) {
        const vx = px + nx * sd * half;
        const vz = pz + nz * sd * half;
        const vy = slabH + surface(vx, vz) + (sd ? -0.002 : 0.003 + hh);
        if (sd) {
          const [ox, oy, oz] = [nx * sd * hh * fl, half * fl, nz * sd * hh * fl];
          const lit = (ox * KEY.x + oy * KEY.y + oz * KEY.z - KEY.y) * 3;
          c.copy(base).lerp(lit > 0 ? sun : shade, Math.min(0.6, Math.abs(lit))).lerp(soil, 0.25);
          vert(vx, vy, vz, ox, oy, oz, c, 1);
        } else vert(vx, vy, vz, 0, 1, 0, crestC, 1);
      }
    }
    // Both flanks face up: left foot, crest, right foot along the run, wound counter-clockwise from above.
    for (let i = 0; i < n - 1; i++) {
      const a = first + i * 3;
      quad(a, a + 1, a + 3, a + 4, false);
      quad(a + 1, a + 2, a + 4, a + 5, false);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  geo.setAttribute("aGlow", new THREE.BufferAttribute(glow, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return { geo, layout: L, ground: (lx, lz) => tileY + slabH + height(lx, lz) };
}

// The tile's material: vertex colours, matte, the toon ramp, and the paying-hex flash (docs/design/dice.md) on the top and rim
// only.
const glowOnTop = (shader: THREE.WebGLProgramParametersWithUniforms) => {
  shader.vertexShader = "attribute float aGlow;\nvarying float vGlow;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvGlow = aGlow;");
  shader.fragmentShader = "varying float vGlow;\n" + shader.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vGlow;");
};
// The soft three-step toon ramp on the key and fill lamps' diffuse light (docs/design/terrain.md "Colour and light"): a face
// turned from the lamp keeps half the light instead of going dark (no black crevices), flat ground keeps its own 0.82, and a
// face turned to the lamp rises softly to full. Specular keeps the true angle, so faces turned away never glint.
const DIFFUSE = "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );";
const RAMPED =
  "float toonStep( float x ) { return 0.5 + 0.32 * smoothstep( 0.12, 0.38, x ) + 0.18 * smoothstep( 0.86, 0.99, x ); }\n" +
  THREE.ShaderChunk.lights_physical_pars_fragment.replace(DIFFUSE, DIFFUSE.replace("irradiance", "toonStep( dotNL ) * directLight.color"));
if (!RAMPED.includes("toonStep( dotNL )")) console.error("terrain: three's diffuse line moved; the toon ramp is off");
const toonify = (shader: THREE.WebGLProgramParametersWithUniforms) => {
  shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_pars_fragment>", RAMPED);
};
export function tileMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (sh) => (glowOnTop(sh), toonify(sh));
  m.customProgramCacheKey = () => "sculpted-tile";
  return m;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Props. Each kind that moves or is shaded per object (trees, peaks, derricks, sheep, the workers) is one InstancedMesh drawn
// from invisible proxy meshes in `living`: a proxy carries the transform, the prop's userData and the real geometry (so a
// proof's raycast or bounding box measures what is drawn); `sync` copies the proxies' matrices into the instances each frame.
// Everything that stands still is merged into one mesh per terrain (grain's per hex, as its own "field").

const PROP_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
PROP_MAT.userData.shared = true; // disposeGroup leaves it alone
PROP_MAT.onBeforeCompile = toonify;
PROP_MAT.customProgramCacheKey = () => "toon-prop";

export type Footprint = { hex: string; x: number; z: number; reach: number };
export type Sheep = { g: THREE.Object3D; ox: number; oz: number; tx: number; tz: number; wait: number; graze: number; ground: (x: number, z: number) => number };
export type OreWork = { cart: THREE.Mesh; arm: THREE.Mesh; x: number; z: number; dx: number; dz: number; phase: number };
export type FarmWork = { body: THREE.Mesh; arm: THREE.Mesh; x: number; z: number; phase: number; angle: number; ground: (x: number, z: number) => number };
// What the renderer animates or shades: `tall` is every prop the #604 rule may shrink in front of a token.
export type Life = { sheep: Sheep[]; oreWork: OreWork[]; farmWork: FarmWork[]; tall: THREE.Object3D[] };

const WHITE = new THREE.Color(1, 1, 1);
// Per-tree tints over the pine's own three greens: as is, cooler and darker, warmer and lighter.
const PINE_TINTS = [WHITE, new THREE.Color(0.8, 0.93, 0.86), new THREE.Color(1.12, 1.08, 0.86)];

// Each instanced kind's shape, built once a page: every builder is deterministic, and a rebuilt board's disposeGroup only frees
// the GPU copy, which three uploads again on the next draw.
const SHAPES = new Map<string, THREE.BufferGeometry>();

export class PropKit {
  private kinds = new Map<string, { geo: THREE.BufferGeometry; shadow: boolean; proxies: THREE.Mesh[]; tints: THREE.Color[] }>();
  private statics = new Map<string, { parts: THREE.BufferGeometry[]; footprints: Footprint[] }>();
  private drawers: { mesh: THREE.InstancedMesh; proxies: THREE.Mesh[] }[] = [];
  constructor(private living: THREE.Group) {}

  proxy(kind: string, make: () => THREE.BufferGeometry, data: Record<string, unknown>, shadow = true, tint = WHITE) {
    let k = this.kinds.get(kind);
    if (!SHAPES.has(kind)) SHAPES.set(kind, make());
    if (!k) this.kinds.set(kind, (k = { geo: SHAPES.get(kind)!, shadow, proxies: [], tints: [] }));
    const m = new THREE.Mesh(k.geo, PROP_MAT);
    m.visible = false;
    m.userData = data;
    k.proxies.push(m);
    k.tints.push(tint);
    this.living.add(m);
    return m;
  }

  add(name: string, geo: THREE.BufferGeometry, fp: Footprint | null) {
    let s = this.statics.get(name);
    if (!s) this.statics.set(name, (s = { parts: [], footprints: [] }));
    s.parts.push(geo);
    if (fp) s.footprints.push(fp);
  }

  // A footprint for a part whose own spot is not where it reaches (a run of rails).
  mark(name: string, fp: Footprint) {
    this.statics.get(name)?.footprints.push(fp);
  }

  // One grain hex's standing props, in its own frame (x, z from the hex centre), as the field the jelly proof measures.
  field(hex: string, x: number, z: number, parts: THREE.BufferGeometry[], footprints: Footprint[]) {
    const m = new THREE.Mesh(mergeGeometries(parts), PROP_MAT);
    parts.forEach((p) => p.dispose());
    m.name = "grain-field";
    m.position.set(x, 0, z);
    m.castShadow = m.receiveShadow = true;
    m.userData = { hex, field: true, terrainProps: "grain-field", footprints };
    this.living.add(m);
  }

  finish() {
    for (const [kind, k] of this.kinds) {
      const mesh = new THREE.InstancedMesh(k.geo, PROP_MAT, k.proxies.length);
      mesh.name = `props-${kind}`;
      mesh.castShadow = k.shadow;
      mesh.receiveShadow = true;
      // The instances move (sheep, carts) and shrink (the tree rule); one box for the lot is not worth keeping current.
      mesh.frustumCulled = false;
      mesh.userData = { terrainProps: kind };
      if (k.tints.some((c) => c !== WHITE)) k.tints.forEach((c, i) => mesh.setColorAt(i, c));
      this.living.add(mesh);
      this.drawers.push({ mesh, proxies: k.proxies });
    }
    for (const [name, s] of this.statics) {
      const mesh = new THREE.Mesh(mergeGeometries(s.parts), PROP_MAT);
      s.parts.forEach((p) => p.dispose());
      mesh.name = `props-${name}`;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData = { terrainProps: name, footprints: s.footprints };
      this.living.add(mesh);
    }
    this.sync();
  }

  sync() {
    for (const d of this.drawers) {
      d.proxies.forEach((p, i) => {
        p.updateMatrix();
        d.mesh.setMatrixAt(i, p.matrix);
      });
      d.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

const AXIS_Y = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _qt = new THREE.Quaternion();

function paintAll(g: THREE.BufferGeometry, hex: string | THREE.Color) {
  const c = typeof hex === "string" ? new THREE.Color(hex) : hex;
  const a = new Float32Array(g.attributes.position!.count * 3);
  for (let i = 0; i < a.length; i += 3) c.toArray(a, i);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}

// Two tones by how much each normal faces up: tops lean to `light`, sides keep `base`, undersides lean to `dark`. A turn about
// y leaves it right, so an instanced prop may stand at any angle.
function tone(g: THREE.BufferGeometry, base: string, light: string, dark: string) {
  const [b, l, d] = [base, light, dark].map(col) as [THREE.Color, THREE.Color, THREE.Color];
  const n = g.attributes.normal!;
  const a = new Float32Array(n.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n.count; i++) {
    const y = n.getY(i);
    c.copy(b).lerp(y > 0 ? l : d, smooth(0.2, 1, Math.abs(y)) * (y > 0 ? 0.5 : 0.6)).toArray(a, i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}

// A smooth, closed lathe: `shape` may move each point (x, y, z, its radius over the lathe's widest) before the normals are
// taken, and the seam's twin columns share their normals so the shading runs round unbroken.
function lathe(profile: [number, number][], segs: number, shape?: (v: THREE.Vector3, f: number) => void) {
  const g = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), segs);
  g.deleteAttribute("uv");
  const p = g.attributes.position!;
  if (shape) {
    const widest = Math.max(...profile.map(([x]) => x));
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      shape(v, Math.hypot(v.x, v.z) / widest);
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  const n = g.attributes.normal!;
  const v = new THREE.Vector3();
  for (let j = 0, last = segs * profile.length; j < profile.length; j++) {
    v.set(n.getX(j) + n.getX(last + j), n.getY(j) + n.getY(last + j), n.getZ(j) + n.getZ(last + j)).normalize();
    n.setXYZ(j, v.x, v.y, v.z);
    n.setXYZ(last + j, v.x, v.y, v.z);
  }
  return g;
}

// A part: non-indexed, without uvs (so every part merges), placed (position, y rotation, scale) and painted one colour.
// `flat` gives it faceted normals.
// `hex` null keeps the colours the geometry already has (a toned part).
function part(geo: THREE.BufferGeometry, hex: string | THREE.Color | null, x = 0, y = 0, z = 0, rotY = 0, sx = 1, sy = sx, sz = sx, flat = false) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute("uv");
  g.applyMatrix4(_m.compose(new THREE.Vector3(x, y, z), _qt.setFromAxisAngle(AXIS_Y, rotY), new THREE.Vector3(sx, sy, sz)));
  if (flat) g.computeVertexNormals();
  return hex === null ? g : paintAll(g, hex);
}

// A round beam from a to b.
function beam(a: THREE.Vector3, b: THREE.Vector3, r: number, hex: string) {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), 5).toNonIndexed();
  g.deleteAttribute("uv");
  g.applyQuaternion(_qt.setFromUnitVectors(AXIS_Y, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return paintAll(g, hex);
}

// Merges parts built in a prop's own frame and stands it at (x, y, z), turned by rotY.
function placeAt(parts: THREE.BufferGeometry[], x: number, y: number, z: number, rotY = 0) {
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g.applyMatrix4(_m.compose(new THREE.Vector3(x, y, z), _qt.setFromAxisAngle(AXIS_Y, rotY), new THREE.Vector3(1, 1, 1)));
}

// --- the props' shapes, each in its own frame with its foot at y 0

// A frond tier: a plump bell whose lip hangs in seven rounded lobes, smooth-shaded, lit on top and shaded under the lip.
function frond(r: number, h: number, hex: string, light: string, dark: string) {
  const g = lathe([[0.8 * r, -0.03 * h], [r, 0.07 * h], [0.86 * r, 0.32 * h], [0.5 * r, 0.66 * h], [0, h]], 21, (v, f) => {
    const w = smooth(0.5, 1, f);
    const lobe = Math.cos(7 * Math.atan2(v.z, v.x));
    v.x *= 1 + 0.1 * lobe * w;
    v.z *= 1 + 0.1 * lobe * w;
    v.y -= 0.07 * h * w * (0.5 + 0.5 * lobe);
  });
  return tone(g, hex, light, dark);
}

// Roots: three small lobes splayed at the foot of a trunk or a stump of radius r.
const roots = (r: number, hex: string) =>
  [0, 1, 2].map((i) => part(new THREE.SphereGeometry(r * 0.55, 6, 4), hex, Math.cos(i * 2.2 + 0.4) * r * 0.95, r * 0.12, Math.sin(i * 2.2 + 0.4) * r * 0.95, -(i * 2.2 + 0.4), 1.5, 0.55, 0.85));

// A pine: a tapered trunk on its roots under five plump frond tiers, dark at the foot to light at the crown. 0.54 tall at
// scale 1; reach 0.15.
function pineGeo() {
  const parts = [part(new THREE.CylinderGeometry(0.021, 0.031, 0.18, 8), PROP.trunk, 0, 0.09, 0), ...roots(0.031, PROP.trunkDark)];
  const tiers: [number, number, number][] = [[0.16, 0.17, 0.1], [0.135, 0.155, 0.185], [0.11, 0.14, 0.265], [0.085, 0.13, 0.34], [0.06, 0.13, 0.41]];
  tiers.forEach(([r, h, y], i) => parts.push(part(frond(r, h, PROP.pine[i]!, PROP.pineLight, PROP.pineDark), null, 0, y, 0, i * 0.7)));
  return mergeGeometries(parts);
}

// A faceted peak, unit radius and height, its jitter fixed so every instance is the same rock seen at its own scale and
// turn; each face painted by its height, grey at the foot to pale stone at the summit.
function peakGeo() {
  const g = new THREE.ConeGeometry(1, 1, 7, 4).translate(0, 0.5, 0);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
    const j = (n: number) => lattice(Math.round(x * 1000) + n, Math.round(z * 1000) + Math.round(y * 1000) * 7, 99);
    if (y > 0.999) p.setXYZ(i, 0.08, 1, -0.05);
    else if (y > 0.001) p.setXYZ(i, x * (1 + 0.16 * j(1)), y + 0.05 * j(2), z * (1 + 0.16 * j(1)));
  }
  const flat = g.toNonIndexed();
  g.dispose();
  flat.deleteAttribute("uv");
  flat.computeVertexNormals();
  const [low, high] = [new THREE.Color(PROP.peakLow), new THREE.Color(PROP.peakHigh)];
  const fp = flat.attributes.position!;
  const a = new Float32Array(fp.count * 3);
  for (let i = 0; i < fp.count; i += 3) {
    const y = (fp.getY(i) + fp.getY(i + 1) + fp.getY(i + 2)) / 3;
    const c = low.clone().lerp(high, smooth(0.42, 0.8, y));
    for (let k = 0; k < 3; k++) c.toArray(a, (i + k) * 3);
  }
  flat.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return flat;
}

// A clay-pit derrick: a timber tripod, a boom out along +x with a pulley, a rope and a bucket. 0.39 tall; reach 0.27.
function derrickGeo() {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const apex = V(0, 0.38, 0);
  const feet = [60, 180, 300].map((d) => V(Math.cos((d * Math.PI) / 180) * 0.1, 0, Math.sin((d * Math.PI) / 180) * 0.1));
  const parts = feet.map((f) => beam(f, apex, 0.011, PROP.wood));
  const mids = feet.map((f) => f.clone().lerp(apex, 0.35));
  mids.forEach((m, i) => parts.push(beam(m, mids[(i + 1) % 3]!, 0.007, PROP.wood)));
  parts.push(beam(V(-0.04, 0.37, 0), V(0.25, 0.34, 0), 0.01, PROP.wood));
  parts.push(part(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 8).rotateX(Math.PI / 2), PROP.iron, 0.24, 0.335, 0));
  parts.push(beam(V(0.24, 0.32, 0), V(0.24, 0.12, 0), 0.0035, PROP.rope));
  parts.push(part(new THREE.CylinderGeometry(0.026, 0.02, 0.036, 8), PROP.iron, 0.24, 0.1, 0));
  // A pennant on the apex.
  parts.push(beam(V(0, 0.37, 0), V(0, 0.47, 0), 0.004, PROP.wood));
  parts.push(part(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, 0.47, 0, 0, 0.42, 0, -0.07, 0.445, 0, 0, 0.47, 0, -0.07, 0.445, 0, 0, 0.42, 0], 3)).setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3)), PROP.brick[0]!));
  return mergeGeometries(parts);
}

// A sheep, facing +z: a cloud of wool puffs round a body, a dark face with ears and a woolly tuft, stubby legs and a tail.
// Body centred at y 0 (the sheep stands 0.1 above the ground); reach 0.115. Lying down, it sits on its tucked legs instead.
function sheepGeo(lying = false) {
  const wool = (r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) =>
    part(tone(new THREE.IcosahedronGeometry(r, 1), PROP.wool, PROP.woolLight, PROP.woolShade), null, x, y, z, 0, sx, sy, sz);
  const dy = lying ? -0.045 : 0;
  const parts = [
    wool(0.07, 0, dy, 0, 1.05, 0.9, 1.3),
    ...[[0.045, 0.03, 0.04], [-0.045, 0.03, 0.04], [0.04, 0.035, -0.045], [-0.04, 0.035, -0.045], [0, 0.05, 0]].map(([x, y, z]) => wool(0.042, x!, y! + dy, z!)),
    wool(0.022, 0, 0.03 + dy, -0.1),
    part(tone(new THREE.SphereGeometry(0.036, 12, 9), PROP.face, PROP.faceLight, PROP.face), null, 0, 0.035 + dy * 0.7, 0.105, 0, 0.9, 1, 1.2),
    wool(0.022, 0, 0.068 + dy * 0.7, 0.095),
    ...[-1, 1].map((sd) => part(new THREE.SphereGeometry(0.012, 8, 6), PROP.face, sd * 0.034, 0.048 + dy * 0.7, 0.098, sd * 0.5, 1.5, 0.6, 0.9)),
  ];
  // Stubby legs, half hidden under the fleece.
  if (!lying) for (const [lx, lz] of [[-0.036, 0.045], [0.036, 0.045], [-0.036, -0.045], [0.036, -0.045]] as const) parts.push(part(new THREE.CylinderGeometry(0.022, 0.019, 0.07, 8), PROP.face, lx, -0.065, lz));
  return mergeGeometries(parts);
}

// The ore cart, long along x, wheels 0.13 apart across z (the rails' gauge).
function cartGeo() {
  const parts = [
    part(new THREE.BoxGeometry(0.22, 0.04, 0.18), "#493f33", 0, 0.07, 0),
    part(new THREE.BoxGeometry(0.025, 0.09, 0.2), "#796b53", -0.11, 0.1, 0),
    part(new THREE.BoxGeometry(0.025, 0.09, 0.2), "#796b53", 0.11, 0.1, 0),
    part(new THREE.BoxGeometry(0.22, 0.09, 0.025), "#796b53", 0, 0.1, -0.09),
    part(new THREE.BoxGeometry(0.22, 0.09, 0.025), "#796b53", 0, 0.1, 0.09),
  ];
  for (const x of [-0.07, 0.07]) for (const z of [-0.065, 0.065]) parts.push(part(new THREE.CylinderGeometry(0.043, 0.043, 0.024, 8).rotateX(Math.PI / 2), "#253131", x, 0.045, z));
  for (const [x, z] of [[-0.06, -0.03], [0.04, 0.04], [0.03, -0.04]] as const) parts.push(part(new THREE.DodecahedronGeometry(0.055, 0), "#8796a5", x, 0.14, z, 0, 1, 1, 1, true));
  return mergeGeometries(parts);
}

function minerGeo() {
  return mergeGeometries([
    part(new THREE.BoxGeometry(0.065, 0.085, 0.06), "#283c47", 0, 0.1, 0),
    part(new THREE.IcosahedronGeometry(0.044, 0), "#c8ad87", 0, 0.174, 0),
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 8), "#d1b14d", 0, 0.2, 0),
    part(new THREE.BoxGeometry(0.025, 0.07, 0.025), "#202a2b", -0.02, 0.035, 0),
    part(new THREE.BoxGeometry(0.025, 0.07, 0.025), "#202a2b", 0.02, 0.035, 0),
  ]);
}

function pickaxeGeo() {
  return mergeGeometries([
    part(new THREE.BoxGeometry(0.025, 0.025, 0.09), "#c8ad87", 0.035, 0, 0.035),
    part(new THREE.BoxGeometry(0.015, 0.12, 0.015), "#796b53", 0.06, 0.045, 0.07),
    part(new THREE.BoxGeometry(0.1, 0.025, 0.025), "#a8b6bf", 0.06, 0.1, 0.07),
  ]);
}

// The farmer: a round body in a green smock, a round head under a domed straw hat with a wide brim, stubby legs, and a
// basket of ears at his hip; the harvesting arm is its own kind. 0.24 tall.
function farmerGeo() {
  return mergeGeometries([
    part(tone(new THREE.CapsuleGeometry(0.034, 0.045, 4, 10), PROP.smock, PROP.smockLight, PROP.trousers), null, 0, 0.105, 0, 0, 1, 1, 0.85),
    part(tone(new THREE.SphereGeometry(0.031, 12, 9), PROP.skin, PROP.skinLight, PROP.skin), null, 0, 0.178, 0),
    part(tone(new THREE.CylinderGeometry(0.064, 0.068, 0.01, 16), PROP.straw, PROP.strawEnd, PROP.strawCore), null, 0, 0.198, 0),
    part(tone(new THREE.SphereGeometry(0.034, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), PROP.straw, PROP.strawEnd, PROP.straw), null, 0, 0.2, 0, 0, 1, 0.9, 1),
    ...[-0.016, 0.016].map((lx) => part(new THREE.CapsuleGeometry(0.014, 0.03, 3, 8), PROP.trousers, lx, 0.03, 0)),
    part(new THREE.CylinderGeometry(0.03, 0.024, 0.045, 10), PROP.wood, -0.058, 0.09, 0.012),
    ...[0, 1, 2].map((k) => part(new THREE.SphereGeometry(0.011, 6, 4), PROP.wheat, -0.058 + (k - 1) * 0.013, 0.118, 0.012, 0, 1, 1.8, 1)),
  ]);
}

function sickleGeo() {
  return mergeGeometries([
    part(new THREE.BoxGeometry(0.024, 0.024, 0.085), "#c49972", 0.045, 0, 0.04),
    part(new THREE.BoxGeometry(0.013, 0.013, 0.11), "#7c6847", 0.06, -0.012, 0.07),
    part(new THREE.TorusGeometry(0.034, 0.009, 3, 7, Math.PI), "#b0b9af", 0.06, -0.01, 0.13),
  ]);
}

// A fat stump on its roots, its cut face pale with a darker ring.
const stump = () => [
  part(new THREE.CylinderGeometry(0.046, 0.052, 0.06, 10), PROP.trunk, 0, 0.03, 0),
  part(new THREE.CylinderGeometry(0.042, 0.042, 0.006, 10), PROP.woodEnd, 0, 0.062, 0),
  part(new THREE.CylinderGeometry(0.024, 0.024, 0.007, 10), PROP.wood, 0, 0.063, 0),
  ...roots(0.05, PROP.trunkDark),
];
// A fallen log, pale ring ends, a red-capped mushroom on its back.
const log = () => [
  part(new THREE.CylinderGeometry(0.038, 0.038, 0.22, 10).rotateZ(Math.PI / 2), PROP.trunk, 0, 0.036, 0),
  ...[0.111, -0.111].map((x) => part(new THREE.CylinderGeometry(0.033, 0.033, 0.006, 10).rotateZ(Math.PI / 2), PROP.woodEnd, x, 0.036, 0)),
  part(new THREE.CylinderGeometry(0.008, 0.01, 0.03, 6), PROP.bleached, 0.03, 0.08, 0.01),
  part(new THREE.SphereGeometry(0.022, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), PROP.cap, 0.03, 0.093, 0.01, 0, 1, 0.75, 1),
];
// A fern: seven arching leaves round a low heart.
const fern = () =>
  Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2;
    const g = new THREE.SphereGeometry(1, 8, 4).scale(0.05, 0.012, 0.018).translate(0.045, 0.02, 0).rotateZ(0.42);
    return part(tone(g, PROP.fern, PROP.fernLight, PROP.pineDark), null, 0, 0, 0, a);
  });
// A rounded bush of three puffs, with a few berries (or blossom).
const bush = (r: number, hex: string, dots: string = PROP.berry) => [
  ...[[0, 0.75, 0, 1], [0.6, 0.5, 0.3, 0.75], [-0.45, 0.48, -0.4, 0.7]].map(([x, y, z, k]) =>
    part(tone(new THREE.IcosahedronGeometry(r * k!, 1), hex, PROP.pineLight, PROP.pineDark), null, x! * r, y! * r, z! * r, 0, 1, 0.85, 1),
  ),
  ...[[0.55, 1.1, 0.5], [-0.2, 1.3, 0.62], [0.75, 0.8, -0.35]].map(([x, y, z]) => part(new THREE.IcosahedronGeometry(r * 0.13, 0), dots, x! * r, y! * r, z! * r)),
];
const rock = (r: number, hex: string) => [part(new THREE.DodecahedronGeometry(r, 0), hex, 0, r * 0.45, 0, 0, 1, 0.7, 1, true)];
// A rounded boulder with a pebble at its foot.
const boulder = (r: number, hex: string) => [
  part(new THREE.IcosahedronGeometry(r, 1), hex, 0, r * 0.5, 0, 0, 1.15, 0.75, 1, true),
  part(new THREE.IcosahedronGeometry(r * 0.45, 1), hex, r * 1.05, r * 0.2, r * 0.5, 0.7, 1, 0.7, 1, true),
];
// A cluster of wildflowers: five dots of one colour on short green stems.
const flowers = (hex: string) =>
  [0, 1, 2, 3, 4].flatMap((i) => {
    const [fx, fz] = [Math.cos(i * 2.4) * 0.03 * (i % 3 ? 1 : 0.4), Math.sin(i * 2.4) * 0.03 * (i % 3 ? 1 : 0.4)];
    return [part(new THREE.CylinderGeometry(0.004, 0.006, 0.026, 4), PROP.grass, fx, 0.013, fz), part(new THREE.IcosahedronGeometry(0.011, 0), hex, fx, 0.03, fz, 0, 1, 0.6, 1)];
  });
// A tuft of five broad blades leaning out from a common root.
const tuft = (hex: string) =>
  [0, 1, 2, 3, 4].map((i) => part(new THREE.ConeGeometry(0.014, 0.07, 4).translate(0, 0.035, 0).rotateZ(0.18 + (i % 2) * 0.2), hex, 0, 0, 0, i * 1.26));
// A round bale lying along x: a soft roll with rounded shoulders, two faint twine bands, and on each end the rolled straw's
// rings round a darker core. 0.12 across; reach 0.08.
function roundBale() {
  const [R, H] = [0.06, 0.046];
  const ends = [[0, H], [0.22, H], [0.24, H], [0.5, H], [0.52, H], [0.8, H], [0.94, H - 0.006]] as const;
  const side = [[1, H - 0.02], [1, 0.026], [1, 0.024], [1, 0.014], [1, 0.012]] as const;
  const profile = [...ends.map(([r, y]) => [r * R, -y]), ...side.map(([r, y]) => [r * R, -y]), ...[...side].reverse().map(([r, y]) => [r * R, y]), ...[...ends].reverse().map(([r, y]) => [r * R, y])] as [number, number][];
  const g = lathe(profile, 16);
  const [straw, end, core, ring, twine] = [PROP.straw, PROP.strawEnd, PROP.strawCore, PROP.strawRing, PROP.twine].map(col);
  const p = g.attributes.position!;
  const a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [r, y] = [Math.hypot(p.getX(i), p.getZ(i)) / R, Math.abs(p.getY(i))];
    const c = y > H - 0.001 ? (r < 0.23 ? core : r > 0.5 && r < 0.53 ? ring : end) : y < 0.025 && y > 0.013 ? twine : straw;
    c.toArray(a, i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return [part(g.rotateZ(Math.PI / 2), null, 0, R, 0)];
}
const squareBale = () => [
  part(new THREE.BoxGeometry(0.11, 0.06, 0.07), PROP.straw, 0, 0.03, 0),
  part(new THREE.BoxGeometry(0.008, 0.062, 0.072), PROP.twine, -0.03, 0.03, 0),
  part(new THREE.BoxGeometry(0.008, 0.062, 0.072), PROP.twine, 0.03, 0.03, 0),
];
// A wheat sheaf: a plump bundle of straw bound with twine, its crown of eight fat ears fanning out. 0.17 tall; reach 0.05.
function sheafGeo() {
  const parts = [
    part(tone(lathe([[0.03, 0], [0.024, 0.05], [0.02, 0.075], [0.026, 0.1], [0.036, 0.115], [0, 0.12]], 10), PROP.straw, PROP.strawEnd, PROP.strawCore), null),
    part(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 10), PROP.twine, 0, 0.07, 0),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const lean = i % 2 ? 0.55 : 0.3;
    const g = tone(new THREE.SphereGeometry(0.014, 6, 4).scale(1, 2.4, 1).translate(0, 0.03, 0).rotateZ(lean), PROP.wheat, PROP.strawEnd, PROP.straw);
    parts.push(part(g, null, Math.cos(a) * 0.012, 0.115, Math.sin(a) * 0.012, -a));
  }
  return mergeGeometries(parts);
}

// A scarecrow: a post and a cross-arm in a patched shirt, a sack head under a wide straw hat. 0.3 tall; reach 0.1.
const scarecrow = () => [
  part(new THREE.CylinderGeometry(0.012, 0.014, 0.2, 6), PROP.wood, 0, 0.1, 0),
  part(new THREE.CylinderGeometry(0.01, 0.01, 0.17, 6).rotateZ(Math.PI / 2), PROP.wood, 0, 0.19, 0),
  part(tone(new THREE.CylinderGeometry(0.04, 0.05, 0.09, 8), PROP.shirt, PROP.shirtLight, PROP.shirt), null, 0, 0.17, 0),
  ...[-1, 1].map((sd) => part(new THREE.CylinderGeometry(0.018, 0.022, 0.06, 7).rotateZ(Math.PI / 2), PROP.shirt, sd * 0.065, 0.19, 0)),
  part(tone(new THREE.SphereGeometry(0.035, 10, 8), PROP.sack, PROP.strawEnd, PROP.sack), null, 0, 0.245, 0),
  part(new THREE.CylinderGeometry(0.075, 0.08, 0.012, 12), PROP.straw, 0, 0.27, 0),
  part(new THREE.CylinderGeometry(0.03, 0.038, 0.04, 10), PROP.straw, 0, 0.29, 0),
];
function bricks() {
  const parts = [part(new THREE.BoxGeometry(0.13, 0.016, 0.11), PROP.wood, 0, 0.008, 0)];
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < 3; i++) {
      const o = (i - 1) * 0.036;
      const hex = PROP.brick[(i + layer) % 3]!;
      parts.push(layer ? part(new THREE.BoxGeometry(0.034, 0.026, 0.1), hex, o, 0.016 + 0.013 + 0.026, 0) : part(new THREE.BoxGeometry(0.11, 0.026, 0.034), hex, 0, 0.016 + 0.013, o));
    }
  }
  return parts;
}
const mound = (r: number, hex: string) => [part(new THREE.IcosahedronGeometry(r, 0), hex, 0, r * 0.25, 0, 0.6, 1, 0.6, 1, true)];
// A rock face with a dark adit and its timber frame, opening toward +z; reach 0.16.
function portal() {
  return [
    part(new THREE.DodecahedronGeometry(0.15, 0), PROP.peakLow, 0, 0.06, -0.02, 0.3, 1.1, 0.85, 0.85, true),
    part(new THREE.BoxGeometry(0.08, 0.095, 0.03), PROP.portal, 0, 0.048, 0.115),
    part(new THREE.BoxGeometry(0.018, 0.11, 0.024), PROP.wood, -0.05, 0.055, 0.128),
    part(new THREE.BoxGeometry(0.018, 0.11, 0.024), PROP.wood, 0.05, 0.055, 0.128),
    part(new THREE.BoxGeometry(0.13, 0.022, 0.028), PROP.wood, 0, 0.118, 0.128),
  ];
}
// Two rails 0.13 apart on sleepers, running along +z from z0 to z1.
function rails(z0: number, z1: number) {
  const len = z1 - z0;
  const parts = [-0.065, 0.065].map((x) => part(new THREE.BoxGeometry(0.01, 0.01, len), PROP.iron, x, 0.016, (z0 + z1) / 2));
  for (let z = z0 + 0.03; z < z1; z += 0.06) parts.push(part(new THREE.BoxGeometry(0.17, 0.012, 0.022), PROP.wood, 0, 0.006, z));
  return parts;
}
function cactus() {
  const cap = (r: number, len: number, x: number, y: number) => part(new THREE.CapsuleGeometry(r, len, 3, 8), PROP.cactus, x, y, 0);
  return [
    cap(0.036, 0.17, 0, 0.12),
    cap(0.022, 0.07, 0.065, 0.17),
    part(new THREE.CapsuleGeometry(0.02, 0.04, 3, 8).rotateZ(Math.PI / 2), PROP.cactus, 0.04, 0.12, 0),
    cap(0.02, 0.05, -0.06, 0.13),
    part(new THREE.CapsuleGeometry(0.018, 0.035, 3, 8).rotateZ(Math.PI / 2), PROP.cactus, -0.035, 0.1, 0),
  ];
}
function deadTree() {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  return [
    part(new THREE.CylinderGeometry(0.012, 0.024, 0.22, 6), PROP.deadwood, 0, 0.11, 0),
    beam(V(0, 0.15, 0), V(0.08, 0.25, 0.02), 0.008, PROP.deadwood),
    beam(V(0, 0.12, 0), V(-0.07, 0.2, -0.02), 0.008, PROP.deadwood),
    beam(V(0, 0.2, 0), V(0.01, 0.29, -0.06), 0.006, PROP.deadwood),
  ];
}

// --- where props may stand

// Nothing comes within NEAR of a hex centre (the token's 0.34 plus its 0.05 of ground, docs/design/tokens.md, and a little
// more), and nothing reaches past EDGE of the hex's inradius, so no prop leans over a neighbour.
const NEAR = 0.42;
const EDGE = 0.95;

class Room {
  taken: { x: number; z: number; r: number }[] = [];
  constructor(private rng: () => number, private inr: number) {}
  fits(x: number, z: number, reach: number) {
    return Math.hypot(x, z) - reach >= NEAR && hexDist(x, z) + reach <= EDGE * this.inr;
  }
  // A free spot for something of `reach` between lo and hi from the centre; `gap` < 1 lets neighbours overlap.
  find(reach: number, lo = 0, hi = 1, gap = 1, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const a = this.rng() * Math.PI * 2;
      const rad = lo + this.rng() * (hi - lo);
      const [x, z] = [Math.cos(a) * rad, Math.sin(a) * rad];
      if (!this.fits(x, z, reach) || this.taken.some((t) => Math.hypot(t.x - x, t.z - z) < (t.r + reach) * gap)) continue;
      this.taken.push({ x, z, r: reach });
      return { x, z };
    }
    return null;
  }
  // Whether something of `reach` fits at (x, z) clear of what is placed; `tall` keeps it off the corners, where pieces land.
  free(x: number, z: number, reach: number, gap = 1, tall = false) {
    if (!this.fits(x, z, reach) || (tall && nearest(CORNERS, x, z) < 0.24 + reach * 0.6)) return false;
    return !this.taken.some((t) => Math.hypot(t.x - x, t.z - z) < (t.r + reach) * gap);
  }
  claim(x: number, z: number, r: number) {
    this.taken.push({ x, z, r });
  }
  // A random point between lo and hi from the centre, not yet claimed (the caller may move it, check it and claim it).
  spot(lo: number, hi: number) {
    const a = this.rng() * Math.PI * 2;
    const rad = lo + this.rng() * (hi - lo);
    return { x: Math.cos(a) * rad, z: Math.sin(a) * rad };
  }
}

// Every prop on one hex, from the same seeded stream that laid out its top.
export function decorate(kit: PropKit, life: Life, h: HexCell, x: number, z: number, sc: Sculpt, rng: () => number) {
  const L = sc.layout;
  const room = L.room;
  const y = (lx: number, lz: number) => sc.ground(lx, lz);
  const fp = (lx: number, lz: number, reach: number): Footprint => ({ hex: h.id, x: x + lx, z: z + lz, reach });
  const put = (name: string, parts: THREE.BufferGeometry[], lx: number, lz: number, reach: number | null, rotY = rng() * Math.PI * 2, sink = 0.006) =>
    kit.add(name, placeAt(parts, x + lx, y(lx, lz) - sink, z + lz, rotY), reach === null ? null : fp(lx, lz, reach));
  const t = h.terrain;
  const corner = dirAt(30 + 60 * L.k);

  if (t === "timber") {
    for (const { x: tx, z: tz, s } of L.stands) {
      const tree = kit.proxy("tree", pineGeo, { prop: "tree", hex: h.id, reach: 0.15 * s, sway: 0.028 }, true, PINE_TINTS[Math.floor(rng() * 3)]);
      tree.position.set(x + tx, y(tx, tz) - 0.01, z + tz);
      tree.rotation.y = rng() * Math.PI * 2;
      tree.scale.setScalar(s);
      tree.userData.base = tree.scale.clone();
      life.tall.push(tree);
    }
    // The log lies in the clearing's hollow; stumps, ferns and a bush or two wherever there is room.
    const f = L.feature;
    if (room.free(f.x, f.z, 0.12)) {
      room.claim(f.x, f.z, 0.12);
      put("timber", log(), f.x, f.z, 0.12, Math.atan2(f.z, f.x) + Math.PI / 2 + (rng() - 0.5) * 0.8);
    }
    for (const [make, reach, count] of [[stump, 0.06, 2], [fern, 0.07, 4], [() => bush(0.05, PROP.hedge), 0.07, 2]] as const) {
      for (let i = 0; i < count; i++) {
        const at = room.find(reach, 0, 1, 0.9);
        if (at) put("timber", make(), at.x, at.z, reach);
      }
    }
  }

  if (t === "wool") {
    // Sheep graze on the swells (they wander the 0.54-0.74 ring).
    const swells = L.spots.length ? L.spots : [{ x: 0.66, z: 0, r: 0.3, h: 0 }];
    for (let i = 0, placed = 0; i < 24 && placed < 4; i++) {
      const sw = swells[placed % swells.length]!;
      const a = Math.atan2(sw.z, sw.x) + (rng() - 0.5) * 0.9;
      const rad = 0.56 + rng() * 0.16;
      const [lx, lz] = [Math.cos(a) * rad, Math.sin(a) * rad];
      if (!room.free(lx, lz, 0.115)) continue;
      room.claim(lx, lz, 0.115);
      placed++;
      const g = kit.proxy("sheep", sheepGeo, { prop: "sheep", hex: h.id, reach: 0.115 }, false);
      g.position.set(x + lx, y(lx, lz) + 0.1, z + lz);
      g.rotation.y = rng() * Math.PI * 2;
      life.sheep.push({ g, ox: x, oz: z, tx: x + lx, tz: z + lz, wait: rng() * 2, graze: 0, ground: (wx, wz) => sc.ground(wx - x, wz - z) });
    }
    // A hedgerow along the ridge's crest, its puffs a little uneven, with blossom.
    const rg = L.ridge!;
    for (let i = 0, n = Math.round(Math.hypot(rg.bx - rg.ax, rg.bz - rg.az) / 0.085); i <= n; i++) {
      const u = i / n;
      const [lx, lz] = [rg.ax + (rg.bx - rg.ax) * u, rg.az + (rg.bz - rg.az) * u];
      const r = 0.045 + rng() * 0.012;
      if (!room.fits(lx, lz, r)) continue;
      room.claim(lx, lz, r);
      put("wool", bush(r, PROP.hedge, PROP.blossom), lx, lz, r);
    }
    // One sheep lies in the grass and stays.
    const lie = room.find(0.115, 0.55, 0.8);
    if (lie) {
      const rest = kit.proxy("sheep-rest", () => sheepGeo(true), { prop: "sheep-rest", hex: h.id, reach: 0.115 }, false);
      rest.position.set(x + lie.x, y(lie.x, lie.z) + 0.1, z + lie.z);
      rest.rotation.y = rng() * Math.PI * 2;
    }
    for (let i = 0; i < 3; i++) {
      const r = 0.035 + rng() * 0.015;
      const at = room.find(r * 1.5, 0.5, 0.95);
      if (at) put("wool", boulder(r, PROP.stone), at.x, at.z, r * 1.5);
    }
    for (let i = 0; i < 5; i++) {
      const at = room.find(0.04, 0.45, 0.95);
      if (at) put("wool", tuft(PROP.grass), at.x, at.z, 0.04);
    }
    for (let i = 0; i < 6; i++) {
      const at = room.find(0.04, 0.45, 0.95, 0.6);
      if (at) put("wool", flowers(PROP.flowers[i % PROP.flowers.length]!), at.x, at.z, 0.04);
    }
  }

  if (t === "grain") {
    const angle = rng() * Math.PI * 2;
    const [fx, fz] = [Math.cos(angle) * 0.65, Math.sin(angle) * 0.65];
    room.claim(fx, fz, 0.2);
    const body = kit.proxy("farmer", farmerGeo, { prop: "farmer", hex: h.id, reach: 0.14 });
    const arm = kit.proxy("harvesting", sickleGeo, { prop: "harvesting", hex: h.id, reach: 0.14 }, false);
    body.position.set(x + fx, y(fx, fz), z + fz);
    arm.position.set(x + fx, y(fx, fz) + 0.13, z + fz);
    life.farmWork.push({ body, arm, x: x + fx, z: z + fz, phase: rng() * 18, angle: angle + Math.PI / 2, ground: (wx, wz) => sc.ground(wx - x, wz - z) });
    const parts: THREE.BufferGeometry[] = [];
    const prints: Footprint[] = [];
    // A point moved onto the nearest furrow trough (between two ridges) or crest, and the furrow's direction there.
    const [cs, sn] = [Math.cos(L.axis), Math.sin(L.axis)];
    const onFurrow = (px: number, pz: number, crest: boolean) => {
      for (let i = 0; i < 3; i++) {
        const [u, v] = [px * cs + pz * sn, -px * sn + pz * cs];
        const c = u * u - v * v;
        const want = (Math.round(c / FURROW_DC - (crest ? 0.5 : 0)) + (crest ? 0.5 : 0)) * FURROW_DC;
        const [gu, gv] = [2 * u, -2 * v];
        const k = (want - c) / (gu * gu + gv * gv || 1);
        [px, pz] = [px + k * (gu * cs - gv * sn), pz + k * (gu * sn + gv * cs)];
      }
      const [u, v] = [px * cs + pz * sn, -px * sn + pz * cs];
      const [gx, gz] = [2 * u * cs + 2 * v * sn, 2 * u * sn - 2 * v * cs];
      return { x: px, z: pz, along: Math.atan2(gx, gz) };
    };
    // Three round bales lie in the furrows' shadow, along them; a sheaf or two stand on the crests.
    for (let i = 0, placed = 0; i < 40 && placed < 3; i++) {
      const at = room.spot(0.55, 0.72);
      const b = onFurrow(at.x, at.z, false);
      if (fieldAt(b.x, b.z, L.axis) < 0.6 || !room.free(b.x, b.z, 0.08)) continue;
      room.claim(b.x, b.z, 0.08);
      parts.push(placeAt(roundBale(), b.x, y(b.x, b.z) - 0.004, b.z, b.along));
      prints.push(fp(b.x, b.z, 0.08));
      placed++;
    }
    for (let i = 0, placed = 0; i < 60 && placed < 8; i++) {
      const at = room.spot(0.5, 0.75);
      const w = onFurrow(at.x, at.z, true);
      if (fieldAt(w.x, w.z, L.axis) < 0.5 || !room.free(w.x, w.z, 0.05, 0.8)) continue;
      room.claim(w.x, w.z, 0.05);
      const sheaf = kit.proxy("wheat", sheafGeo, { prop: "wheat", hex: h.id, reach: 0.05, sway: 0.035 }, false);
      sheaf.position.set(x + w.x, y(w.x, w.z) + 0.006, z + w.z);
      sheaf.rotation.y = rng() * Math.PI * 2;
      sheaf.userData.base = sheaf.scale.clone();
      life.tall.push(sheaf);
      placed++;
    }
    // A scarecrow keeps watch over one field in ten.
    if (rng() < 0.1) {
      const at = room.find(0.1, 0.55, 0.75);
      if (at) {
        parts.push(placeAt(scarecrow(), at.x, y(at.x, at.z) - 0.004, at.z, rng() * Math.PI * 2));
        prints.push(fp(at.x, at.z, 0.1));
      }
    }
    if (parts.length) kit.field(h.id, x, z, parts, prints);
  }

  if (t === "clay") {
    const pit = L.feature;
    room.claim(pit.x, pit.z, pit.r);
    // The derrick stands beside the pit, its boom over the terraces.
    const side = rng() < 0.5 ? -1 : 1;
    const a = Math.atan2(pit.z, pit.x) + side * 0.62;
    const [dx, dz] = [Math.cos(a) * 0.72, Math.sin(a) * 0.72];
    room.claim(dx, dz, 0.12);
    const derrick = kit.proxy("derrick", derrickGeo, { prop: "derrick", hex: h.id, reach: 0.27 });
    derrick.position.set(x + dx, y(dx, dz) - 0.005, z + dz);
    derrick.rotation.y = Math.atan2(-(pit.z - dz), pit.x - dx);
    derrick.userData.base = derrick.scale.clone();
    life.tall.push(derrick);
    for (let i = 0; i < 2; i++) {
      const at = room.find(0.09, 0.5, 0.9);
      if (at) put("clay", bricks(), at.x, at.z, 0.09);
    }
    for (let i = 0; i < 2; i++) {
      const r = 0.07 + rng() * 0.04;
      const at = room.find(r, 0.5, 0.9);
      if (at) put("clay", mound(r, i % 2 ? PAINT.clay[1] : PAINT.clay[0]), at.x, at.z, r);
    }
  }

  if (t === "ore") {
    // Two or three peaks leaning toward the feature's corner, the tallest in the middle.
    const a0 = Math.atan2(corner.z, corner.x);
    const peaks: [number, number, number][] = [[0, 0.23, 0.6 + rng() * 0.08], [0.62, 0.19, 0.42 + rng() * 0.08]];
    if (rng() < 0.7) peaks.push([-0.62, 0.17, 0.36 + rng() * 0.06]);
    for (const [da, r, ht] of peaks) {
      const [lx, lz] = [Math.cos(a0 + da) * 0.66, Math.sin(a0 + da) * 0.66];
      room.claim(lx, lz, r);
      const peak = kit.proxy("peak", peakGeo, { prop: "peak", hex: h.id, reach: r * 1.12 });
      peak.position.set(x + lx, y(lx, lz) - 0.02, z + lz);
      peak.rotation.y = rng() * Math.PI * 2;
      peak.scale.set(r, ht, r);
      peak.userData.base = peak.scale.clone();
      life.tall.push(peak);
    }
    // The mine on the far side: the adit faces along the ring, its rails run out of it, the cart on them, the miner by it.
    const am = a0 + Math.PI;
    const [px, pz] = [Math.cos(am) * 0.68, Math.sin(am) * 0.68];
    const tan = { x: -Math.sin(am), z: Math.cos(am) };
    const face = Math.atan2(tan.x, tan.z);
    put("ore", portal(), px, pz, 0.16, face, 0.01);
    put("ore", rails(0.13, 0.43), px, pz, null, face, 0.004);
    kit.mark("ore", fp(px + tan.x * 0.28, pz + tan.z * 0.28, 0.17));
    room.claim(px, pz, 0.16);
    room.claim(px + tan.x * 0.28, pz + tan.z * 0.28, 0.17);
    const [cx, cz] = [px + tan.x * 0.3, pz + tan.z * 0.3];
    const cart = kit.proxy("wagon", cartGeo, { prop: "wagon", hex: h.id, reach: 0.17 });
    cart.position.set(x + cx, y(cx, cz) + 0.012, z + cz);
    cart.rotation.y = Math.atan2(-tan.z, tan.x);
    const mAng = am - side3(rng) * 0.85;
    const [mx, mz] = [Math.cos(mAng) * 0.6, Math.sin(mAng) * 0.6];
    room.claim(mx, mz, 0.12);
    const miner = kit.proxy("miner", minerGeo, { prop: "miner", hex: h.id, reach: 0.17 });
    const pick = kit.proxy("pickaxe", pickaxeGeo, { prop: "pickaxe", hex: h.id, reach: 0.17 }, false);
    miner.position.set(x + mx, y(mx, mz), z + mz);
    pick.position.set(x + mx, y(mx, mz) + 0.14, z + mz);
    miner.rotation.y = pick.rotation.y = Math.atan2(px - mx, pz - mz);
    life.oreWork.push({ cart, arm: pick, x: x + cx, z: z + cz, dx: tan.x, dz: tan.z, phase: rng() * Math.PI * 2 });
    for (let i = 0; i < 2; i++) {
      const r = 0.04 + rng() * 0.03;
      const at = room.find(r, 0.45, 0.9);
      if (at) put("ore", rock(r, PROP.peakLow), at.x, at.z, r);
    }
  }

  if (t === "waste") {
    for (const [make, reach] of [[cactus, 0.09], [deadTree, 0.09]] as const) {
      const at = room.find(reach, 0.55, 0.85);
      if (at) put("waste", make(), at.x, at.z, reach);
    }
    for (let i = 0; i < 3; i++) {
      const r = 0.03 + rng() * 0.03;
      const at = room.find(r, 0.5, 0.92);
      if (at) put("waste", rock(r, PROP.bleached), at.x, at.z, r);
    }
    for (let i = 0; i < 2; i++) {
      const at = room.find(0.04, 0.5, 0.9);
      if (at) put("waste", tuft(PROP.deadwood), at.x, at.z, 0.04);
    }
  }
}

const side3 = (rng: () => number) => (rng() < 0.5 ? -1 : 1);
