// The offline practice store annotates the real actions selected and applied by runBots (#556).
import assert from "node:assert/strict";
import { createGame } from "../src/lib/game/board.ts";
import { chooseBotAction, logBotAction } from "../src/lib/game/ai.ts";
import { applyAction, bankShort, legalRoads, publicVP, stealTargets } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";
import { useGame } from "../src/lib/game/store.ts";

function setup(seed) {
  let game = createGame({ humans: [], bots: 3, seed });
  game.phase = "setupSettle";
  game.rollOff = null;
  while (game.phase === "setupSettle" || game.phase === "setupRoad") {
    const action = chooseBotAction(game, game.current);
    const next = applyAction(game, game.current, action);
    assert.ifError(next.error);
    game = next.state;
  }
  return game;
}

function hostPractice(game) {
  useGame.getState().goTitle();
  useGame.getState().startAi();
  useGame.setState({ state: game, mode: "ai", gameLog: [] });
  useGame.getState().runBots();
  return useGame.getState();
}

function balance(game) {
  for (const r of RESOURCES) game.bank[r] = 19 - game.players.reduce((n, p) => n + p.resources[r], 0);
}

// A controlled production roll uses the same real store path, and bankShort still finds the shortage directly after it.
{
  const game = setup(8);
  game.phase = "roll";
  game.current = "p0";
  const bot = game.players.find((p) => p.id === "p0");
  const vertex = game.vertices.find((v) => v.building?.playerId === "p0");
  const hex = game.hexes.find((h) => vertex.hexes.includes(h.id));
  assert(vertex && hex);
  const second = game.vertices.find((v) => v.id !== vertex.id && v.hexes.includes(hex.id));
  assert(second);
  second.building = { playerId: "p1", kind: "outpost" };
  for (const h of game.hexes) {
    h.pip = h.id === hex.id ? 8 : 2;
    h.terrain = h.id === hex.id ? "ore" : h.terrain;
    h.blocked = false;
  }
  const unblocked = game.hexes.find((h) => h.id !== hex.id);
  game.robberHex = unblocked.id;
  unblocked.blocked = true;
  game.bank.ore = 0;
  const originalCrypto = globalThis.crypto;
  const dice = [3, 3]; // Each die is 1 + value mod 6, so this is 4 + 4 = 8.
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { getRandomValues(buffer) { buffer[0] = dice.shift(); return buffer; } },
  });
  const state = hostPractice(game);
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
  const rollLine = state.state.log.find((line) => /^Bot rolled for .+: 4\+4 = 8\.$/.test(line));
  assert(rollLine);
  assert.equal(state.state.log.filter((line) => line === rollLine).length, 1);
  assert.deepEqual(bankShort(state.state), ["ore"]);
  const i = state.state.log.indexOf(rollLine);
  assert.match(state.state.log[i + 1], /^The bank is short of ore;/);
  console.log("practice roll: the bot marker remains parseable and bank shortage stays adjacent");
}

// A legal path build runs through store.runBots -> dispatch, and is represented once in both logs.
{
  const game = setup(4);
  game.phase = "main";
  game.current = "p0";
  const bot = game.players.find((p) => p.id === "p0");
  const botName = bot.name.replace(/ \(bot\)$/i, "");
  bot.resources = { timber: 1, clay: 1, wool: 0, grain: 0, ore: 0 };
  balance(game);
  assert.equal(chooseBotAction(game, "p0").type, "buildPath");
  const beforePaths = bot.pathsLeft;
  const state = hostPractice(game);
  const line = `Bot built a path for ${botName}.`;
  assert.equal(state.state.log.filter((entry) => entry === line).length, 1);
  assert.equal(state.gameLog.filter((entry) => entry.text === line).length, 1);
  assert.equal(state.state.players.find((p) => p.id === "p0").pathsLeft, beforePaths - 1);
  assert.equal(state.state.players.find((p) => p.id === "p0").resources.timber, 0);
  assert.equal(state.state.players.find((p) => p.id === "p0").resources.clay, 0);
  assert(!state.state.log.some((entry) => entry === `${bot.name} builds a path.`));
  console.log("practice build: runBots applies and logs one attributed path build");
}

// A bot's bank trade is also logged by the shared helper without losing the public exchange details.
{
  const game = setup(12);
  game.phase = "main";
  game.current = "p0";
  const bot = game.players.find((p) => p.id === "p0");
  const botName = bot.name.replace(/ \(bot\)$/i, "");
  bot.resources = { timber: 5, clay: 0, wool: 1, grain: 1, ore: 0 };
  balance(game);
  const action = chooseBotAction(game, "p0");
  assert.equal(action.type, "bankTrade");
  assert.equal(action.give, "timber");
  const beforeWanted = bot.resources[action.want];
  const state = hostPractice(game);
  const line = `Bot traded with the bank for ${botName}: 4 timber for 1 ${action.want}.`;
  assert.equal(state.state.log.filter((entry) => entry === line).length, 1);
  assert.equal(state.gameLog.filter((entry) => entry.text === line).length, 1);
  assert.equal(state.state.players.find((p) => p.id === "p0").resources.timber, 1);
  assert.equal(state.state.players.find((p) => p.id === "p0").resources[action.want], beforeWanted + 1);
  assert(!state.state.log.some((entry) => entry.includes(` trades 4 timber for ${action.want}.`)));
  console.log("practice bank trade: action log keeps the public give and receive amounts");
}

// Search deterministic setup fixtures for a public leader victim, then exercise the actual practice store.
let leaderFixture = null;
let neutralFixture = null;
for (let seed = 1; seed < 80 && (!leaderFixture || !neutralFixture); seed++) {
  const game = setup(seed);
  game.phase = "main";
  game.current = "p0";
  game.playedCard = false;
  game.players.forEach((p) => {
    p.resources = { timber: p.id === "p0" ? 0 : 2, clay: 0, wool: 0, grain: 0, ore: 0 };
    p.hidden.knight = p.id === "p0" ? 1 : 0;
    p.boughtThisTurn.knight = 0;
  });
  balance(game);
  const action = chooseBotAction(game, "p0");
  if (action.type !== "playKnight" || !action.stealFrom) continue;
  const top = Math.max(...game.players.map((p) => publicVP(game, p.id)));
  const selectedIsLeader = publicVP(game, action.stealFrom) === top;
  if (selectedIsLeader && !leaderFixture) leaderFixture = structuredClone(game);
  if (!neutralFixture) {
    // Put the acting bot clearly above every possible victim, then derive the actual target again.
    const neutral = structuredClone(game);
    for (const v of neutral.vertices) if (v.building?.playerId === "p0") v.building.kind = "stronghold";
    const neutralAction = chooseBotAction(neutral, "p0");
    if (neutralAction.type === "playKnight" && neutralAction.stealFrom && publicVP(neutral, neutralAction.stealFrom) < Math.max(...neutral.players.map((p) => publicVP(neutral, p.id)))) neutralFixture = neutral;
  }
}
assert(leaderFixture, "fixture with selected public leader victim");
assert(neutralFixture, "fixture where a selected victim is not the public leader");

for (const [game, expectsLeader] of [[leaderFixture, true], [neutralFixture, false]]) {
  const actor = game.players.find((p) => p.id === "p0");
  const actorName = actor.name.replace(/ \(bot\)$/i, "");
  const action = chooseBotAction(game, "p0");
  assert.equal(action.type, "playKnight");
  const victim = game.players.find((p) => p.id === action.stealFrom);
  const beforeVictimGoods = Object.values(victim.resources).reduce((sum, n) => sum + n, 0);
  const beforeActorGoods = Object.values(actor.resources).reduce((sum, n) => sum + n, 0);
  const state = hostPractice(game);
  const lines = state.state.log.filter((entry) => entry.startsWith(`Bot played Wayfarer for ${actorName};`));
  assert.equal(lines.length, 1);
  assert(lines[0].includes(`stole one card from ${victim.name}`));
  assert.equal(lines[0].includes("public leader"), expectsLeader);
  assert(!lines[0].match(/\b(timber|clay|wool|grain|ore)\b/i));
  assert(!lines[0].match(/\b(point|VP|fortune card)\b/i));
  assert(!state.state.log.some((entry) => entry.includes("steals a card from") || entry.includes("sends the wayfarer")));
  assert.equal(state.gameLog.filter((entry) => entry.text === lines[0]).length, 1);
  assert.equal(state.state.players.find((p) => p.id === "p0").hidden.knight, 0);
  assert.equal(Object.values(state.state.players.find((p) => p.id === victim.id).resources).reduce((sum, n) => sum + n, 0), beforeVictimGoods - 1);
  assert.equal(Object.values(state.state.players.find((p) => p.id === "p0").resources).reduce((sum, n) => sum + n, 0), beforeActorGoods + 1);
}
console.log("practice Wayfarer: public leader rationale matches the selected victim; neutral case stays neutral and both log one public line");

// A hidden VP card cannot change the bot's action or the public rationale line.
{
  const ordinary = structuredClone(leaderFixture);
  const privatePoints = structuredClone(leaderFixture);
  const targetId = chooseBotAction(ordinary, "p0").stealFrom;
  privatePoints.players.find((p) => p.id === "p0").hidden.vp = 9;
  privatePoints.players.find((p) => p.id === targetId).hidden.vp = 0;
  const first = chooseBotAction(ordinary, "p0");
  const second = chooseBotAction(privatePoints, "p0");
  assert.deepEqual(second, first);
  const a = applyAction(ordinary, "p0", first).state;
  const b = applyAction(privatePoints, "p0", second).state;
  const firstLine = a.log.find((entry) => entry.includes("sends the wayfarer"));
  const secondLine = b.log.find((entry) => entry.includes("sends the wayfarer"));
  const logA = logBotAction(ordinary, a, first, "p0", "Tide").log;
  const logB = logBotAction(privatePoints, b, second, "p0", "Tide").log;
  assert(firstLine && secondLine);
  assert.equal(logA.find((line) => line.startsWith("Bot played Wayfarer")), logB.find((line) => line.startsWith("Bot played Wayfarer")));
}
{
  const game = setup(19);
  game.phase = "robber";
  game.current = "p0";
  for (const p of game.players) p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
  game.players.find((p) => p.id === "p1").resources.timber = 1;
  const hex = game.hexes.find((h) => h.id !== game.robberHex && JSON.stringify(stealTargets(game, h.id, "p0")) === '["p1"]');
  assert(hex, "fixture with exactly one actual victim");
  const action = { type: "moveRobber", hexId: hex.id, stealFrom: null };
  const next = applyAction(game, "p0", action);
  assert.ifError(next.error);
  const logged = logBotAction(game, next.state, action, "p0", "Ember");
  assert(logged.log.at(-1).includes("stole one card from"));
  assert(!logged.log.at(-1).includes("timber"));
  console.log("implicit victim: a null selected id is named only when the rules actually steal from the sole target");
}
{
  const game = structuredClone(neutralFixture);
  const action = chooseBotAction(game, "p0");
  const target = game.players.find((p) => p.id === action.stealFrom);
  const publicTop = Math.max(...game.players.map((p) => publicVP(game, p.id)));
  assert(publicVP(game, target.id) < publicTop);
  target.hidden.vp = 9; // The selected victim now leads on hidden total points only.
  const before = chooseBotAction(game, "p0");
  const state = hostPractice(game);
  assert.deepEqual(before, action);
  const line = state.state.log.find((entry) => entry.startsWith("Bot played Wayfarer for "));
  assert(line);
  assert(!line.includes("public leader"));
  console.log("hidden VP: raising the victim's unrevealed points does not create a public leader claim");
}
console.log("practice bot action log prove ok");
