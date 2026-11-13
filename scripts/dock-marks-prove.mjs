// #1593: every dock wears a painted plank in its trade's colour with one pip per good you give (two for 2:1, three for 3:1),
// on the full board and the lite board, and a claimed dock flies a pennant in its owner's colour on the full board.
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

// The full board's T-head stands up to about 1.4 out from the coast (the dock's centre); the lite board's plank sits on the pier's root.
// Runs of `true` along a scanline: the pips on a plank.
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

// In the page: each dock's mark, read from the meshes that use the mark atlas, and the atlas row it shows.
const readMarks = async (lite) => {
  const { markCanvas, PLATE_KINDS } = await import("/src/lib/scene/dock-marks.ts");
  const { PAINT } = await import("/src/lib/scene/palette.ts");
  const isle = window.__isle;
  const st = window.__emberisle.getState().state;
  // The one cached atlas canvas both boards wrap in their own texture.
  const atlas = markCanvas(PAINT);
  const meshes = [];
  isle.scene.traverse((o) => { if (o.isMesh && o.material?.map?.image === atlas && o.visible) meshes.push(o); });
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
      best.verts.push({ v: uv.getY(i), dist: bd });
    }
  }
  const c = atlas.getContext("2d");
  const rgb = (x, y) => [...c.getImageData(x, y, 1, 1).data.slice(0, 3)];
  const hex = (a) => "#" + a.map((n) => n.toString(16).padStart(2, "0")).join("");
  const near = (a, b, tol = 24) => a.every((n, i) => Math.abs(n - b[i]) <= tol);
  const rowInfo = (row) => {
    const y = row * 128;
    const fill = rgb(128, y + 22);
    // The pips' row, from just right of the symbol to the plank's edge.
    const line = [];
    for (let x = 128; x < 244; x++) {
      const px = rgb(x, y + 64);
      line.push(!near(px, fill, 40));
    }
    let n = 0;
    for (let i = 0; i < line.length; i++) if (line[i] && !line[i - 1]) n++;
    return { fill: hex(fill), pips: n };
  };
  const goods = ["timber", "clay", "wool", "grain", "ore"];
  return {
    lite,
    meshes: meshes.length,
    docks: docks.map((d) => {
      const vs = d.verts.map((q) => q.v);
      const row = vs.length ? Math.round((1 - Math.max(...vs)) * PLATE_KINDS.length) : -1;
      const shown = PLATE_KINDS[row] ?? null;
      const info = row >= 0 ? rowInfo(row) : null;
      const kind = d.kinds[0];
      return {
        kind,
        sameBothCorners: d.kinds[0] === d.kinds[1],
        verts: d.verts.length,
        far: d.verts.length ? +Math.max(...d.verts.map((q) => q.dist)).toFixed(2) : null,
        oneRow: vs.every((v) => (1 - v) * PLATE_KINDS.length >= row - 1e-4 && (1 - v) * PLATE_KINDS.length <= row + 1 + 1e-4),
        shown,
        fill: info?.fill,
        want: kind === "any" ? null : PAINT[kind][0],
        anyClash: kind === "any" ? goods.some((g) => near(rgb(128, row * 128 + 22), [1, 3, 5].map((o) => parseInt(PAINT[g][0].slice(o, o + 2), 16)))) : false,
        pips: info?.pips,
        rate: kind === "any" ? 3 : 2,
      };
    }),
  };
};

function checkMarks(tag, r) {
  check(`${tag}: nine docks`, r.docks.length === 9, { docks: r.docks.length });
  check(`${tag}: mark meshes drawn`, r.meshes >= 1, { meshes: r.meshes });
  for (const [i, d] of r.docks.entries()) {
    const at = `${tag} dock ${i} (${d.kind})`;
    check(`${at}: has a plank (4+ corners) close to its pier`, d.verts >= 4 && d.far < (tag === "full" ? 1.7 : 0.6) && d.sameBothCorners, { verts: d.verts, far: d.far });
    check(`${at}: the plank shows its own trade's row`, d.shown === d.kind && d.oneRow, { shown: d.shown });
    if (d.want) check(`${at}: plank colour is the good's colour`, d.fill.toLowerCase() === d.want.toLowerCase(), { fill: d.fill, want: d.want });
    else check(`${at}: the any-good plank is not a good's colour`, !d.anyClash, { fill: d.fill });
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
  await page.getByRole("button", { name: "Four seats, one table" }).click();
  await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState && window.__isle.landReady && !window.__isle.refitDue, null, { timeout: STEP_MS });
  // The full board's harbour shore swaps in for the plain piers; the lite board paints its planks after a lazy import.
  await page.waitForFunction(async (lite) => {
    const i = window.__isle;
    if (!lite) return Boolean(i.shore?.group.parent) && i.piers.every((p) => !p.visible);
    const { markCanvas } = await import("/src/lib/scene/dock-marks.ts");
    const { PAINT } = await import("/src/lib/scene/palette.ts");
    let n = 0;
    i.scene.traverse((o) => { if (o.isMesh && o.material?.map?.image === markCanvas(PAINT)) n++; });
    return n >= 9;
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
    checkMarks("full", await page.evaluate(readMarks, false));

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
          dist: dock ? +Math.hypot(w.x - dock.cx, w.z - dock.cz).toFixed(2) : null,
        };
      });
    });
    const before = await pennants();
    check("full: one pennant per dock", before.length === 9, { pennants: before.length });
    check("full: no pennant flies over an unclaimed dock", before.every((p) => !p.owner && !p.visible), before.filter((p) => p.visible || p.owner));
    check("full: each pennant stands on its own dock", before.every((p) => p.dist !== null && p.dist < 1.7), before.map((p) => p.dist));

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
    await ctx.close();
  }
  // Lite board, on a phone.
  {
    const { ctx, page } = await open(true, 390, 844);
    checkMarks("lite", await page.evaluate(readMarks, true));
    // The lite board loads the small dock-marks chunk, never the harbour shore's.
    const loaded = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /harbor-jelly|dock-marks/.test(n)));
    check("lite: the marks come from the dock-marks module, and harbor-jelly is never fetched", loaded.some((n) => n.includes("dock-marks")) && !loaded.some((n) => n.includes("harbor-jelly")), loaded);
    // Two new boards dealt back to back, the first one's marks still loading: only the last board's planks land.
    await page.evaluate(() => { const g = window.__emberisle.getState(); g.startAi(); window.__emberisle.getState().startAi(); });
    await page.waitForFunction(() => window.__isle.landReady && !window.__isle.refitDue, null, { timeout: STEP_MS });
    await page.waitForTimeout(1500);
    const again = await page.evaluate(readMarks, true);
    check("lite, two boards back to back: exactly nine planks, none left from the first board", again.meshes === 9, { meshes: again.meshes });
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
