// #1593 follow-up: pictures of three fixes for the dock marks, from the real build. Hand-run, not a proof.
// Usage: node docs/design/dock-trade-marks/fixes/capture-fixes.mjs <outDir> [fixes, default "0,1,2,3"]
// Needs prototype-fixes.patch applied (it reads ?dockfix=N; no N is PR #1602's look). Same game as
// docs/proofs/1593/capture-owned.mjs: seed 14, four seats, Ember (red, p0) owns the 3:1 dock and the wood dock, Tide the brick
// dock. 440x956 at device scale 2: close (zoom 1.9 on the wood dock), owned (most zoom, the wood dock mid-screen, plus a 3x
// crop of it from a device-scale-3 page), out (least zoom) and far (most zoom on the far side of the island, a north-facing
// dock and the 3:1 dock in one frame).
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const outDir = process.argv[2] || path.join(root, "docs/design/dock-trade-marks/fixes");
const list = process.argv[3] || "0,1,2,3";
mkdirSync(outDir, { recursive: true });
const { chromium } = await import(path.join(root, "scripts/proof-browser.mjs"));
const { createServer } = await import(path.join(root, "node_modules/vite/dist/node/index.js"));
const port = 8500 + Math.floor(Math.random() * 400);
const vite = await createServer({ root, configFile: path.join(root, "vite.config.ts"), server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

const settled = () => {
  const i = window.__isle;
  return i?.lastSeq === 991 && i.landReady && i.shore?.group.parent && i.piers?.length && i.piers.every((p) => !p.visible) && !i.refitDue && !i.glide;
};

async function open(fix, dsf) {
  const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: dsf, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  await ctx.addInitScript(() => {
    localStorage.setItem("emberisle-jelly", "full");
    localStorage.setItem("emberisle-water", "simple");
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${port}/${fix ? `?dockfix=${fix}` : ""}`);
  await page.waitForFunction(() => typeof window.__emberisle?.getState().startHotseat === "function", null, { timeout: 120_000 });
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
  await page.evaluate(async () => {
    const { createGame } = await import("/src/lib/game/board.ts");
    const s = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Dune" }, { name: "Moss" }], bots: 0, seed: 14, numberTokens: "random" });
    Object.assign(s, { phase: "main", rollOff: null, current: "p0", seq: 991 });
    const at = (kind) => s.vertices.find((v) => v.harbor === kind);
    at("any").building = { playerId: "p0", kind: "outpost" };
    at("timber").building = { playerId: "p0", kind: "stronghold" };
    at("clay").building = { playerId: "p1", kind: "outpost" };
    window.__emberisle.setState({ state: s, mode: "hotseat", localId: "p0", banner: null, coachDismissed: true });
  });
  await page.waitForFunction(settled, null, { timeout: 180_000 });
  await page.waitForTimeout(1500);
  return { ctx, page, home: await page.evaluate(() => window.__isle.pose()) };
}

// Each shot: a pose, and an optional frame shift (the view offset, not the camera) that puts a point at a height on screen.
const SHOTS = {
  close: (i) => {
    const d = i.docks.find((x) => x.kind === "timber");
    return { pose: { ...i.pose(), tx: d.cx + d.mx * 0.25, tz: d.cz + d.mz * 0.25, zoom: 1.9 } };
  },
  owned: (i) => {
    const d = i.docks.find((x) => x.kind === "timber");
    return { pose: { ...i.pose(), tx: d.cx + d.mx * 0.9, tz: d.cz + d.mz * 0.9, zoom: i.orbit.maxZoom }, at: [d.cx + d.mx, d.cz + d.mz, 0.45] };
  },
  out: (i) => ({ pose: { ...i.pose(), zoom: i.orbit.minZoom } }),
  // The far side: the most north-facing dock, and the 3:1 dock nearest it, framed between them at the most zoom,
  // a third of the way down the screen.
  far: (i) => {
    const n = [...i.docks].sort((a, b) => a.mz - b.mz)[0];
    const a = i.docks.filter((x) => x.kind === "any").sort((p, q) => Math.hypot(p.cx - n.cx, p.cz - n.cz) - Math.hypot(q.cx - n.cx, q.cz - n.cz))[0];
    const tx = (n.cx + n.mx * 0.6 + a.cx + a.mx * 0.6) / 2, tz = (n.cz + n.mz * 0.6 + a.cz + a.mz * 0.6) / 2;
    return { pose: { ...i.pose(), tx, tz, zoom: i.orbit.maxZoom }, at: [tx, tz, 0.33] };
  },
};

async function shoot(page, home, name) {
  await page.evaluate(([src, home]) => {
    const i = window.__isle;
    i.cam().clearViewOffset();
    i.applyPose(home);
    i.applyPose(new Function("i", `return (${src})(i)`)(i).pose);
    i.orbit.update();
  }, [SHOTS[name].toString(), home]);
  await page.waitForFunction(() => {
    const i = window.__isle;
    return i.shore?.group.parent && i.piers.every((p) => !p.visible) && !i.refitDue && !i.glide;
  }, null, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  // Under reduced motion the render loop sleeps: draw this pose now. The pan limit can keep a dock under the HUD, so shift the
  // frame to put the shot's point at its height on screen.
  return page.evaluate((src) => {
    const i = window.__isle;
    const s = new Function("i", `return (${src})(i)`)(i);
    if (s.at) {
      const p = i.screenAt(s.at[0], 0.13, s.at[1]);
      i.cam().setViewOffset(innerWidth, innerHeight, 0, Math.round(p.y - innerHeight * s.at[2]), innerWidth, innerHeight);
    }
    i.draw();
    i.renderer.getContext().finish();
    // Where the wood dock's pier head is on screen, for the crop.
    const d = i.docks.find((x) => x.kind === "timber");
    return i.screenAt(d.cx + d.mx * 0.9, 0.1, d.cz + d.mz * 0.9);
  }, SHOTS[name].toString());
}

try {
  for (const fix of list.split(",").map(Number)) {
    const { ctx, page, home } = await open(fix, 2);
    if (process.env.PROBE) console.log(JSON.stringify(await page.evaluate(() => window.__isle.docks.map((d) => ({ k: d.kind, cx: +d.cx.toFixed(2), cz: +d.cz.toFixed(2), mx: +d.mx.toFixed(2), mz: +d.mz.toFixed(2) })))));
    for (const name of ["close", "owned", "out", "far"]) {
      await shoot(page, home, name);
      const file = path.join(outDir, `fix${fix}-440x956-${name}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: 88 });
      console.log("saved", path.basename(file));
    }
    await ctx.close();
    // The 3x detail: the owned framing on a device-scale-3 page, a 200x140 crop round the wood dock's head.
    const big = await open(fix, 3);
    const p = await shoot(big.page, big.home, "owned");
    const clip = { x: Math.round(p.x - 100), y: Math.round(p.y - 80), width: 200, height: 140 };
    const file = path.join(outDir, `fix${fix}-440x956-owned-3x.png`);
    await big.page.screenshot({ path: file, type: "png", clip });
    console.log("saved", path.basename(file), JSON.stringify(clip));
    await big.ctx.close();
  }
} finally {
  await browser.close();
  await vite.close();
}
