// #627: skip board refit and view switch while a keyboard shrinks the canvas.
// Phone context, input focused: canvas height shrinks, keyboard closes, phone rotates while typing.
// Coarse tablet context: diorama view does not flip to overhead when keyboard shrinks hole below DIORAMA_MIN_HOLE.
// Asserts frustum aspect matches canvas aspect at each step (no squashing), world-per-pixel scale is
// preserved, top-anchored crop keeps board top and seat strip inside the hole, and the keyboard crop clears on rotation or actual viewport restoration.
// Run: npm run keyboard-fit-prove
import { existsSync } from "node:fs";
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
