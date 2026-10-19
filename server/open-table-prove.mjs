// Server proof for the open-table feature (#833).
// 1. An open table created with visibility:"open" appears in GET /tables and in the WS "list" response.
// 2. A private table (default, no visibility flag) never appears in the list.
// 3. The list never exposes a private table's code.
// 4. Joining via the listed code works — seat is granted without already knowing the code.
// 5. Once the open table's host drops, the room closes and the list empties.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-open-table-"));
let host;
const sockets = [];
process.on("exit", () => {
  host?.kill("SIGKILL");
  for (const c of sockets) c.ws.terminate();
  rmSync(ROOMS_DIR, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

function boot(env = {}) {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR, SAVE_MS: "9999999", ...env },
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
  const c = { name, ws, inbox: [], waiters: [] };
  sockets.push(c);
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    c.inbox.push(msg);
    for (const w of c.waiters.splice(0)) w();
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.next = async (type, ms = 3000) => {
    const end = Date.now() + ms;
    for (;;) {
      const i = c.inbox.findIndex((m) => m.type === type);
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      if (Date.now() > end) throw new Error(`${name} waited for ${type}`);
      await new Promise((res) => { c.waiters.push(res); setTimeout(res, 50); });
    }
  };
  c.open = new Promise((res) => ws.on("open", res));
  return c;
}

const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

const port = await boot({ LOBBY_HOLD_MS: "300" });
const baseUrl = `http://127.0.0.1:${port}`;

// 1. No open tables yet: GET /tables returns [].
{
  const res = await fetch(`${baseUrl}/tables`);
  assert.equal(res.status, 200);
  const tables = await res.json();
  assert.deepEqual(tables, [], "no open tables before anyone hosts");
}

// 2. A private table (default) never appears in the list.
{
  const priv = client(port, "Private-host");
  await priv.open;
  priv.send({ type: "hello", name: "Private-host" });
  const welcome = await priv.next("welcome");
  const privateCode = welcome.code;
  assert.ok(typeof privateCode === "string" && privateCode.length === 4, "host welcomed with code");

  const res = await fetch(`${baseUrl}/tables`);
  const tables = await res.json();
  assert.deepEqual(tables, [], "a private table does not appear in the list");

  // Also confirm via WS list message.
  const lister = client(port, "lister-1");
  await lister.open;
  lister.send({ type: "list" });
  const reply = await lister.next("openTables");
  assert.deepEqual(reply.tables, [], "WS list also returns [] for private-only host");

  // The private table's code never leaks.
  assert.ok(!JSON.stringify(reply.tables).includes(privateCode), "private code is never in the list");
  priv.ws.terminate();
  lister.ws.terminate();
}

await settle(300);

// 3. An open table appears in the list.
let openCode;
{
  const opn = client(port, "Jarrod");
  await opn.open;
  opn.send({ type: "hello", name: "Jarrod", visibility: "open" });
  const welcome = await opn.next("welcome");
  openCode = welcome.code;

  await settle(100);

  const res = await fetch(`${baseUrl}/tables`);
  const tables = await res.json();
  assert.equal(tables.length, 1, "one open table in the list");
  assert.equal(tables[0].code, openCode, "correct code");
  assert.equal(tables[0].name, "Jarrod's table");
  assert.equal(tables[0].seated, 1);
  assert.equal(tables[0].total, 4);
  assert.equal(tables[0].status, "lobby");

  // WS list message returns the same.
  const lister = client(port, "lister-2");
  await lister.open;
  lister.send({ type: "list" });
  const reply = await lister.next("openTables");
  assert.equal(reply.tables.length, 1, "WS list sees the open table");
  assert.equal(reply.tables[0].code, openCode);
  lister.ws.terminate();
}

// 4. A second player can join the open table using the listed code (no prior knowledge of the code).
{
  const joshua = client(port, "Joshua");
  await joshua.open;
  joshua.send({ type: "hello", code: openCode, name: "Joshua" });
  const welcome = await joshua.next("welcome");
  assert.equal(welcome.code, openCode, "Joshua joined with the code from the list");

  // Seated count reflects Joshua.
  await settle(150);
  const res = await fetch(`${baseUrl}/tables`);
  const tables = await res.json();
  assert.equal(tables[0].seated, 2, "seated count updated after a join");
  joshua.ws.terminate();
}

// 5. A private table hosted alongside the open one never appears in the list.
{
  const priv2 = client(port, "Secret-host");
  await priv2.open;
  priv2.send({ type: "hello", name: "Secret-host" });
  await priv2.next("welcome");
  await settle(100);

  const res = await fetch(`${baseUrl}/tables`);
  const tables = await res.json();
  assert.equal(tables.length, 1, "only the open table appears");
  assert.equal(tables[0].code, openCode, "the open table's code is listed, not the private one's");
  priv2.ws.terminate();
}

// 6. When the open table's host drops and the room closes, the list empties.
{
  // Find the open host's socket and close it forcibly.
  // To do this properly, terminate the socket by killing its WS object. The host socket is in sockets[].
  const openHost = sockets.find((c) => c.name === "Jarrod");
  openHost?.ws.terminate();
  // Also terminate Joshua whose seat is still on this table (held briefly in the lobby).
  const joshuaSocket = sockets.find((c) => c.name === "Joshua");
  joshuaSocket?.ws.terminate();
  // Wait for both hold timers to fire (LOBBY_HOLD_MS = 300 ms) then the room to drop.
  await settle(800);

  const res = await fetch(`${baseUrl}/tables`);
  const tables = await res.json();
  assert.deepEqual(tables, [], "list empties when the open table is dropped");
}

console.log("open-table-prove ok: list empty, private never listed, open listed, join via code, parallel private hidden, cleanup on drop");
process.exit(0);
