// Guards for escape-disarm.ts (dialog Escape isolation) and TableRecoveryBoundary.tsx
// (no 15 s timeout armed on synchronous rejoinTable failure or throw).
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
  // ---- Part 1: escape-disarm.ts stands down for FortuneTray ([role="dialog"]) and BuildList ([role="dialog"]).
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
    await ctx.addInitScript(() => {
      localStorage.setItem("emberisle-first-game-coach", '"done"');
      localStorage.setItem("emberisle-water", "simple");
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => unexpectedErrors.push(`part1 pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") unexpectedErrors.push(`part1 console: ${m.text()}`); });
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

    await ctx.close();
  }

  // ---- Part 2: TableRecoveryBoundary.tsx does not arm a 15 s timeout when rejoinTable() returns false or throws.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
    await ctx.addInitScript(() => {
      localStorage.setItem("emberisle-first-game-coach", '"done"');
      localStorage.setItem("emberisle-water", "simple");
      window.__recoveryTimers = [];
      const origSetTimeout = window.setTimeout.bind(window);
      const origClearTimeout = window.clearTimeout.bind(window);
      window.setTimeout = (fn, ms, ...args) => {
        const id = origSetTimeout(fn, ms, ...args);
        if (ms === 15_000) window.__recoveryTimers.push({ id, ms, cleared: false });
        return id;
      };
      window.clearTimeout = (id) => {
        const rec = window.__recoveryTimers.find((t) => t.id === id);
        if (rec) rec.cleared = true;
        return origClearTimeout(id);
      };
    });
    const page = await ctx.newPage();
    await page.route("**/src/components/game/Hud.tsx*", async (route) => {
      const response = await route.fetch();
      const original = await response.text();
      const signature = "function Hud() {";
      assert.ok(original.includes(signature), "found Hud render entry for controlled injection");
      const body = original.replace(signature, `${signature}\nif (window.__renderFault === "hud") throw new Error("controlled table render failure: hud");`);
      await route.fulfill({ response, body });
    });
    page.on("pageerror", (e) => unexpectedErrors.push(`part3 pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("controlled table render failure")) {
        unexpectedErrors.push(`part3 console: ${m.text()}`);
      }
    });
    await page.goto(url);
    await page.waitForFunction(() => !!window.__emberisle);
    await setupOnlineMain(page);

    // Seed matching saved seat and trigger controlled HUD render error.
    await page.evaluate(() => {
      localStorage.setItem("emberisle-seat", JSON.stringify({ code: "GUAR", secret: "sec-1", host: "http://127.0.0.1:8787" }));
      window.__renderFault = "hud";
      window.__emberisle.setState({ error: "Trigger render fault" });
    });
    await page.getByTestId("table-recovery").waitFor({ timeout: 10_000 });
    assert.equal(await page.getByTestId("recovery-code").textContent(), "GUAR");

    // 3a. rejoinTable() returning false must NOT arm any 15 s timer.
    await page.evaluate(() => {
      window.__recoveryTimers = [];
      window.__emberisle.setState({ rejoinTable: () => false });
    });
    await page.getByRole("button", { name: "Rejoin", exact: true }).click();
    await page.getByText("Your saved seat is unavailable.").waitFor({ timeout: 5_000 });
    assert.equal(
      await page.evaluate(() => window.__recoveryTimers.length),
      0,
      "rejoinTable() returning false must not arm a 15 s timeout",
    );
    ok("TableRecoveryBoundary arms no 15 s timer when rejoinTable() returns false");

    // 3b. rejoinTable() throwing synchronously must NOT arm any 15 s timer.
    await page.evaluate(() => {
      window.__recoveryTimers = [];
      window.__emberisle.setState({ rejoinTable: () => { throw new Error("socket dead"); } });
    });
    await page.getByRole("button", { name: "Rejoin", exact: true }).click();
    await page.getByText("Your saved seat is unavailable.").waitFor({ timeout: 5_000 });
    assert.equal(
      await page.evaluate(() => window.__recoveryTimers.length),
      0,
      "rejoinTable() throwing must not arm a 15 s timeout",
    );
    ok("TableRecoveryBoundary arms no 15 s timer when rejoinTable() throws");

    // 3c. rejoinTable() returning true arms one 15 s timer, and synced recovery clears it and remounts the table.
    await page.evaluate(() => {
      window.__renderFault = null;
      window.__recoveryTimers = [];
      window.__emberisle.setState({ rejoinTable: () => true });
    });
    await page.getByRole("button", { name: "Rejoin", exact: true }).click();
    await page.getByRole("button", { name: "Rejoining…", exact: true }).waitFor({ timeout: 5_000 });
    assert.equal(
      await page.evaluate(() => window.__recoveryTimers.length),
      1,
      "rejoinTable() returning true must arm one 15 s timeout",
    );
    await page.evaluate(() => {
      const s = window.__emberisle.getState();
      window.__emberisle.setState({ synced: s.synced + 1 });
    });
    await page.waitForFunction(() => !document.querySelector('[data-testid="table-recovery"]'));
    assert.equal(
      await page.evaluate(() => window.__recoveryTimers[0].cleared),
      true,
      "successful recovery must clear the 15 s timeout",
    );
    ok("TableRecoveryBoundary arms one 15 s timer on live rejoin and clears it on recovery");

    await ctx.close();
  }

  assert.deepEqual(unexpectedErrors, [], `unexpected browser errors: ${unexpectedErrors.join(" | ")}`);
  console.log(`game-helper-guards-prove: ok (${checks} checks passed)`);
} finally {
  await browser.close();
  await vite.close();
}
