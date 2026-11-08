// #748 design capture: the win screen today and the proposed compact score list, in the real game.
// A finished four-player game with long names is loaded straight into the store, as in scripts/public-score-prove.mjs.
// "After" pictures are a mock: list.css and the DOM built below replace the real table inside the real dialog.
// The run fails if the real win screen, table, rows, totals or buttons are missing, or a mock total differs from totalVP.
// No src/ file changes. Not a CI proof. Run from the repo root, one browser at a time:
//   node --import ./server/register.mjs docs/design/results-748/capture.mjs          (writes to a new temp folder)
//   node --import ./server/register.mjs docs/design/results-748/capture.mjs --save   (replaces the pictures here)
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";
import { createGame } from "../../../src/lib/game/board.ts";
import { totalVP } from "../../../src/lib/game/rules.ts";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv.includes("--save") ? dir : mkdtempSync(path.join(tmpdir(), "results-748-"));
console.error(`pictures: ${out}`);
const css = readFileSync(path.join(dir, "list.css"), "utf8");

// [width, height, group]. Touch for every size but desktop, so the game's own phone test is true there.
const SIZES = [
  [390, 844, "phone"], [375, 667, "phone"], [430, 932, "phone"],
  [820, 1180, "ipad"], [1180, 820, "ipad"],
  [844, 390, "sideways"], [667, 375, "sideways"],
  // The same safe-area insets as the 667x375 case in scripts/win-action-prove.mjs (a phone with a notch, held sideways).
  [667, 375, "sideways", { top: 0, right: 44, bottom: 21, left: 44 }],
  [1280, 720, "desktop"],
];

// Winner p0 11 (2 outposts, 3 strongholds, longest path, 1 hidden); p2 9 (0 outposts, 2 strongholds, largest army,
// 3 hidden); p1 6; p3 2 (outposts only, every other part zero).
const g = createGame({ humans: [{ name: "Bartholomew Featherstonehaugh" }, { name: "Guinevere Wigglesworth-Smythe" }, { name: "Maximilian Oppenheimer III" }, { name: "Cordelia Fitzgerald-Hartwell" }], bots: 0, seed: 559 });
g.rollOff = null; g.log = []; g.victoryTarget = 10;
const built = [["p0", "stronghold"], ["p0", "stronghold"], ["p0", "stronghold"], ["p0", "outpost"], ["p0", "outpost"], ["p1", "outpost"], ["p1", "stronghold"], ["p1", "outpost"], ["p2", "stronghold"], ["p2", "stronghold"], ["p3", "outpost"], ["p3", "outpost"]];
built.forEach(([playerId, kind], i) => { g.vertices[i].building = { playerId, kind }; });
g.longestRoad = "p0"; g.largestArmy = "p2"; g.players[2].knightsPlayed = 3;
g.players.forEach((p, i) => { p.hidden.vp = [1, 0, 3, 0][i]; });
g.phase = "over"; g.winner = "p0"; g.current = "p0";
g.winReason = { trigger: "outpost", points: totalVP(g, "p0"), target: 10 };
const expected = Object.fromEntries(g.players.map((p) => [p.id, totalVP(g, p.id)]));
const OPEN = "p2"; // The row opened in the "open" pictures: it has a zero part and two strongholds.

// Runs in the page. Hides the real table and builds the list from the real store state and the real rows.
async function mock({ css, few }) {
  const { publicScoreBreakdown, totalVP } = await import("/src/lib/game/rules.ts");
  const state = window.__emberisle.getState().state;
  const wrap = document.querySelector('[data-testid="win-table-wrap"]');
  const look = document.querySelector('[data-testid="win-look"]');
  const rows = [...document.querySelectorAll('[data-testid="win-row"]')];
  if (!wrap || !wrap.querySelector("table") || !look || rows.length !== 4) throw new Error("real win table, rows or Look around missing");
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const hint = document.createElement("p");
  hint.className = "r748-hint";
  hint.textContent = "Tap a player to see how they scored.";
  const list = document.createElement("ul");
  list.className = "r748-list";
  list.dataset.testid = "r748-list";
  for (const real of rows) {
    const id = real.dataset.player;
    const p = state.players.find((x) => x.id === id);
    const dot = real.querySelector("td span[aria-hidden]");
    const shown = Number(real.querySelector('[data-testid="win-total"]')?.textContent);
    if (!p || !dot || shown !== totalVP(state, id)) throw new Error(`real row ${id}: seat dot or total missing or wrong`);
    const parts = publicScoreBreakdown(state, id);
    let outposts = 0, strongholds = 0;
    for (const v of state.vertices) if (v.building?.playerId === id) v.building.kind === "stronghold" ? strongholds++ : outposts++;
    const hiddenPts = totalVP(state, id) - Object.values(parts).reduce((a, b) => a + b, 0);
    const pts = (n) => `${n} point${n === 1 ? "" : "s"}`;
    const lines = [
      ["Outposts", String(outposts), parts.outposts],
      ["Strongholds", String(strongholds), parts.strongholds],
      ["Longest path", parts.longestPath ? "Yes" : "No", parts.longestPath],
      ["Largest army", parts.largestArmy ? "Yes" : "No", parts.largestArmy],
      ["Hidden points", String(p.hidden.vp), hiddenPts],
    ];
    const li = document.createElement("li");
    li.className = "r748-item";
    li.innerHTML = `<h3 class="r748-h"><button type="button" class="r748-row" aria-expanded="false" aria-controls="r748-${id}" data-player="${id}">
      <span class="r748-name"></span><span class="r748-total" data-testid="r748-total">${totalVP(state, id)}<small>points</small></span>
      <svg class="r748-chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button></h3>
    <div class="r748-detail" id="r748-${id}" role="region" aria-label="${p.name}'s score" hidden><dl>
      ${lines.map(([label, count, n]) => `<dt>${label}</dt><dd>${count}</dd><dd class="r748-pts" data-part="${label}">${pts(n)}</dd>`).join("")}
      <dt class="r748-sum">Total</dt><dd class="r748-sum"></dd><dd class="r748-sum">${pts(totalVP(state, id))}</dd>
    </dl><p>${strongholds === 2 ? "Two strongholds = 4 points." : "Each stronghold is worth 2 points."}</p></div>`;
    const button = li.querySelector("button");
    button.prepend(dot.cloneNode(true));
    li.querySelector(".r748-name").textContent = p.name;
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(open));
      li.querySelector(".r748-detail").hidden = !open;
    });
    list.append(li);
  }
  wrap.classList.add("r748");
  wrap.prepend(hint, list);
  if (few) {
    list.classList.add("r748-few");
    const more = document.createElement("button");
    more.type = "button";
    more.className = `${look.className} r748-more`;
    more.dataset.testid = "r748-more";
    more.textContent = `Show all ${rows.length} players`;
    more.addEventListener("click", () => {
      const fewNow = list.classList.toggle("r748-few");
      more.textContent = fewNow ? `Show all ${rows.length} players` : "Show fewer";
    });
    wrap.after(more);
  }
}

// Runs in the page: the numbers each picture is judged by.
function measure() {
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const wrap = document.querySelector('[data-testid="win-table-wrap"]');
  const panel = document.querySelector('[data-testid="win-screen"] > div');
  const w = wrap.getBoundingClientRect();
  const list = document.querySelector('[data-testid="r748-list"]');
  const rows = list ? [...list.querySelectorAll(".r748-row")].filter((r) => r.getClientRects().length) : [...document.querySelectorAll('[data-testid="win-row"]')];
  const totals = list ? [...list.querySelectorAll('[data-testid="r748-total"]')].filter((r) => r.getClientRects().length) : [...document.querySelectorAll('[data-testid="win-total"]')];
  const seen = (el) => { const b = el.getBoundingClientRect(); return b.top >= w.top - 1 && b.bottom <= w.bottom + 1 && b.left >= w.left - 1 && b.right <= w.right + 1 && b.bottom <= innerHeight; };
  const buttons = [...document.querySelectorAll('[data-testid="win-screen"] button')].filter((b) => b.getClientRects().length && !b.closest(".r748-list"));
  return {
    wrap: { ...box(wrap), scrollHeight: wrap.scrollHeight, clientHeight: wrap.clientHeight, scrollWidth: wrap.scrollWidth, clientWidth: wrap.clientWidth },
    panelScrolls: panel.scrollHeight > panel.clientHeight + 1,
    sidewaysScroll: wrap.scrollWidth > wrap.clientWidth + 1,
    downScroll: wrap.scrollHeight > wrap.clientHeight + 1,
    rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
    rowsInView: rows.filter(seen).length,
    totalsInView: totals.filter(seen).length,
    namesCut: list ? [...list.querySelectorAll(".r748-name")].filter((n) => n.getClientRects().length && n.scrollWidth > n.clientWidth + 1).length : null,
    buttonsInView: buttons.every((b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }),
    buttons: buttons.map((b) => b.textContent.trim()),
    // Layout height, not the box: a just-tapped button is still scaled to 97 % by its :active press style.
    shortButtons: buttons.filter((b) => b.offsetHeight < 44).map((b) => b.textContent.trim()),
    open: box(document.querySelector(".r748-detail:not([hidden])")),
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
const result = { browser: browser.version(), expected, runs: [] };
const fail = (msg) => { throw new Error(msg); };

try {
  for (const [width, height, group, insets] of SIZES) {
    const tag = `${width}x${height}${insets ? "-insets" : ""}`;
    const touch = group !== "desktop";
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch, reducedMotion: "reduce" });
    const open = async (few) => {
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
      if (insets) await (await context.newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets });
      await page.goto(url);
      await page.waitForFunction(() => !!window.__emberisle);
      await page.evaluate((game) => {
        const s = window.__emberisle;
        s.setState({ spectator: false, menuFor: null, chatOpen: false });
        s.getState().loadState(game, "p0", true, "WINA");
      }, structuredClone(g));
      await page.getByTestId("win-screen").waitFor();
      await page.getByTestId("win-menu").waitFor();
      await page.waitForTimeout(1500);
      if (few !== undefined) await page.evaluate(mock, { css, few });
      await page.waitForTimeout(200);
      return page;
    };
    const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}-${tag}.png`) });
    const rec = { size: tag, group };

    // Today.
    let page = await open();
    rec.before = await page.evaluate(measure);
    await shot(page, "before");
    await page.close();
    if (!touch) { result.runs.push(rec); console.log(tag, JSON.stringify(rec)); await context.close(); continue; }

    // Proposal A: one row per player, all closed, then one opened by a tap.
    page = await open(false);
    rec.after = await page.evaluate(measure);
    await shot(page, "after");
    const row = page.locator(`.r748-row[data-player="${OPEN}"]`);
    await row.scrollIntoViewIfNeeded();
    await row.tap();
    if ((await row.getAttribute("aria-expanded")) !== "true" || (await page.locator(`#r748-${OPEN}`).isHidden())) fail(`${tag}: tap did not open the row`);
    await row.evaluate((el) => el.scrollIntoView({ block: "start" }));
    rec.open = await page.evaluate(measure);
    rec.openParts = await page.locator(`#r748-${OPEN} [data-part]`).evaluateAll((n) => n.map((d) => `${d.dataset.part}: ${d.textContent}`));
    await shot(page, "open");
    // Keyboard: Enter closes, Space opens, Enter closes. The button keeps focus.
    await row.focus();
    for (const [key, want] of [["Enter", "false"], ["Space", "true"], ["Enter", "false"]]) {
      await page.keyboard.press(key);
      if ((await row.getAttribute("aria-expanded")) !== want) fail(`${tag}: ${key} did not set aria-expanded=${want}`);
    }
    // Every total can be reached by scrolling the list down, with nothing cut on the right.
    for (const t of await page.getByTestId("r748-total").all()) {
      await t.scrollIntoViewIfNeeded();
      const b = await t.boundingBox();
      const w = await page.getByTestId("win-table-wrap").boundingBox();
      if (!b || b.y < w.y - 1 || b.y + b.height > w.y + w.height + 1 || b.x + b.width > w.x + w.width + 1 || b.y + b.height > height) fail(`${tag}: a total is cut or out of reach`);
    }
    // Sideways: open the row again and scroll the list to its end, to show the list scrolling down.
    if (group === "sideways") {
      await row.tap();
      await page.getByTestId("win-table-wrap").evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await page.waitForTimeout(100);
      rec.openScrolled = await page.evaluate(measure);
      await shot(page, "open-scrolled");
    }
    await page.close();

    // Alternative B, short sideways phones only: two rows, then More.
    if (group === "sideways") {
      page = await open(true);
      rec.more = await page.evaluate(measure);
      await shot(page, "more");
      await page.getByTestId("r748-more").tap();
      rec.moreOpen = await page.evaluate(measure);
      await shot(page, "more-open");
      await page.close();
    }

    for (const [k, m] of Object.entries(rec)) {
      if (!m || typeof m !== "object" || !("wrap" in m) || k === "before") continue;
      if (m.sidewaysScroll) fail(`${tag} ${k}: the list scrolls sideways`);
      if (m.rowHeights.some((h) => h < 44)) fail(`${tag} ${k}: a row is under 44 px`);
      if (!m.buttonsInView) fail(`${tag} ${k}: a result button is off screen`);
      if (m.shortButtons.length) fail(`${tag} ${k}: under 44 px: ${m.shortButtons}`);
    }
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
