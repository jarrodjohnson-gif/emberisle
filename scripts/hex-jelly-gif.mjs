// The Hex Jelly roll payoff as an animated GIF (docs/design/hex-jelly-prompt.md "THE TILE IN PLAY"): the studio page frozen
// frame by frame through a roll, written as test-results/jelly-<kind>-<seed>-roll.gif. Needs python3 with Pillow.
// Run: node scripts/hex-jelly-gif.mjs ore 23
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { createServer } from "vite";

const [kind = "timber", seed = "7"] = process.argv.slice(2);
const PORT = Number(process.env.VITE_PORT) || 8133;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const dir = `test-results/gif-${kind}-${seed}`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  await page.goto(`http://127.0.0.1:${PORT}/scripts/hex-jelly.html?kind=${kind}&seed=${seed}&t=0.6&roll=1`);
  await page.waitForFunction(() => window.__jelly?.ready, null, { timeout: 120_000 });
  const frames = 36;
  for (let i = 0; i < frames; i++) {
    const t = 0.6 + i * (3.0 / frames);
    await page.evaluate((tt) => window.__jelly.draw(tt), t);
    await page.screenshot({ path: `${dir}/${String(i).padStart(3, "0")}.png` });
  }
} finally {
  await browser.close();
  await vite.close();
}
const out = `test-results/jelly-${kind}-${seed}-roll.gif`;
execFileSync("python3", ["-c", `import glob\nfrom PIL import Image\nf=[Image.open(p).convert("P", palette=Image.ADAPTIVE) for p in sorted(glob.glob("${dir}/*.png"))]\nf[0].save("${out}", save_all=True, append_images=f[1:], duration=83, loop=0)`]);
console.log(`wrote ${out}`);
