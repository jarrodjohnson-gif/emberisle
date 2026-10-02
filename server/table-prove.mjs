// Three sockets play a table against host.mjs with no art (build bible 11.3).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

// Rooms go to a temp folder, dropped on exit, so the real host never restores this proof's tables (#207).
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR },
});
process.on("exit", () => host.kill());
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
  host.kill();
  process.exit(1);
}

function client(name, color) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { name, color, ws, inbox: [], waiters: [], state: null, rolls: [] };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") c.state = msg;
    if (msg.type === "rolled") c.rolls.push(msg);
    c.inbox.push(msg);
    for (const w of c.waiters.splice(0)) w();
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.next = async (type) => {
    for (;;) {
      const i = c.inbox.findIndex((m) => m.type === type || (type === "any" && m.type !== "log"));
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      await new Promise((res, rej) => {
        c.waiters.push(res);
        setTimeout(() => rej(new Error(`${name} waited for ${type}`)), 3000);
      }).catch((e) => fail(e.message));
    }
  };
  c.open = new Promise((res) => ws.on("open", res));
  return c;
}

const ember = client("Ember", "#c45c3e");
const tide = client("Tide", "#2a8f8a");
const pine = client("Pine", "#3d6b4f");
await Promise.all([ember.open, tide.open, pine.open]);

ember.send({ type: "hello", name: "Ember", color: ember.color });
const { code } = await ember.next("welcome");
if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(code)) fail("code", code);

tide.send({ type: "hello", code: "ZZZZ", name: "Tide", color: tide.color });
const bad = await tide.next("error");
if (bad.message !== "No table with that code") fail("bad code message", bad.message);

tide.send({ type: "hello", code: code.toLowerCase(), name: "Tide", color: tide.color });
await tide.next("welcome");
pine.send({ type: "hello", code, name: "Pine", color: ember.color });
if ((await pine.next("error")).message !== "Color taken.") fail("color taken");
pine.send({ type: "hello", code, name: "Pine", color: pine.color });
await pine.next("welcome");

let seats;
for (;;) {
  seats = await tide.next("seats");
  if (seats.seats.length === 3) break;
}
console.log("seat list on Tide:", seats.seats.map((s) => s.name).join(", "), "code", seats.code);

ember.send({ type: "start" });
if ((await ember.next("error")).message !== "Not everyone is ready.") fail("start before ready");
for (const c of [ember, tide, pine]) c.send({ type: "ready", value: true });
await new Promise((r) => setTimeout(r, 100));
ember.send({ type: "start" });

const all = [ember, tide, pine];
await Promise.all(all.map((c) => c.next("state")));
if (ember.state.game.players.map((p) => p.color).join() !== [ember, tide, pine].map((c) => c.color).join()) {
  fail("seat colors", ember.state.game.players.map((p) => p.color));
}
if (ember.state.game.deck.length !== 0 || ember.state.game.deckLeft !== 25) fail("deck order leaked");

function whoActs() {
  return all.find((c) => c.state.legal.outpost.length || c.state.legal.path.length || c.state.legal.wayfarer.length || c.state.legal.actions.length);
}

async function step(c, msg) {
  const seq = c.state.game.seq;
  c.send(msg);
  for (;;) {
    const m = await c.next("any");
    if (m.type === "error") fail(`${c.name} ${JSON.stringify(msg)}`, m.message);
    if (m.type === "state" && m.game.seq !== seq) break;
  }
  await Promise.all(all.filter((o) => o !== c).map((o) => o.next("state")));
}

// Setup: first outpost, then the two neighbors must not glow for the next seat.
let checkedNeighbors = false;
while (["setupSettle", "setupRoad"].includes(ember.state.game.phase)) {
  const c = whoActs();
  const { legal, game } = c.state;
  if (game.phase === "setupSettle") {
    const id = legal.outpost[0];
    await step(c, { type: "place", kind: "outpost", id });
    if (!checkedNeighbors) {
      const g = c.state.game;
      const near = new Set(g.edges.filter((e) => e.va === id || e.vb === id).map((e) => (e.va === id ? e.vb : e.va)));
      const nextUp = all.find((o) => o.state.you !== c.state.you);
      // The placer lays a path first; after that the next seat's glow list must skip the neighbors.
      await step(c, { type: "place", kind: "path", id: c.state.legal.path[0] });
      const after = whoActs().state.legal.outpost;
      const lit = [...near].filter((v) => after.includes(v));
      if (near.size < 2 || lit.length) fail("neighbor vertex glows", lit);
      if (after.includes(id)) fail("taken vertex glows");
      const wrong = await (async () => {
        nextUp.send({ type: "place", kind: "outpost", id: [...near][0] });
        return nextUp.next("error");
      })();
      console.log(`neighbors of ${id} stay dark (${near.size}); illegal click:`, wrong.message);
      checkedNeighbors = true;
    }
  } else {
    await step(c, { type: "place", kind: "path", id: legal.path[0] });
  }
}
console.log("setup done, phase", ember.state.game.phase);

// Error messages a client can see (#256): the seat that is not up cannot roll. The phase is roll here, so only the turn can refuse.
const expectError = (m, want, what) => {
  if (m.message !== want) fail(what, m.message);
  console.log(`error "${want}" (${what}): ok`);
};
{
  const idle = all.find((c) => c.state.you !== c.state.game.current);
  idle.send({ type: "roll" });
  expectError(await idle.next("error"), "Not your turn.", "roll out of turn");
}

const other = ember.state.game.players.find((p) => p.id !== ember.state.you);
if (Object.values(other.hidden).some((n) => n !== 0) || typeof other.fortunes !== "number") fail("hidden fortunes leaked");

// Another seat's hand arrives as a count only (#186): no `resources`, and `goods` is the size of the
// hand that seat's own socket holds, which is the host's hand for that player.
function handsAreCounts(when) {
  const size = (p) => Object.values(p.resources).reduce((a, b) => a + b, 0);
  for (const c of all) {
    for (const p of c.state.game.players) {
      if (p.id === c.state.you) continue;
      if ("resources" in p) fail(`${c.name} sees ${p.name}'s hand ${when}`, p.resources);
      const owner = all.find((o) => o.state.you === p.id).state.game;
      const held = size(owner.players.find((x) => x.id === p.id));
      if (owner.seq !== c.state.game.seq || p.goods !== held) fail(`${c.name} counts ${p.name} ${p.goods}, host holds ${held} ${when}`);
    }
  }
  const seen = ember.state.game.players.filter((p) => p.id !== ember.state.you).map((p) => `${p.name} ${p.goods}`);
  console.log(`${when}, Ember sees counts only (${seen.join(", ")}) and they match each seat's own hand`);
}
handsAreCounts("after setup");

// Twenty rolls: every socket sees the same dice the host committed.
const table = [];
while (table.length < 20) {
  const c = whoActs();
  const { legal, game } = c.state;
  if (game.phase === "roll") {
    const before = c.rolls.length;
    await step(c, { type: "roll" });
    const rolled = c.rolls[before];
    const [a, b] = c.state.game.dice;
    if (!rolled || rolled.dice[0] !== a || rolled.dice[1] !== b || rolled.sum !== a + b) fail("dice mismatch", rolled);
    if (a < 1 || a > 6 || b < 1 || b > 6) fail("die out of range", [a, b]);
    table.push(`${a}+${b}`);
  } else if (legal.discard > 0) {
    let left = legal.discard;
    const cards = {};
    for (const [r, n] of Object.entries(c.state.game.players.find((p) => p.id === c.state.you).resources)) {
      const k = Math.min(n, left);
      if (k) cards[r] = k;
      left -= k;
    }
    await step(c, { type: "discard", cards });
  } else if (game.phase === "robber") {
    const hexId = legal.wayfarer.find((h) => !legal.steal[h]) ?? legal.wayfarer[0];
    await step(c, { type: "rob", hexId, stealFrom: legal.steal[hexId]?.[0] ?? null });
  } else if (legal.path.length) {
    await step(c, { type: "place", kind: "path", id: legal.path[0] });
  } else {
    await step(c, { type: "pass" });
  }
}
console.log("20 rolls match the host:", table.join(" "));
handsAreCounts("after 20 rolls");

// Error messages a client can see (#256).
{
  // The started table: a late sitter, and a seat that is not up.
  const late = client("Late", "#7a5c9e");
  await late.open;
  late.send({ type: "hello", code, name: "Late", color: late.color });
  expectError(await late.next("error"), "Game already started.", "hello after the start");

  // A lobby: only the host starts, and 3 or 4 sit.
  const lobby = [client("Host", "#c45c3e"), client("Two", "#2a8f8a"), client("Three", "#3d6b4f"), client("Four", "#7a5c9e"), client("Five", "#b8860b")];
  await Promise.all(lobby.map((c) => c.open));
  const [h, two, three, four, five] = lobby;
  h.send({ type: "hello", name: "Host", color: h.color });
  const room = (await h.next("welcome")).code;
  two.send({ type: "hello", code: room, name: "Two", color: two.color });
  await two.next("welcome");
  two.send({ type: "start" });
  expectError(await two.next("error"), "Only the host can start.", "start by a guest");
  h.send({ type: "start" });
  expectError(await h.next("error"), "Need 3 or 4 at the table.", "start with two");
  for (const c of [three, four]) {
    c.send({ type: "hello", code: room, name: c.name, color: c.color });
    await c.next("welcome");
  }
  five.send({ type: "hello", code: room, name: "Five", color: five.color });
  expectError(await five.next("error"), "Table full.", "fifth seat");
}

host.kill();
console.log("table prove ok");
process.exit(0);
