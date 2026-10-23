// #616: touch the sea (docs/design/crystal-water.md "Touch the sea"). A press on open water splashes there on pointerdown: the
// CPU twin dips and lifts at the point and its rings run outward over the next second, the drawn rings show, and the fish near
// it dart away. A press on a corner in build mode is the game's, never a splash; a tap on a tile wobbles it. Reduced motion
// draws the foam patch and no ring; the simple sea draws the ring and no foam; a burst of taps keeps at most 8 splashes.
// Headless Chromium on SwiftShader at 390x844 (touch) and 1280x720 (mouse). Run: npm run splash-prove
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const cpuThrottle = Number(process.env.SPLASH_PROVE_CPU_THROTTLE || 1);
assert.ok(Number.isInteger(cpuThrottle) && cpuThrottle >= 1 && cpuThrottle <= 16, "CPU throttle must be an integer from 1 to 16");
console.log(`splash-prove: tab-local CPU throttle x${cpuThrottle}`);
const port = Number(process.env.VITE_PORT || 8173);
const vite = await createServer({ server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
mkdirSync("test-results", { recursive: true });

async function open(width, height, touch, water) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
  await context.addInitScript((w) => localStorage.setItem("emberisle-water", w), water);
  // Each clip sound.ts starts, by file, without making a sound.
  await context.addInitScript(() => {
    window.__played = [];
    HTMLMediaElement.prototype.play = function () { window.__played.push(this.src.split("/").pop()); return Promise.resolve(); };
  });
  const page = await context.newPage();
  if (cpuThrottle > 1) await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
  page.on("pageerror", (e) => errors.push(`${width}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${width}: ${m.text()}`));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(() => window.__emberisle);
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
  await page.waitForFunction((w) => window.__isle?.lastState && window.__emberisle.water?.path === w, water);
  // Each drawn frame copied, so a check can read the pixels of the next one (grab) and compare two.
  await page.evaluate(() => {
    const isle = window.__isle;
    const gl = isle.renderer.domElement;
    const draw = isle.composer.render.bind(isle.composer);
    window.__shots = {};
    isle.composer.render = (...a) => {
      const out = draw(...a);
      const want = window.__want;
      if (want) {
        const c = document.createElement("canvas");
        c.width = gl.width;
        c.height = gl.height;
        c.getContext("2d").drawImage(gl, 0, 0);
        window.__shots[want.label] = c.getContext("2d").getImageData(0, 0, c.width, c.height);
        window.__want = null;
        want.res();
      }
      return out;
    };
    window.__grab = (label) => new Promise((res) => {
      window.__want = { label, res };
      const request = () => {
        if (window.__want?.res !== res) return;
        isle.wake();
        isle.tick();
        if (window.__want?.res === res) requestAnimationFrame(request);
      };
      request();
    });
  });
  await settle(page);
  return { context, page };
}

const settle = (page) => page.waitForFunction(() => !window.__isle.refitDue && !window.__isle.glide);

// The page holds a crafted turn: `phase` for the seat on turn, nothing armed.
const craft = (page, phase) =>
  page.evaluate((phase) => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.phase = phase;
    st.dice = [3, 4];
    st.seq += 1;
    g.setState({ state: st, buildMode: "none", error: null, pendingPlace: null });
  }, phase);

const tap = (page, p, touch) => (touch ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));

const live = (page) => page.evaluate(() => window.__isle.splash.live(window.__isle.clock.getElapsed() + (performance.now() - window.__isle.lastFrame) / 1000));

// Open water in the HUD hole with a fish within reach: 0.6 out from a fish, off the island (past 5.05, the farthest coast).
async function waterNearFish(page) {
  return page.evaluate(() => {
    const isle = window.__isle;
    const ins = isle.insets();
    const inHole = (p) => p.x > ins.left + 24 && p.x < innerWidth - ins.right - 24 && p.y > ins.top + 24 && p.y < innerHeight - ins.bottom - 24;
    for (let seed = 0; seed < 40; seed++) {
      isle.oceanLife.reset(`splash-proof-${seed}`);
      for (const f of isle.oceanLife.fishAt()) {
        const r = Math.hypot(f.x, f.z);
        const x = f.x + (f.x / r) * 0.6, z = f.z + (f.z / r) * 0.6;
        const s = isle.screenAt(x, 0, z);
        if (Math.hypot(x, z) > 5.4 && inHole(s) && document.elementFromPoint(s.x, s.y)?.tagName === "CANVAS") return { x, z, s };
      }
    }
    return null;
  });
}

// Mean luminance change (0-255) between two grabbed frames over 3x3 patches at world points (x, z) on the sea.
const diff = (page, a, b, pts) =>
  page.evaluate(({ a, b, pts }) => {
    const A = window.__shots[a], B = window.__shots[b];
    const k = A.width / window.innerWidth;
    const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    let sum = 0, n = 0;
    for (const [x, z] of pts) {
      const s = window.__isle.screenAt(x, -0.02, z);
      const cx = Math.round(s.x * k), cy = Math.round(s.y * k);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const i = ((cy + dy) * A.width + cx + dx) * 4;
        sum += Math.abs(lum(A.data, i) - lum(B.data, i));
        n++;
      }
    }
    return sum / n;
  }, { a, b, pts });
const circle = (c, r, n = 16) => Array.from({ length: n }, (_, i) => [c.x + r * Math.cos((i / n) * 2 * Math.PI), c.z + r * Math.sin((i / n) * 2 * Math.PI)]);

// One splash at (x, z) held at `age` seconds while two frames are grabbed: one with it, one with its slot emptied. The clock is
// held too (the waves, the fish and the sheep stand still), so the two frames differ only by the splash.
async function heldPair(page, at, age) {
  await page.evaluate(({ at, age }) => {
    const isle = window.__isle, sp = isle.splash, c = isle.clock, t = c.getElapsed();
    window.__clock = [c.getElapsed, c.getDelta];
    c.getElapsed = () => t;
    c.getDelta = () => 0;
    for (const s of sp.uniforms.uSplash.value) s.w = 0;
    const slot = sp.uniforms.uSplash.value[0];
    window.__step ??= sp.step;
    sp.step = (t) => { slot.set(at.x, at.z, t - age, window.__held ? 1 : 0); window.__step(t); };
    window.__held = true;
  }, { at, age });
  await page.evaluate(() => window.__grab("with"));
  await page.evaluate(() => { window.__held = false; return window.__grab("without"); });
  await page.evaluate(() => {
    const isle = window.__isle;
    isle.splash.step = window.__step;
    [isle.clock.getElapsed, isle.clock.getDelta] = window.__clock;
  });
}

// Exercise the real renderer wiring with one stalled visible frame. Other animation caps stay in place.
async function slowOceanFrame(page, tag) {
  const fence = await page.evaluate(() => {
    const isle = window.__isle, behind = isle.gpuBehind, busy = isle.busyUntil;
    const renders = isle.renderer.info.render.frame;
    try {
      isle.busyUntil = performance.now() + 1000;
      isle.lastFrame = -Infinity;
      isle.gpuBehind = () => true;
      isle.tick();
      const pending = isle.renderer.info.render.frame - renders;
      isle.gpuBehind = () => false;
      isle.tick();
      return { pending, ready: isle.renderer.info.render.frame - renders };
    } finally {
      isle.gpuBehind = behind;
      isle.busyUntil = busy;
    }
  });
  assert.equal(fence.pending, 0, `${tag}: busy motion waits for a pending GPU fence`);
  assert.ok(fence.ready > 0, `${tag}: busy motion draws once the GPU fence is ready`);
  const slow = await page.evaluate(() => {
    const isle = window.__isle, life = isle.oceanLife, delta = isle.clock.getDelta, busy = isle.busyUntil;
    try {
      life.reset("splash-frame-clock");
      const fish = life.fishAt()[0];
      life.scatter(fish.x, fish.z);
      const ids = life.fishFlee.flatMap((f, i) => f ? [i] : []), before = life.fishTime;
      isle.clock.getDelta = () => 4.25;
      isle.lastFrame = -Infinity;
      isle.busyUntil = performance.now() + 1000;
      isle.renderer.getContext().finish();
      isle.tick();
      const ages = ids.map((i) => life.fishFlee[i]?.age ?? 0), posed = life.fishAt();
      life.fishFlee.fill(null);
      life.swim();
      const home = life.fishAt();
      const elapsed = life.fishTime - before, error = Math.max(...ids.map((i) => Math.hypot(posed[i].x - home[i].x, posed[i].z - home[i].z)));
      life.reset("splash-recent-input");
      const recent = life.fishAt()[0];
      isle.lastFrame = performance.now() - 4200;
      isle.splashAt(recent.x, recent.z, 1);
      const recentIds = life.fishFlee.flatMap((f, i) => f ? [i] : []);
      isle.busyUntil = performance.now() + 1000;
      isle.renderer.getContext().finish();
      isle.tick();
      const recentAges = recentIds.map((i) => life.fishFlee[i]?.age ?? -1);
      isle.lastFrame = -Infinity;
      isle.busyUntil = performance.now() + 1000;
      isle.renderer.getContext().finish();
      isle.tick();
      const laterAges = recentIds.map((i) => life.fishFlee[i]?.age ?? -1);
      return { elapsed, ages, error, recentAges, laterAges };
    } finally {
      isle.clock.getDelta = delta;
      isle.busyUntil = busy;
      life.reset("splash-frame-clock-done");
      for (const slot of isle.splash.uniforms.uSplash.value) slot.w = 0;
      window.__played.length = 0; // Only the clock fixtures have run; the real interaction checks start next.
    }
  });
  assert.ok(Math.abs(slow.elapsed - 4.25) < 1e-9, `${tag}: one slow frame advances ocean life by elapsed seconds (${slow.elapsed})`);
  assert.ok(slow.ages.length > 0 && slow.ages.every((age) => age >= 4), `${tag}: a four-second stall completes every affected fish escape (${slow.ages})`);
  assert.ok(slow.error < 1e-6, `${tag}: fish return to their unfled swimming positions after the stall (${slow.error})`);
  assert.ok(slow.recentAges.length > 0 && slow.recentAges.every((age) => age >= 0 && age < 0.15), `${tag}: a new tap excludes the frame interval before the input (${slow.recentAges})`);
  assert.ok(slow.laterAges.every((age) => age >= 4), `${tag}: the input offset is consumed once, then escape time advances normally (${slow.laterAges})`);

  // A reduced-motion pause is not a slow visible frame. Capture the first enabled step on a real preference change.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => window.__isle.wasCalm && window.__isle.busyUntil < performance.now());
  // A requested calm frame completes in this task, even if its GPU readback takes longer than a wake hold.
  const captured = await page.evaluate(() => {
    void window.__grab("calm");
    return !!window.__shots.calm?.data.length && !window.__want;
  });
  assert.ok(captured, `${tag}: a calm snapshot completes synchronously without waiting for a sleeping animation loop`);
  await page.evaluate(() => {
    const isle = window.__isle, life = isle.oceanLife, delta = isle.clock.getDelta, step = life.step, behind = isle.gpuBehind;
    window.__oceanResume = null;
    window.__resumeFenceReady = false;
    window.__restoreOceanResume = () => { isle.clock.getDelta = delta; life.step = step; isle.gpuBehind = behind; };
    isle.gpuBehind = () => !window.__resumeFenceReady;
    isle.clock.getDelta = () => 7;
    life.step = function (dt, enabled, ...rest) {
      const before = this.fishTime, out = step.call(this, dt, enabled, ...rest);
      if (enabled) {
        window.__oceanResume = { dt, before, after: this.fishTime };
        window.__restoreOceanResume();
      }
      return out;
    };
  });
  try {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(() => !window.__isle.calm());
    const waiting = await page.evaluate(() => {
      window.__isle.tick();
      return !window.__oceanResume && window.__isle.wasCalm;
    });
    assert.ok(waiting, `${tag}: a pending GPU fence preserves the paused-time reset until motion can draw`);
    await page.evaluate(() => { window.__resumeFenceReady = true; });
    await page.waitForFunction(() => window.__oceanResume);
    const resume = await page.evaluate(() => window.__oceanResume);
    assert.equal(resume.dt, 0, `${tag}: motion resume discards time spent paused`);
    assert.equal(resume.after, resume.before, `${tag}: motion resume preserves the frozen ocean phase`);
  } finally {
    await page.evaluate(() => { window.__restoreOceanResume(); delete window.__restoreOceanResume; });
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  console.log(`${tag}: stalled-frame fish return and reduced-motion resume passed`);
}

try {
  for (const [width, height, touch] of [[390, 844, true], [1280, 720, false]]) {
    const tag = `${width}x${height}`;
    const { context, page } = await open(width, height, touch, "crystal");
    await slowOceanFrame(page, tag);

    // 1. Build mode: a press on the water just past a coast corner (inside its pick reach) is the corner's, not a splash.
    await craft(page, "setupSettle");
    await settle(page);
    const corner = await page.evaluate((touch) => {
      const isle = window.__isle;
      const ins = isle.insets();
      const legal = new Set(window.__emberisle.getState().highlights().vertices);
      for (const id of isle.coastOrder) {
        if (!legal.has(id)) continue;
        const pick = isle.pickables.find((o) => o.userData.kind === "vertex" && o.userData.id === id);
        const m = isle.coastMiter.get(id), l = Math.hypot(m.mx, m.mz);
        for (const out of [0.25, 0.2, 0.15]) {
          const s = isle.screenAt(pick.position.x + (m.mx / l) * out, pick.position.y, pick.position.z + (m.mz / l) * out);
          if (!(s.x > ins.left + 30 && s.x < innerWidth - ins.right - 30 && s.y > ins.top + 30 && s.y < innerHeight - ins.bottom - 30 && document.elementFromPoint(s.x, s.y)?.tagName === "CANVAS")) continue;
          // Under the finger: open water (this press would splash if nothing took it), and the corner's pick.
          const hits = isle.hitsAt({ clientX: s.x, clientY: s.y }, touch);
          const sea = isle.seaPoint();
          if (sea && hits.some((h) => h.kind === "vertex" && h.id === id)) return { id, s, sea };
        }
      }
      return null;
    }, touch);
    assert.ok(corner, `${tag}: a legal coast corner in the hole`);
    await page.evaluate(() => { window.__wobbles = []; const w = window.__isle.wobble, start = w.start.bind(w); w.start = (...a) => { window.__wobbles.push(a[0]); start(...a); }; });
    await tap(page, corner.s, touch);
    const picked = await page.evaluate(() => {
      const g = window.__emberisle.getState();
      return { pending: g.pendingPlace?.id ?? null, built: g.state.vertices.filter((v) => v.building).map((v) => v.id), wobbles: window.__wobbles.length };
    });
    assert.equal(await live(page), 0, `${tag}: a press on a corner in build mode makes no splash`);
    assert.equal(picked.wobbles, 0, `${tag}: and no wobble`);
    assert.ok(touch ? picked.pending === corner.id : picked.built.includes(corner.id), `${tag}: the corner took the press (${JSON.stringify(picked)})`);
    console.log(`${tag}: a press on open water inside a coast corner's pick (sea at ${corner.sea.x.toFixed(2)}, ${corner.sea.z.toFixed(2)}) picks the corner: no splash, no wobble`);

    // 2. Open water, nothing armed: the splash starts on pointerdown, at the point.
    await craft(page, "main");
    await settle(page);
    await page.waitForFunction(() => (window.__isle.busyUntil ?? 0) < performance.now());
    const spot = await waterNearFish(page);
    assert.ok(spot, `${tag}: open water near a fish in the hole`);
    // Sample the native affected set at input delivery; fish may move while browser input is queued.
    // Hold just past the original check's 0.3s phase until its native pose is captured; timing is tested above.
    await page.evaluate(() => {
      const life = window.__isle.oceanLife, step = life.step, scatter = life.scatter;
      let press = null, ids = [];
      window.__fishBefore = [];
      window.__fishDart = null;
      window.__restoreFishDart = () => { life.step = step; life.scatter = scatter; };
      life.scatter = function (x, z, ...rest) {
        press = { x, z };
        window.__fishBefore = this.fishAt().map((f, i) => ({ i, d: Math.hypot(f.x - x, f.z - z) })).filter((f) => f.d <= 1.5);
        ids = window.__fishBefore.map((f) => f.i);
        return scatter.call(this, x, z, ...rest);
      };
      life.step = function (dt, enabled, ...rest) {
        const age = Math.min(...ids.map((i) => this.fishFlee[i]?.age ?? 0));
        const pending = Math.max(0, ...ids.map((i) => this.fishFlee[i]?.pending ?? 0));
        // Preserve the input interval that native step subtracts once; avoid requiring a second slow frame.
        const heldDt = press && enabled ? pending + Math.max(0, 0.31 - age) : dt;
        const out = step.call(this, heldDt, enabled, ...rest);
        if (press && ids.length > 0 && ids.every((i) => this.fishFlee[i] && this.fishFlee[i].age >= 0.3 && this.fishFlee[i].age < 4)) {
          const fish = this.fishAt();
          window.__fishDart = ids.map((i) => Math.hypot(fish[i].x - press.x, fish[i].z - press.z));
          window.__restoreFishDart();
        }
        return out;
      };
    });
    if (touch) await tap(page, spot.s, true);
    else {
      await page.mouse.move(spot.s.x, spot.s.y);
      await page.mouse.down();
      assert.equal(await live(page), 1, `${tag}: the splash is there on pointerdown, before the release`);
      await page.mouse.up();
    }
    const before = await page.evaluate(() => window.__fishBefore);
    assert.ok(before.length > 0, `${tag}: a fish within 1.5 of the tap`);
    const made = await page.evaluate(() => {
      const isle = window.__isle, s = isle.splash.uniforms.uSplash.value.find((v) => v.w > 0);
      return { x: s.x, z: s.y, t0: s.z, w: s.w };
    });
    assert.ok(Math.hypot(made.x - spot.x, made.z - spot.z) < 0.08 && made.w === 1, `${tag}: one full splash where the finger met the water (${JSON.stringify(made)})`);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__played.filter((f) => f === "plop.wav").length), 1, `${tag}: the splash asks for the plop once`);

    // The CPU twin: the boats' sea includes it. The point dips, then lifts above the undisturbed swell; the rings run outward.
    const twin = await page.evaluate((m) => {
      const isle = window.__isle, sp = isle.splash, swell = isle.crystal.swell;
      const slot = sp.uniforms.uSplash.value.find((v) => v.w > 0);
      const at = (t) => sp.field(m.x, m.z, t).y;
      const centre = Array.from({ length: 21 }, (_, i) => at(m.t0 + i * 0.03));
      // The ring's radius: the farthest crest along a line out from the point.
      const ring = (t) => {
        let best = 0, r0 = 0;
        for (let r = 0.3; r <= 2.4; r += 0.01) {
          const h = sp.field(m.x + r, m.z, t).y;
          if (h > best) [best, r0] = [h, r];
        }
        return r0;
      };
      const radii = [0.3, 0.6, 0.9].map((a) => ring(m.t0 + a));
      // The twin with and without the splash, at the moment the crater is deepest.
      const t = m.t0 + 0.01, x = m.x + 0.05;
      const withIt = swell(x, m.z, t).y;
      const w = slot.w;
      slot.w = 0;
      const without = swell(x, m.z, t).y;
      slot.w = w;
      return { dip: Math.min(...centre), lift: Math.max(...centre), radii, twinDelta: withIt - without };
    }, made);
    assert.ok(twin.dip < -0.04, `${tag}: the crater dips at the point (${twin.dip.toFixed(3)})`);
    assert.ok(twin.lift > 0.015, `${tag}: and rebounds above the swell (${twin.lift.toFixed(3)})`);
    assert.ok(twin.radii[0] < twin.radii[1] && twin.radii[1] < twin.radii[2] && twin.radii[2] - twin.radii[0] > 0.5, `${tag}: the rings expand over the next second (${twin.radii.map((r) => r.toFixed(2))})`);
    assert.ok(twin.twinDelta < -0.04, `${tag}: makeSwell (the boats' sea) carries the splash (${twin.twinDelta.toFixed(3)})`);
    // Drain queued GPU work before the observation deadline, without driving the native animation loop or its clock.
    await page.evaluate(() => window.__isle.renderer.getContext().finish());
    // The GPU clock runs it: the loop holds full rate for its life, so the drawn age passes 1 s.
    await page.waitForFunction((t0) => window.__isle.splash.uniforms.uSplashNow.value - t0 > 1, made.t0, { timeout: 15_000 });
    console.log(`${tag}: open water splashes on pointerdown; twin dips ${twin.dip.toFixed(3)}, lifts ${twin.lift.toFixed(3)}, rings at ${twin.radii.map((r) => r.toFixed(2)).join(" / ")} after 0.3 / 0.6 / 0.9 s`);

    // The fish within reach darted away.
    await page.waitForFunction((ids) => ids.every((i) => (window.__isle.oceanLife.fishFlee[i]?.age ?? 0) >= 0.3), before.map((f) => f.i), { timeout: 15_000 });
    const after = await page.evaluate(() => {
      window.__restoreFishDart();
      return window.__fishDart;
    });
    assert.ok(after && after.length === before.length, `${tag}: every nearby fish was observed during its actual escape`);
    const moved = after.map((d, j) => d - before[j].d);
    assert.ok(moved.every((m) => m > 0.1), `${tag}: every fish within 1.5 moved away (${moved.map((m) => m.toFixed(2))})`);
    // The visitor too: one posed near a splash darts off it.
    const visitor = await page.evaluate(() => {
      const isle = window.__isle, life = isle.oceanLife;
      const lane = life.lane("turtle", isle.oceanViewport()) ?? { angle: 0, arc: 0.36, direction: 1 };
      life.begin("turtle", lane);
      life.active.age = 8;
      life.pose(life.active);
      const root = life.creatures.turtle.root, x = root.position.x, z = root.position.z;
      const r = Math.hypot(x, z);
      isle.splashAt(x - (z / r) * 0.5, z + (x / r) * 0.5, 1);
      const f = life.visitorFlee;
      return f && { away: (f.dx * -(-z / r) + f.dz * -(x / r)) > 0, inward: (f.dx * x + f.dz * z) / r < -1e-6 };
    });
    assert.ok(visitor?.away && !visitor.inward, `${tag}: a visitor within reach darts away, never toward the island (${JSON.stringify(visitor)})`);
    await page.waitForFunction(() => window.__isle.oceanLife.fishFlee.every((f) => !f || f.age >= 4), null, { timeout: 60_000 });
    console.log(`${tag}: ${before.length} fish within 1.5 darted ${moved.map((m) => m.toFixed(2)).join(", ")} away and came back; the visitor darts off`);

    // The drawn rings: held at 0.45 s, the ring's circle changes against the same frame without the splash; far water does not.
    await heldPair(page, made, 0.45);
    const ringAt = 0.1 + 1.1 * 0.45;
    const ringD = await diff(page, "with", "without", circle(made, ringAt));
    const farD = await diff(page, "with", "without", circle(made, 2.2));
    assert.ok(ringD > 4 && ringD > 2 * farD, `${tag}: the drawn ring shows at ${ringAt.toFixed(2)} (${ringD.toFixed(1)} vs ${farD.toFixed(1)} far off)`);
    console.log(`${tag}: crystal ring drawn: ${ringD.toFixed(1)}/255 on the ring, ${farD.toFixed(1)} far off`);

    // A screen with a splash at 0.3 s.
    await page.evaluate((m) => {
      const isle = window.__isle, sp = isle.splash, slot = sp.uniforms.uSplash.value[0];
      window.__step ??= sp.step;
      sp.step = (t) => { slot.set(m.x, m.z, t - 0.3, 1); window.__step(t); };
    }, made);
    await page.evaluate(() => window.__grab("shot"));
    await page.screenshot({ path: `test-results/splash-${width}.png` });
    await page.evaluate(() => { const sp = window.__isle.splash; sp.step = window.__step; for (const s of sp.uniforms.uSplash.value) s.w = 0; });

    // 3. A tap on a tile wobbles it (tile, token and props, about its base) and makes no splash.
    const hex = await page.evaluate(() => {
      const isle = window.__isle, ins = isle.insets();
      for (const h of window.__emberisle.getState().state.hexes) {
        const s = isle.screenOf(h.id);
        if (h.pip != null && s && s.x > ins.left + 30 && s.x < innerWidth - ins.right - 30 && s.y > ins.top + 30 && s.y < innerHeight - ins.bottom - 30 && document.elementFromPoint(s.x, s.y)?.tagName === "CANVAS") return { id: h.id, s };
      }
      return null;
    });
    assert.ok(hex, `${tag}: a tile in the hole`);
    await page.evaluate(() => { window.__wobbles = []; });
    await tap(page, hex.s, touch);
    await page.waitForFunction(() => window.__isle.wobble.live.size === 0);
    const wob = await page.evaluate((id) => {
      const isle = window.__isle, w = isle.wobble;
      const tile = isle.land.children.find((o) => o.userData.land && o.userData.id === id);
      const token = isle.tokens.find((t) => t.userData.hex === id);
      const rest = { tile: tile.scale.x, tokenY: token.position.y };
      // The curve on these objects, stepped by hand: 1.03 at its peak, back to rest after 220 ms.
      const parts = [...isle.land.children, ...isle.living.children].filter((o) => (o.userData.land && o.userData.id === id) || o.userData.hex === id);
      const t = 1e9;
      w.start(`${id}-curve`, parts, 0.04, t);
      w.step(t + 64);
      const peak = { tile: tile.scale.x, tokenUp: token.position.y > rest.tokenY };
      w.step(t + 230);
      return { taps: window.__wobbles, parts: parts.length, peak, after: tile.scale.x, tokenBack: Math.abs(token.position.y - rest.tokenY) < 1e-9, rest };
    }, hex.id);
    assert.ok(wob.taps.includes(hex.id), `${tag}: the tap wobbled ${hex.id} (${wob.taps})`);
    assert.ok(wob.parts >= 2, `${tag}: the tile and what stands on it ride together (${wob.parts} parts)`);
    assert.ok(Math.abs(wob.peak.tile - 1.03) < 0.002 && wob.peak.tokenUp, `${tag}: the wobble peaks at 1.03 with its token lifted (${JSON.stringify(wob.peak)})`);
    assert.ok(wob.after === 1 && wob.tokenBack, `${tag}: and settles back exactly (${wob.after})`);
    assert.equal(await live(page), 0, `${tag}: a tile tap makes no splash`);
    const landing = await page.evaluate((id) => {
      const isle = window.__isle;
      window.__wobbles = [];
      isle.landings.push({ obj: isle.wayfarer, kind: "outpost", start: performance.now(), restY: isle.wayfarer.position.y });
      isle.wobbleHex(id);
      isle.landings.pop();
      return window.__wobbles.length;
    }, hex.id);
    assert.equal(landing, 0, `${tag}: no wobble while a piece is landing (a bot's placement)`);
    console.log(`${tag}: a tile tap wobbles ${wob.parts} parts to 1.03 and back; none while a piece lands`);

    // 4. A burst: ten taps on the water, then twelve splashes at once, keep at most 8 live, the newest kept.
    await page.waitForFunction(() => window.__isle.wobble.live.size === 0);
    for (let i = 0; i < 10; i++) await tap(page, { x: spot.s.x + ((i % 5) - 2) * 6, y: spot.s.y + (i < 5 ? -4 : 4) }, touch);
    const burst = await live(page);
    const many = await page.evaluate((m) => {
      const isle = window.__isle;
      for (let i = 0; i < 12; i++) isle.splashAt(m.x + i * 0.01, m.z, 1);
      const t = isle.clock.getElapsed() + (performance.now() - isle.lastFrame) / 1000;
      return { live: isle.splash.live(t), newest: isle.splash.uniforms.uSplash.value.some((s) => Math.abs(s.x - (m.x + 0.11)) < 1e-6) };
    }, made);
    assert.ok(burst >= 1 && burst <= 8, `${tag}: ten rapid taps leave ${burst} live splashes (at most 8)`);
    assert.ok(many.live === 8 && many.newest, `${tag}: twelve at once keep 8, the newest among them (${JSON.stringify(many)})`);
    console.log(`${tag}: ten rapid taps leave ${burst} live, twelve at once keep 8`);

    // 5. Reduced motion: the foam patch shows and fades; no ring, no droplets.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => window.__isle.wasCalm);
    await page.evaluate(() => { for (const s of window.__isle.splash.uniforms.uSplash.value) s.w = 0; });
    await heldPair(page, made, 0.45);
    const calmRing = await diff(page, "with", "without", circle(made, ringAt));
    const calmFoam = await diff(page, "with", "without", [[made.x, made.z]]);
    assert.ok(calmRing < 1.5, `${tag}: reduced motion draws no ring (${calmRing.toFixed(2)}/255 on its circle)`);
    assert.ok(calmFoam > 6, `${tag}: reduced motion draws the foam patch (${calmFoam.toFixed(1)}/255 at the point)`);
    await heldPair(page, made, 1.0);
    const calmGone = await diff(page, "with", "without", [[made.x, made.z]]);
    assert.ok(calmGone < 1.5, `${tag}: and it has faded by 1 s (${calmGone.toFixed(2)})`);
    await page.evaluate(() => { window.__wobbles = []; });
    await tap(page, hex.s, touch);
    assert.equal(await page.evaluate(() => window.__wobbles.length), 0, `${tag}: reduced motion: a tile tap does not wobble`);
    console.log(`${tag}: reduced motion: foam ${calmFoam.toFixed(1)}/255 at the point, ring ${calmRing.toFixed(2)}, gone by 1 s (${calmGone.toFixed(2)}), no wobble`);
    // 6. A press on the water that becomes a drag (an orbit) splashes once, on the press, and never after the drag starts.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(() => !window.__isle.wasCalm);
    await page.evaluate(() => { for (const s of window.__isle.splash.uniforms.uSplash.value) s.w = 0; });
    const from = await page.evaluate((m) => window.__isle.screenAt(m.x, 0, m.z), made);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    const count = () => page.evaluate(() => ({ dragged: window.__isle.dragged, n: window.__isle.splash.uniforms.uSplash.value.filter((s) => s.w > 0).length }));
    let atDrag = null, last;
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(from.x - i * 12, from.y + i * 4);
      last = await count();
      if (last.dragged && atDrag === null) atDrag = last.n;
    }
    await page.mouse.up();
    assert.ok(atDrag !== null && last.n === atDrag, `${tag}: a press that drags past the slop adds no splash after the drag starts (${atDrag} at the drag, ${last.n} after)`);
    console.log(`${tag}: a press that turns into an orbit drag: ${atDrag} splash at the drag start, ${last.n} after 12 moves`);
    await context.close();

    // 6. The simple sea: the ring, no foam (and nothing of the crystal sea is built).
    const simple = await open(width, height, touch, "simple");
    await craft(simple.page, "main");
    await settle(simple.page);
    const spot2 = await waterNearFish(simple.page);
    await tap(simple.page, spot2.s, touch);
    assert.equal(await live(simple.page), 1, `${tag} simple: a tap on the water makes a splash`);
    const at2 = await simple.page.evaluate(() => { const s = window.__isle.splash.uniforms.uSplash.value.find((v) => v.w > 0); return { x: s.x, z: s.y }; });
    await heldPair(simple.page, at2, 0.45);
    const sRing = await diff(simple.page, "with", "without", circle(at2, ringAt));
    const sFar = await diff(simple.page, "with", "without", circle(at2, 2.2));
    const sCentre = await diff(simple.page, "with", "without", [[at2.x, at2.z]]);
    assert.ok(sRing > 4 && sRing > 2 * sFar, `${tag} simple: the ring shows (${sRing.toFixed(1)} vs ${sFar.toFixed(1)} far off)`);
    assert.ok(sCentre < 2, `${tag} simple: no foam patch at the point (${sCentre.toFixed(2)})`);
    assert.equal(await simple.page.evaluate(() => window.__isle.crystal), null, `${tag} simple: the crystal sea is not built`);
    console.log(`${tag} simple: ring ${sRing.toFixed(1)}/255, far ${sFar.toFixed(1)}, no foam at the point (${sCentre.toFixed(2)})`);
    await simple.context.close();
  }
  assert.deepEqual(errors, [], "zero console errors");
  console.log("splash-prove: all checks passed");
} finally {
  await browser.close();
  await vite.close();
}
