import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, legalSettle, legalRoads, stealTargets } from "../src/lib/game/rules.ts";
import { RESOURCES, RESOURCE_LABEL } from "../src/lib/game/types.ts";

function cardsOf(p) {
  return RESOURCES.reduce((n, r) => n + p.resources[r], 0);
}

function game() {
  const g = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 3 });
  for (const v of g.vertices) v.harbor = null;
  return g;
}

// The pre-setup roll-off (docs/design/first-player.md): roll as `current` until setup starts.
function rollOff(g) {
  while (g.phase === "rollOff") {
    const next = applyAction(g, g.current, { type: "roll" });
    if (next.error) throw new Error(next.error);
    g = next.state;
  }
  return g;
}

let g = game();
g.phase = "main";
g.current = "p0";
g.players[0].resources.wool = 4;
g.bank.ore = 5;
let next = applyAction(g, "p0", { type: "bankTrade", give: "wool", want: "ore" });
if (next.error) throw new Error(next.error);
g = next.state;
if (g.players[0].resources.wool !== 0 || g.players[0].resources.ore !== 1 || g.bank.ore !== 4) {
  console.log("FAIL bank", g.players[0].resources, g.bank.ore);
  process.exit(1);
}
console.log("4 wool became 1 ore, bank ore", g.bank.ore);

g.players[0].resources.wool = 3;
const short = applyAction(g, "p0", { type: "bankTrade", give: "wool", want: "ore" });
if (!short.error || short.state.players[0].resources.wool !== 3) {
  console.log("FAIL 3 wool", short.error, short.state.players[0].resources.wool);
  process.exit(1);
}
console.log("3 wool at 4:1:", short.error);

g = game();
for (const h of g.hexes) h.pip = null;
g.players[0].resources.timber = 8;
g.phase = "roll";
g.current = "p0";
for (let i = 0; i < 80; i++) {
  g.phase = "roll";
  const rolled = applyAction(g, "p0", { type: "roll" });
  g = rolled.state;
  if (g.dice[0] + g.dice[1] === 7) break;
}
if (g.discardNeeded.p0 !== 4) {
  console.log("FAIL discard need", g.discardNeeded, g.dice);
  process.exit(1);
}
const bad = applyAction(g, "p0", { type: "discard", resources: { timber: 3 } });
if (!bad.error || bad.state.players[0].resources.timber !== 8) {
  console.log("FAIL discard 3", bad.error);
  process.exit(1);
}
console.log("discard 3 rejected, hand", bad.state.players[0].resources.timber);
const ok = applyAction(g, "p0", { type: "discard", resources: { timber: 4 } });
if (ok.error || ok.state.players[0].resources.timber !== 4) {
  console.log("FAIL discard 4", ok.error, ok.state.players[0].resources);
  process.exit(1);
}
console.log("discard 4 accepted, hand", ok.state.players[0].resources.timber);

g = game();
const hex = g.hexes.find((h) => h.terrain !== "waste");
const verts = g.vertices.filter((v) => v.hexes.includes(hex.id)).slice(0, 2);
verts[0].building = { playerId: "p0", kind: "outpost" };
verts[1].building = { playerId: "p1", kind: "outpost" };
g.players[1].resources.ore = 1;
g.phase = "robber";
g.current = "p0";
g.robberHex = "none";
const stolen = applyAction(g, "p0", { type: "moveRobber", hexId: hex.id, stealFrom: "p1" });
if (stolen.error) throw new Error(stolen.error);
const ore0 = stolen.state.players[0].resources.ore;
const ore1 = stolen.state.players[1].resources.ore;
if (ore0 !== 1 || ore1 !== 0) {
  console.log("FAIL steal", ore0, ore1);
  process.exit(1);
}
console.log("one ore moved", ore0, ore1);

// #92: a hex with two opponents on it must let the robber pick which one to rob, not just the first.
g = game();
const hex2 = g.hexes.find((h) => h.terrain !== "waste");
const [va, vb] = g.vertices.filter((v) => v.hexes.includes(hex2.id));
va.building = { playerId: "p1", kind: "outpost" };
vb.building = { playerId: "p2", kind: "outpost" };
g.players[1].resources.ore = 1;
g.players[2].resources.wool = 2;
g.phase = "robber";
g.current = "p0";
g.robberHex = "none";

const targets = stealTargets(g, hex2.id, "p0");
if (targets.length !== 2 || !targets.includes("p1") || !targets.includes("p2")) {
  console.log("FAIL expected both opponents as steal targets", targets);
  process.exit(1);
}
const [first, second] = targets;
const before = {
  first: cardsOf(g.players.find((p) => p.id === first)),
  second: cardsOf(g.players.find((p) => p.id === second)),
};
const picked = applyAction(g, "p0", { type: "moveRobber", hexId: hex2.id, stealFrom: second });
if (picked.error) {
  console.log("FAIL steal from second target", picked.error);
  process.exit(1);
}
const after = {
  first: cardsOf(picked.state.players.find((p) => p.id === first)),
  second: cardsOf(picked.state.players.find((p) => p.id === second)),
};
if (after.second !== before.second - 1 || after.first !== before.first) {
  console.log("FAIL second target's cards did not drop by exactly 1", { before, after });
  process.exit(1);
}
console.log(
  `two opponents on one hex (${targets.join(", ")}); stole from the second (${second}): ${before.second} -> ${after.second}, first (${first}) untouched at ${after.first}`,
);

let setup = rollOff(game());
const spot = legalSettle(setup, setup.current, true)[0];
setup = applyAction(setup, setup.current, { type: "setupSettle", vertexId: spot }).state;
const road = legalRoads(setup, setup.current, true)[0];
if (!road) throw new Error("no setup road");
console.log("legal settle and road exist", spot, road);

// #1920: a bank or dock trade in multiples. `count` trades at one rate in one action, with one log line.
const label = (r) => RESOURCE_LABEL[r].toLowerCase();
function trader({ harbor = null, grain, bankWool = 10 }) {
  const t = game();
  t.phase = "main";
  t.current = "p0";
  t.rollSums = [];
  if (harbor) Object.assign(t.vertices[0], { harbor, building: { playerId: "p0", kind: "outpost" } });
  t.players[0].resources.grain = grain;
  t.bank.wool = bankWool;
  return t;
}
for (const [where, harbor, rate] of [["a 3:1 dock", "any", 3], ["the 4:1 bank", null, 4], ["a matching 2:1 dock", "grain", 2]]) {
  const t = trader({ harbor, grain: rate * 2 });
  const r = applyAction(t, "p0", { type: "bankTrade", give: "grain", want: "wool", count: 2 });
  assert.equal(r.error, undefined, `${where}: ${r.error}`);
  const me = r.state.players[0];
  assert.deepEqual([me.resources.grain, me.resources.wool], [0, t.players[0].resources.wool + 2], `${where}: hand`);
  assert.deepEqual([r.state.bank.grain, r.state.bank.wool], [t.bank.grain + rate * 2, 8], `${where}: bank`);
  assert.equal(me.tally.bankTrades, 2, `${where}: two trades in the tally`);
  const line = `Ember traded ${rate * 2} ${label("grain")} to ${rate < 4 ? "a dock" : "the bank"} for 2 ${label("wool")}.`;
  assert.deepEqual(r.state.log.slice(t.log.length), [line], `${where}: one log line`);
  console.log(`${rate * 2} grain for 2 wool at ${where}: ${line}`);
}
for (const [why, t] of [["short by one card", trader({ grain: 7 })], ["the bank holds 1 wool", trader({ grain: 8, bankWool: 1 })]]) {
  const r = applyAction(t, "p0", { type: "bankTrade", give: "grain", want: "wool", count: 2 });
  assert.ok(r.error, `${why}: refused`);
  assert.equal(r.state, t, `${why}: state unchanged`);
  console.log(`count 2 refused, ${why}: ${r.error}`);
}
{
  const t = trader({ grain: 8 });
  const r = applyAction(t, "p0", { type: "bankTrade", give: "grain", want: "wool" });
  assert.deepEqual([r.state.players[0].resources.grain, r.state.bank.wool, r.state.players[0].tally.bankTrades], [4, 9, 1], "no count trades once");
  assert.deepEqual(r.state.log.slice(t.log.length), [`Ember traded 4 ${label("grain")} to the bank for 1 ${label("wool")}.`]);
  console.log("no count: 8 grain at 4:1 trades once, 4 left");
}

// The host refuses a count that is not a whole number of 1 or more before the rules run, and carries a good one.
const directory = mkdtempSync(path.join(tmpdir(), "emberisle-trade-"));
let host;
process.on("exit", () => {
  host?.kill();
  rmSync(directory, { recursive: true, force: true });
});
{
  const t = trader({ grain: 12 });
  t.rollOff = null;
  const seats = t.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `fixture-${p.id}` }));
  writeFileSync(path.join(directory, "BANK.json"), JSON.stringify({ code: "BANK", host: "s0", next: 3, chat: [], chatSeq: 0, game: t, seats, shape: 2, savedAt: Date.now(), wayfarerMode: "off" }));
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR: directory, PROFILES_DIR: path.join(directory, "profiles"), TURN_MS: "600000", GRACE_MS: "600000", HOLD_MS: "600000" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  let out = "";
  for await (const data of host.stdout) if ((out += data).match(/listening (\d+)/)) break;
  const ws = new WebSocket(`ws://127.0.0.1:${out.match(/listening (\d+)/)[1]}`);
  const inbox = [];
  let wake = () => {};
  ws.on("message", (raw) => {
    inbox.push(JSON.parse(String(raw)));
    wake();
  });
  const next = async (type) => {
    for (;;) {
      const i = inbox.findIndex((m) => m.type === type);
      if (i >= 0) return inbox.splice(i, 1)[0];
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error(`timeout waiting for ${type}`)), 5000);
        wake = () => (clearTimeout(timer), resolve());
      });
    }
  };
  await once(ws, "open");
  ws.send(JSON.stringify({ type: "hello", code: "BANK", secret: "fixture-p0" }));
  let state = await next("state");
  const send = (count) => ws.send(JSON.stringify({ type: "tradeBank", give: "grain", take: "wool", ...(count === undefined ? {} : { count }), ...state.actionStamp, cid: randomUUID() }));
  const hand = () => [state.game.players[0].resources.grain, state.game.players[0].resources.wool];
  for (const count of [0, -1, 1.5, "2"]) {
    send(count);
    assert.equal((await next("error")).message, "not ready", `count ${JSON.stringify(count)} refused`);
    assert.ok(!inbox.some((m) => m.type === "state"), `count ${JSON.stringify(count)}: no new state`);
    console.log(`host refuses count ${JSON.stringify(count)}`);
  }
  send(2);
  state = await next("state");
  assert.deepEqual([state.game.seq, ...hand()], [t.seq + 1, 4, 2], "the refusals left the state unchanged; the host carries count 2");
  send(undefined);
  state = await next("state");
  assert.deepEqual(hand(), [0, 3], "host without count trades once");
  console.log("host trades count 2 (12 grain -> 4, 2 wool), then once with no count (0 grain, 3 wool)");
  ws.terminate();
  host.kill();
}
