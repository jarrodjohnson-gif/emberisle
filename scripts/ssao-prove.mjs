// #330: in free view the SSAO pass runs at half the CSS size, ceil(w/2) x ceil(h/2), after load and after a resize.
// Run: npm run ssao-prove
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8099; // 8098 is idle-prove; keep these from colliding if a runner overlaps them.
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
let code = 0;
try {
  // Odd sizes, so ceil() and round() disagree.
  const page = await browser.newPage({ viewport: { width: 1001, height: 601 } });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle);
  await page.evaluate(() => {
    window.__isle.setTitleMode(false);
    window.__isle.setView("free");
  });
  const read = () =>
    page.evaluate(() => {
      const r = window.__isle;
      const c = r.renderer.domElement;
      return { css: [c.clientWidth, c.clientHeight], ssao: [r.ssao.width, r.ssao.height], enabled: r.ssao.enabled };
    });
  const check = async (label) => {
    const s = await read();
    const want = [Math.ceil(s.css[0] / 2), Math.ceil(s.css[1] / 2)];
    const ok = s.ssao[0] === want[0] && s.ssao[1] === want[1];
    console.log(`${label}: css ${s.css.join("x")}, ssao ${s.ssao.join("x")}, want ${want.join("x")}, ssao enabled ${s.enabled}: ${ok ? "ok" : "FAIL"}`);
    if (!ok) code = 1;
  };
  await check("after load");
  await page.setViewportSize({ width: 1281, height: 721 });
  // The renderer is resized by the same handler, so its size says the resize event has run.
  await page.waitForFunction(() => {
    const r = window.__isle;
    return r.renderer.domElement.width === Math.floor(1281 * r.renderer.getPixelRatio());
  });
  await check("after resize");
} finally {
  await browser.close();
  await vite.close();
}
if (code) console.error("ssao-prove FAILED: SSAO pass is not half the CSS size");
process.exit(code);
