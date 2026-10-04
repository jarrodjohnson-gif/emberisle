// Bot choices (#361): hand-built positions where the practice bot must play a plenty, a path fortune
// or a monopoly, and ones where it must not (bought this turn, already played, short by too much).
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, legalRoads, legalSettle, publicVP } from "../src/lib/game/rules.ts";
import { chooseBotAction, chooseTradeAsk, shouldAcceptTrade } from "../src/lib/game/ai.ts";
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

// Wayfarer (#362): an empty board where p0 moves the wayfarer and `place` puts buildings by hand.
// The bot sees only what every seat sees: points shown, buildings and card counts.
function robberPosition({ seed = 7, phase = "robber" } = {}) {
  const g = createGame({ humans: [], bots: 3, seed });
  g.phase = phase;
  g.current = "p0";
  g.rollOff = null;
  return g;
}
function place(g, hexId, nth, pid, kind, cards) {
  g.vertices.filter((x) => x.hexes.includes(hexId))[nth].building = { playerId: pid, kind };
  g.players.find((x) => x.id === pid).resources.wool = cards;
  g.bank.wool -= cards;
}
// Seed 7: "-2,0" is an 8 (the best token), "0,-2" a 6, "0,-1" a 2; none is the wayfarer's start.
const BEST = "-2,0";
const SIX = "0,-2";
const WORST = "0,-1";

// Two targets on the best hex, the leader (a stronghold) listed second: the steal goes to the leader.
{
  const g = robberPosition();
  place(g, BEST, 0, "p1", "outpost", 3);
  place(g, BEST, 2, "p2", "stronghold", 3);
  const a = chooseBotAction(g, "p0");
  if (a.type !== "moveRobber" || a.hexId !== BEST) fail("robs the leader: not the leader's hex", a);
  if (a.stealFrom !== "p2") fail("robs the leader: stole from the trailing player", a);
  play(g, a);
  console.log("robs the leader: two targets, the one showing more points is robbed");
}

// Same points shown: the fuller hand is robbed, not the first seat.
{
  const g = robberPosition();
  place(g, BEST, 0, "p1", "outpost", 1);
  place(g, BEST, 2, "p2", "outpost", 4);
  const a = chooseBotAction(g, "p0");
  if (a.type !== "moveRobber" || a.stealFrom !== "p2") fail("robs the leader: tied on points, did not rob the fuller hand", a);
  play(g, a);
  console.log("robs the leader: tied on points, the fuller hand is robbed");
}

// The leader holds no cards: their hex is still blocked, and the steal goes to the hand that has cards.
{
  const g = robberPosition();
  place(g, BEST, 0, "p2", "stronghold", 0);
  place(g, BEST, 2, "p1", "outpost", 3);
  const a = chooseBotAction(g, "p0");
  if (a.type !== "moveRobber" || a.hexId !== BEST) fail("robs the leader: empty-handed leader, left their hex alone", a);
  if (a.stealFrom !== "p1") fail("robs the leader: tried an empty hand", a);
  play(g, a);
  console.log("robs the leader: an empty-handed leader is blocked, the steal goes to the hand with cards");
}

// A wayfarer card picks the same way.
{
  const g = robberPosition({ phase: "main" });
  g.players[0].hidden = { ...NONE, knight: 1 };
  place(g, BEST, 0, "p1", "outpost", 3);
  place(g, BEST, 2, "p2", "stronghold", 3);
  const a = chooseBotAction(g, "p0");
  if (a.type !== "playKnight" || a.hexId !== BEST || a.stealFrom !== "p2") fail("robs the leader: the wayfarer card picked differently", a);
  play(g, a);
  console.log("robs the leader: the wayfarer card robs the leader too");
}

// The leader farms a worse token than the trailer: the leader's two strongholds outweigh the 8.
// Corners 4 and 5 of "0,-2" and corner 3 of "-2,0" touch no other hex, so each hex scores alone.
{
  const g = robberPosition();
  place(g, SIX, 4, "p2", "stronghold", 3);
  place(g, SIX, 5, "p2", "stronghold", 3);
  place(g, BEST, 3, "p1", "outpost", 3);
  const a = chooseBotAction(g, "p0");
  if (a.type !== "moveRobber" || a.hexId !== SIX) fail("robs the leader: took the better token over the leader's hex", a);
  if (a.stealFrom !== "p2") fail("robs the leader: not the leader", a);
  play(g, a);
  console.log("robs the leader: the leader's strongholds on a 6 outweigh a trailing outpost on an 8");
}

// The leader shares the best hex with the bot, and the only other opponent holds no cards: the bot
// still leaves its own hex alone and blocks the empty-handed trailer rather than itself.
{
  const g = robberPosition();
  place(g, BEST, 4, "p0", "outpost", 0);
  place(g, BEST, 3, "p2", "stronghold", 3);
  place(g, WORST, 0, "p1", "outpost", 0);
  const a = chooseBotAction(g, "p0");
  const corners = g.vertices.filter((v) => v.hexes.includes(a.hexId) && v.building);
  if (a.type !== "moveRobber" || a.hexId === BEST) fail("own hex: blocked itself while another hex blocks an opponent", a);
  if (corners.some((v) => v.building.playerId === "p0") || !corners.length) fail("own hex: the hex picked instead does not block an opponent", a);
  play(g, a);
  console.log("own hex: never blocked while another hex blocks an opponent, even with no steal there");
}

// Table trades (#363). p0 holds two strongholds and one path to a free corner, so its goal is an
// outpost (timber, clay, wool, grain). `asker` gets the goods the ask gives, so the trade can go through.
function tradePosition(resources) {
  return position({ resources, strongholds: true, extend: true });
}
function stock(g, pid, bag) {
  const p = g.players.find((x) => x.id === pid);
  for (const [r, n] of Object.entries(bag)) {
    p.resources[r] += n;
    g.bank[r] -= n;
  }
}
function trade(g, offer) {
  g.current = offer.from;
  const o = applyAction(g, offer.from, { type: "offerTrade", to: "p0", give: offer.give, want: offer.want });
  if (o.error) fail("the ask is illegal", o.error);
  const r = applyAction(o.state, "p0", { type: "respondTrade", accept: true });
  if (r.error) fail("the bot's Yes is illegal", r.error);
  r.state.current = "p0";
  return r.state;
}
const CLAY_FOR_ORE = { from: "p1", give: { clay: 1 }, want: { ore: 1 } };

// Yes: one clay short of an outpost, offered clay for a spare ore. The trade goes through and it builds.
{
  let g = tradePosition({ timber: 1, wool: 1, grain: 1, ore: 2 });
  stock(g, "p1", { clay: 1 });
  if (!shouldAcceptTrade(g, "p0", CLAY_FOR_ORE)) fail("trade: refused clay it is short of for a spare ore");
  g = trade(g, CLAY_FOR_ORE);
  const b = chooseBotAction(g, "p0");
  if (b.type !== "buildOutpost") fail("trade: after the clay, not an outpost", b);
  play(g, b);
  console.log("trade: says Yes to the clay its outpost lacks, for a spare ore, then builds");
}

// No: the same ask from the leader on public points; Yes from a trailing seat.
{
  const g = tradePosition({ timber: 1, wool: 1, grain: 1, ore: 2 });
  g.longestRoad = "p1";
  g.largestArmy = "p1";
  if (!(publicVP(g, "p1") > publicVP(g, "p0"))) fail("trade: p1 is not the leader", publicVP(g, "p1"));
  if (shouldAcceptTrade(g, "p0", CLAY_FOR_ORE)) fail("trade: helped the leader");
  if (!shouldAcceptTrade(g, "p0", { ...CLAY_FOR_ORE, from: "p2" })) fail("trade: refused a trailing seat the same ask");
  console.log("trade: says No to the leader on public points, Yes to a trailing seat");
}

// No: clay and grain for one ore would finish its outpost, but it holds no ore; with an ore, Yes.
{
  const ask = { from: "p1", give: { clay: 1, grain: 1 }, want: { ore: 1 } };
  if (shouldAcceptTrade(tradePosition({ timber: 1, wool: 1 }), "p0", ask)) fail("trade: said Yes without the ore to pay");
  if (!shouldAcceptTrade(tradePosition({ timber: 1, wool: 1, ore: 1 }), "p0", ask)) fail("trade: refused the same ask it can pay");
  console.log("trade: says No when it cannot pay, Yes to the same ask once it can");
}

// No: an ask that takes a card its outpost needs, and one that gives it fewer cards than it pays.
{
  const g = tradePosition({ timber: 1, wool: 1, grain: 1, ore: 2 });
  if (shouldAcceptTrade(g, "p0", { from: "p1", give: { ore: 1 }, want: { grain: 1 } })) fail("trade: gave away a card its outpost needs");
  if (shouldAcceptTrade(g, "p0", { from: "p1", give: { clay: 1 }, want: { ore: 2 } })) fail("trade: paid two for one");
  console.log("trade: says No when it brings the outpost no closer, or pays more cards than it gets");
}

// Its own ask: one clay short, it asks for exactly that clay against a spare ore, and the ask is legal.
{
  const g = tradePosition({ timber: 1, wool: 1, grain: 1, ore: 2 });
  const ask = chooseTradeAsk(g, "p0");
  if (!ask || JSON.stringify(ask.want) !== '{"clay":1}' || JSON.stringify(ask.give) !== '{"ore":1}') fail("ask: not one ore for the clay it is short of", ask);
  stock(g, "p1", { clay: 1 });
  const r = applyAction(g, "p0", { type: "offerTrade", to: "p1", ...ask });
  if (r.error) fail("ask: illegal", r.error);
  console.log("ask: names the one clay its outpost lacks, for a spare ore");
}

// No ask: nothing spare to give, two or more cards short, or not its turn.
{
  if (chooseTradeAsk(tradePosition({ timber: 1, wool: 1, grain: 1 }), "p0") !== null) fail("ask: gave away a card its outpost needs");
  if (chooseTradeAsk(tradePosition({ timber: 1, wool: 1, ore: 3 }), "p0") !== null) fail("ask: two cards short and still asked");
  const g = tradePosition({ timber: 1, wool: 1, grain: 1, ore: 2 });
  g.current = "p1";
  if (chooseTradeAsk(g, "p0") !== null) fail("ask: asked on another seat's turn");
  console.log("ask: null when nothing spare, two short, or not its turn");
}

console.log("ai prove ok");
