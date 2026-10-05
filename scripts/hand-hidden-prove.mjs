// #439: the hand bar is not on the table until the seat has held a good this game (or the phase is roll/main). At 1280x720 and
// 390x844 (touch), with and without prefers-reduced-motion, on a hotseat table played through the real roll-off and setup:
//  - roll-off and every setup step before the second outpost pays: 0 hand tiles, no hand-dock, and the HUD sits lower, so the
//    hole the island is fitted to (`__isle.insets().bottom`) is bigger by about the hand's height;
//  - the second outpost paying brings the hand in (5 tiles) mounted at its full height in that same commit, rising over 220 ms
//    with opacity and translateY only (read at the animation's midpoint: opacity in between, height already final, no layout
//    property in the keyframes); under reduced motion it is a 1 ms step;
//  - the island is fitted to the hole WITH the hand: forcing `__isle.remeasure()` once everything has settled moves no vertex
//    by more than 1 px, when the hand arrives and when it goes (a seat that has held nothing taking the turn);
//  - the hand stays once held: spending down to 0 keeps it on the table, zero cards greyed;
//  - zero console errors.
// Run: npm run hand-hidden-prove
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8439;
const STEP_MS = 15_000;
const VIEWS = [
  { tag: "desk", width: 1280, height: 720 },
  { tag: "port", width: 390, height: 844, touch: true },
];

mkdirSync("test-results", { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const rules = await vite.ssrLoadModule("/src/lib/game/rules.ts");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
let code = 0;

const tiles = (page) => page.locator('[data-testid^="resource-"]:not([data-testid="resource-flash"])').count();
const bannerBottom = (page) => page.evaluate(() => document.querySelector('[data-testid="turn-banner"]').getBoundingClientRect().bottom);
const game = (page) => page.evaluate(() => window.__emberisle.getState().state);
// The island's on-screen height (extreme vertices) and the hole's bottom inset, read once the fit has stopped moving.
async function island(page) {
  let prev = null;
  let same = 0;
  for (let i = 0; i < 80; i++) {
    const m = await page.evaluate(() => {
      const ys = window.__emberisle.getState().state.vertices.map((v) => window.__isle.screenOf(v.id).y);
      return { h: Math.round((Math.max(...ys) - Math.min(...ys)) * 10) / 10, min: Math.min(...ys), max: Math.max(...ys), bottom: window.__isle.insets().bottom };
    });
    same = prev && Math.abs(prev.min - m.min) < 0.05 && Math.abs(prev.max - m.max) < 0.05 && prev.bottom === m.bottom ? same + 1 : 0;
    if (same >= 4) return m;
    prev = m;
    await page.waitForTimeout(300);
  }
  throw new Error("the island never settled");
}
// Once the island has settled, force a re-measure of the hole and let it settle again: a fit made against the right hole moves nothing.
async function stillFitted(page, tag, what) {
  const before = await island(page);
  await page.evaluate(() => window.__isle.remeasure());
  await page.waitForTimeout(600);
  const after = await island(page);
  assert.ok(Math.abs(after.min - before.min) <= 1 && Math.abs(after.max - before.max) <= 1, `${tag}: ${what}: the island was fitted to a stale hole (${before.min.toFixed(1)}-${before.max.toFixed(1)} -> ${after.min.toFixed(1)}-${after.max.toFixed(1)})`);
  return after;
}
const act = (page, action) => page.evaluate((a) => window.__emberisle.getState().dispatch(a), action);

// Runs `change` in the page. A MutationObserver catches the dock the moment React commits it (before a frame is drawn) and, if a
// CSS animation is running on it, slows it right down; this then parks it at its midpoint and reads the dock there. That reads the
// in-between state deterministically however loaded the machine is. Resolves to null when no animation ever ran (instant).
async function probe(page, change, done) {
  await page.evaluate(() => {
    window.__anim = null;
    const grab = () => {
      const dock = document.querySelector('[data-testid="hand-dock"]');
      if (!dock || window.__anim) return;
      const anim = dock.getAnimations().find((a) => a.animationName?.startsWith("hand-"));
      if (!anim) return;
      window.__anim = anim;
      anim.playbackRate = 0.001;
    };
    window.__obs = new MutationObserver(grab);
    window.__obs.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
  await change();
  await page.waitForFunction(`window.__anim || (${done})()`, null, { timeout: STEP_MS });
  const mid = await page.evaluate(() => {
    window.__obs.disconnect();
    const anim = window.__anim;
    if (!anim) return null;
    const dock = anim.effect.target;
    anim.pause();
    anim.currentTime = 110;
    const m = {
      name: anim.animationName,
      duration: anim.effect.getTiming().duration,
      easing: getComputedStyle(dock).animationTimingFunction,
      props: [...new Set(anim.effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k)).sort(),
      opacity: Number(getComputedStyle(dock).opacity),
      h: dock.getBoundingClientRect().height,
    };
    anim.finish();
    return m;
  });
  await page.waitForFunction(done, null, { timeout: STEP_MS });
  return mid;
}

async function run(v, reduced) {
  const tag = `${v.tag} ${reduced ? "reduced motion" : "motion"}`;
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    reducedMotion: reduced ? "reduce" : "no-preference",
    ...(v.touch ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Join", exact: true }).waitFor({ timeout: STEP_MS });
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
  await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
  await page.getByTestId("turn-banner").waitFor({ timeout: STEP_MS });

  // Roll-off: nothing held, nothing shown.
  assert.equal((await game(page)).phase, "rollOff", `${tag}: starts in the roll-off`);
  assert.equal(await tiles(page), 0, `${tag}: roll-off hand tiles`);
  assert.equal(await page.getByTestId("hand-dock").count(), 0, `${tag}: roll-off dock`);
  for (let i = 0; i < 40 && (await game(page)).phase === "rollOff"; i++) await act(page, { type: "roll" });
  assert.equal((await game(page)).phase, "setupSettle", `${tag}: roll-off done`);
  await page.waitForTimeout(300);
  assert.equal(await tiles(page), 0, `${tag}: first setupSettle hand tiles`);
  const bare = await bannerBottom(page);
  const isleBare = await island(page);

  // Setup, played through: the hand stays away until a second outpost pays.
  const dockUp = () => !!document.querySelector('[data-testid="hand-dock"]') && !document.querySelector('[data-testid="hand-dock"]').dataset.rising;
  let shown = null;
  for (let guard = 0; guard < 24; guard++) {
    const st = await game(page);
    if (st.phase !== "setupSettle" && st.phase !== "setupRoad") break;
    const me = st.current;
    if (st.phase === "setupRoad") {
      await act(page, { type: "setupRoad", edgeId: rules.legalRoads(st, me, true)[0] });
      continue;
    }
    const second = st.setupIndex >= st.players.length;
    const spots = rules.legalSettle(st, me, true);
    const paying = (id) => st.vertices.find((x) => x.id === id).hexes.some((h) => st.hexes.find((x) => x.id === h).terrain !== "waste");
    const vertexId = (second && spots.find(paying)) || spots[0];
    assert.equal(await tiles(page), 0, `${tag}: setup step ${st.setupIndex} hand tiles before the outpost`);
    if (second) {
      const mid = await probe(page, () => act(page, { type: "setupSettle", vertexId }), dockUp);
      shown = { mid, me, held: (await game(page)).players.find((p) => p.id === me) };
      break;
    }
    await act(page, { type: "setupSettle", vertexId });
  }
  assert.ok(shown, `${tag}: a second outpost paid`);
  assert.equal(await tiles(page), 5, `${tag}: hand tiles once the second outpost paid`);
  const full = await bannerBottom(page);
  const dockH = await page.getByTestId("hand-dock").evaluate((e) => e.getBoundingClientRect().height);
  assert.ok(bare - full >= dockH * 0.8 && bare - full <= dockH + 10, `${tag}: the hole shrinks by about the hand (${dockH}): ${bare} -> ${full}`);
  const isleFull = await island(page);
  assert.ok(isleBare.bottom < isleFull.bottom, `${tag}: the hole's bottom inset is smaller without the hand (${isleBare.bottom} < ${isleFull.bottom})`);
  await stillFitted(page, tag, "hand arrived");
  await page.screenshot({ path: `test-results/hand-hidden-${v.tag}-${reduced ? "rm" : "motion"}-shown.png` });

  const m = shown.mid;
  if (reduced) assert.ok(m === null || m.duration <= 1, `${tag}: reduced motion makes it instant (${JSON.stringify(m)})`);
  else {
    assert.ok(m, `${tag}: the hand rises in with an animation`);
    assert.equal(m.name, "hand-in", `${tag}: animation name`);
    assert.equal(m.duration, 220, `${tag}: lasts 220 ms (--duration-base)`);
    assert.match(m.easing, /cubic-bezier\(0\.22, 1, 0\.36, 1\)/, `${tag}: --ease-out, got ${m.easing}`);
    assert.deepEqual(m.props, ["opacity", "transform"], `${tag}: the keyframes animate opacity and transform only`);
    assert.ok(m.opacity > 0 && m.opacity < 1, `${tag}: midpoint opacity ${m.opacity}`);
    assert.ok(Math.abs(m.h - dockH) <= 1, `${tag}: the hand is already at its full height mid-animation (${m.h} vs ${dockH})`);
  }

  // Spending down to nothing keeps the hand: it is on the table once held.
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    Object.assign(st.players.find((p) => p.id === st.current).resources, { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 });
    st.phase = "main"; // goods only go down once setup is over
    st.seq += 1;
    g.setState({ state: st });
  });
  await page.waitForTimeout(400);
  assert.equal(await tiles(page), 5, `${tag}: the hand stays once held, even at 0 goods`);
  assert.equal(await page.locator('[data-testid="hand-count"]').allTextContents().then((t) => t.join("")), "00000", `${tag}: all five cards read 0`);

  // A hotseat seat that has held nothing takes the turn: its hand is not shown, and the island is fitted to that.
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.current = st.players.find((p) => p.id !== st.current && p.resources && Object.values(p.resources).every((n) => n === 0)).id;
    st.phase = "setupSettle"; // the hand is hidden for a seat with no goods only while setup is on
    st.seq += 1;
    g.setState({ state: st });
  });
  await page.waitForFunction(() => !document.querySelector('[data-testid="hand-dock"]'), null, { timeout: STEP_MS });
  assert.equal(await tiles(page), 0, `${tag}: a seat that never held a good has no hand`);
  const isleGone = await island(page);
  assert.ok(isleGone.bottom < isleFull.bottom, `${tag}: the hole is bigger again without the hand (${isleGone.bottom} < ${isleFull.bottom})`);
  await stillFitted(page, tag, "hand left");

  // #481 item 6: the hand follows the state alone. The seat that held goods is on turn again in a fresh setup with nothing
  // (a rematch that never renders a roll-off): no hand. A sticky "held" set would still show it.
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const first = st.players[0];
    for (const p of st.players) Object.assign(p.resources, { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 });
    Object.assign(first.resources, { grain: 1 });
    st.current = first.id;
    st.seq += 1;
    g.setState({ state: st });
  });
  await page.getByTestId("hand-dock").waitFor({ timeout: STEP_MS });
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    for (const p of st.players) Object.assign(p.resources, { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 });
    st.phase = "setupSettle";
    st.seq += 1;
    g.setState({ state: st });
  });
  await page.waitForFunction(() => !document.querySelector('[data-testid="hand-dock"]'), null, { timeout: STEP_MS });
  assert.equal(await tiles(page), 0, `${tag}: a seat that held goods earlier has no hand in a fresh setup with none`);

  // #481 item 7: a +N flash on a tile (pointer-events: none overlays) does not change what the island is fitted to.
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.phase = "main";
    st.seq += 1;
    g.setState({ state: st });
  });
  await page.getByTestId("hand-dock").waitFor({ timeout: STEP_MS });
  const calm = await island(page);
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.players.find((p) => p.id === st.current).resources.grain += 1;
    st.seq += 1;
    g.setState({ state: st });
  });
  await page.getByTestId("resource-flash").waitFor({ timeout: STEP_MS });
  const flashing = await page.evaluate(() => ({ bottom: window.__isle.insets().bottom, overlay: getComputedStyle(document.querySelector('[data-testid="resource-flash"]')).pointerEvents }));
  assert.equal(flashing.overlay, "none", `${tag}: the flash overlay lets taps through`);
  assert.equal(flashing.bottom, calm.bottom, `${tag}: with the flash up the hand still measures as the hand (${flashing.bottom} vs ${calm.bottom})`);
  await stillFitted(page, tag, "hand flashing");
  // A 4 px pointer-events: none dot in the corner of every tile (any decorative overlay): the hand is still measured as its
  // tiles' own boxes, not as the union of the dots.
  await page.evaluate(() => {
    for (const t of document.querySelectorAll('[data-testid^="resource-"]:not([data-testid="resource-flash"])')) {
      const dot = document.createElement("span");
      dot.dataset.testid = "probe-dot";
      dot.style.cssText = "position:absolute;left:0;top:0;width:4px;height:4px;pointer-events:none";
      t.append(dot);
    }
  });
  const dotted = await page.evaluate(() => window.__isle.insets().bottom);
  assert.equal(dotted, calm.bottom, `${tag}: a pointer-transparent child in each tile leaves the hand measured as the hand (${dotted} vs ${calm.bottom})`);
  await page.evaluate(() => document.querySelectorAll('[data-testid="probe-dot"]').forEach((d) => d.remove()));
  assert.deepEqual(errors, [], `${tag}: console errors`);
  console.log(`${tag} ${v.width}x${v.height}: 0 tiles through roll-off and setup, 5 once the second outpost paid (held ${JSON.stringify(shown.held.resources)}), banner bottom ${bare} -> ${full}, hole bottom inset ${isleFull.bottom} -> ${isleBare.bottom} without the hand; ` +
    `${reduced ? "1 ms step" : `220 ms rise, midpoint opacity ${m.opacity.toFixed(2)}, height ${m.h.toFixed(0)}/${dockH}, props ${m.props}`}; island unmoved by a forced re-measure on arrival and on leaving; stays at 0 goods; 0 console errors`);
  await ctx.close();
}

try {
  for (const v of VIEWS) for (const reduced of [false, true]) await run(v, reduced);
  console.log("hand-hidden-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
