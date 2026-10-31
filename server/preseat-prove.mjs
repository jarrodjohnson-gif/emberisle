// G10: the pre-seat surface, against the real host. Opening a table is metered host-wide (OPEN_CAP, OPEN_REFILL_MS), so
// a burst of fresh sockets each opening one is refused past the cap with no room made and ROOM_MAX never reached, while
// joining and peeking stay open; a peek carries colours and ready flags with no name or picture; the cap refills.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const OPEN_CAP = 4;
const OPEN_REFILL_MS = 3000;
const ROOM_MAX = 16;
const IP_CAP = 2;
const IP_MS = 60000;
const SAVE_MS = 50;
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-preseat-"));
let host;
process.on("exit", () => {
  host?.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function start() {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR: dir, RESULTS_DIR: `${dir}/results`, SAVE_MS: String(SAVE_MS), OPEN_CAP: String(OPEN_CAP), OPEN_REFILL_MS: String(OPEN_REFILL_MS), OPEN_IP_CAP: String(IP_CAP), OPEN_IP_MS: String(IP_MS), ROOM_MAX: String(ROOM_MAX) },
  });
  host.stderr.on("data", (d) => process.stderr.write(d));
  let out = "";
  return new Promise((resolve, reject) => {
    host.stdout.on("data", (d) => {
      out += d;
      const m = out.match(/listening (\d+)/);
      if (m) resolve(Number(m[1]));
    });
    host.once("exit", (c) => reject(new Error(`host exited ${c}`)));
  });
}

// One socket with an inbox: `next(type)` resolves with the first message of that type, in order.
async function client(port, from, headers) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { ...(from ? { localAddress: from } : {}), ...(headers ? { headers } : {}) });
  const c = { ws, inbox: [], waiters: [] };
  ws.on("error", () => {});
  ws.on("message", (raw) => {
    c.inbox.push(JSON.parse(String(raw)));
    for (const w of c.waiters.splice(0)) w();
  });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.next = async (type, ms = 3000) => {
    const t = Date.now();
    for (;;) {
      const i = c.inbox.findIndex((m) => m.type === type);
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      assert.ok(Date.now() - t < ms, `no ${type} within ${ms} ms: ${JSON.stringify(c.inbox)}`);
      await new Promise((r) => (c.waiters.push(r), setTimeout(r, 20)));
    }
  };
  // The first message back from a hello: welcome or error.
  c.answer = async () => {
    while (!c.inbox.some((m) => m.type === "welcome" || m.type === "error")) await new Promise((r) => (c.waiters.push(r), setTimeout(r, 20)));
    const i = c.inbox.findIndex((m) => m.type === "welcome" || m.type === "error");
    return c.inbox.splice(i, 1)[0];
  };
  await new Promise((r) => ws.on("open", r));
  return c;
}

const BUSY = "Too many new tables right now. Try again in a minute.";
const files = () => readdirSync(dir).filter((f) => f.endsWith(".json"));
const port = await start();

// 1. Twelve sockets open a table at once: OPEN_CAP welcomes, the rest refused, and only OPEN_CAP rooms on disk.
const flood = await Promise.all(Array.from({ length: 12 }, () => client(port)));
for (const [i, c] of flood.entries()) c.send({ type: "hello", name: `Flood${i}` });
const answers = await Promise.all(flood.map((c) => c.answer()));
const opened = answers.filter((a) => a.type === "welcome");
const refused = answers.filter((a) => a.type === "error");
assert.equal(opened.length, OPEN_CAP, `welcomes: ${JSON.stringify(answers.map((a) => a.type))}`);
assert.equal(refused.length, 12 - OPEN_CAP);
for (const r of refused) assert.equal(r.message, BUSY);
assert.ok(opened.length < ROOM_MAX, "ROOM_MAX was never approached");
await wait(SAVE_MS * 4);
assert.equal(files().length, OPEN_CAP, `room files: ${files()}`);
// A refused socket trying again, and a fresh one, are still refused by the cap, not by "The host is full.".
const again = refused[0];
const retry = flood[answers.indexOf(again)];
retry.send({ type: "hello", name: "Retry" });
assert.equal((await retry.answer()).message, BUSY);
const fresh = await client(port);
fresh.send({ type: "create", name: "Fresh" });
assert.equal((await fresh.answer()).message, BUSY);
assert.equal(files().length, OPEN_CAP);
console.log(`12 hellos at once: ${opened.length} tables opened, ${refused.length} got "${BUSY}", ${files().length} room files, ROOM_MAX ${ROOM_MAX} untouched; a retry and a fresh create are still refused`);

// 1b. Per-address budget: the flood above came from loopback (where the tunnel sits), which is not metered by address. A
// direct client at 127.0.0.2 reconnecting for each hello is refused after IP_CAP tables with its own line, which spends
// nothing from the shared bucket, so a client at 127.0.0.3 still opens one at the next refill.
const GREEDY = "You have opened several tables lately. Try again in a minute.";
await wait(OPEN_REFILL_MS * (IP_CAP + 1) + 300);
for (let i = 0; i < IP_CAP; i++) {
  const g = await client(port, "127.0.0.2");
  g.send({ type: "hello", name: `Greedy${i}` });
  assert.equal((await g.answer()).type, "welcome", `greedy ${i}`);
}
const greedy = await client(port, "127.0.0.2");
greedy.send({ type: "hello", name: "Greedy" });
assert.equal((await greedy.answer()).message, GREEDY);
const other = await client(port, "127.0.0.3");
other.send({ type: "hello", name: "Other" });
assert.equal((await other.answer()).type, "welcome", "a second address opens while the first is capped");
console.log(`one address opened ${IP_CAP} tables, then "${GREEDY}" without touching the shared cap; a different address still opened one`);

// 1c. Tunnelled players: sockets from loopback carrying cf-connecting-ip are keyed on that header. Again the shared bucket holds
// exactly enough for the opens that should succeed, so a refused one that spent a token would starve the last open.
await wait(OPEN_REFILL_MS * (IP_CAP + 1) + 300);
const via = (ip) => client(port, undefined, { "cf-connecting-ip": ip });
for (let i = 0; i < IP_CAP; i++) {
  const t = await via("203.0.113.7");
  t.send({ type: "hello", name: `Tunnel${i}` });
  assert.equal((await t.answer()).type, "welcome", `tunnel ${i}`);
}
const tunnelGreedy = await via("203.0.113.7");
tunnelGreedy.send({ type: "hello", name: "TunnelGreedy" });
assert.equal((await tunnelGreedy.answer()).message, GREEDY);
const tunnelOther = await via("203.0.113.8");
tunnelOther.send({ type: "hello", name: "TunnelOther" });
assert.equal((await tunnelOther.answer()).type, "welcome", "a second tunnelled address opens while the first is capped");
console.log(`behind the tunnel one cf-connecting-ip opened ${IP_CAP} tables, then "${GREEDY}"; a different cf-connecting-ip still opened one`);

// 2. The cap is on opening only: a player under it still joins a live lobby and peeks it.
const code = opened[0].code;
const joiner = await client(port);
joiner.send({ type: "hello", code, name: "Joiner", color: "#2d6ee8" });
const welcome = await joiner.answer();
assert.equal(welcome.type, "welcome", JSON.stringify(welcome));
assert.equal(welcome.code, code);
const seated = await joiner.next("seats");
assert.equal(seated.seats.length, 2);
assert.ok(seated.seats.every((s) => typeof s.name === "string" && "url" in s), "a seated socket still gets names and pictures");
console.log(`under the cap a join to ${code} sat down and saw ${seated.seats.length} named seats`);

// 3. A peek on that lobby: colours, ready flags and the count, with no name or picture on any seat.
const peeker = await client(port);
peeker.send({ type: "peek", code });
const peeked = await peeker.next("seats");
assert.equal(peeked.code, code);
assert.equal(peeked.seats.length, 2);
for (const s of peeked.seats) {
  assert.deepEqual(Object.keys(s).sort(), ["color", "id", "ready"], JSON.stringify(s));
  assert.ok(typeof s.color === "string" && typeof s.ready === "boolean");
}
assert.ok(!JSON.stringify(peeked).match(/Flood0|Joiner|name|url|avatar|secret/), JSON.stringify(peeked));
assert.ok(peeked.seats.some((s) => s.color === seated.seats.find((x) => x.name === "Joiner").color), "the joiner's colour is in the peek");
console.log(`peek ${code}: ${peeked.seats.length} seats, keys ${Object.keys(peeked.seats[0]).join(",")}, no name or picture`);

// 4. The cap refills: after OPEN_REFILL_MS one more table opens, and the one right after it is refused again.
await wait(OPEN_REFILL_MS + 300);
const later = await client(port);
later.send({ type: "hello", name: "Later" });
const laterAnswer = await later.answer();
assert.equal(laterAnswer.type, "welcome", JSON.stringify(laterAnswer));
const tooSoon = await client(port);
tooSoon.send({ type: "hello", name: "TooSoon" });
assert.equal((await tooSoon.answer()).message, BUSY);
await wait(SAVE_MS * 4);
assert.equal(files().length, OPEN_CAP + 2 * IP_CAP + 3, `room files: ${files()}`);
assert.equal(host.exitCode, null, "host still up");
console.log(`after ${OPEN_REFILL_MS} ms one more hello opened ${laterAnswer.code} and the next was refused; ${files().length} room files; host up`);

host.kill("SIGKILL");
console.log("preseat-prove ok");
