// #1140 (owner: "A lot of people play with sound off, you don't know if it's your turn"; on #1149: "just keep the old your turn
// but perhaps lead it on, pulsing ... so it goes away when you click screen"). TurnMoment (data-testid="turn-moment"): the centre
// "Your turn" pill with the seat's dot. Online and in practice it stays up, pulsing slowly, until a press or key, the move passing
// on (rolling, placing, the turn going elsewhere) or an 8 s cap; hotseat keeps its timed "<name>'s turn" on a roll.
// - Online, over a scripted socket (page.routeWebSocket) at 390x844, once as each of the four seats: it appears once when the turn
//   arrives and stays; a repeat state push of the same move adds none; a tap, a key, the person acting and the turn passing on
//   each end it; another seat's turn, a bot's turn, a watcher's table, a first load onto an own roll and a rejoin onto an own roll
//   show none, and a live turn after the rejoin shows one; roll-off, tied rethrows and setup show none;
//   the dot is the seat's colour; untouched it leaves at its
//   8 s cap (first seat).
// - Practice (real roll-off, setup and turns against three bots) at 320x568, 390x844, 844x390 and 1280x720, with safe-area insets
//   emulated over CDP, in two seat colours (red, ivory): a moment at every roll, none during roll-off or setup
//   after a settlement; text 15 px or larger, ink at least 4.5:1 on its pill, a slow pulse (1.6 s, opacity 0.92 to 1), the dot the
//   seat's colour, inside the safe area, over no HUD box (header row, seat strip, seat rail, bottom stack, status line, resource
//   tabs), and it takes no tap: pointer-events none, nothing of it on top at its centre, and a real click on Roll goes through
//   and ends it. Mid-pulse and after-a-tap screenshots go to docs/proofs/1140/ (SHOTS=1) and test-results/.
// - Reduced motion at 1280x720: no animation at all, a steady pill, still ended by a tap.
// - Hotseat: only "<name>'s turn" on rolls (nothing in the roll-off or setup), timed, gone within 2.5 s untouched.
// Zero console errors. Run: npm run your-turn-stay-prove (ONLY=online, practice, reduced or hotseat runs one part; SHOTS=1 writes
// docs/proofs/1140). Port from VITE_PORT, default 8485.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const STEP_MS = 30_000;
const PORT = Number(process.env.VITE_PORT) || 8485;
const SHOTS = !!process.env.SHOTS;
const SHOT_DIR = "docs/proofs/1140";
const VIEWS = [
  { width: 320, height: 568, touch: true, insets: { top: 24, right: 0, bottom: 16, left: 0 } },
  { width: 390, height: 844, touch: true, insets: { top: 47, right: 0, bottom: 34, left: 0 } },
  { width: 844, height: 390, touch: true, insets: { top: 0, right: 47, bottom: 21, left: 47 } },
  { width: 1280, height: 720 },
];
const SEATS = [["red", "#e23d2e"], ["ivory", "#f3ecd9"]];
mkdirSync("test-results", { recursive: true });
if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
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

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const rgbHex = (css) => "#" + css.match(/\d+/g).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// Installed before the app. Every banner that mounts is recorded with the store as it was; the box and the boxes it must stay
// clear of are measured with the animation paused at its steady part (no transform), the way a player sees it held.
function recorders() {
  window.__yt = [];
  window.__exits = [];
  const exiting = new Map();
  new MutationObserver((records) => {
    for (const record of records) {
      const el = record.target;
      if (record.type !== "attributes" || !el.matches?.('[data-testid="turn-moment"][data-leaving]') || exiting.has(el)) continue;
      const css = getComputedStyle(el);
      const entry = { at: performance.now(), pointer: css.pointerEvents, hidden: el.parentElement?.getAttribute("aria-hidden"),
        animation: css.animationName, duration: css.transitionDuration, easing: css.transitionTimingFunction };
      exiting.set(el, entry);
      window.__exits.push(entry);
      setTimeout(() => { if (el.isConnected) { const mid = getComputedStyle(el); entry.mid = { opacity: Number(mid.opacity), transform: mid.transform, target: el.style.transform }; } }, 80);
    }
    for (const [el, entry] of exiting) if (!el.isConnected) { entry.gone = performance.now(); exiting.delete(el); }
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-leaving"] });
  const OBSTACLES = 'header > div, [data-testid="seat-strip"] > *, [data-testid^="rail-"], [data-hud-stack], [data-testid="banner"], [data-testid="turn-banner"], .hud-utilities, [data-testid="resource-flash"]';
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const seen = new WeakSet();
  const note = (el) => {
    if (seen.has(el)) return;
    seen.add(el);
    const g = window.__emberisle?.getState();
    const st = g?.state;
    const rec = { at: performance.now(), text: el.textContent, phase: st?.phase, seq: st?.seq, turn: st?.turn, current: st?.current, setupIndex: st?.setupIndex };
    window.__yt.push(rec);
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      const cs = getComputedStyle(el);
      rec.bg = cs.backgroundColor;
      rec.dot = getComputedStyle(el.firstElementChild).backgroundColor;
      rec.paint = { border: cs.borderWidth, borderColor: cs.borderColor, radius: cs.borderRadius, shadow: cs.boxShadow,
        padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft], lineHeight: cs.lineHeight,
        weight: cs.fontWeight, letterSpacing: cs.letterSpacing, backdrop: cs.backdropFilter,
        dotWidth: getComputedStyle(el.firstElementChild).width, dotBorder: getComputedStyle(el.firstElementChild).borderWidth,
        dotBorderColor: getComputedStyle(el.firstElementChild).borderColor };
      rec.color = cs.color;
      rec.font = parseFloat(cs.fontSize);
      rec.pe = cs.pointerEvents;
      rec.anim = el.getAnimations().map((a) => ({ name: a.animationName, dur: a.effect.getTiming().duration }));
      // Steady part of the pulse (its start, scale 1), so the box is the pill's own.
      for (const a of el.getAnimations()) {
        a.pause();
        a.currentTime = 220;
      }
      const b = box(el);
      rec.box = b;
      const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
      rec.top = document.elementFromPoint(cx, cy)?.closest('[data-testid="turn-moment"]') ? "banner" : "other";
      rec.over = [...document.querySelectorAll(OBSTACLES)]
        .filter((o) => !o.closest('[data-testid="turn-moment"]'))
        .map((o) => [o, box(o)])
        .filter(([, r]) => r.height > 1 && r.width > 1 && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top)
        .map(([o, r]) => `${o.tagName.toLowerCase()}[${o.dataset.testid || o.className.toString().slice(0, 30)}] ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`);
      rec.vp = { w: innerWidth, h: innerHeight };
      rec.hole = box(el.parentElement);
      for (const a of el.getAnimations()) a.play();
    });
  };
  new MutationObserver(() => document.querySelectorAll('[data-testid="turn-moment"]').forEach(note)).observe(document, { childList: true, subtree: true });
}

async function open(view, { reduced = false, before, path = "/", color } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    hasTouch: !!view.touch,
    isMobile: !!view.touch,
    deviceScaleFactor: 1,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  const tag = `${view.width}x${view.height}${reduced ? " reduced" : ""}${color ? " " + color[0] : ""}`;
  page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
  if (view.insets) await (await ctx.newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets: view.insets });
  await page.addInitScript(recorders);
  await before?.(ctx, page);
  await page.goto(`http://127.0.0.1:${PORT}${path}`);
  return { ctx, page, tag };
}

// Plays the person's seat until `until` holds: roll-off, the first legal setup marks, End turn in main, the AI's own pick for a
// wayfarer or a discard, No to any ask. It rolls the dice itself only when `roll` is set.
async function playUntil(page, until, roll = false) {
  const ok = await page.evaluate(async ({ until, roll }) => {
    const { chooseBotAction } = await import("/src/lib/game/ai.ts");
    const done = new Function("s", `return (${until})(s)`);
    const g = window.__emberisle;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 900; i++) {
      const s = g.getState();
      if (s.state && done(s)) return true;
      const st = s.state;
      if (!st) {
        await sleep(100);
        continue;
      }
      if (s.offer && s.offer.from !== s.localId) s.answerTrade(false);
      const me = s.mode === "hotseat" ? st.current : s.localId;
      if (st.current === me || (st.discardNeeded?.[me] ?? 0) > 0) {
        if (st.phase === "rollOff") s.dispatch({ type: "roll" });
        else if (st.phase.startsWith("setup")) {
          const h = s.highlights();
          if (h.vertices.length) s.pickVertex(h.vertices[0]);
          else if (h.edges.length) s.pickEdge(h.edges[0]);
        } else if (st.phase === "main") s.dispatch({ type: "endTurn" });
        else if (st.phase === "roll") {
          if (roll) s.dispatch({ type: "roll" });
        } else {
          const a = chooseBotAction(st, me);
          if (a) s.dispatch(a, me);
        }
      }
      await sleep(120);
    }
    return false;
  }, { until: until.toString(), roll });
  if (!ok) throw new Error(`stuck before ${until}: ${JSON.stringify(await page.evaluate(() => { const s = window.__emberisle.getState(); return { phase: s.state?.phase, current: s.state?.current, localId: s.localId }; }))}`);
}
const myRoll = (s) => s.state.phase === "roll" && s.state.current === s.localId && s.state.turn >= 2;
const bannerCount = (page) => page.evaluate(() => window.__yt.length);

// What one recorded banner must satisfy anywhere: the words, the seat's colour, 15 px, 4.5:1, no tap taken.
function readable(tag, label, rec, seatHex) {
  check((rec.text === "Your turn" || /\'s turn$/.test(rec.text)), `${tag} ${label}: reads "Your turn"`, rec.text);
  if (seatHex) check(rgbHex(rec.dot) === seatHex, `${tag} ${label}: the dot is the seat's colour`, [rec.dot, seatHex]);
  check(rec.font >= 15, `${tag} ${label}: text is 15 px or larger`, rec.font);
  check(rec.bg === "rgb(255, 255, 255)" && rec.paint.border === "1px" && rec.paint.borderColor === "rgb(203, 211, 211)" && rec.paint.radius === "20px", `${tag} ${label}: white pill has the approved edge and radius`, rec.paint);
  check(rec.paint.weight === "700" && rec.paint.letterSpacing === "-0.8px" && rec.paint.backdrop === "none" && rec.paint.dotBorder === "2px" && rec.paint.dotBorderColor === "rgb(38, 61, 60)", `${tag} ${label}: approved text and ink-ringed seat dot`, rec.paint);
  const narrow = rec.vp.w < 360;
  check(rec.font === (narrow ? 20 : 28) && rec.paint.lineHeight === "32px" && rec.paint.dotWidth === (narrow ? "16px" : "20px") && rec.paint.padding.join(",") === (narrow ? "12px,20px,12px,20px" : "16px,24px,16px,24px") && rec.paint.shadow.includes("0px 10px 28px"), `${tag} ${label}: approved sizing, padding and sheet shadow`, rec.paint);
  const c = contrast(rgbHex(rec.color), rgbHex(rec.bg));
  check(c >= 4.5, `${tag} ${label}: ink on the pill reads at 4.5:1 or better`, c.toFixed(2));
  check(rec.pe === "none" && rec.top === "other", `${tag} ${label}: takes no pointer events and nothing is blocked at its centre`, [rec.pe, rec.top]);
}

const MOMENT = '[data-testid="turn-moment"]';
const up = (page) => page.locator(MOMENT).count();
// A press anywhere (the moment takes no pointer events, so it lands on what is under it).
const tap = (page) => page.mouse.click(5, 5);

// The pulse, sampled by pausing it: at its start (peak) and half a period on (trough), then put back.
async function pulse(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="turn-moment"]');
    const all = el.getAnimations();
    const a = all.find((x) => x.animationName === "turn-pulse");
    if (!a) return { names: all.map((x) => x.animationName) };
    const t = a.effect.getTiming();
    const at = (ms) => {
      for (const x of all) { x.pause(); x.currentTime = ms; }
      const cs = getComputedStyle(el);
      return { o: Number(cs.opacity), tf: cs.transform };
    };
    const peak = at(t.delay + 0), trough = at(t.delay + t.duration / 2);
    for (const x of all) x.play();
    return { names: all.map((x) => x.animationName), duration: t.duration, iterations: t.iterations, peak, trough };
  });
}
const scale = (tf) => (tf === "none" ? 1 : Number(tf.match(/matrix\(([-\d.]+)/)[1]));

async function online(me, { cap = false } = {}) {
  const view = VIEWS[1];
  const sent = { welcomes: 0 };
  let states = [];
  let sockets = [];
  const { ctx, page, tag } = await open(view, {
    path: "/?host=ws://127.0.0.1:9",
    before: async (ctx, page) => {
      await ctx.addInitScript(() => localStorage.setItem("emberisle-seat", JSON.stringify({ code: "ABCD", secret: "s3cret" })));
      await page.routeWebSocket("ws://127.0.0.1:9/", (ws) => {
        sockets.push(ws);
        ws.onMessage(async (raw) => {
          if (JSON.parse(String(raw)).type !== "hello") return;
          sent.welcomes++;
          ws.send(JSON.stringify({ type: "welcome", code: "ABCD", you: me, host: false, secret: "s3cret", chat: [] }));
          while (!states.length) await new Promise((r) => setTimeout(r, 20));
          ws.send(JSON.stringify(states.shift()));
        });
      });
    },
  });
  const tg = `${tag} online ${me}`;
  const legal = { outpost: [], path: [], stronghold: [], wayfarer: [], steal: {}, discard: 0, actions: [] };
  try {
    const base = await page.evaluate(async () => {
      const { createGame } = await import("/src/lib/game/board.ts");
      return createGame({ seed: 7, humans: [{ name: "Me" }], bots: 3 });
    });
    const seatHex = base.players.find((p) => p.id === me).color;
    let seq = 20;
    const at = (patch) => ({ type: "state", you: me, legal, game: { ...base, ...patch, seq: ++seq } });
    const push = (m) => sockets.at(-1).send(JSON.stringify(m));
    const loaded = () => page.waitForFunction((n) => window.__emberisle.getState().state?.seq === n, seq, { timeout: STEP_MS });
    // Nothing new shows for a while after the state has loaded.
    const stays = async (label, n0) => {
      await loaded();
      await page.waitForTimeout(700);
      const now = { mounts: await bannerCount(page), up: await up(page) };
      check(now.mounts === n0 && now.up === 0, `${tg} ${label}: no moment`, now);
    };
    const gone = (ms = 1000) => page.waitForFunction(() => !document.querySelector('[data-testid="turn-moment"]'), null, { timeout: ms });
    const shows = (n) => page.waitForFunction((n) => window.__yt.length === n && document.querySelector('[data-testid="turn-moment"]'), n, { timeout: STEP_MS });
    const faded = async (label) => {
      const exit = await page.evaluate(() => window.__exits.at(-1));
      check(exit?.gone - exit?.at >= 140 && exit?.gone - exit?.at < 1000 && exit?.pointer === "none" && exit?.hidden === "true" && exit?.animation === "none" && exit?.duration.split(", ").every(v => v === "0.16s") && exit?.easing === "cubic-bezier(0.4, 0, 1, 1), cubic-bezier(0.4, 0, 1, 1)" && exit?.mid?.target === "scale(0.97)" && exit?.mid?.opacity > 0 && exit?.mid?.opacity < 1, `${tg} ${label}: pointer-transparent 160 ms fade`, exit);
    };
    const notMe = base.players.find((p) => p.id !== me).id;

    // A first load onto a move under way (the baseline) shows nothing, not even on the person's own roll.
    states = [{ type: "state", you: me, legal, game: { ...base, seq: 20, turn: 2, phase: "roll", current: me } }];
    await page.waitForFunction(() => window.__emberisle?.getState().state?.seq === 20, null, { timeout: STEP_MS });
    await page.waitForTimeout(700);
    check((await bannerCount(page)) === 0, `${tg} first load onto own roll at seq 20: no moment`);

    // Another seat's move, and a bot's, show none.
    push(at({ turn: 2, phase: "main", current: me }));
    push(at({ turn: 2, phase: "main", current: notMe }));
    await stays("a bot's turn", 0);

    // The turn arrives: one moment, with the seat's dot, and it stays.
    push(at({ turn: 3, phase: "roll", current: me }));
    await shows(1);
    await page.waitForFunction(() => window.__yt[0]?.bg, null, { timeout: STEP_MS });
    readable(tg, "the turn arrives", await page.evaluate(() => window.__yt[0]), seatHex);
    const t0 = Date.now();
    push(at({ turn: 3, phase: "roll", current: me }));
    push(at({ turn: 3, phase: "roll", current: me }));
    await loaded();
    await page.waitForTimeout(2600);
    check((await bannerCount(page)) === 1 && (await up(page)) === 1, `${tg} repeat pushes add none, and it is still up 2.6 s later (no timed fade)`, [await bannerCount(page), await up(page)]);
    if (cap) {
      await gone(9000);
      const held = Date.now() - t0;
      check(held >= 7500 && held <= 8800, `${tg} untouched, it leaves at its 8 s cap (timed from just after it mounted)`, held);
      await faded("8 s cap");
      push(at({ turn: 3, phase: "roll", current: me }));
      await stays("a repeat push after the cap", 1);
      push(at({ turn: 4, phase: "roll", current: me }));
      await shows(2);
      await tap(page);
      await gone();
    } else {
      const p = await pulse(page);
      check(p.names.includes("turn-pulse") && p.duration === 1600 && p.iterations === Infinity, `${tg} it pulses slowly, 1.6 s, for as long as it is up`, p);
      check(p.trough.o >= 0.9 && p.trough.o <= 0.95 && p.peak.o === 1 && scale(p.trough.tf) >= 0.95 && scale(p.trough.tf) < 1 && scale(p.peak.tf) === 1, `${tg} the pulse runs opacity 1 to 0.92 and scale 1 to 0.96`, p);
      const exitCount = await page.evaluate(() => window.__exits.length);
      await tap(page);
      await tap(page); // A second tap during the exit must not restart it.
      await gone();
      const exits = await page.evaluate((n) => window.__exits.slice(n), exitCount);
      const exit = exits[0];
      check(exits.length === 1 && exit?.gone - exit?.at >= 140 && exit?.gone - exit?.at < 1000 && exit?.pointer === "none" && exit?.hidden === "true" && exit?.animation === "none" && exit?.duration.split(", ").every(v => v === "0.16s") && exit?.easing === "cubic-bezier(0.4, 0, 1, 1), cubic-bezier(0.4, 0, 1, 1)" && exit?.mid?.target === "scale(0.97)" && exit?.mid?.opacity > 0 && exit?.mid?.opacity < 1, `${tg} two taps produce one pointer-transparent 160 ms fade`, exits);
      await stays("after the tap", 1);
      push(at({ turn: 4, phase: "roll", current: me }));
      await shows(2);
      await page.keyboard.press("Shift");
      await gone();
      check(true, `${tg} a key press ends it`);
    }
    push(at({ turn: 4, phase: "roll", current: me }));
    await stays("a repeat push after it left", 2);

    // The person acting ends it (Roll), and so does the turn passing on.
    push(at({ turn: 5, phase: "roll", current: me }));
    await shows(3);
    push(at({ turn: 5, phase: "main", current: me }));
    await gone();
    check(true, `${tg} the person rolling ends it`);
    await faded("roll");
    push(at({ turn: 6, phase: "roll", current: me }));
    await shows(4);
    push(at({ turn: 6, phase: "main", current: notMe }));
    await gone();
    check(true, `${tg} the turn passing on ends it`);
    await faded("turn passing on");

    // Spectators never get one: a watcher is no seat.
    await page.evaluate(() => window.__emberisle.setState({ spectator: true }));
    push(at({ turn: 7, phase: "roll", current: me }));
    await stays("a watcher", 4);
    push(at({ turn: 7, phase: "main", current: notMe }));
    await stays("the watcher's table moving on", 4);
    await page.evaluate(() => window.__emberisle.setState({ spectator: false }));

    // A drop and a rejoin onto the person's own move under way: none. A live turn after it: one.
    states = [at({ turn: 8, phase: "roll", current: me })];
    sockets.at(-1).close();
    await page.waitForFunction(() => /Reconnecting/.test(window.__emberisle.getState().error ?? ""), null, { timeout: STEP_MS });
    await page.waitForFunction((n) => window.__emberisle.getState().state?.seq === n, seq, { timeout: STEP_MS });
    check(sent.welcomes === 2, `${tg} the seat was re-welcomed through the redial`, sent);
    await stays("a rejoin onto own roll", 4);
    push(at({ turn: 8, phase: "main", current: me }));
    push(at({ turn: 8, phase: "main", current: notMe }));
    push(at({ turn: 9, phase: "roll", current: me }));
    await shows(5);
    check(true, `${tg} a live turn after the rejoin shows one`);
    await tap(page);
    await gone();

    // The opening roll-off and setup must never cover legal corners.
    for (const [label, patch] of [
      ["other roll-off", { turn: 0, phase: "rollOff", current: notMe, rollOff: { rolls: {}, pending: [notMe, me] } }],
      ["own roll-off", { turn: 0, phase: "rollOff", current: me, rollOff: { rolls: { [notMe]: 3 }, pending: [me] } }],
      ["own settlement", { turn: 0, phase: "setupSettle", current: me, setupIndex: 0, rollOff: null }],
      ["own road", { turn: 0, phase: "setupRoad", current: me, setupIndex: 0 }],
      ["second settlement", { turn: 0, phase: "setupSettle", current: me, setupIndex: 4 }],
      ["tied rethrow", { turn: 0, phase: "rollOff", current: me, rollOff: { rolls: {}, pending: [me, notMe] } }],
    ]) { push(at(patch)); await stays(label, 5); }

    if (me === "p1") {
      await page.evaluate(() => {
        window.__earlyFade = null;
        const observer = new MutationObserver(() => {
          const el = document.querySelector('[data-testid="turn-moment"]');
          if (!el) return;
          observer.disconnect();
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const animations = el.getAnimations();
            const pulse = animations.find(a => a.animationName === "turn-pulse");
            if (pulse) { pulse.pause(); pulse.currentTime = 0; }
            const entry = animations.find(a => a.animationName === "turn-stay-in");
            if (!entry) { window.__earlyFade = { missing: true }; return; }
            entry.pause(); entry.currentTime = 40;
            const before = Number(getComputedStyle(el).opacity);
            window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
            window.__earlyFade = { before, frozen: Number(getComputedStyle(el).opacity), leaving: el.hasAttribute("data-leaving") };
          }));
        });
        observer.observe(document, { childList: true, subtree: true });
      });
      push(at({ turn: 10, phase: "roll", current: me }));
      await page.waitForFunction(() => window.__earlyFade, null, { timeout: STEP_MS });
      const earlyFade = await page.evaluate(() => window.__earlyFade);
      check(earlyFade.leaving && earlyFade.before > 0 && earlyFade.before < 0.95 && Math.abs(earlyFade.before - earlyFade.frozen) < 0.02, `${tg} a tap during entry fades from its current opacity`, earlyFade);
      await gone();
      await faded("entry tap");
    }

  } catch (e) {
    console.error(`${tg}:`, e);
    failures++;
  } finally {
    await ctx.close();
  }
}

async function practice(view, [colorName, hex]) {
  const { ctx, page, tag } = await open(view, { color: [colorName, hex] });
  try {
    await page.waitForFunction(() => window.__emberisle, null, { timeout: STEP_MS });
    // The person's seat takes the colour under test (practice always deals red to the person): swapped in the same task
    // that deals the game, before the table first renders.
    await page.evaluate((hex) => {
      const g = window.__emberisle;
      g.getState().startAi();
      const st = structuredClone(g.getState().state);
      const i = st.players.findIndex((p) => p.color === hex);
      [st.players[0].color, st.players[i].color] = [st.players[i].color, st.players[0].color];
      g.setState({ state: st });
    }, hex);
    await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
    // Through the real roll-off and setup to the person's first roll (turn 1), then a full round to their second.
    await playUntil(page, (s) => s.state.phase === "roll" && s.state.current === s.localId);
    await page.waitForTimeout(400);
    const first = await page.evaluate(() => window.__yt);
    const phases = new Set(first.map((r) => r.phase));
    check(phases.has("roll"), `${tag}: a moment at the first roll`, [...phases]);
    check(first.every((r) => r.phase !== "setupRoad"), `${tag}: never at the path that follows a settlement`, first.map((r) => r.phase));
    check(first.every((r) => r.phase === "roll"), `${tag}: no moment in roll-off or setup`, first.map((r) => r.phase));
    check(new Set(first.map((r) => `${r.phase}|${r.setupIndex}|${r.turn}|${r.seq}`)).size === first.length, `${tag}: no two moments for one move`);
    const seatHex = await page.evaluate(() => { const s = window.__emberisle.getState(); return s.state.players.find((p) => p.id === s.localId).color; });
    check(seatHex === hex, `${tag}: the person's seat has the chosen colour`, [seatHex, hex]);

    // The person's own next turn, left up for the pictures and the geometry.
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    await playUntil(page, (s) => s.state.phase === "main" && s.state.current === s.localId);
    await playUntil(page, myRoll);
    await page.waitForSelector(MOMENT, { timeout: STEP_MS });
    await page.waitForFunction(() => window.__yt.at(-1)?.bg && window.__yt.at(-1).box, null, { timeout: STEP_MS });
    const recs = (await page.evaluate(() => window.__yt)).filter((r) => r.bg);
    for (const [i, rec] of recs.entries()) {
      const label = `moment ${i + 1} (${rec.phase})`;
      readable(tag, label, rec, seatHex);
      const ins = view.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
      const b = rec.box;
      check(b.left >= ins.left && b.right <= rec.vp.w - ins.right && b.top >= ins.top && b.bottom <= rec.vp.h - ins.bottom, `${tag} ${label}: inside the safe area`, [b, ins]);
      check(Math.abs((b.left + b.right) / 2 - (rec.hole.left + rec.hole.right) / 2) <= 60, `${tag} ${label}: near the horizontal centre of the island's hole`, [b, rec.hole]);
      check(rec.over.length === 0, `${tag} ${label}: over no HUD box`, rec.over);
    }
    const p = await pulse(page);
    check(p.names.includes("turn-pulse") && p.duration === 1600 && p.trough.o < 0.95, `${tag}: it is pulsing`, p);
    await page.waitForTimeout(2600);
    check((await up(page)) === 1, `${tag}: still up 2.6 s later`);
    // Mid-pulse picture (the trough), then a real click on Roll: it goes through, ends the moment and rolls.
    const dir = SHOTS ? SHOT_DIR : "test-results";
    await page.evaluate(() => document.querySelectorAll('[data-testid="turn-moment"]').forEach((e) => e.getAnimations().forEach((a) => { a.pause(); a.currentTime = a.animationName === "turn-pulse" ? 220 + 800 : 220; })));
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${dir}/your-turn-${view.width}x${view.height}-${colorName}-mid-pulse.png` });
    if (SHOTS) await page.evaluate(() => {
      // Hold only the exit's 160 ms removal timer while taking a controlled mid-transition picture.
      const original = window.setTimeout;
      window.__restoreExitClock = () => { window.setTimeout = original; window.__finishExit?.(); };
      window.setTimeout = (fn, ms, ...args) => {
        if (ms === 160 && document.querySelector('[data-testid="turn-moment"][data-leaving]')) {
          window.__finishExit = () => fn(...args);
          return 0;
        }
        return original(fn, ms, ...args);
      };
    });
    await page.getByRole("button", { name: "Roll", exact: true }).click({ timeout: 5000 });
    // Check dismissal before waiting for the roll: the eight-second cap must not mask a missed tap.
    if (!SHOTS) await page.waitForFunction(() => !document.querySelector('[data-testid="turn-moment"]'), null, { timeout: 1000 });
    await page.waitForFunction(() => window.__emberisle.getState().state.phase !== "roll", null, { timeout: STEP_MS });
    if (SHOTS) {
      await page.waitForFunction(() => document.querySelector('[data-testid="turn-moment"]')?.getAnimations().some(a => a.transitionProperty === "opacity"), null, { timeout: STEP_MS });
      await page.evaluate(() => document.querySelector('[data-testid="turn-moment"]').getAnimations().forEach((a) => { a.pause(); a.currentTime = 80; }));
      await page.screenshot({ path: `${dir}/your-turn-${view.width}x${view.height}-${colorName}-mid-fade.png` });
      await page.evaluate(() => window.__restoreExitClock());
    }
    await page.waitForFunction(() => !document.querySelector('[data-testid="turn-moment"]'), null, { timeout: STEP_MS });
    check((await up(page)) === 0, `${tag}: a real click on Roll was not blocked, rolled, and ended the moment`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${dir}/your-turn-${view.width}x${view.height}-${colorName}-after-tap.png` });
  } catch (e) {
    console.error(`${tag}:`, e);
    failures++;
  } finally {
    await ctx.close();
  }
}

async function reduced() {
  const { ctx, page, tag } = await open(VIEWS[3], { reduced: true });
  try {
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
    await playUntil(page, (s) => s.state.phase === "roll" && s.state.current === s.localId);
    await page.waitForSelector(MOMENT, { timeout: STEP_MS });
    const look = await page.$eval(MOMENT, (e) => ({ anims: e.getAnimations().length, o: getComputedStyle(e).opacity, tf: getComputedStyle(e).transform }));
    check(look.anims === 0 && look.o === "1" && look.tf === "none", `${tag}: reduced motion is a steady pill: no animation, no pulse, no transform`, look);
    await page.waitForTimeout(2600);
    check((await up(page)) === 1, `${tag}: and it stays up`);
    await tap(page);
    await page.waitForFunction(() => !document.querySelector('[data-testid="turn-moment"]'), null, { timeout: 1000 });
    check(true, `${tag}: a tap ends it`);
  } catch (e) {
    console.error(`${tag} reduced:`, e);
    failures++;
  } finally {
    await ctx.close();
  }
}

async function hotseat() {
  const { ctx, page, tag } = await open(VIEWS[3]);
  try {
    await page.getByRole("button", { name: "Four seats, one table" }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
    await playUntil(page, (s) => s.state.phase === "roll" && s.state.turn >= 1, true);
    await page.waitForSelector(MOMENT, { timeout: STEP_MS });
    const t0 = Date.now();
    await page.waitForFunction(() => !document.querySelector('[data-testid="turn-moment"]'), null, { timeout: STEP_MS });
    const held = Date.now() - t0;
    const recs = await page.evaluate(() => window.__yt.map((r) => [r.phase, r.text]));
    check(recs.length >= 1 && recs.every(([ph, t]) => ph === "roll" && /'s turn$/.test(t)), `${tag} hotseat: only "<name>'s turn" on a roll, nothing in the roll-off or setup`, recs);
    check(held <= 2500, `${tag} hotseat: untouched, it is timed and gone within 2.5 s`, held);
  } catch (e) {
    console.error(`${tag} hotseat:`, e);
    failures++;
  } finally {
    await ctx.close();
  }
}

const ONLY = process.env.ONLY;
try {
  if (!ONLY || ONLY === "online") {
    await online("p0", { cap: true });
    await online("p1");
    await online("p2");
    await online("p3");
  }
  if (!ONLY || ONLY === "practice") for (const v of VIEWS) for (const s of SEATS) await practice(v, s);
  if (!ONLY || ONLY === "reduced") await reduced();
  if (!ONLY || ONLY === "hotseat") await hotseat();
  check(errors.length === 0, "zero console errors", errors);
} finally {
  await browser.close();
  await vite.close();
}
console.log(failures ? `your-turn-stay-prove: ${failures} failed` : "your-turn-stay-prove: all passed");
process.exit(failures ? 1 : 0);
