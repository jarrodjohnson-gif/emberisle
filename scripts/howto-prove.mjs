// The title's How to play is a dialog over the whole screen, not a box inside the title card: on a phone (portrait and
// landscape) and at 1280x720 its backdrop covers the viewport, its Close button is on screen and takes the tap, and
// Close actually closes it. Zero console errors.
// Run: npm run howto-prove
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8104;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
let code = 0;
try {
  const cases = [
    { name: "phone portrait 390x844", opts: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: "phone landscape 844x390", opts: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: "desktop 1280x720", opts: { viewport: { width: 1280, height: 720 } } },
  ];
  for (const c of cases) {
    const ctx = await browser.newContext(c.opts);
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`${c.name}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${c.name}: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);
    const open = page.getByRole("button", { name: "How to play" });
    await open.scrollIntoViewIfNeeded();
    await open.click();
    const dialog = page.getByRole("dialog", { name: "How to play" });
    await dialog.waitFor();
    const got = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-labelledby="howto-title"]');
      const close = dialog.querySelector('button[aria-label="Close"]');
      const d = dialog.getBoundingClientRect();
      const r = close.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        backdrop: { x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.width), h: Math.round(d.height) },
        close: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) },
        closeTakesTheTap: close === hit || close.contains(hit),
        vw: innerWidth,
        vh: innerHeight,
      };
    });
    assert.deepEqual(got.backdrop, { x: 0, y: 0, w: got.vw, h: got.vh }, `${c.name}: the backdrop covers the viewport`);
    assert.ok(got.close.top >= 0 && got.close.bottom <= got.vh && got.close.left >= 0 && got.close.right <= got.vw, `${c.name}: Close is on screen ${JSON.stringify(got.close)}`);
    assert.ok(got.closeTakesTheTap, `${c.name}: Close takes the tap at its centre`);
    await dialog.getByRole("button", { name: "Close" }).click();
    await page.waitForFunction(() => !window.__emberisle.getState().howTo);
    assert.equal(await dialog.count(), 0, `${c.name}: Close closes the dialog`);
    console.log(`${c.name}: backdrop ${got.backdrop.w}x${got.backdrop.h}, Close at ${got.close.top}-${got.close.bottom} px on screen and tappable, closes`);
    await ctx.close();
  }
  assert.deepEqual(errors, [], "console errors");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
