// #1491: pictures of how each dock shows its trade, from the real build. Hand-run, not a proof.
// Usage: node docs/design/dock-trade-marks/capture.mjs <repoRoot> <outDir> <label> [option]
//   <repoRoot>  a checkout to serve (main, the old-tags branch, or main with prototype.patch applied)
//   <label>     file prefix, e.g. "main", "old-tags", "a-painted-plank"
//   [option]    with the prototype applied, which option to draw: sets localStorage "emberisle-dockmark"
// Seed 14, four seats on one device, Ember (p0) to play: Ember owns the 3:1 dock (an outpost) and the wood dock (a
// stronghold), Tide owns the brick dock (an outpost). Each size is taken zoomed right out, at the home view and close
// up on Ember's wood dock.
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const [root, outDir, label, option = ""] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const { chromium } = await import(path.join(root, "node_modules/playwright/index.mjs"));
const { createServer } = await import(path.join(root, "node_modules/vite/dist/node/index.js"));
const port = 8500 + Math.floor(Math.random() * 400);
const vite = await createServer({ root, configFile: path.join(root, "vite.config.ts"), server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
// [width, height, touch, which shots]. Jarrod's phone (440x956) and desktop (1280x720) were added in review: the phone zoomed
// out and close up, the desktop at the home view.
const SIZES = [
  [390, 844, true, ["1-out", "2-home", "3-close"]],
  [820, 1180, true, ["1-out", "2-home", "3-close"]],
  [844, 390, true, ["1-out", "2-home", "3-close"]],
  [440, 956, true, ["1-out", "3-close", "4-owned"]],
  [1280, 720, false, ["2-home"]],
];
const LITE = process.env.LITE === "1";
try {
  for (const [w, h, touch, want] of SIZES.filter(([w, h]) => !process.env.ONLY || process.env.ONLY === `${w}x${h}`)) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: Number(process.env.DSF || 1), hasTouch: touch, isMobile: touch, reducedMotion: "reduce" });
    await ctx.addInitScript(([option, lite]) => {
      localStorage.setItem("emberisle-jelly", lite ? "lite" : "full");
      localStorage.setItem("emberisle-water", "simple");
      if (option) localStorage.setItem("emberisle-dockmark", option);
    }, [option, LITE]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 300)));
    page.on("console", (m) => { if (m.type() === "error" || /shore|harbou?r/i.test(m.text())) console.log("CONSOLE", m.type(), m.text().slice(0, 300)); });
    await page.goto(`http://127.0.0.1:${port}/`);
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
    await page.waitForFunction(
      (lite) => {
        const i = window.__isle;
        // The harbour shore is swapped in once built (the plain piers hide): wait for that, not just for it to exist.
        const swapped = lite || (i?.shore?.group.parent && i.piers?.length && i.piers.every((p) => !p.visible));
        return i?.lastSeq === 991 && i.landReady && swapped && !i.refitDue && !i.glide;
      },
      LITE,
      { timeout: 180_000 },
    );
    await page.waitForTimeout(1500);
    const tag = `${w}x${h}`;
    // Zoomed right out, the home view, then close on Ember's wood dock.
    const shots = [
      ["1-out", (i) => ({ ...i.pose(), zoom: i.orbit.minZoom })],
      ["2-home", (i) => i.pose()],
      ["3-close", (i) => {
        const d = i.docks.find((x) => x.kind === "timber");
        // Aim a little inland, so the dock sits above the HUD. On the taller 440x956 phone the camera's pan limit keeps that
        // dock behind the HUD at the most zoom, so that size is taken at zoom 1.9, aimed at the dock.
        const tall = innerWidth === 440;
        const k = tall ? 0.25 : -0.35;
        return { ...i.pose(), tx: d.cx + d.mx * k, tz: d.cz + d.mz * k, zoom: tall ? 1.9 : i.orbit.maxZoom };
      }],
      ["4-owned", (i) => {
        const d = i.docks.find((x) => x.kind === "timber");
        return { ...i.pose(), tx: d.cx + d.mx * 0.9, tz: d.cz + d.mz * 0.9, zoom: i.orbit.maxZoom };
      }],
    ];
    console.log("pennants up:", await page.evaluate(() => (window.__isle.shore?.group.userData.pennants ?? []).filter((p) => p.visible).length));
    const home = await page.evaluate(() => window.__isle.pose());
    for (const [name, make] of shots.filter(([n]) => want.includes(n))) {
      await page.evaluate(([src, home]) => {
        const i = window.__isle;
        i.applyPose(home);
        const make = new Function("i", `return (${src})(i)`);
        i.applyPose(make(i));
        i.orbit.update();
        // The old-tags branch places its chips from its render loop, which idles under reduced motion: run it once.
        if (typeof i.tags === "function") {
          i.tagDirty = true;
          i.tags();
        }
      }, [make.toString(), home]);
      // A new pose can rebuild the land (plain piers back) until the shore swaps in again: wait for it every time.
      await page.waitForFunction(
        (lite) => {
          const i = window.__isle;
          const swapped = lite || (i.shore?.group.parent && i.piers.every((p) => !p.visible));
          return swapped && !i.refitDue && !i.glide;
        },
        LITE,
        { timeout: 120_000 },
      );
      await page.waitForTimeout(1500);
      // Under reduced motion the render loop sleeps, so the canvas can still hold a frame from before the shore swapped in:
      // draw this pose now.
      await page.evaluate((name) => {
        const i = window.__isle;
        if (name === "4-owned") {
          // The pan limit keeps this dock under the HUD at full zoom: shift the frame (not the camera) so it sits mid-screen.
          const d = i.docks.find((x) => x.kind === "timber");
          const at = i.screenAt(d.cx + d.mx * 1.0, 0.13, d.cz + d.mz * 1.0);
          i.cam().setViewOffset(innerWidth, innerHeight, 0, Math.round(at.y - innerHeight * 0.45), innerWidth, innerHeight);
        }
        i.draw();
        i.renderer.getContext().finish();
      }, name);
      const ok = await page.evaluate((lite) => lite || window.__isle.piers.every((p) => !p.visible), LITE);
      if (!ok) throw new Error(`${label} ${tag} ${name}: the shore is not in`);
      const file = path.join(outDir, `${label}-${tag}-${name}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: 86 });
      console.log("saved", path.basename(file));
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  await vite.close();
}
