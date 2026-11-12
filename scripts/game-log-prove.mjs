// The Game log sheet (docs/design/end-of-game, slice 1). A real practice game, played by the real rules and bots to a
// mid-game table and on to its end, at 390x844 and 844x390 (touch) and 1280x720:
// - the Table menu has a "Game log" row, at least 44 px high; pressing it closes the menu and opens the sheet;
// - the sheet lies inside the viewport, Close is at least 44 px, and no visible text in it is under 12 px;
// - the turns are listed newest first, and together they hold every line of the store's log: each "<name>'s turn." is a
//   heading, each "<name> rolled <sum>!" is that heading's number (a roll with no heading of its own, the game's first,
//   opens one), and every other line is shown once, in order,
//   in the log's own words;
// - a roll's gains are one line per seat, without the "— <name>'s roll" the heading already says; a short bank keeps its line;
// - a 6 or an 8 is red, this seat's own turn is green, and a line that starts with this seat's name is ink, the rest quiet;
// - the list scrolls to the oldest turn, which stays inside the sheet;
// - a move made while the sheet is open (End turn, through the store) adds the next seat's turn on top;
// - Escape, Close and a tap on the backdrop each close it, and the focus goes back to the Table menu button;
// - each state: a new game (one "Setup" group), mid-game with a full log ("Earlier"), and the finished game, opened
//   from the menu after Hide scores, with the winning line in the newest turn;
// - hotseat has the row too, and a log chunk that cannot load leaves the table and its menu working;
// - zero page errors.
// Every failure is listed before the run fails. SHOTS=1 also writes real-game PNGs at device scale 2 into
// docs/proofs/end-of-game/ for 430x932, 390x844, 844x390 and 1280x720: menu, log, log-end, log-setup and log-over.
// Run: npm run game-log-prove
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";

const STEP_MS = 30_000;
const SHOTS = process.env.SHOTS === "1";
const SHOT_DIR = "docs/proofs/end-of-game";
const VIEWS = [
  { tag: "390x844", width: 390, height: 844, touch: true, full: true },
  { tag: "844x390", width: 844, height: 390, touch: true, full: true },
  { tag: "1280x720", width: 1280, height: 720, full: true },
  { tag: "430x932", width: 430, height: 932, touch: true },
];

// One whole practice game: Ember and three bots, every seat moved by the bot brain. `mid` is Ember's main turn with the
// log full (200 lines) and both a red roll and one of Ember's own turns in it; `over` is the end.
function play() {
  for (let n = 0; n < 200; n++) {
    let s = createGame({ humans: [{ name: "Ember" }], bots: 3, seed: 11 + n });
    let mid = null;
    for (let step = 0; s.phase !== "over" && step < 20000; step++) {
      const pid = s.phase === "discard" ? Object.keys(s.discardNeeded)[0] : s.current;
      s = applyAction(s, pid, chooseBotAction(s, pid)).state;
      if (!mid && s.log.length === 200 && s.phase === "main" && s.current === "p0" && !/'s turn\.$| rolled \d+!$/.test(s.log[0]) && s.log.some((l) => / rolled [68]!$/.test(l)) && s.log.filter((l) => l === "Ember's turn.").length > 1) mid = structuredClone(s);
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
    const turn = text.match(/^(.+)'s turn\.$/);
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
  return groups.filter((g) => g.name || g.lines.length).reverse();
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
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      title: el.querySelector("h2").textContent.trim(),
      close: { w: close.width, h: close.height },
      small,
      scroll: { top: list.scrollTop, height: list.scrollHeight, client: list.clientHeight },
      wide: list.scrollWidth > list.clientWidth + 1,
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
    const storeLog = () => page.evaluate(() => window.__emberisle.getState().gameLog.map((l) => l.text));
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
    const sameAsStore = async (s, at) => {
      const want = expected(await storeLog());
      const got = s.turns.map((t) => ({ name: t.name, sum: t.sum, lines: t.lines }));
      const named = want.map((g) => ({ ...g, name: g.name || s.turns.at(-1).name }));
      check(JSON.stringify(got) === JSON.stringify(named), `${at}: the sheet's ${got.length} turns are not the store's log read newest first (${named.length} turns)`);
      return want;
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
    await sameAsStore(s, at);
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
    const want = await sameAsStore(s, at);
    sizeRules(s, at);
    check(s.turns.every((t) => !t.lines.some((l) => / rolled \d+!$/.test(l))), `${at}: no roll is left as a plain line`);
    check(s.turns[0].name === "Ember", `${at}: the newest turn on top is ${s.turns[0].name}, want Ember`);
    check(s.turns.at(-1).name === "Earlier" && !s.turns.at(-1).dot, `${at}: a full log's oldest lines sit under "${s.turns.at(-1).name}", want Earlier`);
    check(s.turns.slice(0, -1).every((t) => t.dot), `${at}: every seat's turn has its colour dot`);
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
    check(s.scroll.top === 0 && s.scroll.height > s.scroll.client, `${at}: the list opens at the newest turn and scrolls ${JSON.stringify(s.scroll)}`);
    check((await storeLog()).length === 200, `${at}: the store's log is full at 200 lines`);
    await shot("log");

    // The oldest turn is reached by scrolling and stays inside the sheet.
    const last = await sheet.evaluate((el) => {
      const list = el.querySelector("ol");
      list.scrollTop = list.scrollHeight;
      const r = list.lastElementChild.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return { inside: r.bottom <= b.bottom + 0.5 && r.left >= b.left && r.right <= b.right, bottom: r.bottom, sheet: b.bottom };
    });
    check(last.inside, `${at}: scrolled down, the oldest group is not inside the sheet ${JSON.stringify(last)}`);
    await shot("log-end");
    await sheet.evaluate((el) => (el.querySelector("ol").scrollTop = 0));

    if (v.full) {
      // 3. A move while the sheet is open: Ember ends the turn through the store, and the next seat is on top.
      await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "endTurn" }));
      await page.waitForFunction(() => document.querySelector('[data-testid="gl-turn"] b')?.textContent !== "Ember");
      s = await readSheet(page);
      at = `${tag} after End turn`;
      await sameAsStore(s, at);
      const next = await page.evaluate(() => { const g = window.__emberisle.getState().state; return g.players.find((p) => p.id === g.current).name; });
      check(s.turns[0].name === next && s.turns[1].name === "Ember", `${at}: the top turns are ${s.turns[0].name}, ${s.turns[1].name}; want ${next}, Ember`);

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
      await sameAsStore(s, at);
      sizeRules(s, at);
      const winner = over.players.find((p) => p.id === over.winner).name;
      check(s.turns[0].name === winner && / claims the isle with \d+ points\.$/.test(s.turns[0].lines.at(-1) ?? ""), `${at}: the newest turn is ${s.turns[0].name} ending "${s.turns[0].lines.at(-1)}"`);
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
    await menuButton.tap();
    check(await page.getByTestId("log-entry").isVisible(), "hotseat, chunk refused: the menu opens again with its Game log row");
    await page.unroute(/\/GameLog\.tsx/);
    // rules.ts's line for a roll the bank cannot pay in full, as the store would hold it.
    const short = ["Ember's turn.", "Ember rolled 9!", "Tide gains 2 wheat; Pine gains 1 wheat — Ember's roll; the bank is short of stone; nobody gains it."];
    await page.evaluate((lines) => window.__emberisle.setState({ gameLog: lines.map((text) => ({ at: 0, text })) }), short);
    await page.getByTestId("log-entry").tap();
    await page.getByTestId("game-log").waitFor();
    const turns = await readSheet(page).then((s) => s.turns.map((t) => ({ name: t.name, sum: t.sum, lines: t.lines })));
    check(JSON.stringify(turns) === JSON.stringify(expected(short)) && JSON.stringify(turns[0]?.lines) === JSON.stringify(["Tide gains 2 wheat.", "Pine gains 1 wheat.", "The bank is short of stone; nobody gains it."]), `hotseat: with the chunk back the next press opens the log, and a short bank keeps its line ${JSON.stringify(turns)}`);
    console.log("hotseat: the row is there, and a refused chunk is tried again on the next press");
    await ctx.close();
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
