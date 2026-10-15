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
};

const at = (a: number, d: number) => ({ x: Math.cos(a) * d, z: Math.sin(a) * d });
const DEG = Math.PI / 180;

// The landform sits toward the back (away from the diorama eye, which looks from +z): its crest faces one of the two back edge
// midpoints (240 or 300 degrees), chosen by the seed, so it never hides the token.
export function layoutOf(kind: Terrain, seed: number): Layout {
  const r = rng32(seed);
  const hillAt = ((r() < 0.5 ? 240 : 300) + (r() - 0.5) * 12) * DEG;
  const L: Layout = { kind, seed, hillAt, spots: [], stream: [], pool: null, camp: null, deer: null, ring: null };
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
      const p = { x: L.pool.x + Math.cos(a) * 0.23, z: L.pool.z + Math.sin(a) * 0.23 };
      const away = Math.abs(Math.atan2(Math.sin(a - inflow), Math.cos(a - inflow)));
      if (Math.hypot(p.x, p.z) < 0.46 || nearestCorner(p.x, p.z) < 0.24 || hexDist(p.x, p.z) > 0.76) continue;
      // Away from the inflow, and toward the eye (+z) so the deer read side-on.
      const score = away + p.z * 0.8;
      if (score > bestScore) (bestScore = score), (best = { ...p, face: Math.atan2(L.pool.z - p.z, L.pool.x - p.x) });
    }
    L.deer = best;
    L.ring = at(hillAt - s * 0.6, 0.55);
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
  const pad = smooth(PAD_R, PAD_R + 0.3, Math.hypot(x, z));
  const corner = smooth(CORNER_DISC, CORNER_DISC + 0.16, nearestCorner(x, z));
  const edge = 1 - smooth(INR - EDGE_BAND - 0.1, INR - EDGE_BAND, hexDist(x, z));
  let h = raw * pad * corner * edge;
  if (L.stream.length) {
    const cut = smooth(PAD_R, PAD_R + 0.05, Math.hypot(x, z)) * smooth(CORNER_DISC, CORNER_DISC + 0.04, nearestCorner(x, z));
    const d = streamDist(L, x, z) / STREAM_W;
    if (d < 1) h -= STREAM_D * (1 - d * d) * (1 - d * d) * cut;
    if (L.pool) {
      const q = Math.hypot(x - L.pool.x, z - L.pool.z) / L.pool.r;
      if (q < 1) h = Math.min(h, -POOL_D * (1 - q * q) * (1 - q * q) * cut + h * q * q);
    }
  }
  return h;
}
// How much of the bed under the water a point is (0 dry, 1 deep), for its colour.
function wetAt(L: Layout, x: number, z: number) {
  let w = 0;
  if (L.stream.length) w = 1 - smooth(STREAM_W * 0.35, STREAM_W * 0.8, streamDist(L, x, z));
  if (L.pool) w = Math.max(w, 1 - smooth(L.pool.r * 0.55, L.pool.r * 0.82, Math.hypot(x - L.pool.x, z - L.pool.z)));
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
};

// --- materials

// The soft three-step toon ramp on direct light and a sky-tinted Fresnel sheen (docs/design/terrain.md "Colour and light").
const DIFFUSE = "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );";
const RAMPED =
  "float toonStep( float x ) { return 0.45 + 0.4 * smoothstep( 0.05, 0.4, x ) + 0.15 * smoothstep( 0.7, 0.98, x ); }\n" +
  THREE.ShaderChunk.lights_physical_pars_fragment.replace(DIFFUSE, DIFFUSE.replace("irradiance", "toonStep( dotNL ) * directLight.color"));
const SKY = new THREE.Color(LIGHT.sky);
const SHEEN = `\n\treflectedLight.indirectDiffuse += mix( material.diffuseColor, vec3( ${SKY.r.toFixed(3)}, ${SKY.g.toFixed(3)}, ${SKY.b.toFixed(3)} ), 0.55 ) * 0.35 * pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 2.5 );`;
function jellyfy(m: THREE.MeshStandardMaterial, key: string, extra?: (sh: THREE.WebGLProgramParametersWithUniforms) => void) {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <lights_physical_pars_fragment>", RAMPED)
      .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>" + SHEEN);
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
function strataMat(lip: string) {
  const L = new THREE.Color(lip);
  const v = (c: string) => {
    const k = new THREE.Color(c);
    return `vec3(${k.r.toFixed(4)}, ${k.g.toFixed(4)}, ${k.b.toFixed(4)})`;
  };
  return jellyfy(new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 }), `jelly-strata-${lip}`, (sh) => {
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
        vec3 col = ${v("#5f4234")};
        col = mix( col, ${v("#bb7a42")}, step( 0.07, y ) );
        col = mix( col, ${v("#f7f0e2")}, step( 0.152, y ) );
        col = mix( col, ${v("#ecdbb2")}, step( 0.166, y ) );
        col = mix( col, vec3(${L.r.toFixed(4)}, ${L.g.toFixed(4)}, ${L.b.toFixed(4)}), step( 0.232, y ) );
        float sand = step( 0.166, y ) * ( 1.0 - step( 0.232, y ) );
        float soil = step( 0.07, y ) * ( 1.0 - step( 0.152, y ) );
        float rock = 1.0 - step( 0.07, y );
        col = mix( col, vec3( 1.0, 0.99, 0.96 ), sand * pebbles( uv, 0.016, 0.32 ) );
        col = mix( col, ${v("#7a4a26")}, soil * pebbles( uv + 3.1, 0.014, 0.3 ) );
        col = mix( col, ${v("#8a6a58")}, rock * pebbles( uv + 7.7, 0.02, 0.34 ) );
        // A soft darkening toward the base, so the block sits on the paper.
        col *= 0.82 + 0.18 * smoothstep( 0.0, 0.08, vLocal.y );
        diffuseColor.rgb = col;`,
      );
  });
}

// --- the block


// The block with its top, rim and strata: a hex lattice of `rings` rings warped onto the rounded outline, a rim that rolls
// over ROUND_E, the side straight down to the base. `occlude` darkens the ground under a prop (canopy cover, contact).
function block(L: Layout, rings: number, occlude: (x: number, z: number) => number) {
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
  const side = new THREE.Mesh(sideGeo, strataMat(P.lip));
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
  if (fawn) g.scale.setScalar(0.66);
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
const basic = (hex: string, opacity = 1) => new THREE.MeshBasicMaterial({ color: hex, transparent: opacity < 1, opacity, toneMapped: false });

type Life = (t: number) => void;
type Built = { g: THREE.Group; stands: { x: number; z: number; r: number }[]; life: Life[] };

// TIMBER, "The Salmon Run" (docs/design/hex-jelly-prompt.md): the wooded hill and its canopy, the spring, the stream and its
// falls, the pool with leaping salmon, the doe and fawn drinking, the campsite and its bonfire, the axe stump and log stack,
// the fairy ring, ferns and mossy boulders, and the owl's eyes in a pine.
function forest(L: Layout, ground: (x: number, z: number) => number, r: () => number): Built {
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
  // Keep-outs for the trees: water, camp, deer, the ring's middle.
  const clear = (x: number, z: number, room: number) =>
    streamDist(L, x, z) > 0.06 + room &&
    Math.hypot(x - pool.x, z - pool.z) > pool.r + 0.05 + room &&
    Math.hypot(x - fire.x, z - fire.z) > 0.16 + room &&
    Math.hypot(x - tentAt.x, z - tentAt.z) > 0.1 + room &&
    (!L.deer || Math.hypot(x - L.deer.x, z - L.deer.z) > 0.1 + room) &&
    Math.hypot(x - L.ring!.x, z - L.ring!.z) > 0.06 + room;
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
    for (const f of flames) {
      const k = 1 + 0.22 * Math.sin(t * (9 + f.i * 2.3) + f.i * 1.7) + 0.1 * Math.sin(t * 21 + f.i * 2);
      f.o.scale.set(f.s[0] * (1.05 - 0.05 * k), f.s[1] * k, f.s[2] * (1.05 - 0.05 * k));
      f.o.rotation.z = 0.08 * Math.sin(t * 7 + f.i);
    }
    warm.intensity = 0.06 + 0.015 * Math.sin(t * 13) + 0.008 * Math.sin(t * 29);
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
    const fp = { x: L.deer.x - Math.cos(face) * 0.03 + Math.cos(face + 1.57) * 0.07, z: L.deer.z - Math.sin(face) * 0.03 + Math.sin(face + 1.57) * 0.07 };
    fawn.g.position.set(fp.x, Y(fp.x, fp.z), fp.z);
    fawn.g.rotation.y = -face + 0.5;
    g.add(doe.g, fawn.g);
    stands.push({ x: L.deer.x, z: L.deer.z, r: 0.06 }, { x: fp.x, z: fp.z, r: 0.04 });
    life.push((t) => {
      const cyc = (t % 6) / 6;
      const down = smooth(0.05, 0.2, cyc) * (1 - smooth(0.55, 0.7, cyc));
      doe.neck.rotation.z = -1.6 * down + 0.15 * (1 - down) * Math.sin(t * 0.8);
      doe.neck.rotation.y = (1 - down) * 0.35 * Math.sin(t * 0.9);
      fawn.neck.rotation.z = 0.12 * Math.sin(t * 1.3 + 1);
      fawn.neck.rotation.y = 0.4 * Math.sin(t * 0.6 + 2);
      const flick = Math.max(0, Math.sin(t * 3.1)) ** 16;
      doe.ears.forEach((e, i) => (e.rotation.x = (i ? -1 : 1) * (0.6 + 0.5 * flick)));
      fawn.ears.forEach((e, i) => (e.rotation.x = (i ? -1 : 1) * (0.6 + 0.5 * Math.max(0, Math.sin(t * 2.3 + 1)) ** 16)));
    });
  }

  // Salmon: two take turns leaping out of the pool in an arc and splashing back, a ring rippling out where each lands; fish
  // shadows drift under the surface.
  const sg = salmonGeo();
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
    for (const L2 of leaps) {
      const u = ((t + L2.ph) % PERIOD) / AIR;
      const a = L2.a + Math.floor((t + L2.ph) / PERIOD) * 2.3;
      const [ax, az] = [pool.x + Math.cos(a) * pool.r * 0.35, pool.z + Math.sin(a) * pool.r * 0.35];
      const [bx, bz] = [pool.x - Math.cos(a) * pool.r * 0.1, pool.z - Math.sin(a) * pool.r * 0.1];
      if (u < 1) {
        const h = 0.1 * 4 * u * (1 - u);
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
      const tl = ((t + L2.ph) % PERIOD);
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
  return { g, stands, life };
}

// --- the tile

export type Tile = { group: THREE.Group; layout: Layout; ground: (x: number, z: number) => number; update: (t: number) => void };

export function buildTile(kind: Terrain, seed: number, rings = 64): Tile {
  const L = layoutOf(kind, seed);
  const ground = (x: number, z: number) => heightAt(L, x, z);
  const group = new THREE.Group();
  const r = rng32(seed ^ 0x9e3779b9);
  const props = kind === "timber" ? forest(L, ground, r) : null;
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
  const b = block(L, rings, occlude);
  group.add(b.top, b.side);
  if (props) group.add(props.g);
  const life = props?.life ?? [];
  return { group, layout: L, ground: (x, z) => BLOCK_H + ground(x, z), update: (t) => life.forEach((f) => f(t)) };
}
