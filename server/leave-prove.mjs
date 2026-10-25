// Leave on purpose against server/host.mjs: in the lobby the Leave button frees the seat at once, so it never blocks
// Start; a dropped socket is still held for LOBBY_HOLD_MS; a host who leaves hands the role on; in a game Leave is a drop.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-leave-"));
let host;
const sockets = [];
process.on("exit", () => {
  host?.kill("SIGKILL");
  for (const c of sockets) c.ws.terminate();
  rmSync(ROOMS_DIR, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

function boot() {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR, SAVE_MS: "20", ACT_RATE: "1000", ACT_CAP: "1000", LOBBY_HOLD_MS: "60000", GRACE_MS: "60000" },
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
  const c = { name, ws, inbox: [], seats: null, state: null };
  sockets.push(c);
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "seats") c.seats = msg.seats;
    if (msg.type === "state") c.state = msg;
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
    await sleep(20);
  }
}
async function sit(port, names) {
  const cs = names.map((n) => client(port, n));
  await cs[0].open;
  cs[0].send({ type: "hello", name: cs[0].name });
  await until(() => cs[0].inbox.some((m) => m.type === "welcome"), "welcome");
  const code = cs[0].inbox.find((m) => m.type === "welcome").code;
  for (const c of cs.slice(1)) {
    await c.open;
    c.send({ type: "hello", code, name: c.name });
    await until(() => c.inbox.some((m) => m.type === "welcome"), `${c.name} welcome`);
  }
  await until(() => cs.every((c) => c.seats?.length === names.length), "every seat seen");
  return cs;
}
const said = (c, text) => c.inbox.some((m) => m.type === "log" && m.text === text);
const ok = (what) => console.log(`ok ${what}`);

const port = await boot();

// 1. A guest taps Leave in the lobby: the seat is gone at once, and the table can start without them.
{
  const [ember, tide] = await sit(port, ["Ember", "Tide"]);
  const t0 = Date.now();
  tide.send({ type: "leave" });
  tide.ws.close();
  await until(() => ember.seats.length === 1, "the guest's seat to go");
  const took = Date.now() - t0;
  assert.ok(took < 1000, `the seat went in ${took} ms, not after the hold`);
  await until(() => said(ember, "Tide left."), "the left line");
  ok(`lobby Leave: Tide's seat went in ${took} ms and the table says "Tide left."`);
  ember.send({ type: "addBot" });
  ember.send({ type: "addBot" });
  await until(() => ember.seats.length === 3, "two bots");
  ember.send({ type: "ready", value: true });
  ember.send({ type: "start" });
  await until(() => ember.state, "the game to start");
  ok("with the guest gone, Ember and two bots start");
}

// 2. A dropped guest (no leave) is still held: the seat stays, away and not ready.
{
  const [ember, tide] = await sit(port, ["Ember", "Tide"]);
  tide.ws.terminate();
  await until(() => ember.seats[1]?.away, "the dropped seat shown away");
  await sleep(500);
  assert.equal(ember.seats.length, 2, "a drop keeps the seat for the hold");
  assert.equal(ember.seats[1].ready, false);
  ok("lobby drop: the seat is held, away and not ready");
}

// 3. The host taps Leave: the seat goes and the guest is the host.
{
  const [ember, tide] = await sit(port, ["Ember", "Tide"]);
  ember.send({ type: "leave" });
  ember.ws.close();
  await until(() => tide.seats.length === 1 && tide.seats[0].host, "the guest to be host");
  assert.equal(tide.seats[0].name, "Tide");
  ok("host Leave: the seat goes and Tide is the host");
}

// 4. In a game, leave changes nothing: the close that follows is a drop, held for the grace like before.
{
  const [ember, tide] = await sit(port, ["Ember", "Tide"]);
  ember.send({ type: "addBot" });
  await until(() => ember.seats.length === 3, "a bot");
  ember.send({ type: "ready", value: true });
  tide.send({ type: "ready", value: true });
  await until(() => ember.seats.every((s) => s.ready), "every seat ready");
  ember.send({ type: "start" });
  await until(() => ember.state && tide.state, "the game to start");
  tide.send({ type: "leave" });
  tide.ws.close();
  await until(() => said(ember, "Tide lost connection."), "the lost line");
  assert.equal(ember.seats.length, 3, "in a game the seat stays");
  assert.equal(ember.seats.find((s) => s.name === "Tide")?.away, true);
  ok("game Leave: the seat is held as a drop");
}

// 5. A leave from a socket that never sat is ignored, and the host keeps serving.
{
  const stray = client(port, "Stray");
  await stray.open;
  stray.send({ type: "leave" });
  await until(() => stray.inbox.some((m) => m.type === "error"), "the not-ready error");
  const [ember] = await sit(port, ["Ember"]);
  assert.equal(ember.seats.length, 1);
  ok("a leave before sitting is refused and the host keeps serving");
}

// 6. An open table: the host leaves while the only guest is held (dropped). Nobody is connected, so the open listing
// goes at once instead of blocking a new open host for the hold.
{
  const listed = async () => {
    const c = client(port, "Lister");
    await c.open;
    c.send({ type: "list" });
    await until(() => c.inbox.some((m) => m.type === "openTables"), "the open list");
    c.ws.close();
    return c.inbox.find((m) => m.type === "openTables").tables;
  };
  const ember = client(port, "Ember");
  await ember.open;
  ember.send({ type: "create", name: "Ember", visibility: "open" });
  await until(() => ember.inbox.some((m) => m.type === "welcome"), "the open table");
  const code = ember.inbox.find((m) => m.type === "welcome").code;
  const tide = client(port, "Tide");
  await tide.open;
  tide.send({ type: "hello", code, name: "Tide" });
  await until(() => tide.inbox.some((m) => m.type === "welcome"), "Tide welcome");
  await until(() => ember.seats?.length === 2, "both seats");
  assert.deepEqual((await listed()).map((t) => t.code), [code], "the open table is listed");
  tide.ws.terminate();
  await until(() => ember.seats[1]?.away, "Tide held");
  ember.send({ type: "leave" });
  ember.ws.close();
  const end = Date.now() + 2000;
  let tables = await listed();
  while (tables.length && Date.now() < end) {
    await sleep(50);
    tables = await listed();
  }
  assert.deepEqual(tables, [], "the open slot is released when the host leaves a table nobody is connected to");
  ok("open table: the host leaves with the guest held, and the listing is released at once");
}

console.log("leave prove ok");
process.exit(0);
