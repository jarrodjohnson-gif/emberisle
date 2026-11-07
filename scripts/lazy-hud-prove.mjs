// #1285: Trade offer popup, discard bar, and take-from bar lazy loading.
// Verifies:
// 1. Initial idle prefetch loads TradeToast and losses chunks at game start.
// 2. The first trade offer appears immediately (< 250ms) with no visible delay.
// 3. A discard prompt appears immediately (< 250ms) with no visible delay.
// 4. A steal victim pick appears immediately (< 250ms) with no visible delay.
// 5. Network failure for losses chunk renders visible alert with Try again.
// 6. Tapping Try again recovers once the network failure clears.
// Run: npm run lazy-hud-prove
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";

const PORT = 8138;
const STEP_MS = 15_000;

function mainGame(seed = 11) {
  let g = createGame({ humans: [{ name: "Ember" }], bots: 3, seed });
  while (g.phase !== "roll") g = applyAction(g, g.current, chooseBotAction(g, g.current)).state;
  g.phase = "main";
  g.current = "p0";
  g.dice = [3, 4];
  const p0 = g.players.find((p) => p.id === "p0");
  if (p0) {
    p0.resources = { timber: 2, clay: 2, wool: 2, grain: 2, ore: 2 };
  }
  return g;
}

mkdirSync("docs/proofs/1285", { recursive: true });

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => {
  const text = m.text();
  if (m.type() === "error" && !text.includes("Failed to load resource") && !text.includes("net::ERR_FAILED")) {
    errors.push(text);
  }
});
page.on("pageerror", (e) => {
  const text = String(e);
  if (!text.includes("Failed to fetch dynamically imported module") && !text.includes("error loading dynamically imported module")) {
    errors.push(text);
  }
});

// Delay all chunk fetches for TradeToast and losses by 1000ms to simulate a throttled connection.
let chunkRequests = 0;
await page.route(/(TradeToast|losses)/, async (route) => {
  chunkRequests++;
  await new Promise((r) => setTimeout(r, 1000));
  await route.continue();
});

try {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Play", exact: true }).click({ timeout: STEP_MS });
  await page.waitForFunction(() => window.__emberisle?.getState().state);

  const g = mainGame();
  await page.evaluate((state) => {
    window.__emberisle.getState().startAi();
    window.__emberisle.setState({ state });
  }, g);

  // Wait for idle prefetch to complete for both TradeToast and losses chunks.
  const endWait = Date.now() + STEP_MS;
  while (chunkRequests < 2 && Date.now() < endWait) {
    await new Promise((r) => setTimeout(r, 50));
  }
  // Allow the 1000ms throttled chunk responses to fully settle in browser memory.
  await page.waitForLoadState("networkidle");
  await new Promise((r) => setTimeout(r, 1100));

  check("idle prefetch fetched throttled chunks early", chunkRequests >= 2, { chunkRequests });

  // --- 1. First trade offer ---
  const t0 = Date.now();
  await page.evaluate(() => {
    window.__emberisle.setState({
      offer: {
        tradeId: "test-trade-1",
        from: "p1",
        fromName: "Dune",
        give: { grain: 1 },
        want: { wool: 1 },
        until: Date.now() + 20_000,
      },
    });
  });

  const toast = page.getByTestId("trade-toast");
  await toast.waitFor({ state: "visible", timeout: STEP_MS });
  const tradeElapsed = Date.now() - t0;
  check("first trade offer appears without delay (< 250ms)", tradeElapsed < 250, { tradeElapsed });

  const toastText = await toast.innerText();
  check("trade offer contains correct prompt", toastText.includes("Dune offers") && toastText.includes("Yes") && toastText.includes("No"), toastText);

  // Clear offer
  await page.evaluate(() => {
    window.__emberisle.setState({ offer: null });
  });
  await toast.waitFor({ state: "hidden", timeout: STEP_MS }).catch(() => {});

  // --- 2. Discard prompt ---
  const t1 = Date.now();
  await page.evaluate(() => {
    const s = window.__emberisle;
    const st = structuredClone(s.getState().state);
    st.phase = "discard";
    st.discardNeeded = { p0: 2 };
    s.setState({ state: st });
  });

  const discardBar = page.locator('form:has-text("Discard 2")');
  await discardBar.waitFor({ state: "visible", timeout: STEP_MS });
  const discardElapsed = Date.now() - t1;
  check("discard prompt appears without delay (< 250ms)", discardElapsed < 250, { discardElapsed });

  // Clear discard
  await page.evaluate(() => {
    const s = window.__emberisle;
    const st = structuredClone(s.getState().state);
    st.phase = "main";
    st.discardNeeded = {};
    s.setState({ state: st });
  });

  // --- 3. Steal victim pick ---
  const t2 = Date.now();
  await page.evaluate(() => {
    window.__emberisle.setState({
      pendingSteal: {
        hexId: "-2,0",
        kind: "moveRobber",
        targets: ["p1", "p2"],
      },
    });
  });

  const stealBar = page.getByRole("group", { name: "The wayfarer takes a card" });
  await stealBar.waitFor({ state: "visible", timeout: STEP_MS });
  const stealElapsed = Date.now() - t2;
  check("steal picker appears without delay (< 250ms)", stealElapsed < 250, { stealElapsed });

  const stealButtons = await stealBar.getByRole("button").allInnerTexts();
  check("steal picker presents both victims", stealButtons.length === 2, stealButtons);

  // Clear steal
  await page.evaluate(() => {
    window.__emberisle.setState({ pendingSteal: null });
  });
  await stealBar.waitFor({ state: "hidden", timeout: STEP_MS }).catch(() => {});

  // --- 4. Failed chunk load and recovery test (discard) ---
  const failPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  let failLosses = true;
  await failPage.route(/losses/, async (route) => {
    if (failLosses) {
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });

  await failPage.goto(`http://127.0.0.1:${PORT}/`);
  await failPage.getByRole("button", { name: "Play", exact: true }).click({ timeout: STEP_MS });
  await failPage.waitForFunction(() => window.__emberisle?.getState().state);

  await failPage.evaluate((state) => {
    window.__emberisle.getState().startAi();
    window.__emberisle.setState({ state });
  }, g);

  // Trigger discard while losses chunk is failing:
  await failPage.evaluate(() => {
    const s = window.__emberisle;
    const st = structuredClone(s.getState().state);
    st.phase = "discard";
    st.discardNeeded = { p0: 2 };
    s.setState({ state: st });
  });

  const discardFailedAlert = failPage.getByTestId("losses-failed");
  await discardFailedAlert.waitFor({ state: "visible", timeout: STEP_MS });
  const discardAlertText = await discardFailedAlert.innerText();
  check("failed discard chunk load shows error message and Try again button", discardAlertText.includes("could not load") && discardAlertText.includes("Try again"), discardAlertText);
  await failPage.screenshot({ path: "docs/proofs/1285/losses-failed-discard.png" });

  // Unblock losses chunk and tap Try again to recover:
  failLosses = false;
  await discardFailedAlert.getByRole("button", { name: "Try again" }).click();
  const recoveredDiscardBar = failPage.locator('form:has-text("Discard 2")');
  await recoveredDiscardBar.waitFor({ state: "visible", timeout: STEP_MS });
  check("tapping Try again recovers discard bar", await recoveredDiscardBar.isVisible());
  await failPage.close();

  // --- 5. Failed chunk load and recovery test (steal picker) ---
  const stealFailPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  let failStealLosses = true;
  await stealFailPage.route(/losses/, async (route) => {
    if (failStealLosses) {
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });

  await stealFailPage.goto(`http://127.0.0.1:${PORT}/`);
  await stealFailPage.getByRole("button", { name: "Play", exact: true }).click({ timeout: STEP_MS });
  await stealFailPage.waitForFunction(() => window.__emberisle?.getState().state);

  await stealFailPage.evaluate((state) => {
    window.__emberisle.getState().startAi();
    window.__emberisle.setState({ state });
  }, g);

  // Trigger steal while losses chunk is failing:
  await stealFailPage.evaluate(() => {
    window.__emberisle.setState({
      pendingSteal: {
        hexId: "-2,0",
        kind: "moveRobber",
        targets: ["p1", "p2"],
      },
    });
  });

  const stealFailedAlert = stealFailPage.getByTestId("losses-failed");
  await stealFailedAlert.waitFor({ state: "visible", timeout: STEP_MS });
  const stealAlertText = await stealFailedAlert.innerText();
  check("failed steal chunk load shows error message and Try again button", stealAlertText.includes("could not load") && stealAlertText.includes("Try again"), stealAlertText);
  await stealFailPage.screenshot({ path: "docs/proofs/1285/losses-failed-steal.png" });

  // Unblock losses chunk and tap Try again to recover steal picker:
  failStealLosses = false;
  await stealFailedAlert.getByRole("button", { name: "Try again" }).click();
  const recoveredStealBar = stealFailPage.getByRole("group", { name: "The wayfarer takes a card" });
  await recoveredStealBar.waitFor({ state: "visible", timeout: STEP_MS });
  check("tapping Try again recovers steal picker", await recoveredStealBar.isVisible());
  await stealFailPage.close();

} finally {
  check("zero console errors", errors.length === 0, errors.slice(0, 5));
  await browser.close();
  await vite.close();
}

if (fails.length > 0) {
  console.error(`lazy-hud-prove FAILED: ${fails.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("lazy-hud-prove ok");
}
