// Jarrod's playtest: "not intuitive on when it's your turn", and gains "too quick". In practice against the isle at 1280x720
// and, with safe-area insets emulated over CDP, 390x844 (47 top, 34 bottom), 360x640 (24 top, 16 bottom) and 844x390 (47
// left, 47 right, 21 bottom; the HUD is a left column), played through the real roll-off and setup:
// - "Your turn" (data-testid="turn-moment") shows when a bot's turn passes to the person and, untouched, is gone within
//   2 s and readable (opacity ≥ 0.5) for at least 1.2 s; it never shows on a bot's turn, nor in the roll-off or setup; while
//   it is the person's roll, Roll is the one filled primary and their seat card wears the turn ring (seat-turn,
//   aria-current); on a bot's turn the banner reads "Wait for {bot} …" and there is no Roll;
// - a roll steered to pay the person shows its goods on the hand only (#773): one +N tab (data-testid="resource-flash") per
//   good gained, with the right good and amount, on that good's card, which fills with the good's colour and lifts (a
//   translateY keyframe); the cues of one roll start together; each readable for at least 1.2 s and gone within 3.1 s
//   (2500 ms held, 500 ms fade); nothing ever shows over the island (no "gain-float", the island text that #773 removed);
// - a bank trade shows the ore given ("−4", or the harbour's rate) as a light pill on a dipped card and "+1" on the
//   lifted Wheat card; a state where only another seat gains shows nothing, and so does a watcher's; every cue shown in the
//   whole game is one of the person's own hand changes;
// - each tab sits centred on its own card, inside the safe area, with nothing covering or clipping it, and its text is at
//   least 4.5:1 against the pixels behind it; "Your turn" never covers one;
// - placement, for "Your turn": centred on the island's hole (`__isle.insets()`), or
//   moved off it only when the centre was covered (data-stage "moved"), never "crowded"; inside the safe area and the hole;
//   over no HUD control or chip, except the status line when the moment says it had to ("over-status": a short phone);
// - when the hole changes under a showing "Your turn" (a refit), it places itself again by the same rules;
// - contrast: each text's colour against every pixel behind it (the element frozen at full opacity and shot with its text
//   transparent, so the glass and the board under it), the lowest ratio at least 3:1;
// - reduced motion at 1280x720: the hand's cues and the turn moment are fully static (no animation, no transform on any
//   frame, the gain's fill a still highlight) for at least 1.5 s, each cue still readable for 1.2 s.
// Hotseat at 1280x720: the moment names the seat taking the device ("Seat 2's turn"). A reconnect at 390x844 replays nothing
// (reconnect(): a real connectTable over a controlled socket) and a live change after it still shows. Zero console errors.
// Readable times come from each element's own animation (keyframes, duration, delay) capped by how long it stayed on the
// page: software GL frames are too sparse to time it by sampling. For the placement and contrast measures only, the
// moment being measured is held on screen (__hold), and "Your turn" is timed again on a later turn left untouched.
// Expiry also reports measured main-thread stalls, as roll-moment-prove does: a software-GL screenshot may block timers.
// The 3100 ms running-time limit (2600 before #825), with a separate 4000 ms raw cap and an exact 3000 ms cue-duration check.
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
const RED = "rgb(138, 34, 25)";
const INK = "rgb(38, 61, 60)";
const RAISED = "rgb(255, 255, 255)";
// Each good's colour and side colour (styles.css :root): a gain fills the card with the first and its tab is the second.
const PAINT = {
  timber: ["rgb(47, 106, 79)", "rgb(23, 61, 53)"],
  clay: ["rgb(184, 83, 61)", "rgb(116, 55, 43)"],
  wool: ["rgb(178, 206, 128)", "rgb(97, 119, 68)"],
  grain: ["rgb(227, 196, 98)", "rgb(140, 114, 45)"],
  ore: ["rgb(99, 116, 138)", "rgb(65, 77, 91)"],
};
// A cue's whole life on the card: FLASH_MS (2500) held, then a 500 ms fade (Hand.tsx CUE_MS).
const CUE_MS = 3000;
const RESOURCE_LABEL = { timber: "Wood", clay: "Brick", wool: "Sheep", grain: "Wheat", ore: "Stone" };
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
  // The island text #773 removed: any mount of it at all is a failure.
  window.__floats = 0;
  window.__own = [];
  window.__rollUp = [];
  // Every interval gap beyond 20 ms contains time no browser timer could run. Never infer stalls from a failed assertion.
  const gaps = [];
  let lastTick = performance.now();
  setInterval(() => {
    const now = performance.now();
    if (now - lastTick > 20) gaps.push([lastTick, now]);
    lastTick = now;
  }, 10);
  window.__stall = (a, b) => gaps.reduce((n, [x, y]) => n + Math.max(0, Math.min(y, b) - Math.max(x, a) - 10), 0);
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
    window.__floats += document.querySelectorAll('[data-testid="gain-float"], [data-testid="gain-floats"]').length;
    for (const el of document.querySelectorAll('[data-testid="turn-moment"], [data-testid="resource-flash"]')) {
      if (live.has(el)) continue;
      const turn = el.dataset.testid === "turn-moment";
      // A hand cue: the tab, its card's fill or red ring, and the card's own lift or dip (WAAPI, started with the cue).
      const card = turn ? null : el.closest(".goods-card");
      const still = (e) => e && { name: getComputedStyle(e).animationName, opacity: getComputedStyle(e).opacity, animations: e.getAnimations().length, fill: getComputedStyle(e).backgroundColor };
      const rec = {
        at: performance.now(),
        text: el.textContent,
        current: s?.state?.current,
        localId: s?.localId,
        mode: s?.mode,
        phase: s?.state?.phase,
        rollUp: !!document.querySelector('[data-testid="roll-moment"]'),
        color: getComputedStyle(el).color,
        bg: getComputedStyle(el).backgroundColor,
        animation: getComputedStyle(el).animationName,
        lit: card && still(card.querySelector('[data-testid="goods-lit"]')),
        lost: card && still(card.querySelector('[data-testid="goods-lost"]')),
        move: (() => {
          const a = card?.getAnimations().find((x) => x.effect?.target === card && x.effect.getKeyframes().some((k) => "transform" in k));
          return a ? { duration: a.effect.getTiming().duration, keyframes: a.effect.getKeyframes().map((k) => k.transform) } : null;
        })(),
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
      if (el.dataset.testid !== "turn-moment") continue;
      const host = el;
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
  let frameId = 0;
  const frame = () => {
    frameId++;
    for (const [el, rec] of live) {
      if (!el.isConnected) continue;
      const cs = getComputedStyle(el);
      // A tab's own transform is none; the card carries the lift, so its transform is the one that moves the cue.
      const tf = el.dataset.testid === "turn-moment" ? cs.transform : getComputedStyle(el.closest(".goods-card")).transform;
      rec.frames.push({ t: performance.now(), o: Number(cs.opacity), tf, box: box(el) });
      // #1085: same-callback identity and placement at this read, not the moment's final stage.
      const sample = rec.frames.at(-1);
      sample.frameId = frameId;
      if (el.dataset.testid === "turn-moment") {
        const shell = getComputedStyle(el.parentElement.parentElement);
        sample.placement = {
          stage: el.dataset.stage, shift: Number(el.dataset.shift), area: box(el.parentElement),
          hole: Object.fromEntries(["top", "right", "bottom", "left"].map(k => [k, shell.getPropertyValue(`--hole-${k}`)])),
        };
      }
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
  // No roll in the page comes up 7. A bot's 7 before the person's first roll once parked the wayfarer on the seat's only
  // paying token (CI, #618: "no token beside p0's outposts can pay"), and a 7 later would do the same to the second
  // steered roll. rollDie draws one Uint32 per die and rejects values at or over its limit, so the dice are the accepted
  // single-Uint32 draws in pairs; the second of a pair that would complete a 7 is nudged to the next face. The seat's own
  // steered rolls (steerPayingRoll) queue their dice ahead of this. Table codes draw a Uint8Array and are untouched.
  await page.addInitScript(() => {
    const real = crypto.getRandomValues.bind(crypto);
    const limit = Math.floor(0x1_0000_0000 / 6) * 6;
    let first = null;
    crypto.getRandomValues = (buf) => {
      real(buf);
      if (!(buf instanceof Uint32Array) || buf.length !== 1 || buf[0] >= limit) return buf;
      const die = 1 + (buf[0] % 6);
      if (first === null) first = die;
      else {
        if (first + die === 7) buf[0] += 1;
        first = null;
      }
      return buf;
    };
  });
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
      return { phase: s.state?.phase, current: s.state?.current, localId: s.localId, offer: !!s.offer, moment: !!document.querySelector('[data-testid="turn-moment"]'), cues: !!document.querySelector('[data-testid="resource-flash"]'), roll: !!document.querySelector('[data-testid="roll-moment"]'), held: window.__held.size, turns: window.__turns.length };
    });
    throw new Error(`stuck before ${until}: ${JSON.stringify(at)}`);
  }
}

// Nothing showing: the measured roll waits until no hand cue or moment has shown for 1.5 s.
async function quiet(page) {
  await page.evaluate(async () => {
    const busy = () => document.querySelector('[data-testid="turn-moment"], [data-testid="resource-flash"], [data-testid="roll-moment"]');
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
    // The hole the map is fitted to, as the HUD's moments read it (#625): not the live one a tray or panel may be changing.
    const sh = document.querySelector("canvas").parentElement.style;
    const i = Object.fromEntries(["top", "right", "bottom", "left"].map((k) => [k, parseFloat(sh.getPropertyValue(`--hole-${k}`))]));
    const hole = { left: i.left, top: i.top, right: innerWidth - i.right, bottom: innerHeight - i.bottom };
    const hud = [];
    const sel = 'button, a, input, select, [role="button"], [data-testid="turn-banner"], [data-testid="banner"], [data-testid="hand-dock"], [data-testid="log-line"], [data-testid="dice-row"], [data-testid="turn-countdown"]';
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('[data-testid="resource-flash"], [data-testid="turn-moment"]')) continue;
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

// Where the hand's tabs sit: each centred on its own card (0.5 px), growing out of its top edge, inside the viewport and the
// safe area, and on top: hit testing at its top edge finds the tab (allowed to take taps for the probe), so no scroller
// clips it and nothing covers it.
async function tabs(page, tag, what, lay) {
  const got = await page.evaluate(() => [...document.querySelectorAll('[data-testid="resource-flash"]')].map((t) => {
    const card = t.closest(".goods-card");
    const a = t.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    t.style.pointerEvents = "auto";
    const hit = document.elementFromPoint(a.left + a.width / 2, a.top + 1);
    t.style.pointerEvents = "";
    // #825: both pills stand 20 px above the edge (24 px on the wide fine-pointer layout).
    return { r: t.dataset.resource, card: card.dataset.testid, box: a.toJSON(), off: a.left + a.width / 2 - (c.left + c.width / 2), above: c.top - a.top, want: matchMedia("(min-width: 1280px) and (pointer: fine) and (min-height: 481px)").matches ? 24 : 20, top: hit === t || t.contains(hit) };
  }));
  check(got.length > 0 && got.every((t) => t.card === `resource-${t.r}`), `${tag}: ${what} sit on their own goods' cards`, got.map((t) => [t.r, t.card]));
  check(got.every((t) => Math.abs(t.off) <= 0.5 && Math.abs(t.above - t.want) <= 0.5), `${tag}: ${what} are centred on their cards and grow out of the top edge`, got.map((t) => [t.off.toFixed(2), t.above.toFixed(2)]));
  check(got.every((t) => inside(t.box, lay.safe)), `${tag}: ${what} inside the safe area`, got.map((t) => t.box));
  check(got.every((t) => t.top), `${tag}: nothing covers or clips ${what}`, got.map((t) => [t.r, t.top]));
  return got;
}

// WCAG contrast of the element's text colour against every pixel behind its text: the element is frozen at full opacity,
// screenshotted with its text and icon transparent (the glass and the board under it stay), and the lowest ratio counts.
async function contrast(page, testid, index = 0, band = 0.65) {
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
  const pixels = await page.evaluate(async ({ b64, band }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height);
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    // The middle band, where the glyphs are: inset from the rounded corners and the icon disc.
    const d = x.getImageData(Math.floor(img.width * 0.3), Math.floor(img.height * 0.25), Math.max(1, Math.floor(img.width * band)), Math.max(1, Math.floor(img.height * 0.5))).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
    return out;
  }, { b64: png.toString("base64"), band });
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
  if (!rec.gone) return 0;
  if (!k?.length) return rec.gone - rec.at;
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
    // A random deal can leave the seat's outposts beside only thin stock, so take the best-stocked token that still pays
    // at least one good rather than none (and say which seat and tokens when nothing can pay).
    const paying = st.hexes.filter((h) => mine.includes(h.id) && h.pip && h.pip !== 7 && h.terrain !== "waste" && h.id !== st.robberHex && st.bank[h.terrain] > 0);
    const hex = paying.sort((x, y) => st.bank[y.terrain] - st.bank[x.terrain])[0];
    if (!hex) throw new Error(`no token beside ${g.localId}'s outposts can pay: ${JSON.stringify(st.hexes.filter((h) => mine.includes(h.id)).map((h) => [h.id, h.terrain, h.pip, st.bank[h.terrain]]))}`);
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
    await tabs(page, tag, "the roll's +N tabs", lay);
    await page.screenshot({ path: `test-results/turn-gain-${view.width}x${view.height}-gain.png` });
    await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'), null, { timeout: STEP_MS });
    const roll = await page.evaluate(({ n0, own0 }) => ({ lines: window.__lines.slice(n0).map(l => ({ ...l, stalled: window.__stall(l.at, l.gone) })), own: window.__own.slice(own0), rollUp: window.__rollUp }), { n0, own0 });
    const want = roll.own.filter((o) => o.d > 0).map((o) => `${o.r}+${o.d}`).sort();
    const got = roll.lines.map((l) => `${l.r}+${l.d}`).sort();
    console.log(`${tag}: rolled ${pip}; own ${JSON.stringify(want)}; cues ${JSON.stringify(roll.lines.map((l) => `${RESOURCE_LABEL[l.r]} ${l.text}`))}`);
    check(got.length > 0 && got.join() === want.join(), `${tag}: one cue per good the roll paid, right good and amount`, { want, got });
    check(roll.lines.every((l) => l.text === `+${l.d}` && l.color === INK && l.bg === RAISED), `${tag}: each reads "+N" in dark ink on the white pill`, roll.lines.map((l) => [l.r, l.text, l.color, l.bg]));
    check(roll.lines.every((l) => l.lit?.fill === PAINT[l.r][0] && !l.lost), `${tag}: each gained card fills with its good's colour`, roll.lines.map((l) => [l.r, l.lit?.fill]));
    check(await page.evaluate(() => window.__floats) === 0, `${tag}: no "+N Good" text over the island`);
    const spans = roll.lines.map(readable);
    check(spans.every((s) => s >= 1200), `${tag}: each cue readable for at least 1.2 s`, spans.map((s) => s.toFixed(0)));
    const expiry = roll.lines.map(l => ({ raw: l.gone - l.at, stalled: l.stalled, running: l.gone - l.at - l.stalled }));
    check(roll.lines.every(l => l.anim?.duration === CUE_MS && l.lit?.animations === 1 && l.move?.duration === CUE_MS), `${tag}: the tab, the fill and the lift each run exactly 3000 ms (2500 ms held, 500 ms fade)`, roll.lines.map((l) => [l.anim?.duration, l.move?.duration]));
    check(expiry.every(t => t.running <= 3100), `${tag}: the batch has left within 3.1 s, excluding measured stalls`, expiry);
    check(expiry.every(t => t.raw <= 4000), `${tag}: raw expiry stays below the 4 s guard`, expiry);
    if (roll.lines.length > 1) {
      const starts = roll.lines.map((l) => l.at);
      check(Math.max(...starts) - Math.min(...starts) <= 100, `${tag}: the cues of one roll start together`, starts.map((t) => (t - starts[0]).toFixed(0)));
    }
    check(roll.lines.every((l) => l.move?.keyframes.some((k) => /translateY\(-/.test(k ?? ""))), `${tag}: gained cards lift (a translateY keyframe)`);

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
    await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'), null, { timeout: STEP_MS });
    const [n1, o1] = await page.evaluate(() => (window.__hold = "resource-flash") && [window.__lines.length, window.__own.length]);
    const traded = await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "bankTrade", give: "ore", want: "grain" }).ok);
    await page.waitForFunction((n) => window.__lines.length >= n + 2, n1, { timeout: STEP_MS });
    await page.waitForTimeout(450);
    await page.screenshot({ path: `test-results/turn-gain-${view.width}x${view.height}-trade.png` });
    const tradeLay = await layout(page);
    await tabs(page, `${tag} trade`, "the trade's tabs", tradeLay);
    const trade = await page.evaluate((n) => window.__lines.slice(n).map((l) => ({ r: l.r, text: l.text, color: l.color, bg: l.bg, lit: l.lit?.fill ?? null, lost: !!l.lost, move: l.move?.keyframes })), n1);
    const gave = await page.evaluate((o) => -window.__own.slice(o).find((x) => x.r === "ore").d, o1);
    const shades = [await contrast(page, "resource-flash", 0, 0.5), await contrast(page, "resource-flash", 1, 0.5)];
    await page.evaluate(() => window.__release());
    const stone = trade.find((l) => l.r === "ore");
    const wheat = trade.find((l) => l.r === "grain");
    check(traded && trade.length === 2 && stone?.text === `−${gave}` && stone.color === "rgb(255, 255, 255)" && stone.bg === RED && stone.lost && !stone.lit, `${tag}: a bank trade shows −${gave} on Stone as a red pill in white, the card ringed red`, trade);
    check(wheat?.text === "+1" && wheat.bg === PAPER && wheat.lit === PAINT.grain[0], `${tag}: and +1 on the filled Wheat card`, wheat);
    check(stone?.move?.some((k) => /translateY\(2px\)/.test(k ?? "")) && wheat?.move?.some((k) => /translateY\(-/.test(k ?? "")), `${tag}: the given card dips and the received card lifts`, { stone: stone?.move, wheat: wheat?.move });
    for (const c of shades) check(c.min >= 4.5, `${tag}: ${c.color === INK ? "gain" : "loss"} tab text ≥ 4.5:1 against the pixels behind it`, { color: c.color, min: c.min.toFixed(2), pixels: c.pixels });
    await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'), null, { timeout: STEP_MS });

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
    check((await page.evaluate(() => window.__lines.length)) === n2, `${tag}: another seat's gain shows no cue`);

    // The turn passes round the bots and back to the person.
    const t0 = await page.evaluate(() => window.__turns.length);
    await page.evaluate(() => (window.__hold = "turn-moment") && window.__emberisle.getState().dispatch({ type: "endTurn" }));
    await page.waitForFunction(() => window.__emberisle.getState().state.current !== window.__emberisle.getState().localId, null, { timeout: STEP_MS });
    await page.waitForFunction(() => /^Wait for /.test(document.querySelector('[data-testid="turn-banner"]')?.textContent ?? ""), null, { timeout: STEP_MS });
    const waiting = await page.evaluate(() => {
      const s = window.__emberisle.getState();
      return {
        banner: document.querySelector('[data-testid="turn-banner"]').textContent,
        bot: s.state.players.find((p) => p.id === s.state.current).name,
        roll: [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Roll"),
      };
    });
    check(waiting.banner.startsWith(`Wait for ${waiting.bot}`) && !waiting.roll, `${tag}: on a bot's turn the banner says whom the person waits for, and there is no Roll`, waiting);
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
    check(cue.seatTurn && cue.current && cue.banner === "Roll the dice", `${tag}: the person's seat card wears the turn ring and the banner leads with Roll`, cue);
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
    const stray = all.lines.filter((l) => !all.own.some((o) => o.r === l.r && o.d === l.d && o.at <= l.at && l.at - o.at < 3000));
    check(stray.length === 0, `${tag}: every cue shown was one of the person's own hand changes`, stray);
    // The turn moment no longer waits on gains (#773: useFloatsUp is gone), so a cue may be up with it; it never covers one.
    const clash = await page.evaluate(() => window.__turns.flatMap((t) => window.__lines.filter((l) => l.at < (t.gone ?? Infinity) && t.at < (l.gone ?? Infinity)).filter((l) => t.frames.some((a) => l.frames.some((b) => Math.abs(a.t - b.t) < 50 && a.box.left < b.box.right && b.box.left < a.box.right && a.box.top < b.box.bottom && b.box.top < a.box.bottom))).map((l) => l.text)));
    check(clash.length === 0, `${tag}: "Your turn" never covers a hand tab`, clash);
    if (clash.length) {
      const diagnostic = await page.evaluate(() => window.__turns.flatMap(t => window.__lines
        .filter(l => l.at < (t.gone ?? Infinity) && t.at < (l.gone ?? Infinity))
        .flatMap(l => {
          let pairCount = 0, firstPair = null, sameFramePair = null;
          for (const a of t.frames) for (const b of l.frames) {
            if (Math.abs(a.t - b.t) < 50 && a.box.left < b.box.right && b.box.left < a.box.right && a.box.top < b.box.bottom && b.box.top < a.box.bottom) {
              const pair = { turn: a, tab: b, deltaMs: a.t - b.t, sameFrame: a.frameId === b.frameId };
              pairCount++;
              firstPair ??= pair;
              if (pair.sameFrame) sameFramePair ??= pair;
            }
          }
          return pairCount ? [{ turn: { text: t.text, at: t.at, gone: t.gone }, tab: { text: l.text, resource: l.r, delta: l.d, at: l.at, gone: l.gone }, pairCount, firstPair, sameFramePair }] : [];
        })));
      console.error("turn-gain-overlap-diagnostic " + JSON.stringify({ tag, matches: diagnostic }));
    }
    check(await page.evaluate(() => window.__floats) === 0, `${tag}: over the whole game, no gain text ever mounted over the island`);

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
    check((await page.evaluate(() => window.__lines.length)) === n3, `${tag}: a watcher sees no cues`);
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
    await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'), null, { timeout: STEP_MS });
    const lines = await page.evaluate((n0) => window.__lines.slice(n0), n0);
    await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "endTurn" }));
    await page.evaluate(() => (window.__t0 = window.__turns.length));
    await playUntil(page, () => window.__turns.length > window.__t0);
    await page.waitForFunction(() => !document.querySelector('[data-testid="turn-moment"]'), null, { timeout: STEP_MS });
    const r = { lines, turns: await page.evaluate(() => window.__turns) };
    console.log(`${tag}: ${JSON.stringify(r.lines.map((l) => ({ text: l.text, at: l.at.toFixed(0), gone: l.gone?.toFixed(0), anim: l.anim && { d: l.anim.duration, delay: l.anim.delay } })))}`);
    const recs = [...r.lines, r.turns.at(-1)];
    check(recs.every((x) => x.animation === "none" && x.anim === null), `${tag}: all cues are fully static under reduced motion`, recs.map((x) => x.animation));
    check(r.lines.length > 0 && r.lines.every((l) => l.move === null), `${tag}: no card lifts or dips (no WAAPI transform)`, r.lines.map((l) => l.move));
    check(r.lines.every((l) => l.lit && l.lit.name === "none" && l.lit.opacity === "1" && l.lit.animations === 0 && l.lit.fill === PAINT[l.r][0]), `${tag}: the gain's fill is a still highlight in the good's colour`, r.lines.map((l) => l.lit));
    check(await page.evaluate(() => window.__floats) === 0, `${tag}: no gain text over the island`);
    check(recs.every((x) => x.frames.every((f) => f.tf === "none" && f.o === 1)), `${tag}: no fade, rise or scale on any frame`);
    check(recs.every((x) => x.gone - x.at >= 1500), `${tag}: static cues retain a readable hold`, recs.map((x) => x.gone - x.at));
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
    const shown = () => page.evaluate(() => ({ turns: window.__turns.length, lines: window.__lines.length, up: !!document.querySelector('[data-testid="turn-moment"], [data-testid="resource-flash"]') }));
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

    // A cue from before the drop must not outlive it: gain a good live, drop at once.
    push(at(21, 2, "main", "p1", 2));
    await page.waitForSelector('[data-testid="resource-flash"]', { timeout: STEP_MS });
    const before = await shown();
    states = [at(22, 3, "roll", "p0", 4)];
    sockets.at(-1).close();
    await page.waitForFunction(() => /Reconnecting/.test(window.__emberisle.getState().error ?? ""), null, { timeout: STEP_MS });
    await page.waitForFunction(() => window.__emberisle.getState().state?.seq === 22, null, { timeout: STEP_MS });
    check(sent.welcomes === 2, `${tag} reconnect: the seat was re-welcomed through the redial`, sent);
    check((await own()) === 4, `${tag} reconnect: the restored hand holds timber +2 over the last seen`, await own());
    await stays("rejoin onto own roll at seq 22 (no Your turn, no +2 on Wood, the cue from before the drop gone)", before);
    check((await page.locator('[data-testid="resource-flash"]').count()) === 0, `${tag} reconnect: the cue from before the drop was cancelled`);

    // Live changes after the rejoin still show.
    push(at(23, 3, "roll", "p0", 5));
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="resource-flash"]')].some((e) => e.textContent === "+1" && e.dataset.resource === "timber"), null, { timeout: STEP_MS });
    check(true, `${tag} reconnect: a live gain after the rejoin shows "+1" on Wood`);
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
