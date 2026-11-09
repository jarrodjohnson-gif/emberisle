// #1452 and #1453: the island awards and the dice strip on the results screen, in a browser.
// The game is the design packet's pictured game (docs/design/results-awards-dice/), won with the real rules here.
// Touch, at 375x812, 390x844, 430x932, 820x1180 and 844x390:
//   - closed rows show no award; opening a row shows exactly one, at the top of its own region, above the breakdown,
//     with the player's title and fact; each player's award matches islandAwards
//   - the dice strip sits under the list inside its scrolling area: 11 bars, the sum labels, the odds line and the sentence
//   - rows stay 44 px, nothing scrolls sideways, every result button stays on screen
// Desktop with a mouse: the table keeps no opened row; each award is a muted line under the name; the strip is under it.
// An unusual spread colours one bar in sea ink and says so; an older game with no counts draws no strip, and its losers
// share "Dry spell".
// The chunk is fetched while the table plays, so the results never wait for it.
// With SHOTS=1 it writes the pictures in docs/proofs/1452/ at device scale 2.
// Run: node --import ./server/register.mjs scripts/results-story-ui-prove.mjs
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { applyAction } from "../src/lib/game/rules.ts";
import { diceLine, islandAwards } from "../src/lib/game/story.ts";

const port = Number(process.env.VITE_PORT || 18775);
const SHOTS = process.env.SHOTS === "1" ? "docs/proofs/1452" : null;
const fixture = JSON.parse(readFileSync(new URL("./fixtures/results-story-game.json", import.meta.url), "utf8"));
const won = applyAction(fixture.before, fixture.actor, fixture.action);
assert.ifError(won.error);
const g = won.state;
const awards = islandAwards(g);
const award = (id) => (awards[id] ? `${awards[id].title} · ${awards[id].fact}` : null);
assert.equal(award("p1"), "Trade broker · 2 trades with the table");
const LINE = "8 came up most, 21 times. 2 and 12 came up least, 3 times each.";
assert.equal(diceLine(g.rollSums).line, LINE);
// The opened row in the pictures: the last place, who most needs a moment (as in the design packet).
const OPEN = "p1";

const TOUCH = [
  [375, 812],
  [390, 844],
  [430, 932],
  [820, 1180],
  [844, 390],
];
const STORY_CHUNK = /\/ResultsStory\.tsx/;

const vite = await createServer({ server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  mkdirSync("test-results", { recursive: true });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const shot = (page, name) => page.screenshot({ path: `${SHOTS ?? "test-results"}/${SHOTS ? "" : "results-story-"}${name}.png` });
  const errors = [];

  async function open(width, height, touch, game = g, { live = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: "reduce", deviceScaleFactor: SHOTS ? 2 : 1 });
    const page = await context.newPage();
    const tag = `${width}x${height}`;
    page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    const storyLoads = [];
    page.on("request", (r) => STORY_CHUNK.test(r.url()) && storyLoads.push(r.url()));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => !!window.__emberisle);
    const load = (game) => page.evaluate((game) => {
      const s = window.__emberisle;
      s.setState({ spectator: false, isHost: true, menuFor: null, chatOpen: false });
      s.getState().loadState(game, "p0", true, "RSTY");
    }, game);
    if (live) {
      // The table plays first: the win screen fetches the chunk then, long before the end.
      const fetched = page.waitForResponse((r) => STORY_CHUNK.test(r.url()));
      await load({ ...structuredClone(game), phase: "main", winner: null, winReason: undefined });
      await fetched;
      await page.waitForLoadState("networkidle");
    }
    await load(structuredClone(game));
    await page.getByTestId("win-menu").waitFor();
    return { context, page, tag, storyLoads };
  }

  const measure = (page) => page.evaluate(() => {
    const box = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, height: b.height, width: b.width }; };
    const wrap = document.querySelector('[data-testid="win-table-wrap"]');
    const shown = (el) => el.getClientRects().length > 0 && !el.closest("[hidden]");
    const dice = document.querySelector('[data-testid="win-dice"]');
    return {
      wrap: { ...box(wrap), scrollTop: wrap.scrollTop, scrollHeight: wrap.scrollHeight, clientHeight: wrap.clientHeight, scrollWidth: wrap.scrollWidth, clientWidth: wrap.clientWidth },
      page: { scrollWidth: document.documentElement.scrollWidth, innerWidth, innerHeight },
      rowHeights: [...document.querySelectorAll('[data-testid="win-row"]')].map((b) => b.offsetHeight),
      actions: [...document.querySelectorAll('[data-testid="win-screen"] button')].filter((b) => !b.closest('[data-testid="win-table-wrap"]')).map((b) => ({ id: b.dataset.testid, ...box(b) })),
      awardsInDom: document.querySelectorAll('[data-testid="win-award"]').length,
      awardsShown: [...document.querySelectorAll('[data-testid="win-award"]')].filter(shown).map((a) => ({ text: a.textContent, region: a.closest('[role="region"]')?.id ?? null, first: a.parentElement.firstElementChild === a, ...box(a), chip: a.querySelector(".win-award-chip") && box(a.querySelector(".win-award-chip")), dlTop: a.parentElement.querySelector("dl") && box(a.parentElement.querySelector("dl")).top })),
      dice: dice && { ...box(dice), inWrap: wrap.contains(dice), afterList: !!(wrap.querySelector("ul, table")?.compareDocumentPosition(dice) & Node.DOCUMENT_POSITION_FOLLOWING), bars: dice.querySelectorAll("rect").length, hot: [...dice.querySelectorAll("rect")].map((r, i) => (r.classList.contains("hot") ? i + 2 : null)).filter(Boolean), labels: [...dice.querySelectorAll("text")].map((t) => t.textContent), odds: dice.querySelector("polyline")?.getAttribute("points").trim().split(/\s+/).length, head: dice.querySelector("figcaption").textContent, line: dice.querySelector("p").textContent, img: dice.querySelector("svg").getAttribute("role"), label: dice.querySelector("svg").getAttribute("aria-label") },
    };
  });
  const noSideways = (m, why) => assert.ok(m.wrap.scrollWidth <= m.wrap.clientWidth + 1 && m.page.scrollWidth <= m.page.innerWidth, `${why}: nothing scrolls sideways ${JSON.stringify({ wrap: [m.wrap.scrollWidth, m.wrap.clientWidth], page: m.page.scrollWidth })}`);
  const onScreen = (m, why) => {
    assert.ok(m.actions.length >= 2, `${why}: result buttons`);
    for (const b of m.actions) assert.ok(b.top >= -1 && b.bottom <= m.page.innerHeight + 1 && b.left >= -1 && b.right <= m.page.innerWidth + 1, `${why}: ${b.id} stays on screen ${JSON.stringify(b)}`);
  };
  const strip = (m, why, total = 113, line = LINE, hot = []) => {
    assert.ok(m.dice, `${why}: the dice strip shows`);
    assert.ok(m.dice.inWrap && m.dice.afterList, `${why}: the strip is under the list, inside its scrolling area`);
    assert.equal(m.dice.bars, 11, `${why}: 11 bars`);
    assert.deepEqual(m.dice.labels, ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"], `${why}: each sum under its bar`);
    assert.equal(m.dice.odds, 11, `${why}: the odds line has a point per sum`);
    assert.equal(m.dice.head, `Dice this game${total} rolls`, `${why}: the strip's header`);
    assert.equal(m.dice.line, line, `${why}: the sentence`);
    assert.deepEqual(m.dice.hot, hot, `${why}: coloured bars`);
    assert.equal(m.dice.img, "img", `${why}: the chart is one image to a screen reader`);
    assert.ok(m.dice.label, `${why}: with a label`);
  };
  const measured = {};

  for (const [width, height] of TOUCH) {
    const { context, page, tag } = await open(width, height, true);
    const rows = page.getByTestId("win-row");
    await rows.first().waitFor();
    await page.getByTestId("win-dice").waitFor();
    let m = await measure(page);
    assert.equal(m.awardsInDom, 4, `${tag}: every player in the pictured game holds a title`);
    assert.deepEqual(m.awardsShown, [], `${tag}: no award shows while every row is closed`);
    assert.ok(m.rowHeights.every((h) => h >= 44), `${tag}: rows at least 44 px: ${m.rowHeights}`);
    noSideways(m, `${tag} closed`);
    onScreen(m, `${tag} closed`);
    strip(m, `${tag} closed`);
    measured[tag] = { strip: Math.round(m.dice.height), closedListScrolls: m.wrap.scrollHeight - m.wrap.clientHeight };
    await shot(page, `closed-${tag}`);

    // Each row in turn: exactly one award, in its own region, above the breakdown.
    for (const id of ["p0", "p2", "p3", "p1"]) {
      const row = rows.and(page.locator(`[data-player="${id}"]`));
      await row.scrollIntoViewIfNeeded();
      await row.tap();
      assert.equal(await row.getAttribute("aria-expanded"), "true", `${tag} ${id}: tap opens`);
      m = await measure(page);
      assert.equal(m.awardsShown.length, 1, `${tag} ${id}: one award shows`);
      const [a] = m.awardsShown;
      assert.equal(a.region, `win-part-${id}`, `${tag} ${id}: inside the opened row`);
      assert.ok(a.first && a.bottom <= a.dlTop + 1, `${tag} ${id}: at the top of the row, above the breakdown`);
      assert.equal(a.text, award(id).replace(" · ", ""), `${tag} ${id}: the player's own title and fact`);
      assert.ok(a.chip.height >= 23.5 && a.chip.height <= 24.5, `${tag} ${id}: the chip is 24 px (${a.chip.height})`);
      assert.ok(a.right <= m.wrap.right + 1, `${tag} ${id}: the award never cuts off`);
      assert.ok(m.rowHeights.every((h) => h >= 44), `${tag} ${id}: rows stay 44 px`);
      noSideways(m, `${tag} ${id} open`);
      onScreen(m, `${tag} ${id} open`);
      if (id === OPEN) {
        measured[tag].awardLine = Math.round(a.height);
        await shot(page, `open-${tag}`);
      }
    }
    // A short sideways phone: the strip is reached by scrolling the list, and never covers the buttons.
    if (height < 600) {
      await page.getByTestId("win-table-wrap").evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await page.waitForTimeout(100);
      m = await measure(page);
      assert.ok(m.dice.bottom <= m.wrap.bottom + 1 && m.dice.top >= m.wrap.top - 1, `${tag}: scrolled down, the whole strip is in the list ${JSON.stringify([m.dice.top, m.dice.bottom, m.wrap.top, m.wrap.bottom])}`);
      for (const b of m.actions) assert.ok(b.top >= m.wrap.bottom - 1, `${tag}: the strip ends above the ${b.id} button`);
      onScreen(m, `${tag} scrolled`);
      await shot(page, `open-scrolled-${tag}`);
    }
    await context.close();
    console.log(`ok ${tag} touch: no award while closed, one in each opened row (${award(OPEN)}), dice strip under the list (${measured[tag].strip} px), rows 44 px, no sideways scroll, buttons on screen`);
  }

  // Desktop with a mouse: a muted line under each name, the strip under the table.
  {
    const { context, page, tag, storyLoads } = await open(1280, 800, false);
    await page.getByTestId("win-dice").waitFor();
    assert.ok(storyLoads.length >= 1, "desktop: the story chunk loads");
    assert.equal(await page.locator('[data-testid="win-table-wrap"] table').count(), 1, "desktop: the table stays");
    const lines = await page.locator('tr[data-testid="win-row"]').evaluateAll((trs) => trs.map((tr) => [tr.dataset.player, tr.querySelector('[data-testid="win-award"]')?.textContent ?? null, tr.querySelector('[data-testid="win-award"]') && getComputedStyle(tr.querySelector('[data-testid="win-award"]')).color, getComputedStyle(tr.querySelector("td")).color, tr.querySelector('[data-testid="win-award"]')?.closest("td") === tr.querySelector("td")]));
    for (const [id, text, color, nameColor, inName] of lines) {
      assert.equal(text, award(id), `desktop ${id}: the award line`);
      assert.ok(inName, `desktop ${id}: under the name`);
      assert.notEqual(color, nameColor, `desktop ${id}: muted, not the name's colour`);
    }
    assert.equal(await page.locator('[role="region"]').count(), 0, "desktop: no opened row");
    const m = await measure(page);
    // Bartholomew Featherstonehaugh's long name already widens today's table at this size (#1406, PR #1446), so the
    // check here is that the award lines add no width to it, and that the strip fits the panel.
    const wide = await page.getByTestId("win-table-wrap").evaluate((el) => {
      const lines = [...el.querySelectorAll('[data-testid="win-award"]')];
      const withLines = el.scrollWidth;
      lines.forEach((l) => (l.style.display = "none"));
      const without = el.scrollWidth;
      lines.forEach((l) => (l.style.display = ""));
      return { withLines, without };
    });
    assert.equal(wide.withLines, wide.without, `desktop: the award lines add no width ${JSON.stringify(wide)}`);
    assert.ok(m.dice.left >= m.wrap.left - 1 && m.dice.right <= m.wrap.left + m.wrap.clientWidth + 1, "desktop: the strip fits the panel");
    assert.ok(m.page.scrollWidth <= m.page.innerWidth, "desktop: the page does not scroll sideways");
    onScreen(m, "desktop");
    strip(m, "desktop");
    await shot(page, "table-1280x800");
    await context.close();
    console.log(`ok 1280x800 mouse: a muted award line under each name (${lines.map((l) => l[1]).join("; ")}), strip under the table`);
  }

  // An unusual spread: the named sum's bar is sea ink and the sentence says so.
  {
    const hot = structuredClone(g);
    hot.rollSums = [3, 6, 22, 9, 15, 13, 18, 7, 8, 5, 3];
    const want = diceLine(hot.rollSums);
    assert.equal(want.line, "Unusual dice: 4 came up 22 times, about 9 expected.");
    const { context, page } = await open(390, 844, true, hot);
    await page.getByTestId("win-dice").waitFor();
    const m = await measure(page);
    strip(m, "unusual", 109, want.line, [4]);
    const fills = await page.locator('[data-testid="win-dice"] rect').evaluateAll((rs) => rs.map((r) => getComputedStyle(r).fill));
    assert.equal(new Set(fills).size, 2, "unusual: two bar colours");
    assert.equal(fills.filter((f) => f === fills[2]).length, 1, "unusual: only the named sum's bar has its colour");
    await shot(page, "unusual-390x844");
    await context.close();
    console.log(`ok 390x844 unusual dice: one sea-ink bar at 4, "${want.line}"`);
  }

  // An older game: no roll count and no award counts. No strip; the losers share Dry spell; the winner has no chip.
  {
    const old = structuredClone(g);
    delete old.rollSums;
    for (const p of old.players) {
      delete p.tally;
      p.goodsLost = 0;
      p.pathsLeft = 15;
    }
    const { context, page } = await open(390, 844, true, old);
    await page.getByTestId("win-row").first().waitFor();
    await page.locator('[data-testid="win-award"]').first().waitFor({ state: "attached" });
    assert.equal(await page.getByTestId("win-dice").count(), 0, "older game: no strip");
    const texts = await page.locator('[data-testid="win-award"]').evaluateAll((as) => as.map((a) => [a.closest('[role="region"]').dataset.player, a.textContent]));
    assert.deepEqual(texts, ["p2", "p1", "p3"].map((id) => [id, "Dry spellgathered no goods from rolls"]), "older game: the losers share Dry spell, the winner has no chip");
    await context.close();
    console.log("ok 390x844 older game: no strip, losers share Dry spell, no winner chip");
  }

  // A real game: the chunk is fetched while the table plays.
  {
    const { context, page, storyLoads } = await open(390, 844, true, g, { live: true });
    assert.equal(storyLoads.length, 1, "the chunk is fetched once, during play");
    assert.equal(await page.getByTestId("win-dice").count(), 1, "the strip is there at the end");
    await context.close();
    console.log("ok 390x844 live table: the story chunk is fetched during play");
  }

  assert.deepEqual(errors, [], "no console or page errors");
  console.log(`measured: ${JSON.stringify(measured)}`);
  console.log("results-story-ui-prove: all passed");
} finally {
  await browser?.close();
  await vite.close();
}
