// #1611: the expanded lobby and admission (docs/design/six-players.md, "Lobby and network limits"). Real hosts and real
// sockets prove:
// 1. A room opens classic or expanded, fixed before the first seat; classic rooms keep 3/4 seats and the classic palette
//    exactly, and carry no variant on the wire or on disk.
// 2. Expanded rooms seat up to six on the six-colour palette with unique colours, the palette in peek, bots up to the cap,
//    and start at five or six only; five people are never filled to six.
// 3. A client that does not advertise the expanded capability is refused on join, watch and rejoin before any of the room
//    reaches it, keeps its held seat, and still plays a classic room.
// 4. Hands stay private for seats 5 and 6 and for a watcher; a restart mid-lobby and mid-game keeps the variant.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { createGame } from "../src/lib/game/board.ts";
import { EXPANDED_COLORS } from "../src/lib/game/expanded.ts";
import { PLAYER_COLORS } from "../src/lib/game/types.ts";
import { PROTO } from "../src/lib/net/proto.ts";

const SERVER = fileURLToPath(new URL(".", import.meta.url));
const UPDATE = "Update Emberisle to join this table.";
const CAPS = { proto: PROTO, caps: ["expanded"] };
const OLD = { proto: PROTO };
// Colours only the expanded palette has: orange, green and brown.
const SIX_ONLY = EXPANDED_COLORS.filter((c) => !PLAYER_COLORS.includes(c));
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
  const d = mkdtempSync(path.join(tmpdir(), `emberisle-xlobby-${tag}-`));
  dirs.push(d);
  return d;
};
const roomFile = (dir, code) => JSON.parse(readFileSync(path.join(dir, `${code}.json`), "utf8"));

function boot(dir, env = {}) {
  const proc = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: SERVER,
    env: { ...process.env, PORT: "0", ROOMS_DIR: dir, RESULTS_DIR: `${dir}/results`, PROFILES_DIR: `${dir}/profiles`, SAVE_MS: "20", ACT_CAP: "5000", ACT_RATE: "5000", OPEN_CAP: "100", GRACE_MS: "60000", HOLD_MS: "120000", LOBBY_HOLD_MS: "120000", TURN_MS: "600000", TURN_TOTAL_MS: "6000000", BOT_ANSWER_MS: "5", PEOPLE_FIRST_MS: "0", ...env },
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

// A socket that sends `hello` and keeps every message it gets, raw and parsed. `first` is the welcome or the refusal.
async function client(port, hello, label = hello.name ?? hello.secret ?? "watcher") {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, label, inbox: [], all: [], raw: [], waiters: [], state: null, seats: null, logs: [] };
  sockets.push(c);
  ws.on("message", (data) => {
    const text = String(data);
    const msg = JSON.parse(text);
    c.raw.push(text);
    c.all.push(msg);
    if (msg.type === "state") c.state = msg;
    if (msg.type === "seats") c.seats = msg;
    if (msg.type === "log") c.logs.push(msg.text);
    c.inbox.push(msg);
    for (const w of c.waiters.splice(0)) w();
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.act = (msg) => ws.send(JSON.stringify({ ...c.state?.actionStamp, cid: crypto.randomUUID(), ...msg }));
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
      await sleep(10);
    }
  };
  await new Promise((res, rej) => {
    ws.once("open", res);
    ws.once("error", rej);
  });
  ws.send(JSON.stringify({ type: "hello", ...hello }));
  await c.until(() => c.all.some((m) => m.type === "welcome" || m.type === "error"), "a welcome or a refusal");
  c.first = c.all.find((m) => m.type === "welcome" || m.type === "error");
  c.welcome = c.first.type === "welcome" ? c.first : null;
  return c;
}

// The next error this socket gets after sending `msg`.
async function refusal(c, msg) {
  c.inbox = c.inbox.filter((m) => m.type !== "error");
  c.send(msg);
  return (await c.next("error")).message;
}

const seatsNow = async (c, n) => {
  await c.until(() => c.seats?.seats.length === n, `${n} seats`);
  return c.seats;
};

// Everyone at the table says ready.
async function allReady(cs) {
  for (const c of cs) c.send({ type: "ready", value: true });
  await cs[0].until(() => cs[0].seats?.seats.every((s) => s.ready) && cs[0].seats.seats.length >= cs.length, "everyone ready");
}

// What an old client got: only the refusal, and nothing of the room (no seat, colour, variant or state).
function nothingOfTheRoom(c, label) {
  eq(c.all.map((m) => [m.type, m.message]), [["error", UPDATE]], `${label}: the only message is the update instruction`);
  for (const text of c.raw) {
    ok(!/variant|"seats"|"game"|"hexes"|"players"|"secret"|"you"/.test(text), `${label}: no room state in ${text}`);
    ok(!SIX_ONLY.some((col) => text.includes(col)), `${label}: no expanded colour in ${text}`);
  }
}

// A seated view: the seat's own hand only. Others show a count, no goods, no fortunes; the deck order never leaves the host.
function privateView(state, label) {
  const g = state.game;
  ok(!("seed" in g) && !("rng" in g), `${label}: no seed or rng`);
  eq(g.deck, [], `${label}: no deck order`);
  for (const p of g.players) {
    if (p.id === state.you) {
      ok(p.resources && typeof p.resources.timber === "number", `${label}: ${p.id} sees its own goods`);
      continue;
    }
    ok(!("resources" in p), `${label}: ${p.id}'s goods are hidden`);
    ok(typeof p.goods === "number", `${label}: ${p.id} shows a count`);
    eq(p.hidden, { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 }, `${label}: ${p.id}'s fortunes are hidden`);
  }
}

const A = tmp("a");
let host = await boot(A);
let port = host.port;
const summary = [];

// ---- 1. Classic: unchanged limits, palette and wire. ----
{
  const h = await client(port, { name: "Ember", ...CAPS });
  ok(h.welcome && !("variant" in h.welcome), "classic: the welcome carries no variant");
  const code = h.welcome.code;
  const s1 = await seatsNow(h, 1);
  ok(!("variant" in s1), "classic: the seat list carries no variant");
  const explicit = await client(port, { name: "Kelp", variant: "classic", ...CAPS });
  ok(explicit.welcome && !("variant" in explicit.welcome), "classic: variant classic opens the same classic room");
  explicit.send({ type: "leave" });
  const guests = [];
  for (const name of ["Tide", "Dune", "Pine"]) guests.push(await client(port, { name, code, ...CAPS }));
  ok(guests.every((g) => g.welcome), "classic: three join up to four seats");
  const fifth = await client(port, { name: "Moss", code, ...CAPS });
  eq(fifth.first.message, "Table full.", "classic: a fifth join is refused");
  const seats = (await seatsNow(h, 4)).seats;
  eq(seats.map((s) => s.color), [...PLAYER_COLORS], "classic: the four classic colours, in order");
  eq(await refusal(h, { type: "addBot" }), "Table full.", "classic: no bot past four");
  const peeker = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((r) => peeker.once("open", r));
  const peek = await new Promise((r) => {
    peeker.once("message", (d) => r(JSON.parse(String(d))));
    peeker.send(JSON.stringify({ type: "peek", code }));
  });
  peeker.terminate();
  eq(Object.keys(peek).sort(), ["code", "seats", "type"], "classic: peek is as before, with no palette");
  // Start: 3 or 4 as before.
  const g3 = guests.pop();
  g3.send({ type: "leave" });
  await seatsNow(h, 3);
  guests.push(await client(port, { name: "Pine", code, ...CAPS }));
  await allReady([h, ...guests]);
  h.send({ type: "start" });
  await h.until(() => h.state, "classic state");
  ok(!h.state.game.variant && h.state.game.players.length === 4, "classic: starts four seats with no variant");
  await sleep(100);
  ok(!("variant" in roomFile(A, code)), "classic: the saved room has no variant field");
  // Classic start refusals keep their words.
  const lone = await client(port, { name: "Solo", ...CAPS });
  lone.send({ type: "ready", value: true });
  await lone.until(() => lone.seats?.seats[0]?.ready, "ready");
  eq(await refusal(lone, { type: "start" }), "Need 3 or 4 at the table.", "classic: start under three keeps its words");
  summary.push("classic: 4 seats cap, 5th join and bot refused, colours = classic palette, peek has no palette, starts at 3-4 with no variant on wire or disk");
}

// ---- 2. Expanded: capacity, colours, palette, bots, start. ----
const xcode = await (async () => {
  eq((await client(port, { name: "X", variant: "huge", ...CAPS })).first.message, "Choose 4, 5 or 6 seats.", "an unknown variant opens nothing");
  const h = await client(port, { name: "Ember", variant: "expanded", ...CAPS });
  eq(h.welcome?.variant, "expanded", "expanded: the welcome says so");
  const code = h.welcome.code;
  eq((await seatsNow(h, 1)).variant, "expanded", "expanded: the seat list says so");
  return { h, code };
})();
{
  const { h, code } = xcode;
  const guests = [];
  // Colours: the room's palette. A classic purple falls back to the first free swatch; a taken one is refused.
  guests.push(await client(port, { name: "Tide", code, color: "#8a4fd3", ...CAPS }));
  guests.push(await client(port, { name: "Dune", code, color: EXPANDED_COLORS[4], ...CAPS }));
  const dup = await client(port, { name: "Twin", code, color: EXPANDED_COLORS[4], ...CAPS });
  eq(dup.first.message, "Color taken.", "expanded: a taken colour is refused");
  for (const name of ["Pine", "Moss", "Flint"]) guests.push(await client(port, { name, code, ...CAPS }));
  ok(guests.every((g) => g.welcome?.variant === "expanded"), "expanded: five join, up to six seats, each told the variant");
  const seventh = await client(port, { name: "Reed", code, ...CAPS });
  eq(seventh.first.message, "Table full.", "expanded: a seventh join is refused");
  const seats = (await seatsNow(h, 6)).seats;
  const colors = seats.map((s) => s.color);
  eq(colors[1], EXPANDED_COLORS[1], "expanded: a classic purple takes the first free swatch");
  eq(colors[2], EXPANDED_COLORS[4], "expanded: a free swatch is taken as asked");
  eq([...colors].sort(), [...EXPANDED_COLORS].sort(), "expanded: six unique colours, the whole six-colour palette");
  eq(await refusal(h, { type: "addBot" }), "Table full.", "expanded: no bot past six");
  // Peek names the palette.
  guests.at(-1).send({ type: "leave" });
  await seatsNow(h, 5);
  const peeker = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((r) => peeker.once("open", r));
  const peek = await new Promise((r) => {
    peeker.once("message", (d) => r(JSON.parse(String(d))));
    peeker.send(JSON.stringify({ type: "peek", code }));
  });
  peeker.terminate();
  eq(peek.palette, [...EXPANDED_COLORS], "expanded: peek names the six-colour palette");
  eq(peek.seats.map((s) => s.color), seats.slice(0, 5).map((s) => s.color), "expanded: peek shows the taken colours");
  summary.push("expanded: 6 seats cap, 7th join and 7th bot refused, six unique colours from the six-colour palette, purple falls back, taken colour refused, peek names the palette");
}

// Start: refused under five, and five people are never filled to six.
{
  const h = await client(port, { name: "Ember", variant: "expanded", ...CAPS });
  const code = h.welcome.code;
  const cs = [h];
  for (const name of ["Tide", "Dune", "Pine"]) cs.push(await client(port, { name, code, ...CAPS }));
  await allReady(cs);
  eq(await refusal(h, { type: "start" }), "Need 5 or 6 at the table.", "expanded: four cannot start");
  cs.push(await client(port, { name: "Moss", code, ...CAPS }));
  await allReady(cs);
  h.send({ type: "start" });
  await h.until(() => h.state, "five-seat state");
  const g = h.state.game;
  eq([g.variant?.kind, g.players.length], ["expanded", 5], "expanded: five start a five-seat expanded game, not six");
  eq(g.players.map((p) => p.seat), [1, 2, 3, 4, 5], "expanded: seat numbers follow the lobby rows");
  eq(g.players.map((p) => p.color), h.seats.seats.map((s) => s.color), "expanded: each player has its seat's colour");
  await sleep(100);
  eq(roomFile(A, code).variant, "expanded", "expanded: the saved room says expanded");
  summary.push("start: expanded refused at 4 (Need 5 or 6 at the table.), 5 people start a 5-player expanded game, seat numbers 1-5");
}

// Bots up to the cap, and a six-seat start with bots.
const sixBots = await (async () => {
  const h = await client(port, { name: "Ember", variant: "expanded", ...CAPS });
  const code = h.welcome.code;
  for (let i = 0; i < 5; i++) h.send({ type: "addBot" });
  const seats = (await seatsNow(h, 6)).seats;
  eq(seats.filter((s) => s.bot).length, 5, "bots: five bots fill an expanded room to six");
  eq([...seats.map((s) => s.color)].sort(), [...EXPANDED_COLORS].sort(), "bots: the bots take the free swatches of the six-colour palette");
  eq(await refusal(h, { type: "addBot" }), "Table full.", "bots: no seventh");
  return { h, code };
})();
summary.push("bots: an expanded room takes five bots to six and refuses a seventh; a classic one refuses a fifth");

// ---- 3. Old clients: refused before anything of an expanded room, still welcome at a classic one. ----
const six = await (async () => {
  const h = await client(port, { name: "Ember", variant: "expanded", ...CAPS });
  const code = h.welcome.code;
  const cs = [h];
  for (const name of ["Tide", "Dune", "Pine", "Moss", "Flint"]) cs.push(await client(port, { name, code, ...CAPS }));
  return { code, cs };
})();
{
  const old = await client(port, { name: "Oldie", code: six.code, ...OLD });
  await sleep(150);
  nothingOfTheRoom(old, "old client join");
  const old0 = await client(port, { name: "Older", code: six.code });
  await sleep(150);
  nothingOfTheRoom(old0, "pre-proto client join");
  const oldHost = await client(port, { name: "Oldie", variant: "expanded", ...OLD });
  eq(oldHost.first.message, UPDATE, "old client: cannot open an expanded room either");
  await allReady(six.cs);
  six.cs[0].send({ type: "start" });
  for (const c of six.cs) await c.until(() => c.state, "six-seat state");
  const watchOld = await client(port, { code: six.code, watch: true, ...OLD });
  await sleep(150);
  nothingOfTheRoom(watchOld, "old client watch");
  // Rejoin: seat 6 drops; an old page with its secret is refused and the seat stays held for an updated one.
  const sixth = six.cs[5];
  const secret = sixth.welcome.secret;
  sixth.ws.terminate();
  await six.cs[0].until(() => six.cs[0].seats.seats[5].away, "seat 6 away");
  const back = await client(port, { code: six.code, secret, ...OLD });
  await sleep(150);
  nothingOfTheRoom(back, "old client rejoin");
  ok(six.cs[0].seats.seats[5].away && six.cs[0].seats.seats.length === 6, "old client rejoin: seat 6 is still held, away");
  const fresh = await client(port, { code: six.code, secret, ...CAPS });
  eq([fresh.welcome?.you, fresh.welcome?.variant], [sixth.welcome.you, "expanded"], "an updated page takes seat 6 back with the same secret");
  await fresh.until(() => fresh.state, "seat 6 state");
  six.cs[5] = fresh;
  summary.push("old client: join, pre-proto join, open, watch and rejoin of an expanded room refused with only the update instruction; seat 6 kept and taken back by an updated page");
  // The same old client plays a classic room: it joins, starts and rolls.
  const ch = await client(port, { name: "Oldhost", ...OLD });
  const ccode = ch.welcome.code;
  const oldGuest = await client(port, { name: "Oldie", code: ccode, ...OLD });
  ok(oldGuest.welcome && !("variant" in oldGuest.welcome), "old client: seated at a classic room");
  const third = await client(port, { name: "Pine", code: ccode });
  await allReady([ch, oldGuest, third]);
  ch.send({ type: "start" });
  for (const c of [ch, oldGuest, third]) await c.until(() => c.state, "classic state");
  // Everyone rolls off until the old client has acted and the game is in setup.
  const order = [ch, oldGuest, third];
  let rolled = false;
  for (let i = 0; i < 30 && order[0].state.game.phase === "rollOff"; i++) {
    const cur = order.find((c) => c.state.you === c.state.game.current);
    const seq = cur.state.game.seq;
    cur.act({ type: "roll" });
    await cur.until(() => cur.state.game.seq > seq, "roll");
    if (cur === oldGuest) rolled = true;
    for (const c of order) await c.until(() => c.state.game.seq === cur.state.game.seq, "same seq");
  }
  ok(rolled && order[0].state.game.phase === "setupSettle", "old client: rolls in a classic game, which reaches setup");
  ok(!oldGuest.raw.some((t) => t.includes("variant")), "old client: nothing expanded reached it at the classic table");
  summary.push("old client: plays a classic room (seated, rolled off, setup reached)");
}

// ---- 4. Privacy for seats 5 and 6 and a watcher. ----
{
  for (const [i, c] of six.cs.entries()) privateView(c.state, `seat ${i + 1}`);
  const watcher = await client(port, { code: six.code, watch: true, ...CAPS });
  eq(watcher.welcome?.variant, "expanded", "watcher: admitted with the capability, told the variant");
  await watcher.until(() => watcher.state, "watcher state");
  for (const p of watcher.state.game.players) ok(!("resources" in p), `watcher: ${p.id}'s goods hidden`);
  eq(watcher.state.game.deck, [], "watcher: no deck order");
  ok(!("seed" in watcher.state.game), "watcher: no seed");
  six.watcher = watcher;
  summary.push("privacy: seats 1-6 see only their own goods, a watcher sees none, no deck order or seed");
}

// ---- 5. A restart mid-lobby and mid-game keeps the variant. ----
{
  const lobby = await client(port, { name: "Ember", variant: "expanded", ...CAPS });
  const lcode = lobby.welcome.code;
  lobby.send({ type: "addBot" });
  await seatsNow(lobby, 2);
  await sleep(150);
  const secrets = six.cs.map((c) => c.welcome.secret);
  const gseq = roomFile(A, six.code).game.seq;
  await kill9(host);
  // Room files: a room saved without a variant whose game is classic stays classic; a bad variant is kept aside.
  const cg = createGame({ humans: [{ name: "A" }, { name: "B" }, { name: "C" }], bots: 0, seed: 3 });
  const base = (code, extra) => ({ code, visibility: "private", host: "s0", next: 3, botDeclined: {}, recoveryPids: [], chat: [], chatSeq: 0, game: cg, victoryTarget: 10, wayfarerMode: "on", seats: cg.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `${code}-${i}` })), roster: null, outcome: null, assisted: [], shape: 3, savedAt: Date.now(), ...extra });
  writeFileSync(path.join(A, "VBAD.json"), JSON.stringify(base("VBAD", { variant: "mega" })));
  writeFileSync(path.join(A, "VMIX.json"), JSON.stringify(base("VMIX", { variant: "expanded" })));
  writeFileSync(path.join(A, "VOLD.json"), JSON.stringify(base("VOLD", { game: null, seats: [{ id: "s0", name: "A", color: PLAYER_COLORS[0], ready: false, secret: "VOLD-0" }] })));
  host = await boot(A);
  port = host.port;
  ok(host.err.includes("unsupported room file: VBAD.json (unknown room variant \"mega\")"), "load: an unknown room variant is kept aside");
  ok(host.err.includes("unsupported room file: VMIX.json (a expanded room holding a classic game)"), "load: an expanded room with a classic game is kept aside");
  const vold = await client(port, { code: "VOLD", secret: "VOLD-0", ...OLD });
  ok(vold.welcome && !("variant" in vold.welcome), "load: a room saved without a variant is classic, and an old client may rejoin it");
  vold.send({ type: "addBot" });
  vold.send({ type: "addBot" });
  vold.send({ type: "addBot" });
  vold.send({ type: "addBot" });
  await vold.until(() => vold.inbox.some((m) => m.type === "error" && m.message === "Table full."), "a classic cap");
  eq(vold.seats.seats.length, 4, "load: the classic room keeps its four-seat cap");
  // Mid-lobby.
  eq(roomFile(A, lcode).variant, "expanded", "restart: the lobby file keeps expanded");
  const lback = await client(port, { code: lcode, secret: lobby.welcome.secret, ...CAPS });
  eq(lback.welcome?.variant, "expanded", "restart mid-lobby: the room is still expanded");
  for (let i = 0; i < 5; i++) lback.send({ type: "addBot" });
  await lback.until(() => lback.inbox.some((m) => m.type === "error" && m.message === "Table full."), "the expanded cap");
  eq(lback.seats.seats.length, 6, "restart mid-lobby: the cap is still six");
  ok(lback.seats.seats.every((s) => EXPANDED_COLORS.includes(s.color)), "restart mid-lobby: still the six-colour palette");
  // Mid-game.
  const oldBack = await client(port, { code: six.code, secret: secrets[4], ...OLD });
  await sleep(100);
  nothingOfTheRoom(oldBack, "old client rejoin after restart");
  const back = [];
  for (const s of secrets) back.push(await client(port, { code: six.code, secret: s, ...CAPS }));
  for (const c of back) await c.until(() => c.state, "state after restart");
  eq(back.map((c) => c.welcome.variant), Array(6).fill("expanded"), "restart mid-game: every seat is told expanded");
  eq([back[0].state.game.variant.kind, back[0].state.game.players.length, back[0].state.game.seq], ["expanded", 6, gseq], "restart mid-game: the same six-seat expanded game");
  eq(back[0].seats.variant, "expanded", "restart mid-game: the seat list says expanded");
  privateView(back[4].state, "seat 5 after restart");
  privateView(back[5].state, "seat 6 after restart");
  six.cs = back;
  summary.push("restart: kill -9 mid-lobby and mid-game keeps expanded (file, welcome, seats, cap 6, palette, game); old rejoin still refused; no-variant room loads classic; bad or mismatched room variants kept aside");
}

for (const line of summary) console.log(line);
console.log(`expanded-lobby-prove: ${checks} checks passed`);
process.exit(0);
