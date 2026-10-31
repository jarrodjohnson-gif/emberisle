// Jelly Ocean hand, V1 Column goods cards (#773, docs/design/goods-cards-v1): paper faces with the symbol, count and name
// centred on one axis (within 0.5 px, from getBoundingClientRect), stable counts and footprints, a gain's full-colour fill
// with a +N tab from the top edge and a loss's hollow red −N tab, held FLASH_MS (2200 ms) and faded over 300 ms, bounded
// lift/dip movement on actual game actions, isolated/restarting deltas, clipping, quiet reconnect/hotseat baselines and
// fully static reduced motion. The tests hold WAAPI timelines and wait for cue cleanup between samples.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8436;
const STEP_MS = 15_000;
const RESOURCES = ["timber", "clay", "wool", "grain", "ore"];
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
const NAMES = { timber: "Wood", clay: "Brick", wool: "Sheep", grain: "Wheat", ore: "Stone" };
// The good's colour, its side colour and the text on its full fill (styles.css :root).
const PAINT = {
  timber: ["#2f6a4f", "#173d35", "#ffffff"],
  clay: ["#b8533d", "#74372b", "#ffffff"],
  wool: ["#b2ce80", "#617744", "#263d3c"],
  grain: ["#e3c462", "#8c722d", "#263d3c"],
  ore: ["#63748a", "#414d5b", "#ffffff"],
};
// The cue's whole life: FLASH_MS (2200) held, then a 300 ms fade (Hand.tsx CUE_MS).
const CUE_MS = 3000;
// Each layout's fixed card: upright and short as today; the wide, fine-pointer layout at 1.3x the upright mock.
const SIZE = {
  desk: { box: [88, 80], symbol: 22, count: 30, name: 12 },
  port: { box: [66.8, 62], symbol: 18, count: 24, name: 10 },
  short: { box: [47.2, 44], symbol: 14, count: 24, name: 0 },
};
// A gain lifts by the tray's --goods-lift: 6 px upright, 4 px short and where the hand heads a wide screen's stack.
const LIFT = { desk: -4, port: -6, short: -4 };
// The +N / −N pill (#825): 24 px tall with 14 px text, 20 px above the card; 28 px, 17.5 px and 24 px on the wide fine-pointer layout.
const TAB = {
  desk: { font: ["17.5px", "700"], h: 28, above: 24 },
  port: { font: ["14px", "700"], h: 24, above: 20 },
  short: { font: ["14px", "700"], h: 24, above: 20 },
};

// The symbol, the count and the name of every card centre on the card's vertical axis within 0.5 px, and so do the lit
// copy's when a gain lays one over it. Read from getBoundingClientRect, so a glyph box that is off-centre cannot hide.
async function centring(page, tag, { lit = false } = {}) {
  const rows = await page.evaluate((lit) => ["timber", "clay", "wool", "grain", "ore"].flatMap((r) => {
    const card = document.querySelector(`[data-testid="resource-${r}"]`);
    const face = lit ? card.querySelector('[data-testid="goods-lit"]') : card;
    if (!face) return [];
    const c = card.getBoundingClientRect();
    const mid = c.left + c.width / 2;
    return [...face.querySelectorAll(":scope > svg, :scope > .goods-count, :scope > .goods-label")].filter((e) => e.getBoundingClientRect().width > 0).map((e) => {
      const b = e.getBoundingClientRect();
      return { r, part: e.tagName === "svg" ? "symbol" : e.classList.contains("goods-count") ? "count" : "name", off: b.left + b.width / 2 - mid, w: b.width, h: b.height, top: b.top - c.top, size: parseFloat(getComputedStyle(e).fontSize) };
    });
  }), lit);
  assert.ok(rows.length > 0, `${tag}: centring found the card parts${lit ? " (lit)" : ""}`);
  for (const p of rows) assert.ok(Math.abs(p.off) <= 0.5, `${tag} ${p.r} ${p.part}${lit ? " (lit)" : ""}: centred within 0.5 px (off by ${p.off.toFixed(3)} px)`);
  const worst = Math.max(...rows.map((p) => Math.abs(p.off)));
  return { rows, worst };
}

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
    assert.equal(c.duration, CUE_MS, `${tag} ${r}: movement holds with the fill and settles as it fades (duration ${c.duration})`);
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
  await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'), null, { timeout: STEP_MS });
}

async function proveResourceMotion(page, tag) {
  await craftMotionHand(page);
  await motionBaseline(page);

  // The first change goes through the actual trade panel and the store's rules dispatcher.
  await page.getByRole("button", { name: "Trade", exact: true }).click();
  await page.getByTestId("trade-panel").waitFor();
  await page.getByRole("button", { name: "More Stone to give", exact: true }).click();
  await page.getByRole("button", { name: "More Sheep to want", exact: true }).click();
  await page.getByRole("button", { name: /^(Bank 4|Dock 3|Dock 2):1$/ }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="resource-wool"] [data-testid="hand-count"]')?.textContent.trim() === "2", null, { timeout: STEP_MS });
  await sampleCardMotion(page, { wool: { count: "2", flash: "+1", y: LIFT[tag] }, ore: { count: "4", flash: "\u22124", y: 2 } }, tag);
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
  assert.equal(restart.ore.flash, "\u22124", `${tag}: second loss shows −N at zero`);
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
      if (anim) {
        const last = anim.effect.getKeyframes().at(-1);
        if (Math.abs(new DOMMatrixReadOnly(last.transform).m42) > 0.1) throw new Error(`${r}: final movement keyframe does not return to rest`);
        // play() at the end rewinds the native animation; finish the controlled timeline instead.
        anim.finish();
      }
    }
  });
  const settled = await page.evaluate(() => ["wool", "ore"].map((r) => {
    const c = document.querySelector(`[data-testid="resource-${r}"]`);
    const transform = getComputedStyle(c).transform;
    return [r, transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42, getComputedStyle(c).opacity];
  }));
  for (const [r, y] of settled) assert.ok(Math.abs(y) <= 0.1, `${tag} ${r}: bounded animation returns to zero at its endpoint (y=${y})`);
  // Opacity uses its own CSS transition and can start on a later compositor frame on software GL.
  // Keep the immediate count check above; wait for this independent visual transition to settle.
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="resource-ore"]')).opacity === "1", null, { timeout: STEP_MS });
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
  await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'), null, { timeout: STEP_MS });
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
  assert.equal(started.duration, CUE_MS, `${tag}: live preference fixture uses bounded card motion`);
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
  await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'), null, { timeout: STEP_MS });
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
  await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'), null, { timeout: STEP_MS });
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
    const lit = wool.querySelector('[data-testid="goods-lit"]');
    const lost = ore.querySelector('[data-testid="goods-lost"]');
    if (fade) { fade.pause(); fade.currentTime = 600; }
    const still = (e) => e && { name: getComputedStyle(e).animationName, opacity: getComputedStyle(e).opacity, transform: getComputedStyle(e).transform, animations: e.getAnimations().length };
    return {
      lit: still(lit), lost: still(lost),
      litFill: lit && getComputedStyle(lit).backgroundColor,
      cardTransforms: [ore, wool].map((c) => getComputedStyle(c).transform),
      count: ore.querySelector('[data-testid="hand-count"]').textContent.trim(),
      loss: ore.parentElement.querySelector('[data-testid="resource-flash"]')?.textContent.trim(),
      gain: wool.parentElement.querySelector('[data-testid="resource-flash"]')?.textContent.trim(),
      transforms: transforms.length,
      fadeName: getComputedStyle(flash).animationName,
      fadeDuration: fade?.effect.getTiming().duration,
      fadeOpacity: Number(getComputedStyle(flash).opacity),
      fadeProps: fade?.effect.getKeyframes().map((f) => Object.keys(f).filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k))),
      footprint: [ore.offsetWidth, ore.offsetHeight],
    };
  });
  assert.equal(reduced.count, "0", `${tag}: reduced-motion loss reaches zero immediately`);
  assert.equal(reduced.loss, "\u22124", `${tag}: reduced-motion loss remains visible`);
  assert.equal(reduced.gain, "+1", `${tag}: reduced-motion gain remains visible`);
  assert.equal(reduced.transforms, 0, `${tag}: reduced motion removes card transforms`);
  assert.equal(reduced.fadeName, "none", `${tag}: reduced-motion labels use the opacity fade`);
  assert.equal(reduced.fadeDuration, undefined, `${tag}: reduced-motion feedback lasts 1200ms`);
  assert.equal(reduced.fadeOpacity, 1, `${tag}: midpoint label stays readable at opacity ${reduced.fadeOpacity}`);
  assert.equal(reduced.fadeProps, undefined, `${tag}: reduced-motion feedback changes opacity only`);
  // The highlight stands still: the gain's fill and the loss's ring are up at full opacity, with no animation or transform.
  assert.deepEqual(reduced.lit, { name: "none", opacity: "1", transform: "none", animations: 0 }, `${tag}: reduced-motion gain fill is a still highlight`);
  assert.deepEqual(reduced.lost, { name: "none", opacity: "1", transform: "none", animations: 0 }, `${tag}: reduced-motion loss ring is a still highlight`);
  assert.deepEqual(parse(reduced.litFill), rgb(PAINT.wool[0]), `${tag}: reduced-motion gain fill is the good's colour`);
  assert.deepEqual(reduced.cardTransforms, ["none", "none"], `${tag}: reduced-motion cards carry no transform`);
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
    // A slow runner (software GL under CI load) can take longer than a cue's 2500 ms between finding a cue and reading it,
    // and the cue is gone by then. While __holdCues is set, the hand's 2500 ms end-of-cue timer waits for __releaseCues(),
    // so a measured cue stays on the page until the proof has read it. clearTimeout still cancels a held timer.
    const later = window.setTimeout.bind(window);
    const clear = window.clearTimeout.bind(window);
    const held = new Map();
    window.setTimeout = function (fn, ms, ...args) {
      if (window.__holdCues && ms === 3000 && typeof fn === "function") {
        const id = later(() => {}, 2_147_000_000);
        held.set(id, () => fn(...args));
        return id;
      }
      return later(fn, ms, ...args);
    };
    window.clearTimeout = function (id) {
      held.delete(id);
      return clear(id);
    };
    window.__releaseCues = () => {
      window.__holdCues = false;
      const due = [...held.entries()];
      held.clear();
      for (const [id, fn] of due) { clear(id); fn(); }
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
    await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"], [data-testid="goods-lit"], [data-testid="goods-lost"]'), null, { timeout: STEP_MS }); // the first set's cues are over
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
            symbol: (() => { const b = el.querySelector("svg").getBoundingClientRect(); return [b.width, b.height]; })(),
            label: (() => { const l = getComputedStyle(el.querySelector(".goods-label")); return { size: l.fontSize, weight: l.fontWeight, spacing: l.letterSpacing, transform: l.textTransform }; })(),
            box: (() => { const b = el.getBoundingClientRect(); return [Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; })(),
          }];
        }),
      ),
    );
    const want = { timber: 3, clay: 0, wool: 12, grain: 1, ore: 0 };
    for (const r of RESOURCES) {
      const c = cards[r];
      const fill = parse(c.fill);
      assert.deepEqual(fill, rgb(want[r] === 0 ? "#eeece7" : "#fff9f0"), `${v.tag} ${r}: fill ${c.fill}`);
      assert.deepEqual(parse(c.color), rgb("#263d3c"), `${v.tag} ${r}: count colour ${c.color}`);
      const cr = ratio(parse(c.color), fill);
      assert.ok(cr >= 4.5, `${v.tag} ${r}: count contrast ${cr.toFixed(2)}`);
      assert.equal(c.text, String(want[r]), `${v.tag} ${r}: count`);
      assert.equal(c.size, `${SIZE[v.tag].count}px`, `${v.tag} ${r}: count size`);
      assert.equal(c.weight, "700", `${v.tag} ${r}: count weight`);
      assert.match(c.tabular, /tabular-nums/, `${v.tag} ${r}: tabular`);
      assert.ok(c.sizes.every((s) => s.px <= SIZE[v.tag].count), `${v.tag} ${r}: count is the largest text ${JSON.stringify(c.sizes)}`);
      assert.ok(c.sizes.filter((s) => s.px === parseFloat(c.size)).length === 1, `${v.tag} ${r}: only the count is ${c.size}`);
      // V1: an 18 px symbol (14 px in the short card), a 24 px count, and a 10 px tracked uppercase name.
      assert.deepEqual(c.symbol, [SIZE[v.tag].symbol, SIZE[v.tag].symbol], `${v.tag} ${r}: symbol size`);
      if (SIZE[v.tag].name) assert.deepEqual(c.label, { size: `${SIZE[v.tag].name}px`, weight: "700", spacing: `${+(SIZE[v.tag].name * 0.08).toFixed(2)}px`, transform: "uppercase" }, `${v.tag} ${r}: tracked name`);
      assert.deepEqual(c.box, SIZE[v.tag].box, `${v.tag} ${r}: card footprint is its layout's fixed size`);
      assert.equal(c.opacity, "1", `${v.tag} ${r}: opacity`);
      assert.ok(c.icon && c.iconOpacity === "1", `${v.tag} ${r}: icon at 70 % (${c.iconOpacity})`);
      assert.deepEqual(c.visibleText, v.tag === "short" ? [String(want[r])] : [String(want[r]), {timber:"Wood",clay:"Brick",wool:"Sheep",grain:"Wheat",ore:"Stone"}[r]], `${v.tag} ${r}: only the count is visible text`);
      assert.equal(c.title, { timber: "Wood", clay: "Brick", wool: "Sheep", grain: "Wheat", ore: "Stone" }[r], `${v.tag} ${r}: title`);
      assert.match(c.name, new RegExp(`${c.title}`, "i"), `${v.tag} ${r}: accessible name kept for screen readers`);
    }
    const tinted = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="resource-"]')].filter((e) => /emerald|rose/.test(e.className)).length);
    assert.equal(tinted, 0, `${v.tag}: no emerald / rose fill`);

    const still = await centring(page, v.tag);

    // A gain fills its card once, a loss rings its card once, each with one tab, and the old corner ring is gone. Counted
    // from the DOM, so a re-render cannot hide a second one. The cues unmount when they end (soon on a slow runner), so
    // their computed style is read at mount.
    await page.evaluate(() => {
      window.__cues = [];
      new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && ["goods-lit", "goods-lost", "resource-flash", "hand-ring"].includes(n.dataset?.testid)) {
          const cs = getComputedStyle(n);
          window.__cues.push({ what: n.dataset.testid, on: n.parentElement.dataset.testid, anim: cs.animationName, duration: cs.animationDuration });
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    await page.evaluate(() => (window.__holdCues = true));
    await setHand(page, { timber: 5 });
    await page.waitForFunction(() => window.__cues.length === 2, null, { timeout: STEP_MS });
    await page.evaluate(() => { const g = window.__emberisle; g.setState({ state: structuredClone(g.getState().state) }); });
    await page.waitForTimeout(300);
    // Hold the cue at full strength (1200 ms into its 2500 ms) and read the lit face and the tab.
    const gain = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="resource-timber"]');
      // The card's own lift is held too, so the tab is probed where it really goes.
      for (const an of card.getAnimations({ subtree: true })) { an.pause(); an.currentTime = 1200; }
      const lit = card.querySelector('[data-testid="goods-lit"]');
      const tab = card.querySelector('[data-testid="resource-flash"]');
      const c = card.getBoundingClientRect();
      const t = tab.getBoundingClientRect();
      // The tab takes no taps, so hit testing skips it; let it take them for the probe. A clipped or covered tab still loses.
      tab.style.pointerEvents = "auto";
      const hit = document.elementFromPoint(t.left + t.width / 2, t.top + 1);
      tab.style.pointerEvents = "";
      const lc = getComputedStyle(lit);
      return {
        cues: window.__cues.slice(), fill: lc.backgroundColor, opacity: lc.opacity,
        count: getComputedStyle(lit.querySelector(".goods-count")).color, litText: lit.textContent,
        symbol: getComputedStyle(lit.querySelector("svg")).color,
        tab: { font: [getComputedStyle(tab).fontSize, getComputedStyle(tab).fontWeight], h: t.height, text: tab.textContent, bg: getComputedStyle(tab).backgroundColor, color: getComputedStyle(tab).color, edge: getComputedStyle(tab).boxShadow, off: t.left + t.width / 2 - (c.left + c.width / 2), above: c.top - t.top, into: t.bottom - c.top, opacity: getComputedStyle(tab).opacity },
        tabOnTop: hit === tab || tab.contains(hit), lift: c.top - card.parentElement.getBoundingClientRect().top,
        hit: hit && `${hit.tagName}.${String(hit.className).slice(0, 60)} ${hit.dataset?.testid ?? ""}`,
        tabBox: [t.top, t.bottom, t.left, t.right], stackTop: card.closest("[data-hud-stack]")?.getBoundingClientRect().top,
        tray: getComputedStyle(card.closest(".goods-tray")).paddingTop,
      };
    });
    assert.deepEqual(gain.cues.map((q) => [q.what, q.on]), [["goods-lit", "resource-timber"], ["resource-flash", "resource-timber"]], `${v.tag}: one gain, one fill and one tab on timber, none after a cloned setState`);
    assert.ok(gain.cues.every((q) => q.anim === "goods-cue" && q.duration === "3s"), `${v.tag}: the fill and the tab hold 2500 ms and fade over 500 ms (${JSON.stringify(gain.cues)})`);
    assert.deepEqual(parse(gain.fill), rgb(PAINT.timber[0]), `${v.tag}: gain fills the card with the good's colour`);
    assert.equal(gain.opacity, "1", `${v.tag}: the fill is at full strength while it holds`);
    assert.equal(gain.tab.opacity, "1", `${v.tag}: the tab is at full strength while it holds`);
    assert.deepEqual(parse(gain.count), rgb(PAINT.timber[2]), `${v.tag}: the count on the fill is the good's on-colour`);
    assert.deepEqual(parse(gain.symbol), rgb(PAINT.timber[2]), `${v.tag}: the symbol on the fill is the good's on-colour`);
    assert.ok(ratio(parse(gain.count), parse(gain.fill)) >= 4.5, `${v.tag}: count on the fill ≥ 4.5:1 (${ratio(parse(gain.count), parse(gain.fill)).toFixed(2)})`);
    assert.equal(gain.litText, "5Wood", `${v.tag}: the lit face shows the new count`);
    assert.equal(gain.tab.text, "+2", `${v.tag}: gain tab reads +N`);
    assert.deepEqual(parse(gain.tab.bg), rgb("#fff9f0"), `${v.tag}: gain tab is the light paper pill`);
    assert.deepEqual(parse(gain.tab.color), rgb("#263d3c"), `${v.tag}: gain tab text is the dark ink`);
    assert.ok(ratio(parse(gain.tab.color), parse(gain.tab.bg)) >= 4.5, `${v.tag}: gain tab ≥ 4.5:1`);
    assert.ok(Math.abs(gain.tab.off) <= 0.5, `${v.tag}: the tab is centred on its card (off by ${gain.tab.off.toFixed(3)} px)`);
    assert.deepEqual(gain.tab.font, TAB[v.tag].font, `${v.tag}: the +N tab is ${TAB[v.tag].font[0]} bold`);
    assert.ok(Math.abs(gain.tab.h - TAB[v.tag].h) <= 0.5, `${v.tag}: the +N tab is ${TAB[v.tag].h} px tall (${gain.tab.h})`);
    assert.ok(Math.abs(gain.tab.above - TAB[v.tag].above) <= 0.5 && Math.abs(gain.tab.into - 4) <= 0.5, `${v.tag}: the tab grows out of the card's top edge (${gain.tab.above} px above, ${gain.tab.into} px into it)`);
    assert.ok(Math.abs(gain.lift - LIFT[v.tag]) <= 0.35, `${v.tag}: the gained card is lifted ${LIFT[v.tag]} px while the fill holds (${gain.lift})`);
    assert.equal(gain.tabOnTop, true, `${v.tag}: nothing covers or clips the tab (${JSON.stringify([gain.hit, gain.tabBox, gain.stackTop, gain.tray])})`);
    const lit = await centring(page, `${v.tag} gain`, { lit: true });
    await page.screenshot({ path: `test-results/hand-cards-${v.tag}.png` });
    await page.evaluate(() => { for (const an of document.querySelector('[data-testid="resource-timber"]').getAnimations({ subtree: true })) an.play(); });
    await page.evaluate(() => window.__releaseCues());
    await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'), null, { timeout: STEP_MS });
    await page.evaluate(() => (window.__holdCues = true));
    await setHand(page, { timber: 4 });
    await page.waitForFunction(() => window.__cues.length === 4, null, { timeout: STEP_MS });
    const loss = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="resource-timber"]');
      const tab = card.querySelector('[data-testid="resource-flash"]');
      const t = tab.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      window.__releaseCues();
      return { cues: window.__cues.slice(2), lit: !!card.querySelector('[data-testid="goods-lit"]'), font: [getComputedStyle(tab).fontSize, getComputedStyle(tab).fontWeight], h: t.height, above: c.top - t.top, text: tab.textContent, bg: getComputedStyle(tab).backgroundColor, color: getComputedStyle(tab).color, edge: getComputedStyle(tab).boxShadow, off: t.left + t.width / 2 - (c.left + c.width / 2) };
    });
    assert.deepEqual(loss.cues.map((q) => [q.what, q.on]), [["goods-lost", "resource-timber"], ["resource-flash", "resource-timber"]], `${v.tag}: one loss, one red ring and one tab on timber`);
    assert.equal(loss.lit, false, `${v.tag}: a loss does not fill the card`);
    assert.equal(loss.text, "−1", `${v.tag}: loss tab reads −N`);
    assert.deepEqual(parse(loss.bg), rgb("#fff9f0"), `${v.tag}: loss tab is hollow (paper)`);
    assert.deepEqual(parse(loss.color), rgb("#263d3c"), `${v.tag}: loss tab text is the dark ink`);
    assert.match(loss.edge, /rgb\(23, 61, 53\) 0px 0px 0px 1.5px inset/, `${v.tag}: loss tab has a 1.5 px outline in the good's side colour`);
    assert.ok(ratio(parse(loss.color), parse(loss.bg)) >= 4.5, `${v.tag}: loss tab ≥ 4.5:1`);
    assert.ok(Math.abs(loss.off) <= 0.5, `${v.tag}: the loss tab is centred on its card`);
    assert.deepEqual(loss.font, TAB[v.tag].font, `${v.tag}: the −N tab is ${TAB[v.tag].font[0]} bold`);
    assert.ok(Math.abs(loss.h - TAB[v.tag].h) <= 0.5 && Math.abs(loss.above - TAB[v.tag].above) <= 0.5, `${v.tag}: the −N tab is ${TAB[v.tag].h} px tall and grows out of the top edge (${loss.h}, ${loss.above})`);
    assert.ok(!gain.cues.concat(loss.cues).some((q) => q.what === "hand-ring"), `${v.tag}: no ring is drawn`);
    assert.equal(await page.locator('[data-testid="hand-ring"]').count(), 0, `${v.tag}: no ring on the page`);
    assert.deepEqual(errors, [], `${v.tag}: console errors`);
    console.log(`${v.tag} ${v.width}x${v.height}: ${SIZE[v.tag].box.join("x")} cards, ${SIZE[v.tag].symbol} px symbols, ${SIZE[v.tag].count} px tabular counts; fills ${RESOURCES.map((r) => cards[r].fill).join(" ")}; contrast ` +
      RESOURCES.map((r) => ratio(parse(cards[r].color), parse(cards[r].fill)).toFixed(1)).join(" ") + `; symbol, count and name centred within ${still.worst.toFixed(3)} px at rest, ${lit.worst.toFixed(3)} px lit; ` +
      `gain fill ${gain.fill}, count ${ratio(parse(gain.count), parse(gain.fill)).toFixed(2)}:1, +2 tab ${gain.tab.font.join(" ")} ${gain.tab.h} px tall ${ratio(parse(gain.tab.color), parse(gain.tab.bg)).toFixed(2)}:1, −1 tab ${ratio(parse(loss.color), parse(loss.bg)).toFixed(2)}:1; 1 cue per change; 0 console errors`);
    await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'), null, { timeout: STEP_MS });
    await proveResourceMotion(page, v.tag);
    if (v.tag === "desk") {
      await proveDynamicMotionCancellation(page, v.tag);
      await proveBaselineLifecycle(page, ctx, v.tag);
    }
    console.log(`${v.tag}: bank-trade motion sampled from WAAPI, fixed footprint, immediate deltas, restart, clipping and settle proved`);
    await ctx.close();
  }

  // Reduced motion on the short touch viewport: the fill and the tab are still (no animation), and no card moves.
  const rm = await open(VIEWS[2], true);
  await rm.page.evaluate(() => {
    window.__cueDurations = [];
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && ["goods-lit", "resource-flash"].includes(n.dataset?.testid)) window.__cueDurations.push(getComputedStyle(n).animationDuration);
    }).observe(document.body, { childList: true, subtree: true });
  });
  await setHand(rm.page, { timber: 2 });
  await rm.page.waitForFunction(() => window.__cueDurations.length >= 2, null, { timeout: STEP_MS });
  const dur = await rm.page.evaluate(() => window.__cueDurations.slice());
  assert.ok(dur.every((d) => d === "0s"), `reduced motion: the fill and the tab do not animate (${dur})`);
  await proveReducedMotion(rm.page, "reduced-short");
  assert.deepEqual(rm.errors, [], "reduced motion: console errors");
  console.log(`reduced short touch: fill and tab run ${dur.join(", ")}; card motion removed; the highlight and +N/−N stand still`);
  await rm.ctx.close();
  // A wide, short window with a fine pointer (1000x450): the non-phone layout in the short range keeps main's card and tray
  // (139.2x52 in a 60 px tray), and the box stays that size before, during and after a gain and a loss. The tab hangs from
  // the tray's top edge there, so the scrolling HUD stack does not clip it.
  {
    const ds = await open({ tag: "deskshort", width: 1000, height: 450 }, false);
    const box = () => ds.page.evaluate(() => ["timber", "clay", "wool", "grain", "ore"].map((r) => {
      const card = document.querySelector(`[data-testid="resource-${r}"]`);
      const t = card.closest(".goods-tray").getBoundingClientRect();
      return { r, w: Math.round(card.getBoundingClientRect().width * 10) / 10, h: card.offsetHeight, tray: Math.round(t.height * 10) / 10 };
    }));
    await setHand(ds.page, { timber: 3, clay: 0, wool: 2, grain: 1, ore: 0 });
    await ds.page.waitForFunction(() => document.querySelector('[data-testid="resource-wool"]')?.textContent.includes("2"), null, { timeout: STEP_MS });
    await ds.page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"], [data-testid="goods-lit"], [data-testid="goods-lost"]'), null, { timeout: STEP_MS });
    const rest = await box();
    for (const c of rest) assert.deepEqual([c.w, c.h, c.tray], [139.2, 52, 60], `deskshort ${c.r}: card is main's 139.2x52 in a 60 px tray (${JSON.stringify(c)})`);
    const during = [];
    for (const hand of [{ timber: 5 }, { wool: 1 }]) {
      await ds.page.evaluate(() => (window.__holdCues = true));
      await setHand(ds.page, hand);
      await ds.page.waitForSelector('[data-testid="resource-flash"]', { timeout: STEP_MS });
      // Hold every cue and the card's own motion at 1200 ms, inside the hold, and read the boxes and the tab there.
      const tab = await ds.page.evaluate(() => {
        for (const a of document.querySelector(".goods-tray").getAnimations({ subtree: true })) { a.pause(); a.currentTime = 1200; }
        const t = document.querySelector('[data-testid="resource-flash"]');
        const r = t.getBoundingClientRect();
        t.style.pointerEvents = "auto";
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 1);
        t.style.pointerEvents = "";
        return { top: hit === t || t.contains(hit), font: getComputedStyle(t).fontSize, h: r.height };
      });
      assert.equal(tab.top, true, `deskshort ${JSON.stringify(hand)}: nothing clips or covers the tab`);
      assert.ok(tab.font === "14px" && Math.abs(tab.h - 22) <= 0.5, `deskshort ${JSON.stringify(hand)}: the tab is 14 px text, 22 px tall (${JSON.stringify(tab)})`);
      during.push(await box());
      await ds.page.evaluate(() => { for (const a of document.querySelector(".goods-tray").getAnimations({ subtree: true })) a.play(); window.__releaseCues(); });
      await ds.page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'), null, { timeout: STEP_MS });
    }
    const after = await box();
    for (const b of [...during, after]) assert.deepEqual(b, rest, `deskshort: the card and tray boxes are fixed during and after a cue (${JSON.stringify(b)})`);
    assert.deepEqual(ds.errors, [], "deskshort: console errors");
    console.log(`deskshort 1000x450 fine pointer: cards ${rest[0].w}x${rest[0].h} in a ${rest[0].tray} px tray, unchanged through a gain and a loss; tab unclipped`);
    await ds.ctx.close();
  }
  console.log("hand-cards-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
