import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { HEX_SIZE } from "@/lib/game/hex";
import type { HexCell, Terrain } from "@/lib/game/types";
import { PAINT, PROP, STRATA } from "@/lib/scene/palette";

// The sculpted tiles (#599, docs/design/terrain.md): a raised slab per hex whose top is a gentle heightfield on a triangular
// lattice, flat where the token and the pieces stand, a rounded rim, and a side cut into sand, soil and rock strata.

const SQ3 = Math.sqrt(3);
// Lattice rings across the top (6 R^2 triangles), the rim's width and drop (corner-radius units) and its segments.
const RINGS = 14;
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
  const feature = { x: c.x * 0.7, z: c.z * 0.7, r: 0.33 };
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

// The top's lattice, the same for every hex of a given RINGS: the points (axial q, r) and the upward triangles over them.
const topologies = new Map<number, { count: number; q: Int16Array; r: Int16Array; index: Uint16Array }>();
function topology(R: number) {
  let t = topologies.get(R);
  if (t) return t;
  const id = new Map<number, number>();
  const key = (q: number, r: number) => (q + R + 1) * 64 + (r + R + 1);
  const q: number[] = [];
  const r: number[] = [];
  for (let a = -R; a <= R; a++) {
    for (let b = Math.max(-R, -a - R); b <= Math.min(R, -a + R); b++) {
      id.set(key(a, b), q.length);
      q.push(a);
      r.push(b);
    }
  }
  // Counter-clockwise seen from above (+y): the lattice's x runs along q and z along r + q / 2.
  const index: number[] = [];
  for (let a = -R; a < R; a++) {
    for (let b = -R; b < R; b++) {
      const [p0, p1, p2, p3] = [id.get(key(a, b)), id.get(key(a + 1, b)), id.get(key(a, b + 1)), id.get(key(a + 1, b + 1))];
      if (p0 !== undefined && p1 !== undefined && p2 !== undefined) index.push(p0, p2, p1);
      if (p1 !== undefined && p3 !== undefined && p2 !== undefined) index.push(p1, p2, p3);
    }
  }
  t = { count: q.length, q: Int16Array.from(q), r: Int16Array.from(r), index: Uint16Array.from(index) };
  topologies.set(R, t);
  return t;
}

// Every hex: a slab of `size` (corner radius) and `slabH`, base at y 0 in its own frame, standing at `tileY` in the world.
export function sculptHex(h: HexCell, size: number, slabH: number, tileY: number, rng: () => number): Sculpt {
  const L = layoutOf(rng);
  const t = h.terrain;
  const top = size - BEVEL_W;
  const s = top / RINGS;
  const inr = (size * SQ3) / 2;
  const height = (x: number, z: number) => {
    if (x * x + z * z < 0.16) return 0;
    const raw = relief(t, x, z, L, s);
    const centre = smooth(0.4, 0.56, Math.hypot(x, z));
    const d = hexDist(x, z) / inr;
    const mask = raw > 0 ? 1 - smooth(0.6, 0.78, d) : 1 - smooth(0.8, 0.93, d);
    return raw * centre * mask;
  };
  const [base, shade] = [col(PAINT[t][0]), col(PAINT[t][1])];
  const light = base.clone().lerp(WHITE, 0.22);
  const terrace = base.clone().lerp(light, 0.5);
  const pit = shade.clone().multiplyScalar(0.8);
  const sand = col(STRATA.sand);
  // One scratch colour: `paint` fills it, the caller reads it at once.
  const c = new THREE.Color();
  const paint = (x: number, z: number, dh: number) => {
    c.copy(shade).lerp(base, Math.min(1, Math.max(0, 0.66 + dh * 7)));
    if (dh > 0.025) c.lerp(light, Math.min(1, (dh - 0.025) * 18));
    if (t === "grain") {
      const g = grainRows(x, z, L, s);
      const m = Math.hypot(x, z);
      c.lerp(shade, 0.5 * g.furrow * (1 - g.path) * smooth(0.36, 0.5, m));
      c.lerp(sand, 0.8 * g.path * smooth(0.38, 0.5, m));
    }
    if (t === "clay") {
      const p = pitLevel(x, z, L);
      if (p.riser) c.copy(shade);
      else if (p.step > 0.5) c.copy(p.level % 2 ? base : terrace);
      if (p.step >= 2.99) c.copy(pit);
    }
    return c;
  };

  const R = RINGS;
  const T = topology(R);
  const N = 6 * R;
  const verts = T.count + N * (BEVEL_SEGS + 1) + N * 5 * 4;
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const cols = new Float32Array(verts * 3);
  const glow = new Float32Array(verts).fill(1);
  const idx = new Uint16Array(T.index.length + N * BEVEL_SEGS * 6 + N * 5 * 6);
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
  // A triangle wound so its face points along (rx, ry, rz).
  const tri = (a: number, b: number, d: number, rx: number, ry: number, rz: number) => {
    const [ux, uy, uz] = [pos[b * 3]! - pos[a * 3]!, pos[b * 3 + 1]! - pos[a * 3 + 1]!, pos[b * 3 + 2]! - pos[a * 3 + 2]!];
    const [vx, vy, vz] = [pos[d * 3]! - pos[a * 3]!, pos[d * 3 + 1]! - pos[a * 3 + 1]!, pos[d * 3 + 2]! - pos[a * 3 + 2]!];
    const dot = (uy * vz - uz * vy) * rx + (uz * vx - ux * vz) * ry + (ux * vy - uy * vx) * rz;
    idx[ni++] = a;
    if (dot >= 0) (idx[ni++] = b, idx[ni++] = d);
    else (idx[ni++] = d, idx[ni++] = b);
  };

  // The top: the lattice points within R steps of the centre, each displaced, shaded by its slope and painted by its height.
  // The lattice topology (which points, which triangles) is the same for every hex; only the heights and colours are per hex.
  const e = 0.01;
  for (let i = 0; i < T.count; i++) {
    const x = (SQ3 / 2) * s * T.q[i]!;
    const z = 0.5 * s * T.q[i]! + s * T.r[i]!;
    const h0 = height(x, z);
    const gx = (height(x + e, z) - h0) / e;
    const gz = (height(x, z + e) - h0) / e;
    const il = 1 / Math.hypot(gx, 1, gz);
    paint(x, z, h0);
    vert(x, slabH + h0, z, -gx * il, il, -gz * il, c, 1);
  }

  // The boundary ring of the top, corner to corner, with each point's outward direction (a corner's own, or its flat's).
  const steps: [number, number][] = [[-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]];
  const corners: [number, number][] = [[R, 0], [0, R], [-R, R], [-R, 0], [0, -R], [R, -R]];
  const ring: { x: number; z: number; ox: number; oz: number; edge: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const flat = dirAt(60 + 60 * k);
    for (let i = 0; i < R; i++) {
      const [q, r] = [corners[k]![0] + steps[k]![0] * i, corners[k]![1] + steps[k]![1] * i];
      const x = (SQ3 / 2) * s * q;
      const z = 0.5 * s * q + s * r;
      const o = i === 0 ? { x: x / top, z: z / top } : flat;
      ring.push({ x, z, ox: o.x, oz: o.z, edge: k });
    }
  }
  const lip = shade.clone().multiplyScalar(0.92);
  // The rim: a quarter round from the top's edge out to the full hex, BEVEL_H down; one vertex per ring point and step.
  const rim = new Int32Array(N * (BEVEL_SEGS + 1));
  for (let i = 0; i < N; i++) {
    const p = ring[i]!;
    for (let j = 0; j <= BEVEL_SEGS; j++) {
      const a = (j / BEVEL_SEGS) * (Math.PI / 2);
      const f = (top + (size - top) * Math.sin(a)) / top;
      const [nx, ny, nz] = [p.ox * Math.sin(a), Math.cos(a), p.oz * Math.sin(a)];
      const il = 1 / Math.hypot(nx, ny, nz);
      paint(p.x, p.z, 0).lerp(lip, j / BEVEL_SEGS);
      rim[i * (BEVEL_SEGS + 1) + j] = vert(p.x * f, slabH - BEVEL_H * (1 - Math.cos(a)), p.z * f, nx * il, ny * il, nz * il, c, 1);
    }
  }
  const W = BEVEL_SEGS + 1;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < BEVEL_SEGS; j++) {
      const p = ring[i]!;
      const [a, b, cc, d] = [rim[i * W + j]!, rim[((i + 1) % N) * W + j]!, rim[i * W + j + 1]!, rim[((i + 1) % N) * W + j + 1]!];
      tri(a, b, d, p.ox, 1, p.oz);
      tri(a, d, cc, p.ox, 1, p.oz);
    }
  }

  // The side: five bands with wavy borders (the lip in the terrain's shade, sand, a thin shell band, caramel soil, chocolate
  // rock), flat per face.
  const H = slabH - BEVEL_H;
  const bands = [lip, sand, col(STRATA.shell), col(STRATA.soil), col(STRATA.rock)];
  const borders = (i: number) => {
    const u = (i % N) / N;
    return [
      H,
      H - 0.028 - 0.012 * (0.5 + 0.5 * noise(u * 14, 0.5, L.seed)),
      H * 0.56 + 0.025 * noise(u * 9, 3.5, L.seed),
      H * 0.5 + 0.025 * noise(u * 9, 3.5, L.seed),
      H * 0.2 + 0.018 * noise(u * 11, 9.5, L.seed),
      -SKIRT,
    ];
  };
  const k = size / top;
  let b0 = borders(0);
  for (let i = 0; i < N; i++) {
    const [p0, p1] = [ring[i]!, ring[(i + 1) % N]!];
    const n = dirAt(60 + 60 * p0.edge);
    const b1 = borders(i + 1);
    for (let band = 0; band < bands.length; band++) {
      const bc = bands[band]!;
      const a = vert(p0.x * k, b0[band]!, p0.z * k, n.x, 0, n.z, bc, 0);
      const b = vert(p1.x * k, b1[band]!, p1.z * k, n.x, 0, n.z, bc, 0);
      const cc = vert(p0.x * k, b0[band + 1]!, p0.z * k, n.x, 0, n.z, bc, 0);
      const d = vert(p1.x * k, b1[band + 1]!, p1.z * k, n.x, 0, n.z, bc, 0);
      tri(a, b, d, n.x, 0, n.z);
      tri(a, d, cc, n.x, 0, n.z);
    }
    b0 = b1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  geo.setAttribute("aGlow", new THREE.BufferAttribute(glow, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
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

// ---------------------------------------------------------------------------------------------------------------------------
// Props. Each kind that moves or is shaded per object (trees, peaks, derricks, sheep, the workers) is one InstancedMesh drawn
// from invisible proxy meshes in `living`: a proxy carries the transform, the prop's userData and the real geometry (so a
// proof's raycast or bounding box measures what is drawn); `sync` copies the proxies' matrices into the instances each frame.
// Everything that stands still is merged into one mesh per terrain (grain's per hex, as its own "field").

const PROP_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
PROP_MAT.userData.shared = true; // disposeGroup leaves it alone

export type Footprint = { hex: string; x: number; z: number; reach: number };
export type Sheep = { g: THREE.Object3D; ox: number; oz: number; tx: number; tz: number; wait: number; graze: number; ground: (x: number, z: number) => number };
export type OreWork = { cart: THREE.Mesh; arm: THREE.Mesh; x: number; z: number; dx: number; dz: number; phase: number };
export type FarmWork = { body: THREE.Mesh; arm: THREE.Mesh; x: number; z: number; phase: number; angle: number; ground: (x: number, z: number) => number };
// What the renderer animates or shades: `tall` is every prop the #604 rule may shrink in front of a token.
export type Life = { sheep: Sheep[]; oreWork: OreWork[]; farmWork: FarmWork[]; tall: THREE.Object3D[] };

const WHITE = new THREE.Color(1, 1, 1);
// Per-tree tints over the pine's own three greens: as is, cooler and darker, warmer and lighter.
const PINE_TINTS = [WHITE, new THREE.Color(0.8, 0.93, 0.86), new THREE.Color(1.12, 1.08, 0.86)];

export class PropKit {
  private kinds = new Map<string, { geo: THREE.BufferGeometry; shadow: boolean; proxies: THREE.Mesh[]; tints: THREE.Color[] }>();
  private statics = new Map<string, { parts: THREE.BufferGeometry[]; hexes: string[]; footprints: Footprint[] }>();
  // Each hex's run of vertices in the merged statics, and the stand-in a tile wobble scales them by (about its origin).
  private spans = new Map<string, { attr: THREE.BufferAttribute; rest: ArrayLike<number>; start: number; end: number }[]>();
  private anchors = new Map<string, { o: THREE.Object3D; k: number }>();
  private drawers: { mesh: THREE.InstancedMesh; proxies: THREE.Mesh[] }[] = [];
  constructor(private living: THREE.Group) {}

  proxy(kind: string, make: () => THREE.BufferGeometry, data: Record<string, unknown>, shadow = true, tint = WHITE) {
    let k = this.kinds.get(kind);
    if (!k) this.kinds.set(kind, (k = { geo: make(), shadow, proxies: [], tints: [] }));
    const m = new THREE.Mesh(k.geo, PROP_MAT);
    m.visible = false;
    m.userData = data;
    k.proxies.push(m);
    k.tints.push(tint);
    this.living.add(m);
    return m;
  }

  add(name: string, hex: string, geo: THREE.BufferGeometry, fp: Footprint | null) {
    let s = this.statics.get(name);
    if (!s) this.statics.set(name, (s = { parts: [], hexes: [], footprints: [] }));
    s.parts.push(geo);
    s.hexes.push(hex);
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
      const attr = mesh.geometry.attributes.position as THREE.BufferAttribute;
      const rest = attr.array.slice();
      let start = 0;
      s.parts.forEach((p, i) => {
        const end = start + p.attributes.position!.count * 3;
        let list = this.spans.get(s.hexes[i]!);
        if (!list) this.spans.set(s.hexes[i]!, (list = []));
        list.push({ attr, rest, start, end });
        start = end;
        p.dispose();
      });
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
    for (const [hex, a] of this.anchors) {
      const k = a.o.scale.x;
      if (k === a.k) continue;
      a.k = k;
      const o = a.o.position.toArray();
      for (const s of this.spans.get(hex) ?? []) {
        const v = s.attr.array;
        for (let i = s.start; i < s.end; i++) v[i] = o[i % 3]! + (s.rest[i]! - o[i % 3]!) * k;
        s.attr.needsUpdate = true;
      }
    }
  }

  // What a tile wobble scales for a hex's merged static props: they follow it about (x, y, z), the tile's own origin.
  anchor(hex: string, x: number, y: number, z: number) {
    let a = this.anchors.get(hex);
    if (!a) this.anchors.set(hex, (a = { o: new THREE.Object3D(), k: 1 }));
    a.o.position.set(x, y, z);
    return a.o;
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

// A part: non-indexed, without uvs (so every part merges), placed (position, y rotation, scale) and painted one colour.
// `flat` gives it faceted normals.
function part(geo: THREE.BufferGeometry, hex: string | THREE.Color, x = 0, y = 0, z = 0, rotY = 0, sx = 1, sy = sx, sz = sx, flat = false) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute("uv");
  g.applyMatrix4(_m.compose(new THREE.Vector3(x, y, z), _qt.setFromAxisAngle(AXIS_Y, rotY), new THREE.Vector3(sx, sy, sz)));
  if (flat) g.computeVertexNormals();
  return paintAll(g, hex);
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

// A pine tier: a soft bell, not a cone.
const tier = (r: number, h: number) =>
  new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(r * 0.9, 0), new THREE.Vector2(r, 0.06 * h), new THREE.Vector2(r * 0.72, 0.42 * h), new THREE.Vector2(r * 0.3, 0.82 * h), new THREE.Vector2(0, h)], 8);

// A trunk under five stacked frond tiers, darkest at the foot. 0.52 tall at scale 1; reach 0.15.
function pineGeo() {
  const parts = [part(new THREE.CylinderGeometry(0.018, 0.028, 0.12, 6), PROP.trunk, 0, 0.06, 0)];
  const tiers: [number, number, number][] = [[0.15, 0.17, 0.08], [0.13, 0.15, 0.17], [0.108, 0.14, 0.25], [0.084, 0.13, 0.33], [0.058, 0.13, 0.4]];
  tiers.forEach(([r, h, y], i) => parts.push(part(tier(r, h), PROP.pine[i]!, 0, y, 0, i * 0.7)));
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

// Body centred at y 0 (the sheep stands 0.1 above the ground); reach 0.115.
function sheepGeo() {
  const parts = [
    part(new THREE.SphereGeometry(0.085, 10, 8), "#f7f3ea", 0, 0, 0, 0, 1.35, 0.9, 1),
    part(new THREE.SphereGeometry(0.04, 8, 8), "#2a2a2a", 0, 0.03, 0.1),
  ];
  for (const [lx, lz] of [[-0.05, 0.05], [0.05, 0.05], [-0.05, -0.05], [0.05, -0.05]] as const) {
    parts.push(part(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 5), "#2a2a2a", lx, -0.07, lz));
  }
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

// Hat, clothes, legs and a loaded basket; the harvesting arm is its own kind.
function farmerGeo() {
  return mergeGeometries([
    part(new THREE.BoxGeometry(0.07, 0.09, 0.06), "#4b7c67", 0, 0.1, 0),
    part(new THREE.IcosahedronGeometry(0.038, 0), "#c49972", 0, 0.18, 0),
    part(new THREE.CylinderGeometry(0.057, 0.057, 0.018, 8), "#b58d44", 0, 0.215, 0),
    part(new THREE.CylinderGeometry(0.036, 0.046, 0.04, 8), "#d1b469", 0, 0.235, 0),
    part(new THREE.BoxGeometry(0.024, 0.07, 0.026), "#334c42", -0.021, 0.035, 0),
    part(new THREE.BoxGeometry(0.024, 0.07, 0.026), "#334c42", 0.021, 0.035, 0),
    part(new THREE.CylinderGeometry(0.038, 0.026, 0.06, 7), "#9c7745", -0.06, 0.09, 0.02),
    part(new THREE.ConeGeometry(0.025, 0.035, 5), "#e4c86c", -0.06, 0.13, 0.02),
  ]);
}

function sickleGeo() {
  return mergeGeometries([
    part(new THREE.BoxGeometry(0.024, 0.024, 0.085), "#c49972", 0.045, 0, 0.04),
    part(new THREE.BoxGeometry(0.013, 0.013, 0.11), "#7c6847", 0.06, -0.012, 0.07),
    part(new THREE.TorusGeometry(0.034, 0.009, 3, 7, Math.PI), "#b0b9af", 0.06, -0.01, 0.13),
  ]);
}

const stump = () => [part(new THREE.CylinderGeometry(0.04, 0.047, 0.05, 8), PROP.trunk, 0, 0.025, 0), part(new THREE.CylinderGeometry(0.036, 0.036, 0.004, 8), PROP.woodEnd, 0, 0.051, 0)];
const log = () => [
  part(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8).rotateZ(Math.PI / 2), PROP.trunk, 0, 0.03, 0),
  part(new THREE.CylinderGeometry(0.027, 0.027, 0.004, 8).rotateZ(Math.PI / 2), PROP.woodEnd, 0.101, 0.03, 0),
  part(new THREE.CylinderGeometry(0.027, 0.027, 0.004, 8).rotateZ(Math.PI / 2), PROP.woodEnd, -0.101, 0.03, 0),
];
const bush = (r: number, hex: string) => [part(new THREE.IcosahedronGeometry(r, 1), hex, 0, r * 0.7, 0, 0, 1, 0.8, 1)];
const rock = (r: number, hex: string) => [part(new THREE.DodecahedronGeometry(r, 0), hex, 0, r * 0.45, 0, 0, 1, 0.7, 1, true)];
const tuft = (hex: string) =>
  [-0.3, 0, 0.3].map((lean, i) => part(new THREE.ConeGeometry(0.011, 0.075, 4).rotateZ(lean).translate(0, 0.035, 0), hex, (i - 1) * 0.012, 0, (i % 2) * 0.01));
// A round bale lying along x: two twine bands round it, and on each end pale rolled straw around a darker core.
function roundBale() {
  const g = part(new THREE.CylinderGeometry(0.055, 0.055, 0.085, 12, 6).rotateZ(Math.PI / 2), PROP.straw, 0, 0.055, 0);
  const p = g.attributes.position!;
  const n = g.attributes.normal!;
  const c = g.attributes.color!;
  const [end, core, twine] = [PROP.strawEnd, PROP.strawCore, PROP.twine].map((h) => new THREE.Color(h));
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const r = Math.hypot((p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 - 0.055, (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3);
    const pick = Math.abs(n.getX(i)) > 0.9 ? (r < 0.02 ? core : end) : Math.abs(Math.abs(cx) - 0.021) < 0.006 ? twine : null;
    if (pick) for (let k = 0; k < 3; k++) c.setXYZ(i + k, pick.r, pick.g, pick.b);
  }
  return [g];
}
const squareBale = () => [
  part(new THREE.BoxGeometry(0.11, 0.06, 0.07), PROP.straw, 0, 0.03, 0),
  part(new THREE.BoxGeometry(0.008, 0.062, 0.072), PROP.twine, -0.03, 0.03, 0),
  part(new THREE.BoxGeometry(0.008, 0.062, 0.072), PROP.twine, 0.03, 0.03, 0),
];
function wheatTuft(rng: () => number) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const [x, z] = [Math.cos(a) * 0.022 * (i % 2 ? 1 : 0.4), Math.sin(a) * 0.022 * (i % 2 ? 1 : 0.4)];
    const h = 0.11 + rng() * 0.05;
    parts.push(part(new THREE.CylinderGeometry(0.005, 0.006, h, 3), PROP.straw, x, h / 2, z));
    parts.push(part(new THREE.SphereGeometry(0.014, 5, 4), PROP.wheat, x, h + 0.02, z, 0, 1, 2.2, 1));
  }
  return parts;
}
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
  claim(x: number, z: number, r: number) {
    this.taken.push({ x, z, r });
  }
}

// Every prop on one hex, from the same seeded stream that laid out its top.
export function decorate(kit: PropKit, life: Life, h: HexCell, x: number, z: number, sc: Sculpt, rng: () => number) {
  const L = sc.layout;
  const inr = (HEX_SIZE * 0.995 * SQ3) / 2;
  const room = new Room(rng, inr);
  const y = (lx: number, lz: number) => sc.ground(lx, lz);
  const fp = (lx: number, lz: number, reach: number): Footprint => ({ hex: h.id, x: x + lx, z: z + lz, reach });
  const put = (name: string, parts: THREE.BufferGeometry[], lx: number, lz: number, reach: number | null, rotY = rng() * Math.PI * 2, sink = 0.006) =>
    kit.add(name, h.id, placeAt(parts, x + lx, y(lx, lz) - sink, z + lz, rotY), reach === null ? null : fp(lx, lz, reach));
  const t = h.terrain;
  const corner = dirAt(30 + 60 * L.k);

  if (t === "timber") {
    const n = 22 + Math.floor(rng() * 6);
    for (let i = 0, placed = 0; i < n * 4 && placed < n; i++) {
      const s = 0.85 + rng() * 0.45;
      const at = room.find(0.15 * s, 0, 1, 0.72, 1);
      if (!at) continue;
      placed++;
      const tree = kit.proxy("tree", pineGeo, { prop: "tree", hex: h.id, reach: 0.15 * s }, true, PINE_TINTS[Math.floor(rng() * 3)]);
      tree.position.set(x + at.x, y(at.x, at.z) - 0.01, z + at.z);
      tree.rotation.y = rng() * Math.PI * 2;
      tree.scale.setScalar(s);
      tree.userData.base = tree.scale.clone();
      life.tall.push(tree);
    }
    for (const [make, reach, count] of [[stump, 0.05, 2], [log, 0.11, 1], [() => bush(0.06, PROP.hedge), 0.06, 2]] as const) {
      for (let i = 0; i < count; i++) {
        const at = room.find(reach, 0, 1, 0.9);
        if (at) put("timber", make(), at.x, at.z, reach);
      }
    }
  }

  if (t === "wool") {
    const n = 4 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const rad = 0.54 + Math.sqrt(rng()) * 0.2;
      const [lx, lz] = [Math.cos(a) * rad, Math.sin(a) * rad];
      const g = kit.proxy("sheep", sheepGeo, { prop: "sheep", hex: h.id, reach: 0.115 }, false);
      g.position.set(x + lx, y(lx, lz) + 0.1, z + lz);
      life.sheep.push({ g, ox: x, oz: z, tx: x + lx, tz: z + lz, wait: rng() * 2, graze: 0, ground: (wx, wz) => sc.ground(wx - x, wz - z) });
    }
    // A fence along one flat and a hedge along another, outside the sheep's 0.54-0.74 ring; rocks in three corners.
    const flat = (j: number) => dirAt(60 * (L.k + j));
    const fence = flat(1);
    const tan = { x: -fence.z, z: fence.x };
    const posts: [number, number, number][] = [];
    for (let i = -2; i <= 2; i++) {
      const [lx, lz] = [fence.x * 0.86 + tan.x * i * 0.14, fence.z * 0.86 + tan.z * i * 0.14];
      posts.push([lx, y(lx, lz), lz]);
    }
    const along = Math.atan2(-tan.z, tan.x);
    const fenceParts = posts.map(([lx, ly, lz]) => part(new THREE.BoxGeometry(0.022, 0.1, 0.022), PROP.wood, x + lx, ly + 0.045, z + lz));
    for (let i = 0; i < 4; i++) {
      const [a, b] = [posts[i]!, posts[i + 1]!];
      for (const ry of [0.04, 0.075]) fenceParts.push(part(new THREE.BoxGeometry(0.15, 0.014, 0.01), PROP.wood, x + (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + ry, z + (a[2] + b[2]) / 2, along));
    }
    kit.add("wool", h.id, mergeGeometries(fenceParts), fp(fence.x * 0.86, fence.z * 0.86, 0.3));
    fenceParts.forEach((p) => p.dispose());
    const hedge = flat(3);
    for (let i = -2; i <= 2; i++) {
      const r = 0.05 + rng() * 0.008;
      const [lx, lz] = [hedge.x * 0.86 - hedge.z * i * 0.085, hedge.z * 0.86 + hedge.x * i * 0.085];
      put("wool", bush(r, PROP.hedge), lx, lz, r);
    }
    for (const j of [2, 4, 5]) {
      const c = dirAt(30 + 60 * (L.k + j));
      const r = 0.03 + rng() * 0.02;
      put("wool", rock(r, PROP.stone), c.x * 0.92, c.z * 0.92, r);
    }
    for (let i = 0; i < 4; i++) {
      const at = room.find(0.04, 0.45, 0.9);
      if (at) put("wool", tuft(PROP.grass), at.x, at.z, 0.04);
    }
  }

  if (t === "grain") {
    const angle = rng() * Math.PI * 2;
    const [fx, fz] = [Math.cos(angle) * 0.65, Math.sin(angle) * 0.65];
    room.claim(fx, fz, 0.24);
    const body = kit.proxy("farmer", farmerGeo, { prop: "farmer", hex: h.id, reach: 0.14 });
    const arm = kit.proxy("harvesting", sickleGeo, { prop: "harvesting", hex: h.id, reach: 0.14 }, false);
    body.position.set(x + fx, y(fx, fz), z + fz);
    arm.position.set(x + fx, y(fx, fz) + 0.13, z + fz);
    life.farmWork.push({ body, arm, x: x + fx, z: z + fz, phase: rng() * 18, angle: angle + Math.PI / 2, ground: (wx, wz) => sc.ground(wx - x, wz - z) });
    const parts: THREE.BufferGeometry[] = [];
    const prints: Footprint[] = [];
    const local = (geo: THREE.BufferGeometry[], at: { x: number; z: number }, reach: number) => {
      parts.push(placeAt(geo, at.x, y(at.x, at.z) - 0.004, at.z, rng() * Math.PI * 2));
      prints.push(fp(at.x, at.z, reach));
    };
    for (const [make, reach, count] of [[roundBale, 0.07, 2], [squareBale, 0.07, 1], [() => wheatTuft(rng), 0.05, 2]] as const) {
      for (let i = 0; i < count; i++) {
        const at = room.find(reach, 0.45, 0.9);
        if (at) local(make(), at, reach);
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
