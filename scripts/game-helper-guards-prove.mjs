// Guards for escape-disarm.ts (dialog and alertdialog Escape isolation).
// Run: npm run game-helper-guards-prove
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
  await setupOnlineMain(page);

  // 1a. Open FortuneTray ([role="dialog"]) while buildMode is armed: first Escape closes dialog only; second disarms.
  await page.getByTestId("fortunes-button").click();
  await page.getByTestId("fortune-tray").waitFor({ timeout: 10_000 });
  await page.evaluate(() => window.__emberisle.getState().setBuildMode("path"));
  await page.waitForFunction(() => window.__emberisle.getState().buildMode === "path");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[data-testid="fortune-tray"]'));
  assert.equal(
    await page.evaluate(() => window.__emberisle.getState().buildMode),
    "path",
    "Escape closing FortuneTray dialog must keep armed buildMode",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__emberisle.getState().buildMode === "none");
  ok("escape-disarm stands down while FortuneTray dialog is open, then disarms on second Escape");

  // 1b. Open BuildList ([role="dialog"]) while buildMode is armed: first Escape closes dialog only; second disarms.
  await page.getByTestId("build-open").click();
  await page.getByTestId("build-list").waitFor({ timeout: 10_000 });
  await page.evaluate(() => window.__emberisle.getState().setBuildMode("path"));
  await page.waitForFunction(() => window.__emberisle.getState().buildMode === "path");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[data-testid="build-list"]'));
  assert.equal(
    await page.evaluate(() => window.__emberisle.getState().buildMode),
    "path",
    "Escape closing BuildList dialog must keep armed buildMode",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__emberisle.getState().buildMode === "none");
  ok("escape-disarm stands down while BuildList dialog is open, then disarms on second Escape");

  // 1c. With no dialog open, a single Escape disarms buildMode directly.
  await page.evaluate(() => window.__emberisle.getState().setBuildMode("path"));
  await page.waitForFunction(() => window.__emberisle.getState().buildMode === "path");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__emberisle.getState().buildMode === "none");
  ok("escape-disarm immediately disarms buildMode when no dialog or menu is open");

  await ctx.close();

  assert.deepEqual(unexpectedErrors, [], `unexpected browser errors: ${unexpectedErrors.join(" | ")}`);
  console.log(`game-helper-guards-prove: ok (${checks} checks passed)`);
} finally {
  await browser.close();
  await vite.close();
}
