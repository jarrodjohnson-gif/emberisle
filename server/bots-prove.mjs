// 200 all-bot games (issue #84): after every action the cards, the piece stock and the win still add up.
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, totalVP } from "../src/lib/game/rules.ts";
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
console.log("bots prove ok");
