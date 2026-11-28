// #1045: the winner's chosen song for everyone present (owner answer B, 2026-11-28), end to end.
// Host half, a real host over sockets with seeded room and profile stores:
//  - the final state frame carries `outcome: { gameId, song }` for every seat and a watcher, with exactly those two keys,
//    the frozen roster's gameId and the winner's shared catalogue ID; a watcher arriving later gets the same;
//  - the song is read once when the game settles: an owner edit afterwards does not change it;
//  - a winner with no pick, a guest winner and a stored song that left the catalogue all send `song: null`;
//  - no frame carries winSongId, a login, a profile id, a media key, a credential or an asset path; non-final frames,
//    a rematch's new game and a reload after a host restart carry no outcome; the room file never holds the song.
// Browser half, the real app with audio stubbed, fed the outcomes the host sent:
//  - a present loser and a watcher hear the chosen song, never game_lose; the seat's end music waits until it ends;
//  - with no pick, Isaac's name still plays his song (and no end music, as before), and anyone else hears game_lose;
//  - an unknown song or a malformed outcome is no pick; a resync of a finished game and a fresh load into one play nothing.
//  - Each guard is then removed from the source, one at a time, and its check must fail.
// Run: npm run outcome-playback-prove
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { PLAYER_COLORS } from "../src/lib/game/types.ts";
import { chromium } from "./proof-browser.mjs";

const WebSocket = createRequire(new URL("../server/package.json", import.meta.url))("ws");

const root = mkdtempSync(path.join(tmpdir(), "emberisle-outcome-"));
const hosts = new Set();
process.on("exit", () => {
  for (const h of hosts) h.kill("SIGKILL");
  rmSync(root, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
setTimeout(() => {
  console.log("FAIL the proof ran past 240 s");
  process.exit(1);
}, 240_000).unref();
const ok = (what) => console.log(`ok ${what}`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const d = { rooms: path.join(root, "rooms"), profiles: path.join(root, "profiles"), results: path.join(root, "pending") };
mkdirSync(d.rooms);
mkdirSync(d.profiles);

// --- Stores -------------------------------------------------------------------------------------------------------------------
// Profiles are written in the store's own schema while no host runs, as profile-seat-prove does.
const SECRETS = [];
const LOGINS = [];
const doc = { schemaVersion: 1, profiles: {}, logins: {}, reservedLogins: {}, tombstones: {}, devices: {}, unknownLogins: {} };
function profile(login, displayName, winSongId) {
  const id = randomUUID();
  const salt = randomBytes(16);
  const now = Date.now();
  doc.profiles[id] = {
    id, displayName, login, color: PLAYER_COLORS[1], backupColor: PLAYER_COLORS[0], catchphrase: "", winSongId, mediaKey: `media-${login}`, createdAt: now, updatedAt: now,
    pin: { alg: "scrypt", N: 16384, r: 8, p: 1, salt: salt.toString("base64"), hash: scryptSync("4821", salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64") },
    guard: { times: [], pending: {}, lifetime: 0 },
  };
  doc.logins[login] = id;
  const credential = randomBytes(32).toString("base64url");
  doc.devices[createHash("sha256").update(credential).digest("hex")] = { profileId: id, createdAt: now, expiresAt: now + 86_400_000 };
  SECRETS.push(credential, `media-${login}`);
  LOGINS.push(login);
  return { id, credential };
}
const SONG = profile("songlogin", "Ben", "isaac-win");
const PLAIN = profile("plainlogin", "Ana", null);
const GONE = profile("gonelogin", "Cy", "catalogue-entry-removed");
writeFileSync(path.join(d.profiles, "profiles.json"), JSON.stringify(doc));

// p0 to move in `main`; p1 holds ten points of fortunes, so p0's pass is p1's win (result-journal-prove's seed).
function seedGame(names) {
  let g = createGame({ humans: names.map((name) => ({ name })), bots: 0, seed: 17 });
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
// `bound` is each player's profile id, or null for a guest.
function seedRoom(code, names, bound) {
  const game = seedGame(names);
  const seats = game.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `${code}-${p.id}`, ...(bound[i] ? { profileId: bound[i] } : {}) }));
  const gameId = randomUUID();
  const roster = { v: 1, gameId, startedAt: Date.now() - 60_000, policy: 1, eligible: true, players: seats.map((s, i) => ({ pid: s.pid, seat: s.id, profileId: bound[i], name: s.name, color: s.color, kind: "human" })) };
  writeFileSync(path.join(d.rooms, `${code}.json`), JSON.stringify({ code, host: "s0", next: 3, chat: [], chatSeq: 0, game, seats, roster, recoveryPids: [], assisted: [], shape: 2, savedAt: Date.now() }));
  return gameId;
}
const ROOMS = {
  SONG: seedRoom("SONG", ["Ana", "Ben", "Dee"], [PLAIN.id, SONG.id, null]),
  NONE: seedRoom("NONE", ["Ben", "Ana", "Dee"], [SONG.id, PLAIN.id, null]),
  GUES: seedRoom("GUES", ["Ana", "Isaac", "Dee"], [null, null, null]),
  GONE: seedRoom("GONE", ["Ana", "Cy", "Dee"], [null, GONE.id, null]),
};

function start() {
  const h = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL("../server/", import.meta.url),
    env: { ...process.env, PORT: "0", PROFILES_DEV: "1", ROOMS_DIR: d.rooms, PROFILES_DIR: d.profiles, RESULTS_DIR: d.results, ACT_CAP: "1000", ACT_RATE: "1000", GRACE_MS: "60000", HOLD_MS: "60000", TURN_MS: "60000", RESULT_FAULT: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  hosts.add(h);
  const host = { out: "", err: "" };
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
  host.stop = async () => (h.kill("SIGKILL"), await host.exited);
  return host;
}
const RAW = [];
async function client(port, hello) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: `http://127.0.0.1:${port}` });
  const c = { ws, state: null, states: [], replies: [], waiters: [] };
  ws.on("message", (raw) => {
    // The owner's own profile socket (no hello) is private to it; every table and watcher frame is scanned.
    if (hello) RAW.push(String(raw));
    const m = JSON.parse(String(raw));
    if (m.type === "state") (c.state = m), c.states.push(m);
    if (m.id !== undefined) c.replies.push(m);
    for (const w of c.waiters.splice(0)) w();
  });
  c.until = (ok, label, ms = 8000) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out: ${label}`)), ms);
      const look = () => (ok() ? (clearTimeout(t), resolve()) : c.waiters.push(look));
      look();
    });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.act = (m) => c.send({ ...m, cid: randomUUID(), turn: c.state.actionStamp.turn, baseSeq: c.state.actionStamp.baseSeq, connection: c.state.actionStamp.connection });
  await new Promise((r, j) => (ws.once("open", r), ws.once("error", j)));
  if (hello) c.send(hello);
  return c;
}
const seat = (port, code, pid) => client(port, { type: "hello", code, secret: `${code}-${pid}` });
const watch = (port, code) => client(port, { type: "hello", code, watch: true });
const finals = (c) => c.states.filter((s) => s.game.phase === "over");

// Win the seeded game at `code` with p0 and p1 seated and one watcher; return their final frames' outcomes.
async function win(port, code) {
  const a = await seat(port, code, "p0");
  const b = await seat(port, code, "p1");
  await a.until(() => a.state, `${code} p0 state`);
  await b.until(() => b.state, `${code} p1 state`);
  const w = await watch(port, code);
  await w.until(() => w.state, `${code} watcher state`);
  for (const c of [a, b, w]) assert.equal(c.states.some((s) => "outcome" in s), false, `${code}: no outcome before the game is over`);
  a.act({ type: "pass" });
  for (const c of [a, b, w]) await c.until(() => c.state.game.phase === "over", `${code} final state`);
  return { a, b, w, outcomes: [a, b, w].map((c) => finals(c)[0].outcome) };
}

// --- Host half ----------------------------------------------------------------------------------------------------------------
const heard = {};
let h = start();
let port = await h.port;
{
  const { a, b, w, outcomes } = await win(port, "SONG");
  for (const o of outcomes) assert.deepEqual(o, { gameId: ROOMS.SONG, song: "isaac-win" }, "seat, seat and watcher get the same outcome");
  for (const o of outcomes) assert.deepEqual(Object.keys(o).sort(), ["gameId", "song"], "outcome has exactly gameId and song");
  assert.ok(UUID.test(outcomes[0].gameId), "gameId is the frozen roster's UUID");
  ok("a live winner's chosen song reaches both seats and a present watcher: outcome { gameId, song: \"isaac-win\" }");
  heard.song = outcomes[0];
  // Read once at settle: the winner clears the pick, and a watcher arriving afterwards still gets the settled song.
  const owner = await client(port);
  owner.send({ type: "profileEdit", credential: SONG.credential, winSongId: null, id: 1 });
  await owner.until(() => owner.replies.length, "profile edit reply");
  assert.equal(owner.replies[0].profile?.winSongId, null, `the owner cleared the pick: ${JSON.stringify(owner.replies[0])}`);
  const late = await watch(port, "SONG");
  await late.until(() => late.state, "late watcher state");
  assert.deepEqual(late.state.outcome, { gameId: ROOMS.SONG, song: "isaac-win" }, "a later edit does not change the settled song");
  ok("the song is read once at settle: a later owner edit leaves the finished game's outcome as it was");
  // Rematch (three live seats): the new game's frames carry no outcome.
  const c = await seat(port, "SONG", "p2");
  await c.until(() => c.state, "p2 state");
  a.send({ type: "again" });
  await a.until(() => a.state.game.phase !== "over", "rematch state");
  await w.until(() => w.state.game.phase !== "over", "rematch watcher state");
  assert.equal("outcome" in a.state || "outcome" in w.state, false, "a rematch's new game carries no outcome");
  ok("a rematch's new game carries no outcome");
}
{
  const { outcomes } = await win(port, "NONE");
  for (const o of outcomes) assert.deepEqual(o, { gameId: ROOMS.NONE, song: null }, "a winner with no pick");
  const g = await win(port, "GUES");
  for (const o of g.outcomes) assert.deepEqual(o, { gameId: ROOMS.GUES, song: null }, "a guest-only game");
  heard.guest = g.outcomes[0];
  const r = await win(port, "GONE");
  for (const o of r.outcomes) assert.deepEqual(o, { gameId: ROOMS.GONE, song: null }, "a stored song that left the catalogue");
  ok("no pick, a guest-only game and a song removed from the catalogue each send song: null");
}
await h.stop();
// Restart: the finished games load settled, their result shows, and no outcome is sent (nothing replays).
h = start();
port = await h.port;
{
  const w = await watch(port, "NONE");
  await w.until(() => w.state?.game.phase === "over", "watcher after restart");
  const g = await seat(port, "GUES", "p0");
  await g.until(() => g.state?.game.phase === "over", "seat after restart");
  assert.equal("outcome" in w.state || "outcome" in g.state, false, "no outcome after a restart");
  ok("after a host restart a finished game loads with no outcome, so nothing asks to play");
}
await h.stop();
const files = Object.keys(ROOMS).map((code) => readFileSync(path.join(d.rooms, `${code}.json`), "utf8")).join("\n");
assert.ok(!/isaac-win|catalogue-entry-removed|playback/.test(files), "no room file holds the song");
const frames = RAW.join("\n");
assert.ok(!/winSongId|mediaKey|credential|\/audio\/|isaac_win\.mp3/.test(frames), "no private field or asset path in any frame");
assert.ok(!SECRETS.some((x) => frames.includes(x)) && !LOGINS.some((l) => frames.includes(l)), "no credential, media key or login in any frame");
ok(`no private field, credential, login, media key or asset path in ${RAW.length} table and watcher frames; no song in any room file`);

// --- Browser half ---------------------------------------------------------------------------------------------------------------
const LONG = ["game_lose.mp3", "pluck_001.wav", "isaac_win.mp3", "end_music.mp3"];
function stub(long) {
  window.__audios = [];
  window.__plays = [];
  window.Audio = class extends EventTarget {
    constructor(src) { super(); this.src = src.split("/").at(-1); this.volume = 1; this.currentTime = 0; this.paused = true; this.ended = false; this.loop = false; window.__audios.push(this); }
    play() {
      this.paused = false; this.ended = false;
      if (long.includes(this.src)) window.__plays.push(this.src);
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    }
    pause() { this.paused = true; this.dispatchEvent(new Event("pause")); }
  };
  window.__end = (file) => {
    for (const a of window.__audios) if (a.src === file && !a.paused) { a.paused = true; a.ended = true; a.dispatchEvent(new Event("ended")); }
  };
}

const checks = {
  // A present loser and a watcher hear the chosen song; the seat's end music waits for it.
  async chosen(page, clean, outcome) {
    await clean();
    const got = await page.evaluate(async (outcome) => {
      const { store, game } = window.__t;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const g = game(["Ana", "Ben"]);
      const over = { ...g, phase: "over", winner: "p1" };
      const out = {};
      store.hear({ ...g, phase: "main" }, over, "p0", "online", false, outcome);
      await wait(1800);
      out.waiting = [...window.__plays];
      window.__end("isaac_win.mp3");
      await wait(200);
      out.after = [...window.__plays];
      window.__t.S.cancelForeground();
      await wait(300);
      window.__plays = [];
      store.hear({ ...g, phase: "main" }, over, "", "online", false, outcome);
      await wait(300);
      window.__end("isaac_win.mp3");
      await wait(1800);
      out.watcher = [...window.__plays];
      return out;
    }, outcome);
    assert.deepEqual(got.waiting, ["isaac_win.mp3"], "the losing seat hears the chosen song, not game_lose, and end music waits");
    assert.deepEqual(got.after, ["isaac_win.mp3", "end_music.mp3"], "end music starts when the chosen song ends");
    assert.deepEqual(got.watcher, ["isaac_win.mp3"], "a present watcher hears the chosen song");
    ok("a present loser and a watcher hear the chosen song; the seat's end music waits until it ends");
  },
  // No pick: Isaac's name still plays his song (no end music, as before); anyone else hears game_lose then end music.
  async fallback(page, clean, outcome) {
    await clean();
    const got = await page.evaluate(async (outcome) => {
      const { store, game } = window.__t;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = {};
      const g = game(["Ana", "Isaac"]);
      store.hear({ ...g, phase: "main" }, { ...g, phase: "over", winner: "p1" }, "p0", "online", false, outcome);
      await wait(300);
      window.__end("isaac_win.mp3");
      await wait(1800);
      out.isaac = [...window.__plays];
      window.__t.S.cancelForeground();
      await wait(300);
      window.__plays = [];
      const h = game(["Ana", "Ben"]);
      store.hear({ ...h, phase: "main" }, { ...h, phase: "over", winner: "p1" }, "p0", "online", false, { gameId: outcome.gameId, song: "catalogue-entry-removed" });
      await wait(300);
      window.__end("game_lose.mp3");
      await wait(1800);
      out.unknown = [...window.__plays];
      window.__t.S.cancelForeground();
      await wait(300);
      window.__plays = [];
      store.hear({ ...h, phase: "main" }, { ...h, phase: "over", winner: "p1" }, "p0", "online", false, { song: "isaac-win" });
      await wait(300);
      out.malformed = [...window.__plays];
      return out;
    }, outcome);
    assert.deepEqual(got.isaac, ["isaac_win.mp3"], "with no pick, Isaac's name still plays his song");
    assert.deepEqual(got.unknown, ["game_lose.mp3", "end_music.mp3"], "an unknown song is no pick: game_lose, then end music");
    assert.deepEqual(got.malformed, ["game_lose.mp3"], "an outcome with no gameId is no pick");
    ok("no pick: Isaac's name plays his song; an unknown song or a malformed outcome falls back to game_lose");
  },
  // A resync of a finished game and a fresh load into one play nothing, even with the outcome on the frame.
  async replay(page, clean, outcome) {
    await clean();
    const got = await page.evaluate(async (outcome) => {
      const { store, game } = window.__t;
      const g = game(["Ana", "Ben"]);
      const over = { ...g, phase: "over", winner: "p1" };
      store.hear(over, over, "p0", "online", false, outcome);
      store.hear(null, over, "p0", "online", true, outcome);
      store.hear(null, over, "", "online", true, outcome);
      await new Promise((r) => setTimeout(r, 1800));
      return window.__plays;
    }, outcome);
    assert.deepEqual(got, [], "a resync, a rejoin and a fresh watcher load into a finished game play nothing");
    ok("a resync, a rejoin and a fresh load into a finished game play nothing");
  },
};

const MUTANTS = [
  { check: "chosen", file: "/src/lib/game/store.ts", from: "m?.gameEnd(before, after, me, mode, songOf(outcome))", to: "m?.gameEnd(before, after, me, mode)", why: "the outcome is not passed to the game-end chunk" },
  { check: "fallback", file: "/src/lib/trade-sound.ts", from: "const isaac = !song && isDiggler(", to: "const isaac = !!song && isDiggler(", why: "no Isaac fallback" },
  { check: "fallback", file: "/src/lib/game/store.ts", from: "Object.hasOwn(SONG_SOUNDS, song!) ? SONG_SOUNDS[song!] : undefined", to: "\"isaac_win\"", why: "the song is not checked against the catalogue" },
  { check: "chosen", file: "/src/lib/trade-sound.ts", from: "&& after.winner && !isaac) endMusic(1500)", to: "&& after.winner && !isaac && !song) endMusic(1500)", why: "no end music after the chosen song" },
];

const browser = await chromium.launch();
async function run(names, mutant) {
  const vite = await createServer({
    server: { host: "127.0.0.1", port: 0 }, logLevel: "error",
    plugins: mutant ? [{ name: "outcome-mutant", enforce: "pre", transform(code, id) {
      if (id.split("?")[0].endsWith(mutant.file)) return code.replace(mutant.from, mutant.to);
    } }] : [],
  });
  await vite.listen();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (e) => { if (e.type() === "error") errors.push(e.text()); });
  try {
    await page.addInitScript(stub, LONG);
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/`);
    await page.waitForFunction(() => window.__emberisle);
    await page.keyboard.press("Shift"); // the gesture that unlocks sound
    await page.evaluate(async () => {
      const [S, store, board] = await Promise.all(["/src/lib/sound.ts", "/src/lib/game/store.ts", "/src/lib/game/board.ts"].map((m) => import(m)));
      const game = (names) => ({ ...board.createGame({ humans: names.map((name) => ({ name })), bots: 0 }), winner: null });
      window.__t = { S, store, game };
    });
    const clean = () => page.evaluate(async () => {
      window.__t.S.cancelForeground();
      await new Promise((r) => setTimeout(r, 300));
      window.__plays = [];
    });
    const given = { chosen: heard.song, fallback: heard.guest, replay: heard.song };
    for (const name of names) await checks[name](page, clean, given[name]);
    assert.deepEqual(errors, [], "no page errors");
  } finally {
    await context.close();
    await vite.close();
  }
}

try {
  await run(Object.keys(checks));
  for (const mutant of MUTANTS) {
    const source = readFileSync(new URL(`..${mutant.file}`, import.meta.url), "utf8");
    assert.equal(source.split(mutant.from).length, 2, `mutant "${mutant.why}" finds its source line exactly once`);
    const failed = await run([mutant.check], mutant).then(() => null, (e) => e);
    assert.ok(failed, `with ${mutant.why}, the ${mutant.check} check must fail, but it passed`);
    ok(`mutant (${mutant.why}): the ${mutant.check} check fails: ${failed.message.split("\n")[0]}`);
  }
  console.log("outcome-playback-prove: all checks passed");
} finally {
  await browser.close();
}
