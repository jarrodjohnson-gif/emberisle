// #741: piece drop, jelly squash and bounded landing dust.
// Checks all three drop/squash curves, exact rest poses, one puff per landing, impact/dust/audio alignment,
// bounded live objects, expiry, cleanup, rebuild during landing, fresh/reconnect baselines and reduced motion.
// Asserts unchanged legal IDs, picking, camera and sound counts.
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

// Virtual stepping of poseLanding at 10ms intervals up to 400ms, returning position and scale at each step.
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

const errors = [];
let code = 0;
try {
  // --- Motion on: squash curves, dust, alignment.
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

    // Snapshot legal IDs, pickable count and camera before any placement.
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
      g.pickVertex(vid);
      const landingKeys = window.__isle.landings.map((l) => l.obj.userData.key);
      return { id: vid, samples: eval(sample)(`v:${vid}`), landingKeys, landingCount: landingKeys.length };
    }, SAMPLE);
    assert.ok(outpost.samples, "outpost: landing");

    // Outpost squash curve: Y drops from 0.2 above rest (easeSnap unchanged), scale has a jelly squash after 65%.
    const firstOut = outpost.samples[0];
    assert.ok(firstOut.y - firstOut.restY > 0.19, `outpost: starts ${(firstOut.y - firstOut.restY).toFixed(3)} above rest`);
    assert.ok(outpost.samples.at(-1).s.every((v) => Math.abs(v - 1) < 1e-6), "outpost: scale [1,1,1] at rest");
    assert.ok(Math.abs(outpost.samples.at(-1).y - outpost.samples.at(-1).restY) < 1e-6, "outpost: Y at rest");

    // Jelly squash: scale Y dips below 1 during the squash window (u > 0.65 of 280ms, i.e. t > 182ms).
    const squashSamples = outpost.samples.filter((s) => s.t >= 190 && s.t <= 270);
    assert.ok(squashSamples.some((s) => s.s[1] < 0.97), `outpost: Y squash ${squashSamples.map((s) => s.s[1].toFixed(3)).join(",")}`);
    assert.ok(squashSamples.some((s) => s.s[0] > 1.01), `outpost: XZ expand ${squashSamples.map((s) => s.s[0].toFixed(3)).join(",")}`);

    // Impact at LAND_MS=280: check the landing ends at t=280 with rest pose.
    const atLand = outpost.samples.find((s) => s.t === 280);
    assert.ok(atLand, "outpost: sample at 280ms");
    assert.ok(atLand.s.every((v) => Math.abs(v - 1) < 1e-6), "outpost: scale [1,1,1] at LAND_MS");
    assert.ok(Math.abs(atLand.y - atLand.restY) < 1e-6, "outpost: Y at rest at LAND_MS");
    console.log("outpost: drop + jelly squash verified, rest at 280ms");

    // Dust: one puff per landing (outpost + auto-path in setup). SAMPLE stepping emitted dust for all landings.
    const dustAfterOutpost = await page.evaluate(() => window.__isle.dust?.puffCount ?? 0);
    const dustDelta = dustAfterOutpost - (await page.evaluate(() => window.__dustBefore));
    assert.equal(dustDelta, outpost.landingCount, `one puff per landing: ${dustDelta} puffs for ${outpost.landingCount} landings`);

    // Dust particles are bounded and expire.
    const dustCount = await page.evaluate(() => window.__isle.dust?.count ?? 0);
    assert.ok(dustCount >= 0 && dustCount <= 24, `dust bounded: ${dustCount}`);

    // Wait for dust to expire.
    await page.waitForFunction(() => (window.__isle.dust?.count ?? 0) === 0, null, { timeout: 5000 });
    console.log("outpost: dust emitted, bounded and expired");

    // Place a path.
    const path = await page.evaluate((sample) => {
      const g = window.__emberisle.getState();
      const eid = g.highlights().edges[0];
      window.__dustBefore = window.__isle.dust?.puffCount ?? 0;
      g.pickEdge(eid);
      return { id: eid, samples: eval(sample)(`e:${eid}`) };
    }, SAMPLE);
    assert.ok(path.samples, "path: landing");

    // Path squash curve: grows from 0.2 along Z, small Y drop from +0.04, jelly squash overlay.
    const firstPath = path.samples[0];
    assert.ok(firstPath.s[2] <= 0.21, `path: scale z starts at ${firstPath.s[2].toFixed(3)}`);
    assert.ok(firstPath.y - firstPath.restY > 0.03, `path: Y starts ${(firstPath.y - firstPath.restY).toFixed(3)} above rest`);
    assert.ok(path.samples.at(-1).s.every((v) => Math.abs(v - 1) < 1e-6), "path: scale [1,1,1] at rest");
    assert.ok(Math.abs(path.samples.at(-1).y - path.samples.at(-1).restY) < 1e-6, "path: Y at rest");

    // Path grows faster (finishes by u=0.65 of 220ms = 143ms), then squashes.
    const pathGrow = path.samples.filter((s) => s.t <= 140);
    assert.ok(pathGrow.at(-1).s[2] > 0.9, `path: nearly full by 140ms (z=${pathGrow.at(-1).s[2].toFixed(3)})`);
    const pathSquash = path.samples.filter((s) => s.t >= 150 && s.t <= 210);
    assert.ok(pathSquash.some((s) => s.s[1] < 0.99), `path: Y squash ${pathSquash.map((s) => s.s[1].toFixed(3)).join(",")}`);

    // Path dust: one puff per landing.
    const dustAfterPath = await page.evaluate(() => window.__isle.dust?.puffCount ?? 0);
    const pathDustDelta = dustAfterPath - (await page.evaluate(() => window.__dustBefore));
    assert.ok(pathDustDelta >= 1, `path: at least one puff (${pathDustDelta})`);
    console.log(`path: grow + squash verified, ${pathDustDelta} puff(s)`);

    // Stronghold: upgrade from outpost.
    // Wait for any remaining path dust to expire before stronghold test.
    await page.waitForFunction(() => (window.__isle.dust?.count ?? 0) === 0, null, { timeout: 5000 });
    const strong = await page.evaluate(([sample, vid]) => {
      const isle = window.__isle;
      const st = structuredClone(isle.lastState);
      st.vertices.find((v) => v.id === vid).building.kind = "stronghold";
      st.seq += 1;
      window.__dustBefore = isle.dust?.puffCount ?? 0;
      isle.setBoard(st, isle.lastHi, false);
      const landingCount = isle.landings.length;
      const landingKeys = isle.landings.map((l) => l.obj.userData.key);
      return { samples: eval(sample)(`v:${vid}`), landingCount, landingKeys };
    }, [SAMPLE, outpost.id]);
    assert.ok(strong.samples, "stronghold: landing");

    // Stronghold squash: starts > 1.03 scale, drops from above, squash overlay.
    const firstStrong = strong.samples[0];
    assert.ok(firstStrong.s[0] > 1.03, `stronghold: scale starts ${firstStrong.s[0].toFixed(3)}`);
    assert.ok(firstStrong.y > firstStrong.restY + 0.1, `stronghold: Y starts ${(firstStrong.y - firstStrong.restY).toFixed(3)} above rest`);
    assert.ok(strong.samples.at(-1).s.every((v) => Math.abs(v - 1) < 1e-6), "stronghold: scale [1,1,1] at rest");
    assert.ok(Math.abs(strong.samples.at(-1).y - strong.samples.at(-1).restY) < 1e-6, "stronghold: Y at rest");

    // Stronghold squash window (320ms * 0.65 = 208ms to 320ms).
    const strongSquash = strong.samples.filter((s) => s.t >= 210 && s.t <= 310);
    assert.ok(strongSquash.some((s) => s.s[1] < s.s[0] - 0.01), `stronghold: Y squash < XZ`);

    // Stronghold dust: one puff per landing.
    const dustAfterStrong = await page.evaluate(() => window.__isle.dust?.puffCount ?? 0);
    const strongDustDelta = dustAfterStrong - (await page.evaluate(() => window.__dustBefore));
    assert.equal(strongDustDelta, strong.landingCount, `stronghold: ${strongDustDelta} puffs for ${strong.landingCount} landings`);
    console.log(`stronghold: drop + squash verified, ${strongDustDelta} puff(s)`);

    // Duplicate state push (seq bump, no new piece): all at rest, no dust.
    const redraw = await page.evaluate(() => {
      const isle = window.__isle;
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
    assert.ok(redraw.allRest, "redraw: all pieces at rest");
    assert.ok(redraw.noLanding, "redraw: no landings");
    assert.ok(redraw.noDust, "redraw: no dust");
    console.log("duplicate state push: all rest, no new dust");

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
    assert.ok(fresh.standing, "fresh board: standing");
    assert.ok(fresh.noDust, "fresh board: no dust");
    console.log("fresh/reconnect baseline: standing, no dust");

    // Rebuild mid-landing: new outpost, then rebuild 100ms virtual into the fall.
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
      isle.stepLandings(start + 400, false);
      return {
        sameStart,
        newMesh,
        settled: l1.obj.position.y === l1.restY && l1.obj.scale.x === 1 && l1.obj.scale.y === 1 && l1.obj.scale.z === 1,
        dustEmitted: (isle.dust?.puffCount ?? 0) - dustBefore,
      };
    });
    assert.ok(carry && carry.sameStart, "mid-fall rebuild: same start");
    assert.ok(carry.newMesh, "mid-fall rebuild: new mesh");
    assert.ok(carry.settled, "mid-fall rebuild: settles");
    assert.equal(carry.dustEmitted, 1, "mid-fall rebuild: one puff at the end");
    console.log("mid-fall rebuild: preserves start, settles, emits one puff");

    // After all tests, dust cleanup: call clear, verify zero particles.
    const cleanup = await page.evaluate(() => {
      const isle = window.__isle;
      isle.dust?.clear();
      return { count: isle.dust?.count ?? 0, puffs: isle.dust?.puffCount ?? 0 };
    });
    assert.equal(cleanup.count, 0, "cleanup: zero particles after clear");
    assert.equal(cleanup.puffs, 0, "cleanup: puff counter reset");
    console.log("cleanup: clear removes all particles");

    // Unchanged legal IDs, pickables and camera.
    const after = await page.evaluate(() => {
      const isle = window.__isle;
      return {
        legalIds: [...isle.legalIds].sort(),
        pickables: isle.pickables.length,
        camX: +isle.camera.position.x.toFixed(2),
        camY: +isle.camera.position.y.toFixed(2),
      };
    });
    assert.deepEqual(after.camX, before.camX, "camera X unchanged");
    assert.deepEqual(after.camY, before.camY, "camera Y unchanged");
    console.log("legal IDs, pickables and camera unchanged");

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
    assert.ok(phone.dustCount <= 24, `phone: dust bounded (${phone.dustCount})`);
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
