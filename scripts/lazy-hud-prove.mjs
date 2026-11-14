// #1285: Trade offer popup, discard bar, and take-from bar lazy loading.
// Verifies:
// 1. Initial idle prefetch loads TradeToast and losses chunks at game start.
// 2. The first trade offer appears immediately (< 250ms) with no visible delay.
// 3. A discard prompt appears immediately (< 250ms) with no visible delay.
// 4. A steal victim pick appears immediately (< 250ms) with no visible delay.
// 5. Network failure for losses chunk renders visible alert with Try again.
// 6. Tapping Try again recovers once the network failure clears.
// #1665: the player menu is its own chunk. The title never asks for it; the table fetches it on idle, so the first open
// shows without delay (< 250ms); a refused load closes the menu with the table standing, and the next press opens it.
// Run: npm run lazy-hud-prove
import { mkdirSync } from "node:fs";
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

// #1678: section 6 on a phone. The seat strip's chip opens the bottom sheet in Hud.tsx, which has its own LazyBoundary: a
// refused load closes the sheet with the table standing and the chip collapsed, and the next press opens it.
async function phoneMenuRefused(g) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phonePage = await context.newPage();
  // The refused load is expected, as are React's report of it reaching the boundary; any other error counts.
  phonePage.on("console", (m) => {
    const text = m.text();
    if (m.type() === "error" && !text.includes("Failed to load resource") && !text.includes("net::ERR_FAILED") && !text.includes("Failed to fetch dynamically imported module")) errors.push(text);
  });
  phonePage.on("pageerror", (e) => {
    const text = String(e);
    if (!text.includes("Failed to fetch dynamically imported module") && !text.includes("error loading dynamically imported module")) errors.push(text);
  });
  let fail = true;
  let blocked = 0;
  await phonePage.route(/\/PlayerMenu\.tsx/, async (route) => {
    if (fail) {
      blocked++;
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  await phonePage.goto(`http://127.0.0.1:${PORT}/`);
  await phonePage.getByRole("button", { name: "Play with bots", exact: true }).click({ timeout: STEP_MS });
  await phonePage.waitForFunction(() => window.__emberisle?.getState().state);
  await phonePage.evaluate((state) => {
    window.__emberisle.getState().startAi();
    window.__emberisle.setState({ state });
  }, g);
  const chip = phonePage.getByTestId("seat-p1").locator("[data-menu-trigger]");
  await chip.waitFor({ state: "visible", timeout: STEP_MS });
  const before = blocked;
  await chip.tap();
  const closed = await phonePage
    .waitForFunction(() => window.__emberisle.getState().menuFor === null && document.querySelector('[data-testid="seat-p1"] [data-menu-trigger]').getAttribute("aria-expanded") === "false", null, { timeout: STEP_MS })
    .then(() => true, () => false);
  const refused = await phonePage.evaluate(() => ({
    menus: document.querySelectorAll('[data-testid="player-menu"]').length,
    expanded: document.querySelector('[data-testid="seat-p1"] [data-menu-trigger]')?.getAttribute("aria-expanded") ?? null,
    screen: window.__emberisle.getState().screen,
    header: !!document.querySelector("header.hud-header"),
    strip: !!document.querySelector('[data-testid="seat-strip"] [data-testid="seat-p1"]'),
  }));
  check("390x844 failed player menu chunk: the press is refused, the sheet closes, the chip is collapsed and the table stands", closed && blocked > before && refused.menus === 0 && refused.expanded === "false" && refused.screen === "play" && refused.header && refused.strip, { ...refused, closed, blocked, before });
  fail = false;
  const pressed = await chip.tap({ timeout: STEP_MS }).then(() => true, () => false);
  const opened = pressed && (await phonePage.getByTestId("player-menu").waitFor({ state: "visible", timeout: STEP_MS }).then(() => true, () => false));
  const expanded = opened ? await chip.getAttribute("aria-expanded") : null;
  check("390x844 once the route recovers, the next press opens the player menu sheet", opened && expanded === "true", { pressed, opened, expanded });
  await context.close();
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

// #1665: every request the page makes for the player menu's module, from the title on.
const menuRequests = [];
page.on("request", (r) => {
  if (/\/PlayerMenu\.tsx/.test(r.url())) menuRequests.push(r.url());
});

// Time from the store update to the prompt being in the DOM, measured inside the page: a MutationObserver fires at React's
// commit, so the figure leaves out Playwright's polling and its round trips, which a starved runner stretches by whole
// frames. The 250 ms bound is unchanged.
const FIND = {
  trade: () => document.querySelector('[data-testid="trade-toast"]'),
  // #1546: the discard is the tray's token picker with its "Discard N" button, no longer a form.
  discard: () => [...document.querySelectorAll('[data-testid="discard-pick"]')].find((f) => f.textContent.includes("Discard 2")),
  steal: () => document.querySelector('[role="group"][aria-label="The wayfarer takes a card"]'),
  menu: () => document.querySelector('[data-testid="player-menu"]'),
};
const timeToAppear = (kind, trigger) =>
  page.evaluate(
    ([kind, trigger, find]) =>
      new Promise((resolve) => {
        const found = new Function(`return (${find[kind]})()`);
        const start = performance.now();
        const observer = new MutationObserver(() => {
          if (found()) {
            observer.disconnect();
            resolve(performance.now() - start);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        new Function(trigger)();
        if (found()) {
          observer.disconnect();
          resolve(performance.now() - start);
        }
        setTimeout(() => resolve(Infinity), 15_000);
      }),
    [kind, trigger, Object.fromEntries(Object.entries(FIND).map(([k, f]) => [k, f.toString()]))],
  );

try {
  // The title's own idle prefetch (the sheets) has run by the time its request is seen; the player menu is not asked for.
  const titleIdle = page.waitForRequest(/\/src\/components\/game\/sheets\.ts(\?|$)/, { timeout: STEP_MS });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await titleIdle;
  check("title does not request the player menu chunk", menuRequests.length === 0, menuRequests);
  await page.getByRole("button", { name: "Play with bots", exact: true }).click({ timeout: STEP_MS });
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
  check("idle prefetch fetched throttled chunks early", chunkRequests >= 2, { chunkRequests });
  // Wait for the real event, not a clock: the throttled response is only the first step. Vite then transforms and serves the
  // chunk's own imports, which takes as long as the runner is slow. The browser keeps one module record per URL, so this
  // import settles when the prefetch the app started has fetched and evaluated the whole graph (the app's own handler on
  // that load was attached first, so it has already run).
  await page.evaluate(() =>
    Promise.all([
      import(/* @vite-ignore */ "/src/components/game/TradeToast.tsx"),
      import(/* @vite-ignore */ "/src/components/game/losses.ts"),
    ]),
  );

  // The table's idle prefetch asks for the player menu; this import settles once that load has evaluated (see above).
  const menuDeadline = Date.now() + STEP_MS;
  while (menuRequests.length === 0 && Date.now() < menuDeadline) await new Promise((r) => setTimeout(r, 50));
  check("table idle prefetch requests the player menu chunk", menuRequests.length >= 1, menuRequests);
  await page.evaluate(() => import(/* @vite-ignore */ "/src/components/game/PlayerMenu.tsx"));

  // --- 0. First player menu open ---
  const menuElapsed = await timeToAppear("menu", `document.querySelector('[data-testid="rail-p1"] [data-menu-trigger]').click()`);
  const menu = page.getByTestId("player-menu");
  await menu.waitFor({ state: "visible", timeout: STEP_MS });
  check("first player menu opens without delay (< 250ms)", menuElapsed < 250, { menuElapsed });
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden", timeout: STEP_MS });

  // --- 1. First trade offer ---
  const tradeElapsed = await timeToAppear(
    "trade",
    `window.__emberisle.setState({ offer: { tradeId: "test-trade-1", from: "p1", fromName: "Dune", give: { grain: 1 }, want: { wool: 1 }, until: Date.now() + 20_000 } })`,
  );
  const toast = page.getByTestId("trade-toast");
  await toast.waitFor({ state: "visible", timeout: STEP_MS });
  check("first trade offer appears without delay (< 250ms)", tradeElapsed < 250, { tradeElapsed });

  const toastText = await toast.innerText();
  check("trade offer contains correct prompt", /^Dune: give \d+ \w+, get \d+ \w+/.test(toastText) && toastText.includes("Yes") && toastText.includes("No"), toastText);

  // Clear offer
  await page.evaluate(() => {
    window.__emberisle.setState({ offer: null });
  });
  await toast.waitFor({ state: "hidden", timeout: STEP_MS }).catch(() => {});

  // --- 2. Discard prompt ---
  const discardElapsed = await timeToAppear(
    "discard",
    `const s = window.__emberisle; const st = structuredClone(s.getState().state); st.phase = "discard"; st.discardNeeded = { p0: 2 }; s.setState({ state: st });`,
  );
  const discardBar = page.locator('[data-testid="discard-pick"]:has-text("Discard 2")');
  await discardBar.waitFor({ state: "visible", timeout: STEP_MS });
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
  const stealElapsed = await timeToAppear(
    "steal",
    `window.__emberisle.setState({ pendingSteal: { hexId: "-2,0", kind: "moveRobber", targets: ["p1", "p2"] } })`,
  );
  const stealBar = page.getByRole("group", { name: "The wayfarer takes a card" });
  await stealBar.waitFor({ state: "visible", timeout: STEP_MS });
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
  await failPage.getByRole("button", { name: "Play with bots", exact: true }).click({ timeout: STEP_MS });
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
  const recoveredDiscardBar = failPage.locator('[data-testid="discard-pick"]:has-text("Discard 2")');
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
  await stealFailPage.getByRole("button", { name: "Play with bots", exact: true }).click({ timeout: STEP_MS });
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

  // --- 6, phone: the same through the seat strip and the bottom sheet (#1678) ---
  await phoneMenuRefused(g);

  // --- 6. Failed player menu chunk: the menu closes, the table stands, and the next press opens it ---
  const menuFailPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  let failMenu = true;
  let menuBlocked = 0;
  await menuFailPage.route(/\/PlayerMenu\.tsx/, async (route) => {
    if (failMenu) {
      menuBlocked++;
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  await menuFailPage.goto(`http://127.0.0.1:${PORT}/`);
  await menuFailPage.getByRole("button", { name: "Play with bots", exact: true }).click({ timeout: STEP_MS });
  await menuFailPage.waitForFunction(() => window.__emberisle?.getState().state);
  await menuFailPage.evaluate((state) => {
    window.__emberisle.getState().startAi();
    window.__emberisle.setState({ state });
  }, g);
  const menuTrigger = menuFailPage.getByTestId("rail-p1").locator("[data-menu-trigger]");
  const blockedBefore = menuBlocked;
  await menuTrigger.click();
  await menuFailPage.waitForFunction(() => window.__emberisle.getState().menuFor === null && document.querySelector('[data-testid="rail-p1"] [data-menu-trigger]').getAttribute("aria-expanded") === "false", null, { timeout: STEP_MS });
  const menuFailed = await menuFailPage.evaluate(() => ({
    menus: document.querySelectorAll('[data-testid="player-menu"]').length,
    screen: window.__emberisle.getState().screen,
    header: !!document.querySelector("header.hud-header"),
    rail: !!document.querySelector('[data-testid="rail-p1"]'),
  }));
  check("failed player menu chunk: the press is refused, the menu closes and the table stands", menuBlocked > blockedBefore && menuFailed.menus === 0 && menuFailed.screen === "play" && menuFailed.header && menuFailed.rail, { ...menuFailed, blocked: menuBlocked, before: blockedBefore });
  failMenu = false;
  await menuTrigger.click();
  const recoveredMenu = menuFailPage.getByTestId("player-menu");
  await recoveredMenu.waitFor({ state: "visible", timeout: STEP_MS });
  check("once the route recovers, the next press opens the player menu", (await recoveredMenu.isVisible()) && (await menuTrigger.getAttribute("aria-expanded")) === "true");
  await menuFailPage.close();

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
