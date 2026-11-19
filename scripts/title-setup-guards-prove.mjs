// SeatChoice and SetupPipHints lifecycle and coordinate guards:
// 1. SeatChoice guards against NaN or invalid seatCount, clamping strictly to [4, 5, 6].
// 2. SetupPipHints ignores non-finite (NaN/Infinity) screenOf projections without rendering corrupt styles.
// 3. SetupPipHints clamps tooltip coordinates to viewport bounds so hints stay visible at screen edges.
// 4. SetupPipHints preserves exact anchor position when the tooltip already fits on screen.
// 5. SetupPipHints clears anchor and cancels animation frame tracking when opening phase ends.
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

  // 1. SeatChoice: Start from 5, then set NaN to ensure it falls back to 4.
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

  // Select 5 first
  await seatsSelect.selectOption("5");
  assert.equal(await page.evaluate(() => window.__emberisle.getState().seatCount), 5, "SeatChoice selects 5");
  assert.equal(await seatsSelect.inputValue(), "5", "SeatChoice reflects 5");

  // Now set seatCount: NaN in store -> must reset select back to 4 without console error
  await page.evaluate(() => {
    window.__emberisle.setState({ seatCount: NaN });
  });
  assert.equal(await seatsSelect.inputValue(), "4", "SeatChoice falls back from 5 to 4 when seatCount is NaN");

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
    window.__screenOfOverride = () => ({ x: 200, y: 200 });
    let _isle = window.__isle;
    Object.defineProperty(window, "__isle", {
      configurable: true,
      get: () => _isle,
      set: (v) => {
        _isle = v;
        if (v && window.__screenOfOverride) {
          v.screenOf = (...args) => window.__screenOfOverride(...args);
        }
      },
    });
    if (_isle) {
      _isle.screenOf = (...args) => window.__screenOfOverride(...args);
    }
    s.setState({
      screen: "play",
      mode: "ai",
      localId: "p0",
      state: setupState,
      pendingPlace: null,
    });
  }, g);

  const legalVertexId = g.vertices[0].id;
  const hint = page.getByTestId("setup-pip-hint");

  // 2. SetupPipHints: finite coordinates show hint, switching to NaN removes it cleanly
  await page.evaluate((vid) => {
    window.__screenOfOverride = () => ({ x: 200, y: 200 });
    const s = window.__emberisle;
    s.setState({ pendingPlace: { kind: "vertex", id: vid } });
  }, legalVertexId);
  await hint.waitFor({ timeout: 5000 });
  assert.equal(await hint.count(), 1, "hint is shown with finite coordinates");

  // Switch to NaN projections
  await page.evaluate(() => {
    window.__screenOfOverride = () => ({ x: NaN, y: NaN });
  });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="setup-pip-hint"]').length === 0, null, { timeout: 3000 });
  assert.equal(await hint.count(), 0, "SetupPipHints removes tooltip when coordinates become NaN");
  console.log("ok   SetupPipHints: non-finite projection guard");

  // 3. SetupPipHints: tooltip clamping keeps tooltip within viewport bounds
  // Test near top-left corner (x=5, y=5)
  await page.evaluate((vid) => {
    window.__screenOfOverride = () => ({ x: 5, y: 5 });
    const s = window.__emberisle;
    s.setState({ pendingPlace: { kind: "vertex", id: vid } });
  }, legalVertexId);
  await hint.waitFor({ timeout: 5000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="setup-pip-hint"]');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0;
  });
  const topLeftBox = await hint.boundingBox();
  assert.ok(topLeftBox, "hint is visible at top-left");
  assert.ok(topLeftBox.x >= 0, `hint left (${topLeftBox.x}) must be inside viewport >= 0`);
  assert.ok(topLeftBox.y >= 0, `hint top (${topLeftBox.y}) must be inside viewport >= 0`);

  // Test near bottom-right corner (x=1275, y=715)
  await page.evaluate(() => {
    window.__screenOfOverride = () => ({ x: 1275, y: 715 });
  });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="setup-pip-hint"]');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.right <= 1280 && r.bottom <= 720 && r.left > 1000;
  });
  const bottomRightBox = await hint.boundingBox();
  assert.ok(bottomRightBox, "hint is visible at bottom-right");
  assert.ok(bottomRightBox.x + bottomRightBox.width <= VIEW.width, "hint right edge is inside viewport");
  assert.ok(bottomRightBox.y + bottomRightBox.height <= VIEW.height, "hint bottom edge is inside viewport");
  console.log("ok   SetupPipHints: viewport edge clamping");

  // 4. SetupPipHints: hints that already fit on screen keep their exact position
  // 4a. Centered hint at (400, 300)
  await page.evaluate(() => {
    window.__screenOfOverride = () => ({ x: 400, y: 300 });
  });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="setup-pip-hint"]');
    return el && el.style.left === "400px" && el.style.top === "300px";
  });
  const midBox = await hint.boundingBox();
  assert.ok(midBox, "hint is visible at center");
  const centerX = midBox.x + midBox.width / 2;
  assert.ok(Math.abs(centerX - 400) < 1, `unclamped hint center (${centerX}) must match anchor.x (400)`);

  // 4b. In-view hint near edge at (60, 40) must preserve exact position without shifting
  await page.evaluate(() => {
    window.__screenOfOverride = () => ({ x: 60, y: 40 });
  });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="setup-pip-hint"]');
    return el && el.style.left === "60px" && el.style.top === "40px";
  });
  const nearEdgeBox = await hint.boundingBox();
  assert.ok(nearEdgeBox, "hint is visible near edge at (60, 40)");
  const nearEdgeCenterX = nearEdgeBox.x + nearEdgeBox.width / 2;
  assert.ok(Math.abs(nearEdgeCenterX - 60) < 1, `in-view edge hint center (${nearEdgeCenterX}) matches anchor.x (60)`);
  assert.equal(await hint.evaluate((el) => el.style.left), "60px", "edge hint left matches exact anchor without shift");
  assert.equal(await hint.evaluate((el) => el.style.top), "40px", "edge hint top matches exact anchor without shift");
  console.log("ok   SetupPipHints: exact position preserved when fitting");

  // 5. SetupPipHints: teardown when phase ends
  await page.evaluate(() => {
    const s = window.__emberisle;
    s.setState({ pendingPlace: null, state: { ...s.getState().state, phase: "roll" } });
  });
  await page.waitForTimeout(100);
  assert.equal(await hint.count(), 0, "hint removed when setup ends");
  console.log("ok   SetupPipHints: phase teardown");

  assert.equal(errors.length, 0, `zero page or console errors: ${errors.join(", ")}`);
} finally {
  await browser?.close();
  await vite.close();
}

console.log("title-setup-guards-prove: ok");
