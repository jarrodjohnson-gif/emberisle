// Hand card arrow focus cycling and PlaceChip cancel guards:
// 1. Hand card arrow navigation cycles focus across cards (ArrowRight, ArrowLeft, Home, End).
// 2. PlaceChip resets pending place state on pointercancel, and keeps it on window blur.
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

  // Tab still leaves the tray: arrow handling must not trap focus.
  await page.keyboard.press("Tab");
  activeId = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  assert.notEqual(activeId, "resource-timber", "Tab moves focus off the first card");
  console.log("ok   Hand: keyboard arrow focus cycling, Tab not trapped");

  // 2. PlaceChip: cancelled drag pointer state resets (setup phase, so a vertex placement can be pending)
  await page.evaluate(() => {
    const s = window.__emberisle;
    const cur = s.getState().state;
    s.setState({ state: { ...cur, phase: "setupSettle", current: "p0" }, buildMode: "none" });
  });
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

  // A window blur (alt-tab, dialog) must NOT drop a pending placement.
  await page.evaluate((vid) => {
    window.__emberisle.setState({ pendingPlace: { kind: "vertex", id: vid } });
  }, legalVertexId);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(50);
  pendingState = await page.evaluate(() => window.__emberisle.getState().pendingPlace);
  assert.ok(pendingState, "window blur keeps pendingPlace");
  console.log("ok   PlaceChip: pointercancel resets, blur keeps");

  assert.equal(errors.length, 0, `zero page or console errors: ${errors.join(", ")}`);
} finally {
  await browser?.close();
  await vite.close();
}

console.log("hand-placelist-guards-prove: ok");
