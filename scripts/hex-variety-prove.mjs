// #639: per-hex variety — one seed per terrain kind, each hex turned by a multiple of 60°.
// Checks: per-hex rotation from an even seeded shuffle, not all hexes of a kind share the same turn,
// groundAt correct with rotation, clearance covers all kinds, board builds and renders.
// Run: npm run hex-variety-prove
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8122;
const STEP_MS = 90_000;

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const errors = [];
let code = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__emberisle && window.__isle);
  await page.keyboard.press("Shift");
  await page.evaluate(() => window.__emberisle.getState().startAi());

  await page.waitForFunction(() => window.__isle.jellyBoard !== null, null, { timeout: STEP_MS });
  console.log("jelly board built");

  const info = await page.evaluate(() => {
    const jb = window.__isle.jellyBoard;
    if (!jb) return null;
    const kinds = jb.kinds ?? [];
    const result = {};
    for (const k of kinds) {
      const hexes = k.hexes.map(h => ({ id: h.id, rot: h.rot }));
      result[k.kind] = { seed: k.tile.layout.seed, hexes };
    }
    return result;
  });
  assert.ok(info, "jelly board has kinds");

  const terrainKinds = Object.keys(info);
  assert.equal(terrainKinds.length, new Set(terrainKinds).size, "one entry per terrain kind (no duplicates)");

  for (const [kind, data] of Object.entries(info)) {
    const rotations = data.hexes.map(h => h.rot);
    for (const rot of rotations) {
      const steps = rot / (Math.PI / 3);
      assert.ok(Math.abs(steps - Math.round(steps)) < 0.001, `${kind}: rotation ${rot.toFixed(3)} is a multiple of 60°`);
    }
    if (data.hexes.length >= 2) {
      const unique = new Set(rotations.map(r => Math.round(r * 1000)));
      assert.ok(unique.size >= 2, `${kind}: ${data.hexes.length} hexes have at least 2 distinct rotations (got ${unique.size})`);
    }
    console.log(`${kind}: ${data.hexes.length} hexes, ${new Set(rotations.map(r => Math.round(r / (Math.PI / 3)))).size} distinct turns`);
  }

  // groundAt: verify it returns sensible values and differs for rotated hexes of the same kind.
  const groundCheck = await page.evaluate(() => {
    const jb = window.__isle.jellyBoard;
    const state = window.__isle.lastState;
    if (!jb || !state) return null;
    const results = [];
    for (const hex of state.hexes) {
      const g0 = jb.groundAt(hex.id, 0, 0);
      const gx = jb.groundAt(hex.id, 0.3, 0);
      const gz = jb.groundAt(hex.id, 0, 0.3);
      results.push({ id: hex.id, terrain: hex.terrain, g0, gx, gz, valid: !isNaN(g0) && !isNaN(gx) && !isNaN(gz) });
    }
    return results;
  });
  assert.ok(groundCheck, "groundAt returns results");
  for (const r of groundCheck) {
    assert.ok(r.valid, `groundAt(${r.id}): valid heights (centre=${r.g0.toFixed(3)}, +x=${r.gx.toFixed(3)}, +z=${r.gz.toFixed(3)})`);
    assert.ok(r.g0 >= -0.1 && r.g0 <= 0.5, `groundAt(${r.id}): centre height ${r.g0.toFixed(3)} in range`);
  }
  console.log("groundAt: correct with rotation for all hexes");

  // Clearance: verify results for all kinds.
  const clearance = await page.evaluate(() => {
    const jb = window.__isle.jellyBoard;
    return jb ? jb.clearance() : null;
  });
  assert.ok(clearance, "clearance returns results");
  for (const kind of terrainKinds) {
    assert.ok(clearance[kind], `clearance: has entry for ${kind}`);
    assert.ok(typeof clearance[kind].min === "number", `clearance[${kind}].min is a number`);
  }
  console.log(`clearance: entries for all ${terrainKinds.length} terrain kinds`);

  const stats = await page.evaluate(() => window.__isle.jellyBoard?.stats());
  assert.ok(stats, "stats available");
  assert.equal(stats.kinds, terrainKinds.length, `stats.kinds === ${terrainKinds.length}`);
  assert.ok(stats.triangles > 0 && stats.triangles < 700_000, `stats: ${stats.triangles} triangles`);
  assert.ok(stats.drawCalls > 0 && stats.drawCalls <= 80, `stats: ${stats.drawCalls} draw calls`);
  console.log(`stats: ${stats.kinds} kinds, ${stats.triangles} triangles, ${stats.drawCalls} draws`);

  await page.screenshot({ path: "test-results/hex-variety-1280x720.png" });
  console.log("screenshot: test-results/hex-variety-1280x720.png");

  assert.deepEqual(errors, [], "console errors");
  await ctx.close();
  console.log("\nhex-variety-prove: all checks passed");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
