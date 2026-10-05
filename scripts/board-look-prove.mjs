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
//   places nothing even when it starts on a legal corner, nor does an out-and-back drag that ends on it; a wheel zooms;
//   Home (desktop) and a double click or double tap on empty board glide back to the fitted view; a click on the corner
//   still places afterwards; under reduced motion Home is instant; mid-game at 1280x720 with the hand shown and an armed
//   path a token is still at least 24 px across (#422: the dice ride in the End turn row); three long chat previews beside the dock button
//   do not count as a rail or move the camera; at 1024x768 online, opening the chat and focusing the keyboard PlaceList
//   (no state change) each refit the island clear of the rail they make, and closing or blurring refits it back;
// - #422: on a sideways phone (844x390 and 667x375, touch) in the main phase with the hand shown, the HUD is a left column
//   and the island beside it is larger than on main before #422 (a 101x85 px island, 8581 and 8569 px²), at least 60 % as
//   wide as the hole is tall, every corner clear of the HUD, and every two adjacent corners at least 24 px apart (the touch slop);
//   with Path armed and an edge picked by touch, the Place chip is in view and covers neither the hand nor the turn banner.
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
    const t0 = performance.now();
    await new Promise((res, rej) => {
      const poll = () => (isle.renders >= r0 + n ? res() : performance.now() - t0 > 8000 ? rej(new Error(`drawn: ${n} frame(s) never came`)) : requestAnimationFrame(poll));
      poll();
    });
  }, n);

async function open(width, height, touch) {
  const ctx = await browser.newContext({ viewport: { width, height }, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  // A wait that times out names its predicate.
  const wait = page.waitForFunction.bind(page);
  page.waitForFunction = (fn, arg, opts) => wait(fn, arg, opts).catch((e) => { throw new Error(`waiting for ${String(fn).replace(/\s+/g, " ").slice(0, 160)}: ${e.message}`); });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });
  // Plays the hotseat table on through the setup round and rolls (a 7 moves the wayfarer and robs) until a main phase.
  await page.evaluate(() => {
    window.__toMain = async () => {
      const g = window.__emberisle;
      for (let i = 0; i < 40; i++) {
        const s = g.getState();
        const ph = s.state.phase;
        const hi = s.highlights();
        if (ph === "rollOff") s.dispatch({ type: "roll" });
        else if (ph === "setupSettle" && hi.vertices[0]) s.pickVertex(hi.vertices[0]);
        else if (ph === "setupRoad" && hi.edges[0]) s.pickEdge(hi.edges[0]);
        else if (ph === "roll") s.dispatch({ type: "roll" });
        else if (ph === "robber" && hi.hexes[0]) {
          s.pickHex(hi.hexes[0]);
          const steal = g.getState().pendingSteal;
          if (steal) g.getState().chooseSteal(steal.targets[0]);
        } else break;
      }
    };
  });
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
    // A state change marks the fit due at once and the next frame starts its glide, so both must be clear.
    await page.waitForFunction(() => window.__isle.lastSeq === window.__emberisle.getState().state.seq && !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
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
    // Where home is: the fit the renderer measured at the last state change (a timed notice leaving the phase bar in
    // between does not move it; the next state change does).
    const home = () =>
      page.evaluate(async () => {
        const { OVERHEAD_LEAN, CAP_LEVEL } = await import("/src/lib/scene/mobile-fit.ts");
        const f = window.__isle.fit;
        return { polar: OVERHEAD_LEAN, azimuth: 0, zoom: 1, target: [f.x, CAP_LEVEL, f.z] };
      });
    const atHome = async (p) => {
      const h = await home();
      return Math.abs(p.polar - h.polar) < 0.01 && Math.abs(p.azimuth) < 0.01 && Math.abs(p.zoom - 1) < 0.01 && p.target.every((v, k) => Math.abs(v - h.target[k]) < 0.02);
    };
    const lean = Math.round(((await home()).polar * 180) / Math.PI);
    const brief = (p) => ({ polar: +p.polar.toFixed(3), azimuth: +p.azimuth.toFixed(3), zoom: +p.zoom.toFixed(3), target: p.target.map((v) => +v.toFixed(2)), glide: p.glide });
    const settle = async () => {
      await page.waitForFunction(() => !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
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
    // A drag through the points, with the mouse or one finger (CDP touch events: Playwright's touchscreen only taps).
    const cdp = touch ? await page.context().newCDPSession(page) : null;
    const drag = async (pts) => {
      if (!touch) {
        await page.mouse.move(pts[0].x, pts[0].y);
        await page.mouse.down();
        for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y);
        await page.mouse.up();
      } else {
        const pt = (p) => ({ x: p.x, y: p.y });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt(pts[0])] });
        for (const p of pts.slice(1)) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [pt(p)] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      }
      await drawn(page, 2);
      return pose();
    };
    const path = (dx, dy, n = 6) => [mark, ...Array.from({ length: n }, (_, i) => ({ x: mark.x + dx * (i + 1), y: mark.y + dy * (i + 1) }))];
    const dragged = await drag(path(20, 8));
    const turned = Math.abs(dragged.azimuth - p0.azimuth) > 0.05 || Math.abs(dragged.polar - p0.polar) > 0.05;
    check(`${tag}: a ${touch ? "one-finger " : ""}drag orbits the camera`, turned, brief(dragged));
    check(`${tag}: a drag from a legal corner places nothing`, dragged.seq === p0.seq && dragged.pieces === p0.pieces, { seq: [p0.seq, dragged.seq], pieces: [p0.pieces, dragged.pieces], mark: mark.id });
    // Out and back: 160 px away and back to the corner it started on. The lift lands where the press did; it is still a drag.
    const back = await drag([...path(32, 0, 5), ...path(32, 0, 5).slice(1, -1).reverse(), mark]);
    check(`${tag}: an out-and-back drag ending on the corner places nothing`, back.seq === p0.seq && back.pieces === p0.pieces, { seq: [p0.seq, back.seq], pieces: [p0.pieces, back.pieces] });

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
    const away = await drag(path(-20, 5));
    const sea = { x: fit.hole.l + 10, y: fit.hole.t + 10 };
    const wasAway = !(await atHome(away));
    // Under load the two input round trips can land more than 350 ms apart, which is not a double tap at all; the lifts
    // are timed in the page and the gesture is tried again (as a player would) until one is a real double tap.
    await page.evaluate(() => {
      window.__ups = [];
      document.querySelector("canvas").addEventListener("pointerup", () => window.__ups.push(performance.now()));
    });
    const gaps = [];
    for (let tries = 0; tries < 8; tries++) {
      await page.evaluate(() => (window.__ups = []));
      if (touch) {
        await page.touchscreen.tap(sea.x, sea.y);
        await page.touchscreen.tap(sea.x, sea.y);
      } else await page.mouse.dblclick(sea.x, sea.y);
      const ups = await page.evaluate(() => window.__ups);
      gaps.push(ups.length === 2 ? Math.round(ups[1] - ups[0]) : ups.length);
      if (ups.length === 2 && ups[1] - ups[0] < 350) break;
      await drawn(page, 1);
    }
    const snapped = await settle();
    check(`${tag}: a double ${touch ? "tap" : "click"} on empty board returns to the fitted view and places nothing`, wasAway && (await atHome(snapped)) && snapped.seq === p0.seq, { before: brief(away), after: brief(snapped), seq: [p0.seq, snapped.seq], gapsMs: gaps });

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
      await page.emulateMedia({ reducedMotion: "no-preference" });

      // Mid-game: through the setup round, a roll, then an armed path. The bottom stack is at its main-phase height (turn
      // banner, hand, the build row with the dice and End turn) with the armed banner; the fit follows (the marks changed).
      // Before #422 the dice had a row of their own and the token here was 23.2 px.
      const mid = await page.evaluate(async () => {
        await window.__toMain();
        const g = window.__emberisle;
        if (g.getState().state.phase === "main") g.getState().setBuildMode("path");
        const s = g.getState();
        const seq = s.state.seq;
        const t0 = performance.now();
        await new Promise((res, rej) => {
          const isle = window.__isle;
          const poll = () => (isle.lastSeq === seq && !isle.refitDue && !isle.glide ? res() : performance.now() - t0 > 8000 ? rej(new Error("the fit never settled")) : requestAnimationFrame(poll));
          poll();
        });
        const isle = window.__isle;
        return { phase: s.state.phase, armed: s.buildMode, hand: !!document.querySelector('[data-testid="hand-dock"]'), insets: isle.insets(), token: +((innerWidth / (isle.ortho.right - isle.ortho.left)) * isle.ortho.zoom * 0.68).toFixed(1) };
      });
      await drawn(page, 2);
      check(`${tag}: mid-game with the hand shown and an armed path a token is at least 24 px across`, mid.phase === "main" && mid.armed === "path" && mid.hand && mid.token >= 24, mid);
      // Disarming changes the marks, so the fit follows once more; let it land before the baseline below is taken.
      await page.evaluate(() => window.__emberisle.getState().setBuildMode("none"));
      await page.waitForFunction(() => !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
      await drawn(page, 2);

      // Chat previews beside the dock button let taps through; they are not a rail and never move the camera. The dock
      // shows online only, so the store is told so (which re-fits once: the HUD and the marks change with the mode) and the
      // baseline is taken after that settles; then three long lines arrive.
      const step = (name, p) => p.catch((e) => { throw new Error(`${name}: ${e.message}`); });
      const settled = () => step("fit settles", page.waitForFunction(() => !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS }));
      await page.evaluate(() => window.__emberisle.setState({ mode: "online" }));
      await step("chat dock mounts", page.waitForSelector('[data-testid="chat-preview"]', { state: "attached", timeout: STEP_MS }));
      await settled();
      await drawn(page, 2);
      const t0 = await pose();
      await page.evaluate(() => {
        const text = "A long line of table talk that runs to about ninety-five characters so the preview is as wide as it gets.";
        const at = Date.now();
        window.__emberisle.setState({ chat: [1, 2, 3].map((i) => ({ id: 9000 + i, seat: "s1", player: "p1", name: "Tide", color: "#2a8f8a", text, at })) });
      });
      await step("three previews show", page.waitForFunction(() => document.querySelectorAll('[data-testid="chat-preview"] li').length === 3, null, { timeout: STEP_MS }));
      const withChat = await page.evaluate(() => ({
        previews: document.querySelectorAll('[data-testid="chat-preview"] li').length,
        previewW: Math.round(document.querySelector('[data-testid="chat-preview"]').getBoundingClientRect().width),
        right: window.__isle.insets().right,
      }));
      await drawn(page, 2);
      const t1 = await pose();
      check(`${tag}: chat previews are not a rail: the right inset stays 12 and the camera stays put`, withChat.previews === 3 && withChat.previewW >= 200 && withChat.right === 12 && !t1.glide && t1.target.every((v, k) => Math.abs(v - t0.target[k]) < 1e-6), { ...withChat, target: brief(t1).target, before: brief(t0).target });
    }
    await page.context().close();
  }
  // 3. Chrome the player opens without the game moving refits the board: the chat dock (online) and the focused keyboard
  // PlaceList each become a right rail, the island glides clear of them, and closing or blurring glides it back.
  {
    const page = await open(1024, 768, false);
    await page.getByRole("button", { name: "Four seats, one table" }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState, null, { timeout: STEP_MS });
    await page.evaluate(() => {
      const g = window.__emberisle;
      while (g.getState().state.phase === "rollOff") g.getState().dispatch({ type: "roll" });
    });
    const settled = async () => {
      await page.waitForFunction(() => window.__isle.lastSeq === window.__emberisle.getState().state.seq && !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
      await drawn(page, 2);
    };
    // The hole and the fit as they stand, whether the fit is the one the hole asks for now, and where the island's
    // rightmost corner sits against the rail on the right.
    const look = (rail) =>
      page.evaluate(async (rail) => {
        const { fitOrtho, OVERHEAD_LEAN } = await import("/src/lib/scene/mobile-fit.ts");
        const isle = window.__isle;
        const ins = isle.insets();
        const want = fitOrtho(innerWidth, innerHeight, ins, OVERHEAD_LEAN);
        const st = window.__emberisle.getState().state;
        const el = rail ? document.querySelector(rail) : null;
        const railLeft = el ? Math.round(el.getBoundingClientRect().left) : null;
        let rightmost = -Infinity;
        const covered = [];
        for (const v of st.vertices) {
          const p = isle.screenOf(v.id);
          rightmost = Math.max(rightmost, p.x);
          if (document.elementFromPoint(p.x, p.y)?.tagName !== "CANVAS") covered.push(`${v.id}@${p.x | 0},${p.y | 0}`);
        }
        const fresh = ["left", "right", "top", "bottom", "x", "z"].every((k) => Math.abs(want[k] - isle.fit[k]) < 1e-6);
        return { seq: st.seq, ins: JSON.stringify(ins), pose: JSON.stringify(["x", "z", "left", "right", "top", "bottom"].map((k) => isle.fit[k])), right: ins.right, fresh, railLeft, rightmost: Math.round(rightmost), covered, glide: isle.glide !== null };
      }, rail);
    // The first-player notice leaves the phase bar a few seconds in, and housekeeping does not refit; start after it has
    // gone, with one measure asked for, so every fit below answers to the hole as it then stands.
    await page.waitForFunction(() => !document.querySelector('[data-testid="banner"]'), null, { timeout: STEP_MS });
    await page.evaluate(() => window.__isle.remeasure());
    await settled();
    const base = await look(null);
    check("1024x768: the fit is the one the hole asks for", base.fresh && base.covered.length === 0, base);
    // A measure that finds the hole unchanged draws nothing extra: it does not wake the idle loop (#481).
    const idleWake = await page.evaluate(async () => {
      const isle = window.__isle;
      await new Promise((r) => setTimeout(r, 1100));
      const before = isle.busyUntil;
      isle.remeasure();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { before, after: isle.busyUntil };
    });
    check("1024x768: a remeasure that changes nothing does not wake the loop", idleWake.after === idleWake.before, idleWake);
    // The keyboard PlaceList shows while a button in it has focus (#376) and is a rail then.
    await page.evaluate(() => document.querySelector('[data-testid="place-list"] button').focus());
    await settled();
    const list = await look('[data-testid="place-list"]');
    check("1024x768: focusing the PlaceList refits the island clear of it, with no state change", list.seq === base.seq && list.right > base.right && list.fresh && list.rightmost < list.railLeft && list.covered.length === 0, { base, list });
    await page.evaluate(() => document.activeElement.blur());
    await settled();
    const blurred = await look(null);
    check("1024x768: blurring the PlaceList refits it back", blurred.seq === base.seq && blurred.right === base.right && blurred.fresh && blurred.covered.length === 0, { base, blurred });
    // The chat dock shows online; the store is told so, then the dock is opened with no state change.
    await page.evaluate(() => window.__emberisle.setState({ mode: "online" }));
    await settled();
    const online = await look(null);
    await page.evaluate(() => window.__emberisle.getState().setChatOpen(true));
    await page.waitForSelector('[aria-label="Table chat"]', { timeout: STEP_MS });
    await settled();
    const chat = await look('[aria-label="Table chat"]');
    check("1024x768: opening the chat refits the island clear of the chat rail, with no state change", chat.seq === online.seq && chat.right > online.right && chat.fresh && chat.rightmost < chat.railLeft && chat.covered.length === 0, { online, chat });
    await page.evaluate(() => window.__emberisle.getState().setChatOpen(false));
    await settled();
    const closed = await look(null);
    check("1024x768: closing the chat refits it back", closed.seq === online.seq && closed.right === online.right && closed.fresh && closed.covered.length === 0, { online, closed });
    // Opening the table menu or a seat's popover is not chrome the island makes room for: the hole and the fit stay as they were.
    await page.evaluate(() => window.__emberisle.getState().setChatOpen(false));
    await settled();
    const shut = await look(null);
    await page.getByRole("button", { name: "Table menu" }).click();
    await page.locator("#table-menu").waitFor({ timeout: STEP_MS });
    await settled();
    const menu = await look(null);
    check("1024x768: opening the table menu leaves the hole and the fit unchanged", menu.ins === shut.ins && menu.pose === shut.pose && menu.seq === shut.seq, { shut, menu });
    await page.keyboard.press("Escape");
    await page.locator("#table-menu").waitFor({ state: "detached", timeout: STEP_MS });
    await settled();
    await page.evaluate(() => {
      const g = window.__emberisle.getState();
      g.openMenu(g.state.players[1].id);
    });
    await page.locator('[data-testid="player-menu"]').waitFor({ timeout: STEP_MS });
    await settled();
    const seatMenu = await look(null);
    check("1024x768: opening a seat popover leaves the hole and the fit unchanged", seatMenu.ins === shut.ins && seatMenu.pose === shut.pose && seatMenu.seq === shut.seq, { shut, seatMenu });
    await page.context().close();
  }
  // 4. #422: a sideways phone, main phase, hand shown. The HUD is a left column and the island fills the height beside it.
  for (const [w, h, before] of [
    [844, 390, 8581],
    [667, 375, 8569],
  ]) {
    const tag = `${w}x${h} touch`;
    const page = await open(w, h, true);
    await page.getByRole("button", { name: "Four seats, one table" }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState, null, { timeout: STEP_MS });
    await page.evaluate(() => window.__toMain());
    await page.waitForFunction(() => window.__isle.lastSeq === window.__emberisle.getState().state.seq && !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
    await drawn(page, 2);
    const land = await page.evaluate(() => {
      const isle = window.__isle;
      const st = window.__emberisle.getState().state;
      const ins = isle.insets();
      const stack = document.querySelector('[data-testid="turn-banner"]').parentElement.getBoundingClientRect();
      const at = Object.fromEntries(st.vertices.map((v) => [v.id, isle.screenOf(v.id)]));
      const xs = Object.values(at).map((p) => p.x);
      const ys = Object.values(at).map((p) => p.y);
      const covered = st.vertices.filter((v) => document.elementFromPoint(at[v.id].x, at[v.id].y)?.tagName !== "CANVAS").map((v) => v.id);
      const apart = Math.min(...st.edges.map((e) => Math.hypot(at[e.va].x - at[e.vb].x, at[e.va].y - at[e.vb].y)));
      const isleW = Math.max(...xs) - Math.min(...xs);
      const isleH = Math.max(...ys) - Math.min(...ys);
      return {
        phase: st.phase,
        hand: !!document.querySelector('[data-testid="hand-dock"]'),
        column: { left: Math.round(stack.left), right: Math.round(stack.right), top: Math.round(stack.top), bottom: Math.round(stack.bottom) },
        insets: ins,
        holeH: innerHeight - ins.top - ins.bottom,
        isle: `${Math.round(isleW)}x${Math.round(isleH)}`,
        area: Math.round(isleW * isleH),
        token: +((innerWidth / (isle.ortho.right - isle.ortho.left)) * isle.ortho.zoom * 0.68).toFixed(1),
        apart: +apart.toFixed(1),
        widthOverHoleH: +(isleW / (innerHeight - ins.top - ins.bottom)).toFixed(2),
        covered,
      };
    });
    check(`${tag}: main phase with the hand shown, the HUD a left column`, land.phase === "main" && land.hand && land.column.right < w / 2 && land.insets.left > land.column.right, land);
    check(`${tag}: the island is larger than before #422 (${before} px²)`, land.area > before, { area: land.area, isle: land.isle, token: land.token });
    check(`${tag}: the island is at least 60 % as wide as the hole is tall, every corner clear of the HUD`, land.widthOverHoleH >= 0.6 && land.covered.length === 0, { widthOverHoleH: land.widthOverHoleH, holeH: land.holeH, covered: land.covered.slice(0, 6) });
    check(`${tag}: adjacent corners at least 24 px apart`, land.apart >= 24, { apart: land.apart });
    await page.screenshot({ path: `test-results/board-look-play-${w}x${h}.png` });
    // A main-phase build by touch: Path armed, an edge picked, the column scrolled to its end first. Place and Cancel are
    // the column's first row, in view, and cover neither the hand nor the turn banner.
    await page.evaluate(() => {
      const g = window.__emberisle.getState();
      g.setBuildMode("path");
      const sc = document.querySelector('[data-testid="turn-banner"]').parentElement;
      sc.scrollTop = sc.scrollHeight;
      g.setPendingPlace({ kind: "edge", id: g.highlights().edges[0] });
    });
    await page.getByTestId("place-chip").waitFor({ timeout: STEP_MS });
    const chip = await page.evaluate(() => {
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) };
      };
      const meets = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      const place = document.querySelector('[data-testid="place-chip"]');
      const row = box(place.parentElement);
      const hand = box(document.querySelector('[data-testid="hand-dock"]'));
      const turn = box(document.querySelector('[data-testid="turn-banner"]'));
      const sc = box(document.querySelector('[data-testid="turn-banner"]').parentElement);
      const p = box(place);
      const onTop = place.contains(document.elementFromPoint((p.l + p.r) / 2, (p.t + p.b) / 2));
      return { armed: window.__emberisle.getState().buildMode, row, hand, turn, onTop, inView: p.t >= sc.t && p.b <= sc.b, overHand: meets(row, hand), overTurn: meets(row, turn) };
    });
    check(`${tag}: an armed Path's Place chip is the column's first row, in view, clear of the hand and the turn banner`, chip.armed === "path" && chip.onTop && chip.inView && !chip.overHand && !chip.overTurn, chip);
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
