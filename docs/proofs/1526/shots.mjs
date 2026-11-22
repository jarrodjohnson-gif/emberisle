// #1526: real-game PNG captures for the inward side-dock goods placement.
// Reuses docs/proofs/1509/table.json so before/after comparisons show the same board.
// Run from repo root: node docs/proofs/1526/shots.mjs
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const OUT = "docs/proofs/1526";
const TABLE = "docs/proofs/1509/table.json";
const PORT = 8526;
const closeupsOnly = process.argv.includes("--closeups");
const only440 = process.argv.includes("--440");
const SIZES = only440
  ? [{ w: 440, h: 956, insets: { top: 62, right: 0, bottom: 34, left: 0 } }]
  : closeupsOnly
    ? [{ w: 430, h: 932, insets: { top: 59, right: 0, bottom: 34, left: 0 } }]
    : [
        { w: 440, h: 956, insets: { top: 62, right: 0, bottom: 34, left: 0 } },
        { w: 430, h: 932, insets: { top: 59, right: 0, bottom: 34, left: 0 } },
        { w: 390, h: 844, insets: { top: 0, right: 0, bottom: 34, left: 0 } },
        { w: 820, h: 1180, insets: { top: 24, right: 0, bottom: 20, left: 0 } },
        { w: 844, h: 390, insets: { top: 0, right: 47, bottom: 21, left: 47 } },
      ];

mkdirSync(OUT, { recursive: true });

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];

async function waitStable(page) {
  await page.waitForFunction(
    () =>
      window.__isle?.shore?.group.userData.goodsPiles?.length === 9 &&
      !window.__isle.refitDue &&
      !window.__isle.glide &&
      window.__isle.fit,
    null,
    { timeout: 60_000 },
  );
  await page.evaluate(async () => {
    const isle = window.__isle;
    const start = isle.renders;
    isle.wake();
    await new Promise((r) => {
      const p = () => (isle.renders >= start + 3 ? r() : requestAnimationFrame(p));
      p();
    });
  });
}

try {
  const saved = JSON.parse(readFileSync(TABLE, "utf8"));
  for (const { w, h, insets } of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => {
      localStorage.setItem("emberisle-first-game-coach", JSON.stringify("done"));
      localStorage.setItem("emberisle-jelly", "full");
    });
    const page = await ctx.newPage();
    if (insets) await (await ctx.newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets });
    page.on("console", (m) => m.type() === "error" && errors.push(`${w}x${h}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${w}x${h}: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle && window.__isle);
    await page.evaluate((data) => {
      window.__emberisle.setState({ name: "Jarrod" });
      window.__emberisle.getState().startAi();
      window.__emberisle.setState({ state: data.state, gameLog: data.gameLog });
    }, saved);
    await page.getByTestId("turn-banner").waitFor();
    await waitStable(page);
    await page.screenshot({ path: `${OUT}/${w}x${h}.png`, type: "png" });

    const info = await page.evaluate(() => {
      const isle = window.__isle;
      const st = window.__emberisle.getState().state;
      const pts = st.vertices.map((v) => isle.screenOf(v.id)).filter(Boolean);
      const xs = pts.map((p) => p.x);
      const unit = (document.querySelector("canvas").clientWidth / (isle.ortho.right - isle.ortho.left)) * isle.ortho.zoom;
      const shore = 0.42 * unit;
      return {
        islandPx: Math.round(Math.max(...xs) - Math.min(...xs) + 2 * shore),
        gapL: +(Math.min(...xs) - shore).toFixed(1),
        gapR: +(innerWidth - (Math.max(...xs) + shore)).toFixed(1),
      };
    });
    console.log(`saved ${OUT}/${w}x${h}.png`, JSON.stringify(info));

    if ((w === 440 && h === 956) || (w === 430 && h === 932)) {
      // Crop the west and east side docks directly from the full upright screen.
      const docks = await page.evaluate(() => {
        const isle = window.__isle;
        const west = isle.screenAt(-5.05, 0.15, 0);
        const eastN = isle.screenAt(4.25, 0.15, -1.9);
        const eastS = isle.screenAt(4.25, 0.15, 1.9);
        return { west, eastN, eastS };
      });
      await page.screenshot({
        path: `${OUT}/crop-${w}x${h}-west-dock.png`,
        type: "png",
        clip: { x: 0, y: Math.max(0, Math.round(docks.west.y - 80)), width: 160, height: 160 },
      });
      await page.screenshot({
        path: `${OUT}/crop-${w}x${h}-east-docks.png`,
        type: "png",
        clip: { x: w - 160, y: Math.max(0, Math.round(docks.eastN.y - 70)), width: 160, height: Math.round(docks.eastS.y - docks.eastN.y + 140) },
      });
      console.log(`saved ${OUT}/crop-${w}x${h}-west-dock.png and crop-${w}x${h}-east-docks.png`);
    }

    if (w === 430 && h === 932) {
      // 3x zoomed close-ups of each side dock in the 40-degree upright overhead camera.
      const focusDock = async (tx, tz, zoom = 3) => {
        await page.evaluate(({ tx, tz, zoom }) => {
          const isle = window.__isle;
          isle.clampPan = () => {};
          isle.applyPose({ ...isle.pose(), tx, tz, zoom });
          isle.wake();
        }, { tx, tz, zoom });
        await page.evaluate(async () => {
          const isle = window.__isle;
          const start = isle.renders;
          isle.wake();
          await new Promise((r) => {
            const p = () => (isle.renders >= start + 3 ? r() : requestAnimationFrame(p));
            p();
          });
        });
        const pt = await page.evaluate(({ tx, tz }) => window.__isle.screenAt(tx, 0.15, tz), { tx, tz });
        return {
          x: Math.max(0, Math.min(w - 320, Math.round(pt.x - 160))),
          y: Math.max(0, Math.min(h - 320, Math.round(pt.y - 160))),
          width: 320,
          height: 320,
        };
      };
      const closeups = [
        { name: "closeup-west-dock-3x", tx: -5.3, tz: 0.0 },
        { name: "closeup-east-north-dock-3x", tx: 4.35, tz: -1.95 },
        { name: "closeup-east-south-dock-3x", tx: 4.35, tz: 1.95 },
      ];
      for (const c of closeups) {
        const clip = await focusDock(c.tx, c.tz, 3);
        await page.screenshot({ path: `${OUT}/${c.name}.png`, type: "png", clip });
        console.log(`saved ${OUT}/${c.name}.png`);
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  await vite.close();
}
if (errors.length) {
  console.error("console errors:", errors);
  process.exit(1);
}
