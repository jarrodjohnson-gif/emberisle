// #1420 (design docs/design/seat-details-1274): "Hidden fortunes may add points." is gone from the rail and the strip and is
// the last line of every seat's ledger; on a phone the player menu is a bottom sheet with a 44 px Close.
// At 430x932, 390x844, 375x812, 820x1180 and 844x390 (touch, with the device's safe-area insets) and at 1280x720:
// - the reminder is nowhere on the table with the menu shut, and right after the ledger in every seat's menu, own or not;
// - opening the phone sheet moves no seat;
// - the phone sheet rests on the screen's bottom edge: upright it spans the screen with its top edge in the bottom half;
//   sideways it is 320 px wide at the left safe edge, below the strip, in the left half; every control in it is inside the
//   safe area even when the sheet scrolls, rows and Close are at least 44 px, and its bottom room clears the home bar;
// - keyboard: focus lands on the first row (Close when there is none), Shift+Tab from the first row reaches Close and Tab
//   comes back; Escape, Close, a tap outside and the same card again all shut it, and the first three hand focus back to the card;
// - a watcher's sheet holds only Close; online, every trade route is still there.
// Run: npm run seat-menu-sheet-prove. Screenshots to test-results/seat-menu-sheet-*.png.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const HINT = "Hidden fortunes may add points.";
const sizes = [
  { width: 430, height: 932, insets: { top: 59, right: 0, bottom: 34, left: 0 } },
  { width: 390, height: 844, insets: { top: 47, right: 0, bottom: 34, left: 0 } },
  { width: 375, height: 812, insets: { top: 44, right: 0, bottom: 34, left: 0 } },
  { width: 820, height: 1180, insets: { top: 24, right: 0, bottom: 20, left: 0 } },
  { width: 844, height: 390, insets: { top: 0, right: 47, bottom: 21, left: 47 } },
  { width: 1280, height: 720, insets: null },
];

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
mkdirSync("test-results", { recursive: true });
const errors = [];

// Jarrod (own seat, on turn, one hidden point), Bartholomew (a long name), Mira, Finn (nothing).
async function crafted(page) {
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
  await page.waitForFunction(() => window.__emberisle.getState().state);
  await page.evaluate(async () => {
    const game = window.__emberisle;
    const { createGame } = await import("/src/lib/game/board.ts");
    const st = createGame({ seed: 20261107, humans: [{ name: "Jarrod" }, { name: "Bartholomew Longfellow" }, { name: "Mira" }, { name: "Finn" }], bots: 0 });
    st.players.forEach((p, i) => (p.resources = i === 3 ? { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 } : { timber: 2, clay: 1, wool: 3, grain: 1, ore: 2 }));
    st.players[0].hidden = { knight: 1, road: 0, plenty: 0, monopoly: 0, vp: 1 };
    st.phase = "main";
    st.rollOff = null;
    st.current = st.players[0].id;
    st.seq++;
    game.setState({ state: st, localId: st.players[0].id, mode: "ai", spectator: false, buildMode: "none", banner: null, error: null, menuFor: null });
  });
  await page.locator('[data-menu-trigger="p0"]').waitFor();
}

const seatBoxes = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-testid^="rail-p"], [data-testid^="seat-p"]')].map((el) => {
    const b = el.getBoundingClientRect();
    return `${el.dataset.testid}:${b.x},${b.y},${b.width},${b.height}`;
  }));

const measure = (page, insets) =>
  page.evaluate((insets) => {
    const menu = document.querySelector('[data-testid="player-menu"]');
    const box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const safe = insets ? { l: insets.left, t: insets.top, r: innerWidth - insets.right, b: innerHeight - insets.bottom } : { l: 0, t: 0, r: innerWidth, b: innerHeight };
    // A control is checked where it can be seen: clipped by the sheet's scrollport (its padding box), then scrolled to its end too.
    const port = () => { const m = box(menu); const t = m.t + menu.clientTop, l = m.l + menu.clientLeft; return { l, t, r: l + menu.clientWidth, b: t + menu.clientHeight }; };
    const outside = () => [...menu.querySelectorAll("button")].map((el) => {
      const b = box(el), m = port();
      const r = { l: Math.max(b.l, m.l), t: Math.max(b.t, m.t), r: Math.min(b.r, m.r), b: Math.min(b.b, m.b) };
      if (r.r - r.l < 1 || r.b - r.t < 1) return null;
      return r.l >= safe.l - 0.5 && r.t >= safe.t - 0.5 && r.r <= safe.r + 0.5 && r.b <= safe.b + 0.5 ? null : `${el.getAttribute("aria-label") ?? el.textContent.trim()}@${r.l},${r.t}-${r.r},${r.b}`;
    }).filter(Boolean);
    const atRest = outside();
    menu.scrollTop = menu.scrollHeight;
    const scrolledEnd = outside();
    menu.scrollTop = 0;
    const ledger = menu.querySelector('[data-testid="score-breakdown"]');
    const hint = menu.querySelector('[data-testid="hidden-point-hint"]');
    const strip = document.querySelector('[data-testid="seat-strip"]');
    return {
      vw: innerWidth,
      vh: innerHeight,
      box: box(menu),
      bottomRoom: parseFloat(getComputedStyle(menu).borderBottomWidth),
      bottomRoomColour: getComputedStyle(menu).borderBottomColor === getComputedStyle(menu).backgroundColor,
      radius: getComputedStyle(menu).borderTopLeftRadius,
      stripBottom: strip ? strip.getBoundingClientRect().bottom : null,
      heading: menu.querySelector('[data-testid="menu-seat"]')?.textContent ?? null,
      hint: hint?.textContent ?? null,
      hintAfterLedger: !!hint && ledger.nextElementSibling === hint,
      hintsInDocument: document.querySelectorAll('[data-testid="hidden-point-hint"]').length,
      buttons: [...menu.querySelectorAll("button")].map((b) => ({ name: b.getAttribute("aria-label") ?? b.textContent.trim(), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height })),
      focus: document.activeElement && menu.contains(document.activeElement) ? (document.activeElement.getAttribute("aria-label") ?? document.activeElement.textContent.trim()) : null,
      outside: [...atRest, ...scrolledEnd],
    };
  }, insets);

const focusedTrigger = (page) => page.evaluate(() => document.activeElement?.dataset.menuTrigger ?? null);

try {
  for (const { width, height, insets } of sizes) {
    const phone = insets !== null;
    const upright = height > width;
    const tag = `${width}x${height}`;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
    if (phone) await (await context.newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets });
    await page.addInitScript(() => localStorage.setItem("emberisle-name", "Jarrod"));
    await page.goto(url);
    await page.waitForFunction(() => !!window.__emberisle);
    await crafted(page);
    await page.waitForTimeout(500);
    const menu = page.getByTestId("player-menu");

    assert.equal(await page.getByTestId("hidden-point-hint").count(), 0, `${tag}: no reminder on the rail or strip`);
    await page.screenshot({ path: `test-results/seat-menu-sheet-${tag}-seats.png` });

    // Opens a seat's menu from its card and checks what every menu shares; returns the measure.
    const open = async (id, label) => {
      const closed = await seatBoxes(page);
      await page.locator(`[data-menu-trigger="${id}"]`).click();
      await menu.waitFor();
      await page.waitForTimeout(250);
      const m = await measure(page, insets);
      // The desktop rail stays an accordion in this build (its popover was not part of the owner's answers).
      if (phone) assert.deepEqual(await seatBoxes(page), closed, `${tag} ${label}: opening the sheet moves no seat`);
      assert.equal(m.hint, HINT, `${tag} ${label}: the reminder is in the menu`);
      assert.ok(m.hintAfterLedger, `${tag} ${label}: the reminder is the ledger's last line`);
      assert.equal(m.hintsInDocument, 1, `${tag} ${label}: one reminder on screen`);
      assert.deepEqual(m.buttons.filter((b) => b.h < 44), [], `${tag} ${label}: every row is at least 44 px`);
      if (phone) {
        assert.ok(Math.abs(m.box.b - m.vh) <= 0.5, `${tag} ${label}: the sheet rests on the bottom edge ${JSON.stringify(m.box)}`);
        assert.equal(m.radius, "20px", `${tag} ${label}: 20 px top corners`);
        assert.ok(m.bottomRoom >= Math.max(16, insets.bottom) && m.bottomRoomColour, `${tag} ${label}: the sheet's bottom room ${m.bottomRoom} px, in the sheet's colour, clears the home bar`);
        assert.deepEqual(m.outside, [], `${tag} ${label}: every control inside the safe area`);
        const close = m.buttons.find((b) => b.name === "Close");
        assert.ok(close && close.w >= 44 && close.h >= 44, `${tag} ${label}: a 44 px Close ${JSON.stringify(close)}`);
        assert.ok(m.heading?.includes(await page.evaluate((id) => window.__emberisle.getState().state.players.find((p) => p.id === id).name, id)), `${tag} ${label}: the sheet names the seat`);
        if (upright) {
          assert.ok(m.box.l === 0 && m.box.r === m.vw, `${tag} ${label}: the sheet spans the screen ${JSON.stringify(m.box)}`);
          assert.ok(m.box.t >= m.vh / 2, `${tag} ${label}: the sheet's top edge ${m.box.t} is in the bottom half of ${m.vh}`);
        } else {
          assert.ok(m.box.l >= insets.left && m.box.w === 320, `${tag} ${label}: 320 px at the left safe edge ${JSON.stringify(m.box)}`);
          assert.ok(m.box.t >= m.stripBottom && m.box.r <= m.vw / 2, `${tag} ${label}: below the strip, in the left half ${JSON.stringify(m.box)}`);
          assert.ok(m.box.h <= m.vh * 0.7 + 0.5, `${tag} ${label}: at most 70 dvh tall`);
        }
      } else {
        assert.equal(m.heading, null, `${tag} ${label}: the rail menu has no heading`);
        assert.equal(m.buttons.some((b) => b.name === "Close"), false, `${tag} ${label}: the rail menu has no Close`);
      }
      return m;
    };
    const shut = async (how, id, label) => {
      if (how === "Escape") await page.keyboard.press("Escape");
      else if (how === "Close") await menu.getByRole("button", { name: "Close" }).click();
      else if (how === "card") await page.locator(`[data-menu-trigger="${id}"]`).click();
      else {
        // A tap on the island above the sheet and clear of the seats and the header.
        const at = await page.evaluate(() => ({ x: innerWidth > innerHeight ? innerWidth * 0.75 : innerWidth / 2, y: innerHeight * 0.3 }));
        await page.mouse.click(at.x, at.y);
      }
      await menu.waitFor({ state: "detached" });
      if (how !== "outside") assert.equal(await focusedTrigger(page), id, `${tag} ${label}: ${how} hands focus back to the card`);
    };

    // Own seat on its main turn: the bank trade row is the first row and takes focus.
    const own = await open("p0", "own seat");
    assert.equal(own.focus, "Trade…", `${tag} own seat: focus on the first row`);
    await page.screenshot({ path: `test-results/seat-menu-sheet-${tag}-own.png` });
    if (phone) {
      await page.keyboard.press("Shift+Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Close", `${tag} own seat: Shift+Tab from the first row reaches Close`);
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), "Trade…", `${tag} own seat: Tab from Close comes back to the first row`);
    }
    await shut("Escape", "p0", "own seat");

    // An opponent offline has no rows: on a phone Close takes focus.
    const opponent = await open("p2", "opponent");
    assert.equal(opponent.focus, phone ? "Close" : null, `${tag} opponent: focus on open`);
    await page.screenshot({ path: `test-results/seat-menu-sheet-${tag}-opponent.png` });
    await shut(phone ? "Close" : "Escape", "p2", "opponent");
    await open("p1", "long name");
    await shut("card", "p1", "long name");
    await open("p3", "empty seat");
    await shut("outside", "p3", "empty seat");

    // A watcher: no seat actions, only Close on a phone.
    await page.evaluate(() => window.__emberisle.setState({ spectator: true }));
    const watcher = await open("p1", "watcher");
    assert.deepEqual(watcher.buttons.map((b) => b.name), phone ? ["Close"] : [], `${tag} watcher: no seat actions`);
    await shut("Escape", "p1", "watcher");
    await page.evaluate(() => window.__emberisle.setState({ spectator: false }));

    // Online (no connection, nothing is pressed): every trade route is still in its menu, in reach.
    await page.evaluate(() => window.__emberisle.setState({ mode: "online" }));
    await page.waitForTimeout(1000);
    const ownOnline = await open("p0", "own seat online");
    for (const row of ["Trade…", "Open chat"]) assert.ok(ownOnline.buttons.some((b) => b.name === row), `${tag}: "${row}" on the own seat online`);
    await page.screenshot({ path: `test-results/seat-menu-sheet-${tag}-own-online.png` });
    await shut("Escape", "p0", "own seat online");
    const oppOnline = await open("p2", "opponent online");
    for (const row of ["Trade…", "Mention @Mira"]) assert.ok(oppOnline.buttons.some((b) => b.name === row), `${tag}: "${row}" on an opponent online`);
    await shut("Escape", "p2", "opponent online");

    console.log(`ok ${tag}${phone ? ` (insets ${JSON.stringify(insets)})` : ""}: no reminder on the seats; reminder last in every ledger; ${phone ? `no seat moves; sheet ${JSON.stringify(own.box)} own, ${JSON.stringify(ownOnline.box)} online, inside the safe area, rows and Close >= 44 px` : "rail menu unchanged"}; focus, Escape, Close, tap outside and the card work; watcher has no actions; all four trade routes`);
    await context.close();
  }
  assert.deepEqual(errors, [], "page errors");
  console.log("seat-menu-sheet-prove: all passed");
} finally {
  await browser.close();
  await vite.close();
}
