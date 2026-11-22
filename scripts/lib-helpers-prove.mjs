// Deterministic Node proof for src/lib/use-muted-seats.ts and src/lib/scroll-fade.ts lifecycle guards:
// 1. useMutedSeats(code) reflects the new table's muted seats immediately when code changes (no stale render frame).
// 2. Cross-tab StorageEvent with key: null (localStorage.clear) clears all cached tables in mutedByCode.
// 3. Cross-tab StorageEvent for another table's mute key evicts that cached table from mutedByCode.
// 4. useMutedSeats toggle, same-table storage sync, and unmount listener cleanup all work cleanly.
// 5. useMoreBelow resets more to false when the scroll container detaches (ref(null)) and disconnects observers.
// Run: npm run lib-helpers-prove
import assert from "node:assert/strict";
import { createServer } from "vite";

// Minimal synchronous React hook harness supporting useState, useEffect, and useLayoutEffect.
function createHookHarness() {
  let stateSlots = [];
  let effectSlots = [];
  let layoutSlots = [];
  let stateIdx = 0;
  let effectIdx = 0;
  let layoutIdx = 0;
  let pendingLayout = [];
  let pendingEffects = [];
  let renderFn = null;
  let lastResult;
  let scheduled = false;

  const depsChanged = (prev, next) =>
    !prev || !next || prev.length !== next.length || next.some((v, i) => !Object.is(v, prev[i]));

  const api = {
    useState(initial) {
      const i = stateIdx++;
      if (!(i in stateSlots)) {
        stateSlots[i] = typeof initial === "function" ? initial() : initial;
      }
      const setState = (next) => {
        const prev = stateSlots[i];
        const value = typeof next === "function" ? next(prev) : next;
        if (!Object.is(prev, value)) {
          stateSlots[i] = value;
          scheduled = true;
        }
      };
      return [stateSlots[i], setState];
    },
    useLayoutEffect(fn, deps) {
      const i = layoutIdx++;
      const prev = layoutSlots[i];
      if (!prev || depsChanged(prev.deps, deps)) {
        pendingLayout.push({ i, fn, deps, prevCleanup: prev?.cleanup });
      }
    },
    useEffect(fn, deps) {
      const i = effectIdx++;
      const prev = effectSlots[i];
      if (!prev || depsChanged(prev.deps, deps)) {
        pendingEffects.push({ i, fn, deps, prevCleanup: prev?.cleanup });
      }
    },
  };

  function runRender(fn) {
    renderFn = fn;
    stateIdx = 0;
    effectIdx = 0;
    layoutIdx = 0;
    pendingLayout = [];
    pendingEffects = [];
    scheduled = false;
    lastResult = fn();
    return lastResult;
  }

  function flushLayout() {
    while (pendingLayout.length) {
      const batch = pendingLayout;
      pendingLayout = [];
      for (const item of batch) {
        item.prevCleanup?.();
        const cleanup = item.fn();
        layoutSlots[item.i] = { deps: item.deps, cleanup: typeof cleanup === "function" ? cleanup : undefined };
      }
      if (scheduled) runRender(renderFn);
    }
  }

  function flushEffects() {
    while (pendingEffects.length || scheduled) {
      if (scheduled) {
        runRender(renderFn);
        flushLayout();
      }
      const batch = pendingEffects;
      pendingEffects = [];
      for (const item of batch) {
        item.prevCleanup?.();
        const cleanup = item.fn();
        effectSlots[item.i] = { deps: item.deps, cleanup: typeof cleanup === "function" ? cleanup : undefined };
      }
      if (scheduled) {
        runRender(renderFn);
        flushLayout();
      }
    }
  }

  function act(fn) {
    fn();
    if (scheduled) {
      runRender(renderFn);
      flushLayout();
      flushEffects();
    }
    return lastResult;
  }

  function unmount() {
    for (const slot of layoutSlots) slot?.cleanup?.();
    for (const slot of effectSlots) slot?.cleanup?.();
    stateSlots = [];
    effectSlots = [];
    layoutSlots = [];
    pendingLayout = [];
    pendingEffects = [];
    scheduled = false;
  }

  return {
    api,
    renderOnly(fn) { return runRender(fn); },
    mount(fn) {
      runRender(fn);
      flushLayout();
      flushEffects();
      return lastResult;
    },
    flush() {
      flushLayout();
      flushEffects();
      return lastResult;
    },
    act,
    unmount,
    current: () => lastResult,
  };
}

function makeEnv() {
  const store = new Map();
  const winListeners = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  const window = {
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
  const resizeObservers = [];
  class MockResizeObserver {
    constructor(cb) {
      this.cb = cb;
      this.observed = [];
      this.disconnected = false;
      resizeObservers.push(this);
    }
    observe(el) { this.observed.push(el); }
    disconnect() { this.disconnected = true; }
    trigger() { if (!this.disconnected) this.cb(); }
  }
  const mutationObservers = [];
  class MockMutationObserver {
    constructor(cb) {
      this.cb = cb;
      this.observed = [];
      this.disconnected = false;
      mutationObservers.push(this);
    }
    observe(el) { this.observed.push(el); }
    disconnect() { this.disconnected = true; }
    trigger() { if (!this.disconnected) this.cb(); }
  }
  globalThis.window = window;
  globalThis.localStorage = localStorage;
  globalThis.ResizeObserver = MockResizeObserver;
  globalThis.MutationObserver = MockMutationObserver;
  return { store, window, localStorage, resizeObservers, mutationObservers };
}

let checks = 0;
const ok = (msg) => { checks++; console.log(`ok   ${msg}`); };

const env = makeEnv();
const harness = createHookHarness();
globalThis.__libHelpersReact = harness.api;

const vite = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
  ssr: { noExternal: ["react"] },
  plugins: [
    {
      name: "lib-helpers-react-mock",
      enforce: "pre",
      resolveId(source) {
        if (source === "react") return "\0mock-react";
        return null;
      },
      load(id) {
        if (id === "\0mock-react") {
          return `
            export const useState = (...a) => globalThis.__libHelpersReact.useState(...a);
            export const useEffect = (...a) => globalThis.__libHelpersReact.useEffect(...a);
            export const useLayoutEffect = (...a) => globalThis.__libHelpersReact.useLayoutEffect(...a);
          `;
        }
        return null;
      },
    },
  ],
});

try {
  const { MUTE_EVENT, MUTE_KEY, mutedByCode, readMutedSeats } = await vite.ssrLoadModule("/src/lib/muted-seats.ts");
  const { useMutedSeats } = await vite.ssrLoadModule("/src/lib/use-muted-seats.ts");
  const { useMoreBelow } = await vite.ssrLoadModule("/src/lib/scroll-fade.ts");

  // Case 1: Switching table code on a mounted useMutedSeats immediately reflects the new table (no stale render frame).
  {
    env.localStorage.clear();
    mutedByCode.clear();
    env.localStorage.setItem(`${MUTE_KEY}ABCD`, JSON.stringify(["s1"]));
    let code = "ABCD";
    const first = harness.mount(() => useMutedSeats(code));
    assert.deepEqual([...first.muted], ["s1"], "initial mount at ABCD reads muted seat s1");

    code = "EFGH";
    const switchedRender = harness.renderOnly(() => useMutedSeats(code));
    assert.deepEqual([...switchedRender.muted], [], "switching code to EFGH clears muted seats on the same render frame");
    harness.flush();
    assert.deepEqual([...harness.current().muted], [], "EFGH stays empty after effects flush");
    harness.unmount();
    ok("useMutedSeats switches table code without a stale-seat render frame");
  }

  // Case 2: Cross-tab localStorage.clear() (StorageEvent with key: null) clears all cached codes in mutedByCode.
  {
    env.localStorage.clear();
    mutedByCode.clear();
    env.localStorage.setItem(`${MUTE_KEY}ABCD`, JSON.stringify(["s1"]));
    env.localStorage.setItem(`${MUTE_KEY}EFGH`, JSON.stringify(["s2"]));
    assert.deepEqual(readMutedSeats("ABCD"), ["s1"], "ABCD is cached in mutedByCode");
    assert.equal(mutedByCode.has("ABCD"), true, "mutedByCode holds ABCD");

    const mounted = harness.mount(() => useMutedSeats("EFGH"));
    assert.deepEqual([...mounted.muted], ["s2"], "mounted at EFGH reads s2");

    env.localStorage.clear();
    harness.act(() => {
      env.window.dispatchEvent({ type: "storage", key: null });
    });
    assert.deepEqual([...harness.current().muted], [], "storage clear updates mounted EFGH to empty");
    assert.equal(mutedByCode.has("ABCD"), false, "storage clear evicts other cached table ABCD");
    assert.deepEqual(readMutedSeats("ABCD"), [], "re-reading ABCD after storage clear returns empty");
    harness.unmount();
    ok("cross-tab localStorage.clear() clears every cached table in mutedByCode");
  }

  // Case 3: Cross-tab StorageEvent for another table evicts that table's cache while leaving current table intact.
  {
    env.localStorage.clear();
    mutedByCode.clear();
    env.localStorage.setItem(`${MUTE_KEY}ABCD`, JSON.stringify(["s1"]));
    env.localStorage.setItem(`${MUTE_KEY}EFGH`, JSON.stringify(["s2"]));
    assert.deepEqual(readMutedSeats("ABCD"), ["s1"], "ABCD starts cached with s1");

    harness.mount(() => useMutedSeats("EFGH"));
    assert.deepEqual([...harness.current().muted], ["s2"], "EFGH starts with s2");

    env.localStorage.setItem(`${MUTE_KEY}ABCD`, JSON.stringify([]));
    harness.act(() => {
      env.window.dispatchEvent({ type: "storage", key: `${MUTE_KEY}ABCD` });
    });
    assert.equal(mutedByCode.has("ABCD"), false, "storage event for ABCD evicts ABCD from mutedByCode");
    assert.deepEqual(readMutedSeats("ABCD"), [], "readMutedSeats(ABCD) reads updated empty list from storage");
    assert.deepEqual([...harness.current().muted], ["s2"], "EFGH keeps its own muted seat s2");
    harness.unmount();
    ok("cross-tab storage event for another table evicts its stale cache entry");
  }

  // Case 4: toggle, same-table storage sync, and unmount listener cleanup.
  {
    env.localStorage.clear();
    mutedByCode.clear();
    harness.mount(() => useMutedSeats("EFGH"));
    assert.equal(env.window.listenerCount(MUTE_EVENT), 1, "registers MUTE_EVENT listener");
    assert.equal(env.window.listenerCount("storage"), 1, "registers storage listener");

    harness.act(() => harness.current().toggle("s3"));
    assert.deepEqual([...harness.current().muted], ["s3"], "toggle adds s3");
    assert.equal(env.localStorage.getItem(`${MUTE_KEY}EFGH`), '["s3"]', "toggle writes to localStorage");

    env.localStorage.setItem(`${MUTE_KEY}EFGH`, JSON.stringify(["s4"]));
    harness.act(() => {
      env.window.dispatchEvent({ type: "storage", key: `${MUTE_KEY}EFGH` });
    });
    assert.deepEqual([...harness.current().muted], ["s4"], "same-table storage event updates live muted seats");

    harness.unmount();
    assert.equal(env.window.listenerCount(MUTE_EVENT), 0, "unmount removes MUTE_EVENT listener");
    assert.equal(env.window.listenerCount("storage"), 0, "unmount removes storage listener");
    ok("useMutedSeats toggle, same-table sync, and unmount cleanup work cleanly");
  }

  // Case 5: useMoreBelow resets more to false when ref detaches (null) and disconnects scroll/resize/mutation observers.
  {
    env.resizeObservers.length = 0;
    env.mutationObservers.length = 0;
    const listeners = new Map();
    const el = {
      scrollHeight: 400,
      clientHeight: 200,
      scrollTop: 0,
      addEventListener(type, fn) {
        const list = listeners.get(type) ?? [];
        list.push(fn);
        listeners.set(type, list);
      },
      removeEventListener(type, fn) {
        const list = listeners.get(type);
        if (list) listeners.set(type, list.filter((e) => e !== fn));
      },
      dispatch(type) {
        for (const fn of [...(listeners.get(type) ?? [])]) fn();
      },
    };

    const [setEl, initialMore] = harness.mount(() => useMoreBelow());
    assert.equal(initialMore, false, "initial more is false before element attaches");

    harness.act(() => setEl(el));
    assert.equal(harness.current()[1], true, "more becomes true when scrollHeight > clientHeight");
    assert.equal((listeners.get("scroll") ?? []).length, 1, "attaches scroll listener");
    assert.equal(env.resizeObservers.length, 1, "attaches ResizeObserver");
    assert.equal(env.mutationObservers.length, 1, "attaches MutationObserver");

    el.scrollTop = 200;
    harness.act(() => el.dispatch("scroll"));
    assert.equal(harness.current()[1], false, "scrolling to bottom clears more");

    el.scrollHeight = 500;
    harness.act(() => env.resizeObservers[0].trigger());
    assert.equal(harness.current()[1], true, "growing content sets more true again");

    // Detach the scroll container (ref(null)): more MUST reset to false and observers disconnect.
    harness.act(() => harness.current()[0](null));
    assert.equal(harness.current()[1], false, "detaching scroller (ref(null)) resets more to false");
    assert.equal((listeners.get("scroll") ?? []).length, 0, "detaching removes scroll listener");
    assert.equal(env.resizeObservers[0].disconnected, true, "detaching disconnects ResizeObserver");
    assert.equal(env.mutationObservers[0].disconnected, true, "detaching disconnects MutationObserver");
    harness.unmount();
    ok("useMoreBelow resets more to false on detach and disconnects all observers");
  }

  console.log(`lib-helpers-prove: ${checks} checks passed`);
} finally {
  delete globalThis.__libHelpersReact;
  await vite.close();
}
