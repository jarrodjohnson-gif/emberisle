// #79: three src/lib/net/table.ts clients play setup through host.mjs using rules Actions and the host's legal lists.
// #92: all three sit on one hex, then a wayfarer move and a knight each rob the second of two targets the host lists.
// #111: no state pushed before the game ends carries the seed (it rebuilds the fortune deck) or rng (it predicts steals).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { stealTargets } from "../src/lib/game/rules.ts";
import { COST, RESOURCES } from "../src/lib/game/types.ts";
import { connectTable, toIntent } from "../src/lib/net/table.ts";

let host;
function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  host?.kill();
  process.exit(1);
}

if (toIntent({ type: "offerTrade", to: "p1", give: {}, want: {} }) !== null) fail("offerTrade should be host-run");
if (toIntent({ type: "bankTrade", give: "wool", want: "ore" }).take !== "ore") fail("bankTrade take");

// Rooms go to a temp folder, dropped on exit, so the real host never restores this proof's tables (#207).
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const port = await new Promise((resolve) => host.stdout.on("data", (d) => {
  const m = String(d).match(/listening (\d+)/);
  if (m) resolve(Number(m[1]));
}));
const url = `ws://127.0.0.1:${port}`;

function player(name) {
  const p = { name, state: null, legal: null, code: null, errors: [], pushes: 0, leaks: [] };
  p.t = connectTable(url, {
    welcome: (m) => (p.code = m.code),
    seats: (m) => (p.seats = m.seats),
    state: (m) => {
      p.pushes++;
      if (m.game.phase !== "over" && ("seed" in m.game || "rng" in m.game)) p.leaks.push({ seq: m.game.seq, phase: m.game.phase });
      p.state = m.game;
      p.legal = m.legal;
      p.you = m.you;
    },
    error: (e) => p.errors.push(e),
  }, WebSocket);
  return p;
}
const until = async (cond, what) => {
  for (let i = 0; i < 100; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  fail(`timed out: ${what}`);
};

const [a, b, c] = [player("Ember"), player("Tide"), player("Pine")];
a.t.open({ name: "Ember" }); // queued until the socket opens
await until(() => a.code, "welcome");
b.t.join(a.code.toLowerCase(), { name: "Tide" });
c.t.join(a.code, { name: "Pine" });
await until(() => b.code && c.code, "joins");
for (const p of [a, b, c]) p.t.ready(true);
// Start only once the host has every ready; a fixed pause raced a slow CI runner and the start was refused.
await until(() => a.seats?.length === 3 && a.seats.every((s) => s.ready), "all ready");
a.t.start();
await until(() => a.state && b.state && c.state, "start");

// Three corners of one hex, no two touching, so whoever later rolls a 7 or plays a knight has two opponents there.
const g0 = a.state;
const touching = (u, v) => g0.edges.some((e) => (e.va === u && e.vb === v) || (e.va === v && e.vb === u));
let shared = null;
let corners = [];
for (const h of g0.hexes.filter((x) => x.terrain !== "waste" && x.id !== g0.robberHex)) {
  corners = [];
  for (const v of g0.vertices.filter((x) => x.hexes.includes(h.id))) {
    if (corners.every((u) => !touching(u, v.id))) corners.push(v.id);
  }
  if (corners.length === 3) {
    shared = h.id;
    break;
  }
}
if (!shared) fail("no hex with three spread corners");

let settled = 0;
for (let step = 0; step < 12; step++) {
  const p = [a, b, c].find((x) => x.state.current === x.you);
  const seq = p.state.seq;
  if (p.state.phase === "setupSettle") {
    const vertexId = settled < 3 ? corners[settled] : p.legal.outpost[0];
    if (!p.legal.outpost.includes(vertexId)) fail("planned corner not legal", vertexId);
    settled++;
    p.t.act({ type: "setupSettle", vertexId });
  }
  else p.t.act({ type: "setupRoad", edgeId: p.legal.path[0] });
  await until(() => [a, b, c].every((x) => x.state.seq > seq), `step ${step}`);
}
const phases = [a, b, c].map((x) => x.state.phase);
const seqs = new Set([a, b, c].map((x) => x.state.seq));
if (phases.some((ph) => ph !== "roll") || seqs.size !== 1) fail("setup did not end together", { phases, seqs: [...seqs] });
const errs = [a, b, c].flatMap((x) => x.errors);
if (errs.length) fail("errors", errs);
console.log(`3 table.ts clients finished setup via the host: phase roll, seq ${[...seqs][0]}`);

// Play on through the host until a 7 and a knight each rob from a hex with two opponents.
const all = [a, b, c];
// Another seat's hand is a count only in this client's view (#186); its own hand is in full.
const cardsOf = (g, id) => {
  const p = g.players.find((x) => x.id === id);
  return p.goods ?? RESOURCES.reduce((n, r) => n + p.resources[r], 0);
};
async function act(p, action) {
  const seq = p.state.seq;
  p.t.act(action);
  await until(() => all.every((x) => x.state.seq > seq) || p.errors.length, `${action.type} by ${p.you}`);
  if (p.errors.length) fail(`${action.type} refused`, p.errors);
}
async function robSecond(p, type, hexId) {
  const targets = p.legal.steal[hexId];
  const [first, second] = targets;
  const was = { first: cardsOf(p.state, first), second: cardsOf(p.state, second), me: cardsOf(p.state, p.you) };
  await act(p, { type, hexId, stealFrom: second });
  const g = all.find((x) => x.you === second).state; // the robbed seat's copy of the host's pushed state
  const now = { first: cardsOf(g, first), second: cardsOf(g, second), me: cardsOf(g, p.you) };
  if (now.second !== was.second - 1 || now.first !== was.first || now.me !== was.me + 1) {
    fail(`${type} did not rob exactly one card from the second target`, { targets, was, now });
  }
  console.log(`${type} by ${p.you} on ${hexId}, targets ${targets.join(",")}: ${second} ${was.second} -> ${now.second}, ${first} stays ${now.first}`);
}
// Hexes (not under the wayfarer) where the engine says p could rob two or more players.
const twoTargetHexes = (p) =>
  p.state.hexes.filter((h) => h.id !== p.state.robberHex && stealTargets(p.state, h.id, p.you).length > 1).map((h) => h.id);

let robbed = false;
let knighted = false;
for (let turn = 0; turn < 5000 && !(robbed && knighted); turn++) {
  const discarder = all.find((x) => x.legal.discard > 0);
  if (discarder) {
    let left = discarder.legal.discard;
    const cards = {};
    for (const r of RESOURCES) {
      const k = Math.min(discarder.state.players.find((x) => x.id === discarder.you).resources[r], left);
      if (k) cards[r] = k;
      left -= k;
    }
    await act(discarder, { type: "discard", resources: cards });
    continue;
  }
  const p = all.find((x) => x.state.current === x.you);
  const { phase } = p.state;
  const me = p.state.players.find((x) => x.id === p.you);
  const give = RESOURCES.find((r) => me.resources[r] >= 4);
  const want = Object.keys(COST.card).find((r) => me.resources[r] < COST.card[r]);
  if (phase === "robber") {
    const two = p.legal.wayfarer.find((h) => (p.legal.steal[h] ?? []).length > 1);
    if (!robbed && two) {
      await robSecond(p, "moveRobber", two);
      robbed = true;
    } else {
      const hexId = p.legal.wayfarer.find((h) => h !== shared && !p.legal.steal[h]) ?? p.legal.wayfarer[0];
      await act(p, { type: "moveRobber", hexId, stealFrom: p.legal.steal[hexId]?.[0] ?? null });
    }
  } else if (phase === "roll") {
    await act(p, { type: "roll" });
  } else if (!knighted && p.legal.actions.includes("play:knight") && twoTargetHexes(p).length) {
    const hexId = twoTargetHexes(p).find((h) => (p.legal.steal[h] ?? []).length > 1);
    if (!hexId) fail("host listed no steal targets for a knight", { engine: twoTargetHexes(p), steal: p.legal.steal });
    await robSecond(p, "playKnight", hexId);
    knighted = true;
  } else if (!knighted && p.legal.actions.includes("buy")) {
    await act(p, { type: "buyCard" });
  } else if (!knighted && give && want && give !== want) {
    await act(p, { type: "bankTrade", give, want });
  } else {
    await act(p, { type: "endTurn" });
  }
}
if (!robbed || !knighted) fail("never reached both robberies", { robbed, knighted });
const leaks = all.flatMap((x) => x.leaks.map((l) => ({ you: x.you, ...l })));
if (leaks.length) fail("state pushed before the game ended carries seed or rng", leaks.slice(0, 5));
console.log(`${all.reduce((n, x) => n + x.pushes, 0)} pushed states before the end, none carry seed or rng`);
[a, b, c].forEach((p) => p.t.close());
host.kill();
console.log("net prove ok");
process.exit(0);
