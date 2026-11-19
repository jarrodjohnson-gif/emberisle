// Proves store lifecycle guards in src/lib/game/store.ts:
// 1. Hotseat playAgain stops end music, clears pending landing knocks, and keeps victoryTarget.
// 2. pickHex offline refuses illegal current robberHex immediately instead of opening pendingSteal.
// 3. Online rematch, tradeOffer, openOffer, reconnecting, and welcome clear stale banners/outcomes and dangling timers.
// 4. A failed lazy trade-sound chunk import produces zero unhandled rejections.
// Run: npm run store-lifecycle-guards-prove
import assert from "node:assert/strict";
import { createServer } from "vite";

const soundCalls = [];
const stopCalls = [];
let fakeTableEvents = null;
let failTradeSound = false;

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

// Controllable timer queue so every test is deterministic with zero wall-clock sleeps.
let nextTimerId = 1;
const activeTimers = new Map();
const origSetTimeout = globalThis.setTimeout;
const origClearTimeout = globalThis.clearTimeout;
const origWindow = globalThis.window;
const origDocument = globalThis.document;
const origLocalStorage = globalThis.localStorage;
const origSessionStorage = globalThis.sessionStorage;

function fakeSetTimeout(fn, ms = 0) {
  const id = nextTimerId++;
  activeTimers.set(id, { id, fn, ms });
  return id;
}
function fakeClearTimeout(id) {
  activeTimers.delete(id);
}
function flushTimers(filter = () => true) {
  for (const [id, entry] of [...activeTimers.entries()]) {
    if (!activeTimers.has(id) || !filter(entry)) continue;
    activeTimers.delete(id);
    entry.fn();
  }
}

const listeners = new Map();
globalThis.window = {
  location: { href: "https://emberisle.example/" },
  matchMedia: () => ({ matches: false }),
  addEventListener: (k, fn) => { (listeners.get(k) ?? listeners.set(k, new Set()).get(k)).add(fn); },
  removeEventListener: (k, fn) => { listeners.get(k)?.delete(fn); },
};
globalThis.document = { visibilityState: "visible", activeElement: null };
globalThis.localStorage = makeStorage();
globalThis.sessionStorage = makeStorage();

function makeVite(rejectTradeSound) {
  failTradeSound = rejectTradeSound;
  return createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    plugins: [
      {
        name: "store-lifecycle-mocks",
        enforce: "pre",
        resolveId(source) {
          if (source === "@/lib/sound" || source.endsWith("/sound") || source.endsWith("/sound.ts")) return "\0mock-sound";
          if (source === "@/lib/net/table" || source.endsWith("/net/table") || source.endsWith("/net/table.ts")) return "\0mock-table";
          if (rejectTradeSound && (source === "../trade-sound" || source.endsWith("/trade-sound") || source.endsWith("/trade-sound.ts"))) {
            return "\0mock-trade-sound-fail";
          }
          return null;
        },
        load(id) {
          if (id === "\0mock-sound") {
            return `
              export const haptics = {};
              export function play(name, vol) { globalThis.__soundSpy.play(name, vol); }
              export function playLater(name) { globalThis.__soundSpy.play(name, 1); }
              export function playTradePlease() {}
              export function stop(name) { globalThis.__soundSpy.stop(name); }
              export function resetTradePlease() {}
              export function yourTurn() {}
            `;
          }
          if (id === "\0mock-table") {
            return `
              export function hostUrl() { return "wss://emberisle.example/"; }
              export function connectTable(_url, events) {
                globalThis.__tableSpy.setEvents(events);
                return {
                  open() {}, join() {}, watch() {}, peek() {}, list() {}, rejoin() {},
                  ready() {}, start() {}, setVictoryTarget() {}, rename() {}, addBot() {}, removeBot() {},
                  again() {}, wantAgain() {}, act() { return true; }, ask() {}, answer() {}, need() {}, cancel() {},
                  say() {}, sound() {}, react() {}, ttt() {}, wake() {}, close() {},
                };
              }
            `;
          }
          if (id === "\0mock-trade-sound-fail") {
            return `globalThis.__tradeSoundEval?.(); throw new Error("simulated offline trade-sound failure");`;
          }
          return null;
        },
      },
    ],
  });
}

globalThis.__soundSpy = {
  play: (name, vol) => soundCalls.push({ name, vol }),
  stop: (name) => stopCalls.push(name),
};
globalThis.__tableSpy = {
  setEvents: (ev) => { fakeTableEvents = ev; },
};

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  checks++;
};

const vite = await makeVite(false);
let failVite = null;

try {
  // Preload trade-sound so store.ts's eager import settles before fake timers or vite.close().
  await vite.ssrLoadModule("/src/lib/trade-sound.ts");
  const { useGame, hear } = await vite.ssrLoadModule("/src/lib/game/store.ts");
  const { createGame } = await vite.ssrLoadModule("/src/lib/game/board.ts");
  // Preload mock table so hostTable() resolves synchronously inside fake timers.
  await vite.ssrLoadModule("/src/lib/net/table.ts");

  globalThis.setTimeout = fakeSetTimeout;
  globalThis.clearTimeout = fakeClearTimeout;

  // 1. Hotseat playAgain stops end_music/isaac_win, clears pending knocks, and preserves victoryTarget.
  {
    activeTimers.clear();
    soundCalls.length = 0;
    stopCalls.length = 0;
    useGame.getState().startHotseat(3);
    const base = useGame.getState().state;
    // Queue a pending piece-landing knock via hear() (outpost built in non-reduced motion).
    const before = structuredClone(base);
    before.phase = "main";
    const after = structuredClone(before);
    after.vertices[0].building = { playerId: "p0", kind: "outpost" };
    hear(before, after, "p0", "hotseat");
    ok(activeTimers.size > 0, "control: hear queued landing knock timer");

    // End the 7-point game and trigger hotseat rematch.
    const over = structuredClone(after);
    over.victoryTarget = 7;
    over.phase = "over";
    over.winner = "p1";
    useGame.setState({ state: over, mode: "hotseat", screen: "play" });

    soundCalls.length = 0;
    stopCalls.length = 0;
    useGame.getState().playAgain();

    ok(stopCalls.includes("end_music"), "hotseat playAgain stops end_music");
    ok(stopCalls.includes("isaac_win"), "hotseat playAgain stops isaac_win");
    eq(useGame.getState().state?.victoryTarget, 7, "hotseat playAgain preserves victoryTarget 7");
    // Flush any remaining timers: the pre-rematch landing knock must NOT fire.
    flushTimers();
    ok(!soundCalls.some((c) => c.name === "outpost_place"), "hotseat playAgain cancels pending landing knocks");
  }

  // 2. pickHex offline refuses current robberHex immediately without opening pendingSteal.
  {
    activeTimers.clear();
    const g = createGame({ humans: [{ name: "A" }, { name: "B" }, { name: "C" }], bots: 0, seed: 11 });
    g.phase = "robber";
    g.current = "p0";
    const curHex = g.hexes.find((h) => h.id === g.robberHex);
    const otherHex = g.hexes.find((h) => h.id !== g.robberHex);
    const curCorners = g.vertices.filter((v) => v.hexes.includes(curHex.id));
    curCorners[0].building = { playerId: "p1", kind: "outpost" };
    curCorners[3].building = { playerId: "p2", kind: "outpost" };
    const otherCorners = g.vertices.filter((v) => v.hexes.includes(otherHex.id) && !v.building);
    otherCorners[0].building = { playerId: "p1", kind: "outpost" };
    otherCorners[2].building = { playerId: "p2", kind: "outpost" };
    g.players[1].resources.timber = 2;
    g.players[2].resources.clay = 2;

    useGame.setState({ mode: "ai", localId: "p0", screen: "play", state: g, buildMode: "none", pendingSteal: null, error: null });

    // Clicking the illegal current robberHex must refuse immediately and keep pendingSteal null.
    useGame.getState().pickHex(curHex.id);
    eq(useGame.getState().pendingSteal, null, "pickHex on current robberHex does not open pendingSteal");
    eq(useGame.getState().error, "The wayfarer must move.", "pickHex on current robberHex reports refusal");

    // Control: clicking a legal different hex with 2 victims still opens pendingSteal.
    useGame.getState().pickHex(otherHex.id);
    eq(useGame.getState().pendingSteal?.hexId, otherHex.id, "control: legal hex with 2 victims opens pendingSteal");
    eq(useGame.getState().pendingSteal?.targets.length, 2, "control: pendingSteal lists both victims");
  }

  // 3. Online rematch, openOffer, tradeOffer, reconnecting, and welcome clear stale outcomes/banners and timers.
  {
    activeTimers.clear();
    // 3a: openOffer replacing an open offer must not leave a dangling outcomeTimer from endOffer.
    const g = createGame({ humans: [{ name: "A" }], bots: 2, seed: 12 });
    g.phase = "main";
    g.current = "p0";
    g.players[0].resources.timber = 4;
    useGame.setState({ mode: "ai", localId: "p0", screen: "play", state: g, offer: null, declined: [], tradeOutcome: null, tradeTaker: null });

    useGame.getState().askTable({ timber: 1 }, { ore: 1 });
    ok(useGame.getState().offer !== null, "control: first practice offer opens");
    const beforeReplaceTimers = new Set(activeTimers.keys());
    useGame.getState().askTable({ timber: 1 }, { wool: 1 });
    // Any 2500ms BANNER_MS outcomeTimer created by endOffer during replacement must have been cleared.
    const danglingOutcomeTimers = [...activeTimers.values()].filter((t) => t.ms === 2500 && !beforeReplaceTimers.has(t.id));
    eq(danglingOutcomeTimers.length, 0, "openOffer replacing an offer leaves no dangling outcomeTimer");
    useGame.getState().goTitle();
    activeTimers.clear();

    // 3b: online connect — test tradeOffer, reconnecting, welcome, and online rematch cleanup.
    useGame.getState().hostTable();
    for (let i = 0; i < 20 && !fakeTableEvents; i++) await Promise.resolve();
    ok(fakeTableEvents !== null, "control: mock online table connected");

    const game1 = createGame({ humans: [{ name: "A" }, { name: "B" }, { name: "C" }], bots: 0, seed: 13 });
    game1.phase = "main";
    game1.current = "p0";
    const legal = { outpost: [], path: [], stronghold: [], wayfarer: [], steal: {}, discard: 0, actions: [] };

    fakeTableEvents.welcome({ proto: 1, code: "ABCD", you: "s0", host: true, chat: [], victoryTarget: 10, wayfarerMode: "on" });
    fakeTableEvents.state({ you: "p0", game: game1, legal, serverNow: Date.now() });

    // Open and close an online offer to arm outcomeTimer and populate tradeOutcome/tradeTaker.
    fakeTableEvents.tradeOffer({ tradeId: "t1", from: "p0", give: { timber: 1 }, want: { ore: 1 }, seconds: null });
    fakeTableEvents.tradeClosed({ tradeId: "t1", taker: "p1" });
    eq(useGame.getState().tradeOutcome, "B takes it.", "control: tradeClosed sets tradeOutcome");
    eq(useGame.getState().tradeTaker, "p1", "control: tradeClosed sets tradeTaker");
    ok([...activeTimers.values()].some((t) => t.ms === 2500), "control: tradeClosed arms outcomeTimer");

    // Reconnecting must clear stale tradeOutcome/tradeTaker and cancel outcomeTimer.
    fakeTableEvents.reconnecting(1);
    eq(useGame.getState().tradeOutcome, null, "reconnecting clears stale tradeOutcome");
    eq(useGame.getState().tradeTaker, null, "reconnecting clears stale tradeTaker");
    eq([...activeTimers.values()].filter((t) => t.ms === 2500).length, 0, "reconnecting clears outcomeTimer");

    // Same for welcome after another closed trade.
    fakeTableEvents.tradeOffer({ tradeId: "t2", from: "p0", give: { timber: 1 }, want: { ore: 1 }, seconds: null });
    fakeTableEvents.tradeClosed({ tradeId: "t2", taker: "p2" });
    eq(useGame.getState().tradeOutcome, "C takes it.", "control: second tradeClosed sets tradeOutcome");
    fakeTableEvents.welcome({ proto: 1, code: "ABCD", you: "s0", host: true, chat: [], victoryTarget: 10, wayfarerMode: "on" });
    eq(useGame.getState().tradeOutcome, null, "welcome clears stale tradeOutcome");
    eq(useGame.getState().tradeTaker, null, "welcome clears stale tradeTaker");
    eq([...activeTimers.values()].filter((t) => t.ms === 2500).length, 0, "welcome clears outcomeTimer");

    // tradeOffer after a closed trade must clear the previous outcomeTimer.
    fakeTableEvents.tradeOffer({ tradeId: "t3", from: "p0", give: { timber: 1 }, want: { ore: 1 }, seconds: null });
    fakeTableEvents.tradeClosed({ tradeId: "t3", taker: "p1" });
    ok([...activeTimers.values()].some((t) => t.ms === 2500), "control: t3 arms outcomeTimer");
    fakeTableEvents.tradeOffer({ tradeId: "t4", from: "p0", give: { clay: 1 }, want: { ore: 1 }, seconds: null });
    eq([...activeTimers.values()].filter((t) => t.ms === 2500).length, 0, "new online tradeOffer clears previous outcomeTimer");

    // Online rematch (over -> rollOff) must clear banner, tradeOutcome, tradeTaker, knocks, and timers.
    // Arm a real 2500 ms bannerTimer via a winning longest-path swing before the rematch arrives.
    const overGame = structuredClone(game1);
    overGame.longestRoad = "p0";
    overGame.phase = "over";
    overGame.winner = "p0";
    fakeTableEvents.state({ you: "p0", game: overGame, legal, serverNow: Date.now() });
    eq(useGame.getState().banner, "A holds the longest path", "control: winning award swing arms banner via showBanner");
    fakeTableEvents.tradeOffer({ tradeId: "t5", from: "p0", give: { timber: 1 }, want: { ore: 1 }, seconds: null });
    fakeTableEvents.tradeClosed({ tradeId: "t5", taker: "p1" });
    eq([...activeTimers.values()].filter((t) => t.ms === 2500).length, 2, "control: both bannerTimer and outcomeTimer are live before rematch");
    const rematchGame = createGame({ humans: [{ name: "A" }, { name: "B" }, { name: "C" }], bots: 0, seed: 99, winnerFirst: true });
    fakeTableEvents.state({ you: "p0", game: rematchGame, legal, serverNow: Date.now() });
    eq(useGame.getState().banner, null, "online rematch clears stale banner");
    eq(useGame.getState().tradeOutcome, null, "online rematch clears stale tradeOutcome");
    eq(useGame.getState().tradeTaker, null, "online rematch clears stale tradeTaker");
    eq([...activeTimers.values()].filter((t) => t.ms === 2500).length, 0, "online rematch clears stale outcomeTimer/bannerTimer");

    useGame.getState().goTitle();
  }

  // 4. Failed lazy trade-sound chunk load produces zero unhandled rejections.
  {
    globalThis.setTimeout = origSetTimeout;
    globalThis.clearTimeout = origClearTimeout;
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(String(reason));
    let evaluated = false;
    let onEval = null;
    const evalDone = new Promise((resolve) => { onEval = resolve; });
    globalThis.__tradeSoundEval = () => { evaluated = true; onEval?.(); };
    process.on("unhandledRejection", onUnhandled);
    try {
      failVite = await makeVite(true);
      const { hear: failHear } = await failVite.ssrLoadModule("/src/lib/game/store.ts");
      const g = createGame({ humans: [{ name: "A" }, { name: "B" }, { name: "C" }], bots: 0, seed: 21 });
      const before = { ...g, phase: "main", winner: null };
      const after = { ...g, phase: "over", winner: "p0" };
      failHear(before, after, "p0", "ai");
      let evalTimer;
      try {
        await Promise.race([
          evalDone,
          new Promise((_, reject) => {
            evalTimer = origSetTimeout(() => reject(new Error("timed out waiting for failing trade-sound module evaluation")), 5000);
          }),
        ]);
      } finally {
        origClearTimeout(evalTimer);
      }
      ok(evaluated, "control: failing trade-sound module was evaluated");
      for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r));
      eq(unhandled.length, 0, "failed trade-sound import triggers zero unhandled rejections");
    } finally {
      delete globalThis.__tradeSoundEval;
      process.off("unhandledRejection", onUnhandled);
    }
  }

  console.log(`store-lifecycle-guards-prove ok (${checks} checks)`);
} finally {
  globalThis.setTimeout = origSetTimeout;
  globalThis.clearTimeout = origClearTimeout;
  globalThis.window = origWindow;
  globalThis.document = origDocument;
  globalThis.localStorage = origLocalStorage;
  globalThis.sessionStorage = origSessionStorage;
  delete globalThis.__soundSpy;
  delete globalThis.__tableSpy;
  await vite.close();
  await failVite?.close();
}
