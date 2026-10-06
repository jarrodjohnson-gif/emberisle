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
  assert.match((await c.next("error")).message, /stale/i, label);
  const after = await c.next("state");
  assert.deepEqual(after.game, before.game, `${label}: no game/hand/turn mutation`);
  assert.equal(after.turnDeadline, before.turnDeadline, `${label}: no clock rearm`);
  assert.equal(readFileSync(path.join(dir, `${code}.json`), "utf8"), saved, `${label}: no disk write`);
  assert(!c.inbox.some((m) => ["rolled", "tradeOffer", "tradeClosed", "tradeDeclined"].includes(m.type)), `${label}: no action broadcast`);
  console.log(`ok ${label}: stale error, private resync, unchanged game/deadline/save`);
}

try {
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
