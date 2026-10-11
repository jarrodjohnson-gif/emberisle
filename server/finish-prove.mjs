// #319: three src/lib/net/table.ts clients play a hosted game to the win. Each seat runs the practice bot on its
// own view, so what the host does only at the end gets exercised over sockets: the whole game goes out once it is
// over (viewFor's reveal), the host refuses every action after the win, and the winner line reaches every seat.
// #266: the second game is the first table's rematch (`again`), with a watcher who stays through it. The first game
// seats four; one closes at the win and the rematch lets it go, picture and all.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  host?.kill("SIGKILL");
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
process.on("exit", () => host.kill("SIGKILL"));
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
    welcome: on((m) => {
      p.code = m.code;
      p.secret = m.secret;
    }),
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

// Each seat uploads a picture with its own secret (#369), so a seat let go by the rematch can be checked for a leak.
const jpeg = (size) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(size - 3)]);
const http = (p, init) => fetch(`http://127.0.0.1:${port}${p}`, init);

async function sitDown() {
  const all = ["Ember", "Tide", "Pine", "Dune"].map(player);
  const [a, ...rest] = all;
  a.t.open({ name: a.name });
  await until(() => a.code, "welcome");
  for (const p of rest) p.t.join(a.code, { name: p.name });
  await until(() => rest.every((p) => p.code), "joins");
  for (const p of all) {
    const r = await http("/avatars", { method: "POST", headers: { "x-seat-secret": p.secret }, body: jpeg(600) });
    if (r.status !== 200) fail(`${p.name}'s picture upload`, r.status);
    p.pic = (await r.json()).url;
  }
  for (const p of all) p.t.ready(true);
  await until(() => a.seats?.length === 4 && a.seats.every((s) => s.ready), "all ready");
  a.t.start();
  await until(() => all.every((p) => p.state), "start");
  return all;
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
    } else if (JSON.stringify(now.hidden) !== JSON.stringify(mine.hidden)) {
      fail(`${where}: ${p.you}'s hidden cards changed on another seat's move`, { before: mine.hidden, after: now.hidden });
    }
    // The rules check for a win after every point-changing move of the current player and as each turn starts, so
    // whoever held the turn before the last push was below 10. A seat that is not current may sit at 10 (a longest
    // path handed over by a cut) until its own turn starts, so only the current seat is checked.
    if (p.prev.current === p.you && totalVP(p.prev, p.you) >= 10) fail(`${where}: ${p.you} held the turn at ${totalVP(p.prev, p.you)} points without winning`);
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
  await until(() => all.every((x, i) => x.chats.length >= chats[i] + all.length), `${where}: chat reaching every seat after the win`);
  for (const [i, p] of all.entries()) {
    const texts = p.chats.slice(chats[i]).map((c) => c.text).sort();
    const want = all.map((x) => `gg from ${x.name}`).sort();
    if (JSON.stringify(texts) !== JSON.stringify(want)) fail(`${where}: ${p.you}'s chat after the win`, texts);
  }
  for (const p of all) {
    if (p.state.seq !== seq || p.overPushes) fail(`${where}: the state moved after the win at ${p.you}`, { seq: p.state.seq, was: seq, pushes: p.overPushes });
  }
}

// A raw socket that watches the table (#347). It never sits down.
function watcher(code) {
  const w = { state: null, states: 0, errors: [], logs: [], watching: null, ws: new WebSocket(url) };
  w.ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") {
      w.state = m.game;
      w.states++;
    }
    if (m.type === "error") w.errors.push(m.message);
    if (m.type === "log") w.logs.push(m.text);
    if (m.type === "seats") w.watching = m.watching;
    wake();
  });
  w.ws.on("open", () => w.ws.send(JSON.stringify({ type: "hello", code, watch: true })));
  return w;
}

// Sends `again` from `p` and returns the one error it draws; the table's state must not move.
async function againRefused(all, p, what) {
  const seq = all.map((x) => x.state.seq);
  const errs = p.errors.length;
  p.t.again();
  await until(() => p.errors.length > errs, `${what}: an answer to again`);
  if (all.some((x, i) => x.state.seq !== seq[i] || x.state.phase !== all[i].state.phase)) fail(`${what}: the state moved`);
  return p.errors[errs];
}

// #266: the host's `again` deals a new island at the same table. The last winner is p0 and places first; the others
// roll off for the rest of the order (Jarrod, 2026-10-03). A watcher keeps watching.
async function rematch(all, w, gone) {
  const [hostSeat, guest] = all;
  const final = all[0].state;
  const winnerName = final.players.find((q) => q.id === final.winner).name;
  const seatIds = hostSeat.seats.filter((s) => s.name !== gone.name).map((s) => s.id).join();
  const colors = Object.fromEntries(hostSeat.seats.map((s) => [s.name, s.color]));
  const code = hostSeat.code;
  const refused = await againRefused(all, guest, "guest again");
  if (refused !== "Only the host can start.") fail("a guest's again", refused);
  const logs = all.map((x) => x.logs.length);
  const watcherStates = w.states;
  hostSeat.t.again();
  await until(() => all.every((x) => x.state.phase !== "over") && w.states > watcherStates, "the rematch reaching every seat and the watcher");
  for (const [i, p] of all.entries()) {
    const g = p.state;
    const me = g.players.find((q) => q.id === p.you);
    const ok =
      g.phase === "rollOff" && g.winner === null && g.seq === 0 && g.players.length === 3 &&
      g.players[0].id === "p0" && g.players[0].name === winnerName && g.rollOff.first === "p0" &&
      g.rollOff.pending.join() === "p1,p2" && g.current === "p1" && me?.name === p.name && (p.name === winnerName) === (p.you === "p0") &&
      g.players.every((q) => q.color === colors[q.name]) && !("seed" in g) && !("rng" in g) &&
      p.code === code && p.seats.map((s) => s.id).join() === seatIds;
    if (!ok) fail(`rematch at ${p.name}`, { you: p.you, phase: g.phase, seq: g.seq, players: g.players.map((q) => [q.id, q.name, q.color]), rollOff: g.rollOff, current: g.current });
    const said = p.logs.slice(logs[i]);
    if (!said.includes(`${winnerName} won last time and places first. The rest roll for their order.`)) fail(`rematch line at ${p.name}`, said);
    if (p.legal.actions.includes("roll") !== (p.you === g.current)) fail(`roll-off legal at ${p.name}`, p.legal);
    p.overPushes = 0;
  }
  // The seat with no socket is let go, and its picture with it (#369); a kept seat's picture stays.
  const goneStatus = (await http(gone.pic)).status;
  const keptStatus = (await http(hostSeat.pic)).status;
  if (goneStatus !== 404 || keptStatus !== 200) fail("pictures after the rematch", { gone: goneStatus, kept: keptStatus });
  await new Promise((r) => setTimeout(r, 500)); // saves are debounced (SAVE_MS, G5)
  const saved = JSON.parse(readFileSync(path.join(ROOMS_DIR, `${code}.json`), "utf8")).game;
  if (saved.seed === final.seed || saved.phase !== "rollOff" || saved.players[0].name !== winnerName) fail("the rematch on disk", { seed: saved.seed, old: final.seed, phase: saved.phase });
  const wg = w.state;
  if (w.ws.readyState !== WebSocket.OPEN || wg.phase !== "rollOff" || wg.players[0].name !== winnerName || "seed" in wg || "rng" in wg || w.watching !== 1) {
    fail("the watcher after the rematch", { open: w.ws.readyState, phase: wg.phase, first: wg.players[0].name, watching: w.watching });
  }
  const wErrs = w.errors.length;
  w.ws.send(JSON.stringify({ type: "again" }));
  await until(() => w.errors.length > wErrs, "the watcher's again");
  if (w.errors[wErrs] !== "Watching only.") fail("a watcher's again", w.errors[wErrs]);
  const twice = await againRefused(all, hostSeat, "a second again");
  if (twice !== "Game is not over.") fail("a second again", twice);
  // The winner sits out the roll-off: it has no roll, and one sent anyway is refused.
  const winnerSeat = all.find((p) => p.you === "p0");
  if ((await act(all, winnerSeat, { type: "roll" })) !== "Not your turn.") fail("the winner rolled in the roll-off");
  while (all[0].state.phase === "rollOff") {
    const p = all.find((x) => x.you === x.state.current);
    const err = await act(all, p, { type: "roll" });
    if (err) fail(`roll-off roll by ${p.you}`, err);
  }
  await until(() => w.state.seq === all[0].state.seq, "the watcher seeing the roll-off end");
  const g = all[0].state;
  const rest = g.players.slice(1);
  const ordered = rest.every((q, i) => i === 0 || g.rollOff.rolls[rest[i - 1].id] >= g.rollOff.rolls[q.id]);
  if (g.phase !== "setupSettle" || g.current !== "p0" || g.players[0].name !== winnerName || !ordered || "p0" in g.rollOff.rolls) {
    fail("the winner places first, the rest by their roll", { phase: g.phase, current: g.current, players: g.players.map((q) => q.name), rolls: g.rollOff.rolls });
  }
  if (g.log.at(-1) !== `${winnerName} places first, then ${rest[0].name} and ${rest[1].name}.`) fail("the order line", g.log.at(-1));
  console.log(`rematch: same code ${code}, ${gone.name} (closed) let go and its picture 404, seats ${seatIds}, new seed, ${winnerName} is p0 and places first, then ${rest.map((q) => q.name).join(" and ")} by roll; guest, watcher and second again refused; the watcher stayed`);
}

// #266: fewer than 3 seats with a socket is refused, and nothing changes.
async function shortTable(all) {
  const [hostSeat, , gone] = all;
  gone.t.close();
  await until(() => hostSeat.seats.find((s) => s.name === gone.name)?.away, "the closed seat held");
  const left = all.filter((p) => p !== gone);
  const refused = await againRefused(left, hostSeat, "again with two at the table");
  if (refused !== "Need 3 or 4 at the table.") fail("again with two at the table", refused);
  await new Promise((r) => setTimeout(r, 500)); // saves are debounced (SAVE_MS, G5)
  const saved = JSON.parse(readFileSync(path.join(ROOMS_DIR, `${hostSeat.code}.json`), "utf8"));
  if (saved.game.phase !== "over" || saved.seats.length !== 3) fail("the short table on disk", { phase: saved.game.phase, seats: saved.seats.length });
  console.log("rematch: two at the table is refused, the finished game and all three seats kept");
}

const started = Date.now();
let all = await sitDown();
const early = await againRefused(all, all[0], "again before the end");
if (early !== "Game is not over.") fail("again before the end", early);
const w = watcher(all[0].code);
await until(() => w.state, "the watcher's first state");
for (let n = 1; n <= GAMES; n++) {
  if (n > 1) {
    // A seat that is neither the host nor the winner closes at the win; the other three play the rematch.
    const gone = all.find((p, i) => i > 0 && p.you !== all[0].state.winner);
    gone.t.close();
    await until(() => all[0].seats.find((s) => s.name === gone.name)?.away, `${gone.name} held`);
    all = all.filter((p) => p !== gone);
    await rematch(all, w, gone);
  }
  const actions = await playToTheEnd(all, n);
  const { name, vp } = checkReveal(all, n);
  await checkRefused(all, n);
  console.log(`game ${n}: ${name} wins with ${vp} in ${actions} actions, reveal ok, post-win refused`);
}
await shortTable(all);
for (const p of all) p.t.close();
w.ws.close();
console.log(`${GAMES} hosted games to the win in ${Date.now() - started} ms`);
host.kill("SIGKILL");
console.log("finish prove ok");
process.exit(0);
