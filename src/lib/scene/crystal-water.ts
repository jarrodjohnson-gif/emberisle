import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { hashStr, mulberry32 } from "@/lib/utils";
import { part } from "@/lib/scene/ocean-life";

// Crystal water (docs/design/crystal-water.md): a transmissive, Gerstner-displaced sea over a visible floor, on the open ocean.

export type WaterPath = "crystal" | "simple";
export type WaterStatus = { path: WaterPath; source: "probe" | "saved"; ms: number | null };
type Coast = { x: number; z: number; mx: number; mz: number }[];
type Uniform = { value: number };

/** The studio paper #f1efe9 as linear light that the composer's ACES (exposure 1.05) turns back into #f1efe9 on screen. */
export const PAPER = new THREE.Color().setRGB(1.7942, 1.5978, 1.1537, THREE.LinearSRGBColorSpace);

const SURFACE = -0.02;
// The floor profile: offsets from the coast (along each corner's miter) and the water depth there. 0.22 is the beach's outer
// edge; out to 0.9 sand lies under 0.1-0.3 of water, then the floor drops to its 0.9 depth by 4 units out.
const OFFSET = [-0.3, 0.22, 0.5, 0.9, 1.4, 2.0, 2.8, 4.0, 5.5, 8, 12, 20, 32, 48];
const DEPTH = [0.08, 0.1, 0.16, 0.26, 0.42, 0.62, 0.82, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
// The surface needs vertices close enough for a 1.3-unit chop near the island: 0.12 apart across the breaking band.
const SURFACE_OFFSET = [
  -0.3, 0, 0.22,
  ...Array.from({ length: 18 }, (_, i) => 0.3 + i * 0.12),
  ...Array.from({ length: 15 }, (_, i) => 2.5 + i * 0.25),
  ...Array.from({ length: 10 }, (_, i) => 6.4 + i * 0.6),
  13, 15, 17.5, 20, 24, 28, 34, 40, 48,
];
const SUBDIVIDE = 8; // surface points per coast edge (0.14 apart at the coast)
// Warm sand under the shallow band (the water's red absorption turns it pale aqua), then teal sand under deep water.
const SAND = new THREE.Color(0xe2d3a8);
const DEEP_SAND = new THREE.Color(0xb8d8e0);

// Four Gerstner waves (direction of travel, wavelength, amplitude, period, steepness), periods from T = sqrt(5.15 L). Two swells
// roll in from the north-east (screen top-right in the home view), travelling south-west, 12° apart: they beat into sets every
// 1 / (1/5.8 - 1/6.5) = 54 s. The two chops are faint (a third of the swell's slope), cross the swell at -40° and +70°, come in
// patches (GUST) and stay out of the surf zone. docs/research/waves.md has the reasoning.
const rot = (d: [number, number], deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [d[0] * Math.cos(a) - d[1] * Math.sin(a), d[0] * Math.sin(a) + d[1] * Math.cos(a)];
};
const SW_DIR: [number, number] = [-Math.SQRT1_2, Math.SQRT1_2];
export const WAVES = {
  swellA: { dir: SW_DIR, length: 6.6, amp: 0.05, period: 5.8, q: 0.35 },
  swellB: { dir: rot(SW_DIR, 12), length: 8.2, amp: 0.04, period: 6.5, q: 0.3 },
  chop1: { dir: rot(SW_DIR, -40), length: 3.0, amp: 0.006, period: 3.9, q: 0.25 },
  chop2: { dir: rot(SW_DIR, 70), length: 4.2, amp: 0.008, period: 4.65, q: 0.2 },
  // In the last 2 units the swell turns to run straight at the beach (refraction), 1.6x as tall and 0.6x as long.
  shore: { band: 2, amp: 0.06 * 1.6, length: 7 * 0.6, period: 6, q: 0.8 },
};
// The chops' patches: amplitude x (0.6 + 0.4 x (0.5 + 0.5 x sin(p.GUST[0]) sin(p.GUST[1]))), with p = (x, z, t). About 15 units
// across, drifting; sines rather than a hash noise so the CPU twin computes the same value as the GPU.
const GUST = [
  [0.45, 0.2, 0.05],
  [-0.25, 0.4, -0.04],
] as const;
const gust = (x: number, z: number, t: number) =>
  0.6 + 0.4 * (0.5 + 0.5 * Math.sin(GUST[0][0] * x + GUST[0][1] * z + GUST[0][2] * t) * Math.sin(GUST[1][0] * x + GUST[1][1] * z + GUST[1][2] * t));
// The chops fade in from 0.5 to 2.5 units off the coast: in the surf zone the breaker owns the surface.
const CHOP_IN = [0.5, 2.5] as const;
const TAU = Math.PI * 2;
const k = (l: number) => TAU / l;
const w = (t: number) => TAU / t;
const f = (n: number) => n.toFixed(5);
const v2 = (d: [number, number]) => `vec2(${f(d[0])}, ${f(d[1])})`;

export const CAUSTIC_GLSL = /* glsl */ `
  vec2 cellPoint(vec2 p) {
    vec3 h = fract(vec3(p.xyx) * 0.1031);
    h += dot(h, h.yzx + 33.33);
    return fract((h.xx + h.yz) * h.zy);
  }
  float caustic(vec2 p) {
    vec2 cell = floor(p), local = fract(p);
    float near = 8.0, second = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 v = offset + 0.15 + 0.7 * cellPoint(cell + offset) - local;
      float d = dot(v, v);
      second = min(second, max(near, d));
      near = min(near, d);
    }
    return 1.0 - smoothstep(0.014, 0.055, second - near);
  }
  float softCaustic(vec2 p) {
    vec2 cell = floor(p), local = fract(p);
    float near = 8.0, second = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 v = offset + 0.15 + 0.7 * cellPoint(cell + offset) - local;
      float d = dot(v, v);
      second = min(second, max(near, d));
      near = min(near, d);
    }
    return 1.0 - smoothstep(0.0, 0.35, second - near);
  }
`;

// The wave field, shared by the surface, the wash on the sand and (ported below) the boats. Needs uTime and uMotion.
const { swellA, swellB, chop1, chop2, shore } = WAVES;
const g3 = (g: readonly number[]) => `${f(g[0]!)} * p.x + ${f(g[1]!)} * p.y + ${f(g[2]!)} * uTime`;
const WAVE_GLSL = /* glsl */ `
  const float TAU = 6.28318530718;
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), u = fract(p);
    u = u * u * (3.0 - 2.0 * u);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float shoreLift(float o) { return 1.0 - smoothstep(${f(shore.band * 0.3)}, ${f(shore.band)}, o); }
  float beachTaper(float o) { return smoothstep(0.0, 0.45, o); }
  float farFade(float o) { return 1.0 - smoothstep(12.0, 20.0, o); }
  // Along the coast the breakers arrive at different moments, so the crash is not one ring.
  float alongCoast(vec2 p) { return 1.6 * sin(0.31 * p.x + 0.17 * p.y) + 1.0 * sin(-0.23 * p.x + 0.29 * p.y); }
  float shorePhase(vec2 p, float o) { return -${f(k(shore.length))} * o - ${f(w(shore.period))} * uTime - alongCoast(p); }
  float swellAPhase(vec2 p) { return ${f(k(swellA.length))} * dot(${v2(swellA.dir)}, p) - ${f(w(swellA.period))} * uTime; }
  float swellBPhase(vec2 p) { return ${f(k(swellB.length))} * dot(${v2(swellB.dir)}, p) - ${f(w(swellB.period))} * uTime; }
  float gust(vec2 p) { return 0.6 + 0.4 * (0.5 + 0.5 * sin(${g3(GUST[0])}) * sin(${g3(GUST[1])})); }
  float chop1Phase(vec2 p) { return ${f(k(chop1.length))} * dot(${v2(chop1.dir)}, p) - ${f(w(chop1.period))} * uTime; }
  float chop2Phase(vec2 p) { return ${f(k(chop2.length))} * dot(${v2(chop2.dir)}, p) - ${f(w(chop2.period))} * uTime; }
  void gerstner(float th, vec2 d, float k, float a, float q, inout vec3 off, inout vec3 n) {
    float c = cos(th), s = sin(th);
    off += vec3(q * a * d.x * c, a * s, q * a * d.y * c);
    n += vec3(-d.x * k * a * c, -q * k * a * s, -d.y * k * a * c);
  }
  // The displacement of rest point p, o units off the coast, where inward points at the beach. n is the world normal.
  vec3 seaOffset(vec2 p, float o, vec2 inward, out vec3 n) {
    n = vec3(0.0, 1.0, 0.0);
    vec3 off = vec3(0.0);
    float s = shoreLift(o), m = uMotion * beachTaper(o);
    float chop = m * farFade(o) * smoothstep(${f(CHOP_IN[0])}, ${f(CHOP_IN[1])}, o) * gust(p);
    gerstner(swellAPhase(p), ${v2(swellA.dir)}, ${f(k(swellA.length))}, ${f(swellA.amp)} * (1.0 - s) * m, ${f(swellA.q)}, off, n);
    gerstner(swellBPhase(p), ${v2(swellB.dir)}, ${f(k(swellB.length))}, ${f(swellB.amp)} * (1.0 - s) * m, ${f(swellB.q)}, off, n);
    gerstner(shorePhase(p, o), inward, ${f(k(shore.length))}, ${f(shore.amp)} * s * m, ${f(shore.q)}, off, n);
    gerstner(chop1Phase(p), ${v2(chop1.dir)}, ${f(k(chop1.length))}, ${f(chop1.amp)} * chop, ${f(chop1.q)}, off, n);
    gerstner(chop2Phase(p), ${v2(chop2.dir)}, ${f(k(chop2.length))}, ${f(chop2.amp)} * chop, ${f(chop2.q)}, off, n);
    return off;
  }
  // Seconds since the breaker's crest last passed offset o here (0 to the 6 s period).
  float sinceCrest(vec2 p, float o) { return mod(1.5707963 - shorePhase(p, o), TAU) / ${f(w(shore.period))}; }
`;

function depthAt(offset: number) {
  if (offset <= OFFSET[0]!) return DEPTH[0]!;
  for (let i = 1; i < OFFSET.length; i++) {
    if (offset <= OFFSET[i]!) {
      const u = (offset - OFFSET[i - 1]!) / (OFFSET[i]! - OFFSET[i - 1]!);
      return DEPTH[i - 1]! + (DEPTH[i]! - DEPTH[i - 1]!) * u;
    }
  }
  return DEPTH[DEPTH.length - 1]!;
}

// Each coast edge cut into `n` pieces; the miters are interpolated, so an offset d stays d away from that edge.
function subdivide(coast: Coast, n: number): Coast {
  return coast.flatMap((a, i) => {
    const b = coast[(i + 1) % coast.length]!;
    return Array.from({ length: n }, (_, j) => {
      const t = j / n;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, mx: a.mx + (b.mx - a.mx) * t, mz: a.mz + (b.mz - a.mz) * t };
    });
  });
}

// Rings at each offset around the coast, filled in the middle (under the island) so no gap between tiles shows the void.
// `attrs` adds per-vertex attributes: name -> [size, (offset, coast point) -> values].
function coastRings(
  coast: Coast,
  offsets: number[],
  y: (o: number) => number,
  attrs: Record<string, [number, (o: number, c: Coast[number] | null) => number[]]>,
  fill = true,
) {
  const pos: number[] = [0, y(offsets[0]!), 0];
  const extra: Record<string, number[]> = {};
  for (const [name, [, fn]] of Object.entries(attrs)) extra[name] = fn(offsets[0]!, null);
  for (const o of offsets) {
    for (const c of coast) {
      pos.push(c.x + c.mx * o, y(o), c.z + c.mz * o);
      for (const [name, [, fn]] of Object.entries(attrs)) extra[name]!.push(...fn(o, c));
    }
  }
  const n = coast.length;
  const idx: number[] = [];
  if (fill) for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + ((i + 1) % n));
  for (let ring = 0; ring < offsets.length - 1; ring++) {
    for (let i = 0; i < n; i++) {
      const a = 1 + ring * n + i;
      const b = 1 + ring * n + ((i + 1) % n);
      idx.push(a, a + n, b + n, a, b + n, b);
    }
  }
  // The loop's direction is whatever the coast walk found: face the rings up.
  if (coast[0]!.x * coast[1]!.z - coast[0]!.z * coast[1]!.x > 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2]!, idx[i + 1]!];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  for (const [name, [size]] of Object.entries(attrs)) geo.setAttribute(name, new THREE.Float32BufferAttribute(extra[name]!, size));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const inward = (c: Coast[number] | null) => {
  if (!c) return [0, 0];
  const l = Math.hypot(c.mx, c.mz);
  return [-c.mx / l, -c.mz / l];
};

/** A linear colour, components above 1 allowed (pre-tonemap values). */
const lin = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);

/** Uniforms the renderer drives: the clock, motion (0 under reduced motion) and the radius band where the sea meets the paper. */
export type SeaUniforms = { uTime: Uniform; uMotion: Uniform; uFade: { value: THREE.Vector2 } };

/**
 * The sea surface: Gerstner swell, chop and breakers over a refraction of the scene beneath it. The renderer draws the scene
 * without the sea into `uUnder` (colour and depth) each frame; the surface samples it through its ripple normal, absorbs it by
 * the real path length through the water (from the depth buffer), blends toward the water's own colour with depth, and adds a
 * Fresnel sky and a sun glint.
 */
export function makeCrystalSea(coast: Coast, shared: SeaUniforms) {
  const geo = coastRings(subdivide(coast, SUBDIVIDE), SURFACE_OFFSET, () => SURFACE, {
    aCoast: [1, (o) => [o]],
    aInward: [2, (_, c) => inward(c)],
  });
  // Absorption per unit of path, from the pale attenuation colour #6fd6cf reached over 2 units: light enough that sand stays
  // clear through the first few units off the coast.
  const att = new THREE.Color(0x6fd6cf);
  const sigma = new THREE.Vector3(...[att.r, att.g, att.b].map((c) => -Math.log(c) / 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uUnder: { value: null },
      uUnderDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.1 },
      uFar: { value: 80 },
      uSigma: { value: sigma },
      // How fast the water's own colour takes over with depth, and the cool in-scatter tint on what is seen through it (a
      // multiplier, so the floor keeps its contrast).
      uBodyDepth: { value: 1.8 },
      uTint: { value: new THREE.Vector3(0.6, 2.1, 3.0) },
      // Pre-tonemap linear values, tuned by read-back so the drawn shallows land near #cdf1ec and the deep stays lighter than #4ab9b5.
      uShallow: { value: lin(0.7, 3.4, 3.2) },
      uDeep: { value: lin(0.04, 0.5, 0.5) },
      uSky: { value: lin(0.9, 1.15, 1.15) },
      uSunDir: { value: new THREE.Vector3(8, 16, 6).normalize() },
      uPaper: { value: PAPER },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uMotion;
      attribute float aCoast;
      attribute vec2 aInward;
      varying float vCoast;
      varying vec2 vRest;
      varying vec3 vWaveN;
      varying vec3 vWorld;
      varying vec3 vView;
      ${WAVE_GLSL}
      void main() {
        vec3 p = position + seaOffset(position.xz, aCoast, aInward, vWaveN);
        vCoast = aCoast;
        vRest = position.xz;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vec4 view = viewMatrix * world;
        vView = view.xyz;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform float uTime;
      uniform float uMotion;
      uniform vec2 uFade;
      uniform sampler2D uUnder;
      uniform sampler2D uUnderDepth;
      uniform vec2 uResolution;
      uniform float uNear;
      uniform float uFar;
      uniform vec3 uSigma;
      uniform float uBodyDepth;
      uniform vec3 uTint;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uSky;
      uniform vec3 uSunDir;
      uniform vec3 uPaper;
      varying float vCoast;
      varying vec2 vRest;
      varying vec3 vWaveN;
      varying vec3 vWorld;
      varying vec3 vView;
      ${WAVE_GLSL}
      float sceneZ(vec2 uv) {
        float d = texture2D(uUnderDepth, uv).x;
        return isOrthographic ? orthographicDepthToViewZ(d, uNear, uFar) : perspectiveDepthToViewZ(d, uNear, uFar);
      }
      void main() {
        // The waves' own normal plus a faint, broad ripple.
        vec2 p = vRest;
        float a = p.x * 0.8 + uTime * 0.17, b = p.y * 0.6 - uTime * 0.13;
        vec2 g = 0.01 * uMotion * vec2(0.8 * cos(a) * sin(b), 0.6 * sin(a) * cos(b));
        vec3 N = normalize(vWaveN + vec3(-g.x, 0.0, -g.y));
        vec3 V = isOrthographic ? normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])) : normalize(cameraPosition - vWorld);
        // Refraction: the scene below, shifted along the surface slope, never picking up something in front of the water.
        vec2 uv = gl_FragCoord.xy / uResolution;
        float d0 = max(vView.z - sceneZ(uv), 0.0);
        vec2 ruv = uv + (viewMatrix * vec4(N, 0.0)).xy * 0.02 * min(d0, 1.0);
        float d = vView.z - sceneZ(ruv);
        if (d < 0.0) { ruv = uv; d = d0; }
        vec3 under = texture2D(uUnder, ruv).rgb;
        // Absorb the floor by the path length; the water's own colour rises with depth, pale over sand, teal over the deep.
        vec3 c = under * exp(-uSigma * d) * mix(vec3(1.0), uTint, smoothstep(0.0, 0.3, d));
        vec3 body = mix(uShallow, uDeep, smoothstep(0.15, 0.85, d));
        c = mix(c, body, 1.0 - exp(-d / uBodyDepth));
        // Fresnel sky and the sun's glint.
        float F = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
        c = mix(c, uSky, 0.02 + 0.55 * F);
        // A fine, sparse sparkle: the glint only where the surface faces the sun and a fine noise peaks, on the crests.
        float glint = pow(max(dot(reflect(-V, N), uSunDir), 0.0), 900.0);
        float fleck = smoothstep(0.975, 1.0, vnoise(vRest * 25.0 + uTime * vec2(0.3, -0.2)))
          * smoothstep(0.02, 0.05, vWorld.y) * smoothstep(0.85, 0.97, dot(reflect(-V, N), uSunDir));
        c += vec3(1.8, 1.7, 1.5) * (glint * 0.6 + fleck * 0.5) * uMotion;
        // Breakers: fine foam on the crest in the last unit, fading within 1 s.
        float o = vCoast;
        float n = vnoise(vRest * 18.0 + uTime * 0.5) * 0.55 + vnoise(vRest * 41.0 - uTime * 0.8) * 0.45;
        float life = smoothstep(0.2, 0.32, o) * (1.0 - smoothstep(0.35, 1.0, o)) * (1.0 - smoothstep(0.0, 1.0, sinceCrest(vRest, o)));
        float crash = life * smoothstep(0.62, 0.7, n + 0.3 * life);
        // Open-water whitecaps: small flecks where both chops crest inside sparse, drifting patches.
        float caps = smoothstep(0.94, 1.0, sin(chop1Phase(vRest))) * smoothstep(0.6, 1.0, sin(chop2Phase(vRest)))
          * smoothstep(0.8, 0.95, vnoise(vRest * 0.4 + vec2(uTime * 0.03, 0.0))) * smoothstep(0.6, 0.75, vnoise(vRest * 24.0))
          * farFade(o) * (1.0 - shoreLift(o));
        c = mix(c, vec3(2.6, 2.7, 2.65), uMotion * clamp(crash * 0.9 + caps * 0.5, 0.0, 1.0));
        c = mix(c, uPaper, smoothstep(uFade.x, uFade.y, length(vRest)));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "crystal-sea";
  return mesh;
}

/**
 * The edge of the crystal sea, over the beach and the first 0.42 units of water: a thin, broken lace line where the water meets
 * the sand (it stays under reduced motion), and the swash, foam that runs up the sand after each breaker and slides back.
 */
export function makeWash(coast: Coast, { uTime, uMotion }: SeaUniforms) {
  const geo = coastRings(subdivide(coast, SUBDIVIDE), [0, 0.06, 0.12, 0.18, 0.24, 0.3, 0.36, 0.42], () => 0, { aCoast: [1, (o) => [o]] }, false);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime, uMotion },
    vertexShader: /* glsl */ `
      attribute float aCoast;
      varying float vCoast;
      varying vec2 vRest;
      void main() {
        vCoast = aCoast;
        vRest = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uMotion;
      varying float vCoast;
      varying vec2 vRest;
      ${WAVE_GLSL}
      void main() {
        float t = sinceCrest(vRest, 0.35);
        float edge = 0.35 - 0.33 * sin(clamp(t / 2.4, 0.0, 1.0) * 3.14159265);
        float sheet = step(edge, vCoast) * (1.0 - smoothstep(0.3, 0.42, vCoast)) * (1.0 - smoothstep(0.3, 1.8, t));
        float n = vnoise(vRest * 7.0 + uTime * 0.5);
        float line = (1.0 - smoothstep(0.0, 0.035, abs(vCoast - edge))) * (1.0 - smoothstep(1.4, 2.4, t));
        float swash = uMotion * clamp(sheet * (0.3 + 0.45 * n) + line * 0.7, 0.0, 1.0);
        float waterline = 0.25 + 0.015 * sin(uTime * 0.8 + vRest.x * 1.3) * uMotion;
        float lace = (1.0 - smoothstep(0.012, 0.03, abs(vCoast - waterline))) * smoothstep(0.35, 0.55, vnoise(vRest * 34.0 + uTime * 0.3 * uMotion));
        gl_FragColor = vec4(0.88, 0.97, 0.96, clamp(max(swash, lace * 0.9), 0.0, 1.0));
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "wash";
  mesh.position.y = 0.021;
  return mesh;
}

/** The CPU twin of `seaOffset`'s height and slope at a rest point, for the boats and the visitors. */
export function makeSwell(coast: Coast) {
  const n = coast.length;
  const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);
  return (x: number, z: number, t: number) => {
    // Distance to the nearest coast edge, and the direction back to it.
    let o = Infinity, ix = 0, iz = 0;
    for (let i = 0; i < n; i++) {
      const a = coast[i]!, b = coast[(i + 1) % n]!;
      const dx = b.x - a.x, dz = b.z - a.z;
      const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const px = a.x + dx * u, pz = a.z + dz * u;
      const d = Math.hypot(x - px, z - pz);
      if (d < o) [o, ix, iz] = [d, (px - x) / (d || 1), (pz - z) / (d || 1)];
    }
    const s = 1 - smooth(shore.band * 0.3, shore.band, o);
    const m = smooth(0, 0.45, o);
    const chop = m * (1 - smooth(12, 20, o)) * smooth(CHOP_IN[0], CHOP_IN[1], o) * gust(x, z, t);
    const along = 1.6 * Math.sin(0.31 * x + 0.17 * z) + 1.0 * Math.sin(-0.23 * x + 0.29 * z);
    let y = 0, gx = 0, gz = 0;
    const add = (th: number, dx: number, dz: number, kk: number, amp: number) => {
      y += amp * Math.sin(th);
      gx += dx * kk * amp * Math.cos(th);
      gz += dz * kk * amp * Math.cos(th);
    };
    const open = (wv: typeof swellA, amp: number) => add(k(wv.length) * (wv.dir[0] * x + wv.dir[1] * z) - w(wv.period) * t, wv.dir[0], wv.dir[1], k(wv.length), amp);
    open(swellA, swellA.amp * (1 - s) * m);
    open(swellB, swellB.amp * (1 - s) * m);
    add(-k(shore.length) * o - w(shore.period) * t - along, ix, iz, k(shore.length), shore.amp * s * m);
    open(chop1, chop1.amp * chop);
    open(chop2, chop2.amp * chop);
    return { y, gx, gz };
  };
}

/** The sea floor: sand under the shallows grading to teal sand, with soft caustic light drifting over it. */
export function makeSeaFloor(coast: Coast, { uTime, uFade }: SeaUniforms) {
  const c = new THREE.Color();
  const geo = coastRings(coast, OFFSET, (o) => SURFACE - depthAt(o), {
    color: [3, (o) => c.copy(SAND).lerp(DEEP_SAND, THREE.MathUtils.smoothstep(o, 1.0, 2.6)).toArray()],
  });
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uFade = uFade;
    shader.uniforms.uPaper = { value: PAPER };
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "varying vec2 vFloorXZ;\nvoid main() {")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvFloorXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `uniform float uTime;\nuniform vec2 uFade;\nuniform vec3 uPaper;\nvarying vec2 vFloorXZ;\n${CAUSTIC_GLSL}\nvoid main() {`)
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        {
          // Soft light, not a net: two drifting scales of wide-edged cells, at most 25 % contrast, gone by 14 units out.
          vec2 p = vFloorXZ + vec2(sin(vFloorXZ.y * 0.9 + uTime * 0.2), cos(vFloorXZ.x * 0.7 - uTime * 0.16)) * 0.2;
          float soft = 0.6 * softCaustic(p * 1.3 + vec2(uTime * 0.05, -uTime * 0.03)) + 0.4 * softCaustic(mat2(0.8, -0.6, 0.6, 0.8) * p * 2.4 - vec2(uTime * 0.04, uTime * 0.05));
          diffuseColor.rgb *= 1.0 + 0.25 * (soft - 0.4) * (1.0 - smoothstep(6.0, 14.0, length(vFloorXZ)));
        }`,
      )
      .replace(
        "#include <opaque_fragment>",
        "#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uPaper, smoothstep(uFade.x, uFade.y, length(vFloorXZ)));",
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "sea-floor";
  mesh.receiveShadow = true;
  return mesh;
}

/** Static low-poly clutter on the floor near the coast: weed tufts, stones, two starfish and one old anchor, one draw call. */
export function makeFloorProps(coast: Coast) {
  const rng = mulberry32(hashStr("emberisle-sea-floor"));
  const n = coast.length;
  const spot = (min: number, max: number) => {
    const i = Math.floor(rng() * n);
    const a = coast[i]!, b = coast[(i + 1) % n]!;
    const t = rng();
    const o = min + rng() * (max - min);
    const x = a.x + (b.x - a.x) * t + (a.mx + (b.mx - a.mx) * t) * o;
    const z = a.z + (b.z - a.z) * t + (a.mz + (b.mz - a.mz) * t) * o;
    return { x, z, y: SURFACE - depthAt(o) };
  };
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const s = spot(1.4, 5.5);
    for (let j = 0; j < 3; j++) {
      const h = 0.14 + rng() * 0.12;
      const blade = part(new THREE.ConeGeometry(0.025, h, 4), j % 2 ? 0x4f8a55 : 0x3f7a4c);
      blade.rotateZ((rng() - 0.5) * 0.6).rotateX((rng() - 0.5) * 0.6);
      parts.push(blade.translate(s.x + (rng() - 0.5) * 0.12, s.y + h / 2, s.z + (rng() - 0.5) * 0.12));
    }
  }
  for (let i = 0; i < 10; i++) {
    const s = spot(0.9, 5.5);
    const r = 0.05 + rng() * 0.07;
    parts.push(part(new THREE.IcosahedronGeometry(1, 0), rng() < 0.5 ? 0x8d8a80 : 0xa39d8c, s.x, s.y + r * 0.4, s.z, r * 1.3, r * 0.8, r));
  }
  for (let i = 0; i < 2; i++) {
    const s = spot(0.6, 1.3);
    const turn = rng() * Math.PI;
    for (let arm = 0; arm < 5; arm++) {
      const g = part(new THREE.ConeGeometry(0.045, 0.17, 3), 0xd9774a);
      g.rotateZ(-Math.PI / 2).translate(0.085, 0, 0).rotateY(turn + (arm * TAU) / 5).scale(1, 0.4, 1);
      parts.push(g.translate(s.x, s.y + 0.01, s.z));
    }
  }
  const anchorParts = [
    part(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), 0x5b4f45),
    part(new THREE.CylinderGeometry(0.015, 0.015, 0.26, 5).rotateZ(Math.PI / 2), 0x5b4f45, 0, 0.2, 0),
    part(new THREE.TorusGeometry(0.05, 0.012, 4, 8), 0x5b4f45, 0, 0.29, 0),
    part(new THREE.TorusGeometry(0.17, 0.02, 4, 10, Math.PI).rotateZ(Math.PI), 0x5b4f45, 0, -0.08, 0),
    part(new THREE.ConeGeometry(0.04, 0.09, 4), 0x5b4f45, 0.17, -0.06, 0),
    part(new THREE.ConeGeometry(0.04, 0.09, 4), 0x5b4f45, -0.17, -0.06, 0),
  ];
  const anchor = mergeGeometries(anchorParts)!;
  anchorParts.forEach((p) => p.dispose());
  const a = spot(2.4, 4.0);
  // Lying on its side, half settled into the sand.
  parts.push(anchor.rotateX(-Math.PI / 2 + 0.12).rotateY(rng() * TAU).translate(a.x, a.y + 0.03, a.z));
  const geo = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
  mesh.name = "floor-props";
  mesh.receiveShadow = true;
  return mesh;
}
