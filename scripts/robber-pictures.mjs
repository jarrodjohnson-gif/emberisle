// #826: Pictures of blocked hex vs normal across all five terrains at 4 viewports,
// plus comparison pictures at 25%, 50%, and 75% black, and zoomed crops for owner cards.
// Run: node --import ./server/register.mjs scripts/robber-pictures.mjs
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
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

    // Ensure dim is at default 0.50
    await page.evaluate(() => window.__isle.setRobberHexDim(0.5));

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
        const pos = tokenObj ? tokenObj.position.clone() : isle.robberTarget.clone();
        pos.project(isle.camera);
        const w = window.innerWidth;
        const h = window.innerHeight;
        const cx = Math.round((pos.x * 0.5 + 0.5) * w);
        const cy = Math.round((-pos.y * 0.5 + 0.5) * h);
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
        const pos = tokenObj ? tokenObj.position.clone() : isle.robberTarget.clone();
        pos.project(isle.camera);
        const w = window.innerWidth;
        const h = window.innerHeight;
        const cx = Math.round((pos.x * 0.5 + 0.5) * w);
        const cy = Math.round((-pos.y * 0.5 + 0.5) * h);
        const size = Math.min(w, h, w > 800 ? 280 : 200);
        const half = Math.round(size / 2);
        const x = Math.max(0, Math.min(w - size, cx - half));
        const y = Math.max(0, Math.min(h - size, cy - half));
        return { x, y, width: size, height: size };
      });
      for (const pct of [25, 50, 75]) {
        await page.evaluate((dim) => window.__isle.setRobberHexDim(dim), pct / 100);
        await drawn(page, 3);
        await page.screenshot({ path: `docs/proofs/826/robber-dim-${pct}pct-${tag}.png` });
        await page.screenshot({ path: `docs/proofs/826/robber-dim-${pct}pct-crop-${tag}.png`, clip: grainCrop });
        console.log(`  dim ${pct}% (and crop) captured for ${tag}`);
      }
      await page.evaluate(() => window.__isle.setRobberHexDim(0.5));
    }

    await ctx.close();
  }
} finally {
  await browser.close();
  await vite.close();
}

console.log("robber-pictures: all proof captures saved to docs/proofs/826/");
