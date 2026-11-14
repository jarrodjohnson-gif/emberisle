// #1610: compatible room persistence for five and six seats (docs/design/six-players.md, "Save, restart, and rejoin
// compatibility"). Real hosts, killed -9 and restarted on the same room folder:
// 1. Classic rooms saved by the shape-2 host (fixtures/expanded-persist, made on the parent commit) are migrated to shape 3
//    with nothing else changed, and restore exactly: board, hands, deck order, colours, seats, chat and progress.
// 2. A five and a six seat game, mid partner activation with fortunes bought this activation, and mid primary activation
//    with an outstanding discard, survive a restart byte for byte, then play on exactly as a never-restarted twin host.
// 3. The fifth and sixth seats rejoin with their original secrets and remaining turn windows, and a room keeps a recovery
//    pid for every taken-over seat, past four, through snapshot, load and takeover.
// 4. Malformed, unknown-shape and unknown-variant files are refused and kept aside byte for byte, never deleted or misread.
// `node --import ./server/register.mjs server/expanded-persist-prove.mjs --make-fixtures <server dir>` rewrites the
// fixtures with the host in <server dir>; run it with a shape-2 host (the commit before #1610), never with this one.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createExpandedGame } from "../src/lib/game/expanded.ts";
import { applyAction, legalRoads, stealTargets } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";
import { toIntent } from "../src/lib/net/table.ts";

const SERVER = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = path.join(SERVER, "fixtures", "expanded-persist");
const CLASSIC = ["classic-3.json", "classic-4.json", "lobby-3.json"];
const dirs = [];
const hosts = new Set();
const sockets = [];
process.on("exit", () => {
  for (const h of hosts) h.proc.kill("SIGKILL");
  for (const c of sockets) c.ws.terminate();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  checks++;
};
const tmp = (tag) => {
  const d = mkdtempSync(path.join(tmpdir(), `emberisle-xpersist-${tag}-`));
  dirs.push(d);
  return d;
};
const file = (dir, code) => path.join(dir, `${code}.json`);
const roomFile = (dir, code) => JSON.parse(readFileSync(file(dir, code), "utf8"));

function boot(dir, env = {}, cwd = SERVER) {
  const proc = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd,
    env: { ...process.env, PORT: "0", ROOMS_DIR: dir, RESULTS_DIR: `${dir}/results`, PROFILES_DIR: `${dir}/profiles`, SAVE_MS: "20", ACT_CAP: "1000", ACT_RATE: "1000", GRACE_MS: "60000", HOLD_MS: "120000", TURN_MS: "60000", TURN_TOTAL_MS: "600000", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const h = { proc, out: "", err: "" };
  hosts.add(h);
  proc.stdout.on("data", (d) => (h.out += d));
  proc.stderr.on("data", (d) => (h.err += d));
  return new Promise((resolve, reject) => {
    proc.stdout.on("data", () => {
      const m = h.out.match(/listening (\d+)/);
      if (m && !h.port) resolve(Object.assign(h, { port: Number(m[1]) }));
    });
    proc.on("exit", (c) => reject(new Error(`host exited ${c}: ${h.err}`)));
  });
}

async function kill9(h) {
  h.proc.removeAllListeners("exit");
  h.proc.kill("SIGKILL");
  await new Promise((r) => (h.proc.exitCode !== null || h.proc.signalCode ? r() : h.proc.once("exit", r)));
  hosts.delete(h);
}

async function term(h) {
  h.proc.removeAllListeners("exit");
  const done = new Promise((r) => h.proc.once("exit", r));
  h.proc.kill("SIGTERM");
  await done;
  hosts.delete(h);
}

async function client(port, hello, label = hello.secret ?? hello.name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, label, inbox: [], waiters: [], state: null, logs: [] };
  sockets.push(c);
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") c.state = msg;
    if (msg.type === "log") c.logs.push(msg.text);
    c.inbox.push(msg);
    for (const w of c.waiters.splice(0)) w();
  });
  c.send = (msg) => ws.send(JSON.stringify({ ...c.state?.actionStamp, cid: crypto.randomUUID(), ...msg }));
  c.next = async (type, pred = () => true, ms = 5000) => {
    const end = Date.now() + ms;
    for (;;) {
      const i = c.inbox.findIndex((m) => m.type === type && pred(m));
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      if (Date.now() > end) throw new Error(`${label} waited for ${type}`);
      await new Promise((res) => {
        c.waiters.push(res);
        setTimeout(res, 50);
      });
    }
  };
  c.until = async (cond, what, ms = 5000) => {
    const end = Date.now() + ms;
    while (!cond()) {
      if (Date.now() > end) throw new Error(`${label} waited for ${what}`);
      await sleep(20);
    }
  };
  await new Promise((res, rej) => {
    ws.once("open", res);
    ws.once("error", rej);
  });
  ws.send(JSON.stringify({ type: "hello", ...hello }));
  c.welcome = await c.next("welcome");
  return c;
}

// One move through the host: the new state, or the host's error for this seat.
async function move(c, action) {
  const seq = c.state.game.seq;
  c.inbox = c.inbox.filter((m) => m.type !== "error");
  c.send(toIntent(action));
  const end = Date.now() + 5000;
  for (;;) {
    const err = c.inbox.find((m) => m.type === "error");
    if (err) return { error: err.message };
    if (c.state.game.seq > seq) return { seq: c.state.game.seq };
    if (Date.now() > end) throw new Error(`${c.label}: no answer to ${action.type}`);
    await sleep(10);
  }
}

async function savedAt(dir, code, seq) {
  const end = Date.now() + 5000;
  for (;;) {
    try {
      const r = roomFile(dir, code);
      if (r.game?.seq === seq) return r;
    } catch {}
    if (Date.now() > end) throw new Error(`${code} never saved seq ${seq}: ${existsSync(file(dir, code)) ? roomFile(dir, code).game?.seq : "no file"}`);
    await sleep(20);
  }
}

// Local dice: the rules roll through crypto.getRandomValues. Queued faces first, then a fixed xorshift, so the
// constructed games are the same on every run. The hosts roll their own dice; no host roll is compared.
const faces = [];
let xs = 1610;
crypto.getRandomValues = (buf) => {
  for (let i = 0; i < buf.length; i++) {
    if (faces.length) buf[i] = faces.shift() - 1;
    else {
      xs ^= xs << 13; xs >>>= 0; xs ^= xs >>> 17; xs ^= xs << 5; xs >>>= 0;
      buf[i] = xs;
    }
  }
  return buf;
};

function act(g, pid, action) {
  const r = applyAction(g, pid, action);
  assert.equal(r.error, undefined, `${pid} ${action.type}: ${r.error}`);
  return r.state;
}

// Roll-off and setup by the practice bot, until the first primary activation.
function setup(g) {
  for (let i = 0; !g.role; i++) {
    assert(i < 200, "setup ends");
    g = act(g, g.current, chooseBotAction(g, g.current));
  }
  return g;
}

// Paired turns with no seven until `pid` is the primary in its action phase.
function toPrimary(g, pid) {
  for (let n = 0; n < 60; n++) {
    if (g.role === "primary" && g.primary === pid && g.phase === "main") return g;
    if (g.phase === "roll") {
      faces.push(2, 3);
      g = act(g, g.current, { type: "roll" });
    } else g = act(g, g.current, { type: "endTurn" });
  }
  throw new Error("never reached the primary");
}

function give(g, pid, bag) {
  const p = g.players.find((x) => x.id === pid);
  for (const [r, n] of Object.entries(bag)) {
    p.resources[r] += n;
    g.bank[r] -= n;
  }
}
// The card the next buy draws, taken from inside the deck so its counts stay true.
function onTop(g, kind) {
  g.deck.splice(g.deck.indexOf(kind), 1);
  g.deck.unshift(kind);
}
function dealt(g, pid, kind) {
  g.deck.splice(g.deck.indexOf(kind), 1);
  g.players.find((x) => x.id === pid).hidden[kind] += 1;
}
function discardOf(p, n) {
  const out = {};
  for (const r of RESOURCES) {
    const k = Math.min(n, p.resources[r]);
    if (k) out[r] = k;
    n -= k;
  }
  return out;
}

// Seat sN holds pN, as startGame seats them; the roll-off reorders only `game.players`.
function roomOf(code, g, extra = {}) {
  const seats = [...g.players].sort((x, y) => x.id.localeCompare(y.id)).map((p, i) => ({ id: `s${i}`, name: p.name.replace(/ \(bot\)$/, ""), color: p.color, ready: true, pid: p.id, secret: `${code}-${p.id}`, turnDeadline: null, turnStartedAt: null }));
  return { code, visibility: "private", host: "s0", next: seats.length, botDeclined: {}, recoveryPids: [], chat: [], chatSeq: 0, game: g, victoryTarget: 10, wayfarerMode: "on", seats, roster: null, outcome: null, assisted: [], shape: 3, savedAt: Date.now(), ...extra };
}
const write = (dir, room) => writeFileSync(file(dir, room.code), JSON.stringify(room));

// ---- Fixture mode: classic rooms played and saved by the host in <server dir>, which must be a shape-2 host. ----
async function makeFixtures(cwd) {
  const dir = tmp("make");
  const h = await boot(dir, { BOT_ANSWER_MS: "50" }, cwd);
  async function sit(names) {
    const first = await client(h.port, { name: names[0] }, names[0]);
    const code = first.welcome.code;
    const rest = [];
    for (const n of names.slice(1)) rest.push(await client(h.port, { code, name: n }, n));
    return { code, all: [first, ...rest] };
  }
  async function play(all, stop) {
    for (let n = 0; n < 400; n++) {
      await sleep(40);
      const top = all.reduce((a, c) => (c.state && (!a || c.state.game.seq > a.state.game.seq) ? c : a), null);
      const g = top.state.game;
      if (stop(g)) return n;
      const actor = all.find((c) => c.state?.game.seq === g.seq && (g.phase === "discard" ? c.state.legal.discard > 0 : c.state.you === g.current));
      if (!actor) continue;
      const action = chooseBotAction(actor.state.game, actor.state.you);
      const r = action && toIntent(action) ? await move(actor, action) : { error: "none" };
      if (r.error && g.phase === "main") await move(actor, { type: "endTurn" });
    }
    throw new Error("fixture game never reached its stop");
  }
  const humanTurn = (bots) => (g) => g.turn >= 4 && g.phase === "main" && !bots.includes(g.current);

  const three = await sit(["Ember", "Tide", "Pine"]);
  for (const c of three.all) c.send({ type: "ready", value: true });
  await sleep(200);
  three.all[0].send({ type: "start" });
  await three.all[0].next("state");
  await play(three.all, humanTurn([]));
  three.all[1].send({ type: "chat", text: "saved before shape 3" });

  const four = await sit(["Ash", "Reed"]);
  four.all[0].send({ type: "addBot" });
  four.all[0].send({ type: "addBot" });
  for (const c of four.all) c.send({ type: "ready", value: true });
  await sleep(200);
  four.all[0].send({ type: "start" });
  await four.all[0].next("state");
  await play(four.all, humanTurn(["p2", "p3"]));
  four.all[0].send({ type: "chat", text: "two bots at this table" });

  const lobby = await sit(["Fern", "Gale", "Hail"]);
  lobby.all[0].send({ type: "ready", value: true });
  lobby.all[2].send({ type: "ready", value: true });
  await sleep(300);
  await term(h);
  mkdirSync(FIXTURES, { recursive: true });
  for (const [code, name] of [[three.code, CLASSIC[0]], [four.code, CLASSIC[1]], [lobby.code, CLASSIC[2]]]) {
    const saved = roomFile(dir, code);
    assert.equal(saved.shape, 2, `${name} was saved by a shape-2 host`);
    writeFileSync(path.join(FIXTURES, name), `${JSON.stringify(saved, null, 1)}\n`);
    console.log(`fixture ${name}: room ${code}, shape ${saved.shape}, ${saved.seats.length} seats, ${saved.game ? `seq ${saved.game.seq}, turn ${saved.game.turn}, ${saved.game.phase}` : "lobby"}`);
  }
}

if (process.argv[2] === "--make-fixtures") {
  await makeFixtures(path.resolve(process.argv[3]));
  process.exit(0);
}

// ---- The constructed expanded rooms. ----
const X5 = "XFIV";
const X6 = "XSIX";
const RC = "XREC";
// The seat k places after `pid` in turn order: a primary's partner is +3, the next primary +1.
function seatAt(g, pid, k) {
  const n = g.players.length;
  return g.players[(g.players.findIndex((p) => p.id === pid) + k + n * 2) % n].id;
}
// Five seats: P is p4's primary. P buys a path card, then p4 trades with the bank and buys a knight; Q, the next primary,
// holds a knight from before.
function fiveSeats() {
  let g = setup(createExpandedGame({ humans: ["Ember", "Tide", "Dune", "Pine", "Moss"].map((name) => ({ name })), bots: 0, seed: 1610, victoryTarget: 7 }));
  const P = seatAt(g, "p4", -3);
  const Q = seatAt(g, P, 1);
  g = toPrimary(g, P);
  give(g, P, { wool: 1, grain: 1, ore: 1 });
  give(g, "p4", { timber: 5, clay: 1, wool: 1, grain: 1, ore: 1 });
  onTop(g, "knight");
  onTop(g, "road");
  dealt(g, Q, "knight");
  return { g, P, Q };
}
// Six seats: P1 buys, its partner M buys, then P2 (p5's primary) rolls a seven with p5 and V over the limit.
function sixSeats() {
  let g = setup(createExpandedGame({ humans: ["Ember", "Tide", "Dune", "Pine", "Moss", "Flint"].map((name) => ({ name })), bots: 0, seed: 1611 }));
  const P2 = seatAt(g, "p5", -3);
  const P1 = seatAt(g, P2, -1);
  const M = seatAt(g, P1, 3);
  const V = ["p0", "p1", "p2", "p3", "p4"].find((pid) => pid !== P2);
  g = toPrimary(g, P1);
  give(g, P1, { wool: 1, grain: 1, ore: 1 });
  g = act(g, P1, { type: "buyCard" });
  g = act(g, P1, { type: "endTurn" });
  assert.equal(g.current, M, "P1's partner acts");
  give(g, M, { wool: 1, grain: 1, ore: 1 });
  g = act(g, M, { type: "buyCard" });
  g = act(g, M, { type: "endTurn" });
  assert.deepEqual([g.primary, g.phase], [P2, "roll"]);
  for (const p of g.players) give(g, p.id, Object.fromEntries(RESOURCES.map((r) => [r, -p.resources[r]])));
  give(g, "p5", { timber: 5, clay: 2, wool: 2 });
  give(g, V, { grain: 4, ore: 4 });
  give(g, P2, { wool: 1, grain: 1, ore: 1 });
  faces.push(3, 4);
  g = act(g, P2, { type: "roll" });
  assert.equal(g.phase, "discard");
  assert.deepEqual(Object.keys(g.discardNeeded).sort(), [V, "p5"].sort());
  return { g, P1, M, P2, V, P3: seatAt(g, P2, 1) };
}
function recoverySeats() {
  let g = setup(createExpandedGame({ humans: ["Ember", "Tide", "Dune", "Pine", "Moss", "Flint"].map((name) => ({ name })), bots: 0, seed: 1612 }));
  g = toPrimary(g, "p0");
  give(g, "p0", { timber: 1 });
  for (const p of g.players) {
    if (p.id === "p0") continue;
    p.kind = "bot";
    p.name = `${p.name} (bot)`;
  }
  return g;
}

// ---- Refused files: each is kept aside byte for byte with its reason, and nothing else happens to it. ----
function refusals(g5) {
  const clone = () => structuredClone(g5);
  const out = [];
  const add = (code, why, room) => out.push({ code, why, text: JSON.stringify(room) });
  add("FUTA", "shape 4, this host reads 2 to 3", roomOf("FUTA", clone(), { shape: 4 }));
  add("FUTB", "shape 99, this host reads 2 to 3", { shape: 99, format: "from a newer host", savedAt: 0 });
  let g = clone();
  g.variant.version = 2;
  add("VARA", "unknown variant", roomOf("VARA", g));
  g = clone();
  g.variant = { kind: "mega", version: 1, turns: { rule: "paired", version: 1 }, wastes: g.variant.wastes };
  add("VARB", "unknown variant", roomOf("VARB", g));
  g = clone();
  g.variant.turns = { rule: "special", version: 1 };
  add("VARC", "unknown variant", roomOf("VARC", g));
  add("LEGA", "a variant in a shape-2 room", roomOf("LEGA", clone(), { shape: 2 }));
  g = clone();
  g.current = g.primary;
  g.role = "partner";
  add("MALA", `bad paired turn: ${g.current} acts as partner`, roomOf("MALA", g));
  g = clone();
  delete g.variant;
  delete g.primary;
  delete g.role;
  delete g.activation;
  add("MALB", "5 players in a classic game", roomOf("MALB", g));
  g = clone();
  g.activation = 0;
  add("MALC", "bad paired turn", roomOf("MALC", g));
  g = clone();
  g.hexes = g.hexes.slice(0, 19);
  add("MALD", "not the expanded island", roomOf("MALD", g));
  g = clone();
  g.players[3].boughtThisTurn.knight = -1;
  add("MALE", "bad fortunes", roomOf("MALE", g));
  g = clone();
  g.variant.wastes = [g.hexes.find((h) => h.terrain !== "waste").id, g.variant.wastes[1]];
  add("MALF", "bad wastes", roomOf("MALF", g));
  return out;
}

const gameText = (r) => JSON.stringify(r.game);
const seatCore = ({ id, name, color, ready, pid, secret, bot, profileId, needs }) => ({ id, name, color, ready, pid, secret, bot, profileId, needs });
const restOf = ({ savedAt, shape, seats, ...rest }) => rest;

try {
  // ---- Build every room file before the first host starts. ----
  const A = tmp("a");
  const B = tmp("twin");
  const fixtures = CLASSIC.map((name) => {
    const text = readFileSync(path.join(FIXTURES, name), "utf8");
    const saved = JSON.parse(text);
    assert.equal(saved.shape, 2, `${name} is a shape-2 file`);
    // The fixtures are older than the host's one-day room limit: the save time and the saved turn windows move forward
    // together, as if the room were saved just now. Nothing else changes.
    const shift = Date.now() - saved.savedAt;
    const later = (t) => (t === null || t === undefined ? t : t + shift);
    const fresh = { ...saved, savedAt: saved.savedAt + shift, seats: saved.seats.map((s) => ({ ...s, turnDeadline: later(s.turnDeadline), turnStartedAt: later(s.turnStartedAt) })) };
    writeFileSync(file(A, saved.code), JSON.stringify(fresh));
    return { name, saved, fresh };
  });
  const S5 = fiveSeats();
  const S6 = sixSeats();
  const g5 = S5.g;
  const g6 = S6.g;
  const P = S5.P;
  const Q = S5.Q;
  const { P2, V, P3 } = S6;
  const who = (g, pid) => g.players.find((p) => p.id === pid);
  for (const dir of [A, B]) {
    write(dir, roomOf(X5, g5, { victoryTarget: 7, chat: [{ id: 0, seat: "s4", player: "p4", name: "Moss", color: g5.players.find((p) => p.id === "p4").color, text: "fifth seat here", at: 1 }], chatSeq: 1 }));
    write(dir, roomOf(X6, g6));
  }
  const refused = refusals(g5);
  for (const r of refused) writeFileSync(file(A, r.code), r.text);
  // #1654: two refused files in one load whose first names are already taken by files kept aside before. Each takes the next
  // free name, and every older one stays as it was.
  const taken = [
    { code: "DUPA", text: JSON.stringify({ shape: 98, savedAt: 0 }), old: { ".unsupported": "kept before, 1", ".1.unsupported": "kept before, 2" }, lands: ".2.unsupported" },
    { code: "DUPB", text: JSON.stringify({ shape: 97, savedAt: 0 }), old: { ".unsupported": "kept before, 3" }, lands: ".1.unsupported" },
  ];
  for (const t of taken) {
    writeFileSync(file(A, t.code), t.text);
    for (const [end, text] of Object.entries(t.old)) writeFileSync(`${file(A, t.code)}${end}`, text);
  }
  console.log(`built: ${fixtures.length} classic fixtures, ${X5} (5 seats, ${g5.primary} primary), ${X6} (6 seats, discard owed by ${Object.keys(g6.discardNeeded).join(" ")}), ${refused.length} files to refuse`);

  // ---- First boot. ----
  let a = await boot(A);
  const b = await boot(B);

  // 4. Refused files: set aside byte for byte, never loaded, never deleted.
  for (const r of refused) {
    ok(!existsSync(file(A, r.code)), `${r.code}.json is no longer a live room file`);
    eq(readFileSync(`${file(A, r.code)}.unsupported`, "utf8"), r.text, `${r.code} is kept byte for byte`);
    ok(a.err.includes(`unsupported room file: ${r.code}.json (${r.why}`), `${r.code} refused for: ${r.why}`);
    ok(!a.out.includes(r.code), `${r.code} is not restored`);
  }
  console.log(`refused: ${refused.length} files kept aside as <code>.json.unsupported byte for byte (${refused.map((r) => r.code).join(" ")}), none restored`);
  for (const t of taken) {
    ok(!existsSync(file(A, t.code)), `${t.code}.json is no longer a live room file`);
    eq(readFileSync(`${file(A, t.code)}${t.lands}`, "utf8"), t.text, `${t.code} is kept as ${t.code}.json${t.lands}, byte for byte`);
    for (const [end, text] of Object.entries(t.old)) eq(readFileSync(`${file(A, t.code)}${end}`, "utf8"), text, `${t.code}.json${end}, kept before, is untouched`);
    ok(a.err.includes(`kept as ${t.code}.json${t.lands}`), `the host says ${t.code} went to ${t.code}.json${t.lands}`);
  }
  console.log(`refused onto taken names: ${taken.map((t) => `${t.code} -> ${t.code}.json${t.lands}`).join(", ")}, the older files untouched`);

  // 1. Classic: migrated with nothing but the shape changed, then restored exactly.
  for (const f of fixtures) {
    const code = f.saved.code;
    const migrated = roomFile(A, code);
    eq(migrated.shape, 3, `${f.name} migrated to shape 3`);
    eq({ ...migrated, shape: 2 }, f.fresh, `${f.name}: the migration changed nothing but the shape`);
    ok(a.out.includes(`migrated room file: ${code}.json (shape 2 to 3, classic)`), `${f.name} migration logged`);
  }
  let classicLines = [];
  for (const f of fixtures) {
    const code = f.saved.code;
    const humans = f.saved.seats.filter((s) => !s.bot);
    const back = [];
    for (const s of humans) back.push(await client(a.port, { code, secret: s.secret }));
    for (const [i, c] of back.entries()) eq(c.welcome.you, humans[i].id, `${f.name}: ${humans[i].name} has seat ${humans[i].id} back`);
    if (f.saved.game) {
      for (const c of back) await c.until(() => c.state, "state");
      const after = await savedAt(A, code, f.saved.game.seq);
      await sleep(100);
      const now = roomFile(A, code);
      eq(gameText(now), gameText(f.saved), `${f.name}: the game is byte for byte the saved one`);
      eq({ ...restOf(now), roster: undefined }, { ...restOf(f.saved), roster: undefined }, `${f.name}: room fields restored`);
      // The shape-2 host keeps a roster only while its rows follow game.players (loadRoster), so one frozen before the roll-off
      // reordered the players is dropped on any restart; the parent commit's host does the same with these fixtures.
      const kept = f.saved.roster?.players.every((p, i) => p.pid === f.saved.game.players[i].id);
      eq(now.roster, kept ? f.saved.roster : null, `${f.name}: roster treated as the shape-2 host treats it`);
      eq(now.seats.map(seatCore), f.saved.seats.map(seatCore), `${f.name}: seats, colours and secrets restored`);
      ok(after.shape === 3, `${f.name}: saved again as shape 3`);
      for (const c of back) {
        const me = f.saved.game.players.find((p) => p.id === c.state.you);
        const view = c.state.game;
        eq(view.players.find((p) => p.id === me.id).resources, me.resources, `${f.name}: ${me.id}'s hand`);
        eq(view.players.find((p) => p.id === me.id).hidden, me.hidden, `${f.name}: ${me.id}'s fortunes`);
        eq(view.deckLeft, f.saved.game.deck.length, `${f.name}: deck size`);
        eq([view.hexes, view.vertices, view.edges, view.robberHex], [f.saved.game.hexes, f.saved.game.vertices, f.saved.game.edges, f.saved.game.robberHex], `${f.name}: the board`);
        eq(view.players.map((p) => [p.id, p.color, p.name, p.kind]), f.saved.game.players.map((p) => [p.id, p.color, p.name, p.kind]), `${f.name}: players and colours`);
      }
      const g = f.saved.game;
      classicLines.push(`${f.name} ${g.players.length} seats seq ${g.seq} turn ${g.turn} ${g.phase}, deck ${g.deck.length}, ${g.vertices.filter((v) => v.building).length} buildings, ${g.edges.filter((e) => e.path).length} paths, chat ${now.chat.length}: identical`);
    } else {
      await sleep(150);
      const now = roomFile(A, code);
      eq(now.seats.map((s) => [s.id, s.ready]), f.saved.seats.map((s) => [s.id, Boolean(s.bot)]), `${f.name}: restored lobby seats are not ready`);
      eq(now.seats.map(({ ready, ...s }) => seatCore(s)), f.saved.seats.map(({ ready, ...s }) => seatCore(s)), `${f.name}: lobby seats, colours and secrets restored`);
      eq(restOf(now), restOf(f.saved), `${f.name}: lobby fields restored`);
      classicLines.push(`${f.name} lobby, ${now.seats.length} seats back unready with their colours and secrets`);
    }
    for (const c of back) c.ws.terminate();
  }
  for (const line of classicLines) console.log(`classic: ${line}`);

  // 2. Expanded: every seat on both hosts, the same moves, then A is killed -9.
  const seatsOf = (code, g) => g.players.map((p) => ({ code, secret: `${code}-${p.id}` }));
  const join = async (h, code, g) => {
    const cs = {};
    for (const [i, hello] of seatsOf(code, g).entries()) {
      cs[g.players[i].id] = await client(h.port, hello);
      await cs[g.players[i].id].until(() => cs[g.players[i].id].state, "state");
    }
    return cs;
  };
  let A5 = await join(a, X5, g5);
  const B5 = await join(b, X5, g5);
  let A6 = await join(a, X6, g6);
  const B6 = await join(b, X6, g6);
  const local = { [X5]: g5, [X6]: g6 };
  // One move on both hosts and in the local rules: the same answer everywhere, and the same saved game on A and B.
  async function both(code, AC, BC, pid, action, label) {
    const want = applyAction(local[code], pid, action);
    const [ra, rb] = [await move(AC[pid], action), await move(BC[pid], action)];
    eq(ra.error, want.error, `${label}: host A answers as the rules do`);
    eq(rb.error, want.error, `${label}: the twin answers as the rules do`);
    if (!want.error) local[code] = want.state;
    const seq = local[code].seq;
    const [fa, fb] = [await savedAt(A, code, seq), await savedAt(B, code, seq)];
    eq(gameText(fa), gameText(fb), `${label}: A and the twin saved the same game`);
    eq(fa.game, JSON.parse(JSON.stringify(local[code])), `${label}: the saved game is the rules' game`);
    ok(fa.shape === 3, `${label}: saved as shape 3`);
    return want.error ?? "ok";
  }
  await both(X5, A5, B5, P, { type: "buyCard" }, `X5 ${P} buys`);
  await both(X5, A5, B5, P, { type: "endTurn" }, `X5 ${P} ends; p4 partners`);
  await both(X5, A5, B5, "p4", { type: "bankTrade", give: "timber", want: "clay" }, "X5 p4 bank trade");
  await both(X5, A5, B5, "p4", { type: "buyCard" }, "X5 p4 buys");
  await both(X6, A6, B6, V, { type: "discard", resources: discardOf(who(local[X6], V), local[X6].discardNeeded[V]) }, `X6 ${V} discards`);
  const before5 = roomFile(A, X5);
  const before6 = roomFile(A, X6);
  const g5c = before5.game;
  ok(g5c.role === "partner" && g5c.primary === P && g5c.current === "p4", "X5 is mid partner activation");
  ok(who(g5c, "p4").boughtThisTurn.knight === 1 && who(g5c, P).boughtThisTurn.road === 1, `X5: p4 and ${P} hold fortunes bought this paired turn`);
  ok(before6.game.phase === "discard" && before6.game.discardNeeded.p5 === 4 && !before6.game.discardNeeded[V], "X6 is mid primary activation with p5's discard outstanding");
  const d5 = A5.p4.state.turnDeadline;
  const d6 = A6.p5.state.turnDeadline;
  ok(d5 > Date.now() && before5.seats[4].turnDeadline === d5, "X5: p4's window is on disk");
  ok(d6 > Date.now() && before6.seats[5].turnDeadline === d6, "X6: p5's window is on disk");
  console.log(`before: X5 activation ${g5c.activation} (${g5c.role} ${g5c.current} for ${g5c.primary}), p4 bought knight ${who(g5c, "p4").boughtThisTurn.knight}, ${P} bought path ${who(g5c, P).boughtThisTurn.road}; X6 activation ${before6.game.activation} discard owed ${JSON.stringify(before6.game.discardNeeded)}`);
  for (const c of [...Object.values(A5), ...Object.values(A6)]) c.ws.terminate();
  await kill9(a);

  // ---- Restart A. ----
  a = await boot(A);
  ok(a.out.includes(X5) && a.out.includes(X6), "both expanded rooms restored");
  for (const r of refused) eq(readFileSync(`${file(A, r.code)}.unsupported`, "utf8"), r.text, `${r.code} untouched by the second boot`);
  await sleep(1000);
  A5 = await join(a, X5, g5);
  A6 = await join(a, X6, g6);
  // 3. The fifth and sixth seats are back with their secrets, and their windows run on from the saved deadlines.
  for (const [cs, pid, seat] of [[A5, "p4", "s4"], [A6, "p4", "s4"], [A6, "p5", "s5"]]) {
    eq([cs[pid].welcome.you, cs[pid].state.you], [seat, pid], `${pid} rejoined seat ${seat} with its secret`);
    ok(cs[pid].state.game.players.find((p) => p.id === pid).kind === "human", `${pid} is a person again`);
  }
  const off5 = A5.p4.state.turnDeadline - d5;
  const off6 = A6.p5.state.turnDeadline - d6;
  ok(Math.abs(off5) < 1000 && Math.abs(off6) < 1000, `windows resumed (${off5} ms, ${off6} ms from the saved deadlines)`);
  const after5 = await savedAt(A, X5, g5c.seq);
  const after6 = await savedAt(A, X6, before6.game.seq);
  await sleep(100);
  eq(gameText(roomFile(A, X5)), gameText(before5), "X5: the restarted game is byte for byte the saved one");
  eq(gameText(roomFile(A, X6)), gameText(before6), "X6: the restarted game is byte for byte the saved one");
  for (const [code, before] of [[X5, before5], [X6, before6]]) {
    const now = roomFile(A, code);
    eq(restOf(now), restOf(before), `${code}: room fields (options, chat, host, recovery) restored`);
    eq(now.seats.map(seatCore), before.seats.map(seatCore), `${code}: seats, colours and secrets restored`);
  }
  ok(roomFile(A, X5).victoryTarget === 7 && roomFile(A, X5).game.victoryTarget === 7, "X5 keeps its 7-point target");
  eq(gameText(after5), gameText(roomFile(B, X5)), "X5: restarted A matches the twin");
  eq(gameText(after6), gameText(roomFile(B, X6)), "X6: restarted A matches the twin");
  console.log(`restart: killed -9 and restarted; X5 and X6 games identical to the saved files and the twin; seats 5 and 6 rejoined with their secrets, windows ${off5} ms and ${off6} ms from the saved deadlines`);

  // The next moves, on the restarted host and the never-restarted twin.
  const steps = [];
  const step = async (code, AC, BC, pid, action, label) => steps.push(`${label}: ${await both(code, AC, BC, pid, action, label)}`);
  await step(X5, A5, B5, "p4", { type: "playKnight", hexId: local[X5].hexes.find((h) => h.id !== local[X5].robberHex).id, stealFrom: null }, "X5 p4 plays the knight it just bought");
  await step(X5, A5, B5, "p4", { type: "buildPath", edgeId: legalRoads(local[X5], "p4", false)[0] }, "X5 p4 builds a path");
  await step(X5, A5, B5, P, { type: "endTurn" }, `X5 ${P} ends p4's turn`);
  await step(X5, A5, B5, "p4", { type: "endTurn" }, `X5 p4 ends; ${Q} is primary`);
  {
    const g = local[X5];
    const hex = g.hexes.find((h) => h.id !== g.robberHex && stealTargets(g, h.id, Q).length) ?? g.hexes.find((h) => h.id !== g.robberHex);
    await step(X5, A5, B5, Q, { type: "playKnight", hexId: hex.id, stealFrom: stealTargets(g, hex.id, Q)[0] ?? null }, `X5 ${Q} plays its old knight`);
  }
  await step(X6, A6, B6, "p5", { type: "discard", resources: { timber: 1 } }, "X6 p5 discards too few");
  await step(X6, A6, B6, "p5", { type: "discard", resources: { clay: 2, wool: 2 } }, "X6 p5 discards");
  {
    const g = local[X6];
    const hex = g.hexes.find((h) => h.id !== g.robberHex && stealTargets(g, h.id, P2).length) ?? g.hexes.find((h) => h.id !== g.robberHex);
    await step(X6, A6, B6, P2, { type: "moveRobber", hexId: hex.id, stealFrom: stealTargets(g, hex.id, P2)[0] ?? null }, `X6 ${P2} moves the wayfarer`);
  }
  await step(X6, A6, B6, P2, { type: "buyCard" }, `X6 ${P2} buys`);
  await step(X6, A6, B6, P2, { type: "endTurn" }, `X6 ${P2} ends; p5 partners`);
  await step(X6, A6, B6, "p5", { type: "bankTrade", give: "timber", want: "ore" }, "X6 p5 bank trade");
  await step(X6, A6, B6, P2, { type: "endTurn" }, `X6 ${P2} ends p5's turn`);
  await step(X6, A6, B6, "p5", { type: "endTurn" }, `X6 p5 ends; ${P3} is primary`);
  const e5 = local[X5];
  const e6 = local[X6];
  ok(e5.primary === Q && e5.role === "primary" && e5.activation === g5c.activation + 1, `X5 ends on ${Q}'s primary activation`);
  ok(e6.primary === P3 && e6.role === "primary" && e6.phase === "roll" && e6.activation === before6.game.activation + 2, `X6 ends on ${P3}'s roll`);
  for (const s of steps) console.log(`  ${s}`);
  console.log(`continued: ${steps.length} moves after the restart, A and the never-restarted twin saved the same game after each (${steps.filter((s) => !s.endsWith(": ok")).length} refused alike)`);
  for (const c of [...Object.values(A5), ...Object.values(A6), ...Object.values(B5), ...Object.values(B6)]) c.ws.terminate();
  await kill9(a);
  await kill9(b);

  // 3. Recovery pids past four: five taken-over seats, then a sixth by takeover, through snapshot, load and takeover.
  const R = tmp("recovery");
  const gr = recoverySeats();
  write(R, roomOf(RC, gr, { recoveryPids: ["p4", "p5", "p1", "p2", "p3"], assisted: ["p4", "p5", "p1", "p2", "p3"] }));
  const renv = { GRACE_MS: "1000", BOT_ANSWER_MS: "50", PEOPLE_FIRST_MS: "50" };
  let c = await boot(R, renv);
  let p0 = await client(c.port, { code: RC, secret: `${RC}-p0` });
  await p0.until(() => p0.state, "state");
  await sleep(150);
  eq([...roomFile(R, RC).recoveryPids].sort(), ["p1", "p2", "p3", "p4", "p5"], "load and snapshot keep five recovery pids");
  // A recovery seat always declines for its absent player: seats five and six included.
  p0.send({ type: "tradeAsk", give: { timber: 1 }, want: { ore: 1 } });
  await p0.until(() => p0.inbox.some((m) => m.type === "tradeClosed"), "every bot declines");
  for (const name of ["Moss", "Flint"]) ok(p0.logs.includes(`Bot declined a trade for ${name}.`), `the recovery bot declines for ${name}`);
  p0.ws.terminate();
  await kill9(c);
  c = await boot(R, renv);
  p0 = await client(c.port, { code: RC, secret: `${RC}-p0` });
  await p0.until(() => p0.state, "state");
  await sleep(150);
  eq([...roomFile(R, RC).recoveryPids].sort(), ["p1", "p2", "p3", "p4", "p5"], "five recovery pids survive the restart");
  p0.ws.terminate();
  await sleep(1600);
  eq(roomFile(R, RC).recoveryPids, ["p4", "p5", "p1", "p2", "p3", "p0"], "takeover adds a sixth recovery pid and keeps the other five");
  await kill9(c);
  c = await boot(R, renv);
  const moss = await client(c.port, { code: RC, secret: `${RC}-p4` });
  await moss.until(() => moss.state, "state");
  const flint = await client(c.port, { code: RC, secret: `${RC}-p5` });
  await flint.until(() => flint.state, "state");
  for (const [x, seat, pid, name] of [[moss, "s4", "p4", "Moss"], [flint, "s5", "p5", "Flint"]]) {
    eq([x.welcome.you, x.state.you], [seat, pid], `${name} rejoined seat ${seat} after the restart`);
    await x.until(() => x.state.game.players.find((p) => p.id === pid).kind === "human", `${name} human`);
    ok(x.state.game.players.find((p) => p.id === pid).name === name, `${name} has the seat's name back`);
  }
  await sleep(150);
  const rec = roomFile(R, RC).recoveryPids;
  ok(!rec.includes("p4") && !rec.includes("p5") && ["p0", "p1", "p2", "p3"].every((p) => rec.includes(p)), `the rejoined seats leave the recovery list (${rec.join(" ")})`);
  console.log(`recovery: 5 taken-over seats kept through snapshot and restart, takeover made 6 (p4 p5 p1 p2 p3 p0), Moss and Flint declined as recovery bots, then rejoined seats s4 and s5 with their secrets; left ${rec.join(" ")}`);
  moss.ws.terminate();
  flint.ws.terminate();
  await kill9(c);

  console.log(`expanded persist prove ok: ${checks} checks`);
  process.exit(0);
} catch (e) {
  console.log("FAIL", e.message);
  process.exit(1);
}
