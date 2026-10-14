// #329: the renderer's pixel ratio is capped at 2, and at 1.5 on a coarse pointer with the simple sea (the crystal sea runs at
// up to 2 on a phone too, crystal-water.md); a resize keeps the cap.
// Run: npm run dpr-prove
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8092;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
let code = 0;
try {
  const cases = [
    { name: "phone 390x844 @3x, coarse, simple sea", water: "simple", opts: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, coarse: true, want: 1.5, resizeTo: { width: 844, height: 390 } },
    { name: "phone 390x844 @3x, coarse, crystal sea", water: "crystal", opts: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, coarse: true, want: 2, resizeTo: { width: 844, height: 390 } },
    { name: "desktop 1920x1080 @3x, fine", water: "simple", opts: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 3 }, coarse: false, want: 2, resizeTo: { width: 1280, height: 720 } },
  ];
  for (const c of cases) {
    const ctx = await browser.newContext(c.opts);
    await ctx.addInitScript((w) => localStorage.setItem("emberisle-water", w), c.water);
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle?.water);
    const read = () =>
      page.evaluate(() => {
        const r = window.__isle.renderer;
        return { coarse: matchMedia("(pointer: coarse)").matches, dpr: window.devicePixelRatio, ratio: r.getPixelRatio() };
      });
    const first = await read();
    assert.equal(first.coarse, c.coarse, `${c.name}: pointer type`);
    assert.equal(first.dpr, 3, `${c.name}: devicePixelRatio`);
    assert.equal(first.ratio, c.want, `${c.name}: pixel ratio`);
    await page.setViewportSize(c.resizeTo);
    await page.waitForFunction(([w]) => window.innerWidth === w, [c.resizeTo.width]);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.equal((await read()).ratio, c.want, `${c.name}: pixel ratio after resize`);
    console.log(`${c.name}: pixel ratio ${first.ratio}, kept after resize`);
    await ctx.close();
  }
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
