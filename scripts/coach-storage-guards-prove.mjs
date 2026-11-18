// Fast deterministic Node proof for src/components/game/FirstGameCoach.tsx
// cross-tab StorageEvent synchronization, storage clear, and in-memory fallback guards.
// Run: npm run coach-storage-guards-prove
import assert from "node:assert/strict";
import { createServer } from "vite";

process.on("unhandledRejection", (e) => {
  if (String(e).includes("transport was disconnected")) return;
  console.error("Unhandled:", e);
});

const store = new Map();
const winListeners = new Map();
let throwStorage = false;

const windowObj = {
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
  document: {
    querySelector: () => null,
  },
};

const localStorageObj = {
  getItem: (k) => {
    if (throwStorage) throw new Error("SecurityError: storage disabled");
    return store.has(k) ? store.get(k) : null;
  },
  setItem: (k, v) => {
    if (throwStorage) throw new Error("SecurityError: storage disabled");
    store.set(k, String(v));
  },
  removeItem: (k) => {
    if (throwStorage) throw new Error("SecurityError: storage disabled");
    store.delete(k);
  },
  clear: () => {
    if (throwStorage) throw new Error("SecurityError: storage disabled");
    store.clear();
  },
};

globalThis.window = windowObj;
globalThis.localStorage = localStorageObj;

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

let checks = 0;
const ok = (msg) => { checks++; console.log(`ok   ${msg}`); };

try {
  const coach = await vite.ssrLoadModule("/src/components/game/FirstGameCoach.tsx");

  // Check 1: readCoach returns null when storage key is removed after having been saved
  store.clear();
  coach.saveCoach("done");
  assert.equal(coach.readCoach(), "done", "coach saved done");
  // Simulate storage key removal / clear
  store.delete("emberisle-first-game-coach");
  assert.equal(coach.readCoach(), null, "readCoach returns null when storage item is removed");
  ok("readCoach resets to null when storage item is removed instead of leaking stale memory");

  // Check 2: Cross-tab StorageEvent synchronizes 'done' state to subscribers
  let notifiedState = undefined;
  const unsub = coach.subscribeCoach((s) => { notifiedState = s; });
  store.set("emberisle-first-game-coach", JSON.stringify("done"));
  windowObj.dispatchEvent({ type: "storage", key: "emberisle-first-game-coach", newValue: JSON.stringify("done") });
  assert.equal(notifiedState, "done", "subscriber received done from cross-tab storage event");
  assert.equal(coach.readCoach(), "done", "readCoach returns done after storage event");
  ok("cross-tab StorageEvent synchronizes advancement/skip to subscribers");

  // Check 3: Storage clear (key: null) resets state across tabs
  store.clear();
  windowObj.dispatchEvent({ type: "storage", key: null, newValue: null });
  assert.equal(notifiedState, null, "subscriber received null on storage clear event");
  assert.equal(coach.readCoach(), null, "readCoach returns null on storage clear event");
  ok("storage clear event (key: null) resets coach state and notifies subscribers");

  // Check 4: Cross-tab item removal (key: KEY, newValue: null) resets state
  store.set("emberisle-first-game-coach", JSON.stringify("done"));
  coach.readCoach();
  store.delete("emberisle-first-game-coach");
  windowObj.dispatchEvent({ type: "storage", key: "emberisle-first-game-coach", newValue: null });
  assert.equal(notifiedState, null, "subscriber received null when key was removed in another tab");
  assert.equal(coach.readCoach(), null, "readCoach returns null after key removal event");
  ok("item removal event (key: KEY, newValue: null) resets coach state and notifies subscribers");

  // Check 5: In-memory fallback works without throwing when storage is unavailable
  throwStorage = true;
  coach.saveCoach("done");
  assert.equal(coach.readCoach(), "done", "in-memory fallback retains state when storage throws");
  coach.saveCoach(null);
  assert.equal(coach.readCoach(), null, "in-memory fallback allows clearing state when storage throws");
  throwStorage = false;
  ok("in-memory fallback functions safely when localStorage throws");

  unsub();
  console.log(`coach-storage-guards-prove: all ${checks} checks passed`);
} finally {
  await new Promise((r) => setTimeout(r, 50));
  await vite.close();
}
