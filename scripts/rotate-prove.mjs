// #521: a phone that rotates (390x844 <-> 844x390, 360x640 <-> 640x360) or a window that resizes refits the island to the
// hole the HUD leaves now. Within 3 animation frames of the change `__isle.fit` is the fit that hole asks for (not the old
// one, not a stale aspect); once the glide ends the camera's frustum is that fit, the drawing buffer is the canvas's size
// (no stretch), and every corner of the island is inside the hole. The oracle is a fresh load: the island's settled
// bounding box after each rotation of one page is within 10 % of the box a fresh page at that viewport draws. Zero console errors. Run: npm run rotate-prove
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8121;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const failures = [];
const check = (ok, what, data) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what} ${JSON.stringify(data)}`);
  if (!ok) failures.push(what);
};

// The fit the hole asks for right now, whether `__isle.fit` is it, and (once settled) the camera and corners against it.
const look = (page) =>
  page.evaluate(async () => {
    const { fitOrtho, OVERHEAD_LEAN } = await import("/src/lib/scene/mobile-fit.ts");
    const isle = window.__isle;
    const c = document.querySelector("canvas");
    const hole = isle.insets();
    const want = fitOrtho(c.clientWidth, c.clientHeight, hole, OVERHEAD_LEAN);
    const keys = ["left", "right", "top", "bottom", "x", "z"];
    const fresh = isle.fit !== null && keys.every((k) => Math.abs(want[k] - isle.fit[k]) < 1e-6);
    const o = isle.ortho;
    const onCamera = keys.slice(0, 4).every((k) => Math.abs(o[k] - want[k]) < 1e-3);
    const gl = isle.renderer.domElement;
    const stretched = gl.width !== Math.round(c.clientWidth * isle.renderer.getPixelRatio()) || gl.height !== Math.round(c.clientHeight * isle.renderer.getPixelRatio());
    const outside = [];
    for (const v of window.__emberisle.getState().state.vertices) {
      const p = isle.screenOf(v.id);
      if (p.x < hole.left - 1 || p.x > c.clientWidth - hole.right + 1 || p.y < hole.top - 1 || p.y > c.clientHeight - hole.bottom + 1) outside.push(v.id);
    }
    return { size: `${c.clientWidth}x${c.clientHeight}`, fresh, onCamera, stretched, outside: outside.length, due: isle.refitDue, glide: isle.glide !== null };
  });
const frames = (page, n) =>
  page.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); }, n);

// The island's on-screen bounding box (every vertex), once the fit and its glide are done and two frames are drawn.
const box = async (page) => {
  await page.waitForFunction(() => !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
  await frames(page, 2);
  return page.evaluate(() => {
    const xs = [];
    const ys = [];
    for (const v of window.__emberisle.getState().state.vertices) {
      const p = window.__isle.screenOf(v.id);
      xs.push(p.x);
      ys.push(p.y);
    }
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  });
};
const near = (a, b) => ["w", "h"].every((k) => Math.abs(a[k] / b[k] - 1) <= 0.1) && ["x", "y"].every((k) => Math.abs(a[k] - b[k]) <= 0.1 * Math.max(b.w, b.h));
const round = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v)]));
async function start(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });
  await page.getByRole("button", { name: "Four seats, one table" }).click();
  await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState, null, { timeout: STEP_MS });
  await page.evaluate(() => {
    const g = window.__emberisle;
    while (g.getState().state.phase === "rollOff") g.getState().dispatch({ type: "roll" });
  });
  // A banner leaves the phase bar a few seconds in; start after it, with the fit at rest.
  await page.waitForFunction(() => !document.querySelector('[data-testid="banner"]'), null, { timeout: STEP_MS });
  await page.evaluate(() => window.__isle.remeasure());
  return { ctx, page };
}

let code = 0;
try {
  for (const [a, b] of [[[390, 844], [844, 390]], [[360, 640], [640, 360]]]) {
    const fresh = {};
    for (const [w, h] of [a, b]) {
      const f = await start(w, h);
      fresh[`${w}x${h}`] = await box(f.page);
      await f.ctx.close();
    }
    const { ctx, page } = await start(a[0], a[1]);
    const settle = async () => {
      await page.waitForFunction(() => !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
      await frames(page, 2);
    };
    await settle();
    const first = await look(page);
    check(first.fresh && first.onCamera && !first.stretched && first.outside === 0, `${a.join("x")} start: fitted to the hole`, first);
    for (const [w, h] of [b, a, b]) {
      const tag = `${a.join("x")} -> ${w}x${h}`;
      await page.setViewportSize({ width: w, height: h });
      await frames(page, 3);
      const soon = await look(page);
      check(soon.size === `${w}x${h}` && soon.fresh, `${tag}: within 3 frames the fit is the one the new hole asks for`, soon);
      await settle();
      const done = await look(page);
      const got = await box(page);
      check(near(got, fresh[`${w}x${h}`]), `${tag}: island box within 10 % of a fresh load's`, { got: round(got), fresh: round(fresh[`${w}x${h}`]), ratio: [got.w / fresh[`${w}x${h}`].w, got.h / fresh[`${w}x${h}`].h].map((r) => +r.toFixed(3)) });
      check(done.fresh && done.onCamera && !done.stretched && done.outside === 0, `${tag}: settled, camera on the fit, not stretched, every corner in the hole`, done);
    }
    await ctx.close();
  }
  check(errors.length === 0, "zero console errors", errors);
  if (failures.length) throw new Error(`${failures.length} check(s) failed`);
  console.log("rotate-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
