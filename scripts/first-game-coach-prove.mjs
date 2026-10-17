// Fresh practice profile: real setup/roll and legal canvas placements; fixtures supply main-phase hands and a seven.
// Run: CHROMIUM_PATH=/usr/bin/chromium node scripts/first-game-coach-prove.mjs (VITE_PORT defaults to 8443).
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const port = Number(process.env.VITE_PORT) || 8443;
const key = "emberisle-first-game-coach";
const vite = await createServer({ server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
let code = 0;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__emberisle);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByTestId("seat-strip").waitFor();
  const rollOffStrip = await page.evaluate(() => {
    const slot = document.querySelector("[data-coach-skip-slot]");
    const names = [...document.querySelectorAll('[data-testid="seat-strip"] [data-testid="seat-name"]')]
      .filter((el) => el.getClientRects().length && getComputedStyle(el).position !== "absolute");
    return {
      phase: window.__emberisle.getState().state.phase,
      slotWidth: slot.getBoundingClientRect().width,
      cut: names.filter((el) => el.scrollWidth > el.clientWidth || el.parentElement.scrollWidth > el.parentElement.clientWidth).map((el) => el.textContent),
    };
  });
  assert.deepEqual(rollOffStrip, { phase: "rollOff", slotWidth: 0, cut: [] }, "inactive Skip leaves roll-off seat names their full width");
  const coach = page.getByTestId("first-game-coach");
  const clearBanner = () => page.evaluate(() => window.__emberisle.setState({ banner: null }));
  const step = async (n, text) => {
    await clearBanner();
    await coach.waitFor();
    assert.equal(await coach.getAttribute("data-step"), String(n));
    assert.equal(await coach.getAttribute("data-steps"), "3");
    assert.match(await coach.innerText(), text);
    assert.equal(await coach.evaluate((el) => getComputedStyle(el).pointerEvents), "none");
    assert.equal(await page.locator("canvas").evaluate((el) => getComputedStyle(el).pointerEvents), "auto");
  };
  const tapMark = async (id) => {
    await page.waitForFunction((id) => window.__isle?.screenOf(id), id);
    await page.waitForTimeout(1000);
    const covered = await page.evaluate(() => {
      const hi = window.__emberisle.getState().highlights();
      return [...hi.vertices, ...hi.edges, ...hi.hexes].flatMap((id) => {
        const p = window.__isle.screenOf(id);
        return !p || document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS" ? [] : [id];
      });
    });
    assert.deepEqual(covered, [], "every currently legal highlighted target receives canvas input while the tip is shown");
    for (let attempt = 0; attempt < 5; attempt++) {
      // Wait for the camera to stop gliding, then project its actual board mark.
      await page.waitForTimeout(350);
      const spot = await page.evaluate((id) => window.__isle.screenOf(id), id);
      const canvas = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, spot);
      assert.equal(canvas, "CANVAS", `coach leaves legal mark ${id} exposed`);
      await page.touchscreen.tap(spot.x, spot.y);
      if (await page.getByTestId("place-chip").isVisible()) {
        await page.getByTestId("place-chip").click();
        return;
      }
    }
    throw Error(`legal canvas tap ${id} never selected`);
  };
  // The bots use their ordinary practice timers; only the human's picks are driven here.
  for (let i = 0; i < 400; i++) {
    const s = await page.evaluate(() => { const g = window.__emberisle.getState(); return { phase: g.state.phase, mine: g.state.current === g.localId }; });
    if (s.phase !== "rollOff" && s.mine) break;
    if (s.phase === "rollOff" && s.mine) await page.getByRole("button", { name: "Roll", exact: true }).click();
    await page.waitForTimeout(100);
  }
  await step(1, /Tap a glowing corner, then Place/);
  for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(500);
    const headerControls = await page.evaluate(() => [...document.querySelectorAll('header [data-menu-trigger], header [aria-label="Table menu"], [data-coach-skip-slot] button')].map((el) => {
      const r = el.getBoundingClientRect(); return { name: el.textContent.trim(), x: r.x, y: r.y, w: r.width, h: r.height };
    }));
    assert.equal(headerControls.length, 6, "four seats, Skip and menu stay available");
    for (const a of headerControls) {
      assert.ok(a.w >= 44 && a.h >= 44 && a.x >= 0 && a.x + a.w <= viewport.width, `${viewport.width}: ${a.name} remains a visible 44px target`);
      for (const b of headerControls) if (a !== b) assert.ok(a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y || b.y + b.h <= a.y, "header targets do not overlap");
    }
    const holeUnchanged = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="first-game-coach"]');
      const before = JSON.stringify(window.__isle.liveInsets()); el.style.display = "none";
      const after = JSON.stringify(window.__isle.liveInsets()); el.style.display = "";
      return before === after;
    });
    assert.ok(holeUnchanged, "pointer-transparent coach text leaves board insets unchanged");
  }
  // Start from the adjacent menu control, independent of focus left by the roll-off or viewport change.
  await page.getByRole("button", { name: "Table menu", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  assert.ok(await page.getByRole("button", { name: "Skip tips" }).evaluate((el) => el === document.activeElement), "keyboard Shift+Tab reaches Skip from the menu");
  await page.keyboard.press("Tab");
  assert.ok(await page.getByRole("button", { name: "Table menu", exact: true }).evaluate((el) => el === document.activeElement), "keyboard Tab continues from Skip to the menu");
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/first-game-coach-setup-390.png" });
  const firstCorner = await page.evaluate(() => {
    const rect = document.querySelector('[data-coach-skip-slot] button').getBoundingClientRect();
    const distance = (id) => { const p = window.__isle.screenOf(id); return Math.hypot(p.x - (rect.x + rect.width / 2), p.y - (rect.y + rect.height / 2)); };
    return window.__emberisle.getState().highlights().vertices.toSorted((a, b) => distance(a) - distance(b))[0];
  });
  await tapMark(firstCorner);
  await page.waitForFunction(() => window.__emberisle.getState().state.phase === "setupRoad");
  assert.equal(await coach.count(), 0, "setup tip advances on actual outpost placement");
  for (let i = 0; i < 600; i++) {
    const phase = await page.evaluate(() => {
      const g = window.__emberisle.getState();
      const s = g.state;
      if (s.current === g.localId && s.phase === "setupSettle") g.pickVertex(g.highlights().vertices[0]);
      if (s.current === g.localId && s.phase === "setupRoad") g.pickEdge(g.highlights().edges[0]);
      return s.phase === "roll" && s.current === g.localId ? "ready" : s.phase;
    });
    if (phase === "ready") break;
    await page.waitForTimeout(100);
  }
  await step(2, /You gain goods when your numbers roll/);
  // Keep this first roll non-seven: the later contextual case must still be the first seven.
  // rollDie consumes one Uint32 draw per die. Restore crypto immediately after those two draws.
  await page.evaluate(() => {
    const original = crypto.getRandomValues;
    const fixture = window.__coachDiceFixture = { draws: 0, restored: false };
    window.__restoreCoachDice = () => { crypto.getRandomValues = original; fixture.restored = true; };
    crypto.getRandomValues = function (values) {
      if (values instanceof Uint32Array && values.length === 1 && fixture.draws < 2) {
        values[0] = [1, 2][fixture.draws++];
        if (fixture.draws === 2) window.__restoreCoachDice();
        return values;
      }
      return original.call(this, values);
    };
  });
  try {
    await page.getByRole("button", { name: "Roll", exact: true }).click();
  } finally {
    await page.evaluate(() => window.__restoreCoachDice());
  }
  await page.waitForFunction(() => window.__emberisle.getState().state.phase !== "roll");
  const firstRoll = await page.evaluate(() => ({ ...window.__coachDiceFixture, dice: window.__emberisle.getState().state.dice }));
  assert.deepEqual(firstRoll, { draws: 2, restored: true, dice: [2, 3] }, "the real Roll click consumes both fixture draws and restores crypto");
  // Record the real post-setup board, then supply an explicit, balanced main-phase hand fixture.
  // Find a currently legal path which opens a currently legal outpost. No production rules are replaced.
  const plan = await page.evaluate(async () => {
    const { applyAction, legalRoads, legalSettle } = await import("/src/lib/game/rules.ts");
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.phase = "main"; st.current = g.getState().localId; st.discardNeeded = {}; st.dice = [2, 3];
    const p = st.players.find((p) => p.id === st.current);
    // An isolated owned corner and one setup path make the path-to-outpost lesson deterministic.
    // This changes only this proof's board fixture, then both builds use normal game actions.
    for (const v of st.vertices) v.building = null;
    for (const e of st.edges) e.path = null;
    const base = st.vertices.find((v) => v.hexes.length === 3);
    base.building = { playerId: p.id, kind: "outpost" };
    st.edges.find((e) => e.va === base.id || e.vb === base.id).path = p.id;
    p.pathsLeft = 14; p.outpostsLeft = 4;
    for (const r of ["timber", "clay", "wool", "grain", "ore"]) { st.bank[r] += p.resources[r] - 5; p.resources[r] = 5; }
    let choice;
    for (const id of legalRoads(st, p.id, false)) {
      const result = applyAction(st, p.id, { type: "buildPath", edgeId: id });
      if (!result.error && legalSettle(result.state, p.id, false).length) { choice = { edge: id, vertex: legalSettle(result.state, p.id, false)[0] }; break; }
    }
    if (!choice) throw Error("setup fixture has no path-to-outpost progression");
    g.setState({ state: st, banner: null, pendingSteal: null, buildMode: "none" });
    return choice;
  });
  await step(3, /Build a path first/);
  const mainFixture = await page.evaluate(() => structuredClone(window.__emberisle.getState().state));
  await page.evaluate(() => { const g = window.__emberisle; const s = structuredClone(g.getState().state); const p = s.players.find((p) => p.id === s.current); for (const r in p.resources) { s.bank[r] += p.resources[r]; p.resources[r] = 0; } g.setState({ state: s }); });
  await step(3, /Build when you have goods and a legal spot/);
  assert.doesNotMatch(await coach.innerText(), /Build a path first|Now place an outpost/);
  await page.evaluate((s) => window.__emberisle.setState({ state: s }), mainFixture);
  await step(3, /Build a path first/);
  await page.getByTestId("build-path").click();
  await step(3, /Build a path first/);
  await tapMark(plan.edge);
  await step(3, /Now place an outpost at a connected corner.*Costs are in the menu/s);
  await page.screenshot({ path: "test-results/first-game-coach-outpost-390.png" });
  await page.getByTestId("build-outpost").click();
  await tapMark(plan.vertex);
  await clearBanner();
  assert.equal(await coach.count(), 0, "path and outpost finish within step three");
  // A first seven after both builds still teaches the wayfarer. Discards and off-mode never urge an illegal move.
  await page.evaluate(() => { const g = window.__emberisle; const s = structuredClone(g.getState().state); s.phase = "discard"; s.dice = [3, 4]; s.discardNeeded = { [s.current]: 1 }; g.setState({ state: s, banner: null }); });
  assert.equal(await coach.count(), 0, "no wayfarer instruction during discards");
  await page.evaluate(() => { const g = window.__emberisle; const s = structuredClone(g.getState().state); s.phase = "robber"; s.discardNeeded = {}; g.setState({ state: s }); });
  await step(3, /Move the wayfarer to a new hex, then pick a victim if available/);
  const robberFixture = await page.evaluate(() => structuredClone(window.__emberisle.getState().state));
  await page.evaluate(() => { const g = window.__emberisle; const s = structuredClone(g.getState().state); s.wayfarerMode = "off"; g.setState({ state: s }); });
  assert.equal(await coach.count(), 0);
  // Off-mode completed the lesson; restore this point as a reload of the still-active first game to exercise actual wayfarer input.
  await page.evaluate(({ s, key }) => { const progress = { game: `${s.seed}:${s.hexes.map((h) => `${h.terrain}${h.pip ?? ""}`).join()}`, actor: s.current, setup: true, roll: true, path: true, outpost: true, seven: false }; localStorage.setItem(key, JSON.stringify(progress)); window.__savedCoachBoard = s; }, { s: robberFixture, key });
  await page.reload();
  await page.waitForFunction(() => window.__emberisle);
  await page.evaluate((s) => window.__emberisle.setState({ state: s, screen: "play", mode: "ai", localId: s.current }), robberFixture);
  await step(3, /Move the wayfarer/);
  const land = await page.evaluate(() => { const s = window.__emberisle.getState().state; return s.hexes.find((h) => h.id !== s.robberHex).id; });
  await tapMark(land);
  const victim = page.getByRole("group", { name: "The wayfarer takes a card" });
  if (await victim.isVisible()) await victim.getByRole("button").first().click();
  await page.waitForFunction(() => window.__emberisle.getState().state.phase === "main");
  await clearBanner();
  assert.equal(await coach.count(), 0);
  assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key), "done", "all three steps and first seven complete permanently");
  // Finish through a legal winning upgrade, then start another practice game.
  const win = await page.evaluate(async () => {
    const { COST } = await import("/src/lib/game/types.ts");
    const g = window.__emberisle; const s = structuredClone(g.getState().state); const p = s.players.find((p) => p.id === s.current);
    s.victoryTarget = 7; p.hidden.vp = 5; p.resources.grain = COST.stronghold.grain; p.resources.ore = COST.stronghold.ore;
    const v = s.vertices.find((v) => v.building?.playerId === p.id && v.building.kind === "outpost");
    g.setState({ state: s }); return g.getState().dispatch({ type: "buildStronghold", vertexId: v.id });
  });
  assert.equal(win.ok, true);
  await page.waitForFunction(() => window.__emberisle.getState().state.phase === "over");
  await page.evaluate(() => { window.__emberisle.getState().goTitle(); window.__emberisle.getState().startAi(); });
  await clearBanner();
  assert.equal(await coach.count(), 0, "second practice game has no coach");
  await page.reload();
  await page.waitForFunction(() => window.__emberisle);
  await page.evaluate(() => window.__emberisle.getState().startAi());
  assert.equal(await coach.count(), 0, "completion survives browser reload");
  await context.close();

  // Independent first profile: Skip stays permanent after state changes, a new game and reload.
  const skipContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const skipPage = await skipContext.newPage();
  await skipPage.goto(`http://127.0.0.1:${port}/`);
  await skipPage.waitForFunction(() => window.__emberisle);
  await skipPage.evaluate(async () => {
    const g = window.__emberisle; g.getState().startAi(); const s = structuredClone(g.getState().state); s.phase = "setupSettle"; s.current = g.getState().localId; g.setState({ state: s, banner: null });
  });
  await skipPage.getByRole("button", { name: "Skip tips" }).click();
  await skipPage.evaluate(() => { const g = window.__emberisle.getState(); g.pickVertex(g.highlights().vertices[0]); });
  assert.equal(await skipPage.getByTestId("first-game-coach").count(), 0);
  assert.equal(await skipPage.evaluate((key) => JSON.parse(localStorage.getItem(key)), key), "done");
  await skipPage.reload(); await skipPage.waitForFunction(() => window.__emberisle);
  await skipPage.evaluate(() => window.__emberisle.getState().startAi());
  assert.equal(await skipPage.getByTestId("first-game-coach").count(), 0);
  await skipContext.close();
  assert.deepEqual(errors, [], "browser errors");
  console.log("first-game-coach-prove: PASS — three steps, legal canvas taps, affordable path → outpost, contextual seven, completion/finish/second game/reload, permanent Skip");
} catch (e) { console.error(e); code = 1; }
finally { await browser.close(); await vite.close(); }
process.exit(code);
