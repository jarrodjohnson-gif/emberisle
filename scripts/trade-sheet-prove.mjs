// #1537 (one tray, slice A): the trade sheet. Give and Get tokens, the offer in one sentence, need dots, Ask the table and
// one Bank button, in a real practice game at 390x844, 375x812 and 844x390 (touch) and 1280x720.
// Each view: the sheet rises from the bottom inside the viewport, the page never scrolls, 44 px targets and 12 px text;
// add by tap, Enter, Space and "+", take away by the minus button, long press, right click and "-"; the three limits;
// the sentence and its colours; need dots from other seats' needs; every Bank button state and a real bank trade;
// Ask the table opens the same offer as before and sets your needs; hotseat has no Ask button. Zero page errors.
// SHOTS=1 also writes real-game PNGs at device scale 2 (430x932, 390x844, 844x390, 1280x720) to docs/proofs/1537/.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { createGame } from "../src/lib/game/board.ts";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { RESOURCES, RESOURCE_LABEL } from "../src/lib/game/types.ts";

const SHOTS = process.env.SHOTS === "1";
const SHOT_DIR = "docs/proofs/1537";
const VIEWS = [
  ...(SHOTS ? [{ tag: "430x932", width: 430, height: 932, touch: true }] : []),
  { tag: "390x844", width: 390, height: 844, touch: true },
  // The narrowest phone the button system checks: the 7:5 footer must hold here with every bank label.
  ...(SHOTS ? [] : [{ tag: "375x812", width: 375, height: 812, touch: true }]),
  { tag: "844x390", width: 844, height: 390, touch: true },
  { tag: "1280x720", width: 1280, height: 720, touch: false },
];
const RED = "rgb(179, 38, 30)", RED_BG = "rgb(253, 236, 234)", GREEN = "rgb(30, 122, 70)", GREEN_BG = "rgb(228, 244, 234)";
const SOFT = "rgb(233, 240, 238)", TEXT = "rgb(31, 51, 49)";
const QUIET = "rgb(82, 98, 95)", INK = "rgb(31, 61, 59)", SHEET = "rgb(251, 253, 252)", WHITE = "rgb(255, 255, 255)";

// A real game past setup, with the mock's hand: 2 wood, 1 brick, 2 sheep, 3 wheat, 1 stone. Every seat is human so no bot moves.
let base = createGame({ humans: [{ name: "Ember" }], bots: 3, seed: 11 });
for (let guard = 0; base.phase !== "roll"; guard++) {
  assert.ok(guard < 300, "real setup must reach the first roll");
  const result = applyAction(base, base.current, chooseBotAction(base, base.current));
  assert.equal(result.error, undefined, "setup bot action must be legal");
  base = result.state;
}
base.players.sort((a, b) => a.id.localeCompare(b.id));
base.phase = "main";
base.current = "p0";
base.dice = [3, 4];
for (const vertex of base.vertices) vertex.harbor = null;
for (const player of base.players) {
  player.kind = "human";
  player.resources = Object.fromEntries(RESOURCES.map((resource) => [resource, 0]));
}
Object.assign(base.players[0].resources, { timber: 2, clay: 1, wool: 2, grain: 3, ore: 1 });
for (const resource of RESOURCES) base.bank[resource] = 19 - base.players.reduce((count, player) => count + player.resources[resource], 0);
const NAMES = Object.fromEntries(base.players.map((p) => [p.id, p.name]));
const COLORS = Object.fromEntries(base.players.map((p) => [p.id, p.color]));

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const URL_ROOT = `http://127.0.0.1:${vite.httpServer.address().port}/`;
let browser;
const errors = [];
if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
const shots = [];

const panelFor = (page) => page.getByTestId("trade-panel");
const token = (page, side, r) => panelFor(page).getByTestId(`trade-${side}-${r}`);
const more = (page, side, r) => panelFor(page).getByRole("button", { name: `More ${RESOURCE_LABEL[r]} to ${side}`, exact: true });
const minus = (page, side, r) => panelFor(page).getByTestId(`trade-minus-${side}-${r}`);
const askFor = (page) => panelFor(page).getByRole("button", { name: "Ask the table", exact: true });
const bankFor = (page) => panelFor(page).locator(".trade-bank");
const count = (page, side, r) => token(page, side, r).locator("output").textContent().then(Number);

async function load(page, mode = "ai", game = base) {
  await page.evaluate(() => window.__emberisle.getState().goTitle());
  await page.getByRole("button", { name: "Play with bots", exact: true }).waitFor();
  await page.evaluate(async ([game, mode]) => {
    const api = window.__emberisle;
    api.getState().startAi();
    api.setState({ state: game, localId: "p0", mode, tradeOpen: false, buildMode: "none", pendingPlace: null,
      peeking: true, spectator: false, offer: null, declined: [], tradeOutcome: null, tradeTaker: null,
      error: null, announcement: null, toast: null, net: null });
    const { useLocalNeeds } = await import("/src/components/game/need-state.ts");
    useLocalNeeds.setState({}, true);
    window.__sheetOriginal ??= { dispatch: api.getState().dispatch, askTable: api.getState().askTable };
    window.__sheetSent = [];
    api.setState({
      dispatch: (...args) => { window.__sheetSent.push({ kind: "dispatch", action: args[0] }); return window.__sheetOriginal.dispatch(...args); },
      askTable: (...args) => { window.__sheetSent.push({ kind: "askTable", bags: structuredClone(args) }); return window.__sheetOriginal.askTable(...args); },
    });
  }, [game, mode]);
  await page.getByRole("button", { name: "Trade", exact: true }).waitFor();
}

async function open(page) {
  await page.getByRole("button", { name: "Trade", exact: true }).click();
  await panelFor(page).waitFor();
  await more(page, "give", "timber").waitFor();
}

async function change(page, patch) {
  await page.evaluate((patch) => {
    const api = window.__emberisle;
    const game = structuredClone(api.getState().state);
    if (patch.hand) Object.assign(game.players.find((player) => player.id === "p0").resources, patch.hand);
    if (patch.bank) Object.assign(game.bank, patch.bank);
    if (patch.rate) {
      for (const vertex of game.vertices) vertex.harbor = null;
      const owned = game.vertices.filter((vertex) => vertex.building?.playerId === "p0");
      if (patch.rate <= 3) owned[0].harbor = "any";
      if (patch.rate === 2) owned[1].harbor = patch.dock;
    }
    api.setState({ state: game });
  }, patch);
}

async function needs(page, map) {
  await page.evaluate(async (map) => {
    const { useLocalNeeds } = await import("/src/components/game/need-state.ts");
    useLocalNeeds.setState(Object.fromEntries(Object.entries(map).map(([id, kinds]) => [id, { kinds, turnsLeft: 2 }])), true);
  }, map);
}


async function bankIs(page, label, enabled, hint, tag) {
  await page.waitForFunction(([label]) => document.querySelector(".trade-bank")?.textContent.trim() === label, [label]);
  assert.equal(await bankFor(page).isEnabled(), enabled, `${tag}: "${label}" is ${enabled ? "enabled" : "disabled"}`);
  const described = await bankFor(page).evaluate((b) => b.getAttribute("aria-describedby").split(" ").map((id) => document.getElementById(id)?.textContent).join(" "));
  assert.equal(described, hint, `${tag}: "${label}" keeps its fuller accessible reason`);
  if (enabled && !page.__touch) await bankFor(page).hover();
  const look = await panelFor(page).evaluate((panel) => {
    const b = panel.querySelector(".trade-bank"), s = getComputedStyle(b), ask = panel.querySelector(".trade-ask"), r = document.createRange();
    r.selectNodeContents(b);
    return { bg: s.backgroundColor, color: s.color, filter: s.filter, lines: r.getClientRects().length, overflow: b.scrollWidth > b.clientWidth + 1,
      ratio: ask ? ask.getBoundingClientRect().width / b.getBoundingClientRect().width : null };
  });
  assert.deepEqual([look.bg, look.color, look.filter], [SOFT, enabled ? TEXT : QUIET, "none"], `${tag}: "${label}" is a soft-fill button with ${enabled ? "text" : "quiet"} colour, hovered or not`);
  assert.ok(look.lines === 1 && !look.overflow, `${tag}: "${label}" fits on one line ${JSON.stringify(look)}`);
  if (look.ratio !== null) assert.ok(Math.abs(look.ratio - 7 / 5) <= 0.02, `${tag}: with "${label}" the footer stays 7:5 ${JSON.stringify(look)}`);
}

async function shot(page, tag, state) {
  if (!SHOTS) return;
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(400);
  const path = `${SHOT_DIR}/trade-${tag}-${state}.png`;
  await page.screenshot({ path });
  shots.push(path);
}

// Geometry, type and boxes for the sheet as it stands.
async function sheetChecks(page, tag, state) {
  const m = await panelFor(page).evaluate((panel) => {
    const rect = (n) => { const b = n.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
    const shown = (n) => n.getClientRects().length > 0 && !n.closest(".sr-only");
    const css = getComputedStyle(panel);
    const text = [...panel.querySelectorAll("*")].filter((n) => shown(n) && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
      .map((n) => ({ text: n.textContent.trim().slice(0, 40), size: Number.parseFloat(getComputedStyle(n).fontSize) }));
    const buttons = [...panel.querySelectorAll("button")].filter(shown).map((b) => ({ label: b.getAttribute("aria-label") || b.textContent.trim(), ...rect(b) }));
    const boxed = [...panel.querySelectorAll("*"), panel].filter((n) => shown(n) || n === panel).filter((n) => {
      const s = getComputedStyle(n);
      return ["Top", "Right", "Bottom", "Left"].some((side) => Number.parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none");
    }).filter((n) => !n.closest("button") && !n.closest(".trade-resource")).map((n) => n.className || n.tagName);
    const footer = panel.querySelector("footer");
    return { panel: rect(panel), footer: rect(footer), radius: [css.borderTopLeftRadius, css.borderTopRightRadius, css.borderBottomLeftRadius, css.borderBottomRightRadius],
      desktop: matchMedia("(min-width: 768px) and (pointer: fine)").matches,
      background: css.backgroundColor, text, buttons, boxed,
      grids: [...panel.querySelectorAll(".trade-resource-grid")].map(rect), tokens: [...panel.querySelectorAll(".trade-resource")].map(rect),
      pageScroll: { h: document.documentElement.scrollHeight - innerHeight, w: document.documentElement.scrollWidth - innerWidth, y: scrollY } };
  });
  const { width, height } = page.viewportSize();
  const at = `${tag} ${state}`;
  assert.ok(m.panel.left >= -0.5 && m.panel.right <= width + 0.5 && m.panel.top >= -0.5 && m.panel.bottom <= height + 0.5, `${at}: sheet inside the viewport ${JSON.stringify(m.panel)}`);
  assert.equal(m.desktop, !page.__touch && width >= 768, `${at}: desktop layout only with a fine pointer at 768 px and up`);
  assert.ok(Math.abs(m.panel.bottom - (m.desktop ? height - 16 : height)) <= 0.5, `${at}: ${m.desktop ? "the sheet floats 16 px above the bottom edge" : "the sheet sits on the bottom edge"} ${JSON.stringify(m.panel)}`);
  assert.ok(Math.abs((m.panel.left + m.panel.right) / 2 - width / 2) <= 0.5, `${at}: sheet is centred`);
  assert.ok(width <= 520 ? Math.abs(m.panel.width - width) <= 0.5 : m.panel.width <= 520.5, `${at}: sheet spans a phone, at most 520 px wide elsewhere ${m.panel.width}`);
  assert.deepEqual(m.radius, m.desktop ? ["22px", "22px", "22px", "22px"] : ["22px", "22px", "0px", "0px"], `${at}: 22 px radius, ${m.desktop ? "all four corners" : "top only"}`);
  assert.equal(m.background, SHEET, `${at}: sheet background #fbfdfc`);
  assert.ok(m.pageScroll.h <= 0 && m.pageScroll.w <= 0 && m.pageScroll.y === 0, `${at}: the page does not scroll ${JSON.stringify(m.pageScroll)}`);
  assert.ok(m.footer.top >= 0 && m.footer.bottom <= height + 0.5, `${at}: both buttons stay on screen ${JSON.stringify(m.footer)}`);
  for (const b of m.buttons) assert.ok(b.width >= 43.9 && b.height >= 43.9, `${at}: 44 px target ${JSON.stringify(b)}`);
  for (const t of m.text) assert.ok(t.size >= 12, `${at}: text at least 12 px ${JSON.stringify(t)}`);
  assert.deepEqual(m.boxed, [], `${at}: only tokens and buttons are boxes`);
  for (const t of m.tokens) assert.ok(Math.abs(t.height - 64) <= 0.5, `${at}: tokens are 64 px high ${JSON.stringify(t)}`);
  for (const g of m.grids) assert.ok(g.height <= 64.5, `${at}: a row stays 64 px high with minus buttons showing ${JSON.stringify(g)}`);
  return m;
}

async function layoutAndAdd(page, tag) {
  await load(page);
  await open(page);
  const empty = await sheetChecks(page, tag, "empty");
  const labels = await panelFor(page).evaluate((panel) => [...panel.querySelectorAll(".trade-label")].map((l) => ({
    h: l.querySelector("h3").textContent, color: getComputedStyle(l.querySelector("h3")).color,
    hint: l.querySelector("p")?.getClientRects().length ? l.querySelector("p").textContent : null })));
  assert.deepEqual(labels.map((l) => l.h), ["Give", "Get"], `${tag}: labels are exactly Give and Get`);
  assert.deepEqual(labels.map((l) => l.color), [RED, GREEN], `${tag}: Give is red, Get is green`);
  assert.deepEqual(labels.map((l) => l.hint), [null, null], `${tag}: no Give hint, and no Get hint while no need dot shows`);
  assert.equal(await panelFor(page).getByText(/You give|You get/).count(), 0, `${tag}: never "You give" or "You get"`);
  assert.equal(await panelFor(page).getByRole("heading", { name: /need/i }).count(), 0, `${tag}: no Need row and no Others need list`);
  assert.equal(await panelFor(page).getByRole("button", { name: /^Need / }).count(), 0, `${tag}: no Need buttons`);
  const faces = await panelFor(page).evaluate((panel) => [...panel.querySelectorAll(".trade-add")].map((b) => {
    const face = b.cloneNode(true);
    for (const hidden of face.querySelectorAll(".sr-only")) hidden.remove();
    return face.textContent.replace(/\s+/g, " ").trim();
  }));
  assert.deepEqual(faces, ["2", "1", "2", "3", "1", "Wood", "Brick", "Sheep", "Wheat", "Stone"], `${tag}: Give shows how many you hold, Get shows the name`);
  assert.ok(empty.grids[0].bottom < empty.grids[1].top && empty.grids[1].bottom < empty.footer.top, `${tag}: Give row, then Get row, then the buttons`);

  const sentence = panelFor(page).getByTestId("trade-player-preview");
  assert.equal((await sentence.textContent()).trim(), "Pick what to give and what to get.", `${tag}: empty sentence`);
  assert.equal(await sentence.locator("span").evaluate((s) => getComputedStyle(s).color), QUIET, `${tag}: empty sentence is quiet text`);
  assert.equal(await askFor(page).isDisabled(), true, `${tag}: Ask the table is off with nothing chosen`);
  await bankIs(page, "One kind each", false, "Pick one kind to give and one to get.", `${tag} empty`);
  await shot(page, tag, "empty");

  // Add: tap, Enter, "+", Space. Take away: "-". Wheat is held 3 times, so the fourth add is refused.
  await more(page, "give", "grain").click();
  assert.equal(await count(page, "give", "grain"), 1, `${tag}: a tap adds one`);
  await more(page, "give", "grain").focus();
  await page.keyboard.press("Enter");
  assert.equal(await count(page, "give", "grain"), 2, `${tag}: Enter adds one`);
  await page.keyboard.press("-");
  assert.equal(await count(page, "give", "grain"), 1, `${tag}: "-" takes one away`);
  await page.keyboard.press("+");
  assert.equal(await count(page, "give", "grain"), 2, `${tag}: "+" adds one`);
  await page.keyboard.press(" ");
  assert.equal(await count(page, "give", "grain"), 3, `${tag}: Space adds one`);
  await page.keyboard.press(" ");
  await page.keyboard.press("+");
  await more(page, "give", "grain").click({ force: true });
  assert.equal(await count(page, "give", "grain"), 3, `${tag}: Give stops at what you hold`);
  assert.equal(await more(page, "give", "grain").getAttribute("aria-disabled"), "true", `${tag}: a full Give token says it cannot take more`);

  const chosen = await token(page, "give", "grain").evaluate((t) => {
    const s = getComputedStyle(t), badge = t.querySelector('[data-testid="trade-badge"]'), b = getComputedStyle(badge);
    const tr = t.getBoundingClientRect(), br = badge.getBoundingClientRect();
    return { bg: s.backgroundColor, shadow: s.boxShadow, badge: badge.textContent, badgeBg: b.backgroundColor, badgeColor: b.color,
      radius: b.borderRadius, hidden: badge.getAttribute("aria-hidden"), topRight: br.right >= tr.right - 4 && br.top <= tr.top + 4 && br.left > tr.left + tr.width / 2 };
  });
  assert.equal(chosen.bg, RED_BG, `${tag}: a chosen Give token is tinted #fdecea`);
  assert.equal(chosen.shadow, `${RED} 0px 0px 0px 2px inset`, `${tag}: a chosen Give token has a 2 px inset red edge`);
  assert.equal(chosen.badge, "−3", `${tag}: the Give badge reads −3 with a true minus sign`);
  assert.equal(chosen.badgeBg, RED, `${tag}: the Give badge is red`);
  assert.equal(chosen.badgeColor, WHITE, `${tag}: the Give badge text is white`);
  assert.equal(chosen.topRight, true, `${tag}: the badge sits at the top right`);
  assert.equal(chosen.hidden, "true", `${tag}: the badge is decoration; the count is read from the token`);

  // Take away with the visible minus, a long press and a right click.
  const minusBox = await minus(page, "give", "grain").boundingBox();
  assert.ok(minusBox.width >= 44 && minusBox.height >= 44, `${tag}: the minus button has a 44 px hit area ${JSON.stringify(minusBox)}`);
  assert.equal(await minus(page, "give", "grain").getAttribute("aria-label"), "Fewer Wheat to give", `${tag}: the minus button is named`);
  await sheetChecks(page, tag, "chosen");
  await minus(page, "give", "grain").click();
  assert.equal(await count(page, "give", "grain"), 2, `${tag}: the minus button takes one away`);
  await more(page, "give", "grain").dispatchEvent("pointerdown");
  await page.waitForTimeout(700);
  await more(page, "give", "grain").dispatchEvent("pointerup");
  await more(page, "give", "grain").dispatchEvent("click");
  assert.equal(await count(page, "give", "grain"), 1, `${tag}: a long press takes one away, and its release does not add one back`);
  await more(page, "give", "grain").dispatchEvent("pointerdown");
  await page.waitForTimeout(150);
  await more(page, "give", "grain").dispatchEvent("pointerup");
  await more(page, "give", "grain").dispatchEvent("click");
  assert.equal(await count(page, "give", "grain"), 2, `${tag}: a short press still adds one`);
  await more(page, "give", "grain").click({ button: "right" });
  assert.equal(await count(page, "give", "grain"), 1, `${tag}: a right click takes one away`);
  await more(page, "give", "grain").click({ button: "right" });
  assert.equal(await count(page, "give", "grain"), 0, `${tag}: the last one goes`);
  assert.equal(await minus(page, "give", "grain").count(), 0, `${tag}: an unchosen token has no minus`);
  assert.equal(await token(page, "give", "grain").getByTestId("trade-badge").count(), 0, `${tag}: an unchosen token has no badge`);
  assert.equal(await token(page, "give", "grain").evaluate((t) => getComputedStyle(t).boxShadow), "none", `${tag}: an unchosen token has no edge`);
  console.log(`${tag}: layout, labels, hint rule, add by tap/Enter/Space/+, take away by minus/long press/right click/-, Give limit, badge`);
}

async function limitsAndSentence(page, tag) {
  await load(page);
  await change(page, { hand: { ore: 0 } });
  await open(page);
  // A good you hold none of is greyed and cannot be added.
  const none = await more(page, "give", "ore").evaluate((b) => ({ disabled: b.disabled, opacity: getComputedStyle(b).opacity }));
  assert.deepEqual(none, { disabled: true, opacity: "0.5" }, `${tag}: a good you hold none of is greyed and off`);
  await more(page, "give", "ore").click({ force: true });
  assert.equal(await count(page, "give", "ore"), 0, `${tag}: it cannot be added`);
  // Get stops at 19.
  await more(page, "want", "ore").focus();
  for (let i = 0; i < 21; i++) await page.keyboard.press("+");
  assert.equal(await count(page, "want", "ore"), 19, `${tag}: Get stops at 19`);
  assert.equal(await token(page, "want", "ore").getByTestId("trade-badge").textContent(), "+19", `${tag}: the Get badge reads +19`);
  for (let i = 0; i < 18; i++) await page.keyboard.press("-");
  assert.equal(await count(page, "want", "ore"), 1, `${tag}: "-" on a Get token takes one away`);
  // A good cannot be on both sides.
  await more(page, "give", "timber").click();
  assert.equal(await more(page, "want", "timber").isDisabled(), true, `${tag}: a good on the Give side cannot be added to Get`);
  await more(page, "want", "timber").click({ force: true });
  assert.equal(await count(page, "want", "timber"), 0, `${tag}: pressing it does nothing`);
  assert.equal(await more(page, "give", "ore").isDisabled(), true, `${tag}: a good on the Get side cannot be added to Give`);

  const got = await token(page, "want", "ore").evaluate((t) => {
    const s = getComputedStyle(t), b = getComputedStyle(t.querySelector('[data-testid="trade-badge"]'));
    return { bg: s.backgroundColor, shadow: s.boxShadow, badgeBg: b.backgroundColor, badgeColor: b.color, badge: t.querySelector('[data-testid="trade-badge"]').textContent };
  });
  assert.deepEqual(got, { bg: GREEN_BG, shadow: `${GREEN} 0px 0px 0px 2px inset`, badgeBg: GREEN, badgeColor: WHITE, badge: "+1" }, `${tag}: a chosen Get token is green with a +1 badge`);

  // The sentence: Give part red, Get part green, 16 px semibold, centred; several goods join with commas.
  await more(page, "give", "grain").click();
  await more(page, "give", "grain").click();
  const sentence = panelFor(page).getByTestId("trade-player-preview");
  const read = () => sentence.evaluate((p) => ({ text: p.textContent, align: getComputedStyle(p).textAlign, size: getComputedStyle(p).fontSize, weight: getComputedStyle(p).fontWeight,
    parts: [...p.querySelectorAll("span")].map((s) => ({ text: s.textContent, color: getComputedStyle(s).color })) }));
  let s = await read();
  assert.equal(s.text, "Give 1 wood, 2 wheat · Get 1 stone", `${tag}: the offer in one sentence`);
  assert.deepEqual(s.parts, [{ text: "Give 1 wood, 2 wheat", color: RED }, { text: "Get 1 stone", color: GREEN }], `${tag}: Give in red, Get in green`);
  assert.deepEqual([s.align, s.size, s.weight], ["center", "16px", "600"], `${tag}: the sentence is 16 px semibold and centred`);
  assert.equal(await askFor(page).isEnabled(), true, `${tag}: Ask the table is on with both sides chosen`);
  await minus(page, "want", "ore").click();
  s = await read();
  assert.equal(s.text, "Give 1 wood, 2 wheat", `${tag}: one side alone reads as that side`);
  assert.equal(await askFor(page).isDisabled(), true, `${tag}: Ask the table is off with one side empty`);
  console.log(`${tag}: three limits, Get colours, sentence text and colours`);
}

async function needDots(page, tag) {
  await load(page);
  await open(page);
  await needs(page, { p0: ["ore"], p1: ["timber"], p2: ["wool", "ore"], p3: ["wool"] });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="trade-need-dot"]').length === 4);
  const dots = await panelFor(page).evaluate((panel) => [...panel.querySelectorAll('[data-testid="trade-need-dot"]')].map((d) => {
    const t = d.closest(".trade-resource"), tr = t.getBoundingClientRect(), dr = d.getBoundingClientRect();
    return { token: t.dataset.testid, label: d.textContent, color: getComputedStyle(d).backgroundColor, w: dr.width, h: dr.height,
      bottomRight: dr.right <= tr.right && dr.bottom <= tr.bottom && dr.left > tr.left + tr.width / 2 && dr.top > tr.top + tr.height / 2,
      srOnly: d.querySelector(".sr-only")?.textContent ?? null, focusable: d.matches("[tabindex],button") || Boolean(d.querySelector("[tabindex],button")) };
  }));
  const colour = await page.evaluate((list) => list.map((c) => { const p = document.createElement("span"); p.style.color = c; document.body.append(p); const v = getComputedStyle(p).color; p.remove(); return v; }), [COLORS.p1, COLORS.p2, COLORS.p3]);
  assert.deepEqual(dots.map((d) => [d.token, d.label]), [
    ["trade-want-timber", `${NAMES.p1} needs wood`],
    ["trade-want-wool", `${NAMES.p2} needs sheep`],
    ["trade-want-wool", `${NAMES.p3} needs sheep`],
    ["trade-want-ore", `${NAMES.p2} needs stone`],
  ], `${tag}: one dot per other seat that needs the good, on Get tokens only, never your own`);
  assert.deepEqual(dots.map((d) => d.color), [colour[0], colour[1], colour[2], colour[1]], `${tag}: each dot is its seat's colour`);
  const getHint = () => panelFor(page).locator('[data-testid="trade-want-row"] .trade-label p').evaluate((p) => p.getClientRects().length ? { text: p.textContent, size: Number.parseFloat(getComputedStyle(p).fontSize) } : null);
  assert.deepEqual(await getHint(), { text: "dots show who is asking for it", size: 13 }, `${tag}: the Get hint shows while a need dot does, at least 12 px`);
  for (const d of dots) {
    assert.equal(d.srOnly, d.label, `${tag}: each dot has a visually hidden text label`);
    assert.ok(d.bottomRight, `${tag}: dots sit at the bottom right of the token ${JSON.stringify(d)}`);
    assert.equal(d.focusable, false, `${tag}: dots are not pressable`);
  }
  // The mock's offer: Give 2 wheat, Get 1 stone, with dots.
  await more(page, "give", "grain").click();
  await more(page, "give", "grain").click();
  await more(page, "want", "ore").click();
  assert.equal((await panelFor(page).getByTestId("trade-player-preview").textContent()), "Give 2 wheat · Get 1 stone", `${tag}: the mock's sentence`);
  const chosen = await token(page, "want", "ore").evaluate((t) => {
    const tr = t.getBoundingClientRect(), dr = t.querySelector('[data-testid="trade-need-dot"]').getBoundingClientRect(), mr = t.querySelector(".trade-remove > span").getBoundingClientRect();
    const nr = t.querySelector(".trade-resource-name").getBoundingClientRect();
    return { topLeft: dr.left >= tr.left && dr.right < tr.left + tr.width / 2 && dr.top >= tr.top && dr.bottom < tr.top + tr.height / 2,
      offName: dr.right <= nr.left || dr.left >= nr.right || dr.bottom <= nr.top || dr.top >= nr.bottom,
      clear: dr.right <= mr.left || dr.left >= mr.right || dr.bottom <= mr.top || dr.top >= mr.bottom, dot: dr.toJSON(), minus: mr.toJSON() };
  });
  assert.ok(chosen.topLeft, `${tag}: on a chosen Get token the dots move to the top left ${JSON.stringify(chosen)}`);
  assert.ok(chosen.offName, `${tag}: no dot touches the good's name ${JSON.stringify(chosen)}`);
  assert.ok(chosen.clear, `${tag}: no dot sits under the minus button ${JSON.stringify(chosen)}`);
  await bankIs(page, "Bank needs 4", false, "Need 4 wheat for the bank.", `${tag} short`);
  await sheetChecks(page, tag, "offer");
  await shot(page, tag, "offer");
  await needs(page, {});
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="trade-need-dot"]').length === 0);
  assert.equal(await getHint(), null, `${tag}: the Get hint goes with the last dot`);
  console.log(`${tag}: need dots by seat colour with hidden labels; cleared needs clear the dots`);
}

async function bankStates(page, tag) {
  await load(page);
  await open(page);
  await more(page, "give", "timber").click();
  await more(page, "give", "grain").click();
  await more(page, "want", "ore").click();
  await bankIs(page, "One kind each", false, "Pick one kind to give and one to get.", `${tag} two kinds`);
  await minus(page, "give", "timber").click();
  await bankIs(page, "Bank needs 4", false, "Need 4 wheat for the bank.", `${tag} 4:1 short`);
  await change(page, { rate: 3, hand: { grain: 2 } });
  await bankIs(page, "Dock needs 3", false, "Need 3 wheat for the dock.", `${tag} 3:1 short`);
  await change(page, { hand: { grain: 1 }, rate: 2, dock: "grain" });
  await bankIs(page, "Dock needs 2", false, "Need 2 wheat for the dock.", `${tag} 2:1 short`);
  await change(page, { hand: { grain: 3 } });
  await bankIs(page, "Wheat dock 2:1", true, "Give 2 wheat, get 1 stone.", `${tag} 2:1`);
  await change(page, { rate: 3 });
  await bankIs(page, "Dock 3:1", true, "Give 3 wheat, get 1 stone.", `${tag} 3:1`);
  await change(page, { rate: 4, hand: { grain: 4 } });
  await bankIs(page, "Bank 4:1", true, "Give 4 wheat, get 1 stone.", `${tag} 4:1`);
  await change(page, { bank: { ore: 0 } });
  await bankIs(page, "No stone left", false, "The bank has no stone.", `${tag} empty bank`);
  const before = await page.evaluate(() => JSON.stringify(window.__emberisle.getState().state));
  await bankFor(page).click({ force: true });
  assert.equal(await page.evaluate(() => JSON.stringify(window.__emberisle.getState().state)), before, `${tag}: a refused Bank button changes nothing`);
  assert.deepEqual(await page.evaluate(() => window.__sheetSent), [], `${tag}: refusals send nothing`);
  await change(page, { bank: { ore: base.bank.ore } });
  await bankIs(page, "Bank 4:1", true, "Give 4 wheat, get 1 stone.", `${tag} 4:1 again`);
  await sheetChecks(page, tag, "bank");
  await shot(page, tag, "bank");
  const hand = await page.evaluate(() => ({ ...window.__emberisle.getState().state.players[0].resources }));
  const seq = await page.evaluate(() => window.__emberisle.getState().state.seq);
  await bankFor(page).click();
  await panelFor(page).waitFor({ state: "detached" });
  const after = await page.evaluate(() => ({ hand: { ...window.__emberisle.getState().state.players[0].resources }, seq: window.__emberisle.getState().state.seq, sent: window.__sheetSent }));
  assert.deepEqual(after.hand, { ...hand, grain: hand.grain - 4, ore: hand.ore + 1 }, `${tag}: a valid Bank 4:1 trade changes the hand`);
  assert.equal(after.seq, seq + 1, `${tag}: it settles once`);
  assert.deepEqual(after.sent, [{ kind: "dispatch", action: { type: "bankTrade", give: "grain", want: "ore" } }], `${tag}: one bankTrade action, as before`);
  console.log(`${tag}: every Bank button state with its fuller reason; a valid 4:1 trade changes the hand`);
}

async function askAndHotseat(page, tag) {
  await load(page);
  await open(page);
  await more(page, "give", "grain").click();
  await more(page, "give", "grain").click();
  for (const r of ["clay", "wool", "ore"]) await more(page, "want", r).click();
  await askFor(page).click();
  await panelFor(page).waitFor({ state: "detached" });
  const result = await page.evaluate(async () => {
    const { useLocalNeeds } = await import("/src/components/game/need-state.ts");
    const s = window.__emberisle.getState();
    return { sent: window.__sheetSent, offer: s.offer && { from: s.offer.from, give: s.offer.give, want: s.offer.want }, mine: useLocalNeeds.getState().p0?.kinds };
  });
  const give = { timber: 0, clay: 0, wool: 0, grain: 2, ore: 0 }, want = { timber: 0, clay: 1, wool: 1, grain: 0, ore: 1 };
  assert.deepEqual(result.sent, [{ kind: "askTable", bags: [give, want] }], `${tag}: Ask the table sends the offer, as before`);
  assert.equal(result.offer?.from, "p0", `${tag}: the offer is open at the table`);
  assert.deepEqual([result.offer.give, result.offer.want], [give, want], `${tag}: the open offer is the one chosen`);
  assert.deepEqual(result.mine, ["clay", "wool"], `${tag}: your needs become the offer's first two Get goods`);

  await load(page, "hotseat");
  await open(page);
  assert.equal(await askFor(page).count(), 0, `${tag}: hotseat has no Ask the table`);
  assert.equal(await panelFor(page).getByTestId("trade-player-preview").count(), 0, `${tag}: hotseat has no table offer sentence, as before`);
  const full = await panelFor(page).evaluate((panel) => {
    const f = panel.querySelector("footer"), s = getComputedStyle(f), b = panel.querySelector(".trade-bank").getBoundingClientRect(), r = f.getBoundingClientRect();
    return { bank: b.width, inner: r.width - Number.parseFloat(s.paddingLeft) - Number.parseFloat(s.paddingRight) };
  });
  assert.ok(Math.abs(full.bank - full.inner) <= 0.5, `${tag}: in hotseat the bank button takes the full width ${JSON.stringify(full)}`);
  await sheetChecks(page, tag, "hotseat");
  await more(page, "give", "grain").click();
  await more(page, "want", "ore").click();
  await bankIs(page, "Bank needs 4", false, "Need 4 wheat for the bank.", `${tag} hotseat`);
  await page.keyboard.press("Escape");
  await panelFor(page).waitFor({ state: "detached" });
  console.log(`${tag}: Ask the table opens the same offer and sets your needs; hotseat has the bank button alone, full width`);
}

async function primaryButton(page, tag) {
  await load(page);
  await open(page);
  await more(page, "give", "grain").click();
  await more(page, "want", "ore").click();
  const style = await askFor(page).evaluate((b) => { const s = getComputedStyle(b), r = b.getBoundingClientRect(); return { bg: s.backgroundColor, color: s.color, h: r.height, size: s.fontSize, line: s.lineHeight, weight: s.fontWeight }; });
  assert.deepEqual(style, { bg: INK, color: WHITE, h: 48, size: "15px", line: "22px", weight: "600" }, `${tag}: Ask the table is the 48 px ink button with white text in the button system's type`);
  const bank = await bankFor(page).evaluate((b) => b.getBoundingClientRect().height);
  assert.equal(bank, 48, `${tag}: the bank button is 48 px high`);
  const row = await panelFor(page).evaluate((panel) => [...panel.querySelectorAll("footer > button")].map((b) => { const r = b.getBoundingClientRect(); return { left: r.left, width: r.width }; }));
  assert.ok(row[0].left < row[1].left, `${tag}: Ask the table left, bank right`);
  assert.ok(Math.abs(row[0].width / row[1].width - 7 / 5) <= 0.02, `${tag}: with a short bank label the row splits 7:5 as in the mock ${JSON.stringify(row)}`);
  // The longest labels: each good's "No <good> left", and its 2:1 dock. bankIs checks one line and 7:5 for each.
  await more(page, "want", "wool").click();
  await bankIs(page, "One kind each", false, "Pick one kind to give and one to get.", `${tag} long label`);
  await minus(page, "want", "wool").click();
  await minus(page, "want", "ore").click();
  await minus(page, "give", "grain").click();
  for (const [g, w] of [["grain", "timber"], ["timber", "clay"], ["timber", "wool"], ["timber", "grain"], ["timber", "ore"]]) {
    await more(page, "give", g).click();
    await more(page, "want", w).click();
    await change(page, { hand: { [g]: 4 }, bank: { [w]: 0 } });
    await bankIs(page, `No ${RESOURCE_LABEL[w].toLowerCase()} left`, false, `The bank has no ${RESOURCE_LABEL[w].toLowerCase()}.`, `${tag} long label`);
    await change(page, { bank: { [w]: base.bank[w] }, rate: 2, dock: g });
    await bankIs(page, `${RESOURCE_LABEL[g]} dock 2:1`, true, `Give 2 ${RESOURCE_LABEL[g].toLowerCase()}, get 1 ${RESOURCE_LABEL[w].toLowerCase()}.`, `${tag} long label`);
    await change(page, { rate: 4 });
    await minus(page, "give", g).click();
    await minus(page, "want", w).click();
  }
  await page.keyboard.press("Escape");
  await panelFor(page).waitFor({ state: "detached" });
}

try {
  browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const view of VIEWS) {
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, hasTouch: view.touch, isMobile: view.touch,
      deviceScaleFactor: SHOTS ? 2 : 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.__touch = view.touch;
    page.setDefaultTimeout(20_000);
    page.on("pageerror", (error) => errors.push(`${view.tag}: ${error}`));
    page.on("console", (message) => message.type() === "error" && errors.push(`${view.tag}: ${message.text()}`));
    await page.addInitScript(() => {
      localStorage.setItem("emberisle-name", "Trade sheet proof");
      localStorage.setItem("emberisle-chat-open", "0");
    });
    try {
      await page.goto(URL_ROOT);
      await page.waitForFunction(() => window.__emberisle);
      await layoutAndAdd(page, view.tag);
      await limitsAndSentence(page, view.tag);
      await needDots(page, view.tag);
      await bankStates(page, view.tag);
      await primaryButton(page, view.tag);
      await askAndHotseat(page, view.tag);
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, [], "zero page errors");
  if (SHOTS) console.log(`wrote ${shots.length} PNGs:\n${shots.join("\n")}`);
  console.log(`trade sheet proof ok: ${VIEWS.map((v) => v.tag).join(", ")}; add/take away by every method, limits, sentence, need dots, bank states, Ask the table, hotseat, zero page errors`);
} finally {
  await browser?.close();
  await vite.close();
}
