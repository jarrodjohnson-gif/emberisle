// #1609 six players 6: the tray on paired turns, and five or six seats from the Play page (docs/design/six-players.md,
// "Rules, setup, turns, and scoring", "Six seats at 440x956" and "Bots and local modes"). At 390x844 and 844x390 (touch)
// and 1280x720, each also with the UI in a wide font (DejaVu Sans, the face CI's Chromium falls back to):
// - the Play page's Game options offer Seats 4, 5 and 6 (4 by default);
// - a classic practice and a classic pass and play game still start with four seats on the classic island, Roll is in
//   the tray on the person's roll, and the expanded rules module (src/lib/game/expanded.ts) is never requested;
// - Seats 5 and 6 start practice and pass and play games on the 30-hex island with paired turns, each seat numbered
//   1 to n in its own colour;
// - practice: on the person's own primary turn the tray has Roll before the roll; while another seat is primary the
//   status names it; while another seat is partner the status reads "<name>'s partner turn"; on the person's partner
//   turn the status reads "Your partner turn", the event line "Build or trade with the bank. No dice.", there is no
//   Roll, Build buys a fortune, Trade shows the bank only and a bank trade goes through, and End turn passes to the next
//   primary; a partner bot never rolls and never asks the table; the game is played to the win screen, and Play again
//   keeps the seat count, the expanded island and each seat's number and colour;
// - pass and play: the partner turn reads "Your partner turn" with no Roll, and Play again after a played-out game keeps
//   the seat count, the expanded island, and each player's seat number and colour, with the winner first;
// - no visible text under 12 px, every control at least 44 px each way, the status line never clipped;
// - zero page errors.
// The person's moves (and the pass and play seats') are the bots' own choices (chooseBotAction), sent through the store's
// dispatch as a tap would; the bots move only when this proof runs the store's runBots, so a state holds while it is read.
// Every failure is listed before the run fails. SHOTS=1 writes real-game PNGs at device scale 2 into docs/proofs/1609/:
// the Play page with the seat choice, and the tray on the person's partner turn and on another seat's.
// Run: npm run paired-hud-prove
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const STEP_MS = 30_000;
const SHOTS = process.env.SHOTS === "1";
const SHOT_DIR = "docs/proofs/1609";
const WIDE = 'html, body { font-family: "DejaVu Sans", sans-serif !important; }';
// `full` plays that seat count's practice game to the win; the other count only to the person's first partner turn.
const VIEWS = [
  { tag: "390x844", width: 390, height: 844, touch: true, full: 5, hotseat: 6 },
  { tag: "844x390", width: 844, height: 390, touch: true, full: 6, hotseat: 5 },
  { tag: "1280x720", width: 1280, height: 720, full: 5, hotseat: 6 },
  { tag: "390x844 wide font", width: 390, height: 844, touch: true, wide: true },
  { tag: "844x390 wide font", width: 844, height: 390, touch: true, wide: true },
  { tag: "1280x720 wide font", width: 1280, height: 720, wide: true },
];
const HINT = "Build or trade with the bank. No dice.";

if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
// Every source file is scanned for its dependencies up front: one found only as the win screen loads would make the dev
// server re-bundle and reload the page in the middle of a game.
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, optimizeDeps: { entries: ["index.html", "src/**/*.{ts,tsx}"] }, logLevel: "warn" });
await vite.listen();
const PORT = vite.httpServer.address().port;
const { EXPANDED_COLORS } = await vite.ssrLoadModule("/src/lib/game/expanded.ts");
const { RESOURCE_LABEL } = await vite.ssrLoadModule("/src/lib/game/types.ts");
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

// Every visible text under `roots` is at least 12 px, every visible control in them is at least 44x44 px, and the status
// line shows all of its text. Measured on the page, so it holds for whichever font the machine draws with.
async function layout(page, tag, roots) {
  const r = await page.evaluate((roots) => {
    const seen = (el) => {
      const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return b.width > 1 && b.height > 1 && cs.visibility !== "hidden" && !el.closest(".sr-only, [hidden], details:not([open]) > :not(summary)");
    };
    const small = [], tiny = [], clipped = [];
    let texts = 0, controls = 0;
    for (const root of roots.flatMap((s) => [...document.querySelectorAll(s)])) {
      for (const el of [root, ...root.querySelectorAll("*")]) {
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
        if (!own || !seen(el)) continue;
        texts++;
        if (parseFloat(getComputedStyle(el).fontSize) < 12) small.push(`${own} ${getComputedStyle(el).fontSize}`);
      }
      for (const el of root.querySelectorAll("button, select, summary, input, a[href]")) {
        if (!seen(el)) continue;
        controls++;
        const b = el.getBoundingClientRect();
        if (b.width < 43.5 || b.height < 43.5) tiny.push(`${el.getAttribute("aria-label") || el.textContent.trim()} ${b.width.toFixed(1)}x${b.height.toFixed(1)}`);
      }
    }
    const status = document.querySelector("[data-testid=turn-banner]");
    if (status && (status.scrollWidth > status.clientWidth + 1 || status.scrollHeight > status.clientHeight + 1)) clipped.push(status.textContent);
    if (status) {
      const b = status.getBoundingClientRect();
      if (b.left < 0 || b.right > innerWidth + 0.5 || b.top < 0 || b.bottom > innerHeight + 0.5) clipped.push(`${status.textContent} off screen`);
    }
    return { small, tiny, clipped, texts, controls };
  }, roots);
  check(r.texts > 0 && r.controls > 0, `${tag}: measured ${r.texts} texts and ${r.controls} controls`);
  check(r.small.length === 0, `${tag}: text under 12 px: ${r.small.join("; ")}`);
  check(r.tiny.length === 0, `${tag}: controls under 44 px: ${r.tiny.join("; ")}`);
  check(r.clipped.length === 0, `${tag}: status line clipped: ${r.clipped.join("; ")}`);
}

const TRAY = ["[data-hud-stack]", "header.hud-header"];
const status = (page) => page.getByTestId("turn-banner").textContent();
const eventLine = (page) => page.getByTestId("log-line").textContent();
const rollShown = (page) => page.getByRole("button", { name: "Roll", exact: true }).isVisible();
const store = (page, fn, arg) => page.evaluate(fn, arg);
const snap = (page) => store(page, () => { const g = window.__emberisle.getState(); return { state: g.state, mode: g.mode, offer: g.offer }; });
const tap = (v, loc) => (v.touch ? loc.tap() : loc.click());
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// Plays the game in the page until `until` (a function body over `st`, the game, and `me`) holds, or the game ends. Every
// seat that is not the person's (practice) moves through the store's runBots; the person, and every pass and play seat,
// takes chooseBotAction's move through dispatch. An open bot offer gets the person's No. A partner bot's step is watched:
// it must not roll and must not open an offer.
async function play(page, until, cap = 4000) {
  return page.evaluate(async ({ until, cap }) => {
    const { chooseBotAction } = await import("/src/lib/game/ai.ts");
    const e = window.__emberisle;
    window.__runBots ??= e.getState().runBots;
    if (e.getState().runBots !== window.__noBots) e.setState({ runBots: (window.__noBots ??= () => {}) });
    const watch = (window.__partnerBots ??= { steps: 0, moves: 0, rolls: 0, offers: 0 });
    // Every move a bot sends (runBots dispatches it as automated) on a partner turn is counted, and a roll is a failure.
    if (!window.__dispatch) {
      const dispatch = (window.__dispatch = e.getState().dispatch);
      e.setState({
        dispatch: (a, as, automated) => {
          if (automated && e.getState().state?.role === "partner") {
            watch.moves++;
            if (a.type === "roll") watch.rolls++;
          }
          return dispatch(a, as, automated);
        },
      });
    }
    const done = new Function("st", "me", `return (${until});`);
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let steps = 0; steps < cap; steps++) {
      const g = e.getState(), st = g.state, hot = g.mode === "hotseat";
      const me = hot ? st.current : g.localId;
      if (done(st, me) || st.phase === "over") return { steps, over: st.phase === "over" };
      if (g.offer) {
        if (g.offer.from !== g.localId && !g.declined.includes(g.localId)) g.answerTrade(false);
        await pause(100);
        continue;
      }
      const owes = Object.keys(st.discardNeeded).find((id) => st.discardNeeded[id] > 0 && (hot || id === g.localId));
      const mover = owes ?? (st.phase !== "discard" && (hot || st.current === g.localId) ? st.current : null);
      if (mover) {
        const a = chooseBotAction(st, mover);
        if (!a) return { steps, over: false, stuck: `no move for ${mover} in ${st.phase}` };
        g.dispatch(a, mover);
      } else {
        const partnerBot = st.role === "partner" && st.players.find((p) => p.id === st.current)?.kind === "bot";
        window.__runBots();
        if (partnerBot) {
          const after = e.getState();
          watch.steps++;
          if ((after.state.rolls ?? 0) !== (st.rolls ?? 0)) watch.rolls++;
          if (after.offer) watch.offers++;
        }
      }
      if (steps % 25 === 0) await pause(0);
    }
    return { steps: cap, over: false, stuck: true };
  }, { until, cap });
}

async function openPlayPage(page) {
  await page.getByTestId("title-card").waitFor();
  if ((await page.getByTestId("title-card").getAttribute("data-page")) === "front") await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Play with bots", exact: true }).waitFor();
}

// Picks the seat count in Game options on the real Play page and starts practice or pass and play from its button.
async function start(page, v, seats, button) {
  await page.evaluate(() => window.__emberisle.getState().screen === "title" || window.__emberisle.getState().goTitle());
  await openPlayPage(page);
  const options = page.getByTestId("wayfarer-setup");
  if (!(await options.evaluate((d) => d.open))) await tap(v, options.locator("summary"));
  const select = page.getByRole("combobox", { name: "Seats", exact: true });
  await select.selectOption(String(seats));
  await tap(v, page.getByRole("button", { name: button, exact: true }));
  await page.waitForFunction((n) => window.__emberisle.getState().screen === "play" && window.__emberisle.getState().state?.players.length === n, seats);
  await page.getByTestId("turn-banner").waitFor();
  return (await snap(page)).state;
}

// The deal: seat count, island and turn rule, and on five or six seats every seat numbered in its own colour.
function dealt(tag, st, seats) {
  const expanded = seats > 4;
  check(st.players.length === seats, `${tag}: ${st.players.length} seats, not ${seats}`);
  check(st.hexes.length === (expanded ? 30 : 19), `${tag}: ${st.hexes.length} hexes`);
  check(expanded ? st.variant?.kind === "expanded" && st.variant.turns?.rule === "paired" : !st.variant, `${tag}: variant ${JSON.stringify(st.variant ?? null)}`);
  if (expanded) {
    const numbers = st.players.map((p) => p.seat).sort();
    check(JSON.stringify(numbers) === JSON.stringify(Array.from({ length: seats }, (_, i) => i + 1)), `${tag}: seat numbers ${numbers}`);
    check(st.players.every((p) => p.color === EXPANDED_COLORS[p.seat - 1]), `${tag}: seat colours ${st.players.map((p) => `${p.seat}:${p.color}`)}`);
  } else check(st.players.every((p) => p.seat === undefined), `${tag}: a classic seat has a number`);
}
// Each player's name with its seat number and colour, in name order.
const identity = (st) => Object.fromEntries(st.players.map((p) => [p.name, `${p.seat}|${p.color}`]).sort(([a], [b]) => a.localeCompare(b)));

async function shot(page, name) {
  if (!SHOTS) return;
  await settle(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
  console.log(`wrote ${SHOT_DIR}/${name}.png`);
}

// The person's partner turn in practice, or a pass and play seat's: the status, the hint on the first one, no Roll, Build
// buys a fortune, Trade is the bank's only and its trade goes through, and End turn hands the next primary the dice.
async function partnerTurn(page, v, tag, { shotName, full }) {
  let st = (await snap(page)).state;
  const me = st.current;
  check(st.role === "partner" && st.phase === "main", `${tag}: not a partner turn (${st.role} ${st.phase})`);
  check((await status(page)) === "Your partner turn", `${tag}: status reads "${await status(page)}"`);
  if (st.turn === 1) check((await eventLine(page)) === HINT, `${tag}: event line reads "${await eventLine(page)}"`);
  check(!(await rollShown(page)), `${tag}: Roll is shown on a partner turn`);
  for (const name of ["Build", "Trade", "End turn"]) check(await page.getByRole("button", { name, exact: true }).isVisible(), `${tag}: no ${name} on a partner turn`);
  await layout(page, `${tag} partner turn`, TRAY);
  if (shotName) await shot(page, shotName);
  if (!full) return;

  // Goods for a fortune and one bank trade: ore, wool and grain, and four wood.
  await store(page, (me) => {
    const e = window.__emberisle, st = structuredClone(e.getState().state);
    const p = st.players.find((x) => x.id === me);
    for (const [r, n] of Object.entries({ ore: 1, wool: 1, grain: 1, timber: 4 })) {
      p.resources[r] += n;
      st.bank[r] -= n;
    }
    e.setState({ state: st });
  }, me);
  const before = (await snap(page)).state.players.find((p) => p.id === me);
  await tap(v, page.getByTestId("build-open"));
  await page.getByTestId("build-list").waitFor();
  await layout(page, `${tag} partner Build list`, ["[data-testid=build-list]"]);
  await tap(v, page.getByTestId("build-card"));
  await page.waitForFunction(([me, n]) => Object.values(window.__emberisle.getState().state.players.find((p) => p.id === me).hidden).reduce((a, b) => a + b, 0) === n + 1,
    [me, Object.values(before.hidden).reduce((a, b) => a + b, 0)]);

  await tap(v, page.getByRole("button", { name: "Trade", exact: true }));
  const panel = page.getByTestId("trade-panel");
  await panel.waitFor();
  check((await panel.locator(".trade-ask").count()) === 0, `${tag}: Ask the table is in the trade sheet on a partner turn`);
  check((await panel.getByTestId("trade-player-preview").count()) === 0, `${tag}: the player offer line is in the trade sheet on a partner turn`);
  check((await panel.locator(".trade-bank").count()) === 1, `${tag}: no bank button in the trade sheet`);
  await layout(page, `${tag} partner trade sheet`, ["[data-testid=trade-panel]"]);
  const held = (await snap(page)).state.players.find((p) => p.id === me).resources;
  await tap(v, panel.getByRole("button", { name: `More ${RESOURCE_LABEL.timber} to give`, exact: true }));
  await tap(v, panel.getByRole("button", { name: `More ${RESOURCE_LABEL.clay} to want`, exact: true }));
  await tap(v, panel.locator(".trade-bank"));
  await panel.waitFor({ state: "detached" });
  const after = (await snap(page)).state.players.find((p) => p.id === me).resources;
  check(after.timber < held.timber && after.clay === held.clay + 1, `${tag}: bank trade: wood ${held.timber} to ${after.timber}, brick ${held.clay} to ${after.clay}`);

  st = (await snap(page)).state;
  const at = st.players.findIndex((p) => p.id === st.primary);
  const next = st.players[(at + 1) % st.players.length];
  await tap(v, page.getByRole("button", { name: "End turn", exact: true }));
  await page.waitForFunction((id) => window.__emberisle.getState().state.primary === id, next.id);
  st = (await snap(page)).state;
  check(st.role === "primary" && st.current === next.id && st.phase === "roll", `${tag}: End turn gave ${st.current} (${st.role} ${st.phase}), not the next primary ${next.id}`);
}

const newPage = async (v) => {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch, deviceScaleFactor: SHOTS ? 2 : 1 });
  await ctx.addInitScript(() => {
    localStorage.setItem("emberisle-first-game-coach", '"done"');
    localStorage.setItem("emberisle-name", "Ember");
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(STEP_MS);
  page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag}: ${m.text()}`));
  const expandedAsked = [];
  page.on("request", (r) => /\/expanded[.-]/.test(r.url()) && expandedAsked.push(r.url()));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__emberisle);
  page.on("load", () => errors.push(`${v.tag}: the page reloaded`));
  if (v.wide) {
    await page.addStyleTag({ content: WIDE });
    const w = await page.evaluate(() => {
      const t = document.createElement("span");
      t.textContent = "Ember";
      t.style.cssText = "position:absolute;font-size:13px;font-weight:600;white-space:nowrap";
      document.body.append(t);
      const w = t.getBoundingClientRect().width;
      t.remove();
      return w;
    });
    check(w >= 45, `${v.tag}: the wide font did not apply, "Ember" at 13 px is ${w.toFixed(1)} px`);
  }
  return { ctx, page, expandedAsked };
};

try {
  for (const v of VIEWS) {
    const { ctx, page, expandedAsked } = await newPage(v);
    const tag = v.tag;

    // The Play page: Seats in Game options, 4, 5 and 6, four by default.
    await openPlayPage(page);
    const options = page.getByTestId("wayfarer-setup");
    await tap(v, options.locator("summary"));
    const select = page.getByRole("combobox", { name: "Seats", exact: true });
    await select.waitFor();
    const choices = await select.locator("option").allTextContents();
    check(JSON.stringify(choices) === '["4","5","6"]', `${tag}: Seats offers ${JSON.stringify(choices)}`);
    check((await select.inputValue()) === "4", `${tag}: Seats starts at ${await select.inputValue()}`);
    await layout(page, `${tag} Play page`, ["[data-testid=title-card]"]);
    if (!v.wide) {
      await select.selectOption("6");
      await select.scrollIntoViewIfNeeded();
      await shot(page, `play-seats-${tag}`);
      await select.selectOption("4");
    }

    if (!v.wide) {
      // Classic practice and pass and play: four seats, the classic island, Roll on the person's roll, no expanded module.
      let st = await start(page, v, 4, "Play with bots");
      dealt(`${tag} classic practice`, st, 4);
      let r = await play(page, `st.phase === "roll" && st.current === me`);
      check(!r.over && !r.stuck, `${tag} classic practice: never reached the person's roll ${JSON.stringify(r)}`);
      check(await rollShown(page), `${tag} classic practice: no Roll on the person's roll`);
      check((await status(page)) === "Roll the dice", `${tag} classic practice: status "${await status(page)}"`);
      st = await start(page, v, 4, "Pass and play");
      dealt(`${tag} classic pass and play`, st, 4);
      check(expandedAsked.length === 0, `${tag}: a classic start requested the expanded module: ${expandedAsked}`);
    }

    // Practice with five and six seats.
    for (const seats of v.wide ? [6] : [v.full === 5 ? 6 : 5, v.full]) {
      const t = `${tag} practice ${seats}`;
      const full = seats === v.full;
      let st = await start(page, v, seats, "Play with bots");
      dealt(t, st, seats);
      check(expandedAsked.length > 0, `${t}: the expanded module was never requested`);

      let r = await play(page, `st.role === "primary" && st.phase === "roll" && st.current === me`);
      check(!r.over && !r.stuck, `${t}: never reached the person's primary roll ${JSON.stringify(r)}`);
      check(await rollShown(page), `${t}: no Roll on the person's primary turn`);
      check((await status(page)) === "Roll the dice", `${t}: primary status "${await status(page)}"`);
      await layout(page, `${t} primary roll`, TRAY);

      r = await play(page, `st.role === "primary" && st.phase === "main" && st.current !== me`);
      st = (await snap(page)).state;
      let who = st.players.find((p) => p.id === st.current).name;
      check((await status(page)) === `Wait for ${who} to build or trade`, `${t}: another seat's primary status "${await status(page)}"`);
      check(!(await rollShown(page)), `${t}: Roll on another seat's turn`);

      r = await play(page, `st.role === "partner" && st.current !== me`);
      st = (await snap(page)).state;
      who = st.players.find((p) => p.id === st.current).name;
      check((await status(page)) === `${who}'s partner turn`, `${t}: another seat's partner status "${await status(page)}"`);
      check((await eventLine(page)) !== HINT, `${t}: the partner hint shows on another seat's partner turn`);
      check(!(await rollShown(page)), `${t}: Roll on another seat's partner turn`);
      await layout(page, `${t} another seat's partner turn`, TRAY);
      if (full) await shot(page, `partner-other-${tag}`);

      r = await play(page, `st.role === "partner" && st.current === me`);
      check(!r.over && !r.stuck, `${t}: never reached the person's partner turn ${JSON.stringify(r)}`);
      await partnerTurn(page, v, t, { shotName: full ? `partner-yours-${tag}` : null, full: full || v.wide });

      if (!full) continue;
      // To the win screen, then Play again.
      r = await play(page, "false", 20000);
      check(r.over, `${t}: the game did not end ${JSON.stringify(r)}`);
      await page.getByTestId("win-screen").waitFor();
      check((await page.getByTestId("win-row").count()) === seats, `${t}: ${await page.getByTestId("win-row").count()} rows on the win screen`);
      const watch = await store(page, () => window.__partnerBots);
      check(watch.steps > 0 && watch.moves > 0 && watch.rolls === 0 && watch.offers === 0, `${t}: partner bots ${JSON.stringify(watch)}`);
      console.log(`${t}: played to the win in ${r.steps} moves; partner bots took ${watch.steps} steps (${watch.moves} moves), ${watch.rolls} rolls, ${watch.offers} offers`);
      const was = identity((await snap(page)).state);
      await tap(v, page.getByTestId("win-again"));
      await page.waitForFunction(() => window.__emberisle.getState().state.phase === "rollOff");
      st = (await snap(page)).state;
      dealt(`${t} play again`, st, seats);
      check(JSON.stringify(identity(st)) === JSON.stringify(was), `${t} play again: seats ${JSON.stringify(identity(st))}, were ${JSON.stringify(was)}`);
    }

    if (!v.wide) {
      // Pass and play: both counts start; one is played out and dealt again.
      for (const seats of [5, 6]) {
        const t = `${tag} pass and play ${seats}`;
        let st = await start(page, v, seats, "Pass and play");
        dealt(t, st, seats);
        check(st.players.every((p) => p.kind === "human"), `${t}: a seat is not a person`);
        if (seats !== v.hotseat) continue;
        let r = await play(page, `st.role === "partner"`);
        check(!r.over && !r.stuck, `${t}: never reached a partner turn ${JSON.stringify(r)}`);
        await partnerTurn(page, v, t, { full: false });
        r = await play(page, "false", 20000);
        check(r.over, `${t}: the game did not end ${JSON.stringify(r)}`);
        await page.getByTestId("win-screen").waitFor();
        st = (await snap(page)).state;
        const was = identity(st);
        const winner = st.players.find((p) => p.id === st.winner);
        const order = st.players.map((p) => p.seat).join(",");
        await tap(v, page.getByTestId("win-again"));
        await page.waitForFunction(() => window.__emberisle.getState().state.phase === "rollOff");
        st = (await snap(page)).state;
        dealt(`${t} play again`, st, seats);
        check(st.players[0].name === winner.name, `${t} play again: ${st.players[0].name} places first, not the winner ${winner.name}`);
        check(JSON.stringify(identity(st)) === JSON.stringify(was), `${t} play again: seats ${JSON.stringify(identity(st))}, were ${JSON.stringify(was)}`);
        console.log(`${t}: played to the win in ${r.steps} moves; seat order ${order}, winner seat ${winner.seat}; play again order ${st.players.map((p) => p.seat).join(",")}`);
      }
    }
    await ctx.close();
    console.log(`${tag}: done`);
  }
  check(errors.length === 0, `page errors: ${errors.join(" | ")}`);
  if (failures.length) throw new Error(`${failures.length} failed:\n${failures.join("\n")}`);
  console.log("paired-hud-prove: all passed");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
