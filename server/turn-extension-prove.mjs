// #832: exercise timer votes against the real host, including raw invalid frames and a killed/restarted host.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";

const TURN = 4000;
const TOTAL = 5000;
const EXTRA = 2500;
const VOTE = 800;
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-extension-"));
const sockets = new Set();
const clients = [];
let host;
let port;
let stderr = "";
process.on("exit", () => { host?.kill("SIGKILL"); rmSync(dir, { recursive: true, force: true }); });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));

function fixture(code, count = 4, bot = false, phase = "main") {
  let game = createGame({ humans: ["Ember", "Tide", "Pine", "Stone"].slice(0, count).map((name) => ({ name })), bots: 0, seed: 11 });
  while (game.phase !== "roll") {
    const next = applyAction(game, game.current, chooseBotAction(game, game.current));
    assert.ifError(next.error);
    game = next.state;
  }
  Object.assign(game, { current: "p0", phase, turn: 7, seq: 50 });
  for (const p of game.players) p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
  game.players.find((p) => p.id === "p0").resources = { timber: 15, clay: 0, wool: 0, grain: 15, ore: 0 };
  if (bot) game.players.find((p) => p.id === "p3").kind = "bot";
  if (phase === "discard") {
    game.players.find((p) => p.id === "p0").resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
    game.players.find((p) => p.id === "p1").resources.timber = 8;
    game.discardNeeded = { p1: 4 };
    game.dice = [3, 4];
  }
  for (const r of RESOURCES) game.bank[r] = 19 - game.players.reduce((n, p) => n + p.resources[r], 0);
  game.players.sort((a, b) => a.id.localeCompare(b.id));
  const seats = game.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `${code}-${p.id}`, ...(bot === true && p.id === "p3" ? { bot: true } : {}) }));
  writeFileSync(path.join(dir, `${code}.json`), JSON.stringify({ code, host: "s0", next: count, chat: [], chatSeq: 0, game, seats, shape: 2, savedAt: Date.now() }));
}
for (const code of ["EVAA", "EVAC", "EVAD", "EVAF", "EVAG", "EVAH", "EVAK", "EVAN"]) fixture(code);
fixture("EVAB", 3);
fixture("EVAE", 3);
fixture("EVAJ", 4, true);
fixture("EVAL", 4, false, "discard");
fixture("EVAM", 4, "takeover");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = check();
    if (value) return value;
    await wait(10);
  }
  throw new Error(`timed out: ${label}; ${stderr}`);
}

async function start(extra = EXTRA, vote = VOTE) {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR: dir, TURN_MS: String(TURN), TURN_TOTAL_MS: String(TOTAL), TURN_EXTENSION_MS: extra === null ? "" : String(extra), TURN_VOTE_MS: vote === null ? "" : String(vote), SAVE_MS: "20", ACT_CAP: "1000", ACT_RATE: "1000", GRACE_MS: "60000", HOLD_MS: "60000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  host.stderr.on("data", (d) => { stderr += String(d); });
  port = await new Promise((resolve, reject) => {
    host.stdout.on("data", (d) => { const match = String(d).match(/listening (\d+)/); if (match) resolve(Number(match[1])); });
    host.once("exit", (code) => reject(new Error(`host exited ${code}: ${stderr}`)));
  });
}

async function stop() {
  const stopped = once(host, "exit");
  host.kill("SIGKILL");
  await stopped;
}

async function client(code, pid, watcher = false) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  sockets.add(ws);
  ws.once("close", () => sockets.delete(ws));
  const c = { ws, code, pid, state: null, states: [], errors: [], messages: [] };
  clients.push(c);
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    c.messages.push(msg);
    if (msg.type === "state") { c.state = msg; c.states.push(msg); }
    if (msg.type === "error") c.errors.push(msg.message);
  });
  c.send = (msg, extra = {}) => {
    const frame = { ...c.state?.actionStamp, cid: randomUUID(), ...msg, ...extra };
    ws.send(JSON.stringify(frame));
    return frame;
  };
  c.close = async () => {
    if (ws.readyState === WebSocket.CLOSED) return;
    const closed = once(ws, "close");
    ws.close();
    await closed;
  };
  await once(ws, "open");
  ws.send(JSON.stringify(watcher ? { type: "hello", code, watch: true } : { type: "hello", code, secret: `${code}-${pid}` }));
  await until(() => c.state, `${code}/${pid} joined`);
  return c;
}

async function table(code, count = 4) {
  const seats = [];
  for (let i = 0; i < count; i++) seats.push(await client(code, `p${i}`));
  assert.equal(seats[0].state.turnExtension.target, "p0", "the current timer target is public");
  assert.equal(seats[0].state.turnExtension.used, false, "a new turn has no used request");
  return seats;
}
const extension = (c) => c.state.turnExtension;
async function ask(c, target = extension(c).target, key = extension(c).key) {
  const previous = extension(c).vote?.id ?? extension(c).result?.id;
  c.send({ type: "turnExtensionAsk", target, key });
  await until(() => (extension(c).vote?.id ?? extension(c).result?.id) && (extension(c).vote?.id ?? extension(c).result?.id) !== previous, "request acknowledged");
  return extension(c).vote;
}
async function answer(c, voteId, yes) {
  c.send({ type: "turnExtensionAnswer", voteId, yes });
}
async function result(c, outcome) {
  await until(() => extension(c).result?.outcome === outcome && !extension(c).vote, `${outcome} vote`);
}
async function rejected(c, msg, extra = {}) {
  const errors = c.errors.length;
  const before = structuredClone({ deadline: c.state.turnDeadline, seq: c.state.game.seq, extension: extension(c) });
  c.send(msg, extra);
  await until(() => c.errors.length > errors, `refused ${msg.type}`);
  assert.deepEqual({ deadline: c.state.turnDeadline, seq: c.state.game.seq, extension: extension(c) }, before, "a refusal cannot change the timer, game, or vote");
}
async function closeAll(seats) { for (const c of seats) await c.close(); }

function assertPublic(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    assert(!["seed", "rng"].includes(key), `raw socket frame exposed private ${key}`);
    assertPublic(nested);
  }
  if (value.type === "turnExtension" || value.turnExtension) {
    const ext = value.turnExtension ?? value;
    if (ext.key !== null) assert.match(ext.key, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, "public turn identity is opaque");
    assert(!ext.vote || !Object.hasOwn(ext.vote, "key"), "a vote cannot expose its private turn key");
    assert(!ext.result || !Object.hasOwn(ext.result, "key"), "a result cannot expose its private turn key");
  }
}

try {
  await start(null, null);
  {
    const [a, b, c, d] = await table("EVAA");
    const watcher = await client("EVAA", null, true);
    const { target, key } = extension(a);
    await rejected(a, { type: "turnExtensionAsk", target: "p1", key });
    await rejected(a, { type: "turnExtensionAsk", target, key: `${key}-old` });
    await rejected(a, { type: "turnExtensionAsk", target, key }, { turn: -1 });
    await rejected(watcher, { type: "turnExtensionAsk", target, key });
    const before = a.state.turnDeadline;
    const askStates = b.states.length;
    const vote = await ask(b);
    assert.equal(b.states.length - askStates, 1, "an ask publishes one full state");
    assert.deepEqual(vote.voters.slice().sort(), ["p1", "p2", "p3"]);
    assert.deepEqual(vote.yes, ["p1"], "an eligible requester automatically votes yes");
    assert.equal(a.state.turnDeadline, before, "opening the vote does not pause or extend the clock");
    assert(vote.until > Date.now() + 14_000 && vote.until <= Date.now() + 15_050, "the default host answer deadline is 15 seconds");
    await rejected(a, { type: "turnExtensionAnswer", voteId: vote.id, yes: true });
    await rejected(c, { type: "turnExtensionAnswer", voteId: `${vote.id}-old`, yes: true });
    await rejected(c, { type: "turnExtensionAnswer", voteId: vote.id, yes: "yes" });
    const answerStates = a.states.length;
    await answer(c, vote.id, true);
    await Promise.all([a, d].map((client) => result(client, "passed")));
    assert.equal(a.states.length - answerStates, 1, "a deciding answer publishes one full state");
    assert.equal(a.state.turnDeadline, before + 60_000, "a majority adds exactly the default 60-second extension");
    await rejected(d, { type: "turnExtensionAnswer", voteId: vote.id, yes: true });
    await rejected(b, { type: "turnExtensionAsk", target, key });
    console.log("majority: requester yes + one yes of three passes; default 60-second extension / 15-second answer window; target, watcher, malformed and stale frames refused");
    await closeAll([a, b, c, d, watcher]);
    await stop();
    await start();
  }
  {
    const [a, b, c] = await table("EVAB", 3);
    const before = a.state.turnDeadline;
    const vote = await ask(b);
    await answer(c, vote.id, false);
    await Promise.all([a, b].map((client) => result(client, "failed")));
    assert.equal(a.state.turnDeadline, before, "a tie grants no time");
    assert.equal(extension(a).used, true, "a failed request consumes this turn's attempt");
    await rejected(b, { type: "turnExtensionAsk", target: "p0", key: extension(b).key });
    const seq = a.state.game.seq;
    a.send({ type: "tradeBank", give: "timber", take: "grain" });
    await until(() => a.state.game.seq > seq, "action after a failed vote");
    assert.equal(extension(a).used, true, "an accepted action cannot replenish the request");
    console.log("tie: one yes / one no fails; failed attempt remains spent after an accepted action");
    await closeAll([a, b, c]);
  }
  {
    const [a, b, c, d] = await table("EVAC");
    const before = a.state.turnDeadline;
    const vote = await ask(a);
    assert.deepEqual(vote.voters.slice().sort(), ["p1", "p2", "p3"], "the timed requester is excluded from the electorate");
    assert.deepEqual(vote.yes, [], "the timed requester cannot vote for themselves");
    await answer(b, vote.id, false);
    await until(() => extension(a).vote?.no.includes("p1"), "first reply");
    await rejected(b, { type: "turnExtensionAnswer", voteId: vote.id, yes: true });
    await answer(c, vote.id, true);
    await Promise.all([a, d].map((client) => result(client, "failed")));
    assert(Date.now() >= vote.until - 20, "an unanswered vote closes at its host deadline");
    assert.equal(a.state.turnDeadline, before, "a timed-out minority grants no time");
    await rejected(d, { type: "turnExtensionAnswer", voteId: vote.id, yes: true });
    console.log("timeout: silence counts against a majority; duplicate and late replies cannot change the result");
    await closeAll([a, b, c, d]);
  }
  {
    const [a, b, c, d] = await table("EVAD");
    const oldKey = extension(a).key;
    await ask(a);
    a.send({ type: "pass" });
    await until(() => a.state.game.current === "p1", "target ends the turn");
    assert.equal(extension(a).vote, null);
    assert.equal(extension(a).result, null, "the previous turn's result cannot obstruct a new request");
    assert.equal(extension(a).used, false, "the next player's turn gets a new attempt");
    assert.notEqual(extension(a).key, oldKey);
    await rejected(c, { type: "turnExtensionAsk", target: "p0", key: oldKey });
    console.log("turn change: an open vote cancels; the next seat gets a fresh request identity");
    await closeAll([a, b, c, d]);
  }
  {
    const [a, b, c] = await table("EVAE", 3);
    const before = a.state.turnDeadline;
    await ask(b);
    await c.close();
    await result(a, "passed");
    assert.equal(a.state.turnDeadline, before + EXTRA, "a dropped voter is removed from the electorate");
    console.log("disconnect: dropping the silent voter leaves one yes of one connected other human, which passes");
    await closeAll([a, b]);
  }
  {
    const [a, b, c, d] = await table("EVAF");
    const vote = await ask(a);
    await d.close();
    await until(() => extension(a).vote?.voters.length === 2, "dropped voter removed");
    const back = await client("EVAF", "p3");
    assert.deepEqual(extension(back).vote.voters.slice().sort(), ["p1", "p2"], "rejoining does not enlarge an in-flight electorate");
    await rejected(back, { type: "turnExtensionAnswer", voteId: vote.id, yes: true });
    await answer(b, vote.id, true);
    await answer(c, vote.id, false);
    await result(a, "failed");
    console.log("rejoin: an in-flight electorate only shrinks; the removed voter cannot reply after returning");
    await closeAll([a, b, c, back]);
  }
  {
    const [a, b, c, d] = await table("EVAG");
    await ask(a);
    await a.close();
    await result(b, "cancelled");
    assert.equal(b.state.turnDeadline, null, "a disconnected target has no turn timer");
    console.log("target drop: the timer disappears and its open vote cancels");
    await closeAll([b, c, d]);
  }
  {
    const a = await client("EVAH", "p0");
    await rejected(a, { type: "turnExtensionAsk", target: "p0", key: extension(a).key });
    assert.equal(extension(a).used, false, "no electorate cannot consume an attempt");
    await a.close();
    const [target, other] = await table("EVAJ", 2);
    const before = target.state.turnDeadline;
    await ask(other);
    await result(target, "passed");
    assert.equal(target.state.turnDeadline, before + EXTRA);
    console.log("electorate: no other connected human refuses; a lobby bot and a held human do not block one eligible yes");
    await closeAll([target, other]);
    const [controlledTarget, controlledOther] = await table("EVAM", 2);
    const controlledDeadline = controlledTarget.state.turnDeadline;
    await ask(controlledOther);
    await result(controlledTarget, "passed");
    assert.equal(controlledTarget.state.turnDeadline, controlledDeadline + EXTRA);
    assert.equal(controlledTarget.state.game.players.find((p) => p.id === "p3").kind, "bot", "the held takeover seat remains bot-controlled");
    console.log("takeover: a held bot-controlled human seat is excluded from the electorate");
    await closeAll([controlledTarget, controlledOther]);
  }
  {
    const seats = [];
    for (let i = 0; i < 4; i++) seats.push(await client("EVAL", `p${i}`));
    const [a, b, c] = seats;
    assert.equal(a.state.game.current, "p0");
    assert.equal(a.state.turnPlayer, "p1", "the host waits on the owing discard seat, not the current player");
    assert.equal(extension(a).target, "p1");
    const before = a.state.turnDeadline;
    const vote = await ask(a);
    assert.deepEqual(vote.voters.slice().sort(), ["p0", "p2", "p3"], "the timed discard seat is excluded from voting");
    await answer(c, vote.id, true);
    await result(a, "passed");
    assert.equal(a.state.turnDeadline, before + EXTRA, "the discard timer receives the extension");
    b.send({ type: "discard", cards: { timber: 4 } });
    await until(() => a.state.game.phase !== "discard", "owing seat discards");
    assert.equal(a.state.turnPlayer, "p0", "the current player resumes after the discard");
    assert.equal(extension(a).used, false, "another target's request does not consume the current player's request");
    const nextVote = await ask(b);
    assert.equal(nextVote.target, "p0");
    await answer(c, nextVote.id, true);
    await result(a, "passed");
    console.log("discard: the timed seat can differ from current; only that timer gains time and the resumed target keeps its request");
    await closeAll(seats);
  }
  {
    const seats = await table("EVAK");
    let [a, b, c] = seats;
    const startAt = a.state.turnDeadline - TURN;
    const cap = startAt + TOTAL + EXTRA;
    const vote = await ask(b);
    await answer(c, vote.id, true);
    await result(a, "passed");
    await wait(100);
    const seq = a.state.game.seq;
    a.send({ type: "tradeBank", give: "timber", take: "grain" });
    await until(() => a.state.game.seq > seq, "accepted action after extension");
    assert(a.state.turnDeadline <= Date.now() + TURN && a.state.turnDeadline > Date.now() + TURN - 300, "a later action gets the normal idle window without the approved extra time");
    assert(a.state.turnDeadline <= cap, "the extended total cap still bounds the window");
    const savedDeadline = a.state.turnDeadline;
    await until(() => {
      try { return JSON.parse(readFileSync(path.join(dir, "EVAK.json"), "utf8")).seats.find((s) => s.pid === "p0").turnDeadline === savedDeadline; }
      catch { return false; }
    }, "extended deadline saved");
    const killed = once(host, "exit");
    host.kill("SIGKILL");
    await killed;
    await start();
    const restored = [];
    for (let i = 0; i < 4; i++) restored.push(await client("EVAK", `p${i}`));
    [a, b, c] = restored;
    assert.equal(a.state.turnDeadline, savedDeadline, "restart restores the extended deadline without granting a fresh window");
    assert.equal(extension(a).used, true, "restart preserves the once-per-turn attempt");
    await rejected(b, { type: "turnExtensionAsk", target: "p0", key: extension(b).key });
    let give = "grain";
    let sent = 0;
    const ticker = setInterval(() => {
      if (a.state.game.current !== "p0") return;
      a.send({ type: "tradeBank", give, take: give === "timber" ? "grain" : "timber" });
      give = give === "timber" ? "grain" : "timber";
      sent++;
    }, 650);
    try { await until(() => a.state.game.current !== "p0", "extended cap passes the turn", TOTAL + EXTRA + 3000); }
    finally { clearInterval(ticker); }
    const late = Date.now() - cap;
    assert(sent >= 3, "the target kept acting after restart");
    assert(late >= -50 && late <= 1000, `the host passed ${late} ms from the extended cap`);
    assert(a.states.every((s) => s.game.current !== "p0" || s.turnDeadline === null || s.turnDeadline <= cap), "no action can exceed the extended cap");
    assert(a.messages.some((m) => m.type === "log" && m.text === "Ember took too long; the table moved on."));
    assert.equal(a.state.game.players.find((p) => p.id === "p0").kind, "human");
    assert.equal(extension(a).used, false, "expiry gives the next turn a fresh request");
    console.log(`restart and cap: approved extra time and used attempt survived kill -9; ${sent} actions; passed ${late} ms from extended cap`);
    await closeAll(restored);
  }
  {
    await stop();
    const extra = 90_000;
    await start(extra);
    let [a, b, c, d] = await table("EVAN");
    const before = a.state.turnDeadline;
    const vote = await ask(b);
    await answer(c, vote.id, true);
    await Promise.all([a, b, c, d].map((client) => result(client, "passed")));
    assert.equal(a.state.turnDeadline, before + extra, "a configured extension above 60 seconds is granted exactly once");
    const key = extension(a).key;
    await rejected(d, { type: "turnExtensionAsk", target: "p0", key });
    assert.equal(extension(d).key, key, "reading the budget cannot reset its token after a larger grant");
    const seq = a.state.game.seq;
    a.send({ type: "tradeBank", give: "timber", take: "grain" });
    await until(() => a.state.game.seq > seq, "normal action after larger extension");
    assert(a.state.turnDeadline <= Date.now() + TURN, "a configured larger extension does not enlarge later windows");
    assert(extension(a).used, "a larger grant remains consumed after a new window");
    const savedDeadline = a.state.turnDeadline;
    await until(() => {
      try {
        const saved = JSON.parse(readFileSync(path.join(dir, "EVAN.json"), "utf8")).seats.find((s) => s.pid === "p0");
        return saved.turnDeadline === savedDeadline && saved.extension.used && saved.extension.extra === extra;
      } catch { return false; }
    }, "larger budget saved");
    await stop();
    await start(extra);
    const restored = [];
    for (let i = 0; i < 4; i++) restored.push(await client("EVAN", `p${i}`));
    [a, b, c, d] = restored;
    assert.equal(a.state.turnDeadline, savedDeadline, "a larger budget preserves the saved window after restart");
    assert.equal(extension(a).key, key);
    assert.equal(extension(a).used, true, "a larger budget stays consumed after restart");
    await rejected(b, { type: "turnExtensionAsk", target: "p0", key });
    console.log("configured extension: +90000ms once; later windows remain normal; token and used request survive reads, action and kill -9");
    await closeAll([a, b, c, d]);
  }
  assert(!stderr.includes("message failed:"), `host message handler threw: ${stderr}`);
  for (const c of clients) for (const msg of c.messages) {
    assertPublic(msg);
    assert(!JSON.stringify(msg).includes("7:p0:play"), "raw socket frame exposed the private turn identity");
  }
  console.log("privacy: every raw seated and watcher frame hides seed/rng and uses only opaque public vote identities");
  console.log("PASS turn-extension-prove");
} catch (error) {
  console.error("FAIL turn-extension-prove", error);
  process.exitCode = 1;
} finally {
  for (const ws of sockets) ws.terminate();
  if (host && host.exitCode === null && host.signalCode === null) {
    const stopped = once(host, "exit");
    host.kill("SIGKILL");
    await stopped;
  }
}
