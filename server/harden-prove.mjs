// Untrusted input: bad messages, card-minting discards, oversized pictures, and a player who leaves mid-game.
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";

let host;
function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  host?.kill();
  process.exit(1);
}

// 1. The engine rejects bad bags and non-arrays instead of minting cards or throwing.
let g = createGame({ humans: [{ name: "A" }, { name: "B" }, { name: "C" }], bots: 0, seed: 5 });
g.phase = "discard";
g.current = "p0";
g.players[0].resources = { timber: 8, clay: 0, wool: 0, grain: 0, ore: 0 };
g.discardNeeded = { p0: 4 };
const minted = applyAction(g, "p0", { type: "discard", resources: { timber: 8, ore: -4 } });
if (!minted.error || minted.state.players[0].resources.ore !== 0) fail("negative discard accepted", minted.error);
g.phase = "main";
g.discardNeeded = {};
g.players[0].hidden.road = 1;
g.players[0].hidden.plenty = 1;
g.players[0].hidden.monopoly = 1;
for (const bad of [
  { type: "playRoad", edgeIds: 5 },
  { type: "playPlenty", resources: "wool" },
  { type: "playPlenty", resources: ["wool", "gold"] },
  { type: "playMonopoly", resource: "gold" },
  { type: "bankTrade", give: "timber", want: "__proto__" },
  { type: "offerTrade", to: "p1", give: { timber: -1 }, want: {} },
]) {
  let r;
  try {
    r = applyAction(g, "p0", bad);
  } catch (e) {
    fail(`${bad.type} threw`, e.message);
  }
  if (!r.error) fail(`${bad.type} accepted`, JSON.stringify(bad));
}
console.log("engine rejects bad bags, names, and non-arrays");

// 2. The host survives garbage, caps pictures, and picks picture ids itself.
host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0" },
  stdio: ["ignore", "pipe", "pipe"],
});
const port = await new Promise((resolve, reject) => {
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  host.on("exit", (c) => reject(new Error(`host exited ${c}`)));
});
host.on("exit", (c) => fail("host died", c));

const big = await fetch(`http://127.0.0.1:${port}/avatars`, { method: "POST", body: Buffer.alloc(300 * 1024) }).catch(
  () => ({ status: 413 }),
);
if (big.status !== 413) fail("300 KB picture accepted", big.status);
const small = await fetch(`http://127.0.0.1:${port}/avatars`, {
  method: "POST",
  headers: { "x-player-id": "p0" },
  body: Buffer.alloc(1000),
});
const { avatarId } = await small.json();
if (!avatarId || avatarId === "p0") fail("client chose the picture id", avatarId);
console.log("picture: 300 KB refused (413), id picked by host");

function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, inbox: [], waiters: [], state: null };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") c.state = m;
    c.inbox.push(m);
    for (const w of c.waiters.splice(0)) w();
  });
  c.send = (m) => ws.send(typeof m === "string" ? m : JSON.stringify(m));
  c.next = async (type) => {
    for (;;) {
      const i = c.inbox.findIndex((m) => m.type === type);
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      await new Promise((res, rej) => {
        c.waiters.push(res);
        setTimeout(() => rej(new Error(`waited for ${type}`)), 3000);
      }).catch((e) => fail(e.message));
    }
  };
  c.open = new Promise((r) => ws.on("open", r));
  return c;
}

const a = client();
const b = client();
const c = client();
await Promise.all([a.open, b.open, c.open]);
for (const junk of ["{", "null", "5", '{"type":"hello","code":{}}', { type: "play", card: "road", ids: 5 }, { type: "discard", cards: { ore: -4 } }]) {
  a.send(junk);
}
a.send({ type: "hello", name: "A" });
const { code } = await a.next("welcome");
b.send({ type: "hello", code, name: "B" });
c.send({ type: "hello", code, name: "C" });
await b.next("welcome");
await c.next("welcome");
const seats = (await c.next("seats")).seats;
const colors = new Set(seats.map((s) => s.color));
if (colors.size !== seats.length) fail("two seats got the same default color", [...colors]);
console.log("host survived 6 malformed messages; default colors differ:", [...colors].join(" "));

// 3. A player who leaves mid-game is played by the bot, so the table keeps going.
for (const x of [a, b, c]) x.send({ type: "ready", value: true });
await new Promise((r) => setTimeout(r, 100));
a.send({ type: "start" });
await Promise.all([a.next("state"), b.next("state"), c.next("state")]);
const first = a.state.game.current;
if (first !== a.state.you) fail("expected the host to place first", first);
a.ws.close();
const after = await b.next("state");
const gone = after.game.players.find((p) => p.id === first);
if (gone.kind !== "bot" || after.game.current === first) fail("table hung after a leave", after.game.current);
console.log(`seat ${first} left on its turn; the bot placed and play moved to ${after.game.current}`);

host.removeAllListeners("exit");
host.kill();
console.log("harden prove ok");
process.exit(0);
