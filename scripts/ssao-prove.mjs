// #330: in free view the SSAO pass is ceil(cssW/2) x ceil(cssH/2) after load and after a resize.
// A play view keeps the full CSS size. Run: npm run ssao-prove
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8463;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1001, height: 601 } });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle?.ssao);
  await page.evaluate(() => {
    window.__isle.setTitleMode(false);
    window.__isle.setView("free");
  });
  const read = () =>
    page.evaluate(() => {
      const r = window.__isle;
      const c = r.renderer.domElement;
      return { css: [c.clientWidth, c.clientHeight], ssao: [r.ssao.width, r.ssao.height], enabled: r.ssao.enabled, view: r.view };
    });
  // Title mode keeps the free camera and turns SSAO off. The pass is still sized here.
  const check = async (label, half) => {
    const s = await read();
    const want = half ? [Math.ceil(s.css[0] / 2), Math.ceil(s.css[1] / 2)] : [s.css[0], s.css[1]];
    console.log(`${label}: view ${s.view}, css ${s.css.join("x")}, ssao ${s.ssao.join("x")}, want ${want.join("x")}, enabled ${s.enabled}`);
    assert.equal(s.view, half ? "free" : "overhead", label);
    assert.deepEqual(s.ssao, want, label);
  };
  await check("after load", true);
  await page.setViewportSize({ width: 1281, height: 721 });
  await page.waitForFunction(() => {
    const r = window.__isle;
    const c = r.renderer.domElement;
    return r.view === "free" && r.ssao.width === Math.ceil(c.clientWidth / 2) && r.ssao.height === Math.ceil(c.clientHeight / 2);
  });
  await check("after resize", true);
  // Read in the same turn as the switch. The title screen puts the free camera back on the next frame.
  const switched = await page.evaluate(() => {
    const r = window.__isle;
    const snap = (label) => {
      const c = r.renderer.domElement;
      return { label, view: r.view, css: [c.clientWidth, c.clientHeight], ssao: [r.ssao.width, r.ssao.height], enabled: r.ssao.enabled };
    };
    r.setTitleMode(false);
    r.setView("free");
    const on = snap("free, SSAO on");
    r.setView("overhead");
    const over = snap("play view");
    r.setView("free");
    const back = snap("back to free");
    r.setPlayView("overhead");
    r.setView("overhead");
    const overhead = snap("overhead view");
    r.setView("free");
    const backOverhead = snap("back from overhead");
    return [on, over, back, overhead, backOverhead];
  });
  for (const s of switched) {
    const half = s.view === "free";
    const want = half ? [Math.ceil(s.css[0] / 2), Math.ceil(s.css[1] / 2)] : [s.css[0], s.css[1]];
    console.log(`${s.label}: view ${s.view}, css ${s.css.join("x")}, ssao ${s.ssao.join("x")}, want ${want.join("x")}, enabled ${s.enabled}`);
    assert.deepEqual(s.ssao, want, s.label);
    assert.equal(s.enabled, half, s.label);
  }
  assert.equal(switched[2].view, "free", "return to free view");
  assert.equal(switched[3].view, "overhead", "enter overhead view");
  assert.equal(switched[4].view, "free", "return from overhead");
  console.log("ssao-prove ok");
} catch (err) {
  console.error(err);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
