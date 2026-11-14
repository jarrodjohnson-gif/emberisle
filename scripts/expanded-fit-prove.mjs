// #1607 (docs/design/six-players.md, "Board generator, coast, docks, and camera"): the renderer and both camera fits work from
// the board's own hexes. A six-seat expanded game (createExpandedGame, seed 20261113, the 30-hex island) is put straight into
// the store, as the classic table proofs put a crafted state; nothing in the client starts one yet.
// Node, on mobile-fit.ts:
// - the classic shape measured from its 19 hexes (CLASSIC_ISLE) is exactly the classic constants: ISLE_HALF, SHORE_HALF_X,
//   PILE_HALF_X, DOCK_HALF_X, its middle at the origin and no growth;
// - the expanded shape's middle is 0.5 hex widths east of the origin (x = 0.5 * sqrt(3) * 1.12, z = 0), and its extents are the
//   classic ones plus its coast's extra reach: 0.5 hex widths across, 1.5 * 1.12 deep.
// In the browser, at 390x844 (touch, a 34 px home bar), 844x390 (touch) and 1280x720 (desktop), with the expanded state:
// - the default view is the classic one for that canvas (overhead at 40° upright, overhead at 25° sideways, the diorama on the
//   desktop), and the eye looks at the expanded island's middle;
// - every hex centre and every coast corner projects inside the declared hole (1 px of rounding); every dock's pier and boat
//   (0.7 out along its miter, at the waterline) is inside the hole, except that upright it may run off the screen's side
//   edges (owner card q1515-table-look, B, as upright-table-prove allows); every goods pile is wholly on screen;
//   upright, the shore comes EDGE_GAP px from both screen edges, or as near as keeps every pile on screen (the classic rule);
// - every dock's 44 px button is wholly on screen and its centre inside the hole's top and bottom (and its sides, but upright);
//   a real tap on it names that dock's rate;
// - every hex, every corner, and every path beside six outposts at the coast's extremes is the renderer's own pick at its
//   screen point; a real tap (touch) or click on each extreme coast corner selects or builds that very corner;
// - no hex centre or coast corner is under the HUD: the element there is the canvas or a dock's button;
// - the hex and the token on screen, and the smallest numeral (tokens-prove's measure: the label's dark rows through the
//   camera), are printed for the classic and the expanded board at each canvas. The design's 11 px numeral floor
//   (docs/design/tokens.md) is written for the diorama; it is reported, not asserted, here: the expanded board's numerals
//   under it are a question for the owner (a different default view, or panning), not this piece's to settle;
// - at 1280x720, on the crystal sea, the sea's wash is re-traced round the expanded coast;
// - zero page errors.
// Classic parity in the same run: with the classic four-seat state the fit (frustum or lens), the eye's look-at point and
// every hex centre on screen equal the values measured on origin/main at ec897a9d (CLASSIC_MAIN below).
// SHOTS=1 writes real-game PNGs of a five- and a six-seat board at device scale 2 for 430x932, 390x844, 844x390 and
// 1280x720 into docs/proofs/1607/, each after checking the island, its coast and its docks are in the hole and clear of the HUD.
// MEASURE_CLASSIC=1 prints the classic numbers only (how CLASSIC_MAIN was taken). Run: npm run expanded-fit-prove
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const SHOTS = process.env.SHOTS === "1";
const MEASURE = process.env.MEASURE_CLASSIC === "1";
const VIEWS = [
  { width: 390, height: 844, phone: true, insets: { top: 0, right: 0, bottom: 34, left: 0 } },
  { width: 844, height: 390, phone: true },
  { width: 1280, height: 720, phone: false },
];
const SHOT_VIEWS = [{ width: 430, height: 932, phone: true, insets: { top: 59, right: 0, bottom: 34, left: 0 } }, ...VIEWS];
const NAMES = ["Jarrod", "Daking", "Isaac", "Joshua", "Moss", "Flint"];

// Measured on origin/main (ec897a9d) with MEASURE_CLASSIC=1: the fit, the look-at point and each hex centre on screen.
const CLASSIC_MAIN = {
  "390x844": {"view":"overhead","fit":{"left":-5.809585,"right":5.809585,"top":12.572539,"bottom":-12.572539,"x":0,"z":0.297864,"lean":0.698132},"target":[0,0.297864],"hexes":{"-2,0":[64.774,414.557],"-2,1":[97.33,457.754],"-2,2":[129.887,500.951],"-1,-1":[97.33,371.36],"-1,0":[129.887,414.557],"-1,1":[162.443,457.754],"-1,2":[195,500.951],"0,-2":[129.887,328.163],"0,-1":[162.443,371.36],"0,0":[195,414.557],"0,1":[227.557,457.754],"0,2":[260.113,500.951],"1,-2":[195,328.163],"1,-1":[227.557,371.36],"1,0":[260.113,414.557],"1,1":[292.67,457.754],"2,-2":[260.113,328.163],"2,-1":[292.67,371.36],"2,0":[325.226,414.557]}},
  "844x390": {"view":"overhead","fit":{"left":-14.647683,"right":14.647683,"top":6.768479,"bottom":-6.768479,"x":-4.72058,"z":-1.072356,"lean":0.436332},"target":[-4.72058,-1.072356],"hexes":{"-2,0":[446.223,223.122],"-2,1":[474.167,266.988],"-2,2":[502.112,310.854],"-1,-1":[474.167,179.256],"-1,0":[502.112,223.122],"-1,1":[530.056,266.988],"-1,2":[558,310.854],"0,-2":[502.112,135.39],"0,-1":[530.056,179.256],"0,0":[558,223.122],"0,1":[585.944,266.988],"0,2":[613.888,310.854],"1,-2":[558,135.39],"1,-1":[585.944,179.256],"1,0":[613.888,223.122],"1,1":[641.833,266.988],"2,-2":[613.888,135.39],"2,-1":[641.833,179.256],"2,0":[669.777,223.122]}},
  "1280x720": {"view":"diorama","fit":{"focal":1138.520486,"dist":18.839812,"cx":584.085384,"cy":265.321454},"target":[0,0],"hexes":{"-2,0":[375.413,219.013],"-2,1":[379.186,288.053],"-2,2":[383.633,369.407],"-1,-1":[466.288,179.321],"-1,0":[476.933,241.774],"-1,1":[489.372,314.753],"-1,2":[504.101,401.164],"0,-2":[548.991,143.198],"0,-1":[565.24,199.963],"0,0":[584.085,265.798],"0,1":[606.202,343.063],"0,2":[632.525,435.019],"1,-2":[645.413,162.005],"1,-1":[669.412,221.694],"1,0":[697.353,291.192],"1,1":[730.297,373.133],"2,-2":[746.68,181.756],"2,-1":[779.225,244.602],"2,0":[817.274,318.079]}},
};

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const fails = [];
const owner = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail !== undefined ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  if (!ok) fails.push(name);
};
const frames = (page, n) => page.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); }, n);

// Into the store as a crafted state: a main phase on seat p0's turn. `expanded` deals the 30-hex island for six seats.
async function load(page, expanded, patch = "main", seats = 6) {
  await page.evaluate(async ({ expanded, names, patch }) => {
    const game = window.__emberisle;
    const st = expanded
      ? (await import("/src/lib/game/expanded.ts")).createExpandedGame({ seed: 20261113, humans: names.map((name) => ({ name })), bots: 0 })
      : (await import("/src/lib/game/board.ts")).createGame({ seed: 20261110, humans: names.slice(0, 4).map((name) => ({ name })), bots: 0 });
    st.players[0].resources = { timber: 9, clay: 9, wool: 9, grain: 9, ore: 9 };
    st.rollOff = null;
    st.current = st.players[0].id;
    st.phase = patch === "settle" ? "setupSettle" : "main";
    st.dice = patch === "settle" ? null : [3, 5];
    if (expanded && patch !== "settle") Object.assign(st, { primary: st.players[0].id, role: "primary", activation: 1 });
    if (patch === "paths") {
      // An outpost of p0's at each of the coast's six extremes (its leftmost, rightmost, nearest and farthest corners, and the
      // two far ends of its diagonal), so every path beside them is a legal mark with a path armed.
      const coast = st.vertices.filter((v) => v.hexes.length < 3);
      const pick = (f) => coast.reduce((a, b) => (f(b) > f(a) ? b : a));
      const ends = [(v) => -v.x, (v) => v.x, (v) => -v.z, (v) => v.z, (v) => v.x + v.z, (v) => -v.x - v.z].map(pick);
      for (const v of new Set(ends)) v.building = { playerId: st.players[0].id, kind: "outpost" };
    }
    st.seq++;
    game.setState({ state: st, localId: st.players[0].id, mode: "ai", spectator: false, buildMode: patch === "paths" ? "path" : "none", banner: null, error: null, menuFor: null, pendingPlace: null });
  }, { expanded, names: NAMES.slice(0, seats), patch });
  await page.waitForFunction(() => window.__isle.lastState === window.__emberisle.getState().state, null, { timeout: 60_000 });
  await frames(page, 3);
  await page.waitForFunction(() => !window.__isle.refitDue && !window.__isle.glide && window.__isle.fit, null, { timeout: 60_000 });
  await frames(page, 2);
}

// The fit as the renderer holds it, its look-at point, and each hex centre on screen (rounded to 0.001 px).
const fitNumbers = (page) =>
  page.evaluate(() => {
    const i = window.__isle;
    const st = i.lastState;
    const r = (x) => Math.round(x * 1e6) / 1e6;
    const fit = Object.fromEntries(Object.entries(i.fit).map(([k, v]) => [k, r(v)]));
    return {
      view: i.view,
      fit,
      target: [r(i.orbit.target.x), r(i.orbit.target.z)],
      hexes: Object.fromEntries(st.hexes.map((h) => { const p = i.screenOf(h.id); return [h.id, [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000]]; })),
    };
  });

// Where everything sits on screen, against the declared hole.
const measure = (page) =>
  page.evaluate(() => {
    const i = window.__isle;
    const c = document.querySelector("canvas");
    const rect = c.getBoundingClientRect();
    const st = i.lastState;
    const hole = i.insets();
    const w = c.clientWidth;
    const h = c.clientHeight;
    const box = { l: hole.left, t: hole.top, r: w - hole.right, b: h - hole.bottom };
    const inHole = (p, sides = true) => (sides ? p.x >= box.l - 1 && p.x <= box.r + 1 : true) && p.y >= box.t - 1 && p.y <= box.b + 1;
    const under = (p) => {
      const el = document.elementFromPoint(rect.left + p.x, rect.top + p.y);
      return el === c || !!el?.closest('[data-testid="dock-rate-target"]') ? null : `${el?.tagName}.${String(el?.className).slice(0, 40)}`;
    };
    const coast = i.coast.map((v) => ({ id: v.id, ...i.screenOf(v.id) }));
    const hexes = st.hexes.map((x) => ({ id: x.id, ...i.screenOf(x.id) }));
    const docks = st.vertices.filter((v) => v.harbor).map((v) => {
      const m = i.coastMiter.get(v.id);
      return { id: v.id, ...i.screenAt(v.x + m.mx * 0.7, 0.1, v.z + m.mz * 0.7) };
    });
    const piles = (i.shore?.group.userData.goodsPiles ?? []).map((pile) => {
      const m = new i.ortho.matrixWorld.constructor().fromArray(pile.frame);
      const pts = [];
      for (const x of [pile.min[0], pile.max[0]]) for (const y of [pile.min[1], pile.max[1]]) for (const z of [pile.min[2], pile.max[2]]) {
        const p = i.ortho.position.clone().set(x, y, z).applyMatrix4(m);
        pts.push(i.screenAt(p.x, p.y, p.z));
      }
      return { kind: pile.kind, l: Math.min(...pts.map((q) => q.x)), r: Math.max(...pts.map((q) => q.x)), t: Math.min(...pts.map((q) => q.y)), b: Math.max(...pts.map((q) => q.y)) };
    });
    const buttons = [...document.querySelectorAll('[data-testid="dock-rate-target"]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.dock, kind: el.dataset.kind, l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, hgt: r.height, x: (r.left + r.right) / 2 - rect.left, y: (r.top + r.bottom) / 2 - rect.top };
    });
    // The token numerals on screen: the label canvas's dark rows through the camera (tokens-prove's measure), and a hex's
    // width across the screen at the island's middle (0.97 world units each side of a hex centre, along the camera's right).
    const cam = i.view === "diorama" ? i.persp : i.ortho;
    cam.updateMatrixWorld();
    const V = cam.position.constructor;
    const right = new V().setFromMatrixColumn(cam.matrixWorld, 0);
    const len = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const at = (label, cx, cy) => {
      const v = label.localToWorld(new V((cx / 128 - 1) * 0.245, (1 - cy / 128) * 0.245, 0));
      return i.screenAt(v.x, v.y, v.z);
    };
    const groups = i.land.children.filter((o) => o.userData?.token != null);
    const numerals = groups.map((g) => {
      const label = g.children[1];
      g.updateMatrixWorld(true);
      const img = label.material.map.image.getContext("2d").getImageData(0, 0, 256, 186).data;
      const rows = [];
      for (let y = 0; y < 186; y++)
        for (let x = 0; x < 256; x++) {
          const k = (y * 256 + x) * 4;
          if (img[k + 3] > 0 && 0.299 * img[k] + 0.587 * img[k + 1] + 0.114 * img[k + 2] < 128) { rows.push(y); break; }
        }
      return { n: g.userData.token, px: len(at(label, 128, rows[0]), at(label, 128, rows[rows.length - 1] + 1)) };
    });
    const mid = { x: i.isle.cx, z: i.isle.cz };
    const near = st.hexes.reduce((a, b) => { const d = (x) => Math.hypot(1.12 * Math.sqrt(3) * (x.q + x.r / 2) - mid.x, 1.68 * x.r - mid.z); return d(b) < d(a) ? b : a; });
    const nc = { x: 1.12 * Math.sqrt(3) * (near.q + near.r / 2), z: 1.68 * near.r };
    const hexPx = len(i.screenAt(nc.x - right.x * 0.97, 0.35, nc.z - right.z * 0.97), i.screenAt(nc.x + right.x * 0.97, 0.35, nc.z + right.z * 0.97));
    const eye = cam.position.clone().sub(i.orbit.target);
    return {
      w, h, hole, box,
      view: i.view,
      polar: Math.acos(eye.y / eye.length()),
      target: [i.orbit.target.x, i.orbit.target.z],
      isle: { cx: i.isle.cx, cz: i.isle.cz, shore: i.isle.shoreHalfX, pile: i.isle.pileHalfX },
      unit: i.view === "overhead" ? (w / (i.ortho.right - i.ortho.left)) * i.ortho.zoom : null,
      coastOut: coast.filter((p) => !inHole(p)).map((p) => [p.id, Math.round(p.x), Math.round(p.y)]),
      hexOut: hexes.filter((p) => !inHole(p)).map((p) => [p.id, Math.round(p.x), Math.round(p.y)]),
      coastX: [Math.min(...coast.map((p) => p.x)), Math.max(...coast.map((p) => p.x))],
      docks: docks.length,
      docksOutTB: docks.filter((p) => !inHole(p, false)).map((p) => [p.id, Math.round(p.x), Math.round(p.y)]),
      docksOut: docks.filter((p) => !inHole(p)).map((p) => [p.id, Math.round(p.x), Math.round(p.y)]),
      piles: piles.length,
      pilesOff: piles.filter((q) => q.l < 0 || q.r > w || q.t < 0 || q.b > h),
      pilesOutHole: piles.filter((q) => q.l < box.l - 1 || q.r > box.r + 1 || q.t < box.t - 1 || q.b > box.b + 1).length,
      buttons,
      covered: [...hexes, ...coast].map((p) => [p.id, under(p)]).filter(([, u]) => u),
      numerals: numerals.length,
      numeral: numerals.reduce((a, b) => (b.px < a.px ? b : a)),
      hexPx,
      tokenPx: 2 * 0.26 * i.pxPerUnit(nc.x, 0.35, nc.z),
    };
  });

// The renderer's own pick at each id's screen point (pickBest over hitsAt), as a tap there would ask it.
const picks = (page, ids, coarse) =>
  page.evaluate(async ({ ids, coarse }) => {
    const { pickBest } = await import("/src/lib/scene/mobile-fit.ts");
    const i = window.__isle;
    const rect = document.querySelector("canvas").getBoundingClientRect();
    return ids.map((id) => {
      const p = i.screenOf(id);
      const hit = pickBest(i.hitsAt({ clientX: rect.left + p.x, clientY: rect.top + p.y }, coarse));
      return hit?.id === id ? null : [id, hit ? `${hit.kind} ${hit.id}` : "nothing"];
    }).filter(Boolean);
  }, { ids, coarse });

async function waitBoard(page, docks) {
  await page.waitForFunction((n) => window.__isle.landReady && window.__isle.shore?.group.userData.goodsPiles?.length === n, docks, { timeout: 240_000 });
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="dock-rate-target"]').length === n, docks, { timeout: 60_000 });
  await frames(page, 3);
}

async function open(size, water = "simple") {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: size.phone, hasTouch: size.phone, deviceScaleFactor: SHOTS ? 2 : 1 });
  await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
  await ctx.addInitScript(() => localStorage.setItem("emberisle-jelly", "full"));
  await ctx.addInitScript((w) => localStorage.setItem("emberisle-water", w), water);
  const page = await ctx.newPage();
  if (size.insets) await (await ctx.newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets: size.insets });
  const tag = `${size.width}x${size.height}`;
  page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0, null, { timeout: 60_000 });
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
  await page.waitForFunction(() => window.__emberisle.getState().state);
  return { ctx, page, tag };
}

let code = 0;
try {
  if (MEASURE) {
    const out = {};
    for (const size of VIEWS) {
      const { ctx, page, tag } = await open(size);
      await load(page, false);
      out[tag] = await fitNumbers(page);
      await ctx.close();
    }
    console.log(JSON.stringify(out));
    if (errors.length) throw new Error(errors.join("\n"));
  } else if (SHOTS) {
    mkdirSync("docs/proofs/1607", { recursive: true });
    for (const size of SHOT_VIEWS) {
      for (const seats of [5, 6]) {
        const { ctx, page, tag } = await open(size, "crystal");
        await load(page, true, "main", seats);
        await waitBoard(page, 11);
        await page.waitForTimeout(500);
        const m = await measure(page);
        // Whole island and coast in the hole, nothing of it under the HUD.
        check(`${tag} ${seats} seats: hexes, coast corners and docks inside the hole, none under the HUD`, m.hexOut.length + m.coastOut.length + m.docksOutTB.length + m.covered.length === 0, { hex: m.hexOut, coast: m.coastOut, docks: m.docksOutTB, covered: m.covered });
        const file = `docs/proofs/1607/expanded-${seats}-seats-${tag}.png`;
        await page.screenshot({ path: file });
        console.log(`wrote ${file}`);
        await ctx.close();
      }
    }
    if (fails.length) throw new Error(`${fails.length} check(s) failed`);
    if (errors.length) throw new Error(errors.join("\n"));
  } else {
    // Node: the classic shape is the classic constants.
    const fit = await vite.ssrLoadModule("/src/lib/scene/mobile-fit.ts");
    const C = fit.CLASSIC_ISLE;
    check("classic shape: exactly ISLE_HALF, SHORE_HALF_X and PILE_HALF_X, its middle at the origin, no growth",
      C.half.x === fit.ISLE_HALF.x && C.half.z === fit.ISLE_HALF.z && C.shoreHalfX === fit.SHORE_HALF_X && C.pileHalfX === fit.PILE_HALF_X && C.cx === 0 && C.cz === 0 && C.grow === 0,
      { half: C.half, shore: C.shoreHalfX, pile: C.pileHalfX, cx: C.cx, cz: C.cz, grow: C.grow });
    // The coast corners of the dealt island: its corners on fewer than three hexes.
    const { createExpandedGame } = await vite.ssrLoadModule("/src/lib/game/expanded.ts");
    const coastCount = createExpandedGame({ seed: 20261113, humans: NAMES.map((name) => ({ name })), bots: 0 }).vertices.filter((v) => v.hexes.length < 3).length;
    const w = Math.sqrt(3) * 1.12;
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    let shaped = false;

    const classicTokens = {};
    for (const size of VIEWS) {
      const { ctx, page, tag } = await open(size, size.phone ? "simple" : "crystal");
      // Classic parity.
      await load(page, false);
      const got = await fitNumbers(page);
      const want = CLASSIC_MAIN?.[tag];
      const diff = [];
      if (!want) diff.push("no CLASSIC_MAIN numbers");
      else {
        if (got.view !== want.view) diff.push(`view ${got.view} not ${want.view}`);
        for (const k of Object.keys(want.fit)) if (Math.abs(got.fit[k] - want.fit[k]) > 1e-6) diff.push(`fit.${k} ${got.fit[k]} not ${want.fit[k]}`);
        want.target.forEach((v, j) => Math.abs(got.target[j] - v) > 1e-6 && diff.push(`target[${j}] ${got.target[j]} not ${v}`));
        for (const [id, p] of Object.entries(want.hexes)) if (Math.abs(got.hexes[id][0] - p[0]) > 0.01 || Math.abs(got.hexes[id][1] - p[1]) > 0.01) diff.push(`hex ${id} at ${got.hexes[id]} not ${p}`);
      }
      check(`${tag}: classic four seats: the ${got.view} fit, the look-at point and all 19 hex centres equal origin/main's`, diff.length === 0, diff.length ? diff.slice(0, 6).join("; ") : `${JSON.stringify(got.fit)} at ${got.target}`);
      const cm = await measure(page);
      // The classic island measured as any other board is (isleShape on the renderer's own coast loop and coast hexes)
      // fits exactly as the classic constants do, in all three fits at this canvas.
      const same = await page.evaluate(async (phone) => {
        const f = await import("/src/lib/scene/mobile-fit.ts");
        const i = window.__isle;
        const st = i.lastState;
        const ring = new Set(st.vertices.filter((v) => i.coastMiter.has(v.id)).flatMap((v) => v.hexes));
        const pts = st.hexes.filter((h) => ring.has(h.id)).map((h) => ({ x: 1.12 * Math.sqrt(3) * (h.q + h.r / 2), z: 1.68 * h.r }));
        const m = f.isleShape(i.coast, pts, 0, 0);
        const c = document.querySelector("canvas");
        const [w, h, hole] = [c.clientWidth, c.clientHeight, i.insets()];
        const pairs = [[f.playOrtho(w, h, hole, phone), f.playOrtho(w, h, hole, phone, m)], [f.fitOrtho(w, h, hole, f.OVERHEAD_LEAN), f.fitOrtho(w, h, hole, f.OVERHEAD_LEAN, false, m)], [f.fitDiorama(w, h, hole), f.fitDiorama(w, h, hole, f.DIORAMA_POLAR, f.DIORAMA_AZIMUTH, m)], [{ d: f.freeMaxDistance(h, hole, true) }, { d: f.freeMaxDistance(h, hole, true, m) }]];
        const worst = Math.max(...pairs.flatMap(([a, b]) => Object.keys(a).map((k) => Math.abs(a[k] - b[k]))));
        return { worst, grow: m.grow, half: m.half, shore: m.shoreHalfX - f.SHORE_HALF_X, pile: m.pileHalfX - f.PILE_HALF_X };
      }, size.phone);
      check(`${tag}: the classic island measured from its own coast fits as the constants do (upright or play overhead, 25° overhead, diorama, free dolly)`, same.worst < 1e-9 && Math.abs(same.grow) < 1e-9, same);
      classicTokens[tag] = cm;

      // The expanded island.
      await load(page, true);
      await waitBoard(page, 11);
      const m = await measure(page);
      if (!shaped) {
        shaped = true;
        const X = await page.evaluate(() => ({ ...window.__isle.isle, coast: window.__isle.coast.length }));
        check("expanded shape: middle 0.5 hex widths east of the origin; extents the classic plus 0.5 hex widths across and 1.68 deep",
          near(X.cx, 0.5 * w) && near(X.cz, 0) && near(X.half.x, 5.8 + 0.5 * w) && near(X.half.z, 5.4 + 1.68) && near(X.shoreHalfX, fit.SHORE_HALF_X + 0.5 * w) && near(X.pileHalfX, 5.75 + 0.5 * w) && near(X.grow, 1.68) && X.coast === coastCount,
          { cx: X.cx, half: X.half, shore: X.shoreHalfX, pile: X.pileHalfX, grow: X.grow, corners: X.coast });
      }
      const deg = (r) => ((r * 180) / Math.PI).toFixed(1);
      const upright = size.phone && size.height > size.width;
      const lean = upright ? fit.UPRIGHT_LEAN : fit.OVERHEAD_LEAN;
      check(`${tag}: the default view is the classic one for this canvas (${cm.view}${cm.view === "overhead" ? ` at ${deg(lean)}°` : ""})`, m.view === cm.view && (m.view !== "overhead" || Math.abs(m.polar - lean) < 1e-3), `${m.view} at ${deg(m.polar)}°`);
      // The diorama looks at the island's middle; the overhead fit is made about it (its look-at point is shifted onto the hole).
      if (m.view === "diorama") check(`${tag}: the eye looks at the expanded island's middle (${(0.5 * w).toFixed(3)}, 0)`, near(m.target[0], 0.5 * w) && near(m.target[1], 0), m.target.map((v) => v.toFixed(3)).join(", "));
      else check(`${tag}: the overhead fit is made about the expanded island's middle (${(0.5 * w).toFixed(3)}, 0)`, near(m.isle.cx, 0.5 * w) && near(m.isle.cz, 0), `look-at ${m.target.map((v) => v.toFixed(3)).join(", ")}`);
      check(`${tag}: all 30 hex centres inside the declared hole`, m.hexOut.length === 0, m.hexOut.length ? m.hexOut : `hole ${JSON.stringify(m.box)}`);
      check(`${tag}: all ${coastCount} coast corners inside the declared hole`, m.coastOut.length === 0, m.coastOut.length ? m.coastOut : `x ${m.coastX.map(Math.round).join("..")}`);
      if (upright) {
        check(`${tag}: every dock's pier and boat inside the hole's top and bottom (its sides may run off the screen, q1515-table-look B)`, m.docks === 22 && m.docksOutTB.length === 0, m.docksOutTB);
        const shore = 0.42 * m.unit;
        const gapL = m.coastX[0] - shore;
        const gapR = m.w - (m.coastX[1] + shore);
        const scale = Math.min((m.w - 2 * fit.EDGE_GAP) / (2 * m.isle.shore), (m.w / 2 - fit.PILE_GAP) / m.isle.pile);
        check(`${tag}: the shore spans the screen as the classic upright fit does (EDGE_GAP, or as near as keeps the piles on screen)`, Math.abs(m.unit / scale - 1) < 0.005 && Math.abs(gapL - gapR) <= 1 && gapL >= fit.EDGE_GAP - 1, `${m.unit.toFixed(2)} px a world unit, shore ${gapL.toFixed(1)} / ${gapR.toFixed(1)} px from the edges`);
      } else {
        check(`${tag}: every dock's pier and boat inside the declared hole`, m.docks === 22 && m.docksOut.length === 0, m.docksOut);
      }
      check(`${tag}: all 11 goods piles wholly on screen`, m.piles === 11 && m.pilesOff.length === 0, m.pilesOff.length ? m.pilesOff : `${m.pilesOutHole} past the hole's edge`);
      const btnBad = m.buttons.filter((b) => !(b.w >= 44 && b.hgt >= 44 && b.l >= 0 && b.t >= 0 && b.r <= m.w && b.b <= m.h && b.y >= m.box.t - 1 && b.y <= m.box.b + 1 && (upright || (b.x >= m.box.l - 1 && b.x <= m.box.r + 1))));
      check(`${tag}: 11 dock buttons, each 44 px, wholly on screen, its centre inside the hole${upright ? "'s top and bottom" : ""}`, m.buttons.length === 11 && new Set(m.buttons.map((b) => b.id)).size === 11 && btnBad.length === 0, btnBad);
      check(`${tag}: no hex centre or coast corner under the HUD`, m.covered.length === 0, m.covered.slice(0, 8));
      const ratio = m.numeral.px / cm.numeral.px;
      console.log(`     ${tag}: hex ${cm.hexPx.toFixed(1)} px classic, ${m.hexPx.toFixed(1)} px expanded; token ${cm.tokenPx.toFixed(1)} / ${m.tokenPx.toFixed(1)} px across; smallest numeral ${cm.numeral.px.toFixed(1)} px classic (the ${cm.numeral.n}), ${m.numeral.px.toFixed(1)} px expanded (the ${m.numeral.n}), ${(ratio * 100).toFixed(0)} %`);
      // The floor is measured and reported, not asserted: where the expanded board falls under it, the owner decides (a
      // different default view, or panning), not this piece.
      check(`${tag}: all 28 expanded tokens measured`, m.numerals === 28 && cm.numerals === 18);
      if (m.view === "diorama" && m.numeral.px < 11) owner.push(`${tag}: the diorama's smallest expanded numeral is ${m.numeral.px.toFixed(1)} px, under the design's 11 px floor (classic ${cm.numeral.px.toFixed(1)} px)`);
      if (m.view === "overhead") owner.push(`${tag}: overhead, the smallest numeral is ${m.numeral.px.toFixed(1)} px expanded and ${cm.numeral.px.toFixed(1)} px classic (the 11 px floor is written for the diorama)`);

      // Picking: every hex at its centre.
      const coarse = size.phone;
      const hexIds = await page.evaluate(() => window.__isle.lastState.hexes.map((h) => h.id));
      const hexMiss = await picks(page, hexIds, coarse);
      check(`${tag}: all 30 hexes are the renderer's pick at their centres`, hexMiss.length === 0, hexMiss);
      // Every path beside six outposts at the coast's extremes, with a path armed.
      await load(page, true, "paths");
      const paths = await page.evaluate(() => {
        const st = window.__isle.lastState;
        const mine = new Set(st.vertices.filter((v) => v.building).map((v) => v.id));
        return { legal: [...window.__isle.legalIds].filter((id) => st.edges.some((e) => e.id === id)), beside: st.edges.filter((e) => mine.has(e.va) || mine.has(e.vb)).length, outposts: mine.size };
      });
      const pathMiss = await picks(page, paths.legal, coarse);
      check(`${tag}: all ${paths.legal.length} paths beside the ${paths.outposts} extreme outposts are legal marks and the renderer's pick`, paths.legal.length === paths.beside && paths.outposts >= 4 && pathMiss.length === 0, pathMiss);
      // Every corner, in setup (each one a legal outpost).
      await load(page, true, "settle");
      const vIds = await page.evaluate(() => [...window.__isle.legalIds].filter((id) => window.__isle.lastState.vertices.some((v) => v.id === id)));
      const vMiss = await picks(page, vIds, coarse);
      check(`${tag}: all ${vIds.length} corners are the renderer's pick`, vIds.length === (await page.evaluate(() => window.__isle.lastState.vertices.length)) && vMiss.length === 0, vMiss);
      // A real tap or click on each extreme coast corner selects (touch) or builds (mouse) that very corner.
      const ends = await page.evaluate(() => {
        const i = window.__isle;
        const coast = i.coast.map((v) => ({ id: v.id, ...i.screenOf(v.id) }));
        const pick = (f) => coast.reduce((a, b) => (f(b) > f(a) ? b : a));
        const rect = document.querySelector("canvas").getBoundingClientRect();
        return [...new Set([(p) => -p.x, (p) => p.x, (p) => -p.y, (p) => p.y].map(pick))].map((p) => ({ id: p.id, x: rect.left + p.x, y: rect.top + p.y }));
      });
      const tapped = [];
      for (const e of ends) {
        if (coarse) {
          await page.touchscreen.tap(e.x, e.y);
          await frames(page, 3);
          tapped.push([e.id, await page.evaluate(() => window.__emberisle.getState().pendingPlace?.id ?? null)]);
        } else {
          await load(page, true, "settle");
          await page.mouse.click(e.x, e.y);
          await frames(page, 3);
          tapped.push([e.id, await page.evaluate((id) => (window.__emberisle.getState().state.vertices.find((v) => v.id === id)?.building ? id : null), e.id)]);
        }
      }
      check(`${tag}: a real ${coarse ? "tap" : "click"} on each extreme coast corner ${coarse ? "selects" : "builds on"} that very corner`, tapped.length >= 4 && tapped.every(([a, b]) => a === b), tapped);
      // A real tap on each dock's button names its rate.
      await load(page, true);
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="dock-rate-target"]').length === 11);
      const named = [];
      const RATE = { any: "3:1", timber: "2:1 wood", clay: "2:1 brick", wool: "2:1 sheep", grain: "2:1 wheat", ore: "2:1 stone" };
      for (const b of await page.evaluate(() => [...document.querySelectorAll('[data-testid="dock-rate-target"]')].map((el) => { const r = el.getBoundingClientRect(); return { kind: el.dataset.kind, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; }))) {
        if (coarse) await page.touchscreen.tap(b.x, b.y);
        else await page.mouse.click(b.x, b.y);
        const text = await page.waitForFunction(() => document.querySelector('[data-testid="dock-rate-label"]')?.textContent, null, { timeout: 10_000 }).then((h) => h.jsonValue()).catch(() => "");
        named.push([b.kind, String(text).replace(/\s+/g, " ").trim().includes(RATE[b.kind])]);
        await page.keyboard.press("Escape");
        await page.mouse.move(0, 0);
        await frames(page, 3);
        await page.waitForFunction(() => !document.querySelector('[data-testid="dock-rate-label"]'), null, { timeout: 10_000 }).catch(() => {});
      }
      check(`${tag}: a real ${coarse ? "tap" : "click"} on each of the 11 dock buttons names its rate`, named.length === 11 && named.every(([, ok]) => ok), named.filter(([, ok]) => !ok));
      if (!size.phone) {
        // The crystal sea's swash and lace (the wash) run along the waterline, just off the coast: its bounds sit within 1.5
        // world units outside the expanded coast's on every side.
        const sea = await page.evaluate(() => {
          const i = window.__isle;
          const g = i.crystal?.wash.geometry;
          if (!g || i.waterPath !== "crystal") return null;
          g.computeBoundingBox();
          const b = g.boundingBox;
          const xs = i.coast.map((v) => v.x);
          const zs = i.coast.map((v) => v.z);
          return { wash: [b.min.x, b.max.x, b.min.z, b.max.z].map((v) => +v.toFixed(2)), coast: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)].map((v) => +v.toFixed(2)) };
        });
        const off = sea && [sea.coast[0] - sea.wash[0], sea.wash[1] - sea.coast[1], sea.coast[2] - sea.wash[2], sea.wash[3] - sea.coast[3]];
        check(`${tag}: the crystal sea's wash is traced round the expanded coast`, !!off && off.every((d) => d > 0 && d < 1.5), sea);
      }
      // Expanded -> classic in the same page: the classic board again fits exactly as on origin/main, and its coast, beach,
      // foam (and, on the crystal sea, the wash) are the classic island's once more.
      await load(page, false);
      await waitBoard(page, 9);
      const back = await fitNumbers(page);
      const backDiff = [];
      if (back.view !== want.view) backDiff.push(`view ${back.view} not ${want.view}`);
      for (const k of Object.keys(want.fit)) if (Math.abs(back.fit[k] - want.fit[k]) > 1e-6) backDiff.push(`fit.${k} ${back.fit[k]} not ${want.fit[k]}`);
      want.target.forEach((v, j) => Math.abs(back.target[j] - v) > 1e-6 && backDiff.push(`target[${j}] ${back.target[j]} not ${v}`));
      for (const [id, p] of Object.entries(want.hexes)) if (Math.abs(back.hexes[id][0] - p[0]) > 0.01 || Math.abs(back.hexes[id][1] - p[1]) > 0.01) backDiff.push(`hex ${id} at ${back.hexes[id]} not ${p}`);
      check(`${tag}: back to the classic board in the same page: the ${back.view} fit, the look-at point and all 19 hex centres equal origin/main's again`, backDiff.length === 0 && Object.keys(back.hexes).length === 19, backDiff.length ? backDiff.slice(0, 6).join("; ") : `${JSON.stringify(back.fit)} at ${back.target}`);
      const shoreBack = await page.evaluate(() => {
        const i = window.__isle;
        const box = (g) => {
          if (!g) return null;
          g.computeBoundingBox();
          const b = g.boundingBox;
          return [b.min.x, b.max.x, b.min.z, b.max.z].map((v) => +v.toFixed(2));
        };
        const xs = i.coast.map((v) => v.x);
        const zs = i.coast.map((v) => v.z);
        return {
          corners: i.coast.length,
          middle: [i.isle.cx, i.isle.cz, i.isle.grow],
          coast: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)].map((v) => +v.toFixed(2)),
          foam: box(i.foam.geometry),
          wash: i.waterPath === "crystal" ? box(i.crystal?.wash.geometry) : undefined,
        };
      });
      const around = (b, lo, hi) => !!b && [shoreBack.coast[0] - b[0], b[1] - shoreBack.coast[1], shoreBack.coast[2] - b[2], b[3] - shoreBack.coast[3]].every((d) => d > lo && d < hi);
      check(`${tag}: back on the classic board, the coast is the classic island's 30 corners (x ±4.85, z ±4.48) about the origin, and the foam is traced round it`,
        shoreBack.corners === 30 && shoreBack.middle.every((v) => v === 0) && JSON.stringify(shoreBack.coast) === JSON.stringify([-4.85, 4.85, -4.48, 4.48]) && around(shoreBack.foam, 0.2, 0.5), shoreBack);
      if (!size.phone) check(`${tag}: back on the classic board, the crystal sea's wash is traced round the classic coast`, around(shoreBack.wash, 0, 1.5), shoreBack.wash);
      await ctx.close();
    }
    check("zero page errors", errors.length === 0, errors.slice(0, 5).join("\n"));
    for (const line of owner) console.log(`note ${line}`);
    if (fails.length) throw new Error(`${fails.length} check(s) failed: ${fails.join("; ")}`);
    console.log("expanded-fit-prove: ok");
  }
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
