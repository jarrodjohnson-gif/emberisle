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
import { getOpenTables, maybeReleaseOpenSlot, registerOpenTable, unregisterOpenTable } from "./open-table.mjs";

// A connected finished table must release its slot; an unrelated drop cannot remove its successor.
{
  const finished = { code: "OVER", host: "s0", seats: [{ id: "s0", name: "Winner", ws: {} }], game: { phase: "play" } };
  assert.equal(registerOpenTable(finished), true);
  assert.equal(getOpenTables()[0].status, "playing");
  finished.game.phase = "over";
  maybeReleaseOpenSlot(finished);
  assert.deepEqual(getOpenTables(), [], "game over releases the slot even with a connected host");
  const next = { ...finished, code: "NEXT", game: null };
  assert.equal(registerOpenTable(next), true, "a new open host can claim the finished table's slot");
  unregisterOpenTable(finished);
  assert.equal(getOpenTables()[0].code, "NEXT", "dropping the old room preserves the new listing");
  unregisterOpenTable(next);
}

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

const port = await boot({ LOBBY_HOLD_MS: "1000" });
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

  // At most one open table per host: a second open create is refused.
  const rival = client(port, "Rival");
  await rival.open;
  rival.send({ type: "hello", name: "Rival", visibility: "open" });
  const err = await rival.next("error");
  assert.match(err.message, /already listed/i, "second open table is refused");
  const still = await (await fetch(`${baseUrl}/tables`)).json();
  assert.equal(still.length, 1, "list still has only Jarrod's table");
  assert.equal(still[0].code, openCode);
  rival.ws.terminate();
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
  await settle(5500); // refill GET /tables tokens so a 429 [] is not mistaken for "no open table"
  const priv2 = client(port, "Secret-host");
  await priv2.open;
  priv2.send({ type: "hello", name: "Secret-host" });
  await priv2.next("welcome");
  await settle(100);

  const res = await fetch(`${baseUrl}/tables`);
  assert.equal(res.status, 200, "GET /tables ok after refill");
  const tables = await res.json();
  assert.equal(tables.length, 1, "only the open table appears");
  assert.equal(tables[0].code, openCode, "the open table's code is listed, not the private one's");
  priv2.ws.terminate();
}

// 6. Host handoff updates the listed name; bots count toward seated.
{
  // Re-host after the earlier open table is still held by Jarrod+Joshua sockets from steps 3–4.
  // Close those first so the slot frees (no connected seats).
  sockets.find((c) => c.name === "Jarrod")?.ws.terminate();
  sockets.find((c) => c.name === "Joshua")?.ws.terminate();
  await settle(200);
  assert.deepEqual(await (await fetch(`${baseUrl}/tables`)).json(), [], "slot frees when nobody is connected");

  const hostA = client(port, "Ada");
  await hostA.open;
  hostA.send({ type: "hello", name: "Ada", visibility: "open" });
  const welcomeA = await hostA.next("welcome");
  const codeA = welcomeA.code;
  const guest = client(port, "Bea");
  await guest.open;
  guest.send({ type: "hello", code: codeA, name: "Bea" });
  await guest.next("welcome");
  // Host adds a bot: seated must be 3 (Ada, Bea, Bot), not 2.
  hostA.send({ type: "addBot" });
  await settle(150);
  let tables = await (await fetch(`${baseUrl}/tables`)).json();
  assert.equal(tables[0].seated, 3, "bots count toward seated");
  assert.equal(tables[0].name, "Ada's table");
  // Ada leaves: Bea becomes host; listed name follows the host seat.
  hostA.ws.terminate();
  await settle(200);
  tables = await (await fetch(`${baseUrl}/tables`)).json();
  assert.equal(tables[0]?.name, "Bea's table", "listed name follows host handoff");
  guest.ws.terminate();
  await settle(200);
}

// 7. GET /tables is rate-limited (429 after the burst).
{
  await settle(6000); // refill the shared bucket
  const statuses = [];
  for (let i = 0; i < 16; i++) {
    statuses.push((await fetch(`${baseUrl}/tables`)).status);
  }
  assert.ok(statuses.includes(429), `GET /tables is rate-limited (statuses ${statuses.join(",")})`);
  await settle(1200); // refill
  assert.equal((await fetch(`${baseUrl}/tables`)).status, 200, "GET /tables recovers after throttle");
}

// 8. When the open table's seats drop and the room closes, the list stays empty and a new open host can claim the slot.
{
  await settle(5500); // refill after the rate-limit burst
  const again = client(port, "Clara");
  await again.open;
  again.send({ type: "hello", name: "Clara", visibility: "open" });
  const saved = await again.next("welcome");
  const listed = await fetch(`${baseUrl}/tables`);
  assert.equal(listed.status, 200, "GET /tables ok when listing Clara");
  assert.equal((await listed.json())[0]?.name, "Clara's table");
  again.ws.terminate();
  await settle(100);
  const returning = client(port, "Clara-returning");
  await returning.open;
  returning.send({ type: "hello", code: saved.code, secret: saved.secret });
  await returning.next("welcome");
  const restored = await fetch(`${baseUrl}/tables`);
  assert.equal(restored.status, 200);
  assert.equal((await restored.json())[0]?.code, saved.code, "a held open seat restores its listing after reconnect");
  returning.ws.terminate();
  await settle(1200); // Wait for the held seat to expire.
  assert.deepEqual(await (await fetch(`${baseUrl}/tables`)).json(), [], "list empties when the open table is dropped");
}

console.log("open-table-prove ok: list empty, private never listed, open listed, join via code, parallel private hidden, handoff, bots count, rate limit, cleanup on drop");
process.exit(0);
