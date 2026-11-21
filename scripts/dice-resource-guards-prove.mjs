// Guards for Dice.tsx, ResourceSymbols.tsx, and BuildCost.tsx.
// Run: npm run dice-resource-guards-prove
import assert from "node:assert/strict";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

let checks = 0;
const ok = (msg) => { checks++; console.log(`ok   ${msg}`); };
const unexpectedErrors = [];

async function setupOnlineMain(page) {
  await page.evaluate(async () => {
    const { createGame } = await import("/src/lib/game/board.ts");
    const { chooseBotAction } = await import("/src/lib/game/ai.ts");
    const { applyAction, legalRoads } = await import("/src/lib/game/rules.ts");
    const { RESOURCES } = await import("/src/lib/game/types.ts");
    let st = createGame({ seed: 20261118, humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0 });
    for (let i = 0; st.phase !== "roll" && i < 300; i++) {
      const r = applyAction(st, st.current, chooseBotAction(st, st.current));
      if (r.error) throw new Error(r.error);
      st = r.state;
    }
    st.phase = "main";
    st.current = "p0";
    st.dice = [3, 4];
    st.rolls = 1;
    st.playedCard = false;
    st.seq = 25;
    for (const p of st.players) {
      p.kind = "human";
      p.resources = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
    }
    const me = st.players.find((p) => p.id === "p0");
    Object.assign(me.resources, { timber: 2, clay: 2, wool: 1, grain: 1, ore: 1 });
    me.hidden.knight = 1;
    for (const r of RESOURCES) st.bank[r] = 19 - st.players.reduce((n, p) => n + p.resources[r], 0);
    window.__emberisle.setState({
      screen: "play",
      mode: "online",
      code: "GUAR",
      seatId: "s0",
      localId: "p0",
      spectator: false,
      legal: { outpost: [], path: legalRoads(st, "p0", false), stronghold: [], wayfarer: [] },
      seats: [
        { id: "s0", name: "Ember", color: "#d64933", ready: true, connected: true, bot: false },
        { id: "s1", name: "Tide", color: "#2b6cb0", ready: true, connected: true, bot: false },
        { id: "s2", name: "Pine", color: "#2f855a", ready: true, connected: true, bot: false },
      ],
      state: st,
      gameLog: [{ id: 1, text: "Ember rolled 7." }],
      buildMode: "none",
      pendingPlace: null,
      howTo: false,
      costs: false,
      tradeOpen: false,
      menuFor: null,
      error: null,
      announcement: null,
    });
  });
  await page.getByRole("button", { name: "Table menu" }).waitFor({ timeout: 15_000 });
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  await ctx.addInitScript(() => {
    localStorage.setItem("emberisle-first-game-coach", '"done"');
    localStorage.setItem("emberisle-water", "simple");
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => unexpectedErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") unexpectedErrors.push(`console: ${m.text()}`); });
  await page.goto(url);
  await page.waitForFunction(() => !!window.__emberisle);

  // 1. BuildCost.tsx: shortfall with NaN / missing counts and invalid build kind.
  const shortfallResult = await page.evaluate(async () => {
    const { shortfall } = await import("/src/components/game/BuildCost.tsx");
    return {
      nanTimber: shortfall({ timber: NaN, clay: 1 }, "path"),
      emptyHand: shortfall({}, "path"),
      invalidKind: shortfall({ timber: 2, clay: 2 }, "spaceship"),
    };
  });
  assert.equal(
    shortfallResult.nanTimber.timber,
    1,
    "shortfall with NaN timber must report 1 timber needed for path",
  );
  assert.equal(shortfallResult.emptyHand.timber, 1, "shortfall with empty hand must report 1 timber needed");
  assert.equal(shortfallResult.emptyHand.clay, 1, "shortfall with empty hand must report 1 clay needed");
  assert.deepEqual(shortfallResult.invalidKind, {}, "shortfall with invalid kind must return empty object");
  ok("BuildCost shortfall guards against NaN, missing resources, and invalid build kinds");

  // 2. BuildCost.tsx: priceLabel and needLine on invalid or empty values.
  const costLabels = await page.evaluate(async () => {
    const { priceLabel, needLine } = await import("/src/components/game/BuildCost.tsx");
    let invalidThrew = false;
    let invalidResult = "";
    try {
      invalidResult = priceLabel("spaceship");
    } catch {
      invalidThrew = true;
    }
    return {
      invalidThrew,
      invalidResult,
      emptyNeed: needLine({}),
    };
  });
  assert.equal(costLabels.invalidThrew, false, "priceLabel on invalid kind must not throw");
  assert.notEqual(costLabels.emptyNeed, "Need ", "needLine on empty shortfall must not return dangling 'Need '");
  ok("BuildCost priceLabel and needLine handle unknown kinds and empty shortfalls cleanly");

  // 3. ResourceSymbols.tsx: fallback symbol for unknown or invalid resource keys.
  const iconResult = await page.evaluate(async () => {
    const { RESOURCE_ICON, TimberSymbol } = await import("/src/components/game/ResourceSymbols.tsx");
    const timberIcon = RESOURCE_ICON.timber;
    const unknownIcon = RESOURCE_ICON.unknown;
    return {
      hasTimber: typeof timberIcon === "function",
      hasUnknownFallback: typeof unknownIcon === "function",
    };
  });
  assert.ok(iconResult.hasTimber, "RESOURCE_ICON.timber must be a component function");
  assert.ok(iconResult.hasUnknownFallback, "RESOURCE_ICON.unknown must return a fallback component function");
  ok("ResourceSymbols provides fallback icon component for unknown keys");

  // Mount real game table.
  await setupOnlineMain(page);

  // 4. Dice.tsx: Die and RollMoment rendering with NaN / 0 values in live game.
  await page.evaluate(() => {
    const s = window.__emberisle.getState();
    const st = { ...s.state, rolls: (s.state.rolls ?? 0) + 1, dice: [NaN, 0] };
    window.__emberisle.setState({ state: st });
  });
  const sumEl = await page.waitForSelector('[data-testid="roll-sum"]', { timeout: 5000 });
  const sumText = await sumEl.textContent();
  assert.equal(sumText, "2", "Roll sum with [NaN, 0] clamps to 2 (1 + 1)");
  const announceEl = await page.waitForSelector('[data-testid="announce-roll"]', { timeout: 5000 });
  const announceText = await announceEl.textContent();
  assert.ok(!announceText?.includes("NaN"), "Announce roll text must not include NaN");
  ok("Dice and Die components clamp out-of-range or NaN values in live RollMoment");

  // 5. Dice.tsx: Rematch / roll reset clears RollMoment immediately.
  await page.evaluate(() => {
    const s = window.__emberisle.getState();
    window.__emberisle.setState({ state: { ...s.state, rolls: (s.state.rolls ?? 0) + 1, dice: [2, 3] } });
  });
  await page.waitForSelector('[data-testid="roll-moment"]', { timeout: 5000 });
  await page.evaluate(() => {
    const s = window.__emberisle.getState();
    window.__emberisle.setState({ state: { ...s.state, rolls: 0 } });
  });
  await page.waitForSelector('[data-testid="roll-moment"]', { state: "detached", timeout: 5000 });
  ok("Rematch or roll reset clears active RollMoment immediately");

  // 6. Dice.tsx: Screen change / unmount guarantees useMomentUp is reset to false.
  await page.evaluate(async () => {
    const { useMomentUp } = await import("/src/components/game/Dice.tsx");
    useMomentUp.setState({ up: true });
    window.__emberisle.setState({ screen: "lobby" });
  });
  await page.waitForFunction(async () => {
    const { useMomentUp } = await import("/src/components/game/Dice.tsx");
    return useMomentUp.getState().up === false;
  }, null, { timeout: 5000 });
  ok("RollMoment unmount guarantees useMomentUp is reset to false");

  await ctx.close();
  assert.deepEqual(unexpectedErrors, [], `unexpected browser errors: ${unexpectedErrors.join(" | ")}`);
  console.log(`dice-resource-guards-prove: ok (${checks} checks passed)`);
} finally {
  await browser.close();
  await vite.close();
}
