// Proves the SeatDot and SeatNo fallbacks and that the seat rail never draws NaN. Screen-reader behaviour is main's (owner C, q1824).
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

  // 5. The rail never draws NaN: a player with a NaN hand count or wayfarer count reads 0, not "NaN".
  await page.evaluate(() => {
    const e = window.__emberisle;
    const st = e.getState().state;
    const players = st.players.map((p, i) => (i === 1 ? { ...p, goods: NaN, knightsPlayed: NaN } : p));
    e.setState({ state: { ...st, phase: "main", current: "p0", players } });
  });
  await page.getByTestId("rail-p1").waitFor();
  const rail = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="rail-p1"]');
    return {
      text: el?.textContent ?? "",
      army: el?.querySelector('[data-testid="tally-army"]')?.getAttribute("aria-label") ?? "",
    };
  });
  check(
    "the seat rail reads a NaN hand or wayfarer count as 0",
    !rail.text.includes("NaN") && !rail.army.includes("NaN") && rail.army === "Wayfarers played, 0" && rail.text.includes("0 cards"),
    rail,
  );

  check("zero page or console errors", errors.length === 0, errors);
  if (fails.length) throw new Error(`FAIL announcer-a11y-guards-prove: ${fails.join("; ")}`);
  console.log("PASS announcer-a11y-guards-prove");
} finally {
  await browser.close();
  await vite.close();
}
