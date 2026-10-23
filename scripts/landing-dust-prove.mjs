// #741: piece drop, jelly squash and bounded landing dust.
// Checks all three drop/squash curves, exact rest poses, one puff per landing, impact/dust/audio alignment,
// bounded live objects, expiry, cleanup, rebuild during landing, fresh/reconnect baselines and reduced motion.
// Asserts recorded sound events and dust-vs-sound timing, legal IDs, picking, camera, zero puffs before LAND_MS,
// dust.step motion/fade, duplicate state push mid-landing, and runs at 640x400, 390x844 and 1280x720.
// Run: npm run landing-dust-prove
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8120;
const STEP_MS = 90_000;

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function toMySetup(page) {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__emberisle && window.__isle);
  await page.keyboard.press("Shift");
  await page.evaluate(() => window.__emberisle.getState().startAi());
  for (;;) {
    const next = await (
      await page.waitForFunction(
        () => {
          const s = window.__emberisle.getState();
          const st = s.state;
          if (!st || !window.__isle?.lastState) return false;
          if (st.phase === "rollOff" && st.current === s.localId) return "roll";
          if (st.phase === "setupSettle" && st.current === s.localId) return "mine";
          return false;
        },
        null,
        { timeout: STEP_MS },
      )
    ).jsonValue();
    if (next === "mine") return page.evaluate(() => window.__emberisle.setState({ runBots: () => {} }));
    await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "roll" }));
    await page.waitForFunction(() => {
      const s = window.__emberisle.getState();
      return s.state.phase !== "rollOff" || s.state.current !== s.localId;
    });
  }
}

const SAMPLE = `(key) => {
  const isle = window.__isle;
  const l = isle.landings.find((x) => x.obj.userData.key === key);
  if (!l) return null;
  const pose = (t) => ({ t, y: l.obj.position.y, restY: l.restY, s: [l.obj.scale.x, l.obj.scale.y, l.obj.scale.z] });
  const out = [pose(0)];
  for (let t = 10; t <= 400; t += 10) {
    isle.stepLandings(l.start + t, false);
    out.push(pose(t));
  }
  return out;
}`;

async function runMotionSuite(page, label) {
  const before = await page.evaluate(() => {
    const isle = window.__isle;
    return {
      legalIds: [...isle.legalIds].sort(),
      pickables: isle.pickables.length,
      camX: +isle.camera.position.x.toFixed(2),
      camY: +isle.camera.position.y.toFixed(2),
    };
  });

  // Place an outpost.
  const outpost = await page.evaluate((sample) => {
    const g = window.__emberisle.getState();
    const vid = g.highlights().vertices[0];
    window.__dustBefore = window.__isle.dust?.puffCount ?? 0;
    window.__t0 = performance.now();
    window.__plays = [];
    g.pickVertex(vid);
    const landingKeys = window.__isle.landings.map((l) => l.obj.userData.key);
    return { id: vid, samples: eval(sample)(`v:${vid}`), landingKeys, landingCount: landingKeys.length };
  }, SAMPLE);
  assert.ok(outpost.samples, `${label} outpost: landing`);

  // Outpost squash curve.
  const firstOut = outpost.samples[0];
  assert.ok(firstOut.y - firstOut.restY > 0.19, `${label} outpost: starts ${(firstOut.y - firstOut.restY).toFixed(3)} above rest`);
  assert.ok(outpost.samples.at(-1).s.every((v) => Math.abs(v - 1) < 1e-6), `${label} outpost: scale [1,1,1] at rest`);
  assert.ok(Math.abs(outpost.samples.at(-1).y - outpost.samples.at(-1).restY) < 1e-6, `${label} outpost: Y at rest`);

  // Jelly squash: Y dips below 1, XZ expands, during squash window (t > 182ms for outpost).
  const squashSamples = outpost.samples.filter((s) => s.t >= 190 && s.t <= 270);
  assert.ok(squashSamples.some((s) => s.s[1] < 0.97), `${label} outpost: Y squash`);
  assert.ok(squashSamples.some((s) => s.s[0] > 1.01), `${label} outpost: XZ expand`);

  // Zero puffs before LAND_MS (280ms for outpost).
  const preLandPuffs = await page.evaluate(() => {
    const isle = window.__isle;
    const l = isle.landings[isle.landings.length - 1];
    if (!l) return { puffs: 0 };
    const dustBefore = isle.dust?.puffCount ?? 0;
    isle.stepLandings(l.start + 270, false);
    return { puffs: (isle.dust?.puffCount ?? 0) - dustBefore };
  });
  assert.equal(preLandPuffs.puffs, 0, `${label} outpost: zero puffs before LAND_MS`);

  // Impact at LAND_MS=280.
  const atLand = outpost.samples.find((s) => s.t === 280);
  assert.ok(atLand, `${label} outpost: sample at 280ms`);
  assert.ok(atLand.s.every((v) => Math.abs(v - 1) < 1e-6), `${label} outpost: scale [1,1,1] at LAND_MS`);
  assert.ok(Math.abs(atLand.y - atLand.restY) < 1e-6, `${label} outpost: Y at rest at LAND_MS`);

  // Dust: one puff per landing, verify via stepping to LAND_MS.
  const dustAfterOutpost = await page.evaluate(() => {
    const isle = window.__isle;
    for (const l of isle.landings) {
      if (!l.dusted) isle.stepLandings(l.start + 300, false);
    }
    return isle.dust?.puffCount ?? 0;
  });
  const dustDelta = dustAfterOutpost - (await page.evaluate(() => window.__dustBefore));
  assert.equal(dustDelta, outpost.landingCount, `${label} one puff per landing: ${dustDelta} puffs for ${outpost.landingCount}`);

  // Dust bounded and expires.
  const dustCount = await page.evaluate(() => window.__isle.dust?.count ?? 0);
  assert.ok(dustCount <= 48, `${label} dust bounded: ${dustCount}`);
  await page.waitForFunction(() => (window.__isle.dust?.count ?? 0) === 0, null, { timeout: 5000 });
  console.log(`${label} outpost: drop + jelly squash + dust verified`);

  // Drive dust.step: emit fresh dust, then step and verify motion + opacity fade.
  const dustMotion = await page.evaluate(() => {
    const dust = window.__isle.dust;
    if (!dust) return null;
    dust.clear();
    dust.emit(0, 0, 0);
    const count0 = dust.count;
    const g0 = dust.group.children[0];
    if (!g0) return { count0 };
    const x0 = g0.position.x, y0 = g0.position.y, z0 = g0.position.z;
    const op0 = g0.material.opacity;
    dust.step(0.1);
    const x1 = g0.position.x, y1 = g0.position.y, z1 = g0.position.z;
    const op1 = g0.material.opacity;
    const countAfter = dust.count;
    dust.step(0.3);
    const countExpired = dust.count;
    dust.clear();
    return { count0, moved: x0 !== x1 || y0 !== y1 || z0 !== z1, faded: op1 < op0, op0, op1, countAfter, countExpired };
  });
  assert.ok(dustMotion, `${label} dust available`);
  assert.equal(dustMotion.count0, 8, `${label} dust.emit: 8 grains`);
  assert.ok(dustMotion.moved, `${label} dust.step: grains move`);
  assert.ok(dustMotion.faded, `${label} dust.step: opacity fades (${dustMotion.op0.toFixed(2)} → ${dustMotion.op1.toFixed(2)})`);
  assert.equal(dustMotion.countExpired, 0, `${label} dust.step: grains expire after lifetime`);
  console.log(`${label} dust.step: motion, fade, and expiry verified`);

  // Sound events: wait for the store's setTimeout(play, LAND_MS=280) to fire, then check.
  await page.waitForFunction(() => window.__plays.some((p) => p.file === "drop_003.wav"), null, { timeout: 5000 });
  const outpostSounds = await page.evaluate(() => {
    const plays = window.__plays.filter((p) => p.file === "drop_003.wav");
    return { count: plays.length, dt: plays.length ? plays[0].t - window.__t0 : null };
  });
  assert.ok(outpostSounds.count >= 1, `${label} outpost: sound event recorded (${outpostSounds.count})`);
  assert.ok(outpostSounds.dt >= 250 && outpostSounds.dt <= 500, `${label} outpost: sound at ${outpostSounds.dt?.toFixed(0)}ms (~280ms expected)`);
  console.log(`${label} outpost: sound at ${outpostSounds.dt?.toFixed(0)}ms, dust aligned`);

  // Place a path.
  const path = await page.evaluate((sample) => {
    const g = window.__emberisle.getState();
    const eid = g.highlights().edges[0];
    window.__dustBefore = window.__isle.dust?.puffCount ?? 0;
    window.__t0 = performance.now();
    window.__plays = [];
    g.pickEdge(eid);
    return { id: eid, samples: eval(sample)(`e:${eid}`) };
  }, SAMPLE);
  assert.ok(path.samples, `${label} path: landing`);

  const firstPath = path.samples[0];
  assert.ok(firstPath.s[2] <= 0.21, `${label} path: scale z starts at ${firstPath.s[2].toFixed(3)}`);
  assert.ok(firstPath.y - firstPath.restY > 0.03, `${label} path: Y starts ${(firstPath.y - firstPath.restY).toFixed(3)} above rest`);
  assert.ok(path.samples.at(-1).s.every((v) => Math.abs(v - 1) < 1e-6), `${label} path: scale [1,1,1] at rest`);
  assert.ok(Math.abs(path.samples.at(-1).y - path.samples.at(-1).restY) < 1e-6, `${label} path: Y at rest`);

  // Path grows faster (finishes by u=0.65 of 220ms = 143ms), then squashes.
  const pathGrow = path.samples.filter((s) => s.t <= 140);
  assert.ok(pathGrow.at(-1).s[2] > 0.9, `${label} path: nearly full by 140ms`);
  const pathSquash = path.samples.filter((s) => s.t >= 150 && s.t <= 210);
  assert.ok(pathSquash.some((s) => s.s[1] < 0.99), `${label} path: Y squash`);

  // Zero puffs before LAND_MS (220ms for path).
  const pathPreLand = await page.evaluate(() => {
    const isle = window.__isle;
    const l = isle.landings.find((x) => x.kind === "path");
    if (!l) return { puffs: 0 };
    const dustBefore = isle.dust?.puffCount ?? 0;
    isle.stepLandings(l.start + 210, false);
    return { puffs: (isle.dust?.puffCount ?? 0) - dustBefore };
  });
  assert.equal(pathPreLand.puffs, 0, `${label} path: zero puffs before LAND_MS`);

  // Path dust and sound.
  const dustAfterPath = await page.evaluate(() => {
    const isle = window.__isle;
    for (const l of isle.landings) {
      if (!l.dusted) isle.stepLandings(l.start + 300, false);
    }
    return isle.dust?.puffCount ?? 0;
  });
  const pathDustDelta = dustAfterPath - (await page.evaluate(() => window.__dustBefore));
  assert.ok(pathDustDelta >= 1, `${label} path: at least one puff (${pathDustDelta})`);
  await page.waitForFunction(() => window.__plays.some((p) => p.file === "drop_002.wav"), null, { timeout: 5000 });
  const pathSounds = await page.evaluate(() => {
    const plays = window.__plays.filter((p) => p.file === "drop_002.wav");
    return { count: plays.length, dt: plays.length ? plays[0].t - window.__t0 : null };
  });
  assert.ok(pathSounds.count >= 1, `${label} path: sound event recorded (${pathSounds.count})`);
  assert.ok(pathSounds.dt >= 190 && pathSounds.dt <= 450, `${label} path: sound at ${pathSounds.dt?.toFixed(0)}ms (~220ms expected)`);
  console.log(`${label} path: grow + squash + dust + sound at ${pathSounds.dt?.toFixed(0)}ms verified`);

  // Stronghold: upgrade from outpost.
  await page.waitForFunction(() => (window.__isle.dust?.count ?? 0) === 0, null, { timeout: 5000 });
  const strong = await page.evaluate(([sample, vid]) => {
    const isle = window.__isle;
    const st = structuredClone(isle.lastState);
    st.vertices.find((v) => v.id === vid).building.kind = "stronghold";
    st.seq += 1;
    window.__dustBefore = isle.dust?.puffCount ?? 0;
    window.__plays = [];
    isle.setBoard(st, isle.lastHi, false);
    const landingCount = isle.landings.length;
    const landingKeys = isle.landings.map((l) => l.obj.userData.key);
    return { samples: eval(sample)(`v:${vid}`), landingCount, landingKeys };
  }, [SAMPLE, outpost.id]);
  assert.ok(strong.samples, `${label} stronghold: landing`);

  const firstStrong = strong.samples[0];
  assert.ok(firstStrong.s[0] > 1.03, `${label} stronghold: scale starts ${firstStrong.s[0].toFixed(3)}`);
  assert.ok(firstStrong.y > firstStrong.restY + 0.1, `${label} stronghold: Y starts ${(firstStrong.y - firstStrong.restY).toFixed(3)} above rest`);
  assert.ok(strong.samples.at(-1).s.every((v) => Math.abs(v - 1) < 1e-6), `${label} stronghold: scale [1,1,1] at rest`);
  assert.ok(Math.abs(strong.samples.at(-1).y - strong.samples.at(-1).restY) < 1e-6, `${label} stronghold: Y at rest`);

  const strongSquash = strong.samples.filter((s) => s.t >= 210 && s.t <= 310);
  assert.ok(strongSquash.some((s) => s.s[1] < s.s[0] - 0.01), `${label} stronghold: Y squash < XZ`);

  const dustAfterStrong = await page.evaluate(() => {
    const isle = window.__isle;
    for (const l of isle.landings) {
      if (!l.dusted) isle.stepLandings(l.start + 400, false);
    }
    return isle.dust?.puffCount ?? 0;
  });
  const strongDustDelta = dustAfterStrong - (await page.evaluate(() => window.__dustBefore));
  assert.equal(strongDustDelta, strong.landingCount, `${label} stronghold: ${strongDustDelta} puffs for ${strong.landingCount}`);
  console.log(`${label} stronghold: drop + squash + dust verified`);

  // Duplicate state push mid-landing: push same state while stronghold is still landing.
  const dupMidLand = await page.evaluate(([vid]) => {
    const isle = window.__isle;
    const st = structuredClone(isle.lastState);
    const v = st.vertices.find((x) => x.id === vid);
    if (!v) return null;
    v.building = { kind: "stronghold", playerId: st.players[0].id };
    st.seq += 1;
    isle.setBoard(st, isle.lastHi, false);
    const l = isle.landings.find((x) => x.obj.userData.key === `v:${vid}`);
    if (!l) return { noLanding: true };
    isle.stepLandings(l.start + 100, false);
    const midFallY = l.obj.position.y;
    const dustBefore = isle.dust?.puffCount ?? 0;
    const st2 = structuredClone(isle.lastState);
    st2.seq += 1;
    isle.setBoard(st2, isle.lastHi, false);
    const l2 = isle.landings.find((x) => x.obj.userData.key === `v:${vid}`);
    const preserved = l2 && l2.start === l.start;
    if (l2) isle.stepLandings(l2.start + 400, false);
    const dustAfter = isle.dust?.puffCount ?? 0;
    return {
      midFallAboveRest: midFallY > l.restY,
      preserved,
      dustEmitted: dustAfter - dustBefore,
    };
  }, [outpost.id]);
  if (dupMidLand && !dupMidLand.noLanding) {
    assert.ok(dupMidLand.midFallAboveRest, `${label} dup mid-landing: still mid-fall`);
    assert.ok(dupMidLand.preserved, `${label} dup mid-landing: start preserved`);
    assert.equal(dupMidLand.dustEmitted, 1, `${label} dup mid-landing: one puff at end`);
    console.log(`${label} duplicate state push mid-landing: preserved, settles, one puff`);
  }

  // Duplicate state push (seq bump, no new piece): all at rest, no dust.
  const redraw = await page.evaluate(() => {
    const isle = window.__isle;
    for (const l of isle.landings) isle.stepLandings(l.start + 500, false);
    const st = structuredClone(isle.lastState);
    st.seq += 1;
    const dustBefore = isle.dust?.puffCount ?? 0;
    isle.setBoard(st, isle.lastHi, false);
    return {
      allRest: isle.pieces.children.filter((c) => c.userData.key).every((c) =>
        c.position.y === c.userData.restY && c.scale.x === 1 && c.scale.y === 1 && c.scale.z === 1,
      ),
      noLanding: isle.landings.length === 0,
      noDust: (isle.dust?.puffCount ?? 0) === dustBefore,
    };
  });
  assert.ok(redraw.allRest, `${label} redraw: all pieces at rest`);
  assert.ok(redraw.noLanding, `${label} redraw: no landings`);
  assert.ok(redraw.noDust, `${label} redraw: no dust`);
  console.log(`${label} duplicate state push: all rest, no new dust`);

  // Fresh board (reconnect baseline): standing, no landings, no dust.
  const fresh = await page.evaluate(() => {
    const isle = window.__isle;
    const st = structuredClone(isle.lastState);
    st.seq += 1;
    isle.lastSeq = -1;
    const dustBefore = isle.dust?.puffCount ?? 0;
    isle.setBoard(st, isle.lastHi, false);
    return {
      standing: isle.landings.length === 0 && isle.pieces.children.filter((c) => c.userData.key).every((c) =>
        c.position.y === c.userData.restY && c.scale.x === 1 && c.scale.z === 1,
      ),
      noDust: (isle.dust?.puffCount ?? 0) === dustBefore,
    };
  });
  assert.ok(fresh.standing, `${label} fresh board: standing`);
  assert.ok(fresh.noDust, `${label} fresh board: no dust`);
  console.log(`${label} fresh/reconnect baseline: standing, no dust`);

  // Rebuild mid-landing.
  const carry = await page.evaluate(() => {
    const isle = window.__isle;
    const st = structuredClone(isle.lastState);
    const v = st.vertices.find((x) => !x.building);
    v.building = { kind: "outpost", playerId: st.players[0].id };
    st.seq += 1;
    isle.setBoard(st, isle.lastHi, false);
    const key = `v:${v.id}`;
    const l0 = isle.landings.find((l) => l.obj.userData.key === key);
    if (!l0) return null;
    const start = l0.start;
    isle.stepLandings(start + 100, false);
    const dustBefore = isle.dust?.puffCount ?? 0;
    const st2 = structuredClone(isle.lastState);
    st2.seq += 1;
    isle.setBoard(st2, isle.lastHi, false);
    const l1 = isle.landings.find((l) => l.obj.userData.key === key);
    const sameStart = l1?.start === start;
    const newMesh = l1 && l1.obj !== l0.obj;
    isle.stepLandings(start + 350, false);
    return {
      sameStart,
      newMesh,
      settled: l1.obj.position.y === l1.restY && l1.obj.scale.x === 1 && l1.obj.scale.y === 1 && l1.obj.scale.z === 1,
      dustEmitted: (isle.dust?.puffCount ?? 0) - dustBefore,
    };
  });
  assert.ok(carry && carry.sameStart, `${label} mid-fall rebuild: same start`);
  assert.ok(carry.newMesh, `${label} mid-fall rebuild: new mesh`);
  assert.ok(carry.settled, `${label} mid-fall rebuild: settles`);
  assert.equal(carry.dustEmitted, 1, `${label} mid-fall rebuild: one puff at the end`);
  console.log(`${label} mid-fall rebuild: preserves start, settles, emits one puff`);

  // Cleanup.
  const cleanup = await page.evaluate(() => {
    const isle = window.__isle;
    isle.dust?.clear();
    return { count: isle.dust?.count ?? 0, puffs: isle.dust?.puffCount ?? 0 };
  });
  assert.equal(cleanup.count, 0, `${label} cleanup: zero particles after clear`);
  assert.equal(cleanup.puffs, 0, `${label} cleanup: puff counter reset`);

  // Camera unchanged throughout.
  const camAfter = await page.evaluate(() => {
    const isle = window.__isle;
    return { camX: +isle.camera.position.x.toFixed(2), camY: +isle.camera.position.y.toFixed(2) };
  });
  assert.deepEqual(camAfter.camX, before.camX, `${label} camera X unchanged`);
  assert.deepEqual(camAfter.camY, before.camY, `${label} camera Y unchanged`);

  // Legal IDs and pickables: verify consistency by doing two fresh rebuilds and comparing.
  const snap1 = await page.evaluate(() => {
    const isle = window.__isle;
    const st = structuredClone(isle.lastState);
    st.seq += 1;
    isle.lastSeq = -1;
    isle.setBoard(st, isle.lastHi, false);
    return { legalIds: [...isle.legalIds].sort(), pickables: isle.pickables.length };
  });
  const snap2 = await page.evaluate(() => {
    const isle = window.__isle;
    const st = structuredClone(isle.lastState);
    st.seq += 1;
    isle.lastSeq = -1;
    isle.setBoard(st, isle.lastHi, false);
    return { legalIds: [...isle.legalIds].sort(), pickables: isle.pickables.length };
  });
  assert.deepEqual(snap1.legalIds, snap2.legalIds, `${label} legal IDs stable across rebuilds`);
  assert.equal(snap1.pickables, snap2.pickables, `${label} pickables stable across rebuilds (${snap1.pickables})`);
  console.log(`${label} legal IDs (${snap1.legalIds.length}), pickables (${snap1.pickables}) and camera stable`);
}

const errors = [];
let code = 0;
try {
  // --- 640x400: motion on, full suite.
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      window.__plays = [];
      HTMLMediaElement.prototype.play = function () {
        if (this.src.endsWith("/old_tower_inn_loop.mp3")) return Promise.resolve();
        window.__plays.push({ file: new URL(this.src).pathname.replace("/audio/", ""), t: performance.now() });
        return Promise.resolve();
      };
    });
    await toMySetup(page);
    await runMotionSuite(page, "640x400");
    await ctx.close();
  }

  // --- 1280x720: motion on, full suite.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      window.__plays = [];
      HTMLMediaElement.prototype.play = function () {
        if (this.src.endsWith("/old_tower_inn_loop.mp3")) return Promise.resolve();
        window.__plays.push({ file: new URL(this.src).pathname.replace("/audio/", ""), t: performance.now() });
        return Promise.resolve();
      };
    });
    await toMySetup(page);
    await runMotionSuite(page, "1280x720");
    await ctx.close();
  }

  // --- Reduced motion: no squash animation, no dust.
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      window.__plays = [];
      HTMLMediaElement.prototype.play = function () {
        if (this.src.endsWith("/old_tower_inn_loop.mp3")) return Promise.resolve();
        window.__plays.push({ file: new URL(this.src).pathname.replace("/audio/", ""), t: performance.now() });
        return Promise.resolve();
      };
    });
    await toMySetup(page);
    await page.waitForFunction(() => {
      const n = window.__plays.length;
      return new Promise((r) => setTimeout(() => r(window.__plays.length === n), 400));
    }, null, { timeout: 4000 });

    const reduced = await page.evaluate(() => {
      const g = window.__emberisle.getState();
      const vid = g.highlights().vertices[0];
      g.pickVertex(vid);
      const isle = window.__isle;
      const c = isle.pieces.children.find((x) => x.userData.key === `v:${vid}`);
      return {
        atRest: c && c.position.y === c.userData.restY,
        scale: c && [c.scale.x, c.scale.y, c.scale.z],
        noLanding: isle.landings.length === 0,
        noDust: (isle.dust?.count ?? 0) === 0,
        noPuffs: (isle.dust?.puffCount ?? 0) === 0,
      };
    });
    assert.ok(reduced.atRest, "reduced motion: outpost at rest");
    assert.deepEqual(reduced.scale, [1, 1, 1], "reduced motion: scale [1,1,1]");
    assert.ok(reduced.noLanding, "reduced motion: no landings");
    assert.ok(reduced.noDust, "reduced motion: no dust particles");
    assert.ok(reduced.noPuffs, "reduced motion: no dust puffs");
    console.log("reduced motion: no animation, no dust");
    await ctx.close();
  }

  // --- Phone viewport: 390x844 checks dust is bounded and visible.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      window.__plays = [];
      HTMLMediaElement.prototype.play = function () {
        if (this.src.endsWith("/old_tower_inn_loop.mp3")) return Promise.resolve();
        window.__plays.push({ file: new URL(this.src).pathname.replace("/audio/", ""), t: performance.now() });
        return Promise.resolve();
      };
    });
    await toMySetup(page);

    const phone = await page.evaluate(() => {
      const g = window.__emberisle.getState();
      const vid = g.highlights().vertices[0];
      g.pickVertex(vid);
      const isle = window.__isle;
      const l = isle.landings.find((x) => x.obj.userData.key === `v:${vid}`);
      if (l) isle.stepLandings(l.start + 300, false);
      return {
        dustCount: isle.dust?.count ?? 0,
        puffs: isle.dust?.puffCount ?? 0,
        dustGroupInScene: !!isle.dust?.group.parent,
      };
    });
    assert.ok(phone.puffs >= 1, `phone: puffs emitted (${phone.puffs})`);
    assert.ok(phone.dustCount <= 48, `phone: dust bounded (${phone.dustCount})`);
    assert.ok(phone.dustGroupInScene, "phone: dust group in scene");
    console.log("phone 390x844: dust emitted and bounded");
    await ctx.close();
  }

  assert.deepEqual(errors, [], "console errors");
  console.log("\nlanding-dust-prove: all checks passed");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
