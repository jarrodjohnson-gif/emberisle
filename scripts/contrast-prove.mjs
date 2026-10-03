// #381: UI text meets WCAG 1.4.3 (4.5:1). Reads computed colours of the title's Join and Host a table buttons
// (End turn and Start share the `sea` variant) and the "A living island" eyebrow, then checks the ink tokens.
// Run: npm run contrast-prove
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8093;
const MIN = 4.5;
const lum = ([r, g, b]) => {
  const [R, G, B] = [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Join", exact: true }).waitFor();
  // Computed colours can be oklch or color-mix, so resolve each to sRGB through a canvas pixel.
  const read = await page.evaluate(() => {
    const px = (css) => {
      const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      c.fillStyle = "#000";
      c.fillStyle = css;
      c.fillRect(0, 0, 1, 1);
      return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const btn = (name) => {
      const el = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === name);
      const s = getComputedStyle(el);
      return { fg: px(s.color), bg: px(s.backgroundColor) };
    };
    const eyebrow = getComputedStyle([...document.querySelectorAll("p")].find((p) => p.textContent === "A living island"));
    const root = getComputedStyle(document.documentElement);
    return {
      join: btn("Join"),
      host: btn("Host a table"),
      eyebrow: px(eyebrow.color),
      surface: px(root.getPropertyValue("--color-surface").trim()),
      bg: px(root.getPropertyValue("--color-bg").trim()),
      accentInk: px(root.getPropertyValue("--color-accent-ink").trim()),
      accent: px(root.getPropertyValue("--color-accent").trim()),
    };
  });
  // The error line only appears after a failed join, so take its colour from the token the source names.
  const errorInk = /text-accent-ink/.test(readFileSync("src/components/game/EmberisleApp.tsx", "utf8")) ? read.accentInk : read.accent;
  await page.screenshot({ path: "test-results/contrast-prove.png" });
  const checks = [
    ["Join (sea) white on fill", ratio(read.join.fg, read.join.bg)],
    ["Host a table (accent) white on fill", ratio(read.host.fg, read.host.bg)],
    ["eyebrow 12 px on surface", ratio(read.eyebrow, read.surface)],
    ["eyebrow 12 px on bg", ratio(read.eyebrow, read.bg)],
    ["error line 14 px on surface", ratio(errorInk, read.surface)],
    ["error line 14 px on bg", ratio(errorInk, read.bg)],
  ];
  const bad = [];
  for (const [name, r] of checks) {
    console.log(`${r.toFixed(2)}:1  ${name}`);
    if (r < MIN) bad.push(`${name} is ${r.toFixed(2)}:1`);
  }
  // The source must use the ink tokens where the error line and eyebrows are drawn.
  const app = readFileSync("src/components/game/EmberisleApp.tsx", "utf8");
  if (/text-accent"/.test(app)) bad.push("EmberisleApp.tsx still uses text-accent for text");
  if (/text-sea"/.test(app)) bad.push("EmberisleApp.tsx still uses text-sea for text");
  assert.deepEqual(bad, [], `below ${MIN}:1`);
  assert.deepEqual(errors, [], "console errors");
  console.log("contrast-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
