// Owner bug (iPhone 17 Pro Max): "Game wrongly won't let me upgrade my starter outposts to strongholds." In a practice game
// past setup, on the two starter outposts the setup phase placed:
// - on a phone (440x956 upright and 956x440 sideways, real touch taps): with Upgrade armed and the goods in hand, one tap on
//   a starter outpost raises the stronghold (no Place chip to confirm), and the corner under the tap is the outpost, not
//   covered by the HUD; a path still selects on the first tap and places on the Place chip; online (the host's legal list
//   and a stubbed socket) one tap sends buildStronghold;
// - a hand short of ore keeps the Upgrade button pressable: a tap says "Need 1 more ore" (to the screen reader and in
//   the button's description; #535: the chip over the button is the one line on screen, so the HUD error line stays
//   empty) and arms nothing; short of everything it says "Need 3 more grain and 2 more ore";
// - at 1280x720 a mouse click on an armed outpost still upgrades it in one click;
// Zero console errors. Run: npm run upgrade-prove (VITE_PORT, default 8520).
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";

const PORT = Number(process.env.VITE_PORT) || 8520;
// A step waits this long for the page to show what it was asked for. These are readiness waits, not speed limits: the proof
// asserts what the page does, so a slow runner takes longer to get there and still passes (#673); a hang still fails here.
const STEP_MS = 30_000;
const VIEWS = [
  { tag: "440x956", width: 440, height: 956, touch: true, insets: { top: 62, right: 0, bottom: 34, left: 0 } },
  { tag: "956x440", width: 956, height: 440, touch: true, insets: { top: 0, right: 62, bottom: 21, left: 62 } },
  { tag: "1280x720", width: 1280, height: 720 },
];

// A practice game past setup and into `main` for the person (p0), who holds the two outposts setup placed.
function mainGame(hand, seed = 11) {
  let g = createGame({ humans: [{ name: "Ember" }], bots: 3, seed });
  while (g.phase !== "roll") g = applyAction(g, g.current, chooseBotAction(g, g.current)).state;
  g.phase = "main";
  g.current = "p0";
  g.dice = [3, 4];
  g.players.find((p) => p.id === "p0").resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0, ...hand };
  return g;
}

mkdirSync("test-results", { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
let code = 0;
try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch });
    const page = await ctx.newPage();
    page.setDefaultTimeout(STEP_MS);
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${v.tag}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
    if (v.insets) await (await ctx.newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets: v.insets });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state);
    const press = async (loc) => {
      const b = await loc.boundingBox();
      const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
      if (v.touch) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
    };
    const load = async (hand) => {
      await page.evaluate((g) => {
        window.__emberisle.getState().startAi();
        window.__emberisle.setState({ state: g, buildMode: "none", pendingPlace: null, error: null, toast: null });
      }, mainGame(hand));
      await page.getByTestId("build-stronghold").waitFor();
      await page.waitForFunction(() => window.__isle?.screenOf);
    };
    const mine = () =>
      page.evaluate(() => {
        const st = window.__emberisle.getState().state;
        return st.vertices.filter((x) => x.building?.playerId === "p0").map((x) => ({ id: x.id, kind: x.building.kind }));
      });
    const upgrade = page.getByTestId("build-stronghold");
    // Where a corner sits once the camera has stopped (wait for the frame to settle before reading it).
    const settled = async (id) => {
      const frames = await page.evaluate(() => window.__isle.renders);
      let last = null;
      for (let i = 0; i < 120; i++) {
        const p = await page.evaluate(({ id, frames }) => ({ ...window.__isle.screenOf(id), n: window.__isle.renders - frames }), { id, frames });
        if (p.n >= 8 && last && Math.hypot(p.x - last.x, p.y - last.y) < 0.5) return p;
        last = p;
        await page.waitForTimeout(250);
      }
      throw new Error(`${v.tag}: the camera never settled`);
    };
    const tag = v.tag;

    // 1. Enough goods: arm Upgrade, tap a starter outpost; one tap raises it.
    await load({ grain: 3, ore: 2 });
    const before = await mine();
    assert.equal(before.length, 2, `${tag}: two starter outposts`);
    assert.ok(before.every((x) => x.kind === "outpost"));
    await press(upgrade);
    await page.waitForFunction(() => window.__emberisle.getState().buildMode === "stronghold");
    const target = before[0].id;
    const at = await settled(target);
    const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, at);
    assert.equal(top, "CANVAS", `${tag}: the starter outpost at ${at.x.toFixed(0)},${at.y.toFixed(0)} is covered by ${top}`);
    if (v.touch) await page.touchscreen.tap(at.x, at.y);
    else await page.mouse.click(at.x, at.y);
    await page.waitForFunction((id) => window.__emberisle.getState().state.vertices.find((x) => x.id === id).building.kind === "stronghold", target, { timeout: STEP_MS }).catch(async () => {
      const s = await page.evaluate(() => ({ pp: window.__emberisle.getState().pendingPlace, chip: !!document.querySelector('[data-testid="place-chip"]') }));
      throw new Error(`${tag}: one tap on an armed starter outpost did not upgrade it (${JSON.stringify(s)})`);
    });
    assert.equal(await page.getByTestId("place-chip").count(), 0, `${tag}: no Place chip left`);
    console.log(`${tag}: one ${v.touch ? "touch tap" : "click"} upgrades a starter outpost`);

    // 2. The other outpost too, with a second touch tap, after goods for another.
    if (v.touch) {
      await page.evaluate(() => {
        const g = window.__emberisle;
        const st = structuredClone(g.getState().state);
        st.players.find((p) => p.id === "p0").resources = { timber: 0, clay: 0, wool: 0, grain: 3, ore: 2 };
        st.seq += 1;
        g.setState({ state: st });
      });
      await press(upgrade);
      await page.waitForFunction(() => window.__emberisle.getState().buildMode === "stronghold", null, { timeout: STEP_MS }).catch(async () => {
        throw new Error(`${tag}: Upgrade did not arm for the second outpost: ${JSON.stringify(await page.evaluate(() => { const s = window.__emberisle.getState(); return { error: s.error, bm: s.buildMode, cur: s.state.current, ph: s.state.phase, hand: s.state.players[0].resources }; }))}`);
      });
      const second = before[1].id;
      const p2 = await settled(second);
      await page.touchscreen.tap(p2.x, p2.y);
      await page.waitForFunction((id) => window.__emberisle.getState().state.vertices.find((x) => x.id === id).building.kind === "stronghold", second, { timeout: STEP_MS });
      console.log(`${tag}: the second starter outpost upgrades in one tap`);
    }

    // 3. A path keeps select-then-confirm on touch.
    if (v.touch) {
      await page.evaluate(() => {
        const g = window.__emberisle;
        const st = structuredClone(g.getState().state);
        st.players.find((p) => p.id === "p0").resources = { timber: 2, clay: 2, wool: 0, grain: 0, ore: 0 };
        st.seq += 1;
        g.setState({ state: st, buildMode: "none" });
      });
      await press(page.getByTestId("build-path"));
      await page.waitForFunction(() => window.__emberisle.getState().buildMode === "path");
      const edge = await page.evaluate(() => window.__emberisle.getState().highlights().edges[0]);
      const pe = await settled(edge);
      const paths = () => page.evaluate(() => window.__emberisle.getState().state.edges.filter((e) => e.path).length);
      const had = await paths();
      await page.touchscreen.tap(pe.x, pe.y);
      await page.getByTestId("place-chip").waitFor();
      assert.equal(await paths(), had, `${tag}: a path tap only selects`);
      await press(page.getByTestId("place-chip"));
      await page.waitForFunction((n) => window.__emberisle.getState().state.edges.filter((e) => e.path).length === n + 1, had, { timeout: STEP_MS });
      console.log(`${tag}: a path still selects, then places on the chip`);
    }

    // 3b. Online: the host's `legal.stronghold` (server/host.mjs legalFor: the same legalCities, only once the hand can pay) lights
    //     the corners, and one tap sends the build to the host.
    if (v.touch) {
      await load({ grain: 3, ore: 2 });
      const ids = (await mine()).map((x) => x.id);
      await page.evaluate((ids) => {
        window.__sent = [];
        window.__emberisle.setState({
          mode: "online",
          localId: "p0",
          net: { act: (a) => (window.__sent.push(a), true), close() {} },
          legal: { outpost: [], path: [], stronghold: ids, wayfarer: [], steal: {}, discard: 0, actions: ["trade", "pass"] },
        });
      }, ids);
      await press(upgrade);
      await page.waitForFunction(() => window.__emberisle.getState().buildMode === "stronghold");
      const online = await settled(ids[0]);
      await page.touchscreen.tap(online.x, online.y);
      await page.waitForFunction(() => window.__sent.length > 0, null, { timeout: STEP_MS });
      const sent = await page.evaluate(() => window.__sent);
      assert.deepEqual(sent, [{ type: "buildStronghold", vertexId: ids[0] }], `${tag}: online, one tap sends the upgrade`);
      assert.equal(await page.getByTestId("place-chip").count(), 0, `${tag}: online, no Place chip`);
      console.log(`${tag}: online, one tap sends buildStronghold to the host`);
    }

    // 4. Short of ore: Upgrade says so, on the button and to the screen reader (no HUD error line, #535), and arms nothing.
    await load({ grain: 3, ore: 1 });
    assert.match(await upgrade.getAttribute("aria-description"), /Need 1 more ore/, `${tag}: description`);
    await press(upgrade);
    await page.waitForFunction(() => /Need 1 more ore/.test(window.__emberisle.getState().announcement ?? ""), null, { timeout: STEP_MS });
    assert.equal(await page.evaluate(() => window.__emberisle.getState().buildMode), "none", `${tag}: a short Upgrade arms nothing`);
    await load({});
    assert.match(await upgrade.getAttribute("aria-description"), /Need 3 more grain and 2 more ore/, `${tag}: short of everything`);
    await press(upgrade);
    await page.waitForFunction(() => /Need 3 more grain and 2 more ore/.test(window.__emberisle.getState().announcement ?? ""), null, { timeout: STEP_MS });
    assert.equal((await page.getByTestId("announce-error").textContent()).trim(), "Need 3 more grain and 2 more ore", `${tag}: the alert region says it`);
    assert.equal(await page.evaluate(() => window.__emberisle.getState().error), null, `${tag}: no HUD error line is set`);
    assert.equal(await page.locator("span.text-orange-700", { hasText: "Need 3 more grain" }).count(), 0, `${tag}: no error line on screen`);
    console.log(`${tag}: a short hand says "Need 1 more ore" / "Need 3 more grain and 2 more ore"`);
    await page.screenshot({ path: `test-results/upgrade-${tag}.png` });
    await ctx.close();
  }
  if (errors.length) throw new Error(`console errors: ${errors.join(" | ")}`);
  console.log("upgrade prove ok");
} catch (e) {
  console.log("FAIL", e.message);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
