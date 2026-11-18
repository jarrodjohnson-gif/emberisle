// Guards for HUD pure helpers and talk state:
// 1. talk.tsx table switch (s.code !== p.code) does not bubble 1-line welcome history and resets cooldown timers/flags.
// 2. talk.tsx sendBoard ignores spectator calls instead of arming resting and calling sendSound.
// 3. talk.tsx loadEmotes clears its cached promise on transient import failure so a retry succeeds.
// 4. seat-public-gains.ts publicSeatChanges ignores lastProduction on reset/rewind (next.seq <= previous.seq) while keeping live gains.
import assert from "node:assert/strict";
import { createServer } from "vite";

// Minimal browser globals for importing store.ts / talk.tsx in Node without a browser.
const storage = new Map();
globalThis.localStorage ??= {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
};
globalThis.window ??= {
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { search: "", hash: "", pathname: "/", origin: "http://localhost" },
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
};
globalThis.matchMedia ??= globalThis.window.matchMedia;

let failEmotesOnce = true;
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
  plugins: [
    {
      name: "inject-transient-emotes-failure",
      enforce: "pre",
      load(id) {
        if (id.endsWith("/src/components/game/emotes.ts")) {
          if (failEmotesOnce) {
            failEmotesOnce = false;
            return 'throw new Error("transient emotes chunk error");';
          }
          return 'export const EMOTES = { "ben-10": "/emotes/ben-10.webp" };';
        }
      },
    },
  ],
});

let failures = 0;
async function check(label, fn) {
  try {
    await fn();
    console.log(`ok   ${label}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL ${label}: ${err.message}`);
  }
}

try {
  const { useGame } = await vite.ssrLoadModule("/src/lib/game/store.ts");
  const { loadEmotes, sendBoard, sendReaction, useTalk } = await vite.ssrLoadModule("/src/components/game/talk.tsx");
  const { publicSeatChanges } = await vite.ssrLoadModule("/src/components/game/seat-public-gains.ts");

  // 1. Joining a table whose welcome carries 1 history line must not bubble it; switching tables resets cooldowns.
  await check("talk table switch ignores 1-line welcome history and clears cooldowns", () => {
    const reactCalls = [];
    const soundCalls = [];
    useGame.setState({
      code: "AAAA",
      spectator: false,
      chat: [],
      reactions: [],
      sendReact: (e) => reactCalls.push(e),
      sendSound: (id) => soundCalls.push(id),
    });
    sendReaction("🔥");
    sendBoard("bong");
    assert.equal(useTalk.getState().cooling, true);
    assert.equal(useTalk.getState().resting, true);
    assert.equal(reactCalls.length, 1);
    assert.equal(soundCalls.length, 1);

    // Switch to table BBBB whose welcome history has 1 prior chat line.
    const oldLine = { id: 7, seat: "s1", player: null, name: "Tide", color: "#2d6ee8", text: "earlier", at: Date.now() - 60_000 };
    useGame.setState({ code: "BBBB", chat: [oldLine], reactions: [] });
    assert.equal(useTalk.getState().arrived.size, 0, "welcome history line must not be stamped into arrived");
    assert.equal(useTalk.getState().cooling, false, "switching tables clears reaction cooldown");
    assert.equal(useTalk.getState().resting, false, "switching tables clears soundboard cooldown");

    // A genuine live chat line appended on the same table still stamps arrived.
    const liveLine = { id: 8, seat: "s1", player: null, name: "Tide", color: "#2d6ee8", text: "live", at: Date.now() };
    useGame.setState({ chat: [oldLine, liveLine] });
    assert.equal(useTalk.getState().arrived.has(8), true, "live chat line stamps arrived");
    assert.equal(useTalk.getState().arrived.has(7), false, "history line stays unstamped");
  });

  // 2. sendBoard refuses spectator calls without arming resting or invoking sendSound.
  await check("talk sendBoard ignores spectator calls", () => {
    const soundCalls = [];
    useTalk.setState({ resting: false });
    useGame.setState({ code: "CCCC", spectator: true, chat: [], reactions: [], sendSound: (id) => soundCalls.push(id) });
    sendBoard("bong");
    assert.equal(soundCalls.length, 0, "spectator must not call sendSound");
    assert.equal(useTalk.getState().resting, false, "spectator call must not arm resting cooldown");
  });

  // 3. loadEmotes recovers after a transient dynamic import failure.
  await check("talk loadEmotes clears failed promise so retry succeeds", async () => {
    await assert.rejects(() => loadEmotes(), /transient emotes chunk error/);
    // Clear Vite's failed SSR module graph entry for emotes.ts so the retry reloads it.
    for (const mod of vite.moduleGraph.idToModuleMap.values()) {
      if (mod.id?.endsWith("/src/components/game/emotes.ts")) vite.moduleGraph.invalidateModule(mod);
    }
    const emotes = await loadEmotes();
    assert.deepEqual(emotes, { "ben-10": "/emotes/ben-10.webp" });
  });

  // 4. publicSeatChanges ignores lastProduction on reset/rewind (next.seq <= previous.seq) and keeps live gains.
  await check("seat-public-gains ignores lastProduction when next.seq <= previous.seq", () => {
    const players = [{ id: "p0", name: "Ember" }, { id: "p1", name: "Tide" }];
    const setupPrev = { seq: 12, rolls: 0, log: [], lastProduction: [], players };
    const rewoundNext = {
      seq: 1,
      rolls: 1,
      log: ["Ember rolled 6!"],
      lastProduction: [{ player: "p0", res: "timber", n: 2 }],
      players,
    };
    assert.deepEqual(publicSeatChanges(setupPrev, rewoundNext), [], "reset/rewind must not emit production gains");

    const sameSeqNext = { ...rewoundNext, seq: 12 };
    assert.deepEqual(publicSeatChanges(setupPrev, sameSeqNext), [], "equal seq must not emit production gains");

    const liveNext = { ...rewoundNext, seq: 13 };
    assert.deepEqual(publicSeatChanges(setupPrev, liveNext), [{ player: "p0", goods: { timber: 2 } }], "advancing seq emits production gains");
  });
} finally {
  await vite.close();
}

if (failures) {
  console.log(`hud-helpers-guards-prove: ${failures} check(s) failed`);
  process.exit(1);
}
console.log("hud-helpers-guards-prove: ok (4 checks)");
process.exit(0);
