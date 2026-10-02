// 200 all-bot games (issue #84): after every action the cards, the piece stock and the win still add up.
// Then the stalled position behind #233, which the bot now plays out to a win.
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, legalSettle, totalVP } from "../src/lib/game/rules.ts";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { RESOURCES } from "../src/lib/game/types.ts";

function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  process.exit(1);
}

const GAMES = 200;
const MAX_ACTIONS = 5000;
const PER_RESOURCE = 19;

function check(g, where) {
  for (const r of RESOURCES) {
    const total = g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0);
    if (total !== PER_RESOURCE) fail(`${where}: ${r} totals ${total}, not ${PER_RESOURCE}`);
    if (g.bank[r] < 0) fail(`${where}: bank ${r} is ${g.bank[r]}`);
    for (const p of g.players) if (p.resources[r] < 0) fail(`${where}: ${p.id} holds ${p.resources[r]} ${r}`);
  }
  for (const p of g.players) {
    for (const k of ["pathsLeft", "outpostsLeft", "strongholdsLeft"]) {
      if (p[k] < 0) fail(`${where}: ${p.id} ${k} is ${p[k]}`);
    }
  }
  if (g.phase === "over") {
    if (!g.winner) fail(`${where}: game over with no winner`);
    const vp = totalVP(g, g.winner);
    if (vp < 10) fail(`${where}: winner ${g.winner} has only ${vp} points`);
  } else if (g.winner) fail(`${where}: winner ${g.winner} set in phase ${g.phase}`);
}

const started = Date.now();
let actions = 0;
for (let i = 0; i < GAMES; i++) {
  const seed = 1000 + i;
  const bots = i % 2 ? 4 : 3;
  let g = createGame({ humans: [], bots, seed });
  check(g, `seed ${seed} start`);
  let n = 0;
  for (; n < MAX_ACTIONS && g.phase !== "over"; n++) {
    const where = `seed ${seed} (${bots} bots) action ${n} phase ${g.phase}`;
    const actor =
      g.phase === "discard" ? g.players.find((p) => (g.discardNeeded[p.id] ?? 0) > 0) : g.players.find((p) => p.id === g.current);
    if (!actor) fail(`${where}: nobody to act`);
    const action = chooseBotAction(g, actor.id);
    if (!action) fail(`${where}: ${actor.id} chose no action`);
    const next = applyAction(g, actor.id, action);
    if (next.error) fail(`${where}: ${actor.id} ${JSON.stringify(action)}`, next.error);
    g = next.state;
    check(g, `${where} after ${JSON.stringify(action)}`);
  }
  if (g.phase !== "over") fail(`seed ${seed} (${bots} bots): no winner after ${MAX_ACTIONS} actions (phase ${g.phase}, turn ${g.turn})`);
  actions += n;
}

console.log(`${GAMES} games, ${actions} actions, ${Date.now() - started} ms`);

// #233: the stalled all-bot game. Every path is laid, nobody has an outpost spot, the deck is gone.
// Ember sits at 9 with outposts to raise but no ore hex and a hand of grain; Dune sits at 8 with
// two knights out and a third in hand. The old bot traded only for a resource it had none of (so it
// stopped at 1 ore) and never played a fortune, so both rolled and passed for hundreds of turns.
function stalled() {
  const g = createGame({ humans: [], bots: 4, seed: 1150 });
  const place = (pid, kind) => {
    const vid = legalSettle(g, pid, true)[0];
    g.vertices.find((v) => v.id === vid).building = { playerId: pid, kind };
  };
  place("p0", "stronghold");
  for (let i = 0; i < 4; i++) place("p0", "outpost");
  place("p1", "stronghold");
  place("p1", "stronghold");
  place("p1", "outpost");
  place("p1", "outpost");
  place("p2", "stronghold");
  place("p3", "stronghold");
  for (const p of g.players) p.pathsLeft = 0;
  Object.assign(g.players[0], { outpostsLeft: 1, strongholdsLeft: 3 });
  g.players[0].hidden.vp = 3;
  g.players[0].resources = { timber: 2, clay: 1, wool: 1, grain: 11, ore: 0 };
  Object.assign(g.players[1], { outpostsLeft: 3, strongholdsLeft: 2, knightsPlayed: 2 });
  g.players[1].hidden = { knight: 1, road: 0, plenty: 0, monopoly: 0, vp: 2 };
  g.players[1].resources = { timber: 1, clay: 1, wool: 4, grain: 2, ore: 2 };
  for (const r of RESOURCES) g.bank[r] = PER_RESOURCE - g.players.reduce((n, p) => n + p.resources[r], 0);
  g.deck = [];
  g.phase = "main";
  g.setupIndex = 8;
  g.turn = 129;
  check(g, "stalled position");
  if (totalVP(g, "p0") !== 9 || totalVP(g, "p1") !== 8) fail("stalled points", [totalVP(g, "p0"), totalVP(g, "p1")]);
  for (const p of g.players) if (legalSettle(g, p.id, false).length) fail(`stalled: ${p.id} has an outpost spot`);
  return g;
}

function botTurn(g, pid, first) {
  g.current = pid;
  const a = chooseBotAction(g, pid);
  if (a.type !== first) fail(`#233 ${pid} opens with ${JSON.stringify(a)}, not ${first}`);
  for (let n = 0; n < 10 && g.phase !== "over"; n++) {
    const action = chooseBotAction(g, pid);
    if (action.type === "endTurn") fail(`#233 ${pid} passed at ${totalVP(g, pid)} points`, g.players.find((p) => p.id === pid).resources);
    const next = applyAction(g, pid, action);
    if (next.error) fail(`#233 ${pid} ${JSON.stringify(action)}`, next.error);
    g = next.state;
    check(g, `#233 after ${JSON.stringify(action)}`);
  }
  if (g.winner !== pid) fail(`#233 ${pid} did not win`, { phase: g.phase, winner: g.winner });
  return g;
}

{
  const g = botTurn(stalled(), "p0", "bankTrade");
  if (g.players[0].strongholdsLeft !== 2) fail("#233 Ember did not raise a stronghold");
  console.log("#233 stalled at 9 with 11 grain and no ore: trades grain for ore twice, raises a stronghold, wins");
}
{
  const g = botTurn(stalled(), "p1", "playKnight");
  if (g.largestArmy !== "p1") fail("#233 Dune did not take the largest army", g.largestArmy);
  console.log("#233 stalled at 8 with a third knight in hand: plays it, largest army, wins");
}

// The other shape (seeds 1049, 1127 and 1191 with 3 bots): no setup outpost touches clay, so all 19
// clay sit in the bank. Both outposts become strongholds, the deck runs out, and from then on the
// only way forward is a path, which needs clay. The bot must trade spare cards for it and lay one.
{
  let g = createGame({ humans: [], bots: 3, seed: 1049 });
  for (const p of g.players) {
    for (let i = 0; i < 2; i++) {
      const vid = legalSettle(g, p.id, true)[0];
      g.vertices.find((v) => v.id === vid).building = { playerId: p.id, kind: "stronghold" };
    }
    Object.assign(p, { pathsLeft: 13, outpostsLeft: 5, strongholdsLeft: 2 });
  }
  g.players[0].resources = { timber: 3, clay: 0, wool: 4, grain: 3, ore: 4 };
  for (const r of RESOURCES) g.bank[r] = PER_RESOURCE - g.players.reduce((n, p) => n + p.resources[r], 0);
  g.deck = [];
  g.phase = "main";
  g.current = "p0";
  g.setupIndex = 6;
  const first = chooseBotAction(g, "p0");
  if (first.type !== "bankTrade" || first.want !== "clay") fail("#233 no clay anywhere: opens with", first);
  let n = 0;
  for (let a = chooseBotAction(g, "p0"); a.type !== "endTurn" && n < 10; a = chooseBotAction(g, "p0"), n++) {
    const next = applyAction(g, "p0", a);
    if (next.error) fail(`#233 no clay ${JSON.stringify(a)}`, next.error);
    g = next.state;
    check(g, `#233 no clay after ${JSON.stringify(a)}`);
  }
  if (g.players[0].pathsLeft !== 11) fail("#233 no clay anywhere: paths laid", 13 - g.players[0].pathsLeft);
  console.log("#233 no clay anywhere, two strongholds each, deck gone: trades for clay and lays two paths");
}

console.log("bots prove ok");
