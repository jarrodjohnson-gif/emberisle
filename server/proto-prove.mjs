// G2 (#525): the wire protocol's version against the real host. Every welcome carries `proto`; a hello with no proto is
// taken as 0; a hello naming a protocol newer than the host's (or not a version at all) is refused with an error naming
// the protocol, before it can open a table, take a lobby seat, reclaim a held seat or watch, and with nothing on disk.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import WebSocket from "ws";
import { createGame } from "../src/lib/game/board.ts";
import { PROTO } from "../src/lib/net/proto.ts";

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-proto-"));
const sockets = [];
let host;
let stderr = "";
process.on("exit", () => { host?.kill(); rmSync(dir, { recursive: true, force: true }); });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));

// A started table on disk, so its seats come back held: one to rejoin and a game to watch.
const game = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 5 });
const seats = game.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `PRGM-${p.id}` }));
writeFileSync(path.join(dir, "PRGM.json"), JSON.stringify({ code: "PRGM", host: "s0", next: 3, chat: [], chatSeq: 0, game, seats, shape: 2, savedAt: Date.now() }));

host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR: dir, SAVE_MS: "20", GRACE_MS: "60000", HOLD_MS: "60000", TURN_MS: "60000" },
  stdio: ["ignore", "pipe", "pipe"],
});
host.stderr.on("data", (d) => { stderr += d; });
const port = await new Promise((resolve, reject) => {
  host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
  host.on("exit", (c) => reject(new Error(`host exited ${c}: ${stderr}`)));
});

async function socket() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { inbox: [], changed: null };
  ws.on("message", (raw) => { c.inbox.push(JSON.parse(String(raw))); c.changed?.(); });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.next = async (type) => {
    const until = Date.now() + 5000;
    for (;;) {
      const i = c.inbox.findIndex((m) => m.type === type);
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timed out waiting for ${type}: ${JSON.stringify(c.inbox)} ${stderr}`)), Math.max(1, until - Date.now()));
        c.changed = () => { clearTimeout(t); c.changed = null; resolve(); };
      });
    }
  };
  c.close = () => ws.close();
  sockets.push(c);
  await new Promise((resolve) => ws.once("open", resolve));
  return c;
}

const settle = () => new Promise((r) => setTimeout(r, 150));
const disk = () => Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => [f, readFileSync(path.join(dir, f), "utf8")]));
const seatsOf = async (code) => {
  const c = await socket();
  c.send({ type: "peek", code });
  const { seats } = await c.next("seats");
  c.close();
  return seats;
};

// Each refused hello: the protocol error and nothing else, on a socket that stays seatless.
async function refused(hello, label) {
  const c = await socket();
  await settle();
  const before = disk();
  c.send(hello);
  const err = await c.next("error");
  assert.match(err.message, /protocol/i, `${label}: the error names the protocol`);
  assert.match(err.message, /Reload to update/, `${label}: the error says how to fix it`);
  assert.equal(err.proto, PROTO, `${label}: the error carries the host's proto`);
  await settle();
  assert.deepEqual(c.inbox, [], `${label}: no welcome, seats or state after the error`);
  assert(isDeepStrictEqual(disk(), before), `${label}: nothing saved`);
  console.log(`ok ${label}: "${err.message}"`);
  return c;
}

try {
  // A matching hello opens a table and the welcome echoes the host's protocol.
  const owner = await socket();
  owner.send({ type: "hello", proto: PROTO, name: "Ember" });
  const opened = await owner.next("welcome");
  assert.equal(opened.proto, PROTO, "open: welcome carries proto");
  const code = opened.code;
  await owner.next("seats");
  console.log(`ok matching proto ${PROTO}: opened ${code}, welcome proto ${opened.proto}`);

  // A hello with no proto (a page from before G2) is taken as proto 0 and sits down.
  const legacy = await socket();
  legacy.send({ type: "hello", code, name: "Tide" });
  const sat = await legacy.next("welcome");
  assert.equal(sat.proto, PROTO, "no-proto join: welcome carries the host's proto");
  assert.equal((await seatsOf(code)).length, 2, "no-proto join took a seat");
  console.log(`ok no proto: accepted as 0, seated as ${sat.you}, welcome proto ${sat.proto}`);

  // A future proto opens nothing: the same socket can still open a table once it speaks a known one.
  const opener = await refused({ type: "hello", proto: 999, name: "Pine" }, "open with proto 999");
  opener.send({ type: "hello", proto: PROTO, name: "Pine" });
  assert.equal((await opener.next("welcome")).proto, PROTO, "the refused socket opens with a known proto");
  console.log("ok the refused socket stayed seatless and opens a table with a known proto");

  // A future proto takes no lobby seat and the seated players hear nothing.
  owner.inbox.length = 0;
  for (const proto of [999, PROTO + 1, "1", -1, 1.5, {}]) await refused({ type: "hello", proto, code, name: "Dune" }, `join with proto ${JSON.stringify(proto)}`);
  await settle();
  assert.equal((await seatsOf(code)).length, 2, "no lobby seat taken");
  assert.deepEqual(owner.inbox, [], "no seats broadcast or log line to the lobby");
  console.log("ok lobby: still 2 seats, no broadcast");

  // A future proto does not reclaim a held seat: it stays away, and a matching rejoin then takes it.
  const stale = await refused({ type: "hello", proto: 999, code: "PRGM", secret: "PRGM-p1" }, "rejoin with proto 999");
  stale.close();
  const back = await socket();
  back.send({ type: "hello", proto: PROTO, code: "PRGM", secret: "PRGM-p1" });
  const rejoined = await back.next("welcome");
  assert.equal(rejoined.proto, PROTO, "rejoin: welcome carries proto");
  assert.equal(rejoined.you, "s1", "the held seat was still free to rejoin");
  await back.next("seats");
  console.log(`ok rejoin: the refused secret left ${rejoined.you} held; a matching rejoin took it, welcome proto ${rejoined.proto}`);

  // A future proto cannot watch: the table's watcher count stays 0. A matching watcher is welcomed with proto.
  back.inbox.length = 0;
  await refused({ type: "hello", proto: 999, code: "PRGM", watch: true }, "watch with proto 999");
  await settle();
  assert(!back.inbox.some((m) => m.type === "seats" || m.type === "log"), "no watcher count or log line to the table");
  const watcher = await socket();
  watcher.send({ type: "hello", proto: PROTO, code: "PRGM", watch: true });
  const watching = await watcher.next("welcome");
  assert.equal(watching.proto, PROTO, "watch: welcome carries proto");
  assert.equal(watching.spectator, true);
  assert.equal((await back.next("seats")).watching, 1, "the matching watcher is the only one counted");
  console.log(`ok watch: refused watcher not counted; a matching watcher counted 1, welcome proto ${watching.proto}`);

  console.log("proto prove ok");
} finally {
  for (const c of sockets) c.close();
}
process.exit(0);
