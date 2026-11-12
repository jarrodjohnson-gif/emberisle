// #1411 design capture: the win screen today, and two ways to show who wants to play again, in the real game.
// A finished four-player online game is loaded straight into the store, as in docs/design/results-748/capture.mjs.
// "After" pictures are a mock: mock.css and the DOM added below sit on the real list, table and buttons.
// The run fails if the real win screen, rows, totals, waiting line or buttons are missing, or a tag or button is cut.
// No src/ file changes. Not a CI proof. Run from the repo root, one browser at a time:
//   node --import ./server/register.mjs docs/design/play-again-1411/capture.mjs          (writes to a new temp folder)
//   node --import ./server/register.mjs docs/design/play-again-1411/capture.mjs --save   (replaces the pictures here)
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";
import { createGame } from "../../../src/lib/game/board.ts";
import { totalVP } from "../../../src/lib/game/rules.ts";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv.includes("--save") ? dir : mkdtempSync(path.join(tmpdir(), "play-again-1411-"));
console.error(`pictures: ${out}`);
const css = readFileSync(path.join(dir, "mock.css"), "utf8");

// [width, height, group, insets]. Touch for every size but desktop, so the game's own phone test is true there.
const SIZES = [
  [430, 932, "phone"], [390, 844, "phone"], [375, 812, "phone"],
  [820, 1180, "ipad"],
  [932, 430, "sideways"], [844, 390, "sideways"], [812, 375, "sideways"],
  // The same safe-area insets as the 667x375 case in scripts/win-action-prove.mjs (a phone with a notch, held sideways).
  [667, 375, "sideways", { top: 0, right: 44, bottom: 21, left: 44 }],
  [1180, 820, "ipad"],
  [1280, 720, "desktop"],
];
// Host-view and away pictures are taken at these sizes only; host numbers are measured at every size.
const HOST_SHOTS = new Set(["390x844", "667x375-insets", "1280x720"]);

// The #748 game: Bartholomew (p0) won with 11, Guinevere (p1) 6, Maximilian (p2) 9, Cordelia (p3) 2.
const g = createGame({ humans: [{ name: "Bartholomew Featherstonehaugh" }, { name: "Guinevere Wigglesworth-Smythe" }, { name: "Maximilian Oppenheimer III" }, { name: "Cordelia Fitzgerald-Hartwell" }], bots: 0, seed: 559 });
g.rollOff = null; g.log = []; g.victoryTarget = 10;
const built = [["p0", "stronghold"], ["p0", "stronghold"], ["p0", "stronghold"], ["p0", "outpost"], ["p0", "outpost"], ["p1", "outpost"], ["p1", "stronghold"], ["p1", "outpost"], ["p2", "stronghold"], ["p2", "stronghold"], ["p3", "outpost"], ["p3", "outpost"]];
built.forEach(([playerId, kind], i) => { g.vertices[i].building = { playerId, kind }; });
g.longestRoad = "p0"; g.largestArmy = "p2"; g.players[2].knightsPlayed = 3;
g.players.forEach((p, i) => { p.hidden.vp = [1, 0, 3, 0][i]; });
g.phase = "over"; g.winner = "p0"; g.current = "p0";
g.winReason = { trigger: "outpost", points: totalVP(g, "p0"), target: 10 };

// The seat list the host would send. `again` is the proposed new field: true once a guest taps "I'll play again".
// Bartholomew hosts. Guinevere has said yes. Maximilian has not said yet. Cordelia is a bot, or away in the away picture.
const seat = (i, extra) => ({ id: `s${i}`, name: g.players[i].name, color: g.players[i].color, avatarId: null, ready: true, host: i === 0, away: false, bot: false, player: `p${i}`, needs: [], url: null, again: false, ...extra });
const seatsFor = (away) => [seat(0), seat(1, { again: true }), seat(2), away ? seat(3, { away: true }) : seat(3, { bot: true })];
const VIEWS = { guest: { seatId: "s2", pid: "p2", isHost: false }, host: { seatId: "s0", pid: "p0", isHost: true } };
const OPEN = "p1"; // The row opened in the "open" pictures: Guinevere, who has said yes, with a long name.

// Runs in the page. Adds the proposal to the real win screen, built from the real seat list in the store.
function mock({ css, option }) {
  const s = window.__emberisle.getState();
  const screen = document.querySelector('[data-testid="win-screen"]');
  const rows = [...document.querySelectorAll('[data-testid="win-row"]')];
  const look = document.querySelector('[data-testid="win-look"]');
  const menu = document.querySelector('[data-testid="win-menu"]');
  const again = document.querySelector('[data-testid="win-again"]');
  const waiting = document.querySelector('[data-testid="win-waiting"]');
  if (!screen || rows.length !== 4 || !look || !menu) throw new Error("real win screen, four rows, Look around or Back to menu missing");
  if (s.isHost ? !again || waiting : again || !waiting) throw new Error("real Play again or waiting line is not where today's rules put it");
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const check = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // The host and bots are always in: the host starts the next game, and a bot always plays. Away seats are let go.
  const yes = (st) => !st.away && (st.host || st.bot || st.again);
  const live = (st) => !st.away;
  const seats = () => window.__emberisle.getState().seats;
  const me = () => seats().find((x) => x.id === window.__emberisle.getState().seatId);

  const count = document.createElement("p");
  count.className = option === "b" ? "pa-count" : "pa-sr";
  count.dataset.testid = "pa-count";
  count.setAttribute("role", "status");
  const paint = () => {
    const all = seats();
    const n = all.filter(yes).length, m = all.filter(live).length;
    count.innerHTML = `${option === "b" ? check : ""}${n} of ${m} want another game`;
    if (option !== "a") return;
    for (const row of rows) {
      const st = all.find((x) => x.player === row.dataset.player);
      if (!st) throw new Error(`no seat for real row ${row.dataset.player}`);
      row.querySelector(".pa-tag")?.remove();
      if (!yes(st) && !st.away) continue;
      const tag = document.createElement("span");
      tag.className = `pa-tag${st.away ? " pa-away" : ""}`;
      tag.dataset.testid = "pa-tag";
      tag.innerHTML = st.away
        ? '<span aria-hidden="true">Away</span><span class="pa-sr">, away</span>'
        : `${check}<span aria-hidden="true">Play again</span><span class="pa-sr">, wants to play again</span>`;
      const total = row.querySelector('[data-testid="win-total"]');
      if (!total) throw new Error(`real row ${row.dataset.player}: total missing`);
      if (row.tagName === "TR") row.querySelector("td").append(tag);
      else row.insertBefore(tag, total);
    }
  };
  paint();
  // B shows the count above the buttons; A keeps it as a hidden status line for screen readers.
  const actions = menu.parentElement;
  actions.before(count);

  // A seated guest gets "I'll play again" where the host has "Play again". Tap again to take it back.
  if (!s.isHost && !s.spectator) {
    const primary = menu.className;
    const want = document.createElement("button");
    want.type = "button";
    want.dataset.testid = "pa-want";
    want.setAttribute("aria-pressed", "false");
    const show = () => {
      const on = want.getAttribute("aria-pressed") === "true";
      want.className = `${on ? look.className : primary} pa-want`;
      want.innerHTML = `${on ? check : ""}I'll play again`;
    };
    show();
    menu.className = look.className; // Back to menu turns secondary, as it is for the host.
    want.addEventListener("click", () => {
      const on = want.getAttribute("aria-pressed") !== "true";
      want.setAttribute("aria-pressed", String(on));
      const id = me().id;
      window.__emberisle.setState({ seats: seats().map((x) => (x.id === id ? { ...x, again: on } : x)) });
      show();
      paint();
    });
    menu.before(want);
  }
}

// Runs in the page: the numbers each picture is judged by.
function measure() {
  const wrap = document.querySelector('[data-testid="win-table-wrap"]');
  const panel = document.querySelector('[data-testid="win-screen"] > div');
  const w = wrap.getBoundingClientRect();
  const shown = (el) => el.getClientRects().length > 0;
  const rows = [...document.querySelectorAll('[data-testid="win-row"]')].filter(shown);
  const inWrap = (b) => b.top >= w.top - 1 && b.bottom <= w.bottom + 1 && b.left >= w.left - 1 && b.right <= w.right + 1 && b.bottom <= innerHeight;
  const totals = rows.map((r) => r.querySelector('[data-testid="win-total"]'));
  const tags = [...document.querySelectorAll('[data-testid="pa-tag"]')].filter(shown);
  // A tag is cut if it leaves its row, or runs into the total on its right.
  const tagsCut = tags.filter((t) => {
    const b = t.getBoundingClientRect(), row = t.closest('[data-testid="win-row"]').getBoundingClientRect();
    const total = t.closest('[data-testid="win-row"]').querySelector('[data-testid="win-total"]').getBoundingClientRect();
    return b.left < row.left - 1 || b.right > row.right + 1 || b.top < row.top - 1 || b.bottom > row.bottom + 1 || (t.closest("button") && b.right > total.left);
  }).length;
  const buttons = [...document.querySelectorAll('[data-testid="win-screen"] button')].filter((b) => shown(b) && b.dataset.testid !== "win-row");
  const action = document.querySelector('[data-testid="win-menu"]').parentElement;
  const count = document.querySelector('[data-testid="pa-count"]');
  return {
    wrap: { h: Math.round(w.height), scrollHeight: wrap.scrollHeight, clientHeight: wrap.clientHeight, scrollWidth: wrap.scrollWidth, clientWidth: wrap.clientWidth },
    panelScrolls: panel.scrollHeight > panel.clientHeight + 1,
    pageScrolled: Math.round(document.scrollingElement.scrollTop),
    sidewaysScroll: wrap.scrollWidth > wrap.clientWidth + 1,
    downScroll: wrap.scrollHeight > wrap.clientHeight + 1,
    rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
    rowsInView: rows.filter((r) => inWrap(r.getBoundingClientRect())).length,
    totalsInView: totals.filter((t) => t && inWrap(t.getBoundingClientRect())).length,
    totalsCutRight: totals.filter((t) => !t || t.getBoundingClientRect().right > w.right + 1).length,
    tags: tags.map((t) => `${t.closest('[data-testid="win-row"]').dataset.player}: ${t.textContent.replace(/,.*/, "")}`),
    tagsCut,
    namesCut: [...document.querySelectorAll('button[data-testid="win-row"] > span:not([data-testid])')].filter((n) => shown(n) && n.scrollWidth > n.clientWidth + 1).length,
    count: count ? { text: count.textContent, visible: getComputedStyle(count).position !== "absolute" } : null,
    waiting: document.querySelector('[data-testid="win-waiting"]')?.textContent ?? null,
    actionLines: new Set([...action.children].filter(shown).map((c) => Math.round(c.getBoundingClientRect().top))).size,
    buttonsInView: buttons.every((b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }),
    buttons: buttons.map((b) => `${b.textContent.trim()}${b.getAttribute("aria-pressed") === "true" ? " (pressed)" : ""}`),
    // Layout height, not the box: a just-tapped button is still scaled to 97 % by its :active press style.
    shortButtons: buttons.filter((b) => b.offsetHeight < 44).map((b) => b.textContent.trim()),
  };
}

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const result = { browser: browser.version(), runs: [] };
const fail = (msg) => { throw new Error(msg); };

try {
  for (const [width, height, group, insets] of SIZES) {
    const tag = `${width}x${height}${insets ? "-insets" : ""}`;
    const touch = group !== "desktop";
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch, reducedMotion: "reduce" });
    const open = async ({ view, option, away = false }) => {
      const v = VIEWS[view];
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
      if (insets) await (await context.newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets });
      await page.goto(url);
      await page.waitForFunction(() => !!window.__emberisle);
      await page.evaluate(({ game, v, seats }) => {
        const s = window.__emberisle;
        s.getState().loadState(game, v.pid, v.isHost, "PLAY");
        s.setState({ spectator: false, menuFor: null, chatOpen: false, seatId: v.seatId, isHost: v.isHost, seats });
      }, { game: structuredClone(g), v, seats: seatsFor(away) });
      await page.getByTestId("win-screen").waitFor();
      await page.getByTestId("win-menu").waitFor();
      if (touch) await page.locator('button[data-testid="win-row"]').first().waitFor();
      await page.waitForTimeout(1500);
      if (option) await page.evaluate(mock, { css, option });
      await page.waitForTimeout(200);
      return page;
    };
    const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}-${tag}.png`) });
    const rec = { size: tag, group };
    const run = async (key, opts, picture, after) => {
      const page = await open(opts);
      rec[key] = await page.evaluate(measure);
      if (picture) await shot(page, picture);
      if (after) await after(page);
      await page.close();
    };
    // Guest view, open: Maximilian taps "I'll play again", then opens Guinevere's row.
    const tapAndOpen = (option) => async (page) => {
      const want = page.getByTestId("pa-want");
      touch ? await want.tap() : await want.click();
      if ((await want.getAttribute("aria-pressed")) !== "true") fail(`${tag} ${option}: tap did not press I'll play again`);
      const count = await page.getByTestId("pa-count").textContent();
      if (!count.startsWith("4 of 4")) fail(`${tag} ${option}: count after the tap is "${count}"`);
      if (option === "a" && !(await page.locator(`button[data-testid="win-row"][data-player="p2"] [data-testid="pa-tag"], tr[data-player="p2"] [data-testid="pa-tag"]`).count())) fail(`${tag}: Maximilian's row has no tag after the tap`);
      if (touch) {
        const row = page.locator(`button[data-testid="win-row"][data-player="${OPEN}"]`);
        await row.tap();
        if ((await row.getAttribute("aria-expanded")) !== "true") fail(`${tag} ${option}: tap did not open the row`);
        await page.waitForTimeout(150);
        if (option === "a" && !(await row.locator('[data-testid="pa-tag"]').isVisible())) fail(`${tag}: the tag left the row when it opened`);
      }
      rec[`${option}Open`] = await page.evaluate(measure);
      await shot(page, `${option}-open`);
    };

    await run("before", { view: "guest" }, "before");
    await run("a", { view: "guest", option: "a" }, "a", tapAndOpen("a"));
    await run("b", { view: "guest", option: "b" }, "b", tapAndOpen("b"));
    const hostShot = HOST_SHOTS.has(tag);
    await run("hostBefore", { view: "host" }, hostShot && "host-before");
    await run("hostA", { view: "host", option: "a" }, hostShot && "host-a");
    await run("hostB", { view: "host", option: "b" }, hostShot && "host-b");
    if (tag === "390x844") await run("awayA", { view: "guest", option: "a", away: true }, "away-a");

    for (const [k, m] of Object.entries(rec)) {
      if (!m || typeof m !== "object" || !("wrap" in m) || /before/i.test(k)) continue;
      // The desktop table already scrolls sideways with these long names today (#748, question 3): it must get no wider.
      const today = k.startsWith("host") ? rec.hostBefore : rec.before;
      if (m.sidewaysScroll && (touch || m.wrap.scrollWidth > today.wrap.scrollWidth + 1)) fail(`${tag} ${k}: the list scrolls sideways, or wider than today`);
      if (touch && m.rowHeights.some((h) => h < 44)) fail(`${tag} ${k}: a row is under 44 px`);
      if (!m.buttonsInView) fail(`${tag} ${k}: a result button is off screen`);
      if (m.shortButtons.length) fail(`${tag} ${k}: under 44 px: ${m.shortButtons}`);
      if (m.pageScrolled) fail(`${tag} ${k}: the page itself scrolled by ${m.pageScrolled} px`);
      if (m.tagsCut) fail(`${tag} ${k}: ${m.tagsCut} tag(s) cut or over the total`);
      if (touch && m.totalsCutRight) fail(`${tag} ${k}: a total is cut on the right`);
      if (m.waiting !== rec.before.waiting && k !== "awayA" && !k.startsWith("host")) fail(`${tag} ${k}: the waiting line changed`);
    }
    // Option A must keep win-action-prove line 100 true for the host: no new down-scroll at 480 px tall or less.
    if (height <= 480 && !rec.hostBefore.downScroll && rec.hostA.downScroll) fail(`${tag}: option A makes the host's list scroll down`);
    result.runs.push(rec);
    console.log(tag, JSON.stringify(rec));
    await context.close();
  }
} finally {
  await browser.close();
  await vite.close();
}
result.errors = errors;
writeFileSync(path.join(out, "measurements.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ errors }));
if (errors.length) process.exit(1);
