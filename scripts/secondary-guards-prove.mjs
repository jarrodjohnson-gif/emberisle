// Guards for TradeResource (right-click/keyboard contextmenu state, unmount timer cleanup, button type)
// and LobbyTicTacToe (seat picker reset when the last table-mate leaves/goes away or an invite arrives).
import assert from "node:assert/strict";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { createGame } from "../src/lib/game/board.ts";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { RESOURCES, RESOURCE_LABEL } from "../src/lib/game/types.ts";

// Real post-setup game on p0's main turn with wheat in hand.
let base = createGame({ humans: [{ name: "Ember" }], bots: 3, seed: 11 });
for (let guard = 0; base.phase !== "roll"; guard++) {
  assert.ok(guard < 300, "setup must reach first roll");
  const result = applyAction(base, base.current, chooseBotAction(base, base.current));
  assert.equal(result.error, undefined, "setup action must be legal");
  base = result.state;
}
base.players.sort((a, b) => a.id.localeCompare(b.id));
base.phase = "main";
base.current = "p0";
base.dice = [3, 4];
for (const player of base.players) {
  player.kind = "human";
  player.resources = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
}
Object.assign(base.players[0].resources, { timber: 2, clay: 1, wool: 2, grain: 3, ore: 1 });
for (const r of RESOURCES) base.bank[r] = 19 - base.players.reduce((n, p) => n + p.resources[r], 0);

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const URL_ROOT = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const errors = [];
let browser;

const panelFor = (page) => page.getByTestId("trade-panel");
const token = (page, side, r) => panelFor(page).getByTestId(`trade-${side}-${r}`);
const more = (page, side, r) => panelFor(page).getByRole("button", { name: `More ${RESOURCE_LABEL[r]} to ${side}`, exact: true });
const minus = (page, side, r) => panelFor(page).getByTestId(`trade-minus-${side}-${r}`);
const count = (page, side, r) => token(page, side, r).locator("output").textContent().then(Number);

try {
  browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(URL_ROOT);
  await page.waitForFunction(() => !!window.__emberisle);
  await page.evaluate((game) => {
    const api = window.__emberisle;
    api.getState().startAi();
    api.setState({
      state: game, localId: "p0", mode: "ai", tradeOpen: false, buildMode: "none", pendingPlace: null,
      peeking: true, spectator: false, offer: null, declined: [], tradeOutcome: null, tradeTaker: null,
      error: null, announcement: null, toast: null, net: null,
    });
  }, base);
  await page.getByRole("button", { name: "Trade", exact: true }).click();
  await panelFor(page).waitFor();
  await more(page, "give", "grain").waitFor();

  const grainAdd = more(page, "give", "grain");
  await grainAdd.click();
  await grainAdd.click();
  assert.equal(await count(page, "give", "grain"), 2, "two taps select 2 wheat");

  // 1. Both TradeResource buttons declare type="button".
  assert.equal(await grainAdd.getAttribute("type"), "button", "trade-add button has type=button");
  assert.equal(await minus(page, "give", "grain").getAttribute("type"), "button", "trade-remove button has type=button");

  // 2. Mouse right-click does not swallow subsequent keyboard Enter or Space.
  await grainAdd.click({ button: "right" });
  assert.equal(await count(page, "give", "grain"), 1, "right-click decrements wheat to 1");
  await grainAdd.focus();
  await page.keyboard.press("Enter");
  assert.equal(await count(page, "give", "grain"), 2, "Enter increments immediately after right-click");
  await grainAdd.click({ button: "right" });
  assert.equal(await count(page, "give", "grain"), 1, "second right-click decrements wheat to 1");
  await grainAdd.focus();
  await page.keyboard.press("Space");
  assert.equal(await count(page, "give", "grain"), 2, "Space increments immediately after right-click");

  // 3. Consecutive keyboard contextmenu events (without pointerdown) both decrement.
  await grainAdd.dispatchEvent("contextmenu");
  assert.equal(await count(page, "give", "grain"), 1, "first keyboard contextmenu decrements to 1");
  await grainAdd.dispatchEvent("contextmenu");
  assert.equal(await count(page, "give", "grain"), 0, "second keyboard contextmenu decrements to 0");

  // 4. Right-button pointerdown (button: 2) does not arm the 500 ms long-press timer.
  await grainAdd.click();
  await grainAdd.click();
  assert.equal(await count(page, "give", "grain"), 2, "reset wheat count to 2");
  await grainAdd.dispatchEvent("pointerdown", { button: 2 });
  await page.waitForTimeout(650);
  await grainAdd.dispatchEvent("pointerup", { button: 2 });
  assert.equal(await count(page, "give", "grain"), 2, "right-button pointerdown does not fire 500 ms long-press");

  // 5. Left-button long-press and touch-style contextmenu still decrement once and suppress trailing click.
  await grainAdd.dispatchEvent("pointerdown", { button: 0 });
  for (const until = Date.now() + 5000; Date.now() < until && (await count(page, "give", "grain")) !== 1; ) {
    await page.waitForTimeout(40);
  }
  await grainAdd.dispatchEvent("pointerup", { button: 0 });
  await grainAdd.dispatchEvent("click");
  assert.equal(await count(page, "give", "grain"), 1, "left long-press decrements once and suppresses release click");

  await grainAdd.dispatchEvent("pointerdown", { button: 0 });
  await grainAdd.dispatchEvent("contextmenu");
  await grainAdd.dispatchEvent("pointerup", { button: 0 });
  await grainAdd.dispatchEvent("click");
  assert.equal(await count(page, "give", "grain"), 0, "touch contextmenu during primary hold suppresses release click");

  // 6. Unmounting TradeResource mid-hold clears the pending 500 ms timer.
  await grainAdd.click();
  assert.equal(await count(page, "give", "grain"), 1, "select 1 wheat before unmount check");
  await page.evaluate(() => {
    const origSet = window.setTimeout;
    const origClear = window.clearTimeout;
    window.__tradeTimerOrig = { origSet, origClear };
    window.__tradeTimers = [];
    window.setTimeout = (fn, ms, ...args) => {
      if (ms === 500) {
        const rec = { id: 0, cleared: false, fired: false };
        rec.id = origSet(() => { rec.fired = true; return fn(...args); }, ms);
        window.__tradeTimers.push(rec);
        return rec.id;
      }
      return origSet(fn, ms, ...args);
    };
    window.clearTimeout = (id) => {
      const rec = window.__tradeTimers.find((t) => t.id === id);
      if (rec) rec.cleared = true;
      return origClear(id);
    };
  });
  await grainAdd.dispatchEvent("pointerdown", { button: 0 });
  await page.evaluate(() => window.__emberisle.setState({ tradeOpen: false }));
  await panelFor(page).waitFor({ state: "detached" });
  const immediatelyCleared = await page.evaluate(() => window.__tradeTimers.map((t) => ({ cleared: t.cleared, fired: t.fired })));
  assert.equal(immediatelyCleared.length, 1, "pointerdown scheduled one 500 ms hold timer");
  assert.equal(immediatelyCleared[0].cleared, true, "unmounting TradeResource clears the 500 ms timer");
  await page.waitForTimeout(650);
  const afterDelay = await page.evaluate(() => {
    const out = window.__tradeTimers.map((t) => ({ cleared: t.cleared, fired: t.fired }));
    window.setTimeout = window.__tradeTimerOrig.origSet;
    window.clearTimeout = window.__tradeTimerOrig.origClear;
    return out;
  });
  assert.equal(afterDelay[0].fired, false, "unmounted hold timer never fires");
  console.log("TradeResource: type=button, right-click/keyboard contextmenu, button guard, unmount cleanup");

  // 7. LobbyTicTacToe picker resets when last table-mate goes away, leaves, or an invite arrives.
  const twoSeats = [
    { id: "s0", name: "Ember", color: "#b3261e", host: true, ready: false, bot: false, away: false },
    { id: "s1", name: "Tide", color: "#1d5fa7", host: false, ready: false, bot: false, away: false },
  ];
  await page.evaluate((seats) => {
    window.__tttSent = [];
    window.__emberisle.setState({
      screen: "lobby",
      code: "TEST",
      seatId: "s0",
      isHost: true,
      spectator: false,
      seats,
      ttt: null,
      error: null,
      net: { ttt: (...args) => window.__tttSent.push(args) },
    });
  }, twoSeats);
  await page.getByTestId("lobby-card").waitFor();
  await page.getByRole("tab", { name: /Play games/ }).click();
  const tile = page.getByTestId("ttt-tile");
  await tile.waitFor();

  // Open picker, then mark last mate away.
  await tile.getByRole("button", { name: "Play", exact: true }).click();
  assert.equal(await tile.locator(".lx-pick button").count(), 1, "picker lists the active table-mate");
  await page.evaluate((seats) => {
    window.__emberisle.setState({ seats: seats.map((s) => (s.id === "s1" ? { ...s, away: true } : s)) });
  }, twoSeats);
  assert.equal(await tile.locator(".lx-pick").count(), 0, "picker closes when last table-mate goes away");
  assert.match(await tile.textContent(), /Needs a table-mate/, "tile returns to Needs a table-mate when mate goes away");
  assert.equal(await tile.getByRole("button", { name: "Play", exact: true }).isDisabled(), true, "Play is disabled with no active mates");

  // Restore mate: picker must stay closed.
  await page.evaluate((seats) => window.__emberisle.setState({ seats }), twoSeats);
  assert.equal(await tile.locator(".lx-pick").count(), 0, "picker stays closed when mate returns");
  assert.equal(await tile.getByRole("button", { name: "Play", exact: true }).isDisabled(), false, "Play re-enables when mate returns");

  // Open picker, then remove last mate from room.
  await tile.getByRole("button", { name: "Play", exact: true }).click();
  assert.equal(await tile.locator(".lx-pick button").count(), 1, "picker reopens on Play");
  await page.evaluate((seats) => window.__emberisle.setState({ seats: seats.slice(0, 1) }), twoSeats);
  assert.equal(await tile.locator(".lx-pick").count(), 0, "picker closes when last table-mate leaves");
  assert.match(await tile.textContent(), /Needs a table-mate/, "tile returns to Needs a table-mate when mate leaves");

  // Restore mate, open picker, receive an invite, then clear the invite.
  await page.evaluate((seats) => window.__emberisle.setState({ seats }), twoSeats);
  await tile.getByRole("button", { name: "Play", exact: true }).click();
  assert.equal(await tile.locator(".lx-pick button").count(), 1, "picker open before incoming invite");
  await page.evaluate(() => {
    window.__emberisle.setState({
      ttt: { game: { id: "g1", status: "invited", x: "s1", o: "s0", board: ".........", turn: "s1" } },
    });
  });
  assert.match(await tile.textContent(), /Tide wants to play/, "incoming invite replaces picker");
  await page.evaluate(() => {
    window.__emberisle.setState({ ttt: { game: null, reason: "closed", by: "s1" } });
  });
  assert.equal(await tile.locator(".lx-pick").count(), 0, "picker does not resurrect after invite ends");
  assert.equal(await tile.getByRole("button", { name: "Play", exact: true }).count(), 1, "tile returns to idle Play button after invite ends");
  console.log("LobbyTicTacToe: picker resets on mate away, mate leave, and incoming invite");

  assert.deepEqual(errors, [], `unexpected browser errors: ${errors.join("; ")}`);
  console.log("secondary-guards-prove: ok");
} finally {
  await browser?.close();
  await vite.close();
}
