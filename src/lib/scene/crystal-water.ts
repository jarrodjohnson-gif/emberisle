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
// The breaking band needs vertices 0.12 apart: a breaking crest is 2-3 of them wide.
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
};
// Near the coast the swells' crests are re-timed by their travel time over the floor, so one crest runs from the open sea to the
// beach, slowing as the water shallows (finite-depth celerity c(d), normalised to the open sea's 6.6 / 5.8 at depth 0.9). Over
// `blend` the phase hands over from the open sea to the travel-time phase. Heights shoal by Green's law, (deep / d)^0.25; a wave
// breaks as its height over the depth crosses `breakAt` (0.78 is the classic limit), then keeps `gamma` x the depth. A breaking
// crest sharpens: its steepness rises to qCap / (k a), at most qMax, so q k a stays under 1 and the surface never loops.
export const SHOAL = { blend: [2.5, 4.5], deep: 0.9, minDepth: 0.08, breakAt: [0.7, 0.95], gamma: 0.9, qCap: 0.85, qMax: 1.5 } as const;
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
// Breaker foam: noise features 0.45 and 0.14 units across (2.2 and 7 cycles per unit), carried shoreward 0.5 units per second of
// its age; a solid lip for the first 0.35 s after the crest, then lace whose threshold rises 0.17 a second until it is gone at 2.2 s.
const FOAM = { scales: [2.2, 7], drift: 0.5, lip: 0.35, life: 2.2 } as const;
// Touch the sea (crystal-water.md "Touch the sea"): at most `max` live splashes, the oldest replaced. Each is a crater that
// dips `depth` and rebounds (period, decay), then `rings` ripple rings leaving `r0` out at `speed`, `gap` s apart, of height
// `amp` x 1, 0.7, 0.4 and half-width `width`, dying by e every `ringDecay` s; a foam patch `foam` across for `foamLife` s.
// All of it fades out over the last 40 % of `life`. A splash is not made within `minOffset` of the coast (the beach).
export const SPLASH = {
  max: 8, life: 1.8, depth: 0.07, radius: 0.22, period: 0.42, decay: 0.32,
  rings: 3, r0: 0.1, speed: 1.1, gap: 0.16, amp: 0.022, width: 0.08, ringDecay: 0.75,
  foam: 0.3, foamLife: 0.9, minOffset: 0.15, droplets: 6,
} as const;
const SPLASH_REACH = SPLASH.r0 + SPLASH.speed * SPLASH.life + 3 * SPLASH.width;
const TAU = Math.PI * 2;
const k = (l: number) => TAU / l;
const w = (t: number) => TAU / t;
const { swellA, swellB, chop1, chop2 } = WAVES;
const KA = k(swellA.length);
const C0 = swellA.length / swellA.period;
const celerity = (d: number) => C0 * Math.sqrt(Math.tanh(KA * d) / Math.tanh(KA * SHOAL.deep));
// Seconds a crest takes from offset o to the coast (negative under the beach), tabulated every 0.02 units by the midpoint rule.
const TRAVEL_STEP = 0.02;
const TRAVEL_FROM = OFFSET[0]!;
const TRAVEL = (() => {
  const n = Math.ceil((OFFSET[OFFSET.length - 1]! - TRAVEL_FROM) / TRAVEL_STEP);
  const zero = Math.round(-TRAVEL_FROM / TRAVEL_STEP);
  const out = [0];
  for (let i = 1; i <= n; i++) out.push(out[i - 1]! + TRAVEL_STEP / celerity(depthAt(TRAVEL_FROM + (i - 0.5) * TRAVEL_STEP)));
  return out.map((v) => v - out[zero]!);
})();
export function travelAt(o: number) {
  const x = Math.max(0, Math.min(TRAVEL.length - 1.001, (o - TRAVEL_FROM) / TRAVEL_STEP));
  const i = Math.floor(x);
  return TRAVEL[i]! + (TRAVEL[i + 1]! - TRAVEL[i]!) * (x - i);
}
const TRAVEL_OUT = travelAt(SHOAL.blend[1]);
// The swash reads the wave at this offset, just off the waterline.
const SWASH_AT = 0.3;
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

// The splashes, shared by the crystal sea, its droplets and (rings only) the simple sea; ported line for line in makeSplashes.
// uSplash[i] is (x, z, start time, strength); a strength of 0 is an empty slot.
export const SPLASH_GLSL = /* glsl */ `
  uniform vec4 uSplash[${SPLASH.max}];
  uniform float uSplashNow;
  uniform float uSplashLive;
  // Every live splash at p: x the height, yz its gradient, w how white (the rings' crests, plus the foam patch x foam).
  vec4 splashField(vec2 p, float motion, float foam) {
    vec4 acc = vec4(0.0);
    // Nothing live (nearly always): skip the loop, so a still sea costs what it did before.
    if (uSplashLive < 0.5) return acc;
    for (int i = 0; i < ${SPLASH.max}; i++) {
      vec4 s = uSplash[i];
      float a = uSplashNow - s.z;
      if (s.w <= 0.0 || a < 0.0 || a > ${f(SPLASH.life)}) continue;
      vec2 dv = p - s.xy;
      float r = length(dv);
      if (r > ${f(SPLASH_REACH)}) continue;
      float fade = s.w * (1.0 - smoothstep(${f(SPLASH.life * 0.6)}, ${f(SPLASH.life)}, a));
      float h = -${f(SPLASH.depth)} * exp(-r * r / ${f(SPLASH.radius ** 2)}) * cos(${f(TAU / SPLASH.period)} * a) * exp(-a / ${f(SPLASH.decay)});
      float dh = -2.0 * r / ${f(SPLASH.radius ** 2)} * h;
      float white = 0.0;
      for (int k = 0; k < ${SPLASH.rings}; k++) {
        float ak = a - float(k) * ${f(SPLASH.gap)};
        float u = (r - ${f(SPLASH.r0)} - ${f(SPLASH.speed)} * max(ak, 0.0)) / ${f(SPLASH.width)};
        float e = exp(-u * u);
        float amp = ${f(SPLASH.amp)} * (1.0 - 0.3 * float(k)) * exp(-a / ${f(SPLASH.ringDecay)}) * smoothstep(0.0, 0.08, ak);
        h += amp * e * (1.0 - 2.0 * u * u);
        dh -= amp * e * 2.0 * u * (3.0 - 2.0 * u * u) / ${f(SPLASH.width)};
        white += amp / ${f(SPLASH.amp)} * max(e * (1.0 - 2.0 * u * u), 0.0);
      }
      acc.x += motion * fade * h;
      acc.yz += motion * fade * dh * dv / max(r, 1e-4);
      float spot = (1.0 - smoothstep(${f(SPLASH.foam * 0.4)}, ${f(SPLASH.foam)}, r)) * (1.0 - smoothstep(0.0, ${f(SPLASH.foamLife)}, a));
      acc.w += motion * fade * white * 0.6 + foam * s.w * spot;
    }
    return acc;
  }
`;

// The wave field, shared by the surface, the wash on the sand and (ported line for line in makeSwell) the boats. Needs uTime
// and uMotion. Rest point p, o off the coast, inward n pointing at the beach, depth d, travel time tau to the coast.
const g3 = (g: readonly number[]) => `${f(g[0]!)} * p.x + ${f(g[1]!)} * p.y + ${f(g[2]!)} * uTime`;
const WAVE_GLSL = /* glsl */ `
  const float TAU = 6.28318530718;
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), u = fract(p);
    u = u * u * (3.0 - 2.0 * u);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float beachTaper(float o) { return smoothstep(0.0, 0.45, o); }
  float farFade(float o) { return 1.0 - smoothstep(12.0, 20.0, o); }
  float gust(vec2 p) { return 0.6 + 0.4 * (0.5 + 0.5 * sin(${g3(GUST[0])}) * sin(${g3(GUST[1])})); }
  float chop1Phase(vec2 p) { return ${f(k(chop1.length))} * dot(${v2(chop1.dir)}, p) - ${f(w(chop1.period))} * uTime; }
  float chop2Phase(vec2 p) { return ${f(k(chop2.length))} * dot(${v2(chop2.dir)}, p) - ${f(w(chop2.period))} * uTime; }
  // 1 near the coast (travel-time phase), 0 on the open sea, and its slope along o.
  float shoreBlend(float o) { return 1.0 - smoothstep(${f(SHOAL.blend[0])}, ${f(SHOAL.blend[1])}, o); }
  float shoreBlendSlope(float o) {
    float u = clamp((o - ${f(SHOAL.blend[0])}) / ${f(SHOAL.blend[1] - SHOAL.blend[0])}, 0.0, 1.0);
    return -6.0 * u * (1.0 - u) / ${f(SHOAL.blend[1] - SHOAL.blend[0])};
  }
  // Near the coast a swell's phase is the open sea's phase at the anchor, the point straight out from the island's centre
  // where the blend ends, tau(anchor) - tau seconds ago: one crest, slowing as it comes in. The anchor uses the radial
  // direction, not the coast's normal, because the hexes' zigzag coast would kink the crest. shift is that phase minus the
  // open sea's here; it is continuous, so the crest never jumps.
  float shift(vec2 p, float o, float tau, float k, float w, vec2 d) {
    return k * dot(d, normalize(p)) * (${f(SHOAL.blend[1])} - o) + w * (${f(TRAVEL_OUT)} - tau);
  }
  float swellPhase(vec2 p, float o, float tau, float k, float w, vec2 d) {
    return k * dot(d, p) - w * uTime + shoreBlend(o) * shift(p, o, tau, k, w, d);
  }
  // Its gradient, nearly: the open sea's k d, turning near the coast to w / c along the inward n while the along-coast part
  // stays (refraction), plus the blend's own slope.
  vec2 swellGrad(vec2 p, float o, vec2 n, float tau, float c, float k, float w, vec2 d) {
    return k * d + (shoreBlend(o) * (w / c - k * dot(d, n)) - shoreBlendSlope(o) * shift(p, o, tau, k, w, d)) * n;
  }
  float celerity(float d) { return ${f(C0)} * sqrt(tanh(${f(KA)} * d) / ${f(Math.tanh(KA * SHOAL.deep))}); }
  // The two swells here: x, y their phases, z the height of their group (the set envelope), w how much it is breaking.
  vec4 swells(vec2 p, float o, float tau, float d) {
    float thA = swellPhase(p, o, tau, ${f(k(swellA.length))}, ${f(w(swellA.period))}, ${v2(swellA.dir)});
    float thB = swellPhase(p, o, tau, ${f(k(swellB.length))}, ${f(w(swellB.period))}, ${v2(swellB.dir)});
    float e = sqrt(${f(swellA.amp ** 2 + swellB.amp ** 2)} + ${f(2 * swellA.amp * swellB.amp)} * cos(thA - thB));
    float h = 2.0 * e * pow(${f(SHOAL.deep)} / max(d, ${f(SHOAL.minDepth)}), 0.25) * beachTaper(o);
    return vec4(thA, thB, e, smoothstep(${f(SHOAL.breakAt[0])}, ${f(SHOAL.breakAt[1])}, h / d));
  }
  // The swells' height factor: Green's law, capped once broken at gamma x the depth.
  float shoal(float e, float d) {
    return min(pow(${f(SHOAL.deep)} / max(d, ${f(SHOAL.minDepth)}), 0.25), ${f(SHOAL.gamma / 2)} * d / max(e, 1e-4));
  }
  // Seconds since the group's crest passed (0 to about 6), from the phase of the two swells' sum.
  float sinceCrest(vec4 sw) {
    float phi = atan(${f(swellA.amp)} * sin(sw.x) + ${f(swellB.amp)} * sin(sw.y), ${f(swellA.amp)} * cos(sw.x) + ${f(swellB.amp)} * cos(sw.y));
    return mod(1.5707963 - phi, TAU) / ${f(w(swellA.period))};
  }
  void gerstner(float th, vec2 d, float k, float a, float q, inout vec3 off, inout vec3 n) {
    float c = cos(th), s = sin(th);
    off += vec3(q * a * d.x * c, a * s, q * a * d.y * c);
    n += vec3(-d.x * k * a * c, -q * k * a * s, -d.y * k * a * c);
  }
  // The displacement of the rest point. nrm is the world normal.
  vec3 seaOffset(vec2 p, float o, vec2 n, float tau, float d, out vec3 nrm) {
    nrm = vec3(0.0, 1.0, 0.0);
    vec3 off = vec3(0.0);
    float m = uMotion * beachTaper(o), c = celerity(max(d, ${f(SHOAL.minDepth)}));
    vec4 sw = swells(p, o, tau, d);
    float a = shoal(sw.z, d);
    vec2 gA = swellGrad(p, o, n, tau, c, ${f(k(swellA.length))}, ${f(w(swellA.period))}, ${v2(swellA.dir)});
    vec2 gB = swellGrad(p, o, n, tau, c, ${f(k(swellB.length))}, ${f(w(swellB.period))}, ${v2(swellB.dir)});
    float kA = length(gA), kB = length(gB);
    float qb = min(${f(SHOAL.qCap)} / (kA * ${f(swellA.amp + swellB.amp)} * a), ${f(SHOAL.qMax)});
    gerstner(sw.x, gA / kA, kA, ${f(swellA.amp)} * a * m, mix(${f(swellA.q)}, qb, sw.w), off, nrm);
    gerstner(sw.y, gB / kB, kB, ${f(swellB.amp)} * a * m, mix(${f(swellB.q)}, qb, sw.w), off, nrm);
    float chop = m * farFade(o) * smoothstep(${f(CHOP_IN[0])}, ${f(CHOP_IN[1])}, o) * gust(p);
    gerstner(chop1Phase(p), ${v2(chop1.dir)}, ${f(k(chop1.length))}, ${f(chop1.amp)} * chop, ${f(chop1.q)}, off, nrm);
    gerstner(chop2Phase(p), ${v2(chop2.dir)}, ${f(k(chop2.length))}, ${f(chop2.amp)} * chop, ${f(chop2.q)}, off, nrm);
    return off;
  }
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

/**
 * Uniforms the renderer drives: the clock, motion (0 under reduced motion), the radius band where the sea meets the paper, and
 * the splashes with their own clock (it runs under reduced motion too, so the foam patch fades).
 */
export type SeaUniforms = { uTime: Uniform; uMotion: Uniform; uFade: { value: THREE.Vector2 } } & SplashUniforms;

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
    aTravel: [1, (o) => [travelAt(o)]],
    aDepth: [1, (o) => [depthAt(o)]],
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
      attribute float aTravel;
      attribute float aDepth;
      varying float vCoast;
      varying vec2 vRest;
      varying vec2 vInward;
      varying float vTravel;
      varying float vDepth;
      varying vec3 vWaveN;
      varying vec3 vWorld;
      varying vec3 vView;
      ${WAVE_GLSL}
      ${SPLASH_GLSL}
      void main() {
        vec3 p = position + seaOffset(position.xz, aCoast, aInward, aTravel, aDepth, vWaveN);
        p.y += splashField(position.xz, uMotion, 0.0).x * beachTaper(aCoast);
        vCoast = aCoast;
        vInward = aInward;
        vTravel = aTravel;
        vDepth = aDepth;
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
      varying vec2 vInward;
      varying float vTravel;
      varying float vDepth;
      varying vec3 vWaveN;
      varying vec3 vWorld;
      varying vec3 vView;
      ${WAVE_GLSL}
      ${SPLASH_GLSL}
      float sceneZ(vec2 uv) {
        float d = texture2D(uUnderDepth, uv).x;
        return isOrthographic ? orthographicDepthToViewZ(d, uNear, uFar) : perspectiveDepthToViewZ(d, uNear, uFar);
      }
      void main() {
        // The waves' own normal plus a faint, broad ripple.
        vec2 p = vRest;
        float a = p.x * 0.8 + uTime * 0.17, b = p.y * 0.6 - uTime * 0.13;
        vec2 g = 0.01 * uMotion * vec2(0.8 * cos(a) * sin(b), 0.6 * sin(a) * cos(b));
        // The splashes' craters and rings, drawn to the pixel (the vertices carry only their broad height).
        vec4 sp = splashField(vRest, uMotion, 1.0);
        vec3 N = normalize(vWaveN + vec3(-g.x - sp.y, 0.0, -g.y - sp.z));
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
        // Breakers, only where this wave is breaking: a solid lip behind the crest, then broad lace that drifts shoreward
        // with the water and dissolves.
        float o = vCoast;
        vec4 sw = swells(vRest, o, vTravel, vDepth);
        float age = sinceCrest(sw);
        // Carried shoreward by its own age (bounded, so the corners' turning inward cannot smear it), and slid sideways with
        // the clock so each wave's lace is new.
        vec2 q = vRest - vInward * ${f(FOAM.drift)} * age + vec2(0.07, 0.05) * uTime;
        float n = 0.7 * vnoise(q * ${f(FOAM.scales[0])}) + 0.3 * vnoise(q * ${f(FOAM.scales[1])});
        float u = age / ${f(FOAM.life)}, thr = 0.05 + 0.17 * age;
        float lip = 1.0 - smoothstep(${f(FOAM.lip * 0.7)}, ${f(FOAM.lip)}, age);
        float alive = sw.w * smoothstep(0.2, 0.32, o) * (1.0 - smoothstep(0.85, 1.0, u));
        float foam = alive * max(lip, smoothstep(thr - 0.06, thr + 0.06, n));
        #ifdef FOAM_ONLY
          gl_FragColor = vec4(uMotion * foam, clamp(o / 2.5, 0.0, 1.0), 0.0, 1.0);
          return;
        #endif
        c = mix(c, vec3(2.6, 2.7, 2.65), uMotion * foam * 0.9);
        if (sp.w > 0.0) c = mix(c, vec3(2.6, 2.7, 2.65), clamp(sp.w * (0.75 + 0.25 * vnoise(vRest * 9.0 + uTime)), 0.0, 1.0) * 0.85);
        c = mix(c, uPaper, smoothstep(uFade.x, uFade.y, length(vRest)));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "crystal-sea";
  // The droplets ride with the sea, so the refraction's under pass leaves them out with it.
  mesh.add(makeDroplets(mat.uniforms as unknown as SeaUniforms & { uResolution: { value: THREE.Vector2 } }));
  return mesh;
}

/**
 * The edge of the crystal sea, over the beach and the first 0.42 units of water: a thin, broken lace line where the water meets
 * the sand (it stays under reduced motion), and the swash, foam that runs up the sand after each breaker and slides back.
 */
export function makeWash(coast: Coast, { uTime, uMotion }: SeaUniforms) {
  const geo = coastRings(
    subdivide(coast, SUBDIVIDE),
    [0, 0.06, 0.12, 0.18, 0.24, 0.3, 0.36, 0.42],
    () => 0,
    { aCoast: [1, (o) => [o]], aInward: [2, (_, c) => inward(c)] },
    false,
  );
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime, uMotion },
    vertexShader: /* glsl */ `
      attribute float aCoast;
      attribute vec2 aInward;
      varying float vCoast;
      varying vec2 vRest;
      varying vec2 vInward;
      void main() {
        vCoast = aCoast;
        vRest = position.xz;
        vInward = aInward;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uMotion;
      varying float vCoast;
      varying vec2 vRest;
      varying vec2 vInward;
      ${WAVE_GLSL}
      void main() {
        // Each wave as it reaches the waterline: a run-up 0.9 s fast and a 2.1 s draw-back, as far as the wave is big (a lull
        // laps, a set rushes).
        float d = ${f(depthAt(SWASH_AT))};
        vec4 sw = swells(vRest + vInward * (vCoast - ${f(SWASH_AT)}), ${f(SWASH_AT)}, ${f(travelAt(SWASH_AT))}, d);
        float t = sinceCrest(sw), u = clamp(t / 3.0, 0.0, 1.0);
        float size = smoothstep(0.01, 0.08, sw.z);
        float run = u < 0.3 ? sin(u / 0.3 * 1.5707963) : cos((u - 0.3) / 0.7 * 1.5707963);
        float edge = 0.35 - 0.33 * (0.25 + 0.75 * size) * run;
        float sheet = step(edge, vCoast) * (1.0 - smoothstep(0.3, 0.42, vCoast)) * (1.0 - smoothstep(0.6, 2.4, t)) * (0.4 + 0.6 * size);
        float n = vnoise(vRest * 7.0 + uTime * 0.5);
        float line = (1.0 - smoothstep(0.0, 0.035, abs(vCoast - edge))) * (1.0 - smoothstep(2.0, 3.0, t)) * (0.5 + 0.5 * size);
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

/**
 * The CPU twin of `seaOffset`'s height and slope at a rest point, for the boats and the visitors, line for line from WAVE_GLSL
 * (the height is taken at the rest point, not the displaced one). `brk` is how much the wave is breaking there, `group` the
 * height of the swells' group (the set envelope).
 */
export function makeSwell(coast: Coast, splash?: Splashes) {
  const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);
  const [b0, b1] = SHOAL.blend;
  const blend = (o: number) => 1 - smooth(b0, b1, o);
  const blendSlope = (o: number) => {
    const u = Math.max(0, Math.min(1, (o - b0) / (b1 - b0)));
    return (-6 * u * (1 - u)) / (b1 - b0);
  };
  const green = (d: number) => (SHOAL.deep / Math.max(d, SHOAL.minDepth)) ** 0.25;
  return (x: number, z: number, t: number) => {
    const { o, ix, iz } = nearestCoast(coast, x, z);
    const depth = depthAt(o), tau = travelAt(o), s = blend(o), m = smooth(0, 0.45, o);
    const c = celerity(Math.max(depth, SHOAL.minDepth));
    const r = Math.hypot(x, z) || 1;
    const shift = (wv: typeof swellA) => k(wv.length) * ((wv.dir[0] * x + wv.dir[1] * z) / r) * (b1 - o) + w(wv.period) * (TRAVEL_OUT - tau);
    const phase = (wv: typeof swellA) => k(wv.length) * (wv.dir[0] * x + wv.dir[1] * z) - w(wv.period) * t + s * shift(wv);
    const thA = phase(swellA), thB = phase(swellB);
    const group = Math.sqrt(swellA.amp ** 2 + swellB.amp ** 2 + 2 * swellA.amp * swellB.amp * Math.cos(thA - thB));
    const brk = smooth(SHOAL.breakAt[0], SHOAL.breakAt[1], (2 * group * green(depth) * m) / depth);
    const lift = Math.min(green(depth), ((SHOAL.gamma / 2) * depth) / Math.max(group, 1e-4));
    let y = 0, gx = 0, gz = 0;
    const add = (th: number, kx: number, kz: number, amp: number) => {
      y += amp * Math.sin(th);
      gx += kx * amp * Math.cos(th);
      gz += kz * amp * Math.cos(th);
    };
    for (const [wv, th] of [[swellA, thA], [swellB, thB]] as const) {
      const kk = k(wv.length), ww = w(wv.period);
      const along = s * (ww / c - kk * (wv.dir[0] * ix + wv.dir[1] * iz)) - blendSlope(o) * shift(wv);
      add(th, kk * wv.dir[0] + along * ix, kk * wv.dir[1] + along * iz, wv.amp * lift * m);
    }
    const chop = m * (1 - smooth(12, 20, o)) * smooth(CHOP_IN[0], CHOP_IN[1], o) * gust(x, z, t);
    for (const wv of [chop1, chop2]) add(k(wv.length) * (wv.dir[0] * x + wv.dir[1] * z) - w(wv.period) * t, k(wv.length) * wv.dir[0], k(wv.length) * wv.dir[1], wv.amp * chop);
    if (splash) {
      const sp = splash.field(x, z, t);
      y += sp.y * m;
      gx += sp.gx * m;
      gz += sp.gz * m;
    }
    return { y, gx, gz, brk, group };
  };
}

/** Distance to the nearest coast edge, the direction back to it, and whether the point is off the island (out of the loop). */
export function nearestCoast(coast: Coast, x: number, z: number) {
  const n = coast.length;
  let o = Infinity, ix = 0, iz = 0, px = 0, pz = 0;
  for (let i = 0; i < n; i++) {
    const a = coast[i]!, b = coast[(i + 1) % n]!;
    const dx = b.x - a.x, dz = b.z - a.z;
    const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const qx = a.x + dx * u, qz = a.z + dz * u;
    const d = Math.hypot(x - qx, z - qz);
    if (d < o) [o, ix, iz, px, pz] = [d, (qx - x) / (d || 1), (qz - z) / (d || 1), qx, qz];
  }
  // Off the island when the way back to the coast points toward the island's middle.
  return { o, ix, iz, offshore: ix * px + iz * pz < 0 };
}

type SplashUniforms = { uSplash: { value: THREE.Vector4[] }; uSplashNow: Uniform; uSplashLive: Uniform };
export type Splashes = ReturnType<typeof makeSplashes>;

/**
 * The live splashes: a small uniform array (SPLASH.max slots, the oldest replaced) and its CPU twin `field`, line for line
 * from SPLASH_GLSL at full motion, so the boats and the surfaced visitors bob when a ring passes.
 */
export function makeSplashes() {
  const slots = Array.from({ length: SPLASH.max }, () => new THREE.Vector4(0, 0, -1e3, 0));
  const uniforms: SplashUniforms = { uSplash: { value: slots }, uSplashNow: { value: 0 }, uSplashLive: { value: 0 } };
  const alive = (s: THREE.Vector4, t: number) => s.w > 0 && t - s.z >= 0 && t - s.z <= SPLASH.life;
  const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);
  const R2 = SPLASH.radius ** 2;
  return {
    uniforms,
    /** A splash at (x, z) of `strength` (1 a tap, less for a drag's trail) starting at clock time t. */
    add(x: number, z: number, strength: number, t: number) {
      const slot = slots.find((s) => !alive(s, t)) ?? slots.reduce((a, b) => (b.z < a.z ? b : a));
      slot.set(x, z, t, strength);
    },
    step(t: number) {
      uniforms.uSplashNow.value = t;
      uniforms.uSplashLive.value = slots.some((s) => alive(s, t)) ? 1 : 0;
    },
    live(t: number) {
      return slots.filter((s) => alive(s, t)).length;
    },
    field(x: number, z: number, t: number) {
      let y = 0, gx = 0, gz = 0;
      for (const s of slots) {
        const a = t - s.z;
        if (s.w <= 0 || a < 0 || a > SPLASH.life) continue;
        const dx = x - s.x, dz = z - s.y;
        const r = Math.hypot(dx, dz);
        if (r > SPLASH_REACH) continue;
        const fade = s.w * (1 - smooth(SPLASH.life * 0.6, SPLASH.life, a));
        let h = -SPLASH.depth * Math.exp(-(r * r) / R2) * Math.cos((TAU / SPLASH.period) * a) * Math.exp(-a / SPLASH.decay);
        let dh = ((-2 * r) / R2) * h;
        for (let k = 0; k < SPLASH.rings; k++) {
          const ak = a - k * SPLASH.gap;
          const u = (r - SPLASH.r0 - SPLASH.speed * Math.max(ak, 0)) / SPLASH.width;
          const e = Math.exp(-u * u);
          const amp = SPLASH.amp * (1 - 0.3 * k) * Math.exp(-a / SPLASH.ringDecay) * smooth(0, 0.08, ak);
          h += amp * e * (1 - 2 * u * u);
          dh -= (amp * e * 2 * u * (3 - 2 * u * u)) / SPLASH.width;
        }
        y += fade * h;
        gx += (fade * dh * dx) / Math.max(r, 1e-4);
        gz += (fade * dh * dz) / Math.max(r, 1e-4);
      }
      return { y, gx, gz };
    },
  };
}

/**
 * A few droplets thrown up by each tap's splash (strength 0.6 and up): SPLASH.droplets points per slot, one draw call,
 * flown on the GPU from the slot's start time. None under reduced motion.
 */
function makeDroplets(u: SeaUniforms & { uResolution: { value: THREE.Vector2 } }) {
  const rng = mulberry32(hashStr("emberisle-droplets"));
  const slot: number[] = [], vel: number[] = [];
  for (let i = 0; i < SPLASH.max; i++) {
    for (let j = 0; j < SPLASH.droplets; j++) {
      const a = ((j + rng() * 0.6) / SPLASH.droplets) * TAU, out = 0.3 + rng() * 0.25;
      slot.push(i);
      vel.push(Math.cos(a) * out, 0.9 + rng() * 0.35, Math.sin(a) * out);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(slot.length * 3), 3));
  geo.setAttribute("aSlot", new THREE.Float32BufferAttribute(slot, 1));
  geo.setAttribute("aVel", new THREE.Float32BufferAttribute(vel, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uSplash: u.uSplash, uSplashNow: u.uSplashNow, uMotion: u.uMotion, uResolution: u.uResolution },
    vertexShader: /* glsl */ `
      uniform vec4 uSplash[${SPLASH.max}];
      uniform float uSplashNow;
      uniform float uMotion;
      uniform vec2 uResolution;
      attribute float aSlot;
      attribute vec3 aVel;
      varying float vAlpha;
      void main() {
        vec4 s = uSplash[int(aSlot)];
        float a = uSplashNow - s.z;
        // Thrown from the crater, falling at 4 units/s², gone at 0.7 s or back under the surface.
        vec3 p = vec3(s.x, 0.0, s.y) + aVel * a - vec3(0.0, 2.0 * a * a, 0.0);
        float on = uMotion * step(0.6, s.w) * step(0.0, a) * step(a, 0.7) * step(0.0, p.y);
        vAlpha = on * (1.0 - smoothstep(0.4, 0.7, a));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = on * max(1.0, 0.035 * projectionMatrix[1][1] * 0.5 * uResolution.y / (isOrthographic ? 1.0 : -mv.z));
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c);
        if (d > 0.25 || vAlpha <= 0.0) discard;
        gl_FragColor = vec4(2.4, 2.6, 2.6, vAlpha * (1.0 - smoothstep(0.1, 0.25, d)));
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.name = "droplets";
  points.frustumCulled = false;
  return points;
}

/** The simple sea's splash: the rings alone, drawn as lighter lines in its fragment shader. No crater, foam or droplets. */
export function addSplashRings(mat: THREE.ShaderMaterial, u: SeaUniforms) {
  Object.assign(mat.uniforms, { uSplash: u.uSplash, uSplashNow: u.uSplashNow, uSplashLive: u.uSplashLive, uMotion: u.uMotion });
  mat.fragmentShader = mat.fragmentShader
    .replace("void main() {", `uniform float uMotion;\n${SPLASH_GLSL}\nvoid main() {`)
    .replace("c = mix(c, uFog", "c = mix(c, vec3(0.8, 0.98, 0.95), clamp(splashField(vXZ, uMotion, 0.0).w * 1.6, 0.0, 1.0) * 0.8);\n        c = mix(c, uFog");
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
