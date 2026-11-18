// Guards for useFocusTrap (nested traps, hidden elements, empty traps), useBackdropClose (primary button & down reset),
// and TableMenu (CopyFallback focus theft, OPEN_SOUND_EVENT stale state).
import assert from "node:assert/strict";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { createGame } from "../src/lib/game/board.ts";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { applyAction } from "../src/lib/game/rules.ts";

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
for (const player of base.players) player.kind = "human";

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const URL_ROOT = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const errors = [];
let browser;

try {
  browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  // Remove clipboard so TableMenu uses CopyFallback (same as LAN HTTP / CI).
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  });
  await page.goto(URL_ROOT);
  await page.waitForFunction(() => !!window.__emberisle);
  await page.evaluate((game) => {
    const api = window.__emberisle;
    api.getState().startAi();
    api.setState({
      state: game,
      localId: "p0",
      mode: "online",
      code: "K7QP",
      seatId: "s0",
      isHost: true,
      spectator: false,
      seats: [
        { id: "s0", name: "Ember", color: "#b3261e", host: true, ready: true, bot: false, away: false, player: "p0" },
        { id: "s1", name: "Tide", color: "#1d5fa7", host: false, ready: true, bot: false, away: false, player: "p1" },
      ],
      net: { act: () => true, close: () => {}, playAgain: () => {}, wantAgain: () => {}, ttt: () => {} },
      tradeOpen: false,
      buildMode: "none",
      pendingPlace: null,
      howTo: false,
      costs: false,
      error: null,
      announcement: null,
      toast: null,
    });
  }, base);
  const trigger = page.getByRole("button", { name: "Table menu", exact: true });
  await trigger.waitFor();

  // --- Check 1: useFocusTrap nested traps, hidden element skip, empty trap ---
  // 1a. Mount CostCard (z-30, trap #1), then stack GameLog (z-50, trap #2) on top.
  await page.evaluate(() => window.__emberisle.getState().setCosts(true, document.querySelector('[aria-label="Table menu"]')));
  const costCard = page.getByTestId("cost-card");
  await costCard.waitFor();
  await trigger.evaluate((el) => el.click());
  await page.getByTestId("log-entry").waitFor();
  await page.getByTestId("log-entry").evaluate((el) => el.click());
  const gameLog = page.getByTestId("game-log");
  await gameLog.waitFor();
  assert.equal(
    await gameLog.evaluate((el) => el.contains(document.activeElement) && document.activeElement?.getAttribute("aria-label")),
    "Close",
    "GameLog opens on top with focus on Close",
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await gameLog.evaluate((el) => el.contains(document.activeElement) && document.activeElement?.tagName),
    "OL",
    "nested focus trap advances Tab to second stop inside GameLog",
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await gameLog.evaluate((el) => el.contains(document.activeElement) && document.activeElement?.getAttribute("aria-label")),
    "Close",
    "nested focus trap wraps Tab back to Close inside GameLog",
  );
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await gameLog.evaluate((el) => el.contains(document.activeElement) && document.activeElement?.tagName),
    "OL",
    "nested focus trap wraps Shift+Tab to last stop inside GameLog",
  );

  // 1b. Hidden button inside GameLog is skipped by Tab cycling.
  await gameLog.evaluate((el) => {
    const b = document.createElement("button");
    b.id = "trap-hidden-btn";
    b.hidden = true;
    b.textContent = "Hidden";
    el.appendChild(b);
    el.querySelector('button[aria-label="Close"]')?.focus();
  });
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), "OL", "Tab skips hidden button to list");
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
    "Close",
    "second Tab skips hidden button and wraps to Close",
  );
  await gameLog.evaluate((el) => el.querySelector("#trap-hidden-btn")?.remove());

  // 1c. Empty focusable list still prevents Tab from escaping the modal.
  await gameLog.evaluate((el) => {
    const btn = el.querySelector('button[aria-label="Close"]');
    const ol = el.querySelector("ol");
    btn.disabled = true;
    ol.removeAttribute("tabindex");
    btn.blur();
  });
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement === document.body || document.querySelector('[data-testid="game-log"]')?.contains(document.activeElement)),
    true,
    "Tab does not escape an empty modal to page controls behind it",
  );
  await gameLog.evaluate((el) => {
    el.querySelector('button[aria-label="Close"]').disabled = false;
    el.querySelector("ol").setAttribute("tabindex", "0");
  });

  // Close top trap (GameLog) via Close button: underlying CostCard trap resumes cleanly.
  await gameLog.getByRole("button", { name: "Close", exact: true }).click();
  await gameLog.waitFor({ state: "detached" });
  await page.keyboard.press("Tab");
  assert.equal(
    await costCard.evaluate((el) => el.contains(document.activeElement)),
    true,
    "underlying CostCard trap resumes trapping Tab after top trap closes",
  );
  await costCard.getByRole("button", { name: "Close", exact: true }).click();
  await costCard.waitFor({ state: "detached" });
  console.log("useFocusTrap: nested stack, hidden skip, empty-list trap");

  // --- Check 2: useBackdropClose primary-button guard & stale down reset ---
  await page.evaluate(() => window.__emberisle.getState().setCosts(true, document.querySelector('[aria-label="Table menu"]')));
  await costCard.waitFor();
  const costBackdrop = page.locator('div:has(> [data-testid="cost-card"])');

  // Right-button pointerdown + click on backdrop must NOT close.
  await costBackdrop.dispatchEvent("pointerdown", { button: 2 });
  await costBackdrop.dispatchEvent("click");
  assert.equal(await costCard.count(), 1, "right-button pointerdown on backdrop does not close CostCard");

  // Primary pointerdown on backdrop followed by click inside dialog clears `down`,
  // so a subsequent click on backdrop without pointerdown must NOT close.
  await costBackdrop.dispatchEvent("pointerdown", { button: 0 });
  await costCard.dispatchEvent("click");
  assert.equal(await costCard.count(), 1, "click inside CostCard does not close it");
  await costBackdrop.dispatchEvent("click");
  assert.equal(await costCard.count(), 1, "stale backdrop down flag cleared after inner click");

  // Real primary pointerdown + click on backdrop closes CostCard.
  await costBackdrop.dispatchEvent("pointerdown", { button: 0 });
  await costBackdrop.dispatchEvent("click");
  await costCard.waitFor({ state: "detached" });
  console.log("useBackdropClose: primary-button guard and down reset");

  // --- Check 3: TableMenu CopyFallback focus theft, OPEN_SOUND_EVENT ---
  // 3a. Copy code (no clipboard) -> Sound -> Escape must focus sound-entry, not copy-fallback.
  await trigger.click();
  const menu = page.getByTestId("table-menu");
  await menu.waitFor();
  await menu.getByRole("button", { name: "Copy code K7QP" }).click();
  await page.getByTestId("copy-fallback").waitFor();
  await page.getByTestId("sound-entry").click();
  await page.getByTestId("sound-back").waitFor();
  await page.keyboard.press("Escape");
  await page.getByTestId("sound-entry").waitFor();
  assert.equal(await page.getByTestId("copy-fallback").count(), 0, "entering Sound clears stale CopyFallback");
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("data-testid")),
    "sound-entry",
    "Escape from Sound returns focus to sound-entry without CopyFallback stealing it",
  );

  // 3b. Leave confirm open + OPEN_SOUND_EVENT -> single Escape returns from SoundSheet.
  await menu.getByRole("button", { name: "Leave table" }).click();
  await page.getByTestId("leave-confirm").waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event("emberisle:open-sound")));
  await page.getByTestId("sound-back").waitFor();
  await page.keyboard.press("Escape");
  await page.getByTestId("sound-entry").waitFor();
  assert.equal(await page.getByTestId("sound-sheet").count(), 0, "first Escape leaves SoundSheet even if Leave confirm was open");
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  console.log("TableMenu: CopyFallback reset and OPEN_SOUND_EVENT cleanup");

  assert.deepEqual(errors, [], `unexpected browser errors: ${errors.join("; ")}`);
  console.log("sheets-focus-guards-prove: ok");
} finally {
  await browser?.close();
  await vite.close();
}
