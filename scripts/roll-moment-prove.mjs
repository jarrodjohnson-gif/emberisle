// #440: each roll is shown once, big and centred, then the dice settle into the HUD. Practice versus the isle at 1280x720
// and 390x844 (touch), played to the person's first roll through the real roll-off and setup:
// - the person's roll (a real click on Roll): within 200 ms a [data-testid=roll-moment] is visible, its centre within
//   ±10 % of the viewport width of the middle, the sum's computed font-size ≥ 48 px, and the resting dice row is hidden
//   (the sum is on screen once);
// - after 900 ms it shrinks into the resting dice row: one 220 ms flight whose last keyframe puts the chip on the row (centre
//   within 4 px, one side matching), and at 1400 ms (wall clock) the moment is gone and the row shows the same faces; no
//   element spells the roll out a second time (the banner and the log line carry no dice numbers);
// - every roll of the game, the person's and the bots', shows exactly one moment and one screen-reader line;
// - a key press skips a moment at once, and so does a tap on the touch viewport; the press still reaches the page;
// - online seats and watchers mount a table with loadState and get rolls as pushed states: a table loaded with dice on it
//   shows nothing, one roll on shows one moment (a 7 in accent-ink, read out by name), a jump of two rolls shows none.
// Hotseat at 1280x720: a seat's roll shows one moment and is read out by the seat's name, not "You".
// Reduced motion at 1280x720: the moment still shows centred and large, with no entry animation and no flight; it is
// gone by 1400 ms and the row shows the faces. Zero console errors throughout.
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

// CI renders the island with software GL, where one frame can take a long time; a wait gets this long.
const STEP_MS = 20_000;

const PORT = Number(process.env.ROLL_PORT || process.env.VITE_PORT) || 8440;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
let failures = 0;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

function check(ok, label) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures++;
}

// Installed before the app loads: every appearance and removal of the moment, measured the moment it mounts; every
// flight it takes, with where it started, where the row was, and where its last frame put it; every roll read out.
function recorders() {
  window.__moments = [];
  window.__flights = [];
  window.__said = [];
  let current = null;
  let said = "";
  // Visible elements that show the sum as a bare number, or spell a roll out ("4+5"), outside the hand, seats and header.
  window.__sumShown = (sum) => {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.children.length) continue;
      const t = (el.textContent ?? "").trim();
      if (t !== String(sum) && !/\b\d\+\d\b/.test(t)) continue;
      if (el.closest('header, aside, [data-testid^="resource-"], [data-testid^="seat-"], [data-testid^="trade-"], [data-testid="turn-countdown"]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1 || !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      out.push(el.dataset.testid ?? el.parentElement?.dataset.testid ?? el.tagName);
    }
    return out;
  };
  const watch = () => {
    const m = document.querySelector('[data-testid="roll-moment"]');
    if (m && m !== current) {
      current = m;
      const sumEl = m.querySelector('[data-testid="roll-sum"]');
      const r = m.getBoundingClientRect();
      const row = document.querySelector('[data-testid="dice-row"]');
      const sum = Number(sumEl.textContent);
      window.__moments.push({
        at: performance.now(),
        n: window.__emberisle?.getState().state?.rolls,
        dice: [...m.querySelectorAll('[data-testid="die"]')].map((d) => Number(d.dataset.value)),
        sum,
        centreX: r.left + r.width / 2,
        centreY: r.top + r.height / 2,
        vw: innerWidth,
        vh: innerHeight,
        fontSize: parseFloat(getComputedStyle(sumEl).fontSize),
        sumColor: getComputedStyle(sumEl).color,
        animation: getComputedStyle(m).animationName,
        rowHidden: row ? getComputedStyle(row).visibility === "hidden" : null,
        shown: window.__sumShown(sum),
      });
    } else if (!m && current) {
      current = null;
      window.__moments.at(-1).gone = performance.now();
    }
    const t = document.querySelector('[data-testid="announce-roll"]')?.textContent ?? "";
    if (t && t !== said) window.__said.push(t);
    said = t;
  };
  new MutationObserver(watch).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    const a = animate.call(this, keyframes, options);
    if (this.dataset?.testid === "roll-moment") {
      // Where the last keyframe puts the chip: its layout box (no transform) moved and scaled about its centre.
      const box = this.offsetParent.getBoundingClientRect();
      const w = this.offsetWidth;
      const h = this.offsetHeight;
      const m = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\) scale\(([\d.e-]+)\)/.exec(keyframes.at(-1).transform);
      const [dx, dy, k] = m ? m.slice(1).map(Number) : [NaN, NaN, NaN];
      const cx = box.left + this.offsetLeft + w / 2 + dx;
      const cy = box.top + this.offsetTop + h / 2 + dy;
      window.__flights.push({
        start: performance.now(),
        duration: options.duration,
        from: { width: w, height: h },
        landed: { left: cx - (w * k) / 2, top: cy - (h * k) / 2, width: w * k, height: h * k },
        row: document.querySelector('[data-testid="dice-row"]').getBoundingClientRect().toJSON(),
      });
    }
    return a;
  };
}

async function open(viewport, { reduced = false, touch = false } = {}) {
  const page = await browser.newPage({ viewport, hasTouch: touch, isMobile: touch, reducedMotion: reduced ? "reduce" : "no-preference" });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.addInitScript(recorders);
  await page.goto(`http://127.0.0.1:${PORT}/`);
  return page;
}

// Plays the person's seat (roll-off, setup corners and paths, then the AI's own choice for a wayfarer or discard, and No
// to any offer) until `until` holds; the bots play on the app's timer.
async function playUntil(page, until) {
  const ok = await page.evaluate(async (until) => {
    const { chooseBotAction } = await import("/src/lib/game/ai.ts");
    const done = new Function("s", `return (${until})(s)`);
    const g = window.__emberisle;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 600; i++) {
      const s = g.getState();
      if (done(s)) return true;
      const st = s.state;
      if (s.offer && s.offer.from !== s.localId) s.answerTrade(false);
      const me = s.mode === "hotseat" ? st.current : s.localId;
      if (st.current === me || (st.discardNeeded?.[me] ?? 0) > 0) {
        if (st.phase === "rollOff") s.dispatch({ type: "roll" });
        else if (st.phase.startsWith("setup")) {
          const h = s.highlights();
          if (h.vertices.length) s.pickVertex(h.vertices[0]);
          else if (h.edges.length) s.pickEdge(h.edges[0]);
        } else if (st.phase === "main") s.dispatch({ type: "endTurn" });
        else if (st.phase !== "roll") {
          const a = chooseBotAction(st, me);
          if (a) s.dispatch(a, me);
        }
      }
      await sleep(150);
    }
    return false;
  }, until.toString());
  if (!ok) throw new Error(`stuck before ${until}: ${await page.evaluate(() => window.__emberisle.getState().state.phase)}`);
}

const myRoll = (s) => s.state.phase === "roll" && s.state.current === (s.mode === "hotseat" ? s.state.current : s.localId);

// The person clicks Roll; returns the roll's dice and when the store took the roll, on the page's clock.
async function clickRoll(page) {
  await page.evaluate(() => {
    window.__rolledAt = null;
    const un = window.__emberisle.subscribe((s, p) => {
      if ((s.state?.rolls ?? 0) === (p.state?.rolls ?? 0)) return;
      window.__rolledAt = performance.now();
      un();
    });
  });
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await page.waitForFunction(() => window.__rolledAt, null, { timeout: STEP_MS });
  return page.evaluate(() => ({ t0: window.__rolledAt, dice: window.__emberisle.getState().state.dice }));
}

async function settleChecks(page, tag, { t0, dice }, { reduced = false } = {}) {
  const sum = dice[0] + dice[1];
  await page.waitForFunction((t0) => performance.now() - t0 >= 1400, t0, { timeout: STEP_MS, polling: 50 });
  const m = await page.evaluate(() => window.__moments.at(-1));
  const flights = await page.evaluate((t0) => window.__flights.filter((f) => f.start > t0), t0);
  const late = await page.evaluate((sum) => ({
    moment: !!document.querySelector('[data-testid="roll-moment"]'),
    row: [...document.querySelectorAll('[data-testid="dice-row"] [data-testid="die"]')].map((d) => Number(d.dataset.value)),
    rowVisible: document.querySelector('[data-testid="dice-row"]')?.checkVisibility({ visibilityProperty: true }) ?? false,
    shown: window.__sumShown(sum),
    banner: document.querySelector('[data-testid="banner"]')?.textContent ?? null,
    log: document.querySelector('[data-testid="log-line"]')?.textContent ?? null,
  }), sum);
  const appeared = m.at - t0;
  console.log(`${tag}: rolled ${dice.join("+")}=${sum}; moment after ${appeared.toFixed(0)} ms, gone ${(m.gone - t0).toFixed(0)} ms after the roll, centre ${m.centreX.toFixed(0)}/${m.vw}, sum ${m.fontSize}px ${m.sumColor}, animation ${m.animation}; shown then ${JSON.stringify(m.shown)}, at 1400 ms ${JSON.stringify(late.shown)}; banner ${JSON.stringify(late.banner)}`);
  check(appeared <= 200, `${tag}: the moment is up ${appeared.toFixed(0)} ms after the click (≤ 200)`);
  check(m.dice.join() === dice.join() && m.sum === sum, `${tag}: the moment shows the rolled faces ${m.dice} and sum ${m.sum}`);
  check(Math.abs(m.centreX - m.vw / 2) <= m.vw * 0.1, `${tag}: centred horizontally (${m.centreX.toFixed(0)} of ${m.vw}, ±10 %)`);
  check(Math.abs(m.centreY - m.vh / 2) <= m.vh * 0.1, `${tag}: centred vertically (${m.centreY.toFixed(0)} of ${m.vh}, ±10 %)`);
  check(m.fontSize >= 48, `${tag}: the sum is ${m.fontSize}px (≥ 48)`);
  check(m.sumColor === (sum === 7 ? "rgb(169, 75, 48)" : "rgb(28, 25, 21)"), `${tag}: the sum is ${sum === 7 ? "accent-ink on a 7" : "ink"} (${m.sumColor})`);
  check(m.rowHidden === true && m.shown.length === 1 && m.shown[0] === "roll-sum", `${tag}: while it is up the roll is on screen once (${JSON.stringify(m.shown)})`);
  check(!late.moment && m.gone - t0 <= 1400, `${tag}: gone at 1400 ms (${(m.gone - t0).toFixed(0)} ms)`);
  check(late.rowVisible && late.row.join() === dice.join(), `${tag}: the resting row shows the same faces (${late.row})`);
  check(late.shown.length === 1 && late.shown[0] === "dice-row", `${tag}: at 1400 ms the sum is on screen once, in the row (${JSON.stringify(late.shown)})`);
  check(!/\b\d\+\d\b/.test(late.banner ?? "") && !/\b\d\+\d\b/.test(late.log ?? ""), `${tag}: neither the banner nor the log line repeats the dice`);
  if (reduced) {
    check(flights.length === 0, `${tag}: reduced motion, no flight (${flights.length})`);
    check(m.animation === "none", `${tag}: reduced motion, no entry animation (${m.animation})`);
    return;
  }
  const f = flights[0];
  const c = (r) => [r.left + r.width / 2, r.top + r.height / 2];
  const off = f?.landed ? Math.hypot(c(f.landed)[0] - c(f.row)[0], c(f.landed)[1] - c(f.row)[1]) : Infinity;
  const fits = f?.landed && f.landed.width <= f.row.width + 1 && f.landed.height <= f.row.height + 1 &&
    (Math.abs(f.landed.width - f.row.width) <= 2 || Math.abs(f.landed.height - f.row.height) <= 2);
  console.log(`${tag}: flight ${JSON.stringify(f && { after: (f.start - m.at).toFixed(0), from: [f.from.width, f.from.height], landed: [f.landed.width.toFixed(1), f.landed.height.toFixed(1)], row: [f.row.width.toFixed(1), f.row.height.toFixed(1)], off: off.toFixed(1) })}`);
  check(flights.length === 1 && f.duration === 220 && f.start - m.at >= 880, `${tag}: one 220 ms flight after the 900 ms hold`);
  check(off <= 4 && fits, `${tag}: the flight lands on the resting row (centre off ${off.toFixed(1)} px, size fits)`);
  check(f && f.from.width > f.row.width * 1.5, `${tag}: it starts large and shrinks into the row (${f?.from.width.toFixed(0)} → ${f?.row.width.toFixed(0)} px)`);
}

async function practice(viewport, touch) {
  const tag = `practice ${viewport.width}x${viewport.height}`;
  const page = await open(viewport, { touch });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await playUntil(page, myRoll);
  // The roll-off and setup roll no pair of dice, so nothing has shown unless a bot has already rolled.
  const early = await page.evaluate(() => ({ rolls: window.__emberisle.getState().state.rolls ?? 0, moments: window.__moments.length }));
  check(early.moments === early.rolls, `${tag}: through the roll-off and setup, one moment per bot roll and no other (${early.moments} for ${early.rolls})`);
  const mine = early.rolls + 1;
  await settleChecks(page, `${tag} your roll`, await clickRoll(page));

  // Every bot rolls once more: one moment and one line read out for every roll of the game, the person's and the bots'.
  await page.evaluate((n) => (window.__until = n), mine + 3);
  await playUntil(page, (s) => (s.state.rolls ?? 0) >= window.__until && !document.querySelector('[data-testid="roll-moment"]'));
  const tally = await page.evaluate(() => {
    const s = window.__emberisle.getState();
    return { rolls: s.state.rolls, moments: window.__moments.map((m) => m.n), said: window.__said, names: s.state.players.map((p) => p.name) };
  });
  console.log(`${tag}: ${tally.rolls} rolls, moments for rolls ${JSON.stringify(tally.moments)}, read out ${JSON.stringify(tally.said)}`);
  const expected = Array.from({ length: tally.rolls }, (_, i) => i + 1);
  check(tally.moments.join() === expected.join(), `${tag}: exactly one moment per roll, the person's and the bots' (${tally.moments.length} for ${tally.rolls})`);
  const byName = tally.said.every((t, i) => (i + 1 === mine ? t.startsWith("You rolled ") : tally.names.some((n) => t.startsWith(`${n} rolled `))));
  check(tally.said.length === tally.rolls && byName, `${tag}: each roll read out once, "You" for the person's, the name for a bot's`);

  // Skipping: a key on the desktop, a tap on the touch viewport; either ends the moment at once and still reaches the page.
  await playUntil(page, myRoll);
  const { t0 } = await clickRoll(page);
  await page.waitForSelector('[data-testid="roll-moment"]', { timeout: STEP_MS });
  await page.evaluate(() => {
    window.__pressed = 0;
    document.addEventListener(navigator.maxTouchPoints ? "pointerdown" : "keydown", () => window.__pressed++);
  });
  const pressAt = await page.evaluate(() => performance.now());
  if (touch) await page.touchscreen.tap(viewport.width - 20, viewport.height / 2);
  else await page.keyboard.press("Shift");
  await page.waitForSelector('[data-testid="roll-moment"]', { state: "detached", timeout: STEP_MS });
  const skip = await page.evaluate(({ t0 }) => ({ m: window.__moments.at(-1), pressed: window.__pressed, flights: window.__flights.filter((f) => f.start > t0).length }), { t0 });
  const skipped = skip.m.gone - pressAt;
  console.log(`${tag}: ${touch ? "tap" : "key"} skip, gone ${skipped.toFixed(0)} ms after the press, page heard it ${skip.pressed}×`);
  check(skipped < 300 && skip.flights === 0 && skip.pressed === 1, `${tag}: a ${touch ? "tap" : "key press"} skips the moment and still reaches the page`);
  check(await page.getByTestId("dice-row").isVisible(), `${tag}: after a skip the resting row shows`);

  // Online seats and watchers mount a table from the host's state and get each roll as a pushed state (the store's
  // loadState and state message). A table loaded with dice already on it shows nothing; one roll on shows one moment,
  // read out by name to a watcher; a jump of two rolls shows none.
  const pushed = await page.evaluate(async () => {
    const g = window.__emberisle;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const saved = structuredClone(g.getState().state);
    const roller = saved.players.find((p) => p.id === saved.current).name;
    g.getState().goTitle();
    await sleep(300);
    const before = window.__moments.length;
    const saidBefore = window.__said.length;
    g.getState().loadState(saved, "p0", false, "TEST");
    g.setState({ spectator: true });
    await sleep(1200);
    const loaded = window.__moments.length - before;
    const push = (k, dice) => {
      const st = structuredClone(g.getState().state);
      st.rolls = (st.rolls ?? 0) + k;
      st.dice = dice;
      st.seq += 1;
      g.setState({ state: st });
    };
    push(1, [6, 1]);
    await sleep(100);
    const one = window.__moments.length - before - loaded;
    const seven = window.__moments.at(-1);
    await sleep(1400);
    push(2, [2, 2]);
    await sleep(1400);
    return { loaded, one, jump: window.__moments.length - before - loaded - one, seven: seven?.sum, color: seven?.sumColor, said: window.__said.slice(saidBefore), roller };
  });
  console.log(`${tag}: pushed states ${JSON.stringify(pushed)}`);
  check(pushed.loaded === 0, `${tag}: a table loaded with dice already on it shows no moment`);
  check(pushed.one === 1 && pushed.jump === 0, `${tag}: a pushed roll shows one moment, a jump of two rolls none`);
  check(pushed.seven === 7 && pushed.color === "rgb(169, 75, 48)", `${tag}: a 7 shows in accent-ink`);
  check(pushed.said.length === 1 && pushed.said[0] === `${pushed.roller} rolled 6 and 1: 7.`, `${tag}: a watcher hears the roll once, by the roller's name`);
  await page.close();
}

async function hotseat() {
  const tag = "hotseat 1280x720";
  const page = await open({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Four seats, one table" }).click();
  await playUntil(page, myRoll);
  const roll = await clickRoll(page);
  await settleChecks(page, tag, roll);
  const said = await page.evaluate(() => ({ said: window.__said, name: window.__emberisle.getState().state.players.find((p) => p.id === window.__emberisle.getState().state.current).name }));
  check(said.said.length === 1 && said.said[0].startsWith(`${said.name} rolled ${roll.dice[0]} and ${roll.dice[1]}`), `${tag}: read out once by the seat's name (${JSON.stringify(said.said)})`);
  await page.close();
}

async function reduced() {
  const tag = "reduced motion 1280x720";
  const page = await open({ width: 1280, height: 720 }, { reduced: true });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await playUntil(page, myRoll);
  await settleChecks(page, tag, await clickRoll(page), { reduced: true });
  await page.close();
}

try {
  await practice({ width: 1280, height: 720 }, false);
  await practice({ width: 390, height: 844 }, true);
  await hotseat();
  await reduced();
  check(errors.length === 0, `zero console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
  await vite.close();
}
console.log(failures ? `roll-moment-prove: ${failures} failed` : "roll-moment-prove: all passed");
process.exit(failures ? 1 : 0);
