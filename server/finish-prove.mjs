// #319: three src/lib/net/table.ts clients play a hosted game to the win. Each seat runs the practice bot on its
// own view, so what the host does only at the end gets exercised over sockets: the whole game goes out once it is
// over (viewFor's reveal), the host refuses every action after the win, and the winner line reaches every seat.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { totalVP } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";
import { connectTable } from "../src/lib/net/table.ts";

const GAMES = 2;
const MAX_ACTIONS = 5000;
const STEP_MS = 5000;
const DEV_KINDS = ["knight", "road", "plenty", "monopoly", "vp"];
const VP_CARDS = 5;

let host;
function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  host?.kill();
  process.exit(1);
}
// The whole proof, both games, must end well inside npm test's patience.
setTimeout(() => fail("the proof ran past 120 s"), 120_000);

// Rooms go to a temp folder, dropped on exit, so the real host never restores this proof's tables (#207).
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0", ACT_RATE: "1000", ACT_CAP: "1000", ROOMS_DIR },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const port = await new Promise((resolve) => host.stdout.on("data", (d) => {
  const m = String(d).match(/listening (\d+)/);
  if (m) resolve(Number(m[1]));
}));
const url = `ws://127.0.0.1:${port}`;

// Waits are woken by messages, not by a fixed sleep: a few hundred actions at 30 ms a poll would be the slow part.
const waiters = new Set();
function wake() {
  for (const w of waiters) {
    if (!w.cond()) continue;
    waiters.delete(w);
    clearTimeout(w.timer);
    w.resolve();
  }
}
function until(cond, what, ms = STEP_MS) {
  if (cond()) return Promise.resolve();
  return new Promise((resolve) => {
    const w = { cond, resolve, timer: setTimeout(() => fail(`timed out: ${what}`), ms) };
    waiters.add(w);
  });
}

function player(name) {
  const p = { name, state: null, prev: null, legal: null, code: null, you: null, errors: [], logs: [], chats: [], leaks: [], overPushes: 0 };
  const on = (fn) => (m) => {
    fn(m);
    wake();
  };
  p.t = connectTable(url, {
    welcome: on((m) => (p.code = m.code)),
    seats: on((m) => (p.seats = m.seats)),
    state: on((m) => {
      const g = m.game;
      if (p.state?.phase === "over") p.overPushes++;
      if (g.phase !== "over") {
        // Before the end: no seed or rng (#111), and no other seat's hand (#186).
        if ("seed" in g || "rng" in g) p.leaks.push({ seq: g.seq, what: "seed/rng" });
        for (const q of g.players) if (q.id !== m.you && "resources" in q) p.leaks.push({ seq: g.seq, what: `${q.id} resources` });
      }
      p.prev = p.state;
      p.state = g;
      p.legal = m.legal;
      p.you = m.you;
    }),
    log: on((text) => p.logs.push(text)),
    chat: on((line) => p.chats.push(line)),
    error: on((e) => p.errors.push(e)),
  }, WebSocket);
  return p;
}

async function sitDown() {
  const [a, b, c] = [player("Ember"), player("Tide"), player("Pine")];
  a.t.open({ name: "Ember" });
  await until(() => a.code, "welcome");
  b.t.join(a.code, { name: "Tide" });
  c.t.join(a.code, { name: "Pine" });
  await until(() => b.code && c.code, "joins");
  for (const p of [a, b, c]) p.t.ready(true);
  await until(() => a.seats?.length === 3 && a.seats.every((s) => s.ready), "all ready");
  a.t.start();
  await until(() => a.state && b.state && c.state, "start");
  return [a, b, c];
}

// Sends one action for `p` and waits for the host's answer: a new state at every seat, or an error at this one.
async function act(all, p, action) {
  const seq = p.state.seq;
  const errs = p.errors.length;
  p.t.act(action);
  await until(() => all.every((x) => x.state.seq > seq) || p.errors.length > errs, `${action.type} by ${p.you} at seq ${seq}`);
  return p.errors.length > errs ? p.errors[p.errors.length - 1] : null;
}

async function playToTheEnd(all, n) {
  let actions = 0;
  for (; actions < MAX_ACTIONS && all[0].state.phase !== "over"; actions++) {
    const g = all[0].state;
    const p = g.phase === "discard" ? all.find((x) => x.legal.discard > 0) : all.find((x) => x.state.current === x.you);
    if (!p) fail(`game ${n}: nobody to act at seq ${g.seq}`, { phase: g.phase, current: g.current });
    // The view hides the deck order (#111) and the bot only reads its size, so hand it a deck of the right length.
    const view = { ...p.state, deck: Array.from({ length: p.state.deckLeft }) };
    const action = chooseBotAction(view, p.you) ?? { type: "endTurn" };
    const err = await act(all, p, action);
    if (err) {
      // The way runBots falls back (host.mjs): a refused move becomes a pass. A refused pass is a real stall.
      const again = await act(all, p, { type: "endTurn" });
      if (again) fail(`game ${n}: ${p.you} ${JSON.stringify(action)} refused (${err}) and so was the pass`, again);
    }
  }
  if (all[0].state.phase !== "over") fail(`game ${n}: no winner after ${MAX_ACTIONS} actions`, { phase: all[0].state.phase, turn: all[0].state.turn });
  await until(() => all.every((x) => x.state.phase === "over"), `game ${n}: the end reaching every seat`);
  return actions;
}

function checkReveal(all, n) {
  const where = `game ${n}`;
  const final = all[0].state;
  const { winner } = final;
  if (!winner) fail(`${where}: over with no winner`);
  if (final.current !== winner) fail(`${where}: winner ${winner} is not the current player ${final.current}`);
  const vp = totalVP(final, winner);
  if (vp < 10) fail(`${where}: winner ${winner} has only ${vp} points`);
  const views = all.map((x) => JSON.stringify(x.state));
  if (new Set(views).size !== 1) fail(`${where}: the final state differs between seats`);
  for (const q of final.players) {
    if (RESOURCES.some((r) => typeof q.resources?.[r] !== "number")) fail(`${where}: ${q.id} has no full hand after the reveal`, q.resources);
    if (DEV_KINDS.some((k) => typeof q.hidden?.[k] !== "number")) fail(`${where}: ${q.id} has no full hidden record after the reveal`, q.hidden);
    if ("goods" in q || "fortunes" in q) fail(`${where}: ${q.id} still carries counts after the reveal`, { goods: q.goods, fortunes: q.fortunes });
  }
  if (!Array.isArray(final.deck) || final.deck.length !== final.deckLeft) fail(`${where}: the deck is not revealed`, { deck: final.deck, deckLeft: final.deckLeft });
  const vpOut = final.players.reduce((s, q) => s + q.hidden.vp, 0);
  const vpInDeck = final.deck.filter((c) => c === "vp").length;
  if (vpOut + vpInDeck !== VP_CARDS) fail(`${where}: ${vpOut} VP cards held and ${vpInDeck} in the deck, not ${VP_CARDS}`);
  for (const p of all) {
    // Each seat saw its own hidden cards all along; the reveal must agree with that, and with the hand before the win.
    const mine = p.prev.players.find((q) => q.id === p.you);
    const now = final.players.find((q) => q.id === p.you);
    if (p.you === winner) {
      if (now.hidden.vp < mine.hidden.vp) fail(`${where}: ${p.you}'s VP cards went down on the winning move`, { before: mine.hidden, after: now.hidden });
      if (totalVP(p.prev, p.you) >= 10 && p.prev.current === p.you) fail(`${where}: ${p.you} had ${totalVP(p.prev, p.you)} points before the winning move`);
    } else {
      if (JSON.stringify(now.hidden) !== JSON.stringify(mine.hidden)) fail(`${where}: ${p.you}'s hidden cards changed on another seat's move`, { before: mine.hidden, after: now.hidden });
      if (totalVP(p.prev, p.you) >= 10) fail(`${where}: ${p.you} sat at ${totalVP(p.prev, p.you)} points without winning`);
    }
    if (p.legal.actions.length || p.legal.discard) fail(`${where}: ${p.you} still has legal moves after the win`, p.legal);
    const last = p.logs[p.logs.length - 1];
    if (!/claims the isle with \d+ points\.$/.test(last ?? "")) fail(`${where}: ${p.you}'s last log line is not the win`, { tail: p.logs.slice(-6), gameLog: final.log.slice(-4), phase: final.phase, seq: final.seq });
  }
  const leaks = all.flatMap((x) => x.leaks.map((l) => ({ you: x.you, ...l })));
  if (leaks.length) fail(`${where}: a state before the end leaked`, leaks.slice(0, 5));
  return { name: final.players.find((q) => q.id === winner).name, vp };
}

async function checkRefused(all, n) {
  const where = `game ${n}`;
  const seq = all[0].state.seq;
  for (const p of all) {
    const errs = p.errors.length;
    p.t.act({ type: "roll" });
    p.t.act({ type: "endTurn" });
    p.t.act({ type: "buyCard" });
    p.t.ask({ wool: 1 }, { ore: 1 });
    await until(() => p.errors.length >= errs + 4, `${where}: four refusals for ${p.you}`);
    const got = p.errors.slice(errs);
    if (got.length !== 4) fail(`${where}: ${p.you} got ${got.length} errors after the win, not 4`, got);
    if (got.slice(0, 3).some((e) => e !== "The game is over." && e !== "Not your turn.")) fail(`${where}: ${p.you}'s refusals`, got);
    if (got[3] !== "Cannot trade now.") fail(`${where}: ${p.you}'s trade after the win`, got[3]);
  }
  const chats = all.map((x) => x.chats.length);
  for (const p of all) p.t.say(`gg from ${p.name}`);
  await until(() => all.every((x, i) => x.chats.length >= chats[i] + 3), `${where}: chat reaching every seat after the win`);
  for (const [i, p] of all.entries()) {
    const texts = p.chats.slice(chats[i]).map((c) => c.text).sort();
    const want = all.map((x) => `gg from ${x.name}`).sort();
    if (JSON.stringify(texts) !== JSON.stringify(want)) fail(`${where}: ${p.you}'s chat after the win`, texts);
  }
  for (const p of all) {
    if (p.state.seq !== seq || p.overPushes) fail(`${where}: the state moved after the win at ${p.you}`, { seq: p.state.seq, was: seq, pushes: p.overPushes });
  }
}

const started = Date.now();
for (let n = 1; n <= GAMES; n++) {
  const all = await sitDown();
  const actions = await playToTheEnd(all, n);
  const { name, vp } = checkReveal(all, n);
  await checkRefused(all, n);
  console.log(`game ${n}: ${name} wins with ${vp} in ${actions} actions, reveal ok, post-win refused`);
  for (const p of all) p.t.close();
}
console.log(`${GAMES} hosted games to the win in ${Date.now() - started} ms`);
host.kill();
console.log("finish prove ok");
process.exit(0);
