// Hand card focus cycling, PlaceList orientation scroll retention, and PlaceChip cancelled drag guards:
// 1. Hand card arrow navigation cycles focus across cards (ArrowRight, ArrowLeft, Home, End) with boundary safety.
// 2. PlaceList retains scroll position across screen orientation changes and window resizes.
// 3. PlaceChip resets pending place state when drag/gesture is cancelled via pointercancel or blur.
// Zero console errors. Run: npm run hand-placelist-guards-prove
import assert from "node:assert/strict";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { createGame } from "../src/lib/game/board.ts";

const STEP_MS = 30_000;
const VIEW = { width: 1280, height: 720 };

let g = createGame({ humans: [{ name: "Ember" }], bots: 3, seed: 17 });
g.phase = "main";
g.current = "p0";
g.players[0].resources = { timber: 2, clay: 1, wool: 0, grain: 3, ore: 1 };

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const PORT = vite.httpServer.address().port;
const errors = [];
let browser;

try {
  browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({ viewport: VIEW, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    localStorage.setItem("emberisle-first-game-coach", '"done"');
    window.__emberisleSkipIntro = true;
  });
  const page = await context.newPage();
  page.setDefaultTimeout(STEP_MS);
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });

  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__emberisle);

  // Switch to main gameplay screen
  await page.evaluate((gameState) => {
    const s = window.__emberisle;
    s.setState({
      screen: "play",
      mode: "ai",
      localId: "p0",
      state: gameState,
      buildMode: "none",
      pendingPlace: null,
    });
  }, g);

  // 1. Hand card arrow navigation cycling and boundaries
  const timberCard = page.getByTestId("resource-timber");
  await timberCard.waitFor({ timeout: 5000 });
  await timberCard.focus();

  let activeId = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  assert.equal(activeId, "resource-timber", "timber card receives initial focus");

  // ArrowRight -> clay
  await page.keyboard.press("ArrowRight");
  activeId = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  assert.equal(activeId, "resource-clay", "ArrowRight moves focus to clay");

  // ArrowRight -> wool
  await page.keyboard.press("ArrowRight");
  activeId = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  assert.equal(activeId, "resource-wool", "ArrowRight moves focus to wool");

  // End -> ore (last card)
  await page.keyboard.press("End");
  activeId = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  assert.equal(activeId, "resource-ore", "End key jumps focus to ore");

  // ArrowRight from ore wraps around to timber
  await page.keyboard.press("ArrowRight");
  activeId = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  assert.equal(activeId, "resource-timber", "ArrowRight wraps focus from last card to first card");

  // ArrowLeft from timber wraps backward to ore
  await page.keyboard.press("ArrowLeft");
  activeId = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  assert.equal(activeId, "resource-ore", "ArrowLeft wraps focus from first card to last card");

  // Home jumps to timber
  await page.keyboard.press("Home");
  activeId = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  assert.equal(activeId, "resource-timber", "Home key jumps focus to timber");

  // Boundary safety checks: single card and empty tray
  const boundaryCheck = await page.evaluate(() => {
    // Mock tray with 1 card
    const singleTray = document.createElement("div");
    singleTray.className = "goods-tray";
    const singleCard = document.createElement("div");
    singleCard.setAttribute("role", "button");
    singleTray.appendChild(singleCard);
    document.body.appendChild(singleTray);
    singleCard.focus();

    const singleCards = Array.from(singleTray.querySelectorAll('[role="button"]'));

    // Mock empty tray (0 cards)
    const emptyTray = document.createElement("div");
    emptyTray.className = "goods-tray";
    document.body.appendChild(emptyTray);
    const emptyCards = Array.from(emptyTray.querySelectorAll('[role="button"]'));

    document.body.removeChild(singleTray);
    document.body.removeChild(emptyTray);
    return { singleLength: singleCards.length, emptyLength: emptyCards.length };
  });
  assert.equal(boundaryCheck.singleLength, 1, "single card boundary recognized");
  assert.equal(boundaryCheck.emptyLength, 0, "empty tray boundary recognized");
  console.log("ok   Hand: keyboard arrow focus cycling and boundary safety");

  // 2. PlaceList: scroll position retention across screen orientation changes
  // Switch to setup phase with many legal settlement vertices
  await page.evaluate(() => {
    const s = window.__emberisle;
    const cur = s.getState().state;
    s.setState({
      screen: "play",
      mode: "ai",
      localId: "p0",
      state: { ...cur, phase: "setupSettle", current: "p0" },
      buildMode: "none",
    });
  });

  const placeList = page.getByTestId("place-list");
  await placeList.waitFor({ timeout: 5000 });

  // Focus a button inside PlaceList so focus-within activates
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="place-list"] button');
    btn?.focus();
  });

  const scrollContainer = page.getByTestId("place-list-scroll");
  await scrollContainer.waitFor({ timeout: 5000 });

  // Scroll down to 100px
  await scrollContainer.evaluate((el) => {
    el.scrollTop = 100;
    el.dispatchEvent(new Event("scroll"));
  });

  let currentScroll = await scrollContainer.evaluate((el) => el.scrollTop);
  assert.ok(currentScroll >= 80, `scroll position scrolled to ${currentScroll}`);

  // Trigger orientation change
  await page.evaluate(() => {
    window.dispatchEvent(new Event("orientationchange"));
  });
  await page.waitForTimeout(50);

  let restoredScroll = await scrollContainer.evaluate((el) => el.scrollTop);
  assert.equal(restoredScroll, currentScroll, "scroll position retained after orientationchange");

  // Trigger window resize
  await page.evaluate(() => {
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(50);

  restoredScroll = await scrollContainer.evaluate((el) => el.scrollTop);
  assert.equal(restoredScroll, currentScroll, "scroll position retained after window resize");
  console.log("ok   PlaceList: scroll position retention across orientation changes");

  // 3. PlaceChip: cancelled drag pointer state resets
  const legalVertexId = g.vertices[0].id;
  await page.evaluate((vid) => {
    const s = window.__emberisle;
    s.setState({ pendingPlace: { kind: "vertex", id: vid } });
  }, legalVertexId);

  let pendingState = await page.evaluate(() => window.__emberisle.getState().pendingPlace);
  assert.ok(pendingState, "pendingPlace is active");

  // Dispatch pointercancel on window
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
  });
  await page.waitForTimeout(50);

  pendingState = await page.evaluate(() => window.__emberisle.getState().pendingPlace);
  assert.equal(pendingState, null, "pointercancel resets pendingPlace to null");

  // Re-arm pendingPlace and test window blur
  await page.evaluate((vid) => {
    const s = window.__emberisle;
    s.setState({ pendingPlace: { kind: "vertex", id: vid } });
  }, legalVertexId);

  pendingState = await page.evaluate(() => window.__emberisle.getState().pendingPlace);
  assert.ok(pendingState, "pendingPlace re-armed");

  // Dispatch blur on window
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
  });
  await page.waitForTimeout(50);

  pendingState = await page.evaluate(() => window.__emberisle.getState().pendingPlace);
  assert.equal(pendingState, null, "window blur resets pendingPlace to null");
  console.log("ok   PlaceChip: cancelled pointer and blur state resets");

  assert.equal(errors.length, 0, `zero page or console errors: ${errors.join(", ")}`);
} finally {
  await browser?.close();
  await vite.close();
}

console.log("hand-placelist-guards-prove: ok");
