// Title, SeatChoice, and SetupPipHints lifecycle and coordinate guards:
// 1. SeatChoice guards against NaN or invalid seatCount, clamping strictly to [4, 5, 6].
// 2. SetupPipHints ignores non-finite (NaN/Infinity) screenOf projections without rendering corrupt styles.
// 3. SetupPipHints clamps tooltip coordinates to viewport bounds so hints stay visible at screen edges.
// 4. SetupPipHints clears anchor and cancels animation frame tracking when opening phase ends.
// 5. Title peekTable debounces code entry and cleans up polling timers on unmount.
// Zero page or console errors. Run: npm run title-setup-guards-prove
import assert from "node:assert/strict";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { createGame } from "../src/lib/game/board.ts";

const STEP_MS = 30_000;
const VIEW = { width: 1280, height: 720 };

let g = createGame({ humans: [{ name: "Ember" }], bots: 3, seed: 11 });
g.phase = "setupSettle";
g.current = "p0";

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

  // 1. SeatChoice: NaN/corrupted store values fall back to 4, and select clamps strictly.
  await page.evaluate(() => {
    const s = window.__emberisle;
    s.setState({ screen: "title", seatCount: NaN });
  });

  await page.getByTestId("title-card").waitFor();
  if ((await page.getByTestId("title-card").getAttribute("data-page")) === "front") {
    await page.getByRole("button", { name: "Play", exact: true }).click();
  }
  await page.getByRole("button", { name: "Play with bots", exact: true }).waitFor();

  const options = page.getByTestId("wayfarer-setup");
  if (!(await options.evaluate((d) => d.open))) {
    await options.locator("summary").click();
  }
  const seatsSelect = page.getByRole("combobox", { name: "Seats", exact: true });
  await seatsSelect.waitFor();

  assert.equal(await seatsSelect.inputValue(), "4", "SeatChoice falls back to 4 when seatCount is NaN");

  await seatsSelect.selectOption("5");
  assert.equal(await page.evaluate(() => window.__emberisle.getState().seatCount), 5, "SeatChoice selects 5");

  await seatsSelect.selectOption("6");
  assert.equal(await page.evaluate(() => window.__emberisle.getState().seatCount), 6, "SeatChoice selects 6");

  await seatsSelect.selectOption("4");
  assert.equal(await page.evaluate(() => window.__emberisle.getState().seatCount), 4, "SeatChoice selects 4");

  // Attempt to dispatch an invalid value
  await page.evaluate(() => {
    const el = document.querySelector('select[aria-label="Seats"]');
    if (el) {
      el.value = "99";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  const clamped = await page.evaluate(() => window.__emberisle.getState().seatCount);
  assert.ok(clamped === 4 || clamped === 5 || clamped === 6, "invalid selection clamps to valid seats");
  console.log("ok   SeatChoice: NaN fallback and bounds clamping");

  // Switch to in-game setup phase for SetupPipHints testing
  await page.evaluate((setupState) => {
    const s = window.__emberisle;
    window.__isle = window.__isle || {};
    s.setState({
      screen: "play",
      mode: "ai",
      localId: "p0",
      state: setupState,
      pendingPlace: null,
    });
  }, g);

  const legalVertexId = g.vertices[0].id;

  // 2. SetupPipHints: non-finite screenOf coordinates must not render corrupt NaN styles
  await page.evaluate((vid) => {
    window.__isle.screenOf = () => ({ x: NaN, y: NaN });
    const s = window.__emberisle;
    s.setState({ pendingPlace: { kind: "vertex", id: vid } });
  }, legalVertexId);
  await page.waitForTimeout(100);

  const nanHints = await page.getByTestId("setup-pip-hint").count();
  assert.equal(nanHints, 0, "SetupPipHints must not render tooltip when coordinates are NaN");
  console.log("ok   SetupPipHints: non-finite projection guard");

  // 3. SetupPipHints: tooltip clamping keeps tooltip within viewport bounds
  // Test near top-left corner (x=5, y=5)
  await page.evaluate((vid) => {
    window.__isle.screenOf = () => ({ x: 5, y: 5 });
    const s = window.__emberisle;
    s.setState({ pendingPlace: { kind: "vertex", id: vid } });
  }, legalVertexId);
  const hint = page.getByTestId("setup-pip-hint");
  await hint.waitFor({ timeout: 5000 });
  const topLeftBox = await hint.boundingBox();
  assert.ok(topLeftBox, "hint is visible");
  assert.ok(topLeftBox.x >= 0, `hint left (${topLeftBox.x}) must be inside viewport >= 0`);
  assert.ok(topLeftBox.y >= 0, `hint top (${topLeftBox.y}) must be inside viewport >= 0`);

  // Test near bottom-right corner (x=1275, y=715)
  await page.evaluate((vid) => {
    window.__isle.screenOf = () => ({ x: 1275, y: 715 });
  }, legalVertexId);
  await page.waitForTimeout(100);
  const bottomRightBox = await hint.boundingBox();
  assert.ok(bottomRightBox, "hint is visible at bottom-right");
  assert.ok(bottomRightBox.x + bottomRightBox.width <= VIEW.width, "hint right edge is inside viewport");
  assert.ok(bottomRightBox.y + bottomRightBox.height <= VIEW.height, "hint bottom edge is inside viewport");
  console.log("ok   SetupPipHints: viewport edge clamping");

  // 4. SetupPipHints: teardown when phase ends
  await page.evaluate(() => {
    const s = window.__emberisle;
    s.setState({ pendingPlace: null, state: { ...s.getState().state, phase: "roll" } });
  });
  await page.waitForTimeout(100);
  assert.equal(await page.getByTestId("setup-pip-hint").count(), 0, "hint removed when setup ends");
  console.log("ok   SetupPipHints: phase teardown");

  // 5. Title: peekTable timer debouncing and teardown
  await page.evaluate(() => {
    window.__peekCalls = [];
    const s = window.__emberisle;
    s.setState({
      screen: "title",
      peekTable: (code) => window.__peekCalls.push(code),
    });
  });
  await page.waitForFunction(() => document.querySelector('input[placeholder="Code"]'));
  const codeInput = page.locator('input[placeholder="Code"]');
  await codeInput.fill("ABCD");
  await page.waitForTimeout(100);
  // Debounce: before 300ms, peekTable should not have fired yet
  let peekCount = await page.evaluate(() => window.__peekCalls.length);
  assert.equal(peekCount, 0, "peekTable is debounced before 300ms");

  await page.waitForTimeout(300);
  peekCount = await page.evaluate(() => window.__peekCalls.length);
  assert.ok(peekCount >= 1, "peekTable fired after debounce");

  // Clearing code cancels polling
  await codeInput.fill("");
  const callsAfterClear = await page.evaluate(() => window.__peekCalls.length);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__peekCalls.length), callsAfterClear, "clearing code cancels peekTable timer");
  console.log("ok   Title: peekTable debounce and timer cleanup");

  assert.equal(errors.length, 0, `zero page or console errors: ${errors.join(", ")}`);
} finally {
  await browser?.close();
  await vite.close();
}

console.log("title-setup-guards-prove: ok");
