// #1539 one tray (docs/design/one-tray, slice B). In a practice game past setup, at 390x844 and 844x390 (touch) and 1280x720:
// - my main turn: the tray's three parts. The status reads "Your turn" inside the bottom stack; the hand is five numbers,
//   each with its name at 12 px or more; outside the sideways-phone column Build, Trade and End turn share one row, End
//   turn primary (#1f3d3b). In the column the row holds Build and Trade, and End turn is the pinned footer;
// - every button and hand column in the stack is at least 44 px in both directions, no visible text in the stack is under
//   12 px, and the stack lies inside the viewport;
// - the Build list: each row in every state a crafted hand reaches (ready with a Place or "Buy · N left" pill, missing
//   goods with the red "You need …" line, no free spot, none left), each reason worded from rules.ts. A ready row arms its
//   build (or buys the fortune) and closes the list; a blocked row plays the refusal, arms nothing, sends no move and stays
//   open; Escape and Close each return the focus to Build;
// - armed: the action row is Cancel alone, 48 px high, and it disarms;
// - a held fortune adds "Fortune · N" as the fourth equal column (outside the column);
// - before the roll the action row is Roll; on another seat's turn there is no action row;
// - the measured bottom inset (`__isle.liveInsets()`) is within 4 px of the declared one (`__isle.insets()`) on my main turn
//   at 390x844, 430x932 and 1280x720;
// - zero page errors.
// Every failure is listed before the run fails. SHOTS=1 also writes real-game PNGs at device scale 2 into docs/proofs/1539/
// for 430x932, 390x844, 844x390 and 1280x720: table, build-list, armed and roll. Run: npm run tray-prove
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, legalCities, legalRoads, legalSettle } from "../src/lib/game/rules.ts";
import { COST, RESOURCES, RESOURCE_LABEL } from "../src/lib/game/types.ts";

const STEP_MS = 30_000;
const SHOTS = process.env.SHOTS === "1";
const SHOT_DIR = "docs/proofs/1539";
const VIEWS = [
  { tag: "390x844", width: 390, height: 844, touch: true, full: true, inset: true, shot: true },
  { tag: "844x390", width: 844, height: 390, touch: true, full: true, column: true, shot: true },
  { tag: "1280x720", width: 1280, height: 720, full: true, inset: true, shot: true },
  { tag: "430x932", width: 430, height: 932, touch: true, inset: true, shot: true },
];
const KINDS = Object.keys(COST);
const NONE = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
const RICH = { timber: 5, clay: 5, wool: 5, grain: 5, ore: 5 };
const NO_SPOT = { path: "No free spot.", outpost: "No free spot. Build a path first.", stronghold: "No homes to upgrade." };

// A practice game past setup, in `main` for the person (p0). `spot` grows p0's paths until an outpost has a legal corner.
function game({ hand = NONE, spot = false, held = 0, phase = "main", current = "p0", patch } = {}) {
  let g = createGame({ humans: [{ name: "Ember" }], bots: 3, seed: 11 });
  while (g.phase !== "roll") g = applyAction(g, g.current, chooseBotAction(g, g.current)).state;
  g.phase = phase;
  g.current = current;
  g.dice = [3, 4];
  const me = g.players.find((p) => p.id === "p0");
  me.resources = { ...hand };
  me.hidden = { ...me.hidden, plenty: held };
  for (let i = 0; spot && i < 10 && legalSettle(g, "p0", false).length === 0; i++) {
    const roads = legalRoads(g, "p0", false);
    const grows = roads.find((id) => {
      const e = g.edges.find((x) => x.id === id);
      e.path = "p0";
      const ok = legalSettle(g, "p0", false).length > 0;
      e.path = undefined;
      return ok;
    });
    g.edges.find((x) => x.id === (grows ?? roads[0])).path = "p0";
    me.pathsLeft -= 1;
  }
  patch?.(g, me);
  return g;
}

// What each Build list row should say for p0 on this state: rules.ts and COST, as BuildCost.buildStatus judges.
function expected(g) {
  const me = g.players.find((p) => p.id === "p0");
  const left = { path: me.pathsLeft, outpost: me.outpostsLeft, stronghold: me.strongholdsLeft, card: g.deckLeft ?? g.deck.length };
  const spot = { path: legalRoads(g, "p0", false).length > 0, outpost: legalSettle(g, "p0", false).length > 0, stronghold: legalCities(g, "p0").length > 0, card: true };
  const out = {};
  for (const k of KINDS) {
    const short = RESOURCES.filter((r) => (COST[k][r] ?? 0) > me.resources[r]);
    if (left[k] <= 0) out[k] = { state: "nonel", build: "blocked", why: k === "card" ? "The deck is empty." : "None left." };
    else if (!spot[k]) out[k] = { state: "nospot", build: "blocked", why: NO_SPOT[k] };
    else if (short.length) out[k] = { state: "missing", build: "short", why: `You need ${short.map((r) => `${COST[k][r] - me.resources[r]} more ${RESOURCE_LABEL[r].toLowerCase()}`).join(" and ")}` };
    else out[k] = { state: "ready", build: "ready", pill: k === "card" ? `Buy · ${left.card} left` : "Place" };
  }
  return out;
}

// Hands and supplies whose rows, together, reach every state each row can reach.
const CASES = [
  { name: "rich, a free corner", spot: true, hand: RICH },
  { name: "empty hand, a free corner", spot: true, hand: NONE },
  { name: "one brick and two stone short", spot: true, hand: { timber: 1, clay: 0, wool: 1, grain: 2, ore: 1 } },
  { name: "rich, no free corner, no homes", hand: RICH, patch: (g) => g.vertices.forEach((v) => v.building?.playerId === "p0" && (v.building.kind = "stronghold")) },
  {
    name: "rich, none left, deck empty",
    spot: true,
    hand: RICH,
    patch: (g, me) => {
      me.pathsLeft = 0;
      me.outpostsLeft = 0;
      me.strongholdsLeft = 0;
      g.deckLeft = 0;
      g.deck = [];
    },
  },
];

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

// Everything the size and type rules read off the bottom stack, as far as each box shows past the stack's scroll.
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
      return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, top: Math.round(r.top) };
    };
    const name = (el) => el.dataset.testid ?? el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 24);
    const small = [];
    for (const el of s.querySelectorAll("*")) {
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
      if (!text || !seen(el)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 12) small.push(`${text.slice(0, 24)} ${size}px`);
    }
    return {
      rect: { left: sr.left, top: sr.top, right: sr.right, bottom: sr.bottom },
      tray: s.classList.contains("hud-tray"),
      banner: s.querySelector('[data-testid="turn-banner"]')?.textContent.trim() ?? null,
      buttons: [...s.querySelectorAll("button")].filter(seen).map((b) => ({ name: name(b), ...box(b), primary: getComputedStyle(b).backgroundColor === "rgb(31, 61, 59)" })),
      columns: [...s.querySelectorAll('[data-testid^="offer-slot-"]')].filter(seen).map((c) => ({ name: c.dataset.testid, ...box(c) })),
      hand: [...s.querySelectorAll('[data-testid^="resource-"]')]
        .filter((c) => /^resource-(timber|clay|wool|grain|ore)$/.test(c.dataset.testid))
        .map((c) => ({ kind: c.dataset.testid.slice(9), count: c.querySelector('[data-testid="hand-count"]')?.textContent.trim(), name: c.querySelector('[data-testid="hand-name"]')?.textContent.trim(), size: parseFloat(getComputedStyle(c.querySelector('[data-testid="hand-name"]')).fontSize) })),
      actions: [...s.querySelectorAll(".hud-actions button")].filter(seen).map((b) => ({ name: name(b), ...box(b) })),
      small,
    };
  });

try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch, deviceScaleFactor: SHOTS && v.shot ? 2 : 1 });
    await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
    const page = await ctx.newPage();
    page.setDefaultTimeout(STEP_MS);
    page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag}: ${m.text()}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0);
    const tag = v.tag;
    const load = async (opts) => {
      const g = game(opts);
      await page.evaluate((g) => {
        const e = window.__emberisle;
        if (e.getState().screen !== "play") e.getState().startAi();
        // The other seats stay still, so another seat's turn holds while it is read.
        e.setState({ runBots: () => {}, state: g, buildMode: "none", pendingPlace: null, error: null, banner: null, toast: null });
      }, g);
      return g;
    };
    const press = async (loc) => {
      if (v.touch) await loc.tap({ force: true });
      else await loc.click({ force: true });
    };
    const settle = () => page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r)); });
    const shot = async (name) => {
      if (SHOTS && v.shot) await page.screenshot({ path: `${SHOT_DIR}/${name}-${tag}.png` });
    };
    const sizeRules = (s, at) => {
      for (const b of [...s.buttons, ...s.columns]) check(b.w >= 44 && b.h >= 44, `${at}: ${b.name} is ${b.w}x${b.h}, under 44 px`);
      check(s.small.length === 0, `${at}: text under 12 px in the stack: ${s.small.join("; ")}`);
      const r = s.rect;
      check(r.left >= 0 && r.top >= 0 && r.right <= v.width && r.bottom <= v.height, `${at}: the stack ${JSON.stringify(r)} leaves the ${tag} viewport`);
    };

    // 1. My main turn, no fortune held.
    await load({ hand: { timber: 1, clay: 1, wool: 0, grain: 2, ore: 0 } });
    await page.getByTestId("build-open").waitFor();
    await settle();
    let s = await readStack(page);
    let at = `${tag} main`;
    check(s.banner === "Your turn", `${at}: the status in the stack reads "${s.banner}", want "Your turn"`);
    check(s.hand.length === 5 && s.hand.every((h) => h.name === RESOURCE_LABEL[h.kind] && h.size >= 12 && /^\d+$/.test(h.count)), `${at}: five hand numbers named at 12 px or more ${JSON.stringify(s.hand)}`);
    check(s.tray === !v.column, `${at}: the stack is${s.tray ? "" : " not"} the hud-tray`);
    const trades = s.buttons.filter((b) => b.name === "Trade").length;
    check(trades === 1, `${at}: ${trades} Trade buttons in the stack, want one`);
    if (!v.column) {
      const row = s.actions.map((b) => b.name);
      check(JSON.stringify(row) === JSON.stringify(["build-open", "Trade", "End turn"]), `${at}: the action row is ${JSON.stringify(row)}, want Build, Trade, End turn`);
      check(new Set(s.actions.map((b) => b.top)).size === 1, `${at}: the action row is one row ${JSON.stringify(s.actions)}`);
      check(s.buttons.find((b) => b.name === "End turn")?.primary && s.buttons.filter((b) => b.primary).length === 1, `${at}: End turn is the one primary button`);
    } else {
      check(s.buttons.some((b) => b.name === "build-open") && s.buttons.some((b) => b.name === "End turn"), `${at}: the column has Build and End turn ${JSON.stringify(s.buttons.map((b) => b.name))}`);
    }
    if (v.full) sizeRules(s, at);
    if (v.inset) {
      const m = await page.evaluate(() => ({ live: window.__isle.liveInsets(), hole: window.__isle.insets() }));
      check(Math.abs(m.live.bottom - m.hole.bottom) <= 4, `${at}: measured bottom inset ${m.live.bottom} is not within 4 px of the declared ${m.hole.bottom}`);
      console.log(`${at}: bottom inset measured ${m.live.bottom}, declared ${m.hole.bottom}`);
    }
    await shot("table");
    if (!v.full) {
      // 430x932 is here for the inset and the pictures.
      await press(page.getByTestId("build-open"));
      await page.getByTestId("build-list").waitFor();
      await settle();
      await shot("build-list");
      await press(page.getByTestId("build-path"));
      await page.getByTestId("build-cancel").waitFor();
      await settle();
      await shot("armed");
      await load({ hand: { timber: 1, clay: 1, wool: 0, grain: 2, ore: 0 }, phase: "roll" });
      await page.getByRole("button", { name: "Roll" }).waitFor();
      await settle();
      await shot("roll");
      await ctx.close();
      continue;
    }

    // 2. The Build list, row by row, for each crafted hand.
    const reached = Object.fromEntries(KINDS.map((k) => [k, new Set()]));
    const list = page.getByTestId("build-list");
    for (const c of CASES) {
      const g = await load(c);
      const want = expected(g);
      await page.getByTestId("build-open").waitFor();
      await press(page.getByTestId("build-open"));
      await list.waitFor();
      at = `${tag} build list · ${c.name}`;
      const rows = await list.evaluate((el, KINDS) =>
        Object.fromEntries(KINDS.map((k) => {
          const b = el.querySelector(`[data-testid="build-${k}"]`);
          const why = el.querySelector(`[data-testid="build-why-${k}"]`);
          const r = b.getBoundingClientRect();
          return [k, { build: b.dataset.build, state: b.dataset.buildState, disabled: b.getAttribute("aria-disabled") === "true", why: why?.textContent.trim() ?? null, red: why ? getComputedStyle(why).color : null, whySize: why ? parseFloat(getComputedStyle(why).fontSize) : null, pill: b.querySelector(".build-pill")?.textContent.trim() ?? null, h: r.height, w: r.width }];
        })), KINDS);
      for (const k of KINDS) {
        const w = want[k];
        const r = rows[k];
        const atk = `${at} · ${k}`;
        reached[k].add(w.state);
        check(r.build === w.build && r.disabled === (w.state !== "ready"), `${atk}: reads ${r.build}${r.disabled ? " (aria-disabled)" : ""}, rules say ${w.state}`);
        check(r.state === (w.state === "nonel" ? "nospot" : w.state), `${atk}: data-build-state ${r.state}`);
        check(r.h >= 56 && r.w >= 44, `${atk}: the row is ${r.w}x${r.h}, under 56 px high`);
        if (w.state === "ready") check(r.pill === w.pill && r.why === null, `${atk}: pill "${r.pill}", want "${w.pill}"`);
        else {
          check(r.why === w.why && r.pill === null, `${atk}: says "${r.why}", want "${w.why}"`);
          check(r.whySize >= 12, `${atk}: the reason is ${r.whySize} px`);
          if (w.state === "missing") check(r.red === "rgb(179, 38, 30)" || /^rgb\((1[5-9]\d|2\d\d), ([0-6]\d), ([0-6]\d)\)$/.test(r.red), `${atk}: the missing goods line is red (${r.red})`);
        }
      }
      if (c.name === "rich, a free corner") {
        await settle();
        sizeRules(await readStack(page), `${at} (stack under the list)`);
        const fits = await list.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
        check(fits.left >= 0 && fits.top >= 0 && fits.right <= v.width && fits.bottom <= v.height, `${at}: the list ${JSON.stringify(fits)} leaves the viewport`);
        const close = await list.getByRole("button", { name: "Close" }).boundingBox();
        check(close.width >= 44 && close.height >= 44, `${at}: Close is ${close.width}x${close.height}`);
        await shot("build-list");
      }
      // A blocked row refuses and stays open.
      const blocked = KINDS.find((k) => want[k].state !== "ready");
      if (blocked) {
        const before = await page.evaluate(() => ({ seq: window.__emberisle.getState().state.seq, err: window.__emberisle.getState().errorSeq }));
        await press(page.getByTestId(`build-${blocked}`));
        const after = await page.evaluate(() => ({ seq: window.__emberisle.getState().state.seq, err: window.__emberisle.getState().errorSeq, said: window.__emberisle.getState().announcement, mode: window.__emberisle.getState().buildMode, open: !!document.querySelector('[data-testid="build-list"]') }));
        check(after.err === before.err + 1 && after.said === want[blocked].why, `${at} · ${blocked}: the press refuses once with "${want[blocked].why}" (got errorSeq +${after.err - before.err}, "${after.said}")`);
        check(after.mode === "none" && after.seq === before.seq && after.open, `${at} · ${blocked}: arms nothing, sends nothing, stays open ${JSON.stringify(after)}`);
      }
      // A ready row arms (or buys) and closes.
      const ready = ["path", "card"].find((k) => want[k].state === "ready");
      if (ready) {
        const before = await page.evaluate(() => ({ deck: window.__emberisle.getState().state.deck.length, held: window.__emberisle.getState().state.players[0].hidden }));
        await press(page.getByTestId(`build-${ready}`));
        await list.waitFor({ state: "detached" });
        const after = await page.evaluate(() => ({ mode: window.__emberisle.getState().buildMode, deck: window.__emberisle.getState().state.deck.length }));
        if (ready === "path") check(after.mode === "path", `${at}: the ready Path row armed ${after.mode}`);
        else check(after.deck === before.deck - 1, `${at}: the ready Fortune row bought one (deck ${before.deck} to ${after.deck})`);
        if (after.mode !== "none") await page.evaluate(() => window.__emberisle.getState().setBuildMode("none"));
      } else {
        await press(list.getByRole("button", { name: "Close" }));
        await list.waitFor({ state: "detached" });
      }
    }
    for (const k of KINDS) check(reached[k].has("ready") && reached[k].has("nonel") && (k === "card" || k === "path" || reached[k].has("nospot")) && reached[k].has("missing"), `${tag}: ${k} reached ${[...reached[k]].join(", ")}`);

    // 3. Escape and Close return the focus to Build.
    await load({ hand: RICH, spot: true });
    for (const how of ["Escape", "Close"]) {
      await page.getByTestId("build-open").focus();
      await press(page.getByTestId("build-open"));
      await list.waitFor();
      if (how === "Escape") await page.keyboard.press("Escape");
      else await press(list.getByRole("button", { name: "Close" }));
      await list.waitFor({ state: "detached" });
      const focus = await page.evaluate(() => document.activeElement?.dataset.testid ?? document.activeElement?.tagName);
      check(focus === "build-open", `${tag}: ${how} closes the list with the focus on ${focus}, want Build`);
    }

    // 4. Armed: Cancel alone, 48 px high, and it disarms.
    await press(page.getByTestId("build-open"));
    await list.waitFor();
    await press(page.getByTestId("build-path"));
    await page.getByTestId("build-cancel").waitFor();
    await settle();
    s = await readStack(page);
    at = `${tag} armed`;
    check(s.actions.length === 1 && s.actions[0].name === "build-cancel" && Math.abs(s.actions[0].h - 48) <= 0.5, `${at}: the action row is Cancel alone, 48 px high ${JSON.stringify(s.actions)}`);
    check(!s.buttons.some((b) => ["build-open", "Trade", "End turn"].includes(b.name)), `${at}: no other action ${JSON.stringify(s.buttons.map((b) => b.name))}`);
    check(s.banner === (v.touch ? "Place a path" : "Place a path · Esc cancels"), `${at}: the status reads "${s.banner}"`);
    sizeRules(s, at);
    await shot("armed");
    await press(page.getByTestId("build-cancel"));
    await page.getByTestId("build-open").waitFor();
    check((await page.evaluate(() => window.__emberisle.getState().buildMode)) === "none", `${at}: Cancel disarms`);

    // 5. A held fortune: the fourth column.
    await load({ hand: { timber: 1, clay: 1, wool: 0, grain: 2, ore: 0 }, held: 1 });
    await page.getByTestId("fortunes-button").waitFor();
    await settle();
    s = await readStack(page);
    at = `${tag} main, a fortune held`;
    const fortune = await page.getByTestId("fortunes-button").textContent();
    if (!v.column) {
      check(fortune.trim() === "Fortune · 1", `${at}: the button reads "${fortune.trim()}", want "Fortune · 1"`);
      const row = s.actions.map((b) => b.name);
      check(JSON.stringify(row) === JSON.stringify(["build-open", "Trade", "fortunes-button", "End turn"]), `${at}: the action row is ${JSON.stringify(row)}`);
      check(new Set(s.actions.map((b) => b.top)).size === 1 && Math.max(...s.actions.map((b) => b.w)) - Math.min(...s.actions.map((b) => b.w)) <= 1, `${at}: four equal columns in one row ${JSON.stringify(s.actions)}`);
    } else check(/^(Play fortune|Fortunes) · 1$/.test(fortune.trim()), `${at}: the column's button reads "${fortune.trim()}"`);
    sizeRules(s, at);

    // 6. Before the roll: Roll.
    await load({ hand: { timber: 1, clay: 1, wool: 0, grain: 2, ore: 0 }, phase: "roll" });
    await page.getByRole("button", { name: "Roll" }).waitFor();
    await settle();
    s = await readStack(page);
    at = `${tag} before the roll`;
    const rollRow = s.buttons.filter((b) => !/^offer-slot|^resource-/.test(b.name)).map((b) => b.name);
    check(JSON.stringify(rollRow) === JSON.stringify(["Roll"]), `${at}: the action row is ${JSON.stringify(rollRow)}, want Roll`);
    sizeRules(s, at);
    await shot("roll");

    // 7. Another seat's turn: no action row.
    await load({ hand: { timber: 1, clay: 1, wool: 0, grain: 2, ore: 0 }, current: "p1" });
    await page.waitForFunction(() => !document.querySelector('[data-testid="build-open"]'));
    await settle();
    s = await readStack(page);
    at = `${tag} another seat's turn`;
    check(s.actions.length === 0 && !s.buttons.some((b) => ["build-open", "Trade", "End turn", "Roll", "build-cancel"].includes(b.name)), `${at}: no action row ${JSON.stringify(s.buttons.map((b) => b.name))}`);
    sizeRules(s, at);
    console.log(`${tag}: tray read in main, Build list, armed, fortune held, roll and another seat's turn`);
    await ctx.close();
  }
  check(errors.length === 0, `page errors:\n${errors.join("\n")}`);
  if (failures.length) throw new Error(`${failures.length} check(s) failed`);
  console.log(`tray-prove: ok${SHOTS ? `, pictures in ${SHOT_DIR}` : ""}`);
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
