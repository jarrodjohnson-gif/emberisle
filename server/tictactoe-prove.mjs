// Tic-tac-toe in the lobby's Play games shelf (#1263) against server/host.mjs: invite a named seat, accept, play to a win and a
// draw, decline, a busy or away or bot seat, a stale or spoofed move, Leave and Start closing the game, a rejoin getting the
// board back, a watcher refused, a flood refused on its own bucket, and the table's own messages and turns unaffected.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-ttt-"));
let host;
const sockets = [];
process.on("exit", () => {
  host?.kill("SIGKILL");
  for (const c of sockets) c.ws.terminate();
  rmSync(ROOMS_DIR, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

// The table's own limits stay at their defaults (ACT_CAP 20, ACT_RATE 4), so the flood below meets the real buckets.
function boot() {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results`, SAVE_MS: "20", LOBBY_HOLD_MS: "60000", GRACE_MS: "60000" },
  });
  return new Promise((resolve, reject) => {
    host.stdout.on("data", (d) => {
      const m = String(d).match(/listening (\d+)/);
      if (m) resolve(Number(m[1]));
    });
    host.on("exit", (c) => reject(new Error(`host exited ${c}`)));
  });
}

function client(port, name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { name, ws, inbox: [], seats: null, state: null, ttt: undefined, you: null };
  sockets.push(c);
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "welcome") c.you = msg.you;
    if (msg.type === "seats") c.seats = msg.seats;
    if (msg.type === "state") c.state = msg;
    if (msg.type === "ttt") c.ttt = msg;
    c.inbox.push(msg);
  });
  c.send = (msg) => ws.send(JSON.stringify({ ...c.state?.actionStamp, cid: crypto.randomUUID(), ...msg }));
  c.open = new Promise((res) => ws.on("open", res));
  return c;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error(`waited for ${what}`);
    await sleep(10);
  }
}
async function sit(port, names) {
  const cs = names.map((n) => client(port, n));
  await cs[0].open;
  cs[0].send({ type: "hello", name: cs[0].name });
  await until(() => cs[0].you, "welcome");
  const code = cs[0].inbox.find((m) => m.type === "welcome").code;
  for (const c of cs.slice(1)) {
    await c.open;
    c.send({ type: "hello", code, name: c.name });
    await until(() => c.you, `${c.name} welcome`);
  }
  await until(() => cs.every((c) => c.seats?.length === names.length), "every seat seen");
  return Object.assign(cs, { code });
}
// The host gives each seat 8 tic-tac-toe messages at once, refilled 2 a second. A copy of that bucket per seat name keeps
// the scripted games below inside it, so only the flood meets "Slow down.".
const buckets = new Map();
async function paced(c, msg) {
  if (msg.type.startsWith("ttt")) {
    const b = buckets.get(c.name) ?? { tokens: 8, at: Date.now() };
    b.tokens = Math.min(8, b.tokens + ((Date.now() - b.at) / 1000) * 2);
    if (b.tokens < 2) await sleep(((2 - b.tokens) / 2) * 1000);
    b.tokens = Math.min(8, b.tokens + ((Date.now() - b.at) / 1000) * 2) - 1;
    b.at = Date.now();
    buckets.set(c.name, b);
  }
  c.send(msg);
}
// The next error this client gets after `send`.
async function refused(c, msg) {
  const n = c.inbox.length;
  await paced(c, msg);
  await until(() => c.inbox.slice(n).some((m) => m.type === "error"), `an error for ${JSON.stringify(msg)}`);
  return c.inbox.slice(n).find((m) => m.type === "error").message;
}
// Sends and waits for the next ttt message on every listed client.
async function step(c, msg, ...watch) {
  const marks = [c, ...watch].map((w) => w.inbox.length);
  await paced(c, msg);
  await until(() => [c, ...watch].every((w, i) => w.inbox.slice(marks[i]).some((m) => m.type === "ttt" || m.type === "error")), `ttt after ${JSON.stringify(msg)}`);
  const error = c.inbox.slice(marks[0]).find((m) => m.type === "error");
  assert.equal(error, undefined, `${c.name} ${JSON.stringify(msg)} refused: ${error?.message}`);
  return c.ttt.game;
}
const ok = (what) => console.log(`ok ${what}`);

const port = await boot();

// 1. Invite, accept, a win, Play again, a draw; refusals for the wrong seat, a stale id, a taken square and a bad cell.
{
  const [ember, tide, moss] = await sit(port, ["Ember", "Tide", "Moss"]);
  let g = await step(ember, { type: "tttInvite", to: tide.you }, tide);
  assert.deepEqual(tide.ttt.game, g, "both seats get the same board");
  assert.equal(g.status, "invited");
  assert.equal(g.x, ember.you);
  assert.equal(g.o, tide.you);
  assert.equal(g.board, ".........");
  await sleep(100);
  assert.equal(moss.ttt, undefined, "a third seat hears nothing about the game");
  assert.equal(await refused(ember, { type: "tttAnswer", id: g.id, yes: true }), "That game is over.", "the inviter cannot accept");
  assert.equal(await refused(moss, { type: "tttMove", id: g.id, cell: 4 }), "That game is over.", "a seat outside the game cannot move");
  assert.equal(await refused(ember, { type: "tttMove", id: g.id, cell: 4 }), "Not your turn.", "no move before the accept");
  g = await step(tide, { type: "tttAnswer", id: g.id, yes: true }, ember);
  assert.equal(g.status, "playing");
  assert.equal(g.turn, ember.you, "the inviter is X and goes first");
  ok("invite and accept: only Ember and Tide get the board; Ember is X and goes first");

  assert.equal(await refused(tide, { type: "tttMove", id: g.id, cell: 0 }), "Not your turn.");
  g = await step(ember, { type: "tttMove", id: g.id, cell: 0 }, tide);
  assert.equal(await refused(tide, { type: "tttMove", id: g.id, cell: 0 }), "Pick an empty square.");
  for (const cell of [9, -1, 1.5, "3", null]) assert.equal(await refused(tide, { type: "tttMove", id: g.id, cell }), "Pick an empty square.", `cell ${cell}`);
  g = await step(tide, { type: "tttMove", id: g.id, cell: 3 }, ember);
  g = await step(ember, { type: "tttMove", id: g.id, cell: 1 }, tide);
  g = await step(tide, { type: "tttMove", id: g.id, cell: 4 }, ember);
  g = await step(ember, { type: "tttMove", id: g.id, cell: 2 }, tide);
  assert.equal(g.board, "xxxoo....");
  assert.equal(g.status, "won");
  assert.equal(g.winner, ember.you);
  assert.deepEqual(g.line, [0, 1, 2]);
  assert.equal(g.turn, null);
  assert.deepEqual(tide.ttt.game, g);
  assert.equal(await refused(tide, { type: "tttMove", id: g.id, cell: 5 }), "Not your turn.", "no move after the win");
  ok("a win: Ember takes the top row; wrong turn, taken square, five bad cells and a move after the win are refused");

  const old = g.id;
  g = await step(tide, { type: "tttAgain", id: g.id }, ember);
  assert.notEqual(g.id, old, "Play again gets a new id");
  assert.equal(g.turn, tide.you, "O goes first in the next game");
  assert.equal(await refused(tide, { type: "tttMove", id: old, cell: 4 }), "That game is over.", "a stale id is refused");
  assert.equal(await refused(ember, { type: "tttAgain", id: g.id }), "Finish this game first.");
  for (const [who, cell] of [[tide, 0], [ember, 1], [tide, 2], [ember, 4], [tide, 3], [ember, 5], [tide, 7], [ember, 6], [tide, 8]]) {
    g = await step(who, { type: "tttMove", id: g.id, cell }, who === tide ? ember : tide);
  }
  assert.equal(g.board, "oxooxxxoo");
  assert.equal(g.status, "draw");
  assert.equal(g.winner, null);
  assert.equal(g.line, null);
  ok("Play again and a draw: a new id, O first, a stale move refused, nine squares and no line");

  // 2. One game per seat: busy, self, already playing.
  assert.equal(await refused(moss, { type: "tttInvite", to: tide.you }), "Tide is busy.");
  assert.equal(await refused(moss, { type: "tttInvite", to: moss.you }), "Pick a table-mate.");
  assert.equal(await refused(moss, { type: "tttInvite", to: "s99" }), "Pick a table-mate.");
  assert.equal(await refused(ember, { type: "tttInvite", to: moss.you }), "Close your game first.");
  ok("one game per seat: busy, self, unknown and already-playing invites are refused");

  // 3. Close: both seats get the game closed, with who closed it.
  const id = g.id;
  await step(ember, { type: "tttClose", id }, tide);
  assert.deepEqual(tide.ttt, { type: "ttt", game: null, id, reason: "closed", by: ember.you });
  assert.equal(await refused(tide, { type: "tttMove", id, cell: 0 }), "That game is over.");
  ok("Close: both seats see it closed by Ember, and a late move is refused");

  // 4. Decline.
  g = await step(ember, { type: "tttInvite", to: moss.you }, moss);
  await step(moss, { type: "tttAnswer", id: g.id, yes: false }, ember);
  assert.deepEqual(ember.ttt, { type: "ttt", game: null, id: g.id, reason: "declined", by: moss.you });
  assert.equal(moss.ttt.game, null);
  ok("decline: Moss says no and Ember sees declined by Moss");

  // 5. A drop keeps the game; the rejoin gets the board back. Leave closes it for the other seat.
  g = await step(ember, { type: "tttInvite", to: moss.you }, moss);
  g = await step(moss, { type: "tttAnswer", id: g.id, yes: true }, ember);
  g = await step(ember, { type: "tttMove", id: g.id, cell: 4 }, moss);
  const secret = moss.inbox.find((m) => m.type === "welcome").secret;
  moss.ws.terminate();
  await until(() => ember.seats.find((s) => s.id === moss.you)?.away, "Moss away");
  assert.equal(await refused(tide, { type: "tttInvite", to: moss.you }), "Moss is away.");
  const back = client(port, "Moss");
  await back.open;
  back.send({ type: "hello", code: ember.inbox.find((m) => m.type === "welcome").code, secret });
  await until(() => back.ttt, "the board after the rejoin");
  assert.deepEqual(back.ttt.game, g, "the rejoined seat gets the same board");
  g = await step(back, { type: "tttMove", id: g.id, cell: 0 }, ember);
  assert.equal(g.board, "o...x....");
  ok("drop and rejoin: the game is held, an invite to the away seat is refused, and the rejoin gets the board");

  back.send({ type: "leave" });
  back.ws.close();
  await until(() => ember.ttt.game === null, "Leave to close the game");
  assert.deepEqual(ember.ttt, { type: "ttt", game: null, id: g.id, reason: "left", by: back.you });
  ok("Leave: Moss leaves and Ember sees the game closed, left by Moss");
}

// 6. A bot cannot be invited. A flood is refused on its own bucket; Ready, chat and Start still work. Start closes the game,
// later invites are refused, the table's turns go on, and a watcher's invite is refused.
{
  const cs = await sit(port, ["Ember", "Tide"]);
  const [ember, tide] = cs;
  ember.send({ type: "addBot" });
  await until(() => ember.seats.length === 3, "a bot");
  const bot = ember.seats.find((s) => s.bot);
  assert.equal(await refused(ember, { type: "tttInvite", to: bot.id }), "Pick a table-mate.", "a bot cannot be invited");
  let g = await step(ember, { type: "tttInvite", to: tide.you }, tide);
  g = await step(tide, { type: "tttAnswer", id: g.id, yes: true }, ember);
  g = await step(ember, { type: "tttMove", id: g.id, cell: 4 }, tide);

  const before = tide.inbox.length;
  for (let i = 0; i < 200; i++) tide.send({ type: "tttMove", id: g.id, cell: 0 });
  tide.send({ type: "ready", value: true });
  tide.send({ type: "chat", text: "still here" });
  await until(() => tide.seats.find((s) => s.id === tide.you)?.ready, "Ready to land after the flood");
  await until(() => tide.inbox.slice(before).some((m) => m.type === "chat" && m.text === "still here"), "chat after the flood");
  const after = tide.inbox.slice(before);
  const slow = after.filter((m) => m.type === "error" && m.message === "Slow down.").length;
  const moves = after.filter((m) => m.type === "ttt").length;
  assert.ok(slow >= 185, `the flood is refused (${slow} of 200 "Slow down.")`);
  assert.equal(moves, 1, "one move of the flood lands (Tide's turn), the rest are refused");
  assert.ok(!after.some((m) => m.type === "error" && m.message !== "Slow down." && m.message !== "Not your turn."), "no other refusal");
  ok(`flood: ${slow} of 200 tic-tac-toe messages refused with "Slow down.", ${moves} landed, and Ready and chat still went through`);

  ember.send({ type: "ready", value: true });
  await until(() => ember.seats.every((s) => s.ready), "every seat ready");
  assert.notEqual(ember.ttt.game, null, "Ready does not close the game");
  ember.send({ type: "start" });
  await until(() => ember.state && tide.state, "the game to start");
  await until(() => ember.ttt.game === null && tide.ttt.game === null, "Start to close the game");
  assert.equal(ember.ttt.reason, "start");
  assert.equal(tide.ttt.reason, "start");
  const closedAt = ember.inbox.findIndex((m) => m.type === "ttt" && m.game === null);
  const firstState = ember.inbox.findIndex((m) => m.type === "state");
  assert.ok(closedAt < firstState, "the game closes before the first game state");
  assert.equal(await refused(ember, { type: "tttInvite", to: tide.you }), "Games close when the table starts.");
  ok("Start: the game closes for both before the first state, and a later invite is refused");

  const watcher = client(port, "Watcher");
  await watcher.open;
  watcher.send({ type: "hello", code: cs.code, watch: true });
  await until(() => watcher.inbox.some((m) => m.type === "state"), "the watcher's state");
  assert.equal(await refused(watcher, { type: "tttInvite", to: tide.you }), "Watching only.");
  ok("a watcher's invite is refused with \"Watching only.\"");

  // The roll-off goes on with a tic-tac-toe flood from the seat that is not up.
  let rolls = 0;
  while (ember.state.game.phase === "rollOff") {
    const up = [ember, tide].find((c) => c.state.you === c.state.game.current && c.state.legal.actions.includes("roll"));
    if (!up) {
      await sleep(20);
      continue;
    }
    const idle = up === ember ? tide : ember;
    for (let i = 0; i < 20; i++) idle.send({ type: "tttInvite", to: up.you });
    const seen = up.state;
    up.send({ type: "roll" });
    await until(() => up.state !== seen, "the roll's state");
    rolls++;
  }
  assert.ok(rolls >= 1, "a person rolled");
  assert.equal(ember.inbox.filter((m) => m.type === "error" && m.message === "The table has updated. Please try again.").length, 0);
  ok(`table turns: the roll-off finished (${rolls} human rolls) while the idle seat sent tic-tac-toe invites`);
}

console.log("tictactoe prove ok");
process.exit(0);
