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
// #1679: an Escape or an outside tap while the chunk is still held cancels the open, at 1280x720 and 390x844.
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

// #1679: an Escape or an outside tap after a seat press, while the player menu's chunk is still on its way, cancels the open:
// the seat says collapsed, and the menu does not show when the chunk lands. Desktop rail and phone sheet, each way.
async function menuCancelCase(g, phone, how) {
  const tag = `${phone ? "390x844" : "1280x720"} ${how}`;
  const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
  const holdPage = await context.newPage();
  holdPage.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  holdPage.on("pageerror", (e) => errors.push(String(e)));
  // Every request for the menu's module waits here until it is released, the table's idle prefetch included.
  let release;
  const gate = new Promise((r) => (release = r));
  let held = 0;
  let released = 0;
  await holdPage.route(/\/PlayerMenu\.tsx/, async (route) => {
    held++;
    await gate;
    released++;
    await route.continue();
  });
  await holdPage.goto(`http://127.0.0.1:${PORT}/`);
  await holdPage.getByRole("button", { name: "Play with bots", exact: true }).click({ timeout: STEP_MS });
  await holdPage.waitForFunction(() => window.__emberisle?.getState().state);
  await holdPage.evaluate((state) => {
    window.__emberisle.getState().startAi();
    window.__emberisle.setState({ state });
  }, g);
  // The idle prefetch has asked and is held, so the press below waits on a chunk that is not in memory.
  const heldDeadline = Date.now() + STEP_MS;
  while (held === 0 && Date.now() < heldDeadline) await new Promise((r) => setTimeout(r, 50));
  const seat = holdPage.locator(`[data-testid="${phone ? "seat" : "rail"}-p1"] [data-menu-trigger]`);
  await seat.waitFor({ state: "visible", timeout: STEP_MS });
  if (phone) await seat.tap();
  else await seat.click();
  const pressed = await holdPage.evaluate(() => ({
    menuFor: window.__emberisle.getState().menuFor,
    expanded: document.querySelector('[data-menu-trigger="p1"]').getAttribute("aria-expanded"),
    menus: document.querySelectorAll('[data-testid="player-menu"]').length,
  }));
  check(`${tag}: the press waits on a held chunk`, held >= 1 && released === 0 && pressed.menuFor === "p1" && pressed.expanded === "true" && pressed.menus === 0, { held, released, ...pressed });

  // Any menu that mounts from here on is seen, however briefly.
  await holdPage.evaluate(() => {
    window.__menuSeen = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="player-menu"]')) window.__menuSeen = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  if (how === "Escape") {
    // The press focused the seat; focus leaves it first, so the check below sees the cancel put it back.
    const focusBefore = await holdPage.evaluate(() => {
      document.activeElement?.blur();
      return document.activeElement?.getAttribute("data-menu-trigger") ?? document.activeElement?.tagName ?? null;
    });
    check(`${tag}: focus is off the seat before Escape`, focusBefore !== "p1", { focusBefore });
    await holdPage.keyboard.press("Escape");
  } else {
    // A tap on the island, clear of the seats, the header and the menu's place (seat-menu-sheet-prove's spot).
    const at = await holdPage.evaluate(() => ({ x: innerWidth > innerHeight ? innerWidth * 0.75 : innerWidth / 2, y: innerHeight * 0.3 }));
    if (phone) await holdPage.touchscreen.tap(at.x, at.y);
    else await holdPage.mouse.click(at.x, at.y);
  }
  const cancelled = await holdPage.evaluate(() => ({
    menuFor: window.__emberisle.getState().menuFor,
    expanded: document.querySelector('[data-menu-trigger="p1"]').getAttribute("aria-expanded"),
    focus: document.activeElement?.getAttribute("data-menu-trigger") ?? document.activeElement?.tagName ?? null,
  }));
  check(`${tag} before the chunk lands: the open is cancelled and the seat says collapsed`, cancelled.menuFor === null && cancelled.expanded === "false", cancelled);
  if (how === "Escape") check(`${tag} before the chunk lands: Escape puts focus on the seat`, cancelled.focus === "p1", cancelled);

  // Let the chunk through, then wait for it to land: its response finishes, the app's import of it settles (one module
  // record per URL, as above) and two frames render. Only then is "no menu" a fact.
  const finished = holdPage.waitForEvent("requestfinished", { predicate: (r) => /\/PlayerMenu\.tsx/.test(r.url()), timeout: STEP_MS });
  release();
  await finished;
  await holdPage.evaluate(() => import(/* @vite-ignore */ "/src/components/game/PlayerMenu.tsx"));
  await holdPage.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const landed = await holdPage.evaluate(() => ({
    seen: window.__menuSeen,
    menus: document.querySelectorAll('[data-testid="player-menu"]').length,
    menuFor: window.__emberisle.getState().menuFor,
    expanded: document.querySelector('[data-menu-trigger="p1"]').getAttribute("aria-expanded"),
  }));
  check(`${tag} after the chunk lands: no menu appears`, landed.seen === false && landed.menus === 0 && landed.menuFor === null && landed.expanded === "false", { ...landed, released });

  // The cancel leaves the seat working: the next press opens the menu, and its own Escape closes it and hands focus back.
  if (phone) await seat.tap();
  else await seat.click();
  const reopened = await holdPage.getByTestId("player-menu").waitFor({ state: "visible", timeout: STEP_MS }).then(() => true, () => false);
  await holdPage.keyboard.press("Escape");
  const closed = await holdPage.getByTestId("player-menu").waitFor({ state: "detached", timeout: STEP_MS }).then(() => true, () => false);
  const after = await holdPage.evaluate(() => document.activeElement?.getAttribute("data-menu-trigger") ?? null);
  check(`${tag}: the next press opens the menu, and its Escape closes it with focus on the seat`, reopened && closed && after === "p1", { reopened, closed, focus: after });
  await context.close();
}

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

  // --- 7. A cancel while the player menu chunk is held (#1679) ---
  for (const phone of [false, true]) {
    for (const how of ["Escape", "outside tap"]) await menuCancelCase(g, phone, how);
  }

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
