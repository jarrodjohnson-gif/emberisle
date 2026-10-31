// #831 B: one shared draft exposes exact table and bank quotes; each action settles its own receipt.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";
import { createGame } from "../src/lib/game/board.ts";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { RESOURCES, RESOURCE_LABEL } from "../src/lib/game/types.ts";

const PORT = Number(process.env.VITE_PORT) || 8469;
const VIEWS = [
  { tag: "390x844", width: 390, height: 844, touch: true },
  { tag: "844x390", width: 844, height: 390, touch: true },
  { tag: "1280x720", width: 1280, height: 720, touch: false },
];
let base = createGame({ humans: [{ name: "Jarrod" }], bots: 3, seed: 11 });
for (let guard = 0; base.phase !== "roll"; guard++) {
  assert.ok(guard < 300, "real setup must reach the first roll");
  const result = applyAction(base, base.current, chooseBotAction(base, base.current));
  assert.equal(result.error, undefined, "setup bot action must be legal");
  base = result.state;
}
base.phase = "main";
base.current = "p0";
base.dice = [3, 4];
for (const vertex of base.vertices) vertex.harbor = null;
for (const player of base.players) {
  player.kind = "human";
  player.resources = Object.fromEntries(RESOURCES.map((resource) => [resource, 0]));
}
Object.assign(base.players.find((player) => player.id === "p0").resources, { timber: 6, clay: 2, grain: 1, ore: 6 });
Object.assign(base.players.find((player) => player.id === "p1").resources, { wool: 3, ore: 2 });
for (const resource of RESOURCES) base.bank[resource] = 19 - base.players.reduce((count, player) => count + player.resources[resource], 0);

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
let browser;
const errors = [];
mkdirSync("test-results", { recursive: true });

const panelFor = (page) => page.getByTestId("trade-panel");
const goodsFor = (page) => panelFor(page).getByRole("region", { name: "Trade goods", exact: true });
const more = (page, resource, side) => panelFor(page).getByRole("button", { name: `More ${RESOURCE_LABEL[resource]} to ${side}`, exact: true });
const fewer = (page, resource, side) => panelFor(page).getByRole("button", { name: `Fewer ${RESOURCE_LABEL[resource]} to ${side}`, exact: true });
const askFor = (page) => panelFor(page).getByRole("button", { name: "Ask the table", exact: true });
const bankFor = (page) => panelFor(page).getByRole("button", { name: /^(Bank(?: 4:1)?|Dock [23]:1)$/ });
const snapshot = (page) => page.evaluate(() => JSON.stringify(window.__emberisle.getState().state));
const sent = (page) => page.evaluate(() => window.__tradeTabsSent);

async function load(page, game = base, mode = "ai") {
  await page.evaluate(() => window.__emberisle.getState().goTitle());
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  await page.evaluate(([game, mode]) => {
    const api = window.__emberisle;
    api.getState().startAi();
    api.setState({ state: game, localId: "p0", mode, tradeOpen: false, buildMode: "none", pendingPlace: null,
      peeking: true, spectator: false, offer: null, declined: [], tradeOutcome: null, tradeTaker: null,
      error: null, announcement: null, toast: null, net: null });
    window.__tradeTabsOriginal ??= { dispatch: api.getState().dispatch, askTable: api.getState().askTable };
    window.__tradeTabsSent = [];
    api.setState({
      dispatch: (...args) => {
        window.__tradeTabsSent.push({ kind: "dispatch", action: args[0] });
        return window.__tradeTabsOriginal.dispatch(...args);
      },
      askTable: (...args) => {
        window.__tradeTabsSent.push({ kind: "askTable", bags: args });
        return window.__tradeTabsOriginal.askTable(...args);
      },
    });
  }, [game, mode]);
  await page.getByRole("button", { name: "Trade", exact: true }).waitFor();
  await page.evaluate(() => window.__isle?.renderer.setAnimationLoop(null));
}

async function open(page) {
  await page.getByRole("button", { name: "Trade", exact: true }).click();
  await panelFor(page).waitFor();
}

async function change(page, patch) {
  await page.evaluate((patch) => {
    const api = window.__emberisle;
    const game = structuredClone(api.getState().state);
    if (patch.hand) Object.assign(game.players.find((player) => player.id === "p0").resources, patch.hand);
    if (patch.bank) Object.assign(game.bank, patch.bank);
    if (patch.current) game.current = patch.current;
    if (patch.phase) game.phase = patch.phase;
    if (patch.rate) {
      for (const vertex of game.vertices) vertex.harbor = null;
      const owned = game.vertices.filter((vertex) => vertex.building?.playerId === "p0");
      if (patch.rate <= 3) owned[0].harbor = "any";
      if (patch.rate === 2) owned[1].harbor = "timber";
    }
    api.setState({ state: game });
  }, patch);
}

async function hint(page, text) {
  await page.waitForFunction((text) => document.querySelector('[data-testid="trade-hint"]')?.textContent.includes(text), text);
}

async function preview(page, fragments) {
  await page.waitForFunction((fragments) => {
    const text = document.querySelector('[data-testid="trade-player-preview"]')?.textContent ?? "";
    return fragments.every((fragment) => text.includes(fragment));
  }, fragments);
}

// Edit the visible quantity cards; Bank derives kinds from the very same draft as Table.
async function bankSelect(page, give = "timber", want = "ore") {
  for (const side of ["give", "want"]) for (const resource of RESOURCES) {
    while (await fewer(page, resource, side).count()) await fewer(page, resource, side).click();
  }
  await more(page, give, "give").click();
  await more(page, want, "want").click();
}

async function sharedComposer(page, tag) {
  assert.equal(await panelFor(page).getByRole("tab").count(), 0, `${tag}: B has no route tabs`);
  assert.equal(await panelFor(page).getByRole("radio").count(), 0, `${tag}: B has no separate Bank selectors`);
  assert.equal(await goodsFor(page).count(), 1, `${tag}: one named goods region replaces both route panels`);
  assert.equal(await goodsFor(page).getAttribute("tabindex"), "0", `${tag}: the shared goods region is keyboard reachable`);
  const named = await goodsFor(page).evaluate((element) => {
    const ids = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
    return ids.map((id) => document.getElementById(id)?.textContent.trim() ?? null);
  });
  assert.deepEqual(named, ["Trade goods"], `${tag}: the shared region's accessible label resolves to rendered text`);
  assert.equal(await panelFor(page).getByTestId("trade-hint").isVisible(), true, `${tag}: Bank always exposes its live quote or disabled reason`);
}

async function layout(page, tag, route) {
  const result = await panelFor(page).evaluate((element) => {
    const rect = (node) => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }; };
    const footer = element.querySelector("footer");
    return { panel: rect(element), footer: rect(footer), horizontal: element.scrollWidth > element.clientWidth + 1,
      pageHorizontal: document.documentElement.scrollWidth > innerWidth + 1,
      buttons: [...element.querySelectorAll("button")].filter((button) => button.getClientRects().length).map((button) => ({
        label: button.getAttribute("aria-label") || button.textContent.trim(), ...rect(button),
      })), footerActions: footer.querySelectorAll("button").length,
      gaps: [...element.querySelectorAll(".trade-resource-grid, footer")].map((node) => Number.parseFloat(getComputedStyle(node).gap)),
      smallText: [...element.querySelectorAll("h3, p, button, output, .trade-resource-name, .trade-owned")].filter((node) => node.getClientRects().length).map((node) => ({ text: node.textContent.trim(), size: Number.parseFloat(getComputedStyle(node).fontSize) })) };
  });
  const { width, height } = page.viewportSize();
  assert.ok(result.panel.left >= -0.5 && result.panel.right <= width + 0.5 && result.panel.top >= -0.5 && result.panel.bottom <= height + 0.5, `${tag} ${route}: panel fits ${JSON.stringify(result.panel)}`);
  assert.ok(result.footer.top >= 0 && result.footer.bottom <= height + 0.5, `${tag} ${route}: quote and action stay on screen ${JSON.stringify(result.footer)}`);
  assert.equal(result.horizontal || result.pageHorizontal, false, `${tag} ${route}: no horizontal overflow`);
  assert.equal(result.footerActions, route === "hotseat-bank" ? 1 : 2, `${tag} ${route}: one Bank action plus Table only for distinct players`);
  for (const button of result.buttons) assert.ok(button.width >= 43.9 && button.height >= 43.9, `${tag} ${route}: 44px control ${JSON.stringify(button)}`);
  assert.ok(result.gaps.every((gap) => gap >= 8), `${tag} ${route}: goods and action gaps are at least 8px ${JSON.stringify(result.gaps)}`);
  assert.ok(result.smallText.every((item) => item.size >= 12), `${tag} ${route}: composer text remains at least 12px ${JSON.stringify(result.smallText)}`);
  await approvedBLayout(page, tag, route);
  await panelFor(page).locator(".trade-composer-scroll").evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: `test-results/trade-tabs-${tag}-${route}.png` });
}

async function approvedBLayout(page, tag, route) {
  // Hotseat's existing behavior checks remain; its visual spec is still an owner question.
  if (route === "hotseat-bank") return;
  const geometry = await panelFor(page).evaluate((element) => {
    const rect = (node) => {
      const b = node.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
    };
    const bank = element.querySelector(".trade-bank-box");
    const table = element.querySelector('[data-testid="trade-player-preview"]').closest(".trade-route");
    const give = element.querySelector('[data-testid="trade-give-row"]');
    const colours = [...give.querySelectorAll(".trade-resource")].map((card) => {
      const button = card.querySelector(".trade-add");
      const swatch = document.createElement("span");
      card.append(swatch);
      swatch.style.color = "var(--sym)";
      const palette = getComputedStyle(swatch).color;
      swatch.style.color = "var(--muted)";
      const unavailable = getComputedStyle(swatch).color;
      swatch.remove();
      return { palette, unavailable, disabled: button.disabled,
        icon: getComputedStyle(card.querySelector(".trade-add > svg")).color,
        name: getComputedStyle(card.querySelector(".trade-resource-name")).color };
    });
    return {
      bank: rect(bank), table: rect(table), action: rect(table.querySelector("button")),
      bankAction: rect(bank.querySelector("button")), quote: rect(bank.querySelector('[data-testid="trade-hint"]')),
      goods: rect(element.querySelector(".trade-composer-scroll")),
      rows: [rect(give), rect(element.querySelector('[data-testid="trade-want-row"]'))],
      unselectedCards: [...element.querySelectorAll(".trade-resource:not([data-selected])")].map(rect),
      titleWeight: Number.parseInt(getComputedStyle(element.querySelector("h2")).fontWeight), colours,
    };
  });
  assert.ok(geometry.table.right <= geometry.bank.left,
    `${tag} ${route}: final owner footer puts Table left and Bank right ${JSON.stringify(geometry)}`);
  assert.ok(Math.abs(geometry.bank.top - geometry.table.top) <= 0.5 && Math.abs(geometry.bank.width - geometry.table.width) <= 0.5,
    `${tag} ${route}: final owner footer columns align and have equal width`);
  if (page.viewportSize().height <= 480) {
    assert.ok(geometry.bankAction.left >= geometry.quote.right - 0.5, `${tag} ${route}: short-screen Bank action stays beside its quote`);
  } else {
    assert.ok(geometry.bankAction.top >= geometry.quote.bottom - 0.5, `${tag} ${route}: one Bank action sits below its exact quote`);
    assert.ok(Math.abs(geometry.bankAction.width - geometry.quote.width) <= 0.5, `${tag} ${route}: normal-height Bank action fills its inner column`);
  }
  assert.ok(Math.abs(geometry.action.width - geometry.table.width) <= 0.5, `${tag} ${route}: Ask the table fills its column`);
  assert.equal(new Set(geometry.colours.map((c) => c.palette)).size, 5, `${tag} ${route}: all five goods retain distinct palette colours`);
  for (const colour of geometry.colours) {
    assert.equal(colour.icon, colour.disabled ? colour.unavailable : colour.palette, `${tag} ${route}: each symbol uses its good colour, or neutral when unavailable`);
    assert.equal(colour.name, colour.disabled ? colour.unavailable : colour.palette, `${tag} ${route}: each name uses its good colour, or neutral when unavailable`);
  }
  assert.ok(geometry.titleWeight >= 700, `${tag} ${route}: Trade title is bold`);
  for (const row of geometry.rows) assert.ok(row.top >= geometry.goods.top - 0.5 && row.bottom <= geometry.goods.bottom + 0.5,
    `${tag} ${route}: both goods rows remain visible without scrolling ${JSON.stringify(geometry)}`);
  for (const card of geometry.unselectedCards) assert.ok(card.height <= (page.viewportSize().height <= 480 ? 90 : 104),
    `${tag} ${route}: unselected cards retain the final owner's compact height ${JSON.stringify(card)}`);
  const stock = panelFor(page).locator("#trade-bank-stock");
  if (await stock.count()) assert.equal(await stock.isVisible(), true, `${tag} ${route}: live Bank stock is visible as well as described`);
  if (page.viewportSize().height > 480) assert.equal(await panelFor(page).locator("#trade-bank-title").textContent(), "Bank & docks · one exchange", `${tag} ${route}: final owner Bank heading`);
  console.log(`approved B layout ${tag} ${route}: ${JSON.stringify(geometry)}`);
}

async function selectionMotion(page, resource, side, count, motion, tag) {
  const sample = await panelFor(page).getByTestId(`trade-${side}-${resource}`).getByTestId("trade-selection-motion").evaluate((element) => {
    const animation = element.getAnimations()[0];
    const output = element.parentElement.querySelector("output");
    const result = { text: element.textContent.trim(), count: output.textContent.trim(), animations: element.getAnimations().length,
      outputVisible: output.getBoundingClientRect().height > 0 && getComputedStyle(output).visibility !== "hidden" };
    if (!animation) return result;
    animation.pause();
    const duration = animation.effect.getTiming().duration;
    const at = (time) => {
      animation.currentTime = time;
      const style = getComputedStyle(element);
      return { y: new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform).m42, opacity: Number(style.opacity) };
    };
    return { ...result, duration, start: at(0), end: at(duration) };
  });
  const signed = `${side === "give" ? "-" : "+"}${count}`;
  assert.equal(sample.text.replace(/−/g, "-"), signed, `${tag}: ${side} selection chip names its signed quantity`);
  assert.equal(sample.count, String(count), `${tag}: selected count remains readable independently of its chip`);
  assert.equal(sample.outputVisible, true, `${tag}: selected count stays on the card`);
  if (motion === "reduce") {
    assert.equal(sample.animations, 0, `${tag}: reduced-motion selection is static`);
  } else {
    assert.equal(sample.duration, 220, `${tag}: selection retains its 220ms timing`);
    assert.equal(sample.start.y, 0, `${tag}: selection starts at rest`);
    assert.ok(Math.abs(sample.end.y - (side === "give" ? 12 : -12)) < 0.1, `${tag}: losses fall and gains rise ${JSON.stringify(sample)}`);
    assert.equal(sample.start.opacity, 1, `${tag}: the signed selection begins readable`);
    assert.equal(sample.end.opacity, 0, `${tag}: selection fades at its endpoint`);
  }
}

async function armBankMotion(page, rate) {
  await page.evaluate((rate) => {
    window.__tradeTabsBankObserver?.disconnect();
    window.__tradeTabsBankEndObserver?.disconnect();
    window.__tradeTabsBankMotion = { ready: false, rate };
    const beforeSeq = window.__emberisle.getState().state.seq;
    const cues = [
      { key: "handLoss", selector: `[data-testid="resource-flash"][data-resource="timber"][data-delta="-${rate}"]` },
      { key: "handGain", selector: '[data-testid="resource-flash"][data-resource="ore"][data-delta="+1"]' },
      { key: "cardLoss", selector: '[data-testid="resource-timber"] [data-testid="goods-lost"]' },
      { key: "cardGain", selector: '[data-testid="resource-ore"] [data-testid="goods-lit"]' },
    ];
    const color = (token) => {
      const probe = document.createElement("span");
      probe.style.color = token;
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    const read = (element) => {
      const card = element.closest(".goods-card");
      const tab = card.querySelector('[data-testid="resource-flash"]');
      const animations = element.getAnimations();
      const animation = animations[0];
      const movements = card.getAnimations().filter((a) => a.effect.target === card && a.effect.getKeyframes().some((f) => "transform" in f));
      const movement = element === tab ? null : movements[0];
      const firstStyle = getComputedStyle(element), tabStyle = getComputedStyle(tab), cardStyle = getComputedStyle(card);
      const result = { text: tab.textContent.replace(/\s+/g, " ").trim(), resource: card.dataset.testid.slice("resource-".length), pairedResource: tab.dataset.resource, delta: tab.dataset.delta,
        pairedTabVisible: tabStyle.visibility !== "hidden" && tab.getBoundingClientRect().height > 0,
        animations: animations.length, cardAnimations: movements.length, animationName: firstStyle.animationName, color: firstStyle.color,
        background: firstStyle.backgroundColor, shadow: firstStyle.boxShadow,
        tabColor: tabStyle.color, tabBackground: tabStyle.backgroundColor, tabShadow: tabStyle.boxShadow,
        palette: { resource: color(cardStyle.getPropertyValue("--c")), deep: color(cardStyle.getPropertyValue("--deep")),
          loss: color(cardStyle.getPropertyValue("--loss")), ink: color(cardStyle.getPropertyValue("--ink")), paper: color(cardStyle.getPropertyValue("--paper")) } };
      const at = (time) => {
        if (animation) animation.currentTime = time;
        if (movement) movement.currentTime = time;
        const style = getComputedStyle(element), position = getComputedStyle(element === tab ? element : card);
        return { y: new DOMMatrixReadOnly(position.transform === "none" ? undefined : position.transform).m42,
          opacity: Number(style.opacity), visible: style.visibility !== "hidden" && element.getBoundingClientRect().height > 0 };
      };
      if (!animation) return { ...result, start: at(0), peak: at(0), readable: at(0), hold: at(0), end: at(0) };
      animation.pause();
      movement?.pause();
      const timing = animation.effect.getTiming();
      const duration = Number(timing.duration), delay = Number(timing.delay);
      const sampled = { ...result, duration, delay, movementDuration: movement?.effect.getTiming().duration,
        start: at(delay), peak: at(delay + 120), readable: at(delay + duration / 2),
        hold: at(delay + 2500), end: at(delay + duration) };
      animation.currentTime = delay + duration / 2;
      if (movement) movement.currentTime = delay + duration / 2;
      return sampled;
    };
    const look = () => {
      if (window.__emberisle.getState().state.seq <= beforeSeq) return;
      const elements = cues.map((cue) => document.querySelector(cue.selector));
      if (elements.some((element) => !element)) return;
      window.__tradeTabsBankObserver.disconnect();
      window.__tradeTabsBankMotion = { ready: true, rate, beforeSeq, afterSeq: window.__emberisle.getState().state.seq,
        observedAt: performance.now(), reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
        compact: innerHeight <= 480, coarse: matchMedia("(pointer: coarse)").matches, upright: innerHeight > innerWidth,
        islandText: document.querySelectorAll('[data-testid="gain-float"]').length,
        cues: Object.fromEntries(cues.map((cue, index) => [cue.key, read(elements[index])])) };
      window.__tradeTabsBankEndObserver = new MutationObserver(() => {
        if (elements.some((element) => element.isConnected)) return;
        window.__tradeTabsBankMotion.endedAt = performance.now();
        window.__tradeTabsBankEndObserver.disconnect();
      });
      window.__tradeTabsBankEndObserver.observe(document.body, { childList: true, subtree: true });
    };
    window.__tradeTabsBankObserver = new MutationObserver(look);
    window.__tradeTabsBankObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  }, rate);
}

async function bankMotion(page, rate, tag) {
  await page.waitForFunction(() => window.__tradeTabsBankMotion?.ready);
  const actual = await page.evaluate(() => window.__tradeTabsBankMotion);
  assert.equal(actual.afterSeq, actual.beforeSeq + 1, `${tag}: movement belongs to the genuine one-action bank settlement`);
  // #773's approved V1 moves the card, keeps its signed tab still, and removes island gain text.
  const lift = actual.compact && !actual.coarse ? 0 : actual.upright && actual.coarse ? 6 : 4;
  const trajectories = { handLoss: 0, handGain: 0, cardLoss: 2, cardGain: -lift };
  for (const [key, cue] of Object.entries(actual.cues)) {
    const loss = key.endsWith("Loss");
    assert.equal(cue.resource, loss ? "timber" : "ore", `${tag}: ${key} identifies the actually traded resource`);
    assert.equal(cue.pairedResource, cue.resource, `${tag}: ${key} pairs its own card with the same-resource signed tab`);
    assert.equal(cue.delta, loss ? `-${rate}` : "+1", `${tag}: ${key} paired tab carries the exact settled delta`);
    assert.equal(cue.pairedTabVisible, true, `${tag}: ${key} paired signed tab stays visible`);
    assert.equal(cue.text.replace(/−/g, "-").startsWith(loss ? `-${rate}` : "+1"), true, `${tag}: ${key} shows the actual signed delta`);
    assert.equal(cue.readable.visible, true, `${tag}: ${key} remains on screen while readable`);
    assert.equal(cue.readable.opacity, 1, `${tag}: ${key} remains fully readable through the middle of its lifetime`);
    assert.equal(cue.hold.opacity, 1, `${tag}: ${key} preserves its readable hold through 2500ms`);
    if (actual.reduced) {
      assert.equal(cue.animations, 0, `${tag}: ${key} stays static with reduced motion`);
      assert.equal(cue.readable.y, 0, `${tag}: ${key} has no reduced-motion translation`);
      assert.equal(cue.cardAnimations, 0, `${tag}: ${key} has no reduced-motion card movement`);
    } else {
      assert.equal(cue.duration, 3000, `${tag}: ${key} holds 2500ms then fades for 500ms`);
      const expectedName = "goods-cue";
      assert.equal(cue.animationName, expectedName, `${tag}: the genuine cue uses its signed animation`);
      const [start, end] = [0, 0];
      assert.ok(Math.abs(cue.start.y - start) < 0.1 && Math.abs(cue.end.y - end) < 0.1,
        `${tag}: ${key} starts and settles at rest ${JSON.stringify(cue)}`);
      assert.ok(Math.abs(cue.peak.y - trajectories[key]) < 0.1 && Math.abs(cue.hold.y - trajectories[key]) < 0.1,
        `${tag}: ${key} lifts for gain or dips for loss through the full hold ${JSON.stringify(cue)}`);
      if (key.startsWith("card")) assert.equal(cue.movementDuration, 3000, `${tag}: ${key} card movement shares the fill clock`);
      assert.equal(cue.end.opacity, 0, `${tag}: ${key} fades after its reading window`);
    }
  }
  assert.notEqual(actual.cues.handLoss.color, actual.cues.handGain.color, `${tag}: hand signs retain distinct loss/gain colors`);
  assert.notEqual(actual.cues.cardLoss.tabColor, actual.cues.cardGain.tabColor, `${tag}: V1 card signs retain distinct loss/gain colors`);
  assert.equal(actual.islandText, 0, `${tag}: approved V1 replaces both island delta texts with card cues`);
  const gain = actual.cues.cardGain, loss = actual.cues.cardLoss;
  assert.equal(gain.background, gain.palette.resource, `${tag}: gain fills with the actual good's full color`);
  assert.ok(gain.shadow.includes(gain.palette.deep), `${tag}: gain retains its dark ring and shadow`);
  assert.equal(gain.tabColor, gain.palette.ink, `${tag}: gain tab text is the dark ink`);
  assert.equal(loss.tabBackground, loss.palette.loss, `${tag}: loss tab is the loss red`);
  assert.equal(loss.tabColor, "rgb(255, 255, 255)", `${tag}: loss tab text is white on the red`);
  assert.ok(loss.tabShadow.includes(loss.palette.loss) && loss.shadow !== "none", `${tag}: loss retains its red tab outline and card ring`);
  await page.waitForFunction(() => Boolean(window.__tradeTabsBankMotion?.endedAt));
  const lifetime = await page.evaluate(() => window.__tradeTabsBankMotion.endedAt - window.__tradeTabsBankMotion.observedAt);
  assert.ok(lifetime >= 2500, `${tag}: actual DOM cues retain the full 2500ms hold, including reduced motion (${lifetime}ms)`);
}

async function tableAndRoutes(page, tag, motion) {
  await load(page);
  await open(page);
  await sharedComposer(page, tag);
  assert.equal(await askFor(page).isDisabled(), true, `${tag}: empty table offer refuses`);
  assert.equal(await panelFor(page).getByRole("button", { name: /^Fewer / }).count(), 0, `${tag}: unselected goods have no subtract button`);
  assert.equal(await bankFor(page).isDisabled(), true, `${tag}: empty shared draft disables Bank with a visible reason`);
  await more(page, "timber", "give").click();
  await selectionMotion(page, "timber", "give", 1, motion, tag);
  assert.equal(await fewer(page, "timber", "give").count(), 1, `${tag}: selected good gets one subtract control`);
  assert.equal(await fewer(page, "clay", "give").count(), 0, `${tag}: unrelated subtract control remains absent`);
  assert.equal(await askFor(page).isDisabled(), true, `${tag}: one-sided table offer refuses`);
  await more(page, "timber", "give").click();
  await selectionMotion(page, "timber", "give", 2, motion, tag);
  await more(page, "clay", "give").click();
  await more(page, "wool", "want").click();
  await more(page, "ore", "want").click();
  await selectionMotion(page, "ore", "want", 1, motion, tag);
  await preview(page, ["You give: 2 wood, 1 brick", "You get: 1 sheep, 1 stone"]);
  assert.equal(await askFor(page).isEnabled(), true, `${tag}: the Table accepts a mixed exact bag`);
  assert.equal(await more(page, "timber", "want").isDisabled(), true, `${tag}: a good cannot appear on both sides`);
  assert.equal(await panelFor(page).getByTestId("trade-give-timber").getByTestId("trade-owned").textContent(), "Have 6", `${tag}: owned count comes from the live hand`);
  if (motion === "reduce") assert.equal(await panelFor(page).getByTestId("trade-give-timber").getByTestId("trade-selection-motion").evaluate((element) => element.getAnimations().length), 0, `${tag}: selected quantity does not animate under reduced motion`);
  await layout(page, tag, "table");
  if (page.viewportSize().height <= 480) {
    const mixedPreview = panelFor(page).getByTestId("trade-player-preview");
    const originalFont = await mixedPreview.evaluate((element) => element.style.fontFamily);
    try {
      await mixedPreview.evaluate((element) => { element.style.fontFamily = "monospace"; });
      const receipt = await mixedPreview.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
      }));
      assert.ok(receipt.height >= 2 * receipt.lineHeight, `${tag}: controlled mixed receipt wraps to at least two lines`);
      await layout(page, `${tag}-wrapped-receipt`, "table");
    } finally {
      await mixedPreview.evaluate((element, font) => { element.style.fontFamily = font; }, originalFont);
    }
  }
  const before = await snapshot(page);
  assert.equal(await bankFor(page).isVisible(), true, `${tag}: mixed table bags retain the compact Bank action`);
  assert.equal(await bankFor(page).isDisabled(), true, `${tag}: mixed bags cannot settle at Bank`);
  await hint(page, "Choose one kind on each side");
  await describedAs(bankFor(page), "Choose one kind on each side for a bank or dock exchange.", `${tag} mixed bank refusal`);
  await bankFor(page).click({ force: true });
  assert.equal(await snapshot(page), before, `${tag}: inspecting or pressing the mixed-bank refusal does not change the game`);
  assert.deepEqual(await sent(page), [], `${tag}: mixed-bank refusal sends no dispatch or offer`);
  for (const side of ["give", "want"]) for (const resource of RESOURCES) {
    const selector = more(page, resource, side);
    assert.equal(await selector.evaluate((element) => element.tagName), "BUTTON", `${tag}: shared ${side} selector is a native button`);
    assert.equal(await selector.getAttribute("role"), null, `${tag}: quantity buttons retain native semantics without radio choices`);
  }
  await bankSelect(page, "ore", "grain");
  await hint(page, "You give 4 stone. You get 1 wheat.");
  await preview(page, ["You give: 1 stone", "You get: 1 wheat"]);
  assert.equal(await askFor(page).isEnabled(), true, `${tag}: the same single-kind draft remains available to Table`);
  assert.equal(await bankFor(page).isEnabled(), true, `${tag}: the same single-kind draft enables the exact Bank quote`);
  await layout(page, tag, "bank");
  assert.equal(await panelFor(page).getByTestId("trade-give-ore").getByRole("status").textContent(), "1", `${tag}: Bank derives its give kind from the shared quantity`);
  assert.equal(await panelFor(page).getByTestId("trade-want-grain").getByRole("status").textContent(), "1", `${tag}: Bank derives its get kind from the shared quantity`);
  assert.equal(await snapshot(page), before, `${tag}: editing shared quantities leaves all game fields intact`);
  assert.deepEqual(await sent(page), [], `${tag}: editing the shared draft sends no action`);
  for (let count = 0; count < 18; count++) {
    await page.keyboard.press(count < 15 ? "Tab" : "Shift+Tab");
    assert.equal(await panelFor(page).evaluate((element) => element.contains(document.activeElement)), true, `${tag}: focus stays inside the modal`);
  }
  await page.keyboard.press("Escape");
  await panelFor(page).waitFor({ state: "detached" });
  assert.equal(await page.getByRole("button", { name: "Trade", exact: true }).evaluate((element) => element === document.activeElement), true, `${tag}: Escape restores the opener`);
  await open(page);
  await sharedComposer(page, tag);
  assert.equal(await askFor(page).isDisabled(), true, `${tag}: close clears the player draft`);
  assert.equal(await panelFor(page).getByRole("button", { name: /^Fewer / }).count(), 0, `${tag}: close removes selected quantities`);
  assert.equal(await panelFor(page).getByRole("button", { name: /^Fewer / }).count(), 0, `${tag}: close clears both shared Bank kinds`);
  assert.equal(await bankFor(page).isDisabled(), true, `${tag}: a reopened bank needs a new quote`);
  console.log(`${tag}: mixed exact bags, shared Table/Bank draft, selected-only minus, keyboard/focus, two receipts, 44px controls, close reset`);
}

async function liveDrafts(page, tag) {
  await load(page);
  await open(page);
  await more(page, "timber", "give").click();
  await more(page, "timber", "give").click();
  await more(page, "ore", "want").click();
  await change(page, { hand: { timber: 1 } });
  await preview(page, ["You give: 1 wood"]);
  assert.equal(await more(page, "timber", "give").isDisabled(), true, `${tag}: live losses clamp the exact give quantity`);
  await change(page, { hand: { timber: 0 } });
  await preview(page, ["You give: choose goods"]);
  assert.equal(await askFor(page).isDisabled(), true, `${tag}: a live empty hand disables Ask`);
  assert.equal(await fewer(page, "timber", "give").count(), 0, `${tag}: clamping to zero removes minus`);
  await change(page, { hand: { timber: 6 } });
  await preview(page, ["You give: choose goods"]);
  assert.equal(await askFor(page).isDisabled(), true, `${tag}: a later gain cannot restore discarded quantities`);
  await more(page, "timber", "give").click();
  await change(page, { current: "p1" });
  await panelFor(page).waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => window.__emberisle.getState().tradeOpen), false, `${tag}: ending the turn closes the draft`);
  await change(page, { current: "p0" });
  assert.equal(await panelFor(page).count(), 0, `${tag}: returning to the owner does not reopen it`);
  await open(page);
  assert.equal(await askFor(page).isDisabled(), true, `${tag}: turn change clears the player draft`);
  await bankSelect(page);
  await change(page, { phase: "roll" });
  await panelFor(page).waitFor({ state: "detached" });
  await change(page, { phase: "main" });
  await open(page);
  assert.equal(await panelFor(page).getByRole("button", { name: /^Fewer / }).count(), 0, `${tag}: phase change clears the shared Bank draft`);
  console.log(`${tag}: live hand clamp, no stale revival, turn/phase closure and reset`);
}

async function description(locator) {
  return locator.evaluate((element) => {
    const ids = (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    return { ids, missing: ids.filter((id) => !document.getElementById(id)),
      text: ids.map((id) => document.getElementById(id)?.textContent.replace(/\s+/g, " ").trim() ?? "").join(" ") };
  });
}

async function describedAs(locator, expected, tag) {
  const actual = await description(locator);
  assert.ok(actual.ids.length > 0, `${tag}: control has an accessible description`);
  assert.deepEqual(actual.missing, [], `${tag}: every accessible description reference exists`);
  assert.equal(actual.text, expected, `${tag}: accessible description gives the current owned/count/rate values`);
}

async function focusAfterRemoval(page, resource, side, tag) {
  const result = await panelFor(page).getByTestId(`trade-${side}-${resource}`).evaluate((element) => {
    const add = element.querySelector(".trade-add");
    const active = document.activeElement;
    return { addDisabled: add.disabled, onAdd: active === add, inResource: element.contains(active),
      inPanel: element.closest('[data-testid="trade-panel"]').contains(active),
      activeUsable: active instanceof HTMLElement && active.isConnected && active.tabIndex >= 0 && !active.hasAttribute("disabled"),
      active: active?.getAttribute("aria-label") || active?.getAttribute("role") || active?.tagName };
  });
  assert.equal(result.inPanel, true, `${tag}: removing the focused minus retains modal focus ${JSON.stringify(result)}`);
  assert.equal(result.activeUsable, true, `${tag}: focus returns to a connected usable control ${JSON.stringify(result)}`);
  if (!result.addDisabled) assert.equal(result.onAdd, true, `${tag}: final minus returns focus to its resource's add control`);
}

async function accessibility(page, tag) {
  await load(page);
  await open(page);
  await panelFor(page).getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Tab");
  assert.equal(await goodsFor(page).evaluate((element) => element === document.activeElement), true, `${tag}: Tab reaches the named shared goods region without hidden route stops`);
  assert.equal(await panelFor(page).getByRole("tab").count(), 0, `${tag}: no obsolete route stop remains in the tab sequence`);
  await page.keyboard.press("Tab");
  assert.equal(await more(page, "timber", "give").evaluate((element) => element === document.activeElement), true, `${tag}: shared region leads to its first available good`);
  await describedAs(more(page, "timber", "give"), "Have 6 0", `${tag} empty table give`);
  await more(page, "timber", "give").click();
  await describedAs(more(page, "timber", "give"), "Have 6 1", `${tag} selected table give`);
  await describedAs(fewer(page, "timber", "give"), "1", `${tag} selected table minus`);
  await fewer(page, "timber", "give").focus();
  await page.keyboard.press("Enter");
  assert.equal(await fewer(page, "timber", "give").count(), 0, `${tag}: final keyboard minus unmounts`);
  await focusAfterRemoval(page, "timber", "give", `${tag} manual final minus`);
  await describedAs(more(page, "timber", "give"), "Have 6 0", `${tag} after final table minus`);

  await more(page, "ore", "want").click();
  await fewer(page, "ore", "want").focus();
  await page.keyboard.press("Enter");
  await focusAfterRemoval(page, "ore", "want", `${tag} requested good final minus`);
  await more(page, "timber", "give").click();
  await more(page, "timber", "give").click();
  await fewer(page, "timber", "give").focus();
  await change(page, { hand: { timber: 1 } });
  await preview(page, ["You give: 1 wood"]);
  await describedAs(fewer(page, "timber", "give"), "1", `${tag} live remaining count`);
  assert.equal(await fewer(page, "timber", "give").evaluate((element) => element === document.activeElement), true, `${tag}: a live partial clamp keeps the remaining minus focused`);
  await change(page, { hand: { timber: 0 } });
  await preview(page, ["You give: choose goods"]);
  assert.equal(await fewer(page, "timber", "give").count(), 0, `${tag}: live zero clamp unmounts the focused minus`);
  await focusAfterRemoval(page, "timber", "give", `${tag} live focused-minus clamp`);
  await describedAs(more(page, "timber", "give"), "Have 0 0", `${tag} live empty-hand description`);

  await load(page);
  await open(page);
  await bankSelect(page);
  await describedAs(more(page, "timber", "give"), "Have 6 1", `${tag} shared Bank give`);
  await describedAs(more(page, "ore", "want"), "Have 6 1", `${tag} shared Bank get`);
  await describedAs(bankFor(page), `You give 4 wood. You get 1 stone. Bank stock: ${base.bank.ore} stone.`, `${tag} exact Bank receipt and live stock`);
  const initial = await snapshot(page);
  // Fixed fixture sequence: disabled same-kind and empty-hand controls must be skipped.
  await panelFor(page).getByRole("button", { name: "Close", exact: true }).focus();
  for (const [name, target] of [
    ["goods region", goodsFor(page)],
    ["More Wood give", more(page, "timber", "give")],
    ["Fewer Wood give", fewer(page, "timber", "give")],
    ["More Brick give", more(page, "clay", "give")],
    ["More Wheat give", more(page, "grain", "give")],
    ["More Brick want", more(page, "clay", "want")],
    ["More Sheep want", more(page, "wool", "want")],
    ["More Wheat want", more(page, "grain", "want")],
    ["More Stone want", more(page, "ore", "want")],
    ["Fewer Stone want", fewer(page, "ore", "want")],
    // #646: the Need control reads first but sits after the goods in the tab order, so the goods keep the first stops.
    ["Need", panelFor(page).getByRole("button", { name: "Need", exact: true })],
    ["Ask", askFor(page)],
    ["Bank", bankFor(page)],
    ["Close", panelFor(page).getByRole("button", { name: "Close", exact: true })],
  ]) {
    await page.keyboard.press("Tab");
    assert.equal(await target.evaluate((element) => element === document.activeElement), true, `${tag}: fixed shared-control Tab sequence reaches ${name}, skipping disabled controls and wrapping inside the modal`);
  }
  for (const side of ["give", "want"]) {
    const resource = side === "give" ? "timber" : "ore";
    const opposite = side === "give" ? "want" : "give";
    await more(page, resource, side).focus();
    await page.keyboard.press("Enter");
    await describedAs(more(page, resource, side), "Have 6 2", `${tag} keyboard ${side} quantity`);
    await fewer(page, resource, side).focus();
    await page.keyboard.press("Enter");
    await describedAs(more(page, resource, side), "Have 6 1", `${tag} keyboard ${side} removal`);
    assert.equal(await more(page, resource, opposite).isDisabled(), true, `${tag}: keyboard cannot choose the same kind on the opposite side`);
  }
  assert.equal(await snapshot(page), initial, `${tag}: quantity keyboard navigation changes only the shared draft`);
  assert.deepEqual(await sent(page), [], `${tag}: quantity keyboard navigation sends no action`);
  await change(page, { rate: 2 });
  await hint(page, "You give 2 wood. You get 1 stone.");
  await describedAs(bankFor(page), `You give 2 wood. You get 1 stone. Bank stock: ${base.bank.ore} stone.`, `${tag} live dock and stock description`);
  await change(page, { bank: { ore: 0 } });
  await hint(page, "no stone");
  await describedAs(bankFor(page), "The bank has no stone. Bank stock: 0 stone.", `${tag} live zero-stock refusal description`);
  console.log(`${tag}: named goods region, native quantity/action Tab sequence; keyboard edits skip same kinds; live owned/count/Bank descriptions; final-minus focus recovers`);

}

async function ratesAndRejections(page, tag) {
  await load(page);
  await open(page);
  await bankSelect(page);
  for (const [rate, label] of [[4, "Bank 4:1"], [3, "Dock 3:1"], [2, "Dock 2:1"], [4, "Bank 4:1"]]) {
    await change(page, { rate });
    await hint(page, `You give ${rate} wood. You get 1 stone.`);
    assert.equal((await bankFor(page).textContent()).trim(), label, `${tag}: quote follows live dock ownership at ${rate}:1`);
  }
  await change(page, { hand: { timber: 3 } });
  await hint(page, "Need 4 wood");
  assert.equal(await bankFor(page).isDisabled(), true, `${tag}: unaffordable rate refuses`);
  const insufficient = await snapshot(page);
  await bankFor(page).click({ force: true });
  assert.equal(await snapshot(page), insufficient, `${tag}: pressing unaffordable bank sends nothing`);
  await change(page, { hand: { timber: 6 }, bank: { ore: 0 } });
  await hint(page, "no stone");
  assert.equal(await bankFor(page).isDisabled(), true, `${tag}: exhausted bank stock refuses`);
  const exhausted = await snapshot(page);
  await bankFor(page).click({ force: true });
  assert.equal(await snapshot(page), exhausted, `${tag}: exhausted stock cannot be traded`);
  await change(page, { bank: { ore: base.bank.ore } });
  await hint(page, "You give 4 wood. You get 1 stone.");
  assert.equal(await more(page, "timber", "want").isDisabled(), true, `${tag}: bank cannot request its give kind`);
  await more(page, "timber", "want").click({ force: true });
  assert.equal(await panelFor(page).getByTestId("trade-want-ore").getByRole("status").textContent(), "1", `${tag}: rejecting the same kind preserves the valid want`);
  assert.equal(await panelFor(page).getByTestId("trade-want-timber").getByRole("status").textContent(), "0", `${tag}: a same-kind quote cannot be selected`);
  assert.deepEqual(await sent(page), [], `${tag}: every invalid bank press leaves dispatch untouched`);

  for (const rate of [4, 3, 2]) {
    await load(page);
    await change(page, { rate });
    const initial = await page.evaluate(() => structuredClone(window.__emberisle.getState().state));
    await open(page);
    await bankSelect(page);
    await hint(page, `You give ${rate} wood. You get 1 stone.`);
    await armBankMotion(page, rate);
    await bankFor(page).click();
    await panelFor(page).waitFor({ state: "detached" });
    const result = await page.evaluate(() => {
      const store = window.__emberisle.getState();
      return { game: store.state, open: store.tradeOpen, offer: store.offer };
    });
    const before = initial.players.find((player) => player.id === "p0").resources;
    const after = result.game.players.find((player) => player.id === "p0").resources;
    for (const resource of RESOURCES) {
      const delta = resource === "timber" ? -rate : resource === "ore" ? 1 : 0;
      assert.equal(after[resource], before[resource] + delta, `${tag}: ${rate}:1 actual ${resource} matches the quote`);
      assert.equal(result.game.bank[resource], initial.bank[resource] - delta, `${tag}: ${rate}:1 bank conservation for ${resource}`);
    }
    assert.equal(result.game.seq, initial.seq + 1, `${tag}: ${rate}:1 settles exactly once`);
    assert.equal(result.open, false, `${tag}: successful bank exchange closes the panel`);
    assert.equal(result.offer, null, `${tag}: bank exchange creates no table offer`);
    assert.deepEqual(await sent(page), [{ kind: "dispatch", action: { type: "bankTrade", give: "timber", want: "ore" } }], `${tag}: ${rate}:1 sends one bank action`);
    await bankMotion(page, rate, `${tag} ${rate}:1`);
  }
  console.log(`${tag}: live 4/3/2:1 quotes, invalid exchanges refused, real bank conservation, V1 signed tabs, gains lift/losses dip, 2500ms hold + 500ms fade, no island text (reduced motion static)`);
}

async function modes(page, tag) {
  await load(page, base, "online");
  await open(page);
  await sharedComposer(page, tag);
  assert.deepEqual(await sent(page), [], `${tag}: opening the shared online composer sends no host action`);
  await load(page, base, "hotseat");
  await open(page);
  assert.equal(await panelFor(page).getByRole("tab").count(), 0, `${tag}: hotseat has no route tabs`);
  assert.equal(await panelFor(page).locator(".trade-instructions").textContent(), "Choose one kind to give and one to get. Trade with the bank or your docks.", `${tag}: hotseat instructions describe only one-kind bank or dock exchange`);
  assert.equal(await askFor(page).count(), 0, `${tag}: hotseat has no player offer action`);
  assert.equal(await panelFor(page).getByTestId("trade-player-preview").count(), 0, `${tag}: hotseat has no player quote`);
  assert.equal(await panelFor(page).getByRole("radio").count(), 0, `${tag}: hotseat has no separate Bank selectors`);
  assert.equal(await panelFor(page).getByRole("button", { name: /^More / }).count(), 10, `${tag}: hotseat uses the same ten quantity cards`);
  await bankSelect(page);
  await hint(page, "You give 4 wood. You get 1 stone.");
  await layout(page, tag, "hotseat-bank");
  assert.deepEqual(await sent(page), [], `${tag}: choosing a hotseat quote does not trade yet`);
  console.log(`${tag}: online exposes both receipts; hotseat uses shared cards with Bank only`);
}

async function lazyRecovery() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const isolatedErrors = [];
  let requests = 0;
  let aborted = 0;
  let failMountedPicker;
  const mountedPicker = new Promise((resolve) => { failMountedPicker = resolve; });
  page.on("pageerror", (error) => isolatedErrors.push({ text: String(error), url: "" }));
  page.on("console", (message) => {
    if (message.type() === "error") isolatedErrors.push({ text: message.text(), url: message.location().url });
  });
  await page.route(/\/src\/components\/game\/TradeResource\.tsx(?:\?|$)/, async (route) => {
    requests++;
    if (aborted === 0) {
      aborted++;
      await mountedPicker;
      return route.abort("failed");
    }
    return route.continue();
  });
  try {
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);
    await load(page);
    const before = await snapshot(page);
    await open(page);
    // Prefetch may start before opening; fail only once the real panel renders its waiting picker.
    failMountedPicker();
    await panelFor(page).getByRole("alert").filter({ hasText: "Trade choices could not load" }).waitFor();
    assert.equal(aborted, 1, "lazy picker: exactly one request was deliberately refused");
    assert.equal(await snapshot(page), before, "lazy picker: a failed load preserves the real game");
    assert.equal(await panelFor(page).getByRole("button", { name: "Close", exact: true }).isVisible(), true, "lazy picker: failed choices leave the modal's exit usable");
    await page.screenshot({ path: "test-results/trade-tabs-lazy-failed.png" });
    await panelFor(page).getByRole("button", { name: "Close", exact: true }).click();
    await panelFor(page).waitFor({ state: "detached" });
    await open(page);
    await more(page, "timber", "give").waitFor();
    await more(page, "timber", "give").click();
    await more(page, "ore", "want").click();
    await preview(page, ["You give: 1 wood", "You get: 1 stone"]);
    assert.equal(await askFor(page).isEnabled(), true, "lazy picker: reopened Table controls produce a real valid draft");
    await bankSelect(page);
    await hint(page, "You give 4 wood. You get 1 stone.");
    assert.ok(requests >= 2, "lazy picker: reopen makes a fresh network request after the cached failure");
    assert.equal(await panelFor(page).getByRole("alert").count(), 0, "lazy picker: recovered choices replace the error boundary");
    await page.screenshot({ path: "test-results/trade-tabs-lazy-recovered.png" });
    await bankFor(page).click();
    await panelFor(page).waitFor({ state: "detached" });
    const hand = await page.evaluate(() => window.__emberisle.getState().state.players.find((player) => player.id === "p0").resources);
    assert.equal(hand.timber, 2, "lazy picker: recovered Bank controls debit the actual rate");
    assert.equal(hand.ore, 7, "lazy picker: recovered Bank controls receive one actual good");
    assert.deepEqual(await sent(page), [{ kind: "dispatch", action: { type: "bankTrade", give: "timber", want: "ore" } }], "lazy picker: recovery sends exactly one genuine bank action");
    const unexpected = isolatedErrors.filter((error) => !/TradeResource\.tsx/.test(`${error.text} ${error.url}`)
      && !/The above error occurred in the <Lazy> component|An error occurred in the <Lazy> component/.test(error.text));
    assert.deepEqual(unexpected, [], "lazy picker: only the isolated deliberately refused module and its React boundary may report errors");
    console.log(`lazy picker: one failed request, usable exit, fresh reopen, recovered Table and Bank controls; ${isolatedErrors.length} expected isolated error reports`);
  } finally {
    await context.close();
  }
}

try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  for (const view of VIEWS) {
    for (const motion of ["no-preference", "reduce"]) {
      const tag = `${view.tag}-${motion}`;
      const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, hasTouch: view.touch, isMobile: view.touch, reducedMotion: motion });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      page.on("pageerror", (error) => errors.push(`${tag}: ${error}`));
      page.on("console", (message) => message.type() === "error" && errors.push(`${tag}: ${message.text()}`));
      await page.addInitScript(() => {
        localStorage.setItem("emberisle-name", "Trade tabs proof");
        localStorage.setItem("emberisle-water", "simple");
      });
      try {
        await page.goto(`http://127.0.0.1:${PORT}/`);
        await page.waitForFunction(() => window.__emberisle);
        await tableAndRoutes(page, tag, motion);
        await liveDrafts(page, tag);
        await accessibility(page, tag);
        await ratesAndRejections(page, tag);
        await modes(page, tag);
      } finally {
        await context.close();
      }
    }
  }
  await lazyRecovery();
  assert.deepEqual(errors, [], "zero browser errors");
  console.log("trade tabs proof ok: three viewports, both motion settings, real rules settlement, zero browser errors");
} finally {
  await browser?.close();
  await vite.close();
}
