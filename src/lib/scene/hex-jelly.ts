// Hex Jelly (#599, docs/design/hex-jelly-prompt.md): one tile of the Material Studies look, built to the prompt. A moulded hex
// block (rounded corners and top edge) whose top is a dense heightfield with a big landform, coloured by slope and height and
// darkened by baked horizon AO; candy strata on the cut sides with pebble speckles; props as chunky instanced blobs. The
// studio (scripts/hex-jelly.html) shows one tile; the board port follows once the look is approved.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
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

export type Layout = { kind: Terrain; seed: number; hillAt: number; spots: Spot[] };

// The landform sits toward the back (away from the diorama eye, which looks from +z): its crest faces one of the two back edge
// midpoints (240 or 300 degrees), chosen by the seed, so it never hides the token.
export function layoutOf(kind: Terrain, seed: number): Layout {
  const r = rng32(seed);
  const hillAt = ((r() < 0.5 ? 240 : 300) + (r() - 0.5) * 16) * (Math.PI / 180);
  const at = (a: number, d: number) => ({ x: Math.cos(a) * d, z: Math.sin(a) * d });
  const spots: Spot[] = [];
  if (kind === "timber") {
    const side = hillAt < (270 * Math.PI) / 180 ? 1 : -1;
    spots.push({ ...at(hillAt, 0.6), r: 0.5, h: 0.42 + r() * 0.06 });
    spots.push({ ...at(hillAt, 0.6), r: 0.75, h: 0.14 });
    spots.push({ ...at(hillAt + side * 1.25, 0.6), r: 0.42, h: 0.26 + r() * 0.06 });
    spots.push({ ...at(hillAt - side * 1.4, 0.62), r: 0.3, h: 0.12 });
    // The clearing in front.
    spots.push({ ...at(hillAt + Math.PI + (r() - 0.5) * 0.6, 0.62), r: 0.22, h: -0.045 });
  }
  return { kind, seed, hillAt, spots };
}

// The ground's height over the pad at a hex-local point: the landform, held flat on the pad, the corner discs and the edge band.
export function heightAt(L: Layout, x: number, z: number) {
  let raw = 0.018 * fbm(x * 3, z * 3, L.seed);
  for (const p of L.spots) raw += bump(x, z, p);
  const pad = smooth(PAD_R, PAD_R + 0.3, Math.hypot(x, z));
  const corner = smooth(CORNER_DISC, CORNER_DISC + 0.16, nearestCorner(x, z));
  const edge = 1 - smooth(INR - EDGE_BAND - 0.1, INR - EDGE_BAND, hexDist(x, z));
  return raw * pad * corner * edge;
}

// --- colour

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

export type Tile = { group: THREE.Group; layout: Layout; ground: (x: number, z: number) => number; stats: { tris: number; calls: number } };

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

// The forest: broadleaf crowns of 3-6 blobs on short trunks over the hill and shoulder, pines (stacked flattened blobs) on the
// crest, bushes at the edge, two stumps, a fallen log in the clearing. Each blob's shade comes from its height in its crown
// and how buried it is among the others (neighbour occlusion), brighter on top.
function forest(L: Layout, ground: (x: number, z: number) => number, r: () => number) {
  type Blob = { x: number; y: number; z: number; s: number; kind: "leaf" | "pine" | "bush" };
  const blobs: Blob[] = [];
  const trunks: Inst[] = [];
  const stands: { x: number; z: number; r: number }[] = [];
  const ok = (x: number, z: number, room: number) =>
    Math.hypot(x, z) > 0.37 + room && nearestCorner(x, z) > 0.22 && hexDist(x, z) < INR - 0.16 && stands.every((s) => Math.hypot(s.x - x, s.z - z) > (s.r + room) * 0.62);
  const BARK = new THREE.Color("#6e4128");
  for (let tries = 0; tries < 3000 && stands.length < 70; tries++) {
    const a = r() * Math.PI * 2;
    const d = 0.38 + Math.sqrt(r()) * 0.52;
    const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
    const h = ground(x, z);
    // Dense on the hill and shoulder, sparse on the flat.
    if (r() > 0.12 + h * 4) continue;
    const pine = h > 0.38 && r() < 0.55;
    const size = (pine ? 0.075 : 0.065 + r() * 0.03) * (0.9 + Math.min(1, h * 2) * 0.3);
    if (!ok(x, z, size)) continue;
    stands.push({ x, z, r: size });
    const y0 = BLOCK_H + h;
    if (pine) {
      const th = size * 0.9;
      trunks.push({ m: mat(x, y0 + th / 2, z, size * 0.22, th, size * 0.22), c: BARK });
      const tiers = 4;
      for (let t = 0; t < tiers; t++) {
        const f = 1 - t / tiers;
        blobs.push({ x, y: y0 + th + t * size * 0.62, z, s: size * (0.55 + 0.75 * f), kind: "pine" });
      }
    } else {
      const th = size * 0.8;
      trunks.push({ m: mat(x, y0 + th / 2, z, size * 0.26, th, size * 0.26), c: BARK });
      const n = 3 + Math.floor(r() * 4);
      blobs.push({ x, y: y0 + th + size * 1.0, z, s: size * 1.05, kind: "leaf" });
      for (let i = 1; i < n; i++) {
        const a2 = r() * Math.PI * 2;
        blobs.push({ x: x + Math.cos(a2) * size * 0.75, y: y0 + th + size * (0.6 + r() * 0.8), z: z + Math.sin(a2) * size * 0.75, s: size * (0.6 + r() * 0.3), kind: "leaf" });
      }
    }
  }
  // Bushes round the flat.
  for (let tries = 0, k = 0; tries < 300 && k < 7; tries++) {
    const a = r() * Math.PI * 2;
    const d = 0.45 + r() * 0.42;
    const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
    if (!ok(x, z, 0.05)) continue;
    stands.push({ x, z, r: 0.05 });
    const y0 = BLOCK_H + ground(x, z);
    for (let i = 0; i < 3; i++) blobs.push({ x: x + (r() - 0.5) * 0.06, y: y0 + 0.025 + r() * 0.02, z: z + (r() - 0.5) * 0.06, s: 0.035 + r() * 0.015, kind: "bush" });
    k++;
  }
  // Shade per blob.
  const LEAF = [new THREE.Color("#2f7a34"), new THREE.Color("#4f9a3c"), new THREE.Color("#7cbb4a")];
  const PINE = [new THREE.Color("#1f5a34"), new THREE.Color("#2f7340"), new THREE.Color("#4a8d4c")];
  const BUSH = [new THREE.Color("#3f8a3a"), new THREE.Color("#5fa544"), new THREE.Color("#8cc65a")];
  const ymin = Math.min(...blobs.map((b) => b.y));
  const ymax = Math.max(...blobs.map((b) => b.y));
  const list: Inst[] = blobs.map((b, i) => {
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
  // Stumps and the log.
  const wood: Inst[] = [];
  const CUT = new THREE.Color("#d9a46a");
  for (let k = 0, tries = 0; k < 2 && tries < 200; tries++) {
    const a = r() * Math.PI * 2;
    const d = 0.45 + r() * 0.3;
    const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
    if (!ok(x, z, 0.04)) continue;
    stands.push({ x, z, r: 0.04 });
    wood.push({ m: mat(x, BLOCK_H + ground(x, z) + 0.02, z, 0.035, 0.04, 0.035), c: BARK });
    wood.push({ m: mat(x, BLOCK_H + ground(x, z) + 0.041, z, 0.03, 0.003, 0.03), c: CUT });
    k++;
  }
  const front = L.hillAt + Math.PI;
  const [lx, lz] = [Math.cos(front) * 0.6, Math.sin(front) * 0.6];
  // The fallen log lies across the clearing.
  const logAt = new THREE.Vector3(lx, BLOCK_H + ground(lx, lz) + 0.022, lz);
  wood.push({ m: new THREE.Matrix4().compose(logAt, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, front + 0.5, "YXZ")), new THREE.Vector3(0.024, 0.2, 0.024)), c: BARK });
  stands.push({ x: lx, z: lz, r: 0.1 });
  const cyl = new THREE.CylinderGeometry(0.85, 1, 1, 10);
  const g = new THREE.Group();
  g.add(instanced(blobGeo(L.seed % 97), list, blobMat()));
  g.add(instanced(cyl, [...trunks, ...wood], blobMat()));
  const tris = list.length * 320 + (trunks.length + wood.length) * 40;
  return { g, stands, tris, calls: 2 };
}

// --- the tile

export function buildTile(kind: Terrain, seed: number, rings = 60): Tile {
  const L = layoutOf(kind, seed);
  const ground = (x: number, z: number) => heightAt(L, x, z);
  const group = new THREE.Group();
  const r = rng32(seed ^ 0x9e3779b9);
  let props: { g: THREE.Group; stands: { x: number; z: number; r: number }[]; tris: number; calls: number } | null = null;
  if (kind === "timber") props = forest(L, ground, r);
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
  return { group, layout: L, ground: (x, z) => BLOCK_H + ground(x, z), stats: { tris: b.tris + (props?.tris ?? 0), calls: 2 + (props?.calls ?? 0) } };
}
