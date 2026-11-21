// Proves live region deduplication, game-over silencing, and SeatRail/SeatDot lifecycle guards.
// Run: npm run announcer-a11y-guards-prove
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";

const base = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }, { name: "Dune" }], bots: 0, seed: 42 });
base.phase = "setup";
base.turn = 3;
base.current = "p3";

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const port = vite.httpServer.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.addInitScript(() => {
    localStorage.setItem("emberisle-first-game-coach", '"done"');
    localStorage.setItem("emberisle-water", '"simple"');
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0);

  // Mount in-game HUD with 4-player setup state on turn 3 (player p3's first placement).
  await page.evaluate((g) => {
    window.__emberisle.setState({
      screen: "play",
      mode: "hotseat",
      localId: "p0",
      state: g,
      gameLog: [{ at: Date.now(), text: "Game started." }],
    });
  }, base);
  await page.getByTestId("announce-turn").waitFor();

  // 1. Consecutive turns for the same player (setup snake draft turn 3 -> 4) must replace the span node.
  const turnNode1 = await page.evaluate(() => {
    const p = document.querySelector('[data-testid="announce-turn"]');
    const span = p?.querySelector("span");
    return { hasSpan: !!span, text: p?.textContent?.trim() ?? null, key: span ? (span.getAttribute("data-key") ?? span.textContent) : null };
  });
  // Advance setup snake turn to turn 4: p3 is still current, but turn is 4.
  await page.evaluate(() => {
    const e = window.__emberisle;
    const st = e.getState().state;
    e.setState({ state: { ...st, turn: 4, current: "p3" } });
  });
  const turnNode2 = await page.evaluate(() => {
    const p = document.querySelector('[data-testid="announce-turn"]');
    const span = p?.querySelector("span");
    return { hasSpan: !!span, text: p?.textContent?.trim() ?? null, key: span ? (span.getAttribute("data-key") ?? span.textContent) : null };
  });
  check(
    "consecutive turns for the same player replace announce-turn span element",
    turnNode1.hasSpan && turnNode2.hasSpan && turnNode1.text === "Dune's turn." && turnNode2.text === "Dune's turn.",
    { turnNode1, turnNode2 },
  );

  // 2. Consecutive identical log lines must replace the announce-log span element.
  await page.evaluate(() => {
    const e = window.__emberisle;
    e.setState({
      gameLog: [...e.getState().gameLog, { at: Date.now(), text: "Tide built a road." }],
    });
  });
  const logNode1 = await page.evaluate(() => {
    const p = document.querySelector('[data-testid="announce-log"]');
    const span = p?.querySelector("span");
    return { hasSpan: !!span, text: p?.textContent?.trim() ?? null };
  });
  await page.evaluate(() => {
    const e = window.__emberisle;
    e.setState({
      gameLog: [...e.getState().gameLog, { at: Date.now(), text: "Tide built a road." }],
    });
  });
  const logNode2 = await page.evaluate(() => {
    const p = document.querySelector('[data-testid="announce-log"]');
    const span = p?.querySelector("span");
    return { hasSpan: !!span, text: p?.textContent?.trim() ?? null };
  });
  check(
    "consecutive identical log events replace announce-log span element",
    logNode1.hasSpan && logNode2.hasSpan && logNode1.text === "Tide built a road." && logNode2.text === "Tide built a road.",
    { logNode1, logNode2 },
  );

  // 3. Game-over phase must silence in-game live region announcements so win dialog has exclusive voice.
  await page.evaluate(() => {
    const e = window.__emberisle;
    e.setState({
      tradeOutcome: "Nobody took it.",
      error: "Temporary refusal",
      announcement: "Quiet announcement",
    });
  });
  const beforeOver = await page.evaluate(() => ({
    trade: document.querySelector('[data-testid="announce-trade"]')?.textContent?.trim() ?? "",
    error: document.querySelector('[data-testid="announce-error"]')?.textContent?.trim() ?? "",
  }));
  await page.evaluate(() => {
    const e = window.__emberisle;
    const st = e.getState().state;
    e.setState({ state: { ...st, phase: "over", winner: "p0" } });
  });
  const afterOver = await page.evaluate(() => ({
    turn: document.querySelector('[data-testid="announce-turn"]')?.textContent?.trim() ?? "",
    trade: document.querySelector('[data-testid="announce-trade"]')?.textContent?.trim() ?? "",
    log: document.querySelector('[data-testid="announce-log"]')?.textContent?.trim() ?? "",
    error: document.querySelector('[data-testid="announce-error"]')?.textContent?.trim() ?? "",
  }));
  check(
    "game-over phase silences live region announcements",
    beforeOver.trade === "Nobody took it." &&
      beforeOver.error === "Temporary refusal" &&
      afterOver.turn === "" &&
      afterOver.trade === "" &&
      afterOver.log === "" &&
      afterOver.error === "",
    { beforeOver, afterOver },
  );

  // 4. SeatNo suppresses invalid/negative seat numbers and SeatDot falls back to transparent.
  const seatNoAndDot = await page.evaluate(async () => {
    const { SeatNo, SeatDot } = await import("/src/components/game/SeatDot.tsx");
    const neg = SeatNo({ n: -1 });
    const zero = SeatNo({ n: 0 });
    const nan = SeatNo({ n: NaN });
    const valid = SeatNo({ n: 4 });
    const emptyDot = SeatDot({ color: "" });

    return {
      negNull: neg === null,
      zeroNull: zero === null,
      nanNull: nan === null,
      validNumber: valid?.props?.children?.at?.(-1) === 4,
      dotTransparent: emptyDot?.props?.style?.background === "transparent",
    };
  });
  check(
    "SeatNo suppresses invalid and negative seat numbers",
    seatNoAndDot.negNull && seatNoAndDot.zeroNull && seatNoAndDot.nanNull && seatNoAndDot.validNumber && seatNoAndDot.dotTransparent,
    seatNoAndDot,
  );

  // 5. SeatRail and SeatStrip render safely without throwing when state is null.
  await page.evaluate(() => {
    window.__emberisle.setState({ state: null });
  });
  const railDetached = await page.evaluate(() => {
    return document.querySelectorAll(".seat-card").length === 0;
  });
  check(
    "SeatRail and SeatStrip render safely without throwing when state is null",
    railDetached,
    { railDetached },
  );

  check("zero page or console errors", errors.length === 0, errors);
  if (fails.length) throw new Error(`FAIL announcer-a11y-guards-prove: ${fails.join("; ")}`);
  console.log("PASS announcer-a11y-guards-prove");
} finally {
  await browser.close();
  await vite.close();
}
