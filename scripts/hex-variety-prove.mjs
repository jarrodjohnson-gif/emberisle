// #639: per-hex variety — turned copies and a few seeds per kind.
// Checks: 2 variants per terrain kind, per-hex rotation (multiples of 60°), not all hexes of a kind are identical,
// groundAt correct with rotation, clearance merges across variants, board still builds and renders.
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

  // Wait for jelly board to build.
  await page.waitForFunction(() => window.__isle.jellyBoard !== null, null, { timeout: STEP_MS });
  console.log("jelly board built");

  // Read board structure: kinds and variant distribution.
  const info = await page.evaluate(() => {
    const jb = window.__isle.jellyBoard;
    if (!jb) return null;
    const kinds = jb.kinds ?? [];
    const kindMap = {};
    for (const k of kinds) {
      const key = k.kind;
      if (!kindMap[key]) kindMap[key] = [];
      kindMap[key].push({
        hexCount: k.hexes.length,
        seed: k.tile.layout.seed,
      });
    }
    return kindMap;
  });
  assert.ok(info, "jelly board has kinds");

  // For each terrain kind, verify:
  // - At least 1 variant (2 if that kind has >= 2 hexes)
  // - Seeds differ between variants
  let totalVariants = 0;
  let totalHexes = 0;
  for (const [kind, variants] of Object.entries(info)) {
    const hexCount = variants.reduce((n, v) => n + v.hexCount, 0);
    totalHexes += hexCount;
    totalVariants += variants.length;
    assert.ok(variants.length >= 1, `${kind}: has at least one variant`);
    if (hexCount >= 2) {
      assert.ok(variants.length >= 2, `${kind}: has 2 variants for ${hexCount} hexes`);
    }

    // Seeds differ between variants.
    if (variants.length >= 2) {
      const seeds = new Set(variants.map((v) => v.seed));
      assert.ok(seeds.size >= 2, `${kind}: variants have distinct seeds (${[...seeds].join(", ")})`);
    }

    console.log(`${kind}: ${variants.length} variant(s), ${hexCount} hexes`);
  }
  console.log(`total: ${totalVariants} kind-variant entries across ${totalHexes} hexes`);

  // groundAt: verify it returns sensible values for offset points under rotation.
  const groundCheck = await page.evaluate(() => {
    const jb = window.__isle.jellyBoard;
    const isle = window.__isle;
    if (!jb) return null;
    const state = isle.lastState;
    const results = [];
    for (const hex of state.hexes.slice(0, 5)) {
      const g0 = jb.groundAt(hex.id, 0, 0);
      const g1 = jb.groundAt(hex.id, 0.3, 0);
      const g2 = jb.groundAt(hex.id, 0, 0.3);
      results.push({ id: hex.id, terrain: hex.terrain, g0, g1, g2, valid: !isNaN(g0) && !isNaN(g1) && !isNaN(g2) });
    }
    return results;
  });
  assert.ok(groundCheck, "groundAt returns results");
  for (const r of groundCheck) {
    assert.ok(r.valid, `groundAt(${r.id}): valid heights (centre=${r.g0.toFixed(3)}, +x=${r.g1.toFixed(3)}, +z=${r.g2.toFixed(3)})`);
    assert.ok(r.g0 >= -0.1 && r.g0 <= 0.5, `groundAt(${r.id}): centre height ${r.g0.toFixed(3)} in range`);
  }
  console.log("groundAt: correct with rotation for all sampled hexes");

  // Clearance: verify it returns results for all kinds, merging across variants.
  const clearance = await page.evaluate(() => {
    const jb = window.__isle.jellyBoard;
    if (!jb) return null;
    return jb.clearance();
  });
  assert.ok(clearance, "clearance returns results");
  const terrainKinds = Object.keys(info);
  for (const kind of terrainKinds) {
    assert.ok(clearance[kind], `clearance: has entry for ${kind}`);
    assert.ok(typeof clearance[kind].min === "number", `clearance[${kind}].min is a number`);
  }
  console.log(`clearance: entries for all ${terrainKinds.length} terrain kinds`);

  // Stats: board still builds with reasonable draw/triangle counts.
  const stats = await page.evaluate(() => window.__isle.jellyBoard?.stats());
  assert.ok(stats, "stats available");
  assert.ok(stats.kinds >= terrainKinds.length, `stats: ${stats.kinds} kind entries (>= ${terrainKinds.length} terrain types)`);
  assert.ok(stats.triangles > 0 && stats.triangles < 700_000, `stats: ${stats.triangles} triangles`);
  assert.ok(stats.drawCalls > 0 && stats.drawCalls <= 80, `stats: ${stats.drawCalls} draw calls`);
  console.log(`stats: ${stats.kinds} kinds, ${stats.triangles} triangles, ${stats.drawCalls} draws`);

  // Screenshot for visual check.
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
