// #634: replay the offending ore seed, then sweep deterministic layouts against check 7's numeral samples.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const port = Number(process.env.VITE_PORT) || 8099;
const vite = await createServer({ server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 680 } });
  await page.addInitScript(() => localStorage.setItem("emberisle-jelly", "full"));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() => window.__isle?.landReady && window.__isle.fit && !window.__isle.refitDue && !window.__isle.glide, null, { timeout: 120_000 });
  await page.waitForFunction((r) => window.__isle.renders > r + 2, await page.evaluate(() => window.__isle.renders));
  const results = await page.evaluate(async () => {
    const { JellyBoard } = await import("/src/lib/scene/jelly-board.ts");
    const { worldOfHex } = await import("/src/lib/game/board.ts");
    const { topOf } = await import("/src/lib/scene/isle-renderer.ts");
    const { BLOCK_H } = await import("/src/lib/scene/jelly-dims.ts");
    const isle = window.__isle;
    const V = isle.persp.position.constructor;
    // Ore at every lattice position covers every possible ore/token neighbour, independent of the random island deal.
    const hexes = isle.lastState.hexes.map((h) => ({ id: h.id, terrain: "ore", ...worldOfHex(h), y: topOf("ore") - BLOCK_H }));
    if (isle.view !== "diorama" || hexes.length !== 19) throw new Error("expected the 19-hex diorama");
    // Put the reported numeral 11 at every lattice position, including the desert position.
    // Its transform and five glyph coordinates are exactly check 7's; only the hex translation changes.
    const groups = isle.land.children.filter((o) => o.userData?.token != null);
    if (groups.length !== 18) throw new Error("expected 18 numbered tokens");
    const g = groups.find((o) => o.userData.token === 11);
    if (!g) throw new Error("missing numeral 11");
    const samples = hexes.flatMap((hex) => {
      g.updateMatrixWorld(true);
      const label = g.children[1];
      const img = label.material.map.image.getContext("2d").getImageData(0, 0, 256, 186).data;
      const rows = [];
      for (let y = 0; y < 186; y++) for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        if (img[i + 3] > 0 && 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2] < 128) { rows.push(y); break; }
      }
      if (!rows.length) throw new Error("empty numeral glyph");
      const top = rows[0], bottom = rows.at(-1) + 1, mid = (top + bottom) / 2;
      return [[128, mid], [128, top + 4], [128, bottom - 4], [88, mid], [168, mid]].map(([cx, cy]) => ({
        n: 11, v: label.localToWorld(new V((cx / 128 - 1) * 0.245, (1 - cy / 128) * 0.245, 0)).add(new V(hex.x - g.position.x, 0, hex.z - g.position.z)),
      }));
    });
    if (samples.length !== 95 || samples.some(({ v }) => ![v.x, v.y, v.z].every(Number.isFinite))) {
      throw new Error("expected 95 finite numeral samples");
    }
    const seeds = [3564299252];
    for (let i = 0; i < 31; i++) seeds.push((Math.imul(i + 1, 2654435761) >>> 0));
    const results = [];
    for (const seed of seeds) {
      const board = await JellyBoard.create(hexes, () => seed, async () => true, false);
      const hidden = [];
      if (!board) throw new Error("expected full ore scenery");
      board.update(1, true, true);
      for (const { n, v } of samples) {
        const hit = board.occludes(isle.persp.position, v);
        if (hit) hidden.push({ n, ...hit });
      }
      board.dispose();
      results.push({ seed, points: samples.length, hidden });
    }
    return results;
  });
  for (const r of results) console.log(`${r.hidden.length ? "FAIL" : "ok"} ore seed ${r.seed}: ${r.hidden.length}/${r.points} hidden${r.hidden.length ? " " + JSON.stringify(r.hidden) : ""}`);
  assert.equal(results.length, 32, "expected 32 ore seeds");
  console.log(`ore-tokens-prove: ${results.length} seeds, ${results.reduce((n, r) => n + r.points, 0)} numeral samples`);
  assert.equal(results.flatMap((r) => r.hidden).length, 0, "ore hides numeral samples");
} finally {
  await browser.close();
  await vite.close();
}
