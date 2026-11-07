// #826: Pictures of blocked hex vs normal across all five terrains at 4 viewports,
// plus comparison pictures at 25%, 50%, and 75% black, and zoomed crops for owner cards.
// Run: node --import ./server/register.mjs scripts/robber-pictures.mjs
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";

const STEP_MS = 30_000;
const PORT = Number(process.env.VITE_PORT) || 8128;

function mainGame(seed = 11) {
  let g = createGame({ humans: [{ name: "Ember" }], bots: 3, seed });
  while (g.phase !== "roll") g = applyAction(g, g.current, chooseBotAction(g, g.current)).state;
  g.phase = "main";
  g.current = "p0";
  g.dice = [3, 4];
  return g;
}

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

mkdirSync("docs/proofs/826", { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const drawn = (page, n, ms = 30_000) =>
  page.evaluate(
    async ([n, ms]) => {
      const isle = window.__isle;
      const r0 = isle.renders;
      const t0 = performance.now();
      isle.wake?.();
      await new Promise((res, rej) => {
        const poll = () =>
          isle.renders >= r0 + n
            ? res()
            : performance.now() - t0 > ms
              ? rej(new Error(`drawn: ${n} frame(s) never came`))
              : requestAnimationFrame(poll);
        poll();
      });
    },
    [n, ms],
  );

const VIEWPORTS = [
  { w: 320, h: 568, isMobile: true, hasTouch: true },
  { w: 390, h: 844, isMobile: true, hasTouch: true },
  { w: 844, h: 390, isMobile: true, hasTouch: true },
  { w: 1280, h: 720, isMobile: false, hasTouch: false },
];

const TERRAINS = ["timber", "clay", "wool", "grain", "ore"];

try {
  for (const { w, h, isMobile, hasTouch } of VIEWPORTS) {
    const tag = `${w}x${h}`;
    console.log(`capturing viewports for ${tag}...`);
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      isMobile,
      hasTouch,
      deviceScaleFactor: 1,
    });
    await ctx.addInitScript(() => {
      localStorage.setItem("emberisle-water", "simple");
      localStorage.setItem("emberisle-jelly", "full");
    });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });

    const game = mainGame(11);
    await page.evaluate((g) => {
      window.__emberisle.getState().startAi();
      window.__emberisle.setState({ state: g, buildMode: "none", pendingPlace: null, error: null, toast: null });
    }, game);

    await page.waitForFunction(() => window.__isle?.lastState && window.__isle.landReady && !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
    await drawn(page, 3);

    // Ensure dim is at default 0.95
    await page.evaluate(() => window.__isle.setRobberHexDim(0.95));

    // Capture each terrain: blocked vs normal
    for (const terrain of TERRAINS) {
      // 1. Blocked
      await page.evaluate((ter) => {
        const g = window.__emberisle;
        const isle = window.__isle;
        const st = structuredClone(g.getState().state);
        const hex = st.hexes.find((h) => h.terrain === ter && h.pip != null);
        if (!hex) throw new Error(`terrain ${ter} not found`);
        st.robberHex = hex.id;
        for (const h of st.hexes) h.blocked = h.id === hex.id;
        st.seq += 1;
        g.setState({ state: st });
        isle.walk = null;
        isle.wayfarer.position.copy(isle.robberTarget);
        isle.wake();
      }, terrain);
      await drawn(page, 3);
      await page.screenshot({ path: `docs/proofs/826/${terrain}-blocked-${tag}.png` });

      // Zoomed crop of blocked hex for owner comparison
      const crop = await page.evaluate((ter) => {
        const g = window.__emberisle;
        const isle = window.__isle;
        const st = g.getState().state;
        const hex = st.hexes.find((h) => h.terrain === ter && h.pip != null);
        const tokenObj = isle.tokens.find((t) => t.userData.hex === hex.id);
        const worldPos = isle.robberTarget.clone();
        if (tokenObj) tokenObj.getWorldPosition(worldPos);
        const pt = isle.screenAt(worldPos.x, worldPos.y, worldPos.z);
        const w = window.innerWidth;
        const h = window.innerHeight;
        const cx = Math.round(pt.x);
        const cy = Math.round(pt.y);
        const size = Math.min(w, h, w > 800 ? 280 : 200);
        const half = Math.round(size / 2);
        const x = Math.max(0, Math.min(w - size, cx - half));
        const y = Math.max(0, Math.min(h - size, cy - half));
        return { x, y, width: size, height: size };
      }, terrain);
      await page.screenshot({ path: `docs/proofs/826/${terrain}-blocked-crop-${tag}.png`, clip: crop });

      // 2. Normal (unblocked)
      await page.evaluate(() => {
        const g = window.__emberisle;
        const isle = window.__isle;
        const st = structuredClone(g.getState().state);
        const waste = st.hexes.find((h) => h.terrain === "waste");
        st.robberHex = waste.id;
        for (const h of st.hexes) h.blocked = false;
        st.seq += 1;
        g.setState({ state: st });
        isle.walk = null;
        isle.wayfarer.position.copy(isle.robberTarget);
        isle.wake();
      });
      await drawn(page, 3);
      await page.screenshot({ path: `docs/proofs/826/${terrain}-normal-${tag}.png` });
      await page.screenshot({ path: `docs/proofs/826/${terrain}-normal-crop-${tag}.png`, clip: crop });
      console.log(`  ${terrain}: blocked & normal (and crops) captured for ${tag}`);
    }

    // Comparison across 25%, 50%, and 75% black (on desktop and mobile)
    if (tag === "1280x720" || tag === "390x844") {
      // Put robber on grain
      const grainCrop = await page.evaluate(() => {
        const g = window.__emberisle;
        const isle = window.__isle;
        const st = structuredClone(g.getState().state);
        const grain = st.hexes.find((h) => h.terrain === "grain" && h.pip != null);
        st.robberHex = grain.id;
        for (const h of st.hexes) h.blocked = h.id === grain.id;
        st.seq += 1;
        g.setState({ state: st });
        isle.walk = null;
        isle.wayfarer.position.copy(isle.robberTarget);
        isle.wake();
        const tokenObj = isle.tokens.find((t) => t.userData.hex === grain.id);
        const worldPos = isle.robberTarget.clone();
        if (tokenObj) tokenObj.getWorldPosition(worldPos);
        const pt = isle.screenAt(worldPos.x, worldPos.y, worldPos.z);
        const w = window.innerWidth;
        const h = window.innerHeight;
        const cx = Math.round(pt.x);
        const cy = Math.round(pt.y);
        const size = Math.min(w, h, w > 800 ? 280 : 200);
        const half = Math.round(size / 2);
        const x = Math.max(0, Math.min(w - size, cx - half));
        const y = Math.max(0, Math.min(h - size, cy - half));
        return { x, y, width: size, height: size };
      });
      for (const pct of [25, 50, 75, 85, 95]) {
        await page.evaluate((dim) => window.__isle.setRobberHexDim(dim), pct / 100);
        await drawn(page, 3);
        await page.screenshot({ path: `docs/proofs/826/robber-dim-${pct}pct-${tag}.png` });
        await page.screenshot({ path: `docs/proofs/826/robber-dim-${pct}pct-crop-${tag}.png`, clip: grainCrop });
        console.log(`  dim ${pct}% (and crop) captured for ${tag}`);
      }
      await page.evaluate(() => window.__isle.setRobberHexDim(0.95));

      if (tag === "1280x720") {
        const compHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; background: #121212; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; display: inline-block; }
  h1 { margin: 0 0 16px 0; font-size: 20px; font-weight: 600; text-align: center; }
  .grid { display: flex; gap: 20px; }
  .card { display: flex; flex-direction: column; align-items: center; background: #1e1e1e; border: 1px solid #333; border-radius: 10px; padding: 12px; }
  .label { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .sub { font-size: 13px; color: #aaa; margin-bottom: 10px; }
  img { border: 1px solid #444; border-radius: 6px; width: 280px; height: 280px; display: block; }
</style>
</head>
<body>
  <h1>Robber Hex Dim Comparison: 75% vs 85% vs 95% Black</h1>
  <div class="grid">
    <div class="card">
      <div class="label">75% Black</div>
      <div class="sub">ROBBER_HEX_DIM = 0.75</div>
      <img src="data:image/png;base64,${readFileSync("docs/proofs/826/robber-dim-75pct-crop-1280x720.png").toString("base64")}">
    </div>
    <div class="card">
      <div class="label">85% Black</div>
      <div class="sub">ROBBER_HEX_DIM = 0.85</div>
      <img src="data:image/png;base64,${readFileSync("docs/proofs/826/robber-dim-85pct-crop-1280x720.png").toString("base64")}">
    </div>
    <div class="card" style="border-color: #66afe9;">
      <div class="label" style="color: #66afe9;">95% Black (Selected)</div>
      <div class="sub">ROBBER_HEX_DIM = 0.95</div>
      <img src="data:image/png;base64,${readFileSync("docs/proofs/826/robber-dim-95pct-crop-1280x720.png").toString("base64")}">
    </div>
  </div>
</body>
</html>`;
        const compPage = await ctx.newPage();
        await compPage.setContent(compHtml);
        const compElem = await compPage.$("body");
        await compElem.screenshot({ path: "docs/proofs/826/robber-dim-comparison-75-85-95.png" });
        await compPage.close();
        console.log("  side-by-side comparison image captured: docs/proofs/826/robber-dim-comparison-75-85-95.png");
      }
    }

    await ctx.close();
  }
} finally {
  await browser.close();
  await vite.close();
}

console.log("robber-pictures: all proof captures saved to docs/proofs/826/");
