// #439: the hand bar is not on the table until the seat on turn holds a good. At 1280x720 and 390x844 (touch), with and without
// prefers-reduced-motion, on a hotseat table played through the real roll-off and setup:
//  - roll-off and every setup step before the second outpost pays: 0 hand tiles, no hand-dock, and the HUD stack (the turn banner's bottom
//    edge) sits lower, so the space above it, the board's hole, is bigger by about the hand's height;
//  - the second outpost paying brings the hand in (5 tiles). With motion it rises over 220 ms: opacity and height pass through
//    in-between values (read at the animation's midpoint) and the banner glides up between its two resting places; under reduced motion the first frame after the change is the final one;
//  - losing every good takes the hand away again, the same way, and the banner returns to where it was;
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
      return { h: Math.round((Math.max(...ys) - Math.min(...ys)) * 10) / 10, bottom: window.__isle.insets().bottom };
    });
    same = prev && prev.h === m.h && prev.bottom === m.bottom ? same + 1 : 0;
    if (same >= 4) return m;
    prev = m;
    await page.waitForTimeout(300);
  }
  throw new Error("the island never settled");
}
const act = (page, action) => page.evaluate((a) => window.__emberisle.getState().dispatch(a), action);

// Runs `change` in the page. A MutationObserver catches the dock the moment React commits it (before a frame is drawn) and, if a CSS
// animation is running on it, parks that animation at its midpoint, reads the dock and the banner there, and lets it finish. That
// reads the in-between state deterministically however loaded the machine is. `mid` is null when no animation ever ran (instant).
async function probe(page, change, done) {
  await page.evaluate(() => {
    window.__anim = null;
    window.__ran = false;
    const grab = () => {
      const dock = document.querySelector('[data-testid="hand-dock"]');
      if (!dock || window.__ran) return;
      const anim = dock.getAnimations().find((a) => a.animationName?.startsWith("hand-"));
      if (!anim) return;
      window.__ran = true;
      window.__anim = anim;
      anim.playbackRate = 0.001;
    };
    window.__obs = new MutationObserver(grab);
    window.__obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-phase"] });
  });
  await change();
  await page.waitForFunction(`window.__ran || (${done})()`, null, { timeout: STEP_MS });
  const mid = await page.evaluate(() => {
    window.__obs.disconnect();
    const anim = window.__anim;
    if (!anim) return null;
    const dock = anim.effect.target;
    anim.pause();
    anim.currentTime = 110;
    // The earlier probe finished its animation by hand, which leaves a filled copy behind that would mask this one.
    anim.effect.target.getAnimations().filter((x) => x !== anim).forEach((x) => x.cancel());
    const m = {
      name: anim.animationName,
      duration: anim.effect.getTiming().duration,
      easing: getComputedStyle(dock).animationTimingFunction,
      opacity: Number(getComputedStyle(dock).opacity),
      h: dock.getBoundingClientRect().height,
      top: document.querySelector('[data-testid="turn-banner"]').getBoundingClientRect().bottom,
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
    // After the first payout the next seat takes the hand and the paid seat's bar leaves over 220 ms, so give it that long.
    await page.waitForFunction(() => !document.querySelector('[data-testid^="resource-"]:not([data-testid="resource-flash"])'), null, { timeout: 3000 })
      .catch(() => {});
    assert.equal(await tiles(page), 0, `${tag}: setup step ${st.setupIndex} hand tiles before the outpost`);
    if (second) {
      const mid = await probe(page, () => act(page, { type: "setupSettle", vertexId }), () => document.querySelector('[data-testid="hand-dock"]')?.dataset.phase === "idle");
      shown = { mid, held: (await game(page)).players.find((p) => p.id === me) };
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
  assert.ok(isleBare.h >= isleFull.h, `${tag}: the island is no smaller on screen without the hand (${isleBare.h} >= ${isleFull.h})`);
  await page.screenshot({ path: `test-results/hand-hidden-${v.tag}-${reduced ? "rm" : "motion"}-shown.png` });

  const midOf = (m, name, from, to) => {
    if (reduced) return assert.equal(m, null, `${tag}: no animation runs under reduced motion`);
    assert.ok(m, `${tag}: ${name} animation ran`);
    assert.equal(m.name, name, `${tag}: animation name`);
    assert.equal(m.duration, 220, `${tag}: ${name} lasts 220 ms (--duration-base)`);
    assert.match(m.easing, /cubic-bezier\(0\.22, 1, 0\.36, 1\)/, `${tag}: easing ${m.easing}`);
    assert.ok(m.opacity > 0 && m.opacity < 1, `${tag}: ${name} midpoint opacity ${m.opacity}`);
    assert.ok(m.h > 0 && m.h < dockH - 1, `${tag}: ${name} midpoint height ${m.h} of ${dockH}`);
    assert.ok(m.top < from && m.top > to, `${tag}: ${name} midpoint banner ${m.top} between ${from} and ${to}`);
  };
  midOf(shown.mid, "hand-in", bare, full);

  // Losing every good takes it away again.
  const gone = await probe(
    page,
    () => page.evaluate(() => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      Object.assign(st.players.find((p) => p.id === st.current).resources, { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 });
      st.seq += 1;
      g.setState({ state: st });
    }),
    () => !document.querySelector('[data-testid="hand-dock"]'),
  );
  assert.equal(await tiles(page), 0, `${tag}: no tiles once every good is gone`);
  const isleBack = await island(page);
  assert.ok(isleBack.bottom < isleFull.bottom, `${tag}: the hole is bigger again once the hand is gone (${isleBack.bottom} < ${isleFull.bottom}; the banner text differs by phase, so not compared exactly to the first reading)`);
  assert.ok(isleBack.h >= isleFull.h, `${tag}: the island is no smaller again (${isleBack.h} >= ${isleFull.h})`);
  assert.ok(Math.abs((await bannerBottom(page)) - bare) <= 1, `${tag}: the banner is back where it was ${bare} vs ${await bannerBottom(page)}`);
  midOf(gone, "hand-out", bare, full);
  assert.deepEqual(errors, [], `${tag}: console errors`);
  console.log(`${tag} ${v.width}x${v.height}: 0 tiles through roll-off and setup, 5 once the second outpost paid (held ${JSON.stringify(shown.held.resources)}), banner bottom ${bare} -> ${full} (hole ${(bare - full).toFixed(0)} px bigger without the hand; island ${isleFull.h} -> ${isleBare.h} px tall, bottom inset ${isleFull.bottom} -> ${isleBare.bottom}), ` +
    `${reduced ? "instant in and out" : `220 ms rise in, midpoint opacity ${shown.mid.opacity.toFixed(2)} height ${shown.mid.h.toFixed(0)}/${dockH}, fade out ${gone.opacity.toFixed(2)}`}, 0 tiles again, 0 console errors`);
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
