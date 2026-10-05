// #312: every seat is told apart by a mark as well as its colour (docs/design/seat-marks.md, option B). In hotseat with
// a crafted mid-game board (paths, outposts and strongholds for all four seats) at 1280x720, 390x844 and 844x390 (touch):
// - SEAT_MARKS gives the four seat colours four distinct marks;
// - every seat's dot in the rail or strip carries its colour's mark (`data-seat-mark`), and so does the heading of its
//   menu, a trade toast from that seat, the win line and every win-table row;
// - on the board every path, outpost and stronghold is one mesh (one draw call) whose userData names its owner's mark and
//   whose vertex colours hold that mark's ink (a mark costs vertices, never a draw call);
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

    // Each seat's menu, opened from its card.
    const menus = [];
    for (const p of players) {
      await page.getByTestId(`${v.seat}-${p.id}`).locator("button").first().click();
      const head = page.getByTestId("menu-seat");
      await head.waitFor({ timeout: STEP_MS });
      menus.push([p.id, await head.locator("[data-seat-mark]").getAttribute("data-seat-mark"), (await head.textContent()).trim()]);
      await page.keyboard.press("Escape");
      await page.getByTestId("player-menu").waitFor({ state: "detached", timeout: STEP_MS });
    }
    check(`${v.tag}: every seat's menu heads with its mark and name`, menus.every(([id, m, t]) => m === expect[id] && t.length > 0), menus);

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

    // The board: one mesh per piece, each carrying its owner's mark in userData and the mark's ink in its vertex colours.
    const board = await page.evaluate((inks) => {
      const lin = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      const isle = window.__isle;
      const st = window.__emberisle.getState().state;
      const owner = (key) => (key.startsWith("e:") ? st.edges.find((e) => e.id === key.slice(2)).path : st.vertices.find((x) => x.id === key.slice(2)).building.playerId);
      const pieces = isle.pieces.children.map((o) => {
        const col = o.geometry.attributes.color;
        const hasInk = (hex) => {
          const [r, g, b] = lin(hex);
          for (let i = 0; i < col.count; i++) if (Math.abs(col.getX(i) - r) < 0.002 && Math.abs(col.getY(i) - g) < 0.002 && Math.abs(col.getZ(i) - b) < 0.002) return true;
          return false;
        };
        return { kind: o.userData.piece, owner: owner(o.userData.key), mark: o.userData.mark, mesh: o.isMesh && o.children.length === 0, inks: Object.fromEntries(Object.entries(inks).map(([k, hex]) => [k, hasInk(hex)])) };
      });
      const want = st.edges.filter((e) => e.path).length + st.vertices.filter((x) => x.building).length;
      const vertices = isle.pieces.children.reduce((n, o) => n + o.geometry.attributes.position.count, 0);
      return { pieces, want, vertices };
    }, RIM);
    const inkOf = (id) => SEAT_MARKS[players.find((p) => p.id === id).color].ink;
    const bad = board.pieces.filter((p) => p.mark !== expect[p.owner] || !p.mesh || !p.inks[Object.keys(RIM).find((k) => RIM[k] === inkOf(p.owner))]);
    check(`${v.tag}: ${board.pieces.length} pieces drawn for ${board.want} placed, one mesh each`, board.pieces.length === board.want && board.pieces.every((p) => p.mesh));
    for (const kind of ["path", "outpost", "stronghold"]) {
      const of = board.pieces.filter((p) => p.kind === kind);
      const seats = new Set(of.map((p) => p.owner));
      check(`${v.tag}: every ${kind} (${of.length}, ${seats.size} seats) carries its seat's mark and ink`, of.length > 0 && seats.size === 4 && !bad.some((p) => p.kind === kind), bad.filter((p) => p.kind === kind).slice(0, 3));
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
