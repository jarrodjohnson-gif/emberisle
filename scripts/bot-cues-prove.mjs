// #722 (#608): the decorative board cue under a bot's line (src/lib/scene/bot-cues.ts, docs/design/bot-action-moments.md,
// "Decorative targets"). Part 1 drives the cue layer alone with a stub board: epochs, preemption, expiry, missing and
// replaced targets, rebuilds and disposal. Part 2 runs the real renderer in the real game at 1280x720 and 390x844, with
// motion and with reduced motion: each target kind, both edges of a Path fortune, legal marks, pick hits and camera matrices
// unchanged, the cue visible on screen, a steady outline under reduced motion, a rebuild, a new island, expiry with no
// input, and no leaked geometry. Contrast is measured and printed; the design leaves its threshold to the owner.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8173;
const OUT = process.env.PROOF_ARTIFACT_DIR || "test-results/bot-cues";
const fails = [];
const errors = [];
let checks = 0;
const check = (name, ok, data) => {
  checks++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${data === undefined ? "" : " " + JSON.stringify(data)}`);
  if (!ok) fails.push(name);
};

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
let browser;
try {
  await vite.listen();
  const THREE = await vite.ssrLoadModule("three");
  const { BotCues, CUE, LIFT, RIM_W, neutralFor } = await vite.ssrLoadModule("/src/lib/scene/bot-cues.ts");
  const { RIM } = await vite.ssrLoadModule("/src/lib/scene/palette.ts");
  const { PLAYER_COLORS } = await vite.ssrLoadModule("/src/lib/game/types.ts");
  const { EXPANDED_COLORS } = await vite.ssrLoadModule("/src/lib/game/expanded.ts");
  // WCAG 2 contrast from #rrggbb, computed here, independent of three.js.
  const lumHex = (hex) => { const n = parseInt(hex.slice(1), 16); const l = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * l(n >> 16) + 0.7152 * l((n >> 8) & 255) + 0.0722 * l(n & 255); };
  const contrast = (a, b) => { const x = lumHex(a), y = lumHex(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const SEATS = [...new Set([...PLAYER_COLORS, ...EXPANDED_COLORS])];

  // ---- Part 1: the layer alone ----
  {
    const board = new Map([
      ["v1", { kind: "vertex", x: 1, y: 0.3, z: 2 }],
      ["a|b", { kind: "edge", x: 0.5, y: 0.3, z: -1, rot: 0.5, span: 1 }],
      ["b|c", { kind: "edge", x: 1.5, y: 0.3, z: -1, rot: 1.5, span: 1 }],
      ["0,0", { kind: "hex", x: 0, y: 0.3, z: 0 }],
    ]);
    const resolve = (id) => board.get(id) ?? null;
    const disposed = { geo: 0, mat: 0 };
    const created = { geo: new Set(), mat: new Set() };
    const track = (cues) => cues.group.traverse((o) => {
      if (o.geometry && !created.geo.has(o.geometry)) { created.geo.add(o.geometry); o.geometry.addEventListener("dispose", () => disposed.geo++); }
      if (o.material && !created.mat.has(o.material)) { created.mat.add(o.material); o.material.addEventListener("dispose", () => disposed.mat++); }
    });
    const cues = new BotCues();
    const kids = () => cues.group.children;
    const up = () => kids().length > 0;
    // Which board ids the cue covers now, read back from its meshes' places.
    const covered = () => [...board.entries()].filter(([, t]) => kids().some((m) => Math.abs(m.position.x - t.x) < 1e-9 && Math.abs(m.position.z - t.z) < 1e-9 && Math.abs(m.position.y - t.y - LIFT) < 0.01)).map(([id]) => id);
    const req = (epoch, targets, until = 2000, color = PLAYER_COLORS[1]) => ({ epoch, targets, color, until });

    check("layer: a corner, both Path-fortune edges and a hex each draw", cues.show(req(1, ["v1"]), resolve) === 1 && cues.show(req(1, ["a|b", "b|c"]), resolve) === 2 && cues.show(req(1, ["0,0"]), resolve) === 1);
    check("layer: each target is a neutral edge mesh and an accent mesh above it", kids().length === 2 && kids()[1].position.y - kids()[0].position.y > 0 && kids()[0].renderOrder < kids()[1].renderOrder);
    const hexGeo = kids().map((m) => m.geometry.parameters);
    check("layer: the hex rim is a 6-sided band, the neutral edge wider on both sides", hexGeo.every((g) => g.thetaSegments === 6) && Math.abs(hexGeo[0].outerRadius - hexGeo[1].outerRadius - RIM_W) < 1e-12 && Math.abs(hexGeo[1].innerRadius - hexGeo[0].innerRadius - RIM_W) < 1e-12, hexGeo);
    check("layer: a hex is turned so its corners sit on the board's", kids().every((m) => Math.abs(m.rotation.z - Math.PI / 6) < 1e-12 && Math.abs(m.rotation.x + Math.PI / 2) < 1e-12));
    cues.show(req(1, ["a|b", "b|c"]), resolve);
    track(cues);
    const plates = kids().map((m) => ({ ...m.geometry.parameters, rot: m.rotation.z }));
    check("layer: both edges drawn, each a plate turned to its own edge", JSON.stringify(covered()) === '["a|b","b|c"]' && plates.map((p) => p.rot).join() === "0.5,0.5,1.5,1.5" && Math.abs(plates[0].width - plates[1].width - 2 * RIM_W) < 1e-12 && Math.abs(plates[1].height - 2 * CUE.edge[1]) < 1e-12, plates);
    cues.show(req(1, ["v1"]), resolve);
    const ring = kids().map((m) => m.geometry.parameters);
    check("layer: a corner ring lies outside a built piece's base (0.28) and the home halo's band (0.39)", ring[1].innerRadius > 0.39 && ring[0].innerRadius > 0.28 && ring[1].thetaSegments === 40, ring);
    check("layer: a missing id is skipped, not swapped for another", cues.show(req(1, ["gone", "v1"]), resolve) === 1 && JSON.stringify(covered()) === '["v1"]');
    check("layer: nothing to draw means no cue at all", cues.show(req(1, ["gone"]), resolve) === 0 && !up());
    check("layer: no colour draws nothing", cues.show(req(1, ["v1"], 2000, null), resolve) === 0 && !up());
    cues.show(req(1, ["v1"], 0), resolve);
    check("layer: a line already past its deadline ends on the next step", cues.step(1, true) === true && !up());

    // Pulse and reduced motion.
    cues.show(req(2, ["v1"], 5000), resolve);
    const accent = () => kids()[1].material;
    const edge = () => kids()[0].material;
    const ops = [0, 200, 450, 700].map((t) => (cues.step(t, false), accent().opacity));
    check("layer: with motion the accent pulses between 0.7 and 1", new Set(ops.map((o) => o.toFixed(3))).size > 2 && ops.every((o) => o >= 0.7 - 1e-9 && o <= 1 + 1e-9), ops);
    const calm = [800, 1100, 1400].map((t) => (cues.step(t, true), accent().opacity));
    check("layer: reduced motion holds a steady full outline", calm.every((o) => o === 1), calm);
    check("layer: reduced motion asks for no frame while nothing changes", cues.step(1600, true) === false);
    check("layer: the neutral edge stays opaque and does not pulse", edge().opacity === 1);
    check("layer: unlit, untone-mapped, depth-tested, writes no depth, casts no shadow", [accent(), edge()].every((m) => m.isMeshBasicMaterial && !m.toneMapped && m.depthTest && !m.depthWrite) && kids().every((m) => !m.castShadow && !m.receiveShadow));

    // Expiry.
    check("layer: still up just before its end", cues.step(4999, true) === false && up());
    check("layer: gone at its end, and the step reports the change", cues.step(5000, true) === true && !up());
    check("layer: nothing up, no frame asked for", cues.step(5100, false) === false);

    // Preemption and epochs.
    cues.show(req(3, ["v1"]), resolve);
    cues.show(req(3, ["0,0"]), resolve);
    check("layer: a new line replaces the cue that was up", JSON.stringify(covered()) === '["0,0"]' && kids().length === 2);
    check("layer: an older epoch's line is refused and leaves the cue", cues.show(req(2, ["v1"]), resolve) === 0 && JSON.stringify(covered()) === '["0,0"]');
    check("layer: a line with no targets ends the cue", cues.show(req(3, []), resolve) === 0 && !up());
    cues.show(req(4, []), resolve);
    check("layer: a newer epoch with no targets refuses older lines from then on", cues.show(req(3, ["v1"]), resolve) === 0 && !up() && cues.show(req(4, ["v1"]), resolve) === 1);
    check("layer: a NaN epoch is refused", cues.show(req(NaN, ["0,0"]), resolve) === 0 && JSON.stringify(covered()) === '["v1"]');

    // Rebuilds: the same ids on the board as it is now.
    cues.show(req(4, ["v1", "a|b"]), resolve);
    track(cues);
    board.set("v1", { kind: "vertex", x: 1, y: 0.5, z: 2 });
    cues.resync(resolve);
    track(cues);
    check("layer: a rebuild places the same ids again at their new spots", JSON.stringify(covered()) === '["v1","a|b"]' && Math.abs(kids()[0].position.y - (0.5 + LIFT)) < 1e-12);
    board.delete("a|b");
    cues.resync(resolve);
    check("layer: a target gone after a rebuild drops out", JSON.stringify(covered()) === '["v1"]');
    board.delete("v1");
    cues.resync(resolve);
    check("layer: when every target is gone the cue ends", !up() && cues.step(0, false) === false);
    board.set("v1", { kind: "vertex", x: 0, y: 0, z: 0 });
    cues.resync(resolve);
    check("layer: an ended cue never comes back on a rebuild", !up());

    // Cleanup.
    cues.show(req(4, ["v1", "0,0", "b|c"]), resolve);
    track(cues);
    cues.dispose();
    check("layer: dispose releases every geometry and material it made", disposed.geo === created.geo.size && disposed.mat === created.mat.size && created.mat.size === 2, { disposed, made: { geo: created.geo.size, mat: created.mat.size } });

    // Edge colour choice for every seat colour, four-seat and expanded.
    const pairs = SEATS.map((c) => ({ seat: c, edge: neutralFor(c), ratio: +contrast(c, neutralFor(c)).toFixed(2), other: +contrast(c, neutralFor(c) === RIM.dark ? RIM.light : RIM.dark).toFixed(2) }));
    check("layer: each seat gets whichever board neutral stands further from it (WCAG)", pairs.every((p) => p.ratio >= p.other), pairs);
    check("layer: the ivory seat gets the dark edge, the blue seat the light one", neutralFor("#f3ecd9") === RIM.dark && neutralFor("#2d6ee8") === RIM.light);
  }

  // ---- Part 2: the real renderer ----
  const { createGame } = await vite.ssrLoadModule("/src/lib/game/board.ts");
  const { applyAction } = await vite.ssrLoadModule("/src/lib/game/rules.ts");
  // Real roll-off to p0's setup turn (legal corners up), then Tide (p1) and Dune (p2) are given pieces as a bot would have.
  const fixture = () => {
    let state = createGame({ seed: 722, humans: ["Ember", "Tide", "Dune", "Pine"].map((name) => ({ name })), bots: 0 });
    const descriptor = Object.getOwnPropertyDescriptor(crypto, "getRandomValues");
    let die = 1;
    try {
      Object.defineProperty(crypto, "getRandomValues", { configurable: true, value: (b) => { b.fill(die - 1); return b; } });
      for (let n = 0; state.phase === "rollOff" && n < 12; n++) {
        die = state.current === "p0" ? 6 : 1 + Number(state.current.slice(1));
        const next = applyAction(state, state.current, { type: "roll" });
        assert.equal(next.error, undefined);
        state = next.state;
      }
    } finally {
      if (descriptor) Object.defineProperty(crypto, "getRandomValues", descriptor);
      else delete crypto.getRandomValues;
    }
    assert.equal(state.phase, "setupSettle");
    assert.equal(state.current, "p0");
    state = structuredClone(state);
    const land = new Map(state.hexes.map((h) => [h.id, h.terrain]));
    const inland = (v) => v.hexes.length === 3 && v.hexes.every((id) => land.get(id) && land.get(id) !== "sea");
    const byDist = (a, b) => a.x * a.x + a.z * a.z - (b.x * b.x + b.z * b.z);
    const corners = state.vertices.filter(inland).sort(byDist);
    const tide = corners[0];
    const near = new Set(state.edges.filter((e) => e.va === tide.id || e.vb === tide.id).flatMap((e) => [e.va, e.vb]));
    const dune = corners.find((v) => !near.has(v.id) && Math.hypot(v.x - tide.x, v.z - tide.z) > 2.5);
    const set = (v, playerId) => { state.vertices.find((x) => x.id === v.id).building = { playerId, kind: "outpost" }; };
    set(tide, "p1");
    set(dune, "p2");
    const tideEdges = state.edges.filter((e) => e.va === tide.id || e.vb === tide.id).slice(0, 2);
    for (const e of tideEdges) e.path = "p1";
    const duneEdge = state.edges.find((e) => e.va === dune.id || e.vb === dune.id);
    duneEdge.path = "p2";
    // The wayfarer's hex: a pale one (grain or waste) away from both, for the hardest ground.
    const hex = state.hexes.filter((h) => ["grain", "waste"].includes(h.terrain) && !tide.hexes.includes(h.id) && !dune.hexes.includes(h.id))[0];
    state.robberHex = hex.id;
    state.seq += 1;
    return { state, tide: tide.id, dune: dune.id, tideEdges: tideEdges.map((e) => e.id), duneEdge: duneEdge.id, hex: hex.id };
  };
  const f = fixture();
  const other = createGame({ seed: 7220, humans: ["Ember", "Tide", "Dune", "Pine"].map((name) => ({ name })), bots: 0 });
  mkdirSync(OUT, { recursive: true });

  const cases = [
    { width: 1280, height: 720, mobile: false, reduce: false },
    { width: 1280, height: 720, mobile: false, reduce: true },
    { width: 390, height: 844, mobile: true, reduce: false },
    { width: 390, height: 844, mobile: true, reduce: true },
  ];
  const records = [];
  for (const test of cases) {
    const tag = `${test.width}x${test.height}-${test.reduce ? "reduce" : "motion"}`;
    browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    const ctx = await browser.newContext({ viewport: { width: test.width, height: test.height }, deviceScaleFactor: 1, isMobile: test.mobile, hasTouch: test.mobile, reducedMotion: test.reduce ? "reduce" : "no-preference" });
    try {
      await ctx.addInitScript(() => localStorage.setItem("emberisle-water", "simple"));
      const page = await ctx.newPage();
      page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag}: ${m.text()}`); });
      page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.waitForFunction(() => window.__isle?.renders > 0 && window.__emberisle, null, { timeout: STEP_MS });
      await page.evaluate((state) => {
        const g = window.__emberisle, start = g.getState().startHotseat;
        g.setState({ seatCount: 4, startHotseat: (count) => { start(count); g.setState({ state, localId: state.current, banner: null, error: null }); } });
      }, f.state);
      await page.getByRole("button", { name: "Pass and play", exact: true }).click();
      // Which of `cands` the cue covers now, read back from its meshes' places on the board.
      await page.evaluate((LIFT) => {
        window.__cueIds = (cands) => { const i = window.__isle, kids = i.cues.group.children; return cands.filter((id) => { const t = i.cueAt(id); return t && kids.some((m) => Math.abs(m.position.x - t.x) < 1e-9 && Math.abs(m.position.z - t.z) < 1e-9 && Math.abs(m.position.y - t.y - LIFT) < 0.01); }); };
      }, LIFT);
      const settled = (seq = f.state.seq) => page.waitForFunction((seq) => {
        const i = window.__isle;
        return i?.lastSeq === seq && i.landReady && !i.refitDue && !i.glide && i.landings.length === 0 && !i.dust.active && !i.jelly?.busy();
      }, seq, { timeout: STEP_MS });
      await settled();
      await page.waitForFunction(() => !document.querySelector('[data-testid="banner"]'), null, { timeout: STEP_MS });
      // Two draws with nothing new, so the baseline frame is the settled one.
      const drawn = async () => { const r = await page.evaluate(() => window.__isle.renders); await page.evaluate(() => window.__isle.wake()); await page.waitForFunction((r) => window.__isle.renders >= r + 2, r, { timeout: STEP_MS }); };
      await drawn();

      // What the board looks like to the game before any cue: marks, picks, legal ids, camera, pieces.
      const snapshot = (ids) => page.evaluate((ids) => {
        const i = window.__isle, cam = i.cam();
        cam.updateMatrixWorld();
        const hits = {};
        for (const id of ids) {
          const p = i.screenOf(id);
          hits[id] = i.hitsAt({ clientX: p.x, clientY: p.y }, true).map((h) => `${h.kind}:${h.id}`);
          // Points round the target, where the cue's rim lies, too.
          for (const [dx, dy] of [[12, 0], [-12, 0], [0, 12], [0, -12]]) hits[`${id}@${dx},${dy}`] = i.hitsAt({ clientX: p.x + dx, clientY: p.y + dy }, true).map((h) => `${h.kind}:${h.id}`);
        }
        return {
          legal: [...i.legalIds].sort(),
          picks: i.pickables.map((o) => `${o.userData.kind}:${o.userData.id}`).sort(),
          marks: i.marks.children.map((m) => `${m.userData.kind}:${m.userData.id ?? ""}:${m.position.toArray().map((n) => n.toFixed(5))}`).sort(),
          camera: [...cam.projectionMatrix.elements, ...cam.matrixWorld.elements].map((n) => +n.toFixed(9)),
          pieces: i.pieces.children.map((o) => `${o.position.toArray().map((n) => n.toFixed(5))}|${o.scale.toArray().map((n) => n.toFixed(5))}`).sort(),
          inScene: i.scene.children.includes(i.cues.group),
          pickableCue: i.pickables.some((o) => { let x = o; while (x) { if (x === i.cues.group) return true; x = x.parent; } return false; }),
          inMarks: i.marks.children.includes(i.cues.group),
          geometries: i.renderer.info.memory.geometries,
          view: i.view,
          calm: i.wasCalm,
        };
      }, ids);
      const targets = [f.tide, ...f.tideEdges, f.hex, f.dune, f.duneEdge];
      const base = await snapshot(targets);
      check(`${tag}: legal corners are up for the seat to act`, base.legal.length > 0 && base.calm === test.reduce, { legal: base.legal.length, view: base.view });
      const baseShot = await page.screenshot({ path: join(OUT, `${tag}-0-before.png`) });

      // Each target's footprint on screen: the box round its cue's outer edge, for the pixel checks.
      const footprints = (spec) => page.evaluate(({ spec, CUE, RIM_W, LIFT }) => {
        const i = window.__isle, out = [];
        for (const id of spec) {
          const t = i.cueAt(id);
          if (!t) continue;
          const y = t.y + LIFT, pts = [];
          if (t.kind === "edge") {
            const along = { x: Math.sin(t.rot), z: Math.cos(t.rot) }, across = { x: along.z, z: -along.x };
            const w = CUE.edge[0] + RIM_W, l = CUE.edge[1] * t.span + RIM_W;
            for (const u of [-1, 1]) for (const v of [-1, 1]) pts.push(i.screenAt(t.x + along.x * u * l + across.x * v * w, y, t.z + along.z * u * l + across.z * v * w));
          } else {
            const r = CUE[t.kind][0] + RIM_W;
            for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; pts.push(i.screenAt(t.x + Math.cos(a) * r, y, t.z + Math.sin(a) * r)); }
          }
          const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
          out.push({ id, kind: t.kind, box: { x0: Math.floor(Math.min(...xs)), y0: Math.floor(Math.min(...ys)), x1: Math.ceil(Math.max(...xs)), y1: Math.ceil(Math.max(...ys)) } });
        }
        return out;
      }, { spec, CUE, RIM_W, LIFT });
      // Pixels in a box that differ between two screenshots by 40 or more on some channel, and each one's WCAG contrast
      // against what was there before.
      const diffBox = (a, b, box) => page.evaluate(async ({ a, b, box }) => {
        const load = async (b64) => {
          const img = new Image();
          await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = `data:image/png;base64,${b64}`; });
          const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
          const x = c.getContext("2d"); x.drawImage(img, 0, 0);
          const x0 = Math.max(0, box.x0), y0 = Math.max(0, box.y0), w = Math.max(1, Math.min(img.width, box.x1) - x0), h = Math.max(1, Math.min(img.height, box.y1) - y0);
          return x.getImageData(x0, y0, w, h).data;
        };
        const p = await load(a), q = await load(b);
        const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        const lum = (d, k) => 0.2126 * lin(d[k]) + 0.7152 * lin(d[k + 1]) + 0.0722 * lin(d[k + 2]);
        const ratios = [];
        for (let k = 0; k < p.length; k += 4) {
          if (Math.max(Math.abs(p[k] - q[k]), Math.abs(p[k + 1] - q[k + 1]), Math.abs(p[k + 2] - q[k + 2])) < 40) continue;
          const x = lum(p, k), y = lum(q, k);
          ratios.push((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05));
        }
        ratios.sort((x, y) => x - y);
        return { area: p.length / 4, changed: ratios.length, medianContrastVsBefore: +(ratios[Math.floor(ratios.length / 2)] ?? 1).toFixed(2) };
      }, { a: a.toString("base64"), b: b.toString("base64"), box });
      const lum = (rgb) => rgb.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, k) => s + v * [0.2126, 0.7152, 0.0722][k], 0);
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

      const record = { ...test, kinds: {} };
      // One line per kind, as the presenter would send them: Tide's outpost, Tide's two Path-fortune edges, the wayfarer's
      // hex, then Dune's (ivory) outpost and path.
      const lines = [
        { name: "corner", actor: "p1", targets: [f.tide] },
        { name: "path fortune", actor: "p1", targets: f.tideEdges },
        { name: "wayfarer hex", actor: "p1", targets: [f.hex] },
        { name: "ivory corner and path", actor: "p2", targets: [f.dune, f.duneEdge] },
      ];
      let epoch = 1;
      for (const line of lines) {
        const n = await page.evaluate(({ line, epoch }) => window.__isle.cueTargets(epoch, line.actor, line.targets, performance.now() + 60_000), { line, epoch });
        check(`${tag}: ${line.name} draws every target`, n === line.targets.length, { n });
        await drawn();
        const shot = await page.screenshot({ path: join(OUT, `${tag}-${line.name.replace(/ /g, "-")}.png`) });
        const after = await snapshot(targets);
        check(`${tag}: ${line.name}: legal ids, pick volumes and marks unchanged`, JSON.stringify([after.legal, after.picks, after.marks]) === JSON.stringify([base.legal, base.picks, base.marks]));
        check(`${tag}: ${line.name}: pick hits at and round every target unchanged`, JSON.stringify(after.hits) === JSON.stringify(base.hits));
        check(`${tag}: ${line.name}: camera matrices unchanged`, JSON.stringify(after.camera) === JSON.stringify(base.camera));
        check(`${tag}: ${line.name}: pieces' places and scales unchanged`, JSON.stringify(after.pieces) === JSON.stringify(base.pieces));
        check(`${tag}: ${line.name}: own scene layer, outside marks and pickables`, after.inScene && !after.inMarks && !after.pickableCue);
        for (const fp of await footprints(line.targets)) {
          const d = await diffBox(baseShot, shot, fp.box);
          record.kinds[`${line.name}:${fp.kind}`] = d;
          // The piece covers the far half of a corner ring or path plate at the diorama's tilt, and tall ground (forest
          // hills) can hide more, so the bar is a visible patch: at least 40 changed pixels at these sizes.
          check(`${tag}: ${line.name}: the ${fp.kind} cue shows on screen`, d.changed >= 40, d);
        }
        const mat = await page.evaluate(() => { const g = window.__isle.cues.group; return { accent: g.children[1].material.color.getHexString(), edge: g.children[0].material.color.getHexString() }; });
        const seat = f.state.players.find((p) => p.id === line.actor).color;
        check(`${tag}: ${line.name}: actor-colour accent with its neutral edge`, `#${mat.accent}` === seat && `#${mat.edge}` === neutralFor(seat), mat);
      }

      // Pulse with motion; a steady outline with reduced motion.
      const ops = [];
      for (let k = 0; k < 4; k++) {
        await page.waitForTimeout(170);
        ops.push(await page.evaluate(() => window.__isle.cues.group.children[1]?.material.opacity));
      }
      if (test.reduce) check(`${tag}: reduced motion: the accent holds still at full`, ops.every((o) => o === 1), ops);
      else check(`${tag}: motion: the accent pulses`, new Set(ops.map((o) => o.toFixed(3))).size > 1, ops);

      // A rebuild: Dune builds a second path, so the board is pushed and the pieces rebuilt; the cue stays on the same ids.
      const geoBefore = await page.evaluate(() => {
        let n = 0;
        window.__isle.cues.group.traverse((o) => { if (o.geometry) { n++; o.geometry.addEventListener("dispose", () => (window.__cueFreed = (window.__cueFreed ?? 0) + 1)); } });
        return n;
      });
      const next = structuredClone(f.state);
      const extra = next.edges.find((e) => !e.path && (e.va === f.dune || e.vb === f.dune));
      extra.path = "p2";
      next.seq += 1;
      await page.evaluate((state) => window.__emberisle.setState({ state }), next);
      await page.waitForFunction((seq) => window.__isle.lastSeq === seq, next.seq, { timeout: STEP_MS });
      await drawn();
      const rebuilt = await page.evaluate((cands) => ({ ids: window.__cueIds(cands), meshes: window.__isle.cues.group.children.length, freed: window.__cueFreed ?? 0 }), targets);
      check(`${tag}: a rebuild keeps the same ids, placed on the new board`, JSON.stringify(rebuilt.ids) === JSON.stringify([f.dune, f.duneEdge]) && rebuilt.meshes === 4, rebuilt);
      check(`${tag}: a rebuild frees the old cue meshes`, rebuilt.freed >= geoBefore, { freed: rebuilt.freed, made: geoBefore });

      // Preemption and epochs on the real renderer.
      const pre = await page.evaluate(({ f, targets }) => {
        const i = window.__isle, until = performance.now() + 60_000;
        const n1 = i.cueTargets(2, "p1", [f.tide], until);
        const older = i.cueTargets(1, "p2", [f.dune], until);
        const kept = window.__cueIds(targets);
        const unknown = i.cueTargets(2, "p9", [f.tide], until);
        return { n1, older, kept, unknown, left: i.cues.group.children.length };
      }, { f, targets });
      check(`${tag}: an older epoch's line is refused and the cue stays`, pre.n1 === 1 && pre.older === 0 && JSON.stringify(pre.kept) === JSON.stringify([f.tide]));
      check(`${tag}: a line from a seat not on the board ends the cue and draws nothing`, pre.unknown === 0 && pre.left === 0);
      const reset = await page.evaluate(({ f, targets }) => {
        const i = window.__isle;
        i.cueTargets(3, "p1", [f.tide, "no-such-id"], performance.now() + 60_000);
        const partial = window.__cueIds([...targets, "no-such-id"]);
        const ended = i.cueTargets(4, "", [], 0);
        return { partial, ended, left: i.cues.group.children.length, refused: i.cueTargets(3, "p1", [f.tide], performance.now() + 60_000) };
      }, { f, targets });
      check(`${tag}: a missing id is skipped and the rest draw`, JSON.stringify(reset.partial) === JSON.stringify([f.tide]));
      check(`${tag}: a new epoch with no targets ends the cue and refuses older lines`, reset.ended === 0 && reset.left === 0 && reset.refused === 0);

      // A new island is a new deal: the cue ends, even on ids the new board shares with the old one.
      await page.evaluate(({ f }) => window.__isle.cueTargets(5, "p1", [f.tide, ...f.tideEdges], performance.now() + 60_000), { f });
      const island = structuredClone(other);
      island.seq = next.seq + 5;
      await page.evaluate((state) => window.__emberisle.setState({ state }), island);
      await page.waitForFunction((seq) => window.__isle.lastSeq === seq, island.seq, { timeout: STEP_MS });
      const gone = await page.evaluate(() => window.__isle.cues.group.children.length);
      const shared = [f.tide, ...f.tideEdges].filter((id) => island.vertices.some((v) => v.id === id) || island.edges.some((e) => e.id === id)).length;
      check(`${tag}: a new island ends the cue, even where its ids match the old board's`, gone === 0, { meshes: gone, shared });

      // Back to the fixture board; a short line ends by itself with no input, even when reduced motion runs no frames.
      await page.evaluate((state) => window.__emberisle.setState({ state }), { ...structuredClone(next), seq: island.seq + 1 });
      await settled(island.seq + 1);
      await drawn();
      const geo0 = await page.evaluate(() => window.__isle.renderer.info.memory.geometries);
      const end0 = await page.evaluate(({ f }) => { const until = performance.now() + 2500; window.__isle.cueTargets(6, "p1", [f.tide, ...f.tideEdges, f.hex], until); return until; }, { f });
      await drawn();
      const up = await page.evaluate(() => {
        const i = window.__isle;
        window.__cueEndFreed = 0;
        let made = 0;
        i.cues.group.traverse((o) => { if (o.geometry) { made++; o.geometry.addEventListener("dispose", () => window.__cueEndFreed++); } });
        return { meshes: i.cues.group.children.length, geo: i.renderer.info.memory.geometries, made };
      });
      // Past the deadline and the renderer's 1 s draw hold after it, with no input.
      await page.waitForFunction((t) => performance.now() > t + 1800, end0, { timeout: STEP_MS, polling: 100 });
      const r0 = await page.evaluate(() => window.__isle.renders);
      await page.waitForTimeout(300);
      const end = await page.evaluate(() => ({ meshes: window.__isle.cues.group.children.length, geo: window.__isle.renderer.info.memory.geometries, renders: window.__isle.renders, freed: window.__cueEndFreed }));
      check(`${tag}: a cue is up for its line`, up.meshes === 8 && up.geo > geo0, { up, geo0 });
      check(`${tag}: it ends by itself at its deadline`, end.meshes === 0, end);
      check(`${tag}: every cue geometry is freed when it ends`, end.freed === up.made, { made: up.made, freed: end.freed });
      check(`${tag}: no cue geometry left on the GPU after it ends`, end.geo === geo0, { geo0, up: up.geo, end: end.geo });
      if (test.reduce) check(`${tag}: reduced motion goes back to no frames once the cue is gone`, end.renders === r0, { r0, renders: end.renders });
      await page.screenshot({ path: join(OUT, `${tag}-9-after.png`) });

      // Disposal: leaving the table drops the renderer, and the cue layer frees all it holds.
      const disposedOk = await page.evaluate(({ f }) => {
        const i = window.__isle;
        i.cueTargets(7, "p1", [f.tide], performance.now() + 60_000);
        const made = new Set();
        let freed = 0;
        i.cues.group.traverse((o) => { for (const r of [o.geometry, o.material]) if (r && !made.has(r)) { made.add(r); r.addEventListener("dispose", () => freed++); } });
        i.dispose();
        return { freed, made: made.size, meshes: i.cues.group.children.length };
      }, { f });
      check(`${tag}: renderer disposal frees every cue geometry and material`, disposedOk.freed === disposedOk.made && disposedOk.made === 4 && disposedOk.meshes === 0, disposedOk);
      records.push(record);
    } finally {
      await ctx.close();
      await browser.close();
      browser = undefined;
    }
  }
  check("zero console errors", errors.length === 0, errors);
  const seatPairs = SEATS.map((c) => ({ seat: c, edge: neutralFor(c), accentVsEdge: +contrast(c, neutralFor(c)).toFixed(2) }));
  writeFileSync(join(OUT, "measurements.json"), JSON.stringify({ fixture: { seed: 722, tide: f.tide, tideEdges: f.tideEdges, hex: f.hex, dune: f.dune, duneEdge: f.duneEdge }, seatPairs, records, fails, errors }, null, 2));
  console.log("bot-cues-prove: contrast (measured, no threshold asserted; the design leaves it to the owner)");
  for (const p of seatPairs) console.log(`  seat ${p.seat}: edge ${p.edge}, accent vs edge ${p.accentVsEdge}:1`);
  for (const r of records) for (const [k, v] of Object.entries(r.kinds)) console.log(`  ${r.width}x${r.height} ${r.reduce ? "reduce" : "motion"} ${k}: ${v.changed} of ${v.area} footprint pixels changed, median contrast against the board before ${v.medianContrastVsBefore}:1`);
  if (fails.length) { console.error(`bot-cues-prove: ${fails.length} of ${checks} checks failed`); process.exitCode = 1; }
  else console.log(`bot-cues-prove: ${checks} checks pass`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await vite.close();
}
