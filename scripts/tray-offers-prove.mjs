// One tray, slice C (docs/design/one-tray): offers, discards and take-from live in the tray. In a practice game past setup,
// at 390x844 and 844x390 (touch) and 1280x720, and in a three-seat hotseat game at 390x844:
// - an offer I can answer: the top line is one sentence, "Tide (bot): give 1 wood, get 1 brick", give in red (#b3261e) and
//   get in green (#1e7a46); the action row is No and Yes, Yes primary (#1f3d3b). Yes moves the goods; No closes my offer;
// - an offer I cannot pay: "Tide (bot) is looking for 2 stone" and Dismiss alone, described by the hidden reason;
// - my own offer: "You offer 1 wood for 1 stone", who has said no, and Cancel alone; Cancel closes it. The outcome line
//   then sits where the newest event does, in the top line;
// - a discard: the top line says how many, the hand becomes five tokens, a tap adds one, the minus takes one back, the
//   count never passes what is owed, and "Discard N" is off until the count is right, then discards exactly those goods;
// - take-from: the top line asks "Take from whom?" and the action row is one button per seat with its colour dot; a
//   press moves the wayfarer and takes one good from that seat;
// - hotseat: a seat that owes a discard on another seat's turn is named in the top line and picks from its own goods;
//   take-from asks the seat on turn;
// - in every state: one tray surface (nothing in the stack but a button, a token, the dice or a mark has a fill, a box or a
//   shadow, and no offer or prompt floats outside the stack), every button and token at least 44 px in both directions, no
//   visible text under 12 px, the stack inside the viewport, and the measured bottom inset (`__isle.liveInsets()`) within
//   4 px of the declared one (`__isle.insets()`) at 390x844 and 1280x720;
// - zero page errors.
// Every failure is listed before the run fails. SHOTS=1 also writes real-game PNGs at device scale 2 into
// docs/proofs/1546/ for 430x932, 390x844, 844x390 and 1280x720. Run: npm run tray-offers-prove
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, stealTargets } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";

const STEP_MS = 30_000;
const SHOTS = process.env.SHOTS === "1";
const SHOT_DIR = "docs/proofs/1546";
const VIEWS = [
  { tag: "390x844", width: 390, height: 844, touch: true, full: true, inset: true },
  { tag: "844x390", width: 844, height: 390, touch: true, full: true },
  { tag: "1280x720", width: 1280, height: 720, full: true, inset: true },
  { tag: "430x932", width: 430, height: 932, touch: true, inset: true },
];
const INK = "rgb(31, 61, 59)";
const GIVE = "rgb(179, 38, 30)";
const GET = "rgb(30, 122, 70)";
const HAND = { timber: 2, clay: 1, wool: 0, grain: 2, ore: 0 };
const EIGHT = { timber: 3, clay: 2, wool: 0, grain: 2, ore: 1 };
const sum = (bag) => RESOURCES.reduce((n, r) => n + (bag[r] ?? 0), 0);

// A game past setup. Practice: Ember (p0) and three bots. Hotseat: three people. `patch` crafts the state under test.
function game({ hotseat = false, hand = HAND, phase = "main", current = "p0", patch } = {}) {
  let g = createGame(hotseat ? { humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 11 } : { humans: [{ name: "Ember" }], bots: 3, seed: 11 });
  while (g.phase !== "roll") g = applyAction(g, g.current, chooseBotAction(g, g.current)).state;
  g.phase = phase;
  g.current = current;
  g.dice = [3, 4];
  for (const p of g.players) p.resources = p.id === "p0" ? { ...hand } : { timber: 2, clay: 2, wool: 2, grain: 2, ore: 2 };
  patch?.(g);
  return g;
}

// The wayfarer's turn for p0, with a hex that two other seats sit on, so the pick asks "Take from whom?".
function robberGame(opts) {
  let hexId = null;
  const g = game({
    ...opts,
    phase: "robber",
    patch: (g) => {
      const others = g.players.filter((p) => p.id !== "p0").slice(0, 2);
      const hex = g.hexes.find((h) => h.id !== g.robberHex);
      const corners = g.vertices.filter((v) => v.hexes.includes(hex.id));
      for (const v of corners) v.building = undefined;
      corners[0].building = { playerId: others[0].id, kind: "outpost" };
      corners[3].building = { playerId: others[1].id, kind: "outpost" };
      hexId = hex.id;
    },
  });
  const targets = stealTargets(g, hexId, "p0");
  if (targets.length !== 2) throw new Error(`the crafted hex has ${targets.length} seats to take from, want 2`);
  return { g, hexId, targets };
}

if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const PORT = vite.httpServer.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const failures = [];
const check = (ok, msg) => {
  if (!ok) {
    failures.push(msg);
    console.log(`FAIL ${msg}`);
  }
  return ok;
};
let code = 0;

// Everything the rules read off the bottom stack.
// #1595: an offered hand column has no border (no inset ring), and its "−N" or "+N" tag sits above the column, clear of the
// column's symbol and number.
const handMarks = async (page) => {
  // Measured at rest: a hand column's gain or loss motion moves its symbol while it runs.
  await page.waitForFunction(() => (document.querySelector('[data-testid="hand-dock"]')?.getAnimations({ subtree: true }).length ?? 0) === 0, null, { timeout: 10_000 });
  return page.evaluate(() => [...document.querySelectorAll("[data-hud-stack] [data-offer]")].map((slot) => {
    const card = slot.querySelector(".goods-card");
    const tag = slot.querySelector('[data-testid="offer-delta"]').getBoundingClientRect();
    const parts = [...card.querySelectorAll(":scope > .goods-icon, :scope > .goods-count, :scope > .goods-label")].filter((el) => el.getBoundingClientRect().height > 1);
    const over = parts.filter((el) => { const r = el.getBoundingClientRect(); return r.left < tag.right && tag.left < r.right && r.top < tag.bottom && tag.top < r.bottom; });
    const top = (r) => Math.round(r.top), bot = (r) => Math.round(r.bottom);
    return { kind: slot.dataset.offer, ring: /inset/.test(getComputedStyle(card).boxShadow), above: tag.top < card.getBoundingClientRect().top, hit: over.length > 0, tag: [top(tag), bot(tag)], over: over.map((el) => `${el.getAttribute("class")} ${top(el.getBoundingClientRect())}-${bot(el.getBoundingClientRect())}`) };
  }));
};
// #1595: the top line's dot, if any, is a seat's colour: in a discard and in "take from whom" there is none, or the seat's own.
const lineDot = (page) =>
  page.evaluate(() => {
    const b = document.querySelector('[data-hud-stack] [data-testid="turn-banner"]');
    const cs = getComputedStyle(b, "::before");
    const seats = window.__emberisle.getState().state.players.map((p) => p.color);
    const probe = document.createElement("i");
    document.body.append(probe);
    const rgb = seats.map((c) => { probe.style.color = c; return getComputedStyle(probe).color; });
    probe.remove();
    return { shown: cs.content !== "none" && cs.display !== "none", color: cs.backgroundColor, seat: rgb.includes(cs.backgroundColor) };
  });

const readStack = (page) =>
  page.evaluate(() => {
    const s = document.querySelector("[data-hud-stack]");
    const sr = s.getBoundingClientRect();
    const seen = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest(".sr-only,[hidden]");
    };
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom) };
    };
    const name = (el) => el.dataset.testid ?? el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 24);
    const small = [];
    for (const el of s.querySelectorAll("*")) {
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
      if (!text || !seen(el)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 12) small.push(`${text.slice(0, 24)} ${size}px`);
    }
    // A second surface: anything in the stack with a fill, a border or a shadow that is not a thing to press (a button, a
    // token, a hand column) or a small mark on one (a dot, a badge).
    const clear = (c) => !c || c === "transparent" || /rgba\(.*, 0\)$/.test(c);
    const boxes = [];
    for (const el of s.querySelectorAll("*")) {
      if (!seen(el) || el.closest("button, [role='button'], .trade-resource, svg, [data-testid='dice-row']")) continue;
      const r = el.getBoundingClientRect();
      // A mark (a dot, a badge, one of my numbers' 20 px chips) is not a surface.
      if (r.height <= 24.5) continue;
      const cs = getComputedStyle(el);
      // A line on one side (the divider between hand columns, another seat's colour beside the status) is not a box.
      const border = ["Top", "Right", "Bottom", "Left"].filter((k) => parseFloat(cs[`border${k}Width`]) > 0 && !clear(cs[`border${k}Color`])).length > 1;
      if (!clear(cs.backgroundColor) || border || cs.boxShadow !== "none") boxes.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const floats = [...document.querySelectorAll('[data-testid="trade-toast"], [aria-label="The wayfarer takes a card"], [data-testid="discard-pick"]')].filter((el) => !s.contains(el)).length;
    const line = s.querySelector(".trade-line");
    const tone = (sel) => { const el = s.querySelector(sel); return el ? { text: el.textContent.trim(), color: getComputedStyle(el).color } : null; };
    const actionRow = (root) => [...(root?.querySelectorAll("button") ?? [])].filter(seen).map((b) => ({ name: name(b), text: b.textContent.trim(), ...box(b), primary: getComputedStyle(b).backgroundColor === "rgb(31, 61, 59)", disabled: b.disabled, dot: !!b.querySelector("span[aria-hidden='true']") }));
    return {
      rect: { left: sr.left, top: sr.top, right: sr.right, bottom: sr.bottom },
      surface: getComputedStyle(s).backgroundColor,
      banner: (() => { const b = s.querySelector('[data-testid="turn-banner"]'); return b && seen(b) ? b.textContent.trim() : null; })(),
      event: (() => { const b = s.querySelector('[data-testid="log-line"]'); return b && seen(b) ? b.textContent.trim() : null; })(),
      line: line && seen(line) ? { text: line.textContent.trim(), ...box(line), size: parseFloat(getComputedStyle(line).fontSize) } : null,
      give: tone(".trade-line .trade-give-text"),
      get: tone(".trade-line .trade-get-text"),
      wait: (() => { const w = s.querySelector(".trade-wait"); return w && seen(w) ? w.textContent.trim() : null; })(),
      outcome: (() => { const o = s.querySelector('[data-testid="trade-outcome"]'); return o && seen(o) ? { text: o.textContent.trim(), ...box(o) } : null; })(),
      buttons: [...s.querySelectorAll("button, [role='button']")].filter(seen).map((b) => ({ name: name(b), ...box(b) })),
      answers: actionRow(s.querySelector(".trade-answers")),
      takes: actionRow(s.querySelector(".take-row")),
      discard: actionRow(s.querySelector(".discard-pick"))?.filter((b) => /^Discard/.test(b.text)),
      tokens: [...s.querySelectorAll(".discard-pick .discard-good")].map((t) => { const kind = t.dataset.testid.replace("discard-", ""); const back = s.querySelector(`[data-testid="discard-back-${kind}"]`); return { kind, owned: t.querySelector(".discard-keep")?.textContent, badge: back && !back.hasAttribute("aria-disabled") ? back.textContent.trim() : null, ...box(t) }; }),
      hand: [...s.querySelectorAll('[data-testid^="resource-"]')].filter((c) => /^resource-(timber|clay|wool|grain|ore)$/.test(c.dataset.testid) && seen(c)).length,
      handBox: (() => { const h = s.querySelector('[data-testid="hand-dock"]'); return h && seen(h) ? box(h) : null; })(),
      count: s.querySelector('[data-testid="discard-count"]')?.textContent ?? null,
      small,
      boxes,
      floats,
    };
  });

try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch, deviceScaleFactor: SHOTS ? 2 : 1 });
    await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
    const page = await ctx.newPage();
    page.setDefaultTimeout(STEP_MS);
    page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag}: ${m.text()}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0);
    const tag = v.tag;
    let hotseat = false;
    const load = async (g, extra = {}) => {
      await page.evaluate(([g, extra, hotseat]) => {
        const e = window.__emberisle;
        const s = e.getState();
        if (s.screen !== "play" || (s.mode === "hotseat") !== hotseat) hotseat ? s.startHotseat(3) : s.startAi();
        // The other seats stay still, so each state holds while it is read.
        e.setState({ runBots: () => {}, state: g, buildMode: "none", pendingPlace: null, pendingSteal: null, error: null, banner: null, toast: null, offer: null, declined: [], tradeOutcome: null, tradeTaker: null, ...extra });
      }, [g, extra, hotseat]);
      return g;
    };
    const offer = (from, give, want, g) => ({ tradeId: `proof-${from}`, from, fromName: g.players.find((p) => p.id === from).name, give, want, until: null });
    const store = (fn) => page.evaluate(fn);
    const press = async (loc) => {
      if (v.touch) await loc.tap({ force: true });
      else await loc.click({ force: true });
    };
    const settle = () => page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r)); });
    const shot = async (name) => {
      // A crafted hand flashes +N and -N as it loads; the pictures wait for that to clear.
      if (SHOTS) await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'));
      if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/${name}-${tag}.png` });
    };
    // The rules every state keeps.
    const rules = async (s, at, inset = v.inset) => {
      for (const b of s.buttons) check(b.w >= 44 && b.h >= 44, `${at}: ${b.name} is ${b.w}x${b.h}, under 44 px`);
      check(s.small.length === 0, `${at}: text under 12 px in the stack: ${s.small.join("; ")}`);
      const r = s.rect;
      check(r.left >= 0 && r.top >= 0 && r.right <= v.width && r.bottom <= v.height, `${at}: the stack ${JSON.stringify(r)} leaves the ${tag} viewport`);
      for (const b of s.buttons) check(b.left >= r.left - 0.5 && b.right <= r.right + 0.5 && b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5, `${at}: ${b.name} ${JSON.stringify(b)} leaves the tray ${JSON.stringify(r)}`);
      check(s.surface === "rgb(251, 253, 252)", `${at}: the tray is ${s.surface}, want #fbfdfc`);
      check(s.boxes.length === 0, `${at}: a second surface in the tray: ${s.boxes.join("; ")}`);
      check(s.floats === 0, `${at}: ${s.floats} offer, discard or take-from box(es) outside the tray`);
      if (inset) {
        const m = await page.evaluate(() => ({ live: window.__isle.liveInsets(), hole: window.__isle.insets() }));
        check(Math.abs(m.live.bottom - m.hole.bottom) <= 4, `${at}: measured bottom inset ${m.live.bottom} is not within 4 px of the declared ${m.hole.bottom}`);
        console.log(`${at}: bottom inset measured ${m.live.bottom}, declared ${m.hole.bottom}`);
      }
    };
    const oneRow = (row, at) => check(new Set(row.map((b) => b.top)).size === 1 && row.every((b) => Math.abs(b.h - 48) <= 0.5), `${at}: the action row is one row of 48 px buttons ${JSON.stringify(row)}`);

    // 1. An offer I can answer: Tide gives 1 brick for 1 wood.
    let g = await load(game({ current: "p1" }));
    const from = g.players.find((p) => p.id === "p1");
    await page.evaluate((o) => window.__emberisle.setState({ offer: o, declined: [] }), offer("p1", { clay: 1 }, { timber: 1 }, g));
    await page.getByTestId("trade-toast").waitFor();
    await settle();
    let s = await readStack(page);
    let at = `${tag} offer`;
    check(s.line?.text === `${from.name}: give 1 wood, get 1 brick`, `${at}: the top line reads "${s.line?.text}", want "${from.name}: give 1 wood, get 1 brick"`);
    check(s.give?.text === "give 1 wood" && s.give.color === GIVE, `${at}: give is ${JSON.stringify(s.give)}, want "give 1 wood" in ${GIVE}`);
    check(s.get?.text === "get 1 brick" && s.get.color === GET, `${at}: get is ${JSON.stringify(s.get)}, want "get 1 brick" in ${GET}`);
    check(s.banner === null && s.event === null, `${at}: the status "${s.banner}" or the event "${s.event}" still shows beside the offer`);
    check(JSON.stringify(s.answers.map((b) => b.text)) === JSON.stringify(["No", "Yes"]), `${at}: the action row is ${JSON.stringify(s.answers.map((b) => b.text))}, want No, Yes`);
    check(s.answers[1]?.primary && !s.answers[0]?.primary, `${at}: Yes is the one primary button ${JSON.stringify(s.answers)}`);
    oneRow(s.answers, at);
    check(s.hand === 5 && s.handBox && s.line && s.answers[0] && s.line.bottom <= s.handBox.top + 1 && (v.width >= 768 && !v.touch ? s.answers[0].left >= s.handBox.right : s.answers[0].top >= s.handBox.bottom - 1), `${at}: the sentence is above the hand and the buttons ${v.touch ? "under" : "beside"} it ${JSON.stringify({ line: s.line, hand: s.handBox, row: s.answers[0] })}`);
    const deltas = await page.evaluate(() => [...document.querySelectorAll('[data-testid="offer-delta"]')].map((d) => d.textContent.trim()).sort());
    check(JSON.stringify(deltas) === JSON.stringify(["+1", "−1"]), `${at}: the hand marks ${JSON.stringify(deltas)}, want −1 and +1`);
    const marks = await handMarks(page);
    check(marks.length === 2 && marks.every((m) => !m.ring), `${at}: an offered hand column has a border ${JSON.stringify(marks)}`);
    check(marks.every((m) => m.above && !m.hit), `${at}: a hand tag is not above its column, clear of the symbol and number ${JSON.stringify(marks)}`);
    await rules(s, at);
    await shot("offer");
    if (v.full) {
      // Yes moves the goods.
      await press(page.getByTestId("trade-toast").getByRole("button", { name: "Yes", exact: true }));
      await page.waitForFunction(() => !window.__emberisle.getState().offer);
      const after = await store(() => window.__emberisle.getState().state.players.find((p) => p.id === "p0").resources);
      check(after.timber === HAND.timber - 1 && after.clay === HAND.clay + 1, `${at}: Yes left the hand at ${JSON.stringify(after)}, want one wood less and one brick more`);
      await page.getByTestId("trade-outcome").waitFor();
      s = await readStack(page);
      check(s.outcome?.text === `${from.name} takes it.` || s.outcome?.text === "Ember takes it.", `${at}: the outcome reads "${s.outcome?.text}"`);
      check(s.banner !== null && s.outcome && s.outcome.bottom <= (s.handBox?.top ?? 0) + 1, `${at}: the outcome sits in the top line, beside the status "${s.banner}" ${JSON.stringify(s.outcome)}`);
      // Another seat's turn has no action row, so the tray is shorter than the declared hole here, as it is at rest.
      await rules(s, `${at}, outcome`, false);
      // No closes it for me; the offer stays open for the table.
      g = await load(game({ current: "p1" }));
      await page.evaluate((o) => window.__emberisle.setState({ offer: o, declined: [] }), offer("p1", { clay: 1 }, { timber: 1 }, g));
      await press(page.getByTestId("trade-toast").getByRole("button", { name: "No", exact: true }));
      await page.getByTestId("trade-toast").waitFor({ state: "detached" });
      const no = await store(() => ({ declined: window.__emberisle.getState().declined, hand: window.__emberisle.getState().state.players.find((p) => p.id === "p0").resources }));
      check(no.declined.includes("p0") && no.hand.timber === HAND.timber && no.hand.clay === HAND.clay, `${at}: No left ${JSON.stringify(no)}`);
      s = await readStack(page);
      check(s.banner !== null && s.answers.length === 0, `${at}: after No the status is back and the row is gone ${JSON.stringify({ banner: s.banner, answers: s.answers })}`);

      // 2. An offer I cannot pay: Dismiss alone.
      g = await load(game({ current: "p1" }));
      await page.evaluate((o) => window.__emberisle.setState({ offer: o, declined: [] }), offer("p1", { clay: 1 }, { ore: 2 }, g));
      await page.getByTestId("trade-dismiss").waitFor();
      await settle();
      s = await readStack(page);
      at = `${tag} offer I cannot pay`;
      check(s.line?.text === `${from.name} is looking for 2 stone`, `${at}: the top line reads "${s.line?.text}"`);
      check(JSON.stringify(s.answers.map((b) => b.text)) === JSON.stringify(["Dismiss"]) && !s.answers[0].primary, `${at}: the action row is ${JSON.stringify(s.answers.map((b) => b.text))}, want Dismiss alone`);
      oneRow(s.answers, at);
      const why = await page.evaluate(() => ({ text: document.querySelector('[data-testid="trade-why"]')?.textContent, tied: document.querySelector('[data-testid="trade-dismiss"]').getAttribute("aria-describedby") === document.querySelector('[data-testid="trade-why"]')?.id }));
      check(why.text === "You need 2 more stone to accept" && why.tied, `${at}: the hidden reason is ${JSON.stringify(why)}`);
      await rules(s, at);
      await shot("offer-short");
      await press(page.getByTestId("trade-dismiss"));
      await page.getByTestId("trade-toast").waitFor({ state: "detached" });
      check((await store(() => window.__emberisle.getState().declined)).includes("p0"), `${at}: Dismiss did not decline`);
    }

    // 3. My own offer is out: who has said no, and Cancel.
    g = await load(game());
    await page.evaluate((o) => window.__emberisle.setState({ offer: o, declined: ["p2"] }), offer("p0", { timber: 1 }, { ore: 1 }, g));
    await page.getByTestId("trade-cancel").waitFor();
    await settle();
    s = await readStack(page);
    at = `${tag} my offer`;
    check(s.line?.text === "You offer 1 wood for 1 stone", `${at}: the top line reads "${s.line?.text}"`);
    const refuser = g.players.find((p) => p.id === "p2").name;
    check(s.wait === `${refuser.replace(/ \(bot\)$/, "")} said no`, `${at}: who said no reads "${s.wait}", want the name without "(bot)" and "said no"`);
    check(JSON.stringify(s.answers.map((b) => b.text)) === JSON.stringify(["Cancel"]) && !s.answers[0].primary, `${at}: the action row is ${JSON.stringify(s.answers.map((b) => b.text))}, want Cancel alone`);
    check(!s.buttons.some((b) => ["build-open", "Trade", "End turn"].includes(b.name)), `${at}: the turn's buttons show beside Cancel ${JSON.stringify(s.buttons.map((b) => b.name))}`);
    oneRow(s.answers, at);
    const mine = await handMarks(page);
    check(mine.length === 2 && mine.every((m) => !m.ring && m.above && !m.hit), `${at}: my offer's hand columns have a border or a tag on the symbol ${JSON.stringify(mine)}`);
    await rules(s, at);
    await shot("offer-mine");
    if (v.full) {
      await press(page.getByTestId("trade-cancel"));
      await page.waitForFunction(() => !window.__emberisle.getState().offer);
      await page.getByTestId("build-open").waitFor();
      s = await readStack(page);
      check(s.outcome?.text === "Nobody took it." && s.banner === "Your turn", `${at}: after Cancel the top line reads "${s.banner}" and "${s.outcome?.text}"`);
    }

    // 4. A discard: 4 of 8.
    g = await load(game({ hand: EIGHT, phase: "discard", patch: (g) => (g.discardNeeded = { p0: 4 }) }));
    const pick = page.getByTestId("discard-pick");
    await pick.waitFor();
    await settle();
    s = await readStack(page);
    at = `${tag} discard`;
    check(s.banner === "Discard 4: pick 4 more", `${at}: the status reads "${s.banner}", want "Discard 4: pick 4 more"`);
    check(s.hand === 0 && s.tokens.length === 5 && s.tokens.every((t) => +t.owned === EIGHT[t.kind]), `${at}: five tokens with the counts held take the hand's place ${JSON.stringify({ hand: s.hand, tokens: s.tokens })}`);
    check(s.tokens.every((t) => t.w >= 44 && t.h >= 44), `${at}: a token is under 44 px ${JSON.stringify(s.tokens)}`);
    check(s.discard.length === 1 && s.discard[0].text === "Discard 4" && s.discard[0].disabled && !s.discard[0].primary, `${at}: one Discard 4 button, off ${JSON.stringify(s.discard)}`);
    await rules(s, at);
    await shot("discard");
    const add = async (kind) => press(pick.getByTestId(`discard-${kind}`));
    await add("timber");
    await add("timber");
    await add("clay");
    await settle();
    s = await readStack(page);
    check(s.banner === "Discard 4: pick 1 more" && s.discard[0].disabled, `${at}: after three taps the status reads "${s.banner}" and Discard is ${s.discard[0].disabled ? "off" : "on"}`);
    check(s.tokens.find((t) => t.kind === "timber").badge === "−2" && s.tokens.find((t) => t.kind === "clay").badge === "−1", `${at}: the badges read ${JSON.stringify(s.tokens.map((t) => t.badge))}`);
    await add("grain");
    await settle();
    s = await readStack(page);
    check(s.banner === "Discard 4: ready" && !s.discard[0].disabled && s.discard[0].primary, `${at}: at four the status reads "${s.banner}" and Discard is ${JSON.stringify(s.discard[0])}`);
    const minus = s.buttons.filter((b) => /^discard-back-/.test(b.name));
    check(minus.length === 5 && minus.every((m) => m.bottom <= s.discard[0].top || m.right <= s.discard[0].left), `${at}: a take-back button's target overlaps Discard ${JSON.stringify({ minus, discard: s.discard[0] })}`);
    check(minus.every((m) => m.w >= 44 && m.h >= 44), `${at}: a take-back target is under 44 px ${JSON.stringify(minus)}`);
    check(minus.every((m) => s.tokens.every((t) => m.bottom <= t.top || m.top >= t.bottom || m.right <= t.left || m.left >= t.right)), `${at}: a take-back target overlaps a number ${JSON.stringify({ minus, tokens: s.tokens })}`);
    const pickedDot = await lineDot(page);
    check(!pickedDot.shown || pickedDot.seat, `${at}: the top line has a dot that is no seat's colour ${JSON.stringify(pickedDot)}`);
    await rules(s, `${at}, picked`);
    await shot("discard-picked");
    // A fifth tap adds nothing.
    await add("grain");
    await add("ore");
    check((await readStack(page)).banner === "Discard 4: ready", `${at}: a tap past the count changed the status to ${(await readStack(page)).banner}`);
    // Undo: the minus takes one back and turns Discard off again.
    await press(page.getByTestId("discard-back-clay"));
    await settle();
    s = await readStack(page);
    check(s.banner === "Discard 4: pick 1 more" && s.discard[0].disabled && s.tokens.find((t) => t.kind === "clay").badge === null, `${at}: after the take-back the status reads "${s.banner}" ${JSON.stringify(s.discard[0])}`);
    if (v.full) {
      await add("ore");
      await press(pick.getByRole("button", { name: "Discard 4" }));
      await page.waitForFunction(() => window.__emberisle.getState().state.phase !== "discard");
      const left = await store(() => window.__emberisle.getState().state.players.find((p) => p.id === "p0").resources);
      check(JSON.stringify(left) === JSON.stringify({ timber: 1, clay: 2, wool: 0, grain: 1, ore: 0 }), `${at}: the discard left ${JSON.stringify(left)}, want 2 wood, 1 wheat and 1 stone gone`);
      await pick.waitFor({ state: "detached" });
      check((await readStack(page)).hand === 5, `${at}: the hand is back after the discard`);
    }

    // 5. Take-from: one button per seat.
    const takeFrom = async (at) => {
      const { g, hexId, targets } = robberGame({ hotseat });
      await load(g);
      await page.evaluate((id) => window.__emberisle.getState().pickHex(id), hexId);
      const group = page.getByRole("group", { name: "The wayfarer takes a card" });
      await group.waitFor();
      await settle();
      const s = await readStack(page);
      const names = targets.map((id) => g.players.find((p) => p.id === id).name.replace(/ \(bot\)$/, ""));
      check(s.banner === "Take from whom?", `${at}: the status reads "${s.banner}", want "Take from whom?"`);
      check(JSON.stringify(s.takes.map((b) => b.text.replace(/\d+$/, ""))) === JSON.stringify(names) && s.takes.every((b) => b.dot && !b.primary && Math.abs(b.h - 48) <= 0.5), `${at}: the action row is ${JSON.stringify(s.takes)}, want one 48 px button per seat with its dot: ${names.join(", ")}`);
      check(s.buttons.filter((b) => !/^resource-/.test(b.name)).length === names.length, `${at}: other buttons show beside the seats ${JSON.stringify(s.buttons.map((b) => b.name))}`);
      check(s.takes.every((b) => !/\(bot\)/.test(b.text) && /\d$/.test(b.text)), `${at}: a take-from button says "(bot)" or shows no card count ${JSON.stringify(s.takes.map((b) => b.text))}`);
      const takeDot = await lineDot(page);
      check(!takeDot.shown || takeDot.seat, `${at}: the top line has a dot that is no seat's colour ${JSON.stringify(takeDot)}`);
      await rules(s, at);
      await shot(hotseat ? "take-from-hotseat" : "take-from");
      const before = sum(g.players.find((p) => p.id === targets[1]).resources);
      await press(group.getByRole("button", { name: new RegExp(`^${names[1]}, \\d+ cards$`) }));
      await page.waitForFunction(() => window.__emberisle.getState().state.phase === "main");
      const after = await page.evaluate((id) => { const st = window.__emberisle.getState(); const p = st.state.players.find((x) => x.id === id); return { robber: st.state.robberHex, cards: Object.values(p.resources).reduce((a, b) => a + b, 0), pending: st.pendingSteal, mine: Object.values(st.state.players.find((x) => x.id === "p0").resources).reduce((a, b) => a + b, 0) }; }, targets[1]);
      check(after.robber === hexId && after.cards === before - 1 && after.pending === null && after.mine === sum(HAND) + 1, `${at}: the pick left ${JSON.stringify(after)}, want the wayfarer on ${hexId} and one good from ${names[1]}`);
    };
    await takeFrom(`${tag} take-from`);

    // 6. Hotseat, where it differs: the seat that owes is named and picks from its own goods.
    if (v.tag === "390x844" || (SHOTS && v.tag !== "430x932")) {
      hotseat = true;
      g = await load(game({ hotseat, phase: "discard", patch: (g) => { g.discardNeeded = { p1: 4 }; g.players.find((p) => p.id === "p1").resources = { ...EIGHT }; } }));
      const owes = g.players.find((p) => p.id === "p1").name;
      await pick.waitFor();
      await settle();
      s = await readStack(page);
      at = `${tag} hotseat discard`;
      check(s.banner === `Discard 4: pick 4 more · ${owes}`, `${at}: the status reads "${s.banner}", want "Discard 4: pick 4 more · ${owes}"`);
      check(s.tokens.length === 5 && s.tokens.every((t) => +t.owned === EIGHT[t.kind]) && s.hand === 0, `${at}: the tokens show ${owes}'s goods ${JSON.stringify(s.tokens)}`);
      await rules(s, at);
      await shot("discard-hotseat");
      for (const k of ["timber", "timber", "timber", "clay"]) await add(k);
      await press(pick.getByRole("button", { name: "Discard 4" }));
      await page.waitForFunction(() => window.__emberisle.getState().state.phase !== "discard");
      const left = await store(() => window.__emberisle.getState().state.players.find((p) => p.id === "p1").resources);
      check(JSON.stringify(left) === JSON.stringify({ timber: 0, clay: 1, wool: 0, grain: 2, ore: 1 }), `${at}: the discard left ${owes} ${JSON.stringify(left)}`);
      await takeFrom(`${tag} hotseat take-from`);
    }
    console.log(`${tag}: offers (answer, cannot pay, mine), discard and take-from read in the tray`);
    await ctx.close();
  }
  check(errors.length === 0, `page errors:\n${errors.join("\n")}`);
  if (failures.length) throw new Error(`${failures.length} check(s) failed`);
  console.log(`tray-offers-prove: ok${SHOTS ? `, pictures in ${SHOT_DIR}` : ""}`);
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
