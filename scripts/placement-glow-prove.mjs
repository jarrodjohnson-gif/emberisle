// #830: placing a home or stronghold, the legal corners glow. In the browser, at 1280x720 and 390x844 (touch):
// - armed (the setup home, then an armed Stronghold) every legal corner wears a ring at least 0.36 across in world units,
//   a dark outline and a cream disc, and the ring + outline show on screen with a light/dark contrast of at least 3:1 on every
//   terrain a legal corner sits on (median over that terrain's corners, read back from the drawn frame) and beat the same
//   corners unarmed by a margin;
// - the marks are seen: a pixel diff of the drawn frame with the marks shown and hidden changes at least MIN_CHANGED of the
//   pixels around every legal corner, for the setup home and for each legal home under an armed Stronghold (where the piece's
//   own base disc once hid the ring);
// - nothing armed (main phase, no build chosen) the island holds no marks at all;
// - under reduced motion the ring holds a static glow (emissive intensity does not move over a full pulse, frames drawn between).
// Saves test-results/placement-glow-{1280x720,390x844}.png and placement-glow-stronghold-{1280x720,390x844}.png. Port from VITE_PORT, default 8130.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8130;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
mkdirSync("test-results", { recursive: true });
mkdirSync("docs/proofs/830", { recursive: true });

const drawn = (page, n, ms = 30_000) =>
  page.evaluate(
    async ([n, ms]) => {
      const isle = window.__isle;
      const r0 = isle.renders;
      const t0 = performance.now();
      isle.wake?.();
      await new Promise((res, rej) => {
        const poll = () => (isle.renders >= r0 + n ? res() : performance.now() - t0 > ms ? rej(new Error(`drawn: ${n} frame(s) never came`)) : requestAnimationFrame(poll));
        poll();
      });
    },
    [n, ms],
  );

// WCAG contrast ratio of the lightest and darkest relative luminance (5th to 95th percentile) in a pixel patch around each point of the last drawn frame.
const ratioAt = (page, pts, radius) =>
  page.evaluate(
    ([pts, radius]) => {
      const c = window.__frame;
      const k = c.width / window.innerWidth;
      const ctx = c.getContext("2d");
      const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return pts.map((p) => {
        const r = Math.round(radius * k);
        const x = Math.max(0, Math.round(p.x * k) - r);
        const y = Math.max(0, Math.round(p.y * k) - r);
        const d = ctx.getImageData(x, y, Math.max(1, Math.min(2 * r, c.width - x)), Math.max(1, Math.min(2 * r, c.height - y))).data;
        const lum = [];
        for (let i = 0; i < d.length; i += 4) lum.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]));
        lum.sort((a, b) => a - b);
        const lo = lum[Math.floor(lum.length * 0.05)];
        const hi = lum[Math.floor(lum.length * 0.95)];
        const med = lum[Math.floor(lum.length * 0.5)];
        return { lo, hi, med };
      });
    },
    [pts, radius],
  );

// The share of pixels around each point that differ from the patch stored under `key` (store: true saves the patches of the last
// drawn frame; otherwise the last drawn frame is compared with them). A pixel differs when a channel moves by more than DELTA.
const DELTA = 24;
// MIN_CHANGED = 0.15 reflects the geometric area of the projected ring torus (ellipse ribbon)
// relative to the (2r) x (2r) square bounding box patch (the thin ring ribbon occupies ~0.05-0.10 of
// the square area, plus outline and contrast edge reaching ~0.16-0.18 on light terrain).
// With depthTest: false, the marks are 100% unoccluded by terrain ridges across all corners.
const MIN_CHANGED = 0.15;
const patches = (page, key, store, pts, radius) =>
  page.evaluate(
    ([key, store, pts, radius, delta]) => {
      const c = window.__frame;
      const k = c.width / window.innerWidth;
      const ctx = c.getContext("2d");
      const read = (p) => {
        const r = Math.round(radius * k);
        const x = Math.max(0, Math.round(p.x * k) - r);
        const y = Math.max(0, Math.round(p.y * k) - r);
        return ctx.getImageData(x, y, Math.max(1, Math.min(2 * r, c.width - x)), Math.max(1, Math.min(2 * r, c.height - y))).data;
      };
      if (store) {
        window[key] = pts.map(read);
        return [];
      }
      return pts.map((p, i) => {
        const a = window[key][i];
        const b = read(p);
        let n = 0;
        for (let j = 0; j < b.length; j += 4) if (Math.max(Math.abs(a[j] - b[j]), Math.abs(a[j + 1] - b[j + 1]), Math.abs(a[j + 2] - b[j + 2])) > delta) n++;
        return n / (b.length / 4);
      });
    },
    [key, store, pts, radius, DELTA],
  );

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

for (const [w, h, touch] of [
  [1280, 720, false],
  [390, 844, true],
  [844, 390, true],
]) {
  const tag = `${w}x${h}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addInitScript(() => localStorage.setItem("emberisle-water", "simple"));
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });
  // Copy every drawn frame into a 2D canvas, so pixels can be read back without preserveDrawingBuffer.
  await page.evaluate(() => {
    const isle = window.__isle;
    const gl = isle.renderer.domElement;
    const copy = document.createElement("canvas");
    window.__frame = copy;
    const draw = isle.composer.render.bind(isle.composer);
    isle.composer.render = (...a) => {
      const out = draw(...a);
      copy.width = gl.width;
      copy.height = gl.height;
      copy.getContext("2d").drawImage(gl, 0, 0);
      return out;
    };
  });
  // Pin createGame's synchronous seed draw so board terrain layout and legal corner positions are deterministic across runs.
  await page.waitForFunction(() => typeof window.__emberisle?.getState().startHotseat === "function", null, { timeout: STEP_MS });
  await page.evaluate(() => {
    const store = window.__emberisle;
    const start = store.getState().startHotseat;
    store.setState({
      startHotseat(count) {
        const random = Math.random;
        Math.random = () => 830 / 1e9;
        try {
          start(count);
        } finally {
          Math.random = random;
        }
      },
    });
  });
  await page.getByRole("button", { name: "Four seats, one table" }).click();
  await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState, null, { timeout: STEP_MS });
  await page.evaluate(() => {
    const g = window.__emberisle;
    while (g.getState().state.phase === "rollOff") g.getState().dispatch({ type: "roll" });
  });
  const settled = () =>
    page.waitForFunction(() => window.__isle.lastSeq === window.__emberisle.getState().state.seq && !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
  await settled();
  await drawn(page, 3);

  // The marks on the island: ring size, outline, disc.
  const marksInfo = () =>
    page.evaluate(() => {
      const kids = window.__isle.marks.children;
      const rings = kids.filter((m) => m.userData.kind === "vertex" && m.geometry?.type === "TorusGeometry");
      const outlinesMesh = kids.find((m) => m.userData.kind === "vertex-outlines");
      const discsMesh = kids.find((m) => m.userData.kind === "vertex-discs");
      const outlines = outlinesMesh ? outlinesMesh.count : kids.filter((m) => m.userData.kind === "vertex-outline").length;
      const discs = discsMesh ? discsMesh.count : kids.filter((m) => m.userData.kind === "vertex-disc").length;
      const visibleDraws = kids.filter((m) => m.visible !== false).length;
      return {
        rings: rings.length,
        outlines,
        discs,
        visibleDraws,
        diameter: rings[0] ? 2 * (rings[0].geometry.parameters.radius + rings[0].geometry.parameters.tube) : 0,
        total: kids.length,
      };
    });
  const legalNow = () => page.evaluate(() => window.__emberisle.getState().highlights().vertices);
  const terrainOf = (ids) =>
    page.evaluate((ids) => {
      const st = window.__emberisle.getState().state;
      return ids.map((id) => {
        const v = st.vertices.find((x) => x.id === id);
        return st.hexes.find((hh) => hh.id === v.hexes[0]).terrain;
      });
    }, ids);

  // Armed: the setup home.
  const legal = await legalNow();
  const info = await marksInfo();
  check(`${tag}: armed home shows a ring, outline and disc on every legal corner`, legal.length > 0 && info.rings === legal.length && info.outlines === legal.length && info.discs === legal.length, { legal: legal.length, ...info });
  check(`${tag}: ring is at least 0.36 across`, info.diameter >= 0.36, info.diameter);
  check(`${tag}: marks draw-call count is capped (instanced outlines/discs)`, info.visibleDraws <= 60, info.visibleDraws);

  const pts = await page.evaluate((ids) => ids.map((id) => window.__isle.screenOf(id)), legal);
  const onScreen = legal.map((_, i) => pts[i] && pts[i].x > 8 && pts[i].x < w - 8 && pts[i].y > 8 && pts[i].y < h - 8);
  const terrains = await terrainOf(legal);
  // The ring's reach on screen: 0.2 world units along x, a little over.
  const reachOf = (id) =>
    page.evaluate((id) => {
      const i = window.__isle;
      const v = i.lastState.vertices.find((x) => x.id === id);
      const a = i.screenAt(v.x, 0.3, v.z);
      const b = i.screenAt(v.x + 0.2, 0.3, v.z);
      return Math.max(4, Math.hypot(a.x - b.x, a.y - b.y) * 1.3);
    }, id);
  const r = await reachOf(legal[0]);
  await drawn(page, 2);
  const at = pts.map((p) => p ?? { x: 0, y: 0 });
  const armed = await ratioAt(page, at, r);
  await patches(page, "__shown", true, at, r);
  await page.screenshot({ path: `test-results/placement-glow-${tag}.png` });
  await page.screenshot({ path: `docs/proofs/830/placement-glow-${tag}.png` });
  await page.evaluate(() => {
    window.__isle.marks.visible = false;
  });
  await drawn(page, 2);
  const bare = await ratioAt(page, at, r);
  const changed = await patches(page, "__shown", false, at, r);
  await page.evaluate(() => {
    window.__isle.marks.visible = true;
  });
  const by = new Map();
  legal.forEach((_, i) => {
    if (!onScreen[i]) return;
    const t = terrains[i];
    if (!by.has(t)) by.set(t, { contrast: [], unarmed: [] });
    const ringContrast = (armed[i].hi + 0.05) / (bare[i].med + 0.05);
    const outlineContrast = (bare[i].med + 0.05) / (armed[i].lo + 0.05);
    by.get(t).contrast.push(Math.max(ringContrast, outlineContrast));
    by.get(t).unarmed.push((bare[i].hi + 0.05) / (bare[i].lo + 0.05));
  });
  check(`${tag}: legal corners sit on screen`, onScreen.filter(Boolean).length >= legal.length * 0.9, { onScreen: onScreen.filter(Boolean).length, legal: legal.length });
  for (const [t, v] of by) {
    const a = median(v.contrast);
    check(`${tag}: ${t} corners read at 3:1 or better against the hex beneath`, a >= 3, { median: +a.toFixed(2), n: v.contrast.length });
  }
  const seen = changed.filter((_, i) => onScreen[i]);
  check(`${tag}: every legal corner is seen (marks shown vs hidden)`, seen.length > 0 && Math.min(...seen) >= MIN_CHANGED, { corners: seen.length, least: +Math.min(...seen).toFixed(3), median: +median(seen).toFixed(3) });

  // Reduced motion: a static glow. A frame is drawn before each read, since reduced motion draws none on its own.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, null, { timeout: STEP_MS });
  await page.waitForTimeout(1500);
  const glowAt = () => page.evaluate(() => window.__isle.marks.children.filter((m) => m.userData.baseGlow !== undefined).map((m) => m.material.emissiveIntensity));
  await drawn(page, 1);
  const g1 = await glowAt();
  await page.waitForTimeout(700);
  await drawn(page, 1);
  const g2 = await glowAt();
  check(`${tag}: reduced motion holds a static glow`, g1.length > 0 && g1.every((x, i) => x === g2[i] && x === 1), { first: g1[0], later: g2[0] });
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // Setup road: legal road paths glow with bars (#830)
  const roadInfo = await page.evaluate(() => {
    const g = window.__emberisle;
    const s = g.getState();
    const hi = s.highlights();
    if (s.state.phase === "setupSettle" && hi.vertices[0]) s.pickVertex(hi.vertices[0]);
    const edges = g.getState().highlights().edges;
    const edgeMarks = window.__isle.marks.children.filter((m) => m.userData.kind === "edge" && m.visible !== false);
    return {
      phase: g.getState().state.phase,
      legalEdges: edges.length,
      edgeMarks: edgeMarks.length,
      visibleDraws: window.__isle.marks.visible ? edgeMarks.length : 0,
      glow: edgeMarks[0]?.material?.emissiveIntensity,
    };
  });
  check(`${tag}: setupRoad displays glowing bars on every legal road edge`, roadInfo.phase === "setupRoad" && roadInfo.legalEdges > 0 && roadInfo.edgeMarks === roadInfo.legalEdges && roadInfo.visibleDraws === roadInfo.legalEdges, roadInfo);

  // Finish setup, then nothing armed leaves no marks; an armed Stronghold rings the legal homes only.
  await page.evaluate(() => {
    const g = window.__emberisle;
    for (let i = 0; i < 40; i++) {
      const s = g.getState();
      const ph = s.state.phase;
      const hi = s.highlights();
      if (ph === "setupSettle" && hi.vertices[0]) s.pickVertex(hi.vertices[0]);
      else if (ph === "setupRoad" && hi.edges[0]) s.pickEdge(hi.edges[0]);
      else if (ph === "roll") s.dispatch({ type: "roll" });
      else if (ph === "robber" && hi.hexes[0]) {
        s.pickHex(hi.hexes[0]);
        const steal = g.getState().pendingSteal;
        if (steal) g.getState().chooseSteal(steal.targets[0]);
      } else break;
    }
    g.setState({ buildMode: "none" });
  });
  const phase = await page.evaluate(() => window.__emberisle.getState().state.phase);
  await settled();
  await drawn(page, 2);
  const none = await marksInfo();
  check(`${tag}: nothing armed (phase ${phase}) leaves no marks`, none.total === 0, none);
  await page.evaluate(() => window.__emberisle.setState({ buildMode: "stronghold" }));
  await settled();
  await drawn(page, 2);
  const own = await legalNow();
  const sh = await marksInfo();
  check(`${tag}: armed Stronghold rings exactly the legal homes`, own.length > 0 && sh.rings === own.length && sh.outlines === own.length, { legal: own.length, ...sh });
  // The ring must show over the home's own base disc: a pixel diff with the marks shown and hidden, at each legal home.
  const homeAt = await page.evaluate((ids) => ids.map((id) => window.__isle.screenOf(id)), own);
  const homeOn = homeAt.map((p) => p && p.x > 8 && p.x < w - 8 && p.y > 8 && p.y < h - 8);
  const hp = homeAt.map((p) => p ?? { x: 0, y: 0 });
  const hr = await reachOf(own[0]);
  await patches(page, "__homeShown", true, hp, hr);
  await page.screenshot({ path: `test-results/placement-glow-stronghold-${tag}.png` });
  await page.screenshot({ path: `docs/proofs/830/placement-glow-stronghold-${tag}.png` });
  await page.evaluate(() => {
    window.__isle.marks.visible = false;
  });
  await drawn(page, 2);
  const homeChanged = await patches(page, "__homeShown", false, hp, hr);
  await page.evaluate(() => {
    window.__isle.marks.visible = true;
  });
  check(`${tag}: armed Stronghold rings are seen over every legal home`, homeOn.every(Boolean) && homeChanged.length > 0 && Math.min(...homeChanged) >= MIN_CHANGED, { homes: own.length, onScreen: homeOn.filter(Boolean).length, least: +Math.min(...homeChanged).toFixed(3), changed: homeChanged.map((x) => +x.toFixed(3)) });
  await page.evaluate(() => window.__emberisle.setState({ buildMode: "none" }));
  await settled();
  await drawn(page, 2);
  check(`${tag}: disarming clears the marks`, (await marksInfo()).total === 0);
  await ctx.close();
}

check("zero console errors", errors.length === 0, errors.slice(0, 5));
await browser.close();
await vite.close();
if (fails.length) {
  console.error(`placement-glow-prove FAILED: ${fails.join("; ")}`);
  process.exit(1);
}
console.log("placement-glow-prove ok");
