// The hex studio (docs/design/terrain.md "The studio"): each terrain's sculpted hex alone, large, at the diorama's angle under
// the board's light rig on the paper, to judge a tile's ground and props by eye. Not in CI. Writes, in test-results/:
// - hex-<terrain>.png (1024x768) for each terrain asked for (all six by default);
// - hex-neighbours.png: the first of them in a ring of six neighbours of mixed kinds, so rims and strata read together;
// - hex-sheet.png: the six hex-<terrain>.png on one sheet.
// Flags: --bare (no props: hex-<terrain>-ground.png), --variant <n> (the n-th hex of the kind on the demo board: -v<n>).
// Headless Chromium here is SwiftShader: judge shape, relief, shadow and composition, not saturation.
// Run: npm run hex-studio [-- timber ore --bare]
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const KINDS = ["timber", "wool", "grain", "clay", "ore", "waste"];
const args = process.argv.slice(2);
const bare = args.includes("--bare");
const vi = args.indexOf("--variant");
const variant = vi >= 0 ? Number(args[vi + 1]) : 0;
const asked = args.filter((a, i) => KINDS.includes(a) && args[i - 1] !== "--variant");
const kinds = asked.length ? asked : KINDS;
const suffix = `${bare ? "-ground" : ""}${variant ? `-v${variant}` : ""}`;
const PORT = Number(process.env.VITE_PORT) || 8131;

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
mkdirSync("test-results", { recursive: true });
const errors = [];
let failed = false;

async function shoot(query, file) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  page.on("console", (m) => m.type() === "error" && errors.push(`${file}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${file}: ${e}`));
  await page.goto(`http://127.0.0.1:${PORT}/scripts/hex-studio.html?${query}`);
  await page.waitForFunction(() => window.__studio?.ready, null, { timeout: 120_000 });
  await page.screenshot({ path: file });
  await page.close();
  console.log(`wrote ${file}`);
}

try {
  const q = (t) => `terrain=${t}&variant=${variant}${bare ? "&props=0" : ""}`;
  for (const t of kinds) await shoot(q(t), `test-results/hex-${t}${suffix}.png`);
  await shoot(`${q(kinds[0])}&ring=1`, `test-results/hex-neighbours${suffix}.png`);
  // The sheet: the six shots at half size, three across, each named.
  const shots = KINDS.map((t) => [t, `test-results/hex-${t}${suffix}.png`]).filter(([, f]) => existsSync(f));
  const page = await browser.newPage({ viewport: { width: 1536, height: 768 } });
  await page.setContent(`<body style="margin:0;background:#f1efe9;display:grid;grid-template-columns:repeat(3,512px);font:600 15px system-ui">${shots
    .map(([t, f]) => `<figure style="margin:0;position:relative"><img style="display:block;width:512px;height:384px" src="data:image/png;base64,${readFileSync(f).toString("base64")}"><figcaption style="position:absolute;left:12px;top:10px;color:#3a3530">${t}</figcaption></figure>`)
    .join("")}</body>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.screenshot({ path: `test-results/hex-sheet${suffix}.png` });
  console.log(`wrote test-results/hex-sheet${suffix}.png (${shots.length} hexes)`);
  if (errors.length) {
    failed = true;
    console.log("console errors:\n" + errors.join("\n"));
  }
} catch (e) {
  failed = true;
  console.error("hex-studio failed:", e);
} finally {
  await browser.close();
  await vite.close();
}
process.exit(failed ? 1 : 0);
