// G7 (#528): the host's hold outlasts the client's redials. A table.ts client dials through a TCP relay the proof
// can cut, so the host is up but unreachable: the last redial lands just before the hold, a rejoin there keeps the
// seat, and when the host stays unreachable the client gives up before the host lets the seat go, never after.
// The same holds for a reload, whose only welcome is the rejoin's.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { connectTable } from "../src/lib/net/table.ts";

const LOBBY_HOLD = 3000;
const HOLD = 6000;
// The client's last redial lands this long before the hold (table.ts LAST_CALL_MS).
const LAST_CALL = 1000;
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0", GRACE_MS: "60000", HOLD_MS: String(HOLD), LOBBY_HOLD_MS: String(LOBBY_HOLD), ROOMS_DIR },
});
process.on("exit", () => host.kill("SIGKILL"));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const port = await new Promise((resolve, reject) => {
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  host.on("exit", (c) => reject(new Error(`host exited ${c}`)));
});

function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  host.kill("SIGKILL");
  process.exit(1);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, what, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await wait(20);
  }
  fail(`timed out: ${what}`);
};

// The relay: while `down`, every new connection is refused at once, as a dead tunnel would.
let down = false;
const relay = net.createServer((sock) => {
  if (down) return sock.destroy();
  const up = net.connect(port, "127.0.0.1");
  sock.pipe(up).pipe(sock);
  sock.on("error", () => up.destroy());
  up.on("error", () => sock.destroy());
  sock.on("close", () => up.destroy());
  up.on("close", () => sock.destroy());
});
await new Promise((r) => relay.listen(0, "127.0.0.1", r));
process.on("exit", () => relay.close());
const relayUrl = `ws://127.0.0.1:${relay.address().port}`;

// A refused dial is an 'error' event on a ws socket; the browser's onerror is silent, so this one is too.
class Sock extends WebSocket {
  constructor(url) {
    super(url);
    this.on("error", () => {});
  }
}

// The player under test speaks table.ts through the relay; its drop and give-up times are measured here.
function player(name) {
  const p = { name, welcomes: [], closed: [], dials: [], lostAt: 0, closedAt: 0 };
  p.t = connectTable(relayUrl, {
    welcome: (m) => p.welcomes.push(m),
    reconnecting: () => p.dials.push(Date.now() - p.lostAt),
    state: (m) => (p.state = m),
    closed: (keep) => {
      p.closed.push(Boolean(keep));
      p.closedAt = Date.now() - p.lostAt;
    },
  }, Sock);
  p.drop = () => {
    p.lostAt = Date.now();
    p.t.drop();
  };
  return p;
}

// Other seats watch the host directly: `seats` tells them the moment a seat is let go.
async function watcher(name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const w = { name, ws, seats: [], welcome: null, state: null };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "welcome") w.welcome = msg;
    if (msg.type === "seats") w.seats.push({ at: Date.now(), ids: msg.seats.map((s) => s.id), away: msg.seats.filter((s) => s.away).map((s) => s.id) });
    if (msg.type === "state") w.state = msg;
  });
  w.send = (msg) => ws.send(JSON.stringify(msg));
  w.last = () => w.seats.at(-1);
  await new Promise((res) => ws.on("open", res));
  return w;
}

const a = player("Ember");
a.t.open({ name: "Ember" });
await until(() => a.welcomes.length === 1, "welcome");
const wa = a.welcomes[0];
if (wa.holdMs !== HOLD || wa.lobbyHoldMs !== LOBBY_HOLD) fail("welcome carries the host's holds", wa);
const code = wa.code;
const b = await watcher("Tide");
b.send({ type: "hello", code, name: "Tide" });
await until(() => b.welcome, "Tide welcome");
if (b.welcome.holdMs !== HOLD || b.welcome.lobbyHoldMs !== LOBBY_HOLD) fail("a joiner's welcome carries the holds", b.welcome);
console.log(`table ${code}: welcome says holdMs ${wa.holdMs}, lobbyHoldMs ${wa.lobbyHoldMs}`);

// 1. Lobby, the relay comes back inside the hold: the last call (LOBBY_HOLD - LAST_CALL) finds the host and keeps the seat.
down = true;
a.drop();
await until(() => b.last()?.away.includes(wa.you), "Ember away");
await wait(LOBBY_HOLD - LAST_CALL - 500 - (Date.now() - a.lostAt));
down = false;
await until(() => a.welcomes.length === 2, "rejoin on the last call", LOBBY_HOLD);
const backAt = Date.now() - a.lostAt;
if (a.welcomes[1].you !== wa.you || a.closed.length) fail("the last call should sit back down in the same seat", { welcome: a.welcomes[1], closed: a.closed });
if (backAt >= LOBBY_HOLD) fail("rejoined after the hold", backAt);
await until(() => b.last() && !b.last().away.length, "Ember back in the seat list");
console.log(`lobby: relay cut, redials queued at ${a.dials.join(", ")} ms, back in seat ${wa.you} at ${backAt} ms (hold ${LOBBY_HOLD})`);

// 2. Lobby, the relay stays cut: the client gives up at the last call and forgets the seat; the host lets the seat go
// only after that, so no redial was still pending when it did.
down = true;
a.dials.length = 0;
a.drop();
await until(() => a.closed.length, "give up", LOBBY_HOLD);
const letGoLobby = () => b.seats.find((m) => m.at > a.lostAt && !m.ids.includes(wa.you));
await until(() => letGoLobby(), "the host lets the lobby seat go", LOBBY_HOLD);
const letGoAt = letGoLobby().at - a.lostAt;
if (a.closed.join() !== "false") fail("a spent hold forgets the seat", a.closed);
if (a.closedAt < LOBBY_HOLD - LAST_CALL - 50 || a.closedAt >= letGoAt) fail("the client must give up at the last call and before the host lets go", { closedAt: a.closedAt, letGoAt });
if (a.dials.at(-1) >= letGoAt) fail("a redial reached past the hold", { dials: a.dials, letGoAt });
console.log(`lobby: relay stays cut, redials queued at ${a.dials.join(", ")} ms, gave up at ${a.closedAt} ms, host let go at ${letGoAt} ms`);

// 3. In a game the welcome's `holdMs` applies instead: the client outwaits the lobby hold and still gives up before letGo.
down = false;
const c = await watcher("Pine");
c.send({ type: "hello", code, name: "Pine" });
const a2 = player("Ember again");
a2.t.join(code, { name: "Ember" });
await until(() => a2.welcomes.length === 1 && c.welcome, "two more seats");
for (const w of [b, c]) w.send({ type: "ready", value: true });
a2.t.ready(true);
await wait(100);
b.send({ type: "start" });
await until(() => a2.state && b.state, "game started");
down = true;
a2.drop();
await until(() => a2.closed.length, "give up in a game", HOLD);
const me = a2.welcomes[0].you;
const letGoGame = () => b.seats.find((m) => m.at > a2.lostAt && !m.ids.includes(me));
await until(() => letGoGame(), "the host lets the game seat go", HOLD);
const letGoGameAt = letGoGame().at - a2.lostAt;
if (a2.closed.join() !== "false") fail("a spent game hold forgets the seat", a2.closed);
if (a2.closedAt <= LOBBY_HOLD) fail("in a game the lobby hold must not apply", a2.closedAt);
if (a2.closedAt < HOLD - LAST_CALL - 50 || a2.closedAt >= letGoGameAt) fail("the client must give up at the last call and before the host lets go", { closedAt: a2.closedAt, letGoAt: letGoGameAt });
if (a2.dials.at(-1) >= letGoGameAt) fail("a redial reached past the game hold", { dials: a2.dials, letGoAt: letGoGameAt });
console.log(`game: relay cut, redials queued at ${a2.dials.join(", ")} ms, gave up at ${a2.closedAt} ms, host let go at ${letGoGameAt} ms (hold ${HOLD})`);

// 4. A reload: a fresh client whose only welcome is the rejoin's. That welcome carries the holds too, so with the
// relay cut again the client still gives up before the host lets the seat go.
down = false;
b.ws.close();
await until(() => c.seats.at(-1)?.away.includes(b.welcome.you), "Tide away before the reload");
const d = player("Tide reloaded");
d.t.rejoin(code, b.welcome.secret);
await until(() => d.welcomes.length === 1 && d.state, "rejoin on reload");
if (d.welcomes[0].you !== b.welcome.you) fail("the reload should land in Tide's seat", d.welcomes[0]);
if (d.welcomes[0].holdMs !== HOLD || d.welcomes[0].lobbyHoldMs !== LOBBY_HOLD) fail("the rejoin welcome carries the holds", d.welcomes[0]);
down = true;
d.drop();
await until(() => d.closed.length, "give up after a reload", HOLD);
const letGoReload = () => c.seats.find((m) => m.at > d.lostAt && !m.ids.includes(b.welcome.you));
await until(() => letGoReload(), "the host lets the reloaded seat go", HOLD);
const letGoReloadAt = letGoReload().at - d.lostAt;
if (d.closed.join() !== "false") fail("a spent hold after a reload forgets the seat", d.closed);
if (d.closedAt <= LOBBY_HOLD || d.closedAt < HOLD - LAST_CALL - 50 || d.closedAt >= letGoReloadAt) fail("after a reload the client must give up at the last call and before the host lets go", { closedAt: d.closedAt, letGoAt: letGoReloadAt });
if (d.dials.at(-1) >= letGoReloadAt) fail("a redial reached past the hold after a reload", { dials: d.dials, letGoAt: letGoReloadAt });
console.log(`reload: rejoin welcome says holdMs ${d.welcomes[0].holdMs}, relay cut, redials queued at ${d.dials.join(", ")} ms, gave up at ${d.closedAt} ms, host let go at ${letGoReloadAt} ms`);

c.ws.close();
host.kill("SIGKILL");
console.log("hold prove ok");
process.exit(0);
