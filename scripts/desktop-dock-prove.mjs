// #1429: the desktop dock as drawn (docs/design/desktop-dock-1274), in a real practice game against three bots. The setup and
// about 12 turns are played with the bots' own moves; then each drawn state is set on the store and measured.
// - 1280x720 and 1440x900 with a mouse: one 672x176 dock, centred, 24 px off the bottom edge; the hand, the turn line, the slot
//   under it, each of the seven controls and the meta line hold the same rectangle in every state (own turn, an incoming offer,
//   another seat's turn, a gain and a loss off turn, an empty hand, the roll); the seven controls read Path, Outpost,
//   Stronghold, Buy fortune, Trade, Fortunes (or Play fortune), End turn (Roll on the roll), are at least 44 x 44 and 8 px
//   apart; off this seat's main phase every build, Trade and End turn is greyed (aria-disabled, with the reason) and a click on
//   one does nothing; Fortunes is greyed only with none held; cost chips show the right count inside their tile; the turn
//   line reads "Your turn", "Roll the dice", "<name>'s turn" or "<name> offers" and is not cut; an incoming offer puts Yes and
//   No in the slot under the turn line, inside the dock, with the region still named by the whole offer; gain and loss tabs
//   are 28 px tall, rise 16 px above the dock and are not clipped; only the drawn text sizes appear; goods names are 12 px; the
//   island ends above the dock; End turn on this seat's main phase passes the turn.
// - No dock where the rule does not hold: phones (430x932, 390x844, 844x390, touch) and a short desktop window (1280x480)
//   keep today's bottom stack and no dock is drawn.
// Zero console errors. Run: npm run desktop-dock-prove (SHOTS=1 writes the pictures to docs/proofs/1429). Port from VITE_PORT,
// default 8531.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8531;
const SHOTS = !!process.env.SHOTS;
const SHOT_DIR = "docs/proofs/1429";
if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${PORT}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
let failures = 0;
function check(ok, label, data) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${data === undefined ? "" : " " + JSON.stringify(data)}`);
  if (!ok) failures++;
}

async function open(width, height, touch) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const tag = `${width}x${height}`;
  page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
  await page.addInitScript(() => {
    localStorage.setItem("emberisle-name", "Jarrod");
    localStorage.setItem("emberisle-jelly", "lite");
  });
  await page.goto(url);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle, null, { timeout: 90_000 });
  // The bots stop moving on their own; this loop moves every seat, the player's too, with the bots' own choices.
  await page.evaluate(async () => {
    const ai = await import("/src/lib/game/ai.ts");
    const g = window.__emberisle;
    g.setState({ runBots: () => {} });
    for (let i = 0; i < 600; i++) {
      const s = g.getState();
      const st = s.state;
      if (st.phase === "over" || (st.turn >= 12 && st.current === s.localId && st.phase === "roll")) break;
      const pid = st.phase === "discard" ? st.players.find((p) => (st.discardNeeded[p.id] ?? 0) > 0).id : st.current;
      const a = ai.chooseBotAction(st, pid);
      if (!(a && s.dispatch(a, pid, true).ok)) s.dispatch({ type: "endTurn" }, pid, true);
    }
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

// One state on the store: whose turn, the phase, the dice, the player's hand and fortunes, an incoming offer or none.
const set = (page, f) =>
  page.evaluate((f) => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const me = st.players.find((p) => p.id === g.getState().localId);
    const other = st.players.find((p) => p.id !== me.id);
    st.current = f.mine ? me.id : other.id;
    st.phase = f.phase ?? "main";
    if (f.dice) {
      st.dice = f.dice;
      st.rolls = (st.rolls ?? 0) + 1;
    }
    me.resources = { ...f.hand };
    me.hidden = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0, ...f.fortunes };
    me.boughtThisTurn = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
    st.playedCard = false;
    st.seq += 1;
    const offer = f.offer ? { tradeId: "t1429", from: other.id, fromName: other.name, give: f.offer.give, want: f.offer.want, until: Date.now() + 20_000 } : null;
    g.setState({ state: st, offer, declined: [], tradeOutcome: null, buildMode: "none", error: null });
    return { other: other.name };
  }, f);

function measure() {
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };
  const dock = document.querySelector('[data-testid="desktop-dock"]');
  if (!dock) return null;
  const slot = (s) => r(dock.querySelector(`[data-slot="${s}"]`));
  const slots = { hand: slot("hand"), side: slot("side"), aside: slot("aside"), controls: slot("controls"), meta: slot("meta") };
  const buttons = [...dock.querySelectorAll('[data-slot="controls"] > button')];
  const nameOf = (b) => (b.querySelector(".desk-name") ?? (b.classList.contains("build-tile") ? b.querySelector("span") : b)).textContent.trim();
  const controls = buttons.map((b) => ({ name: nameOf(b), ...r(b), disabled: b.getAttribute("aria-disabled") === "true", why: b.getAttribute("aria-description") }));
  const gaps = buttons.slice(1).map((b, i) => b.getBoundingClientRect().left - buttons[i].getBoundingClientRect().right);
  const costs = [...dock.querySelectorAll('[data-testid^="build-"]')].map((b) => {
    const t = b.getBoundingClientRect();
    const chips = [...b.querySelectorAll('[data-testid^="cost-"]')];
    const inside = chips.every((c) => {
      const q = c.getBoundingClientRect();
      return q.left >= t.left - 0.5 && q.right <= t.right + 0.5 && q.top >= t.top - 0.5 && q.bottom <= t.bottom + 0.5;
    });
    return { kind: b.dataset.testid.replace("build-", ""), chips: chips.length, inside, state: b.dataset.buildState };
  });
  // A tab is clipped if any box around it that hides overflow cuts it, or the window does.
  const tabs = [...dock.querySelectorAll(".goods-tab")].map((t) => {
    const q = t.getBoundingClientRect();
    let clipped = q.top < 0 || q.left < 0 || q.right > innerWidth || q.bottom > innerHeight;
    for (let a = t.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).overflow === "visible") continue;
      const c = a.getBoundingClientRect();
      if (q.top < c.top - 0.5 || q.left < c.left - 0.5 || q.right > c.right + 0.5 || q.bottom > c.bottom + 0.5) clipped = true;
    }
    return { text: t.textContent, ...r(t), clipped };
  });
  const toast = dock.querySelector('[data-testid="trade-toast"]');
  const answers = toast ? [...toast.querySelectorAll(".trade-answers > button")].map((b) => ({ name: b.textContent.trim(), ...r(b) })) : [];
  const small = [...dock.querySelectorAll("button")].filter((b) => {
    const q = b.getBoundingClientRect();
    return q.width > 0 && (q.width < 44 || q.height < 44);
  }).map((b) => b.getAttribute("aria-label") || b.textContent.trim());
  const visible = (el) => { const q = el.getBoundingClientRect(); return q.width > 1 && q.height > 1; };
  const fonts = [...new Set([...dock.querySelectorAll("*")].filter((el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((el) => parseFloat(getComputedStyle(el).fontSize)))].sort((a, b) => a - b);
  const turn = dock.querySelector('[data-testid="turn-banner"]');
  const short = toast?.querySelector(".trade-short");
  const line = short ? short.parentElement : turn;
  const lineText = short ? short.textContent : turn.textContent;
  const textBox = short ? short.lastElementChild : turn;
  const isle = window.__isle;
  const pts = window.__emberisle.getState().state.vertices.map((v) => isle.screenOf(v.id)).filter(Boolean);
  const islandBottom = Math.max(...pts.map((p) => p.y));
  return {
    dock: r(dock), slots, controls, gaps, costs, tabs, answers, under44: small, fonts,
    goodsNames: [...new Set([...dock.querySelectorAll(".goods-card > .goods-label")].map((el) => parseFloat(getComputedStyle(el).fontSize)))],
    turnLine: lineText, turnFits: textBox.scrollWidth <= textBox.clientWidth, lineBox: r(line),
    toast: toast ? { ...r(toast), region: toast.getAttribute("role"), named: document.getElementById(toast.getAttribute("aria-labelledby"))?.textContent ?? null } : null,
    headerTurnLine: !!document.querySelector('.hud-header [data-testid="turn-banner"]'),
    islandBottom,
  };
}

const NONE = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
const HAND = { timber: 2, clay: 1, wool: 1, grain: 2, ore: 3 };
const STATES = [
  ["own-turn", { mine: true, dice: [5, 3], hand: HAND, fortunes: { knight: 1 } }],
  ["offer", { mine: false, hand: HAND, fortunes: { knight: 1 }, offer: { give: { wool: 2 }, want: { ore: 1 } } }],
  ["other-turn", { mine: false, hand: HAND, fortunes: { knight: 1 } }],
  ["gain", { mine: false, dice: [4, 2], hand: { ...HAND, timber: 3, grain: 4 }, fortunes: { knight: 1 } }],
  ["loss", { mine: false, hand: { ...HAND, ore: 1 }, fortunes: { knight: 1 } }],
  ["empty", { mine: true, dice: [2, 1], hand: NONE }],
  ["roll", { mine: true, phase: "roll", hand: HAND, fortunes: { knight: 1 } }],
];
// Each state that shows a cue first sets the hand it starts from, so the change is what the cards show.
const BEFORE = { gain: HAND, loss: HAND };
const ALLOWED_SIZES = [9, 12, 14, 15, 16, 17.5, 30];
const CHIPS = { path: 2, outpost: 4, stronghold: 2, card: 3 };
const TABS = { gain: 2, loss: 1 };

try {
  for (const [width, height] of [[1280, 720], [1440, 900]]) {
    const tag = `${width}x${height}`;
    const page = await open(width, height, false);
    const seen = [];
    for (const [name, f] of STATES) {
      if (BEFORE[name]) {
        await set(page, { ...f, hand: BEFORE[name], dice: undefined });
        await page.waitForTimeout(3500);
      }
      const { other } = await set(page, f);
      await page.waitForTimeout(BEFORE[name] ? 600 : 3500);
      await page.mouse.move(0, 0);
      const m = await page.evaluate(measure);
      if (!m) {
        check(false, `${tag} ${name}: the dock is drawn`);
        continue;
      }
      seen.push([name, m]);
      const at = `${tag} ${name}`;
      const d = m.dock;
      check(d.w === 672 && d.h === 176 && Math.abs(d.x - (width - 672) / 2) < 0.5 && Math.abs(height - 24 - (d.y + d.h)) < 0.5, `${at}: dock 672x176, centred, 24 px off the bottom`, d);
      check(!m.headerTurnLine, `${at}: the turn line left the header`);
      const names = m.controls.map((c) => c.name);
      const fortunes = f.mine && f.fortunes ? "Play fortune" : "Fortunes";
      const want = ["Path", "Outpost", "Stronghold", "Buy fortune", "Trade", fortunes, f.phase === "roll" ? "Roll" : "End turn"];
      check(JSON.stringify(names) === JSON.stringify(want), `${at}: seven controls in order`, names);
      check(m.under44.length === 0, `${at}: no control under 44 x 44`, m.under44);
      check(m.gaps.every((g) => Math.abs(g - 8) < 0.02), `${at}: controls 8 px apart`, m.gaps.map((g) => +g.toFixed(3)));
      const live = f.mine && (f.phase ?? "main") === "main";
      const idle = m.controls.filter((c) => !["Fortunes", "Play fortune", "Roll"].includes(c.name));
      if (!live) check(idle.every((c) => c.disabled && c.why), `${at}: builds, Trade and End turn are greyed with a reason`, idle.map((c) => [c.name, c.disabled, c.why]));
      const fort = m.controls[5];
      check(fort.disabled === !f.fortunes, `${at}: Fortunes is greyed only with none held`, fort);
      check(m.costs.every((c) => c.inside && (c.state === "nospot" || c.chips === CHIPS[c.kind])), `${at}: cost chips count right and sit inside their tile`, m.costs);
      const line = f.offer ? `${other} offers` : f.phase === "roll" ? "Roll the dice" : f.mine ? "Your turn" : `${other}'s turn`;
      check(m.turnLine === line && m.turnFits, `${at}: the turn line reads "${line}" and is not cut`, [m.turnLine, m.turnFits]);
      check(m.lineBox.y === m.slots.side.y && m.lineBox.h === 32, `${at}: the turn line is the 32 px line at the top of its column`, m.lineBox);
      if (f.offer) {
        const a = m.slots.aside;
        check(JSON.stringify(m.answers.map((b) => b.name)) === '["Yes","No"]', `${at}: Yes and No answer the offer`, m.answers.map((b) => b.name));
        check(m.answers.every((b) => b.y >= a.y - 0.5 && b.y + b.h <= a.y + a.h + 0.5 && b.x >= a.x - 0.5 && b.x + b.w <= a.x + a.w + 0.5), `${at}: Yes and No sit in the slot under the turn line`, { aside: a, answers: m.answers });
        check(m.toast.region === "region" && /offers 2 sheep for 1 ore$/.test(m.toast.named ?? ""), `${at}: the offer region is still named by the whole offer`, m.toast.named);
      } else check(m.toast === null, `${at}: no offer card`);
      check(m.tabs.length === (TABS[name] ?? 0), `${at}: ${TABS[name] ?? 0} gain or loss tabs`, m.tabs.map((t) => t.text));
      check(m.tabs.every((t) => !t.clipped && Math.abs(t.h - 28) < 0.5 && Math.abs(t.y - (d.y - 16)) < 0.5), `${at}: tabs are 28 px, 16 px above the dock, not clipped`, m.tabs);
      check(m.fonts.every((s) => ALLOWED_SIZES.includes(s)), `${at}: only the drawn text sizes`, m.fonts);
      check(m.goodsNames.join() === "12", `${at}: goods names are 12 px`, m.goodsNames);
      check(m.islandBottom <= d.y, `${at}: the island ends above the dock`, { island: Math.round(m.islandBottom), dock: d.y });
      if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/${name}-${tag}.png` });
    }
    const key = ([, m]) => JSON.stringify({ dock: m.dock, slots: m.slots, controls: m.controls.map(({ x, y, w, h }) => [x, y, w, h]) });
    check(seen.length === STATES.length && seen.every((s) => key(s) === key(seen[0])), `${tag}: every slot holds the same rectangle in all ${STATES.length} states`);

    // Off turn a greyed control does nothing; on this seat's main phase End turn passes the turn.
    await set(page, STATES[2][1]);
    await page.waitForTimeout(300);
    const dock = page.getByTestId("desktop-dock");
    await dock.getByRole("button", { name: "Trade", exact: true }).click();
    await dock.getByRole("button", { name: "End turn", exact: true }).click();
    await dock.getByTestId("build-card").click();
    const still = await page.evaluate(() => ({ trade: window.__emberisle.getState().tradeOpen, deck: window.__emberisle.getState().state.deckLeft ?? window.__emberisle.getState().state.deck.length, current: window.__emberisle.getState().state.current }));
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ trade: window.__emberisle.getState().tradeOpen, deck: window.__emberisle.getState().state.deckLeft ?? window.__emberisle.getState().state.deck.length, current: window.__emberisle.getState().state.current }));
    check(!after.trade && after.deck === still.deck && after.current === still.current, `${tag}: greyed Trade, End turn and Buy fortune do nothing off turn`, after);
    await set(page, STATES[0][1]);
    await page.waitForTimeout(300);
    const me = await page.evaluate(() => window.__emberisle.getState().localId);
    await dock.getByRole("button", { name: "End turn", exact: true }).click();
    await page.waitForFunction((me) => window.__emberisle.getState().state.current !== me, me, { timeout: 5_000 }).then(() => true, () => false).then((ok) => check(ok, `${tag}: End turn on this seat's main phase passes the turn`));
    await page.context().close();
  }

  // No dock where the rule does not hold: phones and a short desktop window keep today's bottom stack.
  for (const [width, height, touch] of [[430, 932, true], [390, 844, true], [844, 390, true], [1280, 480, false]]) {
    const tag = `${width}x${height}`;
    const page = await open(width, height, touch);
    await set(page, STATES[0][1]);
    await page.waitForTimeout(1500);
    const v = await page.evaluate(() => ({ dock: document.querySelectorAll('[data-testid="desktop-dock"]').length, stack: document.querySelectorAll(".hud-stack[data-hud-stack]").length }));
    check(v.dock === 0 && v.stack === 1, `${tag}: no dock, today's bottom stack`, v);
    if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/own-turn-${tag}.png` });
    await page.context().close();
  }

  check(errors.length === 0, "no console errors", errors);
} finally {
  await browser.close();
  await vite.close();
}
if (failures) {
  console.error(`desktop-dock-prove: ${failures} check(s) failed`);
  process.exit(1);
}
console.log("desktop-dock-prove: all checks passed");
