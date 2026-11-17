// #1509 (option A, owner card q1508-table-goal): the upright phone table. At 430x932, 390x844 and 375x812 (touch, with the
// device's safe-area insets), on a crafted main phase (seed 20261110, four seats, own turn):
// - camera: the default view is overhead at UPRIGHT_LEAN (40°), and the island's shore spans the screen: the outermost hex
//   corners sit SHORE_HALF_X - 0.42 world units out, and the shore comes EDGE_GAP px from each screen edge, or as near as
//   keeps every goods pile wholly on screen (PILE_HALF_X, PILE_GAP); a side dock's boat may run off the side edges (owner card q1515-table-look, B), but every dock's pier and boat is
//   inside the hole's top and bottom and every dock's 44 px inspect button is wholly on screen; it sits low: its lowest
//   corner is nearer the hole's bottom than its highest corner is to the hole's top, and no corner leaves the hole; sideways (844x390) the lean is still OVERHEAD_LEAN;
//   a turn of the phone goes from one lean to the other;
// - 16 px gutters: the seat strip and the bottom stack start 16 px from the left edge and end 16 px from the right;
// - seats: every seat shows its full name (no ellipsis, not a short form) on its own line under its dot and points; the strip
//   has no path or army tally; the seat's sheet lists "Path length" and "Wayfarers played" as the rules count them, and
//   "Longest path" and "Largest army" on the seat that holds them;
// - the dock: the turn line, the hand tray and the build row have no fill and no padding box; there are no "pays on"
//   number chips; the last-event line follows the status on the tray's top line and runs to the tray's right padding (#1539);
// - the empty space between the seat strip and the dock is at least 58.3 % of the height at 390x844 with a 34 px home bar;
// - no text in the seat strip, the turn line or the log line is under 12 px.
// Zero console errors. Screenshots to test-results/upright-table-<size>.png. Run: npm run upright-table-prove
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const SIZES = [
  { width: 430, height: 932, insets: { top: 59, right: 0, bottom: 34, left: 0 } },
  // q1274-1 measures 58.3 % at 390x844 with a 34 px home bar and no top inset.
  { width: 390, height: 844, insets: { top: 0, right: 0, bottom: 34, left: 0 } },
  { width: 375, height: 812, insets: { top: 44, right: 0, bottom: 34, left: 0 } },
];
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
mkdirSync("test-results", { recursive: true });
const errors = [];
const NAMES = ["Jarrod", "Daking", "Isaac", "Joshua"];

async function crafted(page) {
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
  await page.waitForFunction(() => window.__emberisle.getState().state);
  await page.evaluate(async (names) => {
    const game = window.__emberisle;
    const { createGame } = await import("/src/lib/game/board.ts");
    const st = createGame({ seed: 20261110, humans: names.map((name) => ({ name })), bots: 0 });
    st.players[0].resources = { timber: 2, clay: 1, wool: 3, grain: 2, ore: 1 };
    // An outpost of the seat's own, so it has numbers that would pay it (the "pays on" chips this table no longer shows).
    const v = st.vertices.find((x) => !x.building && x.hexes?.length === 3) ?? st.vertices[20];
    v.building = { playerId: st.players[0].id, kind: "outpost" };
    st.phase = "main";
    st.rollOff = null;
    st.dice = [3, 5];
    st.current = st.players[0].id;
    st.log.push("Jarrod rolled 8!");
    st.seq++;
    game.setState({ state: st, localId: st.players[0].id, mode: "ai", spectator: false, buildMode: "none", banner: null, error: null, menuFor: null });
  }, NAMES);
  await page.locator('[data-menu-trigger="p0"]').waitFor();
  await page.waitForFunction(() => !window.__isle.refitDue && !window.__isle.glide && window.__isle.fit && window.__isle.shore?.group.userData.goodsPiles?.length === 9, null, { timeout: 60_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const lookAt = (page) =>
  page.evaluate(async () => {
    const fit = await import("/src/lib/scene/mobile-fit.ts");
    const isle = window.__isle;
    const c = document.querySelector("canvas");
    const st = window.__emberisle.getState().state;
    const pts = st.vertices.map((v) => isle.screenOf(v.id));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    // The polar angle of the eye in use (overhead: the orthographic camera around the orbit target).
    const eye = isle.ortho.position.clone().sub(isle.orbit.target);
    const polar = Math.acos(eye.y / eye.length());
    return {
      w: c.clientWidth,
      h: c.clientHeight,
      view: isle.view,
      polar,
      UPRIGHT_LEAN: fit.UPRIGHT_LEAN,
      OVERHEAD_LEAN: fit.OVERHEAD_LEAN,
      SHORE_HALF_X: fit.SHORE_HALF_X,
      EDGE_GAP: fit.EDGE_GAP,
      PILE_HALF_X: fit.PILE_HALF_X,
      PILE_GAP: fit.PILE_GAP,
      // Every goods pile's screen box (#846: the pile stays on screen where its boat is cropped).
      piles: (isle.shore?.group.userData.goodsPiles ?? []).map((pile) => {
        const m = new isle.ortho.matrixWorld.constructor().fromArray(pile.frame);
        const pts = [];
        for (const x of [pile.min[0], pile.max[0]]) for (const y of [pile.min[1], pile.max[1]]) for (const z of [pile.min[2], pile.max[2]]) {
          const p = isle.ortho.position.clone().set(x, y, z).applyMatrix4(m);
          pts.push(isle.screenAt(p.x, p.y, p.z));
        }
        return { kind: pile.kind, l: Math.min(...pts.map((q) => q.x)), r: Math.max(...pts.map((q) => q.x)), t: Math.min(...pts.map((q) => q.y)), b: Math.max(...pts.map((q) => q.y)) };
      }),
      // Each dock's pier and boat from both its corners (nine docks, 18 corners), 0.7 out along the coast at the waterline,
      // against the hole (negative: outside).
      docks: st.vertices.filter((v) => v.harbor).map((v) => {
        const m = isle.coastMiter.get(v.id);
        const p = isle.screenAt(v.x + m.mx * 0.7, 0.1, v.z + m.mz * 0.7);
        const i = isle.insets();
        return Math.min(p.y - i.top, c.clientHeight - i.bottom - p.y);
      }),
      buttons: [...document.querySelectorAll('[data-testid="dock-rate-target"]')].map((el) => {
        const r = el.getBoundingClientRect();
        return { label: el.getAttribute("aria-label"), l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width };
      }),
      hole: isle.insets(),
      // World units per CSS px across: the frustum's width over the canvas's.
      unit: c.clientWidth / (isle.ortho.right - isle.ortho.left) * isle.ortho.zoom,
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    };
  });

try {
  for (const size of SIZES) {
    const tag = `${size.width}x${size.height}`;
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: true, hasTouch: true });
    // First-game tips off: their "Skip tips" chip shares the strip's row (on a first game a 375 px strip falls back to short names).
    await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
    // The jelly shore carries the piers' goods piles (#846), as dock-piles-prove draws them.
    await ctx.addInitScript(() => localStorage.setItem("emberisle-jelly", "full"));
    const page = await ctx.newPage();
    if (size.insets) await (await ctx.newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets: size.insets });
    page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
    await page.goto(url);
    await page.waitForFunction(() => window.__emberisle && window.__isle);
    await crafted(page);

    // Camera. The dock buttons come from a lazy chunk.
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="dock-rate-target"]').length === 9, null, { timeout: 30_000 });
    const a = await lookAt(page);
    assert.equal(a.view, "overhead", `${tag}: the upright default view is overhead`);
    assert.ok(Math.abs(a.polar - a.UPRIGHT_LEAN) < 1e-3, `${tag}: the eye leans ${((a.polar * 180) / Math.PI).toFixed(1)}°, not the upright ${((a.UPRIGHT_LEAN * 180) / Math.PI).toFixed(0)}°`);
    const shore = 0.42 * a.unit;
    const gapL = a.left - shore;
    const gapR = a.w - (a.right + shore);
    // The shore comes EDGE_GAP from the edges unless the goods piles would leave the screen first; then the piles set the scale.
    const scale = Math.min((a.w - 2 * a.EDGE_GAP) / (2 * a.SHORE_HALF_X), (a.w / 2 - a.PILE_GAP) / a.PILE_HALF_X);
    assert.ok(Math.abs(a.unit / scale - 1) < 0.005, `${tag}: ${a.unit.toFixed(2)} px a world unit, not ${scale.toFixed(2)}`);
    assert.ok(Math.abs(gapL - gapR) <= 1 && gapL >= a.EDGE_GAP - 1, `${tag}: the shore is ${gapL.toFixed(1)} px from the left edge and ${gapR.toFixed(1)} px from the right`);
    assert.ok(a.piles.length === 9 && a.piles.every((q) => q.l >= 0 && q.r <= a.w && q.t >= 0 && q.b <= a.h), `${tag}: goods piles off screen ${JSON.stringify(a.piles.filter((q) => q.l < 0 || q.r > a.w))}`);
    assert.ok(a.docks.length === 18 && a.docks.every((d) => d >= -0.5), `${tag}: a dock leaves the hole's top or bottom by ${Math.min(...a.docks).toFixed(1)} px`);
    assert.ok(a.buttons.length === 9 && a.buttons.every((b) => b.w >= 44 && b.l >= 0 && b.t >= 0 && b.r <= a.w && b.b <= a.h), `${tag}: dock buttons off screen ${JSON.stringify(a.buttons)}`);
    const holeTop = a.hole.top;
    const holeBottom = a.h - a.hole.bottom;
    assert.ok(a.top >= holeTop - 1 && a.bottom <= holeBottom + 1, `${tag}: corners ${a.top.toFixed(0)}..${a.bottom.toFixed(0)} leave the hole ${holeTop}..${holeBottom}`);
    assert.ok(holeBottom - a.bottom < a.top - holeTop, `${tag}: the island is not low: ${(holeBottom - a.bottom).toFixed(0)} px under it, ${(a.top - holeTop).toFixed(0)} px over it`);
    console.log(`${tag}: overhead at ${((a.polar * 180) / Math.PI).toFixed(1)}°, shore ${gapL.toFixed(1)} / ${gapR.toFixed(1)} px from the edges, docks inside the hole's height, nine dock buttons and nine goods piles on screen, island ${Math.round(a.right - a.left + 2 * shore)} px wide, ${Math.round(holeBottom - a.bottom)} px over the dock and ${Math.round(a.top - holeTop)} px under the seats`);

    // Gutters, seats, dock.
    const ui = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const strip = document.querySelector('[data-testid="seat-strip"]');
      const stack = document.querySelector("[data-hud-stack]");
      const shown = (x) => !!x && x.getClientRects().length > 0 && getComputedStyle(x).position !== "absolute";
      const seats = [...strip.querySelectorAll('[data-testid^="seat-p"]')].map((cell) => {
        const name = [...cell.querySelectorAll('[data-testid="seat-name"]')].find(shown);
        const vp = cell.querySelector('[data-testid="seat-vp"]');
        const dot = cell.querySelector(".seat-dot");
        return {
          name: name?.textContent,
          cut: !name || name.scrollWidth > name.clientWidth,
          // #1544: the dot and the full name share the first line; the points sit on their own line under the name.
          below: !!name && Math.abs((box(dot).top + box(dot).bottom) / 2 - (box(name).top + box(name).bottom) / 2) <= 2 && box(vp).top >= box(name).bottom - 1,
          tallies: cell.querySelectorAll('[data-testid^="tally-"]').length,
        };
      });
      const fill = (el) => getComputedStyle(el).backgroundColor;
      const banner = document.querySelector('[data-testid="turn-banner"]');
      const tray = document.querySelector(".goods-tray");
      const actions = document.querySelector(".hud-actions");
      const log = document.querySelector('[data-testid="log-line"]');
      const deck = document.querySelector('[data-testid="deck-count"]');
      const small = [strip, banner, log].flatMap((root) =>
        [...root.querySelectorAll("*"), root]
          .filter((x) => shown(x) && !x.closest(".sr-only") && [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
          .filter((x) => parseFloat(getComputedStyle(x).fontSize) < 12)
          .map((x) => `${x.textContent.trim()} ${getComputedStyle(x).fontSize}`),
      );
      return {
        w: innerWidth,
        h: innerHeight,
        strip: { l: box(strip).left, r: box(strip.closest("header > div")).right, b: box(strip).bottom },
        stack: { l: box(stack).left, r: box(stack).right, t: box(stack).top },
        seats,
        fills: { banner: fill(banner), tray: fill(tray), actions: fill(actions) },
        pads: { banner: getComputedStyle(banner).paddingLeft, tray: getComputedStyle(tray).paddingLeft, actions: getComputedStyle(actions).paddingLeft },
        numbers: document.querySelectorAll('[data-testid="my-numbers"], .my-numbers').length,
        log: { l: box(log).left, r: box(log).right, deckL: box(deck).left, mid: box(log).top + box(log).height / 2, bannerR: box(banner).right, bannerMid: box(banner).top + box(banner).height / 2, innerR: box(stack).right - parseFloat(getComputedStyle(stack).paddingRight) },
        small,
      };
    });
    assert.equal(ui.strip.l, 16, `${tag}: the seat strip starts ${ui.strip.l} px from the left`);
    assert.equal(ui.w - ui.strip.r, 16, `${tag}: the header ends ${ui.w - ui.strip.r} px from the right`);
    assert.equal(ui.stack.l, 16, `${tag}: the dock starts ${ui.stack.l} px from the left`);
    assert.equal(ui.w - ui.stack.r, 16, `${tag}: the dock ends ${ui.w - ui.stack.r} px from the right`);
    assert.deepEqual(ui.seats.map((s) => s.name), NAMES, `${tag}: seats show the full names`);
    for (const s of ui.seats) {
      assert.ok(!s.cut, `${tag}: ${s.name} is cut off`);
      assert.ok(s.below, `${tag}: ${s.name} is not on the dot's line with the points under it`);
      assert.equal(s.tallies, 0, `${tag}: ${s.name}'s seat still has a tally on the strip`);
    }
    for (const [k, v] of Object.entries(ui.fills)) assert.equal(v, "rgba(0, 0, 0, 0)", `${tag}: the ${k} has a fill (${v})`);
    for (const [k, v] of Object.entries(ui.pads)) assert.equal(v, "0px", `${tag}: the ${k} has a ${v} side padding`);
    assert.equal(ui.numbers, 0, `${tag}: the "pays on" number chips are on the table`);
    // #1539: the last event is the right side of the tray's top line, after the status; the deck count is read out only.
    assert.ok(ui.log.l >= ui.log.bannerR && Math.abs(ui.log.mid - ui.log.bannerMid) <= 2, `${tag}: the last event starts at ${ui.log.l} px, after the status (ends ${ui.log.bannerR}) on its line`);
    // The tray's own right padding sits after it.
    assert.ok(Math.abs(ui.log.r - ui.log.innerR) <= 0.5, `${tag}: the last event ends ${(ui.log.innerR - ui.log.r).toFixed(1)} px short of the tray's inner right edge`);
    assert.deepEqual(ui.small, [], `${tag}: text under 12 px`);
    const clear = (ui.stack.t - ui.strip.b) / ui.h;
    if (tag === "390x844") assert.ok(clear >= 0.583, `${tag}: the clear height is ${(clear * 100).toFixed(1)} %, under 58.3 %`);
    console.log(`${tag}: 16 px gutters, full names on their own line, no tallies, no boxes, no number chips, the last event ${Math.round(ui.log.r - ui.log.l)} px wide; clear height ${(clear * 100).toFixed(1)} %`);

    // The seat sheet carries the tallies: the counts the rules hold, and the award's name on the seat that holds it.
    const sheet = async (id) => {
      await page.locator(`[data-menu-trigger="${id}"]`).tap();
      const facts = await page.getByTestId("menu-facts").evaluate((dl) => Object.fromEntries([...dl.querySelectorAll("div")].map((d) => [d.querySelector("dt").textContent, d.querySelector("dd").textContent])));
      await page.getByRole("button", { name: "Close" }).tap();
      return facts;
    };
    const want = await page.evaluate(async () => {
      const { roadLength } = await import("/src/lib/game/rules.ts");
      const st = window.__emberisle.getState().state;
      return { path: String(roadLength(st, "p1")), army: String(st.players[1].knightsPlayed) };
    });
    const plain = await sheet("p1");
    assert.ok(plain["Path length"] === want.path && plain["Wayfarers played"] === want.army, `${tag}: the seat sheet lists ${JSON.stringify(plain)}, want ${JSON.stringify(want)}`);
    await page.evaluate(() => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      st.longestRoad = "p1";
      st.largestArmy = "p1";
      st.players[1].knightsPlayed = 3;
      st.seq++;
      g.setState({ state: st });
    });
    const held = await sheet("p1");
    assert.ok(held["Longest path"] === want.path && held["Largest army"] === "3" && !("Path length" in held), `${tag}: the holder's sheet lists ${JSON.stringify(held)}`);
    const other = await sheet("p2");
    assert.ok("Path length" in other && "Wayfarers played" in other && !("Longest path" in other), `${tag}: another seat's sheet lists ${JSON.stringify(other)}`);
    await page.screenshot({ path: `test-results/upright-table-${tag}.png` });
    console.log(`${tag}: the seat sheet lists the path length and wayfarers played, and names an award on its holder`);

    // A turn of the phone: sideways the lean is the overhead one, and upright again it is the upright one.
    if (tag === "390x844") {
      await page.setViewportSize({ width: 844, height: 390 });
      // The canvas is measured again over a few frames after a resize; then the glide runs.
      await page.evaluate(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r)); });
      await page.waitForFunction(() => !window.__isle.refitDue && !window.__isle.glide && innerWidth > innerHeight, null, { timeout: 30_000 });
      const side = await lookAt(page);
      assert.ok(Math.abs(side.polar - side.OVERHEAD_LEAN) < 1e-3, `844x390: the eye leans ${((side.polar * 180) / Math.PI).toFixed(1)}°, not ${((side.OVERHEAD_LEAN * 180) / Math.PI).toFixed(0)}°`);
      await page.setViewportSize({ width: 390, height: 844 });
      // The canvas is measured again over a few frames after a resize; then the glide runs.
      await page.evaluate(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r)); });
      await page.waitForFunction(() => !window.__isle.refitDue && !window.__isle.glide && innerWidth < innerHeight, null, { timeout: 30_000 });
      const back = await lookAt(page);
      assert.ok(Math.abs(back.polar - back.UPRIGHT_LEAN) < 1e-3, `390x844 again: the eye leans ${((back.polar * 180) / Math.PI).toFixed(1)}°`);
      console.log(`turned: ${((side.polar * 180) / Math.PI).toFixed(0)}° sideways, ${((back.polar * 180) / Math.PI).toFixed(0)}° upright again`);
    }
    await ctx.close();
  }
  assert.deepEqual(errors, [], "console errors");
  console.log("upright-table-prove: ok");
} finally {
  await browser.close();
  await vite.close();
}
