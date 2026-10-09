// #555: a disconnected human seat uses only conservative recovery actions, survives hold expiry,
// declines offers, and returns to human control. Fixtures start from engine-generated valid boards.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { createGame } from "../src/lib/game/board.ts";
import { chooseBotAction, shouldAcceptTrade } from "../src/lib/game/ai.ts";
import { applyAction, legalRoads, playable } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-takeover-"));
let host;
const clients = [];
let stderr = "";
const starts = {};
process.on("exit", () => { host?.kill("SIGKILL"); for (const c of clients) c.ws.terminate(); rmSync(dir, { recursive: true, force: true }); });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));
const GRACE = 400;
const TURN = 30000;
const HOLD = 2800;
const fail = (message, extra) => { console.error("FAIL", message, extra ?? ""); process.exit(1); };

function engineReady(seed) {
  let g = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed });
  for (let i = 0; i < 40 && g.phase !== "roll"; i++) {
    const p = g.players.find((x) => x.id === g.current);
    const action = chooseBotAction(g, p.id);
    const result = applyAction(g, p.id, action);
    assert.ifError(result.error);
    g = result.state;
  }
  assert.equal(g.phase, "roll");
  return g;
}
function fixture(code, phase, { legacy = false, current = "p0", botP0 = false } = {}) {
  const g = engineReady(code.charCodeAt(0));
  const player = (id) => g.players.find((p) => p.id === id);
  starts[code] = { robberHex: g.robberHex, logLength: g.log.length, outpostsLeft: player("p0").outpostsLeft, pathsLeft: player("p0").pathsLeft };
  g.seq += 1;
  g.current = current;
  g.turn = 3;
  if (phase === "setupSettle") g.phase = phase;
  else if (phase === "roll" || phase === "discard" || phase === "robber" || phase === "main") g.phase = phase;
  if (phase === "discard") {
    g.discardNeeded = { p0: 4 };
    player("p0").resources = { timber: 2, clay: 2, wool: 2, grain: 2, ore: 2 };
  }
  if (phase === "main" || phase === "robber") {
    player("p0").resources = { timber: 8, clay: 8, wool: 8, grain: 8, ore: 8 };
    player("p0").hidden.plenty = 1;
    player("p0").boughtThisTurn.plenty = 0;
    g.dice = [3, 4];
    if (phase === "robber") {
      player("p1").resources = { timber: 1, clay: 1, wool: 1, grain: 1, ore: 1 };
      g.phase = "robber";
    }
  }
  if (phase === "main" && current === "p1") {
    player("p1").resources = { timber: 4, clay: 4, wool: 4, grain: 4, ore: 4 };
    g.current = "p0";
    let useful = null;
    for (let code = 0; code < 3 ** RESOURCES.length && !useful; code++) {
      let value = code;
      const hand = {};
      for (const resource of RESOURCES) { hand[resource] = value % 3; value = Math.floor(value / 3); }
      player("p0").resources = hand;
      for (const receive of RESOURCES) for (const pay of RESOURCES) {
        if (hand[pay] < 1) continue;
        const offer = { from: "p1", give: { [receive]: 1 }, want: { [pay]: 1 } };
        if (shouldAcceptTrade(g, "p0", offer)) { useful = offer; break; }
      }
    }
    assert(useful, "legacy bot fixture has an incoming offer its normal policy would accept");
    starts.TA06.usefulOffer = useful;
    g.current = "p1";
  }
  if (botP0) {
    player("p0").kind = "bot";
    player("p0").name = "Ember (bot)";
  }
  // The main fixture must expose a legal build option as well as a playable fortune.
  if (phase === "main") {
    assert(legalRoads(g, "p0").length > 0);
    assert(playable(player("p0"), "plenty") > 0);
  }
  const seats = g.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `${code}-${p.id}` }));
  const saved = { code, host: "s1", next: 3, chat: [], chatSeq: 0, game: g, seats, shape: 2, savedAt: Date.now() };
  if (!legacy) saved.recoveryPids = [];
  writeFileSync(path.join(dir, `${code}.json`), JSON.stringify(saved));
}
fixture("TA01", "setupSettle");
fixture("TA02", "main");
fixture("TA03", "roll");
fixture("TA04", "discard");
fixture("TA05", "robber");
fixture("TA06", "main", { current: "p1", legacy: true, botP0: true });
fixture("TA07", "main");

function startHost() {
  return new Promise((resolve, reject) => {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR: dir, GRACE_MS: String(GRACE), TURN_MS: String(TURN), HOLD_MS: String(HOLD), ACT_CAP: "1000", ACT_RATE: "1000", BOT_ANSWER_MS: "100" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
  host.stderr.on("data", (d) => { stderr += d; });
  host.on("exit", (c) => reject(new Error(`host exited ${c}: ${stderr}`)));
  });
}
let port = await startHost();

async function client(code, pid) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, code, pid, state: null, inbox: [], wake: null };
  ws.on("message", (raw) => { const m = JSON.parse(String(raw)); if (m.type === "state") c.state = m; c.inbox.push(m); c.wake?.(); });
  c.send = (m) => ws.send(JSON.stringify({ ...c.state?.actionStamp, cid: randomUUID(), ...m }));
  c.next = async (type, predicate = () => true, ms = 5000) => {
    const end = Date.now() + ms;
    for (;;) {
      const ix = c.inbox.findIndex((m) => m.type === type && predicate(m));
      if (ix >= 0) return c.inbox.splice(ix, 1)[0];
      if (Date.now() >= end) fail(`${code}/${pid} timeout waiting ${type}`, { stderr, inbox: c.inbox.slice(-12) });
      await new Promise((r) => { c.wake = r; setTimeout(r, Math.max(1, end - Date.now())); });
      c.wake = null;
    }
  };
  c.rejoin = async () => { c.send({ type: "hello", code, secret: `${code}-${pid}` }); await c.next("welcome"); return c.next("state"); };
  await new Promise((r) => ws.once("open", r));
  clients.push(c);
  await c.rejoin();
  return c;
}

const rooms = {};
for (const code of ["TA01", "TA02", "TA03", "TA04", "TA05", "TA06", "TA07"]) {
  rooms[code] = code === "TA06"
    ? [null, await client(code, "p1"), await client(code, "p2")]
    : [await client(code, "p0"), await client(code, "p1"), await client(code, "p2")];
}
const connectedTurn = rooms.TA07[0].state;
assert.equal(connectedTurn.turnPlayer, "p0");
assert(connectedTurn.turnDeadline > connectedTurn.serverNow + TURN / 2);
console.log(`connected turn: waited-on human received the configured ${TURN} ms deadline`);
// An ask opened while still human must be withdrawn at the grace boundary, and a late accept must be harmless.
const ownOfferRoom = rooms.TA07;
const offerHand = ownOfferRoom[0].state.game.players.find((p) => p.id === "p0").resources;
ownOfferRoom[0].send({ type: "tradeAsk", give: { timber: 1 }, want: { clay: 1 } });
const oldOffer = await ownOfferRoom[1].next("tradeOffer");
// Drop every p0, leaving two live seats so the real host runs each recovery after its configured grace.
for (const code of Object.keys(rooms)) {
  const p0 = rooms[code][0];
  if (!p0 || code === "TA07") continue;
  await new Promise((r) => { p0.ws.once("close", r); p0.ws.close(); });
}
await new Promise((r) => { ownOfferRoom[0].ws.once("close", r); ownOfferRoom[0].ws.close(); });
await ownOfferRoom[1].next("tradeClosed", (m) => m.tradeId === oldOffer.tradeId, 2500);
const ownOfferPassed = await ownOfferRoom[1].next("state", (m) => m.game.seq > 1 && m.game.current !== "p0", 2500);
ownOfferRoom[1].send({ type: "tradeAnswer", tradeId: oldOffer.tradeId, yes: true });
const gone = await ownOfferRoom[1].next("error", (m) => m.message === "Offer is gone.", 1000);
assert.equal(gone.message, "Offer is gone.");

await rooms.TA01[1].next("log", (m) => m.text === "Ember is played by the bot until they return.", 2000);
const setup = await rooms.TA01[1].next("state", (m) => m.game.seq > 1 && m.game.current !== "p0", 3000);
assert.equal(setup.game.players.find((p) => p.id === "p0").kind, "bot");
assert.equal(setup.game.players.find((p) => p.id === "p0").outpostsLeft, starts.TA01.outpostsLeft - 1);
assert.equal(setup.game.players.find((p) => p.id === "p0").pathsLeft, starts.TA01.pathsLeft - 1);
assert(setup.game.log.slice(starts.TA01.logLength).some((line) => line === "Ember (bot) raises an outpost."));
assert(setup.game.log.slice(starts.TA01.logLength).some((line) => line === "Ember (bot) lays a path."));
console.log(`setup: after GRACE_MS=${GRACE}, recovery completed the forced free outpost and path`);

const main = await rooms.TA02[1].next("state", (m) => m.game.seq > 1 && m.game.current !== "p0", 3000);
const mainP = main.game.players.find((p) => p.id === "p0");
assert.equal(main.game.phase, "roll");
assert.equal(mainP.goods, 40);
assert.equal(mainP.fortunes, 1);
await new Promise((r) => setTimeout(r, 350));
const mainSaved = JSON.parse(readFileSync(path.join(dir, "TA02.json"), "utf8")).game.players.find((p) => p.id === "p0");
assert.deepEqual(mainSaved.resources, { timber: 8, clay: 8, wool: 8, grain: 8, ore: 8 });
assert.equal(mainSaved.hidden.plenty, 1);
assert.equal(mainSaved.boughtThisTurn.plenty, 0);
assert(!rooms.TA02[1].inbox.some((m) => m.type === "tradeOffer" && m.from === "p0"));
console.log("main: recovery passed with build materials and a playable fortune untouched");

const ownPassed = ownOfferPassed;
assert.equal(ownPassed.game.players.find((p) => p.id === "p0").goods, Object.values(offerHand).reduce((sum, n) => sum + n, 0));
assert.notEqual(ownPassed.game.current, "p0");
await new Promise((r) => setTimeout(r, 350));
assert.deepEqual(JSON.parse(readFileSync(path.join(dir, "TA07.json"), "utf8")).game.players.find((p) => p.id === "p0").resources, offerHand);
console.log("own offer: takeover withdrew the old ask, rejected a late Yes, and passed without waiting for its timeout");

// Bring p0 back while still held and check that the same player is human again.
const returning = await client("TA02", "p0");
assert.equal(returning.state.game.players.find((p) => p.id === "p0").kind, "human");
console.log("rejoin: the covered seat returned to human control");

const roll = await rooms.TA03[1].next("state", (m) => m.game.seq > 1 && m.game.current !== "p0", 3000);
assert(roll.game.log.slice(starts.TA03.logLength).some((line) => line.includes("Ember (bot) rolls")));
console.log("roll: recovery rolled and advanced the engine phase");

const discard = await rooms.TA04[1].next("state", (m) => m.game.seq > 1 && m.game.current !== "p0" && m.game.discardNeeded.p0 === undefined, 3000);
assert(discard.game.log.slice(starts.TA04.logLength).some((line) => line.includes("Ember (bot) discards 4.")));
console.log("discard: recovery paid the mandatory half-hand discard");

const robber = await rooms.TA05[1].next("state", (m) => m.game.seq > 1 && m.game.current !== "p0", 3000);
assert.notEqual(robber.game.robberHex, starts.TA05.robberHex);
assert.equal(robber.game.phase, "roll");
console.log("wayfarer: recovery moved the robber and resolved the forced phase");

// TA06 omitted recoveryPids. Loading inferred the legacy takeover from the bot linked to its held seat.
await rooms.TA06[1].next("state", (m) => m.game.seq > 1 && m.game.current !== "p0", 3000);
const persisted = JSON.parse(readFileSync(path.join(dir, "TA06.json"), "utf8"));
assert(persisted.recoveryPids.includes("p0"));
console.log("persistence: legacy bot-seat identity was inferred and saved in the room snapshot");

// The legacy recovery bot at p0 receives p1's helpful offer and must decline it.
const offerRoom = rooms.TA06[1];
const beforeP0Goods = offerRoom.state.game.players.find((p) => p.id === "p0").goods;
const beforeP1 = offerRoom.state.game.players.find((p) => p.id === "p1").resources;
const helpful = starts.TA06.usefulOffer;
assert(shouldAcceptTrade(JSON.parse(readFileSync(path.join(dir, "TA06.json"), "utf8")).game, "p0", helpful));
offerRoom.send({ type: "tradeAsk", give: helpful.give, want: helpful.want });
const usefulOffer = await offerRoom.next("tradeOffer", (m) => m.from === "p1", 1000);
await offerRoom.next("tradeDeclined", (m) => m.by === "p0" && m.tradeId === usefulOffer.tradeId, 2000);
assert.equal(offerRoom.state.game.players.find((p) => p.id === "p0").goods, beforeP0Goods);
assert.deepEqual(offerRoom.state.game.players.find((p) => p.id === "p1").resources, beforeP1);
console.log("trade: a helpful offer to a legacy recovery bot was declined with no goods transferred");

const defaults = readFileSync(new URL("./host.mjs", import.meta.url), "utf8");
assert(defaults.includes("process.env.GRACE_MS ?? 90 * 1000"));
assert(defaults.includes("process.env.TURN_MS ?? 120 * 1000"));
assert(defaults.includes("process.env.HOLD_MS ?? 10 * 60 * 1000"));
console.log(`timers: grace ${GRACE} ms, connected turn ${TURN} ms, hold ${HOLD} ms exercised; source defaults remain 90 s / 120 s / 10 min`);
await new Promise((r) => setTimeout(r, HOLD + 200));
const expired = JSON.parse(readFileSync(path.join(dir, "TA06.json"), "utf8"));
assert(!expired.seats.some((s) => s.pid === "p0"));
assert(expired.recoveryPids.includes("p0"));
console.log("hold expiry: the seat was removed while its recovery identity remained persisted");

// A process restart must keep the detached pid marked as recovery after its seat has expired.
host.kill("SIGKILL");
await new Promise((resolve) => host.once("exit", resolve));
expired.game.phase = "main";
expired.game.current = "p0";
expired.game.seq += 1;
const detached = expired.game.players.find((p) => p.id === "p0");
detached.resources = { timber: 8, clay: 8, wool: 8, grain: 8, ore: 8 };
detached.hidden.plenty = 1;
detached.boughtThisTurn.plenty = 0;
expired.savedAt = Date.now();
writeFileSync(path.join(dir, "TA06.json"), JSON.stringify(expired));
stderr = "";
port = await startHost();
const afterRestart = await client("TA06", "p1");
assert.notEqual(afterRestart.state.game.current, "p0");
assert.equal(afterRestart.state.game.phase, "roll");
assert.equal(afterRestart.state.game.players.find((p) => p.id === "p0").goods, 40);
assert.equal(afterRestart.state.game.players.find((p) => p.id === "p0").fortunes, 1);
console.log("restart: the expired seat's persisted recovery identity passed without spending resources or its fortune");
console.log("takeover prove ok");
for (const c of clients) c.ws.terminate();
host.kill("SIGKILL");
