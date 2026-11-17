// #590: ivory path markers keep a non-pickable dark boundary on grain and waste, including reduced motion.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8156;
const OUT = process.env.PROOF_ARTIFACT_DIR || "test-results/legal-edge";
const fails = [], errors = [], records = [];
const check = (name, ok, data) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${data === undefined ? "" : " " + JSON.stringify(data)}`);
  if (!ok) fails.push(name);
};
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const luminance = (rgb) => rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
let browser, browserVersion;
try {
  await vite.listen();
  const { createGame, worldOfHex } = await vite.ssrLoadModule("/src/lib/game/board.ts");
  const { applyAction, legalSettle } = await vite.ssrLoadModule("/src/lib/game/rules.ts");
  const { RIM } = await vite.ssrLoadModule("/src/lib/scene/palette.ts");
  // Real rules actions with controlled roll-off dice; no browser clock or rendering policy is changed.
  const fixture = (leadId) => {
    let state = createGame({ seed: 590, humans: ["Ember", "Tide", "Dune", "Violet"].map(name => ({ name })), bots: 0 });
    const rolls = Object.fromEntries(state.players.filter(p => p.id !== leadId).map((p, i) => [p.id, i + 1]));
    rolls[leadId] = 6;
    let die = 1;
    const descriptor = Object.getOwnPropertyDescriptor(crypto, "getRandomValues");
    try {
      Object.defineProperty(crypto, "getRandomValues", { configurable: true, value: (buffer) => { buffer.fill(die - 1); return buffer; } });
      for (let n = 0; state.phase === "rollOff" && n < 12; n++) {
        die = rolls[state.current];
        const next = applyAction(state, state.current, { type: "roll" });
        assert.equal(next.error, undefined);
        state = next.state;
      }
    } finally {
      if (descriptor) Object.defineProperty(crypto, "getRandomValues", descriptor);
      else delete crypto.getRandomValues;
    }
    assert.equal(state.phase, "setupSettle");
    assert.equal(state.current, leadId);
    const terrains = new Map(state.hexes.map(h => [h.id, h.terrain]));
    const vertex = state.vertices.filter(v => v.hexes.some(id => terrains.get(id) === "grain") && v.hexes.some(id => terrains.get(id) === "waste"))
      .sort((a, b) => a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z)[0];
    assert.ok(vertex && legalSettle(state, leadId, true).includes(vertex.id));
    return { state, vertexId: vertex.id, centers: Object.fromEntries(state.hexes.map(h => [h.id, worldOfHex(h)])) };
  };
  const fixtures = Object.fromEntries(["p0", "p1", "p2", "p3"].map(id => [id, fixture(id)]));
  mkdirSync(OUT, { recursive: true });
  const waitPaint = async (page) => {
    const expected = await page.evaluate(() => { const s = window.__emberisle.getState().state; return { seq: s.seq, seed: s.seed }; });
    await page.waitForFunction(({ seq, seed }) => {
      const i = window.__isle;
      return i?.lastSeq === seq && i.__edgePaint?.seq === seq && i.__edgePaint?.seed === seed && i.landReady && !i.refitDue && !i.glide;
    }, expected, { timeout: STEP_MS });
  };
  const cases = [
    ...[false, true].flatMap(reduce => [[430, 932], [390, 844], [844, 390]].map(([width, height]) => ({ width, height, reduce, lead: "p2" }))),
    ...["p0", "p1", "p3"].map(lead => ({ width: 390, height: 844, reduce: true, lead })),
  ];
  for (const test of cases) {
    const { width, height, reduce, lead } = test, f = fixtures[lead], pale = lead === "p2";
    const tag = `${lead}-${width}x${height}-${reduce ? "reduce" : "motion"}`;
    browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    browserVersion = browser.version();
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: reduce ? "reduce" : "no-preference" });
    try {
      await ctx.addInitScript(() => localStorage.setItem("emberisle-water", "simple"));
      const page = await ctx.newPage();
      page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", e => errors.push(String(e)));
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.waitForFunction(() => window.__isle?.renders > 0 && window.__emberisle, null, { timeout: STEP_MS });
      await page.evaluate(({ state }) => {
        const proto = Object.getPrototypeOf(window.__isle), draw = proto.draw;
        // Observe a completed real draw without waking the scene or supplying extra frames.
        proto.draw = function (...args) {
          const seq = this.lastSeq, seed = this.lastState?.seed;
          const result = draw.apply(this, args);
          this.__edgePaint = { seq, seed, renders: this.renders };
          return result;
        };
        const g = window.__emberisle, start = g.getState().startHotseat;
        g.setState({ seatCount: 4, startHotseat: count => {
          start(count);
          g.setState({ state, localId: state.current, banner: null, error: null });
        } });
      }, f);
      await page.getByRole("button", { name: "Pass and play", exact: true }).click();
      await waitPaint(page);
      const corner = await page.evaluate(id => window.__isle.screenOf(id), f.vertexId);
      assert.ok(corner);
      await page.touchscreen.tap(corner.x, corner.y);
      await page.waitForFunction(id => window.__emberisle.getState().pendingPlace?.kind === "vertex" && window.__emberisle.getState().pendingPlace?.id === id, f.vertexId, { timeout: STEP_MS });
      await page.getByTestId("place-chip").tap();
      await page.waitForFunction(({ id, lead }) => {
        const s = window.__emberisle.getState().state;
        return s.phase === "setupRoad" && s.current === lead && s.vertices.find(v => v.id === id)?.building?.playerId === lead;
      }, { id: f.vertexId, lead }, { timeout: STEP_MS });
      await waitPaint(page);
      await page.waitForFunction(() => !document.querySelector('[data-testid="banner"]'), null, { timeout: STEP_MS });
      const info = await page.evaluate(({ centers }) => {
        const i = window.__isle, g = window.__emberisle, s = g.getState().state;
        const bars = i.marks.children.filter(m => m.userData.kind === "edge" && m.visible);
        const rim = i.marks.children.find(m => m.userData.kind === "edge-outlines");
        const instances = [];
        if (rim) for (let n = 0; n < rim.count; n++) {
          const matrix = new i.camera.matrixWorld.constructor();
          rim.getMatrixAt(n, matrix);
          const e = matrix.elements;
          instances.push({ x: e[12], y: e[13], z: e[14], width: rim.geometry.parameters.width * Math.hypot(e[0], e[1], e[2]), height: rim.geometry.parameters.height * Math.hypot(e[4], e[5], e[6]), length: rim.geometry.parameters.depth * Math.hypot(e[8], e[9], e[10]) });
        }
        const samples = [];
        const described = bars.map(m => {
          const edge = s.edges.find(e => e.id === m.userData.id), a = s.vertices.find(v => v.id === edge.va), b = s.vertices.find(v => v.id === edge.vb);
          const span = Math.hypot(b.x - a.x, b.z - a.z), along = { x: (b.x - a.x) / span, z: (b.z - a.z) / span }, across = { x: along.z, z: -along.x };
          for (const h of s.hexes.filter(h => a.hexes.includes(h.id) && b.hexes.includes(h.id) && ["grain", "waste"].includes(h.terrain))) {
            const sign = Math.sign((centers[h.id].x - m.position.x) * across.x + (centers[h.id].z - m.position.z) * across.z) || 1;
            // Measure outside the projected bar silhouette: a world-plane point can be
            // hidden by the taller bar at this camera angle, even when the rim is visible.
            const center = i.screenAt(m.position.x, m.position.y, m.position.z);
            const tip = i.screenAt(m.position.x + along.x * span, m.position.y, m.position.z + along.z * span);
            const length = Math.hypot(tip.x - center.x, tip.y - center.y);
            const normal = { x: -(tip.y - center.y) / length, y: (tip.x - center.x) / length };
            const terrainSide = i.screenAt(m.position.x + across.x * sign, m.position.y, m.position.z + across.z * sign);
            if ((terrainSide.x - center.x) * normal.x + (terrainSide.y - center.y) * normal.y < 0) { normal.x *= -1; normal.y *= -1; }
            const boundary = [-0.18, -0.09, 0, 0.09, 0.18].map(t => {
              const core = i.screenAt(m.position.x + along.x * t * span, m.position.y, m.position.z + along.z * t * span);
              const corners = [-1, 1].flatMap(side => [-1, 1].map(top => i.screenAt(m.position.x + along.x * t * span + across.x * side * 0.08, m.position.y + top * 0.035, m.position.z + along.z * t * span + across.z * side * 0.08)));
              const extent = Math.max(...corners.map(p => (p.x - core.x) * normal.x + (p.y - core.y) * normal.y));
              return { x: core.x + normal.x * extent, y: core.y + normal.y * extent };
            });
            const points = distance => boundary.map(p => ({ x: p.x + normal.x * distance, y: p.y + normal.y * distance }));
            samples.push({ edge: edge.id, terrain: h.terrain, rim: points(1), ground: points(4) });
          }
          return { id: edge.id, x: m.position.x, y: m.position.y, z: m.position.z, width: m.geometry.parameters.width, height: m.geometry.parameters.height, length: m.geometry.parameters.depth, span, color: m.material.color.getHexString(), emissive: m.material.emissive.getHexString() };
        });
        return { seed: s.seed, current: s.current, color: s.players.find(p => p.id === s.current).color, view: i.view, wasCalm: i.wasCalm, legal: g.getState().highlights().edges,
          proxies: i.pickables.filter(o => o.userData.kind === "edge").map(o => o.userData.id), bars: described, samples, instances,
          rim: rim ? { count: rim.count, color: rim.material.color.getHexString(), pickable: i.pickables.includes(rim), instanced: Boolean(rim.isInstancedMesh), geometries: i.marks.children.filter(m => m.userData.kind === "edge-outlines").length } : null };
      }, f);
      check(`${tag}: real setup actions show all legal path bars`, info.seed === 590 && info.current === lead && info.bars.length > 0 && info.bars.length === info.legal.length);
      check(`${tag}: overhead and requested motion preference`, info.view === "overhead" && info.wasCalm === reduce);
      check(`${tag}: original edge pick targets`, JSON.stringify([...info.proxies].sort()) === JSON.stringify([...info.legal].sort()));
      check(`${tag}: original bar dimensions and seat fill`, info.bars.every(b => b.width === 0.16 && b.height === 0.07 && Math.abs(b.length - b.span * 0.72) < 1e-8 && `#${b.color}` === info.color));
      check(`${tag}: outline only for ivory`, pale ? info.rim?.count === info.legal.length : info.rim === null, info.rim);
      if (pale) {
        check(`${tag}: one dark non-pickable instanced group`, info.rim?.geometries === 1 && info.rim.instanced && !info.rim.pickable && `#${info.rim.color}` === RIM.dark);
        check(`${tag}: every bar has a wider, longer rim below its top`, info.bars.every(b => {
          const r = info.instances.find(r => Math.hypot(r.x - b.x, r.z - b.z) < 1e-4);
          return r && r.width > b.width && r.length > b.length && r.y + r.height / 2 < b.y + b.height / 2 && r.y - r.height / 2 >= b.y - b.height / 2 - 1e-4;
        }));
        check(`${tag}: real grain and waste boundaries covered`, ["grain", "waste"].every(t => info.samples.some(s => s.terrain === t)));
      }
      const filename = `${tag}.png`, image = await page.screenshot({ path: join(OUT, filename) });
      const sampled = await page.evaluate(async ({ base64, samples }) => {
        const image = new Image();
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = `data:image/png;base64,${base64}`; });
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
        const read = p => { const x = Math.round(p.x * image.width / innerWidth), y = Math.round(p.y * image.height / innerHeight); if (x < 0 || y < 0 || x >= image.width || y >= image.height) throw new Error("contrast sample outside screenshot"); return [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3); };
        return samples.map(s => ({ ...s, rimRGB: s.rim.map(read), groundRGB: s.ground.map(read) }));
      }, { base64: image.toString("base64"), samples: info.samples });
      const contrasts = sampled.map(s => { const a = median(s.rimRGB.map(luminance)), b = median(s.groundRGB.map(luminance)); return { ...s, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }; });
      if (pale) for (const sample of contrasts) check(`${tag}: ${sample.terrain} edge ${sample.edge} contrast >= 3`, sample.contrast >= 3, { contrast: sample.contrast, rimRGB: sample.rimRGB, groundRGB: sample.groundRGB });
      const edgeId = info.bars[0].id, point = await page.evaluate(id => window.__isle.screenOf(id), edgeId);
      assert.ok(point);
      await page.touchscreen.tap(point.x, point.y);
      await page.waitForFunction(id => window.__emberisle.getState().pendingPlace?.kind === "edge" && window.__emberisle.getState().pendingPlace?.id === id, edgeId, { timeout: STEP_MS });
      check(`${tag}: touch selects the intended path before confirmation`, true);
      await page.getByTestId("place-chip").tap();
      await page.waitForFunction(({ id, lead }) => window.__emberisle.getState().state.edges.find(e => e.id === id)?.path === lead, { id: edgeId, lead }, { timeout: STEP_MS });
      check(`${tag}: a real touch still places that path`, true);
      records.push({ ...test, filename, info, contrasts });
    } catch (error) {
      try {
        const page = ctx.pages()[0];
        if (page) {
          const state = await page.evaluate(() => { const g = window.__emberisle?.getState(), i = window.__isle; return { phase: g?.state?.phase, current: g?.state?.current, seq: g?.state?.seq, pendingPlace: g?.pendingPlace, screen: g?.screen, mode: g?.mode, lastSeq: i?.lastSeq, renders: i?.renders, painted: i?.__edgePaint }; });
          writeFileSync(join(OUT, `${tag}-failure.json`), JSON.stringify(state, null, 2));
          await page.screenshot({ path: join(OUT, `${tag}-failure.png`) });
          console.error("legal-edge failure state", JSON.stringify(state));
        }
      } catch (captureError) { console.error("legal-edge diagnostic failed", String(captureError)); }
      throw error;
    } finally { await ctx.close(); await browser.close(); browser = undefined; }
  }
  check("zero console errors", errors.length === 0, errors);
  writeFileSync(join(OUT, "measurements.json"), JSON.stringify({ seed: 590, node: process.version, browser: browserVersion, sourceSHA256: createHash("sha256").update(readFileSync("src/lib/scene/isle-renderer.ts")).digest("hex"), sampling: "median linear-sRGB luminance of five fixed pixels 1 CSS pixel outside the projected bar silhouette and ground pixels 4 CSS pixels outside; WCAG ratio", records, failures: fails, errors }, null, 2));
  if (fails.length) { console.error(`legal-edge-prove: ${fails.length} failed checks`); process.exitCode = 1; }
  else console.log(`legal-edge-prove: ok (${cases.length} real-game cases)`);
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser?.close(); await vite.close(); }
