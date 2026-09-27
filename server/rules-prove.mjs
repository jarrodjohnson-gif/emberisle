// Rules-audit fixes (docs/design/rules-fixes.md): longest path as a real trail, ties, cuts, fortune timing, and paths past an outpost.
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, roadLength } from "../src/lib/game/rules.ts";

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

console.log("rules prove ok");
