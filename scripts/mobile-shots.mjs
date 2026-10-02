// #175: open the table in a touch-emulated phone at 390x844 and 844x390, place an outpost with tap-then-confirm,
// and save screenshots to test-results/mobile/. Fails on a console error or a wrong flow.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8095;
const OUT = "test-results/mobile";
mkdirSync(OUT, { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
let code = 0;
try {
  for (const [w, h] of [
    [390, 844],
    [844, 390],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole("button", { name: "Play versus the isle" }).click();
    await page.waitForFunction(() => window.__emberisle.getState().state?.phase === "setupSettle" && window.__emberisle.getState().state.current === window.__emberisle.getState().localId);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/03-setup-${w}x${h}.png` });
    const target = await page.evaluate(() => {
      const s = window.__emberisle.getState();
      const id = s.highlights().vertices[0];
      return { id, at: window.__isle.screenOf(id), n: s.state.vertices.length };
    });
    const tap = () => page.touchscreen.tap(target.at.x, target.at.y);
    await tap();
    await page.waitForTimeout(300);
    let st = await page.evaluate(() => ({ pending: window.__emberisle.getState().pendingPlace, phase: window.__emberisle.getState().state.phase }));
    if (st.pending?.id !== target.id || st.phase !== "setupSettle") (code = 1), console.error(w, "first tap should select, not place", st);
    if (!(await page.getByTestId("place-chip").isVisible())) (code = 1), console.error(w, "Place chip not visible");
    await page.screenshot({ path: `${OUT}/04-selected-${w}x${h}.png` });
    await tap(); // same mark again confirms
    await page.waitForTimeout(500);
    st = await page.evaluate(() => ({ pending: window.__emberisle.getState().pendingPlace, phase: window.__emberisle.getState().state.phase }));
    if (st.pending || st.phase !== "setupRoad") (code = 1), console.error(w, "second tap should place", st);
    console.log(`${w}x${h}: tap selects, chip shows, second tap places ->`, st.phase);
    await ctx.close();
  }
} catch (e) {
  code = 1;
  console.error(e);
}
if (errors.length) (code = 1), console.error("console errors:", errors);
await browser.close();
await vite.close();
console.log(code ? "mobile shots FAILED" : "mobile shots ok");
process.exit(code);
