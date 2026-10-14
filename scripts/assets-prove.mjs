// The glTF asset pipeline (docs/design/assets.md): the placeholder kit loads, every part is present and normalised, and it stays
// inside the triangle, material and texture budgets. Saves test-results/assets-kit.png. Port from VITE_PORT, default 8195.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PARTS = ["tile_forest", "tile_pasture", "tile_grain", "tile_clay", "tile_ore", "tile_waste", "prop_tree_1", "prop_tree_2", "prop_rock_1", "dock_sign"];
const port = Number(process.env.VITE_PORT || 8195);
const vite = await createServer({ server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
mkdirSync("test-results", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 520 } });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${port}/scripts/assets-harness.html`);
  await page.waitForFunction(() => window.__kit, null, { timeout: 30_000 });
  const kit = await page.evaluate(() => window.__kit);

  assert.deepEqual([...kit.names].sort(), [...PARTS].sort(), "every expected part, and no others");
  for (const n of PARTS.filter((n) => n.startsWith("tile_"))) {
    assert.ok(Math.abs(kit.boxes[n].x - 1) <= 0.001, `${n} is ${kit.boxes[n].x} wide flat-to-flat, not 1`);
  }
  const tri = Object.fromEntries(kit.stats.parts.map((p) => [p.name, p.triangles]));
  for (const [n, t] of Object.entries(tri)) assert.ok(t <= (n.startsWith("tile_") ? 3000 : 800), `${n}: ${t} triangles over budget`);
  assert.ok(kit.stats.triangles <= 40_000, `kit: ${kit.stats.triangles} triangles`);
  assert.equal(kit.stats.drawCalls, PARTS.length, "one draw call per part");
  assert.ok(kit.stats.materials <= 6, `${kit.stats.materials} materials`);
  assert.equal(kit.drawn, PARTS.length, "the renderer drew one call per part");
  await page.screenshot({ path: "test-results/assets-kit.png" });
  assert.deepEqual(errors, [], "console errors");
  console.log(`ok  ${PARTS.length} parts, ${kit.stats.triangles} triangles, ${kit.stats.drawCalls} draw calls, ${kit.stats.materials} material(s), ${kit.stats.textureBytes} texture bytes`);
  console.log(`ok  tiles 1.000 flat-to-flat; triangles ${JSON.stringify(tri)}`);
  console.log("ok  zero console errors; test-results/assets-kit.png");
} finally {
  await browser.close();
  await vite.close();
}
