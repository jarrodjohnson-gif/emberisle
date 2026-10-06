// #436/#565: resource colours and hero counts, plus a bounded 3 px gain lift / 2 px loss dip on real rules actions. At desk,
// portrait-touch and short landscape-touch sizes, prove the browser-computed WAAPI transform, fixed card footprint, immediate
// count/feedback, per-card isolation, same-direction restart, settle time, clipping, and reduced-motion fade. First load,
// reconnect and hotseat changes establish quiet baselines. Existing color, contrast, ring and accessibility checks remain.
// each card's computed fill is its polish.md token (= the terrain cap's PAINT base), the count is 28 px / 600 and the largest text
// on the card, the count's computed colour against the fill is >= 4.5:1, a card holding 0 is 40 % opacity, the uppercase label is gone
// from view (kept as title and for screen readers), and an icon is still on every card. A gain adds exactly one 2 px white ring
// pulse (one animation per change, not per render), a loss likewise, no emerald / rose fill; under reduced motion the pulse is a 1 ms step.
// Run: npm run hand-cards-prove
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8436;
const STEP_MS = 15_000;
const RESOURCES = ["timber", "clay", "wool", "grain", "ore"];
const FILL = { timber: "#2f6b3a", clay: "#b5522a", wool: "#8fbf5a", grain: "#e0b13a", ore: "#6e7580" };
const ON = { timber: "#ffffff", clay: "#ffffff", wool: "#1c1915", grain: "#1c1915", ore: "#ffffff" };
const VIEWS = [
  { tag: "desk", width: 1280, height: 720 },
  { tag: "port", width: 390, height: 844, touch: true },
  { tag: "short", width: 844, height: 390, touch: true },
];

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]) => {
  const [R, G, B] = [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const parse = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);

// Read the actual card animation after a game action. Pause and seek its WAAPI timeline to the furthest
// transform keyframe, then read the browser-computed matrix; checking the stylesheet alone would miss a
// card that never received an animation when its count changed.
async function sampleCardMotion(page, expected, tag) {
  const result = await page.evaluate((expected) => {
    const matrixY = (value) => new DOMMatrixReadOnly(value === "none" ? undefined : value).m42;
    const cards = Object.fromEntries(["timber", "clay", "wool", "grain", "ore"].map((r) => {
      const card = document.querySelector(`[data-testid="resource-${r}"]`);
      const transforms = card.getAnimations().filter((a) =>
        a.effect?.target === card && a.effect.getKeyframes().some((f) => "transform" in f),
      );
      const before = window.__motionBefore[r];
      const animation = transforms[0];
      if (!animation) {
        const count = card.querySelector('[data-testid="hand-count"]');
        const flash = card.parentElement.querySelector('[data-testid="resource-flash"]');
        const cr = count.getBoundingClientRect();
        const fr = flash?.getBoundingClientRect();
        const overlap = fr ? Math.max(0, Math.min(cr.right, fr.right) - Math.max(cr.left, fr.left)) * Math.max(0, Math.min(cr.bottom, fr.bottom) - Math.max(cr.top, fr.top)) : 0;
        const rect = card.getBoundingClientRect();
        const slot = card.parentElement.getBoundingClientRect();
        const rail = card.parentElement.parentElement.getBoundingClientRect();
        return [r, { y: matrixY(getComputedStyle(card).transform), n: transforms.length, count: count.textContent.trim(),
          flash: flash?.textContent.trim() ?? null, overlap,
          footprint: [slot.left, slot.top, slot.width, slot.height, card.offsetWidth, card.offsetHeight], before,
          outside: rect.left < Math.max(0, rail.left) || rect.top < Math.max(0, rail.top) || rect.right > Math.min(innerWidth, rail.right) || rect.bottom > Math.min(innerHeight, rail.bottom) }];
      }
      const frames = animation.effect.getKeyframes();
      const duration = animation.effect.getTiming().duration;
      const positioned = frames.map((f, i) => ({
        offset: f.computedOffset ?? f.offset ?? (frames.length === 1 ? 1 : i / (frames.length - 1)),
        y: new DOMMatrixReadOnly(f.transform).m42,
      }));
      const extreme = positioned.reduce((best, f) => Math.abs(f.y) > Math.abs(best.y) ? f : best, positioned[0]);
      animation.pause();
      animation.currentTime = duration * extreme.offset;
      const count = card.querySelector('[data-testid="hand-count"]');
      const flash = card.parentElement.querySelector('[data-testid="resource-flash"]');
      const cr = count.getBoundingClientRect();
      const fr = flash?.getBoundingClientRect();
      const overlap = fr ? Math.max(0, Math.min(cr.right, fr.right) - Math.max(cr.left, fr.left)) * Math.max(0, Math.min(cr.bottom, fr.bottom) - Math.max(cr.top, fr.top)) : 0;
      const rect = card.getBoundingClientRect();
      const slot = card.parentElement.getBoundingClientRect();
      const rail = card.parentElement.parentElement.getBoundingClientRect();
      return [r, {
        y: matrixY(getComputedStyle(card).transform), n: transforms.length, duration, frames: frames.map((f) => Object.keys(f).filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k))),
        count: count.textContent.trim(), flash: flash?.textContent.trim() ?? null, overlap,
        footprint: [slot.left, slot.top, slot.width, slot.height, card.offsetWidth, card.offsetHeight], before,
        outside: rect.left < Math.max(0, rail.left) || rect.top < Math.max(0, rail.top) || rect.right > Math.min(innerWidth, rail.right) || rect.bottom > Math.min(innerHeight, rail.bottom),
        extreme: { y: extreme.y, offset: extreme.offset },
      }];
    }));
    return cards;
  }, expected);

  for (const r of RESOURCES) {
    const c = result[r];
    assert.deepEqual(c.footprint, c.before, `${tag} ${r}: card footprint stayed fixed`);
    assert.equal(c.outside, false, `${tag} ${r}: sampled motion stays inside the viewport`);
    if (expected[r] === undefined) {
      assert.ok(Math.abs(c.y) <= 0.1 && c.n === 0, `${tag} ${r}: untouched card did not move (y=${c.y}, transforms=${c.n})`);
      continue;
    }
    const want = expected[r];
    assert.equal(c.count, want.count, `${tag} ${r}: count updated immediately`);
    assert.equal(c.flash, want.flash, `${tag} ${r}: visible delta label`);
    assert.ok(c.overlap <= 1, `${tag} ${r}: delta badge does not cover the count (${c.overlap.toFixed(1)}px² overlap)`);
    assert.ok(c.n >= 1, `${tag} ${r}: action started a WAAPI card transform`);
    assert.ok(c.duration > 0 && c.duration <= 320, `${tag} ${r}: animation settles within 320ms (duration ${c.duration})`);
    assert.ok(c.frames.every((keys) => keys.every((k) => k === "transform")), `${tag} ${r}: card animation changes transform only (${JSON.stringify(c.frames)})`);
    assert.ok(Math.abs(c.y - want.y) <= 0.35, `${tag} ${r}: sampled transform ${c.y.toFixed(2)}px, expected ${want.y}px`);
    assert.ok(Math.abs(c.extreme.y - want.y) <= 0.35, `${tag} ${r}: transform keyframe reached ${c.extreme.y}px, expected ${want.y}px`);
  }
  return result;
}

async function motionBaseline(page) {
  await page.evaluate(() => {
    window.__motionBeforeNodes = Object.fromEntries(["timber", "clay", "wool", "grain", "ore"].map((r) => {
      const card = document.querySelector(`[data-testid="resource-${r}"]`);
      return [r, card];
    }));
    window.__motionBefore = Object.fromEntries(["timber", "clay", "wool", "grain", "ore"].map((r) => {
      const card = document.querySelector(`[data-testid="resource-${r}"]`);
      const slot = card.parentElement.getBoundingClientRect();
      return [r, [slot.left, slot.top, slot.width, slot.height, card.offsetWidth, card.offsetHeight]];
    }));
  });
}

async function craftMotionHand(page) {
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const me = st.players.find((p) => p.id === st.current);
    st.phase = "main";
    st.winner = null;
    Object.assign(me.resources, { timber: 2, clay: 2, wool: 1, grain: 2, ore: 8 });
    st.bank = { timber: 19, clay: 19, wool: 19, grain: 19, ore: 19 };
    st.seq += 1;
    g.setState({ state: st, buildMode: "none", error: null, tradeOpen: false });
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="resource-ore"] [data-testid="hand-count"]')?.textContent.trim() === "8", null, { timeout: STEP_MS });
  await page.waitForTimeout(1400);
}

async function proveResourceMotion(page, tag) {
  await craftMotionHand(page);
  await motionBaseline(page);

  // The first change goes through the actual trade panel and the store's rules dispatcher.
  await page.getByRole("button", { name: "Trade", exact: true }).click();
  await page.getByTestId("trade-panel").waitFor();
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "More ore to give" }).click();
  await page.getByRole("button", { name: "More wool to want" }).click();
  await page.getByRole("button", { name: /^(Bank 4|Dock 3|Dock 2):1$/ }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="resource-wool"] [data-testid="hand-count"]')?.textContent.trim() === "2", null, { timeout: STEP_MS });
  await sampleCardMotion(page, { wool: { count: "2", flash: "+1", y: -3 }, ore: { count: "4", flash: "-4", y: 2 } }, tag);
  // Hold the first sample while a second legal bank trade arrives in the same direction. The card nodes stay mounted,
  // but each affected card must get a fresh animation that starts from the beginning.
  await page.evaluate(() => {
    window.__motionOld = Object.fromEntries(["wool", "ore"].map((kind) => [kind,
      document.querySelector(`[data-testid="resource-${kind}"]`).getAnimations().find((a) => a.effect?.target === document.querySelector(`[data-testid="resource-${kind}"]`) && a.effect.getKeyframes().some((f) => "transform" in f)),
    ]));
    const r = window.__emberisle.getState().dispatch({ type: "bankTrade", give: "ore", want: "wool" });
    if (!r.ok) throw new Error(`second bank trade failed: ${r.error}`);
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="resource-wool"] [data-testid="hand-count"]')?.textContent.trim() === "3", null, { timeout: STEP_MS });
  const restart = await page.evaluate(() => Object.fromEntries(["wool", "ore"].map((kind) => {
    const card = document.querySelector(`[data-testid="resource-${kind}"]`);
    const anim = card.getAnimations().find((a) => a.effect?.target === card && a.effect.getKeyframes().some((f) => "transform" in f));
    const flash = card.parentElement.querySelector('[data-testid="resource-flash"]');
    return [kind, { sameNode: card === window.__motionBeforeNodes[kind], replaced: anim !== window.__motionOld[kind], time: anim?.currentTime, count: card.querySelector('[data-testid="hand-count"]').textContent.trim(), flash: flash?.textContent.trim(), cardOpacity: getComputedStyle(card).opacity, flashOpacity: flash && getComputedStyle(flash).opacity }];
  })));
  for (const r of ["wool", "ore"]) {
    assert.equal(restart[r].sameNode, true, `${tag} ${r}: card DOM persists between transactions`);
    assert.equal(restart[r].replaced, true, `${tag} ${r}: same-direction change restarted its persistent card animation`);
    assert.ok(restart[r].time <= 80, `${tag} ${r}: restarted animation begins near zero (${restart[r].time}ms)`);
  }
  assert.equal(restart.wool.count, "3", `${tag}: second gain count is immediate`);
  assert.equal(restart.wool.flash, "+1", `${tag}: second gain shows +N`);
  assert.equal(restart.ore.count, "0", `${tag}: second loss count is immediate`);
  assert.equal(restart.ore.flash, "-4", `${tag}: second loss shows -N at zero`);
  await page.evaluate(() => {
    for (const r of ["wool", "ore"]) {
      const card = document.querySelector(`[data-testid="resource-${r}"]`);
      const anim = card.getAnimations().find((a) => a.effect?.target === card && a.effect.getKeyframes().some((f) => "transform" in f));
      if (anim) { anim.pause(); anim.currentTime = 0; }
    }
  });
  // The zero-card loss keeps its footprint, remains inside the viewport, and the whole hand stays unclipped.
  const edge = await page.evaluate(() => {
    const dock = document.querySelector('[data-testid="hand-dock"]');
    const rail = dock.firstElementChild;
    return [...rail.querySelectorAll('[data-testid^="resource-"]')].filter((e) => !e.dataset.testid.endsWith("flash")).map((e) => {
      const r = e.getBoundingClientRect();
      const d = rail.getBoundingClientRect();
      return { id: e.dataset.testid, left: r.left, right: r.right, top: r.top, bottom: r.bottom, zero: e.querySelector('[data-testid="hand-count"]').textContent.trim() === "0", clipped: d.left < 0 || d.right > innerWidth || r.left < d.left - 1 || r.right > d.right + 1 || r.top < 0 || r.bottom > innerHeight };
    });
  });
  assert.ok(edge.every((e) => !e.clipped), `${tag}: every card stays visible without clipping (${JSON.stringify(edge)})`);
  assert.ok(edge.some((e) => e.zero), `${tag}: a loss can reach zero while its card remains mounted`);
  await page.evaluate(() => {
    for (const r of ["wool", "ore"]) {
      const card = document.querySelector(`[data-testid="resource-${r}"]`);
      const anim = card.getAnimations().find((a) => a.effect?.target === card && a.effect.getKeyframes().some((f) => "transform" in f));
      if (anim) { anim.currentTime = anim.effect.getTiming().duration; anim.play(); }
    }
  });
  await page.waitForTimeout(330);
  const settled = await page.evaluate(() => ["wool", "ore"].map((r) => {
    const c = document.querySelector(`[data-testid="resource-${r}"]`);
    const transform = getComputedStyle(c).transform;
    return [r, transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42, getComputedStyle(c).opacity];
  }));
  for (const [r, y] of settled) assert.ok(Math.abs(y) <= 0.1, `${tag} ${r}: transform settled to zero within 320ms`);
  assert.equal(settled.find(([r]) => r === "ore")[2], "0.4", `${tag}: zero-count card settles to 40% opacity`);
}

async function proveDynamicMotionCancellation(page, tag) {
  // Start under no-preference, hold the actual resource-card WAAPI animation, then switch the browser preference live.
  await page.evaluate(() => {
    const api = window.__emberisle;
    const st = structuredClone(api.getState().state);
    Object.assign(st.players.find((p) => p.id === st.current).resources, { ore: 4, wool: 1 });
    st.phase = "main";
    st.bank.wool = 19;
    st.seq += 1;
    api.setState({ state: st });
  });
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const result = window.__emberisle.getState().dispatch({ type: "bankTrade", give: "ore", want: "wool" });
    if (!result.ok) throw new Error(`dynamic-motion fixture trade failed: ${result.error}`);
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="resource-wool"] [data-testid="hand-count"]')?.textContent.trim() === "2", null, { timeout: STEP_MS });
  const started = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="resource-wool"]');
    window.__dynamicMotion = card.getAnimations().find((a) => a.effect?.target === card && a.effect.getKeyframes().some((f) => "transform" in f));
    return { found: Boolean(window.__dynamicMotion), state: window.__dynamicMotion?.playState, duration: window.__dynamicMotion?.effect.getTiming().duration };
  });
  assert.equal(started.found, true, `${tag}: live preference fixture started native card motion`);
  assert.equal(started.state, "paused", `${tag}: test holds the native WAAPI timeline before changing preference`);
  assert.ok(started.duration > 0 && started.duration <= 320, `${tag}: live preference fixture uses bounded card motion`);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => window.__dynamicMotion?.playState === "idle", null, { timeout: STEP_MS });
  const canceled = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="resource-wool"]');
    const transform = getComputedStyle(card).transform;
    const active = card.getAnimations().filter((a) => a.effect?.target === card && a.effect.getKeyframes().some((f) => "transform" in f));
    return { state: window.__dynamicMotion.playState, y: transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42, active: active.length };
  });
  assert.equal(canceled.state, "idle", `${tag}: live reduced-motion change cancels in-flight WAAPI animation`);
  assert.equal(canceled.active, 0, `${tag}: canceled card has no active transform animation`);
  assert.ok(Math.abs(canceled.y) <= 0.1, `${tag}: canceled transform clears to its resting position (${canceled.y}px)`);
  await page.emulateMedia({ reducedMotion: "no-preference" });
}

async function proveBaselineLifecycle(page, ctx, tag) {
  // A first synchronized state with an already-populated hand establishes a baseline rather than replaying old gains.
  const seed = await page.evaluate(() => structuredClone(window.__emberisle.getState().state));
  const fresh = await ctx.newPage();
  await fresh.goto(`http://127.0.0.1:${PORT}/`);
  await fresh.waitForFunction(() => window.__emberisle, null, { timeout: STEP_MS });
  await fresh.evaluate((st) => window.__emberisle.getState().loadState(st, st.current, true), seed);
  await fresh.waitForFunction(() => document.querySelector('[data-testid="hand-dock"]'), null, { timeout: STEP_MS });
  const firstLoad = await fresh.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid^="resource-"]')].filter((e) => e.dataset.testid !== "resource-flash");
    return { labels: document.querySelectorAll('[data-testid="resource-flash"]').length, transforms: cards.flatMap((c) => c.getAnimations().filter((a) => a.effect?.target === c && a.effect.getKeyframes().some((f) => "transform" in f))).length };
  });
  assert.equal(firstLoad.labels, 0, `${tag}: first synchronized load establishes a quiet hand baseline`);
  assert.equal(firstLoad.transforms, 0, `${tag}: first load does not replay card motion`);

  // A reconnect snapshot can change the holdings at the same time as `synced` advances; that snapshot is also a baseline.
  await fresh.evaluate(() => {
    const api = window.__emberisle;
    const g = api.getState();
    const st = structuredClone(g.state);
    st.players.find((p) => p.id === g.localId).resources.wool += 1;
    st.seq += 1;
    api.setState({ resync: true });
    g.loadState(st, g.localId, true);
  });
  await fresh.waitForTimeout(80);
  const reconnect = await fresh.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid^="resource-"]')].filter((e) => e.dataset.testid !== "resource-flash");
    return { count: document.querySelector('[data-testid="resource-wool"] [data-testid="hand-count"]').textContent.trim(), labels: document.querySelectorAll('[data-testid="resource-flash"]').length,
      transforms: cards.flatMap((c) => c.getAnimations().filter((a) => a.effect?.target === c && a.effect.getKeyframes().some((f) => "transform" in f))).length };
  });
  assert.equal(reconnect.count, String(seed.players.find((p) => p.id === seed.current).resources.wool + 1), `${tag}: reconnect hand data applied`);
  assert.equal(reconnect.labels, 0, `${tag}: synced reconnect change has no stale +N/-N label`);
  assert.equal(reconnect.transforms, 0, `${tag}: synced reconnect does not replay old card motion`);
  await fresh.close();

  // Start a legal movement, then hand the hotseat to another player mid-flight. The old cue is canceled and the next seat is baseline.
  await page.evaluate(() => {
    const api = window.__emberisle;
    const g = api.getState();
    const st = structuredClone(g.state);
    Object.assign(st.players.find((p) => p.id === st.current).resources, { ore: 4, wool: 1 });
    st.bank.wool = 19;
    st.phase = "main";
    st.seq += 1;
    api.setState({ state: st, mode: "hotseat", localId: st.current });
  });
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const state = window.__emberisle.getState();
    const r = state.dispatch({ type: "bankTrade", give: "ore", want: "wool" });
    if (!r.ok) throw new Error(`seat-switch fixture trade failed: ${r.error}`);
  });
  await page.waitForFunction(() => window.__resourceMotionAnimations?.some(({ target, animation }) => target.dataset.testid === "resource-wool" && animation.playState !== "idle"), null, { timeout: STEP_MS });
  await page.evaluate(() => {
    const card = document.querySelector('[data-testid="resource-wool"]');
    window.__oldSeatCard = card;
    window.__oldSeatAnimation = card.getAnimations().find((a) => a.effect?.target === card && a.effect.getKeyframes().some((f) => "transform" in f));
  });
  await page.evaluate(() => {
    const api = window.__emberisle;
    const g = api.getState();
    const st = structuredClone(g.state);
    const next = st.players.find((p) => p.id !== st.current);
    st.current = next.id;
    st.phase = "main";
    Object.assign(next.resources, { timber: 1, clay: 2, wool: 5, grain: 3, ore: 2 });
    st.seq += 1;
    api.setState({ state: st });
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="resource-wool"] [data-testid="hand-count"]')?.textContent.trim() === "5", null, { timeout: STEP_MS });
  const seatChange = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="resource-wool"]');
    const transforms = card.getAnimations().filter((a) => a.effect?.target === card && a.effect.getKeyframes().some((f) => "transform" in f));
    return { sameCard: card === window.__oldSeatCard, canceled: window.__oldSeatAnimation?.playState === "idle", labels: document.querySelectorAll('[data-testid="resource-flash"]').length, transforms: transforms.length };
  });
  assert.equal(seatChange.sameCard, true, `${tag}: hotseat keeps the painted card mounted across seats`);
  assert.equal(seatChange.canceled, true, `${tag}: changing seats cancels the old movement`);
  assert.equal(seatChange.labels, 0, `${tag}: new seat does not inherit the old delta label`);
  assert.equal(seatChange.transforms, 0, `${tag}: new seat starts without replaying movement`);
}

async function proveReducedMotion(page, tag) {
  await craftMotionHand(page);
  await page.evaluate(() => {
    const api = window.__emberisle;
    const g = api.getState();
    const st = structuredClone(g.state);
    st.players.find((p) => p.id === st.current).resources.ore = 4;
    st.seq += 1;
    api.setState({ state: st });
  });
  await page.waitForTimeout(1400);
  await motionBaseline(page);
  await page.evaluate(() => {
    const r = window.__emberisle.getState().dispatch({ type: "bankTrade", give: "ore", want: "wool" });
    if (!r.ok) throw new Error(`reduced-motion trade failed: ${r.error}`);
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="resource-ore"] [data-testid="hand-count"]')?.textContent.trim() === "0", null, { timeout: STEP_MS });
  const reduced = await page.evaluate(() => {
    const ore = document.querySelector('[data-testid="resource-ore"]');
    const wool = document.querySelector('[data-testid="resource-wool"]');
    const transforms = [ore, wool].flatMap((card) => card.getAnimations().filter((a) => a.effect?.target === card && a.effect.getKeyframes().some((f) => "transform" in f)));
    const flash = wool.parentElement.querySelector('[data-testid="resource-flash"]');
    const fade = flash.getAnimations().find((a) => a.effect?.target === flash && a.effect.getKeyframes().some((f) => "opacity" in f));
    const ring = ore.querySelector('[data-testid="hand-ring"]');
    if (fade) { fade.pause(); fade.currentTime = 600; }
    return {
      count: ore.querySelector('[data-testid="hand-count"]').textContent.trim(),
      loss: ore.parentElement.querySelector('[data-testid="resource-flash"]')?.textContent.trim(),
      gain: wool.parentElement.querySelector('[data-testid="resource-flash"]')?.textContent.trim(),
      transforms: transforms.length,
      fadeName: getComputedStyle(flash).animationName,
      fadeDuration: fade?.effect.getTiming().duration,
      fadeOpacity: Number(getComputedStyle(flash).opacity),
      fadeProps: fade?.effect.getKeyframes().map((f) => Object.keys(f).filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k))),
      ringDuration: ring && getComputedStyle(ring).animationDuration,
      footprint: [ore.offsetWidth, ore.offsetHeight],
    };
  });
  assert.equal(reduced.count, "0", `${tag}: reduced-motion loss reaches zero immediately`);
  assert.equal(reduced.loss, "-4", `${tag}: reduced-motion loss remains visible`);
  assert.equal(reduced.gain, "+1", `${tag}: reduced-motion gain remains visible`);
  assert.equal(reduced.transforms, 0, `${tag}: reduced motion removes card transforms`);
  assert.equal(reduced.fadeName, "hand-resource-flash-fade", `${tag}: reduced-motion labels use the opacity fade`);
  assert.equal(reduced.fadeDuration, 1200, `${tag}: reduced-motion feedback lasts 1200ms`);
  assert.ok(reduced.fadeOpacity >= 0.45 && reduced.fadeOpacity <= 1, `${tag}: midpoint label stays readable at opacity ${reduced.fadeOpacity}`);
  assert.ok(reduced.fadeProps?.every((keys) => keys.every((k) => k === "opacity")), `${tag}: reduced-motion feedback changes opacity only`);
  assert.equal(reduced.ringDuration, "0.001s", `${tag}: ring remains a 1 ms reduced-motion step`);
}

mkdirSync("test-results", { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
let code = 0;

async function open(v, reducedMotion) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
    ...(v.touch ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await ctx.newPage();
  // Keep the application's real WAAPI effect alive for deterministic sampling. The wrapper forwards the real
  // card.animate call and pauses its returned Animation at creation; the proof later seeks that native timeline.
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      if (this instanceof HTMLElement && this.matches('[data-testid^="resource-"]') && Array.isArray(keyframes) && keyframes.some((frame) => Object.hasOwn(frame, "transform"))) {
        animation.pause();
        (window.__resourceMotionAnimations ??= []).push({ target: this, animation });
      }
      return animation;
    };
  });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Four seats, one table" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
  const roll = page.getByRole("button", { name: "Roll", exact: true });
  for (let i = 0; i < 40; i++) {
    const before = await page.evaluate(() => window.__emberisle.getState().state);
    if (before.phase !== "rollOff") break;
    await roll.focus({ timeout: STEP_MS });
    await page.keyboard.press("Enter");
    await page.waitForFunction((s) => window.__emberisle.getState().state.seq > s, before.seq, { timeout: STEP_MS });
  }
  return { ctx, page, errors };
}

// Sets the current seat's hand; `seat` stays so the diff reads it as a change of count, not of seat.
const setHand = (page, hand) =>
  page.evaluate((hand) => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    Object.assign(st.players.find((p) => p.id === st.current).resources, hand);
    st.seq += 1;
    g.setState({ state: st });
  }, hand);

try {
  for (const v of VIEWS) {
    const { ctx, page, errors } = await open(v, false);
    await setHand(page, { timber: 3, clay: 0, wool: 12, grain: 1, ore: 0 });
    await page.waitForFunction(() => document.querySelector('[data-testid="resource-wool"]')?.textContent.includes("12"), null, { timeout: STEP_MS });
    await page.waitForTimeout(1500); // the first set's flashes are over
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="resource-timber"]')).opacity === "1", null, { timeout: STEP_MS });
    const cards = await page.evaluate(() =>
      Object.fromEntries(
        ["timber", "clay", "wool", "grain", "ore"].map((r) => {
          const el = document.querySelector(`[data-testid="resource-${r}"]`);
          const cs = getComputedStyle(el);
          const count = el.querySelector('[data-testid="hand-count"]');
          const cc = getComputedStyle(count);
          const sizes = [...el.querySelectorAll("*")]
            .filter((e) => e.textContent.trim() && !e.querySelector("*"))
            .map((e) => ({ t: e.textContent.trim(), px: parseFloat(getComputedStyle(e).fontSize) }));
          const visible = [...el.querySelectorAll("*")].filter((e) => e.textContent.trim() && !e.querySelector("*") && e.getBoundingClientRect().width > 1);
          return [r, {
            fill: cs.backgroundColor, opacity: cs.opacity, title: el.title, text: count.textContent, color: cc.color,
            size: cc.fontSize, weight: cc.fontWeight, tabular: cc.fontVariantNumeric, sizes,
            visibleText: visible.map((e) => e.textContent.trim()), icon: !!el.querySelector("svg"),
            iconOpacity: el.querySelector("svg") && getComputedStyle(el.querySelector("svg")).opacity,
            name: el.textContent,
          }];
        }),
      ),
    );
    const want = { timber: 3, clay: 0, wool: 12, grain: 1, ore: 0 };
    for (const r of RESOURCES) {
      const c = cards[r];
      const fill = parse(c.fill);
      assert.deepEqual(fill, rgb(FILL[r]), `${v.tag} ${r}: fill ${c.fill}`);
      assert.deepEqual(parse(c.color), rgb(ON[r]), `${v.tag} ${r}: count colour ${c.color}`);
      const cr = ratio(parse(c.color), fill);
      assert.ok(cr >= 4.5, `${v.tag} ${r}: count contrast ${cr.toFixed(2)}`);
      assert.equal(c.text, String(want[r]), `${v.tag} ${r}: count`);
      assert.equal(c.size, "28px", `${v.tag} ${r}: count size`);
      assert.equal(c.weight, "600", `${v.tag} ${r}: count weight`);
      assert.match(c.tabular, /tabular-nums/, `${v.tag} ${r}: tabular`);
      assert.ok(c.sizes.every((s) => s.px <= 28), `${v.tag} ${r}: count is the largest text ${JSON.stringify(c.sizes)}`);
      assert.ok(c.sizes.filter((s) => s.px === 28).length === 1, `${v.tag} ${r}: only the count is 28 px`);
      assert.equal(c.opacity, want[r] === 0 ? "0.4" : "1", `${v.tag} ${r}: opacity`);
      assert.ok(c.icon && c.iconOpacity === "0.7", `${v.tag} ${r}: icon at 70 % (${c.iconOpacity})`);
      assert.deepEqual(c.visibleText, [String(want[r])], `${v.tag} ${r}: only the count is visible text`);
      assert.equal(c.title, { timber: "Timber", clay: "Clay", wool: "Wool", grain: "Grain", ore: "Ore" }[r], `${v.tag} ${r}: title`);
      assert.match(c.name, new RegExp(`${c.title}`, "i"), `${v.tag} ${r}: accessible name kept for screen readers`);
    }
    const tinted = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="resource-"]')].filter((e) => /emerald|rose/.test(e.className)).length);
    assert.equal(tinted, 0, `${v.tag}: no emerald / rose fill`);

    // A gain and a loss each pulse the ring once. Counted from the DOM, so a re-render cannot hide a second one.
    await page.evaluate(() => {
      window.__rings = [];
      new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.dataset?.testid === "hand-ring") window.__rings.push(n.parentElement.dataset.testid);
      }).observe(document.body, { childList: true, subtree: true });
    });
    await setHand(page, { timber: 5 });
    await page.locator('[data-testid="hand-ring"]').waitFor({ timeout: STEP_MS });
    await page.evaluate(() => { const g = window.__emberisle; g.setState({ state: structuredClone(g.getState().state) }); });
    await page.waitForTimeout(300);
    const ring = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="hand-ring"]');
      const kf = [...document.styleSheets].flatMap((s) => [...s.cssRules]).find((r) => r.name === "resource-ring");
      return { anim: getComputedStyle(el).animationName, rings: window.__rings.slice(), n: document.querySelectorAll('[data-testid="hand-ring"]').length, kf: kf?.cssText ?? "" };
    });
    assert.equal(ring.anim, "resource-ring", `${v.tag}: ring animation`);
    assert.deepEqual(ring.rings, ["resource-timber"], `${v.tag}: one gain, one ring on timber: ${JSON.stringify(ring.rings)}`);
    assert.equal(ring.n, 1, `${v.tag}: one ring on the page`);
    assert.match(ring.kf, /rgb\(255, 255, 255\) 0px 0px 0px 2px/, `${v.tag}: 2 px ring`);
    await page.screenshot({ path: `test-results/hand-cards-${v.tag}.png` });
    await page.waitForTimeout(1500);
    await setHand(page, { timber: 4 });
    await page.waitForFunction(() => window.__rings.length === 2, null, { timeout: STEP_MS });
    assert.equal(await page.locator('[data-testid="resource-flash"]').textContent(), "-1", `${v.tag}: loss label`);
    assert.deepEqual(errors, [], `${v.tag}: console errors`);
    console.log(`${v.tag} ${v.width}x${v.height}: fills ${RESOURCES.map((r) => cards[r].fill).join(" ")}; counts 28px/600, contrast ` +
      RESOURCES.map((r) => ratio(parse(cards[r].color), parse(cards[r].fill)).toFixed(1)).join(" ") + "; zero cards 0.4; 1 ring per change; 0 console errors");
    await page.waitForTimeout(1400);
    await proveResourceMotion(page, v.tag);
    if (v.tag === "desk") {
      await proveDynamicMotionCancellation(page, v.tag);
      await proveBaselineLifecycle(page, ctx, v.tag);
    }
    console.log(`${v.tag}: bank-trade motion sampled from WAAPI, fixed footprint, immediate deltas, restart, clipping and settle proved`);
    await ctx.close();
  }

  // Reduced motion on the short touch viewport keeps the ring as a 1 ms step and the delta as a readable 1200 ms fade.
  const rm = await open(VIEWS[2], true);
  await setHand(rm.page, { timber: 2 });
  await rm.page.locator('[data-testid="hand-ring"]').waitFor({ timeout: STEP_MS });
  const dur = await rm.page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="hand-ring"]')).animationDuration);
  assert.equal(dur, "0.001s", "reduced motion: ring duration");
  await proveReducedMotion(rm.page, "reduced-short");
  assert.deepEqual(rm.errors, [], "reduced motion: console errors");
  console.log(`reduced short touch: ring runs ${dur}; card motion removed; +N/-N use 1200 ms opacity fade`);
  await rm.ctx.close();
  console.log("hand-cards-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
