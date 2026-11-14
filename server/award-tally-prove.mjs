// #1452 and #1453: the facts behind the results screen's island awards (each seat's `tally`) and dice strip (`rollSums`).
// Part 1 runs the rules in process:
//   - a roll adds 1 to its sum; the roll-off adds nothing; an older game part-way through starts no partial count
//   - goods from a roll add to `earned` exactly as the hands grew; a 7 adds nothing to it
//   - a discard of 4 adds 4; a steal adds 1 to the thief's `stole`; an accepted table trade adds 1 to both seats and a
//     declined one nothing; a bank or dock trade adds 1
// Part 2 plays the design packet's pictured game to its end on a real host, over real sockets, with a watcher:
//   - no frame to any seat (its own view included) or to the watcher carries `tally` before the win, and no other seat's
//     hand or hidden fortunes; the room file holds the counts; `rollSums` is public, like every roll in the log
//   - a host restart (kill -9) before the win keeps every count, and so does one after it
//   - at the win every seat and the watcher get every seat's `tally`, `goodsLost` and the game's `rollSums`
//   - a rematch starts from no counts at all
// Run: node --import ./server/register.mjs server/award-tally-prove.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";
import { connectTable } from "../src/lib/net/table.ts";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failTimer = setTimeout(() => {
  console.log("FAIL the proof ran past 120 s");
  process.exit(1);
}, 120_000);
failTimer.unref();
const ok = (r, why) => {
  assert.ifError(r.error, why);
  return r.state;
};
const seat = (g, id) => g.players.find((p) => p.id === id);
const bag = (v = {}) => ({ timber: 0, clay: 0, wool: 0, grain: 0, ore: 0, ...v });
const zero = () => ({ earned: bag(), discarded: 0, stole: 0, tableTrades: 0, bankTrades: 0 });
const tallyOf = (g, id) => seat(g, id).tally ?? zero();

// ---- Part 1: the rules -------------------------------------------------------------------------------------------------
const start = createGame({ humans: ["Ember", "Tide", "Pine", "Dune"].map((name) => ({ name })), bots: 0, seed: 1452 });
assert.equal(start.phase, "rollOff");
// The roll-off is not a dice roll of the game: it counts nothing.
{
  const g = ok(applyAction(start, start.rollOff.pending[0], { type: "roll" }), "a roll-off roll");
  assert.equal(g.rollSums, undefined, "the roll-off adds nothing to rollSums");
  assert.equal(g.players.some((p) => p.tally), false, "the roll-off counts no award fact");
}
let base = start;
while (base.phase !== "roll") base = ok(applyAction(base, base.current, chooseBotAction(base, base.current)), "setup");
assert.equal(base.rolls ?? 0, 0);
assert.equal(base.rollSums, undefined, "setup counts no roll");
// Setup's second outposts hand out goods, but not from a roll.
assert.equal(base.players.some((p) => p.tally), false, "setup goods are not goods from rolls");

{
  let seven = 0;
  let paid = 0;
  for (let i = 0; i < 400 && (seven < 3 || paid < 3); i++) {
    const before = structuredClone(base);
    const g = ok(applyAction(base, base.current, { type: "roll" }), "a roll");
    assert.deepEqual(base, before, "the input state is untouched");
    const sum = g.dice[0] + g.dice[1];
    const want = Array(11).fill(0);
    want[sum - 2] = 1;
    assert.deepEqual(g.rollSums, want, `the first roll of the game (${sum}) starts the count with 1 at its sum`);
    for (const p of g.players) {
      const grew = bag(Object.fromEntries(RESOURCES.map((r) => [r, p.resources[r] - seat(base, p.id).resources[r]])));
      assert.deepEqual(tallyOf(g, p.id).earned, sum === 7 ? bag() : grew, `${p.name}: goods from a ${sum} counted as the hand grew`);
    }
    if (sum === 7) seven++;
    else if (g.players.some((p) => p.tally)) paid++;
    // A second roll on the next turn adds to the same count.
    if (g.phase === "main") {
      const passed = ok(applyAction(g, g.current, { type: "endTurn" }), "end turn");
      const next = ok(applyAction(passed, passed.current, { type: "roll" }), "a second roll");
      const s2 = next.dice[0] + next.dice[1];
      const w2 = want.slice();
      w2[s2 - 2] += 1;
      assert.deepEqual(next.rollSums, w2, "a second roll adds 1 to its own sum");
      assert.equal(next.rolls, 2);
    }
  }
  assert(seven >= 3 && paid >= 3, `seen both kinds of roll: ${seven} sevens, ${paid} paying rolls`);
  // An older game part-way through (rolls counted, no rollSums) gets no partial count.
  const old = ok(applyAction({ ...structuredClone(base), rolls: 40 }, base.current, { type: "roll" }), "an older game's roll");
  assert.equal(old.rollSums, undefined, "an older game part-way through starts no count");
  assert.equal(old.rolls, 41);
  // #1452 (desk, 2026-11-12): nor any award count, so a game part-way through at deploy shows no false "Dry spell".
  assert.equal(old.players.some((p) => p.tally), false, "an older game part-way through starts no award counts");
  {
    const g = structuredClone(base);
    Object.assign(g, { phase: "discard", dice: [3, 4], rolls: 40, discardNeeded: { [g.players[1].id]: 4 } });
    g.players[1].resources = bag({ timber: 5, ore: 3 });
    const d = ok(applyAction(g, g.players[1].id, { type: "discard", resources: { timber: 3, ore: 1 } }), "an older game's discard");
    assert.equal(d.players.some((p) => p.tally), false, "an older game's discard counts nothing");
  }
  console.log(`rules: a roll adds 1 to its sum (${paid} paying rolls and ${seven} sevens checked), a 7 adds no goods from rolls, the roll-off and an older game count no sums`);
}

// The other counts, each from a state where only that action happens.
const main = (patch) => {
  const g = structuredClone(base);
  g.phase = "main";
  g.dice = [3, 4];
  g.rolls = 1;
  g.rollSums = [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
  patch?.(g);
  return g;
};
{
  const g = main((g) => {
    g.phase = "discard";
    g.discardNeeded = { [g.players[1].id]: 4 };
    g.players[1].resources = bag({ timber: 5, ore: 3 });
  });
  const pid = g.players[1].id;
  const d = ok(applyAction(g, pid, { type: "discard", resources: { timber: 3, ore: 1 } }), "discard");
  assert.equal(tallyOf(d, pid).discarded, 4, "a discard of 4 adds 4");
  assert.deepEqual(d.rollSums, g.rollSums, "a discard adds no roll");
  for (const p of d.players) if (p.id !== pid) assert.equal(p.tally, undefined, "nobody else counts the discard");
}
{
  // The wayfarer: the current seat moves it beside the next seat and takes one good.
  let found = null;
  const g = main((g) => {
    g.phase = "robber";
    g.players[1].resources = bag({ wool: 2 });
  });
  const me = g.current;
  const victim = g.players.find((p) => p.id !== me && g.vertices.some((v) => v.building?.playerId === p.id));
  victim.resources = bag({ wool: 2 });
  for (const h of g.hexes) {
    if (h.id === g.robberHex) continue;
    const near = g.vertices.filter((v) => v.hexes.includes(h.id) && v.building).map((v) => v.building.playerId);
    if (near.includes(victim.id) && !near.includes(me)) {
      found = h.id;
      break;
    }
  }
  assert(found, "a land beside the victim and not the thief");
  const s = ok(applyAction(g, me, { type: "moveRobber", hexId: found, stealFrom: victim.id }), "a steal");
  assert.equal(tallyOf(s, me).stole, 1, "a steal adds 1 to the thief");
  assert.equal(seat(s, victim.id).goodsLost, 1, "and 1 to the victim's goods lost, as before (#550)");
  assert.equal(seat(s, victim.id).tally, undefined, "the victim counts no award fact");
}
{
  const g = main((g) => {
    g.players.forEach((p) => (p.resources = bag({ timber: 2, clay: 2, wool: 4, grain: 2, ore: 2 })));
  });
  const [a, b] = [g.current, g.players.find((p) => p.id !== g.current).id];
  const offered = ok(applyAction(g, a, { type: "offerTrade", to: b, give: { wool: 1 }, want: { ore: 1 } }), "an offer");
  assert.equal(offered.players.some((p) => p.tally), false, "an offer alone counts nothing");
  const no = ok(applyAction(offered, b, { type: "respondTrade", accept: false }), "a declined trade");
  assert.equal(no.players.some((p) => p.tally), false, "a declined trade counts nothing");
  const yes = ok(applyAction(offered, b, { type: "respondTrade", accept: true }), "an accepted trade");
  assert.equal(tallyOf(yes, a).tableTrades, 1, "an accepted trade adds 1 to the asker");
  assert.equal(tallyOf(yes, b).tableTrades, 1, "and 1 to the answerer");
  assert.equal(yes.players.filter((p) => p.tally).length, 2, "and to nobody else");
  for (const v of g.vertices) v.harbor = null; // No docks: the ordinary 4:1 rate.
  const banked = ok(applyAction(g, a, { type: "bankTrade", give: "wool", want: "ore" }), "a bank trade");
  assert.equal(tallyOf(banked, a).bankTrades, 1, "a bank trade adds 1");
  assert.equal(tallyOf(banked, a).tableTrades, 0);
  console.log("rules: a discard of 4 adds 4, a steal adds 1 to the thief, an accepted trade 1 to both seats, a declined one nothing, a bank trade 1");
}

// ---- Part 2: the pictured game on a real host -----------------------------------------------------------------------------
const fixture = JSON.parse(readFileSync(new URL("../scripts/fixtures/results-story-game.json", import.meta.url), "utf8"));
const PIDS = fixture.before.players.map((p) => p.id);
const CODE = "AWRD";
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-award-tally-"));
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

function seedRoom() {
  const g = structuredClone(fixture.before);
  const seats = g.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `${CODE}-${p.id}` }));
  const room = { code: CODE, host: "s0", next: 4, chat: [], chatSeq: 0, game: g, victoryTarget: 10, wayfarerMode: "on", seats, shape: ROOM_SHAPE, savedAt: Date.now() };
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
  const c = { who, frames: [], state: null, you: null, errors: [], t: null };
  class Tap extends WebSocket {
    constructor(u) {
      super(u);
      this.on("message", (raw) => c.frames.push(String(raw)));
    }
  }
  c.t = connectTable(`ws://127.0.0.1:${port}`, {
    state: (m) => {
      c.state = m.game;
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
async function everybodyIn() {
  const seats = [];
  for (const pid of PIDS) seats.push(await sit(pid));
  const w = client("watcher");
  w.t.watch(CODE);
  await until(() => w.state, "the watcher's state");
  return [...seats, w];
}
async function act(c, action) {
  const seq = c.state.seq;
  const errs = c.errors.length;
  assert(c.t.act(action), `${c.who} could send ${action.type}`);
  await until(() => c.state.seq > seq || c.errors.length > errs, `${action.type} by ${c.who} at seq ${seq}`);
  return c.errors.length > errs ? c.errors.at(-1) : null;
}
async function waitSaved(seq) {
  const end = Date.now() + 8000;
  while (readRoom()?.game?.seq !== seq) {
    if (Date.now() > end) fail(`the room file never reached seq ${seq}`, readRoom()?.game?.seq);
    await sleep(25);
  }
  return readRoom();
}
const closeAll = (all) => all.forEach((c) => c.t.close());

// Before the win no frame to anyone carries an award count, and no seat sees another seat's hand or hidden fortunes.
const KEY = /tally|earned|discarded|stole|tableTrades|bankTrades|goodsLost/;
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
const audited = new Map();
function audit() {
  let before = 0;
  let after = 0;
  for (const c of everyone) {
    const from = audited.get(c) ?? 0;
    for (const raw of c.frames.slice(from)) {
      const m = JSON.parse(raw);
      if (m.type === "state" && m.game?.phase === "over") {
        after++;
        continue;
      }
      if (m.type !== "state") {
        assert(!/tally|goodsLost/.test(raw), `${c.who}: a ${m.type} frame carries an award count before the win`);
        continue;
      }
      before++;
      assert(!raw.includes('"tally"'), `${c.who}: a state frame carries tally before the win`);
      assert.deepEqual(badKeys(m.game), [], `${c.who}: a state frame carries an award count before the win`);
      for (const p of m.game.players) {
        if (p.id === m.you) continue;
        assert.equal(p.resources, undefined, `${c.who}: sees ${p.id}'s hand before the win`);
        assert.deepEqual(p.hidden, { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 }, `${c.who}: sees ${p.id}'s hidden fortunes before the win`);
      }
      assert.deepEqual(m.game.deck, [], `${c.who}: sees the fortune deck before the win`);
    }
    audited.set(c, c.frames.length);
  }
  return { before, after };
}

try {
  seedRoom();
  await startHost();
  let all = await everybodyIn();
  const p0 = () => all[0];
  assert.equal(p0().state.phase, "main");
  assert.equal(p0().state.current, "p0");
  // The roll count is public, like the rolls in the log: every view, the watcher's too, carries it while the game plays.
  for (const c of all) assert.deepEqual(c.state.rollSums, fixture.before.rollSums, `${c.who} reads the roll sums`);

  // A bank trade before the win: the host counts it in the room file and no view carries it.
  assert.equal(await act(p0(), { type: "bankTrade", give: "ore", want: "clay" }), null, "Jarrod trades with the bank");
  await until(() => all.every((c) => c.state.seq === p0().state.seq), "every view sees the trade");
  let room = await waitSaved(p0().state.seq);
  const banks = fixture.before.players.find((p) => p.id === "p0").tally.bankTrades;
  assert.equal(room.game.players[0].tally.bankTrades, banks + 1, "the room file holds the new bank trade");
  const mid = audit();
  assert(mid.before >= 10 && mid.after === 0, `views audited before the restart: ${JSON.stringify(mid)}`);

  // The host dies without a word and comes back; the counts come back with the table, still hidden.
  closeAll(all);
  await kill9();
  await sleep(300);
  await startHost();
  all = await everybodyIn();
  assert.equal(readRoom().game.players[0].tally.bankTrades, banks + 1, "the count survives a kill -9");
  audit();

  // The winning move: Jarrod's stronghold.
  assert.equal(await act(p0(), fixture.action), null, "Jarrod builds the winning stronghold");
  await until(() => all.every((c) => c.state.phase === "over"), "every view reaches the win");
  room = await waitSaved(p0().state.seq);
  const want = room.game.players.map((p) => ({ id: p.id, tally: p.tally, goodsLost: p.goodsLost ?? 0 }));
  assert.equal(want.filter((p) => p.tally).length, 4, "every seat has counts in the pictured game");
  for (const c of all) {
    assert.equal(c.state.winner, "p0");
    assert.deepEqual(c.state.players.map((p) => ({ id: p.id, tally: p.tally, goodsLost: p.goodsLost })), want, `${c.who} reads every seat's counts at the win`);
    assert.deepEqual(c.state.rollSums, fixture.before.rollSums, `${c.who} reads the roll sums at the win`);
  }
  assert(!("seed" in all[4].state) && !("rng" in all[4].state), "the watcher still gets neither seed nor rng");
  const done = audit();
  assert(done.after >= 5, `views audited through the win: ${JSON.stringify(done)}`);

  // A restart after the win: the final state comes back with every count.
  closeAll(all);
  await kill9();
  await sleep(300);
  await startHost();
  all = await everybodyIn();
  for (const c of all) {
    assert.equal(c.state.phase, "over");
    assert.deepEqual(c.state.players.map((p) => ({ id: p.id, tally: p.tally, goodsLost: p.goodsLost })), want, `${c.who} reads the counts after the restart`);
    assert.deepEqual(c.state.rollSums, fixture.before.rollSums);
  }
  console.log(`hosted game: ${audited.size} clients; frames before the win carry no award count and no other seat's hand or fortunes; at the win and after a restart every seat and the watcher read all four seats' counts`);

  // A rematch is a new island: no count comes with it.
  all[0].t.again();
  await until(() => all.every((c) => c.state.phase !== "over" && c.state.players.length === 4), "every view moves to the new game");
  for (const c of all) {
    assert.deepEqual(badKeys(c.state), [], `${c.who}: the new game starts with no award count`);
    assert.equal(c.state.rollSums, undefined, `${c.who}: the new game has rolled nothing`);
  }
  const fresh = await waitSaved(all[0].state.seq);
  assert.equal(fresh.game.players.some((p) => p.tally), false, "the room file's new game has no counts");
  assert.equal(fresh.game.rollSums, undefined);
  audit();
  console.log("rematch: a new game with no counts");
  console.log("award-tally prove ok");
  closeAll(all);
  clearTimeout(failTimer);
  process.exit(0);
} catch (e) {
  fail(e.message, e.stack?.split("\n").slice(1, 4).join("\n"));
}
