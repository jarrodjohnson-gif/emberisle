// #312: every seat is told apart by a mark as well as its colour (docs/design/seat-marks.md, option B). In hotseat with
// a crafted mid-game board (paths, outposts and strongholds for all four seats) at 1280x720, 390x844 and 844x390 (touch):
// - SEAT_MARKS gives the four seat colours four distinct marks, each ink a piece rim at least 3:1 on its seat colour;
// - every seat's dot in the rail or strip carries its colour's mark (`data-seat-mark`), and so does the phone menu's
//   heading (which reads the seat's name; the desktop rail's menu has none, its card says it), a trade toast from that
//   seat, the steal picker, the win line and every win-table row;
// - on the board every path, outpost and stronghold is one mesh whose userData names its owner's mark and whose vertex
//   colours hold that mark's ink *above the seat surface* (a path's badge top, a keep's top, an outpost's roof), so a
//   build whose mark() returns [] fails here even though the rims already use both inks;
// - the title's colour picker shows all four marks.
// Zero console errors. Saves test-results/seat-marks-<size>.png and a zoomed test-results/seat-marks-zoom.png.
// Run: npm run seat-marks-prove. Port from VITE_PORT, default 8685.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";
import { PLAYER_COLORS, SEAT_MARKS } from "../src/lib/game/types.ts";
import { RIM } from "../src/lib/scene/palette.ts";

const PORT = Number(process.env.VITE_PORT) || 8685;
const STEP_MS = 60_000;
const VIEWS = [
  { tag: "1280x720", width: 1280, height: 720, seat: "rail" },
  { tag: "390x844", width: 390, height: 844, touch: true, seat: "seat" },
  { tag: "844x390", width: 844, height: 390, touch: true, seat: "seat" },
];

const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : ": " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};

// The mapping itself: four colours, four distinct marks, each ink a piece rim.
const marks = PLAYER_COLORS.map((c) => SEAT_MARKS[c]);
check("four seat colours have four distinct marks", new Set(marks.map((m) => m.mark)).size === 4, marks.map((m) => m.mark));
check("every mark's ink is a piece rim", marks.every((m) => Object.values(RIM).includes(m.ink)), marks.map((m) => m.ink));
// WCAG 2 relative luminance; 3:1 is the non-text minimum, which the dark ink misses on Pine (2.85:1), hence its cream.
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const inkRatios = PLAYER_COLORS.map((c) => +contrast(c, SEAT_MARKS[c].ink).toFixed(2));
check("every mark's ink is at least 3:1 on its seat colour", inkRatios.every((r) => r >= 3), inkRatios);

mkdirSync("test-results", { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];

// A mid-game board: three buildings (two outposts, one stronghold) and three paths for every seat, the table in p0's main phase.
const craftBoard = (page) =>
  page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const land = st.vertices.filter((v) => v.hexes.length >= 2);
    const step = Math.floor(land.length / 12);
    st.players.forEach((p, i) => {
      for (let k = 0; k < 3; k++) {
        const v = land[(i * 3 + k) * step];
        v.building = { playerId: p.id, kind: k === 2 ? "stronghold" : "outpost" };
        const e = st.edges.find((e) => (e.va === v.id || e.vb === v.id) && !e.path);
        if (e) e.path = p.id;
      }
    });
    st.current = st.players[0].id;
    st.phase = "main";
    st.dice = [3, 4];
    st.seq += 1;
    g.setState({ state: st, buildMode: "none", error: null });
    return st.players.map((p) => ({ id: p.id, color: p.color }));
  });

const settle = (page) => page.waitForFunction(() => window.__isle.lastSeq === window.__emberisle.getState().state.seq && window.__isle.renders > 0, null, { timeout: STEP_MS });

try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0, null, { timeout: STEP_MS });

    if (v.tag === "1280x720") {
      const picker = await page.evaluate(() => [...document.querySelectorAll('[role="radiogroup"] [data-seat-mark]')].map((el) => el.dataset.seatMark));
      check("the title's colour picker shows the four marks", new Set(picker).size === 4 && picker.length === 4, picker);
    }

    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    const players = await craftBoard(page);
    await settle(page);
    const expect = Object.fromEntries(players.map((p) => [p.id, SEAT_MARKS[p.color]?.mark ?? null]));
    check(`${v.tag}: every seat colour has a mark`, Object.values(expect).every(Boolean), expect);

    // Seat rail or strip.
    const dots = await page.evaluate((sel) => [...document.querySelectorAll(`[data-testid^="${sel}-p"]`)].map((el) => [el.dataset.testid.slice(sel.length + 1), el.querySelector(".seat-dot")?.dataset.seatMark ?? null]), v.seat);
    check(`${v.tag}: every seat's dot carries its mark`, dots.length === 4 && dots.every(([id, m]) => m === expect[id]), dots);

    // Each seat's menu, opened from its card: on a phone it floats, so it heads with the seat's dot and name; in the
    // desktop rail it sits under the card that already says both, so it has no heading.
    const menus = [];
    for (const p of players) {
      await page.getByTestId(`${v.seat}-${p.id}`).locator("button").first().click();
      const menu = page.getByTestId("player-menu");
      await menu.waitFor({ timeout: STEP_MS });
      const head = menu.getByTestId("menu-seat");
      const name = await page.getByTestId(`${v.seat}-${p.id}`).locator('[data-testid="seat-name"]').first().textContent();
      menus.push([p.id, (await head.count()) ? await head.locator("[data-seat-mark]").getAttribute("data-seat-mark") : null, (await head.count()) ? (await head.textContent()).trim() : null, name.trim()]);
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "detached", timeout: STEP_MS });
    }
    if (v.touch) check(`${v.tag}: every seat's menu heads with its mark and its name`, menus.every(([id, m, t, name]) => m === expect[id] && t === name), menus);
    else check(`${v.tag}: the rail's menu has no heading (its card names the seat)`, menus.every(([, m, t]) => m === null && t === null), menus);

    // A trade toast from each other seat.
    const toasts = [];
    for (const p of players.slice(1)) {
      await page.evaluate((p) => window.__emberisle.setState({ offer: { tradeId: `t-${p.id}`, from: p.id, fromName: "Seat", give: { wool: 2 }, want: { ore: 1 }, until: Date.now() + 20_000 }, declined: [], tradeOutcome: null }), p);
      const toast = page.getByTestId("trade-toast");
      await toast.waitFor({ timeout: STEP_MS });
      toasts.push([p.id, await toast.locator("[data-seat-mark]").getAttribute("data-seat-mark")]);
    }
    await page.evaluate(() => window.__emberisle.setState({ offer: null, declined: [] }));
    check(`${v.tag}: a trade toast leads with the asker's mark`, toasts.length === 3 && toasts.every(([id, m]) => m === expect[id]), toasts);

    // The steal picker: one button per target, each with its seat's mark.
    await page.evaluate((targets) => window.__emberisle.setState({ pendingSteal: { hexId: "0,0", kind: "moveRobber", targets } }), players.slice(1).map((p) => p.id));
    const picker = page.getByText("Take from whom?");
    await picker.waitFor({ timeout: STEP_MS });
    const steal = await picker.evaluate((el) => [...el.parentElement.querySelectorAll("button")].map((b) => [b.textContent.trim(), b.querySelector("[data-seat-mark]")?.dataset.seatMark ?? null]));
    await page.evaluate(() => window.__emberisle.setState({ pendingSteal: null }));
    check(`${v.tag}: the steal picker marks every target`, steal.length === 3 && steal.every(([, m], i) => m === expect[players[i + 1].id]), steal);

    // The board: one mesh per piece, each carrying its owner's mark in userData and the mark's ink in its vertex colours.
    // The rims already use both inks, so the test is ink *above* the seat surface: over a path's badge (y > 0.105), a
    // keep's top (y > 0.30) or an outpost's roof slope (y > 0.26, where the folded mark's faces lie), in the piece's
    // own frame.
    const board = await page.evaluate((inks) => {
      const lin = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      const above = { path: 0.105, outpost: 0.26, stronghold: 0.3 };
      const isle = window.__isle;
      const st = window.__emberisle.getState().state;
      const owner = (key) => (key.startsWith("e:") ? st.edges.find((e) => e.id === key.slice(2)).path : st.vertices.find((x) => x.id === key.slice(2)).building.playerId);
      const pieces = isle.pieces.children.map((o) => {
        const col = o.geometry.attributes.color;
        const pos = o.geometry.attributes.position;
        const inkAbove = (hex) => {
          const [r, g, b] = lin(hex);
          let n = 0;
          for (let i = 0; i < col.count; i++) {
            if (pos.getY(i) <= above[o.userData.piece]) continue;
            if (Math.abs(col.getX(i) - r) < 0.002 && Math.abs(col.getY(i) - g) < 0.002 && Math.abs(col.getZ(i) - b) < 0.002) n++;
          }
          return n;
        };
        return { kind: o.userData.piece, owner: owner(o.userData.key), mark: o.userData.mark, mesh: o.isMesh && o.children.length === 0, inks: Object.fromEntries(Object.entries(inks).map(([k, hex]) => [k, inkAbove(hex)])) };
      });
      const want = st.edges.filter((e) => e.path).length + st.vertices.filter((x) => x.building).length;
      const vertices = isle.pieces.children.reduce((n, o) => n + o.geometry.attributes.position.count, 0);
      return { pieces, want, vertices };
    }, RIM);
    const inkOf = (id) => SEAT_MARKS[players.find((p) => p.id === id).color].ink;
    // The smallest mark is the triangle: two extruded halves, 24 vertices on or above their top faces.
    const bad = board.pieces.filter((p) => p.mark !== expect[p.owner] || !p.mesh || p.inks[Object.keys(RIM).find((k) => RIM[k] === inkOf(p.owner))] < 24);
    check(`${v.tag}: ${board.pieces.length} pieces drawn for ${board.want} placed, one mesh each`, board.pieces.length === board.want && board.pieces.every((p) => p.mesh));
    for (const kind of ["path", "outpost", "stronghold"]) {
      const of = board.pieces.filter((p) => p.kind === kind);
      const seats = new Set(of.map((p) => p.owner));
      check(`${v.tag}: every ${kind} (${of.length}, ${seats.size} seats) carries its seat's mark, in its ink, above the seat surface`, of.length > 0 && seats.size === 4 && !bad.some((p) => p.kind === kind), bad.filter((p) => p.kind === kind).slice(0, 3));
    }
    console.log(`info ${v.tag}: ${board.pieces.length} piece meshes, ${board.vertices} vertices between them`);

    await page.screenshot({ path: `test-results/seat-marks-${v.tag}.png` });
    if (v.tag === "1280x720") {
      // A closer look at the marks on the pieces, for the eye.
      await page.evaluate(() => {
        const o = window.__isle.ortho;
        o.zoom = 3;
        o.updateProjectionMatrix();
        window.__isle.wake();
      });
      await page.waitForTimeout(800);
      await page.screenshot({ path: "test-results/seat-marks-zoom.png" });
    }

    // The win screen: the headline dot and every row.
    await page.evaluate(() => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      st.phase = "over";
      st.winner = st.players[1].id;
      st.seq += 1;
      g.setState({ state: st });
    });
    const win = page.getByTestId("win-screen");
    await win.waitFor({ timeout: STEP_MS });
    const winMarks = await win.evaluate((el) => ({
      head: el.querySelector("#win-headline")?.parentElement.querySelector("[data-seat-mark]")?.dataset.seatMark ?? null,
      rows: [...el.querySelectorAll('[data-testid="win-row"]')].map((r) => [r.dataset.player, r.querySelector("[data-seat-mark]")?.dataset.seatMark ?? null]),
    }));
    check(`${v.tag}: the win line and every win row carry the seat's mark`, winMarks.head === expect[players[1].id] && winMarks.rows.length === 4 && winMarks.rows.every(([id, m]) => m === expect[id]), winMarks);
    await page.screenshot({ path: `test-results/seat-marks-${v.tag}-win.png` });
    await ctx.close();
  }
} catch (e) {
  check("ran to the end", false, String(e.stack ?? e));
} finally {
  await browser.close();
  await vite.close();
}

check("zero console errors", errors.length === 0, errors.slice(0, 5));
if (fails.length) {
  console.log("FAIL: " + fails.join("; "));
  process.exit(1);
}
console.log("seat-marks-prove: ok");
