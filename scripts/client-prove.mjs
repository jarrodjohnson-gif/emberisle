// L13.4 Debug: open the browser client, play setup and one roll versus the bots, and fail on any console error.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8091;
const vite = await createServer({ server: { port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
let code = 0;
const browser = await chromium.launch({
  // Cloud sessions ship Chromium here. On your own PC, run `npx playwright install chromium` once.
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Play versus the isle" }).click();

  // Place the human's outposts and paths through the same store the canvas clicks use.
  const phase = await page.evaluate(async () => {
    const g = window.__emberisle;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 400; i++) {
      const s = g.getState();
      const st = s.state;
      if (!st) return "no state";
      if (st.phase !== "setupSettle" && st.phase !== "setupRoad") return st.phase;
      if (st.current === s.localId) {
        const hi = s.highlights();
        if (st.phase === "setupSettle") s.pickVertex(hi.vertices[0]);
        else s.pickEdge(hi.edges[0]);
      }
      await sleep(100);
    }
    return "stuck in " + g.getState().state.phase;
  });
  console.log("after setup:", phase);

  const rolled = await page.evaluate(async () => {
    const g = window.__emberisle;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 200; i++) {
      const s = g.getState();
      if (s.state.current === s.localId && s.state.phase === "roll") {
        const r = s.dispatch({ type: "roll" });
        return r.ok ? g.getState().state.dice : r.error;
      }
      await sleep(100);
    }
    return "never my roll";
  });
  console.log("rolled:", rolled);
  await page.waitForTimeout(1500);
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/client-prove.png" });
  console.log("screenshot: test-results/client-prove.png");

  if (phase !== "roll" && phase !== "main" && phase !== "robber" && phase !== "discard") throw new Error(`setup: ${phase}`);
  if (!Array.isArray(rolled)) throw new Error(`roll: ${rolled}`);
  if (errors.length) throw new Error(`console errors:\n${errors.join("\n")}`);
  console.log("client prove ok");
} catch (e) {
  console.log("FAIL", e.message);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
