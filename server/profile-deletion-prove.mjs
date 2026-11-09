// #891: profile deletion tombstones and result redaction, on a real host over sockets, through the local admin command, and
// on the store itself. Run from the repo root: node --import ./server/register.mjs server/profile-deletion-prove.mjs
//  1. Before deletion: one recorded game, one pending outcome left by a crash, one active game, all naming the profile.
//  2. The admin command previews the profile and refuses a wrong confirmation or a running host. Nothing changes.
//  3. The confirmed deletion writes the tombstone, revokes devices, reserves the login and redacts stored rows in one write.
//     Receipts and the other players' records do not change.
//  4. The host is killed before and then after each startup redaction rewrite. Every restart resumes, and none listens
//     until all of it is done. The pending outcome is then recorded without the deleted profile.
//  5. Deleted credentials are refused. The login cannot be taken again. The active game keeps playing, and no public
//     projection, history row, room or pending file names the deleted profile.
//  6. Stale pending outcomes and room snapshots are replayed. The profile does not come back and gains no result.
//  7. A fenced room and unreadable pending files name the profile (#1393). A start with the store locked logs that it cannot
//     redact them, and fences one more room. The next start with the store available redacts all of them before listening.
//     They stay fenced, and a third start finds nothing left. A pending copy with a forged fingerprint is refused.
//  8. On the store: an interrupted transaction changes nothing, a second deletion is refused, a stale outcome is redacted, and
//     a hand-edited fingerprint is refused. Curated repository assets are byte-identical throughout.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { PLAYER_COLORS } from "../src/lib/game/types.ts";
import { DELETED_NAME, fingerprint, openProfiles, ProfileError } from "./profiles.mjs";

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
const SERVER = fileURLToPath(new URL(".", import.meta.url));

function folders() {
  const root = mkdtempSync(path.join(tmpdir(), "emberisle-deletion-"));
  dirs.push(root);
  mkdirSync(path.join(root, "rooms"));
  return { rooms: path.join(root, "rooms"), profiles: path.join(root, "profiles"), results: path.join(root, "pending") };
}
const storeFile = (d) => path.join(d.profiles, "profiles.json");
const store = (d) => readJson(storeFile(d));
const pendingFile = (d, id) => path.join(d.results, `${id}.json`);
const roomFile = (d, code) => path.join(d.rooms, `${code}.json`);

// Curated repository assets: the shared win songs and sounds, and the committed pictures. Deletion never touches them.
function assetHashes() {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const f = path.join(dir, name);
      if (statSync(f).isDirectory()) walk(f);
      else out[path.relative(SERVER, f)] = createHash("sha256").update(readFileSync(f)).digest("hex");
    }
  };
  walk(path.join(SERVER, "../public/audio"));
  walk(path.join(SERVER, "../src/assets"));
  return out;
}

// Profiles and remembered devices in the store's own schema, written while no host runs (profile-results-prove's method).
// The doomed profile has two devices, a shared song and a curated media binding.
function seedStore(d, names) {
  mkdirSync(d.profiles, { recursive: true });
  const doc = { schemaVersion: 1, profiles: {}, logins: {}, reservedLogins: {}, tombstones: {}, devices: {}, unknownLogins: {} };
  const out = {};
  for (const [i, name] of names.entries()) {
    const id = randomUUID();
    const login = `${name.toLowerCase()}-${randomBytes(3).toString("hex")}`;
    const now = Date.now();
    doc.profiles[id] = {
      id, displayName: name, login, color: PLAYER_COLORS[1], backupColor: PLAYER_COLORS[0], catchphrase: `${name} catchphrase ${randomBytes(3).toString("hex")}`,
      winSongId: i === 0 ? "isaac-win" : null, mediaKey: i === 0 ? "isaac_win" : null, createdAt: now, updatedAt: now,
      pin: { alg: "scrypt", N: 16384, r: 8, p: 1, salt: randomBytes(16).toString("base64"), hash: randomBytes(32).toString("base64") },
      guard: { times: [], pending: {}, lifetime: 0 },
    };
    doc.logins[login] = id;
    const tokens = [];
    for (let k = 0; k < (i === 0 ? 2 : 1); k++) {
      const token = randomBytes(32).toString("base64url");
      doc.devices[createHash("sha256").update(token).digest("hex")] = { profileId: id, createdAt: now + k, expiresAt: now + 24 * 60 * 60 * 1000 };
      tokens.push(token);
    }
    out[name] = { id, login, token: tokens[0], tokens, catchphrase: doc.profiles[id].catchphrase };
  }
  writeFileSync(storeFile(d), JSON.stringify(doc));
  return out;
}

// p0 to move in `main` with nothing in hand; p1 wins as its turn starts, so p0's pass is the winning transition for p1.
function seedGame(names) {
  let g = createGame({ humans: names.map((name) => ({ name })), bots: 0, seed: 17 });
  while (g.phase !== "roll") {
    const r = applyAction(g, g.current, chooseBotAction(g, g.current));
    assert.ifError(r.error);
    g = r.state;
  }
  g.players.sort((a, b) => a.id.localeCompare(b.id));
  g.players.forEach((p, i) => (p.name = names[i]));
  for (const p of g.players) for (const k of Object.keys(p.resources)) p.resources[k] = 0;
  g.players[1].hidden.vp = 10;
  g.current = "p0";
  g.phase = "main";
  return g;
}

// A saved room as host.mjs writes it. Each row is a seeded profile or "guest". A bound seat is named as its player typed it.
function seedRoom(d, code, rows) {
  const names = rows.map((r, i) => (r === "guest" ? `Guest ${i}` : r.name));
  const game = seedGame(names);
  const seats = game.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `${code}-${p.id}`, ...(rows[i] === "guest" ? {} : { profileId: rows[i].id }) }));
  const gameId = randomUUID();
  const roster = { v: 1, gameId, startedAt: Date.now() - 60_000, policy: 1, eligible: true, players: seats.map((s) => ({ pid: s.pid, seat: s.id, profileId: s.profileId ?? null, name: s.name, color: s.color, kind: "human" })) };
  writeFileSync(roomFile(d, code), JSON.stringify({ code, host: "s0", next: 3, chat: [], chatSeq: 0, game, seats, roster, recoveryPids: [], assisted: [], shape: 2, savedAt: Date.now() }));
  return gameId;
}

function start(d, env = {}) {
  const h = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: SERVER,
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
  host.port.catch(() => {});
  host.stop = async () => {
    h.kill("SIGKILL");
    await host.exited;
  };
  return host;
}

// The local admin command, as the owner runs it, with the confirmation typed on stdin.
function admin(d, args, input) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, ["--import", "./register.mjs", "profile-admin.mjs", ...args], { cwd: SERVER, env: { ...process.env, PROFILES_DIR: d.profiles }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (x) => (stdout += x));
    proc.stderr.on("data", (x) => (stderr += x));
    proc.stdin.end(input);
    proc.on("exit", (code) => resolve({ stdout, stderr, code }));
  });
}

async function client(port, hello, headers = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
  const c = { ws, state: null, errors: [], frames: [], waiters: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    c.frames.push(m);
    if (m.type === "state") c.state = m;
    if (m.type === "error") c.errors.push(m);
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
const rejoin = (port, code, pid) => client(port, { type: "hello", code, secret: `${code}-${pid}` });

const TUNNEL = "isle-demo.trycloudflare.com";
let nextIp = 1;
const tunnel = () => ({ origin: `https://${TUNNEL}`, host: TUNNEL, "cf-connecting-ip": `10.9.${nextIp++}.1`, "x-forwarded-proto": "https" });
async function ask(port, msg) {
  const c = await client(port, null, tunnel());
  const id = randomBytes(4).toString("hex");
  c.send({ ...msg, id });
  await c.until(() => c.frames.some((m) => m.id === id), `reply to ${msg.type}`);
  c.ws.close();
  return c.frames.find((m) => m.id === id);
}

async function until(ok, label, ms = 8000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(25)) if (ok()) return;
  throw new Error(`timed out: ${label}`);
}
const recorded = (d, id) => until(() => !existsSync(pendingFile(d, id)) && Object.hasOwn(store(d).receipts ?? {}, id), `game ${id} recorded`);
async function win(port, code) {
  const a = await rejoin(port, code, "p0");
  await a.until(() => a.state, `${code} state`);
  a.act({ type: "pass" });
  await a.until(() => a.state.game.phase === "over", `${code} win`);
  a.ws.close();
}
// Every pending outcome, every room's frozen roster and outcome rows, and every stored result row, as text.
function rowsText(d) {
  const rooms = readdirSync(d.rooms).map((n) => readFileSync(path.join(d.rooms, n), "utf8")).map((t) => JSON.parse(t)).map((r) => ({ roster: r.roster, outcome: r.outcome, seats: r.seats.map((s) => s.profileId ?? null) }));
  const pending = existsSync(d.results) ? readdirSync(d.results).map((n) => readFileSync(path.join(d.results, n), "utf8")) : [];
  const s = store(d);
  return JSON.stringify({ rooms, pending, results: s.results, records: s.records, receipts: s.receipts });
}

function assertAbsent(d, terms, message) {
  const text = rowsText(d);
  for (const x of terms) {
    if (text.includes(x)) {
      for (const dir of [d.rooms, d.results, d.profiles]) {
        for (const f of existsSync(dir) ? readdirSync(dir) : []) {
          const full = path.join(dir, f);
          if (readFileSync(full, "utf8").includes(x)) console.error(`match ${x} in ${full}`);
        }
      }
    }
    assert(!text.includes(x), `${message}: ${x}`);
  }
}

const done = [];
async function scenario(name, fn) {
  const t = Date.now();
  await fn();
  done.push(name);
  console.log(`${name}: ok (${Date.now() - t} ms)`);
}

try {
  const assets = assetHashes();
  const d = folders();
  const P = seedStore(d, ["Ashling", "Brook", "Cove"]);
  const A = P.Ashling;
  const ash = { id: A.id, name: "Ashling" };
  const brook = { id: P.Brook.id, name: "Brook" };
  const cove = { id: P.Cove.id, name: "Cove" };
  const DONE = seedRoom(d, "DONE", [ash, brook, cove]);
  const PEND = seedRoom(d, "PEND", [ash, brook, "guest"]);
  const LIVE = seedRoom(d, "LIVE", [ash, cove, "guest"]);
  let was;
  let stalePend;
  let staleLive;

  await scenario("before deletion: a recorded game, a pending outcome and an active game name the profile", async () => {
    let h = start(d);
    await win(await h.port, "DONE");
    await recorded(d, DONE);
    await h.stop();
    // The host dies inside the result transaction: PEND's outcome is durable and pending, not recorded.
    h = start(d, { RESULT_FAULT: "receipt-before:exit" });
    const port = await h.port;
    const a = await rejoin(port, "PEND", "p0");
    await a.until(() => a.state, "PEND state");
    a.act({ type: "pass" });
    await h.exited;
    stalePend = readFileSync(pendingFile(d, PEND), "utf8");
    assert(stalePend.includes(A.id) && stalePend.includes("Ashling"), "the pending outcome names the profile");
    staleLive = readFileSync(roomFile(d, "LIVE"), "utf8");
    assert(staleLive.includes(A.id));
    was = store(d);
    assert.equal(was.records[A.id].games, 1);
    assert.equal(was.records[P.Brook.id].wins, 1);
  });

  await scenario("the admin command previews, and refuses a wrong confirmation or a running host", async () => {
    const before = readFileSync(storeFile(d), "utf8");
    const wrong = await admin(d, ["--delete", A.login], "yes\n");
    assert.equal(wrong.code, 0, wrong.stderr);
    for (const line of [A.id, "Ashling", A.login, "Devices:         2", "Counted games:   1", "Result rows:     1", "isaac-win", "isaac_win", "no asset file is deleted", `Type the login ${A.login}`]) {
      assert(wrong.stdout.includes(line), `the preview shows ${line}`);
    }
    assert(wrong.stdout.includes("Deletion cancelled."));
    assert.equal(readFileSync(storeFile(d), "utf8"), before, "a wrong confirmation changes nothing");
    // A running host holds the store; its result commits fail here, so the crash's pending outcome stays pending.
    const h = start(d, { RESULT_FAULT: "receipt-before:fail:1000" });
    await h.port;
    const busy = await admin(d, ["--delete", A.login], `${A.login}\n`);
    assert.equal(busy.code, 1);
    assert.match(busy.stderr, /locked/, "the admin command never runs beside the host's result commits");
    await h.stop();
    assert.equal(readFileSync(storeFile(d), "utf8"), before);
    assert.equal((await admin(d, ["--delete", "nobody-here"], "\n")).code, 1, "an unknown login is refused");
  });

  await scenario("the confirmed deletion tombstones, revokes and redacts in one write", async () => {
    const r = await admin(d, ["--delete", A.login], `${A.login}\n`);
    assert.equal(r.code, 0, r.stderr);
    assert(r.stdout.includes(`Deleted profile ${A.id}. 1 stored result row(s) now show "${DELETED_NAME}".`), r.stdout);
    const s = store(d);
    assert(Number.isSafeInteger(s.tombstones[A.id]), "the UUID tombstone is durable");
    assert(!Object.hasOwn(s.profiles, A.id) && !Object.hasOwn(s.logins, A.login), "the profile and its login are gone");
    assert.equal(s.reservedLogins[A.login], A.id, "the former login stays reserved");
    assert(!Object.values(s.devices).some((v) => v.profileId === A.id), "every device is revoked");
    assert(!Object.hasOwn(s.records, A.id), "its aggregates are gone");
    assert.deepEqual(s.receipts, was.receipts, "receipt fingerprints are unchanged");
    assert.deepEqual(s.records[P.Brook.id], was.records[P.Brook.id]);
    assert.deepEqual(s.records[P.Cove.id], was.records[P.Cove.id], "the other players' counts are unchanged");
    const row = s.results[DONE].players[0];
    assert.deepEqual([row.profileId, row.name], [null, DELETED_NAME]);
    assert.deepEqual(s.results[DONE].players.slice(1), was.results[DONE].players.slice(1), "the other players' rows are unchanged");
    assert.deepEqual({ ...row, profileId: null, name: null }, { ...was.results[DONE].players[0], profileId: null, name: null }, "the row keeps colour, kind, points and result");
    assert(readFileSync(pendingFile(d, PEND), "utf8").includes(A.id), "pending outcomes wait for the host's startup pass");
  });

  await scenario("startup redaction is interrupted at each durable boundary and completes before listening", async () => {
    const deadPid = spawnSync(process.execPath, ["-e", ""]).pid;
    const planted = path.join(d.results, `.x.json.${deadPid}.abc.tmp`);
    writeFileSync(planted, JSON.stringify({ tombstoned: A.id }));
    const files = () => [readFileSync(pendingFile(d, PEND), "utf8"), ...["DONE", "PEND", "LIVE"].map((c) => readFileSync(roomFile(d, c), "utf8"))];
    const before = files();
    let h = start(d, { RESULT_FAULT: "redact-before:exit" });
    assert.equal(await Promise.race([h.exited, h.port.then(() => "listening", () => "exited")]), "SIGKILL", "the host died at its first rewrite");
    assert(!h.out.includes("listening"));
    assert.deepEqual(files(), before, "killed before its first rewrite, the host wrote nothing");
    let boundaries = 0;
    for (;;) {
      h = start(d, { RESULT_FAULT: "redact-after:exit" });
      const listened = await h.port.then(() => true, () => false);
      if (listened) break;
      boundaries++;
      assert(!h.out.includes("listening"), "an interrupted start never served a profile request");
      assert.equal(h.out.split("profiles: redacted a deleted profile").length - 1, 1, "one durable rewrite per interrupted start");
      assert(boundaries <= 4, "the pass makes progress");
    }
    assert.equal(boundaries, 4, "the pending outcome and three rooms: four boundaries");
    assert(!h.out.includes("profiles: redacted"), "the last start found nothing left to redact");
    const rec = h.out.indexOf(`results: recorded game ${PEND}`);
    assert(rec >= 0 && rec < h.out.indexOf("listening"), "the redacted pending outcome was recorded before listening");
    await h.stop();
    const s = store(d);
    assert.equal(s.receipts[PEND].fingerprint, fingerprint(JSON.parse(stalePend)), "the receipt is the pre-redaction fingerprint");
    assert.deepEqual([s.results[PEND].players[0].profileId, s.results[PEND].players[0].name], [null, DELETED_NAME]);
    assert.deepEqual([s.records[P.Brook.id].games, s.records[P.Brook.id].wins], [2, 2], "the other player is credited");
    assert.deepEqual(s.records[P.Cove.id], was.records[P.Cove.id]);
    assert(!Object.hasOwn(s.records, A.id), "the deleted profile gained no result");
    assert(!existsSync(planted), "a planted orphan .tmp holding a tombstoned uuid is removed at startup");
    assertAbsent(d, [A.id, "Ashling", A.login, A.catchphrase], "no stored, pending or frozen row carries");
  });

  await scenario("credentials are revoked, the active game plays on, and public projections carry no deleted identity", async () => {
    const h = start(d);
    const port = await h.port;
    for (const token of A.tokens) {
      assert.equal((await ask(port, { type: "profileRecord", credential: token })).code, "signedOut");
      assert.equal((await ask(port, { type: "profileHistory", credential: token })).code, "signedOut");
    }
    const t = await client(port, { type: "create", name: "Ashling", credential: A.token }, tunnel());
    await t.until(() => t.errors.length, "the table refuses the deleted credential");
    assert.equal(t.errors[0].code, "signedOut");
    t.ws.close();
    const taken = await ask(port, { type: "profileCreate", displayName: "Ashling", login: A.login, pin: "4821", pinConfirm: "4821", color: PLAYER_COLORS[0] });
    assert.equal(taken.code, "loginTaken", "the former login cannot be taken again");
    const hist = await ask(port, { type: "profileHistory", credential: P.Brook.token });
    assert.equal(hist.rows.length, 2);
    assert(hist.rows.every((r) => r.players[0].name === DELETED_NAME), "other players' history shows the deleted player");
    // The active game keeps playing: the deleted player's seat rejoins by its seat secret, as a guest seat.
    const a = await rejoin(port, "LIVE", "p0");
    const c = await rejoin(port, "LIVE", "p1");
    await a.until(() => a.state?.game.phase === "main", "the deleted player's seat is back");
    await c.until(() => c.frames.some((m) => m.type === "seats"), "seats");
    const seats = c.frames.findLast((m) => m.type === "seats").seats;
    assert(!("profile" in seats[0]) && seats[1].profile.profileId === P.Cove.id, "the seat is unbound; the other binding stays");
    for (const [id, want] of [[A.id, "profileError"], [P.Cove.id, "tableProfileCard"]]) {
      const rid = randomBytes(4).toString("hex");
      c.send({ type: "tableProfileCard", id: rid, profileId: id });
      await c.until(() => c.frames.some((m) => m.id === rid), "card");
      assert.equal(c.frames.find((m) => m.id === rid).type, want);
    }
    a.act({ type: "pass" });
    await a.until(() => a.state.game.phase === "over", "LIVE finishes");
    await recorded(d, LIVE);
    for (const x of [A.id, A.login, A.catchphrase]) {
      assert(!JSON.stringify([a.frames, c.frames, hist]).includes(x), `no frame carries ${x}`);
    }
    a.ws.close();
    c.ws.close();
    await h.stop();
    const s = store(d);
    assert.equal(s.records[P.Cove.id].games, was.records[P.Cove.id].games + 1, "the other player is credited for the active game");
    assert(!Object.hasOwn(s.records, A.id) && !s.results[LIVE].players.some((p) => p.profileId === A.id || p.name === "Ashling"));
  });

  await scenario("stale pending outcomes and room snapshots cannot bring the profile back", async () => {
    const before = store(d);
    // The pre-deletion pending outcome, replayed after its receipt: a duplicate that changes nothing.
    writeFileSync(pendingFile(d, PEND), stalePend);
    // The pre-deletion snapshot of the active game, and a finished game whose outcome was never journalled.
    writeFileSync(roomFile(d, "LIVE"), staleLive);
    const STAL = seedRoom(d, "STAL", [ash, brook, "guest"]);
    const stal = readJson(roomFile(d, "STAL"));
    stal.game.phase = "over";
    stal.game.winner = "p1";
    writeFileSync(roomFile(d, "STAL"), JSON.stringify(stal));
    const h = start(d);
    const port = await h.port;
    const at = h.out.indexOf("listening");
    assert(h.out.indexOf(`profiles: redacted a deleted profile from the pending outcome of game ${PEND}`) < at);
    assert(h.out.indexOf(`results: game ${PEND} was already recorded`) < at, "the stale outcome matched its receipt");
    await recorded(d, STAL);
    await until(() => h.err.includes(`holds game ${LIVE} at main, but that game already finished; fenced`), "the stale active snapshot is fenced");
    await h.stop();
    const s = store(d);
    assert.deepEqual(s.records[P.Cove.id], before.records[P.Cove.id]);
    assert.deepEqual(s.receipts[PEND], before.receipts[PEND]);
    assert.equal(s.records[P.Brook.id].games, before.records[P.Brook.id].games + 1, "only the live profile gains the stale finished game");
    assert(!Object.hasOwn(s.profiles, A.id) && !Object.hasOwn(s.records, A.id) && !Object.hasOwn(s.logins, A.login), "the deleted profile did not return");
    assert(!readFileSync(roomFile(d, "LIVE") + ".fenced", "utf8").includes(A.id), "the fenced snapshot was redacted before it was set aside");
    assertAbsent(d, [A.id, "Ashling"], "no row carries after the replay");
    assert.equal(Object.values(s.profiles).filter((p) => p.mediaKey !== null).length, 0, "no profile inherited the media binding");
  });

  await scenario("fenced rooms and unreadable pending files lose the profile, after a start with the store unavailable too", async () => {
    const before = store(d);
    // A pending file that does not parse, and one that parses but is not an outcome this host wrote. Both name the profile.
    const BROK = randomUUID();
    const ODD = randomUUID();
    writeFileSync(pendingFile(d, BROK), `{"v":1,"gameId":"${BROK}","players":[{"profileId":"${A.id}","name":"Ashling"`);
    writeFileSync(pendingFile(d, ODD), JSON.stringify({ ...JSON.parse(stalePend), v: 2, gameId: ODD }));
    // A hand-edited pending copy of a recorded game, with a forged fingerprint.
    writeFileSync(pendingFile(d, PEND), JSON.stringify({ ...JSON.parse(stalePend), fingerprint: "0".repeat(64) }));
    // A room fenced before the deletion and kept, and a stale snapshot of BROK's game that the next start fences.
    writeFileSync(`${roomFile(d, "OLDF")}.fenced`, staleLive);
    seedRoom(d, "FENC", [ash, brook, "guest"]);
    const fenc = readJson(roomFile(d, "FENC"));
    fenc.roster.gameId = BROK;
    writeFileSync(roomFile(d, "FENC"), JSON.stringify(fenc));
    const kept = [pendingFile(d, BROK), pendingFile(d, ODD), `${roomFile(d, "OLDF")}.fenced`, `${roomFile(d, "FENC")}.fenced`];
    // Another live process holds the store's lock, so this start cannot read the tombstones.
    const lock = path.join(d.profiles, "writer.lock");
    rmSync(lock, { recursive: true, force: true });
    mkdirSync(lock);
    writeFileSync(path.join(lock, `owner-${process.pid}-${randomBytes(12).toString("hex")}`), String(process.pid));
    let h = start(d);
    await h.port;
    await until(() => h.err.includes("profiles: store unavailable (locked); pending outcomes and saved rooms keep any deleted profile until a start with the store available redacts them"), "the unavailable store is logged");
    await until(() => h.err.includes(`holds game ${BROK} at main, but that game already finished; fenced`), "FENC is fenced");
    assert(!h.out.includes("profiles: redacted"), "an unavailable store redacts nothing");
    for (const f of kept) assert(readFileSync(f, "utf8").includes(A.id), `${path.basename(f)} still names the profile`);
    await h.stop();
    rmSync(lock, { recursive: true });

    h = start(d);
    await h.port;
    const at = h.out.indexOf("listening");
    for (const f of kept) {
      const i = h.out.indexOf(`profiles: redacted a deleted profile from ${path.basename(f)}, kept for repair`);
      assert(i >= 0 && i < at, `${path.basename(f)} was redacted before listening`);
    }
    assert(h.out.indexOf(`profiles: redacted a deleted profile from the pending outcome of game ${PEND}`) < at);
    await until(() => h.err.includes(`results: game ${PEND} does not match its recorded receipt; nothing changed`), "the forged fingerprint is refused");
    await h.stop();
    const after = kept.map((f) => readFileSync(f, "utf8"));
    for (const [i, text] of after.entries()) assert(!text.includes(A.id), `${path.basename(kept[i])} holds no profile id`);
    for (const f of kept.slice(0, 2)) assert(!readFileSync(f, "utf8").includes("Ashling"), `${path.basename(f)} holds no name`);
    assert(readFileSync(pendingFile(d, ODD), "utf8").includes(P.Brook.id), "the other player's row is kept for repair");
    for (const f of kept.slice(2)) {
      const room = readJson(f);
      assert.equal(room.seats.length, 3, `${path.basename(f)} is redacted row by row, not replaced`);
      assert(!JSON.stringify([room.roster, room.outcome, room.seats]).includes("Ashling"), `${path.basename(f)} rows hold no name`);
    }
    const stale = readFileSync(pendingFile(d, PEND), "utf8");
    assert(!stale.includes(A.id) && !stale.includes("Ashling"), "the forged copy is redacted and kept for repair");
    const s = store(d);
    assert.deepEqual([s.receipts, s.results, s.records], [before.receipts, before.results, before.records], "the forged fingerprint changed nothing");

    // Idempotent: a third start rewrites nothing, the rooms stay fenced, and the unreadable files still fence their games.
    h = start(d);
    await h.port;
    assert(!h.out.includes("profiles: redacted"), "the third start found nothing left to redact");
    await until(() => [BROK, ODD].every((id) => h.err.includes(`pending outcome ${id}.json`)), "the unreadable files are still kept for repair");
    assert(!/restored .*\b(FENC|LIVE)\b/.test(h.out), "no fenced room plays again");
    await h.stop();
    assert(!existsSync(roomFile(d, "FENC")) && !existsSync(roomFile(d, "OLDF")));
    assert.deepEqual(kept.map((f) => readFileSync(f, "utf8")), after, "nothing changed on the third start");
    const tmps = [d.rooms, d.results, d.profiles].flatMap((dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".tmp")) : []));
    assert.deepEqual(tmps, [], "after the final start the three folders hold no hidden .tmp file");
  });

  await scenario("on the store: interrupted, repeated and stale deletions", async () => {
    const e = folders();
    const Q = seedStore(e, ["Dune", "Elm"]);
    let fail = true;
    const s = openProfiles(e.profiles, { colors: PLAYER_COLORS, fault: (point) => { if (fail && point === "delete-before") throw new Error("injected"); } });
    const outcome = (gameId, rows) => ({ v: 1, gameId, startedAt: 0, endedAt: 100, policy: 1, eligible: true, victoryTarget: 10, winner: "p1", players: rows.map((id, i) => ({ pid: `p${i}`, seat: `s${i}`, profileId: id, name: `Name${i}`, color: PLAYER_COLORS[i], kind: "human", points: i === 1 ? 10 : 2, won: i === 1, assisted: false })) });
    const g1 = outcome(randomUUID(), [Q.Dune.id, Q.Elm.id]);
    assert.equal(await s.recordOutcome(g1), "committed");
    const file = readFileSync(storeFile(e), "utf8");
    await assert.rejects(s.deleteProfile(Q.Dune.id), /injected/);
    assert.equal(readFileSync(storeFile(e), "utf8"), file, "an interrupted transaction wrote nothing");
    assert.equal(s.validate(Q.Dune.token), Q.Dune.id, "and revoked nothing");
    fail = false;
    assert.deepEqual(await s.deleteProfile(Q.Dune.id), { resultRows: 1 });
    assert.equal(s.validate(Q.Dune.token), null);
    assert.equal(s.tombstoned(Q.Dune.id), true);
    await assert.rejects(s.deleteProfile(Q.Dune.id), (x) => x instanceof ProfileError && x.code === "notFound", "a second deletion is refused");
    for (const bad of [undefined, null, 7, "x", randomUUID()]) await assert.rejects(s.deleteProfile(bad), (x) => x.code === "notFound");
    assert.equal(await s.recordOutcome(structuredClone(g1)), "duplicate", "the stored receipt still dedupes the unredacted outcome");
    // A hand-edited fingerprint on a recorded game, malformed or forged, never matches its receipt: refused, and nothing changes.
    const held = readFileSync(storeFile(e), "utf8");
    for (const bad of ["not-a-hash", "0".repeat(64)]) {
      await assert.rejects(s.recordOutcome({ ...structuredClone(g1), fingerprint: bad }), (x) => x instanceof ProfileError && x.code === "conflict", `the fingerprint ${bad} is refused`);
    }
    assert.equal(readFileSync(storeFile(e), "utf8"), held);
    const g2 = outcome(randomUUID(), [Q.Dune.id, Q.Elm.id]);
    assert.equal(await s.recordOutcome(g2), "committed");
    const doc = store(e);
    assert.deepEqual([doc.results[g2.gameId].players[0].profileId, doc.results[g2.gameId].players[0].name], [null, DELETED_NAME], "a stale outcome is redacted at commit");
    assert(!Object.hasOwn(doc.records, Q.Dune.id) && doc.records[Q.Elm.id].wins === 2);
    assert(!openProfiles(e.profiles, { colors: PLAYER_COLORS }).ready, "the store stays locked by its live owner");
  });

  await scenario("curated repository assets are untouched", async () => {
    assert.deepEqual(assetHashes(), assets);
    assert(Object.keys(assets).some((f) => f.endsWith("isaac_win.mp3")), "the bound win song is among them");
  });

  console.log(`profile deletion prove ok: ${done.length} scenarios`);
  process.exit(0);
} catch (e) {
  console.log("FAIL", e.stack ?? e.message);
  process.exit(1);
}
