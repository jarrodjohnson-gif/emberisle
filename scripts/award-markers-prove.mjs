// #743: the board award markers (docs/design/award-markers.md), in practice through window.__isle, on fixture states pushed
// through the store at 1280x720, 390x844, 844x390 and 320x568.
// - no holder: no markers; the path banner is one strip per witness edge, keyed `e:<id>`, above its path, never pickable;
// - a duplicate push keeps the same meshes; a transfer to no holder removes them all; repeated transfers leak no geometry;
// - the army flag (pole and pennant) sits on the holder's smallest-id stronghold, and an army holder with only outposts has
//   no flag;
// - a marker hides while its piece lands, while its edge is a legal or pending target, and while it leaves the hole;
// - the title's demo island has none; pickables and legal ids are the same with and without markers;
// - dispose releases the group. Screenshots for the look check go to test-results/award-markers-*.png.
// Zero console errors. Run: npm run award-markers-prove
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8131;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
mkdirSync("test-results", { recursive: true });

// In the page: a fixture of the current practice island. p0 owns a simple line of `n` paths and the strongholds asked for.
const FIXTURE = `(opts) => {
  const g = window.__emberisle.getState();
  const st = structuredClone(g.state);
  st.phase = "main";
  st.seq += 1;
  for (const e of st.edges) e.path = null;
  for (const v of st.vertices) v.building = null;
  const at = (v) => st.edges.filter((e) => e.va === v || e.vb === v);
  const far = (e, v) => (e.va === v ? e.vb : e.va);
  const land = (vid) => st.vertices.find((v) => v.id === vid).hexes.some((h) => st.hexes.find((x) => x.id === h)?.terrain !== "sea");
  // A line through land corners near the island's middle, so it sits well inside the hole.
  const starts = [...st.vertices].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  let line = null;
  for (const s of starts) {
    const path = [];
    const seen = new Set([s.id]);
    const go = (v) => {
      if (path.length === opts.n) return true;
      for (const e of at(v)) {
        const n = far(e, v);
        if (seen.has(n) || !land(n)) continue;
        seen.add(n);
        path.push(e);
        if (go(n)) return true;
        path.pop();
        seen.delete(n);
      }
      return false;
    };
    if (go(s.id)) {
      line = { edges: path.map((e) => e.id), corners: [s.id, ...[...seen].filter((x) => x !== s.id)] };
      break;
    }
  }
  for (const id of line.edges) st.edges.find((e) => e.id === id).path = "p0";
  const ends = [];
  for (const e of line.edges) for (const v of [st.edges.find((x) => x.id === e).va, st.edges.find((x) => x.id === e).vb]) ends.push(v);
  const corners = [...new Set(ends)].sort();
  for (const [i, kind] of (opts.buildings ?? []).entries()) st.vertices.find((v) => v.id === corners[i * 2]).building = { playerId: "p0", kind };
  st.longestRoad = opts.road ? "p0" : null;
  st.largestArmy = opts.army ? "p0" : null;
  return { st, line, corners };
}`;

// Push a fixture through the store (the canvas calls setBoard) and wait for the chunk to draw it.
async function push(page, opts) {
  const fx = await page.evaluate(([src, o]) => {
    const fx = eval(src)(o);
    window.__emberisle.setState({ state: fx.st });
    return { line: fx.line, corners: fx.corners, seq: fx.st.seq };
  }, [FIXTURE, opts]);
  await page.waitForFunction((want) => (window.__isle.awards?.group.children.length ?? 0) === want, expectMeshes(opts), { timeout: 20_000 });
  return fx;
}
const expectMeshes = (o) => (o.road ? o.n : 0) + (o.army && (o.buildings ?? []).includes("stronghold") ? 2 : 0);

// The markers as the renderer holds them.
const READ = () => {
  const isle = window.__isle;
  const kids = isle.awards?.group.children ?? [];
  return {
    keys: kids.map((m) => m.userData.key),
    visible: kids.map((m) => m.visible),
    uuids: kids.map((m) => m.uuid),
    inScene: Boolean(isle.awards && isle.awards.group.parent === isle.scene),
    picked: isle.pickables.some((p) => kids.includes(p)),
    raycast: kids.map((m) => {
      const hits = [];
      m.raycast({ ray: { origin: m.position, direction: m.position }, near: 0, far: 1 }, hits);
      return hits.length;
    }),
    geometries: isle.renderer.info.memory.geometries,
  };
};

const errors = [];
let code = 0;
try {
  for (const [w, h] of [[1280, 720], [390, 844], [844, 390], [320, 568]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`${w}x${h}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${w}x${h}: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle && window.__isle);
    await page.evaluate(() => {
      window.__emberisle.getState().startAi();
      window.__emberisle.setState({ runBots: () => {} });
    });
    await page.waitForFunction(() => window.__emberisle.getState().state && window.__isle.lastState && !window.__isle.titleMode);
    const tag = `${w}x${h}`;

    // No holder: nothing drawn, and the chunk need not even load.
    await push(page, { n: 5 });
    let r = await page.evaluate(READ);
    assert.equal(r.keys.length, 0, `${tag}: no holder, no markers`);
    const picksBare = await page.evaluate(() => window.__isle.pickables.map((p) => `${p.userData.kind}:${p.userData.id}`).join(","));

    // The banner: one strip per edge of the witness, in its order, never pickable or hit by a ray.
    const fx = await push(page, { n: 5, road: true });
    r = await page.evaluate(READ);
    assert.ok(r.inScene, `${tag}: marker group not in the scene`);
    const witness = await page.evaluate(async () => {
      const { roadWitness } = await import("/src/lib/game/rules.ts");
      return roadWitness(window.__emberisle.getState().state, "p0").edgeIds;
    });
    assert.deepEqual(r.keys, witness.map((id) => `e:${id}`), `${tag}: strips follow the witness`);
    assert.deepEqual([...r.keys].sort(), fx.line.edges.map((id) => `e:${id}`).sort(), `${tag}: strips on the holder's line`);
    assert.equal(r.picked, false, `${tag}: a marker is pickable`);
    assert.ok(r.raycast.every((n) => n === 0), `${tag}: a marker answers a ray`);
    assert.ok(r.visible.every(Boolean), `${tag}: a strip inside the hole is hidden ${JSON.stringify(r.visible)}`);
    const heights = await page.evaluate(() => {
      const isle = window.__isle;
      return isle.awards.group.children.map((m) => {
        const p = isle.pieces.children.find((c) => c.userData.key === m.userData.key);
        // The piece's resting top, from its own bounds.
        p.updateMatrixWorld(true);
        let maxY = -Infinity;
        p.traverse((o) => {
          if (!o.geometry) return;
          o.geometry.computeBoundingBox();
          const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
          maxY = Math.max(maxY, bb.max.y);
        });
        return { lift: m.position.y - (maxY - p.position.y + p.userData.restY) };
      });
    });
    assert.ok(heights.every((x) => Math.abs(x.lift - 0.045) < 1e-6), `${tag}: strip lift above the path ${JSON.stringify(heights)}`);
    const picksMarked = await page.evaluate(() => window.__isle.pickables.map((p) => `${p.userData.kind}:${p.userData.id}`).join(","));
    assert.equal(picksMarked, picksBare, `${tag}: pickables change with markers`);

    // A duplicate push (a seq bump, as a reconnect gives) keeps the same meshes.
    const before = r.uuids;
    await page.evaluate(() => {
      const st = structuredClone(window.__emberisle.getState().state);
      st.seq += 1;
      window.__emberisle.setState({ state: st });
    });
    r = await page.evaluate(READ);
    assert.deepEqual(r.uuids, before, `${tag}: a duplicate push rebuilt the markers`);

    // Suppression: a landing piece, a legal edge, the pending target, and a hole the strip leaves.
    const sup = await page.evaluate((edge) => {
      const isle = window.__isle;
      const vis = () => isle.awards.group.children.find((m) => m.userData.key === `e:${edge}`).visible;
      const out = {};
      isle.landings.push({ obj: { userData: { key: `e:${edge}` } } });
      isle.stepAwards();
      out.landing = vis();
      isle.landings.pop();
      isle.stepAwards();
      out.rest = vis();
      isle.legalIds.add(edge);
      isle.stepAwards();
      out.legal = vis();
      isle.legalIds.delete(edge);
      isle.pending = { kind: "edge", id: edge };
      isle.stepAwards();
      out.pending = vis();
      isle.pending = null;
      const hole = isle.awardHole;
      const c = isle.renderer.domElement;
      isle.awardHole = { top: 0, left: 0, right: c.clientWidth - 2, bottom: c.clientHeight - 2 };
      isle.stepAwards();
      out.outside = isle.awards.group.children.every((m) => !m.visible);
      isle.awardHole = hole;
      isle.stepAwards();
      out.back = vis();
      return out;
    }, fx.line.edges[2]);
    assert.deepEqual(sup, { landing: false, rest: true, legal: false, pending: false, outside: true, back: true }, `${tag}: suppression ${JSON.stringify(sup)}`);

    if (w === 1280) await page.screenshot({ path: "test-results/award-markers-banner-1280x720.png" });

    // The army flag: on the smallest-id stronghold of the holder, not on an outpost.
    const fx2 = await push(page, { n: 5, road: true, army: true, buildings: ["outpost", "stronghold", "stronghold"] });
    r = await page.evaluate(READ);
    const flagAt = fx2.corners[2] < fx2.corners[4] ? fx2.corners[2] : fx2.corners[4];
    assert.deepEqual(r.keys.filter((k) => k.startsWith("v:")), [`v:${flagAt}`, `v:${flagAt}`], `${tag}: flag on the smallest stronghold id`);
    if (w === 1280) await page.screenshot({ path: "test-results/award-markers-flag-1280x720.png" });
    if (w === 390) await page.screenshot({ path: "test-results/award-markers-390x844.png" });
    await push(page, { n: 5, army: true, buildings: ["outpost"] });
    r = await page.evaluate(READ);
    assert.equal(r.keys.length, 0, `${tag}: an army holder with only outposts has no flag`);

    // Transfers back and forth leak no geometry.
    await push(page, { n: 5, road: true, army: true, buildings: ["stronghold"] });
    const g0 = (await page.evaluate(READ)).geometries;
    for (let i = 0; i < 6; i++) {
      await push(page, { n: 5 });
      await push(page, { n: 5, road: true, army: true, buildings: ["stronghold"] });
    }
    const g1 = (await page.evaluate(READ)).geometries;
    assert.ok(g1 <= g0, `${tag}: geometries grew over transfers, ${g0} -> ${g1}`);

    // The title's demo island: none.
    await page.evaluate(() => {
      window.__isle.setTitleMode(true);
    });
    r = await page.evaluate(READ);
    assert.equal(r.keys.length, 0, `${tag}: markers on the title`);
    await page.evaluate(() => window.__isle.setTitleMode(false));

    // Dispose: the group leaves the scene.
    const gone = await page.evaluate(() => {
      const isle = window.__isle;
      isle.syncAwards(isle.lastState);
      const group = isle.awards?.group;
      isle.dispose();
      return { awards: isle.awards, parent: group?.parent ?? null, kids: group?.children.length ?? 0 };
    });
    assert.deepEqual(gone, { awards: null, parent: null, kids: 0 }, `${tag}: dispose left markers ${JSON.stringify(gone)}`);
    console.log(`${tag}: banner on the witness, flag on the smallest stronghold, suppression, no leak, none on the title, dispose`);
    await ctx.close();
  }

  // Look-check sizes (builder.md): Jarrod's phone, both ways up.
  for (const [w, h] of [[440, 956], [956, 440]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle && window.__isle);
    await page.evaluate(() => {
      window.__emberisle.getState().startAi();
      window.__emberisle.setState({ runBots: () => {} });
    });
    await page.waitForFunction(() => window.__emberisle.getState().state && window.__isle.lastState && !window.__isle.titleMode);
    await push(page, { n: 5, road: true, army: true, buildings: ["stronghold"] });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/award-markers-${w}x${h}.png` });
    await ctx.close();
  }
  const real = errors.filter((e) => !/favicon|ERR_CONNECTION_REFUSED|WebSocket/.test(e));
  assert.deepEqual(real, [], `console errors: ${real.join("\n")}`);
  console.log("award markers prove ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  process.exit(code);
}
