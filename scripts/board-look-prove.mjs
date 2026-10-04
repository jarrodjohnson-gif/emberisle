// #135, polish.md "The board look target": the island reads like a lit board on a table. In the browser:
// - the light rig is one warm key lamp (the only shadow caster, at least 3x the bounce), near-grey low bounce, no flat
//   ambient, soft shadows (PCF blurred at least 4 texels) from a map of at most 1024, exposure at most 1.1;
// - the sea is calm: a patch of open water, read back from the drawn frame, varies less than 6 % in luminance and is teal;
// - the title keeps the slow orbit (free camera, auto-rotate); in play, on a fine pointer at 1280x720 and a coarse one at
//   390x844, the overhead camera is on and every corner of the island, docks included, projects inside the hole the HUD
//   leaves (`__isle.insets()`, measured from the HUD's own chrome), each corner's screen point lands on the canvas, and a
//   number token is at least 24 px across on the desktop and 18 px on the phone (the phone hole is width-bound; #422 owns
//   growing it);
// - the default view is the fitted 25° overhead view; a drag (mouse, or one finger through CDP touch events) orbits it and
//   places nothing even when it starts on a legal corner; a wheel zooms; Home (desktop) and a double click or double tap on
//   empty board glide back to the fitted view; a click on the corner still places afterwards; under reduced motion Home is
//   instant.
// Zero console errors. Saves test-results/board-look-{title,play}-<size>.png. Port from VITE_PORT, default 8112.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

// CI renders the island with software GL, where one frame can take seconds; a step gets this long to show.
const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8112;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
mkdirSync("test-results", { recursive: true });

// Waits until the island has drawn n more frames (the scene has settled after a change).
const drawn = (page, n) =>
  page.evaluate(async (n) => {
    const isle = window.__isle;
    const r0 = isle.renders;
    await new Promise((res) => {
      const poll = () => (isle.renders >= r0 + n ? res() : requestAnimationFrame(poll));
      poll();
    });
  }, n);

async function open(width, height, touch) {
  const ctx = await browser.newContext({ viewport: { width, height }, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });
  // Copy every drawn frame into a 2D canvas, so pixels can be read back without preserveDrawingBuffer.
  await page.evaluate(() => {
    const isle = window.__isle;
    const gl = isle.renderer.domElement;
    const copy = document.createElement("canvas");
    window.__frame = copy;
    const draw = isle.composer.render.bind(isle.composer);
    isle.composer.render = (...a) => {
      const out = draw(...a);
      copy.width = gl.width;
      copy.height = gl.height;
      copy.getContext("2d").drawImage(gl, 0, 0);
      return out;
    };
  });
  return page;
}

// Luminance statistics of a CSS-pixel rectangle of the last drawn frame.
const patch = (page, rect) =>
  page.evaluate((r) => {
    const c = window.__frame;
    const k = c.width / window.innerWidth;
    const d = c.getContext("2d").getImageData(Math.round(r.x * k), Math.round(r.y * k), Math.round(r.w * k), Math.round(r.h * k)).data;
    const lum = [];
    let rs = 0, gs = 0, bs = 0;
    for (let i = 0; i < d.length; i += 4) {
      rs += d[i]; gs += d[i + 1]; bs += d[i + 2];
      lum.push((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255);
    }
    lum.sort((a, b) => a - b);
    const n = lum.length;
    return { p5: lum[Math.floor(n * 0.05)], p95: lum[Math.floor(n * 0.95)], mean: { r: rs / n / 255, g: gs / n / 255, b: bs / n / 255 } };
  }, rect);

try {
  // 1. The title at 1280x720: the light rig, the sea, the orbit.
  const title = await open(1280, 720, false);
  await drawn(title, 3);
  const rig = await title.evaluate(() => {
    const isle = window.__isle;
    const lights = [];
    isle.scene.traverse((o) => o.isLight && lights.push(o));
    const hex = (c) => c.getHexString();
    const spread = (c) => {
      const v = [parseInt(hex(c).slice(0, 2), 16), parseInt(hex(c).slice(2, 4), 16), parseInt(hex(c).slice(4, 6), 16)];
      return (Math.max(...v) - Math.min(...v)) / 255;
    };
    const keys = lights.filter((l) => l.isDirectionalLight && l.castShadow);
    const key = keys[0];
    const bounce = lights.filter((l) => l.isHemisphereLight || l.isAmbientLight).reduce((n, l) => n + l.intensity, 0);
    const hemi = lights.find((l) => l.isHemisphereLight);
    return {
      lights: lights.map((l) => `${l.type} #${hex(l.color)} x${l.intensity}`),
      keys: keys.length,
      ambient: lights.filter((l) => l.isAmbientLight).length,
      keyOverBounce: key ? key.intensity / bounce : 0,
      keyWarm: key ? key.color.r / key.color.b : 0,
      skySpread: hemi ? spread(hemi.color) : 1,
      groundSpread: hemi ? spread(hemi.groundColor) : 1,
      shadowType: isle.renderer.shadowMap.type,
      shadowMap: key ? key.shadow.mapSize.x : 0,
      shadowRadius: key ? key.shadow.radius : 0,
      exposure: isle.renderer.toneMappingExposure,
      overhead: isle.overhead,
      autoRotate: isle.controls.autoRotate,
    };
  });
  check("one key lamp casts the shadows, no flat ambient", rig.keys === 1 && rig.ambient === 0, rig.lights);
  check("the key carries the light: at least 3x the bounce", rig.keyOverBounce >= 3, { keyOverBounce: +rig.keyOverBounce.toFixed(2) });
  check("the key is warm (linear r/b at least 1.5) and the bounce near grey (sky spread <= 0.1, ground <= 0.3)", rig.keyWarm >= 1.5 && rig.skySpread <= 0.1 && rig.groundSpread <= 0.3, { keyWarm: +rig.keyWarm.toFixed(2), skySpread: +rig.skySpread.toFixed(2), groundSpread: +rig.groundSpread.toFixed(2) });
  // THREE.PCFShadowMap === 1; three 0.186 dropped PCFSoftShadowMap, so the softness is the PCF blur radius.
  check("soft shadows: PCF blurred at least 4 texels, from a map of at most 1024", rig.shadowType === 1 && rig.shadowRadius >= 4 && rig.shadowMap <= 1024, { type: rig.shadowType, radius: rig.shadowRadius, map: rig.shadowMap });
  check("exposure at most 1.1", rig.exposure <= 1.1, { exposure: rig.exposure });
  check("the title keeps the free camera and its orbit", !rig.overhead && rig.autoRotate, { overhead: rig.overhead, autoRotate: rig.autoRotate });
  // Open water, top right of the title, away from the island and the card.
  const sea = await patch(title, { x: 1100, y: 20, w: 160, h: 110 });
  check("the sea is calm: luminance p95 - p5 under 0.06", sea.p95 - sea.p5 < 0.06, { range: +(sea.p95 - sea.p5).toFixed(3), p5: +sea.p5.toFixed(3), p95: +sea.p95.toFixed(3) });
  check("the sea is teal: green and blue over red", sea.mean.g > sea.mean.r * 1.3 && sea.mean.b > sea.mean.r * 1.3, { r: +sea.mean.r.toFixed(3), g: +sea.mean.g.toFixed(3), b: +sea.mean.b.toFixed(3) });
  await title.screenshot({ path: "test-results/board-look-title-1280x720.png" });
  await title.context().close();

  // 2. In play: the overhead board fits the hole the HUD leaves, on a desktop and on a phone, and the camera is the
  // player's: a drag orbits (and places nothing), a wheel zooms, Home and a double click or double tap glide back.
  for (const [w, h, touch] of [
    [1280, 720, false],
    [390, 844, true],
  ]) {
    const tag = `${w}x${h}${touch ? " touch" : ""}`;
    const page = await open(w, h, touch);
    await page.getByRole("button", { name: "Four seats, one table" }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState, null, { timeout: STEP_MS });
    await page.evaluate(() => {
      const g = window.__emberisle;
      while (g.getState().state.phase === "rollOff") g.getState().dispatch({ type: "roll" });
    });
    await page.waitForFunction(() => window.__isle.lastSeq === window.__emberisle.getState().state.seq && !window.__isle.glide, null, { timeout: STEP_MS });
    await drawn(page, 3);
    // The camera as the orbit sees it, plus what a wrong gesture could change: the game's seq and the pieces on the board.
    const pose = () =>
      page.evaluate(() => {
        const i = window.__isle;
        return {
          polar: i.orbit.getPolarAngle(),
          azimuth: i.orbit.getAzimuthalAngle(),
          zoom: i.ortho.zoom,
          target: [i.orbit.target.x, i.orbit.target.y, i.orbit.target.z],
          glide: i.glide !== null,
          seq: window.__emberisle.getState().state.seq,
          pieces: i.pieces.children.length,
        };
      });
    // Where home is for the hole the HUD leaves right now (a timed notice leaving the phase bar moves it, and the fit follows).
    const home = () =>
      page.evaluate(async () => {
        const { fitOrtho, OVERHEAD_LEAN, CAP_LEVEL } = await import("/src/lib/scene/mobile-fit.ts");
        const f = fitOrtho(innerWidth, innerHeight, window.__isle.insets(), OVERHEAD_LEAN);
        return { polar: OVERHEAD_LEAN, azimuth: 0, zoom: 1, target: [f.x, CAP_LEVEL, f.z] };
      });
    const atHome = async (p) => {
      const h = await home();
      return Math.abs(p.polar - h.polar) < 0.01 && Math.abs(p.azimuth) < 0.01 && Math.abs(p.zoom - 1) < 0.01 && p.target.every((v, k) => Math.abs(v - h.target[k]) < 0.02);
    };
    const lean = Math.round(((await home()).polar * 180) / Math.PI);
    const brief = (p) => ({ polar: +p.polar.toFixed(3), azimuth: +p.azimuth.toFixed(3), zoom: +p.zoom.toFixed(3), target: p.target.map((v) => +v.toFixed(2)) });
    const settle = async () => {
      await page.waitForFunction(() => !window.__isle.glide, null, { timeout: STEP_MS });
      await drawn(page, 2);
      return pose();
    };
    const fit = await page.evaluate(() => {
      const isle = window.__isle;
      const st = window.__emberisle.getState().state;
      const ins = isle.insets();
      const hole = { l: ins.left, t: ins.top, r: innerWidth - ins.right, b: innerHeight - ins.bottom };
      // Pixels per world unit across the screen, from the frustum (the lean foreshortens depth, not width).
      const scale = (innerWidth / (isle.ortho.right - isle.ortho.left)) * isle.ortho.zoom;
      const out = [];
      const covered = [];
      let dockIn = Infinity;
      for (const v of st.vertices) {
        const p = isle.screenOf(v.id);
        // A dock's pier and boat reach 0.7 world units past its corner.
        const m = v.harbor ? 0.7 * scale : 0;
        const inside = Math.min(p.x - hole.l, hole.r - p.x, p.y - hole.t, hole.b - p.y);
        if (v.harbor) dockIn = Math.min(dockIn, inside);
        if (inside < m) out.push(`${v.id}@${p.x | 0},${p.y | 0}`);
        if (document.elementFromPoint(p.x, p.y)?.tagName !== "CANVAS") covered.push(`${v.id}@${p.x | 0},${p.y | 0}`);
      }
      return { overhead: isle.overhead, hole, scale: +scale.toFixed(1), corners: st.vertices.length, out, covered, dockIn: +dockIn.toFixed(1), token: +(0.68 * scale).toFixed(1) };
    });
    check(`${tag}: the overhead camera is on in play`, fit.overhead);
    check(`${tag}: every corner and dock inside the measured HUD hole`, fit.corners === 54 && fit.out.length === 0, { hole: fit.hole, scale: fit.scale, dockIn: fit.dockIn, out: fit.out.slice(0, 6) });
    check(`${tag}: every corner lands on the canvas (clear of the HUD)`, fit.covered.length === 0, fit.covered.slice(0, 6));
    const tokenMin = touch ? 18 : 24;
    check(`${tag}: a number token is at least ${tokenMin} px across`, fit.token >= tokenMin, { token: fit.token });
    const p0 = await pose();
    check(`${tag}: the default view is the fitted ${lean}° overhead view`, (await atHome(p0)) && !p0.glide, brief(p0));
    await page.screenshot({ path: `test-results/board-look-play-${w}x${h}.png` });

    // A legal corner to start a drag on: the drag must orbit, not place.
    const mark = await page.evaluate(() => {
      const id = window.__emberisle.getState().highlights().vertices[0];
      return { id, ...window.__isle.screenOf(id) };
    });
    const dragged = await (async () => {
      if (!touch) {
        await page.mouse.move(mark.x, mark.y);
        await page.mouse.down();
        for (let i = 1; i <= 6; i++) await page.mouse.move(mark.x + 20 * i, mark.y + 8 * i);
        await page.mouse.up();
      } else {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: mark.x, y: mark.y }] });
        for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: mark.x + 20 * i, y: mark.y + 8 * i }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      }
      await drawn(page, 2);
      return pose();
    })();
    const turned = Math.abs(dragged.azimuth - p0.azimuth) > 0.05 || Math.abs(dragged.polar - p0.polar) > 0.05;
    check(`${tag}: a ${touch ? "one-finger " : ""}drag orbits the camera`, turned, brief(dragged));
    check(`${tag}: a drag from a legal corner places nothing`, dragged.seq === p0.seq && dragged.pieces === p0.pieces, { seq: [p0.seq, dragged.seq], pieces: [p0.pieces, dragged.pieces], mark: mark.id });

    if (!touch) {
      await page.mouse.move(w / 2, h / 2);
      await page.mouse.wheel(0, -240);
      await drawn(page, 2);
      const zoomed = await pose();
      check(`${tag}: a wheel zooms in`, zoomed.zoom > 1.05 && zoomed.zoom <= 2.4, { zoom: +zoomed.zoom.toFixed(3) });
      await page.keyboard.press("Home");
      const gliding = await pose();
      const homed = await settle();
      check(`${tag}: Home glides back to the fitted view`, gliding.glide && (await atHome(homed)), { startedGlide: gliding.glide, ...brief(homed) });
    }

    // Orbit again, then two taps on empty board (the hole's top-left corner is open sea) snap home and place nothing.
    if (!touch) {
      await page.mouse.move(mark.x, mark.y);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) await page.mouse.move(mark.x - 20 * i, mark.y + 5 * i);
      await page.mouse.up();
    } else {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: mark.x, y: mark.y }] });
      for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: mark.x - 20 * i, y: mark.y + 5 * i }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    await drawn(page, 2);
    const away = await pose();
    const sea = { x: fit.hole.l + 10, y: fit.hole.t + 10 };
    if (touch) {
      await page.touchscreen.tap(sea.x, sea.y);
      await page.touchscreen.tap(sea.x, sea.y);
    } else await page.mouse.dblclick(sea.x, sea.y);
    const wasAway = !(await atHome(away));
    const snapped = await settle();
    check(`${tag}: a double ${touch ? "tap" : "click"} on empty board returns to the fitted view and places nothing`, wasAway && (await atHome(snapped)) && snapped.seq === p0.seq, { before: brief(away), after: brief(snapped), seq: [p0.seq, snapped.seq] });

    if (!touch) {
      // The click still places: the same corner, after all that orbiting.
      const at = await page.evaluate((id) => window.__isle.screenOf(id), mark.id);
      await page.mouse.click(at.x, at.y);
      await page.waitForFunction((s) => window.__emberisle.getState().state.seq > s, p0.seq, { timeout: STEP_MS }).catch(() => {});
      const placed = await pose();
      check(`${tag}: a click on the legal corner still places`, placed.seq > p0.seq && placed.pieces === p0.pieces + 1, { seq: [p0.seq, placed.seq], pieces: [p0.pieces, placed.pieces] });
      // Reduced motion: Home is instant, no glide.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.mouse.move(w / 2, h / 2);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) await page.mouse.move(w / 2 + 20 * i, h / 2);
      await page.mouse.up();
      await drawn(page, 2);
      const calmAway = await pose();
      const calmWasAway = !(await atHome(calmAway));
      await page.keyboard.press("Home");
      // No glide is started; the next drawn frame is already home.
      const noGlide = !(await pose()).glide;
      await drawn(page, 1);
      const calmHome = await pose();
      check(`${tag}: under reduced motion Home snaps at once`, calmWasAway && noGlide && (await atHome(calmHome)), { before: brief(calmAway), noGlide, after: brief(calmHome) });
    }
    await page.context().close();
  }
  check("no console errors", errors.length === 0, errors);
} catch (e) {
  console.error("board-look-prove failed:", e);
  fails.push("exception");
}
await browser.close();
await vite.close();
if (fails.length) {
  console.log(`\n${fails.length} failed: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\nboard-look-prove: all checks passed");
