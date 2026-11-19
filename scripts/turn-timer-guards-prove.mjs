// Guards for TurnCountdown (finite clock skew, no timer_final on game-over/rematch, stopped interval),
// TurnMoment (immediate game-over cleanup, exit timer cleanup on resync), and
// TakeFromBar (ResizeObserver detached guard, active-prompt-height cleanup with chromeLanded).
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.addInitScript(() => {
    window.__plays = [];
    const proto = HTMLAudioElement.prototype;
    const origPlay = proto.play;
    proto.play = function () {
      try {
        const file = new URL(this.src).pathname.replace("/audio/", "").replace(".wav", "");
        window.__plays.push({ file, volume: this.volume, t: performance.now(), stack: new Error().stack });
      } catch {}
      return origPlay.call(this).catch(() => {});
    };
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
      net: { act: () => true, close: () => {}, playAgain: () => {}, wantAgain: () => {}, ttt: () => {}, react: () => {} },
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

  await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointerdown")));

  // --- Check 1: TurnCountdown skew anomaly & game-over cleanup ---
  // 1a. Skew anomaly (-Infinity or NaN) does not fire immediate audio blast.
  await page.evaluate(() => {
    window.__plays = [];
    const now = Date.now();
    window.__emberisle.setState({
      clockSkew: -Infinity,
      turnTimer: { at: now, player: "p0", deadline: now + 3000, host: now },
    });
  });
  await page.waitForTimeout(100);
  const blastPlays = await page.evaluate(() => window.__plays.map((p) => p.file));
  assert.equal(
    blastPlays.filter((f) => f === "timer_final" || f === "timer_tick").length,
    0,
    "non-finite skew does not fire instant timer audio burst",
  );

  // 1b. Game transition to phase="over" within 400ms window does not play timer_final.
  await page.evaluate(() => {
    window.__plays = [];
    const now = Date.now();
    window.__emberisle.setState({
      clockSkew: 0,
      turnTimer: { at: now, player: "p0", deadline: now + 300, host: now },
    });
  });
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    const api = window.__emberisle;
    const next = structuredClone(api.getState().state);
    next.phase = "over";
    next.winner = "p1";
    api.setState({ state: next });
  });
  await page.waitForTimeout(400);
  const overPlays = await page.evaluate(() => window.__plays.map((p) => p.file));
  assert.equal(
    overPlays.filter((f) => f === "timer_final").length,
    0,
    "game-over transition does not play timer_final",
  );
  console.log("TurnCountdown: finite clock skew and game-over sound stand-down");

  // --- Check 2: TurnMoment immediate cleanup on game over ---
  await page.evaluate(async (game) => {
    await import("/src/components/game/moments.ts");
    const baselineGame = structuredClone(game);
    baselineGame.phase = "roll";
    baselineGame.current = "p0";
    baselineGame.turn = 1;
    window.__emberisle.setState({ state: baselineGame, turnTimer: null });
    for (let i = 0; i < 5; i++) await new Promise((r) => requestAnimationFrame(r));
  }, base);

  await page.evaluate((game) => {
    const rollGame = structuredClone(game);
    rollGame.phase = "roll";
    rollGame.current = "p0";
    rollGame.turn = 2;
    window.__emberisle.setState({ state: rollGame });
  }, base);
  const moment = page.getByTestId("turn-moment");
  await moment.waitFor({ timeout: 5000 });

  // On game over, TurnMoment immediately disappears without leaving trailing styles.
  await page.evaluate(() => {
    const api = window.__emberisle;
    const next = structuredClone(api.getState().state);
    next.phase = "over";
    next.winner = "p0";
    api.setState({ state: next });
  });
  await page.waitForTimeout(50);
  assert.equal(await moment.count(), 0, "TurnMoment clears immediately on game over");
  console.log("TurnMoment: immediate exit on game over");

  // --- Check 3: TakeFromBar ResizeObserver & chromeLanded on fast steal ---
  await page.evaluate((game) => {
    const mainGame = structuredClone(game);
    mainGame.phase = "robber";
    mainGame.current = "p0";
    window.__emberisle.setState({
      state: mainGame,
      chatOpen: true,
      pendingSteal: { hexId: "h1", kind: "moveRobber", targets: ["p1"] },
    });
  }, base);

  const takeBar = page.getByRole("group", { name: "The wayfarer takes a card" });
  await takeBar.waitFor();
  const heightSet = await page.evaluate(() => document.documentElement.style.getPropertyValue("--active-prompt-height"));
  assert.ok(heightSet && heightSet !== "0px", `active-prompt-height was set on chat overlap: ${heightSet}`);

  const chromeSeqBefore = await page.evaluate(() => window.__emberisle.getState().chromeSeq);
  // Fast steal resolution: click victim button.
  await takeBar.getByRole("button", { name: /Tide/ }).click();
  await takeBar.waitFor({ state: "detached" });

  const heightAfter = await page.evaluate(() => document.documentElement.style.getPropertyValue("--active-prompt-height"));
  assert.equal(heightAfter, "", "active-prompt-height is cleaned up on steal resolution");

  const chromeSeqAfter = await page.evaluate(() => window.__emberisle.getState().chromeSeq);
  assert.ok(chromeSeqAfter > chromeSeqBefore, "chromeLanded notified island on steal resolution cleanup");
  console.log("TakeFromBar: ResizeObserver and active-prompt-height cleanup with chromeLanded");

  assert.deepEqual(errors, [], `unexpected browser errors: ${errors.join("; ")}`);
  console.log("turn-timer-guards-prove: ok");
} finally {
  await browser?.close();
  await vite.close();
}
