// Two-finger pan and the map/HUD isolation (hud/two-finger-pan, #625). On a phone in landscape (844x390, the diorama) and upright (390x844, the overhead),
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
    if (!i.fit) return { nofit: true };
    const home = "focal" in i.fit ? { x: 0, z: 0 } : { x: i.fit.x, z: i.fit.z };
    const hole = i.insets();
    let sx = 0, sy = 0, n = 0;
    for (const v of window.__emberisle.getState().state.vertices) {
      const p = i.screenOf(v.id);
      sx += p.x; sy += p.y; n++;
    }
    const [cx, cy] = [sx / n, sy / n];
    return {
      tx: t.x, tz: t.z, ty: t.y, dist: Math.hypot(t.x - home.x, t.z - home.z), max: i.panLimit(), zoom: i.view === "diorama" ? i.persp.position.distanceTo(t) : i.ortho.zoom,
      cx, cy, inHole: cx > hole.left && cx < c.clientWidth - hole.right && cy > hole.top && cy < c.clientHeight - hole.bottom,
      w: c.clientWidth, h: c.clientHeight, azimuth: i.orbit.getAzimuthalAngle(), view: i.view,
      offX: cx - c.clientWidth / 2,
    };
  });
const cam = (page) => page.evaluate(() => { const i = window.__isle; return { tx: i.orbit.target.x, tz: i.orbit.target.z, zoom: i.ortho.zoom, fit: JSON.stringify(i.fit), dist: i.persp.position.distanceTo(i.orbit.target) }; });
const hud = (page) => page.evaluate(() => [...document.querySelectorAll("button, [role=status], [data-testid]")].filter((e) => e.tagName !== "CANVAS" && !e.closest("[role=dialog]")).slice(0, 40).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(","); }).join("|"));
const same = (a, b) => a.tx === b.tx && a.tz === b.tz && a.zoom === b.zoom && a.fit === b.fit && Math.abs(a.dist - b.dist) < 1e-9;
const onCanvas = (page, x, y) => page.evaluate(([x, y]) => document.elementFromPoint(x, y) === document.querySelector("canvas"), [x, y]);

const NOTCH = (w, h) => (h > w ? { top: 62, bottom: 34, left: 0, right: 0 } : { top: 0, bottom: 21, left: 62, right: 62 });
async function start(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => localStorage.setItem("emberisle-water", "simple"));
  const page = await ctx.newPage();
  if ((w === 440 || w === 956)) await (await ctx.newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets: NOTCH(w, h) });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });
  await page.getByRole("button", { name: "Pass this device" }).click();
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

const touch = (cdp, type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
// Fingers 1 and 2 start (x, y) and (x + gap, y) and move together by (dx, dy) in steps, then lift.
async function twoFingers(cdp, page, x, y, dx, dy, steps = Math.max(4, Math.ceil(Math.hypot(dx, dy) / 40)), gap = 120) {
  // The fingers sit side by side across the drag, so one pointer moving a moment before the other never changes their distance.
  const [gx, gy] = dx !== 0 && dy === 0 ? [0, gap] : [gap, 0];
  const pts = (k) => [{ x: x + (dx * k) / steps, y: y + (dy * k) / steps, id: 1 }, { x: x + gx + (dx * k) / steps, y: y + gy + (dy * k) / steps, id: 2 }];
  await touch(cdp, "touchStart", pts(0));
  for (let k = 1; k <= steps; k++) {
    await touch(cdp, "touchMove", pts(k));
    await frames(page, 1);
  }
  await touch(cdp, "touchEnd", []);
  await frames(page, 2);
}
async function pinch(cdp, page, cx, cy, from, to, steps = 8) {
  const pts = (k) => { const r = from + ((to - from) * k) / steps; return [{ x: cx - r, y: cy, id: 1 }, { x: cx + r, y: cy, id: 2 }]; };
  await touch(cdp, "touchStart", pts(0));
  for (let k = 1; k <= steps; k++) { await touch(cdp, "touchMove", pts(k)); await frames(page, 1); }
  await touch(cdp, "touchEnd", []);
  await frames(page, 2);
}
async function oneFinger(cdp, page, x, y, dx, dy, steps = 6) {
  await touch(cdp, "touchStart", [{ x, y, id: 1 }]);
  for (let k = 1; k <= steps; k++) { await touch(cdp, "touchMove", [{ x: x + (dx * k) / steps, y: y + (dy * k) / steps, id: 1 }]); await frames(page, 1); }
  await touch(cdp, "touchEnd", []);
  await frames(page, 2);
}
// A start for a two-finger drag in direction (sx, sy): the canvas point nearest the opposite edge where both fingers land on the canvas.
async function startFor(page, w, h, sx, sy) {
  const hole = await page.evaluate(() => window.__isle.insets());
  const [cx, cy] = [hole.left + (w - hole.left - hole.right) / 2, hole.top + (h - hole.top - hole.bottom) / 2];
  const [gx, gy] = sx !== 0 && sy === 0 ? [0, 120] : [120, 0];
  // Inside the hole, so a finger never lands on the thin canvas strips between chips.
  const [x0, x1, y0, y1] = [hole.left + 8, w - hole.right - 8 - gx, hole.top + 8, h - hole.bottom - 8 - gy];
  for (let t = 0; t < 40; t++) {
    const x = sx > 0 ? x0 + t * 8 : sx < 0 ? x1 - t * 8 : cx - 60;
    const y = sy > 0 ? y0 + t * 8 : sy < 0 ? y1 - t * 8 : cy - 60;
    if ((await onCanvas(page, x, y)) && (await onCanvas(page, x + gx, y + gy))) return { x, y };
  }
  return null;
}

let code = 0;
try {
  for (const [w, h, view] of [[430, 932, "overhead"], [440, 956, "overhead"], [360, 640, "overhead"], [844, 390, "overhead"], [390, 844, "overhead"], [956, 440, "overhead"], [1280, 720, "diorama"]]) {
    const tag = `${w}x${h}`;
    const { ctx, page, cdp } = await start(w, h);
    const s0 = await state(page);
    check(!s0.nofit && s0.view === view && s0.dist < 1e-3, `${tag}: starts home in the ${view}`, s0);
    if (h > w) check(Math.abs(s0.offX) <= 0.02 * w, `${tag}: portrait, the island is centred across the screen (within 2 % of the width)`, { offX: s0.offX });
    const hole0 = await page.evaluate(() => { const i = window.__isle, c = document.querySelector("canvas"), hl = i.insets(); return { x: s0x(), }; function s0x() { return hl.left + (c.clientWidth - hl.left - hl.right) / 2; } });
    if (h > w) check(Math.abs(s0.cx - hole0.x) <= 0.02 * w, `${tag}: ... and in the hole's width`, { cx: s0.cx, holeX: hole0.x });
    if (h > w) {
      const vy = await page.evaluate(() => { const i = window.__isle, c = document.querySelector("canvas"), hl = i.insets(); return hl.top + (c.clientHeight - hl.top - hl.bottom) / 2; });
      check(Math.abs(s0.cy - vy) <= 0.02 * h, `${tag}: ... and in the hole's height`, { cy: s0.cy, holeY: vy });
    }
    if (w === 430 || w === 360 || w === 440) { await ctx.close(); continue; }

    // Two fingers dragged right by 120 px.
    const st = await startFor(page, w, h, 1, 0);
    await twoFingers(cdp, page, st.x, st.y, 120, 0);
    const s1 = await state(page);
    check(s1.dist > 0.5 && Math.abs(s1.ty - s0.ty) < 1e-6, `${tag}: two-finger drag moves the target along the ground`, { dist: s1.dist, ty: s1.ty });
    const ratio = (s1.cx - s0.cx) / 120;
    check(ratio > 0.4 && ratio < 1.6, `${tag}: the island follows the fingers about 1:1`, { ratio });
    check(Math.abs(s1.azimuth - s0.azimuth) < 1e-3, `${tag}: a pan does not orbit`, { a0: s0.azimuth, a1: s1.azimuth });
    await page.evaluate(() => window.__isle.remeasure());
    await frames(page, 6);
    const s2 = await state(page);
    check(Math.abs(s2.tx - s1.tx) < 1e-6 && Math.abs(s2.tz - s1.tz) < 1e-6, `${tag}: an unchanged refit leaves the pan alone`, {});

    // The clamp: from Home, each direction dragged until it stops growing ends at exactly the limit, the island has moved the way
    // the fingers went, and it stays in the hole.
    for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      await page.evaluate(() => window.__isle.goHome());
      await settle(page);
      const h0 = await state(page);
      const b = await startFor(page, w, h, sx, sy);
      let s, r;
      for (r = 0; r < 3; r++) {
        await twoFingers(cdp, page, b.x, b.y, sx * Math.min(w - 160, 200), sy * Math.min(h - 160, 200));
        s = await state(page);
        if (Math.abs(s.dist - s.max) < 1e-6) break;
      }
      const moved = (s.cx - h0.cx) * sx + (s.cy - h0.cy) * sy;
      check(Math.abs(s.dist - s.max) < 1e-3 && s.inHole && moved > 5, `${tag}: drag (${sx},${sy}) from Home carries the island that way, stops at the limit, stays in the hole`, { dist: s.dist, max: s.max, moved, inHole: s.inHole });
    }

    // Pinch, then pan: the limit does not shrink with zoom, a pinch does not pan, and a pan after it still works.
    await page.evaluate(() => window.__isle.goHome());
    await settle(page);
    const p0 = await state(page);
    await pinch(cdp, page, w / 2, h / 2, 30, 90);
    const p1 = await state(page);
    check(p1.zoom !== p0.zoom && p1.dist < 0.35, `${tag}: a pinch zooms and (inside the dead zone) does not pan`, { z0: p0.zoom, z1: p1.zoom, dist: p1.dist });
    // An off-centre pinch (one finger still, the other 14 px away: the midpoint drifts 7 px) does not pan.
    await page.evaluate(() => window.__isle.goHome());
    await settle(page);
    const q0 = await state(page);
    await touch(cdp, "touchStart", [{ x: w / 2 - 60, y: h / 2, id: 1 }, { x: w / 2 + 60, y: h / 2, id: 2 }]);
    for (let k = 1; k <= 7; k++) { await touch(cdp, "touchMove", [{ x: w / 2 - 60, y: h / 2, id: 1 }, { x: w / 2 + 60 + 2 * k, y: h / 2, id: 2 }]); await frames(page, 1); }
    await touch(cdp, "touchEnd", []);
    await frames(page, 2);
    const q1 = await state(page);
    check(Math.hypot(q1.tx - q0.tx, q1.tz - q0.tz) < 1e-6, `${tag}: an off-centre pinch (7 px of midpoint drift) does not pan`, { dx: q1.tx - q0.tx, dz: q1.tz - q0.tz });
    await pinch(cdp, page, w / 2, h / 2, 30, 90);
    const bz = await startFor(page, w, h, 1, 0);
    for (let r = 0; r < 3; r++) await twoFingers(cdp, page, bz.x, bz.y, Math.min(w - 160, 200), 0);
    const p2 = await state(page);
    check(Math.abs(p2.dist - p2.max) < 1e-3 && p2.max === p1.max, `${tag}: zoomed in, a pan still reaches the same limit`, { dist: p2.dist, max: p2.max, max1: p1.max });

    // One finger never pans.
    const before = await state(page);
    await oneFinger(cdp, page, w / 2, h / 2, 90, 0);
    const after = await state(page);
    check(Math.abs(after.tx - before.tx) < 1e-6 && Math.abs(after.tz - before.tz) < 1e-6, `${tag}: one finger leaves the target alone`, {});

    await page.evaluate(() => window.__isle.goHome());
    await settle(page);
    check((await state(page)).dist < 1e-3, `${tag}: Home glides back to the fit`, {});

    // HUD isolation: a panel opening and closing never moves the map, and the map never moves the HUD.
    {
      const sp = await startFor(page, w, h, 1, 0);
      await twoFingers(cdp, page, sp.x, sp.y, 100, 0);
      const c0 = await cam(page);
      // A band of chrome docked along the bottom (the hole really changes) with a panel flagged open: the map does not move.
      const live0 = await page.evaluate(() => JSON.stringify(window.__isle.liveInsets()));
      await page.evaluate(() => {
        const d = document.createElement("div");
        d.id = "fake-dock";
        d.style.cssText = "position:absolute;left:0;right:0;bottom:0;height:150px;pointer-events:auto;background:#fff8";
        document.querySelector("canvas").parentElement.appendChild(d);
        window.__emberisle.setState({ offer: { tradeId: "audit", from: "p1", fromName: "Mira", give: { wool: 2 }, want: { ore: 1 }, until: Date.now() + 60000 }, declined: [] });
      });
      await frames(page, 12);
      const open = await cam(page);
      const live1 = await page.evaluate(() => JSON.stringify(window.__isle.liveInsets()));
      await page.evaluate(() => { document.getElementById("fake-dock").remove(); window.__emberisle.setState({ offer: null }); });
      await frames(page, 12);
      const shut = await cam(page);
      check(live0 !== live1 && same(c0, open) && same(c0, shut), `${tag}: a panel docking in the hole leaves the pan, zoom and fit alone`, { holeChanged: live0 !== live1 });
      // The Fortunes tray overlays the board: opening and closing it leaves the camera and the island's scale alone.
      const sc0 = await page.evaluate(() => window.__isle.pxPerUnit(0, 0.35, 0));
      // #776: the button shows only while a fortune is held, so the seat holds one.
      await page.evaluate(() => { const g = window.__emberisle; const st = structuredClone(g.getState().state); for (const p of st.players) p.hidden.plenty = 1; st.seq += 1; g.setState({ state: st }); });
      await page.getByTestId("fortunes-button").waitFor();
      await page.evaluate(() => document.querySelector('[data-testid="fortunes-button"]').click());
      await frames(page, 10);
      const trayOpen = await cam(page);
      await page.evaluate(() => document.querySelector('[data-testid="fortunes-button"]').click());
      await frames(page, 10);
      const trayShut = await cam(page);
      const sc1 = await page.evaluate(() => window.__isle.pxPerUnit(0, 0.35, 0));
      check(same(c0, trayOpen) && same(c0, trayShut) && Math.abs(sc0 - sc1) < 1e-6, `${tag}: opening and closing the Fortunes tray leaves the camera and scale alone`, { sc0, sc1 });
      const h0 = await hud(page);
      await pinch(cdp, page, w / 2, h / 2, 30, 90);
      await twoFingers(cdp, page, sp.x, sp.y, -60, 0);
      await oneFinger(cdp, page, w / 2, h / 2, 60, 0);
      check((await hud(page)) === h0, `${tag}: pinch, pan and orbit leave every HUD box where it was`, {});
    }

    // A real tap on a legal vertex after a pan places (selects) it: the picking ray follows the camera.
    {
      await page.evaluate(() => window.__isle.goHome());
      await settle(page);
      const sp = await startFor(page, w, h, -1, 0);
      await twoFingers(cdp, page, sp.x, sp.y, -50, 0);
      const v = await page.evaluate(() => {
        const i = window.__isle, c = document.querySelector("canvas"), hl = i.insets();
        for (const id of i.legalIds) {
          const p = i.screenOf(id);
          const r = c.getBoundingClientRect();
          if (p && p.x > hl.left + 12 && p.x < c.clientWidth - hl.right - 12 && p.y > hl.top + 12 && p.y < c.clientHeight - hl.bottom - 12 && document.elementFromPoint(r.left + p.x, r.top + p.y) === c) return { id, x: r.left + p.x, y: r.top + p.y };
        }
        return null;
      });
      check(v !== null, `${tag}: a legal corner is on the canvas after the pan`, v);
      if (v) {
        await touch(cdp, "touchStart", [{ x: v.x, y: v.y, id: 1 }]);
        await touch(cdp, "touchEnd", []);
        await frames(page, 3);
        const pend = await page.evaluate(() => window.__emberisle.getState().pendingPlace?.id ?? null);
        check(pend === v.id, `${tag}: tapping it after a pan selects that very corner`, { want: v.id, got: pend });
      }
    }

    // Turn the phone: the refit returns home.
    await page.evaluate(() => window.__isle.goHome());
    await settle(page);
    const sq = await startFor(page, w, h, 1, 0);
    await twoFingers(cdp, page, sq.x, sq.y, 160, 0);
    { const pm = await state(page); check(pm.dist > 0.5, `${tag}: panned before the turn`, { dist: pm.dist, sq }); }
    await page.setViewportSize({ width: h, height: w });
    if ((w === 440 || w === 956)) await (await ctx.newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets: NOTCH(h, w) });
    await frames(page, 4);
    await settle(page);
    const turned = await state(page);
    check(turned.dist < 1e-3, `${tag} -> ${h}x${w}: rotation refit returns home`, turned);
    await ctx.close();
  }

  // Desktop windows: the PlaceList focus and the offer overlay the board; resizing with one open fits like a fresh load.
  for (const [w, h] of [[900, 700], [1024, 768]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(() => localStorage.setItem("emberisle-water", "simple"));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });
    await page.getByRole("button", { name: "Pass this device" }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState, null, { timeout: STEP_MS });
    await page.evaluate(() => { const g = window.__emberisle; while (g.getState().state.phase === "rollOff") g.getState().dispatch({ type: "roll" }); });
    await page.waitForFunction(() => !document.querySelector('[data-testid="banner"]'), null, { timeout: STEP_MS });
    await settle(page);
    const scale = () => page.evaluate(() => window.__isle.pxPerUnit(0, 0.35, 0));
    const c0 = await cam(page);
    const s0 = await scale();
    await page.evaluate(() => document.querySelector('[data-testid="place-list"] button')?.focus());
    await frames(page, 10);
    const offerOpen = await page.evaluate(() => window.__emberisle.setState({ offer: { tradeId: "audit", from: "p1", fromName: "Mira", give: { wool: 2 }, want: { ore: 1 }, until: Date.now() + 60000 }, declined: [] }));
    await frames(page, 10);
    check(same(c0, await cam(page)) && Math.abs(s0 - (await scale())) < 1e-6, `${w}x${h}: PlaceList focus and an offer leave the camera and scale alone`, { s0 });
    await page.evaluate(() => { document.activeElement?.blur(); window.__emberisle.setState({ offer: null }); });
    await frames(page, 10);
    check(same(c0, await cam(page)) && Math.abs(s0 - (await scale())) < 1e-6, `${w}x${h}: ...and still do once closed`, {});
    // Resize with a panel open: the fit is the one a fresh load at that size gets.
    await page.evaluate(() => document.querySelector('[data-testid="place-list"] button')?.focus());
    await page.setViewportSize({ width: w + 40, height: h + 30 });
    await frames(page, 4);
    await settle(page);
    const resized = await cam(page);
    const fresh = await browser.newContext({ viewport: { width: w + 40, height: h + 30 } });
    await fresh.addInitScript(() => localStorage.setItem("emberisle-water", "simple"));
    const fp = await fresh.newPage();
    await fp.goto(`http://127.0.0.1:${PORT}/`);
    await fp.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });
    await fp.getByRole("button", { name: "Pass this device" }).click();
    await fp.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState, null, { timeout: STEP_MS });
    await settle(fp);
    check(resized.fit === (await cam(fp)).fit, `${w}x${h} -> ${w + 40}x${h + 30}: resizing with the PlaceList focused fits like a fresh load`, {});
    await fresh.close();
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
