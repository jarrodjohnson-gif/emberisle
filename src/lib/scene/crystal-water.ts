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
// Beach sand at the waterline, a paler cool sand under the shallow band (warm sand under teal water reads olive, pale sand
// reads aqua), then teal sand under deep water.
const SAND = new THREE.Color(0xdcc9a0);
const PALE_SAND = new THREE.Color(0xe6ead8);
const DEEP_SAND = new THREE.Color(0xb8d8e0);

// Three Gerstner waves (direction of travel, wavelength, amplitude, period, steepness). The swell rolls in from the north-east
// (screen top-right in the home view), travelling south-west; the two chops cross it at +35° and -50°.
const rot = (d: [number, number], deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [d[0] * Math.cos(a) - d[1] * Math.sin(a), d[0] * Math.sin(a) + d[1] * Math.cos(a)];
};
const SW_DIR: [number, number] = [-Math.SQRT1_2, Math.SQRT1_2];
export const WAVES = {
  swell: { dir: SW_DIR, length: 7, amp: 0.045, period: 6, q: 0.6 },
  chop1: { dir: rot(SW_DIR, 35), length: 2.2, amp: 0.015, period: 3.4, q: 0.4 },
  chop2: { dir: rot(SW_DIR, -50), length: 1.3, amp: 0.008, period: 2.6, q: 0.3 },
  // In the last 2 units the swell turns to run straight at the beach (refraction), 1.6x as tall and 0.6x as long.
  shore: { band: 2, amp: 0.045 * 1.6, length: 7 * 0.6, period: 6, q: 0.8 },
};
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
`;

// The wave field, shared by the surface, the wash on the sand and (ported below) the boats. Needs uTime and uMotion.
const { swell, chop1, chop2, shore } = WAVES;
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
  float swellPhase(vec2 p) { return ${f(k(swell.length))} * dot(${v2(swell.dir)}, p) - ${f(w(swell.period))} * uTime; }
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
    float s = shoreLift(o), m = uMotion * beachTaper(o), far = m * farFade(o);
    gerstner(swellPhase(p), ${v2(swell.dir)}, ${f(k(swell.length))}, ${f(swell.amp)} * (1.0 - s) * m, ${f(swell.q)}, off, n);
    gerstner(shorePhase(p, o), inward, ${f(k(shore.length))}, ${f(shore.amp)} * s * m, ${f(shore.q)}, off, n);
    gerstner(chop1Phase(p), ${v2(chop1.dir)}, ${f(k(chop1.length))}, ${f(chop1.amp)} * far, ${f(chop1.q)}, off, n);
    gerstner(chop2Phase(p), ${v2(chop2.dir)}, ${f(k(chop2.length))}, ${f(chop2.amp)} * far, ${f(chop2.q)}, off, n);
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

/** The sea surface: Gerstner swell, chop and breakers; refraction through a transmission pass, absorbed toward teal with depth. */
export function makeCrystalSea(coast: Coast, uTime: Uniform, uMotion: Uniform) {
  const geo = coastRings(subdivide(coast, SUBDIVIDE), SURFACE_OFFSET, () => SURFACE, {
    aCoast: [1, (o) => [o]],
    aInward: [2, (_, c) => inward(c)],
    aDepth: [1, (o) => [depthAt(o)]],
  });
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x7fd8cf,
    roughness: 0.06,
    metalness: 0,
    transmission: 0.92,
    ior: 1.33,
    // Per unit of depth: 1.0 over the 0.9 deep floor, 0.11-0.29 over the shallow band.
    thickness: 1.1,
    attenuationColor: new THREE.Color(0x2fb8b0),
    attenuationDistance: 3.2,
    specularIntensity: 0.5,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uMotion = uMotion;
    shader.uniforms.uPaper = { value: PAPER };
    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        `uniform float uTime;\nuniform float uMotion;\nattribute float aCoast;\nattribute vec2 aInward;\nattribute float aDepth;\nvarying float vDepth;\nvarying float vCoast;\nvarying vec2 vRest;\nvarying vec3 vWaveN;\n${WAVE_GLSL}\nvoid main() {`,
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed += seaOffset(position.xz, aCoast, aInward, vWaveN);\nvDepth = aDepth;\nvCoast = aCoast;\nvRest = position.xz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `uniform float uTime;\nuniform float uMotion;\nuniform vec3 uPaper;\nvarying float vDepth;\nvarying float vCoast;\nvarying vec2 vRest;\nvarying vec3 vWaveN;\n${WAVE_GLSL}\nvoid main() {`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
        {
          // The waves' own normal, plus the small ripple the simple sea paints as colour, here as surface slope.
          vec2 p = vRest;
          float a = p.x * 2.1 + uTime * 0.45, b = p.y * 1.7 - uTime * 0.36;
          vec2 g = 0.035 * uMotion * vec2(2.1 * cos(a) * sin(b), 1.7 * sin(a) * cos(b));
          normal = normalize((viewMatrix * vec4(normalize(vWaveN + vec3(-g.x, 0.0, -g.y)), 0.0)).xyz);
        }`,
      )
      .replace(
        "#include <transmission_fragment>",
        THREE.ShaderChunk.transmission_fragment.replace("material.thickness = thickness;", "material.thickness = thickness * vDepth;"),
      )
      .replace(
        "#include <opaque_fragment>",
        /* glsl */ `#include <opaque_fragment>
        {
          // Breakers: foam on the crest in the last 1.4 units, trailing behind it and fading over 1.5 s, broken up by noise.
          float o = vCoast;
          float n = vnoise(vRest * 9.0 + uTime * 0.4) * 0.6 + vnoise(vRest * 23.0 - uTime * 0.7) * 0.4;
          float life = smoothstep(0.15, 0.3, o) * (1.0 - smoothstep(0.4, 1.2, o)) * (1.0 - smoothstep(0.0, 1.5, sinceCrest(vRest, o)));
          // Lace, not haze: fresh foam covers most of the noise, ageing foam only its peaks.
          float crash = life * smoothstep(0.6, 0.7, n + 0.4 * life);
          // Open-water whitecaps: where both chops crest at once, inside sparse slow patches.
          float caps = smoothstep(0.9, 1.0, sin(chop1Phase(vRest))) * smoothstep(0.4, 1.0, sin(chop2Phase(vRest)))
            * smoothstep(0.76, 0.92, vnoise(vRest * 0.4 + vec2(uTime * 0.03, 0.0))) * smoothstep(0.5, 0.8, vnoise(vRest * 11.0))
            * farFade(o) * (1.0 - shoreLift(o));
          float foam = uMotion * clamp(crash * 0.85 + caps * 0.35, 0.0, 1.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.1, 1.2, 1.18), foam);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uPaper, smoothstep(10.0, 22.0, length(vRest)));
        }`,
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "crystal-sea";
  return mesh;
}

/** The swash: after each breaker, foam runs up the sand and slides back, fading over 1.5 s. Above the beach, below the lace. */
export function makeWash(coast: Coast, uTime: Uniform, uMotion: Uniform) {
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
        float a = uMotion * clamp(sheet * (0.3 + 0.45 * n) + line * 0.7, 0.0, 1.0);
        gl_FragColor = vec4(0.81, 0.94, 0.94, a);
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
    const far = m * (1 - smooth(12, 20, o));
    const along = 1.6 * Math.sin(0.31 * x + 0.17 * z) + 1.0 * Math.sin(-0.23 * x + 0.29 * z);
    let y = 0, gx = 0, gz = 0;
    const add = (th: number, dx: number, dz: number, kk: number, amp: number) => {
      y += amp * Math.sin(th);
      gx += dx * kk * amp * Math.cos(th);
      gz += dz * kk * amp * Math.cos(th);
    };
    const open = (wv: typeof swell, amp: number) => add(k(wv.length) * (wv.dir[0] * x + wv.dir[1] * z) - w(wv.period) * t, wv.dir[0], wv.dir[1], k(wv.length), amp);
    open(swell, swell.amp * (1 - s) * m);
    add(-k(shore.length) * o - w(shore.period) * t - along, ix, iz, k(shore.length), shore.amp * s * m);
    open(chop1, chop1.amp * far);
    open(chop2, chop2.amp * far);
    return { y, gx, gz };
  };
}

/** The sea floor: sand under the shallows grading to teal sand, with the caustic pattern drifting over it. */
export function makeSeaFloor(coast: Coast, uTime: Uniform) {
  const c = new THREE.Color();
  const geo = coastRings(coast, OFFSET, (o) => SURFACE - depthAt(o), {
    color: [3, (o) => c.copy(SAND).lerp(PALE_SAND, THREE.MathUtils.smoothstep(o, 0.3, 1.0)).lerp(DEEP_SAND, THREE.MathUtils.smoothstep(o, 1.0, 2.6)).toArray()],
  });
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uPaper = { value: PAPER };
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "varying vec2 vFloorXZ;\nvoid main() {")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvFloorXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `uniform float uTime;\nuniform vec3 uPaper;\nvarying vec2 vFloorXZ;\n${CAUSTIC_GLSL}\nvoid main() {`)
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `#include <emissivemap_fragment>
        {
          vec2 p = vFloorXZ + vec2(sin(vFloorXZ.y * 0.9 + uTime * 0.32), cos(vFloorXZ.x * 0.7 - uTime * 0.25)) * 0.16;
          float light = caustic(p * 2.6 + vec2(uTime * 0.06, -uTime * 0.04));
          totalEmissiveRadiance += vec3(0.55, 0.78, 0.72) * light * 0.14 * (1.0 - smoothstep(6.0, 14.0, length(vFloorXZ)));
        }`,
      )
      .replace(
        "#include <opaque_fragment>",
        "#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uPaper, smoothstep(10.0, 22.0, length(vFloorXZ)));",
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
    const s = spot(1.0, 3.0);
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
