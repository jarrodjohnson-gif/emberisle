// #1593 (q1602-dock-fix, fix 3): on the full board, every dock paints its square pier head in its trade's colour (five colour
// bands for 3:1) with a white symbol and pips (two for 2:1, three for 3:1), and a claimed dock flies a swallow-tailed pennant
// on a mast with a dark hairline in its owner's colour. On the lite board, each plain pier wears a painted plank from the
// standalone dock-marks chunk without fetching harbor-jelly.
// Run: npm run dock-marks-prove
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8461;
const fails = [];
const errors = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};

// Runs of `true` along a scanline: the pips on a dock mark.
function runs(line) {
  let n = 0;
  for (let i = 0; i < line.length; i++) if (line[i] && !line[i - 1]) n++;
  return n;
}
{
  // BAD input: merged, missing or extra pips must all be caught.
  const t = true, f = false;
  const got = [runs([f, t, t, f, t, f]), runs([t, t, t, t]), runs([f, f]), runs([t, f, t, f, t])].join();
  if (got !== "2,1,0,3") throw new Error(`pip-run self-test: ${got}`);
}

// In the page: each dock's mark, read from the meshes that use the mark atlas, its atlas row, and (on full) the painted end boards.
const readMarks = async (lite) => {
  const { PLATE_KINDS } = await import("/src/lib/scene/dock-marks.ts");
  const { PAINT } = await import("/src/lib/scene/palette.ts");
  const isle = window.__isle;
  const st = window.__emberisle.getState().state;
  const rowH = lite ? 128 : 192;
  // The mark atlas is the 256-wide canvas with a 192 px row (full board paint) or 128 px row (lite plank) per trade.
  const isMark = (o) => o.isMesh && o.visible && o.material?.map?.image instanceof HTMLCanvasElement && o.material.map.image.width === 256 && o.material.map.image.height === rowH * PLATE_KINDS.length;
  const meshes = [];
  isle.scene.traverse((o) => { if (isMark(o)) meshes.push(o); });
  const atlas = meshes[0]?.material.map.image ?? document.createElement("canvas");
  const docks = isle.docks.map((d) => ({ cx: d.cx, cz: d.cz, kinds: d.vids.map((id) => st.vertices.find((v) => v.id === id)?.harbor), verts: [] }));
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    const p = m.geometry.attributes.position, uv = m.geometry.attributes.uv, e = m.matrixWorld.elements;
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), ly = p.getY(i), lz = p.getZ(i);
      const x = e[0] * lx + e[4] * ly + e[8] * lz + e[12], z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
      let best = null, bd = Infinity;
      for (const d of docks) {
        const dist = Math.hypot(x - d.cx, z - d.cz);
        if (dist < bd) (bd = dist), (best = d);
      }
      best.verts.push({ x, z, v: uv.getY(i), dist: bd });
    }
  }
  const c = atlas.getContext("2d");
  const rgba = (x, y) => [...c.getImageData(x, y, 1, 1).data];
  const hex = (a) => "#" + a.slice(0, 3).map((n) => n.toString(16).padStart(2, "0")).join("");
  const near = (a, b, tol = 24) => [0, 1, 2].every((i) => Math.abs(a[i] - b[i]) <= tol);
  const parseHex = (h) => [1, 3, 5].map((o) => parseInt(h.slice(o, o + 2), 16));
  const rowInfo = (row, kind) => {
    const y = row * rowH;
    if (!lite) {
      // Full board (fix 3): transparent ground, white paint. 3:1 has three pips across y+96; 2:1 has a symbol on the left and
      // two pips stacked vertically at x=222.
      const line = [];
      if (kind === "any") for (let x = 0; x < 256; x++) line.push(rgba(x, y + 96)[3] > 128);
      else for (let dy = 0; dy < 192; dy++) line.push(rgba(222, y + dy)[3] > 128);
      let pips = 0;
      for (let i = 0; i < line.length; i++) if (line[i] && !line[i - 1]) pips++;
      let symbolPx = 0;
      if (kind !== "any") {
        const img = c.getImageData(6, y + 12, 170, 168).data;
        for (let i = 3; i < img.length; i += 4) if (img[i] > 128) symbolPx++;
      }
      return { fill: null, pips, symbolPx };
    }
    const fill = rgba(128, y + 22);
    const line = [];
    for (let x = 128; x < 244; x++) line.push(!near(rgba(x, y + 64), fill, 40));
    let pips = 0;
    for (let i = 0; i < line.length; i++) if (line[i] && !line[i - 1]) pips++;
    return { fill: hex(fill), pips, symbolPx: 1 };
  };
  // Full board: inspect vertex colours on the harbors mesh directly under each dock's painted pier head (y near DECK = 0.1).
  const harbors = !lite ? isle.shore?.group.getObjectByName("harbors") : null;
  let headSamples = docks.map(() => []);
  if (harbors?.isMesh && harbors.geometry.attributes.color) {
    harbors.updateMatrixWorld(true);
    const pos = harbors.geometry.attributes.position, col = harbors.geometry.attributes.color, e = harbors.matrixWorld.elements;
    const centres = docks.map((d) => ({
      x: d.verts.reduce((s, q) => s + q.x, 0) / (d.verts.length || 1),
      z: d.verts.reduce((s, q) => s + q.z, 0) / (d.verts.length || 1),
    }));
    const linToSrgb = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
      const y = e[1] * lx + e[5] * ly + e[9] * lz + e[13];
      // Exact top face of the 0.016-thick T-head deck boards centred at DECK = 0.1 (excludes pile caps, bollards, rope coils).
      if (Math.abs(y - 0.108) > 0.001) continue;
      const x = e[0] * lx + e[4] * ly + e[8] * lz + e[12], z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
      for (let di = 0; di < docks.length; di++) {
        const dx = x - centres[di].x, dz = z - centres[di].z;
        const m = isle.docks[di], ml = Math.hypot(m.mx, m.mz) || 1;
        const along = (dx * m.mx + dz * m.mz) / ml;
        const across = (dx * m.mz - dz * m.mx) / ml;
        // Strictly inside the 0.44 x 0.44 painted head (along > -0.205 excludes unpainted brown stem planks behind the seam).
        if (along > -0.205 && along < 0.225 && Math.abs(across) < 0.225) {
          headSamples[di].push([linToSrgb(col.getX(i)), linToSrgb(col.getY(i)), linToSrgb(col.getZ(i))]);
          break;
        }
      }
    }
  }
  // Expected Fix 3 board colour in sRGB for each good (exact match to harbor-jelly's boardTone at shade=1, in linear THREE.Color).
  const srgbToLin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const linToSrgb = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
  const woodLin = parseHex("#a46e42").map(srgbToLin);
  const wantBoardRgb = (k) => {
    const a = parseHex(PAINT[k][0]).map(srgbToLin), b = parseHex(PAINT[k][1]).map(srgbToLin);
    const t = k === "wool" || k === "grain" ? 0.6 : 0;
    return [0, 1, 2].map((i) => linToSrgb((a[i] + (b[i] - a[i]) * t) * 0.85 + woodLin[i] * 0.15));
  };
  const goods = ["timber", "clay", "wool", "grain", "ore"];
  const allWantBoards = goods.map(wantBoardRgb);
  return {
    lite,
    meshes: meshes.length,
    docks: docks.map((d, di) => {
      const vs = d.verts.map((q) => q.v);
      const row = vs.length ? Math.round((1 - Math.max(...vs)) * PLATE_KINDS.length) : -1;
      const shown = PLATE_KINDS[row] ?? null;
      const kind = d.kinds[0];
      const info = row >= 0 ? rowInfo(row, kind) : null;
      const samples = headSamples[di];
      const meanRgb = samples.length ? [0, 1, 2].map((c) => Math.round(samples.reduce((s, q) => s + q[c], 0) / samples.length)) : null;
      // On a 3:1 dock, count how many of the five goods' board tones appear among the pier head's vertex colours.
      const matchedBands = !lite && kind === "any" ? allWantBoards.filter((wb) => samples.some((s) => near(s, wb, 26))).length : null;
      const boardMatch = !lite && kind !== "any" && meanRgb ? near(meanRgb, wantBoardRgb(kind), 26) : null;
      return {
        kind,
        sameBothCorners: d.kinds[0] === d.kinds[1],
        verts: d.verts.length,
        far: d.verts.length ? +Math.max(...d.verts.map((q) => q.dist)).toFixed(2) : null,
        oneRow: vs.every((v) => (1 - v) * PLATE_KINDS.length >= row - 1e-4 && (1 - v) * PLATE_KINDS.length <= row + 1 + 1e-4),
        shown,
        fill: lite ? info?.fill : meanRgb ? hex(meanRgb) : null,
        want: kind === "any" ? null : lite ? PAINT[kind][0] : hex(wantBoardRgb(kind)),
        boardMatch,
        matchedBands,
        anyClash: lite && kind === "any" ? goods.some((g) => near(rgba(128, row * 128 + 22), parseHex(PAINT[g][0]))) : false,
        pips: info?.pips,
        symbolPx: info?.symbolPx ?? 0,
        rate: kind === "any" ? 3 : 2,
      };
    }),
  };
};

// The board can be rebuilt under the proof (a refit after the first frames brings the plain piers back until the shore swaps in
// again), so read the marks once they are all in: the full board's merged plates mesh, or the lite board's nine planks, with a
// mark at every dock. The last read is returned either way, and checkMarks says what is missing.
async function readSettled(page, lite, expectDocks = 9) {
  const until = Date.now() + STEP_MS;
  let r;
  do {
    await page.waitForFunction(() => window.__isle.landReady && !window.__isle.refitDue, null, { timeout: STEP_MS });
    r = await page.evaluate(readMarks, lite);
    if (r.meshes >= 1 && r.docks.length === expectDocks && r.docks.every((d) => d.verts >= 4)) return r;
    await page.waitForTimeout(250);
  } while (Date.now() < until);
  return r;
}

function checkMarks(tag, r, expectDocks = 9) {
  check(`${tag}: ${expectDocks} docks`, r.docks.length === expectDocks, { docks: r.docks.length });
  check(`${tag}: one merged mark mesh drawn`, r.meshes === 1, { meshes: r.meshes });
  for (const [i, d] of r.docks.entries()) {
    const at = `${tag} dock ${i} (${d.kind})`;
    check(`${at}: has a mark (4 corners) close to its pier`, d.verts === 4 && d.far < (r.lite ? 0.6 : 2.2) && d.sameBothCorners, { verts: d.verts, far: d.far });
    check(`${at}: the mark shows its own trade's row`, d.shown === d.kind && d.oneRow, { shown: d.shown });
    if (r.lite) {
      if (d.want) check(`${at}: plank colour is the good's colour`, d.fill.toLowerCase() === d.want.toLowerCase(), { fill: d.fill, want: d.want });
      else check(`${at}: the any-good plank is not a good's colour`, !d.anyClash, { fill: d.fill });
    } else if (d.kind === "any") {
      check(`${at}: 3:1 pier head carries all five goods' colour bands`, d.matchedBands === 5, { matchedBands: d.matchedBands });
    } else {
      check(`${at}: pier head boards painted in the good's colour`, Boolean(d.boardMatch), { fill: d.fill, want: d.want });
      check(`${at}: white symbol painted on the boards`, d.symbolPx > 1500, { symbolPx: d.symbolPx });
    }
    check(`${at}: ${d.rate} pips for ${d.rate}:1`, d.pips === d.rate, { pips: d.pips });
  }
  const kinds = new Set(r.docks.map((d) => d.kind));
  check(`${tag}: the board has every trade (five goods and any)`, kinds.size === 6, [...kinds]);
}

async function open(lite, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 600, hasTouch: width < 600 });
  await ctx.addInitScript((lite) => localStorage.setItem("emberisle-jelly", lite ? "lite" : "full"), lite);
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });
  await page.getByRole("button", { name: "Pass and play" }).click();
  await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState && window.__isle.landReady && !window.__isle.refitDue, null, { timeout: STEP_MS });
  // The full board's harbour shore swaps in for the plain piers; the lite board paints its merged planks after a lazy import.
  await page.waitForFunction(async (lite) => {
    const i = window.__isle;
    if (!lite && !(i.shore?.group.parent && i.piers.every((p) => !p.visible))) return false;
    const wantH = (lite ? 128 : 192) * 6;
    let n = 0;
    i.scene.traverse((o) => { const c = o.isMesh && o.visible && o.material?.map?.image; if (c instanceof HTMLCanvasElement && c.width === 256 && c.height === wantH) n++; });
    return n >= 1;
  }, lite, { timeout: STEP_MS, polling: 250 });
  return { ctx, page };
}

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
mkdirSync("test-results", { recursive: true });

try {
  // Full board.
  {
    const { ctx, page } = await open(false, 1280, 720);
    checkMarks("full", await readSettled(page, false));

    // Pennants: none before anyone builds on a dock.
    const pennants = () => page.evaluate(() => {
      const isle = window.__isle;
      const st = window.__emberisle.getState().state;
      const pens = isle.shore.group.userData.pennants ?? [];
      return pens.map((p) => {
        const owner = p.userData.vids.map((id) => st.vertices.find((v) => v.id === id)?.building?.playerId).find(Boolean) ?? null;
        const dock = isle.docks.find((d) => d.vids.join() === p.userData.vids.join());
        p.updateMatrixWorld(true);
        const w = p.getWorldPosition(p.position.clone());
        return {
          visible: p.visible,
          owner,
          want: owner ? st.players.find((q) => q.id === owner)?.color ?? null : null,
          colour: "#" + p.children[1].material.color.getHexString(),
          line: p.children[2] ? "#" + p.children[2].material.color.getHexString() : null,
          parts: p.children.length,
          dist: dock ? +Math.hypot(w.x - dock.cx, w.z - dock.cz).toFixed(2) : null,
        };
      });
    });
    const before = await pennants();
    check("full: one pennant per dock", before.length === 9, { pennants: before.length });
    check("full: each pennant has a mast, cloth, and dark hairline", before.every((p) => p.parts === 3 && p.line === "#2a2420"), before.map((p) => [p.parts, p.line]));
    check("full: no pennant flies over an unclaimed dock", before.every((p) => !p.owner && !p.visible), before.filter((p) => p.visible || p.owner));
    check("full: each pennant stands on its own dock", before.every((p) => p.dist !== null && p.dist < 2.2), before.map((p) => p.dist));

    // Two seats claim two docks: an outpost on one corner, a stronghold on the other dock.
    const claimed = await page.evaluate(() => {
      const api = window.__emberisle;
      const s = api.getState();
      const st = structuredClone(s.state);
      const [a, b] = st.players;
      const docks = window.__isle.docks;
      st.vertices.find((v) => v.id === docks[0].vids[0]).building = { playerId: a.id, kind: "outpost" };
      st.vertices.find((v) => v.id === docks[4].vids[1]).building = { playerId: b.id, kind: "stronghold" };
      st.seq += 1;
      api.setState({ state: st });
      return [a.color, b.color];
    });
    await page.waitForFunction(() => (window.__isle.shore.group.userData.pennants ?? []).filter((p) => p.visible).length === 2, null, { timeout: STEP_MS });
    const after = await pennants();
    check("full: a claimed dock flies its pennant, an unclaimed one does not", after.every((p) => p.visible === Boolean(p.owner)) && after.filter((p) => p.visible).length === 2, after.map((p) => [p.visible, p.owner]));
    check("full: each pennant is in its owner's colour", after.filter((p) => p.owner).every((p) => p.colour.toLowerCase() === p.want.toLowerCase()), after.filter((p) => p.owner).map((p) => [p.colour, p.want]));
    check("full: the two seats' pennants differ", new Set(after.filter((p) => p.visible).map((p) => p.colour)).size === 2, claimed);
    await page.evaluate(() => { const i = window.__isle; i.draw(); i.renderer.getContext().finish(); });
    await page.screenshot({ path: "test-results/dock-marks-full-1280x720.png" });

    // The claim goes away: the pennant comes down.
    await page.evaluate(() => {
      const api = window.__emberisle;
      const st = structuredClone(api.getState().state);
      for (const v of st.vertices) v.building = null;
      st.seq += 1;
      api.setState({ state: st });
    });
    await page.waitForFunction(() => (window.__isle.shore.group.userData.pennants ?? []).every((p) => !p.visible), null, { timeout: STEP_MS });
    check("full: pennants come down when the docks are free again", (await pennants()).every((p) => !p.visible));

    // Watch the classic shore's plate atlas texture get disposed when switching to an expanded 6-seat (11-dock) island.
    await page.evaluate(() => {
      const plates = window.__isle.shore.group.getObjectByName("plates");
      const tex = plates?.material?.map;
      window.__plateTexDisposed = 0;
      if (tex) {
        const orig = tex.dispose.bind(tex);
        tex.dispose = () => { window.__plateTexDisposed++; return orig(); };
      }
    });
    await page.evaluate(async () => {
      const { createExpandedGame } = await import("/src/lib/game/expanded.ts");
      const st = createExpandedGame({ seed: 20261113, humans: ["Ember", "Tide", "Dune", "Moss", "Coral", "Slate"].map((name) => ({ name })), bots: 0 });
      st.phase = "main";
      st.rollOff = null;
      st.current = st.players[0].id;
      st.seq = 100;
      window.__emberisle.setState({ state: st, localId: st.players[0].id, mode: "hotseat", banner: null });
    });
    await page.waitForFunction(() => {
      const i = window.__isle;
      return i.docks.length === 11 && i.landReady && !i.refitDue && i.shore?.group.parent && i.piers.every((p) => !p.visible);
    }, null, { timeout: STEP_MS });
    check("full: previous shore plate atlas texture disposed on rebuild", (await page.evaluate(() => window.__plateTexDisposed)) === 1);
    checkMarks("full expanded", await readSettled(page, false, 11), 11);
    const expBefore = await pennants();
    check("full expanded: eleven pennants", expBefore.length === 11, { pennants: expBefore.length });
    check("full expanded: all pennants have mast, cloth, and dark hairline", expBefore.every((p) => p.parts === 3 && p.line === "#2a2420"));
    await page.evaluate(() => {
      const api = window.__emberisle;
      const st = structuredClone(api.getState().state);
      const seat6 = st.players[5];
      st.vertices.find((v) => v.id === window.__isle.docks[10].vids[0]).building = { playerId: seat6.id, kind: "outpost" };
      st.seq += 1;
      api.setState({ state: st });
    });
    await page.waitForFunction(() => (window.__isle.shore.group.userData.pennants ?? []).filter((p) => p.visible).length === 1, null, { timeout: STEP_MS });
    const expAfter = await pennants();
    check("full expanded: claimed 11th dock flies seat 6's pennant", expAfter.filter((p) => p.visible).length === 1 && expAfter.filter((p) => p.owner).every((p) => p.colour.toLowerCase() === p.want.toLowerCase()));
    await ctx.close();
  }
  // Lite board, on a phone.
  {
    const { ctx, page } = await open(true, 390, 844);
    checkMarks("lite", await readSettled(page, true));
    // The lite board loads the small dock-marks chunk, never the harbour shore's.
    const loaded = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /harbor-jelly|dock-marks/.test(n)));
    check("lite: the marks come from the dock-marks module, and harbor-jelly is never fetched", loaded.some((n) => n.includes("dock-marks")) && !loaded.some((n) => n.includes("harbor-jelly")), loaded);
    // Track lite atlas texture disposal across rebuilds.
    await page.evaluate(() => {
      const tex = window.__isle.liteMarkTex;
      window.__liteTexDisposed = 0;
      if (tex) {
        const orig = tex.dispose.bind(tex);
        tex.dispose = () => { window.__liteTexDisposed++; return orig(); };
      }
    });
    // Two new boards dealt back to back, the first one's marks still loading: only the last board's planks land.
    await page.evaluate(() => { const g = window.__emberisle.getState(); g.startAi(); window.__emberisle.getState().startAi(); });
    await page.waitForFunction(() => window.__isle.landReady && !window.__isle.refitDue, null, { timeout: STEP_MS });
    await page.waitForTimeout(1500);
    const again = await readSettled(page, true);
    check("lite: previous lite atlas texture disposed on rebuild", (await page.evaluate(() => window.__liteTexDisposed)) === 1);
    check("lite, two boards back to back: one merged mesh with exactly nine planks, none left from the first board", again.meshes === 1 && again.docks.every((d) => d.verts === 4), { meshes: again.meshes, verts: again.docks.map((d) => d.verts) });
    checkMarks("lite, second board", again);
    await page.evaluate(() => { const i = window.__isle; i.draw(); i.renderer.getContext().finish(); });
    await page.screenshot({ path: "test-results/dock-marks-lite-390x844.png" });
    await ctx.close();
  }
  check("no console errors", errors.length === 0, errors.slice(0, 5));
} catch (e) {
  console.error("dock-marks-prove failed:", e);
  fails.push("exception");
}

await browser.close();
await vite.close();
if (fails.length) {
  console.log(`\n${fails.length} failed: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\ndock-marks-prove: all checks passed");
