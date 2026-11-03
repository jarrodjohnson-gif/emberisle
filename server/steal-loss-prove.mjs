// #550 (counting half): the goods a seat loses to successful wayfarer steals are counted per seat, stay private while the
// game is played, and ride with the final state at the win (server/host.mjs revealLoss). Declined or impossible steals add nothing.
// Part 1 runs the rules in process. Part 2 plays a hosted game over real sockets, with a watcher:
//   - steals from three seats (one of them twice), then the game is won by the last steal
//   - the seat views (the stealer's own and everyone else's) and the watcher's carry no total before the win; the room file does
//   - a host restart (kill -9) and a seat's drop and rejoin keep the count; so does a restart after the win
//   - the final state shows the exact total of every seat, 0 included, to every seat and to the watcher
//   - a rematch starts from nothing
// Run: node --import ./server/register.mjs server/steal-loss-prove.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { AXIAL_DIRS } from "../src/lib/game/hex.ts";
import { applyAction, legalRoads, stealTargets } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";
import { connectTable } from "../src/lib/net/table.ts";

const PIDS = ["p0", "p1", "p2", "p3"];
const NAMES = ["Ember", "Tide", "Pine", "Dune"];
const HANDS = [
  { timber: 1, clay: 1, wool: 1 },
  { timber: 1, clay: 1, wool: 1, grain: 1, ore: 1 },
  { timber: 2, wool: 1 },
  {},
];
const START_HANDS = [3, 5, 3, 0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failTimer = setTimeout(() => {
  console.log("FAIL the proof ran past 120 s");
  process.exit(1);
}, 120_000);
failTimer.unref();

// A table of four on a cleared board: no building but the ones placed here, and no hex pays on a roll, so the only
// goods that move are the ones a steal moves. Seven lands, each beside no other, so a land has exactly the neighbours given:
//   A: Dune (no goods)        B: Tide and Pine      C: Ember       D: Tide and Dune (no goods)      F: Tide and Pine
//   N1, N2: nobody (where a rolled 7 sends the wayfarer, so it steals nothing)
// Ember is to act in `main` with a wayfarer card. Dune stands on five points (two outposts, three point fortunes) with two
// wayfarers played: his third takes the largest army (2 more points) and so wins the game of 7 on his steal, not before it.
function seedGame() {
  let g = createGame({ humans: NAMES.map((name) => ({ name })), bots: 0, seed: 550, victoryTarget: 7 });
  while (g.phase !== "roll") {
    const result = applyAction(g, g.current, chooseBotAction(g, g.current));
    assert.ifError(result.error);
    g = result.state;
  }
  g.players.sort((a, b) => a.id.localeCompare(b.id));
  for (const v of g.vertices) v.building = null;
  for (const e of g.edges) e.path = null;
  for (const h of g.hexes) h.pip = null;
  g.longestRoad = null;
  g.largestArmy = null;
  g.current = "p0";
  g.phase = "main";
  g.dice = null;
  g.playedCard = false;
  g.discardNeeded = {};
  g.trade = null;
  g.players.forEach((p, i) => {
    p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0, ...HANDS[i] };
    p.hidden = { knight: 1, road: 0, plenty: 0, monopoly: 0, vp: i === 3 ? 3 : 0 };
    p.boughtThisTurn = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
    p.knightsPlayed = i === 3 ? 2 : 0;
  });
  const next = (a, b) => AXIAL_DIRS.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
  const classes = [0, 1, 2].map((k) => g.hexes.filter((h) => (((h.q - h.r) % 3) + 3) % 3 === k));
  const seven = classes.find((c) => c.length >= 7);
  assert(seven, "seven lands in one colour of the board");
  const picked = seven.slice(0, 7);
  // The start of the wayfarer is never a land a steal is played on.
  picked.sort((a, b) => Number(a.id === g.robberHex) - Number(b.id === g.robberHex));
  for (const a of picked) for (const b of picked) assert(a === b || !next(a, b), "the seven lands share no corner");
  const [A, B, C, D, F, N1, N2] = picked.map((h) => h.id);
  const used = new Set();
  const put = (hexId, pid) => {
    const v = g.vertices.find((x) => x.hexes.includes(hexId) && !used.has(x.id));
    assert(v, `a free corner on ${hexId}`);
    used.add(v.id);
    v.building = { playerId: pid, kind: "outpost" };
  };
  put(A, "p3");
  put(B, "p1"); put(B, "p2");
  put(C, "p0");
  put(D, "p1"); put(D, "p3");
  put(F, "p1"); put(F, "p2");
  const near = (hexId, by) => stealTargets(g, hexId, by).sort();
  assert.deepEqual(near(A, "p0"), [], "A: Dune holds nothing to take");
  assert.deepEqual(near(B, "p0"), ["p1", "p2"]);
  assert.deepEqual(near(C, "p1"), ["p0"]);
  assert.deepEqual(near(D, "p2"), ["p1"], "D: Dune holds nothing to take");
  assert.deepEqual(near(F, "p3"), ["p1", "p2"]);
  for (const n of [N1, N2]) for (const pid of PIDS) assert.deepEqual(near(n, pid), [], `${n} has no neighbour`);
  assert.notEqual(g.robberHex, A);
  return { g, H: { A, B, C, D, F, N1, N2 } };
}

const lost = (s) => s.players.map((p) => p.goodsLost ?? 0);
const hand = (s, pid) => RESOURCES.reduce((n, r) => n + s.players.find((p) => p.id === pid).resources[r], 0);
const hands = (s) => PIDS.map((pid) => hand(s, pid));
const knight = (hexId, stealFrom) => ({ type: "playKnight", hexId, stealFrom });

// ---- Part 1: the rules -------------------------------------------------------------------------------------------------
const { g: base, H } = seedGame();
const fresh = () => structuredClone(base);
// #982: spending, discarding, exchanging and Monopoly all remove goods without a wayfarer steal.
// Keep nonzero counters too: these actions must neither increment nor reset anyone's earlier losses.
{
  const counts = [2, 4, 0, 1];
  const counted = () => {
    const g = fresh();
    g.players.forEach((p, i) => { p.goodsLost = counts[i]; });
    return g;
  };
  const act = (g, actor, action, expectedHands, why) => {
    const before = structuredClone(g);
    const result = applyAction(g, actor, action);
    assert.ifError(result.error);
    assert.notEqual(result.state, g, `${why}: a real action succeeds`);
    assert.deepEqual(hands(result.state), expectedHands, `${why}: actual inventory movement`);
    assert.deepEqual(lost(result.state), counts, `${why}: only wayfarer steals count`);
    assert.deepEqual(g, before, `${why}: the input state is untouched`);
    return result.state;
  };
  const bag = (values) => ({ timber: 0, clay: 0, wool: 0, grain: 0, ore: 0, ...values });

  const discard = counted();
  discard.phase = "discard";
  discard.discardNeeded = { p1: 4 };
  discard.players[1].resources = bag({ timber: 8 });
  const discarded = act(discard, "p1", { type: "discard", resources: { timber: 4 } }, [3, 4, 3, 0], "discard");
  assert.equal(discarded.bank.timber, discard.bank.timber + 4, "discarded cards reach the bank");

  const bank = counted();
  for (const v of bank.vertices) v.building = null; // No owned docks: the ordinary 4:1 rate.
  bank.players[0].resources = bag({ timber: 4 });
  const exchanged = act(bank, "p0", { type: "bankTrade", give: "timber", want: "grain" }, [1, 5, 3, 0], "bank trade");
  assert.deepEqual(exchanged.players[0].resources, bag({ grain: 1 }), "four timber buys one grain");

  const road = counted();
  road.players[0].resources = bag({ timber: 1, clay: 1 });
  const edgeId = legalRoads(road, "p0", false)[0];
  assert.ok(edgeId, "fixture has a legal path");
  const built = act(road, "p0", { type: "buildPath", edgeId }, [0, 5, 3, 0], "path spending");
  assert.equal(built.edges.find((e) => e.id === edgeId).path, "p0", "the paid-for path is placed");

  const upgrade = counted();
  upgrade.players[0].resources = bag({ grain: 3, ore: 2 });
  const vertexId = upgrade.vertices.find((v) => v.building?.playerId === "p0").id;
  const upgraded = act(upgrade, "p0", { type: "buildStronghold", vertexId }, [0, 5, 3, 0], "stronghold spending");
  assert.equal(upgraded.vertices.find((v) => v.id === vertexId).building.kind, "stronghold");

  const fortune = counted();
  fortune.players[0].resources = bag({ wool: 1, grain: 1, ore: 1 });
  const bought = act(fortune, "p0", { type: "buyCard" }, [0, 5, 3, 0], "fortune spending");
  assert.equal(bought.deck.length, fortune.deck.length - 1, "a fortune is actually bought");

  const trade = counted();
  const offered = act(trade, "p0", { type: "offerTrade", to: "p1", give: { timber: 1 }, want: { ore: 1 } }, START_HANDS, "player offer");
  const accepted = act(offered, "p1", { type: "respondTrade", accept: true }, START_HANDS, "player exchange");
  assert.equal(accepted.players[0].resources.timber, 0);
  assert.equal(accepted.players[0].resources.ore, 1);
  assert.equal(accepted.players[1].resources.timber, 2);
  assert.equal(accepted.players[1].resources.ore, 0, "both sides' named goods actually move");
  assert.equal(accepted.trade, null, "the accepted offer closes");

  const monopoly = counted();
  monopoly.players[0].hidden.monopoly = 1;
  const taken = act(monopoly, "p0", { type: "playMonopoly", resource: "timber" }, [6, 4, 1, 0], "Monopoly");
  assert.deepEqual(taken.players.map((p) => p.resources.timber), [4, 0, 0, 0], "Monopoly takes timber from both opponents without recording wayfarer losses");
  console.log("exclusions: discard, bank/player exchange, path/stronghold/fortune spending and Monopoly preserve earlier per-seat steal counts; inputs stay immutable");
}
{
  assert.deepEqual(hands(base), START_HANDS);
  assert.deepEqual(lost(base), [0, 0, 0, 0]);

  // Impossible steals are refused, whole: nothing moves and nothing is counted.
  const g = fresh();
  for (const [hexId, stealFrom, why] of [
    [H.A, "p3", "a seat with no goods"],
    [H.C, "p2", "a seat not beside the land"],
    [H.B, "p0", "yourself"],
    [g.robberHex, "p1", "the land the wayfarer stands on"],
  ]) {
    const r = applyAction(g, "p0", knight(hexId, stealFrom));
    assert(r.error, `${why}: refused`);
    assert.equal(r.state, g, `${why}: the state is the one before`);
    assert.deepEqual(lost(r.state), [0, 0, 0, 0], why);
  }
  assert.equal(applyAction(g, "p0", knight(H.A, "p3")).error, "Cannot steal from them.");
  const moved = fresh();
  moved.phase = "robber";
  moved.current = "p1";
  const refused = applyAction(moved, "p1", { type: "moveRobber", hexId: H.D, stealFrom: "p3" });
  assert.equal(refused.error, "Cannot steal from them.");
  assert.deepEqual(lost(refused.state), [0, 0, 0, 0]);

  // Declined: two seats to choose from and no choice made, or no seat to take from. The card is played and nothing is counted.
  for (const [hexId, why] of [[H.B, "two to choose from, none chosen"], [H.A, "the only seat beside holds nothing"], [H.N1, "nobody beside"]]) {
    const r = applyAction(g, "p0", knight(hexId, null));
    assert.ifError(r.error);
    assert.equal(r.state.players[0].knightsPlayed, 1, `${why}: the card was played`);
    assert.deepEqual(lost(r.state), [0, 0, 0, 0], why);
    assert.deepEqual(hands(r.state), START_HANDS, `${why}: no goods moved`);
  }

  // The wayfarer off: no land, no target, nothing counted.
  const off = fresh();
  off.wayfarerMode = "off";
  const muster = applyAction(off, "p0", knight("", null));
  assert.ifError(muster.error);
  assert.deepEqual(lost(muster.state), [0, 0, 0, 0]);

  // A successful steal counts one good against the seat it came from, and nothing against the thief; the input state is untouched.
  const hit = applyAction(g, "p0", knight(H.B, "p1"));
  assert.ifError(hit.error);
  assert.deepEqual(lost(hit.state), [0, 1, 0, 0]);
  assert.deepEqual(hands(hit.state), [4, 4, 3, 0]);
  assert.deepEqual(lost(g), [0, 0, 0, 0]);

  // The only seat beside, no pick needed: the steal still counts.
  const auto = fresh();
  auto.current = "p1";
  const took = applyAction(auto, "p1", knight(H.C, null));
  assert.ifError(took.error);
  assert.deepEqual(lost(took.state), [1, 0, 0, 0]);

  // A rolled 7 moves the wayfarer with moveRobber: the same count.
  const seven = fresh();
  seven.phase = "robber";
  seven.current = "p1";
  const robbed = applyAction(seven, "p1", { type: "moveRobber", hexId: H.C, stealFrom: "p0" });
  assert.ifError(robbed.error);
  assert.deepEqual(lost(robbed.state), [1, 0, 0, 0]);
  const empty = applyAction(seven, "p1", { type: "moveRobber", hexId: H.N1, stealFrom: null });
  assert.ifError(empty.error);
  assert.deepEqual(lost(empty.state), [0, 0, 0, 0]);

  // Totals add up across seats and turns, and the winning steal is counted before the game is over.
  let s = fresh();
  s = applyAction(s, "p0", knight(H.C, null)).state; // nobody beside C but Ember herself: no target
  assert.deepEqual(lost(s), [0, 0, 0, 0]);
  s = fresh();
  s.current = "p1";
  s = applyAction(s, "p1", knight(H.C, "p0")).state;
  s.current = "p2";
  s.phase = "main";
  s.playedCard = false;
  s = applyAction(s, "p2", knight(H.D, null)).state;
  s.current = "p3";
  s.phase = "main";
  s.playedCard = false;
  s = applyAction(s, "p3", knight(H.F, "p1")).state;
  assert.equal(s.phase, "over");
  assert.equal(s.winner, "p3");
  assert.equal(s.winReason.trigger, "largestArmy");
  assert.deepEqual(lost(s), [1, 2, 0, 0]);
  assert.equal(applyAction(s, "p3", knight(H.B, "p1")).error, "The game is over.");
  console.log("rules: impossible and declined steals count 0, successful ones count 1 against the victim, the winning steal is in the final count [1,2,0,0]");
}

// ---- Part 2: a hosted game ---------------------------------------------------------------------------------------------
const CODE = "STLS";
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-steal-loss-"));
let host;
process.on("exit", () => {
  host?.kill("SIGKILL");
  try {
    rmSync(ROOMS_DIR, { recursive: true, force: true });
  } catch {
    /* a temp folder Windows still holds is not the proof's failure */
  }
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  host?.kill("SIGKILL");
  process.exit(1);
}
const ROOM_SHAPE = Number(readFileSync(new URL("./host.mjs", import.meta.url), "utf8").match(/const ROOM_SHAPE = (\d+)/)?.[1]);
assert(Number.isInteger(ROOM_SHAPE), "host.mjs names its ROOM_SHAPE");

// The table is a saved room, the way restart-prove seeds one: the host loads it and every seat rejoins with its secret.
function seedRoom() {
  const g = fresh();
  const seats = g.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `${CODE}-${p.id}` }));
  const room = { code: CODE, host: "s0", next: 4, chat: [], chatSeq: 0, game: g, victoryTarget: 7, wayfarerMode: "on", seats, shape: ROOM_SHAPE, savedAt: Date.now() };
  writeFileSync(path.join(ROOMS_DIR, `${CODE}.json`), JSON.stringify(room), "utf8");
}
const readRoom = () => {
  try {
    return JSON.parse(readFileSync(path.join(ROOMS_DIR, `${CODE}.json`), "utf8"));
  } catch {
    return null;
  }
};

let port;
async function startHost() {
  let stderr = "";
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results`, ACT_CAP: "1000", ACT_RATE: "1000", GRACE_MS: "600000", HOLD_MS: "600000", TURN_MS: "600000", SAVE_MS: "50" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  host.stderr.on("data", (d) => {
    stderr += d;
  });
  port = await new Promise((resolve, reject) => {
    host.stdout.on("data", (d) => {
      const m = String(d).match(/listening (\d+)/);
      if (m) resolve(Number(m[1]));
    });
    host.on("exit", (c) => reject(new Error(`host exited ${c}: ${stderr}`)));
  });
}
async function kill9() {
  const h = host;
  h.removeAllListeners("exit");
  h.kill("SIGKILL");
  await new Promise((r) => h.once("exit", r));
}

async function until(cond, what, ms = 8000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) fail(`timed out: ${what}`);
    await sleep(15);
  }
}

// Every client keeps the raw text of each frame it was sent, so the leak check reads what the host really put on the wire.
const everyone = [];
function client(who) {
  const c = { who, frames: [], state: null, legal: null, you: null, errors: [], t: null };
  class Tap extends WebSocket {
    constructor(u) {
      super(u);
      this.on("message", (raw) => c.frames.push(String(raw)));
    }
  }
  c.t = connectTable(`ws://127.0.0.1:${port}`, {
    state: (m) => {
      c.state = m.game;
      c.legal = m.legal;
      c.you = m.you;
    },
    error: (e) => c.errors.push(e),
  }, Tap);
  everyone.push(c);
  return c;
}
async function sit(pid) {
  const c = client(pid);
  c.t.rejoin(CODE, `${CODE}-${pid}`);
  await until(() => c.state, `${pid} sits down`);
  return c;
}
async function watcher() {
  const c = client("watcher");
  c.t.watch(CODE);
  await until(() => c.state, "the watcher's state");
  return c;
}
async function everybodyIn() {
  const seats = [];
  for (const pid of PIDS) seats.push(await sit(pid));
  return { seats, w: await watcher() };
}
const group = (seats, w) => [...seats, w];
async function sync(all, seq) {
  await until(() => all.every((x) => x.state.seq >= seq), `every view reaches seq ${seq}`);
}
async function act(c, action) {
  const seq = c.state.seq;
  const errs = c.errors.length;
  assert(c.t.act(action), `${c.who} could send ${action.type}`);
  await until(() => c.state.seq > seq || c.errors.length > errs, `${action.type} by ${c.who} at seq ${seq}`);
  return c.errors.length > errs ? c.errors.at(-1) : null;
}
// What the viewer can tell of a seat's hand: its own cards, or the count the host sends of everyone else's.
const seen = (c, pid) => {
  const p = c.state.players.find((x) => x.id === pid);
  return p.resources ? RESOURCES.reduce((n, r) => n + p.resources[r], 0) : p.goods;
};
const seenAll = (c) => PIDS.map((pid) => seen(c, pid));
const totals = (c) => c.state.players.map((p) => p.goodsLost);

const KEY = /lost|loss|stolen|robbed/i;
function badKeys(v, at = "game", out = []) {
  if (Array.isArray(v)) v.forEach((x, i) => badKeys(x, `${at}[${i}]`, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (KEY.test(k)) out.push(`${at}.${k}`);
      badKeys(x, `${at}.${k}`, out);
    }
  }
  return out;
}
// Before the win no frame to anyone may mention a steal loss; only the states of a finished game may.
function audit() {
  let before = 0;
  let after = 0;
  for (const c of everyone) {
    for (const raw of c.frames) {
      const m = JSON.parse(raw);
      if (m.type === "state" && m.game?.phase === "over") {
        after++;
        continue;
      }
      if (m.type === "state") before++;
      assert(!raw.includes("goodsLost"), `${c.who}: a ${m.type} frame carries goodsLost before the win`);
      assert.deepEqual(badKeys(m.game ?? {}), [], `${c.who}: a ${m.type} frame carries a loss total before the win`);
    }
  }
  return { before, after };
}
async function waitSaved(seq) {
  const end = Date.now() + 8000;
  while (readRoom()?.game?.seq !== seq) {
    if (Date.now() > end) fail(`the room file never reached seq ${seq}`, readRoom()?.game?.seq);
    await sleep(25);
  }
  return readRoom();
}
async function turnOver(c, all) {
  assert.equal(await act(c, { type: "endTurn" }), null, `${c.who} passes`);
  await sync(all, c.state.seq);
}
let sevens = 0;
async function rollTurn(c, all) {
  assert.equal(c.state.phase, "roll");
  assert.equal(c.state.current, c.you);
  assert.equal(await act(c, { type: "roll" }), null, `${c.who} rolls`);
  await sync(all, c.state.seq);
  if (c.state.phase === "robber") {
    // A 7. Nobody holds more than seven goods, so nobody discards; the wayfarer goes to land nobody built beside, stealing nothing.
    sevens++;
    const hexId = [H.N1, H.N2].find((x) => x !== c.state.robberHex);
    assert.equal(await act(c, { type: "moveRobber", hexId, stealFrom: null }), null, `${c.who} moves the wayfarer clear`);
    await sync(all, c.state.seq);
  }
  assert.equal(c.state.phase, "main", `${c.who} is in main after the roll`);
}
const closeAll = (all) => all.forEach((c) => c.t.close());

try {
  seedRoom();
  await startHost();
  let { seats, w } = await everybodyIn();
  let all = group(seats, w);
  const [p0] = seats;
  assert.equal(p0.state.phase, "main");
  assert.equal(p0.state.current, "p0");
  assert(p0.legal.actions.includes("play:knight"), "Ember may play her wayfarer card");
  assert.deepEqual(seenAll(p0), START_HANDS);
  assert.deepEqual(seenAll(w), START_HANDS);

  // Turn 1, Ember: impossible steals are refused and change nothing; a declined one plays the card and moves no goods.
  const seq0 = p0.state.seq;
  assert.equal(await act(p0, knight(H.A, "p3")), "Cannot steal from them.", "Dune holds nothing to take");
  assert.equal(await act(p0, knight(H.C, "p2")), "Cannot steal from them.", "Pine is not beside that land");
  assert.equal(p0.state.seq, seq0, "refused steals leave the state alone");
  assert.equal(await act(p0, knight(H.B, null)), null, "two to choose from, none chosen: the card is played");
  await sync(all, p0.state.seq);
  assert.equal(p0.state.players[0].knightsPlayed, 1);
  assert.deepEqual(seenAll(p0), START_HANDS, "a declined steal moves no goods");
  assert.deepEqual(seenAll(w), START_HANDS);
  await turnOver(p0, all);

  // Turn 2, Tide: a steal from Ember.
  const p1 = seats[1];
  await rollTurn(p1, all);
  assert.equal(await act(p1, knight(H.C, "p0")), null, "Tide takes a good from Ember");
  await sync(all, p1.state.seq);
  assert.deepEqual(seenAll(seats[2]), [2, 6, 3, 0]);
  assert.deepEqual(seenAll(w), [2, 6, 3, 0]);
  await turnOver(p1, all);

  // The host writes the count down (the room file is the unprojected game) and every view, so far, has kept it back.
  const room = await waitSaved(p1.state.seq);
  assert.deepEqual(room.game.players.map((p) => p.goodsLost ?? 0), [1, 0, 0, 0], "the room file holds Ember's one lost good");
  const mid = audit();
  assert(mid.before >= 20 && mid.after === 0, `views audited before the restart: ${JSON.stringify(mid)}`);

  // The host dies without a word and comes back; the seats and the watcher sit down again.
  closeAll(all);
  await kill9();
  await sleep(300);
  await startHost();
  ({ seats, w } = await everybodyIn());
  all = group(seats, w);
  assert.equal(seats[0].state.current, "p2");
  assert.deepEqual(seenAll(seats[0]), [2, 6, 3, 0], "the goods came back with the table");

  // Turn 3, Pine: Tide drops and sits back down first (a rejoin on the same host); then Pine takes a good from Tide, the only seat to take from.
  seats[1].t.close();
  await sleep(300);
  seats[1] = await sit("p1");
  all = group(seats, w);
  assert.deepEqual(seenAll(seats[1]), [2, 6, 3, 0]);
  const p2 = seats[2];
  await rollTurn(p2, all);
  assert.equal(await act(p2, knight(H.D, null)), null, "Pine takes the one good there is to take, with no pick");
  await sync(all, p2.state.seq);
  assert.deepEqual(seenAll(seats[3]), [2, 5, 4, 0]);
  await turnOver(p2, all);

  // Turn 4, Dune: he steals from Tide again; the steal brings the largest army and the win.
  const p3 = seats[3];
  await rollTurn(p3, all);
  assert.equal(await act(p3, knight(H.F, "p1")), null, "Dune takes a good from Tide");
  await until(() => all.every((x) => x.state.phase === "over"), "every view reaches the win");

  // The final state: every seat and the watcher read the exact total of every seat, the zeros too.
  const want = [1, 2, 0, 0];
  for (const c of all) {
    assert.deepEqual(totals(c), want, `${c.who} reads the totals at the win`);
    assert.equal(c.state.winner, "p3");
    assert.equal(c.state.winReason?.trigger, "largestArmy");
  }
  assert(!("seed" in w.state) && !("rng" in w.state), "the watcher still gets neither seed nor rng");
  const done = audit();
  assert(done.before >= 40 && done.after >= 5, `views audited through the win: ${JSON.stringify(done)}`);
  console.log(`hosted game: ${done.before} frames before the win carry no loss total, ${done.after} after it carry [1,2,0,0] (${sevens} rolled 7s sent the wayfarer clear)`);

  // Saved with the finished game, and the same after a restart.
  const saved = await waitSaved(p3.state.seq);
  // The saved game keeps what was counted (a seat never robbed has no field); the reveal reads that as 0.
  assert.deepEqual(saved.game.players.map((p) => p.goodsLost ?? 0), want);
  assert.deepEqual(saved.game.players.map((p) => "goodsLost" in p), [true, true, false, false]);
  closeAll(all);
  await kill9();
  await sleep(300);
  await startHost();
  ({ seats, w } = await everybodyIn());
  all = group(seats, w);
  for (const c of all) {
    assert.equal(c.state.phase, "over");
    assert.deepEqual(totals(c), want, `${c.who} reads the totals after the restart`);
  }
  console.log("restart after the win: seats and watcher read [1,2,0,0] from the saved game");

  // A rematch is a new island: no total comes with it.
  seats[0].t.again();
  await until(() => seats[0].state.phase !== "over", "the rematch starts");
  await until(() => all.every((x) => x.state.phase !== "over" && x.state.players.length === 4), "every view moves to the new game");
  for (const c of all) {
    assert.deepEqual(badKeys(c.state), [], `${c.who}: the new game starts with no loss total`);
    assert.equal(c.state.players.some((p) => "goodsLost" in p), false);
  }
  audit();
  console.log("steal-loss prove ok");
  closeAll(all);
  clearTimeout(failTimer);
  process.exit(0);
} catch (e) {
  fail(e.message, e.stack?.split("\n").slice(1, 4).join("\n"));
}
