// The crystal sea's waves read as swell, sets and a travelling break (docs/design/crystal-water.md, docs/research/waves.md §4).
// Part 1 measures the CPU wave twin (makeSwell, the same table and formulas as the shader) with no GL. Part 2 renders the foam
// alone on SwiftShader and times how long it lives.
import assert from "node:assert/strict";
import { hexCorners, hexesInRadius, vertexId } from "@/lib/game/hex";
import { SHOAL, WAVES, makeSwell, travelAt } from "@/lib/scene/crystal-water";

// The island's coast loop, walked as isle-renderer.ts's coastLoop does.
function coastLoop() {
  const pts = new Map(), edges = new Map();
  for (const { q, r } of hexesInRadius(2)) {
    const ids = hexCorners(q, r).map((c) => (pts.set(vertexId(c.x, c.z), c), vertexId(c.x, c.z)));
    for (let i = 0; i < 6; i++) {
      const a = ids[i], b = ids[(i + 1) % 6], key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const e = edges.get(key);
      if (e) e.n++;
      else edges.set(key, { a, b, n: 1 });
    }
  }
  const next = new Map();
  for (const e of edges.values()) if (e.n === 1) for (const [p, q] of [[e.a, e.b], [e.b, e.a]]) next.set(p, [...(next.get(p) ?? []), q]);
  const loop = [next.keys().next().value];
  for (let prev = loop[0], cur = next.get(prev)[0]; cur !== loop[0]; ) {
    loop.push(cur);
    const ns = next.get(cur), to = ns[0] === prev ? ns[1] : ns[0];
    [prev, cur] = [cur, to];
  }
  const normal = (p, q) => {
    const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz);
    const [nx, nz] = [dz / l, -dx / l];
    return nx * (p.x + q.x) + nz * (p.z + q.z) < 0 ? { nx: -nx, nz: -nz } : { nx, nz };
  };
  return loop.map((id, i) => {
    const p = pts.get(id), a = normal(pts.get(loop[(i + loop.length - 1) % loop.length]), p), b = normal(p, pts.get(loop[(i + 1) % loop.length]));
    const ml = Math.hypot(a.nx + b.nx, a.nz + b.nz), mx = (a.nx + b.nx) / ml, mz = (a.nz + b.nz) / ml, k = 1 / (mx * a.nx + mz * a.nz);
    return { x: p.x, z: p.z, mx: mx * k, mz: mz * k };
  });
}

const coast = coastLoop();
const swell = makeSwell(coast);
// The windward ray: out from the middle of the coast edge that faces the swell most squarely.
const into = WAVES.swellA.dir;
let ray = null;
coast.forEach((a, i) => {
  const b = coast[(i + 1) % coast.length], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
  let [nx, nz] = [dz / l, -dx / l];
  if (nx * (a.x + b.x) + nz * (a.z + b.z) < 0) [nx, nz] = [-nx, -nz];
  const face = -(nx * into[0] + nz * into[1]);
  if (!ray || face > ray.face) ray = { face, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, nx, nz };
});
const at = (o, t) => swell(ray.x + ray.nx * o, ray.z + ray.nz * o, t);
const DT = 0.05, SPAN = 600, N = SPAN / DT;
const series = (o) => Array.from({ length: N }, (_, i) => at(o, i * DT).y);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2)));
const fx = (v, n = 3) => +v.toFixed(n);
const metrics = {}, failures = [];
const check = (ok, what) => ok || failures.push(what);

// 1. Arrival intervals at the shore: upward crossings of mean + 0.3 sigma, 1.6 out.
const shore = series(1.6);
const level = mean(shore) + 0.3 * sd(shore);
const ups = [];
for (let i = 1; i < N; i++) if (shore[i - 1] < level && shore[i] >= level) ups.push(i * DT);
const gaps = ups.slice(1).map((t, i) => t - ups[i]);
metrics.arrivalMean = fx(mean(gaps), 2);
metrics.arrivalCV = fx(sd(gaps) / mean(gaps));
check(metrics.arrivalMean >= 5.5 && metrics.arrivalMean <= 7, `arrivals every 5.5-7 s on average (${metrics.arrivalMean})`);
check(metrics.arrivalCV >= 0.15 && metrics.arrivalCV <= 0.45, `arrival intervals vary, CV 0.15-0.45, not a metronome (${metrics.arrivalCV})`);

// 2. Sets: the autocorrelation of a rolling 8 s peak has its first peak at 40-60 s, and sets stand 2x over lulls.
const W = Math.round(8 / DT);
const env = shore.map((_, i) => Math.max(...shore.slice(Math.max(0, i - W), i + 1))).slice(W);
const em = mean(env), lagBest = { lag: 0, r: -Infinity };
const acf = (lag) => mean(env.slice(0, env.length - lag).map((v, i) => (v - em) * (env[i + lag] - em)));
for (let lag = Math.round(20 / DT); lag <= Math.round(90 / DT); lag += 2) {
  const r = acf(lag);
  if (r > lagBest.r) Object.assign(lagBest, { lag, r });
}
const sorted = [...env].sort((a, b) => a - b);
metrics.setPeriod = fx(lagBest.lag * DT, 1);
metrics.setOverLull = fx(sorted[Math.floor(sorted.length * 0.9)] / sorted[Math.floor(sorted.length * 0.1)], 2);
check(metrics.setPeriod >= 40 && metrics.setPeriod <= 60, `sets every 40-60 s (${metrics.setPeriod})`);
check(metrics.setOverLull >= 2, `sets stand at least 2x over lulls (${metrics.setOverLull})`);

// 3. Bandwidth on the open sea, 8 out: under 5 % of the energy at periods below 3.5 s.
const open = series(8);
const om = mean(open);
let short = 0, total = 0;
for (let b = 1; b < N / 2; b++) {
  let re = 0, im = 0;
  const wv = (2 * Math.PI * b) / N;
  for (let i = 0; i < N; i++) {
    re += (open[i] - om) * Math.cos(wv * i);
    im += (open[i] - om) * Math.sin(wv * i);
  }
  const e = re * re + im * im;
  total += e;
  if (SPAN / b < 3.5) short += e;
}
metrics.shortEnergy = fx(short / total, 4);
check(metrics.shortEnergy < 0.05, `under 5 % of the energy below 3.5 s (${metrics.shortEnergy})`);

// 4. Slope: on the open sea never steeper than 0.12; the chop's RMS slope at most 0.4x the swells'; q k a under 1 when breaking.
let maxSlope = 0;
for (let r = 3; r <= 12; r += 0.5) for (let a = 0; a < 2 * Math.PI; a += 0.2) for (let t = 0; t < 60; t += 0.7) {
  const s = swell(Math.cos(a) * (6 + r), Math.sin(a) * (6 + r), t);
  maxSlope = Math.max(maxSlope, Math.hypot(s.gx, s.gz));
}
const rms = (...wv) => Math.sqrt(wv.reduce((s, v) => s + ((2 * Math.PI) / v.length * v.amp) ** 2 / 2, 0));
metrics.maxOpenSlope = fx(maxSlope);
metrics.chopOverSwell = fx(rms(WAVES.chop1, WAVES.chop2) / rms(WAVES.swellA, WAVES.swellB));
const qka = (wv) => wv.q * ((2 * Math.PI) / wv.length) * wv.amp;
metrics.openQka = fx(Object.values(WAVES).reduce((s, wv) => s + qka(wv), 0));
check(metrics.maxOpenSlope <= 0.12, `open-sea slope at most 0.12 (${metrics.maxOpenSlope})`);
check(metrics.chopOverSwell <= 0.4, `chop RMS slope at most 0.4x the swells' (${metrics.chopOverSwell})`);
check(metrics.openQka <= 0.9 && SHOAL.qCap < 1, `the surface never loops: open sea sum q k a ${metrics.openQka}, breaking ${SHOAL.qCap}`);

// 5 and 6. Follow each crest in to the beach: it slows to 0.35-0.5x between 2.0 and 0.4 out, and bigger waves break further out.
const crestTime = (o, near) => {
  // The highest point of the surface at o within 2 s of `near`.
  let best = near, top = -Infinity;
  for (let t = near - 2; t <= near + 2; t += 0.01) {
    const y = at(o, t).y;
    if (y > top) [best, top] = [t, y];
  }
  return best;
};
const speeds = [], waves = [];
for (const t0 of ups.filter((t) => t > 20 && t < SPAN - 20)) {
  const t1 = crestTime(1.6, t0 + 1);
  const when = (o) => crestTime(o, t1 + travelAt(1.6) - travelAt(o));
  const v = (lo, hi) => (hi - lo) / (when(lo) - when(hi));
  speeds.push(v(0.3, 0.5) / v(1.8, 2.2));
  let broke = null;
  for (let o = 2.5; o >= 0.25; o -= 0.02) {
    if (at(o, when(o)).brk > 0.5) {
      broke = o;
      break;
    }
  }
  waves.push({ group: at(1.6, t1).group, broke });
}
metrics.crestSpeedRatio = fx(mean(speeds));
check(metrics.crestSpeedRatio >= 0.35 && metrics.crestSpeedRatio <= 0.5, `crests slow to 0.35-0.5x between 2.0 and 0.4 out (${metrics.crestSpeedRatio})`);
waves.sort((a, b) => a.group - b.group);
const top = waves.slice(Math.floor(waves.length * 0.9)), small = waves.slice(0, Math.floor(waves.length * 0.2));
const median = waves[Math.floor(waves.length / 2)];
metrics.waves = waves.length;
metrics.setBreaksAt = fx(mean(top.map((w) => w.broke ?? 0)), 2);
metrics.medianBreaksAt = median.broke === null ? null : fx(median.broke, 2);
metrics.smallBreaking = small.filter((w) => w.broke !== null).length;
check(top.every((w) => w.broke !== null), "the biggest 10 % of waves break");
// The research's estimate was 0.3 further out. Breaking at H/d = 0.78 puts it at (top / median group height)^0.8 in depth, and two
// swells' group can be at most sqrt(2) taller at its top than at its median: on this floor that is about 0.2 units.
const broken = waves.filter((w) => w.broke !== null), rank = (a) => a.map((v) => a.filter((u) => u < v).length);
const [rg, rb] = [rank(broken.map((w) => w.group)), rank(broken.map((w) => w.broke))];
metrics.groupBreakRankCorr = fx(1 - (6 * rg.reduce((s, v, i) => s + (v - rb[i]) ** 2, 0)) / (broken.length * (broken.length ** 2 - 1)));
check(median.broke !== null && metrics.setBreaksAt - median.broke >= 0.15, `sets break at least 0.15 further out than the median wave (${metrics.setBreaksAt} vs ${metrics.medianBreaksAt})`);
check(metrics.groupBreakRankCorr >= 0.8, `the bigger the wave, the further out it breaks (rank correlation ${metrics.groupBreakRankCorr})`);
check(metrics.smallBreaking === 0, "the smallest 20 % of waves do not break");
console.log("waves-prove CPU twin:", JSON.stringify(metrics));
assert.deepEqual(failures, [], "CPU twin checks");

// Part 2: the foam alone (FOAM_ONLY: red = foam, green = offset / 2.5), overhead on the windward coast, 120 s at 4 frames a
// second on SwiftShader. Each pixel 0.5-2 units out records how long each foam event lasts.
const { chromium } = await import("playwright");
const { createServer } = await import("vite");
const port = Number(process.env.VITE_PORT || 8191);
const vite = await createServer({ server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${port}/`);
  const started = Date.now();
  const foam = await page.evaluate(async ({ coast, ray }) => {
    // The same three.js module instance the sea's module imports.
    const src = await (await fetch("/src/lib/scene/crystal-water.ts")).text();
    const THREE = await import(src.match(/from\s+"([^"]*three[^"]*\.js[^"]*)"/)[1]);
    const { makeCrystalSea, makeSplashes } = await import("/src/lib/scene/crystal-water.ts");
    const S = 96, renderer = new THREE.WebGLRenderer({ canvas: document.createElement("canvas"), preserveDrawingBuffer: true });
    renderer.setSize(S, S, false);
    // No splashes: the sea's splash uniforms with every slot empty.
    const uni = { uTime: { value: 0 }, uMotion: { value: 1 }, uFade: { value: new THREE.Vector2(40, 47) }, ...makeSplashes().uniforms };
    const sea = makeCrystalSea(coast, uni);
    sea.material.defines = { FOAM_ONLY: 1 };
    const scene = new THREE.Scene().add(sea);
    const cam = new THREE.OrthographicCamera(-1.3, 1.3, 1.3, -1.3, 0.1, 10);
    const cx = ray.x + ray.nx * 1.25, cz = ray.z + ray.nz * 1.25;
    cam.position.set(cx, 5, cz);
    cam.up.set(ray.nx, 0, ray.nz);
    cam.lookAt(cx, 0, cz);
    const gl = renderer.getContext(), px = new Uint8Array(S * S * 4);
    const FPS = 4, FRAMES = 120 * FPS, on = [], inBand = new Uint8Array(S * S);
    for (let f = 0; f < FRAMES; f++) {
      uni.uTime.value = 30 + f / FPS;
      renderer.render(scene, cam);
      gl.readPixels(0, 0, S, S, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const frame = new Uint8Array(S * S);
      for (let i = 0; i < S * S; i++) {
        frame[i] = px[i * 4] > 127 ? 1 : 0;
        if (f === 0) inBand[i] = px[i * 4 + 1] >= 0.5 / 2.5 * 255 && px[i * 4 + 1] <= 2 / 2.5 * 255 ? 1 : 0;
      }
      on.push(frame);
    }
    const runs = [];
    let foamy = 0, band = 0;
    for (let i = 0; i < S * S; i++) {
      if (!inBand[i]) continue;
      band++;
      let start = -1;
      for (let f = 0; f < FRAMES; f++) {
        foamy += on[f][i];
        if (on[f][i] && start < 0) start = f;
        if (!on[f][i] && start >= 0) {
          if (start > 0) runs.push((f - start) / FPS);
          start = -1;
        }
      }
    }
    uni.uMotion.value = 0;
    renderer.render(scene, cam);
    gl.readPixels(0, 0, S, S, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let still = 0;
    for (let i = 0; i < S * S; i++) still += px[i * 4] > 0 ? 1 : 0;
    runs.sort((a, b) => a - b);
    return { runs: runs.length, median: runs[Math.floor(runs.length / 2)], p95: runs[Math.floor(runs.length * 0.95)], longest: runs[runs.length - 1], coverage: foamy / band / FRAMES, still };
  }, { coast, ray });
  const m = { foamEvents: foam.runs, median: foam.median, p95: foam.p95, longest: foam.longest, coverage: fx(foam.coverage), reducedMotionFoamPixels: foam.still, seconds: fx((Date.now() - started) / 1000, 1) };
  console.log("waves-prove foam (SwiftShader):", JSON.stringify(m));
  assert.ok(foam.runs > 100, `foam events seen (${foam.runs})`);
  assert.ok(foam.median >= 1.5 && foam.median <= 2.5, `foam lives 1.5-2.5 s, median (${foam.median})`);
  assert.ok(foam.p95 <= 3.5 && foam.longest <= 5, `foam is gone by 3.5 s (p95 ${foam.p95}), never over 5 s (${foam.longest})`);
  assert.equal(foam.still, 0, "reduced motion: no breaker foam");
  assert.deepEqual(errors, [], "zero browser/GL errors");
  console.log("waves-prove: all checks passed");
} finally {
  await browser.close();
  await vite.close();
}
