// #441: after a roll the hexes that paid glow (cap emissive up, then back to rest) and nothing else does. A state with an
// outpost on each corner of a hex is pushed twice, first with no dice, then with the dice that pay it, and the proof reads every
// frame the island draws. Under reduced motion the glow is a step to the peak and back, with no ramp. Zero console errors.
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

// CI renders the island with software GL, where one frame can take seconds; a step gets this long to show.
const STEP_MS = 15_000;

const PORT = Number(process.env.FLASH_PORT || process.env.VITE_PORT) || 8441;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
let code = 0;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

// Plays one roll on a fresh hotseat table and returns, per drawn frame, the cap glow of each hex.
async function scenario(reducedMotion) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Four seats, one table" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
  const roll = page.getByRole("button", { name: "Roll", exact: true });
  for (let i = 0; i < 40; i++) {
    const before = await page.evaluate(() => window.__emberisle.getState().state);
    if (before.phase !== "rollOff") break;
    await roll.focus({ timeout: STEP_MS });
    await page.keyboard.press("Enter");
    await page.waitForFunction((s) => window.__emberisle.getState().state.seq > s, before.seq, { timeout: STEP_MS });
  }
  const seatedSeq = (seq) => page.waitForFunction((s) => window.__isle?.lastSeq === s, seq, { timeout: STEP_MS });

  // The table before the roll: no dice, an outpost on every corner of the target hex.
  const setup = await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const hex = st.hexes.find((h) => h.pip && h.terrain !== "waste" && h.id !== st.robberHex && h.pip !== 7);
    const owner = st.current;
    for (const v of st.vertices) if (v.hexes.includes(hex.id)) v.building = { playerId: owner, kind: "outpost" };
    st.phase = "roll";
    st.dice = null;
    st.seq += 1;
    g.setState({ state: st, buildMode: "none", error: null });
    return { seq: st.seq, pip: hex.pip };
  });
  await seatedSeq(setup.seq);

  // Record the glow of every cap on every frame the island draws.
  await page.evaluate(() => {
    const isle = window.__isle;
    window.__frames = [];
    const draw = isle.composer.render.bind(isle.composer);
    isle.composer.render = (...a) => {
      window.__frames.push(Object.fromEntries([...isle.caps].map(([id, m]) => [id, m.emissiveIntensity])));
      return draw(...a);
    };
  });
  const rolled = await page.evaluate((pip) => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.dice = [Math.floor(pip / 2), Math.ceil(pip / 2)];
    st.phase = "main";
    st.seq += 1;
    g.setState({ state: st, buildMode: "none", error: null });
    const touched = new Set(st.vertices.filter((v) => v.building).flatMap((v) => v.hexes));
    const paying = st.hexes.filter((h) => h.pip === pip && !h.blocked && h.terrain !== "waste" && touched.has(h.id)).map((h) => h.id);
    const resting = st.hexes.filter((h) => !paying.includes(h.id)).map((h) => h.id);
    return { paying, resting, pip };
  }, setup.pip);
  // Wait on the frames: the glow shows, then every cap is back at rest.
  await page.waitForFunction(
    (ids) => {
      const f = window.__frames;
      const at = f.findIndex((fr) => ids.some((id) => fr[id] > 0));
      return at >= 0 && f.slice(at).some((fr) => ids.every((id) => fr[id] === 0));
    },
    rolled.paying,
    { timeout: STEP_MS * 8 },
  );
  const frames = await page.evaluate(() => window.__frames);
  await page.close();
  return { ...rolled, frames };
}

try {
  for (const reduced of [false, true]) {
    const { paying, resting, pip, frames } = await scenario(reduced);
    const series = (id) => frames.map((f) => f[id]);
    const peak = Math.max(...paying.flatMap(series));
    const mid = paying.flatMap(series).filter((v) => v > 0 && v < peak - 1e-6).length;
    const stray = Math.max(...resting.flatMap(series));
    const last = frames[frames.length - 1];
    console.log(`${reduced ? "reduced motion" : "motion"}: roll of ${pip} pays ${paying.length} hex(es), ${frames.length} frames, peak ${peak.toFixed(2)}, ${mid} frames between rest and peak, other hexes max ${stray}, end ${paying.map((id) => last[id])}`);
    if (!paying.length || peak < 0.3) throw new Error(`the paying hexes did not glow: peak ${peak}`);
    if (stray !== 0) throw new Error(`a non-paying hex glowed: ${stray}`);
    if (!paying.every((id) => last[id] === 0)) throw new Error("a paying hex did not settle back to rest");
    if (reduced && mid !== 0) throw new Error(`reduced motion ramped the glow (${mid} in-between frames)`);
    if (!reduced && mid === 0) throw new Error("the glow stepped; it should rise and fade");
  }
} catch (e) {
  console.error("flash-prove failed:", e);
  code = 1;
}
if (errors.length) {
  console.error("console errors:", errors);
  code = 1;
}
await browser.close();
await vite.close();
console.log(code ? "flash-prove: FAIL" : "flash-prove: ok");
process.exit(code);
