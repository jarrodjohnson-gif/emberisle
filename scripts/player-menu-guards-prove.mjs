// PlayerMenu guards across desktop rail (1280x720) and phone sheet (390x844):
// - On a 5-seat online partner turn, another seat's menu hides illegal Trade while keeping Mention.
// - On the same partner turn, your own seat's menu still shows bank Trade.
// - On a primary turn, another seat's menu shows Trade again.
// - Pressing Escape while PlayerMenu and pendingPlace are both open closes only PlayerMenu and returns focus.
// - A second Escape then cancels pendingPlace.
// Zero page or console errors. Run: npm run player-menu-guards-prove
import assert from "node:assert/strict";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createAnyGame } from "../src/lib/game/expanded.ts";
import { applyAction } from "../src/lib/game/rules.ts";

const STEP_MS = 30_000;
const VIEWS = [
  { tag: "1280x720", width: 1280, height: 720 },
  { tag: "390x844", width: 390, height: 844, touch: true },
];

function fiveSeatMain(role) {
  let g = createAnyGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }, { name: "Clay" }, { name: "Moss" }], bots: 0, seed: 11 });
  while (g.phase !== "roll") g = applyAction(g, g.current, chooseBotAction(g, g.current)).state;
  g.phase = "main";
  g.current = "p0";
  g.role = role;
  g.dice = [3, 4];
  return g;
}

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const PORT = vite.httpServer.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
let code = 0;

try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch });
    await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
    const page = await ctx.newPage();
    page.setDefaultTimeout(STEP_MS);
    page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag}: ${m.text()}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0);

    const loadOnline = async (g, extra = {}) => {
      await page.evaluate(async ([g, extra]) => {
        const { online } = await import("/src/components/game/chunks.ts");
        await online.prefetch();
        const e = window.__emberisle;
        if (e.getState().screen !== "play") e.getState().startAi();
        e.setState({
          runBots: () => {},
          mode: "online",
          spectator: false,
          localId: "p0",
          seatId: "s0",
          seats: g.players.map((p, i) => ({ id: `s${i}`, player: p.id, name: p.name, color: p.color })),
          state: g,
          buildMode: "none",
          pendingPlace: null,
          pendingSteal: null,
          menuFor: null,
          tradeOpen: false,
          chatOpen: false,
          offer: null,
          declined: [],
          tradeOutcome: null,
          ...extra,
        });
      }, [g, extra]);
    };

    const openSeat = async (id) => {
      const trig = page.locator(`[data-menu-trigger="${id}"]`);
      await trig.waitFor({ state: "visible" });
      if (v.touch) await trig.tap({ force: true });
      else await trig.click({ force: true });
      const menu = page.getByTestId("player-menu");
      await menu.waitFor({ state: "visible" });
      return menu;
    };

    // 1. Partner turn: hide illegal player Trade on other seat, keep Mention and own bank Trade.
    await loadOnline(fiveSeatMain("partner"));
    const otherPartner = await openSeat("p1");
    assert.equal(await otherPartner.getByRole("button", { name: /^Trade/ }).count(), 0, `${v.tag}: other seat hides Trade on partner turn`);
    assert.equal(await otherPartner.getByRole("button", { name: /^Mention @/ }).count(), 1, `${v.tag}: other seat keeps Mention on partner turn`);
    await page.keyboard.press("Escape");
    await otherPartner.waitFor({ state: "detached" });

    const ownPartner = await openSeat("p0");
    assert.equal(await ownPartner.getByRole("button", { name: /^Trade/ }).count(), 1, `${v.tag}: own seat keeps bank Trade on partner turn`);
    await page.keyboard.press("Escape");
    await ownPartner.waitFor({ state: "detached" });

    // 2. Primary turn: other seat shows Trade again.
    await loadOnline(fiveSeatMain("primary"));
    const otherPrimary = await openSeat("p1");
    assert.equal(await otherPrimary.getByRole("button", { name: /^Trade/ }).count(), 1, `${v.tag}: other seat shows Trade on primary turn`);
    await page.keyboard.press("Escape");
    await otherPrimary.waitFor({ state: "detached" });

    // 3. Escape with a real legal pendingPlace open closes only PlayerMenu first, returning focus to trigger.
    const armedGame = fiveSeatMain("primary");
    armedGame.players[0].resources = { timber: 2, clay: 2, wool: 2, grain: 2, ore: 2 };
    const edgeId = armedGame.edges[0].id;
    await loadOnline(armedGame, { buildMode: "path", legal: { path: [edgeId], outpost: [], stronghold: [], wayfarer: [] } });
    const pending = await page.evaluate((id) => {
      const e = window.__emberisle;
      const p = { kind: "edge", id };
      e.getState().setPendingPlace(p);
      return p;
    }, edgeId);
    assert.ok(pending, `${v.tag}: crafted state has a legal path edge`);
    const menu = await openSeat("p1");
    assert.deepEqual(await page.evaluate(() => window.__emberisle.getState().pendingPlace), pending, `${v.tag}: pendingPlace stays active while PlayerMenu opens`);
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "detached" });
    const afterFirstEsc = await page.evaluate(() => ({
      menuFor: window.__emberisle.getState().menuFor,
      pendingPlace: window.__emberisle.getState().pendingPlace,
      focusedTrigger: document.activeElement?.getAttribute("data-menu-trigger") ?? null,
    }));
    assert.equal(afterFirstEsc.menuFor, null, `${v.tag}: first Escape closes PlayerMenu`);
    assert.deepEqual(afterFirstEsc.pendingPlace, pending, `${v.tag}: first Escape leaves pendingPlace intact`);
    assert.equal(afterFirstEsc.focusedTrigger, "p1", `${v.tag}: first Escape returns focus to p1 trigger`);

    // A second Escape cancels pendingPlace.
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.__emberisle.getState().pendingPlace === null);
    assert.equal(await page.evaluate(() => window.__emberisle.getState().pendingPlace), null, `${v.tag}: second Escape cancels pendingPlace`);

    console.log(`${v.tag}: partner-turn Trade guard and Escape pendingPlace isolation ok`);
    await ctx.close();
  }
  assert.equal(errors.length, 0, `page errors:\n${errors.join("\n")}`);
  console.log("player-menu-guards-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
