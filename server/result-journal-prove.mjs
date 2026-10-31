// #889: the durable terminal outcome journal and startup repair, on a real host over sockets.
// Every finished tracked game goes out only after its final room snapshot (with the frozen outcome) and then its
// independent pending outcome are on disk. Each scenario seeds a room one move from the win, in fresh temp folders.
//  1. Terminal paths: a human's move, a turn timer, a practice bot, a takeover bot and a rejoin each publish the final
//     state only once room and pending outcome are durable, and the outcome keeps the frozen roster (a taken-over seat
//     stays human and is marked assisted).
//  2. Write failures before and after the room and the journal commit: the table hears "Couldn't save the result.
//     Retrying…", no final state goes out and `again` is refused until both commits land, then it plays on.
//  3. Process exits before and after each commit: before the room commit nothing is fabricated and the game resumes;
//     after it, startup repairs the missing pending outcome from the room (the same frozen outcome) before it listens.
//  4. Rematch: refused while the outcome is unsaved; once saved, the new game, its new UUID and roster are on disk
//     before its first state; the old pending outcome stays.
//  5. Durable start: a failed start write refuses the start and keeps the lobby; a crash after it restores the new game.
//  6. A stale nonterminal snapshot of a finished game is fenced at startup and never resumes.
//  7. Room deletion (the last seat let go) and startup expiry leave the pending outcome in place.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, totalVP } from "../src/lib/game/rules.ts";

const dirs = [];
const hosts = new Set();
process.on("exit", () => {
  for (const h of hosts) h.kill("SIGKILL");
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
setTimeout(() => {
  console.log("FAIL the proof ran past 150 s");
  process.exit(1);
}, 150_000).unref();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function folders() {
  const root = mkdtempSync(path.join(tmpdir(), "emberisle-journal-"));
  dirs.push(root);
  mkdirSync(path.join(root, "rooms"));
  return { rooms: path.join(root, "rooms"), profiles: path.join(root, "profiles"), results: path.join(root, "pending") };
}

// p0 to move in `main` with nothing in hand; p1 holds enough point fortunes that it wins as its turn starts, so p0's pass
// (by hand, by timer or by bot) is the winning transition for p1.
function seedGame() {
  let g = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 17 });
  while (g.phase !== "roll") {
    const r = applyAction(g, g.current, chooseBotAction(g, g.current));
    assert.ifError(r.error);
    g = r.state;
  }
  g.players.sort((a, b) => a.id.localeCompare(b.id));
  for (const p of g.players) for (const k of Object.keys(p.resources)) p.resources[k] = 0;
  g.players[1].hidden.vp = 10;
  g.current = "p0";
  g.phase = "main";
  return g;
}

// A saved room as host.mjs writes it, with a frozen roster (#764). `bots` are practice-bot seats; `taken` are held human
// seats the bot is already playing (takeover while nobody was connected).
function seedRoom(d, code, { bots = [], taken = [], savedAt = Date.now() } = {}) {
  const game = seedGame();
  for (const p of game.players) if (bots.includes(p.id) || taken.includes(p.id)) p.kind = "bot";
  const seats = game.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `${code}-${p.id}`, ...(bots.includes(p.id) ? { bot: true } : {}) }));
  const gameId = randomUUID();
  const roster = {
    v: 1,
    gameId,
    startedAt: Date.now() - 60_000,
    policy: 1,
    eligible: seats.filter((s) => !s.bot).length >= 2,
    players: seats.map((s) => ({ pid: s.pid, seat: s.id, profileId: null, name: s.name, color: s.color, kind: s.bot ? "bot" : "human" })),
  };
  const room = { code, host: "s0", next: 3, chat: [], chatSeq: 0, game, seats, roster, recoveryPids: taken, assisted: taken, shape: 2, savedAt };
  const text = JSON.stringify(room);
  writeFileSync(path.join(d.rooms, `${code}.json`), text);
  return { gameId, text };
}

function start(d, env = {}) {
  const h = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR: d.rooms, PROFILES_DIR: d.profiles, RESULTS_DIR: d.results, ACT_CAP: "1000", ACT_RATE: "1000", GRACE_MS: "60000", HOLD_MS: "60000", TURN_MS: "60000", RESULT_FAULT: "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  hosts.add(h);
  const host = { proc: h, out: "", err: "" };
  h.stdout.on("data", (x) => (host.out += x));
  h.stderr.on("data", (x) => (host.err += x));
  host.exited = new Promise((r) => h.once("exit", (c, sig) => (hosts.delete(h), r(sig ?? c))));
  host.port = new Promise((resolve, reject) => {
    h.stdout.on("data", () => {
      const m = host.out.match(/listening (\d+)/);
      if (m) resolve(Number(m[1]));
    });
    host.exited.then((c) => reject(new Error(`host exited ${c} before listening: ${host.err}`)));
  });
  host.stop = async () => {
    h.kill("SIGKILL");
    await host.exited;
  };
  return host;
}

// A raw table socket. `check` runs at the moment the first `over` state arrives, so it sees the disk as it was then.
async function client(port, hello, check = () => null) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, state: null, states: [], logs: [], errors: [], welcome: null, atOver: null, waiters: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "welcome") c.welcome = m;
    if (m.type === "state") {
      if (m.game.phase === "over" && !c.atOver) c.atOver = check();
      c.state = m;
      c.states.push(m);
    }
    if (m.type === "log") c.logs.push(m.text);
    if (m.type === "error") c.errors.push(m.message);
    for (const w of c.waiters.splice(0)) w();
  });
  c.until = (ok, label, ms = 8000) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out: ${label} (phase ${c.state?.game.phase}, errors ${JSON.stringify(c.errors)}, log ${JSON.stringify(c.logs.slice(-4))})`)), ms);
      const look = () => (ok() ? (clearTimeout(t), resolve()) : c.waiters.push(look));
      look();
    });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.act = (m) => c.send({ ...m, cid: randomUUID(), turn: c.state.actionStamp.turn, baseSeq: c.state.actionStamp.baseSeq, connection: c.state.actionStamp.connection });
  await new Promise((r, j) => (ws.once("open", r), ws.once("error", j)));
  c.send(hello);
  return c;
}
const every = (cs, ok, label) => Promise.all(cs.map((c) => c.until(() => ok(c), label)));
const rejoin = (port, code, pid, check) => client(port, { type: "hello", code, secret: `${code}-${pid}` }, check);

const pendingFile = (d, id) => path.join(d.results, `${id}.json`);
const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));
// What the disk holds at the moment of publication: the room's phase and outcome, and the pending outcome.
const diskAt = (d, code, id) => () => {
  const room = readJson(path.join(d.rooms, `${code}.json`));
  return { phase: room.game.phase, outcome: room.outcome, pending: existsSync(pendingFile(d, id)) ? readJson(pendingFile(d, id)) : null };
};

function checkOutcome(o, gameId, want = {}) {
  assert.equal(o.gameId, gameId);
  assert.equal(o.winner, "p1", "the rules engine's winner");
  assert.deepEqual(o.players.map((p) => p.pid), ["p0", "p1", "p2"], "one row per starting player, in game order");
  assert.equal(o.players.find((p) => p.won).pid, "p1");
  assert(o.players[1].points >= 10, "the winner's final points");
  assert(o.endedAt >= o.startedAt);
  for (const [pid, w] of Object.entries(want)) {
    const row = o.players.find((p) => p.pid === pid);
    for (const [k, v] of Object.entries(w)) assert.equal(row[k], v, `${pid}.${k}`);
  }
}

// The final state reached a seat only once the room and the pending outcome were both on disk, and they agree.
function publishedDurably(c, gameId, want) {
  assert(c.atOver, "the final state was published");
  assert.equal(c.atOver.phase, "over", "the room on disk was terminal when the final state went out");
  assert(c.atOver.pending, "the pending outcome was on disk when the final state went out");
  assert.deepEqual(c.atOver.outcome, c.atOver.pending, "room and journal hold the same frozen outcome");
  checkOutcome(c.atOver.pending, gameId, want);
}

const results = [];
async function scenario(name, fn) {
  const t = Date.now();
  await fn();
  results.push(name);
  console.log(`${name}: ok (${Date.now() - t} ms)`);
}

try {
  // 1. Terminal paths.
  await scenario("human win", async () => {
    const d = folders();
    const { gameId } = seedRoom(d, "HUMN");
    const h = start(d);
    const port = await h.port;
    assert(h.out.indexOf("results: 0 pending") < h.out.indexOf("listening"), "startup reconciles before it listens");
    const a = await rejoin(port, "HUMN", "p0", diskAt(d, "HUMN", gameId));
    const b = await rejoin(port, "HUMN", "p1", diskAt(d, "HUMN", gameId));
    await a.until(() => a.state, "p0 state");
    await b.until(() => b.state, "p1 state");
    a.act({ type: "pass" });
    await a.until(() => a.state.game.phase === "over", "the win at p0");
    await b.until(() => b.state.game.phase === "over", "the win at p1");
    publishedDurably(a, gameId, { p0: { kind: "human", assisted: false }, p1: { kind: "human", won: true } });
    publishedDurably(b, gameId);
    assert.equal(a.states.filter((s) => s.game.phase === "over").length, 1, "one final state per seat");
    // A watcher arriving now gets the final state at once.
    const w = await client(port, { type: "hello", code: "HUMN", watch: true });
    await w.until(() => w.state?.game.phase === "over", "the watcher's final state");
    await h.stop();
  });

  await scenario("timer win", async () => {
    const d = folders();
    const { gameId } = seedRoom(d, "TIMR");
    const h = start(d, { TURN_MS: "700", TURN_TOTAL_MS: "60000" });
    const port = await h.port;
    const a = await rejoin(port, "TIMR", "p0", diskAt(d, "TIMR", gameId));
    await a.until(() => a.state?.game.phase === "over", "the timer's pass wins for p1", 6000);
    assert(a.logs.includes("Ember took too long; the table moved on."), "the timer moved");
    publishedDurably(a, gameId, { p0: { kind: "human", assisted: false } });
    await h.stop();
  });

  await scenario("bot win", async () => {
    const d = folders();
    const { gameId } = seedRoom(d, "BOTW", { bots: ["p0"] });
    const h = start(d);
    const port = await h.port;
    const b = await rejoin(port, "BOTW", "p1", diskAt(d, "BOTW", gameId));
    await b.until(() => b.state?.game.phase === "over", "the practice bot's pass wins for p1");
    publishedDurably(b, gameId, { p0: { kind: "bot", assisted: false } });
    await h.stop();
  });

  await scenario("takeover win", async () => {
    const d = folders();
    const { gameId } = seedRoom(d, "TAKE");
    const h = start(d, { GRACE_MS: "400" });
    const port = await h.port;
    const a = await rejoin(port, "TAKE", "p0");
    const b = await rejoin(port, "TAKE", "p1", diskAt(d, "TAKE", gameId));
    await a.until(() => a.state, "p0 state");
    a.ws.close();
    await b.until(() => b.state?.game.phase === "over", "the takeover bot's pass wins for p1", 6000);
    assert(b.logs.includes("Ember is played by the bot until they return."), "the bot took over");
    // The frozen roster keeps the seat human; the takeover is marked as assistance.
    publishedDurably(b, gameId, { p0: { kind: "human", name: "Ember", assisted: true } });
    await h.stop();
  });

  await scenario("rejoin win", async () => {
    const d = folders();
    const { gameId } = seedRoom(d, "REJN", { taken: ["p0"] });
    const h = start(d);
    const port = await h.port;
    const b = await rejoin(port, "REJN", "p1", diskAt(d, "REJN", gameId));
    await b.until(() => b.state?.game.phase === "over", "the rejoin runs the waiting bot to p1's win");
    publishedDurably(b, gameId, { p0: { kind: "human", assisted: true } });
    // The seat that comes back after the win gets the saved final state at once, and nothing is journalled twice.
    const a = await rejoin(port, "REJN", "p0");
    await a.until(() => a.state?.game.phase === "over", "p0 back after the win");
    assert.deepEqual(readdirSync(d.results).filter((n) => n.endsWith(".json")), [`${gameId}.json`]);
    await h.stop();
  });

  // 2. Write failures before and after each commit: retried with the same frozen outcome, nothing published meanwhile.
  for (const fault of ["room-before:fail:2", "room-after:fail:2", "journal-before:fail:2", "journal-after:fail:2"]) {
    await scenario(`write failure ${fault}`, async () => {
      const d = folders();
      const { gameId } = seedRoom(d, "FAIL");
      const h = start(d, { RESULT_FAULT: fault });
      const port = await h.port;
      const a = await rejoin(port, "FAIL", "p0", diskAt(d, "FAIL", gameId));
      const b = await rejoin(port, "FAIL", "p1");
      const c = await rejoin(port, "FAIL", "p2");
      await every([a, b, c], (x) => x.state, "states");
      a.act({ type: "pass" });
      await a.until(() => a.logs.includes("Couldn't save the result. Retrying…"), "the retry notice");
      assert.notEqual(a.state.game.phase, "over", "no final state while the result is unsaved");
      // A stale intent's resync and the host's again are both held back too.
      a.act({ type: "pass" });
      a.send({ type: "again" });
      await a.until(() => a.errors.includes("Couldn't save the result. Retrying…"), "again refused while unsaved");
      assert.notEqual(a.state.game.phase, "over", "the resync did not carry the final state");
      await a.until(() => a.state.game.phase === "over", "the final state after the retries", 6000);
      publishedDurably(a, gameId);
      const endedAt = a.atOver.pending.endedAt;
      // Once it is durable, the rematch goes ahead.
      a.send({ type: "again" });
      await a.until(() => a.state.game.phase !== "over", "the rematch after the save");
      assert.equal(readJson(pendingFile(d, gameId)).endedAt, endedAt, "retries reused the first frozen outcome");
      await h.stop();
    });
  }

  // 3. Process exits before and after each commit.
  for (const point of ["room-before", "room-after", "journal-before", "journal-after"]) {
    await scenario(`crash at ${point}`, async () => {
      const d = folders();
      const { gameId } = seedRoom(d, "CRSH");
      let h = start(d, { RESULT_FAULT: `${point}:exit` });
      let port = await h.port;
      const a = await rejoin(port, "CRSH", "p0");
      await a.until(() => a.state, "p0 state");
      a.act({ type: "pass" });
      await h.exited;
      assert.notEqual(a.state.game.phase, "over", "the host died before any final state went out");
      const room = readJson(path.join(d.rooms, "CRSH.json"));
      const roomDurable = point !== "room-before";
      assert.equal(room.game.phase === "over", roomDurable, `the room on disk after a crash at ${point}`);
      assert.equal(existsSync(pendingFile(d, gameId)), point === "journal-after", `the journal on disk after a crash at ${point}`);
      h = start(d);
      port = await h.port;
      const repairedAt = h.out.indexOf("results: repaired the pending outcome");
      if (point === "room-after" || point === "journal-before") {
        assert(repairedAt >= 0 && repairedAt < h.out.indexOf("listening"), "startup repaired the journal from the terminal room before it listened");
        assert.deepEqual(readJson(pendingFile(d, gameId)), room.outcome, "the repaired outcome is the room's frozen one");
      } else assert.equal(repairedAt, -1, "nothing to repair");
      const b = await rejoin(port, "CRSH", "p0", diskAt(d, "CRSH", gameId));
      await b.until(() => b.state, "p0 back");
      if (!roomDurable) {
        // No fabricated result: the game resumes where the durable room left it, and the win is played again.
        assert.equal(b.state.game.phase, "main");
        assert(!existsSync(pendingFile(d, gameId)), "no pending outcome was invented");
        b.act({ type: "pass" });
        await b.until(() => b.state.game.phase === "over", "the replayed win");
      }
      publishedDurably(b, gameId);
      assert.match(h.out, roomDurable ? /results: 1 pending outcome\(s\) kept for recording/ : /results: 0 pending outcome\(s\)/, "the startup line counts the journal");
      await h.stop();
    });
  }

  // 4 and 5. Durable start and rematch, from a real lobby.
  async function lobby(port) {
    const a = await client(port, { type: "hello", name: "Ember" });
    await a.until(() => a.welcome, "table open");
    const code = a.welcome.code;
    const b = await client(port, { type: "hello", code, name: "Tide" });
    const c = await client(port, { type: "hello", code, name: "Pine" });
    await b.until(() => b.welcome, "b seated");
    await c.until(() => c.welcome, "c seated");
    for (const x of [a, b, c]) x.send({ type: "ready", value: true });
    await sleep(150);
    return { code, all: [a, b, c] };
  }

  await scenario("durable start", async () => {
    const d = folders();
    let h = start(d, { RESULT_FAULT: "start-before:fail" });
    let port = await h.port;
    let t = await lobby(port);
    const [a] = t.all;
    a.send({ type: "start" });
    await a.until(() => a.errors.includes("Couldn't save the new game. Try again."), "a failed start write is refused");
    await sleep(300);
    assert(t.all.every((x) => !x.state), "no game message after a failed start write");
    // The next start writes the game, UUID, start time and roster before the first state.
    const seen = [];
    for (const x of t.all) x.ws.on("message", (raw) => JSON.parse(String(raw)).type === "state" && seen.push(readJson(path.join(d.rooms, `${t.code}.json`))));
    a.send({ type: "start" });
    await a.until(() => a.state, "the started game");
    assert(seen.length && seen.every((r) => r.roster?.gameId && r.game && r.roster.players.length === 3), "the roster was on disk before the first state");
    await h.stop();

    // A crash right after the start write restores the same game and roster.
    h = start(d, { RESULT_FAULT: "start-after:exit" });
    port = await h.port;
    t = await lobby(port);
    t.all[0].send({ type: "start" });
    await h.exited;
    assert(t.all.every((x) => !x.state), "the host died before the first state");
    const saved = readJson(path.join(d.rooms, `${t.code}.json`));
    assert(saved.game && saved.roster?.gameId, "the started game is on disk");
    h = start(d);
    port = await h.port;
    const back = await client(port, { type: "hello", code: t.code, secret: t.all[0].welcome.secret });
    await back.until(() => back.state, "the restored game");
    assert.equal(readJson(path.join(d.rooms, `${t.code}.json`)).roster.gameId, saved.roster.gameId, "the same game UUID after the restart");
    await h.stop();
  });

  await scenario("rematch", async () => {
    const d = folders();
    const { gameId } = seedRoom(d, "AGIN");
    const h = start(d, { RESULT_FAULT: "start-before:fail" });
    const port = await h.port;
    const all = await Promise.all(["p0", "p1", "p2"].map((p) => rejoin(port, "AGIN", p)));
    await every(all, (x) => x.state, "states");
    const [a] = all;
    a.act({ type: "pass" });
    await every(all, (x) => x.state.game.phase === "over", "the win");
    // A failed write of the new game keeps the finished one in place.
    a.send({ type: "again" });
    await a.until(() => a.errors.includes("Couldn't save the new game. Try again."), "a failed rematch write is refused");
    assert.equal(readJson(path.join(d.rooms, "AGIN.json")).roster.gameId, gameId, "the finished game's roster is still on disk");
    const seen = [];
    a.ws.on("message", (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "state" && m.game.phase !== "over") seen.push(readJson(path.join(d.rooms, "AGIN.json")));
    });
    a.send({ type: "again" });
    await a.until(() => a.state.game.phase === "rollOff", "the rematch");
    const first = seen[0];
    assert(first.roster.gameId !== gameId && first.game.phase === "rollOff" && first.outcome === null, "the new game and its own UUID were durable before its first state");
    assert(existsSync(pendingFile(d, gameId)), "the finished game's pending outcome stays");
    await h.stop();
  });

  // 6. A stale snapshot of a finished game never resumes.
  await scenario("stale snapshot fenced", async () => {
    const d = folders();
    const { gameId, text } = seedRoom(d, "STAL");
    let h = start(d);
    let port = await h.port;
    const a = await rejoin(port, "STAL", "p0");
    await a.until(() => a.state, "p0 state");
    a.act({ type: "pass" });
    await a.until(() => a.state.game.phase === "over", "the win");
    await h.stop();
    // The older, nonterminal snapshot comes back (a restored backup, a lost rename): its game is already finished.
    writeFileSync(path.join(d.rooms, "STAL.json"), text);
    h = start(d);
    port = await h.port;
    assert.match(h.err, new RegExp(`holds game ${gameId} at main, but that game already finished; fenced`));
    assert(h.out.indexOf("1 room(s) fenced") < h.out.indexOf("listening"));
    const b = await rejoin(port, "STAL", "p0");
    await b.until(() => b.errors.length, "the fenced room refuses");
    assert.equal(b.errors[0], "No table with that code");
    assert(existsSync(path.join(d.rooms, "STAL.json.fenced")) && !existsSync(path.join(d.rooms, "STAL.json")), "kept aside for repair");
    assert(existsSync(pendingFile(d, gameId)));
    await h.stop();
  });

  // 7. Room deletion and expiry leave pending outcomes alone.
  await scenario("room deletion keeps the pending outcome", async () => {
    const d = folders();
    const { gameId } = seedRoom(d, "GONE");
    const h = start(d, { HOLD_MS: "1500", GRACE_MS: "60000" });
    const port = await h.port;
    const a = await rejoin(port, "GONE", "p0");
    await a.until(() => a.state, "p0 state");
    a.act({ type: "pass" });
    await a.until(() => a.state.game.phase === "over", "the win");
    a.ws.close();
    // Every seat is held; past HOLD_MS the last human seat is let go and the room and its file are dropped.
    for (let i = 0; i < 60 && existsSync(path.join(d.rooms, "GONE.json")); i++) await sleep(100);
    assert(!existsSync(path.join(d.rooms, "GONE.json")), "the room was dropped");
    assert(existsSync(pendingFile(d, gameId)), "the pending outcome outlived the room");
    await h.stop();
  });

  await scenario("startup repairs before expiry", async () => {
    const d = folders();
    // A finished game whose room is two days old, written before any journal existed: it is repaired, then expired.
    const { gameId } = seedRoom(d, "OLDR", { savedAt: Date.now() - 2 * 24 * 60 * 60 * 1000 });
    const room = readJson(path.join(d.rooms, "OLDR.json"));
    room.game.phase = "over";
    room.game.winner = "p1";
    room.game.current = "p1";
    writeFileSync(path.join(d.rooms, "OLDR.json"), JSON.stringify(room));
    const h = start(d);
    await h.port;
    assert(h.out.indexOf(`repaired the pending outcome of game ${gameId}`) < h.out.indexOf("listening"));
    assert(!existsSync(path.join(d.rooms, "OLDR.json")), "the expired room was dropped");
    const o = readJson(pendingFile(d, gameId));
    checkOutcome(o, gameId);
    assert.equal(o.players[1].points, totalVP(room.game, "p1"));
    await h.stop();
  });

  await scenario("a corrupt pending outcome is repaired from the terminal room", async () => {
    const d = folders();
    const { gameId } = seedRoom(d, "CORR");
    const room = readJson(path.join(d.rooms, "CORR.json"));
    room.game.phase = "over";
    room.game.winner = "p1";
    room.game.current = "p1";
    writeFileSync(path.join(d.rooms, "CORR.json"), JSON.stringify(room));
    mkdirSync(d.results, { recursive: true });
    writeFileSync(pendingFile(d, gameId), "{ not json");
    const h = start(d);
    await h.port;
    assert(h.out.indexOf(`repaired the pending outcome of game ${gameId}`) < h.out.indexOf("listening"), "it is repaired before the host listens");
    const o = readJson(pendingFile(d, gameId));
    checkOutcome(o, gameId);
    assert.equal(o.players[1].points, totalVP(room.game, "p1"));
    await h.stop();
  });

  console.log(`result journal prove ok: ${results.length} scenarios`);
  process.exit(0);
} catch (e) {
  console.log("FAIL", e.stack ?? e.message);
  process.exit(1);
}
