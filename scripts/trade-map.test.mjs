// #536: browser proof of exact trade previews, live hands, directional motion, and one-step settlement.
// Run: CHROMIUM_PATH=/usr/bin/chromium node --import ./server/register.mjs scripts/trade-map.test.mjs
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";
import { createGame } from "../src/lib/game/board.ts";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";

const PORT = 8099;
let base = createGame({ humans: [{ name: "Ember" }], bots: 3, seed: 11 });
while (base.phase !== "roll") base = applyAction(base, base.current, chooseBotAction(base, base.current)).state;
base.players.sort((a, b) => a.id.localeCompare(b.id));
base.phase = "main";
base.current = "p0";
base.dice = [3, 4];
for (const v of base.vertices) v.harbor = null;
for (const p of base.players) {
  p.kind = "human";
  p.resources = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
}
Object.assign(base.players[0].resources, { timber: 6, clay: 2, grain: 1, ore: 6 });
Object.assign(base.players[1].resources, { wool: 3, ore: 2 });
for (const r of RESOURCES) base.bank[r] = 19 - base.players.reduce((n, p) => n + p.resources[r], 0);
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
mkdirSync("test-results", { recursive: true });
const page = await browser.newPage({ viewport: { width: 440, height: 956 } });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const panel = page.getByTestId("trade-panel");
const more = (r, side) => panel.getByRole("button", { name: `More ${r} to ${side}`, exact: true });
const fewer = (r, side) => panel.getByRole("button", { name: `Fewer ${r} to ${side}`, exact: true });
const ask = () => panel.getByRole("button", { name: "Ask the table" });
const bank = () => panel.getByRole("button", { name: /^(Bank 4|Dock [23]):1$/ });
const change = (fn, arg) => page.evaluate(([f, a]) => {
  const store = window.__emberisle;
  const g = structuredClone(store.getState().state);
  new Function("g", "a", f)(g, a);
  store.setState({ state: g });
}, [fn, arg]);
async function load(g = base) {
  await page.evaluate(() => window.__emberisle.getState().goTitle());
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  await page.evaluate((g) => {
    window.__emberisle.getState().startAi();
    window.__emberisle.setState({ state: g });
  }, g);
  await page.getByRole("button", { name: "Trade", exact: true }).waitFor();
  await page.evaluate(() => window.__isle?.renderer.setAnimationLoop(null));
}
async function open() {
  await page.getByRole("button", { name: "Trade", exact: true }).click();
  await panel.waitFor();
}
async function textHas(locator, text) {
  await page.waitForFunction(([id, text]) => document.querySelector(`[data-testid="${id}"]`)?.textContent.includes(text), [await locator.getAttribute("data-testid"), text]);
}
async function settled() {
  return page.evaluate(() => {
    const s = window.__emberisle.getState();
    return { hands: s.state.players.map((p) => p.resources), bank: s.state.bank, offer: s.offer, open: s.tradeOpen };
  });
}
try {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  for (const [width, height] of [[440, 956], [956, 440], [1280, 720], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await load();
    await open();
    assert(await ask().isDisabled(), "empty offer must stay disabled");
    await more("timber", "give").click();
    assert(await ask().isDisabled(), "one-sided offer must stay disabled");
    await more("timber", "give").click();
    await more("wool", "want").click();
    await more("ore", "want").click();
    const preview = panel.getByTestId("trade-player-preview");
    assert.match(await preview.textContent(), /You give: 2 timber.*You get: 1 wool, 1 ore/);
    assert(await more("timber", "want").isDisabled(), "same kind cannot be sent both ways");
    assert(await bank().isDisabled(), "bank must reject mixed kinds");
    assert.equal(await panel.getByTestId("trade-give-timber").getByTestId("trade-owned").textContent(), "Have 6");
    const layout = await panel.evaluate((el) => {
      const box = (s) => el.querySelector(s).getBoundingClientRect().toJSON();
      return { give: box('[data-testid="trade-give-row"]'), get: box('[data-testid="trade-want-row"]'), footer: box("footer"),
        targets: [...el.querySelectorAll("button")].map((b) => ({ label: b.ariaLabel || b.textContent, w: b.offsetWidth, h: b.offsetHeight })) };
    });
    assert(layout.give.bottom <= layout.get.y, "give must sit above get");
    assert(layout.footer.y >= 0 && layout.footer.bottom <= height, "exact quotes and actions must stay visible");
    for (const t of layout.targets) assert(t.w >= 44 && t.h >= 44, `small target: ${JSON.stringify(t)}`);
    // Focus may scroll goods, but must stay inside the modal.
    for (let n = 0; n < 14; n++) {
      await page.keyboard.press("Tab");
      assert(await panel.evaluate((el) => el.contains(document.activeElement)), "Tab left modal");
    }
    await panel.locator(".trade-composer-scroll").evaluate((el) => { el.scrollTop = 0; });
    await page.screenshot({ path: `test-results/trade-map-${width}x${height}.png` });
    await change('g.players[0].resources.timber = 1');
    await textHas(preview, "You give: 1 timber");
    assert(await more("timber", "give").isDisabled(), "live hand must cap give");
    await change('g.players[0].resources.timber = 0');
    await textHas(preview, "You give: choose goods");
    assert(await ask().isDisabled(), "live empty hand must disable ask");
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), "Trade");
    console.log(`${width}x${height}: vertical rows, owned counts, mixed preview, live clamp, fixed actions, 44px targets, focus/Escape ok`);
  }

  await page.setViewportSize({ width: 440, height: 956 });
  await load();
  await open();
  // Pause the real CSS animation at its endpoints to measure its full trajectory.
  for (const side of ["give", "want"]) {
    const r = side === "give" ? "timber" : "wool";
    await more(r, side).click();
    const delta = await panel.getByTestId(`trade-${side}-${r}`).getByTestId("trade-selection-motion").evaluate((el) => {
      const a = el.getAnimations()[0];
      a.pause(); a.currentTime = 0;
      const start = el.getBoundingClientRect().y;
      a.currentTime = 220;
      return { y: el.getBoundingClientRect().y - start, duration: a.effect.getTiming().duration };
    });
    assert.equal(delta.duration, 220);
    assert(Math.abs(delta.y - (side === "give" ? -12 : 12)) <= 1, `${side} motion: ${JSON.stringify(delta)}`);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await more("timber", "give").click();
  assert.equal(await panel.getByTestId("trade-give-timber").getByRole("status").textContent(), "2");
  assert.equal(await panel.getByTestId("trade-give-timber").getByTestId("trade-selection-motion").evaluate((el) => el.getAnimations().length), 0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  console.log("motion: give -12px / get +12px in 220ms; reduced motion shows selected count instantly");

  for (const rate of [4, 3, 2]) {
    const g = structuredClone(base);
    const owned = g.vertices.filter((v) => v.building?.playerId === "p0");
    if (rate <= 3) owned[0].harbor = "any";
    if (rate === 2) owned[1].harbor = "ore";
    await load(g);
    await open();
    await more("ore", "give").click();
    await more("wool", "want").click();
    await more("wool", "want").click();
    assert.equal(await panel.getByTestId("trade-hint").textContent(), `You give ${rate} ore. You get 1 wool.`);
    await bank().click();
    const actual = await settled();
    assert.equal(actual.hands[0].ore, 6 - rate);
    assert.equal(actual.hands[0].wool, 1);
    assert.equal(actual.bank.ore, g.bank.ore + rate);
    assert.equal(actual.bank.wool, g.bank.wool - 1);
    assert.equal(actual.open, false);
    console.log(`${rate}:1 bank/dock: quote equals actual one-exchange debit and receipt despite player selection of 1 for 2`);
  }
  await load();
  await open();
  await more("ore", "give").click();
  await more("wool", "want").click();
  await change('g.bank.wool = 0');
  assert(await bank().isDisabled());
  await textHas(panel.getByTestId("trade-hint"), "no wool");
  await change('g.bank.wool = 1; g.players[0].resources.ore = 3');
  assert(await bank().isDisabled());
  await textHas(panel.getByTestId("trade-hint"), "Need 4 ore");
  console.log("bank: exhausted stock and unaffordable rates refuse");

  // Use the actual practice store, rules, and bot answer timer.
  // Two human recipients keep the offer open after the bot declines.
  const mixed = structuredClone(base);
  mixed.players[3].kind = "bot";
  mixed.players[1].name = mixed.players[0].name; // Seat identity must survive duplicate display names.
  await load(mixed);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open();
  await more("timber", "give").click();
  await more("clay", "give").click();
  await more("wool", "want").click();
  await more("ore", "want").click();
  // Record store-to-DOM latency without polling across the bot timer.
  await page.evaluate(() => {
    window.__declineAt = 0;
    window.__emberisle.subscribe((now, prev) => {
      if (now.declined.includes("p3") && !prev.declined.includes("p3")) window.__declineAt = performance.now();
    });
  });
  await ask().click();
  const toast = page.getByTestId("trade-toast");
  await toast.waitFor();
  assert.equal(await toast.getByTestId("trade-response-p1").getAttribute("data-response"), "waiting");
  await page.waitForFunction(() => document.querySelector('[data-testid="trade-response-p3"]')?.getAttribute("data-response") === "declined");
  assert(await page.evaluate(() => performance.now() - window.__declineAt < 1000), "bot cross took over 1 second to render");
  await page.screenshot({ path: "test-results/trade-map-responses.png" });
  await page.evaluate(() => window.__emberisle.setState({ localId: "p1" }));
  await textHas(page.getByTestId("trade-receipt"), "You give: 1 wool, 1 ore");
  await textHas(page.getByTestId("trade-receipt"), "You get: 1 timber, 1 clay");
  await change('g.players[1].resources.ore = 0');
  await page.waitForFunction(() => document.querySelector(".trade-yes")?.getAttribute("aria-disabled") === "true");
  await toast.getByRole("button", { name: "Yes", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert((await settled()).offer, "unaffordable Yes must not settle");
  await change('g.players[1].resources.ore = 2');
  await page.waitForFunction(() => !document.querySelector(".trade-yes")?.hasAttribute("aria-disabled"));
  await toast.getByRole("button", { name: "Yes", exact: true }).click();
  await page.getByTestId("trade-outcome").waitFor();
  assert.equal(await page.getByTestId("trade-outcome").getAttribute("data-taker"), "p1");
  const expectedColor = await page.evaluate((color) => { const el = document.createElement("span"); el.style.background = color; return el.style.background; }, mixed.players[1].color);
  assert.equal(await page.getByTestId("trade-outcome").locator("span").evaluate((el) => el.style.background), expectedColor);
  const actual = await settled();
  assert.equal(actual.offer, null);
  assert.deepEqual(actual.hands[0], { timber: 5, clay: 1, wool: 1, grain: 1, ore: 7 });
  assert.deepEqual(actual.hands[1], { timber: 1, clay: 1, wool: 2, grain: 0, ore: 1 });
  assert.deepEqual(actual.bank, mixed.bank, "player trade must not touch bank");
  console.log("real mixed trade: reduced-motion bot cross <1s, recipient pays/gets preview, stale hand refuses, one Yes settles both bags exactly once");
  assert.deepEqual(errors, []);
  console.log("trade map proof ok; zero browser errors");
} finally {
  await browser.close();
  await vite.close();
}
