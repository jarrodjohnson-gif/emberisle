// A host restart keeps the table: rooms are saved to disk and reloaded on boot (#190).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
let host;
let err = "";
process.on("exit", () => host?.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

function start(port) {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: String(port), ROOMS_DIR },
  });
  let out = "";
  err = "";
  host.stderr.on("data", (d) => (err += d));
  return new Promise((resolve, reject) => {
    host.stdout.on("data", (d) => {
      out += d;
      const m = out.match(/listening (\d+)/);
      if (m) resolve({ port: Number(m[1]), out: () => out });
    });
    host.on("exit", (c) => reject(new Error(`host exited ${c}`)));
  });
}

function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  host.kill("SIGKILL");
  rmSync(ROOMS_DIR, { recursive: true, force: true });
  process.exit(1);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function client(port, name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { name, ws, inbox: [], waiters: [], state: null };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") c.state = msg;
    c.inbox.push(msg);
    for (const w of c.waiters.splice(0)) w();
  });
  ws.on("error", () => {});
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.next = async (type, ok = () => true, ms = 10000) => {
    const until = Date.now() + ms;
    for (;;) {
      const i = c.inbox.findIndex((m) => m.type === type && ok(m));
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      const left = until - Date.now();
      if (left <= 0) fail(`${name} waited for ${type}`);
      await new Promise((res) => {
        c.waiters.push(res);
        setTimeout(res, left);
      });
    }
  };
  await new Promise((res) => ws.on("open", res));
  return c;
}

const first = await start(0);
const port = first.port;
const a = await client(port, "Ember");
const b = await client(port, "Tide");
const c = await client(port, "Pine");
const all = [a, b, c];
a.send({ type: "hello", name: "Ember" });
const wa = await a.next("welcome");
const code = wa.code;
b.send({ type: "hello", code, name: "Tide" });
c.send({ type: "hello", code, name: "Pine" });
const wb = await b.next("welcome");
const wc = await c.next("welcome");
for (const x of all) x.send({ type: "ready", value: true });
await wait(100);
a.send({ type: "start" });
await Promise.all(all.map((x) => x.next("state")));

// Drive whoever is up through setup and three rolls, each passing after its roll.
const seqNow = () => a.state.game.seq;
async function step(msg) {
  const before = seqNow();
  const mover = all.find((x) => x.state.you === a.state.game.current);
  mover.send(msg(mover.state));
  await Promise.all(all.map((x) => x.next("state", (m) => m.game.seq > before)));
}
// One step of whatever phase the table is in; true when that step was a roll.
async function advance() {
  const g = a.state.game;
  if (g.phase === "setupSettle") await step((s) => ({ type: "place", kind: "outpost", id: s.legal.outpost[0] }));
  else if (g.phase === "setupRoad") await step((s) => ({ type: "place", kind: "path", id: s.legal.path[0] }));
  else if (g.phase === "roll") {
    await step(() => ({ type: "roll" }));
    return true;
  } else if (g.phase === "main") await step(() => ({ type: "pass" }));
  else if (g.phase === "discard") {
    const who = all.find((x) => x.state.legal.discard > 0);
    const me = who.state.game.players.find((p) => p.id === who.state.you);
    let need = who.state.legal.discard;
    const cards = {};
    for (const [r, n] of Object.entries(me.resources)) {
      const take = Math.min(n, need);
      if (take) cards[r] = take;
      need -= take;
    }
    const before = seqNow();
    who.send({ type: "discard", cards });
    await Promise.all(all.map((x) => x.next("state", (m) => m.game.seq > before)));
  } else if (g.phase === "robber") {
    await step((s) => {
      const hexId = s.legal.wayfarer[0];
      return { type: "rob", hexId, stealFrom: s.legal.steal[hexId]?.[0] ?? null };
    });
  } else fail("unexpected phase", g.phase);
  return false;
}
let rolls = 0;
for (let i = 0; i < 200 && rolls < 3; i++) if (await advance()) rolls++;
if (rolls < 3) fail("rolled three times", rolls);
// A third roll of 7 leaves discards or the wayfarer pending; finish them, so the crash lands in a
// phase the restored table can resume with one roll or one pass (#208).
for (let i = 0; i < 20 && ["discard", "robber"].includes(a.state.game.phase); i++) await advance();
if (!["roll", "main"].includes(a.state.game.phase)) fail("settled before the crash", a.state.game.phase);
const seq = seqNow();
const current = a.state.game.current;
a.send({ type: "chat", text: "see you after the crash" });
await b.next("chat");
await wait(100);
if (!existsSync(path.join(ROOMS_DIR, `${code}.json`))) fail("room file written", ROOMS_DIR);
console.log(`table ${code}: setup done, rolled ${rolls} times, seq ${seq}, ${current} to play; ${code}.json on disk`);

// A day-old room, a broken file and one with a null seat sit next to it; the restart must drop the first and survive the rest.
writeFileSync(path.join(ROOMS_DIR, "OLD1.json"), JSON.stringify({ code: "OLD1", seats: [{ id: "s0" }], game: null, shape: 1, savedAt: Date.now() - 25 * 60 * 60 * 1000 }));
writeFileSync(path.join(ROOMS_DIR, "BAD1.json"), "{ not json");
writeFileSync(path.join(ROOMS_DIR, "BAD2.json"), JSON.stringify({ code: "BAD2", seats: [null], game: null, shape: 1, savedAt: Date.now() }));
// Rooms from another build: a stale shape, a game that is not a game, and one from before rooms were stamped.
const seat = [{ id: "s0", name: "Old", color: "ember", ready: true, pid: null, secret: wa.secret }];
const room = (code, extra) => writeFileSync(path.join(ROOMS_DIR, `${code}.json`), JSON.stringify({ code, seats: seat, game: null, savedAt: Date.now(), shape: 1, ...extra }));
room("ZZZ1", { shape: 0 });
room("ZZZ2", { game: {} });
room("ZZZ3", { shape: undefined });

// The host process dies without warning and comes back on the same port.
host.removeAllListeners("exit");
host.kill("SIGKILL");
await new Promise((r) => host.once("exit", r));
for (const x of all) x.ws.terminate();
const second = await start(port);
if (second.port !== port) fail("same port", second.port);
if (existsSync(path.join(ROOMS_DIR, "OLD1.json"))) fail("a room older than 24 hours is dropped on boot");
for (const z of ["ZZZ1", "ZZZ2", "ZZZ3"]) if (existsSync(path.join(ROOMS_DIR, `${z}.json`))) fail(`${z} is deleted on boot`);
if (!err.includes("stale room file: ZZZ1.json (shape 0, want 1)")) fail("stale shape logged", err);
if (!err.includes("stale room file: ZZZ3.json (shape undefined, want 1)")) fail("unstamped room logged as stale", err);
if (!err.includes("bad game in room file: ZZZ2.json")) fail("bad game logged", err);
if (!second.out().includes(code)) fail("restored room listed", second.out());
if (second.out().includes("BAD2")) fail("a room with a null seat is skipped", second.out());
console.log(`host killed and restarted on ${port}: ${second.out().trim().split("\n")[0]}; OLD1 (25 h) dropped, BAD1 and BAD2 skipped`);

console.log("stale shape dropped (ZZZ1 shape 0, ZZZ3 unstamped), bad game dropped (ZZZ2)");
const back = [];
for (const [w, name] of [[wa, "Ember"], [wb, "Tide"], [wc, "Pine"]]) {
  const x = await client(port, name);
  x.send({ type: "hello", code, secret: w.secret });
  const welcome = await x.next("welcome");
  const st = await x.next("state");
  if (welcome.you !== w.you) fail(`${name} keeps the seat`, welcome.you);
  if (st.game.seq !== seq) fail(`${name} sees the same seq`, { got: st.game.seq, want: seq });
  if (!welcome.chat.some((l) => l.text === "see you after the crash")) fail(`${name} gets the chat history`);
  back.push(x);
  console.log(`${name} rejoined: you=${welcome.you}, player ${st.you}, seq ${st.game.seq}, current ${st.game.current}`);
}

for (const z of ["ZZZ1", "ZZZ2", "ZZZ3"]) {
  const x = await client(port, z);
  x.send({ type: "hello", code: z, secret: wa.secret });
  const e = await x.next("error");
  if (e.message !== "No table with that code") fail(`${z} has no table`, e);
  x.ws.terminate();
}

// The restored game is live: whoever is up can act, and every seat sees it.
const [a2, b2, c2] = back;
const mover = back.find((x) => x.state.you === a2.state.game.current);
const g = mover.state.game;
mover.send(g.phase === "roll" ? { type: "roll" } : { type: "pass" });
const moved = await Promise.all(back.map((x) => x.next("state", (m) => m.game.seq > seq)));
if (new Set(moved.map((m) => m.game.seq)).size !== 1) fail("every seat sees the same next seq");
console.log(`after the restart ${mover.name} played (${g.phase}): seq ${moved[0].game.seq} on all three`);

// A lobby restored after a restart does not keep its seats ready while they are away (#318).
const lobby = await client(port, "Host");
lobby.send({ type: "hello", name: "Host" });
const wl = await lobby.next("welcome");
const lobbyMates = [];
for (const name of ["Mate1", "Mate2"]) {
  const x = await client(port, name);
  x.send({ type: "hello", code: wl.code, name });
  await x.next("welcome");
  lobbyMates.push(x);
}
for (const x of [lobby, ...lobbyMates]) x.send({ type: "ready", value: true });
await lobby.next("seats", (m) => m.code === wl.code && m.seats.length === 3 && m.seats.every((s) => s.ready));
// The seats broadcast goes out before the save; the chat echo only comes once that handler has finished writing the file.
lobby.send({ type: "chat", text: "all ready" });
await lobby.next("chat");
host.removeAllListeners("exit");
host.kill("SIGKILL");
await new Promise((r) => host.once("exit", r));
for (const x of [lobby, ...lobbyMates]) x.ws.terminate();
const third = await start(port);
if (!third.out().includes(wl.code)) fail("restored lobby listed", third.out());
const lobbyBack = await client(port, "Host");
lobbyBack.send({ type: "hello", code: wl.code, secret: wl.secret });
await lobbyBack.next("welcome");
lobbyBack.send({ type: "start" });
const notReady = await lobbyBack.next("error");
if (notReady.message !== "Not everyone is ready.") fail("a restored lobby does not start with seats away", notReady);
console.log(`restored lobby ${wl.code}: start refused with "${notReady.message}"`);
lobbyBack.ws.terminate();

host.removeAllListeners("exit");
host.kill();
for (const x of [a2, b2, c2]) x.ws.terminate();
rmSync(ROOMS_DIR, { recursive: true, force: true });
console.log("persist prove ok");
process.exit(0);
