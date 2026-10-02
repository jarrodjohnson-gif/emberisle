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
  // #188: the roll banner shows offline too.
  const bannerText = await page.getByTestId("banner").textContent({ timeout: 2000 }).catch(() => null);
  console.log("roll banner:", JSON.stringify(bannerText));

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

  // #184: the path, plenty, and monopoly fortunes each have a way to be played from the HUD.
  const arm = (hidden) =>
    page.evaluate((hidden) => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      const me = g.getState().localId;
      const mine = st.players.find((p) => p.id === me);
      st.phase = "main";
      st.current = me;
      st.playedCard = false;
      mine.hidden = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0, ...hidden };
      mine.boughtThisTurn = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
      mine.pathsLeft = 10;
      for (const p of st.players) if (p.id !== me) p.resources.ore = 2;
      st.bank.ore = 10;
      st.bank.wool = 10;
      g.setState({ state: st, buildMode: "none", roadPicks: [], pendingSteal: null, error: null });
      return { ore: mine.resources.ore, wool: mine.resources.wool };
    }, hidden);
  await arm({ road: 1 });
  const road = await page.evaluate(() => {
    const g = window.__emberisle;
    const me = g.getState().localId;
    const had = g.getState().state.edges.filter((e) => e.path === me).length;
    g.getState().setBuildMode("roadCard");
    const first = g.getState().highlights().edges;
    g.getState().pickEdge(first[0]);
    const picked = g.getState().roadPicks.length;
    const second = g.getState().highlights().edges;
    g.getState().pickEdge(second[0]);
    const st = g.getState().state;
    return {
      first: first.length,
      picked,
      second: second.length,
      laid: st.edges.filter((e) => e.path === me).length - had,
      cardLeft: st.players.find((p) => p.id === me).hidden.road,
      played: st.playedCard,
      mode: g.getState().buildMode,
      error: g.getState().error,
    };
  });
  console.log("path fortune:", JSON.stringify(road));
  const before = await arm({ plenty: 1 });
  await page.selectOption("select[name=plentyA]", "ore");
  await page.selectOption("select[name=plentyB]", "wool");
  await page.getByRole("button", { name: "Plenty", exact: true }).click();
  const plenty = await page.evaluate((before) => {
    const g = window.__emberisle;
    const me = g.getState().state.players.find((p) => p.id === g.getState().localId);
    return { ore: me.resources.ore - before.ore, wool: me.resources.wool - before.wool, cardLeft: me.hidden.plenty, error: g.getState().error };
  }, before);
  console.log("plenty fortune:", JSON.stringify(plenty));
  const mono = await arm({ monopoly: 1 });
  await page.selectOption("select[name=monopoly]", "ore");
  await page.getByRole("button", { name: "Monopoly", exact: true }).click();
  const monopoly = await page.evaluate((before) => {
    const g = window.__emberisle;
    const st = g.getState().state;
    const me = st.players.find((p) => p.id === g.getState().localId);
    return { gained: me.resources.ore - before.ore, othersLeft: st.players.filter((p) => p !== me).reduce((n, p) => n + p.resources.ore, 0), cardLeft: me.hidden.monopoly, error: g.getState().error };
  }, mono);
  console.log("monopoly fortune:", JSON.stringify(monopoly));
  await page.waitForTimeout(1500);
  mkdirSync("test-results", { recursive: true });
  // Software WebGL on a 2-CPU CI runner can take a while to finish one frame of the island.
  await page.screenshot({ path: "test-results/client-prove.png", timeout: 120_000 });
  console.log("screenshot: test-results/client-prove.png");

  if (phase !== "roll" && phase !== "main" && phase !== "robber" && phase !== "discard") throw new Error(`setup: ${phase}`);
  if (!Array.isArray(rolled)) throw new Error(`roll: ${rolled}`);
  if (!bannerText || !bannerText.includes(`rolls ${rolled[0]}+${rolled[1]} = ${rolled[0] + rolled[1]}`)) throw new Error(`roll banner: ${bannerText}`);
  if (steal.targets !== 2 || !steal.asked || steal.got !== 1 || steal.left !== 1 || steal.phase !== "main" || !steal.cleared) {
    throw new Error(`offline steal picker: ${JSON.stringify(steal)}`);
  }
  if (road.first < 1 || road.picked !== 1 || road.second < 1 || road.laid !== 2 || road.cardLeft !== 0 || !road.played || road.mode !== "none" || road.error) {
    throw new Error(`path fortune: ${JSON.stringify(road)}`);
  }
  if (plenty.ore !== 1 || plenty.wool !== 1 || plenty.cardLeft !== 0 || plenty.error) throw new Error(`plenty fortune: ${JSON.stringify(plenty)}`);
  if (monopoly.gained !== 6 || monopoly.othersLeft !== 0 || monopoly.cardLeft !== 0 || monopoly.error) throw new Error(`monopoly fortune: ${JSON.stringify(monopoly)}`);
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
