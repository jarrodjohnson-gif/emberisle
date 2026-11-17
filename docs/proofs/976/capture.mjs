// #976: pictures of the ore climber at fixed board ages, whole screen and a close-up around him. Hand-run, not a proof.
// Usage: node docs/proofs/976/capture.mjs <repoRoot> <outDir> [seed]
// Without a seed it searches from 676 for the first island whose climber falls, and uses that one.
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const [root, outDir, seedArg] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const { chromium } = await import(path.join(root, "node_modules/playwright/index.mjs"));
const { createServer } = await import(path.join(root, "node_modules/vite/dist/node/index.js"));
const port = 8300 + Math.floor(Math.random() * 400);
const vite = await createServer({ root, configFile: path.join(root, "vite.config.ts"), server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const open = async (viewport, seed) => {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, ...(viewport.width < 600 ? { hasTouch: true, isMobile: true } : {}) });
  await ctx.addInitScript(() => {
    localStorage.setItem("emberisle-jelly", "full");
    localStorage.setItem("emberisle-water", "simple");
  });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => typeof window.__emberisle?.getState().startHotseat === "function", null, { timeout: 120_000 });
  await deal(page, seed);
  return { ctx, page };
};
// Pin createGame's synchronous seed draw, as climber-prove does, then start a four-seat hotseat game.
const deal = async (page, seed) => {
  await page.evaluate((seed) => {
    const store = window.__emberisle;
    const start = store.getState().startHotseat;
    const random = Math.random;
    Math.random = () => seed / 1e9;
    try { start(4); } finally { Math.random = random; }
  }, seed);
  await page.waitForFunction(() => window.__emberisle.getState().screen === "play" && window.__isle?.landReady && window.__isle.jellyBoard && !window.__isle.titleMode, null, { timeout: 180_000 });
};
// The first age (step 1 s, up to 600 s) at which a skeleton shows, or -1.
const firstFall = (page) =>
  page.evaluate(() => {
    const jelly = window.__isle.jellyBoard;
    const tile = [...jelly.byHex.values()].find((e) => e.k.kind === "ore").k.tile;
    for (let a = 0; a <= 600; a++) {
      tile.env.age = a;
      tile.update(a);
      let seen = false;
      tile.group.traverse((o) => { if (o.userData?.ref === "skeleton" && o.visible) seen = true; });
      if (seen) { delete tile.env.age; return a; }
    }
    delete tile.env.age;
    return -1;
  });
// Render at a board age; return the climber's (or newest skeleton's) screen point in CSS px.
const at = (page, age) =>
  page.evaluate((age) => {
    const isle = window.__isle;
    isle.renderer.setAnimationLoop(null);
    isle.jellyBoard.setAge(age);
    isle.draw();
    isle.renderer.getContext().finish();
    const entry = [...isle.jellyBoard.byHex.values()].find((e) => e.k.kind === "ore");
    const tile = entry.k.tile;
    let c = null;
    const bones = [];
    tile.group.traverse((o) => {
      if (o.userData?.ref === "climber") c = o;
      if (o.userData?.ref === "skeleton" && o.visible) bones.push(o);
    });
    const target = c.visible ? c : bones[bones.length - 1] ?? c;
    // The tile is a template the board batches into each of its hexes: place it with this hex's transform.
    tile.group.updateMatrixWorld(true);
    const v = target.getWorldPosition(new (target.position.constructor)());
    v.applyMatrix4(entry.h.T);
    isle.jellyBoard.group.updateMatrixWorld(true);
    v.applyMatrix4(isle.jellyBoard.group.matrixWorld);
    // Through the camera in use (the renderer's own helper, which proofs read too).
    return isle.screenAt(v.x, v.y, v.z);
  }, age);

try {
  let seed = Number(seedArg) || 0;
  if (!seed) {
    const { ctx, page } = await open({ width: 1280, height: 720 }, 676);
    for (let s = 676; s < 760 && !seed; s++) {
      if (s > 676) await deal(page, s);
      const f = await firstFall(page);
      console.log(`seed ${s}: first skeleton at ${f}`);
      if (f >= 0) seed = s;
    }
    await ctx.close();
  }
  const views = [[{ width: 1280, height: 720 }, "1280x720"], [{ width: 390, height: 844 }, "390x844"]];
  for (const [viewport, tag] of views) {
    const { ctx, page } = await open(viewport, seed);
    const fall = await firstFall(page);
    // Gear out, two climbing poses a step apart, the slip, the bones, and (after the retries) the summit.
    const ages = { "a-gear": 4, "b-climb": 20, "c-climb-next": 21.4, ...(fall > 0 ? { "d-slip": fall - 1.5, "e-bones": fall + 2 } : {}), "f-summit": 800 };
    for (const [name, age] of Object.entries(ages)) {
      const p = await at(page, age);
      await page.screenshot({ path: `${outDir}/${tag}-${name}.png` });
      // The close-up is a real render, not a crop: the camera draws only a small window around him at full size.
      const zoom = viewport.width < 600 ? 10 : 18;
      const box = await page.evaluate(([p, zoom]) => {
        const isle = window.__isle;
        const cam = isle.cam();
        const r = isle.renderer.domElement.getBoundingClientRect();
        const w = r.width / zoom, h = r.height / zoom;
        cam.setViewOffset(r.width, r.height, p.x - r.left - w / 2, p.y - r.top - h / 2 - h * 0.15, w, h);
        isle.draw();
        isle.renderer.getContext().finish();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      }, [p, zoom]);
      // Only the canvas: the HUD is not part of the close-up.
      await page.evaluate(() => document.querySelectorAll("body *").forEach((el) => { if (!el.contains(window.__isle.renderer.domElement) && el !== window.__isle.renderer.domElement) el.style.visibility = "hidden"; }));
      await page.screenshot({ path: `${outDir}/${tag}-${name}-close.png`, clip: box });
      await page.evaluate(() => {
        document.querySelectorAll("body *").forEach((el) => (el.style.visibility = ""));
        window.__isle.cam().clearViewOffset();
      });
      console.log(`saved ${tag}-${name} (age ${age})`);
    }
    await ctx.close();
  }
  console.log(`seed ${seed}`);
} finally {
  await browser.close();
  await vite.close();
}
