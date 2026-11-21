// #720 (#608): bot moments, the presentation-only event model in src/lib/game/bot-moments.ts and the commit tap in
// src/lib/game/store.ts. Runs the real store and real rules; only sound and the table socket are stubbed.
//   1. Practice: a bot's successful commit makes one exact moment; a person's commit, a rejected action and a no-op make none.
//   2. A Path fortune makes one moment with every committed edge, for one path and for two.
//   3. Hidden things stay hidden: the bought fortune, discarded goods and the stolen good never enter a moment.
//   4. A bot's table ask makes one moment per trade id; a person's ask makes none.
//   5. Online: a silent baseline, then only changes with one clear bot owner. Duplicate and older pushes, repeated or
//      truncated logs, a reconnect and a rematch never re-announce; a batch of changes is one unordered summary.
//   6. The tap never steers play: a throwing listener changes nothing, the note comes after the store holds the state, and
//      a whole bot game plays to the same state with and without a listener.
// Run: npm run bot-moments-event-prove
import assert from "node:assert/strict";
import { createServer } from "vite";

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  checks++;
};

let tableEvents = null;
globalThis.__tableSpy = { setEvents: (ev) => (tableEvents = ev) };
function makeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
globalThis.window = {
  location: { href: "https://emberisle.example/" },
  matchMedia: () => ({ matches: false }),
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document = { visibilityState: "visible", activeElement: null };
globalThis.localStorage = makeStorage();
globalThis.sessionStorage = makeStorage();

// Fake timers: offers and banners run on these, so the game is deterministic with no sleeps.
const timers = new Map();
let nextTimer = 1;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
function flushTimers() {
  for (let round = 0; round < 20 && timers.size; round++) {
    for (const [id, fn] of [...timers]) {
      if (!timers.has(id)) continue;
      timers.delete(id);
      fn();
    }
  }
}

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: "custom",
  logLevel: "error",
  plugins: [
    {
      name: "bot-moments-mocks",
      enforce: "pre",
      resolveId(source) {
        if (source === "@/lib/sound" || source.endsWith("/sound") || source.endsWith("/sound.ts")) return "\0mock-sound";
        if (source === "@/lib/net/table" || source.endsWith("/net/table") || source.endsWith("/net/table.ts")) return "\0mock-table";
        return null;
      },
      load(id) {
        if (id === "\0mock-sound") {
          return `export const haptics = {}; export function play() {} export function playLater() {} export function playTradePlease() {}
            export function stop() {} export function resetTradePlease() {} export function yourTurn() {}`;
        }
        if (id === "\0mock-table") {
          return `export function hostUrl() { return "wss://emberisle.example/"; }
            export function connectTable(_url, events) {
              globalThis.__tableSpy.setEvents(events);
              return { open() {}, join() {}, watch() {}, peek() {}, list() {}, rejoin() {}, ready() {}, start() {}, setVictoryTarget() {},
                rename() {}, addBot() {}, removeBot() {}, again() {}, wantAgain() {}, act() { return true; }, ask() {}, answer() {},
                need() {}, cancel() {}, say() {}, sound() {}, react() {}, ttt() {}, wake() {}, close() {} };
            }`;
        }
        return null;
      },
    },
  ],
});

try {
  await vite.ssrLoadModule("/src/lib/trade-sound.ts");
  await vite.ssrLoadModule("/src/lib/net/table.ts");
  const { useGame, commitTap } = await vite.ssrLoadModule("/src/lib/game/store.ts");
  const { createGame } = await vite.ssrLoadModule("/src/lib/game/board.ts");
  const { applyAction, legalRoads, legalSettle } = await vite.ssrLoadModule("/src/lib/game/rules.ts");
  const { chooseBotAction } = await vite.ssrLoadModule("/src/lib/game/ai.ts");
  const { RESOURCES, RESOURCE_LABEL } = await vite.ssrLoadModule("/src/lib/game/types.ts");
  const { createBotMomentFeed, listenBotMoments, observeSnapshot, projectAction } = await vite.ssrLoadModule("/src/lib/game/bot-moments.ts");

  globalThis.setTimeout = (fn) => {
    const id = nextTimer++;
    timers.set(id, fn);
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);

  const apply = (state, actor, action) => {
    const res = applyAction(state, actor, action);
    assert.ifError(res.error);
    return res.state;
  };
  // A legal classic game past setup, with p0 a person and p1..p3 bots, at p1's main phase.
  function midGame(seed = 720) {
    let g = createGame({ humans: [{ name: "Ember" }], bots: 3, seed });
    g.phase = "setupSettle";
    g.rollOff = null;
    g.current = g.players[0].id;
    while (g.phase === "setupSettle" || g.phase === "setupRoad") {
      const a = g.current;
      g = apply(g, a, g.phase === "setupSettle" ? { type: "setupSettle", vertexId: legalSettle(g, a, true)[0] } : { type: "setupRoad", edgeId: legalRoads(g, a, true)[0] });
    }
    g = structuredClone(g);
    g.phase = "main";
    g.current = "p1";
    g.dice = [3, 4];
    return g;
  }
  const PRIVATE_FORTUNES = /knight|plenty|monopoly|\bvp\b|road|Victory/i;
  const resourceWords = new RegExp(RESOURCES.flatMap((r) => [r, RESOURCE_LABEL[r]]).join("|"), "i");

  // Start practice with the tap listening, then load a chosen state.
  const moments = [];
  const notes = [];
  commitTap.on = undefined;
  const { feed, stop } = listenBotMoments((m) => moments.push(m), commitTap, () => 1000 + moments.length);
  const spyOn = commitTap.on;
  commitTap.on = (n) => {
    notes.push(n);
    spyOn(n);
  };
  const store = () => useGame.getState();
  function practice(state) {
    store().startAi();
    timers.clear();
    useGame.setState({ state, mode: "ai", localId: "p0", offer: null, declined: [] });
    moments.length = 0;
    notes.length = 0;
  }

  // 1. Exact practice actions, the person's actions and refusals.
  {
    const g = midGame();
    g.players[1].resources = { timber: 3, clay: 3, wool: 2, grain: 8, ore: 4 };
    practice(g);
    const edge = legalRoads(g, "p1", false)[0];
    ok(store().dispatch({ type: "buildPath", edgeId: edge }, "p1", true).ok, "control: the bot's path commits");
    eq(moments.length, 1, "a bot's path makes one moment");
    const m = moments[0];
    eq([m.kind, m.text, m.targets, m.source, m.actor, m.ordered], ["path", "Tide lays a path", [edge], "practice-action", "p1", true], "the path moment is exact");
    eq(Object.keys(m).sort(), ["actor", "at", "epoch", "id", "kind", "ordered", "source", "targets", "text"], "a moment carries only public fields");
    ok(!("action" in m) && !("state" in m) && !("before" in m), "no raw action or state is kept");

    const n0 = notes.length;
    ok(!store().dispatch({ type: "buildPath", edgeId: edge }, "p1", true).ok, "control: the same edge is refused");
    eq(notes.length, n0, "a rejected action sends no note");
    eq(moments.length, 1, "a rejected action makes no moment");
    eq(projectAction(g, g, { type: "buildPath", edgeId: edge }, "p1"), null, "a no-op commit makes no moment");

    const v = store().state.vertices.find((x) => x.building?.playerId === "p1");
    ok(store().dispatch({ type: "buildStronghold", vertexId: v.id }, "p1", true).ok, "control: the bot's stronghold commits");
    eq([moments[1].kind, moments[1].text, moments[1].targets], ["stronghold", "Tide raises a stronghold", [v.id]], "the stronghold moment is exact");
    ok(store().dispatch({ type: "bankTrade", give: "grain", want: "clay" }, "p1", true).ok, "control: the bot's bank trade commits");
    ok(/^Tide trades [234] Wheat for 1 Brick (with the bank|at a dock)$/.test(moments[2].text), `the bank trade line is public: ${moments[2].text}`);
    eq(moments[2].targets, [], "a bank trade has no target");

    // The same action as a person's: no bot line (the person keeps its own sounds).
    useGame.setState({ state: { ...store().state, current: "p0" } });
    store().state.players[0].resources = { timber: 2, clay: 2, wool: 0, grain: 0, ore: 0 };
    const mine = legalRoads(store().state, "p0", false)[0];
    const before = moments.length;
    ok(store().dispatch({ type: "buildPath", edgeId: mine }).ok, "control: the person's path commits");
    eq(moments.length, before, "a person's commit makes no moment");
    const last = notes.at(-1);
    eq([last.actor, last.automated], ["p0", false], "the note says the person acted, not automation");
    // A bot seat's action sent without the automated flag is not a bot moment either.
    eq(projectAction(g, g, { type: "endTurn" }, "p1"), null, "control");
    useGame.setState({ state: { ...store().state, current: "p1" } });
    const p1edge = legalRoads(store().state, "p1", false)[0];
    store().state.players[1].resources.timber = 1;
    store().state.players[1].resources.clay = 1;
    ok(store().dispatch({ type: "buildPath", edgeId: p1edge }, "p1", false).ok, "control: a bot seat's unflagged commit");
    eq(moments.length, before, "a bot-kind seat alone does not make a bot moment");

    // A roll and an end of turn keep their own moments.
    eq(projectAction(g, apply(g, "p1", { type: "endTurn" }), { type: "endTurn" }, "p1"), null, "an end of turn has no bot line");
    const r = structuredClone(g);
    r.phase = "roll";
    eq(projectAction(r, apply(r, "p1", { type: "roll" }), { type: "roll" }, "p1"), null, "a roll has no bot line");
    // Setup pieces are moments too.
    let s = createGame({ humans: [{ name: "Ember" }], bots: 1, seed: 9 });
    s.phase = "setupSettle";
    s.rollOff = null;
    s.current = "p1";
    const sv = legalSettle(s, "p1", true)[0];
    const s2 = apply(s, "p1", { type: "setupSettle", vertexId: sv });
    eq(projectAction(s, s2, { type: "setupSettle", vertexId: sv }, "p1")?.text, "Tide builds an outpost", "a setup outpost is a moment");
  }

  // 2. Path fortunes: what committed, one moment, every edge.
  for (const want of [1, 2]) {
    const g = midGame(721);
    g.players[1].hidden.road = 1;
    practice(g);
    const edges = [];
    let t = structuredClone(g);
    for (let i = 0; i < want; i++) {
      const e = legalRoads(t, "p1", false)[0];
      edges.push(e);
      t.edges.find((x) => x.id === e).path = "p1";
    }
    ok(store().dispatch({ type: "playRoad", edgeIds: edges }, "p1", true).ok, `control: a ${want}-path fortune commits`);
    eq(moments.length, 1, `a ${want}-path fortune is one moment`);
    eq([moments[0].kind, moments[0].count, [...moments[0].targets].sort()], ["pathFortune", want, [...edges].sort()], `it names the ${want} committed edges`);
    eq(moments[0].text, want === 1 ? "Tide places 1 path" : "Tide places 2 paths", "the path fortune line");
  }
  // With one path left, a two-path request commits one: the moment follows the commit.
  {
    const g = midGame(722);
    g.players[1].hidden.road = 1;
    g.players[1].pathsLeft = 1;
    const a = legalRoads(g, "p1", false)[0];
    const t = structuredClone(g);
    t.edges.find((x) => x.id === a).path = "p1";
    const b = legalRoads(t, "p1", false)[0];
    const after = apply(g, "p1", { type: "playRoad", edgeIds: [a, b] });
    const m = projectAction(g, after, { type: "playRoad", edgeIds: [a, b] }, "p1");
    eq([m.count, m.targets], [1, [a]], "a two-path request that placed one names one edge");
  }

  // 3. Private data stays out.
  {
    const g = midGame(723);
    g.players[1].resources = { timber: 0, clay: 0, wool: 3, grain: 3, ore: 3 };
    for (const kind of ["knight", "road", "plenty", "monopoly", "vp"]) {
      const t = structuredClone(g);
      t.deck = [kind, ...t.deck.filter((k) => k !== kind)];
      const after = apply(t, "p1", { type: "buyCard" });
      const m = projectAction(t, after, { type: "buyCard" }, "p1");
      eq([m.kind, m.text, m.targets], ["fortune", "Tide buys a fortune", []], `buying a ${kind} reads the same`);
      ok(!PRIVATE_FORTUNES.test(JSON.stringify(m)), `the bought ${kind} is not in the moment`);
    }
    const d = structuredClone(g);
    d.phase = "discard";
    d.players[1].resources = { timber: 4, clay: 0, wool: 2, grain: 2, ore: 0 };
    d.discardNeeded = { p1: 4 };
    const da = { type: "discard", resources: { timber: 2, wool: 1, grain: 1 } };
    const dm = projectAction(d, apply(d, "p1", da), da, "p1");
    eq([dm.text, dm.count], ["Tide discards 4 goods", 4], "a discard says how many");
    ok(!resourceWords.test(JSON.stringify(dm)), "a discard never says which goods");

    // The wayfarer: the actual victim (here from a null request with one target), never the good.
    const w = structuredClone(g);
    w.phase = "robber";
    const victim = w.players[2];
    const spot = w.vertices.find((v) => v.building?.playerId === victim.id);
    const hex = spot.hexes.find((h) => h !== w.robberHex);
    ok(hex, "control: a hex the victim touches");
    // Only the victim holds goods, so a null request still takes from them (rules.ts applyRobber, one target).
    for (const p of w.players) p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
    victim.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 1 };
    const wa = { type: "moveRobber", hexId: hex, stealFrom: null };
    const wAfter = apply(w, "p1", wa);
    const wm = projectAction(w, wAfter, wa, "p1");
    const pip = w.hexes.find((h) => h.id === hex).pip;
    eq(wm.text, `Tide moves the wayfarer to ${pip ? `the ${pip}` : "the wastes"} and takes from ${victim.name.replace(/ \(bot\)$/, "")}`, "the victim is the actual one");
    eq(wm.targets, [hex], "the wayfarer moment points at the hex");
    ok(!resourceWords.test(JSON.stringify(wm)), "the stolen good is not in the moment");
    const k = structuredClone(g);
    k.players[1].hidden.knight = 1;
    for (const p of k.players) p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
    const ka = { type: "playKnight", hexId: hex, stealFrom: null };
    const km = projectAction(k, apply(k, "p1", ka), ka, "p1");
    eq([km.kind, km.text, km.targets], ["wayfarerFortune", `Tide plays Wayfarer, moves it to ${pip ? `the ${pip}` : "the wastes"}`, [hex]], "a played wayfarer that takes nothing names no victim");

    const off = structuredClone(g);
    off.wayfarerMode = "off";
    off.players[1].hidden.knight = 1;
    const oa = { type: "playKnight", hexId: "", stealFrom: null };
    eq(projectAction(off, apply(off, "p1", oa), oa, "p1"), { actor: "p1", source: "practice-action", kind: "wayfarerFortune", text: "Tide plays Wayfarer and musters", targets: [], ordered: true }, "wayfarer off: a muster, no target");
    const pl = structuredClone(g);
    pl.players[1].hidden.plenty = 1;
    const pa = { type: "playPlenty", resources: ["ore", "ore"] };
    eq(projectAction(pl, apply(pl, "p1", pa), pa, "p1").text, "Tide plays Plenty and takes 2 Stone", "plenty names its public goods");
    const mo = structuredClone(g);
    mo.players[1].hidden.monopoly = 1;
    for (const p of mo.players) p.resources.grain = 0;
    mo.players[0].resources.grain = 2;
    mo.players[3].resources.grain = 1;
    const ma = { type: "playMonopoly", resource: "grain" };
    eq(projectAction(mo, apply(mo, "p1", ma), ma, "p1").text, "Tide plays Monopoly and takes 3 Wheat", "monopoly names its public total");
  }

  // 4. Table asks.
  {
    const g = midGame(724);
    // One wheat short of a stronghold, with sheep to spare: chooseTradeAsk asks.
    g.players[1].resources = { timber: 0, clay: 0, wool: 2, grain: 2, ore: 2 };
    g.players[0].resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 2 };
    practice(g);
    // A bot's ask, through runBots and openOffer.
    useGame.setState({ state: { ...store().state, turn: 99 } });
    store().runBots();
    const offer = store().offer;
    ok(offer?.from === "p1", "control: the bot asked the table");
    eq(moments.filter((m) => m.kind === "ask").length, 1, "a bot's ask is one moment");
    const am = moments.find((m) => m.kind === "ask");
    eq([am.tradeId, am.actor, am.source, am.targets], [offer.tradeId, "p1", "practice-action", []], "the ask carries its real trade id");
    ok(/^Tide offers 1 \w+ for 1 \w+$/.test(am.text), `the ask line: ${am.text}`);
    timers.clear();
    useGame.setState({ offer: null, state: { ...store().state, current: "p0" } });
    moments.length = 0;
    store().askTable({ ore: 1 }, { wool: 1 });
    ok(store().offer?.from === "p0", "control: the person's ask is open");
    eq(moments.length, 0, "a person's ask makes no moment");
    timers.clear();
    useGame.setState({ offer: null });
  }

  // 5. Online observation, through the store's own state and tradeOffer handlers.
  {
    feed.reset();
    moments.length = 0;
    const g = midGame(725);
    for (const p of g.players) {
      p.fortunes = 0;
    }
    // The note shape store.ts sends; 5b below sends the same through the store's real handlers.
    let deal = 9000;
    const push = (before, after, first = false) => commitTap.on({ deal, before, after, first });
    push(null, g, true);
    eq(moments.length, 0, "the first push is a silent baseline");
    const e1 = legalRoads(g, "p1", false)[0];
    const g1 = structuredClone(g);
    g1.seq += 1;
    g1.edges.find((e) => e.id === e1).path = "p1";
    g1.log = [...g.log, "Tide builds a path."];
    push(g, g1);
    eq(moments.map((m) => [m.kind, m.text, m.targets, m.source, m.ordered]), [["path", "Tide lays a path", [e1], "online-observation", true]], "one clear change is one moment");
    push(g, g1);
    push(g1, g1);
    eq(moments.length, 1, "a duplicate push does not re-announce");
    const g1log = structuredClone(g1);
    g1log.log = [...g1.log, "Tide builds a path.", "Tide builds a path."];
    push(g1, g1log);
    const g1cut = structuredClone(g1);
    g1cut.log = g1.log.slice(-1);
    push(g1, g1cut);
    eq(moments.length, 1, "repeated or truncated logs with the same seq announce nothing");
    const older = structuredClone(g);
    push(g1, older);
    eq(moments.length, 1, "an older game is a new baseline, not a change");
    const epochAfterOlder = feed.epoch;
    push(older, g1);
    eq(moments.length, 2, "control: after a baseline, a newer push is seen again");
    eq(feed.epoch, epochAfterOlder, "control: the epoch holds");

    // Several changes by one bot: one unordered summary with no first target.
    const g2 = structuredClone(g1);
    g2.seq += 3;
    const e2 = legalRoads(g1, "p1", false).filter((e) => e !== e1)[0];
    g2.edges.find((e) => e.id === e2).path = "p1";
    const free = legalSettle(g1, "p1", true)[0];
    g2.vertices.find((v) => v.id === free).building = { playerId: "p1", kind: "outpost" };
    g2.players[1].fortunes = 1;
    moments.length = 0;
    push(g1, g2);
    eq(moments.map((m) => [m.kind, m.count, m.targets, m.ordered, m.text]), [["changes", 3, [], false, "Tide makes 3 changes"]], "a batch is one unordered summary");

    // Two bots in one push: each judged alone, both unordered relative to each other only by seat.
    const g3 = structuredClone(g2);
    g3.seq += 2;
    const e3 = legalRoads(g2, "p2", false)[0];
    g3.edges.find((e) => e.id === e3).path = "p2";
    g3.players[3].fortunes = 1;
    moments.length = 0;
    push(g2, g3);
    eq(moments.map((m) => [m.actor, m.kind]), [["p2", "path"], ["p3", "fortune"]], "each bot's own change is told");

    // A person's seat (even one the host plays for) is never a bot moment, and the wayfarer needs one clear mover.
    const g4 = structuredClone(g3);
    g4.seq += 1;
    const e4 = legalRoads(g3, "p0", false)[0];
    g4.edges.find((e) => e.id === e4).path = "p0";
    g4.robberHex = g4.hexes.find((h) => h.id !== g3.robberHex).id;
    g4.current = "p2";
    moments.length = 0;
    push(g3, g4);
    eq(moments, [], "a person's path and a wayfarer whose mover changed seats make no claim");
    const g5 = structuredClone(g4);
    g5.seq += 1;
    g5.robberHex = g5.hexes.find((h) => h.id !== g4.robberHex).id;
    push(g4, g5);
    eq(moments.map((m) => [m.actor, m.kind, m.targets]), [["p2", "wayfarer", [g5.robberHex]]], "a wayfarer moved within one bot's hold is told");
    eq(observeSnapshot(g5, g5), [], "no change, no claim");

    // A fortune played (the count falls) is not taken for a buy.
    const g6 = structuredClone(g5);
    g6.seq += 1;
    g6.players[3].fortunes = 0;
    moments.length = 0;
    push(g5, g6);
    eq(moments, [], "a fall in the fortune count is no claim");

    // Online asks: a bot seat's, once per trade id; a person's never.
    moments.length = 0;
    commitTap.on({ deal, offer: { tradeId: "t9-1", from: "p3", fromName: "Pine (bot)", give: { wool: 2 }, want: { ore: 1 } }, automated: null });
    commitTap.on({ deal, offer: { tradeId: "t9-1", from: "p3", fromName: "Pine (bot)", give: { wool: 2 }, want: { ore: 1 } }, automated: null });
    commitTap.on({ deal, offer: { tradeId: "t9-2", from: "p0", fromName: "Ember", give: { wool: 1 }, want: { ore: 1 } }, automated: null });
    eq(moments.map((m) => [m.text, m.tradeId, m.source]), [["Pine offers 2 Sheep for 1 Stone", "t9-1", "online-observation"]], "a bot's online ask, once");

    // A reconnect (a welcome's first push) and a new table: new epochs, silent baselines, no replay.
    const before = feed.epoch;
    moments.length = 0;
    push(g5, g6, true);
    ok(feed.epoch > before, "a reconnect starts a new epoch");
    eq(moments, [], "a reconnect replays nothing");
    commitTap.on({ deal, offer: { tradeId: "t9-1", from: "p3", fromName: "Pine (bot)", give: { wool: 2 }, want: { ore: 1 } }, automated: null });
    eq(moments.length, 1, "seen keys reset with the epoch: a live re-sent offer after reconnect is shown once");
    moments.length = 0;
    deal++;
    push(g5, g6);
    eq(moments, [], "a new table's first push is a baseline");
    ok(moments.every((m) => m.epoch === feed.epoch), "control");

    // A rematch: the old game ends, a new one begins, and nothing from either is announced.
    const over = structuredClone(g6);
    over.seq += 1;
    over.phase = "over";
    push(g6, over);
    const epochOver = feed.epoch;
    moments.length = 0;
    const next = midGame(726);
    next.edges.find((e) => !e.path).path = "p1";
    push(over, next);
    eq(moments, [], "a rematch's first state is a baseline");
    ok(feed.epoch > epochOver, "a rematch starts a new epoch");

    // Through the store's real handlers.
    moments.length = 0;
    const ids = moments.map((m) => m.id);
    eq(new Set(ids).size, ids.length, "ids are unique");
  }

  // 5b. The real store handlers send the notes: connect a table and push states through its `state` event.
  {
    feed.reset();
    moments.length = 0;
    notes.length = 0;
    commitTap.on = (n) => {
      notes.push(n);
      spyOn(n);
    };
    store().joinTable("ABCD");
    for (let i = 0; i < 20 && !tableEvents; i++) await new Promise((r) => realSetTimeout(r, 0));
    if (tableEvents?.state && tableEvents?.welcome) {
      tableEvents.welcome({ proto: (await vite.ssrLoadModule("/src/lib/net/proto.ts")).PROTO, code: "ABCD", you: "s0", host: false, chat: [], secret: "x", victoryTarget: 10 });
      const g = midGame(727);
      for (const p of g.players) p.fortunes = 0;
      const msg = (game) => ({ you: "p0", game, legal: null, turnDeadline: null, turnPlayer: null, serverNow: Date.now(), result: null });
      tableEvents.state(msg(g));
      eq(moments.length, 0, "store: the first push after a welcome is silent");
      const g1 = structuredClone(g);
      g1.seq += 1;
      g1.vertices.find((v) => v.id === legalSettle(g, "p2", true)[0]).building = { playerId: "p2", kind: "outpost" };
      tableEvents.state(msg(g1));
      tableEvents.state(msg(g1));
      eq(moments.map((m) => [m.actor, m.kind, m.source]), [["p2", "outpost", "online-observation"]], "store: a live push is observed once");
      ok(notes.filter((n) => "first" in n).length === 3, "store: every push sends a state note");
      tableEvents.tradeOffer({ tradeId: "t1-1", from: "p3", give: { grain: 1 }, want: { clay: 1 }, seconds: 20 });
      tableEvents.tradeOffer({ tradeId: "t1-1", from: "p3", give: { grain: 1 }, want: { clay: 1 }, seconds: 20 });
      eq(moments.filter((m) => m.kind === "ask").map((m) => m.text), ["Pine offers 1 Wheat for 1 Brick"], "store: a duplicate tradeOffer is one ask");
      timers.clear();
    } else {
      throw new Error("the table stub did not connect; check how store.ts joins a table");
    }
  }

  // 6. The tap never steers play.
  {
    stop();
    const t = {};
    const a = listenBotMoments(() => {}, t);
    const b = listenBotMoments(() => {}, t);
    a.stop();
    ok(t.on === b.feed.note, "stop() leaves a newer listener in place");
    b.stop();
    eq(t.on, undefined, "stop() removes its own listener");
    // A throwing listener: dispatch still commits and returns ok.
    const g = midGame(728);
    g.players[1].resources = { timber: 1, clay: 1, wool: 0, grain: 0, ore: 0 };
    practice(g);
    let seenInStore = false;
    commitTap.on = (n) => {
      if ("action" in n) seenInStore = useGame.getState().state === n.after;
      throw new Error("broken listener");
    };
    const edge = legalRoads(g, "p1", false)[0];
    const res = store().dispatch({ type: "buildPath", edgeId: edge }, "p1", true);
    ok(res.ok && store().state.edges.find((e) => e.id === edge).path === "p1", "a throwing listener cannot stop a commit");
    ok(seenInStore, "the note comes after the store holds the committed state");

    // A whole bot game: the same seed plays to the same state with and without a listener.
    const play = (listen, seed = 7200) => {
      commitTap.on = listen;
      // Seed both random sources: bot answer delays use Math.random, the dice use crypto (rules.ts rollDie).
      const realRandom = Math.random;
      const realFill = crypto.getRandomValues;
      let r = 1;
      const next = () => (r = (r * 16807) % 2147483647);
      Math.random = () => next() / 2147483647;
      crypto.getRandomValues = (buf) => {
        for (let i = 0; i < buf.length; i++) buf[i] = next();
        return buf;
      };
      try {
        const start = createGame({ humans: [], bots: 4, seed });
        store().startAi();
        timers.clear();
        useGame.setState({ state: start, mode: "ai", localId: "none", offer: null, declined: [] });
        for (let i = 0; i < 600 && store().state.phase !== "over"; i++) {
          store().runBots();
          flushTimers();
        }
      } finally {
        Math.random = realRandom;
        crypto.getRandomValues = realFill;
      }
      return store().state;
    };
    const quiet = play(undefined);
    const quiet2 = play(undefined);
    eq(quiet2, quiet, "control: the seeded bot game is repeatable");
    const heard = play((n) => void n);
    ok(quiet.seq > 50, `control: the bots played (${quiet.seq} commits)`);
    eq(heard, quiet, "a listener changes nothing in a whole bot game");

    // And a full listened game yields public, well-formed moments only.
    const all = [];
    const feed2 = createBotMomentFeed((m) => all.push(m));
    const listened = play(feed2.note);
    eq(listened, quiet, "the real bot-moments listener changes nothing in a whole bot game");
    ok(all.length > 20, `control: a bot game made moments (${all.length})`);
    ok(all.every((m) => m.source === "practice-action" && typeof m.text === "string" && m.text.length > 0), "every moment has a public line");
    ok(all.filter((m) => m.kind === "fortune").every((m) => !PRIVATE_FORTUNES.test(JSON.stringify(m))), "no bought fortune leaks in a whole game");
    ok(all.filter((m) => m.kind === "discard").every((m) => !resourceWords.test(JSON.stringify(m))), "no discard leaks in a whole game");
    eq(new Set(all.map((m) => m.id)).size, all.length, "ids are unique in a whole game");
    const kinds = [...new Set(all.map((m) => m.kind))].sort();
    console.log(`bot-moments-event-prove: whole game, ${all.length} moments, kinds ${kinds.join(", ")}`);
    commitTap.on = undefined;
  }

  console.log(`bot-moments-event-prove: ${checks} checks pass`);
} finally {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
  await vite.close();
}
