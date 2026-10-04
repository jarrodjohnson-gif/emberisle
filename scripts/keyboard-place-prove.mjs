// #376 (WCAG 2.1.1): a keyboard alone places every setup piece in hotseat, then a path, an outpost, a stronghold and the
// wayfarer through the PlaceList beside the HUD. Each list holds exactly the targets the island glows; zero console errors.
// #419: an armed Path, Outpost or Stronghold turns the turn banner into what to pick and "Esc cancels"; Escape restores it.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

// CI renders the island with software GL, where one frame can take seconds; a step gets this long to show.
const STEP_MS = 15_000;

const PORT = Number(process.env.VITE_PORT) || 8101;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
let code = 0;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  const four = page.getByRole("button", { name: "Four seats, one table" });
  await four.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });

  const game = () =>
    page.evaluate(() => {
      const g = window.__emberisle.getState();
      const st = g.state;
      return { phase: st.phase, current: st.current, seq: st.seq, hi: g.highlights() };
    });
  const waitSeq = (seq) => page.waitForFunction((s) => window.__emberisle.getState().state.seq > s, seq, { timeout: STEP_MS });
  const list = page.getByTestId("place-list");
  // The focused element is a button inside the place list.
  const focusInList = () => page.evaluate(() => !!document.activeElement?.closest('[data-testid="place-list"]') && document.activeElement.tagName === "BUTTON");

  // #232: the Roll button, pressed with Enter, carries every seat through the roll-off.
  const roll = page.getByRole("button", { name: "Roll", exact: true });
  for (let i = 0; i < 40; i++) {
    const before = await game();
    if (before.phase !== "rollOff") break;
    await roll.focus({ timeout: STEP_MS });
    await page.keyboard.press("Enter");
    await waitSeq(before.seq);
  }
  const start = await game();
  if (start.phase !== "setupSettle") throw new Error(`roll-off did not end: ${start.phase}`);

  // From the first HUD button, Tab alone reaches the list.
  await page.getByRole("button", { name: "How to play" }).focus();
  let tabs = 0;
  while (!(await focusInList())) {
    if (++tabs > 120) throw new Error("Tab never reached the place list");
    await page.keyboard.press("Tab");
  }
  const group = page.getByRole("group", { name: "Place an outpost" });
  const names = await group.getByRole("button").allTextContents();
  const box = await list.boundingBox();
  console.log(`setupSettle: ${tabs} Tab presses from How to play reach "Place an outpost", ${names.length} buttons (glow ${start.hi.vertices.length}), panel ${Math.round(box.width)}x${Math.round(box.height)}, e.g. "${names[0]}"`);
  if (names.length !== start.hi.vertices.length) throw new Error(`outpost buttons ${names.length} vs glow ${start.hi.vertices.length}`);
  if (new Set(names).size !== names.length) throw new Error(`two outpost buttons share a name: ${names.filter((n, i) => names.indexOf(n) !== i)}`);
  if (!names.every((n) => /^Corner: /.test(n))) throw new Error(`corner names: ${names.slice(0, 3)}`);
  if (box.width < 100 || box.height < 40) throw new Error(`the focused list is not visible: ${JSON.stringify(box)}`);
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/keyboard-place-prove.png" });

  // A phone tap left a mark on corner A (PlaceChip, waiting for Enter); Enter on list button B places B, never A.
  {
    const [a, b] = start.hi.vertices;
    await group.getByRole("button").nth(1).focus();
    await page.evaluate((id) => window.__emberisle.getState().setPendingPlace({ kind: "vertex", id }), a);
    await page.getByTestId("place-chip").waitFor({ timeout: STEP_MS });
    await page.keyboard.press("Enter");
    await waitSeq(start.seq);
    const got = await page.evaluate(([a, b]) => {
      const s = window.__emberisle.getState();
      const at = (id) => s.state.vertices.find((v) => v.id === id).building?.playerId ?? null;
      return { a: at(a), b: at(b), phase: s.state.phase, pending: s.pendingPlace, seq: s.state.seq };
    }, [a, b]);
    console.log(`pending mark on A, Enter on list button B: A ${got.a ?? "empty"}, B ${got.b}, ${got.phase}, seq +${got.seq - start.seq}`);
    if (got.a !== null || got.b !== start.current || got.phase !== "setupRoad" || got.pending || got.seq !== start.seq + 1) {
      throw new Error(`Enter on B with A pending: ${JSON.stringify(got)}`);
    }
  }

  // Eight placements (the first outpost is down): Enter on whatever button holds focus, which stays in the list from one to the next.
  for (let step = 0; step < 16; step++) {
    const before = await game();
    if (before.phase !== "setupSettle" && before.phase !== "setupRoad") break;
    const heading = before.phase === "setupSettle" ? "Place an outpost" : "Lay a path";
    const want = before.phase === "setupSettle" ? before.hi.vertices.length : before.hi.edges.length;
    const g = page.getByRole("group", { name: heading });
    await g.waitFor({ state: "attached", timeout: STEP_MS });
    const n = await g.getByRole("button").count();
    if (n !== want) throw new Error(`${heading}: ${n} buttons vs glow ${want}`);
    if (!(await focusInList())) throw new Error(`${heading}: focus left the list`);
    const label = await page.evaluate(() => document.activeElement.textContent);
    await page.keyboard.press("Enter");
    await waitSeq(before.seq);
    const after = await page.evaluate((b) => {
      const st = window.__emberisle.getState().state;
      return {
        phase: st.phase,
        outposts: st.vertices.filter((v) => v.building?.playerId === b.current).length,
        paths: st.edges.filter((e) => e.path === b.current).length,
      };
    }, before);
    console.log(`${before.current} ${heading} (${n}) Enter on "${label}" -> ${after.phase}, ${after.outposts} outposts, ${after.paths} paths`);
    if (before.phase === "setupSettle" && after.phase !== "setupRoad") throw new Error(`outpost did not lead to a path: ${after.phase}`);
    if (before.phase === "setupRoad" && after.phase === "setupRoad") throw new Error("path did not advance the phase");
    if (before.phase === "setupRoad" && !/^Path from /.test(label)) throw new Error(`path name: ${label}`);
  }
  const done = await page.evaluate(() => {
    const st = window.__emberisle.getState().state;
    return { phase: st.phase, outposts: st.vertices.filter((v) => v.building).length, paths: st.edges.filter((e) => e.path).length };
  });
  console.log("setup by keyboard:", JSON.stringify(done));
  if (done.phase !== "roll" || done.outposts !== 8 || done.paths !== 8) throw new Error(`setup: ${JSON.stringify(done)}`);
  if ((await list.count()) !== 0) throw new Error("the list shows with nothing to place");

  // Main phase with goods: arm each build from its HUD button with Enter, then place from the list.
  const fill = () =>
    page.evaluate(() => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      st.phase = "main";
      st.dice = [2, 3];
      st.players.find((p) => p.id === st.current).resources = { timber: 5, clay: 5, wool: 5, grain: 5, ore: 5 };
      st.seq += 1;
      g.setState({ state: st, buildMode: "none", error: null });
      return st.seq;
    });
  // #419: the banner reads `${seat}'s turn — ${phase}` in hotseat.
  const bannerIs = async (phase) => {
    const want = await page.evaluate((phase) => {
      const st = window.__emberisle.getState().state;
      return `${st.players.find((p) => p.id === st.current).name}'s turn — ${phase}`;
    }, phase);
    await page.waitForFunction((t) => document.querySelector('[data-testid="turn-banner"]')?.textContent === t, want, { timeout: STEP_MS })
      .catch(async () => { throw new Error(`banner: want "${want}", got "${await page.getByTestId("turn-banner").textContent()}"`); });
    return want;
  };
  const ARMED = {
    Path: "Pick a glowing edge · Esc cancels",
    Outpost: "Pick a glowing corner · Esc cancels",
    Stronghold: "Pick an outpost to upgrade · Esc cancels",
  };
  const arm = async (name, heading) => {
    await page.getByRole("button", { name, exact: true }).focus({ timeout: STEP_MS });
    await page.keyboard.press("Enter");
    const g = page.getByRole("group", { name: heading });
    await g.waitFor({ state: "attached", timeout: STEP_MS });
    console.log(`armed ${name}: banner "${await bannerIs(ARMED[name])}"`);
    return g;
  };
  // #419: Escape disarms, and the banner says the main-phase line again.
  await fill();
  await arm("Path", "Lay a path");
  await page.keyboard.press("Escape");
  await page.getByRole("group", { name: "Lay a path" }).waitFor({ state: "detached", timeout: STEP_MS });
  console.log(`Escape: banner "${await bannerIs("Build, trade with the bank, or end your turn.")}"`);
  // Two paths out from an outpost, so a corner two steps away is free for an outpost.
  for (let i = 0; i < 2; i++) {
    await fill();
    const g = await arm("Path", "Lay a path");
    const { hi, seq, paths } = await page.evaluate(() => {
      const s = window.__emberisle.getState();
      return { hi: s.highlights(), seq: s.state.seq, paths: s.state.edges.filter((e) => e.path === s.state.current).length };
    });
    const n = await g.getByRole("button").count();
    if (n !== hi.edges.length) throw new Error(`armed path: ${n} buttons vs ${hi.edges.length}`);
    // Head away from our pieces, to a corner with no building on it or next to it if there is one, so an outpost fits there.
    const far = await page.evaluate(() => {
      const s = window.__emberisle.getState();
      const st = s.state;
      const ours = (v) => st.vertices.find((x) => x.id === v)?.building || st.edges.some((e) => e.path === st.current && (e.va === v || e.vb === v));
      const near = (v) => st.edges.filter((e) => e.va === v || e.vb === v).map((e) => (e.va === v ? e.vb : e.va));
      const open = (v) => [v, ...near(v)].every((x) => !st.vertices.find((y) => y.id === x)?.building);
      const ends = s.highlights().edges.map((id) => {
        const e = st.edges.find((x) => x.id === id);
        return ours(e.va) && ours(e.vb) ? null : ours(e.va) ? e.vb : e.va;
      });
      const best = ends.findIndex((v) => v && open(v));
      return best >= 0 ? best : ends.findIndex((v) => v);
    });
    await g.getByRole("button").nth(Math.max(0, far)).focus();
    await page.keyboard.press("Enter");
    await waitSeq(seq);
    const now = await page.evaluate(() => { const st = window.__emberisle.getState().state; return st.edges.filter((e) => e.path === st.current).length; });
    console.log(`armed Path: ${n} buttons (glow ${hi.edges.length}), Enter -> ${now} paths`);
    if (now !== paths + 1) throw new Error(`path not built: ${paths} -> ${now}`);
  }
  await fill();
  const outpostLegal = await page.evaluate(() => {
    const s = window.__emberisle.getState();
    s.setBuildMode("outpost");
    const n = s.highlights().vertices.length;
    s.setBuildMode("none");
    return n;
  });
  if (outpostLegal > 0) {
    const g = await arm("Outpost", "Place an outpost");
    const n = await g.getByRole("button").count();
    const seq = await page.evaluate(() => window.__emberisle.getState().state.seq);
    await g.getByRole("button").first().focus();
    await page.keyboard.press("Enter");
    await waitSeq(seq);
    const built = await page.evaluate(() => { const st = window.__emberisle.getState().state; return st.vertices.filter((v) => v.building?.playerId === st.current).length; });
    console.log(`armed Outpost: ${n} buttons (legalSettle ${outpostLegal}), Enter -> ${built} outposts`);
    if (n !== outpostLegal || built !== 3) throw new Error(`outpost: ${n} vs ${outpostLegal}, built ${built}`);
  } else {
    throw new Error("armed Outpost: no legal corner after two paths");
  }

  await fill();
  const g = await arm("Stronghold", "Raise a stronghold");
  const strong = await g.getByRole("button").allTextContents();
  const cities = await page.evaluate(() => window.__emberisle.getState().highlights().vertices.length);
  const seq = await page.evaluate(() => window.__emberisle.getState().state.seq);
  await g.getByRole("button").first().focus();
  await page.keyboard.press("Enter");
  await waitSeq(seq);
  const raised = await page.evaluate(() => { const st = window.__emberisle.getState().state; return st.vertices.filter((v) => v.building?.playerId === st.current && v.building.kind === "stronghold").length; });
  console.log(`armed Stronghold: ${strong.length} buttons (glow ${cities}), "${strong[0]}", Enter -> ${raised} stronghold`);
  if (strong.length !== cities || !strong.every((n) => n.startsWith("Corner: your outpost at ")) || raised !== 1) {
    throw new Error(`stronghold: ${JSON.stringify({ strong, cities, raised })}`);
  }

  // A 7: the wayfarer moves by keyboard too.
  const robber = await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.phase = "robber";
    st.dice = [3, 4];
    st.seq += 1;
    g.setState({ state: st, buildMode: "none", error: null });
    return { seq: st.seq, from: st.robberHex, glow: g.getState().highlights().hexes.length };
  });
  const w = page.getByRole("group", { name: "Move the wayfarer" });
  await w.waitFor({ state: "attached", timeout: STEP_MS });
  const hexNames = await w.getByRole("button").allTextContents();
  // A tapped-but-unconfirmed hex A is dropped when focus enters the list, so Enter on B moves the wayfarer once, to B.
  const [hexA, hexB] = await page.evaluate(() => window.__emberisle.getState().highlights().hexes.slice(0, 2));
  await page.evaluate((id) => window.__emberisle.getState().setPendingPlace({ kind: "hex", id }), hexA);
  await page.getByTestId("place-chip").waitFor({ timeout: STEP_MS });
  await w.getByRole("button").nth(1).focus();
  await page.getByTestId("place-chip").waitFor({ state: "detached", timeout: STEP_MS });
  await page.keyboard.press("Enter");
  // One or no seat to rob moves at once; two or more ask "Take from whom?", which is already buttons.
  await page.waitForFunction((r) => { const s = window.__emberisle.getState(); return s.state.seq > r.seq || s.pendingSteal; }, robber, { timeout: STEP_MS });
  const moved = await page.evaluate(() => { const s = window.__emberisle.getState(); return { hex: s.pendingSteal?.hexId ?? s.state.robberHex, asks: !!s.pendingSteal }; });
  console.log(`wayfarer: ${hexNames.length} buttons (glow ${robber.glow}), "${hexNames[0]}", Enter -> ${moved.asks ? "asks whom to rob at" : "moved to"} ${moved.hex}`);
  if (hexNames.length !== robber.glow || new Set(hexNames).size !== hexNames.length || moved.hex !== hexB || moved.hex === robber.from) {
    throw new Error(`wayfarer: ${JSON.stringify({ hexNames, robber, moved })}`);
  }
} catch (e) {
  console.error("keyboard-place-prove failed:", e);
  code = 1;
}
if (errors.length) {
  console.error("console errors:", errors);
  code = 1;
}
await browser.close();
await vite.close();
console.log(code ? "keyboard-place-prove: FAIL" : "keyboard-place-prove: ok");
process.exit(code);
