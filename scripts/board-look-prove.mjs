// #135, polish.md "The board look target": the island reads like a lit board on a table. In the browser:
// - the light rig is one warm key lamp (the only shadow caster, at least 3x the bounce), near-grey low bounce, no flat
//   ambient, soft shadows (PCF blurred at least 4 texels) from a map of at most 1024, exposure at most 1.1;
// - the crystal sea (crystal-water.md), read back at 1280x720 in play: shallows within 20/255 of the near-white aqua
//   #cdf1ec, deep water a blue-green no darker or more saturated than #4ab9b5, and still sea (no paper) at the canvas corner zoomed fully out; in the free view, tilted low, the far
//   horizon is the studio paper #f1efe9 the page sits on. Every other page pins the simple sea, so the gesture timings do not
//   pay for the crystal sea on software GL;
// - the title keeps the slow orbit (free camera, auto-rotate); in play, on a fine pointer at 1280x720 and a coarse one at
//   390x844, the default view for the screen's shape (#597: the diorama on the desktop, overhead on the upright phone) is
//   on and every corner of the island, and every dock's pier and boat (0.7 out along the coast), projects inside the hole
//   the HUD leaves (`__isle.insets()`, measured from the HUD's own chrome), each corner's screen point lands on the canvas,
//   and every number token is at least 24 px across on the desktop and 18 px on the phone;
// - the table menu's View switches to the fitted 25° overhead view (every corner in the hole, a drag orbits it) and the
//   choice outlives a reload (`emberisle-view`);
// - the default view is at its fitted home; a drag (mouse, or one finger through CDP touch events) orbits it and
//   places nothing even when it starts on a legal corner, nor does an out-and-back drag that ends on it; a wheel zooms;
//   Home (desktop) and a double click or double tap on empty board glide back to the fitted view; a click on the corner
//   still places afterwards; under reduced motion Home is instant; mid-game at 1280x720 with the hand shown and an armed
//   path a token is still at least 24 px across (#422: the dice ride in the End turn row); three long chat previews beside the dock button
//   do not count as a rail or move the camera; at 1024x768 online, opening the chat and focusing the keyboard PlaceList
//   (no state change) each refit the island clear of the rail they make, and closing or blurring refits it back;
// - #422: on a sideways phone (844x390 and 667x375, touch) in the main phase with the hand shown, the HUD is a left column
//   and the island beside it is larger than on main before #422 (a 101x85 px island, 8581 and 8569 px²), at least 60 % as
//   wide as the hole is tall, every corner clear of the HUD, and (overhead, the default under 900 px wide) every two
//   adjacent corners at least 24 px apart (the touch slop); at 844x390 with the diorama chosen, adjacent corners stay at
//   least 18 px apart (the tilt foreshortens a step along the line of sight; 18 px keeps a tap dead on a corner outside its
//   neighbour's 14 px touch reach), and a path and an outpost on the far (north) coast measure at least the touch slop;
//   with Path armed and an edge picked by touch, the Place chip is in view and covers neither the hand nor the turn banner.
// - #599 (docs/design/hex-jelly-prompt.md): the jelly board: all six kinds, every hex flat at topOf on its pad and at its
//   corners and edges with a landform elsewhere, the scenes in at most 60 draws and 600k triangles (the island 620k), nothing
//   within 0.31 of a hex's centre; saves test-results/terrain-1280.png (diorama) and terrain-390.png (overhead).
// Zero console errors. Saves test-results/board-look-{title,play}-<size>.png. Port from VITE_PORT, default 8112.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

// CI renders the island with software GL, where one frame can take seconds; a step gets this long to show.
const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8112;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

// Mirrors DOUBLE_TAP_MS in src/lib/scene/isle-renderer.ts.
const DOUBLE_TAP_MS = 350;

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

// Waits until the island has drawn n more frames (the scene has settled after a change). The full Hex Jelly scenes on
// software GL take seconds a frame on CI (#624), so their sections give it 30 s.
const drawn = (page, n, ms = 8000) =>
  page.evaluate(async ([n, ms]) => {
    const isle = window.__isle;
    const r0 = isle.renders;
    const t0 = performance.now();
    // The long waits ask for the frames, as a state change would (the short ones must not wake an idle loop).
    if (ms > 8000) isle.wake?.();
    await new Promise((res, rej) => {
      const poll = () => (isle.renders >= r0 + n ? res() : performance.now() - t0 > ms ? rej(new Error(`drawn: ${n} frame(s) never came`)) : requestAnimationFrame(poll));
      poll();
    });
  }, [n, ms]);

async function open(width, height, touch, water = "simple", view = null, jelly = null) {
  const ctx = await browser.newContext({ viewport: { width, height }, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addInitScript((w) => localStorage.setItem("emberisle-water", w), water);
  // The full Hex Jelly scenes, where software GL would build the lite board (jelly-board.md).
  if (jelly) await ctx.addInitScript((j) => localStorage.setItem("emberisle-jelly", j), jelly);
  if (view) await ctx.addInitScript((v) => localStorage.setItem("emberisle-view", v), view);
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
      view: isle.view,
      autoRotate: isle.controls.autoRotate,
    };
  });
  check("one key lamp casts the shadows, no flat ambient", rig.keys === 1 && rig.ambient === 0, rig.lights);
  check("the key carries the light: at least 3x the bounce", rig.keyOverBounce >= 3, { keyOverBounce: +rig.keyOverBounce.toFixed(2) });
  check("the key is warm (linear r/b at least 1.5) and the bounce near grey (sky spread <= 0.1, ground <= 0.3)", rig.keyWarm >= 1.5 && rig.skySpread <= 0.1 && rig.groundSpread <= 0.3, { keyWarm: +rig.keyWarm.toFixed(2), skySpread: +rig.skySpread.toFixed(2), groundSpread: +rig.groundSpread.toFixed(2) });
  // THREE.PCFShadowMap === 1; three 0.186 dropped PCFSoftShadowMap, so the softness is the PCF blur radius.
  check("soft shadows: PCF blurred at least 4 texels, from a map of at most 1024", rig.shadowType === 1 && rig.shadowRadius >= 4 && rig.shadowMap <= 1024, { type: rig.shadowType, radius: rig.shadowRadius, map: rig.shadowMap });
  check("exposure at most 1.1", rig.exposure <= 1.1, { exposure: rig.exposure });
  check("the title keeps the free camera and its orbit", rig.view === "free" && rig.autoRotate, { view: rig.view, autoRotate: rig.autoRotate });
  await title.screenshot({ path: "test-results/board-look-title-1280x720.png" });
  await title.context().close();

  // 1b. The crystal sea in play at 1280x720, in the overhead view (where the sea fills the canvas): teal over deep water,
  // lighter where sand shows through the shallow band. Both points sit on the outward line from the middle of a coast edge
  // with no dock, 0.6 and 3.5 units out, inside the HUD hole.
  {
    const page = await open(1280, 720, false, "crystal", "overhead");
    await page.getByRole("button", { name: "Four seats, one table" }).click();
    await page.waitForFunction(() => window.__emberisle?.water?.path === "crystal" && window.__isle.lastState && window.__emberisle.getState().state && !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
    await page.waitForFunction((n) => window.__isle.renders > n, (await page.evaluate(() => window.__isle.renders)) + 2, { timeout: STEP_MS });
    const spots = await page.evaluate(() => {
      const isle = window.__isle;
      const st = window.__emberisle.getState().state;
      const ins = isle.insets();
      const ids = isle.coastOrder;
      const at = (x, z) => isle.screenAt(x, -0.02, z);
      const inHole = (p) => p.x > ins.left + 8 && p.x < innerWidth - ins.right - 8 && p.y > ins.top + 8 && p.y < innerHeight - ins.bottom - 8;
      for (let i = 0; i < ids.length; i++) {
        const a = st.vertices.find((v) => v.id === ids[i]);
        const b = st.vertices.find((v) => v.id === ids[(i + 1) % ids.length]);
        if (a.harbor || b.harbor) continue;
        const ma = isle.coastMiter.get(a.id), mb = isle.coastMiter.get(b.id);
        const [cx, cz, mx, mz] = [(a.x + b.x) / 2, (a.z + b.z) / 2, (ma.mx + mb.mx) / 2, (ma.mz + mb.mz) / 2];
        const shore = at(cx + mx * 0.6, cz + mz * 0.6), deep = at(cx + mx * 3.5, cz + mz * 3.5);
        if (inHole(shore) && inHole(deep) && document.elementFromPoint(deep.x, deep.y)?.tagName === "CANVAS") return { shore, deep };
      }
      return null;
    });
    check("1280x720 crystal: a coast edge with open water beside it inside the hole", spots !== null, spots);
    if (spots) {
      // The colours at rest: under reduced motion the waves lie flat (a breaker over the shallow band changes its depth by half),
      // and a 9 px patch averages over what is left.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(() => window.__isle.wasCalm, null, { timeout: STEP_MS });
      // Each wake holds the loop for 1 s, about one software-GL frame: wake until two frames have been drawn at rest.
      await page.evaluate(async () => {
        const isle = window.__isle, r0 = isle.renders;
        await new Promise((res) => { const p = () => { if (isle.renders > r0 + 1) return res(); isle.wake(); requestAnimationFrame(p); }; p(); });
      });
      const lum = (m) => 0.2126 * m.r + 0.7152 * m.g + 0.0722 * m.b;
      const shore = await patch(page, { x: spots.shore.x - 4, y: spots.shore.y - 4, w: 9, h: 9 });
      const deep = await patch(page, { x: spots.deep.x - 4, y: spots.deep.y - 4, w: 9, h: 9 });
      const rgb = (m) => ["r", "g", "b"].map((c) => Math.round(m[c] * 255));
      const near = (m, want) => Math.max(...rgb(m).map((v, i) => Math.abs(v - want[i]))) <= 20;
      const [dr, dg, db] = rgb(deep.mean);
      check("1280x720 crystal: deep water is a light blue-green, no darker or more saturated than #4ab9b5", dg > dr * 1.3 && db > dr * 1.3 && dr >= 74 && dg >= 185 && db >= 181, { deep: rgb(deep.mean) });
      check("1280x720 crystal: the shallow band is near-white aqua #cdf1ec (within 20/255), lighter than the deep", near(shore.mean, [205, 241, 236]) && lum(shore.mean) > lum(deep.mean) + 0.04, { shore: rgb(shore.mean), deep: rgb(deep.mean) });
    }
    await page.screenshot({ path: "test-results/board-look-crystal-1280x720.png" });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(() => !window.__isle.wasCalm, null, { timeout: STEP_MS });
    // Zoomed out as far as the wheel goes, the sea still fills the canvas: its corner is teal, not paper.
    await page.mouse.move(640, 300);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 600);
    await page.waitForFunction(() => Math.abs(window.__isle.ortho.zoom - window.__isle.orbit.minZoom) < 0.01, null, { timeout: STEP_MS });
    await page.waitForFunction((n) => window.__isle.renders > n, (await page.evaluate(() => window.__isle.renders)) + 2, { timeout: STEP_MS });
    const corner = await patch(page, { x: 0, y: 0, w: 6, h: 6 });
    check("1280x720 crystal, zoomed out: the sea fills the canvas to its corner (teal, no paper)", corner.mean.g > corner.mean.r * 1.3 && corner.mean.b > corner.mean.r * 1.3, { rgb: ["r", "g", "b"].map((c) => Math.round(corner.mean[c] * 255)) });
    // The free view, tilted low: the top of the frame is the far horizon, faded into the paper.
    await page.evaluate(() => {
      const isle = window.__isle;
      isle.setView("free");
      isle.controls.maxPolarAngle = 1.35;
      isle.camera.position.set(9, 3.2, 9);
      isle.controls.update();
      isle.wake();
    });
    await page.waitForFunction((n) => window.__isle.renders > n, (await page.evaluate(() => window.__isle.renders)) + 3, { timeout: STEP_MS });
    const horizon = await patch(page, { x: 560, y: 2, w: 160, h: 6 });
    const off = Math.max(...[0xf1, 0xef, 0xe9].map((v, i) => Math.abs(horizon.mean["rgb"[i]] * 255 - v)));
    check("1280x720 crystal, free view tilted low: the far horizon is the studio paper #f1efe9 (within 6/255)", off <= 6, { rgb: ["r", "g", "b"].map((c) => +(horizon.mean[c] * 255).toFixed(1)) });
    await page.context().close();
  }

  // 2. In play: the diorama board fits the hole the HUD leaves, on a desktop and on a phone, and the camera is the
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
          zoom: i.pose().zoom,
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
        const { DIORAMA_POLAR, DIORAMA_AZIMUTH, OVERHEAD_LEAN, CAP_LEVEL } = await import("/src/lib/scene/mobile-fit.ts");
        const isle = window.__isle;
        if (isle.view === "overhead") return { polar: OVERHEAD_LEAN, azimuth: 0, zoom: 1, target: [isle.fit.x, CAP_LEVEL, isle.fit.z] };
        return { polar: DIORAMA_POLAR, azimuth: DIORAMA_AZIMUTH, zoom: 1, target: [0, CAP_LEVEL, 0] };
      });
    const atHome = async (p) => {
      const h = await home();
      return Math.abs(p.polar - h.polar) < 0.01 && Math.abs(p.azimuth - h.azimuth) < 0.01 && Math.abs(p.zoom - 1) < 0.01 && p.target.every((v, k) => Math.abs(v - h.target[k]) < 0.02);
    };
    const lean = Math.round(((await home()).polar * 180) / Math.PI);
    const brief = (p) => ({ polar: +p.polar.toFixed(3), azimuth: +p.azimuth.toFixed(3), zoom: +p.zoom.toFixed(3), target: p.target.map((v) => +v.toFixed(2)), glide: p.glide });
    const settle = async () => {
      await page.waitForFunction(() => !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
      await drawn(page, 2);
      return pose();
    };
    // Every corner, and every dock's pier and boat (0.7 out along the coast, at the waterline), inside the hole; every corner
    // on the canvas; the smallest number token on screen (0.68 across, times its diorama scale, at its own depth).
    const holeFit = () => page.evaluate(() => {
      const isle = window.__isle;
      const st = window.__emberisle.getState().state;
      const ins = isle.insets();
      const hole = { l: ins.left, t: ins.top, r: innerWidth - ins.right, b: innerHeight - ins.bottom };
      const inside = (p) => Math.min(p.x - hole.l, hole.r - p.x, p.y - hole.t, hole.b - p.y);
      const out = [];
      const covered = [];
      let dockIn = Infinity;
      for (const v of st.vertices) {
        const p = isle.screenOf(v.id);
        const m = isle.coastMiter.get(v.id);
        const reach = v.harbor ? inside(isle.screenAt(v.x + m.mx * 0.7, 0.1, v.z + m.mz * 0.7)) : Infinity;
        if (v.harbor) dockIn = Math.min(dockIn, reach);
        // A dock may come to the hole's edge (the diorama fit puts the nearest one there), not past it: half a pixel of float.
        if (inside(p) < 0 || reach < -0.5) out.push(`${v.id}@${p.x | 0},${p.y | 0}`);
        if (document.elementFromPoint(p.x, p.y)?.tagName !== "CANVAS") covered.push(`${v.id}@${p.x | 0},${p.y | 0}`);
      }
      const tokens = isle.land.children.filter((o) => o.userData?.token != null);
      const token = Math.min(...tokens.map((t) => 0.68 * t.scale.x * isle.pxPerUnit(t.position.x, t.position.y, t.position.z)));
      return { view: isle.view, hole, corners: st.vertices.length, out, covered, dockIn: +dockIn.toFixed(1), token: +token.toFixed(1) };
    });
    const fit = await holeFit();
    const want = w > h ? "diorama" : "overhead";
    check(`${tag}: the ${want} camera is on in play (the default for the screen's shape)`, fit.view === want, { view: fit.view });
    check(`${tag}: every corner and dock inside the measured HUD hole`, fit.corners === 54 && fit.out.length === 0, { hole: fit.hole, dockIn: fit.dockIn, out: fit.out.slice(0, 6) });
    check(`${tag}: every corner lands on the canvas (clear of the HUD)`, fit.covered.length === 0, fit.covered.slice(0, 6));
    // #587: one pier and one boat per dock (nine on a standard isle), not one per harbor corner (18); each boat's kind is its dock's.
    const docks = await page.evaluate(() => {
      const isle = window.__isle;
      const st = window.__emberisle.getState().state;
      const piers = isle.land.children.filter((o) => o.geometry?.type === "BoxGeometry" && o.geometry.parameters.depth === 0.24).length;
      const kinds = st.vertices.filter((v) => v.harbor).length;
      const mismatched = isle.boats.filter((b) => {
        const ks = (b.userData.vids ?? []).map((id) => st.vertices.find((v) => v.id === id)?.harbor);
        return ks.length !== 2 || !ks[0] || ks[0] !== ks[1] || ks[0] !== b.userData.kind;
      }).length;
      return { piers, boats: isle.boats.length, corners: kinds, mismatched };
    });
    check(`${tag}: nine piers and nine boats, one per dock, each boat on its dock's two corners`, docks.piers === 9 && docks.boats === 9 && docks.corners === 18 && docks.mismatched === 0, docks);
    const tokenMin = touch ? 18 : 24;
    check(`${tag}: every number token is at least ${tokenMin} px across`, fit.token >= tokenMin, { smallest: fit.token });
    const p0 = await pose();
    check(`${tag}: the default view is at its fitted home, ${want === "diorama" ? `${90 - lean}° above the horizon` : `leaned ${lean}°`}`, (await atHome(p0)) && !p0.glide, brief(p0));
    await page.screenshot({ path: `test-results/board-look-play-${w}x${h}.png` });

    // A legal corner to start a drag on: the drag must orbit, not place.
    const mark = await page.evaluate(() => {
      const id = window.__emberisle.getState().highlights().vertices[0];
      return { id, ...window.__isle.screenOf(id) };
    });
    // A drag through the points, with the mouse or one finger (CDP touch events: Playwright's touchscreen only taps).
    const cdp = await page.context().newCDPSession(page);
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
    // Playwright's tap and dblclick are one protocol round trip per event, and on a slow runner (software GL) each takes
    // ~370 ms, longer than DOUBLE_TAP_MS (350): two taps that far apart are not a double tap. So both go out from one CDP
    // session in a single burst, and the gap between the two lifts is read in the page with performance.now(), the clock
    // the renderer's double-tap test uses, and must be inside the window.
    await page.evaluate(() => {
      window.__downs = [];
      window.__ups = [];
      const c = document.querySelector("canvas");
      c.addEventListener("pointerdown", () => window.__downs.push(performance.now()));
      c.addEventListener("pointerup", () => window.__ups.push(performance.now()));
    });
    const press = (n) =>
      touch
        ? [
            cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sea.x, y: sea.y }] }),
            cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }),
          ]
        : [
            cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: sea.x, y: sea.y, button: "left", clickCount: n }),
            cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: sea.x, y: sea.y, button: "left", clickCount: n }),
          ];
    await Promise.all([...press(1), ...press(2)]);
    await page.waitForFunction(() => window.__ups.length >= 2, null, { timeout: STEP_MS });
    const stamps = await page.evaluate(() => ({ downs: window.__downs, ups: window.__ups }));
    const gaps = { downMs: Math.round(stamps.downs[1] - stamps.downs[0]), upMs: Math.round(stamps.ups[1] - stamps.ups[0]) };
    check(`${tag}: the two ${touch ? "taps" : "clicks"} land inside the ${DOUBLE_TAP_MS} ms double-tap window`, stamps.downs.length === 2 && stamps.ups.length === 2 && gaps.downMs < DOUBLE_TAP_MS && gaps.upMs < DOUBLE_TAP_MS, gaps);
    const snapped = await settle();
    check(`${tag}: a double ${touch ? "tap" : "click"} on empty board returns to the fitted view and places nothing`, wasAway && (await atHome(snapped)) && snapped.seq === p0.seq, { before: brief(away), after: brief(snapped), seq: [p0.seq, snapped.seq], gaps });

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
        const tokens = isle.land.children.filter((o) => o.userData?.token != null);
        const token = Math.min(...tokens.map((t) => 0.68 * t.scale.x * isle.pxPerUnit(t.position.x, t.position.y, t.position.z)));
        return { phase: s.state.phase, armed: s.buildMode, hand: !!document.querySelector('[data-testid="hand-dock"]'), insets: isle.insets(), token: +token.toFixed(1) };
      });
      await drawn(page, 2);
      check(`${tag}: mid-game with the hand shown and an armed path every token is at least 24 px across`, mid.phase === "main" && mid.armed === "path" && mid.hand && mid.token >= 24, mid);
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
        window.__emberisle.setState({ chat: [1, 2, 3].map((i) => ({ id: 9000 + i, seat: "s1", player: "p1", name: "Tide", color: "#2d6ee8", text, at })) });
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
    if (!touch) {
      // The table menu's View: Overhead switches to the fitted 25° overhead view, which fits the same hole and orbits on a
      // drag; the choice is remembered across a reload; Diorama switches back.
      const choose = async (name) => {
        await page.getByRole("button", { name: "Table menu" }).click();
        await page.getByTestId("view-toggle").getByRole("button", { name, exact: true }).click();
        await page.keyboard.press("Escape");
      };
      await choose("Overhead");
      await page.waitForFunction(() => window.__isle.view === "overhead" && window.__isle.fit && !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
      await drawn(page, 2);
      const over = await holeFit();
      const overPose = await pose();
      const lean = await page.evaluate(async () => (await import("/src/lib/scene/mobile-fit.ts")).OVERHEAD_LEAN);
      const overHome = Math.abs(overPose.polar - lean) < 0.01 && Math.abs(overPose.azimuth) < 0.01 && Math.abs(overPose.zoom - 1) < 0.01;
      const saved = await page.evaluate(() => localStorage.getItem("emberisle-view"));
      check(`${tag}: View > Overhead shows the fitted 25° overhead view, every corner and dock in the hole, and is saved`, over.view === "overhead" && overHome && over.out.length === 0 && over.covered.length === 0 && saved === "overhead", { view: over.view, ...brief(overPose), out: over.out.slice(0, 6), covered: over.covered.slice(0, 6), saved });
      const overDrag = await drag([{ x: w / 2, y: h / 2 }, ...Array.from({ length: 6 }, (_, i) => ({ x: w / 2 + 20 * (i + 1), y: h / 2 + 5 * (i + 1) }))]);
      check(`${tag}: the overhead view still orbits on a drag`, Math.abs(overDrag.azimuth - overPose.azimuth) > 0.05 || Math.abs(overDrag.polar - overPose.polar) > 0.05, brief(overDrag));
      await page.reload();
      await page.getByRole("button", { name: "Four seats, one table" }).click();
      await page.waitForFunction(() => window.__isle?.lastState && window.__isle.fit && !window.__isle.refitDue, null, { timeout: STEP_MS });
      check(`${tag}: the overhead choice outlives a reload`, (await page.evaluate(() => window.__isle.view)) === "overhead");
      await choose("Diorama");
      await page.waitForFunction(() => window.__isle.view === "diorama" && !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
      check(`${tag}: View > Diorama switches back and is saved`, (await page.evaluate(() => localStorage.getItem("emberisle-view"))) === "diorama");
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
        const { fitDiorama } = await import("/src/lib/scene/mobile-fit.ts");
        const isle = window.__isle;
        const ins = isle.insets();
        const want = fitDiorama(innerWidth, innerHeight, ins);
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
        const fresh = Object.keys(want).every((k) => Math.abs(want[k] - isle.fit[k]) < 1e-6);
        return { seq: st.seq, ins: JSON.stringify(ins), pose: JSON.stringify(isle.fit), right: ins.right, fresh, railLeft, rightmost: Math.round(rightmost), covered, glide: isle.glide !== null };
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
        token: +Math.min(...isle.land.children.filter((o) => o.userData?.token != null).map((t) => 0.68 * t.scale.x * isle.pxPerUnit(t.position.x, t.position.y, t.position.z))).toFixed(1),
        apart: +apart.toFixed(1),
        view: isle.view,
        widthOverHoleH: +(isleW / (innerHeight - ins.top - ins.bottom)).toFixed(2),
        covered,
      };
    });
    check(`${tag}: main phase with the hand shown, the HUD a left column`, land.phase === "main" && land.hand && land.column.right < w / 2 && land.insets.left > land.column.right, land);
    check(`${tag}: the island is larger than before #422 (${before} px²)`, land.area > before, { area: land.area, isle: land.isle, token: land.token });
    check(`${tag}: the island is at least 60 % as wide as the hole is tall, every corner clear of the HUD`, land.widthOverHoleH >= 0.6 && land.covered.length === 0, { widthOverHoleH: land.widthOverHoleH, holeH: land.holeH, covered: land.covered.slice(0, 6) });
    check(`${tag}: overhead by default (under 900 px wide) and adjacent corners at least 24 px apart`, land.view === "overhead" && land.apart >= 24, { view: land.view, apart: land.apart });
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
    if (w === 844) {
      // #597: the diorama by choice on the sideways phone. Adjacent corners stay at least 18 px apart. The far (north) coast
      // is smallest on screen: a path on the northmost coast edge and an outpost on its corner, measured from their own
      // meshes' boxes on screen, and the touch pick reach there, against the 24 px touch slop. Last on the page, so nothing
      // above sees them. The outpost's size is reported, not judged: the pick reach is its target.
      await page.evaluate(() => window.__emberisle.getState().setViewChoice("diorama"));
      await page.waitForFunction(() => window.__isle.view === "diorama" && !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
      await drawn(page, 2);
      const apart = await page.evaluate(() => {
        const st = window.__emberisle.getState().state;
        const at = Object.fromEntries(st.vertices.map((v) => [v.id, window.__isle.screenOf(v.id)]));
        return +Math.min(...st.edges.map((e) => Math.hypot(at[e.va].x - at[e.vb].x, at[e.va].y - at[e.vb].y))).toFixed(1);
      });
      check(`${tag}: the diorama by choice keeps adjacent corners at least 18 px apart`, apart >= 18, { apart });
      const far = await page.evaluate(async () => {
        const isle = window.__isle;
        const g = window.__emberisle;
        const st = structuredClone(g.getState().state);
        const coast = new Set(isle.coastOrder);
        const edge = st.edges.filter((e) => coast.has(e.va) && coast.has(e.vb)).sort((a, b) => {
          const z = (e) => st.vertices.find((v) => v.id === e.va).z + st.vertices.find((v) => v.id === e.vb).z;
          return z(a) - z(b);
        })[0];
        edge.path = st.players[0].id;
        const corner = st.vertices.find((v) => v.id === edge.va);
        corner.building = { playerId: st.players[0].id, kind: "outpost" };
        st.seq++;
        g.setState({ state: st });
        const t0 = performance.now();
        await new Promise((res) => { const p = () => (isle.lastSeq === st.seq || performance.now() - t0 > 8000 ? res() : requestAnimationFrame(p)); p(); });
        await new Promise((r) => setTimeout(r, 700));
        const size = (key) => {
          const o = isle.pieces.children.find((c) => c.userData.key === key);
          const box = new isle.ortho.position.constructor();
          o.updateMatrixWorld(true);
          const pts = [];
          o.traverse((m) => {
            if (!m.geometry) return;
            m.geometry.computeBoundingBox();
            const b = m.geometry.boundingBox;
            for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
              box.set(x, y, z).applyMatrix4(m.matrixWorld);
              pts.push(isle.screenAt(box.x, box.y, box.z));
            }
          });
          const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
          const h = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
          return { w: +w.toFixed(1), h: +h.toFixed(1) };
        };
        const { pickReach } = await import("/src/lib/scene/mobile-fit.ts");
        const depth = new isle.ortho.position.constructor(corner.x, 0.35, corner.z).sub(isle.persp.position).dot(isle.persp.getWorldDirection(new isle.ortho.position.constructor()));
        const reachPx = (pickReach(depth, isle.lens.focal, true) * isle.lens.focal) / depth;
        return { edge: edge.id, path: size(`e:${edge.id}`), outpost: size(`v:${corner.id}`), reachPx: +(2 * reachPx).toFixed(1), seq: st.seq };
      });
      const across = (b) => Math.max(b.w, b.h);
      check(`${tag}: a path on the far coast spans at least the 24 px touch slop on screen, and the touch pick at its corner reaches 24 px across`, across(far.path) >= 24 && far.reachPx >= 24, far);
    }

    await page.context().close();
  }
  // #599, docs/design/hex-jelly-prompt.md: the jelly board. On the play board (diorama 1280x720, crystal sea), once the scenes
  // are built: all six kinds are there; every hex's ground is exactly at topOf on its pad (within 0.3 of the centre, under the
  // token) and at its corners and edge middles where the pieces stand, with a landform elsewhere (a height spread over 0.02);
  // the island's scenes draw in at most 60 calls and hold at most 600k triangles (#624: one scene per kind, batched), the whole
  // island (scenes, tokens, docks, pieces) at most 620k; nothing standing on a hex (fliers aside) comes within 0.31 of its
  // centre (docs/design/tokens.md: the 0.26 token and 0.05 of ground). Then test-results/terrain-1280.png and, overhead on a
  // 390x844 phone, terrain-390.png.
  {
    const page = await open(1280, 720, false, "crystal", null, "full");
    await page.getByRole("button", { name: "Four seats, one table" }).click();
    await page.waitForFunction(() => window.__emberisle?.water?.path === "crystal" && window.__isle.lastState && window.__emberisle.getState().state && window.__isle.landReady && !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
    await drawn(page, 3, 30_000);
    const t = await page.evaluate(async () => {
      const isle = window.__isle;
      const jelly = isle.jellyBoard;
      const { topOf } = await import("/src/lib/scene/isle-renderer.ts");
      const { CORNER_R } = await import("/src/lib/scene/jelly-dims.ts");
      const st = isle.lastState;
      const INR = (CORNER_R * Math.sqrt(3)) / 2;
      const kinds = {};
      for (const h of st.hexes) {
        const top = topOf(h.terrain);
        const k = (kinds[h.terrain] ??= { hexes: 0, pad: 0, rim: 0, spread: Infinity });
        k.hexes++;
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < 400; i++) {
          const a = i * 2.399963, r = Math.sqrt((i + 0.5) / 400);
          const [x, z] = [Math.cos(a) * r * INR, Math.sin(a) * r * INR];
          const y = jelly.groundAt(h.id, x, z);
          // 2026-10-16 (#624): the pad is 0.3 round the centre (was 0.4 on the sculpted tiles): the jelly pad is 0.33, and
          // the 0.26 token sits on it (tokens.md).
          if (Math.hypot(x, z) < 0.3) k.pad = Math.max(k.pad, Math.abs(y - top));
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
        }
        k.spread = Math.min(k.spread, hi - lo);
        // The corners (where an outpost stands) and the edge middles (a path), just inside the block's rounded rim.
        for (let c = 0; c < 6; c++) {
          const ac = ((30 + 60 * c) * Math.PI) / 180, ae = (60 * c * Math.PI) / 180;
          for (const [x, z] of [[Math.cos(ac) * (CORNER_R - 0.1), Math.sin(ac) * (CORNER_R - 0.1)], [Math.cos(ae) * (INR - 0.1), Math.sin(ae) * (INR - 0.1)]])
            k.rim = Math.max(k.rim, Math.abs(jelly.groundAt(h.id, x, z) - top));
        }
      }
      // Triangles of everything else on the island (tokens, docks, boats, pieces), instanced meshes counted per instance.
      let rest = 0;
      for (const grp of [isle.land, isle.living, isle.pieces]) grp.traverseVisible((o) => {
        if (!o.isMesh || o.isBatchedMesh || o.parent === jelly.group || !o.material.visible) return;
        const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
        rest += o.isInstancedMesh ? n * o.count : n;
      });
      // The side strata: each kind's block side has its strata program (jelly-strata-<kind>) among the bakes.
      const strata = [...new Set(jelly.bakes.map((m) => m.material.customProgramCacheKey()).filter((k) => k.startsWith("jelly-strata-")).map((k) => k.split("|")[0].slice(13)))].sort();
      return { kinds, stats: window.__terrain, rest, clearance: jelly.clearance(0.6), strata };
    });
    const kinds = Object.keys(t.kinds).sort();
    check("terrain: all six kinds are on the board, the full scenes", kinds.join() === "clay,grain,ore,timber,waste,wool" && t.stats.kinds === 6 && !t.stats.lite, { kinds, lite: t.stats.lite });
    for (const k of kinds) {
      const s = t.kinds[k];
      // A landform: more than 0.02 of spread, and under 0.8 (the tallest peak stands well within the block's own scale).
      check(`terrain ${k}: flat at topOf on the pad and at the corners and edges; a landform elsewhere (spread 0.02 to 0.8)`, s.pad < 1e-4 && s.rim < 1e-4 && s.spread > 0.02 && s.spread < 0.8, s);
    }
    // 2026-10-16 (#624): from 40 calls and 220k triangles for the sculpted terrain. The owner set no limit on the hexes'
    // detail; the orchestrator agreed up to 80 calls and 600k triangles. 51 calls and about 330k measured; 60 holds it close.
    check("terrain: every kind's block side shows its strata", t.strata.join() === kinds.join(), t.strata);
    // "No two tiles alike" is gone: one scene per kind, shared by its hexes, is the owner's choice (2026-10-16).
    check("terrain: the scenes draw in at most 60 calls", t.stats.drawCalls <= 60, t.stats);
    check("terrain: the scenes hold at most 600k triangles, the whole island at most 620k", t.stats.triangles <= 600000 && t.stats.triangles + t.rest <= 620000, { scenes: t.stats.triangles, rest: t.rest });
    const near = Object.entries(t.clearance).sort((a, b) => a[1].min - b[1].min);
    check("terrain: nothing standing on a hex comes within 0.31 of its centre", near.length === 6 && near[0][1].min >= 0.31, Object.fromEntries(near.map(([k, v]) => [k, `${v.min.toFixed(3)} (${v.what})`])));
    await page.screenshot({ path: "test-results/terrain-1280.png" });
    await page.context().close();
    const phone = await open(390, 844, true, "crystal", null, "full");
    await phone.getByRole("button", { name: "Four seats, one table" }).click();
    await phone.waitForFunction(() => window.__emberisle?.water?.path === "crystal" && window.__isle.lastState && window.__emberisle.getState().state && window.__isle.landReady && !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
    await drawn(phone, 3, 30_000);
    check("terrain: the 390x844 phone is overhead", (await phone.evaluate(() => window.__isle.view)) === "overhead");
    await phone.screenshot({ path: "test-results/terrain-390.png" });
    await phone.context().close();
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
