// The end of a game as one sheet (docs/design/end-of-game, slice 2; owner 2026-11-12, q1563-results-desktop and
// q1563-play-again). A real practice game, played to its end by the real rules and bots, at 390x844 and 844x390 (touch)
// and 1280x720 (mouse):
// - the win screen is one sheet at the bottom of the screen, inside the viewport, with no wash over the island; on the
//   upright phone and the desktop the island keeps the room above it (the sheet is at most 60% of the height), and the
//   tray does not show behind it;
// - the headline is "<winner> wins", 30 px or more on a tall screen; no visible text in the sheet is under 12 px;
// - one row per player on every size, the winner first, each a button at least 44 px high whose total is totalVP; there
//   is no table and no "Tap a player" hint; a row opens its breakdown inside the viewport, and one row is open at a time;
// - the buttons are Hide scores, Menu and Play again, each at least 44 px, on one row; Play again is the only primary;
// - Hide scores leaves the chip (Show scores, Play again, Menu, each 44 px) and Show scores brings the sheet back;
// - Play again deals a new practice game: same seats and bots, the roll-off, a fresh log, and no win screen;
// - Menu goes to the title;
// - hotseat: Play again is the one primary button and deals the next game; nothing reads "Back to menu";
// - zero page errors.
// Every failure is listed before the run fails. SHOTS=1 also writes real-game PNGs at device scale 2 into
// docs/proofs/win-screen/ for 430x932, 390x844, 844x390 and 1280x720: win, win-open and win-hidden.
// Run: npm run win-sheet-prove
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { chooseBotAction, logBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, totalVP } from "../src/lib/game/rules.ts";

const STEP_MS = 30_000;
const SHOTS = process.env.SHOTS === "1";
const SHOT_DIR = "docs/proofs/win-screen";
const VIEWS = [
  { tag: "390x844", width: 390, height: 844, touch: true, full: true, tall: true },
  { tag: "844x390", width: 844, height: 390, touch: true, full: true },
  { tag: "1280x720", width: 1280, height: 720, full: true, tall: true },
  { tag: "430x932", width: 430, height: 932, touch: true, tall: true },
];
// The tray's primary fill (#1f3d3b).
const INK = "rgb(31, 61, 59)";

// One whole practice game: Ember and three bots, the bots' moves logged as the store logs them. Ember wins it, with a
// hidden point or an award in the score so an opened row has something to say.
function play() {
  for (let n = 0; n < 400; n++) {
    let s = createGame({ humans: [{ name: "Ember" }], bots: 3, seed: 11 + n });
    for (let step = 0; s.phase !== "over" && step < 20000; step++) {
      const pid = s.phase === "discard" ? Object.keys(s.discardNeeded)[0] : s.current;
      const action = chooseBotAction(s, pid);
      const next = applyAction(s, pid, action).state;
      s = pid === "p0" ? next : logBotAction(s, next, action, pid, s.players.find((p) => p.id === pid).name.replace(/ \(bot\)$/i, ""));
    }
    if (s.phase === "over" && s.winner === "p0" && new Set(s.players.map((p) => totalVP(s, p.id))).size >= 3) return s;
  }
  throw new Error("no game ended with Ember winning");
}

const over = play();
const want = [...over.players].map((p) => ({ id: p.id, name: p.name, total: totalVP(over, p.id) })).sort((a, b) => Number(b.id === over.winner) - Number(a.id === over.winner) || b.total - a.total);
if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const PORT = vite.httpServer.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const failures = [];
const check = (ok, msg) => {
  if (!ok) {
    failures.push(msg);
    console.log(`FAIL ${msg}`);
  }
  return ok;
};
let code = 0;

const readSheet = (page) =>
  page.evaluate(() => {
    const screen = document.querySelector('[data-testid="win-screen"]');
    const sheet = screen.firstElementChild;
    const r = sheet.getBoundingClientRect();
    const seen = (n) => {
      const b = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      return b.width > 1 && b.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && !n.closest(".sr-only,[hidden]");
    };
    const small = [];
    for (const n of sheet.querySelectorAll("*")) {
      const text = [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent.trim()).join("");
      if (!text || !seen(n)) continue;
      const size = parseFloat(getComputedStyle(n).fontSize);
      if (size < 12) small.push(`${text.slice(0, 24)} ${size}px`);
    }
    const head = sheet.querySelector('[data-testid="win-headline"]');
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return { w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10, top: Math.round(b.top), left: b.left, right: b.right, bottom: b.bottom };
    };
    const wrap = sheet.querySelector('[data-testid="win-table-wrap"]');
    return {
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      wash: getComputedStyle(screen).backgroundColor,
      headline: head.textContent.trim(),
      headSize: parseFloat(getComputedStyle(head).fontSize),
      how: sheet.querySelector('[data-testid="win-action"]').textContent.trim(),
      small,
      tables: document.querySelectorAll("table").length,
      text: sheet.textContent,
      rows: [...wrap.querySelectorAll('[data-testid="win-row"]')].map((el) => ({ id: el.dataset.player, button: el.tagName === "BUTTON", open: el.getAttribute("aria-expanded") === "true", total: Number(el.querySelector('[data-testid="win-total"]').textContent), ...box(el) })),
      wide: wrap.scrollWidth > wrap.clientWidth + 1,
      buttons: [...sheet.querySelectorAll("button")].filter((b) => !b.closest('[data-testid="win-table-wrap"]') && seen(b)).map((b) => ({ label: b.textContent.trim(), bg: getComputedStyle(b).backgroundColor, ...box(b) })),
    };
  });

try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch, deviceScaleFactor: SHOTS ? 2 : 1 });
    await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
    const page = await ctx.newPage();
    page.setDefaultTimeout(STEP_MS);
    page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag}: ${m.text()}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0);
    const tag = v.tag;
    const press = (loc) => (v.touch ? loc.tap() : loc.click());
    const settle = () => page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r)); });
    const shot = async (name) => {
      if (!SHOTS) return;
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${SHOT_DIR}/${name}-${tag}.png` });
    };
    // The store deals a practice game; the finished game takes its place, and the bots stay still.
    const load = () =>
      page.evaluate((g) => {
        const e = window.__emberisle;
        e.getState().startAi();
        const at = Date.now();
        e.setState({ runBots: () => {}, state: g, gameLog: g.log.map((text) => ({ at, text })) });
      }, over);

    await load();
    await page.getByTestId("win-menu").waitFor();
    await page.locator('[data-testid="win-table-wrap"] button[data-testid="win-row"]').first().waitFor();
    await settle();
    let s = await readSheet(page);
    let at = `${tag} win`;
    const r = s.rect;
    check(r.left >= 0 && r.top >= 0 && r.right <= v.width && r.bottom <= v.height, `${at}: the sheet ${JSON.stringify(r)} leaves the viewport`);
    check(Math.abs(v.height - r.bottom) <= 16, `${at}: the sheet sits at the bottom (its bottom is ${r.bottom} of ${v.height})`);
    check(s.wash === "rgba(0, 0, 0, 0)", `${at}: the island is washed with ${s.wash}`);
    const tray = await page.evaluate(() => { const t = document.querySelector("[data-hud-stack]"); return t ? getComputedStyle(t).visibility : "none"; });
    check(tray !== "visible", `${at}: the tray still shows behind the sheet (${tray})`);
    if (v.tall) check(r.bottom - r.top <= v.height * 0.6, `${at}: the sheet is ${Math.round(r.bottom - r.top)} px of ${v.height}, over 60%`);
    check(s.headline === "Ember wins", `${at}: the headline reads "${s.headline}"`);
    if (v.tall) check(s.headSize >= 30, `${at}: the headline is ${s.headSize} px, under 30`);
    check(/ · \d+ points, target \d+\.$/.test(s.how), `${at}: the line under it reads "${s.how}"`);
    check(s.small.length === 0, `${at}: text under 12 px: ${s.small.join("; ")}`);
    check(s.tables === 0 && !/Tap a player|Back to menu/.test(s.text), `${at}: a table, the hint or "Back to menu" is still on screen`);
    check(JSON.stringify(s.rows.map((x) => [x.id, x.total])) === JSON.stringify(want.map((x) => [x.id, x.total])), `${at}: the rows are ${JSON.stringify(s.rows.map((x) => [x.id, x.total]))}, want ${JSON.stringify(want.map((x) => [x.id, x.total]))}`);
    check(s.rows.every((x) => x.button && x.h >= 44 && x.top >= r.top && x.bottom <= r.bottom + 0.5 && !x.open), `${at}: each row is a closed button, 44 px or more, inside the sheet ${JSON.stringify(s.rows)}`);
    check(!s.wide, `${at}: the list scrolls sideways`);
    check(JSON.stringify(s.buttons.map((b) => b.label)) === JSON.stringify(["Hide scores", "Menu", "Play again"]), `${at}: the buttons are ${JSON.stringify(s.buttons.map((b) => b.label))}`);
    check(s.buttons.every((b) => b.w >= 44 && b.h >= 44) && new Set(s.buttons.map((b) => b.top)).size === 1, `${at}: three buttons of 44 px or more on one row ${JSON.stringify(s.buttons)}`);
    check(JSON.stringify(s.buttons.filter((b) => b.bg === INK).map((b) => b.label)) === JSON.stringify(["Play again"]), `${at}: the primary buttons are ${JSON.stringify(s.buttons.filter((b) => b.bg === INK).map((b) => b.label))}, want Play again alone (${JSON.stringify(s.buttons.map((b) => b.bg))})`);
    await shot("win");

    // A row opens its breakdown inside the viewport; opening another closes it.
    const rows = page.locator('[data-testid="win-table-wrap"] button[data-testid="win-row"]');
    await press(rows.nth(0));
    await settle();
    const opened = await page.evaluate((id) => {
      const part = document.getElementById(`win-part-${id}`);
      const b = part.getBoundingClientRect();
      const wrap = document.querySelector('[data-testid="win-table-wrap"]').getBoundingClientRect();
      const sheet = document.querySelector('[data-testid="win-screen"]').firstElementChild.getBoundingClientRect();
      return { hidden: part.hidden, lines: [...part.querySelectorAll("dt")].map((d) => d.textContent), top: b.top, bottom: Math.min(b.bottom, wrap.bottom), sheetTop: sheet.top, sheetBottom: sheet.bottom, open: [...document.querySelectorAll('[data-testid="win-row"][aria-expanded="true"]')].length };
    }, want[0].id);
    at = `${tag} a row opened`;
    check(!opened.hidden && opened.open === 1 && JSON.stringify(opened.lines) === JSON.stringify(["Outposts", "Strongholds", "Longest path", "Largest army", "Hidden points", "Total"]), `${at}: the breakdown shows ${JSON.stringify(opened)}`);
    check(opened.sheetTop >= 0 && opened.sheetBottom <= v.height && opened.top >= 0, `${at}: the opened sheet leaves the viewport ${JSON.stringify(opened)}`);
    s = await readSheet(page);
    check(s.buttons.every((b) => b.bottom <= v.height && b.h >= 44) && s.buttons.length === 3, `${at}: the three buttons stay on screen ${JSON.stringify(s.buttons)}`);
    await shot("win-open");
    if (v.full) {
      await press(rows.nth(1));
      await settle();
      const now = await page.evaluate(() => [...document.querySelectorAll('[data-testid="win-row"][aria-expanded="true"]')].map((el) => el.dataset.player));
      check(JSON.stringify(now) === JSON.stringify([want[1].id]), `${at}: after the second row is pressed the open rows are ${JSON.stringify(now)}`);
    }

    // Hide scores leaves the chip; Show scores brings the sheet back.
    await press(page.getByTestId("win-look"));
    await page.getByTestId("win-show").waitFor();
    await settle();
    const chip = await page.getByTestId("win-chip").evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { fits: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, buttons: [...el.querySelectorAll("button")].map((x) => ({ label: x.textContent.trim(), w: x.offsetWidth, h: x.offsetHeight, size: parseFloat(getComputedStyle(x).fontSize) })), sheet: !!document.querySelector('[data-testid="win-screen"]') };
    });
    at = `${tag} scores hidden`;
    check(!chip.sheet && chip.fits && JSON.stringify(chip.buttons.map((b) => b.label)) === JSON.stringify(["Show scores", "Play again", "Menu"]), `${at}: the chip is ${JSON.stringify(chip)}`);
    check(chip.buttons.every((b) => b.w >= 44 && b.h >= 44 && b.size >= 12), `${at}: a chip button is under 44 px or 12 px ${JSON.stringify(chip.buttons)}`);
    await shot("win-hidden");
    if (!v.full) {
      await ctx.close();
      continue;
    }
    await press(page.getByTestId("win-show"));
    await page.getByTestId("win-menu").waitFor();

    // Play again deals a new practice game.
    await press(page.getByTestId("win-again"));
    await page.getByTestId("win-screen").waitFor({ state: "detached" });
    const next = await page.evaluate(() => {
      const st = window.__emberisle.getState();
      return { screen: st.screen, mode: st.mode, phase: st.state.phase, turn: st.state.turn, names: st.state.players.map((p) => p.name), kinds: st.state.players.map((p) => p.kind), built: st.state.vertices.filter((x) => x.building).length, log: st.gameLog.length, logOver: st.gameLog.some((l) => / claims the isle /.test(l.text)), winner: st.state.winner ?? null, chip: !!document.querySelector('[data-testid="win-chip"]') };
    });
    at = `${tag} Play again`;
    check(next.screen === "play" && next.mode === "ai" && next.phase === "rollOff" && next.built === 0 && next.winner === null && !next.chip, `${at}: a new practice game at its roll-off ${JSON.stringify(next)}`);
    check(JSON.stringify([...next.names].sort()) === JSON.stringify(over.players.map((p) => p.name).sort()) && next.kinds.filter((k) => k === "bot").length === 3, `${at}: the same four seats, three of them bots ${JSON.stringify(next.names)}`);
    check(next.log > 0 && next.log < 10 && !next.logOver, `${at}: the log starts again (${next.log} lines)`);

    // Menu goes to the title.
    await load();
    await page.getByTestId("win-menu").waitFor();
    const focused = await page.evaluate(() => document.activeElement?.dataset.testid);
    check(focused === "win-menu", `${tag}: the sheet opens with the focus on ${focused}, want Menu`);
    await press(page.getByTestId("win-menu"));
    await page.waitForFunction(() => window.__emberisle.getState().screen === "title");

    // Hotseat: Play again is the one primary button and deals the next game.
    await page.evaluate((g) => {
      const e = window.__emberisle;
      e.getState().startHotseat(4);
      const st = e.getState().state;
      // The finished board under the hotseat table's own four people.
      e.setState({ state: { ...g, players: g.players.map((p, i) => ({ ...p, kind: "human", name: st.players[i].name })) } });
    }, over);
    await page.getByTestId("win-again").waitFor();
    await settle();
    s = await readSheet(page);
    at = `${tag} hotseat`;
    check(JSON.stringify(s.buttons.map((b) => b.label)) === JSON.stringify(["Hide scores", "Menu", "Play again"]) && JSON.stringify(s.buttons.filter((b) => b.bg === INK).map((b) => b.label)) === JSON.stringify(["Play again"]), `${at}: the buttons are ${JSON.stringify(s.buttons.map((b) => [b.label, b.bg]))}`);
    check(s.rows.length === 4 && s.tables === 0, `${at}: four rows and no table`);
    await press(page.getByTestId("win-again"));
    await page.getByTestId("win-screen").waitFor({ state: "detached" });
    const again = await page.evaluate(() => { const st = window.__emberisle.getState(); return { mode: st.mode, phase: st.state.phase, first: st.state.players[0].name }; });
    check(again.mode === "hotseat" && again.phase !== "over", `${at}: Play again deals the next hotseat game ${JSON.stringify(again)}`);
    console.log(`${tag}: the win sheet read closed, opened and hidden; Play again dealt a practice game and a hotseat game; Menu reached the title`);
    await ctx.close();
  }
  check(errors.length === 0, `page errors:\n${errors.join("\n")}`);
  if (failures.length) throw new Error(`${failures.length} check(s) failed`);
  console.log(`win-sheet-prove: ok${SHOTS ? `, pictures in ${SHOT_DIR}` : ""}`);
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
