// Two-finger pan (hud/two-finger-pan). On a phone in landscape (844x390, the diorama) and upright (390x844, the overhead),
// two fingers dragged together move the look-at point and the board follows; the island's centre stays on screen; a drag
// past the clamp stops at PAN_RADIUS from home; one finger still orbits and does not pan; a tap after a pan still picks
// what is under the finger (screenOf lands on the mark); turning the phone refits home. Real touch through CDP
// Input.dispatchTouchEvent. Run: npm run pan-prove
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8131;
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
const frames = (page, n) => page.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); }, n);
const settle = async (page) => {
  await page.waitForFunction(() => !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
  await frames(page, 3);
};
const state = (page) =>
  page.evaluate(() => {
    const i = window.__isle;
    const c = document.querySelector("canvas");
    const t = i.orbit.target;
    const home = i.fit && "focal" in i.fit ? { x: 0, z: 0 } : { x: i.fit.x, z: i.fit.z };
    let sx = 0, sy = 0, n = 0;
    for (const v of window.__emberisle.getState().state.vertices) {
      const p = i.screenOf(v.id);
      sx += p.x; sy += p.y; n++;
    }
    return { tx: t.x, tz: t.z, ty: t.y, home, dist: Math.hypot(t.x - home.x, t.z - home.z), cx: sx / n, cy: sy / n, w: c.clientWidth, h: c.clientHeight, azimuth: i.orbit.getAzimuthalAngle(), view: i.view };
  });

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
  await page.waitForFunction(() => !document.querySelector('[data-testid="banner"]'), null, { timeout: STEP_MS });
  await page.evaluate(() => window.__isle.remeasure());
  const cdp = await ctx.newCDPSession(page);
  await settle(page);
  return { ctx, page, cdp };
}

// Fingers 1 and 2 start (x, y) and (x + gap, y) and move together by (dx, dy) in steps, then lift.
async function twoFingers(cdp, page, x, y, dx, dy, steps = 12, gap = 70) {
  const pts = (k) => [{ x: x + (dx * k) / steps, y: y + (dy * k) / steps, id: 1 }, { x: x + gap + (dx * k) / steps, y: y + (dy * k) / steps, id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(0) });
  for (let k = 1; k <= steps; k++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(k) });
    await frames(page, 1);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await frames(page, 3);
}
async function oneFinger(cdp, page, x, y, dx, dy, steps = 10) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  for (let k = 1; k <= steps; k++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * k) / steps, y: y + (dy * k) / steps, id: 1 }] });
    await frames(page, 1);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await frames(page, 3);
}

let code = 0;
try {
  for (const [w, h, view] of [[844, 390, "overhead"], [390, 844, "overhead"], [1000, 420, "diorama"]]) {
    const tag = `${w}x${h}`;
    const { ctx, page, cdp } = await start(w, h);
    const s0 = await state(page);
    check(s0.view === view && s0.dist < 1e-3, `${tag}: starts home in the ${view}`, s0);

    // Two fingers dragged right and down by 120 px.
    await twoFingers(cdp, page, w / 2 - 35, h / 2, 120, 0);
    const s1 = await state(page);
    check(s1.dist > 0.5 && Math.abs(s1.ty - s0.ty) < 1e-6, `${tag}: two-finger drag moves the target along the ground`, { dist: s1.dist, ty: s1.ty });
    check(s1.cx > s0.cx + 20, `${tag}: the island follows the fingers (right)`, { from: s0.cx, to: s1.cx });
    const ratio = (s1.cx - s0.cx) / 120;
    check(ratio > 0.4 && ratio < 1.6, `${tag}: the island tracks the fingers about 1:1`, { ratio });
    check(Math.abs(s1.azimuth - s0.azimuth) < 1e-3, `${tag}: a pan does not orbit`, { a0: s0.azimuth, a1: s1.azimuth });

    // A frame or two of ordinary refit must not undo it.
    await page.evaluate(() => window.__isle.remeasure());
    await frames(page, 6);
    const s2 = await state(page);
    check(Math.abs(s2.tx - s1.tx) < 1e-6 && Math.abs(s2.tz - s1.tz) < 1e-6, `${tag}: an unchanged refit leaves the pan alone`, { s1: [s1.tx, s1.tz], s2: [s2.tx, s2.tz] });

    // Tap picking after a pan: the mark under a vertex's screen position is that vertex's.
    const picked = await page.evaluate(() => {
      const i = window.__isle;
      const c = document.querySelector("canvas");
      const v = window.__emberisle.getState().state.vertices.find((v) => i.legalIds?.has(v.id)) ?? window.__emberisle.getState().state.vertices[0];
      const p = i.screenOf(v.id);
      return { id: v.id, x: p.x, y: p.y, inside: p.x > 0 && p.x < c.clientWidth && p.y > 0 && p.y < c.clientHeight };
    });
    check(picked.inside, `${tag}: a panned vertex is on screen to tap`, picked);

    // Far past the clamp, both ways.
    for (const [dx, dy] of [[w, 0], [-w, 0], [0, h], [0, -h]]) {
      for (let r = 0; r < 4; r++) await twoFingers(cdp, page, dx < 0 ? w * 0.85 - 70 : dx > 0 ? w * 0.15 : w / 2 - 35, dy < 0 ? h * 0.7 : dy > 0 ? h * 0.3 : h / 2, dx * 0.7, dy * 0.7);
      const s = await state(page);
      const onScreen = s.cx > 0 && s.cx < s.w && s.cy > 0 && s.cy < s.h;
      check(s.dist <= 5 + 1e-3 && onScreen, `${tag}: drag (${Math.sign(dx)},${Math.sign(dy)}) x4 holds the clamp and the island stays on screen`, { dist: s.dist, cx: s.cx, cy: s.cy });
    }
    const sm = await state(page);
    check(sm.dist > 1, `${tag}: the clamp is reached, not just never moved`, { dist: sm.dist });

    // One finger: orbits (or does nothing to the target), never pans.
    const before = await state(page);
    await oneFinger(cdp, page, w / 2, h / 2, 90, 0);
    const after = await state(page);
    check(Math.abs(after.tx - before.tx) < 1e-6 && Math.abs(after.tz - before.tz) < 1e-6, `${tag}: one finger leaves the target alone`, { before: [before.tx, before.tz], after: [after.tx, after.tz] });

    // Home key snaps back.
    await page.evaluate(() => window.__isle.goHome());
    await settle(page);
    const home = await state(page);
    check(home.dist < 1e-3, `${tag}: Home glides back to the fit`, home);

    // Pan again, then turn the phone: the refit returns home.
    await twoFingers(cdp, page, w / 2 - 35, h / 2, 100, 40);
    const moved = await state(page);
    check(moved.dist > 0.5, `${tag}: panned again before the turn`, { dist: moved.dist });
    await page.setViewportSize({ width: h, height: w });
    await frames(page, 4);
    await settle(page);
    const turned = await state(page);
    check(turned.dist < 1e-3, `${tag} -> ${h}x${w}: rotation refit returns home`, turned);
    await ctx.close();
  }

  // Tap-to-place after a pan: panned, the tap on a legal vertex's screen position selects it.
  {
    const { ctx, page, cdp } = await start(844, 390);
    await twoFingers(cdp, page, 300, 195, 100, 30);
    const hit = await page.evaluate(() => {
      const i = window.__isle;
      const id = [...i.legalIds][0];
      const p = i.screenOf(id);
      return { id, x: p.x, y: p.y, ok: p.x > 0 && p.y > 0 && p.x < innerWidth && p.y < innerHeight };
    });
    if (hit.id && hit.ok) {
      const rect = await page.evaluate(() => { const r = document.querySelector("canvas").getBoundingClientRect(); return { l: r.left, t: r.top }; });
      const picks = await page.evaluate(() => { window.__picks = []; const o = window.__isle; return typeof o.hitsAt === "function"; });
      const at = { x: rect.l + hit.x, y: rect.t + hit.y };
      const best = await page.evaluate(({ x, y }) => {
        const i = window.__isle;
        return i.hitsAt({ clientX: x, clientY: y }, true).map((h) => h.id);
      }, at);
      check(best.includes(hit.id), "844x390: after a pan the picking ray at a vertex's screen position hits that vertex", { want: hit.id, got: best.slice(0, 4), picks });
    } else check(false, "844x390: a legal vertex was on screen after the pan", hit);
    await ctx.close();
  }

  check(errors.length === 0, "zero console errors", errors);
  if (failures.length) throw new Error(`${failures.length} check(s) failed`);
  console.log("pan-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
