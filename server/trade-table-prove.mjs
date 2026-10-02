// Three sockets prove the ask-the-table trade (tradeAsk / tradeAnswer) against host.mjs (#217):
// a "No" is shown to the whole table, a "Yes" moves goods, and a pass closes the offer.
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
  const c = { name, color, ws, inbox: [], waiters: [], state: null };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") c.state = msg;
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
  c.has = (type) => c.inbox.some((m) => m.type === type);
  c.open = new Promise((res) => ws.on("open", res));
  return c;
}

const all = [client("Ember", "#c45c3e"), client("Tide", "#2a8f8a"), client("Pine", "#3d6b4f")];
await Promise.all(all.map((c) => c.open));
all[0].send({ type: "hello", name: "Ember", color: all[0].color });
const { code } = await all[0].next("welcome");
for (const c of all.slice(1)) {
  c.send({ type: "hello", code, name: c.name, color: c.color });
  await c.next("welcome");
}
for (const c of all) c.send({ type: "ready", value: true });
await new Promise((r) => setTimeout(r, 100));
all[0].send({ type: "start" });
await Promise.all(all.map((c) => c.next("state")));

const whoActs = () => all.find((c) => c.state.legal.outpost.length || c.state.legal.path.length || c.state.legal.wayfarer.length || c.state.legal.actions.length || c.state.legal.discard > 0);

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

const me = (c) => c.state.game.players.find((p) => p.id === c.state.you);
const RES = ["timber", "clay", "wool", "grain", "ore"];
let pair = null;

// Play setup, then turns, until the player to move in `main` holds a card another seat can match.
for (let guard = 0; guard < 400 && !pair; guard++) {
  const c = whoActs();
  const { legal, game } = c.state;
  if (game.phase === "setupSettle") await step(c, { type: "place", kind: "outpost", id: legal.outpost[0] });
  else if (game.phase === "setupRoad") await step(c, { type: "place", kind: "path", id: legal.path[0] });
  else if (game.phase === "roll") await step(c, { type: "roll" });
  else if (legal.discard > 0) {
    let left = legal.discard;
    const cards = {};
    for (const [r, n] of Object.entries(me(c).resources)) {
      const k = Math.min(n, left);
      if (k) cards[r] = k;
      left -= k;
    }
    await step(c, { type: "discard", cards });
  } else if (game.phase === "robber") {
    const hexId = legal.wayfarer.find((h) => !legal.steal[h]) ?? legal.wayfarer[0];
    await step(c, { type: "rob", hexId, stealFrom: legal.steal[hexId]?.[0] ?? null });
  } else if (game.phase === "main") {
    const mine = me(c).resources;
    const others = all.filter((o) => o !== c);
    for (const give of RES.filter((r) => mine[r] >= 1)) {
      for (const taker of others) {
        const want = RES.find((r) => r !== give && me(taker).resources[r] >= 1);
        if (want) pair ??= { asker: c, taker, bystander: others.find((o) => o !== taker), give, want };
      }
    }
    if (!pair) await step(c, { type: "pass" });
  } else await step(c, { type: "pass" });
}
if (!pair) fail("never reached a main turn with a tradeable pair");
const { asker, taker, bystander, give, want } = pair;
const A = asker, B = bystander, C = taker;
console.log(`asker ${A.name} gives ${give}, wants ${want}; ${B.name} declines, ${C.name} accepts`);

const hand = (c) => ({ ...me(c).resources });
const goods = (c, of) => {
  const p = c.state.game.players.find((x) => x.id === of.state.you);
  return p.goods ?? RES.reduce((n, r) => n + p.resources[r], 0);
};
const settle = () => new Promise((r) => setTimeout(r, 150));
async function fresh() {
  await settle();
  for (const c of all) while (c.inbox.length) c.inbox.pop();
}
// After the swap in step 2 the asker holds one `want` for sure, so later asks give that.
const offer = async (g = give, w = want) => {
  A.send({ type: "tradeAsk", give: { [g]: 1 }, want: { [w]: 1 } });
  const o = await Promise.all(all.map((c) => c.next("tradeOffer")));
  return o[0].tradeId;
};

// 1. B says no: the whole table hears it, the offer stays open for C.
await fresh();
let tradeId = await offer();
B.send({ type: "tradeAnswer", tradeId, yes: false });
for (const c of all) {
  const d = await c.next("tradeDeclined");
  if (d.tradeId !== tradeId || d.by !== B.state.you || d.name !== B.name) fail(`${c.name} decline payload`, d);
}
await settle();
for (const c of all) if (c.has("tradeClosed")) fail(`${c.name} saw tradeClosed while C could still answer`);

// 2. C says yes: both hands change in every seat's next state.
const [a0, c0] = [hand(A), hand(C)];
const [aGoods, cGoods] = [goods(B, A), goods(B, C)];
C.send({ type: "tradeAnswer", tradeId, yes: true });
for (const c of all) {
  const closed = await c.next("tradeClosed");
  if (closed.taker !== C.state.you) fail(`${c.name} tradeClosed taker`, closed);
  await c.next("state");
}
const a1 = hand(A), c1 = hand(C);
if (a1[give] !== a0[give] - 1 || a1[want] !== a0[want] + 1) fail("asker hand", [a0, a1]);
if (c1[give] !== c0[give] + 1 || c1[want] !== c0[want] - 1) fail("taker hand", [c0, c1]);
const total = (h) => RES.reduce((n, r) => n + h[r], 0);
for (const c of all) {
  for (const p of c.state.game.players) {
    if (p.id === c.state.you) continue;
    if ("resources" in p) fail(`${c.name} sees ${p.name}'s hand`);
  }
  if (goods(c, A) !== total(a1) || goods(c, C) !== total(c1)) fail(`${c.name} goods counts`, [goods(c, A), goods(c, C)]);
}
if (goods(B, A) !== aGoods || goods(B, C) !== cGoods) fail("a 1-for-1 swap changed a hand size");
console.log("decline reached all three seats; yes swapped both hands in every seat's next state");

// 3. A bad ask is refused to the asker alone; nobody is offered anything.
await fresh();
const bad = [
  [{ [want]: me(A).resources[want] + 1 }, { [give]: 1 }, "You lack those goods."],
  [{}, {}, "Offer something."],
  [[1], { [give]: 1 }, "Bad trade."],
  [{ [want]: 1 }, { gold: 1 }, "Bad trade."],
];
for (const [g, w, message] of bad) {
  A.send({ type: "tradeAsk", give: g, want: w });
  const e = await A.next("error");
  if (e.message !== message) fail(`ask ${JSON.stringify([g, w])} error`, e.message);
}
await settle();
for (const c of all) if (c.has("tradeOffer")) fail(`${c.name} was offered a bad trade`);
console.log("bad asks refused to the asker alone: lack, empty, array bag, unknown resource");

// 4. A second ask replaces the first: every seat hears tradeClosed for the first id before the new tradeOffer.
await fresh();
tradeId = await offer(want, give);
await fresh();
A.send({ type: "tradeAsk", give: { [want]: 1 }, want: { [give]: 1 } });
for (const c of all) {
  await settle();
  const types = c.inbox.filter((m) => m.type === "tradeClosed" || m.type === "tradeOffer").map((m) => m.type);
  if (types.join() !== "tradeClosed,tradeOffer") fail(`${c.name} replace order`, types);
  if (c.inbox.find((m) => m.type === "tradeClosed").tradeId !== tradeId) fail(`${c.name} closed the wrong id`);
}
console.log("a replaced offer sent tradeClosed before the new tradeOffer to all three seats");

// 5. A asks again, then passes: everyone hears tradeClosed, and a late yes changes nothing.
await fresh();
tradeId = await offer(want, give);
// The ask replaced step 4's open offer, whose tradeClosed (same id) came first; only the pass's counts here.
for (const c of all) c.inbox = c.inbox.filter((m) => m.type !== "tradeClosed");
const seq = A.state.game.seq;
A.send({ type: "pass" });
for (const c of all) {
  const closed = await c.next("tradeClosed");
  if (closed.tradeId !== tradeId || closed.taker) fail(`${c.name} tradeClosed after pass`, closed);
}
await Promise.all(all.map((c) => c.next("state")));
const [bBefore, aBefore] = [hand(B), hand(A)];
const seqAfter = B.state.game.seq;
if (seqAfter === seq) fail("pass did not advance the game");
B.send({ type: "tradeAnswer", tradeId, yes: true });
const err = await B.next("error");
if (err.message !== "Offer is gone.") fail("late yes message", err.message);
await settle();
if (B.has("state") || A.has("state")) fail("late yes pushed a state");
if (JSON.stringify(hand(B)) !== JSON.stringify(bBefore) || JSON.stringify(hand(A)) !== JSON.stringify(aBefore) || B.state.game.seq !== seqAfter) {
  fail("late yes changed the table");
}
console.log("pass closed the offer for all three seats; late yes got:", err.message);

host.kill();
console.log("trade table prove ok");
process.exit(0);
