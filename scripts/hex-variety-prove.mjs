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
    // Dealt evenly (a seeded shuffle of a balanced deal, not coin flips): turn counts within a kind differ by at most 1.
    const counts = {};
    for (const r of rotations) { const k = Math.round(r / (Math.PI / 3)); counts[k] = (counts[k] ?? 0) + 1; }
    const used = Object.values(counts);
    assert.ok(Math.max(...used) - Math.min(...used) <= 1, `${kind}: turns dealt evenly ${JSON.stringify(counts)}`);
    console.log(`${kind}: ${data.hexes.length} hexes, ${new Set(rotations.map(r => Math.round(r / (Math.PI / 3)))).size} distinct turns`);
  }

  // groundAt must match the rendered tile: the height of the tile's own ground at the point found by inverting the
  // hex's actual rendering matrix T (a general 3x3 inverse here, not the implementation's shortcut).
  const exact = await page.evaluate(() => {
    const jb = window.__isle.jellyBoard;
    const inv3 = (m) => {
      const [a, b, c, d, e, f, g, h, i] = m;
      const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
      const det = a * A + b * B + c * C;
      return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
    };
    const offsets = [[0.31, 0.17], [-0.22, 0.29], [0.12, -0.33], [-0.27, -0.14]];
    let checked = 0, worst = 0, discriminating = 0;
    for (const k of jb.kinds) {
      for (const h of k.hexes) {
        const t = h.T.elements;
        // Row-major 3x3 rotation part of T (Three stores columns).
        const R = [t[0], t[4], t[8], t[1], t[5], t[9], t[2], t[6], t[10]];
        const Ri = inv3(R);
        for (const [dx, dz] of offsets) {
          const lx = Ri[0] * dx + Ri[2] * dz, lz = Ri[6] * dx + Ri[8] * dz;
          const want = t[13] + k.tile.ground(lx, lz);
          const got = jb.groundAt(h.id, dx, dz);
          worst = Math.max(worst, Math.abs(got - want));
          checked++;
          // The opposite turn: if it lands on a different height, this sample would catch a wrong-way rotation.
          const wrong = t[13] + k.tile.ground(R[0] * dx + R[2] * dz, R[6] * dx + R[8] * dz);
          if (Math.abs(wrong - want) > 1e-3) discriminating++;
        }
      }
    }
    return { checked, worst, discriminating };
  });
  assert.ok(exact.checked > 0, "groundAt: samples taken");
  assert.ok(exact.worst < 1e-6, `groundAt: matches the inverse of the rendering matrix (worst error ${exact.worst})`);
  assert.ok(exact.discriminating > 0, `groundAt: at least one sample tells the two turn directions apart (${exact.discriminating})`);
  console.log(`groundAt: ${exact.checked} samples match the rendered tile (worst ${exact.worst.toExponential(1)}), ${exact.discriminating} discriminating`);

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
