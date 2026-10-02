// #125: screenshot every screen of the browser table at 1280x720 and 1920x1080 into test-results/shots/,
// and measure draw calls and frame time at 1920x1080. Research tool: it does not pass or fail.
// The 7, the wayfarer and the win screen are loaded as crafted states through the store, so no luck is needed.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8094;
const OUT = "test-results/shots";
const SIZES = [
  [1280, 720],
  [1920, 1080],
].filter(([w]) => !process.env.ONLY || process.env.ONLY === String(w));
mkdirSync(OUT, { recursive: true });

// Rooms go to a temp folder, dropped on exit, so the real host never restores this proof's tables (#207).
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR },
});
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

// Count every WebGL draw and the frame gaps, so the cost includes the SSAO and output passes, not one render().
const counters = () => {
  const stats = { calls: 0, prims: 0, frames: [], perFrame: [] };
  window.__gl = stats;
  for (const Ctx of [WebGL2RenderingContext, WebGLRenderingContext]) {
    for (const fn of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const orig = Ctx.prototype[fn];
      if (!orig) continue;
      Ctx.prototype[fn] = function (...a) {
        stats.calls += 1;
        stats.prims += fn.startsWith("drawElements") ? a[1] : a[2];
        return orig.apply(this, a);
      };
    }
  }
  let last = 0;
  const raf = window.requestAnimationFrame.bind(window);
  const loop = (t) => {
    if (last) {
      stats.frames.push(t - last);
      stats.perFrame.push([stats.calls, stats.prims]);
    }
    stats.calls = 0;
    stats.prims = 0;
    last = t;
    raf(loop);
  };
  raf(loop);
};

const shots = [];
async function shot(page, name, [w, h]) {
  await page.waitForTimeout(1500);
  const file = `${OUT}/${name}-${w}x${h}.png`;
  await page.screenshot({ path: file, timeout: 180_000 });
  shots.push(file);
  console.log("shot", file);
}

// Play the local seat's obligations until `stop(state)` is true; the bots play themselves.
const playUntil = (page, stop) =>
  page.evaluate(async (stopSrc) => {
    const stopFn = new Function("st", "me", `return (${stopSrc})(st, me)`);
    const g = window.__emberisle;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 1200; i++) {
      const s = g.getState();
      const st = s.state;
      if (stopFn(st, s.localId)) return st.phase;
      const mine = st.current === s.localId;
      const hi = s.highlights();
      if (st.phase === "discard" && (st.discardNeeded[s.localId] ?? 0) > 0) {
        let need = st.discardNeeded[s.localId];
        const me = st.players.find((p) => p.id === s.localId);
        const res = {};
        for (const [r, n] of Object.entries(me.resources)) {
          const k = Math.min(n, need);
          if (k) res[r] = k;
          need -= k;
        }
        s.dispatch({ type: "discard", resources: res });
      } else if (mine && st.phase === "setupSettle") s.pickVertex(hi.vertices[0]);
      else if (mine && st.phase === "setupRoad") s.pickEdge(hi.edges[0]);
      else if (mine && st.phase === "roll") s.dispatch({ type: "roll" });
      else if (mine && st.phase === "robber") {
        s.pickHex(hi.hexes[0]);
        const p = g.getState().pendingSteal;
        if (p) g.getState().chooseSteal(p.targets[0]);
      } else if (mine && st.phase === "main") s.dispatch({ type: "endTurn" });
      await sleep(60);
    }
    return "stuck in " + g.getState().state.phase;
  }, stop.toString());

// Replace the live state with a crafted one (a new seq, so the scene redraws).
const craft = (page, patch) =>
  page.evaluate((patchSrc) => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    new Function("st", patchSrc)(st);
    st.seq += 1;
    g.setState({ state: st, pendingSteal: null, error: null });
  }, patch);

let metrics = null;
try {
  for (const size of SIZES) {
    const [w, h] = size;
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.addInitScript(counters);
    await page.addInitScript(() => localStorage.setItem("emberisle-name", "Ember"));
    await page.goto(`http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`);
    await shot(page, "01-title", size);

    // Lobby: host a table here, and two small side tabs sit down.
    await page.getByRole("button", { name: "Host a table" }).click();
    await page.waitForFunction(() => /^[A-Z0-9]{4}$/.test(window.__emberisle.getState().code));
    const code = await page.evaluate(() => window.__emberisle.getState().code);
    const side = [];
    for (const name of ["Tide", "Pine"]) {
      const p = await browser.newPage({ viewport: { width: 400, height: 300 } });
      await p.addInitScript((n) => localStorage.setItem("emberisle-name", n), name);
      await p.goto(`http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`);
      await p.waitForFunction(() => window.__emberisle);
      await p.evaluate((c) => window.__emberisle.getState().joinTable(c), code);
      await p.waitForFunction(() => window.__emberisle.getState().screen === "lobby", null, { timeout: 60_000 }).catch(async (e) => {
        throw new Error(`${name} could not join ${code}: ${await p.evaluate(() => window.__emberisle.getState().error)}`, { cause: e });
      });
      await p.evaluate(() => window.__emberisle.getState().setReady(true));
      side.push(p);
    }
    await page.locator("li", { hasText: "Pine" }).waitFor();
    await shot(page, "02-lobby", size);
    for (const p of side) await p.close();
    await page.getByRole("button", { name: "Leave the table" }).click();

    // Setup, versus three bots: the first corner to place, glowing.
    await page.getByRole("button", { name: "Play versus the isle" }).click();
    await playUntil(page, (st, me) => st.phase === "setupSettle" && st.current === me);
    await shot(page, "03-setup", size);

    // A normal turn: every outpost and path down, my roll done, the build bar up.
    await playUntil(page, (st, me) => st.phase === "roll" && st.current === me);
    await page.evaluate(() => {
      const s = window.__emberisle.getState();
      s.dispatch({ type: "roll" });
    });
    await playUntil(page, (st, me) => st.phase === "main" && st.current === me);
    await shot(page, "04-turn", size);

    // The same turn with goods in hand, so the trade row offers something.
    await craft(page, `const me = st.players.find((p) => p.id === "p0"); me.resources = { timber: 4, clay: 3, wool: 2, grain: 2, ore: 1 };`);
    await shot(page, "05-trade", size);

    if (w === 1920) {
      metrics = await page.evaluate(async () => {
        const s = window.__gl;
        s.frames.length = 0;
        s.perFrame.length = 0;
        await new Promise((r) => setTimeout(r, 6000));
        const n = s.frames.length;
        const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
        const sorted = [...s.frames].sort((a, b) => a - b);
        return {
          frames: n,
          frameMsAvg: avg(s.frames),
          frameMsP50: sorted[Math.floor(n / 2)],
          drawCallsPerFrame: avg(s.perFrame.map((x) => x[0])),
          primitivesPerFrame: avg(s.perFrame.map((x) => x[1])),
          gl: (() => {
            const c = document.createElement("canvas").getContext("webgl2");
            const ext = c?.getExtension("WEBGL_debug_renderer_info");
            return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
          })(),
        };
      });
      console.log("metrics", JSON.stringify(metrics));
      // Closer looks for the pieces, boats and wayfarer: zoom to the controls' minimum distance.
      // Aim at the wayfarer so the zoom shows his parts (#237), then put the orbit target back.
      const aim = await page.evaluate(() => {
        const c = window.__isle.controls;
        const was = c.target.toArray();
        c.target.copy(window.__isle.wayfarer.position);
        return was;
      });
      await page.mouse.move(w / 2, h / 2);
      for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -400);
      await shot(page, "09-zoom", size);
      for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 400);
      await page.evaluate((was) => window.__isle.controls.target.set(...was), aim);
    }

    // A 7: more than seven goods, discard half.
    await craft(
      page,
      `st.dice = [3, 4]; st.phase = "discard"; st.current = "p0";
       const me = st.players.find((p) => p.id === "p0"); me.resources = { timber: 3, clay: 2, wool: 2, grain: 1, ore: 1 };
       st.discardNeeded = { p0: 4 };`,
    );
    await shot(page, "06-discard", size);
    // Then the wayfarer: every hex but its own glows.
    await craft(page, `st.phase = "robber"; st.discardNeeded = {};`);
    await shot(page, "07-wayfarer", size);

    // The win screen.
    await craft(page, `st.phase = "over"; st.winner = "p0";`);
    await shot(page, "08-win", size);
    await page.close();
  }
  writeFileSync(`${OUT}/metrics.json`, JSON.stringify(metrics, null, 2));
  console.log(`${shots.length} shots in ${OUT}`);
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
