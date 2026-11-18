// Proves MyNumbers clears its glow after fast turn ends, rematches, and hotseat seat switches.
// Run: npm run my-numbers-glow-prove
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";

let base = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 19 });
while (base.phase !== "roll") {
  const next = applyAction(base, base.current, chooseBotAction(base, base.current));
  if (next.error) throw new Error(next.error);
  base = next.state;
}
// Give every seat an outpost touching a shared numbered hex (not 7).
const sharedHex = base.hexes.find((h) => h.pip && h.pip !== 7 && h.terrain !== "waste");
const corners = base.vertices.filter((v) => v.hexes.includes(sharedHex.id));
for (const v of corners) v.building = undefined;
corners[0].building = { playerId: "p0", kind: "outpost" };
corners[2].building = { playerId: "p1", kind: "outpost" };
corners[4].building = { playerId: "p2", kind: "outpost" };
const pip = sharedHex.pip;
const diceFor = (n) => (n > 6 ? [6, n - 6] : [1, n - 1]);
base.current = "p0";
base.phase = "main";
base.dice = null;
base.rolls = 1;

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
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0);

  const litList = () => page.$$eval('[data-testid="my-numbers"] > li[data-lit]', (els) => els.map((e) => Number(e.dataset.n)));
  const waitLit = (n) =>
    page.waitForFunction(
      (want) => {
        const els = [...document.querySelectorAll('[data-testid="my-numbers"] > li[data-lit]')];
        return want === null ? els.length === 0 : els.length === 1 && Number(els[0].dataset.n) === want;
      },
      n,
      { timeout: 2500 },
    );
  const waitOff = async (ms = 3500) => {
    try {
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="my-numbers"] > li[data-lit]').length === 0, null, { timeout: ms });
      return true;
    } catch {
      return false;
    }
  };

  // Load practice mode so playerId stays p0 across turn changes.
  await page.evaluate((g) => {
    const e = window.__emberisle;
    e.getState().startAi();
    e.setState({ runBots: () => {}, screen: "play", mode: "ai", localId: "p0", state: g, error: null, banner: null });
  }, base);
  await page.getByTestId("my-numbers").waitFor();

  // 1. Fast endTurn (dice -> null within 1200 ms) must not cancel glow expiry.
  await page.evaluate(([d]) => {
    const e = window.__emberisle;
    const st = structuredClone(e.getState().state);
    st.dice = d;
    st.rolls = (st.rolls ?? 0) + 1;
    st.seq++;
    e.setState({ state: st });
  }, [diceFor(pip)]);
  await waitLit(pip);
  // End turn immediately (sets state.dice = null while keeping state.rolls unchanged).
  await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "endTurn" }));
  const clearedAfterFastEnd = await waitOff(3500);
  check("fast endTurn after roll still clears chip glow", clearedAfterFastEnd, await litList());

  // 2. Rematch reset (rolls -> 0, dice -> null) clears active glow immediately.
  await page.evaluate(([g, d]) => {
    const e = window.__emberisle;
    const st = structuredClone(g);
    st.dice = d;
    st.rolls = 5;
    st.seq = 50;
    e.setState({ state: st });
  }, [base, diceFor(pip)]);
  await waitLit(pip);
  await page.evaluate((g) => {
    const e = window.__emberisle;
    const rematch = structuredClone(g);
    rematch.rolls = 0;
    rematch.dice = null;
    rematch.seq = 0;
    e.setState({ state: rematch });
  }, base);
  const clearedOnRematch = await waitOff(800);
  check("rematch reset clears active glow immediately", clearedOnRematch, await litList());

  // 3. Hotseat seat switch (p0 -> p1/p2 on endTurn) clears p0's glow immediately.
  await page.evaluate(([g, d]) => {
    const e = window.__emberisle;
    const st = structuredClone(g);
    st.current = "p0";
    st.phase = "main";
    st.dice = d;
    st.rolls = 6;
    st.seq = 60;
    e.setState({ mode: "hotseat", state: st });
  }, [base, diceFor(pip)]);
  await waitLit(pip);
  await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "endTurn" }));
  const clearedOnSeatSwitch = await waitOff(800);
  const afterSeat = await page.evaluate(() => ({ current: window.__emberisle.getState().state.current, lit: [...document.querySelectorAll('[data-testid="my-numbers"] > li[data-lit]')].length }));
  check("hotseat seat switch clears previous seat's glow immediately", clearedOnSeatSwitch && afterSeat.current !== "p0" && afterSeat.lit === 0, afterSeat);

  // 4. Consecutive rolls of the same number remount the chip with a fresh timer and clear cleanly.
  await page.evaluate(([g, d]) => {
    const e = window.__emberisle;
    const st = structuredClone(g);
    st.current = "p0";
    st.phase = "main";
    st.dice = d;
    st.rolls = 7;
    st.seq = 70;
    e.setState({ mode: "ai", localId: "p0", state: st });
  }, [base, diceFor(pip)]);
  await waitLit(pip);
  await page.evaluate(() => {
    window.__firstLitChip = document.querySelector('[data-testid="my-numbers"] > li[data-lit]');
  });
  await page.evaluate(([d]) => {
    const e = window.__emberisle;
    const st = structuredClone(e.getState().state);
    st.dice = d;
    st.rolls = (st.rolls ?? 0) + 1;
    st.seq++;
    e.setState({ state: st });
  }, [diceFor(pip)]);
  const remounted = await page
    .waitForFunction(() => {
      const cur = document.querySelector('[data-testid="my-numbers"] > li[data-lit]');
      return Boolean(cur && cur !== window.__firstLitChip);
    }, null, { timeout: 2500 })
    .then(() => true, () => false);
  const clearedAfterSecondRoll = await waitOff(3500);
  check("consecutive same-number roll remounts chip and clears cleanly", remounted && clearedAfterSecondRoll, { remounted, clearedAfterSecondRoll, lit: await litList() });

  check("zero page or console errors", errors.length === 0, errors);
  if (fails.length) throw new Error(`FAIL my-numbers-glow-prove: ${fails.join("; ")}`);
  console.log("PASS my-numbers-glow-prove");
} finally {
  await browser.close();
  await vite.close();
}
