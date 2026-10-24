// #625: the declared hole (`playHole`, what the island is fitted to) covers the HUD's persistent footprint. On a phone, at rest and in
// each in-play phase (roll, main, robber, setup), every side of the live hole (`__isle.liveInsets()`, what the chrome around the canvas
// leaves right now) is no bigger than the declared one (`__isle.insets()`), across a width sweep: upright 320-440 px (every pixel
// from 375 to 411, around TRAY_WRAP_MAX (400), where the main phase's action row stops taking two lines by rule), sideways 667-956 px,
// a 440 px case, and safe-area notch insets. A side where the live hole is bigger is a place the HUD covers a corner. Run: npm run hole-prove
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8141;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const failures = [];
const frames = (page, n) => page.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); }, n);
const PHASES = ["roll", "main", "robber", "setupSettle", "setupRoad"];
let code = 0;
try {
  // The CSS that forces and forbids the wrap must break at the same width the fit declares.
  const { TRAY_WRAP_MAX } = await (await vite.ssrLoadModule("/src/lib/scene/mobile-fit.ts"));
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  if (!css.includes(`(max-width: ${TRAY_WRAP_MAX}px) { .action-utilities > .tray-end`) || !css.includes(`(min-width: ${TRAY_WRAP_MAX + 1}px) { .action-utilities { flex-wrap: nowrap`)) throw new Error(`styles.css does not break the action row at TRAY_WRAP_MAX (${TRAY_WRAP_MAX})`);
  console.log(`ok   styles.css breaks the action row at ${TRAY_WRAP_MAX} px, as the fit declares`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => localStorage.setItem("emberisle-water", "simple"));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });
  await page.getByRole("button", { name: "Four seats, one table" }).click();
  await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState, null, { timeout: STEP_MS });
  await page.evaluate(() => { const g = window.__emberisle; while (g.getState().state.phase === "rollOff") g.getState().dispatch({ type: "roll" }); });
  await page.waitForFunction(() => !document.querySelector('[data-testid="banner"]'), null, { timeout: STEP_MS });

  const sizes = [];
  for (let w = 320; w <= 440; w += w === 370 ? 5 : (w >= 375 && w <= 410 ? 1 : 10)) sizes.push([w, 800]);
  sizes.push([440, 800], [440, 956]);
  for (const w of [667, 740, 800, 844, 896, 932, 956]) sizes.push([w, 390]);
  sizes.push([956, 440], [956, 410]);
  let checked = 0;
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    // #776: My fortunes joins Trade's row only while a fortune is held, so each phase is read with and without one.
    for (const [ph, held] of PHASES.flatMap((ph) => [[ph, 0], [ph, 1]])) {
      await page.evaluate(([ph, held]) => {
        const g = window.__emberisle;
        const st = structuredClone(g.getState().state);
        st.current = st.players[0].id;
        st.phase = ph;
        st.dice = [3, 5];
        st.seq++;
        for (const p of st.players) { p.resources = { timber: 4, clay: 3, wool: 2, grain: 5, ore: 2 }; p.hidden = { ...p.hidden, plenty: held }; }
        g.setState({ state: st, localId: st.current, banner: null, error: null });
      }, [ph, held]);
      await frames(page, 6);
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => ({ live: window.__isle.liveInsets(), hole: window.__isle.insets() }));
      const over = ["top", "right", "bottom", "left"].filter((k) => m.live[k] > m.hole[k] + 0.5);
      checked++;
      if (over.length) {
        failures.push(`${w}x${h} ${ph} held ${held}`);
        console.log(`FAIL ${w}x${h} ${ph} held ${held}: live ${JSON.stringify(m.live)} over declared ${JSON.stringify(m.hole)} on ${over.join(", ")}`);
      }
    }
  }

  const safeCases = [
    { w: 390, h: 844, insets: { top: 47, right: 0, bottom: 34, left: 0 } },
    { w: 844, h: 390, insets: { top: 0, right: 47, bottom: 21, left: 47 } },
    { w: 440, h: 956, insets: { top: 62, right: 0, bottom: 34, left: 0 } },
    { w: 956, h: 440, insets: { top: 0, right: 62, bottom: 21, left: 62 } },
  ];
  let safeTopGrew = false;
  for (const { w, h, insets } of safeCases) {
    await page.setViewportSize({ width: w, height: h });
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
    for (const ph of PHASES) {
      await page.evaluate((ph) => {
        const g = window.__emberisle;
        const st = structuredClone(g.getState().state);
        st.current = st.players[0].id;
        st.phase = ph;
        st.dice = [3, 5];
        st.seq++;
        for (const p of st.players) p.resources = { timber: 4, clay: 3, wool: 2, grain: 5, ore: 2 };
        g.setState({ state: st, localId: st.current, banner: null, error: null });
      }, ph);
      await frames(page, 6);
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => ({ live: window.__isle.liveInsets(), hole: window.__isle.insets() }));
      if (insets.top > 0 && m.hole.top > 68) safeTopGrew = true;
      const over = ["top", "right", "bottom", "left"].filter((k) => m.live[k] > m.hole[k] + 0.5);
      checked++;
      if (over.length) {
        failures.push(`${w}x${h} safe ${ph}`);
        console.log(`FAIL ${w}x${h} safe ${ph}: live ${JSON.stringify(m.live)} over declared ${JSON.stringify(m.hole)} on ${over.join(", ")}`);
      }
    }
  }
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: {} });
  if (!safeTopGrew) throw new Error("safe-area override top did not take effect");
  console.log(`${checked} size/phase pairs: live hole inside the declared hole on every side except ${failures.length}`);
  if (errors.length) throw new Error(`console errors:\n${errors.join("\n")}`);
  if (failures.length) throw new Error(`${failures.length} pair(s) over`);
  console.log("hole-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
