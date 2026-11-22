// Fast deterministic Node proof for src/lib/haptics.tsx, src/lib/sound-settings.ts,
// src/lib/viewport.ts, and src/lib/turn-title.ts lifecycle and storage guards.
// Run: npm run client-haptics-guards-prove
import assert from "node:assert/strict";
import { createServer } from "vite";

process.on("unhandledRejection", (e) => {
  if (String(e).includes("transport was disconnected")) return;
  console.error("Unhandled:", e);
});

// Minimal hook harness to test useEffect registrations and unmount cleanup.
function createHarness() {
  let stateSlots = [];
  let effectSlots = [];
  let stateIdx = 0;
  let effectIdx = 0;
  let pendingEffects = [];

  const api = {
    useState(initial) {
      const i = stateIdx++;
      if (!(i in stateSlots)) {
        stateSlots[i] = typeof initial === "function" ? initial() : initial;
      }
      const setState = (next) => {
        const prev = stateSlots[i];
        stateSlots[i] = typeof next === "function" ? next(prev) : next;
      };
      return [stateSlots[i], setState];
    },
    useEffect(fn) {
      const i = effectIdx++;
      pendingEffects.push({ i, fn });
    },
    useCallback(fn) {
      return fn;
    },
    useMemo(fn) {
      return fn();
    },
    useRef(init) {
      return { current: init };
    },
    useDebugValue() {},
    useSyncExternalStore(sub, getSnap) {
      return getSnap();
    },
  };

  function mount(fn) {
    stateIdx = 0;
    effectIdx = 0;
    pendingEffects = [];
    const result = fn();
    for (const item of pendingEffects) {
      const cleanup = item.fn();
      effectSlots[item.i] = { cleanup: typeof cleanup === "function" ? cleanup : undefined };
    }
    return result;
  }

  function unmount() {
    for (const slot of effectSlots) slot?.cleanup?.();
    stateSlots = [];
    effectSlots = [];
    pendingEffects = [];
  }

  return { api, mount, unmount };
}

const store = new Map();
const winListeners = new Map();
const windowObj = {
  innerWidth: 1024,
  innerHeight: 768,
  location: { href: "http://127.0.0.1:8000/", search: "", hash: "", pathname: "/", origin: "http://127.0.0.1:8000" },
  addEventListener(type, fn) {
    const list = winListeners.get(type) ?? [];
    list.push(fn);
    winListeners.set(type, list);
  },
  removeEventListener(type, fn) {
    const list = winListeners.get(type);
    if (list) winListeners.set(type, list.filter((e) => e !== fn));
  },
  dispatchEvent(event) {
    const list = [...(winListeners.get(event.type) ?? [])];
    for (const fn of list) fn(event);
    return true;
  },
  listenerCount(type) {
    return (winListeners.get(type) ?? []).length;
  },
};
const localStorageObj = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => { store.clear(); },
};

let buzzCalls = [];
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    vibrate: (ms) => {
      buzzCalls.push(ms);
      return true;
    },
  },
});
globalThis.window = windowObj;
globalThis.localStorage = localStorageObj;
globalThis.matchMedia = (q) => ({
  matches: true,
  media: q,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
});

const harness = createHarness();
import React from "react";
const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
internals.H = harness.api;

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

let checks = 0;
const ok = (msg) => { checks++; console.log(`ok   ${msg}`); };

try {
  // Check 1: sound-settings categoryGain safely handles unknown/missing categories
  const soundSettings = await vite.ssrLoadModule("/src/lib/sound-settings.ts");
  assert.equal(soundSettings.categoryGain("game"), 1, "game category starts at 1");
  assert.equal(soundSettings.categoryGain("unknown"), 0, "unknown category safely returns 0 gain");
  soundSettings.setCategoryVolume("unknown", 0.5);
  soundSettings.setCategoryMuted("unknown", true);
  ok("sound-settings guards unknown categories against TypeError in categoryGain and volume/mute setters");

  // Check 2: sound-settings synchronizes mix across tabs on StorageEvent
  let notified = 0;
  const unsubSound = soundSettings.subscribeSoundMix(() => { notified++; });
  store.set("emberisle-sound-mix", JSON.stringify({ master: 0.3, game: { volume: 0.7, muted: true } }));
  windowObj.dispatchEvent({ type: "storage", key: "emberisle-sound-mix", newValue: store.get("emberisle-sound-mix") });
  const updatedMix = soundSettings.getSoundMix();
  assert.equal(updatedMix.master, 0.3, "master volume synchronized from storage event");
  assert.equal(updatedMix.game.volume, 0.7, "game volume synchronized from storage event");
  assert.equal(updatedMix.game.muted, true, "game mute synchronized from storage event");
  assert.ok(notified > 0, "storage event notified subscribers");
  // Test storage clear (key: null) resets to defaults
  store.clear();
  windowObj.dispatchEvent({ type: "storage", key: null, newValue: null });
  assert.equal(soundSettings.getSoundMix().master, 1, "storage clear reset master volume to default");
  assert.equal(soundSettings.getSoundMix().game.volume, 1, "storage clear reset game volume to default");
  assert.equal(soundSettings.getSoundMix().game.muted, false, "storage clear reset game mute to default");
  unsubSound();
  ok("sound-settings synchronizes master/category mix and resets on cross-tab StorageEvents");

  // Check 3: haptics.buzz rejects negative, NaN, zero, and infinite durations
  await vite.ssrLoadModule("/src/lib/sound.ts");
  windowObj.dispatchEvent({ type: "pointerdown" });
  const haptics = await vite.ssrLoadModule("/src/lib/haptics.tsx");
  buzzCalls = [];
  haptics.buzz(-10);
  haptics.buzz(NaN);
  haptics.buzz(Infinity);
  haptics.buzz(-Infinity);
  haptics.buzz(0);
  haptics.buzz("15");
  assert.deepEqual(buzzCalls, [], "buzz rejected non-positive or non-finite durations");
  haptics.buzz(15);
  assert.deepEqual(buzzCalls, [15], "buzz accepted valid positive finite duration");
  ok("haptics.buzz guards navigator.vibrate against negative, NaN, zero, and infinite durations");

  // Check 4: haptics synchronizes enabled state across tabs on StorageEvent
  store.set("emberisle-haptics", "0");
  windowObj.dispatchEvent({ type: "storage", key: "emberisle-haptics", newValue: "0" });
  buzzCalls = [];
  haptics.buzz(15);
  assert.deepEqual(buzzCalls, [], "buzz silenced after cross-tab storage event turned haptics off");
  store.clear();
  windowObj.dispatchEvent({ type: "storage", key: null, newValue: null });
  haptics.buzz(15);
  assert.deepEqual(buzzCalls, [15], "buzz restored after cross-tab storage clear reset haptics to default");
  ok("haptics synchronizes on/off preference and resets on cross-tab StorageEvents");

  // Check 5: haptics offer subscription ignores table switches
  const { useGame } = await vite.ssrLoadModule("/src/lib/game/store.ts");
  buzzCalls = [];
  // Transition with table switch: previous.code !== next.code with an offer present
  useGame.setState({ code: "ROOM1", screen: "play", localId: "0", spectator: false, offer: null });
  useGame.setState({ code: "ROOM2", screen: "play", localId: "0", spectator: false, offer: { from: "1", give: {}, want: {} } });
  assert.deepEqual(buzzCalls, [], "offer on table switch did not trigger trade offer buzz");
  // New incoming offer on same table during play screen
  useGame.setState({ code: "ROOM2", screen: "play", localId: "0", spectator: false, offer: null });
  buzzCalls = [];
  useGame.setState({ code: "ROOM2", screen: "play", localId: "0", spectator: false, offer: { from: "2", give: {}, want: {} } });
  assert.deepEqual(buzzCalls, [10], "genuine incoming trade offer during active play buzzed tradeOffer");
  ok("haptics trade offer subscription ignores table switches");

  // Check 6: viewport.readViewport safely handles missing window and missing matchMedia in SSR
  const viewport = await vite.ssrLoadModule("/src/lib/viewport.ts");
  // Subtest 6a: missing matchMedia in browser-like environment
  const origMatchMedia = globalThis.matchMedia;
  delete globalThis.matchMedia;
  const noMqView = viewport.readViewport();
  assert.equal(typeof noMqView.phone, "boolean", "readViewport returned boolean phone without matchMedia");
  assert.equal(typeof noMqView.portrait, "boolean", "readViewport returned boolean portrait without matchMedia");
  globalThis.matchMedia = origMatchMedia;

  // Subtest 6b: missing window entirely (pure Node / SSR)
  const origWin = globalThis.window;
  delete globalThis.window;
  const ssrView = viewport.readViewport();
  assert.deepEqual(ssrView, { phone: false, portrait: false }, "readViewport safely returned fallback when window is undefined");
  globalThis.window = origWin;
  ok("viewport.readViewport safely evaluates without throwing when window or matchMedia is undefined");

  // Check 7: useViewport registers orientationchange, supports addListener fallback, and cleans up on unmount
  let addListenerCalls = 0;
  let removeListenerCalls = 0;
  const legacyMq = {
    matches: false,
    media: "(pointer: coarse)",
    // Legacy MediaQueryList: only addListener/removeListener, NO addEventListener
    addListener: (cb) => { addListenerCalls++; },
    removeListener: (cb) => { removeListenerCalls++; },
  };
  globalThis.matchMedia = () => legacyMq;
  const initialResizeCount = windowObj.listenerCount("resize");
  const initialOrientationCount = windowObj.listenerCount("orientationchange");

  // Mount useViewport with legacy MediaQueryList
  const viewState = harness.mount(() => viewport.useViewport());
  assert.equal(typeof viewState.phone, "boolean");
  assert.equal(windowObj.listenerCount("resize"), initialResizeCount + 1, "resize listener registered");
  assert.equal(windowObj.listenerCount("orientationchange"), initialOrientationCount + 1, "orientationchange listener registered");
  assert.equal(addListenerCalls, 1, "legacy mq addListener fallback called");

  // Unmount useViewport and verify clean removal of all listeners
  harness.unmount();
  assert.equal(windowObj.listenerCount("resize"), initialResizeCount, "resize listener removed on unmount");
  assert.equal(windowObj.listenerCount("orientationchange"), initialOrientationCount, "orientationchange listener removed on unmount");
  assert.equal(removeListenerCalls, 1, "legacy mq removeListener called on unmount");
  globalThis.matchMedia = origMatchMedia;
  ok("viewport.useViewport registers orientationchange, supports addListener fallback, and cleans up symmetrically");

  // Check 8: turn-title.useTurnTitle runs safely without throwing when document is undefined in SSR
  // and when discardNeeded is undefined while it is not local player's turn
  const { useTurnTitle } = await vite.ssrLoadModule("/src/lib/turn-title.ts");
  // Set store state with current set to 'p1' (not localId) and discardNeeded undefined to verify optional chaining guard
  useGame.setState({ screen: "play", localId: "p0", state: { current: "p1", discardNeeded: undefined, phase: "turn" } });
  const origDoc = globalThis.document;
  delete globalThis.document;
  // Mount useTurnTitle with document undefined: effect executes and must not throw ReferenceError
  harness.mount(() => useTurnTitle());
  harness.unmount();
  if (origDoc !== undefined) globalThis.document = origDoc;
  ok("turn-title.useTurnTitle effect executes safely without throwing ReferenceError when document is undefined");

  console.log(`client-haptics-guards-prove: ${checks} checks passed`);
} finally {
  await new Promise((r) => setTimeout(r, 50));
  await vite.close();
}
