// #890: exactly-once profile results, built on the #889 outcome journal, on a real host over sockets and on the store itself.
// Run from the repo root: node --import ./server/register.mjs server/profile-results-prove.mjs
//  1. A finished game is recorded once: one receipt, every bound player's aggregates, the pending outcome removed only after.
//     Owner-only reads: the record and history are the credential's own, explicit projections, bounded; table sockets,
//     watchers, plaintext links and bad credentials are refused; a client frame cannot claim a result; cards stay public-only.
//  2. Duplicate delivery: the same outcome replayed after its receipt clears the pending file and changes nothing.
//  3. Restart: aggregates and history survive; a stale nonterminal snapshot of a recorded game is fenced by its receipt.
//  4. A conflicting outcome for a recorded game fails closed: reported, nothing changes, the file is kept for repair.
//  5. Crash between the journal write and the profile write: restart replays it once, before listening.
//  6. Crash after the profile write, before the journal removal: restart finds the receipt and only clears the file.
//  7. A failed transaction leaves the store unchanged and the outcome pending, then a retry records it once.
//  8. Which results count: guests, original bots, a bot winner, takeover assistance, one-human games, duplicate bindings and
//     legacy rooms.
//  9. Two rooms finishing together keep both receipts and the right totals.
// 10. On the store: equal-time and late results order streaks deterministically; duplicate, conflicting and refused outcomes;
//     a failed transaction leaves memory unchanged; pages of 20 with a cursor.
// 11. #1650: a signed-in table started from the lobby, whose roll-off reorders the players, killed -9 and restarted right
//     after the roll-off, keeps its frozen roster and is counted for every profile as the same game without a restart.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { toIntent } from "../src/lib/net/table.ts";
import { PROTO } from "../src/lib/net/proto.ts";
import { PLAYER_COLORS } from "../src/lib/game/types.ts";
import { HISTORY_PAGE, openProfiles, ProfileError } from "./profiles.mjs";

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
const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));

function folders() {
  const root = mkdtempSync(path.join(tmpdir(), "emberisle-results-"));
  dirs.push(root);
  mkdirSync(path.join(root, "rooms"));
  return { rooms: path.join(root, "rooms"), profiles: path.join(root, "profiles"), results: path.join(root, "pending") };
}
const storeFile = (d) => path.join(d.profiles, "profiles.json");
const store = (d) => readJson(storeFile(d));
const pendingFile = (d, id) => path.join(d.results, `${id}.json`);

// Profiles and remembered devices written into the private store while no host runs, in the store's own schema (the method
// profile-seat-prove uses). Nobody signs in here, so the PIN verifier is only well formed.
function seedStore(d, names) {
  mkdirSync(d.profiles, { recursive: true });
  const doc = { schemaVersion: 1, profiles: {}, logins: {}, reservedLogins: {}, tombstones: {}, devices: {}, unknownLogins: {} };
  const out = {};
  for (const name of names) {
    const id = randomUUID();
    const login = `${name.toLowerCase()}-${randomBytes(3).toString("hex")}`;
    const now = Date.now();
    doc.profiles[id] = {
      id, displayName: name, login, color: PLAYER_COLORS[1], backupColor: PLAYER_COLORS[0], catchphrase: `${name} says hi`, winSongId: null, mediaKey: null, createdAt: now, updatedAt: now,
      pin: { alg: "scrypt", N: 16384, r: 8, p: 1, salt: randomBytes(16).toString("base64"), hash: randomBytes(32).toString("base64") },
      guard: { times: [], pending: {}, lifetime: 0 },
    };
    doc.logins[login] = id;
    const token = randomBytes(32).toString("base64url");
    doc.devices[createHash("sha256").update(token).digest("hex")] = { profileId: id, createdAt: now, expiresAt: now + 24 * 60 * 60 * 1000 };
    out[name] = { id, token };
  }
  writeFileSync(storeFile(d), JSON.stringify(doc));
  return out;
}

// p0 to move in `main` with nothing in hand; p1 holds enough point fortunes that it wins as its turn starts, so p0's pass
// (by hand or by bot) is the winning transition for p1 (result-journal-prove's seed).
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

// A saved room as host.mjs writes it. `rows` has one entry per player p0..p2: a profile id, "guest", "bot" (a practice bot)
// or { taken: profileId|null } (a human seat the bot already plays). `roster: false` writes a legacy room with none.
function seedRoom(d, code, rows, { roster: withRoster = true } = {}) {
  const game = seedGame();
  const kindOf = (r) => (r === "bot" ? "bot" : "human");
  const profileOf = (r) => (r === "bot" || r === "guest" ? null : typeof r === "object" ? r.taken : r);
  game.players.forEach((p, i) => {
    if (rows[i] === "bot" || typeof rows[i] === "object") p.kind = "bot";
  });
  const taken = game.players.filter((p, i) => typeof rows[i] === "object").map((p) => p.id);
  const seats = game.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `${code}-${p.id}`, ...(rows[i] === "bot" ? { bot: true } : {}), ...(profileOf(rows[i]) ? { profileId: profileOf(rows[i]) } : {}) }));
  const gameId = randomUUID();
  const roster = {
    v: 1,
    gameId,
    startedAt: Date.now() - 60_000,
    policy: 1,
    eligible: rows.filter((r) => kindOf(r) === "human").length >= 2,
    players: seats.map((s, i) => ({ pid: s.pid, seat: s.id, profileId: profileOf(rows[i]), name: s.name, color: s.color, kind: kindOf(rows[i]) })),
  };
  const room = { code, host: "s0", next: 3, chat: [], chatSeq: 0, game, seats, ...(withRoster ? { roster } : {}), recoveryPids: taken, assisted: taken, shape: 2, savedAt: Date.now() };
  const text = JSON.stringify(room);
  writeFileSync(path.join(d.rooms, `${code}.json`), text);
  return { gameId, text };
}

// Proof-only host dice (#1650): each roll-off die takes the next face queued in ROLL_FACES, then the host rolls its own.
const DICE = `data:text/javascript,${encodeURIComponent('const q = (process.env.ROLL_FACES ?? "").split(",").filter(Boolean).map(Number); const own = crypto.getRandomValues.bind(crypto); crypto.getRandomValues = (b) => (q.length && b.length === 1 ? ((b[0] = q.shift() - 1), b) : own(b));')}`;

function start(d, env = {}, preload = []) {
  const h = spawn(process.execPath, ["--import", "./register.mjs", ...preload.flatMap((p) => ["--import", p]), "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR: d.rooms, PROFILES_DIR: d.profiles, RESULTS_DIR: d.results, PROFILES_DEV: "", ACT_CAP: "1000", ACT_RATE: "1000", GRACE_MS: "60000", HOLD_MS: "60000", TURN_MS: "60000", SAVE_MS: "50", RESULT_FAULT: "", ...env },
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

// A raw table socket (result-journal-prove's client).
async function client(port, hello, headers = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
  const c = { ws, state: null, logs: [], errors: [], frames: [], welcome: null, waiters: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    c.frames.push(m);
    if (m.type === "welcome") c.welcome = m;
    if (m.type === "state") c.state = m;
    if (m.type === "log") c.logs.push(m.text);
    if (m.type === "error") c.errors.push(m.message);
    for (const w of c.waiters.splice(0)) w();
  });
  c.until = (ok, label, ms = 8000) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out: ${label} (phase ${c.state?.game.phase}, errors ${JSON.stringify(c.errors)})`)), ms);
      const look = () => (ok() ? (clearTimeout(t), resolve()) : c.waiters.push(look));
      look();
    });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.act = (m) => c.send({ ...m, cid: randomUUID(), turn: c.state.actionStamp.turn, baseSeq: c.state.actionStamp.baseSeq, connection: c.state.actionStamp.connection });
  await new Promise((r, j) => (ws.once("open", r), ws.once("error", j)));
  if (hello) c.send(hello);
  return c;
}
const rejoin = (port, code, pid) => client(port, { type: "hello", code, secret: `${code}-${pid}` });

// A profile request over the Cloudflare tunnel's loopback hop, each from its own client address (profile-seat-prove's gate).
const TUNNEL = "isle-demo.trycloudflare.com";
let nextIp = 1;
const tunnel = () => ({ origin: `https://${TUNNEL}`, host: TUNNEL, "cf-connecting-ip": `10.8.${nextIp++}.1`, "x-forwarded-proto": "https" });
async function ask(port, msg, headers = tunnel()) {
  const c = await client(port, null, headers);
  const id = randomBytes(4).toString("hex");
  c.send({ ...msg, id });
  await c.until(() => c.frames.some((m) => m.id === id), `reply to ${msg.type}`);
  c.ws.close();
  return c.frames.find((m) => m.id === id);
}
const record = async (port, who) => {
  const m = await ask(port, { type: "profileRecord", credential: who.token });
  assert.equal(m.type, "profileRecord", JSON.stringify(m));
  return m.record;
};
const history = async (port, who, before) => {
  const m = await ask(port, { type: "profileHistory", credential: who.token, ...(before === undefined ? {} : { before }) });
  assert.equal(m.type, "profileHistory", JSON.stringify(m));
  return m;
};

async function until(ok, label, ms = 8000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(25)) if (ok()) return;
  throw new Error(`timed out: ${label}`);
}
const receipts = (d) => Object.keys(store(d).receipts ?? {});
const recorded = (d, id) => until(() => !existsSync(pendingFile(d, id)) && receipts(d).includes(id), `game ${id} recorded and its pending outcome removed`);

// Plays p0's winning pass at `code` and waits for the final state.
async function win(port, code, pid = "p0") {
  const a = await rejoin(port, code, pid);
  await a.until(() => a.state, `${code} state`);
  a.act({ type: "pass" });
  await a.until(() => a.state.game.phase === "over", `${code} win`);
  return a;
}

// #1650: a table opened from the lobby, every seat signed in to its own profile, started by its host. `hello` goes on
// every seat's first message (the expanded variant and capability, say).
async function signedInTable(port, who, hello = {}) {
  const cs = [];
  for (const [i, p] of who.entries()) {
    const c = await client(port, { type: "hello", ...hello, ...(i ? { code: cs[0].welcome.code } : {}), name: p.name, credential: p.token }, tunnel());
    await c.until(() => c.welcome || c.errors.length, `${p.name} sits down`);
    assert(c.welcome, `${p.name} sat down: ${JSON.stringify(c.errors)}`);
    cs.push(c);
  }
  for (const c of cs) c.send({ type: "ready", value: true });
  const seats = () => cs[0].frames.findLast((m) => m.type === "seats")?.seats ?? [];
  await cs[0].until(() => seats().length === who.length && seats().every((s) => s.ready), "everyone ready");
  cs[0].send({ type: "start" });
  for (const c of cs) await c.until(() => c.state?.game.phase === "rollOff", "the roll-off");
  return cs;
}

// Every seat acts as the practice bot would, through the host, until the game is over or `stop` holds.
async function playOut(cs, stop = (g) => g.phase === "over") {
  for (let n = 0; !stop(cs[0].state.game); n++) {
    assert(n < 5000, "no winner after 5000 actions");
    const g = cs[0].state.game;
    const c = g.phase === "discard" ? cs.find((x) => x.state.legal.discard > 0) : cs.find((x) => x.state.you === g.current);
    assert(c, `nobody to act at seq ${g.seq} (${g.phase})`);
    // The seat's view hides the deck order and the bot reads only its size.
    const view = { ...c.state.game, deck: Array.from({ length: c.state.game.deckLeft }) };
    for (const action of [chooseBotAction(view, c.state.you) ?? { type: "endTurn" }, { type: "endTurn" }]) {
      const errors = c.errors.length;
      c.act(toIntent(action));
      for (const x of [c, ...cs]) await x.until(() => x.state.game.seq > g.seq || c.errors.length > errors, `${c.state.you} ${action.type} at seq ${g.seq}`);
      if (c.errors.length === errors) break;
      assert(action.type !== "endTurn", `${c.state.you} could not pass at seq ${g.seq}: ${c.errors.at(-1)}`);
    }
  }
}

// What the profile store holds for one finished game, with nothing that differs between two runs of it: per row, the
// name of its profile, its starting name, colour and kind, and whether it won; each profile's games and wins.
function counted(d, gameId, who) {
  const s = store(d);
  return {
    receipts: Object.keys(s.receipts ?? {}).length,
    players: s.results[gameId].players.map((p) => ({ profile: who.find((w) => w.id === p.profileId)?.name, name: p.name, color: p.color, kind: p.kind, won: p.won })),
    records: who.map((p) => ({ name: p.name, games: s.records[p.id]?.games ?? 0, wins: s.records[p.id]?.wins ?? 0, wonHere: s.results[gameId].players.find((r) => r.profileId === p.id)?.won })),
  };
}

const RECORD_KEYS = "games,lastPlayed,losses,streak,winRate,wins";
const ROW_KEYS = "assisted,durationMs,endedAt,gameId,players,points,startedAt,victoryTarget,won";
const PLAYER_KEYS = "color,kind,name,points,won";
const keys = (o) => Object.keys(o).sort().join();

const done = [];
async function scenario(name, fn) {
  const t = Date.now();
  await fn();
  done.push(name);
  console.log(`${name}: ok (${Date.now() - t} ms)`);
}

try {
  // 1-4 share one host folder: one game, then replays, restarts, a stale snapshot and a conflicting outcome.
  const d = folders();
  const P = seedStore(d, ["Ember", "Tide", "Pine"]);
  const { gameId, text: before } = seedRoom(d, "ONCE", [P.Ember.id, P.Tide.id, P.Pine.id]);
  let h;
  let port;

  await scenario("a finished game is recorded once, and only its owner reads it", async () => {
    h = start(d);
    port = await h.port;
    const a = await win(port, "ONCE");
    await recorded(d, gameId);
    const s = store(d);
    assert.deepEqual(Object.keys(s.receipts), [gameId], "one receipt");
    assert.match(s.receipts[gameId].fingerprint, /^[0-9a-f]{64}$/);
    const endedAt = s.results[gameId].endedAt;
    assert.deepEqual(s.records[P.Ember.id], { games: 1, wins: 0, losses: 1, streak: 0, lastPlayed: endedAt, history: [gameId] });
    assert.deepEqual(s.records[P.Tide.id], { games: 1, wins: 1, losses: 0, streak: 1, lastPlayed: endedAt, history: [gameId] });
    assert.deepEqual(s.records[P.Pine.id], { games: 1, wins: 0, losses: 1, streak: 0, lastPlayed: endedAt, history: [gameId] });

    const tide = await record(port, P.Tide);
    assert.equal(keys(tide), RECORD_KEYS, "the record is the explicit aggregate projection");
    assert.deepEqual(tide, { games: 1, wins: 1, losses: 0, winRate: 100, streak: 1, lastPlayed: endedAt });
    assert.deepEqual(await record(port, P.Ember), { games: 1, wins: 0, losses: 1, winRate: 0, streak: 0, lastPlayed: endedAt });
    const page = await history(port, P.Ember);
    assert.equal(page.rows.length, 1);
    assert.equal(page.next, null);
    const row = page.rows[0];
    assert.equal(keys(row), ROW_KEYS, "a history row is the explicit projection");
    assert(row.players.every((p) => keys(p) === PLAYER_KEYS), "other seats show starting name, colour, kind and final points only");
    assert.deepEqual([row.gameId, row.won, row.assisted, row.durationMs], [gameId, false, false, row.endedAt - row.startedAt]);
    assert.equal(row.players[1].won, true);
    const text = JSON.stringify(page);
    for (const x of [P.Ember.id, P.Tide.id, P.Pine.id, "ONCE-p", "secret", "seed", "seat", "pid"]) assert(!text.includes(x), `history carries no ${x}`);

    // Owner-only: any profile id in the request is ignored; bad, missing or foreign-shaped requests are refused.
    assert.deepEqual(await record(port, { token: P.Ember.token, profileId: P.Tide.id }), await record(port, P.Ember));
    const asked = await ask(port, { type: "profileRecord", credential: P.Ember.token, profileId: P.Tide.id });
    assert.equal(asked.record.wins, 0, "a profile id in the request reads nothing of that profile");
    for (const credential of [undefined, null, 42, "x".repeat(43), randomBytes(32).toString("base64url")]) {
      assert.equal((await ask(port, { type: "profileHistory", credential })).code, "signedOut", `credential ${credential}`);
    }
    for (const bad of ["not-a-uuid", 7, { gameId }, randomUUID()]) assert.equal((await ask(port, { type: "profileHistory", credential: P.Ember.token, before: bad })).code, "invalid");
    assert.equal((await ask(port, { type: "profileRecord", credential: P.Ember.token }, {})).code, "https", "a plaintext link gets no record");
    // A seated table socket and a watcher cannot read records, and a client frame cannot claim a result.
    const seatId = randomBytes(4).toString("hex");
    a.send({ type: "profileHistory", id: seatId, credential: P.Ember.token });
    a.send({ type: "result", gameId, winner: "p0" });
    a.send({ type: "profileResult", gameId, winner: "p0", credential: P.Ember.token });
    await a.until(() => a.frames.some((m) => m.id === seatId), "the seat's refusal");
    assert.equal(a.frames.find((m) => m.id === seatId).code, "tableSocket");
    const w = await client(port, { type: "hello", code: "ONCE", watch: true });
    await w.until(() => w.state, "watcher state");
    w.send({ type: "profileRecord", credential: P.Ember.token });
    await w.until(() => w.errors.includes("Watching only."), "the watcher's refusal");
    assert(!w.frames.some((m) => m.type === "profileRecord"));
    // Public cards stay the public allowlist after a result.
    const cardId = randomBytes(4).toString("hex");
    a.send({ type: "tableProfileCard", id: cardId, profileId: P.Tide.id });
    await a.until(() => a.frames.some((m) => m.id === cardId), "card");
    assert.equal(keys(a.frames.find((m) => m.id === cardId).card), "catchphrase,displayName,profileId", "a card exposes no record or history");
    // A seat coming back after the win sees the final state, and nothing is recorded again.
    const c = await rejoin(port, "ONCE", "p2");
    await c.until(() => c.state?.game.phase === "over", "p2 back after the win");
    await sleep(200);
    assert.deepEqual(store(d).records, s.records, "the spoofed frames and the late rejoin changed nothing");
    assert.equal(h.out.split(`results: recorded game ${gameId}`).length - 1, 1, "recorded exactly once");
    await h.stop();
  });

  await scenario("duplicate delivery clears the file and changes nothing", async () => {
    const was = store(d);
    const outcome = readJson(path.join(d.rooms, "ONCE.json")).outcome;
    writeFileSync(pendingFile(d, gameId), JSON.stringify(outcome));
    h = start(d);
    port = await h.port;
    const cleared = h.out.indexOf(`results: game ${gameId} was already recorded; its pending outcome is cleared`);
    assert(cleared >= 0 && cleared < h.out.indexOf("listening"), "the replay ran before the host listened");
    assert(!existsSync(pendingFile(d, gameId)));
    assert.deepEqual(store(d).records, was.records, "aggregates unchanged");
    assert.deepEqual(store(d).receipts, was.receipts, "the receipt unchanged");
    // Aggregates and history survive the restart.
    assert.equal((await record(port, P.Tide)).wins, 1);
    assert.equal((await history(port, P.Pine)).rows[0].gameId, gameId);
    await h.stop();
  });

  await scenario("a stale snapshot of a recorded game is fenced by its receipt", async () => {
    assert(!existsSync(pendingFile(d, gameId)), "no pending file: only the receipt knows this game finished");
    writeFileSync(path.join(d.rooms, "ONCE.json"), before);
    h = start(d);
    port = await h.port;
    await until(() => h.err.includes(`holds game ${gameId} at main, but that game already finished; fenced`), "the stale snapshot is fenced");
    const b = await rejoin(port, "ONCE", "p0");
    await b.until(() => b.errors.length, "the fenced room refuses");
    assert.equal(b.errors[0], "No table with that code");
    assert.equal((await record(port, P.Ember)).games, 1);
    await h.stop();
  });

  await scenario("a conflicting outcome for a recorded game fails closed", async () => {
    const was = store(d);
    const forged = { ...readJson(path.join(d.rooms, "ONCE.json.fenced")).roster };
    const outcome = { v: 1, gameId, startedAt: forged.startedAt, endedAt: Date.now(), policy: 1, eligible: true, victoryTarget: 10, winner: "p0", players: forged.players.map((p) => ({ ...p, points: p.pid === "p0" ? 10 : 2, won: p.pid === "p0", assisted: false })) };
    writeFileSync(pendingFile(d, gameId), JSON.stringify(outcome));
    for (let i = 0; i < 2; i++) {
      h = start(d);
      port = await h.port;
      // stderr is its own pipe, so its line may arrive after "listening" on stdout.
      await until(() => h.err.includes(`results: game ${gameId} does not match its recorded receipt; nothing changed`), "the conflict is reported");
      assert(existsSync(pendingFile(d, gameId)), "kept for repair");
      assert.deepEqual(store(d).records, was.records);
      assert.deepEqual(store(d).receipts, was.receipts);
      assert.deepEqual(await record(port, P.Ember), { games: 1, wins: 0, losses: 1, winRate: 0, streak: 0, lastPlayed: was.records[P.Ember.id].lastPlayed });
      await h.stop();
    }
  });

  await scenario("a crash between the journal write and the profile write replays once", async () => {
    const d = folders();
    const P = seedStore(d, ["Ember", "Tide", "Pine"]);
    const { gameId } = seedRoom(d, "CRSH", [P.Ember.id, P.Tide.id, "guest"]);
    let h = start(d, { RESULT_FAULT: "receipt-before:exit" });
    let port = await h.port;
    const a = await rejoin(port, "CRSH", "p0");
    await a.until(() => a.state, "state");
    a.act({ type: "pass" });
    await h.exited;
    assert(existsSync(pendingFile(d, gameId)), "the pending outcome is durable");
    assert.equal(store(d).receipts, undefined, "nothing reached the profile store");
    for (let i = 0; i < 2; i++) {
      h = start(d);
      port = await h.port;
      const at = h.out.indexOf(`results: recorded game ${gameId}`);
      assert.equal(at >= 0 && at < h.out.indexOf("listening"), i === 0, i === 0 ? "the restart replayed it before listening" : "a second restart records nothing");
      assert(!existsSync(pendingFile(d, gameId)));
      assert.deepEqual(receipts(d), [gameId]);
      assert.deepEqual(await record(port, P.Tide), { games: 1, wins: 1, losses: 0, winRate: 100, streak: 1, lastPlayed: store(d).results[gameId].endedAt });
      assert.equal((await record(port, P.Ember)).losses, 1);
      await h.stop();
    }
  });

  await scenario("a crash after the profile write finds the receipt and only clears the file", async () => {
    const d = folders();
    const P = seedStore(d, ["Ember", "Tide"]);
    const { gameId } = seedRoom(d, "AFTR", [P.Ember.id, P.Tide.id, "bot"]);
    let h = start(d, { RESULT_FAULT: "receipt-after:exit" });
    let port = await h.port;
    const a = await rejoin(port, "AFTR", "p0");
    await a.until(() => a.state, "state");
    a.act({ type: "pass" });
    await h.exited;
    assert(existsSync(pendingFile(d, gameId)) && receipts(d).includes(gameId), "both the pending outcome and the receipt are on disk");
    const was = store(d).records;
    h = start(d);
    port = await h.port;
    const at = h.out.indexOf(`results: game ${gameId} was already recorded`);
    assert(at >= 0 && at < h.out.indexOf("listening"));
    assert(!existsSync(pendingFile(d, gameId)));
    assert.deepEqual(store(d).records, was, "counted once");
    assert.equal((await record(port, P.Tide)).games, 1);
    await h.stop();
  });

  await scenario("a failed transaction leaves the store unchanged and the outcome pending", async () => {
    const d = folders();
    const P = seedStore(d, ["Ember", "Tide", "Pine"]);
    const { gameId } = seedRoom(d, "FAIL", [P.Ember.id, P.Tide.id, P.Pine.id]);
    const h = start(d, { RESULT_FAULT: "receipt-before:fail:3" });
    const port = await h.port;
    await win(port, "FAIL");
    // The first attempts fail inside the transaction, after its copy was changed: the live store and the file are untouched.
    assert.deepEqual(await record(port, P.Tide), { games: 0, wins: 0, losses: 0, winRate: null, streak: 0, lastPlayed: null });
    assert.deepEqual((await history(port, P.Tide)).rows, []);
    assert(existsSync(pendingFile(d, gameId)), "kept for retry");
    assert.equal(store(d).receipts, undefined);
    await recorded(d, gameId);
    assert.equal(h.err.split(`results: recording game ${gameId} failed (injected fault at receipt-before); kept for retry`).length - 1, 3);
    assert.deepEqual(await record(port, P.Tide), { games: 1, wins: 1, losses: 0, winRate: 100, streak: 1, lastPlayed: store(d).results[gameId].endedAt });
    await h.stop();
  });

  await scenario("which results count", async () => {
    const d = folders();
    const P = seedStore(d, ["Ash", "Brook", "Cove", "Dune", "Elm"]);
    const elig = seedRoom(d, "ELIG", ["guest", P.Brook.id, "bot"]).gameId; // a guest makes two humans; only Brook is credited
    const solo = seedRoom(d, "SOLO", [P.Ash.id, "bot", "bot"]).gameId; // one human: not counted
    const botw = seedRoom(d, "BOTW", [P.Cove.id, "bot", P.Dune.id]).gameId; // a bot wins: both profiles lose
    const take = seedRoom(d, "TAKE", [{ taken: P.Elm.id }, "guest", "guest"]).gameId; // the bot finishes for Elm; a guest wins
    const dupl = seedRoom(d, "DUPL", [P.Ash.id, P.Ash.id, "guest"]).gameId; // a profile bound twice: the roster is refused
    const lgcy = seedRoom(d, "LGCY", [P.Ash.id, P.Brook.id, "guest"], { roster: false }).gameId; // legacy: not tracked
    const h = start(d);
    const port = await h.port;
    await until(() => h.err.includes("bad roster in room file"), "the duplicate binding's roster is refused");
    for (const code of ["ELIG", "SOLO", "BOTW", "DUPL", "LGCY"]) await win(port, code);
    const t = await rejoin(port, "TAKE", "p1");
    await t.until(() => t.state?.game.phase === "over", "the rejoin runs the takeover bot to the guest's win");
    await recorded(d, elig);
    await recorded(d, botw);
    await recorded(d, take);
    await sleep(300);
    assert.deepEqual(receipts(d).sort(), [elig, botw, take].sort(), "only the eligible games with a profile have receipts");
    assert(existsSync(pendingFile(d, solo)), "an excluded game writes nothing and keeps its journal file");
    assert(!existsSync(pendingFile(d, dupl)) && !existsSync(pendingFile(d, lgcy)), "untracked games are never journalled");
    assert.deepEqual(await record(port, P.Ash), { games: 0, wins: 0, losses: 0, winRate: null, streak: 0, lastPlayed: null }, "one-human, duplicate-binding and legacy games leave totals unchanged");
    assert.equal((await record(port, P.Brook)).wins, 1);
    assert.deepEqual([(await record(port, P.Cove)).losses, (await record(port, P.Dune)).losses], [1, 1], "a bot winner is a loss for every profile");
    const elm = (await history(port, P.Elm)).rows;
    assert.deepEqual([elm.length, elm[0].won, elm[0].assisted], [1, false, true], "takeover keeps attribution and is marked assisted");
    const s = store(d);
    assert(s.results[elig].players.every((p) => (p.kind === "bot" || p.name !== "Tide" ? p.profileId === null : p.profileId === P.Brook.id)), "the guest and the bot have no profile row");
    assert.equal(s.results[botw].players.find((p) => p.won).profileId, null, "no profile win is fabricated for a bot");
    assert.deepEqual(Object.keys(s.records).sort(), [P.Brook.id, P.Cove.id, P.Dune.id, P.Elm.id].sort());
    await h.stop();
  });

  await scenario("two rooms finishing together keep both results", async () => {
    const d = folders();
    const P = seedStore(d, ["Ash", "Brook", "Cove", "Dune"]);
    const one = seedRoom(d, "CON1", [P.Ash.id, P.Brook.id, P.Cove.id]).gameId; // Brook wins, Ash loses
    const two = seedRoom(d, "CON2", [P.Dune.id, P.Ash.id, P.Cove.id]).gameId; // Ash wins, Cove loses again
    const h = start(d);
    const port = await h.port;
    const [a, b] = await Promise.all([rejoin(port, "CON1", "p0"), rejoin(port, "CON2", "p0")]);
    await Promise.all([a.until(() => a.state, "CON1"), b.until(() => b.state, "CON2")]);
    a.act({ type: "pass" });
    b.act({ type: "pass" });
    await recorded(d, one);
    await recorded(d, two);
    const s = store(d);
    const order = [one, two].sort((x, y) => s.results[x].endedAt - s.results[y].endedAt || (x < y ? -1 : 1));
    assert.deepEqual(s.records[P.Ash.id].history, order, "history in completion order, then game id");
    const ash = await record(port, P.Ash);
    assert.deepEqual([ash.games, ash.wins, ash.losses, ash.winRate, ash.streak], [2, 1, 1, 50, order.at(-1) === two ? 1 : 0]);
    assert.deepEqual([(await record(port, P.Cove)).losses, (await record(port, P.Brook)).wins, (await record(port, P.Dune)).losses], [2, 1, 1]);
    await h.stop();
  });

  // 10. The store's transaction, on its own.
  const outcomeFor = (gameId, endedAt, rows, extra = {}) => ({
    v: 1,
    gameId,
    startedAt: 0,
    endedAt,
    policy: 1,
    eligible: true,
    victoryTarget: 10,
    winner: rows.find((r) => r.won).pid,
    players: rows.map((r, i) => ({ pid: `p${i}`, seat: `s${i}`, profileId: r.profileId ?? null, name: `N${i}`, color: PLAYER_COLORS[i], kind: r.kind ?? "human", points: r.won ? 10 : 3, won: Boolean(r.won), assisted: false })),
    ...extra,
  });
  const gid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const openStore = (names, opts = {}) => {
    const d = folders();
    const P = seedStore(d, names);
    return { d, P, s: openProfiles(d.profiles, { colors: PLAYER_COLORS, ...opts }) };
  };
  const game = (P, n, endedAt, xWins) => outcomeFor(gid(n), endedAt, [{ profileId: P.X.id, won: xWins }, { profileId: null, won: !xWins }]);

  await scenario("equal-time and late results order streaks deterministically", async () => {
    const views = [];
    for (const order of [[3, 1, 2], [2, 3, 1]]) {
      const { P, s } = openStore(["X"]);
      // g1 at 100 a win; g2 and g3 both at 200, a loss then a win by game id.
      const all = { 1: game(P, 1, 100, true), 2: game(P, 2, 200, false), 3: game(P, 3, 200, true) };
      assert.deepEqual(await Promise.all(order.map((n) => s.recordOutcome(all[n]))), ["committed", "committed", "committed"], "concurrent commits are serialized");
      const v = s.ownRecord(P.X.token);
      assert.deepEqual(v, { games: 3, wins: 2, losses: 1, winRate: 66.7, streak: 1, lastPlayed: 200 }, `order ${order}`);
      assert.deepEqual(s.ownHistory(P.X.token).rows.map((r) => r.gameId), [gid(3), gid(2), gid(1)]);
      views.push(v);
      // A late, older loss lands in its place and leaves the current streak; a newer win extends it.
      await s.recordOutcome(game(P, 4, 50, false));
      assert.deepEqual(s.ownRecord(P.X.token), { games: 4, wins: 2, losses: 2, winRate: 50, streak: 1, lastPlayed: 200 });
      await s.recordOutcome(game(P, 5, 300, true));
      assert.equal(s.ownRecord(P.X.token).streak, 2);
    }
    assert.deepEqual(views[0], views[1], "arrival order does not matter");
  });

  await scenario("duplicate, conflicting and refused outcomes on the store", async () => {
    const { d, P, s } = openStore(["X", "Y"]);
    const g = game(P, 1, 100, true);
    assert.equal(await s.recordOutcome(g), "committed");
    const file = readFileSync(storeFile(d), "utf8");
    assert.equal(await s.recordOutcome(structuredClone(g)), "duplicate");
    await assert.rejects(s.recordOutcome({ ...g, endedAt: 101 }), (e) => e instanceof ProfileError && e.code === "conflict", "same game id, different outcome");
    await assert.rejects(s.recordOutcome({ ...game(P, 2, 100, true), policy: 2 }), (e) => e.code === "invalid", "an unknown counting policy");
    const twice = outcomeFor(gid(3), 100, [{ profileId: P.Y.id, won: true }, { profileId: P.Y.id }]);
    await assert.rejects(s.recordOutcome(twice), (e) => e.code === "invalid", "a profile bound twice in one game");
    assert.equal(await s.recordOutcome({ ...game(P, 4, 100, true), eligible: false }), "excluded", "a one-human game");
    assert.equal(await s.recordOutcome(outcomeFor(gid(5), 100, [{ profileId: P.Y.id, kind: "bot", won: true }, { won: false }])), "excluded", "a bot row never earns a profile result");
    assert.equal(readFileSync(storeFile(d), "utf8"), file, "none of those wrote anything");
    assert.equal(s.ownRecord(P.X.token).games, 1);
    assert.equal(s.ownRecord(P.Y.token).games, 0);
    // A deleted or unknown profile gets no attribution; the game is still counted for the others.
    const gone = randomUUID();
    assert.equal(await s.recordOutcome(outcomeFor(gid(6), 200, [{ profileId: P.Y.id, won: true }, { profileId: gone }])), "committed");
    assert.equal(s.ownRecord(P.Y.token).wins, 1);
    assert(!JSON.stringify(store(d).results[gid(6)]).includes(gone) && !store(d).records[gone], "no row or record names the missing profile");
  });

  await scenario("a failed store transaction leaves memory unchanged", async () => {
    let fail = true;
    const { d, P, s } = openStore(["X"], { fault: (point) => { if (fail && point === "receipt-before") throw new Error("injected"); } });
    const g = game(P, 1, 100, true);
    await assert.rejects(s.recordOutcome(g), /injected/);
    assert.equal(s.receipt(g.gameId), null);
    assert.deepEqual(s.ownRecord(P.X.token), { games: 0, wins: 0, losses: 0, winRate: null, streak: 0, lastPlayed: null });
    assert.equal(store(d).receipts, undefined);
    fail = false;
    assert.equal(await s.recordOutcome(g), "committed", "the retry commits once");
    assert.equal(s.ownRecord(P.X.token).wins, 1);
  });

  await scenario("history pages are bounded", async () => {
    const { P, s } = openStore(["X", "Y"]);
    for (let n = 1; n <= 45; n++) await s.recordOutcome(game(P, n, 1000 + n, n % 3 !== 0));
    const seen = [];
    let next;
    const sizes = [];
    do {
      const page = s.ownHistory(P.X.token, next);
      assert(page.rows.length <= HISTORY_PAGE);
      sizes.push(page.rows.length);
      seen.push(...page.rows.map((r) => r.gameId));
      next = page.next;
    } while (next);
    assert.deepEqual(sizes, [20, 20, 5]);
    assert.deepEqual(seen, Array.from({ length: 45 }, (_, i) => gid(45 - i)), "newest first, each game once");
    assert.equal(HISTORY_PAGE, 20);
    assert.throws(() => s.ownHistory(P.Y.token, gid(5)), (e) => e.code === "invalid", "another profile's game is no cursor");
    assert.deepEqual(s.ownHistory(P.Y.token), { rows: [], next: null });
    assert.throws(() => s.ownHistory("nope"), (e) => e.code === "signedOut");
  });

  // #1650: a game played from the lobby whose roll-off reorders the players, once straight through and once with a kill -9
  // and restart right after the roll-off. The roster is frozen in lobby order, so only a load that matches its rows to the
  // game's players by player id keeps it; the restarted game must be counted exactly as the one that never restarted.
  // Lobby order is seat order: the roll-off faces go to each player's first die in that order.
  async function rolledOffRuns(label, names, faces, hello = {}, env = {}) {
    const runs = [];
    for (const restart of [false, true]) {
      const d = folders();
      const P = seedStore(d, names);
      const who = names.map((name) => ({ name, ...P[name] }));
      let h = start(d, { ROLL_FACES: faces.join(","), ...env }, [DICE]);
      let port = await h.port;
      let cs = await signedInTable(port, who, hello);
      const code = cs[0].welcome.code;
      await playOut(cs, (g) => g.phase !== "rollOff");
      const lobby = names.map((_, i) => `p${i}`);
      const placed = [...lobby].sort((a, b) => faces[Number(b.slice(1))] - faces[Number(a.slice(1))]);
      assert.deepEqual(cs[0].state.game.players.map((p) => p.id), placed, `${label}: the roll-off put the players in die order`);
      assert.notDeepEqual(placed, lobby, `${label}: not the lobby order`);
      const file = path.join(d.rooms, `${code}.json`);
      await until(() => readJson(file).game.phase === "setupSettle", `${label}: the reordered game on disk`);
      const { roster } = readJson(file);
      assert.deepEqual(roster.players.map((p) => [p.pid, p.profileId]), who.map((p, i) => [`p${i}`, p.id]), `${label}: the roster keeps the lobby order`);
      if (restart) {
        await h.stop();
        h = start(d, env);
        port = await h.port;
        const back = [];
        for (const c of cs) back.push(await client(port, { type: "hello", ...hello, code, secret: c.welcome.secret }));
        for (const c of back) await c.until(() => c.state, `${label}: state after the restart`);
        cs = back;
        assert(!h.err.includes("bad roster in room file"), `${label}: the restart kept the roster: ${h.err}`);
        assert.deepEqual(readJson(file).roster, roster, `${label}: the roster on disk after the restart is the frozen one`);
      }
      await playOut(cs);
      await recorded(d, roster.gameId);
      for (const c of cs) await c.until(() => c.state.result?.tracked === true && Object.values(c.state.result.wins).every((n) => n !== null), `${label}: the table sees the game counted`);
      runs.push(counted(d, roster.gameId, who));
      await h.stop();
    }
    const [straight, restarted] = runs;
    assert.equal(straight.receipts, 1, `${label}: the game without a restart is recorded once`);
    assert.deepEqual(straight.records.map((r) => [r.games, r.wins]), straight.records.map((r) => [1, r.wonHere ? 1 : 0]), `${label}: each profile has the game, and the win only if it won`);
    // The dice after the roll-off are the host's own, so the winner may differ; everything else is the same.
    const unwon = (run) => ({ ...run, players: run.players.map((p) => ({ ...p, won: undefined })), records: run.records.map((r) => ({ ...r, wins: undefined, wonHere: undefined })) });
    assert.deepEqual(unwon(restarted), unwon(straight), `${label}: after the restart the game is recorded for every profile as without one`);
    assert.deepEqual(restarted.records.map((r) => [r.games, r.wins]), restarted.records.map((r) => [1, r.wonHere ? 1 : 0]), `${label}: after the restart each profile has the game, and the win only if it won`);
  }

  await scenario("a restart after the roll-off keeps the roster of a classic game, and it counts", async () => {
    await rolledOffRuns("classic", ["Ember", "Tide", "Pine"], [2, 4, 6]);
  });

  await scenario("a restart after the roll-off keeps the roster of a five-seat game, and it counts", async () => {
    await rolledOffRuns("expanded", ["Ember", "Tide", "Pine", "Cove", "Dune"], [3, 6, 1, 5, 2], { variant: "expanded", proto: PROTO, caps: ["expanded"] });
  });

  console.log(`profile results prove ok: ${done.length} scenarios`);
  process.exit(0);
} catch (e) {
  console.log("FAIL", e.stack ?? e.message);
  process.exit(1);
}
