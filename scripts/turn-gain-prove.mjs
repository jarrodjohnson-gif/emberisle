// Jarrod's playtest: "not intuitive on when it's your turn", and gains "too quick". In practice against the isle at 1280x720
// and, with safe-area insets emulated over CDP, 390x844 (47 top, 34 bottom), 360x640 (24 top, 16 bottom) and 844x390 (47
// left, 47 right, 21 bottom; the HUD is a left column), played through the real roll-off and setup:
// - "Your turn" (data-testid="turn-moment") shows when a bot's turn passes to the person and, untouched, is gone within
//   2 s and readable (opacity ≥ 0.5) for at least 1.2 s; it never shows on a bot's turn, nor in the roll-off or setup; while
//   it is the person's roll, Roll is the one filled primary and their seat card wears the turn ring (seat-turn,
//   aria-current); on a bot's turn the banner reads "Waiting for {bot} …" and there is no Roll;
// - a roll steered to pay the person shows one line per good gained (data-testid="gain-float"), "+N Good" with the right
//   good and amount, in the gain green, none while the roll moment holds the centre; each readable for at least 1.2 s, the
//   lines of one batch starting 150 ms apart, rising (a translateY keyframe);
// - a bank trade shows the ore given ("−4 Ore", or the harbour's rate) in the loss red and "+1 Grain" in green; a state
//   where only another seat gains shows nothing, and so does a watcher's; every line shown in the whole game is one of the
//   person's own hand changes;
// - "Your turn" and gain lines are never up at once (a bot's roll that paid the person shows first);
// - placement, for the roll's lines, the trade's and "Your turn": centred on the island's hole (`__isle.insets()`), or
//   moved off it only when the centre was covered (data-stage "moved"), never "crowded"; inside the safe area and the hole;
//   over no HUD control or chip, except the status line when the moment says it had to ("over-status": a short phone);
// - when the hole changes under a showing "Your turn" (a refit), it places itself again by the same rules;
// - contrast: each text's colour against every pixel behind it (the element frozen at full opacity and shot with its text
//   transparent, so the glass and the board under it), the lowest ratio at least 3:1;
// - reduced motion at 1280x720: the lines and the turn moment run the moment-fade keyframes (opacity only, no transform in
//   the keyframes or on any frame) over at least 1.5 s, each line still readable for 1.2 s.
// Hotseat at 1280x720: the moment names the seat taking the device ("Seat 2's turn"). A reconnect at 390x844 replays nothing
// (reconnect(): a real connectTable over a controlled socket) and a live change after it still shows. Zero console errors.
// Readable times come from each element's own animation (keyframes, duration, delay) capped by how long it stayed on the
// page: software GL frames are too sparse to time it by sampling. For the placement and contrast measures only, the
// moment being measured is held on screen (__hold), and "Your turn" is timed again on a later turn left untouched.
// Run: npm run turn-gain-prove (ONLY=390x844, reduced or hotseat or reconnect runs one part). Port from VITE_PORT, default 8476.
// Screenshots to test-results/turn-gain-*.png.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const STEP_MS = 30_000;
const PORT = Number(process.env.VITE_PORT) || 8476;
const VIEWS = [
  { width: 1280, height: 720 },
  { width: 390, height: 844, touch: true, insets: { top: 47, right: 0, bottom: 34, left: 0 } },
  { width: 360, height: 640, touch: true, insets: { top: 24, right: 0, bottom: 16, left: 0 } },
  { width: 844, height: 390, touch: true, insets: { top: 0, right: 47, bottom: 21, left: 47 } },
];
const GREEN = "rgb(16, 86, 42)";
const RED = "rgb(138, 34, 25)";
mkdirSync("test-results", { recursive: true });

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

// Installed before the app: every turn moment and every gain line, with what the store said when it mounted, its box and
// colour, and its opacity and transform on every frame it lives; the person's own hand changes; the roll moment's spans.
function recorders() {
  // For a measure only: __hold names the moment being measured; a 1.5-2.7 s timer set while it is on screen (its own end)
  // waits until __release() runs it. Nothing else is held, so the bots play on.
  window.__held = new Map();
  const later = window.setTimeout;
  window.setTimeout = function (fn, ms, ...a) {
    if (window.__hold && document.querySelector(`[data-testid="${window.__hold}"]`) && typeof fn === "function" && ms >= 1500 && ms <= 2700) {
      const id = later(() => window.__held.delete(id), 600_000);
      window.__held.set(id, () => fn(...a));
      return id;
    }
    return later(fn, ms, ...a);
  };
  window.__release = () => {
    window.__hold = false;
    for (const [id, fn] of window.__held) {
      clearTimeout(id);
      fn();
    }
    window.__held.clear();
  };
  window.__turns = [];
  window.__lines = [];
  window.__own = [];
  window.__rollUp = [];
  const live = new Map();
  let subscribed = false;
  const g = () => window.__emberisle?.getState();
  const box = (el) => el.getBoundingClientRect().toJSON();
  const watch = () => {
    const s = g();
    if (!subscribed && window.__emberisle) {
      subscribed = true;
      window.__emberisle.subscribe((n, p) => {
        if (!n.state || !p.state || n.spectator) return;
        const id = n.mode === "hotseat" ? n.state.current : n.localId;
        const a = n.state.players.find((x) => x.id === id);
        const b = p.state.players.find((x) => x.id === id);
        if (!a || !b || (n.mode === "hotseat" && n.state.current !== p.state.current)) return;
        for (const r of ["timber", "clay", "wool", "grain", "ore"]) {
          const d = a.resources[r] - b.resources[r];
          if (d) window.__own.push({ r, d, at: performance.now() });
        }
      });
    }
    for (const el of document.querySelectorAll('[data-testid="turn-moment"], [data-testid="gain-float"]')) {
      if (live.has(el)) continue;
      const turn = el.dataset.testid === "turn-moment";
      const rec = {
        at: performance.now(),
        text: el.textContent,
        current: s?.state?.current,
        localId: s?.localId,
        mode: s?.mode,
        phase: s?.state?.phase,
        rollUp: !!document.querySelector('[data-testid="roll-moment"]'),
        color: getComputedStyle(el).color,
        animation: getComputedStyle(el).animationName,
        r: el.dataset.resource,
        d: Number(el.dataset.delta),
        frames: [],
        anim: (() => {
          const a = el.getAnimations()[0];
          if (!a) return null;
          const t = a.effect.getTiming();
          return { duration: t.duration, delay: t.delay, easing: t.easing, keyframes: a.effect.getKeyframes().map((k) => ({ at: k.computedOffset, o: k.opacity === undefined ? null : Number(k.opacity), tf: k.transform ?? null })) };
        })(),
      };
      (turn ? window.__turns : window.__lines).push(rec);
      live.set(el, rec);
    }
    // How each moment placed itself, read in the task that measured it (a later HUD change does not move it): its tier, its
    // move, and whether the move was needed, i.e. laid at the centre it would have come within 8 px of the HUD it avoids.
    for (const [el, rec] of live) {
      const host = el.dataset.testid === "turn-moment" ? el : el.parentElement;
      if (!el.isConnected || rec.stage?.raw === host.dataset.shift + host.dataset.stage) continue;
      const shift = Number(host.dataset.shift);
      const r = host.getBoundingClientRect();
      const c = { left: r.left, right: r.right, top: r.top - shift - 8, bottom: r.bottom - shift + 8 };
      const near = [...document.querySelectorAll('header, [data-testid="seat-strip"], [data-hud-stack], [data-testid="banner"]')].some((h) => {
        const b = h.getBoundingClientRect();
        return b.height > 1 && c.left < b.right && b.left < c.right && c.top < b.bottom && b.top < c.bottom;
      });
      rec.stage = { raw: host.dataset.shift + host.dataset.stage, shift, how: host.dataset.stage, needed: shift === 0 || near };
    }
    for (const [el, rec] of live) {
      if (!el.isConnected) {
        rec.gone = performance.now();
        live.delete(el);
      }
    }
    const m = !!document.querySelector('[data-testid="roll-moment"]');
    if (m && !window.__rollUp.at(-1)?.open) window.__rollUp.push({ from: performance.now(), open: true });
    if (!m && window.__rollUp.at(-1)?.open) Object.assign(window.__rollUp.at(-1), { to: performance.now(), open: false });
  };
  new MutationObserver(watch).observe(document, { subtree: true, childList: true, attributes: true });
  const frame = () => {
    for (const [el, rec] of live) {
      if (!el.isConnected) continue;
      const cs = getComputedStyle(el);
      rec.frames.push({ t: performance.now(), o: Number(cs.opacity), tf: cs.transform, box: box(el) });
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

async function open(view, { reduced = false, before, path = "/" } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    hasTouch: !!view.touch,
    isMobile: !!view.touch,
    deviceScaleFactor: 1,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  const tag = `${view.width}x${view.height}${reduced ? " reduced" : ""}`;
  page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
  if (view.insets) await (await ctx.newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets: view.insets });
  await page.addInitScript(recorders);
  await before?.(ctx, page);
  await page.goto(`http://127.0.0.1:${PORT}${path}`);
  return { ctx, page, tag };
}

// Plays the person's seat until `until` holds (roll-moment-prove's loop): roll-off, the first legal setup marks, End turn in
// main, the AI's own pick for a wayfarer or a discard, No to any ask. It never rolls the dice; the caller does.
async function playUntil(page, until) {
  const ok = await page.evaluate(async (until) => {
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
        else if (st.phase !== "roll") {
          const a = chooseBotAction(st, me);
          if (a) s.dispatch(a, me);
        }
      }
      await sleep(120);
    }
    return false;
  }, until.toString());
  if (!ok) {
    const at = await page.evaluate(() => {
      const s = window.__emberisle.getState();
      return { phase: s.state?.phase, current: s.state?.current, localId: s.localId, offer: !!s.offer, moment: !!document.querySelector('[data-testid="turn-moment"]'), floats: !!document.querySelector('[data-testid="gain-floats"]'), roll: !!document.querySelector('[data-testid="roll-moment"]'), held: window.__held.size, turns: window.__turns.length };
    });
    throw new Error(`stuck before ${until}: ${JSON.stringify(at)}`);
  }
}

// Nothing on its way to the centre: a bot's roll that paid the person just before their turn shows its lines up to ~1.1 s
// later, so the measured roll waits until no line or moment has shown for that long.
async function quiet(page) {
  await page.evaluate(async () => {
    const busy = () => document.querySelector('[data-testid="turn-moment"], [data-testid="gain-floats"], [data-testid="roll-moment"]');
    for (let calm = 0; calm < 1500; calm = busy() ? 0 : calm + 100) await new Promise((r) => setTimeout(r, 100));
  });
}

const myRoll = (s) => s.state.phase === "roll" && s.state.current === (s.mode === "hotseat" ? s.state.current : s.localId);

// The safe rect, the hole the renderer fits the island to, and every HUD control and text chip that is showing.
const layout = (page) =>
  page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;inset:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);pointer-events:none";
    document.body.append(probe);
    const cs = getComputedStyle(probe);
    const safe = { left: parseFloat(cs.paddingLeft), top: parseFloat(cs.paddingTop), right: innerWidth - parseFloat(cs.paddingRight), bottom: innerHeight - parseFloat(cs.paddingBottom) };
    probe.remove();
    const i = window.__isle.insets();
    const hole = { left: i.left, top: i.top, right: innerWidth - i.right, bottom: innerHeight - i.bottom };
    const hud = [];
    const sel = 'button, a, input, select, [role="button"], [data-testid="turn-banner"], [data-testid="banner"], [data-testid="hand-dock"], [data-testid="log-line"], [data-testid="dice-row"], [data-testid="turn-countdown"]';
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('[data-testid="gain-floats"], [data-testid="turn-moment"]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      hud.push({ what: el.dataset.testid ?? el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 20), status: el.dataset.testid === "banner", left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
    return { safe, hole, hud };
  });

const inside = (r, o, slack = 0.5) => r.left >= o.left - slack && r.top >= o.top - slack && r.right <= o.right + slack && r.bottom <= o.bottom + slack;
const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const union = (rs) => ({ left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) });
const centre = (r) => [(r.left + r.right) / 2, (r.top + r.bottom) / 2];

// Where a set of moment boxes sit: centred on the hole (±24 px; the lines rise 20 px), inside the safe rect and the hole,
// clear of every HUD control.
// `stage` is how the moment placed itself (data-stage, data-shift): at the centre, or moved off it to clear HUD that reaches
// into the hole. It must be centred once the move is taken back, the move must have been needed (at the centre it would
// have covered HUD), and it must never have had to give up ("crowded"). It may sit over the status line (which takes no
// taps and leaves on its own) only when it says so ("over-status"), and over nothing else.
function placement(tag, what, boxes, lay, { shift = 0, how = "centre", needed = true } = {}) {
  check(how !== "crowded", `${tag}: ${what} found room (${how})`);
  const u = union(boxes);
  const [cx, cy] = centre(u);
  const [hx, hy] = centre(lay.hole);
  check(Math.abs(cx - hx) <= 4 && Math.abs(cy - shift - hy) <= 24, `${tag}: ${what} centred on the island's hole${shift ? `, moved ${shift.toFixed(0)} px to clear the HUD` : ""}`, { centre: [cx.toFixed(0), cy.toFixed(0)], hole: [hx.toFixed(0), hy.toFixed(0)], shift });
  if (shift) check(needed, `${tag}: ${what} moved only because the centre was covered when it showed`);
  check(boxes.every((b) => inside(b, lay.safe)), `${tag}: ${what} inside the safe area`, { box: u, safe: lay.safe });
  check(boxes.every((b) => inside(b, lay.hole)), `${tag}: ${what} inside the hole`, { box: u, hole: lay.hole });
  const hit = lay.hud.filter((h) => boxes.some((b) => overlaps(b, h)) && !(h.status && how === "over-status")).map((h) => h.what);
  check(hit.length === 0, `${tag}: ${what} covers no HUD control or chip${how === "over-status" ? " (but the status line)" : ""}`, { hit, how, shift });
}

// WCAG contrast of the element's text colour against every pixel behind its text: the element is frozen at full opacity,
// screenshotted with its text and icon transparent (the glass and the board under it stay), and the lowest ratio counts.
async function contrast(page, testid, index = 0) {
  const loc = page.locator(`[data-testid="${testid}"]`).nth(index);
  const color = await loc.evaluate((el) => {
    for (const a of el.getAnimations()) {
      a.pause();
      a.currentTime = 700;
    }
    const c = getComputedStyle(el).color;
    el.style.setProperty("color", "transparent", "important");
    for (const k of el.children) k.style.visibility = "hidden";
    return c;
  });
  const png = await loc.screenshot({ animations: "allow" });
  await loc.evaluate((el) => {
    el.style.removeProperty("color");
    for (const k of el.children) k.style.visibility = "";
  });
  const pixels = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height);
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    // The middle band, where the glyphs are: inset from the rounded corners and the icon disc.
    const d = x.getImageData(Math.floor(img.width * 0.3), Math.floor(img.height * 0.25), Math.max(1, Math.floor(img.width * 0.65)), Math.max(1, Math.floor(img.height * 0.5))).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
    return out;
  }, png.toString("base64"));
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const text = color.match(/\d+/g).slice(0, 3).map(Number);
  const lt = L(text);
  let min = Infinity;
  for (const p of pixels) {
    const lp = L(p);
    min = Math.min(min, (Math.max(lt, lp) + 0.05) / (Math.min(lt, lp) + 0.05));
  }
  return { color, min, pixels: pixels.length };
}

// How long a line or a moment reads (opacity at least 0.5): from its own animation (linear, keyframe opacities), and no
// longer than it stayed on the page after its delay. Frames under software GL are too sparse to time it by sampling.
const readable = (rec) => {
  const k = rec.anim?.keyframes.filter((f) => f.o !== null);
  if (!k?.length || !rec.gone) return 0;
  const at = (x) => {
    const j = k.findIndex((f) => f.at >= x);
    if (j <= 0) return k[Math.max(0, j)].o;
    const [a, b] = [k[j - 1], k[j]];
    return a.o + ((b.o - a.o) * (x - a.at)) / (b.at - a.at || 1);
  };
  let n = 0;
  for (let i = 0; i < 1000; i++) if (at((i + 0.5) / 1000) >= 0.5) n++;
  return Math.min((n / 1000) * rec.anim.duration, rec.gone - rec.at - rec.anim.delay);
};

// Steers the next roll to a token beside one of the person's outposts (the dice come from crypto.getRandomValues), so the
// roll pays them; returns the token.
async function steerPayingRoll(page) {
  return page.evaluate(() => {
    const g = window.__emberisle.getState();
    const st = g.state;
    const mine = st.vertices.filter((v) => v.building?.playerId === g.localId).flatMap((v) => v.hexes);
    const hex = st.hexes.find((h) => mine.includes(h.id) && h.pip && h.pip !== 7 && h.terrain !== "waste" && h.id !== st.robberHex && st.bank[h.terrain] > 2);
    const a = Math.max(1, hex.pip - 6);
    window.__queue = [a - 1, hex.pip - a - 1];
    if (!window.__steered) {
      window.__steered = true;
      const real = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (buf) => (window.__queue.length ? ((buf[0] = window.__queue.shift()), buf) : real(buf));
    }
    return hex.pip;
  });
}

async function practice(view) {
  const { ctx, page, tag } = await open(view);
  try {
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
    // Through the roll-off and setup to the person's first roll: no turn moment before the first roll phase.
    await playUntil(page, myRoll);
    const early = await page.evaluate(() => window.__turns.filter((t) => t.phase !== "roll").length);
    check(early === 0, `${tag}: no turn moment in the roll-off or setup`, early);

    // A full round: the person ends the turn, the bots play theirs, the turn passes back. A paying roll first.
    await quiet(page);
    const pip = await steerPayingRoll(page);
    const n0 = await page.evaluate(() => window.__lines.length);
    const own0 = await page.evaluate(() => window.__own.length);
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    await page.waitForFunction((n) => window.__lines.length > n, n0, { timeout: STEP_MS });
    await page.waitForTimeout(450);
    const lay = await layout(page);
    const boxes = await page.$$eval('[data-testid="gain-float"]', (els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    const shift = await page.evaluate(() => window.__lines.at(-1).stage);
    await page.screenshot({ path: `test-results/turn-gain-${view.width}x${view.height}-gain.png` });
    await page.waitForFunction(() => !document.querySelector('[data-testid="gain-floats"]'), null, { timeout: STEP_MS });
    const roll = await page.evaluate(({ n0, own0 }) => ({ lines: window.__lines.slice(n0), own: window.__own.slice(own0), rollUp: window.__rollUp }), { n0, own0 });
    const want = roll.own.filter((o) => o.d > 0).map((o) => `${o.r}+${o.d}`).sort();
    const got = roll.lines.map((l) => `${l.r}+${l.d}`).sort();
    console.log(`${tag}: rolled ${pip}; own ${JSON.stringify(want)}; lines ${JSON.stringify(roll.lines.map((l) => l.text))}`);
    check(got.length > 0 && got.join() === want.join(), `${tag}: one line per good the roll paid, right good and amount`, { want, got });
    check(roll.lines.every((l) => l.text === `+${l.d} ${l.r[0].toUpperCase()}${l.r.slice(1)}` && l.color === GREEN), `${tag}: lines read "+N Good" in the gain green`, roll.lines.map((l) => [l.text, l.color]));
    check(roll.lines.every((l) => !l.rollUp), `${tag}: no line mounts while the roll moment holds the centre`);
    const spans = roll.lines.map(readable);
    check(spans.every((s) => s >= 1200), `${tag}: each line readable for at least 1.2 s`, spans.map((s) => s.toFixed(0)));
    check(roll.lines.every((l) => l.gone - l.at <= 2600), `${tag}: the batch has left within 2.6 s`, roll.lines.map((l) => (l.gone - l.at).toFixed(0)));
    if (roll.lines.length > 1) {
      // Mounted together, each line's own animation starts 150 ms after the one before.
      const starts = roll.lines.map((l) => l.at + l.anim.delay);
      const gaps = starts.slice(1).map((t, i) => t - starts[i]);
      check(gaps.every((g) => g >= 140 && g <= 200), `${tag}: lines of one batch start about 150 ms apart`, gaps.map((g) => g.toFixed(0)));
    }
    check(roll.lines.every((l) => l.anim?.keyframes.some((k) => /translateY\(-/.test(k.tf ?? ""))), `${tag}: lines rise (a translateY keyframe)`);
    placement(tag, "gain lines", boxes, lay, shift);

    // A bank trade: −4 ore in red, +1 grain in green.
    await page.waitForFunction(() => window.__emberisle.getState().state.phase === "main", null, { timeout: STEP_MS });
    await page.evaluate(() => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      const me = st.players.find((p) => p.id === g.getState().localId);
      me.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 4 };
      st.seq += 1;
      g.setState({ state: st });
    });
    await page.waitForFunction(() => !document.querySelector('[data-testid="gain-floats"]'), null, { timeout: STEP_MS });
    const [n1, o1] = await page.evaluate(() => (window.__hold = "gain-floats") && [window.__lines.length, window.__own.length]);
    const traded = await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "bankTrade", give: "ore", want: "grain" }).ok);
    await page.waitForFunction((n) => window.__lines.length >= n + 2, n1, { timeout: STEP_MS });
    await page.waitForTimeout(450);
    await page.screenshot({ path: `test-results/turn-gain-${view.width}x${view.height}-trade.png` });
    const tradeLay = await layout(page);
    const tradeBoxes = await page.$$eval('[data-testid="gain-float"]', (els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    const tradeShift = await page.evaluate(() => window.__lines.at(-1).stage);
    const trade = await page.evaluate((n) => window.__lines.slice(n).map((l) => ({ text: l.text, color: l.color })), n1);
    const gave = await page.evaluate((o) => -window.__own.slice(o).find((x) => x.r === "ore").d, o1);
    const shades = [await contrast(page, "gain-float", 0), await contrast(page, "gain-float", 1)];
    await page.evaluate(() => window.__release());
    check(traded && trade.length === 2 && trade.some((l) => l.text === `−${gave} Ore` && l.color === RED) && trade.some((l) => l.text === "+1 Grain" && l.color === GREEN), `${tag}: a bank trade shows −${gave} Ore in red and +1 Grain in green`, trade);
    placement(`${tag} trade`, "gain and loss lines", tradeBoxes, tradeLay, tradeShift);
    for (const c of shades) check(c.min >= 3, `${tag}: ${c.color === RED ? "loss" : "gain"} text ≥ 3:1 against the pixels behind it`, { color: c.color, min: c.min.toFixed(2), pixels: c.pixels });
    await page.waitForFunction(() => !document.querySelector('[data-testid="gain-floats"]'), null, { timeout: STEP_MS });

    // Another seat's goods are never shown.
    const n2 = await page.evaluate(() => window.__lines.length);
    await page.evaluate(() => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      st.players.find((p) => p.id !== g.getState().localId).resources.ore += 3;
      st.seq += 1;
      g.setState({ state: st });
    });
    await page.waitForTimeout(1500);
    check((await page.evaluate(() => window.__lines.length)) === n2, `${tag}: another seat's gain shows no line`);

    // The turn passes round the bots and back to the person.
    const t0 = await page.evaluate(() => window.__turns.length);
    await page.evaluate(() => (window.__hold = "turn-moment") && window.__emberisle.getState().dispatch({ type: "endTurn" }));
    await page.waitForFunction(() => window.__emberisle.getState().state.current !== window.__emberisle.getState().localId, null, { timeout: STEP_MS });
    await page.waitForFunction(() => /^Waiting for /.test(document.querySelector('[data-testid="turn-banner"]')?.textContent ?? ""), null, { timeout: STEP_MS });
    const waiting = await page.evaluate(() => {
      const s = window.__emberisle.getState();
      return {
        banner: document.querySelector('[data-testid="turn-banner"]').textContent,
        bot: s.state.players.find((p) => p.id === s.state.current).name,
        roll: [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Roll"),
      };
    });
    check(waiting.banner.startsWith(`Waiting for ${waiting.bot}`) && !waiting.roll, `${tag}: on a bot's turn the banner says whom the person waits for, and there is no Roll`, waiting);
    await page.screenshot({ path: `test-results/turn-gain-${view.width}x${view.height}-waiting.png` });
    await page.evaluate((n) => (window.__t0 = n), t0);
    await playUntil(page, () => window.__turns.length > window.__t0);
    await page.waitForTimeout(400);
    const tlay = await layout(page);
    const tbox = await page.$$eval('[data-testid="turn-moment"]', (els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    const tshift = await page.evaluate(() => window.__turns.at(-1).stage);
    const cue = await page.evaluate(() => {
      const s = window.__emberisle.getState();
      const primaries = [...document.querySelectorAll("button")].filter((b) => b.checkVisibility() && b.classList.contains("bg-fg")).map((b) => b.textContent.trim());
      const seat = document.querySelector(`[data-testid="rail-${s.localId}"], [data-testid="seat-${s.localId}"]`);
      return { primaries, seatTurn: seat?.classList.contains("seat-turn"), current: seat?.querySelector("[aria-current]") !== null, banner: document.querySelector('[data-testid="turn-banner"]').textContent };
    });
    await page.screenshot({ path: `test-results/turn-gain-${view.width}x${view.height}-turn.png` });
    const tc = await contrast(page, "turn-moment");
    // The renderer refits the hole a frame after the HUD changes, so a moment can show against the old one: when the hole
    // changes under it, it places itself again. Under the held moment, make the hole run 168 px into the bottom stack with 120
    // px of board above it (as a refit on a short phone gives): its new centre is on the stack, and the board above has room.
    await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="turn-moment"]').parentElement.parentElement;
      const top = document.querySelector("[data-hud-stack]").getBoundingClientRect().top;
      window.__hole = ["top", "bottom"].map((k) => shell.style.getPropertyValue(`--hole-${k}`));
      shell.style.setProperty("--hole-top", `${top - 120}px`);
      shell.style.setProperty("--hole-bottom", `${innerHeight - top - 168}px`);
    });
    await page.waitForTimeout(300);
    // Only the moment's area moved (the renderer's own fit did not), so the hole to centre on is that area.
    const rlay = { ...(await layout(page)), hole: await page.$eval('[data-testid="turn-moment"]', (e) => e.parentElement.getBoundingClientRect().toJSON()) };
    const rbox = await page.$$eval('[data-testid="turn-moment"]', (els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    const rstage = await page.evaluate(() => window.__turns.at(-1).stage);
    await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="turn-moment"]').parentElement.parentElement;
      ["top", "bottom"].forEach((k, i) => shell.style.setProperty(`--hole-${k}`, window.__hole[i]));
    });
    placement(`${tag} refit`, '"Your turn" after the hole changed under it', rbox, rlay, rstage);
    await page.evaluate(() => window.__release());
    check(cue.primaries.length === 1 && cue.primaries[0] === "Roll", `${tag}: on the person's roll, Roll is the one filled primary`, cue.primaries);
    check(cue.seatTurn && cue.current && cue.banner.startsWith("Your turn"), `${tag}: the person's seat card wears the turn ring and the banner says "Your turn"`, cue);
    await page.waitForFunction(() => !document.querySelector('[data-testid="turn-moment"]'), null, { timeout: STEP_MS });
    const turn = await page.evaluate((n) => window.__turns[n], t0);
    check(turn.text === "Your turn", `${tag}: the moment reads "Your turn"`, turn.text);
    placement(tag, '"Your turn"', tbox, tlay, tshift);
    check(tc.min >= 3, `${tag}: "Your turn" text ≥ 3:1 against the pixels behind it`, { color: tc.color, min: tc.min.toFixed(2) });

    // An unmeasured one: play on to the person's next turn and time it untouched.
    await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "roll" }));
    await playUntil(page, (s) => s.state.phase === "main" && s.state.current === s.localId);
    await page.evaluate(() => (window.__t1 = window.__turns.length));
    await playUntil(page, () => window.__turns.length > window.__t1);
    await page.waitForFunction(() => !document.querySelector('[data-testid="turn-moment"]'), null, { timeout: STEP_MS });
    const t2 = await page.evaluate(() => window.__turns[window.__t1]);
    check(t2.gone - t2.at <= 2000 && readable(t2) >= 1200, `${tag}: untouched, "Your turn" is up about 1.6 s and gone within 2 s`, { up: (t2.gone - t2.at).toFixed(0), readable: readable(t2).toFixed(0) });

    // Over the whole game: every turn moment was the person's roll; every line was one of the person's own changes.
    const all = await page.evaluate(() => ({ turns: window.__turns.map((t) => ({ current: t.current, localId: t.localId, phase: t.phase })), lines: window.__lines.map((l) => ({ r: l.r, d: l.d, at: l.at })), own: window.__own }));
    check(all.turns.length >= 2 && all.turns.every((t) => t.current === t.localId && t.phase === "roll"), `${tag}: every turn moment was on the person's own roll`, all.turns.length);
    const stray = all.lines.filter((l) => !all.own.some((o) => o.r === l.r && o.d === l.d && o.at <= l.at && l.at - o.at < 2500));
    check(stray.length === 0, `${tag}: every line shown was one of the person's own hand changes`, stray);
    // One thing at a time: no gain line is up while "Your turn" is.
    const clash = await page.evaluate(() => window.__turns.flatMap((t) => window.__lines.filter((l) => l.at < (t.gone ?? Infinity) && t.at < (l.gone ?? Infinity)).map((l) => l.text)));
    check(clash.length === 0, `${tag}: no gain line is up while "Your turn" is`, clash);

    // A watcher sees no lines.
    const n3 = await page.evaluate(() => window.__lines.length);
    await page.evaluate(() => {
      const g = window.__emberisle;
      g.setState({ spectator: true });
      const st = structuredClone(g.getState().state);
      for (const p of st.players) p.resources.wool += 2;
      st.seq += 1;
      g.setState({ state: st });
    });
    await page.waitForTimeout(1500);
    check((await page.evaluate(() => window.__lines.length)) === n3, `${tag}: a watcher sees no lines`);
  } catch (e) {
    console.error(`${tag}:`, e);
    failures++;
  } finally {
    await ctx.close();
  }
}

async function reduced() {
  const { ctx, page, tag } = await open({ width: 1280, height: 720 }, { reduced: true });
  try {
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
    await playUntil(page, myRoll);
    await quiet(page);
    await steerPayingRoll(page);
    const n0 = await page.evaluate(() => window.__lines.length);
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    await page.waitForFunction((n) => window.__lines.length > n, n0, { timeout: STEP_MS });
    await page.waitForFunction(() => !document.querySelector('[data-testid="gain-floats"]'), null, { timeout: STEP_MS });
    const lines = await page.evaluate((n0) => window.__lines.slice(n0), n0);
    await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "endTurn" }));
    await page.evaluate(() => (window.__t0 = window.__turns.length));
    await playUntil(page, () => window.__turns.length > window.__t0);
    await page.waitForFunction(() => !document.querySelector('[data-testid="turn-moment"]'), null, { timeout: STEP_MS });
    const r = { lines, turns: await page.evaluate(() => window.__turns) };
    console.log(`${tag}: ${JSON.stringify(r.lines.map((l) => ({ text: l.text, at: l.at.toFixed(0), gone: l.gone?.toFixed(0), anim: l.anim && { d: l.anim.duration, delay: l.anim.delay } })))}`);
    const recs = [...r.lines, r.turns.at(-1)];
    check(recs.every((x) => x.animation === "moment-fade"), `${tag}: lines and the turn moment fade only (moment-fade)`, recs.map((x) => x.animation));
    check(recs.every((x) => x.frames.every((f) => f.tf === "none") && x.anim.keyframes.every((k) => !k.tf)), `${tag}: no transform in the keyframes or on any frame (no rise, no scale)`);
    check(recs.every((x) => x.anim.duration >= 1500 && x.anim.keyframes.some((k) => k.o === 0) && x.anim.keyframes.some((k) => k.o === 1)), `${tag}: they still fade in and out, over at least 1.5 s`, recs.map((x) => [x.anim.duration, x.anim.keyframes.map((k) => k.o)]));
    check(r.lines.map(readable).every((s) => s >= 1200), `${tag}: each line readable for at least 1.2 s`, r.lines.map(readable).map((s) => s.toFixed(0)));
  } catch (e) {
    console.error(`${tag}:`, e);
    failures++;
  } finally {
    await ctx.close();
  }
}

async function hotseat() {
  const { ctx, page, tag } = await open({ width: 1280, height: 720 });
  try {
    await page.getByRole("button", { name: "Four seats, one table" }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
    await playUntil(page, myRoll);
    await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "roll" }));
    await playUntil(page, (s) => s.state.phase === "main");
    const t0 = await page.evaluate(() => window.__turns.length);
    const next = await page.evaluate(() => {
      const s = window.__emberisle.getState();
      s.dispatch({ type: "endTurn" });
      const st = window.__emberisle.getState().state;
      return st.players.find((p) => p.id === st.current).name;
    });
    await page.waitForFunction((n) => window.__turns.length > n, t0, { timeout: STEP_MS });
    await page.waitForTimeout(400);
    await page.screenshot({ path: "test-results/turn-gain-hotseat.png" });
    const t = await page.evaluate((n) => window.__turns[n], t0);
    check(t.text === `${next}'s turn`, `${tag} hotseat: the moment names the seat taking the device`, { text: t.text, next });
  } catch (e) {
    console.error(`${tag} hotseat:`, e);
    failures++;
  } finally {
    await ctx.close();
  }
}

// A mid-game reconnect through the real connectTable and store, over a socket the proof controls (page.routeWebSocket): the
// person's seat s0/p0 is welcomed at seq 20 (turn 2, main, p1's turn), the socket is dropped, the normal backoff redials,
// and the same seat is welcomed again at seq 22 on their own roll (turn 3) with timber +2. A first load or a rejoin replays
// nothing: no "Your turn", no "+2 Timber", and nothing left over from before the drop. A live change after the rejoin still shows.
async function reconnect() {
  const view = { width: 390, height: 844, touch: true, insets: { top: 47, right: 0, bottom: 34, left: 0 } };
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
          ws.send(JSON.stringify({ type: "welcome", code: "ABCD", you: "p0", host: false, secret: "s3cret", chat: [] }));
          // The state follows the welcome once the proof has built it (the first dial is at page load).
          while (!states.length) await new Promise((r) => setTimeout(r, 20));
          ws.send(JSON.stringify(states.shift()));
        });
      });
    },
  });
  const legal = { outpost: [], path: [], stronghold: [], wayfarer: [], steal: {}, discard: 0, actions: [] };
  try {
    const base = await page.evaluate(async () => {
      const { createGame } = await import("/src/lib/game/board.ts");
      return createGame({ seed: 7, humans: [{ name: "Me" }], bots: 3 });
    });
    const at = (seq, turn, phase, current, timber) => ({
      type: "state",
      you: "p0",
      legal,
      game: { ...base, seq, turn, phase, current, players: base.players.map((p) => (p.id === "p0" ? { ...p, resources: { ...p.resources, timber } } : p)) },
    });
    const own = () => page.evaluate(() => window.__emberisle.getState().state?.players.find((p) => p.id === "p0")?.resources.timber);
    const shown = () => page.evaluate(() => ({ turns: window.__turns.length, lines: window.__lines.length, up: !!document.querySelector('[data-testid="turn-moment"], [data-testid="gain-floats"]') }));
    const seq = () => page.evaluate(() => window.__emberisle.getState().state?.seq);
    const push = (m) => sockets.at(-1).send(JSON.stringify(m));
    // Nothing new shows for a while after `n` has loaded: polled for 900 ms, longer than the store-to-DOM round trip.
    const stays = async (label, was) => {
      const end = Date.now() + 900;
      let now = await shown();
      while (Date.now() < end && now.turns === was.turns && now.lines === was.lines && !now.up) now = await shown();
      check(now.turns === was.turns && now.lines === was.lines && !now.up, `${tag} ${label}: nothing shown`, now);
    };

    states = [at(20, 2, "main", "p1", 1)];
    await page.waitForFunction(() => window.__emberisle?.getState().state?.seq === 20, null, { timeout: STEP_MS });
    await stays("first load, seq 20", { turns: 0, lines: 0 });

    // A float pending from before the drop must not outlive it: gain a good live, drop at once.
    push(at(21, 2, "main", "p1", 2));
    await page.waitForSelector('[data-testid="gain-float"]', { timeout: STEP_MS });
    const before = await shown();
    states = [at(22, 3, "roll", "p0", 4)];
    sockets.at(-1).close();
    await page.waitForFunction(() => /Reconnecting/.test(window.__emberisle.getState().error ?? ""), null, { timeout: STEP_MS });
    await page.waitForFunction(() => window.__emberisle.getState().state?.seq === 22, null, { timeout: STEP_MS });
    check(sent.welcomes === 2, `${tag} reconnect: the seat was re-welcomed through the redial`, sent);
    check((await own()) === 4, `${tag} reconnect: the restored hand holds timber +2 over the last seen`, await own());
    await stays("rejoin onto own roll at seq 22 (no Your turn, no +2 Timber, floats from before the drop gone)", before);
    check((await page.locator('[data-testid="gain-float"]').count()) === 0, `${tag} reconnect: floats pending from before the drop were cancelled`);

    // Live changes after the rejoin still show.
    push(at(23, 3, "roll", "p0", 5));
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="gain-float"]')].some((e) => e.textContent === "+1 Timber"), null, { timeout: STEP_MS });
    check(true, `${tag} reconnect: a live gain after the rejoin shows "+1 Timber"`);
    push(at(24, 3, "main", "p0", 5));
    push(at(25, 3, "main", "p1", 5));
    push(at(26, 4, "roll", "p0", 5));
    await page.waitForFunction(() => document.querySelector('[data-testid="turn-moment"]')?.textContent === "Your turn", null, { timeout: STEP_MS });
    check(true, `${tag} reconnect: a live turn after the rejoin shows "Your turn"`);
  } catch (e) {
    console.error(`${tag} reconnect:`, e);
    failures++;
  } finally {
    await ctx.close();
  }
}

const ONLY = process.env.ONLY;
try {
  for (const v of VIEWS) if (!ONLY || ONLY === `${v.width}x${v.height}`) await practice(v);
  if (!ONLY || ONLY === "reduced") await reduced();
  if (!ONLY || ONLY === "hotseat") await hotseat();
  if (!ONLY || ONLY === "reconnect") await reconnect();
  check(errors.length === 0, "zero console errors", errors);
} finally {
  await browser.close();
  await vite.close();
}
console.log(failures ? `turn-gain-prove: ${failures} failed` : "turn-gain-prove: all passed");
process.exit(failures ? 1 : 0);
