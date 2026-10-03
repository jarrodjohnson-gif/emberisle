// Bot choices (#361): hand-built positions where the practice bot must play a plenty, a path fortune
// or a monopoly, and ones where it must not (bought this turn, already played, short by too much).
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, legalRoads, legalSettle } from "../src/lib/game/rules.ts";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { RESOURCES } from "../src/lib/game/types.ts";

function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  process.exit(1);
}

const PER_RESOURCE = 19;
const NONE = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };

// Three bots play setup out, then p0 stands in its main phase with the given hand and fortunes.
// `strongholds` raises both its outposts (so the next goal is an outpost, not a stronghold) and
// `extend` lays one more path to a free corner, so an outpost is legal.
function position({ seed = 7, resources, hidden = {}, bought = {}, strongholds = false, extend = false }) {
  let g = createGame({ humans: [], bots: 3, seed });
  // Skip the roll-off (#232): its die is not seeded, and these positions need p0 placing first.
  g.phase = "setupSettle";
  g.rollOff = null;
  while (g.phase === "setupSettle" || g.phase === "setupRoad") {
    const r = applyAction(g, g.current, chooseBotAction(g, g.current));
    if (r.error) fail("setup", r.error);
    g = r.state;
  }
  g.phase = "main";
  g.current = "p0";
  const me = g.players[0];
  if (strongholds) {
    for (const v of g.vertices) if (v.building?.playerId === "p0") v.building.kind = "stronghold";
    me.strongholdsLeft -= 2;
    me.outpostsLeft += 2;
  }
  if (extend) {
    const eid = legalRoads(g, "p0", false).find((id) => {
      const e = g.edges.find((x) => x.id === id);
      e.path = "p0";
      const ok = legalSettle(g, "p0", false).length > 0;
      e.path = null;
      return ok;
    });
    if (!eid) fail("no path opens an outpost corner");
    g.edges.find((x) => x.id === eid).path = "p0";
    me.pathsLeft -= 1;
  }
  me.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0, ...resources };
  me.hidden = { ...NONE, ...hidden };
  me.boughtThisTurn = { ...NONE, ...bought };
  for (const r of RESOURCES) g.bank[r] = PER_RESOURCE - g.players.reduce((n, p) => n + p.resources[r], 0);
  return g;
}

function play(g, action) {
  const r = applyAction(g, "p0", action);
  if (r.error) fail(`${JSON.stringify(action)} is illegal`, r.error);
  return r.state;
}

// Plenty, short of an outpost by two: names the two missing cards, then builds the outpost.
{
  let g = position({ resources: { timber: 1, wool: 1 }, hidden: { plenty: 1 }, strongholds: true, extend: true });
  const a = chooseBotAction(g, "p0");
  if (a.type !== "playPlenty") fail("short by 2 for an outpost: not a plenty", a);
  if (a.resources.slice().sort().join() !== "clay,grain") fail("plenty names the wrong cards", a);
  g = play(g, a);
  const b = chooseBotAction(g, "p0");
  if (b.type !== "buildOutpost") fail("after the plenty: not an outpost", b);
  play(g, b);
  console.log("plenty: short clay and grain for an outpost, names both, then builds it");
}

// Plenty, short by one: the missing card plus one the goal uses again, never a card the bank lacks.
{
  const g = position({ resources: { timber: 1, wool: 1, grain: 1 }, hidden: { plenty: 1 }, strongholds: true, extend: true });
  const a = chooseBotAction(g, "p0");
  if (a.type !== "playPlenty" || !a.resources.includes("clay") || a.resources.length !== 2) fail("short by 1: not a two-card plenty with clay", a);
  play(g, a);
  console.log("plenty: short one clay, still names two cards");
}
{
  const g = position({ resources: { timber: 1, wool: 1 }, hidden: { plenty: 1 }, strongholds: true, extend: true });
  g.players[1].resources.clay += g.bank.clay;
  g.bank.clay = 0;
  const a = chooseBotAction(g, "p0");
  if (a.type === "playPlenty") fail("bank has no clay: still a plenty", a);
  play(g, a);
  console.log("plenty: held back when the bank cannot pay a named card");
}
{
  const g = position({ resources: { timber: 1 }, hidden: { plenty: 1 } });
  const a = chooseBotAction(g, "p0");
  if (a.type === "playPlenty") fail("short by 5 for a stronghold: still a plenty", a);
  play(g, a);
  console.log("plenty: held back when the stronghold is five cards away");
}

// Plenty for the stronghold (the first goal while an outpost stands): one grain short, names grain twice.
{
  let g = position({ resources: { grain: 2, ore: 2 }, hidden: { plenty: 1 } });
  const a = chooseBotAction(g, "p0");
  if (a.type !== "playPlenty" || !a.resources.includes("grain")) fail("one grain short of a stronghold: not a grain plenty", a);
  g = play(g, a);
  const b = chooseBotAction(g, "p0");
  if (b.type !== "buildStronghold") fail("after the plenty: not a stronghold", b);
  play(g, b);
  console.log("plenty: one grain short of a stronghold, then raises it");
}

// Path fortune: two edges, legal one after the other, the first one opening an outpost corner.
{
  let g = position({ resources: {}, hidden: { road: 1 } });
  const before = legalSettle(g, "p0", false).length;
  const a = chooseBotAction(g, "p0");
  if (a.type !== "playRoad" || a.edgeIds.length !== 2) fail("path fortune: not two edges", a);
  if (!legalRoads(g, "p0", false).includes(a.edgeIds[0])) fail("first edge is not legal", a);
  g = play(g, a);
  if (g.players[0].pathsLeft !== 15 - 2 - 2) fail("two paths were not laid", g.players[0].pathsLeft);
  if (legalSettle(g, "p0", false).length <= before) fail("the paths opened no outpost corner", { before, after: legalSettle(g, "p0", false).length });
  console.log("path fortune: two legal edges, laid in order, reaching a new outpost corner");
}
{
  const g = position({ resources: {}, hidden: { road: 1 } });
  g.players[0].pathsLeft = 1;
  const a = chooseBotAction(g, "p0");
  if (a.type !== "playRoad" || a.edgeIds.length !== 1) fail("one path left: not a single edge", a);
  play(g, a);
  console.log("path fortune: one path left, one edge");
}

// Monopoly: the resource the goal is short of most. Opponents' hands do not steer it.
{
  const g = position({ resources: { grain: 2 }, hidden: { monopoly: 1 } });
  for (const p of g.players.slice(1)) p.resources.grain += 4;
  for (const r of RESOURCES) g.bank[r] = PER_RESOURCE - g.players.reduce((n, p) => n + p.resources[r], 0);
  const a = chooseBotAction(g, "p0");
  if (a.type !== "playMonopoly" || a.resource !== "ore") fail("stronghold short 2 ore and 1 grain: not an ore monopoly", a);
  play(g, a);
  console.log("monopoly: names the card its stronghold is short of most, not the one opponents hold");
}

// Fortunes bought this turn stay in hand; a second fortune in one turn is never asked for.
for (const kind of ["plenty", "road", "monopoly"]) {
  const g = position({ resources: { timber: 1, wool: 1 }, hidden: { [kind]: 1 }, bought: { [kind]: 1 }, strongholds: true, extend: true });
  const a = chooseBotAction(g, "p0");
  if (a.type.startsWith("play")) fail(`${kind} bought this turn was played`, a);
  play(g, a);
}
console.log("bought this turn: plenty, path and monopoly all stay in hand");
{
  const g = position({ resources: { timber: 1, wool: 1 }, hidden: { plenty: 1, road: 1, monopoly: 1 }, strongholds: true, extend: true });
  g.playedCard = true;
  const a = chooseBotAction(g, "p0");
  if (a.type.startsWith("play")) fail("a second fortune in one turn", a);
  play(g, a);
  console.log("already played: no second fortune");
}

console.log("ai prove ok");
