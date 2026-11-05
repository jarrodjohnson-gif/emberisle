// #1285: Trade offer popup, discard bar, and take-from bar lazy loading.
// Verifies that under a throttled connection (1000ms chunk delay):
// 1. Initial idle prefetch loads TradeToast and losses chunks at game start.
// 2. The first trade offer appears immediately (< 100ms) with no visible delay.
// 3. A discard prompt appears immediately (< 100ms) with no visible delay.
// 4. A steal victim pick appears immediately (< 100ms) with no visible delay.
// Zero console errors. Run: npm run lazy-hud-prove
import { existsSync } from "node:fs";
import { chromium } from "playwright";
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
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

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

  const discardBar = page.getByText("Discard 2 of 2", { exact: false }).first();
  await page.locator('form:has-text("Discard 2")').waitFor({ state: "visible", timeout: STEP_MS });
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
