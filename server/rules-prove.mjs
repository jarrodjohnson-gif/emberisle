// Rules-audit fixes (docs/design/rules-fixes.md): longest path as a real trail, ties, cuts, fortune timing, and paths past an outpost.
// Then one check per README "Rule set" line (#83).
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, harborRate, legalRoads, legalSettle, publicVP, roadLength, stealTargets } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";
import { AXIAL_DIRS } from "../src/lib/game/hex.ts";

function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  process.exit(1);
}

const fresh = () => {
  const g = createGame({ humans: [{ name: "A" }, { name: "B" }, { name: "C" }], bots: 0, seed: 9 });
  g.phase = "main";
  g.current = "p0";
  return g;
};
const edgesAt = (g, v) => g.edges.filter((e) => e.va === v || e.vb === v);
const far = (e, v) => (e.va === v ? e.vb : e.va);

// A simple line of k segments (no corner visited twice), optionally avoiding corners, with a middle corner of degree 3.
function line(g, k, avoid = new Set()) {
  for (const start of g.vertices) {
    const path = [];
    const seen = new Set([start.id]);
    const go = (v) => {
      if (path.length === k) return true;
      for (const e of edgesAt(g, v)) {
        const n = far(e, v);
        if (seen.has(n) || avoid.has(n)) continue;
        seen.add(n);
        path.push(e);
        if (go(n)) return true;
        path.pop();
        seen.delete(n);
      }
      return false;
    };
    if (avoid.has(start.id) || !go(start.id)) continue;
    const corners = [start.id];
    for (const e of path) corners.push(far(e, corners[corners.length - 1]));
    if (edgesAt(g, corners[Math.floor(k / 2)]).length === 3) return { edges: path, corners };
  }
  fail(`no line of ${k}`);
}
const own = (g, edges, pid) => edges.forEach((e) => (g.edges.find((x) => x.id === e.id).path = pid));
const giveCards = (p, bag) => Object.assign(p.resources, { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 }, bag);
function build(g, pid, edgeId) {
  g.current = pid;
  giveCards(g.players.find((p) => p.id === pid), { timber: 1, clay: 1 });
  const r = applyAction(g, pid, { type: "buildPath", edgeId });
  if (r.error) fail(`build ${pid}`, r.error);
  return r.state;
}

// 1. A star of 6 (3 spokes plus an end on each) is a trail of 4, and earns nothing.
{
  let g = fresh();
  const v = g.vertices.find((x) => edgesAt(g, x.id).length === 3 && edgesAt(g, x.id).every((e) => edgesAt(g, far(e, x.id)).length >= 2)).id;
  const spokes = edgesAt(g, v);
  const ends = spokes.map((s) => edgesAt(g, far(s, v)).find((e) => e.id !== s.id));
  own(g, [...spokes, ends[0], ends[1]], "p0");
  g = build(g, "p0", ends[2].id);
  if (roadLength(g, "p0") !== 4 || g.longestRoad !== null) fail("star", { len: roadLength(g, "p0"), award: g.longestRoad });
  console.log("star of 6 segments: trail 4, no award");
}

// 2. A straight line of 5 earns it.
let lineA;
{
  let g = fresh();
  lineA = line(g, 5);
  own(g, lineA.edges.slice(0, 4), "p0");
  g = build(g, "p0", lineA.edges[4].id);
  if (roadLength(g, "p0") !== 5 || g.longestRoad !== "p0") fail("line of 5", { len: roadLength(g, "p0"), award: g.longestRoad });
  console.log("line of 5: award to p0");
}

// 3. Two players tie at 5 with no holder: nobody gets it (#97). 4. A holder keeps it on a tie.
{
  let g = fresh();
  const a = line(g, 5);
  const near = new Set(a.corners.flatMap((c) => [c, ...edgesAt(g, c).map((e) => far(e, c))]));
  const b = line(g, 5, near);
  own(g, a.edges, "p0");
  own(g, b.edges.slice(0, 4), "p1");
  g.longestRoad = null;
  // p0 already has 5 but nothing recomputed yet; p1 completes 5 → both at 5, no holder
  g = build(g, "p1", b.edges[4].id);
  if (g.longestRoad !== null) fail("tie with no holder", g.longestRoad);
  console.log("tie at 5 with no holder: nobody");

  let h = fresh();
  own(h, a.edges, "p0");
  own(h, b.edges.slice(0, 4), "p1");
  h.longestRoad = "p0";
  h = build(h, "p1", b.edges[4].id);
  if (h.longestRoad !== "p0") fail("holder on a tie", h.longestRoad);
  console.log("holder p0 tied at 5: keeps it");
}

// 5. An outpost in the middle of the holder's line cuts it (#95).
{
  let g = fresh();
  const a = line(g, 5);
  own(g, a.edges, "p0");
  g.longestRoad = "p0";
  const mid = a.corners[2];
  const side = edgesAt(g, mid).find((e) => !a.edges.some((x) => x.id === e.id));
  own(g, [side], "p1");
  g.current = "p1";
  giveCards(g.players[1], { timber: 1, clay: 1, wool: 1, grain: 1 });
  const r = applyAction(g, "p1", { type: "buildOutpost", vertexId: mid });
  if (r.error) fail("cut outpost", r.error);
  if (roadLength(r.state, "p0") >= 5 || r.state.longestRoad !== null) {
    fail("cut", { len: roadLength(r.state, "p0"), award: r.state.longestRoad });
  }
  console.log(`outpost at the middle of p0's line: p0 trail ${roadLength(r.state, "p0")}, award removed`);
}

// 6. A fortune bought this turn cannot be played this turn (#96). 7. It can be on the next turn, even before the roll.
{
  let g = fresh();
  g.deck = ["knight", ...g.deck];
  giveCards(g.players[0], { wool: 1, grain: 1, ore: 1 });
  let r = applyAction(g, "p0", { type: "buyCard" });
  if (r.error) fail("buy knight", r.error);
  g = r.state;
  const hexId = g.hexes.find((h) => h.id !== g.robberHex).id;
  r = applyAction(g, "p0", { type: "playKnight", hexId, stealFrom: null });
  if (!r.error) fail("knight played the turn it was bought");
  console.log(`buy a knight, play it the same turn: rejected ("${r.error}")`);

  while (g.current !== "p0" || g.phase !== "roll") {
    g.phase = "main";
    r = applyAction(g, g.current, { type: "endTurn" });
    if (r.error) fail("end turn", r.error);
    g = r.state;
  }
  if (g.players[0].hidden.knight !== 1) fail("knight kept across turns", g.players[0].hidden);
  r = applyAction(g, "p0", { type: "playKnight", hexId, stealFrom: null });
  if (r.error) fail("knight on the next turn", r.error);
  if (r.state.players[0].knightsPlayed !== 1) fail("knight counted", r.state.players[0].knightsPlayed);
  console.log("pass, then play it next turn before the roll: works");
}

// 8. A path cannot go on past an opponent's outpost (#100). 9. From your own building it still can.
{
  const g = fresh();
  const v = g.vertices.find((x) => edgesAt(g, x.id).length === 3).id;
  const [mine, beyond, other] = edgesAt(g, v);
  own(g, [mine], "p0");
  g.vertices.find((x) => x.id === v).building = { playerId: "p1", kind: "outpost" };
  giveCards(g.players[0], { timber: 1, clay: 1 });
  let r = applyAction(g, "p0", { type: "buildPath", edgeId: beyond.id });
  if (r.error !== "Path must connect to you.") fail("path past p1's outpost", r.error ?? "allowed");
  console.log(`path past an opponent's outpost: rejected ("${r.error}")`);

  g.vertices.find((x) => x.id === v).building = { playerId: "p0", kind: "outpost" };
  r = applyAction(g, "p0", { type: "buildPath", edgeId: other.id });
  if (r.error) fail("path from own outpost", r.error);
  console.log("path from your own outpost: works");
}

// README "Rule set", one check per line (#83). Lines already proved above, or elsewhere, say where.
const ok = (line, cond, extra) => (cond ? console.log(`README ${line}: ok`) : fail(`README ${line}`, extra));
const hand = (p) => RESOURCES.reduce((n, r) => n + p.resources[r], 0);
const other = (g, v, h) => g.vertices.find((x) => x.id === v).hexes.filter((id) => id !== h).map((id) => g.hexes.find((x) => x.id === id));
// Roll from `g` (phase roll) until the dice sum to `total`; the server's dice cannot be chosen, only waited for.
function rollTo(g, total) {
  for (let i = 0; i < 5000; i++) {
    const r = applyAction(g, g.current, { type: "roll" });
    if (r.error) fail("roll", r.error);
    if (r.state.dice[0] + r.state.dice[1] === total) return r.state;
  }
  fail(`no ${total} in 5000 rolls`);
}
// A land hex with a token, and a corner of it whose other hexes carry a different token.
function payingCorner(g) {
  for (const h of g.hexes) {
    if (h.terrain === "waste" || h.id === g.robberHex) continue;
    const v = g.vertices.find((x) => x.hexes.includes(h.id) && other(g, x.id, h.id).every((o) => o.pip !== h.pip));
    if (v) return { h, v: v.id };
  }
  fail("no paying corner");
}
const rollPhase = (g) => Object.assign(g, { phase: "roll", dice: null });

// Intro
{
  ok("three or four players", [createGame({ humans: [{ name: "A" }], bots: 0 }), createGame({ humans: [], bots: 9 })].map((g) => g.players.length).join() === "3,4");
  const g = fresh();
  const v = g.vertices.find((x) => x.id).id;
  g.vertices.find((x) => x.id === v).building = { playerId: "p0", kind: "outpost" };
  g.players[0].hidden.vp = 8;
  giveCards(g.players[0], { ore: 2, grain: 3 });
  const r = applyAction(g, "p0", { type: "buildStronghold", vertexId: v });
  ok("first to 10 points wins", !r.error && r.state.phase === "over" && r.state.winner === "p0", r.error ?? r.state.phase);

  // Points that arrive on someone else's turn (an award handed over by a cut) win as your own turn starts.
  const h = fresh();
  h.vertices.find((x) => x.id === v).building = { playerId: "p1", kind: "stronghold" };
  h.players[1].hidden.vp = 6;
  h.largestArmy = "p1";
  const w = applyAction(h, "p0", { type: "endTurn" });
  ok("10 points reached on another's turn win as your turn starts", !w.error && w.state.winner === "p1" && w.state.phase === "over", w.error ?? w.state.phase);
  ok("one island of 19 hexes", g.hexes.length === 19);
}

// Land (several seeds, since the island is shuffled)
for (const seed of [1, 2, 3, 4, 5]) {
  const g = createGame({ humans: [{ name: "A" }], bots: 2, seed });
  const count = (t) => g.hexes.filter((h) => h.terrain === t).length;
  const counts = ["timber", "clay", "wool", "grain", "ore", "waste"].map(count).join();
  if (counts !== "4,3,4,4,3,1") fail("terrain counts", counts);
  const land = g.hexes.filter((h) => h.terrain !== "waste");
  if (!land.every((h) => Number.isInteger(h.pip) && h.pip >= 2 && h.pip <= 12)) fail("token on every land hex", seed);
  if (g.hexes.find((h) => h.terrain === "waste").pip !== null) fail("waste has no token", seed);
  if (land.some((h) => h.pip === 7)) fail("no 7 token", seed);
}
// #182: the deal must never give up and leave a land hex without a token, and red tokens never touch.
{
  let empty = 0;
  let red = 0;
  for (let seed = 1; seed <= 20000; seed++) {
    const g = createGame({ humans: [{ name: "A" }], bots: 2, seed });
    if (g.hexes.some((h) => h.terrain !== "waste" && h.pip == null)) empty++;
    for (const h of g.hexes) {
      if (h.pip !== 6 && h.pip !== 8) continue;
      for (const [dq, dr] of AXIAL_DIRS) {
        const m = g.hexes.find((x) => x.q === h.q + dq && x.r === h.r + dr);
        if (m && (m.pip === 6 || m.pip === 8)) red++;
      }
    }
  }
  console.log(`20000 deals: ${empty} land hexes without a token, ${red} adjacent red tokens`);
  if (empty || red) fail("deal", { empty, red });
}
ok("forest, clay hills, pasture, fields, mountains, or the wastes", true);
ok("a token from 2 to 12 on every hex except the wastes", true);
ok("there is no 7 token", true);
{
  // Give the wastes a token and lift the wayfarer: it must still pay nothing.
  const g = fresh();
  const waste = g.hexes.find((h) => h.terrain === "waste");
  const v = g.vertices.find((x) => x.hexes.includes(waste.id) && other(g, x.id, waste.id).every((o) => o.pip !== 10)).id;
  waste.pip = 10;
  waste.blocked = false;
  g.robberHex = g.hexes.find((h) => h.terrain !== "waste").id;
  g.vertices.find((x) => x.id === v).building = { playerId: "p0", kind: "outpost" };
  const after = rollTo(rollPhase(g), 10);
  ok("the wastes produce nothing", hand(after.players[0]) === 0, after.players[0].resources);
}

// Pieces
{
  const g = fresh();
  const p = g.players[0];
  ok("stock: 15 paths, 5 outposts, 4 strongholds", p.pathsLeft === 15 && p.outpostsLeft === 5 && p.strongholdsLeft === 4);
  const [a, b] = line(g, 2).edges;
  own(g, [a], "p0");
  giveCards(p, { timber: 1 });
  const short = applyAction(g, "p0", { type: "buildPath", edgeId: b.id });
  giveCards(p, { timber: 1, clay: 1 });
  const r = applyAction(g, "p0", { type: "buildPath", edgeId: b.id });
  ok("path costs 1 timber, 1 clay", short.error && !r.error && hand(r.state.players[0]) === 0 && r.state.bank.timber === 20 && r.state.bank.clay === 20, short.error ?? r.error);
  p.pathsLeft = 0;
  ok("no path past the stock", applyAction(g, "p0", { type: "buildPath", edgeId: b.id }).error === "No paths left.");
}
{
  const g = fresh();
  const p = g.players[0];
  const { edges, corners } = line(g, 2);
  own(g, edges, "p0");
  const spot = corners[2];
  giveCards(p, { timber: 1, clay: 1, wool: 1 });
  const short = applyAction(g, "p0", { type: "buildOutpost", vertexId: spot });
  giveCards(p, { timber: 1, clay: 1, wool: 1, grain: 1 });
  const r = applyAction(g, "p0", { type: "buildOutpost", vertexId: spot });
  ok("outpost costs timber, clay, wool, grain", short.error && !r.error && hand(r.state.players[0]) === 0 && r.state.players[0].outpostsLeft === 4, short.error ?? r.error);
  p.outpostsLeft = 0;
  ok("no outpost past the stock", applyAction(g, "p0", { type: "buildOutpost", vertexId: spot }).error === "No outposts left.");
}
{
  const g = fresh();
  const [mine, theirs] = g.vertices;
  mine.building = { playerId: "p0", kind: "outpost" };
  theirs.building = { playerId: "p1", kind: "outpost" };
  giveCards(g.players[0], { ore: 2, grain: 2 });
  const short = applyAction(g, "p0", { type: "buildStronghold", vertexId: mine.id });
  giveCards(g.players[0], { ore: 2, grain: 3 });
  const onTheirs = applyAction(g, "p0", { type: "buildStronghold", vertexId: theirs.id });
  const r = applyAction(g, "p0", { type: "buildStronghold", vertexId: mine.id });
  const q = r.state?.players[0];
  ok(
    "stronghold costs 2 ore, 3 grain, on an outpost you own",
    short.error && onTheirs.error && !r.error && hand(q) === 0 && q.strongholdsLeft === 3 && q.outpostsLeft === 6,
    short.error ?? onTheirs.error ?? r.error,
  );
}
{
  const g = fresh();
  const count = (k) => g.deck.filter((c) => c === k).length;
  ok("a shared deck of 25", g.deck.length === 25);
  ok("14 knights, 2 path-building, 2 plenty, 2 monopoly, 5 hidden points", ["knight", "road", "plenty", "monopoly", "vp"].map(count).join() === "14,2,2,2,5");
  giveCards(g.players[0], { wool: 1, grain: 1 });
  const short = applyAction(g, "p0", { type: "buyCard" });
  giveCards(g.players[0], { wool: 1, grain: 1, ore: 1 });
  const r = applyAction(g, "p0", { type: "buyCard" });
  ok("fortune costs wool, grain, ore", short.error && !r.error && hand(r.state.players[0]) === 0 && r.state.deck.length === 24, short.error ?? r.error);
}
ok("a fortune bought this turn cannot be played this turn (check 6 above)", true);
ok("a knight may be played before the roll (check 7 above)", true);

// Points
{
  const g = fresh();
  const [a, b] = g.vertices;
  a.building = { playerId: "p0", kind: "outpost" };
  b.building = { playerId: "p0", kind: "stronghold" };
  ok("an outpost is 1, a stronghold is 2", publicVP(g, "p0") === 3);
}
ok("longest path is 2 and takes 5 segments in one unbroken line (checks 1, 2 above)", true);
ok("a tie with nobody holding the longest path gives it to nobody (check 3 above)", true);
{
  let g = fresh();
  g.players[0].hidden.knight = 4;
  g.players[1].hidden.knight = 4;
  const land = g.hexes.filter((h) => h.terrain !== "waste").map((h) => h.id);
  const knight = (pid, i) => {
    g.current = pid;
    g.phase = "main";
    g.playedCard = false;
    const r = applyAction(g, pid, { type: "playKnight", hexId: land[i % land.length], stealFrom: null });
    if (r.error) fail("knight", r.error);
    g = r.state;
  };
  knight("p0", 0);
  knight("p0", 1);
  const two = g.largestArmy;
  knight("p0", 2);
  ok("largest army is 2 and takes 3 knights", two === null && g.largestArmy === "p0" && publicVP(g, "p0") === 2, { two, now: g.largestArmy });
  [3, 4, 5].forEach((i) => knight("p1", i));
  const tied = g.largestArmy;
  knight("p1", 6);
  ok("a tie does not take the award away (army; path is check 4 above)", tied === "p0" && g.largestArmy === "p1", { tied, now: g.largestArmy });
}
ok("hidden points stay hidden until the end (server/table-prove.mjs, viewFor)", true);

// Setup
{
  let g = createGame({ humans: [{ name: "A" }, { name: "B" }, { name: "C" }], bots: 0, seed: 9 });
  const order = [];
  let firstRoundEmpty = true;
  let secondPaid = true;
  let pathFromIt = true;
  let spacing = true;
  while (g.phase === "setupSettle") {
    const pid = g.current;
    order.push(pid);
    const spots = legalSettle(g, pid, true);
    const mine = g.vertices.filter((v) => v.building?.playerId === pid).map((v) => v.id);
    if (spots.some((s) => mine.some((m) => edgesAt(g, m).some((e) => far(e, m) === s)))) spacing = false;
    const spot = spots[0];
    const before = hand(g.players.find((p) => p.id === pid));
    let r = applyAction(g, pid, { type: "setupSettle", vertexId: spot });
    if (r.error) fail("setup settle", r.error);
    g = r.state;
    const got = hand(g.players.find((p) => p.id === pid)) - before;
    const land = g.vertices.find((v) => v.id === spot).hexes.filter((id) => g.hexes.find((h) => h.id === id).terrain !== "waste").length;
    if (order.length <= 3 && got !== 0) firstRoundEmpty = false;
    if (order.length > 3 && got !== land) secondPaid = false;
    if (applyAction(g, pid, { type: "setupSettle", vertexId: legalSettle(g, pid, true)[0] }).error === undefined) pathFromIt = false;
    const roads = legalRoads(g, pid, true);
    if (!roads.length || roads.some((id) => { const e = g.edges.find((x) => x.id === id); return e.va !== spot && e.vb !== spot; })) pathFromIt = false;
    r = applyAction(g, pid, { type: "setupRoad", edgeId: roads[0] });
    if (r.error) fail("setup road", r.error);
    g = r.state;
  }
  ok("seat order, then the reverse", order.join() === "p0,p1,p2,p2,p1,p0" && g.phase === "roll" && g.current === "p0", order);
  ok("each setup turn is one outpost and one path from it", pathFromIt);
  ok("only the second outpost pays: one card per hex it touches", firstRoundEmpty && secondPaid);
  ok("an outpost must not touch another building, including your own", spacing);

  const lone = g.vertices.find((v) => !v.building && legalSettle(g, "p0", true).includes(v.id) && !legalSettle(g, "p0", false).includes(v.id));
  g.phase = "main";
  giveCards(g.players[0], { timber: 1, clay: 1, wool: 1, grain: 1 });
  const r = applyAction(g, "p0", { type: "buildOutpost", vertexId: lone.id });
  ok("after setup, a new outpost must touch one of your paths", r.error === "Illegal outpost.", r.error);
  const island = g.edges.find((e) => !e.path && !legalRoads(g, "p0", false).includes(e.id));
  const p = applyAction(g, "p0", { type: "buildPath", edgeId: island.id });
  ok("a path must touch your own path or building", p.error === "Path must connect to you.", p.error);
}
ok("a path cannot continue past an opponent's building (check 8 above)", true);

// A turn
{
  const g = rollPhase(fresh());
  const faces = new Set();
  for (let i = 0; i < 300; i++) {
    const r = applyAction(g, "p0", { type: "roll", dice: [6, 6] });
    faces.add(r.state.dice[0]).add(r.state.dice[1]);
  }
  ok("the server rolls (dice sent by a client are ignored)", [...faces].sort().join() === "1,2,3,4,5,6");
}
{
  const g = rollPhase(fresh());
  const { h, v } = payingCorner(g);
  g.vertices.find((x) => x.id === v).building = { playerId: "p0", kind: "outpost" };
  let s = rollTo(g, h.pip);
  ok("a matching token pays the building; an outpost takes 1", s.players[0].resources[h.terrain] === 1, s.players[0].resources);
  g.vertices.find((x) => x.id === v).building = { playerId: "p0", kind: "stronghold" };
  s = rollTo(g, h.pip);
  ok("a stronghold takes 2", s.players[0].resources[h.terrain] === 2, s.players[0].resources);
  g.hexes.forEach((x) => (x.blocked = x.id === h.id));
  g.robberHex = h.id;
  s = rollTo(g, h.pip);
  ok("unless the wayfarer is standing there", s.players[0].resources[h.terrain] === 0, s.players[0].resources);
}
{
  const g = rollPhase(fresh());
  const { h, v } = payingCorner(g);
  const w = g.vertices.find((x) => x.hexes.includes(h.id) && x.id !== v && other(g, x.id, h.id).every((o) => o.pip !== h.pip));
  g.vertices.find((x) => x.id === v).building = { playerId: "p0", kind: "outpost" };
  w.building = { playerId: "p1", kind: "outpost" };
  g.bank[h.terrain] = 1;
  const s = rollTo(g, h.pip);
  ok("if the bank cannot pay everyone for a resource, nobody gets it", s.players[0].resources[h.terrain] === 0 && s.players[1].resources[h.terrain] === 0 && s.bank[h.terrain] === 1);
}
{
  // #185: the one exception. A single player owed more than the bank has takes what is left.
  const g = rollPhase(fresh());
  const { h, v } = payingCorner(g);
  g.vertices.find((x) => x.id === v).building = { playerId: "p0", kind: "stronghold" };
  g.bank[h.terrain] = 1;
  const s = rollTo(g, h.pip);
  ok("unless only one player is owed it: then they take whatever is left", s.players[0].resources[h.terrain] === 1 && s.bank[h.terrain] === 0, { got: s.players[0].resources[h.terrain], bank: s.bank[h.terrain] });
}
{
  const g = rollPhase(fresh());
  const early = applyAction(g, "p0", { type: "buyCard" });
  g.phase = "main";
  const r = applyAction(g, "p0", { type: "endTurn" });
  ok("trade, build, and buy after the roll; pass ends the turn", early.error && !r.error && r.state.current === "p1" && r.state.phase === "roll", early.error ?? r.error);
}

// A seven
{
  const g = rollPhase(fresh());
  giveCards(g.players[0], { timber: 8 });
  giveCards(g.players[1], { clay: 7 });
  giveCards(g.players[2], { wool: 9 });
  const s = rollTo(g, 7);
  ok("more than 7 cards discards half, rounded down", s.phase === "discard" && JSON.stringify(s.discardNeeded) === JSON.stringify({ p0: 4, p2: 4 }), s.discardNeeded);
}
{
  const g = fresh();
  g.phase = "robber";
  const target = g.hexes.find((h) => h.terrain !== "waste");
  const a = g.vertices.find((v) => v.hexes.includes(target.id));
  const away = g.vertices.find((v) => !v.hexes.includes(target.id));
  a.building = { playerId: "p1", kind: "outpost" };
  away.building = { playerId: "p2", kind: "outpost" };
  giveCards(g.players[1], { ore: 3 });
  giveCards(g.players[2], { ore: 3 });
  const same = applyAction(g, "p0", { type: "moveRobber", hexId: g.robberHex, stealFrom: null });
  ok("the wayfarer moves onto a different hex", same.error === "The wayfarer must move.", same.error);
  const wrong = applyAction(g, "p0", { type: "moveRobber", hexId: target.id, stealFrom: "p2" });
  const r = applyAction(g, "p0", { type: "moveRobber", hexId: target.id, stealFrom: "p1" });
  ok(
    "steal one card from a player with a building there",
    wrong.error && !r.error && hand(r.state.players[0]) === 1 && hand(r.state.players[1]) === 2 && hand(r.state.players[2]) === 3 && stealTargets(g, target.id, "p0").join() === "p1",
    wrong.error ?? r.error,
  );
}

// Docks
{
  const docks = (g) => {
    const corners = g.vertices.filter((v) => v.harbor);
    const pairs = g.edges.filter((e) => {
      const [a, b] = [e.va, e.vb].map((id) => g.vertices.find((v) => v.id === id));
      const coast = g.hexes.filter((h) => a.hexes.includes(h.id) && b.hexes.includes(h.id)).length === 1;
      return coast && a.harbor && a.harbor === b.harbor;
    });
    return { corners, pairs };
  };
  const g = fresh();
  const { corners, pairs } = docks(g);
  ok("9 docks on the coast, each on two corners", corners.length === 18 && pairs.length === 9, { corners: corners.length, pairs: pairs.length });
  const kinds = pairs.map((e) => g.vertices.find((v) => v.id === e.va).harbor).sort().join();
  ok("5 are 2-for-1, one per resource; 4 are 3-for-1", kinds === "any,any,any,any,clay,grain,ore,timber,wool", kinds);
  ok("no dock for sitting down: the bank is 4 for 1", RESOURCES.every((r) => harborRate(g, "p0", r) === 4));
  const any = corners.find((v) => v.harbor === "any");
  const wool = corners.find((v) => v.harbor === "wool");
  any.building = { playerId: "p0", kind: "outpost" };
  ok("a 3-for-1 beats the bank", RESOURCES.every((r) => harborRate(g, "p0", r) === 3));
  wool.building = { playerId: "p0", kind: "outpost" };
  ok("a specific dock beats a 3-for-1, only for its resource", harborRate(g, "p0", "wool") === 2 && harborRate(g, "p0", "ore") === 3);
  giveCards(g.players[0], { wool: 2 });
  g.bank.ore = 0;
  const r = applyAction(g, "p0", { type: "bankTrade", give: "wool", want: "ore" });
  ok("the bank pays only if it still has the card", r.error === "Bank is empty.", r.error);
  const places = (x) => docks(x).corners.map((v) => v.id).sort().join();
  const others = [11, 12, 13].map((seed) => createGame({ humans: [{ name: "A" }], bots: 2, seed }));
  ok("a new game keeps the same nine docks and may rotate their types", others.every((x) => places(x) === places(g)) && new Set(others.map((x) => docks(x).corners.map((v) => v.harbor).join())).size > 1);
}

// Bank
ok("the bank starts with 19 of each resource", RESOURCES.every((r) => fresh().bank[r] === 19));

console.log("rules prove ok");
