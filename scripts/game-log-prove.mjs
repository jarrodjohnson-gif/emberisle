// The Game log sheet (docs/design/end-of-game, slice 1). A real practice game, played by the real rules and bots to a
// mid-game table and on to its end, at 390x844 and 844x390 (touch) and 1280x720:
// - the Table menu has a "Game log" row, at least 44 px high; pressing it closes the menu and opens the sheet;
// - the sheet lies inside the viewport, Close is at least 44 px, and no visible text in it is under 12 px;
// - the turns are listed oldest first, like the online chat (#1601), and together they hold every line of the store's log: each "<name>'s turn." is a
//   heading, each "<name> rolled <sum>!" is that heading's number (a roll with no heading of its own, the game's first,
//   opens one), and every other line is shown once, in order,
//   in the log's own words;
// - a roll's gains are one line per seat, without the "— <name>'s roll" the heading already says; a short bank keeps its line;
// - a 6 or an 8 is red, this seat's own turn is green, and a line that starts with this seat's name is ink, the rest quiet;
// - the list opens scrolled to the newest turn at the bottom, and scrolls up to the oldest turn, which stays inside the sheet;
// - a move made while the sheet is open (End turn, through the store) adds the next seat's turn at the bottom, in view;
// - Escape, Close and a tap on the backdrop each close it, and the focus goes back to the Table menu button;
// - each state: a new game (one "Setup" group), mid-game with a full log ("Earlier"), and the finished game, opened
//   from the menu after Hide scores, with the winning line in the newest (last) turn;
// - with a build armed, one Escape closes the log and leaves the build armed; the next one disarms;
// - hotseat has the row too, and the green turn there is the seat whose turn it is now; a log chunk that cannot load leaves
//   the table and its menu working, with the focus back on the menu button;
// - a real practice game played in the page, its bots moved and logged by the store's own runBots: every
//   "Bot passed for <seat>; <next>'s turn." line is the next seat's heading, and no heading is anything but one seat's name;
// - online through a real host (server/host.mjs): a seat's sheet and a watcher's sheet both match their own store's log;
//   the seat's own turns are green, and a watcher has no green turn and no ink line;
// - zero page errors.
// Every failure is listed before the run fails. SHOTS=1 also writes real-game PNGs at device scale 2 into
// docs/proofs/end-of-game/ for 430x932, 390x844, 844x390 and 1280x720: menu, log, log-end, log-setup and log-over; and
// log-practice (390x844, the real-bots game), log-online and log-watcher (1280x720).
// Run: npm run game-log-prove
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { chooseBotAction, logBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { connectTable } from "../src/lib/net/table.ts";

const STEP_MS = 30_000;
const SHOTS = process.env.SHOTS === "1";
const SHOT_DIR = "docs/proofs/end-of-game";
const VIEWS = [
  { tag: "390x844", width: 390, height: 844, touch: true, full: true },
  { tag: "844x390", width: 844, height: 390, touch: true, full: true },
  { tag: "1280x720", width: 1280, height: 720, full: true },
  { tag: "430x932", width: 430, height: 932, touch: true },
];

// One whole practice game: Ember and three bots, every seat moved by the bot brain, the bots' moves logged as the store
// logs them. `mid` is Ember's main turn with the
// log full (200 lines) and both a red roll and one of Ember's own turns in it; `over` is the end.
function play() {
  for (let n = 0; n < 200; n++) {
    let s = createGame({ humans: [{ name: "Ember" }], bots: 3, seed: 11 + n });
    let mid = null;
    for (let step = 0; s.phase !== "over" && step < 20000; step++) {
      const pid = s.phase === "discard" ? Object.keys(s.discardNeeded)[0] : s.current;
      const action = chooseBotAction(s, pid);
      const next = applyAction(s, pid, action).state;
      // The store's runBots logs a bot's move through logBotAction, under the seat's name without "(bot)".
      s = pid === "p0" ? next : logBotAction(s, next, action, pid, s.players.find((p) => p.id === pid).name.replace(/ \(bot\)$/i, ""));
      if (!mid && s.log.length === 200 && s.phase === "main" && s.current === "p0" && !/'s turn\.$| rolled \d+!$/.test(s.log[0]) && s.log.some((l) => l.startsWith("Bot passed for ")) && s.log.some((l) => / rolled [68]!$/.test(l)) && s.log.filter((l) => l.endsWith("Ember's turn.")).length > 1) mid = structuredClone(s);
    }
    if (mid && s.phase === "over") return { mid, over: s };
  }
  throw new Error("no game reached a full log on Ember's turn");
}

// The proof's own reading of a log: the same three rules the sheet states, written apart from GameLog.tsx.
function expected(lines) {
  const groups = [{ name: "", sum: null, lines: [] }];
  for (const text of lines) {
    const g = groups.at(-1);
    // A bot's pass reads "Bot passed for <seat>; <next>'s turn." (ai.ts): the heading is the next seat.
    const turn = text.match(/^(?:Bot passed for [^;]+; )?(.+)'s turn\.$/);
    const roll = text.match(/^(.+) rolled (\d+)!$/);
    if (turn) groups.push({ name: turn[1], sum: null, lines: [] });
    else if (roll && g.name === roll[1] && g.sum === null) g.sum = Number(roll[2]);
    // The game's first turn has no turn line (and a full log may have dropped one): the roll opens that seat's turn.
    else if (roll) groups.push({ name: roll[1], sum: Number(roll[2]), lines: [] });
    else {
      // A roll's gain line, "<gains; gains> — <name>'s roll<; the bank is short …>.", is one line per seat's gain, then the bank's.
      const at = g.name ? text.indexOf(` — ${g.name}'s roll`) : -1;
      if (at === -1) g.lines.push(text);
      else {
        for (const gain of text.slice(0, at).split("; ")) g.lines.push(`${gain}.`);
        const rest = text.slice(at + ` — ${g.name}'s roll`.length);
        if (rest !== ".") g.lines.push(`T${rest.slice("; t".length)}`);
      }
    }
  }
  return groups.filter((g) => g.name || g.lines.length);
}

const { mid, over } = play();
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
    const el = document.querySelector('[data-testid="game-log"]');
    const r = el.getBoundingClientRect();
    const seen = (n) => {
      const b = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      return b.width > 1 && b.height > 1 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const small = [];
    for (const n of el.querySelectorAll("*")) {
      const text = [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent.trim()).join("");
      if (!text || !seen(n)) continue;
      const size = parseFloat(getComputedStyle(n).fontSize);
      if (size < 12) small.push(`${text.slice(0, 24)} ${size}px`);
    }
    const list = el.querySelector("ol");
    const close = el.querySelector('button[aria-label="Close"]').getBoundingClientRect();
    return {
      // The store's log, read in the same task as the sheet, so a table that plays on cannot slip a line between them.
      store: window.__emberisle.getState().gameLog.map((l) => l.text),
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      title: el.querySelector("h2").textContent.trim(),
      close: { w: close.width, h: close.height },
      small,
      scroll: { top: list.scrollTop, height: list.scrollHeight, client: list.clientHeight },
      wide: list.scrollWidth > list.clientWidth + 1,
      // #1601: the newest turn is the list's last; it is in view when its bottom shows inside the list's box.
      newest: (() => {
        const t = list.lastElementChild?.getBoundingClientRect();
        const b = list.getBoundingClientRect();
        return t ? { inView: t.bottom <= b.bottom + 0.5 && t.bottom > b.top, bottom: t.bottom, listTop: b.top, listBottom: b.bottom } : null;
      })(),
      turns: [...el.querySelectorAll('[data-testid="gl-turn"]')].map((t) => {
        const roll = t.querySelector('[data-testid="gl-roll"]');
        const head = t.querySelector("b");
        return {
          name: head.textContent.trim(),
          dot: !!t.querySelector("div > span[aria-hidden]"),
          sum: roll ? Number(roll.textContent) : null,
          rollColor: roll ? getComputedStyle(roll).color : null,
          nameColor: getComputedStyle(head).color,
          lines: [...t.querySelectorAll('[data-testid="gl-line"]')].map((p) => p.textContent),
          ink: [...t.querySelectorAll('[data-testid="gl-line"]')].filter((p) => getComputedStyle(p).color === "rgb(31, 51, 49)").map((p) => p.textContent),
        };
      }),
    };
  });

// The sheet against the store's log, read in one task (readSheet). No heading may be a sentence, and each seat's has its dot.
const sameAsStore = (s, at) => {
  const want = expected(s.store);
  const got = s.turns.map((t) => ({ name: t.name, sum: t.sum, lines: t.lines }));
  const named = want.map((g) => ({ ...g, name: g.name || s.turns[0].name }));
  check(JSON.stringify(got) === JSON.stringify(named), `${at}: the sheet's ${got.length} turns are not the store's log read oldest first (${named.length} turns)`);
  const odd = s.turns.filter((t, i) => /Bot passed|;|'s turn/.test(t.name) || (!t.dot && !(i === 0 && /^(Setup|Earlier)$/.test(t.name))));
  check(odd.length === 0, `${at}: a heading is not one seat's name with its dot: ${JSON.stringify(odd.map((t) => t.name))}`);
  return want;
};

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
    const menuButton = page.getByRole("button", { name: "Table menu" });
    const sheet = page.getByTestId("game-log");
    // The other seats stay still, so the log holds while it is read.
    const load = (g) =>
      page.evaluate((g) => {
        const e = window.__emberisle;
        const at = Date.now();
        e.setState({ runBots: () => {}, state: g, gameLog: g.log.map((text) => ({ at, text })), buildMode: "none", error: null, banner: null, toast: null });
      }, g);
    const openLog = async (picture) => {
      await press(menuButton);
      const row = page.getByTestId("log-entry");
      await row.waitFor();
      const box = await row.boundingBox();
      check(box.height >= 44 && box.width >= 44, `${tag}: the Game log row is ${box.width}x${box.height}, under 44 px`);
      check((await row.textContent()).trim() === "Game log", `${tag}: the row reads "${(await row.textContent()).trim()}"`);
      if (picture) await shot(picture);
      await press(row);
      await sheet.waitFor();
      check((await page.getByTestId("table-menu").count()) === 0, `${tag}: the menu closes behind the sheet`);
      await settle();
    };
    const sizeRules = (s, at) => {
      const r = s.rect;
      check(r.left >= 0 && r.top >= 0 && r.right <= v.width && r.bottom <= v.height, `${at}: the sheet ${JSON.stringify(r)} leaves the ${tag} viewport`);
      check(s.close.w >= 44 && s.close.h >= 44, `${at}: Close is ${s.close.w}x${s.close.h}`);
      check(s.small.length === 0, `${at}: text under 12 px: ${s.small.join("; ")}`);
      check(!s.wide, `${at}: the list scrolls sideways`);
      check(s.title === "Game log", `${at}: the title reads "${s.title}"`);
    };

    // 1. A new practice game: the store deals it and the log has no turn yet.
    await page.evaluate(() => {
      window.__emberisle.setState({ runBots: () => {} });
      window.__emberisle.getState().startAi();
    });
    await menuButton.waitFor();
    await openLog();
    let s = await readSheet(page);
    let at = `${tag} new game`;
    sameAsStore(s, at);
    check(s.turns.length === 1 && s.turns[0].name === "Setup" && !s.turns[0].dot && s.turns[0].sum === null && s.turns[0].lines.length > 0, `${at}: one Setup group with lines and no number ${JSON.stringify(s.turns)}`);
    sizeRules(s, at);
    await shot("log-setup");
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "detached" });

    // 2. Mid-game, Ember's main turn, the log full.
    await load(mid);
    await page.getByTestId("build-open").waitFor();
    await settle();
    await openLog("menu");
    s = await readSheet(page);
    at = `${tag} mid-game`;
    const want = sameAsStore(s, at);
    sizeRules(s, at);
    check(s.turns.every((t) => !t.lines.some((l) => / rolled \d+!$/.test(l))), `${at}: no roll is left as a plain line`);
    check(s.turns.at(-1).name === "Ember", `${at}: the newest turn, at the bottom, is ${s.turns.at(-1).name}, want Ember`);
    check(s.turns[0].name === "Earlier" && !s.turns[0].dot, `${at}: a full log's oldest lines, at the top, sit under "${s.turns[0].name}", want Earlier`);
    check(s.turns.slice(1).every((t) => t.dot), `${at}: every seat's turn has its colour dot`);
    const hot = s.turns.filter((t) => t.sum === 6 || t.sum === 8);
    const cool = s.turns.filter((t) => t.sum && t.sum !== 6 && t.sum !== 8 && t.name !== "Ember");
    const own = s.turns.filter((t) => t.name === "Ember");
    check(hot.length > 0 && hot.every((t) => t.rollColor === "rgb(179, 38, 30)"), `${at}: a 6 or 8 is red ${JSON.stringify(hot.map((t) => t.rollColor))}`);
    check(cool.length > 0 && cool.every((t) => t.rollColor === "rgb(31, 51, 49)" && t.nameColor === "rgb(31, 51, 49)"), `${at}: another seat's roll is ink ${JSON.stringify(cool[0])}`);
    check(own.length > 1 && own.every((t) => t.nameColor === "rgb(16, 86, 42)"), `${at}: this seat's own turns are green ${JSON.stringify(own.map((t) => t.nameColor))}`);
    const lines = s.turns.flatMap((t) => t.lines);
    const ink = s.turns.flatMap((t) => t.ink);
    check(ink.length > 0 && JSON.stringify(ink) === JSON.stringify(lines.filter((l) => l.startsWith("Ember "))), `${at}: the lines that start with this seat's name, and only those, are ink ${JSON.stringify(ink.slice(0, 3))}`);
    check(lines.some((l) => / gains \d+ \w+\.$/.test(l)) && !s.turns.some((t) => t.lines.some((l) => l.includes(` — ${t.name}'s roll`))), `${at}: each roll gain is its own line and none repeats its heading's roll`);
    check(s.scroll.top + s.scroll.client >= s.scroll.height - 1 && s.scroll.height > s.scroll.client, `${at}: the list opens scrolled to the newest turn at the bottom, and scrolls ${JSON.stringify(s.scroll)}`);
    check(s.newest?.inView, `${at}: the sheet opens with the newest turn in view ${JSON.stringify(s.newest)}`);
    const passes = s.store.filter((l) => l.startsWith("Bot passed for ")).length;
    check(s.store.length === 200 && passes > 0, `${at}: the store's log is full at 200 lines, ${passes} of them a bot's pass`);
    check(s.turns.filter((t) => t.sum !== null).length >= s.turns.length - 2, `${at}: every turn but the open one and the oldest group has its roll ${JSON.stringify(s.turns.filter((t) => t.sum === null).map((t) => t.name))}`);
    await shot("log");

    // The oldest turn is reached by scrolling up and stays inside the sheet.
    const last = await sheet.evaluate((el) => {
      const list = el.querySelector("ol");
      list.scrollTop = 0;
      const r = list.firstElementChild.getBoundingClientRect();
      const b = list.getBoundingClientRect();
      return { inside: r.top >= b.top - 0.5 && r.left >= b.left && r.right <= b.right, top: r.top, list: b.top };
    });
    check(last.inside, `${at}: scrolled up, the oldest group is not inside the sheet ${JSON.stringify(last)}`);
    await shot("log-end");
    await sheet.evaluate((el) => { const list = el.querySelector("ol"); list.scrollTop = list.scrollHeight; });
    if (v.tag === "390x844") {
      // The phone turns with the sheet open (390x844 to 844x390 and back): the newest turn stays in view at the bottom.
      for (const [w, h] of [[844, 390], [390, 844]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r)); });
        const turned = await readSheet(page);
        check(turned.newest?.inView && turned.scroll.top + turned.scroll.client >= turned.scroll.height - 1, `${at}: turned to ${w}x${h} with the sheet open, the newest turn left the view ${JSON.stringify({ newest: turned.newest, scroll: turned.scroll })}`);
      }
    }

    if (v.full) {
      // One Escape closes one thing: with a build armed the log closes and the build stays armed; the next Escape disarms.
      await page.evaluate(() => {
        window.__emberisle.getState().setBuildMode("path");
      });
      await page.keyboard.press("Escape");
      await sheet.waitFor({ state: "detached" });
      let armed = await page.evaluate(() => window.__emberisle.getState().buildMode);
      check(armed === "path", `${tag}: Escape on the log with a path armed leaves the build ${armed}, want it still armed`);
      await page.keyboard.press("Escape");
      armed = await page.evaluate(() => window.__emberisle.getState().buildMode);
      check(armed === "none", `${tag}: the second Escape disarms (${armed})`);
      await openLog();

      // 3. A move while the sheet is open: Ember ends the turn through the store, and the next seat's turn is added at the bottom.
      await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "endTurn" }));
      await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="gl-turn"] b')].at(-1)?.textContent !== "Ember");
      s = await readSheet(page);
      at = `${tag} after End turn`;
      sameAsStore(s, at);
      const next = await page.evaluate(() => { const g = window.__emberisle.getState().state; return g.players.find((p) => p.id === g.current).name; });
      check(s.newest?.inView && s.scroll.top + s.scroll.client >= s.scroll.height - 1, `${at}: the list stays at the bottom and the new turn is in view ${JSON.stringify({ newest: s.newest, scroll: s.scroll })}`);
      check(s.turns.at(-1).name === next && s.turns.at(-2).name === "Ember", `${at}: the last turns are ${s.turns.at(-2).name}, ${s.turns.at(-1).name}; want Ember, ${next}`);

      // 4. Escape, Close and the backdrop each close it; the focus goes back to the menu button.
      for (const how of ["Escape", "Close", "backdrop"]) {
        if (how !== "Escape") await openLog();
        const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
        check(focused === "Close", `${tag}: the sheet opens with the focus on ${focused}, want Close`);
        if (how === "Escape") await page.keyboard.press("Escape");
        else if (how === "Close") await press(sheet.getByRole("button", { name: "Close" }));
        else if (v.touch) await page.touchscreen.tap(v.width / 2, 8);
        else await page.mouse.click(v.width / 2, 8);
        await sheet.waitFor({ state: "detached" });
        const focus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
        check(focus === "Table menu", `${tag}: ${how} closes the sheet with the focus on ${focus}, want the Table menu button`);
        check((await page.getByTestId("table-menu").count()) === 0, `${tag}: after ${how} the menu stays closed`);
      }

      // 5. The finished game: the log opens from the menu once the scores are hidden.
      await load(over);
      await press(page.getByTestId("win-look"));
      await page.getByTestId("win-show").waitFor();
      await openLog();
      s = await readSheet(page);
      at = `${tag} game over`;
      sameAsStore(s, at);
      sizeRules(s, at);
      const winner = over.players.find((p) => p.id === over.winner).name;
      check(s.turns.at(-1).name === winner && / claims the isle with \d+ points\.$/.test(s.turns.at(-1).lines.at(-1) ?? ""), `${at}: the newest (last) turn is ${s.turns.at(-1).name} ending "${s.turns.at(-1).lines.at(-1)}"`);
      await shot("log-over");
      await page.keyboard.press("Escape");
      await sheet.waitFor({ state: "detached" });
    }
    console.log(`${tag}: game log read in a new game, mid-game${v.full ? ", after a move, closed three ways, and at game over" : ""}`);
    await ctx.close();
  }

  // 6. Hotseat has the row; a log chunk that cannot load leaves the table and the menu working.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.setDefaultTimeout(STEP_MS);
    page.on("pageerror", (e) => errors.push(`hotseat: ${e}`));
    await page.route(/\/GameLog\.tsx/, (r) => r.abort());
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    const menuButton = page.getByRole("button", { name: "Table menu" });
    await menuButton.tap();
    await page.getByTestId("log-entry").tap();
    await page.getByTestId("table-menu").waitFor({ state: "detached" });
    await page.waitForTimeout(1500);
    check((await page.getByTestId("game-log").count()) === 0, "hotseat, chunk refused: no sheet shows");
    const lost = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName);
    check(lost === "Table menu", `hotseat, chunk refused: the focus is on ${lost}, want the Table menu button`);
    await menuButton.tap();
    check(await page.getByTestId("log-entry").isVisible(), "hotseat, chunk refused: the menu opens again with its Game log row");
    await page.unroute(/\/GameLog\.tsx/);
    // rules.ts's line for a roll the bank cannot pay in full, as the store would hold it.
    const short = ["Ember's turn.", "Ember rolled 9!", "Tide gains 2 wheat; Pine gains 1 wheat — Ember's roll; the bank is short of stone; nobody gains it."];
    await page.evaluate((lines) => window.__emberisle.setState({ gameLog: lines.map((text) => ({ at: 0, text })) }), short);
    await page.getByTestId("log-entry").tap();
    await page.getByTestId("game-log").waitFor();
    const read = await readSheet(page);
    const turns = read.turns.map((t) => ({ name: t.name, sum: t.sum, lines: t.lines }));
    check(JSON.stringify(turns) === JSON.stringify(expected(short)) && JSON.stringify(turns[0]?.lines) === JSON.stringify(["Tide gains 2 wheat.", "Pine gains 1 wheat.", "The bank is short of stone; nobody gains it."]), `hotseat: with the chunk back the next press opens the log, and a short bank keeps its line ${JSON.stringify(turns)}`);
    // Hotseat: this device is every seat, so the green turn is the seat whose turn it is now, not always the first seat.
    const seats = await page.evaluate(() => window.__emberisle.getState().state.players.map((p) => ({ id: p.id, name: p.name })));
    for (const actor of [seats[1], seats[0]]) {
      await page.evaluate(({ seats, actor }) => {
        const e = window.__emberisle;
        e.setState({ state: { ...e.getState().state, current: actor.id }, gameLog: seats.slice(0, 2).flatMap((p) => [`${p.name}'s turn.`, `${p.name} rolled 5!`]).map((text) => ({ at: 0, text })) });
      }, { seats, actor });
      await page.waitForFunction((n) => [...document.querySelectorAll('[data-testid="gl-turn"] b')].some((b) => b.textContent === n && getComputedStyle(b).color === "rgb(16, 86, 42)"), actor.name);
      const green = (await readSheet(page)).turns.filter((t) => t.nameColor === "rgb(16, 86, 42)").map((t) => t.name);
      check(JSON.stringify(green) === JSON.stringify([actor.name]), `hotseat: on ${actor.name}'s turn the green headings are ${JSON.stringify(green)}`);
    }
    console.log("hotseat: the row is there, the seat on turn is the green one, and a refused chunk hands the focus back and is tried again");
    await ctx.close();
  }
  // 7. A real practice game, played in the page: the store deals it, the store's own runBots moves and logs the three
  // bots, and Ember's moves go through dispatch. Read once the bots have passed the turn four times.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: SHOTS ? 2 : 1 });
    await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
    const page = await ctx.newPage();
    page.setDefaultTimeout(STEP_MS);
    page.on("pageerror", (e) => errors.push(`practice: ${e}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`practice: ${m.text()}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0);
    const played = await page.evaluate(async () => {
      const ai = await import("/src/lib/game/ai.ts");
      const store = window.__emberisle;
      store.getState().startAi();
      const passes = () => store.getState().gameLog.filter((l) => l.text.startsWith("Bot passed for ")).length;
      const end = Date.now() + 240_000;
      while (Date.now() < end) {
        const s = store.getState();
        const g = s.state;
        if (g.phase === "over" || (passes() >= 4 && g.phase === "main" && g.current === "p0" && !s.offer)) break;
        // A bot's ask is open: Ember says no, and the bots' own answers end it on the store's clock.
        if (s.offer) {
          if (s.offer.from !== "p0" && !s.declined?.includes?.("p0")) s.answerTrade(false);
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        const mine = g.phase === "discard" ? (g.discardNeeded.p0 ?? 0) > 0 : g.current === "p0";
        if (mine) s.dispatch(ai.chooseBotAction(g, "p0") ?? { type: "endTurn" });
        else s.runBots();
        await new Promise((r) => setTimeout(r, 0));
      }
      // The table stands still while it is read.
      store.setState({ runBots: () => {} });
      const g = store.getState().state;
      return { passes: passes(), phase: g.phase, current: g.current, lines: store.getState().gameLog.length };
    });
    check(played.passes >= 4 && played.phase === "main" && played.current === "p0", `practice, real bots: the game reached Ember's turn after four bot passes ${JSON.stringify(played)}`);
    await page.getByRole("button", { name: "Table menu" }).tap();
    await page.getByTestId("log-entry").tap();
    await page.getByTestId("game-log").waitFor();
    await page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r)); });
    const s = await readSheet(page);
    const at = "practice, real bots";
    const want = sameAsStore(s, at);
    const bots = s.store.filter((l) => l.startsWith("Bot passed for "));
    check(bots.every((l) => s.turns.some((t) => l.endsWith(`; ${t.name}'s turn.`))), `${at}: each "Bot passed for …; <next>'s turn." line is the next seat's heading`);
    check(s.turns.every((t) => !t.lines.some((l) => /'s turn\.$/.test(l))), `${at}: no turn line is left as a plain line`);
    check(s.turns.at(-1).name === "Ember" && s.turns[0].name === "Setup" && want.length === s.turns.length, `${at}: Setup is first and Ember's turn is last ${JSON.stringify(s.turns.map((t) => t.name))}`);
    check(s.turns.filter((t) => t.name === "Ember").every((t) => t.nameColor === "rgb(16, 86, 42)") && s.turns.filter((t) => t.name !== "Ember").every((t) => t.nameColor !== "rgb(16, 86, 42)"), `${at}: only Ember's turns are green`);
    if (SHOTS) {
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${SHOT_DIR}/log-practice-390x844.png` });
    }
    console.log(`practice, real bots: ${s.store.length} log lines, ${bots.length} bot passes, ${s.turns.length} headings, each one seat's name`);
    await ctx.close();
  }

  // 8. Online, through a real host: Ember hosts in a tab, Tide and Pine are table.ts clients, and all three play by the bot brain. Ember's
  // sheet is read as a seat, then a watcher's.
  {
    const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
    // Rooms go to a temp folder, dropped on exit once the host has stopped writing (as watch-ui-prove does).
    process.on("exit", () => {
      host.kill();
      rmSync(ROOMS_DIR, { recursive: true, force: true });
    });
    const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
      cwd: new URL("../server/", import.meta.url),
      env: { ...process.env, PORT: "0", ACT_RATE: "1000", ACT_CAP: "1000", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results` },
    });
    const nodes = [];
    try {
      const hostPort = await new Promise((resolve, reject) => {
        host.stdout.on("data", (d) => {
          const m = String(d).match(/listening (\d+)/);
          if (m) resolve(Number(m[1]));
        });
        host.on("exit", (c) => reject(new Error(`the host stopped with ${c}`)));
      });
      const until = async (get, what, ms = 60_000) => {
        for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 50))) {
          const got = await get();
          if (got) return got;
        }
        throw new Error(`timed out: ${what}`);
      };
      const open = async (name, query, size) => {
        const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: SHOTS ? 2 : 1 });
        await ctx.addInitScript((n) => {
          localStorage.setItem("emberisle-name", n);
          localStorage.setItem("emberisle-first-game-coach", '"done"');
        }, name);
        const page = await ctx.newPage();
        page.setDefaultTimeout(STEP_MS);
        page.on("pageerror", (e) => errors.push(`online ${name}: ${e}`));
        await page.goto(`http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}${query}`);
        await page.waitForFunction(() => window.__emberisle);
        return page;
      };
      // A table.ts client in this process that plays by the bot brain once told to, as watch-ui-prove's third seat does.
      const nodeSeat = () => {
        const p = { state: null, legal: null, you: null, code: null, auto: false, acted: -1, passed: -1 };
        p.step = () => {
          const g = p.state;
          if (!p.auto || !g || g.phase === "over" || !p.legal) return;
          const mine = g.phase === "discard" ? p.legal.discard > 0 : g.current === p.you;
          if (!mine || p.acted === g.seq) return;
          p.acted = g.seq;
          p.t.act(chooseBotAction({ ...g, deck: Array.from({ length: g.deckLeft ?? 0 }) }, p.you) ?? { type: "endTurn" });
        };
        p.t = connectTable(`ws://127.0.0.1:${hostPort}`, {
          welcome: (m) => (p.code = m.code),
          seats: () => {},
          state: (m) => {
            p.state = m.game;
            p.legal = m.legal;
            p.you = m.you;
            p.step();
          },
          chat: () => {},
          error: () => {
            if (p.auto && p.state && p.acted === p.state.seq && p.passed !== p.state.seq) {
              p.passed = p.state.seq;
              p.t.act({ type: "endTurn" });
            }
          },
        });
        nodes.push(p);
        return p;
      };
      const tide = nodeSeat();
      const pine = nodeSeat();
      const ember = await open("Ember", "", { width: 1280, height: 720 });
      await ember.getByRole("button", { name: "Host a table" }).click();
      const code = (await ember.getByTestId("table-code").textContent()).trim();
      tide.t.join(code, { name: "Tide" });
      pine.t.join(code, { name: "Pine" });
      await until(() => tide.code && pine.code, "the two clients' welcomes");
      await until(async () => (await ember.locator("li", { hasText: "Tide" }).count()) === 1 && (await ember.locator("li", { hasText: "Pine" }).count()) === 1, "Ember sees Tide and Pine");
      tide.t.ready(true);
      pine.t.ready(true);
      await ember.getByRole("button", { name: "Ready", exact: true }).click();
      await ember.getByRole("button", { name: "Start" }).click();
      await until(() => ember.evaluate(() => window.__emberisle.getState().screen === "play" && window.__emberisle.getState().state !== null), "the start", 90_000);
      // Ember's tab plays itself, as watch-ui-prove's seats do, until it is told to stop.
      await ember.evaluate(async () => {
        const ai = await import("/src/lib/game/ai.ts");
        const store = window.__emberisle;
        const auto = { acted: -1, passed: -1, errs: store.getState().errorSeq };
        window.__auto = true;
        const step = () => {
          const s = store.getState();
          const g = s.state;
          if (!window.__auto || !g || g.phase === "over" || !s.legal) return;
          const mine = g.phase === "discard" ? s.legal.discard > 0 : g.current === s.localId;
          if (!mine) return;
          if (s.errorSeq !== auto.errs) {
            auto.errs = s.errorSeq;
            if (auto.acted === g.seq) {
              if (auto.passed !== g.seq) {
                auto.passed = g.seq;
                s.dispatch({ type: "endTurn" });
              }
              return;
            }
          }
          if (auto.acted === g.seq) return;
          auto.acted = g.seq;
          s.dispatch(ai.chooseBotAction({ ...g, deck: Array.from({ length: g.deckLeft ?? 0 }) }, s.localId) ?? { type: "endTurn" });
        };
        store.subscribe(step);
        step();
      });
      for (const p of nodes) {
        p.auto = true;
        p.step();
      }
      // Six turns in, both seats stop, and the host's table stands still (its turn clock is 120 s).
      await until(() => ember.evaluate(() => window.__emberisle.getState().gameLog.filter((l) => /'s turn\.$/.test(l.text)).length >= 6 || window.__emberisle.getState().state.phase === "over"), "six online turns", 180_000);
      for (const p of nodes) p.auto = false;
      await ember.evaluate(() => (window.__auto = false));
      let seq = -1;
      await until(async () => {
        const now = await ember.evaluate(() => window.__emberisle.getState().state.seq);
        const still = now === seq;
        seq = now;
        await new Promise((r) => setTimeout(r, 400));
        return still;
      }, "the table standing still");

      const readAs = async (page, who) => {
        await page.getByRole("button", { name: "Table menu" }).click();
        await page.getByTestId("log-entry").click();
        await page.getByTestId("game-log").waitFor();
        await page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r)); });
        const s = await readSheet(page);
        sameAsStore(s, who);
        const r = s.rect;
        check(r.left >= 0 && r.top >= 0 && r.right <= 1280 && r.bottom <= 720 && s.small.length === 0 && s.close.w >= 44 && s.close.h >= 44, `${who}: the sheet fits, Close is 44 px, no text under 12 px ${JSON.stringify([r, s.small, s.close])}`);
        check(s.turns.filter((t) => t.sum !== null).length >= 5 && s.turns.some((t) => t.name === "Ember") && s.turns.some((t) => t.name === "Tide"), `${who}: both seats' turns are listed with their rolls ${JSON.stringify(s.turns.map((t) => [t.name, t.sum]))}`);
        return s;
      };
      const seat = await readAs(ember, "online seat");
      check(seat.turns.filter((t) => t.nameColor === "rgb(16, 86, 42)").every((t) => t.name === "Ember") && seat.turns.some((t) => t.name === "Ember" && t.nameColor === "rgb(16, 86, 42)"), "online seat: Ember's own turns, and only those, are green");
      if (SHOTS) {
        await ember.waitForTimeout(900);
        await ember.screenshot({ path: `${SHOT_DIR}/log-online-1280x720.png` });
      }
      await ember.keyboard.press("Escape");
      await ember.getByTestId("game-log").waitFor({ state: "detached" });

      const watcher = await open("Watcher", `&watch=${code.toLowerCase()}`, { width: 1280, height: 720 });
      await watcher.getByRole("button", { name: "Watch", exact: true }).click();
      await until(() => watcher.evaluate(() => { const s = window.__emberisle.getState(); return s.screen === "play" && s.spectator && s.state !== null; }), "the watcher reaching the board");
      await watcher.getByTestId("watching-badge").first().waitFor();
      const seen = await readAs(watcher, "watcher");
      check(seen.turns.every((t) => t.nameColor !== "rgb(16, 86, 42)") && seen.turns.every((t) => t.ink.length === 0), "watcher: no turn is green and no line is ink, a watcher has no seat");
      if (SHOTS) {
        await watcher.waitForTimeout(900);
        await watcher.screenshot({ path: `${SHOT_DIR}/log-watcher-1280x720.png` });
      }
      await watcher.keyboard.press("Escape");
      await watcher.getByTestId("game-log").waitFor({ state: "detached" });
      check(await watcher.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Table menu"), "watcher: Escape closes the sheet with the focus on the Table menu button");
      console.log(`online: a seat read ${seat.store.length} log lines in ${seat.turns.length} headings, a watcher ${seen.store.length} in ${seen.turns.length}`);
    } finally {
      for (const p of nodes) p.t.close();
      host.kill();
    }
  }
  check(errors.length === 0, `page errors:\n${errors.join("\n")}`);
  if (failures.length) throw new Error(`${failures.length} check(s) failed`);
  console.log(`game-log-prove: ok${SHOTS ? `, pictures in ${SHOT_DIR}` : ""}`);
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
