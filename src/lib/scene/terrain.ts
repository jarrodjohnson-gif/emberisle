import * as THREE from "three";
import type { HexCell, Terrain } from "@/lib/game/types";
import { PAINT, STRATA } from "@/lib/scene/palette";

// The sculpted tiles (#599, docs/design/terrain.md): a raised slab per hex whose top is a gentle heightfield on a triangular
// lattice, flat where the token and the pieces stand, a rounded rim, and a side cut into sand, soil and rock strata.

const SQ3 = Math.sqrt(3);
// Lattice rings across the top (6 R^2 triangles), the rim's width and drop (corner-radius units) and its segments.
const RINGS = 20;
const BEVEL_W = 0.06;
const BEVEL_H = 0.045;
const BEVEL_SEGS = 3;
// The side runs a little below the tile's base, so no seam shows through the crystal sea.
const SKIRT = 0.04;

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

// The per-hex layout, drawn from the hex's own seeded stream: a rotation in 60 degree steps, the noise seed, the relief's
// strength, and where the terrain's feature sits (the clay pit, the ore peaks), in hex-local coordinates.
export type Layout = { k: number; rot: number; seed: number; amp: number; feature: { x: number; z: number; r: number } };

export type Sculpt = {
  geo: THREE.BufferGeometry;
  layout: Layout;
  // The world y of the top at a hex-local point.
  ground: (lx: number, lz: number) => number;
};

// A unit vector at a corner (j even) or a flat's normal (j odd), in 30 degree steps from +x: corners sit at 30 + 60 n.
export const dirAt = (deg: number) => ({ x: Math.cos((deg * Math.PI) / 180), z: Math.sin((deg * Math.PI) / 180) });

export function layoutOf(rng: () => number): Layout {
  const k = Math.floor(rng() * 6);
  const rot = (k * Math.PI) / 3;
  const seed = Math.floor(rng() * 1e6);
  const amp = 0.8 + rng() * 0.4;
  // The feature leans toward a corner, where the hex has the most room between the token and the rim.
  const c = dirAt(30 + 60 * k);
  const feature = { x: c.x * 0.7, z: c.z * 0.7, r: 0.27 };
  return { k, rot, seed, amp, feature };
}

// The terrain's own relief, before the masks that hold the centre and the rim flat. Positive is up.
function relief(t: Terrain, x: number, z: number, L: Layout, s: number): number {
  switch (t) {
    case "timber":
      return 0.045 * L.amp * fbm(x * 2.2, z * 2.2, L.seed);
    case "wool":
      return 0.07 * L.amp * fbm(x * 1.7, z * 1.7, L.seed) + 0.012;
    case "grain": {
      const g = grainRows(x, z, L, s);
      return -0.016 * g.furrow * (1 - g.path) - 0.022 * g.path + 0.008 * fbm(x * 2, z * 2, L.seed);
    }
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

// Grain: three plots of ploughed rows, each running along one of the lattice's own directions so a furrow is exactly one
// lattice line in three (crisp, never aliased), split by a shallow path along the plots' borders.
function grainRows(x: number, z: number, L: Layout, s: number) {
  const q = x / ((SQ3 / 2) * s);
  const r = z / s - 0.5 * q;
  const a = (((Math.atan2(z, x) - L.rot) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const sector = Math.min(2, Math.floor(a / ((2 * Math.PI) / 3)));
  const idx = [r, q, q + r][(sector + L.k) % 3]!;
  const furrow = Math.max(0, Math.cos((2 * Math.PI * idx) / 3));
  const off = a - sector * ((2 * Math.PI) / 3);
  const perp = Math.hypot(x, z) * Math.sin(Math.min(off, (2 * Math.PI) / 3 - off, Math.PI / 2));
  const path = 1 - smooth(0.025, 0.05, perp);
  return { furrow, path };
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

// Every hex: a slab of `size` (corner radius) and `slabH`, base at y 0 in its own frame, standing at `tileY` in the world.
export function sculptHex(h: HexCell, size: number, slabH: number, tileY: number, rng: () => number): Sculpt {
  const L = layoutOf(rng);
  const t = h.terrain;
  const top = size - BEVEL_W;
  const s = top / RINGS;
  const inr = (size * SQ3) / 2;
  const height = (x: number, z: number) => {
    const raw = relief(t, x, z, L, s);
    const centre = smooth(0.4, 0.56, Math.hypot(x, z));
    const d = hexDist(x, z) / inr;
    const mask = raw > 0 ? 1 - smooth(0.6, 0.78, d) : 1 - smooth(0.8, 0.93, d);
    return raw * centre * mask;
  };
  const [base, shade] = [col(PAINT[t][0]), col(PAINT[t][1])];
  const light = base.clone().lerp(new THREE.Color(1, 1, 1), 0.22);
  const sand = col(STRATA.sand);
  const paint = (x: number, z: number, dh: number) => {
    const c = shade.clone().lerp(base, Math.min(1, Math.max(0, 0.66 + dh * 7)));
    if (dh > 0.025) c.lerp(light, Math.min(1, (dh - 0.025) * 18));
    if (t === "grain") {
      const g = grainRows(x, z, L, s);
      c.lerp(shade, 0.5 * g.furrow * (1 - g.path) * smooth(0.36, 0.5, Math.hypot(x, z)));
      c.lerp(sand, 0.8 * g.path * smooth(0.38, 0.5, Math.hypot(x, z)));
    }
    if (t === "clay") {
      const p = pitLevel(x, z, L);
      if (p.riser) c.copy(shade);
      else if (p.step > 0.5) c.copy(p.level % 2 ? base : base.clone().lerp(light, 0.5));
      if (p.step >= 2.99) c.copy(shade).multiplyScalar(0.8);
    }
    return c;
  };

  const pos: number[] = [];
  const nor: number[] = [];
  const cols: number[] = [];
  const glow: number[] = [];
  type V = { p: [number, number, number]; n: [number, number, number]; c: THREE.Color; g: number };
  const push = (v: V) => {
    pos.push(...v.p);
    nor.push(...v.n);
    cols.push(v.c.r, v.c.g, v.c.b);
    glow.push(v.g);
  };
  // A triangle wound so its face points along `ref`.
  const tri = (a: V, b: V, c: V, ref: [number, number, number]) => {
    const [ux, uy, uz] = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]];
    const [vx, vy, vz] = [c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]];
    const dot = (uy * vz - uz * vy) * ref[0] + (uz * vx - ux * vz) * ref[1] + (ux * vy - uy * vx) * ref[2];
    push(a);
    if (dot >= 0) (push(b), push(c));
    else (push(c), push(b));
  };
  const UP: [number, number, number] = [0, 1, 0];

  // The top: the lattice points within R steps of the centre, each displaced, shaded by its slope and painted by its height.
  const R = RINGS;
  const grid = new Map<number, V>();
  const key = (q: number, r: number) => (q + R + 1) * 64 + (r + R + 1);
  const e = 0.01;
  for (let q = -R; q <= R; q++) {
    for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
      const x = (SQ3 / 2) * s * q;
      const z = 0.5 * s * q + s * r;
      const dh = height(x, z);
      const n = new THREE.Vector3(-(height(x + e, z) - height(x - e, z)) / (2 * e), 1, -(height(x, z + e) - height(x, z - e)) / (2 * e)).normalize();
      grid.set(key(q, r), { p: [x, slabH + dh, z], n: [n.x, n.y, n.z], c: paint(x, z, dh), g: 1 });
    }
  }
  for (let q = -R; q < R; q++) {
    for (let r = -R; r < R; r++) {
      const a = grid.get(key(q, r));
      const b = grid.get(key(q + 1, r));
      const c = grid.get(key(q, r + 1));
      const d = grid.get(key(q + 1, r + 1));
      if (a && b && c) tri(a, b, c, UP);
      if (b && d && c) tri(b, d, c, UP);
    }
  }

  // The boundary ring of the top, corner to corner, with each point's outward direction (a corner's own, or its flat's).
  const steps: [number, number][] = [[-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]];
  const corners: [number, number][] = [[R, 0], [0, R], [-R, R], [-R, 0], [0, -R], [R, -R]];
  const ring: { x: number; z: number; ox: number; oz: number; edge: number }[] = [];
  for (let c = 0; c < 6; c++) {
    const flat = dirAt(60 + 60 * c);
    for (let i = 0; i < R; i++) {
      const [q, r] = [corners[c]![0] + steps[c]![0] * i, corners[c]![1] + steps[c]![1] * i];
      const x = (SQ3 / 2) * s * q;
      const z = 0.5 * s * q + s * r;
      const o = i === 0 ? { x: x / top, z: z / top } : flat;
      ring.push({ x, z, ox: o.x, oz: o.z, edge: c });
    }
  }
  const lip = shade.clone().multiplyScalar(0.92);
  const N = ring.length;
  // The rim: a quarter round from the top's edge out to the full hex, BEVEL_H down.
  const rimAt = (i: number, j: number): V => {
    const p = ring[i % N]!;
    const a = (j / BEVEL_SEGS) * (Math.PI / 2);
    const f = (top + (size - top) * Math.sin(a)) / top;
    const n = new THREE.Vector3(p.ox * Math.sin(a), Math.cos(a), p.oz * Math.sin(a)).normalize();
    const c = paint(p.x, p.z, 0).lerp(lip, j / BEVEL_SEGS);
    return { p: [p.x * f, slabH - BEVEL_H * (1 - Math.cos(a)), p.z * f], n: [n.x, n.y, n.z], c, g: 1 };
  };
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < BEVEL_SEGS; j++) {
      const p = ring[i]!;
      const ref: [number, number, number] = [p.ox, 1, p.oz];
      const [a, b, c, d] = [rimAt(i, j), rimAt(i + 1, j), rimAt(i, j + 1), rimAt(i + 1, j + 1)];
      tri(a, b, d, ref);
      tri(a, d, c, ref);
    }
  }

  // The side: four bands with wavy borders (the lip in the terrain's shade, then sand, soil and rock), flat per face.
  const H = slabH - BEVEL_H;
  const bands = [lip, sand, col(STRATA.soil), col(STRATA.rock)];
  const borders = (i: number) => {
    const u = (i % N) / N;
    return [
      H,
      H - 0.028 - 0.012 * (0.5 + 0.5 * noise(u * 14, 0.5, L.seed)),
      H * 0.52 + 0.025 * noise(u * 9, 3.5, L.seed),
      H * 0.2 + 0.018 * noise(u * 11, 9.5, L.seed),
      -SKIRT,
    ];
  };
  const k = size / top;
  for (let i = 0; i < N; i++) {
    const [p0, p1] = [ring[i]!, ring[(i + 1) % N]!];
    const n = dirAt(60 + 60 * p0.edge);
    const nn: [number, number, number] = [n.x, 0, n.z];
    const [b0, b1] = [borders(i), borders(i + 1)];
    for (let band = 0; band < 4; band++) {
      const v = (p: typeof p0, y: number): V => ({ p: [p.x * k, y, p.z * k], n: nn, c: bands[band]!, g: 0 });
      const [a, b, c, d] = [v(p0, b0[band]!), v(p1, b1[band]!), v(p0, b0[band + 1]!), v(p1, b1[band + 1]!)];
      tri(a, b, d, nn);
      tri(a, d, c, nn);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  geo.setAttribute("aGlow", new THREE.Float32BufferAttribute(glow, 1));
  return { geo, layout: L, ground: (lx, lz) => tileY + slabH + height(lx, lz) };
}

// The tile's material: vertex colours, matte, and the paying-hex flash (docs/design/dice.md) on the top and rim only.
const glowOnTop = (shader: THREE.WebGLProgramParametersWithUniforms) => {
  shader.vertexShader = "attribute float aGlow;\nvarying float vGlow;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvGlow = aGlow;");
  shader.fragmentShader = "varying float vGlow;\n" + shader.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vGlow;");
};
export function tileMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = glowOnTop;
  m.customProgramCacheKey = () => "sculpted-tile";
  return m;
}
