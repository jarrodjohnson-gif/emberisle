// #376 (WCAG 2.1.1): a keyboard alone places every setup piece in hotseat, then a path, an outpost, a stronghold and the
// wayfarer through the PlaceList beside the HUD. Each list holds exactly the targets the island glows; zero console errors.
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

  // #437: the legal corners wear the seat's colour and breathe on the 1.2 s pulse; under reduced motion they hold their base glow.
  let observe;
  let liveN = 0;
  {
    // Every mark's colour and emissive intensity over one pulse period, read off the live scene on animation frames.
    observe = (moving, on = page) =>
      on.evaluate(
        (moving) =>
          new Promise((resolve) => {
            const t0 = performance.now();
            const seat = window.__emberisle.getState().state.players.find((p) => p.id === window.__emberisle.getState().state.current).color;
            const lo = new Map();
            const hi = new Map();
            
            const colors = new Set();
            let frames = 0;
            const frame = () => {
              frames++;
              const marks = window.__isle.marks.children.filter((m) => m.userData.baseGlow !== undefined && m.userData.kind === "vertex");
              for (const m of marks) {
                colors.add(`#${m.material.color.getHexString()}`);
                const v = m.material.emissiveIntensity;
                lo.set(m.userData.id, Math.min(lo.get(m.userData.id) ?? v, v));
                hi.set(m.userData.id, Math.max(hi.get(m.userData.id) ?? v, v));
              }
              const ids0 = [...lo.keys()];
              const swing0 = Math.max(0, ...ids0.map((i) => hi.get(i) - lo.get(i)));
              // Moving: until a swing shows (software GL draws a frame every ~0.7 s, so a clock window would miss it). Still: one full pulse of frames.
              const more = moving ? swing0 < 0.1 && performance.now() - t0 < 15000 : performance.now() - t0 < 1400 || frames < 3;
              if (more) requestAnimationFrame(frame);
              else {
                const ids = [...lo.keys()];
                resolve({ n: ids.length, seat, colors: [...colors], swing: Math.max(0, ...ids.map((i) => hi.get(i) - lo.get(i))), frames });
              }
            };
            requestAnimationFrame(frame);
          }),
        moving,
      );
    await page.waitForFunction(() => window.__isle.marks.children.some((m) => m.userData.kind === "vertex" && m.userData.baseGlow !== undefined), null, { timeout: STEP_MS });
    const live = await observe(true);
    liveN = live.n;
    console.log(`legal corners: ${live.n} marks, colours ${live.colors}, seat ${live.seat}, glow swing ${live.swing.toFixed(2)} over one pulse (${live.frames} frames)`);
    if (live.n !== start.hi.vertices.length || live.colors.length !== 1 || live.colors[0] !== live.seat.toLowerCase() || live.swing < 0.1) {
      throw new Error(`marks do not pulse in the seat colour: ${JSON.stringify(live)}`);
    }
    // Flip to reduced motion mid-pulse: the marks drop to their base glow and stay there.
    await page.evaluate(() => {
      window.__calmFlip = new Promise((res) => matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => res(e.matches), { once: true }));
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    if ((await page.evaluate(() => window.__calmFlip)) !== true) throw new Error("reduced-motion change event did not reach the page");
    await page.waitForFunction(() => window.__isle.marks.children.filter((m) => m.userData.baseGlow !== undefined).every((m) => m.material.emissiveIntensity === m.userData.baseGlow), null, { timeout: STEP_MS * 4 });
    const flipped = await observe(false);
    console.log(`flipped to reduced motion mid-pulse: glow swing ${flipped.swing.toFixed(2)}`);
    if (flipped.swing !== 0) throw new Error(`marks still move after the flip: ${JSON.stringify(flipped)}`);
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }

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
  const arm = async (name, heading) => {
    await page.getByRole("button", { name, exact: true }).focus({ timeout: STEP_MS });
    await page.keyboard.press("Enter");
    const g = page.getByRole("group", { name: heading });
    await g.waitFor({ state: "attached", timeout: STEP_MS });
    return g;
  };
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
  // #437: a page that starts under reduced motion holds every mark at its base glow. The first page is parked so software GL has the CPU.
  await page.goto("about:blank");
  const still = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  still.on("pageerror", (e) => errors.push(String(e)));
  await still.goto(`http://127.0.0.1:${PORT}/`);
  await still.getByRole("button", { name: "Four seats, one table" }).focus();
  await still.keyboard.press("Enter");
  await still.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
  for (let i = 0; i < 40; i++) {
    const phase = await still.evaluate(() => window.__emberisle.getState().state.phase);
    if (phase !== "rollOff") break;
    const seq = await still.evaluate(() => window.__emberisle.getState().state.seq);
    await still.getByRole("button", { name: "Roll", exact: true }).focus({ timeout: STEP_MS });
    await still.keyboard.press("Enter");
    await still.waitForFunction((s) => window.__emberisle.getState().state.seq > s, seq, { timeout: STEP_MS });
  }
  await still.waitForFunction(() => window.__isle?.marks.children.some((m) => m.userData.kind === "vertex" && m.userData.baseGlow !== undefined), null, { timeout: STEP_MS });
  const calm = await observe(false, still);
  console.log(`reduced motion: ${calm.n} marks, glow swing ${calm.swing.toFixed(2)} over ${calm.frames} frames`);
  if (calm.swing !== 0 || calm.n !== liveN) throw new Error(`marks move under reduced motion: ${JSON.stringify(calm)}`);
  // Legibility, worst case: the darkest seat (Pine) acts. At the pulse trough (0.6x base) a corner ring and a path bar must still
  // carry enough light to read on forest: emissive luminance times trough intensity stays above a floor.
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const trough = await still.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const pine = st.players.find((p) => p.color.toLowerCase() === "#3d6b4f") ?? st.players[0];
    st.current = pine.id;
    st.seq += 1;
    g.setState({ state: st, buildMode: "none", error: null });
    return pine.id;
  });
  const read = (kind) =>
    still.waitForFunction(
      (k) => window.__isle.marks.children.some((m) => m.userData.kind === k && m.userData.baseGlow !== undefined),
      kind,
      { timeout: STEP_MS * 4 },
    ).then(() =>
      still.evaluate((k) => {
        const m = window.__isle.marks.children.find((o) => o.userData.kind === k && o.userData.baseGlow !== undefined);
        return { glow: { r: m.material.emissive.r, g: m.material.emissive.g, b: m.material.emissive.b }, trough: m.userData.baseGlow * 0.6 };
      }, kind),
    );
  const ring = await read("vertex");
  await still.evaluate(() => window.__emberisle.getState().pickVertex(window.__emberisle.getState().highlights().vertices[0]));
  const bar = await read("edge");
  const lr = lum(ring.glow) * ring.trough;
  const lb = lum(bar.glow) * bar.trough;
  console.log(`Pine (${trough}) at the trough: ring light ${lr.toFixed(3)}, path bar light ${lb.toFixed(3)} (floor 0.1)`);
  if (lr < 0.1 || lb < 0.1) throw new Error(`Pine marks too dim at the trough: ring ${lr}, bar ${lb}`);
  await still.close();
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
