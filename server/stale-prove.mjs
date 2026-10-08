// G1: raw wire replays against the real host, independent of the client's queue-clearing behavior.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";
import { toIntent } from "../src/lib/net/table.ts";

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-stale-"));
const clients = [];
let host;
let stderr = "";
process.on("exit", () => { host?.kill(); rmSync(dir, { recursive: true, force: true }); });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));

function fixture(code, phase) {
  let g = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 11 });
  while (g.phase !== "roll") {
    const result = applyAction(g, g.current, chooseBotAction(g, g.current));
    assert.ifError(result.error);
    g = result.state;
  }
  g.current = "p0";
  g.phase = phase;
  g.turn = phase === "over" ? 0 : 7;
  g.seq = phase === "over" ? 0 : 50;
  if (phase === "over") g.winner = "p0";
  for (const p of g.players) {
    p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
    if (p.id === "p0" && phase === "main") p.resources = { timber: 8, clay: 2, wool: 0, grain: 2, ore: 0 };
    if (phase === "discard") p.resources[p.id === "p0" ? "ore" : "timber"] = 8;
    if (code === "SGFF" && p.id !== "p0") p.resources.clay = 2;
  }
  if (phase === "discard") {
    g.dice = [3, 4];
    g.discardNeeded = { p0: 4, p1: 4, p2: 4 };
  }
  for (const r of RESOURCES) g.bank[r] = 19 - g.players.reduce((n, p) => n + p.resources[r], 0);
  g.players.sort((a, b) => a.id.localeCompare(b.id));
  const seats = g.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `${code}-${p.id}` }));
  const saved = { code, host: seats.find((s) => s.pid === "p0").id, next: 3, chat: [], chatSeq: 0, game: g, seats, shape: 2, savedAt: Date.now() };
  writeFileSync(path.join(dir, `${code}.json`), JSON.stringify(saved));
}
fixture("SGAA", "main");
fixture("SGBB", "roll");
fixture("SGCC", "over");
fixture("SGDD", "main");
fixture("SGEE", "discard");
fixture("SGFF", "main");
async function startHost(requestedPort = 0) {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: String(requestedPort), ROOMS_DIR: dir, ACT_CAP: "1000", ACT_RATE: "1000", GRACE_MS: "1000", HOLD_MS: "60000", TURN_MS: "60000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  stderr = "";
  host.stderr.on("data", (d) => { stderr += d; });
  return new Promise((resolve, reject) => {
    host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
    host.on("exit", (c) => reject(new Error(`host exited ${c}: ${stderr}`)));
  });
}
let port = await startHost();

async function client(code, pid) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, state: null, inbox: [], changed: null };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") c.state = msg;
    c.inbox.push(msg);
    c.changed?.();
  });
  c.next = async (type, predicate = () => true) => {
    const until = Date.now() + 5000;
    for (;;) {
      const i = c.inbox.findIndex((m) => (type === "*" || m.type === type) && predicate(m));
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timed out: ${code}/${pid} ${type}: ${stderr}`)), Math.max(1, until - Date.now()));
        c.changed = () => { clearTimeout(t); c.changed = null; resolve(); };
      });
    }
  };
  c.raw = (msg) => ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
  c.intent = (msg) => ({ ...msg, ...c.state.actionStamp, cid: randomUUID() });
  c.drop = async () => {
    const done = new Promise((resolve) => ws.once("close", resolve));
    ws.close();
    await done;
  };
  clients.push(c);
  await new Promise((resolve) => ws.once("open", resolve));
  c.raw({ type: "hello", code, secret: `${code}-${pid}` });
  await c.next("welcome");
  await c.next("state");
  return c;
}

async function lobbyClient(hello) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, state: null, inbox: [], changed: null };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") c.state = msg;
    c.inbox.push(msg);
    c.changed?.();
  });
  c.next = async (type, predicate = () => true) => {
    const until = Date.now() + 5000;
    for (;;) {
      const i = c.inbox.findIndex((m) => (type === "*" || m.type === type) && predicate(m));
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timed out: lobby ${type}: ${stderr}`)), Math.max(1, until - Date.now()));
        c.changed = () => { clearTimeout(t); c.changed = null; resolve(); };
      });
    }
  };
  c.raw = (msg) => ws.send(JSON.stringify(msg));
  c.drop = async () => {
    const done = new Promise((resolve) => ws.once("close", resolve));
    ws.close();
    await done;
  };
  clients.push(c);
  await new Promise((resolve) => ws.once("open", resolve));
  c.raw(hello);
  return c;
}

async function refused(c, msg, label, code = "SGAA") {
  c.inbox.length = 0;
  const before = c.state;
  const saved = readFileSync(path.join(dir, `${code}.json`), "utf8");
  c.raw(msg);
  assert.equal((await c.next("error")).message, "The table has updated. Please try again.", label);
  const after = await c.next("state");
  assert.deepEqual(after.game, before.game, `${label}: no game/hand/turn mutation`);
  assert.equal(after.turnDeadline, before.turnDeadline, `${label}: no clock rearm`);
  assert.equal(readFileSync(path.join(dir, `${code}.json`), "utf8"), saved, `${label}: no disk write`);
  assert(!c.inbox.some((m) => ["rolled", "tradeOffer", "tradeClosed", "tradeDeclined"].includes(m.type)), `${label}: no action broadcast`);
  console.log(`ok ${label}: calm refusal, private resync, unchanged game/deadline/save`);
}

try {
  // #563: both non-current seats submit from the same snapshot after a seven.
  const currentDiscard = await client("SGEE", "p0");
  let d1 = await client("SGEE", "p1");
  let d2 = await client("SGEE", "p2");
  const discard1 = d1.intent({ type: "discard", resources: { timber: 4 } });
  const discard2 = d2.intent({ type: "discard", resources: { timber: 4 } });
  const discard0 = currentDiscard.intent({ type: "discard", resources: { ore: 4 } });
  const discardSeq = d1.state.game.seq;
  assert.equal(discard2.baseSeq, discard1.baseSeq);
  d1.inbox.length = d2.inbox.length = 0;
  d1.raw(discard1);
  d2.raw(discard2);
  for (const c of [d1, d2]) {
    const reply = await c.next("*", (m) => m.type === "error" || (m.type === "state" && m.game.seq === discardSeq + 2));
    assert.equal(reply.type, "state", `parallel discard accepted: ${reply.message ?? ""}`);
    assert.deepEqual(reply.game.discardNeeded, { p0: 4 });
    assert.equal(reply.game.players.find((p) => p.id === reply.you).resources.timber, 4);
    assert.equal(reply.game.bank.timber, 11);
  }
  console.log("ok same-baseline non-current discards both accepted exactly once");
  await currentDiscard.next("state", (s) => s.game.seq === discardSeq + 2);
  await refused(currentDiscard, discard0, "current-player discard still requires exact sequence", "SGEE");
  await refused(d1, { ...discard1, ...d1.state.actionStamp }, "duplicate parallel discard with updated baseline", "SGEE");
  for (const [label, patch] of [
    ["parallel discard wrong turn", { turn: discard1.turn - 1 }],
    ["parallel discard wrong connection", { connection: d2.state.actionStamp.connection }],
    ["parallel discard malformed sequence", { baseSeq: String(discardSeq) }],
    ["parallel discard future sequence", { baseSeq: d1.state.game.seq + 1 }],
    ["parallel discard negative sequence", { baseSeq: -1 }],
  ]) await refused(d1, { ...d1.intent({ type: "discard", resources: { timber: 4 } }), ...patch }, label, "SGEE");
  await d1.drop();
  d1 = await client("SGEE", "p1");
  await refused(d1, discard1, "first parallel discard replay after reconnect", "SGEE");
  await d2.drop();
  d2 = await client("SGEE", "p2");
  await refused(d2, discard2, "second parallel discard replay after reconnect", "SGEE");
  currentDiscard.inbox.length = 0;
  currentDiscard.raw(currentDiscard.intent({ type: "discard", resources: { ore: 3 } }));
  assert.equal((await currentDiscard.next("error")).message, "Discard exactly 4.");
  assert.equal(currentDiscard.state.game.seq, discardSeq + 2);
  currentDiscard.raw(currentDiscard.intent({ type: "discard", resources: { ore: 4 } }));
  await currentDiscard.next("state", (s) => s.game.phase === "robber");
  assert.equal(currentDiscard.state.game.seq, discardSeq + 3);
  console.log("ok rules validate discard contents; fresh current-player discard finishes the phase");

  // A still-valid offer may be answered while another action advances the same turn.
  const trader = await client("SGFF", "p0");
  const responder = await client("SGFF", "p1");
  const otherResponder = await client("SGFF", "p2");
  trader.raw(trader.intent({ type: "tradeAsk", give: { grain: 1 }, want: { clay: 1 } }));
  const responseOffer = await responder.next("tradeOffer");
  await otherResponder.next("tradeOffer");
  const yes = responder.intent({ type: "tradeAnswer", tradeId: responseOffer.tradeId, yes: true });
  const otherYes = otherResponder.intent({ type: "tradeAnswer", tradeId: responseOffer.tradeId, yes: true });
  trader.raw(trader.intent({ type: "tradeBank", give: "timber", take: "wool" }));
  await trader.next("state", (s) => s.game.seq > yes.baseSeq);
  await responder.next("state", (s) => s.game.seq > yes.baseSeq);
  const beforeAnswer = responder.state.game.seq;
  responder.inbox.length = 0;
  responder.raw(yes);
  const answered = await responder.next("*", (m) => m.type === "error" || (m.type === "tradeClosed" && m.taker === "p1"));
  assert.equal(answered.type, "tradeClosed", `older-baseline trade response accepted: ${answered.message ?? ""}`);
  await responder.next("state", (s) => s.game.seq > beforeAnswer);
  assert.equal(responder.state.game.players.find((p) => p.id === "p1").resources.grain, 1);
  assert.equal(responder.state.game.players.find((p) => p.id === "p1").resources.clay, 1);
  otherResponder.inbox.length = 0;
  otherResponder.raw(otherYes);
  assert.equal((await otherResponder.next("error")).message, "Offer is gone.");
  await refused(responder, yes, "duplicate older-baseline trade acceptance", "SGFF");
  console.log("ok older-baseline trade reply accepted; racing reply cannot transfer twice");

  let a = await client("SGAA", "p0");
  const b = await client("SGAA", "p1");
  await client("SGAA", "p2");
  // The baseline stamp belongs to this recipient, not another seat or a guessed game sequence.
  assert.notEqual(a.state.actionStamp.connection, b.state.actionStamp.connection);
  for (const [label, patch] of [
    ["missing stamp", { turn: undefined, baseSeq: undefined, connection: undefined, cid: undefined }],
    ["wrong turn", { turn: a.state.game.turn - 1 }],
    ["old sequence", { baseSeq: a.state.game.seq - 1 }],
    ["future sequence", { baseSeq: a.state.game.seq + 1 }],
    ["malformed sequence", { baseSeq: String(a.state.game.seq) }],
    ["malformed cid", { cid: {} }],
    ["wrong connection", { connection: b.state.actionStamp.connection }],
  ]) await refused(a, { ...a.intent({ type: "tradeBank", give: "timber", take: "grain" }), ...patch }, label);

  const trade = a.intent({ type: "tradeBank", give: "timber", take: "grain" });
  const seq = a.state.game.seq;
  a.inbox.length = 0;
  a.raw(trade);
  await a.next("state", (s) => s.game.seq > seq);
  const mine = a.state.game.players.find((p) => p.id === "p0");
  assert(mine.resources.timber < 8 && mine.resources.grain === 3);
  console.log("ok fresh bank trade accepted");
  await refused(a, trade, "identical already-applied frame");
  await refused(a, { ...trade, ...a.state.actionStamp }, "duplicate cid with updated baseline");

  // An ask does not advance game.seq. The cid ledger must still prevent duplicate side effects.
  const ask = a.intent({ type: "tradeAsk", give: { grain: 1 }, want: { clay: 1 } });
  a.inbox.length = 0;
  a.raw(ask);
  const offer = await a.next("tradeOffer");
  assert.equal(a.state.game.seq, seq + 1);
  await refused(a, ask, "duplicate trade ask without sequence advancement");
  const freshAsk = a.intent({ type: "tradeAsk", give: { grain: 1 }, want: { clay: 1 } });
  a.raw(freshAsk);
  const freshOffer = await a.next("tradeOffer");
  assert.notEqual(freshOffer.tradeId, offer.tradeId);
  b.inbox.length = 0;
  const no = b.intent({ type: "tradeAnswer", tradeId: freshOffer.tradeId, yes: false });
  b.raw(no);
  await b.next("tradeDeclined");
  await refused(b, no, "duplicate trade decline without sequence advancement");

  // An unsent action is stale after rejoin even if no turn or sequence changed.
  const pending = a.intent({ type: "tradeBank", give: "timber", take: "grain" });
  const oldStamp = a.state.actionStamp;
  await a.drop();
  a = await client("SGAA", "p0");
  assert.equal(a.state.game.seq, oldStamp.baseSeq);
  assert.equal(a.state.game.turn, oldStamp.turn);
  assert.notEqual(a.state.actionStamp.connection, oldStamp.connection);
  await refused(a, JSON.stringify(pending), "exact unsent frame replayed after reconnect with no progress");
  await refused(a, { ...pending, ...a.state.actionStamp, cid: ask.cid }, "seat cid ledger retained across reconnect");
  const beforeFresh = a.state.game.seq;
  a.raw(a.intent({ type: "tradeBank", give: "timber", take: "grain" }));
  await a.next("state", (s) => s.game.seq > beforeFresh);
  console.log("ok fresh stamped action after reconnect accepted");

  // Bot takeover advances the table while the seat is away; an exact replay still must not run.
  let away = await client("SGBB", "p0");
  const witness = await client("SGBB", "p1");
  await client("SGBB", "p2");
  const staleRoll = away.intent({ type: "roll" });
  await away.drop();
  await witness.next("state", (s) => s.game.seq > staleRoll.baseSeq);
  away = await client("SGBB", "p0");
  await refused(away, JSON.stringify(staleRoll), "exact roll replay after bot progress and reconnect", "SGBB");

  // Rematch resets both counters; the old connection baseline must not become valid again.
  const h = await client("SGCC", "p0");
  const r = await client("SGCC", "p1");
  await client("SGCC", "p2");
  const oldIsland = r.intent({ type: "roll" });
  r.inbox.length = 0;
  h.raw({ type: "again" });
  await r.next("state", (s) => s.game.phase !== "over");
  assert.equal(r.state.game.turn, oldIsland.turn);
  assert.equal(r.state.game.seq, oldIsland.baseSeq);
  await refused(r, oldIsland, "old island frame after rematch resets turn/seq", "SGCC");
  const n = r.state.game.seq;
  r.raw(r.intent({ type: "roll" }));
  await r.next("state", (s) => s.game.seq > n);
  console.log("ok new-island stamped action accepted");

  // A ready seat may drop before start; its held seat must not make the host's start handler throw.
  const lobbyHost = await lobbyClient({ type: "hello", name: "ReadyHost" });
  const lobbyCode = (await lobbyHost.next("welcome")).code;
  const lobbyTide = await lobbyClient({ type: "hello", code: lobbyCode, name: "ReadyTide" });
  await lobbyTide.next("welcome");
  const lobbyPine = await lobbyClient({ type: "hello", code: lobbyCode, name: "ReadyPine" });
  const pineWelcome = await lobbyPine.next("welcome");
  for (const seat of [lobbyHost, lobbyTide, lobbyPine]) seat.raw({ type: "ready", value: true });
  await lobbyHost.next("seats", (m) => m.seats.length === 3 && m.seats.every((s) => s.ready));
  await lobbyPine.drop();
  await lobbyHost.next("seats", (m) => {
    const pine = m.seats.find((s) => s.name === "ReadyPine");
    return pine?.away && !pine.ready;
  });
  lobbyHost.raw({ type: "start" });
  const refusedStart = await lobbyHost.next("error");
  assert.equal(refusedStart.message, "Not everyone is ready.");
  const returnedPine = await lobbyClient({ type: "hello", code: lobbyCode, secret: pineWelcome.secret });
  await returnedPine.next("welcome");
  returnedPine.raw({ type: "ready", value: true });
  await lobbyHost.next("seats", (m) => m.seats.length === 3 && m.seats.every((s) => s.ready));
  lobbyHost.raw({ type: "start" });
  const started = await lobbyHost.next("state", (s) => s.game?.phase === "rollOff");
  assert.equal(started.game.players.length, 3);
  console.log("ok disconnected ready lobby seat blocks start until rejoining and readying again");

  // A raw frame from the previous host process must fail even when restored turn and seq are unchanged.
  let restartSeat = await client("SGDD", "p0");
  await client("SGDD", "p1");
  await client("SGDD", "p2");
  const beforeRestart = restartSeat.state.actionStamp;
  const preRestartFrame = restartSeat.intent({ type: "tradeBank", give: "timber", take: "grain" });
  const oldHost = host;
  const exited = new Promise((resolve) => oldHost.once("exit", resolve));
  oldHost.kill("SIGKILL");
  await exited;
  for (const c of clients) c.ws.terminate();
  port = await startHost(port);
  restartSeat = await client("SGDD", "p0");
  assert.equal(restartSeat.state.actionStamp.turn, beforeRestart.turn);
  assert.equal(restartSeat.state.actionStamp.baseSeq, beforeRestart.baseSeq);
  assert.notEqual(restartSeat.state.actionStamp.connection, beforeRestart.connection);
  await refused(restartSeat, preRestartFrame, "exact pre-restart frame replayed after restore with no progress", "SGDD");
  const afterRestartSeq = restartSeat.state.game.seq;
  restartSeat.raw(restartSeat.intent({ type: "tradeBank", give: "timber", take: "grain" }));
  await restartSeat.next("state", (s) => s.game.seq > afterRestartSeq);
  console.log("ok fresh stamped action after host restart accepted");
  console.log("stale prove ok");
} finally {
  for (const c of clients) c.ws.terminate();
  host.kill();
}
