// Proves TakeFromBar's pendingSteal clears on disarm, mode switch, dispatch, and turn wrap.
// Run: npm run steal-picker-lifecycle-prove
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, stealTargets } from "../src/lib/game/rules.ts";

let base = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 11 });
while (base.phase !== "roll") {
  const next = applyAction(base, base.current, chooseBotAction(base, base.current));
  if (next.error) throw new Error(next.error);
  base = next.state;
}
const hex = base.hexes.find((h) => h.id !== base.robberHex);
const corners = base.vertices.filter((v) => v.hexes.includes(hex.id));
for (const v of corners) v.building = undefined;
corners[0].building = { playerId: "p1", kind: "outpost" };
corners[3].building = { playerId: "p2", kind: "outpost" };
for (const p of base.players) p.resources = { timber: 3, clay: 3, wool: 2, grain: 2, ore: 2 };
base.current = "p0";
base.phase = "main";
base.turn = 5;
const p0 = base.players.find((p) => p.id === "p0");
p0.hidden.knight = 1;
p0.boughtThisTurn.knight = 0;
if (stealTargets(base, hex.id, "p0").length !== 2) throw new Error("setup: expected two victims");

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

  const bar = page.getByRole("group", { name: "The wayfarer takes a card" });
  const peek = () =>
    page.evaluate(() => {
      const s = window.__emberisle.getState();
      const actions = document.querySelector(".hud-actions");
      return {
        mode: s.mode,
        buildMode: s.buildMode,
        pendingSteal: s.pendingSteal,
        phase: s.state?.phase,
        current: s.state?.current,
        knights: s.state?.players.find((p) => p.id === "p0")?.hidden.knight,
        barCount: document.querySelectorAll('[aria-label="The wayfarer takes a card"] button').length,
        banner: document.querySelector('[data-testid="turn-banner"]')?.textContent?.trim() ?? null,
        buildOpen: !!document.querySelector('[data-testid="build-open"]'),
        actionsDisplay: actions ? getComputedStyle(actions).display : null,
      };
    });

  // 1. Escape cancels armed Knight and closes TakeFromBar, restoring main action row.
  await page.evaluate((g) => {
    const e = window.__emberisle;
    e.getState().startAi();
    e.setState({ runBots: () => {}, screen: "play", mode: "ai", localId: "p0", state: g, buildMode: "none", pendingSteal: null, offer: null, declined: [] });
  }, base);
  await page.getByTestId("build-open").waitFor();
  await page.evaluate((hexId) => {
    const s = window.__emberisle.getState();
    s.setBuildMode("knight");
    s.pickHex(hexId);
  }, hex.id);
  await bar.waitFor();
  const opened = await peek();
  check("Knight picker opens with two victims and hides action row", opened.pendingSteal?.kind === "playKnight" && opened.barCount === 2 && opened.actionsDisplay === "none" && opened.banner === "Take from whom?", opened);

  await page.keyboard.press("Escape");
  await bar.waitFor({ state: "detached" });
  const afterEsc = await peek();
  check("Escape clears pendingSteal, keeps Knight, and restores main actions", afterEsc.buildMode === "none" && afterEsc.pendingSteal === null && afterEsc.barCount === 0 && afterEsc.knights === 1 && afterEsc.buildOpen && afterEsc.actionsDisplay !== "none" && afterEsc.banner === "Your turn", afterEsc);

  // 2. Switching build modes via setBuildMode closes TakeFromBar.
  await page.evaluate((hexId) => {
    const s = window.__emberisle.getState();
    s.setBuildMode("knight");
    s.pickHex(hexId);
  }, hex.id);
  await bar.waitFor();
  await page.evaluate(() => window.__emberisle.getState().setBuildMode("path"));
  await bar.waitFor({ state: "detached" });
  const afterSwitch = await peek();
  check("setBuildMode(path) closes open Knight picker", afterSwitch.buildMode === "path" && afterSwitch.pendingSteal === null && afterSwitch.barCount === 0, afterSwitch);

  // 3. Pre-roll Knight picker closes when roll is dispatched in practice mode.
  const preRoll = structuredClone(base);
  preRoll.phase = "roll";
  await page.evaluate(([g, hexId]) => {
    const e = window.__emberisle;
    e.setState({ state: g, buildMode: "knight", pendingSteal: null });
    e.getState().pickHex(hexId);
  }, [preRoll, hex.id]);
  await bar.waitFor();
  await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "roll" }));
  await bar.waitFor({ state: "detached" });
  const afterRoll = await peek();
  check("practice dispatch(roll) closes pre-roll Knight picker", afterRoll.pendingSteal === null && afterRoll.barCount === 0 && afterRoll.phase !== "roll", afterRoll);

  // 4. Hotseat dispatch(endTurn) closes picker instead of leaking to the next seat.
  await page.evaluate((g) => {
    const e = window.__emberisle;
    e.setState({ mode: "hotseat", state: g, buildMode: "none", pendingSteal: null });
  }, base);
  await page.getByTestId("build-open").waitFor();
  await page.evaluate((hexId) => {
    const s = window.__emberisle.getState();
    s.setBuildMode("knight");
    s.pickHex(hexId);
  }, hex.id);
  await bar.waitFor();
  await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "endTurn" }));
  await bar.waitFor({ state: "detached" });
  const afterEnd = await peek();
  check("hotseat dispatch(endTurn) clears picker before next seat", afterEnd.current !== "p0" && afterEnd.pendingSteal === null && afterEnd.barCount === 0, afterEnd);

  // 5. Online loadState keeps same-turn push, closes on turn wrap, and dispatch clears immediately.
  const onlineBase = structuredClone(base);
  const sameTurn = structuredClone(base);
  sameTurn.seq += 1;
  const wrappedTurn = structuredClone(base);
  wrappedTurn.turn = base.turn + 1;
  wrappedTurn.seq += 2;
  const onlineRes = await page.evaluate(([g0, gSame, gWrap, hexId]) => {
    const e = window.__emberisle;
    const legal = { outpost: [], path: [], stronghold: [], wayfarer: [], steal: { [hexId]: ["p1", "p2"] }, discard: 0, actions: ["play:knight"] };
    e.setState({ mode: "online", localId: "p0", isHost: true, code: "TEST", state: g0, legal, buildMode: "knight", pendingSteal: null });
    e.getState().pickHex(hexId);
    const openOnline = e.getState().pendingSteal;
    e.getState().loadState(gSame, "p0", true, "TEST");
    const keptSameTurn = e.getState().pendingSteal;
    e.getState().loadState(gWrap, "p0", true, "TEST");
    const clearedWrap = e.getState().pendingSteal;
    // Re-open online and dispatch an action through a stubbed net transport.
    e.setState({ state: g0, buildMode: "knight", net: { act: () => true } });
    e.getState().pickHex(hexId);
    const reopened = e.getState().pendingSteal;
    const sent = e.getState().dispatch({ type: "endTurn" });
    const afterDispatch = e.getState().pendingSteal;
    e.setState({ net: null });
    return { openOnline, keptSameTurn, clearedWrap, reopened, sent, afterDispatch };
  }, [onlineBase, sameTurn, wrappedTurn, hex.id]);
  check("online loadState keeps same-turn push and drops turn wrap", onlineRes.openOnline?.targets.length === 2 && onlineRes.keptSameTurn?.targets.length === 2 && onlineRes.clearedWrap === null, onlineRes);
  check("online dispatch clears pendingSteal immediately", onlineRes.reopened?.targets.length === 2 && onlineRes.sent.ok && onlineRes.afterDispatch === null, onlineRes);

  check("zero page or console errors", errors.length === 0, errors);
  if (fails.length) throw new Error(`FAIL steal-picker-lifecycle-prove: ${fails.join("; ")}`);
  console.log("PASS steal-picker-lifecycle-prove");
} finally {
  await browser.close();
  await vite.close();
}
