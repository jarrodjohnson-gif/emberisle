// L13.4 Debug: open the browser client, play setup and one roll versus the bots, and fail on any console error.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8091;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
let code = 0;
const browser = await chromium.launch({
  // Cloud sessions ship Chromium here. On your own PC, run `npx playwright install chromium` once.
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
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

  // #189: a hex with two bots on it must ask "Take from whom?" offline too, and the pick moves one card.
  const steal = await page.evaluate(async () => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const me = g.getState().localId;
    const bots = st.players.filter((p) => p.id !== me).slice(0, 2);
    const hex = st.hexes.find((h) => h.terrain !== "waste" && h.id !== st.robberHex);
    const corners = st.vertices.filter((v) => v.hexes.includes(hex.id));
    for (const v of st.vertices) v.building = null;
    corners[0].building = { playerId: bots[0].id, kind: "outpost" };
    corners[1].building = { playerId: bots[1].id, kind: "outpost" };
    for (const p of st.players) p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
    bots[0].resources.ore = 2;
    bots[1].resources.wool = 2;
    st.phase = "robber";
    st.current = me;
    g.setState({ state: st, pendingSteal: null, error: null });
    g.getState().pickHex(hex.id);
    const pending = g.getState().pendingSteal;
    await new Promise((r) => setTimeout(r, 100)); // let React paint the picker
    const asked = document.body.innerText.includes("Take from whom?");
    g.getState().chooseSteal(bots[1].id);
    const after = g.getState().state;
    const mine = after.players.find((p) => p.id === me).resources;
    const victim = after.players.find((p) => p.id === bots[1].id).resources;
    return { targets: pending?.targets.length ?? 0, asked, got: mine.wool, left: victim.wool, phase: after.phase, cleared: g.getState().pendingSteal === null };
  });
  console.log("offline steal picker:", JSON.stringify(steal));
  await page.waitForTimeout(1500);
  mkdirSync("test-results", { recursive: true });
  // Software WebGL on a 2-CPU CI runner can take a while to finish one frame of the island.
  await page.screenshot({ path: "test-results/client-prove.png", timeout: 120_000 });
  console.log("screenshot: test-results/client-prove.png");

  if (phase !== "roll" && phase !== "main" && phase !== "robber" && phase !== "discard") throw new Error(`setup: ${phase}`);
  if (!Array.isArray(rolled)) throw new Error(`roll: ${rolled}`);
  if (steal.targets !== 2 || !steal.asked || steal.got !== 1 || steal.left !== 1 || steal.phase !== "main" || !steal.cleared) {
    throw new Error(`offline steal picker: ${JSON.stringify(steal)}`);
  }
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
