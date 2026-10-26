// #1140 (owner: "we need to add a 'your turn' dialog, like a fade in with the player's colour. A lot of people play with sound
// off"). YourTurnBanner (data-testid="your-turn"): a pill in the seat's colour with the words "Your turn" near the top of the
// island, 0.3 s in, a 1.2 s hold, 0.3 s out; once per move of the person's seat; pointer-events none.
// - Online, over a scripted socket (page.routeWebSocket) at 390x844, once as each of the four seats (the four seat colours):
//   it appears once when the turn arrives; a repeat state push of the same move adds none; a seat's turn that is not the person's,
//   a bot's turn and a watcher's table show none; the roll-off and the setup (a settlement, then its path: one banner) show one
//   each; a first load and a rejoin onto a move under way show none, and a live change after the rejoin still shows one; the
//   text is "Your turn", its background is the seat's colour and its ink reads at 4.5:1 or better on it.
// - Practice (real roll-off, setup and turns against three bots) at 320x568, 390x844, 844x390 and 1280x720, with safe-area
//   insets emulated over CDP, in two seat colours (red, ivory): the banner shows at the roll-off, the first setup placement and
//   every roll, never at the path that follows a settlement; it is 15 px or larger, inside the safe area, over no HUD box (the
//   header row, the seat strip, the seat rail, the bottom stack, the status line, the resource tabs) and takes no tap
//   (pointer-events none, nothing of it on top at its centre). Mid-fade and fully visible screenshots go to
//   docs/proofs/1140/ (SHOTS=1) and test-results/.
// - Timing, from the banner's own animation (paused at set times, so software-GL frame gaps cannot blur it): opacity 0 at the start,
//   at least 0.5 for at least 1.2 s, back to 0 at the end, 1.8 s long, and gone from the page within 2.2 s.
// - Reduced motion at 1280x720: the animation is moment-fade, 1.5 s, and no transform at any sampled time.
// - Hotseat shows none through the roll-off, setup and a roll. Zero console errors.
// Run: npm run your-turn-banner-prove (ONLY=online, practice, reduced or hotseat runs one part; SHOTS=1 writes docs/proofs/1140).
// Port from VITE_PORT, default 8485.
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
  window.__held = new Map();
  const later = window.setTimeout;
  window.setTimeout = function (fn, ms, ...a) {
    if (window.__holdYT && ms === 1800 && typeof fn === "function") {
      const id = later(() => window.__held.delete(id), 600_000);
      window.__held.set(id, () => fn(...a));
      return id;
    }
    return later(fn, ms, ...a);
  };
  window.__release = () => {
    window.__holdYT = false;
    for (const [id, fn] of window.__held) {
      clearTimeout(id);
      fn();
    }
    window.__held.clear();
  };
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
    const rec = { at: performance.now(), text: el.textContent, seat: el.dataset.seat, phase: st?.phase, seq: st?.seq, turn: st?.turn, current: st?.current, setupIndex: st?.setupIndex };
    window.__yt.push(rec);
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      const cs = getComputedStyle(el);
      rec.bg = cs.backgroundColor;
      rec.color = cs.color;
      rec.font = parseFloat(cs.fontSize);
      rec.pe = cs.pointerEvents;
      rec.anim = el.getAnimations().map((a) => ({ name: a.animationName, dur: a.effect.getTiming().duration }));
      for (const a of el.getAnimations()) {
        a.pause();
        a.currentTime = 600;
      }
      const b = box(el);
      rec.box = b;
      const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
      rec.top = document.elementFromPoint(cx, cy)?.closest('[data-testid="your-turn"]') ? "banner" : "other";
      rec.over = [...document.querySelectorAll(OBSTACLES)]
        .filter((o) => !o.closest('[data-testid="your-turn"]'))
        .map((o) => [o, box(o)])
        .filter(([, r]) => r.height > 1 && r.width > 1 && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top)
        .map(([o, r]) => `${o.tagName.toLowerCase()}[${o.dataset.testid || o.className.toString().slice(0, 30)}] ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`);
      rec.vp = { w: innerWidth, h: innerHeight };
      rec.hole = box(el.parentElement);
      for (const a of el.getAnimations()) a.play();
    });
  };
  new MutationObserver(() => document.querySelectorAll('[data-testid="your-turn"]').forEach(note)).observe(document, { childList: true, subtree: true });
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
  check(rec.text === "Your turn", `${tag} ${label}: reads "Your turn"`, rec.text);
  if (seatHex) check(rgbHex(rec.bg) === seatHex, `${tag} ${label}: background is the seat's colour`, [rec.bg, seatHex]);
  check(rec.font >= 15, `${tag} ${label}: text is 15 px or larger`, rec.font);
  const c = contrast(rgbHex(rec.color), rgbHex(rec.bg));
  check(c >= 4.5, `${tag} ${label}: ink on the seat colour reads at 4.5:1 or better`, c.toFixed(2));
  check(rec.pe === "none" && rec.top === "other", `${tag} ${label}: takes no pointer events and nothing is blocked at its centre`, [rec.pe, rec.top]);
}

// The animation's opacity and transform sampled by pausing it at set times.
async function timeline(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="your-turn"]');
    const a = el.getAnimations()[0];
    a.pause();
    const dur = a.effect.getTiming().duration;
    const rows = [];
    for (let t = 0; t <= dur; t += 20) {
      a.currentTime = t;
      const cs = getComputedStyle(el);
      rows.push({ t, o: Number(cs.opacity), tf: cs.transform });
    }
    a.currentTime = 0;
    a.play();
    return { name: a.animationName, dur, rows };
  });
}

async function online(me) {
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
    // Nothing new shows for a while after the state has loaded.
    const stays = async (label, n0) => {
      await page.waitForFunction((n) => window.__emberisle.getState().state?.seq === n, seq, { timeout: STEP_MS });
      await page.waitForTimeout(700);
      const now = { mounts: await bannerCount(page), up: await page.locator('[data-testid="your-turn"]').count() };
      check(now.mounts === n0 && now.up === 0, `${tg} ${label}: no banner`, now);
    };
    const gone = () => page.waitForFunction(() => !document.querySelector('[data-testid="your-turn"]'), null, { timeout: STEP_MS });
    const notMe = base.players.find((p) => p.id !== me).id;

    // A first load onto a move under way (the baseline) shows nothing, not even on the person's own roll.
    states = [{ type: "state", you: me, legal, game: { ...base, seq: 20, turn: 2, phase: "roll", current: me } }];
    await page.waitForFunction(() => window.__emberisle?.getState().state?.seq === 20, null, { timeout: STEP_MS });
    await page.waitForTimeout(700);
    check((await bannerCount(page)) === 0, `${tg} first load onto own roll at seq 20: no banner`);

    // Another seat's move, and a bot's, show none.
    push(at({ turn: 2, phase: "main", current: me }));
    push(at({ turn: 2, phase: "main", current: notMe }));
    await stays("a bot's turn", 0);

    // The turn arrives: one banner, with the seat's words and colour.
    push(at({ turn: 3, phase: "roll", current: me }));
    await page.waitForSelector('[data-testid="your-turn"]', { timeout: STEP_MS });
    await page.waitForFunction(() => window.__yt[0]?.bg, null, { timeout: STEP_MS });
    const rec = await page.evaluate(() => window.__yt[0]);
    readable(tg, "the turn arrives", rec, seatHex);
    check((await bannerCount(page)) === 1, `${tg} the turn arrives: exactly one banner`);

    // A repeat state push of the same move (a chat-only resend, a timer push) adds none while it is up or after it left.
    push(at({ turn: 3, phase: "roll", current: me }));
    push(at({ turn: 3, phase: "roll", current: me }));
    await page.waitForFunction((n) => window.__emberisle.getState().state?.seq === n, seq, { timeout: STEP_MS });
    await page.waitForTimeout(300);
    check((await bannerCount(page)) === 1, `${tg} a repeat push while it is up: still one`);
    const t0 = Date.now();
    await gone();
    check(Date.now() - t0 < 2200, `${tg} the banner leaves the page on its own within 2.2 s`, Date.now() - t0);
    push(at({ turn: 3, phase: "roll", current: me }));
    await stays("a repeat push after it left", 1);
    push(at({ turn: 3, phase: "main", current: me }));
    await stays("the same turn's main phase", 1);

    // Spectators never get one: a watcher is no seat.
    await page.evaluate(() => window.__emberisle.setState({ spectator: true }));
    push(at({ turn: 4, phase: "roll", current: me }));
    await stays("a watcher", 1);
    push(at({ turn: 4, phase: "main", current: notMe }));
    await stays("the watcher's table moving on", 1);
    await page.evaluate(() => window.__emberisle.setState({ spectator: false }));

    // A drop and a rejoin onto the person's own move under way: none. A live turn after it: one.
    states = [at({ turn: 5, phase: "roll", current: me })];
    sockets.at(-1).close();
    await page.waitForFunction(() => /Reconnecting/.test(window.__emberisle.getState().error ?? ""), null, { timeout: STEP_MS });
    await page.waitForFunction((n) => window.__emberisle.getState().state?.seq === n, seq, { timeout: STEP_MS });
    check(sent.welcomes === 2, `${tg} the seat was re-welcomed through the redial`, sent);
    await stays("a rejoin onto own roll", 1);
    push(at({ turn: 5, phase: "main", current: me }));
    push(at({ turn: 5, phase: "main", current: notMe }));
    push(at({ turn: 6, phase: "roll", current: me }));
    await page.waitForSelector('[data-testid="your-turn"]', { timeout: STEP_MS });
    check((await bannerCount(page)) === 2, `${tg} a live turn after the rejoin shows one`);
    await gone();

    // The roll-off and the setup: one banner each time it becomes the person's move. A settlement then its path is one move.
    const ro = { rolls: {}, pending: [notMe, me] };
    push(at({ turn: 0, phase: "rollOff", current: notMe, rollOff: ro }));
    await stays("a bot's roll-off throw", 2);
    push(at({ turn: 0, phase: "rollOff", current: me, rollOff: { rolls: { [notMe]: 3 }, pending: [me] } }));
    await page.waitForSelector('[data-testid="your-turn"]', { timeout: STEP_MS });
    check((await bannerCount(page)) === 3, `${tg} the roll-off: a banner when it is the person's throw`);
    await gone();
    push(at({ turn: 0, phase: "setupSettle", current: me, setupIndex: 0, rollOff: null }));
    await page.waitForSelector('[data-testid="your-turn"]', { timeout: STEP_MS });
    check((await bannerCount(page)) === 4, `${tg} setup: a banner when it is the person's settlement`);
    await gone();
    push(at({ turn: 0, phase: "setupRoad", current: me, setupIndex: 0 }));
    await stays("the path that follows the settlement", 4);
    push(at({ turn: 0, phase: "setupSettle", current: notMe, setupIndex: 1 }));
    push(at({ turn: 0, phase: "setupSettle", current: me, setupIndex: 4 }));
    await page.waitForSelector('[data-testid="your-turn"]', { timeout: STEP_MS });
    check((await bannerCount(page)) === 5, `${tg} setup: a banner at the person's second placement`);
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
    const first = await page.evaluate(() => ({ yt: window.__yt, local: window.__emberisle.getState().localId }));
    const phases = new Set(first.yt.map((r) => r.phase));
    check(phases.has("roll"), `${tag}: a banner at the first roll`, [...phases]);
    check(first.yt.every((r) => r.phase !== "setupRoad"), `${tag}: never at the path that follows a settlement`, first.yt.map((r) => r.phase));
    check(first.yt.some((r) => r.phase === "setupSettle" || r.phase === "rollOff"), `${tag}: a banner in the roll-off or setup`, first.yt.map((r) => r.phase));
    check(new Set(first.yt.map((r) => `${r.phase}|${r.setupIndex}|${r.turn}|${JSON.stringify(r.seq)}`)).size === first.yt.length, `${tag}: no two banners for one move`);
    const seatHex = await page.evaluate(() => { const s = window.__emberisle.getState(); return s.state.players.find((p) => p.id === s.localId).color; });
    check(seatHex === hex, `${tag}: the person's seat has the chosen colour`, [seatHex, hex]);

    // The person's own next turn, held on screen for the pictures and the geometry.
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    await playUntil(page, (s) => s.state.phase === "main" && s.state.current === s.localId);
    await page.evaluate(() => (window.__holdYT = true));
    await playUntil(page, myRoll);
    await page.waitForSelector('[data-testid="your-turn"]', { timeout: STEP_MS });
    await page.waitForFunction(() => window.__yt.at(-1)?.bg && window.__yt.at(-1).box, null, { timeout: STEP_MS });
    const all = await page.evaluate(() => window.__yt);
    const recs = all.filter((r) => r.bg);
    for (const [i, rec] of recs.entries()) {
      const label = `banner ${i + 1} (${rec.phase})`;
      readable(tag, label, rec, seatHex);
      const ins = view.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
      const b = rec.box;
      check(b.left >= ins.left && b.right <= rec.vp.w - ins.right && b.top >= ins.top && b.bottom <= rec.vp.h - ins.bottom, `${tag} ${label}: inside the safe area`, [b, ins]);
      check(Math.abs((b.left + b.right) / 2 - (rec.hole.left + rec.hole.right) / 2) <= 60, `${tag} ${label}: near the horizontal centre of the island's hole`, [b, rec.hole]);
      check(rec.over.length === 0, `${tag} ${label}: over no HUD box`, rec.over);
    }
    const midY = recs.at(-1).box;
    check(midY.top < recs.at(-1).vp.h * 0.4, `${tag}: in the top part of the screen, not the action area`, midY);
    if (!view.insets || view.width === 390 || view.width === 1280 || SHOTS) {
      const el = page.locator('[data-testid="your-turn"]');
      const shot = async (name, t) => {
        await page.evaluate((t) => document.querySelectorAll('[data-testid="your-turn"]').forEach((e) => e.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; })), t);
        await page.waitForTimeout(150);
        const path = `${SHOTS ? SHOT_DIR : "test-results"}/your-turn-${view.width}x${view.height}-${colorName}-${name}.png`;
        await page.screenshot({ path });
      };
      await shot("midfade", 150);
      check((await el.evaluate((e) => Number(getComputedStyle(e).opacity))) < 0.95, `${tag}: the mid-fade picture is part-way`);
      await shot("full", 700);
      check((await el.evaluate((e) => Number(getComputedStyle(e).opacity))) === 1, `${tag}: the full picture is fully visible`);
    }
    await page.evaluate(() => window.__release());
    await page.waitForFunction(() => !document.querySelector('[data-testid="your-turn"]'), null, { timeout: STEP_MS });
  } catch (e) {
    console.error(`${tag}:`, e);
    failures++;
  } finally {
    await ctx.close();
  }
}

async function timing() {
  const view = VIEWS[3];
  const { ctx, page, tag } = await open(view);
  try {
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
    await page.evaluate(() => (window.__holdYT = true));
    await page.waitForSelector('[data-testid="your-turn"]', { timeout: STEP_MS }).catch(() => null);
    if (!(await page.locator('[data-testid="your-turn"]').count())) await playUntil(page, (s) => s.state.phase !== "rollOff" || s.state.current === s.localId);
    await page.waitForSelector('[data-testid="your-turn"]', { timeout: STEP_MS });
    const t = await timeline(page);
    const lit = t.rows.filter((r) => r.o >= 0.5).length * 20;
    check(t.name === "your-turn" && t.dur === 1800, `${tag}: the your-turn animation runs 1800 ms`, [t.name, t.dur]);
    check(t.rows[0].o === 0 && t.rows.at(-1).o === 0, `${tag}: it starts and ends at opacity 0 (a fade in and a fade out)`, [t.rows[0].o, t.rows.at(-1).o]);
    check(lit >= 1200, `${tag}: readable (opacity at least 0.5) for at least 1.2 s`, lit);
    await page.evaluate(() => window.__release());
    const t0 = Date.now();
    await page.waitForFunction(() => !document.querySelector('[data-testid="your-turn"]'), null, { timeout: STEP_MS });
    check(Date.now() - t0 < 2200, `${tag}: gone from the page within 2.2 s`, Date.now() - t0);
  } catch (e) {
    console.error(`${tag} timing:`, e);
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
    await page.evaluate(() => (window.__holdYT = true));
    await playUntil(page, (s) => s.state.phase !== "rollOff" || s.state.current === s.localId);
    await page.waitForSelector('[data-testid="your-turn"]', { timeout: STEP_MS });
    const t = await timeline(page);
    check(t.name === "moment-fade" && t.dur === 1500, `${tag}: reduced motion is a plain 1500 ms fade`, [t.name, t.dur]);
    check(t.rows.every((r) => r.tf === "none"), `${tag}: no transform at any sampled time`, [...new Set(t.rows.map((r) => r.tf))]);
    check(t.rows.some((r) => r.o === 1) && t.rows[0].o === 0 && t.rows.at(-1).o === 0, `${tag}: it still fades in and out`);
    await page.evaluate(() => window.__release());
    await page.waitForFunction(() => !document.querySelector('[data-testid="your-turn"]'), null, { timeout: STEP_MS });
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
    await page.waitForTimeout(900);
    check((await bannerCount(page)) === 0, `${tag} hotseat: no banner through the roll-off, setup and first roll`, await bannerCount(page));
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
    await online("p0");
    await online("p1");
    await online("p2");
    await online("p3");
  }
  if (!ONLY || ONLY === "practice") for (const v of VIEWS) for (const s of SEATS) await practice(v, s);
  if (!ONLY || ONLY === "timing") await timing();
  if (!ONLY || ONLY === "reduced") await reduced();
  if (!ONLY || ONLY === "hotseat") await hotseat();
  check(errors.length === 0, "zero console errors", errors);
} finally {
  await browser.close();
  await vite.close();
}
console.log(failures ? `your-turn-banner-prove: ${failures} failed` : "your-turn-banner-prove: all passed");
process.exit(failures ? 1 : 0);
