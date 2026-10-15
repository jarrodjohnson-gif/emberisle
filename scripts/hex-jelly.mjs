// Screenshots the Hex Jelly studio (docs/design/hex-jelly-prompt.md): test-results/jelly-<kind>-<seed>.png for each kind and
// seed asked, 1024x768, frozen at --t seconds. Headless Chromium here is SwiftShader. Run: node scripts/hex-jelly.mjs [timber]
// [--seeds 7,11,23] [--t 2.05]
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const KINDS = ["timber", "wool", "grain", "clay", "ore", "waste"];
const args = process.argv.slice(2);
const si = args.indexOf("--seeds");
const seeds = si >= 0 ? args[si + 1].split(",").map(Number) : [7];
const kinds = args.filter((a) => KINDS.includes(a));
const ti = args.indexOf("--t");
// The moment the shot freezes: a salmon in mid-leap, the doe drinking.
const T = ti >= 0 ? Number(args[ti + 1]) : 2.05;
const fi = args.indexOf("--focus");
// Close-ups: the whole tile, then each story spot asked (pool, camp).
const views = ["", ...(fi >= 0 ? args[fi + 1].split(",") : [])];
const PORT = Number(process.env.VITE_PORT) || 8132;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
mkdirSync("test-results", { recursive: true });
let failed = false;
try {
  for (const kind of kinds.length ? kinds : ["timber"])
    for (const seed of seeds)
    for (const view of views) {
      const errors = [];
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(`http://127.0.0.1:${PORT}/scripts/hex-jelly.html?kind=${kind}&seed=${seed}&t=${T}${view ? `&focus=${view}` : ""}`);
      await page.waitForFunction(() => window.__jelly?.ready, null, { timeout: 120_000 }).catch((e) => {
        throw new Error(errors.join(" | ") || e.message);
      });
      const file = `test-results/jelly-${kind}-${seed}${view ? `-${view}` : ""}.png`;
      await page.screenshot({ path: file });
      console.log(`wrote ${file}`, JSON.stringify(await page.evaluate(() => window.__jelly.info)));
      if (errors.length) (failed = true), console.log("console errors:", errors.join(" | "));
      await page.close();
    }
} catch (e) {
  failed = true;
  console.error("hex-jelly failed:", e);
} finally {
  await browser.close();
  await vite.close();
}
process.exit(failed ? 1 : 0);
