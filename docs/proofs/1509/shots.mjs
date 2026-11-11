// #1509: real-game pictures of the upright phone table, before and after. Not a proof: it saves pictures for the
// Decisions card. One practice game is played to the human's first main phase and saved to table.json (--record);
// every later run loads that same table, so before and after show the same board, hand and log.
// Run from the repo root: node docs/proofs/1509/shots.mjs <before|after> [--record] [--view=overhead|lean25]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const tag = process.argv[2] ?? "after";
const record = process.argv.includes("--record");
const OUT = "docs/proofs/1509";
const TABLE = `${OUT}/table.json`;
const PORT = 8519;
const SIZES = [
  [430, 932],
  [390, 844],
  [844, 390],
  [820, 1180],
];
mkdirSync(OUT, { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
try {
  if (record || !existsSync(TABLE)) {
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);
    await page.evaluate(() => {
      window.__emberisle.setState({ name: "Jarrod" });
      window.__emberisle.getState().startAi();
    });
    // The human rolls off and places; the bots act on the app's own timers. At the human's first roll, stop.
    await page.waitForFunction(
      () => {
        const s = window.__emberisle.getState();
        const st = s.state;
        if (!st || st.current !== s.localId) return false;
        const hi = s.highlights();
        if (st.phase === "rollOff") s.dispatch({ type: "roll" });
        else if (st.phase === "setupSettle" && hi.vertices[0]) s.pickVertex(hi.vertices[Math.floor(hi.vertices.length / 2)]);
        else if (st.phase === "setupRoad" && hi.edges[0]) s.pickEdge(hi.edges[0]);
        return st.phase === "roll";
      },
      null,
      { polling: 200, timeout: 120000 },
    );
    const saved = await page.evaluate(() => {
      const s = window.__emberisle.getState();
      const names = ["Daking", "Isaac", "Joshua"];
      const state = structuredClone(s.state);
      state.players.forEach((p) => (p.name = p.id === s.localId ? "Jarrod" : (names.shift() ?? p.name)));
      state.phase = "main";
      state.dice = [2, 5];
      Object.assign(state.players.find((p) => p.id === s.localId).resources, { timber: 2, clay: 1, wool: 3, grain: 2, ore: 1 });
      return { state, gameLog: s.gameLog };
    });
    writeFileSync(TABLE, JSON.stringify(saved));
    await page.close();
  }
  const saved = JSON.parse(readFileSync(TABLE, "utf8"));
  for (const [w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    // The first-game tips are done, as for a returning player.
    await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", JSON.stringify("done")));
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`${w}x${h}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${w}x${h}: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);
    await page.evaluate((saved) => {
      window.__emberisle.setState({ name: "Jarrod" });
      window.__emberisle.getState().startAi();
      window.__emberisle.setState({ state: saved.state, gameLog: saved.gameLog });
    }, saved);
    await page.getByTestId("turn-banner").waitFor();
    await page.waitForTimeout(2500);
    // --lean=N: the same fitted view, the eye at N° instead (to show the angle alone, on the new layout).
    const lean = process.argv.find((a) => a.startsWith("--lean="));
    if (lean) {
      await page.evaluate(async (deg) => {
        const { fitOrtho } = await import("/src/lib/scene/mobile-fit.ts");
        const isle = window.__isle;
        const c = document.querySelector("canvas");
        const f = fitOrtho(c.clientWidth, c.clientHeight, isle.insets(), (deg * Math.PI) / 180, c.clientHeight > c.clientWidth);
        isle.applyPose({ ...isle.pose(), left: f.left, right: f.right, top: f.top, bottom: f.bottom, tx: f.x, tz: f.z, polar: f.lean, zoom: 1 });
        isle.wake();
      }, Number(lean.slice(7)));
      await page.waitForTimeout(800);
    }
    const m = await page.evaluate(() => {
      const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
      const strip = r('[data-testid="seat-strip"]');
      const stack = r("[data-hud-stack]");
      const isle = window.__isle;
      const s = window.__emberisle.getState().state;
      // The island's coast on screen: the hex corners of every land hex, through the camera in use.
      const pts = s.vertices.map((v) => isle.screenOf(v.id)).filter(Boolean);
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return {
        strip: strip && Math.round(strip.bottom),
        stackTop: stack && Math.round(stack.top),
        coast: { left: Math.round(Math.min(...xs)), right: Math.round(Math.max(...xs)), top: Math.round(Math.min(...ys)), bottom: Math.round(Math.max(...ys)) },
        view: window.__emberisle.getState().playView,
      };
    });
    console.log(`${tag} ${w}x${h}`, JSON.stringify(m));
    await page.screenshot({ path: `${OUT}/${w}x${h}-${tag}.jpg`, quality: 82, type: "jpeg" });
    await ctx.close();
  }
} finally {
  await browser.close();
  await vite.close();
}
if (errors.length) console.log("console errors:", errors);
