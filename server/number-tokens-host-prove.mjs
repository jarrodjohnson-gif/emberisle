// #1156: the "Number tokens" match setting, over real sockets to a real host.
// 1. A new table lays the official spiral unless its creator asks for Random; any other value opens nothing.
// 2. Every seat and a watcher hear the table's setting in `welcome` and `seats`. Only the host changes it, with
//    `setNumberTokens`, in the lobby or between games (owner answer B); a stray field on any other message changes nothing.
// 3. The setting is saved with the table, the started board is the generator's board for that seed and setting, and a
//    restart keeps it.
// 4. A room saved before the setting loads as Random, in the lobby and mid-game, and its dealt board is untouched.
// 5. A rematch keeps the setting, for Official spiral and for Random, or deals the one the host picked after the game.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { createGame } from "../src/lib/game/board.ts";
import { PLAYER_COLORS } from "../src/lib/game/types.ts";

const directory = mkdtempSync(path.join(tmpdir(), "emberisle-number-tokens-"));
const sockets = [];
let host, stderr = "";
process.on("exit", () => {
  host?.kill("SIGKILL");
  rmSync(directory, { recursive: true, force: true });
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OTHER = { official: "random", random: "official" };
const HUMANS = [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }];

async function start() {
  stderr = "";
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR: directory, RESULTS_DIR: path.join(directory, "results"), PROFILES_DIR: path.join(directory, "profiles"), SAVE_MS: "20", TURN_MS: "600000", GRACE_MS: "600000", HOLD_MS: "600000", LOBBY_HOLD_MS: "600000", ACT_CAP: "1000", ACT_RATE: "1000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  host.stderr.on("data", (d) => (stderr += d));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error(`host startup timeout: ${stderr}`)), 10000);
    host.once("exit", (code) => { clearTimeout(timeout); reject(Error(`host exit ${code}: ${stderr}`)); });
    host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) { clearTimeout(timeout); resolve(Number(m[1])); } });
  });
}
async function stop() {
  for (const ws of sockets) ws.terminate();
  sockets.length = 0;
  if (host?.exitCode === null && host?.signalCode === null) { const exited = once(host, "exit"); host.kill("SIGTERM"); await exited; }
}

// A socket that keeps every message. `next` waits for the first unread one of a type that passes `test`.
async function client(port, hello) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  sockets.push(ws);
  const c = { ws, inbox: [], state: null };
  ws.on("message", (raw) => { const m = JSON.parse(String(raw)); if (m.type === "state") c.state = m; c.inbox.push(m); });
  c.next = async (type, test = () => true) => {
    for (let i = 0; i < 500; i++) {
      const at = c.inbox.findIndex((m) => m.type === type && test(m));
      if (at >= 0) return c.inbox.splice(at, 1)[0];
      await wait(10);
    }
    throw Error(`timeout ${type}: ${JSON.stringify(c.inbox.slice(-3))} ${stderr}`);
  };
  c.send = (m) => ws.send(JSON.stringify({ ...c.state?.actionStamp, cid: crypto.randomUUID(), ...m }));
  await once(ws, "open");
  ws.send(JSON.stringify({ type: "hello", ...hello }));
  return c;
}
async function seated(port, hello) {
  const c = await client(port, hello);
  c.welcome = await c.next("welcome");
  return c;
}
const roomFile = (code) => path.join(directory, `${code}.json`);
async function saved(code, test) {
  for (let i = 0; i < 200; i++) {
    try { const s = JSON.parse(readFileSync(roomFile(code), "utf8")); if (test(s)) return s; } catch {}
    await wait(20);
  }
  throw Error(`save timeout ${code}`);
}
// The board a table dealt is the generator's board for its saved seed and setting, and not the other setting's.
function dealtBy(game, numberTokens, tag) {
  const opts = { seed: game.seed, humans: game.players.map((p) => ({ name: p.name })), bots: 0, wayfarerMode: game.wayfarerMode ?? "on" };
  const pips = (g) => g.hexes.map((h) => `${h.id}:${h.pip}`).join(" ");
  assert.equal(pips(game), pips(createGame({ ...opts, numberTokens })), `${tag}: the board is the ${numberTokens} deal for its seed`);
  assert.notEqual(pips(game), pips(createGame({ ...opts, numberTokens: OTHER[numberTokens] })), `${tag}: the board is not the ${OTHER[numberTokens]} deal`);
}
// Three seats at a new table: the host's welcome, two guests, and every seat's first full seat list.
async function table(port, numberTokens) {
  const a = await seated(port, { name: "Ember", ...(numberTokens ? { numberTokens } : {}) });
  const code = a.welcome.code;
  const b = await seated(port, { code, name: "Tide" });
  const c = await seated(port, { code, name: "Pine" });
  return { code, peers: [a, b, c] };
}
async function begin(t) {
  for (const p of t.peers) p.send({ type: "ready", value: true });
  await t.peers[0].next("seats", (m) => m.seats.length === 3 && m.seats.every((s) => s.ready));
  t.peers[0].send({ type: "start" });
  for (const p of t.peers) await p.next("state");
}
// A room file in the shape a host from before the setting wrote: no `numberTokens` field at all.
function legacyRoom(code, phase) {
  const game = phase ? createGame({ humans: HUMANS, bots: 0, seed: 77, wayfarerMode: "on", numberTokens: "random" }) : null;
  if (game) {
    game.rollOff = null; game.current = "p0"; game.log = []; game.phase = phase;
    if (phase === "over") game.winner = "p0";
  }
  const seats = HUMANS.map((h, i) => ({ id: `s${i}`, name: h.name, color: PLAYER_COLORS[i], ready: !game, pid: game ? `p${i}` : undefined, secret: `fixture-${code}-${i}` }));
  const room = { code, host: "s0", next: 3, chat: [], chatSeq: 0, game, seats, shape: 2, savedAt: Date.now(), wayfarerMode: "on", victoryTarget: 10 };
  writeFileSync(roomFile(code), JSON.stringify(room));
  return room;
}
const rejoin = (port, code, i) => seated(port, { code, secret: `fixture-${code}-${i}` });

try {
  let port = await start();

  // 1. Default, Random, and refused values.
  const plain = await table(port);
  const random = await table(port, "random");
  const official = await table(port, "official");
  for (const [t, want] of [[plain, "official"], [random, "random"], [official, "official"]]) {
    for (const p of t.peers) {
      assert.equal(p.welcome.numberTokens, want, `${t.code}: every welcome says ${want}`);
      assert.equal((await p.next("seats", (m) => m.seats.length === 3)).numberTokens, want, `${t.code}: every seat list says ${want}`);
    }
  }
  console.log(`open: no setting opens Official spiral (${plain.code}); Random (${random.code}) and Official spiral (${official.code}) are kept; all three seats hear it`);
  for (const bad of ["spiral", "Random", "", null, 1, true, ["random"]]) {
    const c = await client(port, { name: "Odd", numberTokens: bad });
    assert.equal((await c.next("error")).message, "Choose Official spiral or Random number tokens.", `${JSON.stringify(bad)} is refused`);
    await wait(30);
    assert.ok(!c.inbox.some((m) => m.type === "welcome"), `${JSON.stringify(bad)} opens no table`);
  }
  console.log("refused: seven other values open no table");

  // 2. Only the host changes it, with setNumberTokens. A joiner's hello field and a stray field change nothing.
  const late = await client(port, { code: random.code, name: "Late", numberTokens: "official" });
  assert.equal((await late.next("error")).message, "The host chooses the number tokens in the lobby.");
  const [hostSeat, guest] = random.peers;
  guest.send({ type: "setNumberTokens", value: "official" });
  assert.equal((await guest.next("error")).message, "Only the host can choose the number tokens.");
  for (const p of [hostSeat, guest]) {
    p.send({ type: "ready", value: true, numberTokens: "official" });
    assert.equal((await p.next("error")).message, "The host chooses the number tokens in the lobby.");
  }
  for (const bad of ["spiral", "", null, 1, ["random"]]) {
    hostSeat.send({ type: "setNumberTokens", value: bad });
    assert.equal((await hostSeat.next("error")).message, "Choose Official spiral or Random number tokens.", `${JSON.stringify(bad)} is refused`);
  }
  await wait(60);
  assert.equal((await saved(random.code, (s) => s.seats.length === 3)).numberTokens, "random", "refused changes leave Random");
  hostSeat.send({ type: "setNumberTokens", value: "official" });
  for (const p of random.peers) assert.equal((await p.next("seats", (m) => m.numberTokens === "official")).numberTokens, "official", "every seat hears the host's change");
  assert.equal((await saved(random.code, (s) => s.numberTokens === "official")).numberTokens, "official", "the change is saved");
  hostSeat.send({ type: "setNumberTokens", value: "random" });
  for (const p of random.peers) await p.next("seats", (m) => m.numberTokens === "random");
  for (const p of random.peers) p.inbox.length = 0;
  assert.equal((await saved(random.code, (s) => s.seats.length === 3 && s.numberTokens === "random")).numberTokens, "random", "the lobby is saved with Random");
  assert.equal((await saved(plain.code, (s) => s.seats.length === 3)).numberTokens, "official", "the lobby is saved with Official spiral");
  console.log("lobby: only the host changes it, every seat hears it, bad values and stray fields change nothing; both lobbies are saved with it");

  // 3. The started board follows the setting, and is saved with it.
  await begin(plain);
  await begin(random);
  const plainSaved = await saved(plain.code, (s) => s.game);
  const randomSaved = await saved(random.code, (s) => s.game);
  assert.equal(plainSaved.numberTokens, "official");
  assert.equal(randomSaved.numberTokens, "random");
  dealtBy(plainSaved.game, "official", plain.code);
  dealtBy(randomSaved.game, "random", random.code);
  for (const p of random.peers) assert.equal(p.state.game.hexes.map((h) => h.pip).join(), randomSaved.game.hexes.map((h) => h.pip).join(), "every seat sees the saved board");
  random.peers[0].send({ type: "setNumberTokens", value: "official" });
  assert.equal((await random.peers[0].next("error")).message, "Number tokens are fixed for this game.", "the host can't change it mid-game");
  const watcher = await seated(port, { code: random.code, watch: true });
  assert.equal(watcher.welcome.numberTokens, "random", "a watcher hears the setting");
  console.log("start: each board is its setting's deal for the saved seed, every seat sees it, and a watcher hears the setting");

  // 4. A restart keeps it; rooms from before the setting load as Random.
  legacyRoom("OLDL", null);
  const before = legacyRoom("OLDG", "main");
  writeFileSync(roomFile("ODDS"), JSON.stringify({ ...legacyRoom("ODDS", null), numberTokens: "spiral" }));
  await stop();
  port = await start();
  for (const [code, want] of [[plain.code, "official"], [random.code, "random"], ["OLDG", "random"], ["ODDS", "random"]]) {
    const secrets = JSON.parse(readFileSync(roomFile(code), "utf8")).seats.map((s) => s.secret);
    for (const secret of secrets) {
      const p = await seated(port, { code, secret });
      assert.equal(p.welcome.numberTokens, want, `${code}: the restarted host says ${want}`);
      assert.equal((await p.next("seats")).numberTokens, want, `${code}: its seat list says ${want}`);
    }
  }
  await wait(200);
  const oldGame = JSON.parse(readFileSync(roomFile("OLDG"), "utf8"));
  assert.ok(!("numberTokens" in oldGame), "an old room in play is saved as it was, with no field, which reads as Random");
  assert.deepEqual(oldGame.game.hexes, before.game.hexes, "an old room's dealt board is untouched");
  assert.ok(!("numberTokens" in JSON.parse(readFileSync(roomFile("ODDS"), "utf8"))), "a bad value is dropped, not kept");
  console.log("restart: Official spiral and Random tables keep it; an old lobby, an old game and a bad value load as Random; the old board is untouched");

  // An old lobby that starts after the restart deals at random.
  const oldLobby = [];
  for (let i = 0; i < 3; i++) oldLobby.push(await rejoin(port, "OLDL", i));
  for (const p of oldLobby) assert.equal(p.welcome.numberTokens, "random", "an old lobby says Random after the restart");
  await begin({ code: "OLDL", peers: oldLobby });
  dealtBy((await saved("OLDL", (s) => s.game)).game, "random", "OLDL");
  console.log("old lobby: its first game is a Random deal");

  // 5. A rematch keeps the setting, both ways.
  for (const [code, numberTokens] of [["REMO", "official"], ["REMR", "random"]]) {
    const room = legacyRoom(code, "over");
    writeFileSync(roomFile(code), JSON.stringify({ ...room, numberTokens }));
  }
  await stop();
  port = await start();
  for (const [code, numberTokens] of [["REMO", "official"], ["REMR", "random"]]) {
    const seats = [];
    for (let i = 0; i < 3; i++) seats.push(await rejoin(port, code, i));
    const old = (await saved(code, () => true)).game.seed;
    seats[0].send({ type: "again" });
    for (const p of seats) await p.next("state", (m) => m.game.phase !== "over");
    const next = await saved(code, (s) => s.game.phase !== "over" && s.game.seed !== old);
    assert.equal(next.numberTokens, numberTokens, `${code}: the rematch keeps ${numberTokens}`);
    dealtBy(next.game, numberTokens, `${code} rematch`);
    assert.equal((await seats[1].next("seats", () => true)).numberTokens, numberTokens, `${code}: a guest still hears ${numberTokens}`);
  }
  // After a game, the host may pick the other setting for the rematch.
  const room = legacyRoom("REMC", "over");
  writeFileSync(roomFile("REMC"), JSON.stringify({ ...room, numberTokens: "official" }));
  await stop();
  port = await start();
  const after = [];
  for (let i = 0; i < 3; i++) after.push(await rejoin(port, "REMC", i));
  after[0].send({ type: "setNumberTokens", value: "random" });
  for (const p of after) await p.next("seats", (m) => m.numberTokens === "random");
  const oldSeed = (await saved("REMC", (s) => s.numberTokens === "random")).game.seed;
  after[0].send({ type: "again" });
  for (const p of after) await p.next("state", (m) => m.game.phase !== "over");
  const picked = await saved("REMC", (s) => s.game.phase !== "over" && s.game.seed !== oldSeed);
  assert.equal(picked.numberTokens, "random", "the rematch uses the host's new pick");
  dealtBy(picked.game, "random", "REMC rematch");
  console.log("rematch: Official spiral and Random tables deal the next game the same way, and a host's pick after the game deals the next one");

  console.log("number-tokens-prove: all passed");
} finally {
  await stop();
}
