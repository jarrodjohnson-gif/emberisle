// #627: skip board refit and view switch while a keyboard shrinks the canvas.
// Phone context, input focused: canvas height shrinks, keyboard closes, phone rotates while typing.
// Coarse tablet context: diorama view does not flip to overhead when keyboard shrinks hole below DIORAMA_MIN_HOLE.
// Asserts frustum aspect matches canvas aspect at each step (no squashing), world-per-pixel scale is
// preserved, top-anchored crop keeps board top and seat strip inside the hole, and the keyboard crop clears on rotation or actual viewport restoration.
// Run: npm run keyboard-fit-prove
import { existsSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8145;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const failures = [];
let checks = 0;
const check = (ok, what, data) => {
  checks++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what} ${data !== undefined ? JSON.stringify(data) : ""}`);
  if (!ok) failures.push(what);
};
const frames = (page, n) => page.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); }, n);


const camera = (page) => page.evaluate(() => {
  const i = window.__isle, f = i.fit;
  const home = f && !("focal" in f) ? { x: f.x, z: f.z } : { x: 0, z: 0 };
  return { x: i.orbit.target.x, z: i.orbit.target.z, dx: i.orbit.target.x - home.x, dz: i.orbit.target.z - home.z,
    sampleAt: performance.now(),
    aspect: i.frustumAspect(), scale: i.pxPerUnit(0, 0, 0), shrunk: i.isKeyboardShrunk };
});
const samePan = (a, b) => Math.hypot(a.dx - b.dx, a.dz - b.dz) < 1e-6;
const fields = (page) => page.evaluate(() => {
  const shell = document.querySelector("canvas").parentElement;
  for (const [id, tag] of [["test-keyboard-input", "input"], ["test-keyboard-next", "textarea"]]) {
    const node = document.createElement(tag);
    node.id = id;
    Object.assign(node.style, { position: "fixed", bottom: "0", left: id.endsWith("next") ? "180px" : "0", width: "140px", height: "28px", zIndex: "100" });
    shell.appendChild(node);
  }
  window.__keyboardFocusEvents = [];
  shell.addEventListener("focusout", (e) => window.__keyboardFocusEvents.push([e.target.id, e.relatedTarget?.id ?? null]));
});
const pan = async (page, ctx, label, distance = 20) => {
  await page.waitForFunction(() => !window.__isle.glide && !window.__isle.refitDue, null, { timeout: STEP_MS });
  const before = await camera(page);
  const point = await page.evaluate(() => {
    const c = document.querySelector("canvas"), hole = window.__isle.insets();
    for (const fraction of [0.5, 0.35, 0.65]) {
      const x = c.clientWidth * fraction, y = (hole.top + c.clientHeight - hole.bottom) / 2 - 30;
      if (document.elementFromPoint(x, y) === c && document.elementFromPoint(x, y + 60) === c) return { x, y };
    }
    throw new Error("no clear canvas pair for the real two-finger pan");
  });
  const cdp = await ctx.newCDPSession(page);
  const points = (dx) => [{ x: point.x + dx, y: point.y, id: 1 }, { x: point.x + dx, y: point.y + 60, id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(0) });
  for (const dx of [distance / 4, distance / 2, distance * 3 / 4, distance]) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(dx) });
    await frames(page, 1);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await frames(page, 6);
  const after = await camera(page);
  check(Math.hypot(after.x - before.x, after.z - before.z) > 0.005, `${label}: real two-finger gesture pans the board`, { before, after });
  return after;
};


// Exercise the same real touch double tap that invokes goHome, at an unobstructed nonlegal point.
const croppedHome = async (page, ctx, label) => {
  // A preceding touch pan may blur the field; keep setup outside the no-focus settle window.
  await page.locator("#test-keyboard-input").focus();
  const before = await camera(page);
  const point = await page.evaluate(() => {
    const i = window.__isle, c = document.querySelector("canvas");
    for (let y = 80; y < c.clientHeight - 40; y += 30) for (let x = 30; x < c.clientWidth - 30; x += 30) {
      if (document.elementFromPoint(x, y) !== c) continue;
      const e = new PointerEvent("pointerup", { clientX: x, clientY: y, pointerType: "touch" });
      if (i.hitsAt(e, true).some((h) => i.legalIds.has(h.id))) continue;
      if (i.dockPositions.some((d) => Math.abs(x - d.x) <= 22 && Math.abs(y - d.y) <= 22)) continue;
      return { x, y };
    }
    throw new Error("no clear nonlegal point for double tap");
  });
  const cdp = await ctx.newCDPSession(page);
  await page.evaluate(() => { window.__keyboardHomeCalls = 0; const i = window.__isle, home = i.goHome.bind(i); i.goHome = () => { window.__keyboardHomeCalls++; home(); }; });
  await page.evaluate(() => { window.__keyboardHomeBlurAt = null; document.activeElement?.addEventListener("blur", () => { window.__keyboardHomeBlurAt = performance.now(); }, { once: true }); });
  await page.evaluate(() => document.activeElement?.blur());
  for (let tap = 0; tap < 2; tap++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...point, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  await frames(page, 6);
  const after = await camera(page);
  const blurAt = await page.evaluate(() => window.__keyboardHomeBlurAt);
  const sampleDelay = after.sampleAt - blurAt;
  console.log(`${label}: cropped-home timing ${JSON.stringify({ blurAt, sampledAt: after.sampleAt, sampleDelay, settleMs: 600 })}`);
  if (blurAt === null || sampleDelay >= 600) throw new Error(`${label}: timing inconclusive; cropped-home sample arrived outside the unchanged 600ms settle window (${sampleDelay}ms)`);
  check(await page.evaluate(() => window.__keyboardHomeCalls > 0), `${label}: real empty-board double tap invokes goHome`);
  check(after.shrunk && samePan(after, before) && Math.abs(after.aspect - before.aspect) < 1e-6 && Math.abs(after.scale - before.scale) < 0.05 && !await page.evaluate(() => Boolean(window.__isle.glide)), `${label}: home while cropped keeps pan and projection without starting a glide`, { before, after });
};

let code = 0;
try {
  // --- Section 1: Phone (390x844) ---
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => localStorage.setItem("emberisle-water", "simple"));
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });
  await fields(page);
  await page.locator("#test-keyboard-input").focus();
  await page.setViewportSize({ width: 390, height: 500 });
  await frames(page, 6);
  check(!await page.evaluate(() => window.__isle.isKeyboardShrunk), "a focused title field cannot capture a play-camera keyboard baseline");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.activeElement?.blur(); for (const id of ["test-keyboard-input", "test-keyboard-next"]) document.getElementById(id)?.remove(); });
  await page.getByRole("button", { name: "Four seats, one table" }).click();
  await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState, null, { timeout: STEP_MS });
  await page.evaluate(() => { const g = window.__emberisle; while (g.getState().state.phase === "rollOff") g.getState().dispatch({ type: "roll" }); });
  await page.waitForFunction(() => !document.querySelector('[data-testid="banner"]'), null, { timeout: STEP_MS });
  await frames(page, 6);

  const phonePan = await pan(page, ctx, "phone");

  // 1. Baseline at 390x844 upright phone: overhead view.
  const baseline = await page.evaluate(() => {
    const i = window.__isle;
    const c = document.querySelector("canvas");
    return {
      w: c.clientWidth,
      h: c.clientHeight,
      aspect: i.frustumAspect(),
      view: i.view,
      pxScale: i.pxPerUnit(0, 0, 0),
      topScreen: i.screenAt(0, 0, -5),
      seatStrip: document.querySelector('[data-testid="seat-strip"]')?.getBoundingClientRect().toJSON(),
      isShrunk: i.isKeyboardShrunk,
    };
  });
  check(baseline.view === "overhead", "baseline view is overhead", baseline.view);
  check(Math.abs(baseline.aspect - 390 / 844) < 0.01, "baseline frustum aspect matches canvas aspect", { got: baseline.aspect, want: 390 / 844 });
  check(!baseline.isShrunk, "not keyboard-shrunk at baseline");

  // 2. Real in-shell DOM fields exercise the renderer's bubbling focusout listener.
  await fields(page);
  await page.locator("#test-keyboard-input").focus();
  const hasFocus = await page.evaluate(() => document.activeElement?.id === "test-keyboard-input");
  check(hasFocus, "test input is focused");

  // 3. On-screen keyboard opens: canvas height shrinks from 844 to 500 (390x500).
  await page.setViewportSize({ width: 390, height: 500 });
  await frames(page, 6);

  const shrunk = await page.evaluate(() => {
    const i = window.__isle;
    const c = document.querySelector("canvas");
    return {
      w: c.clientWidth,
      h: c.clientHeight,
      aspect: i.frustumAspect(),
      view: i.view,
      pxScale: i.pxPerUnit(0, 0, 0),
      topScreen: i.screenAt(0, 0, -5),
      seatStrip: document.querySelector('[data-testid="seat-strip"]')?.getBoundingClientRect().toJSON(),
      isShrunk: i.isKeyboardShrunk,
    };
  });
  check(shrunk.isShrunk, "keyboardShrunk is true after height shrink with focused input");
  check(shrunk.view === "overhead", "view remains overhead while typing (no view switch)");
  check(Math.abs(shrunk.aspect - 390 / 500) < 0.01, "shrunk frustum aspect matches canvas aspect 390/500 (no squashing)", { got: shrunk.aspect, want: 390 / 500 });
  check(Math.abs(shrunk.pxScale - baseline.pxScale) < 0.05, "world-per-pixel scale preserved while typing", { got: shrunk.pxScale, was: baseline.pxScale });
  check(Math.abs(shrunk.topScreen.y - baseline.topScreen.y) < 1.0, "top-anchored crop keeps board top at identical screen Y", { got: shrunk.topScreen.y, was: baseline.topScreen.y });
  check(shrunk.seatStrip.top >= 0 && shrunk.seatStrip.bottom <= 500, "seat strip remains inside visible viewport while keyboard is up", shrunk.seatStrip);

  check(samePan(await camera(page), phonePan), "phone pan survives the keyboard crop", await camera(page));
  await page.setViewportSize({ width: 390, height: 640 });
  await frames(page, 6);
  const partial = await camera(page);
  check(partial.shrunk && Math.abs(partial.aspect - 390 / 640) < 0.01 && Math.abs(partial.scale - baseline.pxScale) < 0.05 && samePan(partial, phonePan), "partial height growth retains the crop, scale and pan", partial);
  await page.locator("#test-keyboard-next").focus();
  await frames(page, 6);
  const transferred = await camera(page);
  check(transferred.shrunk && samePan(transferred, phonePan) && Math.abs(transferred.scale - partial.scale) < 0.05, "input-to-textarea focus transfer keeps the keyboard crop and pan", transferred);
  check(await page.evaluate(() => window.__keyboardFocusEvents.some(([from, to]) => from === "test-keyboard-input" && to === "test-keyboard-next")), "focus transfer traversed the actual in-shell focusout listener");

  // 4. Keyboard closes: canvas height restored from 500 back to 844.
  await page.setViewportSize({ width: 390, height: 844 });
  await frames(page, 6);

  const restored = await page.evaluate(() => {
    const i = window.__isle;
    return {
      aspect: i.frustumAspect(),
      view: i.view,
      isShrunk: i.isKeyboardShrunk,
      pxScale: i.pxPerUnit(0, 0, 0),
    };
  });
  check(!restored.isShrunk, "keyboardShrunk cleared when height restored");
  check(Math.abs(restored.aspect - 390 / 844) < 0.01, "restored frustum aspect matches canvas aspect 390/844", { got: restored.aspect, want: 390 / 844 });
  check(Math.abs(restored.pxScale - baseline.pxScale) < 0.05, "world-per-pixel scale matches baseline", { got: restored.pxScale, was: baseline.pxScale });

  check(samePan(await camera(page), phonePan), "full keyboard close preserves the original pan offset", await camera(page));

  // A second cycle exercises real blur before the layout viewport has finished growing.
  await page.locator("#test-keyboard-input").focus();
  await page.setViewportSize({ width: 390, height: 350 });
  await frames(page, 6);
  await page.evaluate(() => document.activeElement.blur());
  await frames(page, 6);
  const blurred = await camera(page);
  check(blurred.shrunk && samePan(blurred, phonePan) && Math.abs(blurred.scale - baseline.pxScale) < 0.05, "blur retains crop, scale and pan until the viewport restores", blurred);
  await page.setViewportSize({ width: 390, height: 420 });
  await frames(page, 6);
  check((await camera(page)).shrunk && samePan(await camera(page), phonePan) && Math.abs((await camera(page)).scale - baseline.pxScale) < 0.05, "partial keyboard closing across the aspect threshold keeps crop, scale and pan", await camera(page));

  await page.setViewportSize({ width: 390, height: 844 });
  await frames(page, 6);
  const blurRestored = await camera(page);
  check(!blurRestored.shrunk && samePan(blurRestored, phonePan) && Math.abs(blurRestored.aspect - 390 / 844) < 0.01, "blur followed by full height restoration keeps pan and projection", blurRestored);


  // 5. Shrink again with input focused, then rotate phone while typing (390x500 -> 844x390).
  await page.locator("#test-keyboard-input").focus();
  await page.setViewportSize({ width: 390, height: 500 });
  await frames(page, 6);
  await page.setViewportSize({ width: 844, height: 390 });
  await frames(page, 6);

  const rotated = await page.evaluate(() => {
    const i = window.__isle;
    const c = document.querySelector("canvas");
    return {
      w: c.clientWidth,
      h: c.clientHeight,
      aspect: i.frustumAspect(),
      view: i.view,
      isShrunk: i.isKeyboardShrunk,
    };
  });
  check(!rotated.isShrunk, "keyboardShrunk flag cleared when phone rotated while typing (w !== prevW)");
  check(rotated.view === "overhead", "view is overhead on landscape phone", rotated.view);
  check(Math.abs(rotated.aspect - 844 / 390) < 0.01, "landscape frustum aspect matches canvas aspect 844/390", { got: rotated.aspect, want: 844 / 390 });

  // 6. Blur input and rotate back upright (844x390 -> 390x844).
  await page.evaluate(() => document.activeElement?.blur());
  await frames(page, 3);
  await page.setViewportSize({ width: 390, height: 844 });
  await frames(page, 6);

  const backUpright = await page.evaluate(() => {
    const i = window.__isle;
    return {
      aspect: i.frustumAspect(),
      view: i.view,
      isShrunk: i.isKeyboardShrunk,
    };
  });
  check(!backUpright.isShrunk, "keyboardShrunk is false back upright");
  check(backUpright.view === "overhead", "view is overhead upright", backUpright.view);
  check(Math.abs(backUpright.aspect - 390 / 844) < 0.01, "upright frustum aspect matches canvas aspect", { got: backUpright.aspect, want: 390 / 844 });

  // A pending blur timer must neither end a field transfer nor pre-empt continuing resize frames.
  await page.locator("#test-keyboard-input").focus();
  await page.setViewportSize({ width: 390, height: 500 });
  await frames(page, 6);
  await page.evaluate(() => document.activeElement.blur());
  await page.locator("#test-keyboard-next").focus();
  await page.waitForTimeout(900);
  check((await camera(page)).shrunk, "a new focused field keeps the crop past the pending blur settle timer");
  await page.evaluate(() => document.activeElement.blur());
  for (const height of [580, 680, 780]) {
    await page.waitForTimeout(250);
    await page.setViewportSize({ width: 390, height });
    await frames(page, 2);
    check((await camera(page)).shrunk, `ongoing blurred close at ${height}px restarts the quiet settle timer`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await frames(page, 6);

  // A blurred keyboard close can settle a few pixels below its saved height.
  const settlePan = await pan(page, ctx, "phone before short restoration");
  await page.locator("#test-keyboard-input").focus();
  await page.setViewportSize({ width: 390, height: 500 });
  await frames(page, 6);
  await page.evaluate(() => document.activeElement.blur());
  await page.setViewportSize({ width: 390, height: 840 });
  await page.waitForTimeout(900);
  const settled = await camera(page);
  const settledFitTop = await page.evaluate(() => window.__isle.fit.top);
  const settledProjection = await page.evaluate(() => {
    const i = window.__isle;
    return { top: i.ortho.top, bottom: i.ortho.bottom, fitTop: i.fit.top, fitBottom: i.fit.bottom };
  });
  check(Math.abs(settledProjection.top - settledProjection.fitTop) < 1e-6 && Math.abs(settledProjection.bottom - settledProjection.fitBottom) < 1e-6, "quiet short restoration immediately restores the full fitted frustum", settledProjection);
  check(!settled.shrunk && samePan(settled, settlePan) && Math.abs(settled.aspect - 390 / 840) < 0.01, "blurred short restoration settles to a full projection with pan preserved", settled);
  await page.setViewportSize({ width: 390, height: 820 });
  await frames(page, 6);
  const laterFit = await camera(page);
  check(!laterFit.shrunk && samePan(laterFit, settlePan) && Math.abs(laterFit.aspect - 390 / 820) < 0.01 && await page.evaluate((top) => { const i = window.__isle; return Math.abs(i.fit.top - top) > 0.05 && Math.abs(i.ortho.top - i.fit.top) < 1e-6 && Math.abs(i.ortho.bottom - i.fit.bottom) < 1e-6; }, settledFitTop), "later no-focus resize refits normally after short restoration", { settled, laterFit });
  await page.setViewportSize({ width: 390, height: 844 });
  await frames(page, 6);
  await page.locator("#test-keyboard-input").focus();
  await page.setViewportSize({ width: 390, height: 500 });
  await frames(page, 6);
  await croppedHome(page, ctx, "phone overhead");
  await page.setViewportSize({ width: 390, height: 844 });
  await frames(page, 6);
  check(! (await camera(page)).shrunk && samePan(await camera(page), settlePan), "phone height restoration after cropped home preserves pan");

  await ctx.close();

  // --- Section 2: Tablet (1024x768, coarse pointer, diorama view) ---
  const tabCtx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  await tabCtx.addInitScript(() => localStorage.setItem("emberisle-water", "simple"));
  const tab = await tabCtx.newPage();
  tab.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  tab.on("pageerror", (e) => errors.push(String(e)));
  await tab.goto(`http://127.0.0.1:${PORT}/`);
  await tab.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });
  await tab.getByRole("button", { name: "Four seats, one table" }).click();
  await tab.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState, null, { timeout: STEP_MS });
  await tab.evaluate(() => { const g = window.__emberisle; while (g.getState().state.phase === "rollOff") g.getState().dispatch({ type: "roll" }); });
  await tab.waitForFunction(() => !document.querySelector('[data-testid="banner"]'), null, { timeout: STEP_MS });
  await frames(tab, 6);

  const tabletPan = await pan(tab, tabCtx, "tablet", 400);
  const tabBase = await tab.evaluate(() => ({
    view: window.__isle.view,
    aspect: window.__isle.frustumAspect(),
  }));
  check(tabBase.view === "diorama", "tablet 1024x768 starts in diorama view", tabBase.view);

  // Focus input and shrink to 1024x420 (hole falls under DIORAMA_MIN_HOLE 420).
  await fields(tab);
  await tab.locator("#test-keyboard-input").focus();
  await tab.setViewportSize({ width: 1024, height: 420 });
  await frames(tab, 6);

  const tabShrunk = await tab.evaluate(() => ({
    view: window.__isle.view,
    isShrunk: window.__isle.isKeyboardShrunk,
    aspect: window.__isle.frustumAspect(),
  }));
  check(tabShrunk.isShrunk, "tablet is keyboardShrunk");
  check(tabShrunk.view === "diorama", "tablet diorama view preserved while typing (does not flip to overhead)", tabShrunk.view);
  check(Math.abs(tabShrunk.aspect - 1024 / 420) < 0.01, "tablet frustum aspect matches canvas aspect 1024/420", { got: tabShrunk.aspect, want: 1024 / 420 });

  check(samePan(await camera(tab), tabletPan), "tablet pan survives the diorama crop", await camera(tab));
  await tab.locator("#test-keyboard-next").focus();
  await frames(tab, 6);
  check((await camera(tab)).shrunk && samePan(await camera(tab), tabletPan), "tablet input transfer preserves its crop and pan", await camera(tab));

  // Close keyboard on tablet.
  await tab.setViewportSize({ width: 1024, height: 768 });
  await frames(tab, 6);
  const tabRestored = await tab.evaluate(() => ({
    view: window.__isle.view,
    isShrunk: window.__isle.isKeyboardShrunk,
    aspect: window.__isle.frustumAspect(),
  }));
  check(!tabRestored.isShrunk, "tablet keyboardShrunk cleared");
  check(tabRestored.view === "diorama", "tablet stays in diorama view");

  check(samePan(await camera(tab), tabletPan), "tablet keyboard close preserves the pan offset", await camera(tab));
  check(Math.abs((await camera(tab)).aspect - 1024 / 768) < 0.01, "tablet focused close restores the full projection", await camera(tab));
  await tab.locator("#test-keyboard-input").focus();
  await tab.setViewportSize({ width: 1024, height: 420 });
  await frames(tab, 6);
  await tab.evaluate(() => document.activeElement.blur());
  await frames(tab, 6);
  check((await camera(tab)).shrunk && samePan(await camera(tab), tabletPan) && Math.abs((await camera(tab)).scale - tabletPan.scale) < 0.05, "tablet blur retains crop, scale and pan until full restoration", await camera(tab));

  await tab.setViewportSize({ width: 1024, height: 768 });
  await frames(tab, 6);
  check(samePan(await camera(tab), tabletPan), "tablet blur cycle keeps its pan after full restoration", await camera(tab));

  // A shorter layout viewport must not amplify a real gesture while the keyboard stays up.
  // Match pan-prove's 120px gesture so the initial touch dead zone is a small part of the measurement.
  await tab.locator("#test-keyboard-input").focus();
  await tab.setViewportSize({ width: 1024, height: 420 });
  await frames(tab, 6);
  const dragBefore = await tab.evaluate(() => window.__isle.screenAt(0, 0, 0));
  await pan(tab, tabCtx, "tablet while typing", -120);
  const dragAfter = await tab.evaluate(() => window.__isle.screenAt(0, 0, 0));
  const dragRatio = (dragAfter.x - dragBefore.x) / -120;
  check(dragRatio > 0.85 && dragRatio < 1.15, "tablet keyboard crop keeps touch movement about 1:1", { dragRatio });

  await croppedHome(tab, tabCtx, "tablet diorama");

  // F1: grow the real canvas layout and blur in one task, before delivering the late resize event.
  await tab.locator("#test-keyboard-input").focus();
  await tab.setViewportSize({ width: 1024, height: 768 });
  await frames(tab, 6);
  await tab.setViewportSize({ width: 1024, height: 420 });
  await frames(tab, 6);
  const orderingPan = await camera(tab);
  await tab.evaluate(() => {
    const i = window.__isle, c = document.querySelector("canvas");
    c.style.height = "768px";
    window.__keyboardCloseOrder = { layoutH: c.clientHeight, savedH: i.sizeH, focused: document.activeElement?.id };
    document.activeElement?.blur();
    window.__keyboardCloseOrder.afterBlur = { aspect: i.frustumAspect(), savedH: i.sizeH, shrunk: i.isKeyboardShrunk };
    window.dispatchEvent(new Event("resize"));
  });
  await tab.setViewportSize({ width: 1024, height: 768 });
  await tab.evaluate(() => { document.querySelector("canvas").style.height = ""; });
  await frames(tab, 30);
  const closeOrder = await tab.evaluate(() => window.__keyboardCloseOrder);
  const orderedClose = await camera(tab);
  mkdirSync("test-results", { recursive: true });
  await tab.screenshot({ path: "test-results/keyboard-fit-tablet-focusout-before-resize.png" });
  check(closeOrder?.layoutH === 768 && closeOrder.savedH === 420 && closeOrder.focused === "test-keyboard-input", "tablet close exercises layout growth then focusout before renderer resize", closeOrder);
  check(!orderedClose.shrunk && Math.abs(orderedClose.aspect - 1024 / 768) < 0.01 && samePan(orderedClose, orderingPan), "tablet focusout before resize restores full projection and pan after 30 frames", { closeOrder, orderingPan, orderedClose });

  await tabCtx.close();

  if (errors.length) throw new Error(`console errors:\n${errors.join("\n")}`);
  if (failures.length) throw new Error(`${failures.length} check(s) failed`);
  console.log("keyboard-fit-prove: ok");
  console.log(`keyboard-fit-prove: ${checks} checks passed, real touch pan and in-shell focus events`);
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
