// #1606: bots under paired turns for five and six seat games (docs/design/six-players.md, "Bots and local modes";
// accepted decision 1: the partner activation, not the older special building phase). Node only: it imports the rules
// and the bot directly, like expanded-turns-prove. Games run the way server/host.mjs runBots runs them: once per turn a
// bot may ask the table, every other seat answers, then the bot acts, and an action the rules refuse becomes a pass.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { applyAction, legalRoads, legalSettle, legalCities, playable, totalVP } from "../src/lib/game/rules.ts";
import { chooseBotAction, chooseTradeAsk, logBotAction, shouldAcceptTrade } from "../src/lib/game/ai.ts";
import { COST } from "../src/lib/game/types.ts";
import { EXPANDED_BANK, PARTNER_NO_TRADE, createAnyGame, pairedAcceptTrade, pairedTradeAsk } from "../src/lib/game/expanded.ts";

const RES = ["timber", "clay", "wool", "grain", "ore"];
let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  checks++;
};

// Dice and steals read crypto.getRandomValues; a seeded xorshift keeps every run repeatable.
let s = 1;
const word = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
const realRandom = crypto.getRandomValues;
crypto.getRandomValues = (buf) => {
  for (let i = 0; i < buf.length; i++) buf[i] = word();
  return buf;
};
const reseed = (seed) => { s = (Math.imul(seed + 1, 2654435761) >>> 0) || 1; };
// The scripted "human" seats draw from their own stream, so their choices never shift the dice.
const humanRand = (seed) => {
  let h = (Math.imul(seed + 7, 2246822519) >>> 0) || 1;
  return () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 2 ** 32; };
};

const who = (g, id) => g.players.find((p) => p.id === id);
const hand = (p) => RES.reduce((n, r) => n + p.resources[r], 0);
const affords = (p, cost) => RES.every((r) => p.resources[r] >= (cost[r] ?? 0));

// A scripted human: any legal move at random, player offers included (the rules refuse those on a partner activation, and
// the seat then picks again). Rolls, discards and the wayfarer go through the bot, which only ever picks legal ones there.
function humanAction(g, pid, rand) {
  if (g.phase !== "main") return chooseBotAction(g, pid);
  const me = who(g, pid);
  const options = [{ type: "endTurn" }];
  const others = g.players.filter((p) => p.id !== pid);
  const give = RES.filter((r) => me.resources[r] > 0);
  if (give.length) {
    const r = give[Math.floor(rand() * give.length)];
    options.push({ type: "offerTrade", to: others[Math.floor(rand() * others.length)].id, give: { [r]: 1 }, want: { [RES[(RES.indexOf(r) + 1) % 5]]: 1 } });
  }
  const four = RES.filter((r) => me.resources[r] >= 4);
  if (four.length) options.push({ type: "bankTrade", give: four[0], want: RES.find((r) => r !== four[0] && g.bank[r] > 0) ?? four[0] });
  if (affords(me, COST.card) && g.deck.length) options.push({ type: "buyCard" });
  if (affords(me, COST.path) && me.pathsLeft > 0) for (const e of legalRoads(g, pid, false).slice(0, 3)) options.push({ type: "buildPath", edgeId: e });
  if (affords(me, COST.outpost) && me.outpostsLeft > 0) for (const v of legalSettle(g, pid, false)) options.push({ type: "buildOutpost", vertexId: v });
  if (affords(me, COST.stronghold) && me.strongholdsLeft > 0) for (const v of legalCities(g, pid)) options.push({ type: "buildStronghold", vertexId: v });
  // Building is worth more than wandering: half the time the human plays like the bot would.
  if (rand() < 0.5) return chooseBotAction(g, pid);
  return options[Math.floor(rand() * options.length)];
}

// One game, host style. `policy` holds the three bot choices; `humans` is how many seats a scripted human plays.
function play({ seats, seed, humans = 0, cap, policy, watch }) {
  reseed(seed);
  const rand = humanRand(seed);
  let g = createAnyGame({ seed, humans: Array.from({ length: humans }, (_, i) => ({ name: `Human ${i + 1}` })), bots: seats - humans, victoryTarget: seed % 3 ? 10 : 7, wayfarerMode: seed % 4 === 3 ? "off" : "on" });
  const h = createHash("sha256");
  const declined = {};
  let asked = null, steps = 0, trades = 0, asks = 0;
  const step = (actor, action, kind) => {
    const prev = g;
    const r = applyAction(prev, actor, action);
    h.update(JSON.stringify([actor, action, r.error ?? null]));
    watch?.({ prev, actor, action, kind, error: r.error, next: r.state });
    if (!r.error) g = r.state;
    steps++;
    return r;
  };
  while (steps < cap && g.phase !== "over") {
    const actor = g.phase === "discard" ? Object.keys(g.discardNeeded)[0] : g.current;
    const bot = who(g, actor).kind === "bot";
    // Once per bot turn, before its other moves, the bot may ask the table; the first Yes takes it.
    if (bot && g.phase === "main" && asked !== `${g.turn}:${actor}`) {
      asked = `${g.turn}:${actor}`;
      const ask = policy.tradeAsk(g, actor, declined[actor]);
      watch?.({ prev: g, actor, ask });
      if (ask) {
        asks++;
        const offer = { from: actor, ...ask };
        const taker = g.players.find((p) => p.id !== actor && (p.kind === "bot" ? policy.accept(g, p.id, offer) : rand() < 0.3 && RES.every((r) => p.resources[r] >= (ask.want[r] ?? 0))));
        if (!taker) declined[actor] = ask;
        else if (!step(actor, { type: "offerTrade", to: taker.id, ...ask }, "ask").error && !step(taker.id, { type: "respondTrade", accept: true }, "answer").error) trades++;
        continue;
      }
    }
    const action = bot ? policy.botAction(g, actor) : humanAction(g, actor, rand);
    const r = step(actor, action ?? { type: "endTurn" }, bot ? "bot" : "human");
    // An offer to a bot is answered by the bot; an offer to a human, by a coin.
    if (!r.error && g.trade) {
      const to = who(g, g.trade.to);
      const yes = to.kind === "bot" ? policy.accept(g, to.id, g.trade) : rand() < 0.5;
      step(to.id, { type: "respondTrade", accept: yes && RES.every((x) => to.resources[x] >= (g.trade.want[x] ?? 0)) }, to.kind === "bot" ? "answer" : "human");
    } else if (r.error && bot) step(actor, { type: "endTurn" }, "pass");
    else if (r.error && action.type === "endTurn") throw new Error(`seed ${seed}: ${actor} cannot end: ${r.error}`);
  }
  return { g, hash: h.digest("hex").slice(0, 16), steps, trades, asks };
}

const RAW = { botAction: chooseBotAction, tradeAsk: chooseTradeAsk, accept: shouldAcceptTrade };
const PAIRED = { botAction: chooseBotAction, tradeAsk: pairedTradeAsk, accept: pairedAcceptTrade };

// Goods set to exactly `bag`, the difference taken from or put back in the bank so the supply stays whole.
function holding(g, pid, bag) {
  g = structuredClone(g);
  const p = who(g, pid);
  for (const r of RES) {
    g.bank[r] -= (bag[r] ?? 0) - p.resources[r];
    p.resources[r] = bag[r] ?? 0;
  }
  return g;
}
// Bots set up and play until the first partner activation begins; each primary ends its turn straight after the roll.
function firstPartner(seats, seed) {
  reseed(seed);
  let g = createAnyGame({ seed, humans: [], bots: seats });
  while (g.role !== "partner") {
    const actor = g.phase === "discard" ? Object.keys(g.discardNeeded)[0] : g.current;
    const r = applyAction(g, actor, g.phase === "main" ? { type: "endTurn" } : chooseBotAction(g, actor));
    assert.equal(r.error, undefined, `${seats} seats: reach a partner activation: ${r.error}`);
    g = r.state;
  }
  return g;
}
// One bot activation, run to its end the way runBots runs it, with a bound so a loop shows up as a failure.
function activation(g, tag) {
  const actor = g.current;
  const picks = [];
  eq(pairedTradeAsk(g, actor, null), null, `${tag}: the partner asks nobody`);
  while (g.current === actor && g.phase !== "over") {
    ok(picks.length < 20, `${tag}: the activation ends within 20 picks (${picks.join(", ")})`);
    const action = chooseBotAction(g, actor);
    picks.push(action.type);
    const r = applyAction(g, actor, action);
    eq(r.error, undefined, `${tag}: ${action.type} is legal`);
    g = r.state;
  }
  return { g, picks };
}

// 1. A blocked partner passes, and the trade choices respect the role. Hand-built partner activations at 5 and 6 seats.
for (const seats of [5, 6]) {
  const tag = `${seats} seats`;
  const start = firstPartner(seats, 11);
  const R = start.current;
  const P = start.primary;
  const at = start.players.findIndex((p) => p.id === P);
  const nextPrimary = start.players[(at + 1) % seats].id;
  eq([start.role, start.phase, start.players.findIndex((p) => p.id === R)], ["partner", "main", (at + 3) % seats], `${tag}: a partner activation`);
  const passes = (g, why) => {
    const { g: after, picks } = activation(g, `${tag}, ${why}`);
    eq(picks, ["endTurn"], `${tag}, ${why}: the partner passes`);
    eq([after.current, after.primary, after.role, after.phase], [nextPrimary, nextPrimary, "primary", "roll"], `${tag}, ${why}: the next primary rolls`);
  };
  passes(holding(start, R, {}), "empty hand");
  // The goods for a path, and no path left to lay; too few of anything for a bank trade.
  passes((() => { const g = holding(start, R, { timber: 1, clay: 1 }); who(g, R).pathsLeft = 0; return g; })(), "no paths left");
  // A knight bought on this activation stays locked until the partner's next one.
  passes((() => { const g = holding(start, R, {}); who(g, R).hidden.knight = 1; who(g, R).boughtThisTurn.knight = 1; return g; })(), "a fresh knight");
  // Every outpost and stronghold already placed, with most of an outpost's goods in hand.
  passes((() => { const g = holding(start, R, { timber: 1, wool: 1, grain: 2 }); who(g, R).strongholdsLeft = 0; who(g, R).outpostsLeft = 0; return g; })(), "no pieces left");

  // One grain short of a stronghold with a spare wool: a primary asks the table for it; a partner does not.
  const short = holding(start, R, { wool: 1, grain: 2, ore: 2 });
  const asPrimary = { ...short, role: "primary", primary: R };
  const ask = { give: { wool: 1 }, want: { grain: 1 } };
  eq(pairedTradeAsk(asPrimary, R, null), ask, `${tag}: the same seat asks as a primary (the guard can fail)`);
  eq(chooseTradeAsk(short, R, null), ask, `${tag}: the classic choice would ask on the partner activation`);
  const { picks } = activation(short, `${tag}, one short`);
  eq(picks.at(-1), "endTurn", `${tag}, one short: the partner ends its own turn`);
  ok(!picks.some((t) => ["roll", "offerTrade", "respondTrade"].includes(t)), `${tag}, one short: no roll and no player trade (${picks.join(", ")})`);

  // Another bot would take that ask: on a primary activation it says Yes, on a partner activation No.
  const X = start.players[(at + 1) % seats].id;
  const offer = { from: R, give: { grain: 1 }, want: { wool: 1 } };
  const answering = holding(holding(start, X, { wool: 1, grain: 2, ore: 2 }), R, { grain: 1 });
  eq(shouldAcceptTrade(answering, X, offer), true, `${tag}: the classic answer is Yes`);
  eq(pairedAcceptTrade({ ...answering, role: "primary", primary: R }, X, offer), true, `${tag}: Yes on a primary activation (the guard can fail)`);
  eq(pairedAcceptTrade(answering, X, offer), false, `${tag}: No on a partner activation`);
  // An offer left open from the primary activation: the bot's No is a legal decline that closes it, once.
  const stale = { ...answering, trade: { from: P, to: X, give: { grain: 1 }, want: { wool: 1 } } };
  const yes = pairedAcceptTrade(stale, X, stale.trade);
  eq(yes, false, `${tag}: No to a stale offer`);
  const declined = applyAction(stale, X, { type: "respondTrade", accept: yes });
  eq([declined.error, declined.state.trade, declined.state.current], [undefined, null, R], `${tag}: the decline closes the offer and the partner still acts`);
  eq(applyAction(stale, X, { type: "respondTrade", accept: true }).error, PARTNER_NO_TRADE, `${tag}: the rules would refuse a Yes`);
}

// 2. Seeded games to a win: all bots, and bots with scripted humans. Every action a bot picks is legal; on a partner
// activation it is never a roll or a player trade; a partner bot never asks and never says Yes.
const CAP = 2000;
const NO_PARTNER = new Set(["roll", "offerTrade", "respondTrade"]);
const tally = { games: 0, actions: 0, longest: 0, partnerPicks: {}, partnerPasses: 0, blockedPasses: 0, guardAsks: 0, guardAccepts: 0, humanRefused: 0, botAnswers: 0, trades: 0, tagged: 0 };
function expandedGames(seats, humans, seeds) {
  for (const seed of seeds) {
    const tag = `${seats} seats, ${humans} human${humans === 1 ? "" : "s"}, seed ${seed}`;
    let activationStart = null, firstPick = true;
    const watch = (e) => {
      const { prev, actor, action, kind } = e;
      if (prev.activation !== activationStart) {
        activationStart = prev.activation;
        firstPick = true;
        // On a partner activation every bot answers No to each one-for-one ask the partner could make (the first eight
        // all-bot seeds only: it is the slow part).
        if (prev.role === "partner" && humans === 0 && seed < 8) {
          for (const p of prev.players) {
            if (p.id === actor) continue;
            for (const g of RES) for (const w of RES) {
              if (g === w || !who(prev, actor).resources[g]) continue;
              const offer = { from: actor, give: { [g]: 1 }, want: { [w]: 1 } };
              assert.equal(pairedAcceptTrade(prev, p.id, offer), false, `${tag}: ${p.id} says No on a partner activation`);
              if (shouldAcceptTrade(prev, p.id, offer)) tally.guardAccepts++;
            }
          }
        }
      }
      if ("ask" in e) {
        if (prev.role === "partner") {
          assert.equal(e.ask, null, `${tag}: a partner bot asks nobody`);
          if (chooseTradeAsk(prev, actor, null)) tally.guardAsks++;
        }
        return;
      }
      tally.actions++;
      if (kind === "pass") assert.fail(`${tag}: the rules refused a bot's pick (${prev.role}, ${prev.phase})`);
      if (kind === "bot" || kind === "answer") assert.equal(e.error, undefined, `${tag}: ${action.type} by bot ${actor} (${prev.role ?? "setup"}): ${e.error}`);
      if (kind === "human" && prev.role === "partner" && action.type === "offerTrade") {
        assert.equal(e.error, PARTNER_NO_TRADE, `${tag}: a human partner's offer is refused`);
        tally.humanRefused++;
      }
      if (kind === "answer") tally.botAnswers++;
      if (prev.role === "partner" && kind === "bot") {
        assert.ok(!NO_PARTNER.has(action.type), `${tag}: a partner bot picked ${action.type}`);
        tally.partnerPicks[action.type] = (tally.partnerPicks[action.type] ?? 0) + 1;
        if (action.type === "endTurn") {
          tally.partnerPasses++;
          if (firstPick) tally.blockedPasses++;
          const at = prev.players.findIndex((p) => p.id === prev.primary);
          if (e.next.phase !== "over") assert.deepEqual([e.next.role, e.next.current], ["primary", prev.players[(at + 1) % seats].id], `${tag}: a partner's pass hands the dice on`);
          // The pass is told as the partner's, never as another seat's.
          const name = who(prev, actor).name.replace(/ \(bot\)$/i, "");
          const line = logBotAction(prev, e.next, action, actor, name).log.at(-1);
          if (line.startsWith("Bot passed for ")) {
            assert.ok(line.startsWith(`Bot passed for ${name}; `), `${tag}: ${line}`);
            tally.tagged++;
          }
        }
      }
      if (kind === "bot" || kind === "human") firstPick = false;
      for (const r of RES) assert.equal(e.next.bank[r] + e.next.players.reduce((n, p) => n + p.resources[r], 0), EXPANDED_BANK, `${tag}: ${r} supply`);
    };
    const { g, steps, trades } = play({ seats, seed, humans, cap: CAP, policy: PAIRED, watch });
    eq(g.phase, "over", `${tag}: the game ends within ${CAP} actions (${steps})`);
    ok(totalVP(g, g.winner) >= victoryTargetOf(seed), `${tag}: the winner has the points`);
    tally.games++;
    tally.trades += trades;
    tally.longest = Math.max(tally.longest, steps);
  }
}
const victoryTargetOf = (seed) => (seed % 3 ? 10 : 7);
const SEEDS = Array.from({ length: 30 }, (_, i) => i);
for (const seats of [5, 6]) expandedGames(seats, 0, SEEDS);
const allBot = tally.games;
for (const seats of [5, 6]) for (const humans of [1, 2, 3]) expandedGames(seats, humans, SEEDS.slice(0, 6));
ok(tally.partnerPicks.endTurn > 0 && Object.keys(tally.partnerPicks).length >= 4, `partner bots build, buy or trade, and pass: ${JSON.stringify(tally.partnerPicks)}`);
ok(tally.blockedPasses > 0, "some partner bots pass with nothing to do");
ok(tally.guardAsks > 0, "the classic choice would have asked on some partner activations");
ok(tally.guardAccepts > 0, "the classic answer would have been Yes on some partner activations");
ok(tally.humanRefused > 0, "scripted human partners try offers and the rules refuse them");
ok(tally.botAnswers > 0 && tally.trades > 0, "bots answer offers and trades happen on primary activations");
ok(tally.tagged > 0, "partner passes are tagged with the partner's name");

// 3. Classic three and four seat bots, unchanged. The table was measured on the parent commit dfd9eecd, before this
// change, with this same runner and the classic choices (chooseTradeAsk, shouldAcceptTrade); the paired choices must give
// the same action sequence, seed for seed.
const CLASSIC = [{"seats":3,"seed":0,"hash":"da6d708c24e59f4d","steps":277,"trades":1,"asks":9},{"seats":3,"seed":1,"hash":"16ec84131c492586","steps":276,"trades":1,"asks":10},{"seats":3,"seed":2,"hash":"cd84b9a3f41ebcf6","steps":247,"trades":8,"asks":14},{"seats":3,"seed":3,"hash":"a0649c43cd92e8c5","steps":195,"trades":0,"asks":3},{"seats":3,"seed":4,"hash":"5923d1d6618bcfa5","steps":402,"trades":0,"asks":4},{"seats":3,"seed":5,"hash":"e2818c86a48b962e","steps":251,"trades":0,"asks":8},{"seats":3,"seed":6,"hash":"bb489f34b5262357","steps":334,"trades":0,"asks":15},{"seats":3,"seed":7,"hash":"781e7f6d4fdc23f6","steps":261,"trades":0,"asks":8},{"seats":3,"seed":8,"hash":"6e14b9109fbb2ce4","steps":422,"trades":1,"asks":10},{"seats":3,"seed":9,"hash":"f7928f740c1d7aea","steps":154,"trades":0,"asks":8},{"seats":3,"seed":10,"hash":"73ca8233bc20545f","steps":246,"trades":0,"asks":13},{"seats":3,"seed":11,"hash":"92ae0174022d805a","steps":325,"trades":1,"asks":15},{"seats":3,"seed":12,"hash":"5bfc7b8bdd421a7f","steps":176,"trades":0,"asks":0},{"seats":3,"seed":13,"hash":"16ff130a4649b0de","steps":323,"trades":0,"asks":4},{"seats":3,"seed":14,"hash":"e078971b715c81be","steps":233,"trades":4,"asks":10},{"seats":3,"seed":15,"hash":"4f00db2b32e192b3","steps":207,"trades":1,"asks":6},{"seats":3,"seed":16,"hash":"71408909a32d6761","steps":273,"trades":2,"asks":7},{"seats":3,"seed":17,"hash":"a7a89999e9b7a5b6","steps":359,"trades":1,"asks":7},{"seats":3,"seed":18,"hash":"de37ddf9f6ebc168","steps":230,"trades":0,"asks":7},{"seats":3,"seed":19,"hash":"b4b48957797f2220","steps":301,"trades":0,"asks":8},{"seats":4,"seed":0,"hash":"85a009d75ba265b1","steps":238,"trades":0,"asks":3},{"seats":4,"seed":1,"hash":"9977f2ec719b4eb6","steps":485,"trades":8,"asks":26},{"seats":4,"seed":2,"hash":"dded58b8dd1094fe","steps":294,"trades":2,"asks":10},{"seats":4,"seed":3,"hash":"75881338da2c19ef","steps":179,"trades":0,"asks":7},{"seats":4,"seed":4,"hash":"c2e836f6d966abd8","steps":361,"trades":1,"asks":9},{"seats":4,"seed":5,"hash":"168d09de1707d87c","steps":371,"trades":3,"asks":13},{"seats":4,"seed":6,"hash":"0c44a491c20d97ee","steps":365,"trades":2,"asks":18},{"seats":4,"seed":7,"hash":"fe1d8c7f34e65ad9","steps":359,"trades":4,"asks":15},{"seats":4,"seed":8,"hash":"a70832c0c2838deb","steps":238,"trades":7,"asks":12},{"seats":4,"seed":9,"hash":"95c8aa5e4ba17a11","steps":179,"trades":1,"asks":8},{"seats":4,"seed":10,"hash":"e9748ce3a94c38a8","steps":394,"trades":0,"asks":12},{"seats":4,"seed":11,"hash":"52e9cc0307e1934d","steps":337,"trades":1,"asks":7},{"seats":4,"seed":12,"hash":"fe2b67f26d747018","steps":207,"trades":0,"asks":2},{"seats":4,"seed":13,"hash":"d264eb25d23bb433","steps":435,"trades":1,"asks":10},{"seats":4,"seed":14,"hash":"3ef38dbfa32c70a7","steps":358,"trades":3,"asks":15},{"seats":4,"seed":15,"hash":"eeddae66c00ba02e","steps":269,"trades":0,"asks":3},{"seats":4,"seed":16,"hash":"5c7356bb522e53b5","steps":421,"trades":2,"asks":12},{"seats":4,"seed":17,"hash":"fd9a1c476e5dcfaf","steps":475,"trades":4,"asks":19},{"seats":4,"seed":18,"hash":"1b6ace3e2d70c968","steps":298,"trades":0,"asks":9},{"seats":4,"seed":19,"hash":"627f6b3a61ccd814","steps":418,"trades":0,"asks":5}];
let classicActions = 0;
for (const want of CLASSIC) {
  const tag = `classic ${want.seats} seats, seed ${want.seed}`;
  const paired = play({ seats: want.seats, seed: want.seed, cap: 3000, policy: PAIRED });
  const raw = play({ seats: want.seats, seed: want.seed, cap: 3000, policy: RAW });
  const got = (r) => ({ seats: want.seats, seed: want.seed, hash: r.hash, steps: r.steps, trades: r.trades, asks: r.asks });
  eq(got(paired), want, `${tag}: the paired choices match the parent commit`);
  eq(got(raw), want, `${tag}: the classic choices match the parent commit`);
  eq([paired.g.phase, ["variant", "primary", "role", "activation"].filter((k) => k in paired.g)], ["over", []], `${tag}: a classic game, finished`);
  ok(want.steps >= 30, `${tag}: at least 30 actions`);
  classicActions += paired.steps;
}
crypto.getRandomValues = realRandom;

console.log(`expanded-bots-prove: ${allBot} all-bot and ${tally.games - allBot} mixed games at 5 and 6 seats all won within ${CAP} actions (longest ${tally.longest}, ${tally.actions} actions, ${tally.trades} trades); partner bot picks ${JSON.stringify(tally.partnerPicks)}, ${tally.blockedPasses} passes with nothing done; guards stopped ${tally.guardAsks} asks and ${tally.guardAccepts} Yeses; ${tally.humanRefused} human partner offers refused; ${CLASSIC.length} classic games match (${classicActions} actions); ${checks} checks passed`);
