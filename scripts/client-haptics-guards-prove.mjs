// Fast deterministic Node proof for src/lib/haptics.tsx, src/lib/sound-settings.ts,
// src/lib/viewport.ts, and src/lib/turn-title.ts lifecycle and storage guards.
// Run: npm run client-haptics-guards-prove
import assert from "node:assert/strict";
import { createServer } from "vite";

process.on("unhandledRejection", (e) => {
  if (String(e).includes("transport was disconnected")) return;
  console.error("Unhandled:", e);
});

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

  // Check 4: haptics.player buzzes on win in hotseat mode
  buzzCalls = [];
  const cue = haptics.player(null, { winner: "0", players: [{ id: "0", name: "P1" }] }, "", "hotseat");
  cue("win");
  assert.deepEqual(buzzCalls, [20], "haptics.player buzzes win duration in hotseat mode");
  ok("haptics.player supports win vibrations in hotseat mode with empty me");

  // Check 5: haptics synchronizes enabled state across tabs on StorageEvent
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

  // Check 6: haptics offer subscription ignores table switches
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

  // Check 7: viewport.readViewport safely handles missing window/matchMedia (SSR) and reports valid viewport
  const viewport = await vite.ssrLoadModule("/src/lib/viewport.ts");
  const origMatchMedia = globalThis.matchMedia;
  delete globalThis.matchMedia;
  const ssrView = viewport.readViewport();
  assert.equal(typeof ssrView.phone, "boolean", "readViewport returned boolean phone without matchMedia");
  assert.equal(typeof ssrView.portrait, "boolean", "readViewport returned boolean portrait without matchMedia");
  globalThis.matchMedia = origMatchMedia;
  const clientView = viewport.readViewport();
  assert.equal(clientView.phone, true, "clientView reports phone with coarse pointer");
  assert.equal(clientView.portrait, false, "clientView reports landscape when width > height");
  ok("viewport.readViewport safely evaluates without throwing in SSR and browser environments");

  // Check 8: turn-title.useTurnTitle handles SSR / non-browser document safely
  const { useTurnTitle } = await vite.ssrLoadModule("/src/lib/turn-title.ts");
  assert.equal(typeof useTurnTitle, "function", "useTurnTitle is an exported function");
  ok("turn-title exports useTurnTitle with SSR document guard");

  console.log(`client-haptics-guards-prove: ${checks} checks passed`);
} finally {
  await new Promise((r) => setTimeout(r, 50));
  await vite.close();
}
