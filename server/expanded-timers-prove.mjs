// #1612: turn timers follow the real actor (docs/design/six-players.md, "Lobby and network limits", last paragraph; "Save,
// restart, and rejoin compatibility"). One real host with TURN_MS=3000 and TURN_TOTAL_MS=4500, killed -9 and restarted
// on the same room folder, its dice queued from a file. Five and six real sockets per expanded room, and a classic room
// beside them for comparison:
// 1. The window is on the partner during a partner activation and on the primary otherwise; the primary's window and
//    budget are cleared the moment the partner starts, and the partner gets a full window of its own.
// 2. A partner timeout in the action phase passes to the next primary; a primary timeout rolls, then passes, as classic.
// 3. A seven: every seat that owes a discard is waited on with its own window; one discarding never moves another's
//    deadline; the actor gets no build choices meanwhile; a timeout halves the hand as classic.
// 4. A reconnect mid partner activation keeps the remaining time and the budget; a kill -9 restart mid partner activation
//    and mid discard keeps every remaining deadline.
// 5. Each activation is its own turn: an extension granted on a seat's partner activation is not spent on its primary
//    activation in the same round, a seat's budget restarts even when bots played every activation in between, and a bot
//    that was a partner earlier in the round still asks the table on its own turn.
// 6. The classic three-seat room times out, rolls, passes, reconnects and keys its extensions exactly as before.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { createExpandedGame, pairedTradeAsk } from "../src/lib/game/expanded.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";

const SERVER = fileURLToPath(new URL(".", import.meta.url));
const TURN = 3000;
const TOTAL = 4500;
const EXTRA = 3000;
const TOL = 500;
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-xtimers-"));
const DICE = path.join(dir, "dice.txt");
const sockets = [];
let host = null;
process.on("exit", () => {
  host?.proc.kill("SIGKILL");
  for (const c of sockets) c.ws.terminate();
  rmSync(dir, { recursive: true, force: true });
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const ok = (cond, msg, detail) => {
  assert.ok(cond, detail === undefined ? msg : `${msg}: ${JSON.stringify(detail)}`);
  checks++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  checks++;
};
const near = (got, want, msg, tol = TOL) => ok(Math.abs(got - want) <= tol, `${msg} (got ${got}, want ${want} +/- ${tol})`);

// The host's dice: each die is the next queued face, else a 3 (a 6 rolled, never a seven).
writeFileSync(DICE, "");
writeFileSync(
  path.join(dir, "dice.mjs"),
  `import { readFileSync } from "node:fs";\nlet n = 0;\ncrypto.getRandomValues = (buf) => {\n  const faces = readFileSync(${JSON.stringify(DICE)}, "utf8").split(",").filter(Boolean).map(Number);\n  for (let i = 0; i < buf.length; i++) buf[i] = (n < faces.length ? faces[n++] : 3) - 1;\n  return buf;\n};\n`,
);
const queueDice = (...faces) => appendFileSync(DICE, `${faces.join(",")},`);

// The local rules roll through crypto.getRandomValues too: a fixed xorshift, so the built games are the same every run.
let xs = 1612;
crypto.getRandomValues = (buf) => {
  for (let i = 0; i < buf.length; i++) {
    xs ^= xs << 13; xs >>>= 0; xs ^= xs >>> 17; xs ^= xs << 5; xs >>>= 0;
    buf[i] = xs;
  }
  return buf;
};

function boot() {
  const proc = spawn(process.execPath, ["--import", path.join(dir, "dice.mjs"), "--import", "./register.mjs", "host.mjs"], {
    cwd: SERVER,
    env: { ...process.env, PORT: "0", ROOMS_DIR: dir, RESULTS_DIR: `${dir}/results`, PROFILES_DIR: `${dir}/profiles`, SAVE_MS: "20", ACT_CAP: "1000", ACT_RATE: "1000", GRACE_MS: "600000", HOLD_MS: "600000", TURN_MS: String(TURN), TURN_TOTAL_MS: String(TOTAL), TURN_EXTENSION_MS: String(EXTRA), TURN_VOTE_MS: "5000", BOT_ANSWER_MS: "60000", PEOPLE_FIRST_MS: "60000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const h = { proc, out: "", err: "" };
  proc.stdout.on("data", (d) => (h.out += d));
  proc.stderr.on("data", (d) => (h.err += d));
  return new Promise((resolve, reject) => {
    proc.stdout.on("data", () => {
      const m = h.out.match(/listening (\d+)/);
      if (m && !h.port) resolve(Object.assign(h, { port: Number(m[1]) }));
    });
    proc.on("exit", (c) => reject(new Error(`host exited ${c}: ${h.err}`)));
  });
}

async function kill9() {
  const h = host;
  h.proc.removeAllListeners("exit");
  h.proc.kill("SIGKILL");
  await new Promise((r) => (h.proc.exitCode !== null || h.proc.signalCode ? r() : h.proc.once("exit", r)));
  for (const c of sockets) c.ws.terminate();
  host = null;
}

async function client(code, pid) {
  const ws = new WebSocket(`ws://127.0.0.1:${host.port}`);
  const c = { ws, pid, inbox: [], waiters: [], state: null, logs: [], states: [] };
  sockets.push(c);
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") {
      c.state = msg;
      c.states.push(msg);
    }
    if (msg.type === "log") c.logs.push(msg.text);
    c.inbox.push(msg);
  });
  c.send = (msg) => ws.send(JSON.stringify({ ...c.state?.actionStamp, cid: crypto.randomUUID(), ...msg }));
  c.until = async (cond, what, ms = 5000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = cond();
      if (v) return v;
      if (Date.now() > end) throw new Error(`${code} ${pid} waited for ${what}; last state ${JSON.stringify(c.state && { seq: c.state.game.seq, phase: c.state.game.phase, current: c.state.game.current, role: c.state.game.role, turnPlayer: c.state.turnPlayer })}; logs ${JSON.stringify(c.logs.slice(-4))}`);
      await sleep(10);
    }
  };
  await new Promise((res, rej) => {
    ws.once("open", res);
    ws.once("error", rej);
  });
  ws.send(JSON.stringify({ type: "hello", caps: ["expanded"], code, secret: `${code}-${pid}` }));
  await c.until(() => c.inbox.find((m) => m.type === "welcome"), "welcome");
  await c.until(() => c.state, "state");
  return c;
}

async function seatAll(code, pids) {
  const cs = {};
  for (const pid of pids) cs[pid] = await client(code, pid);
  return cs;
}

const roomFile = (code) => JSON.parse(readFileSync(path.join(dir, `${code}.json`), "utf8"));
const seatFile = (code, pid) => roomFile(code).seats.find((s) => s.pid === pid);
// The room file once the host has saved the game at `seq` or later and `pred` holds of it.
async function saved(code, pred = () => true, what = "saved room") {
  const end = Date.now() + 5000;
  for (;;) {
    try {
      const r = roomFile(code);
      if (pred(r)) return r;
    } catch {}
    if (Date.now() > end) throw new Error(`${code} never saved: ${what}`);
    await sleep(15);
  }
}
const left = (s) => s.turnDeadline - s.serverNow;
const newest = (cs) => Object.values(cs).reduce((a, c) => (!a || c.state.game.seq > a.state.game.seq ? c : a), null).state;
// Every socket at `seq` or later, and the state they share.
async function settled(cs, pred, what) {
  for (const c of Object.values(cs)) await c.until(() => pred(c.state), what, TOTAL + 3000);
  return newest(cs);
}

function act(g, pid, action) {
  const r = applyAction(g, pid, action);
  assert.equal(r.error, undefined, `${pid} ${action.type}: ${r.error}`);
  return r.state;
}
function setupBy(g) {
  for (let i = 0; g.phase === "rollOff" || g.phase.startsWith("setup"); i++) {
    assert(i < 200, "setup ends");
    g = act(g, g.current, chooseBotAction(g, g.current));
  }
  return g;
}
const empty = () => ({ timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 });
// Hands as given, the bank holding the rest of `bank` per good (0 for a bank that pays nobody).
function hands(g, given, bank) {
  for (const p of g.players) p.resources = { ...empty(), ...(given[p.id] ?? {}) };
  for (const r of RESOURCES) g.bank[r] = bank === 0 ? 0 : bank - g.players.reduce((n, p) => n + p.resources[r], 0);
}
function writeRoom(code, g, bots = []) {
  const seats = [...g.players].sort((x, y) => x.id.localeCompare(y.id)).map((p, i) => ({ id: `s${i}`, name: p.name.replace(/ \(bot\)$/, ""), color: p.color, ready: true, pid: p.id, secret: `${code}-${p.id}`, ...(bots.includes(p.id) ? { bot: true } : {}), turnDeadline: null, turnStartedAt: null }));
  for (const p of g.players) if (bots.includes(p.id)) Object.assign(p, { kind: "bot", name: `${p.name} (bot)` });
  writeFileSync(path.join(dir, `${code}.json`), JSON.stringify({ code, visibility: "private", host: "s0", next: seats.length, botDeclined: {}, recoveryPids: [], chat: [], chatSeq: 0, game: g, victoryTarget: 10, wayfarerMode: "on", ...(g.variant ? { variant: "expanded" } : {}), seats, roster: null, outcome: null, assisted: [], shape: 3, savedAt: Date.now() }));
}
const NAMES = ["Ember", "Tide", "Dune", "Pine", "Moss", "Flint"];
const expanded = (n, seed) => setupBy(createExpandedGame({ humans: NAMES.slice(0, n).map((name) => ({ name })), bots: 0, seed }));
// The game at `players[i]`'s primary action phase, rolled locally with a 6.
function primaryMain(g) {
  g = structuredClone(g);
  Object.assign(g, { phase: "main", dice: [3, 3] });
  return g;
}
const at = (g, i) => g.players[(i + g.players.length * 2) % g.players.length].id;
const total = (bag) => RESOURCES.reduce((n, x) => n + bag[x], 0);
function discardOf(hand, n) {
  const out = {};
  for (const r of RESOURCES) {
    const k = Math.min(n, hand[r]);
    if (k) out[r] = k;
    n -= k;
  }
  return out;
}
const nameOf = (g, pid) => g.players.find((p) => p.id === pid).name.replace(/ \(bot\)$/, "");
const tooLong = (g, pid) => `${nameOf(g, pid)} took too long; the table moved on.`;

// ---- Rooms, built before the host starts. ----
// XSIX: six people, players[0] primary in its action phase. players[3] (its partner) can trade with the bank; players 1,
// 2 and 5 hold hands over seven for the seven later on.
const six = primaryMain(expanded(6, 1612));
hands(six, { [at(six, 3)]: { timber: 4 }, [at(six, 1)]: { grain: 5, ore: 5 }, [at(six, 2)]: { wool: 5, timber: 4 }, [at(six, 5)]: { clay: 4, grain: 5 } }, 24);
writeRoom("XSIX", six);
// XFIV: five people, players[0] primary in its action phase.
const five = primaryMain(expanded(5, 1613));
hands(five, {}, 24);
writeRoom("XFIV", five);
// XBOT: one person, players[3], on its partner activation; four bots with nothing and a bank that pays nobody, so the bots
// roll and pass straight through two paired turns until the person is the primary.
const lone = primaryMain(expanded(5, 1614));
Object.assign(lone, { role: "partner", current: at(lone, 3), activation: lone.activation + 1 });
hands(lone, {}, 0);
writeRoom("XBOT", lone, [0, 1, 2, 4].map((i) => at(lone, i)));
// XASK: players[3] is a bot, partner of players[0]; everyone else is a person. As a partner the bot only passes; as the
// primary later in the same round it is one card short of a stronghold and asks the table.
const asks = primaryMain(expanded(5, 1615));
const asker = at(asks, 3);
hands(asks, { [asker]: { timber: 1, grain: 2, ore: 2 } }, 0);
writeRoom("XASK", asks, [asker]);
{
  const partner = { ...structuredClone(asks), role: "partner", current: asker };
  const primary = { ...structuredClone(asks), role: "primary", current: asker, primary: asker };
  eq(chooseBotAction(partner, asker), { type: "endTurn" }, "XASK: as a partner the bot passes");
  ok(pairedTradeAsk(primary, asker, undefined), "XASK: as the primary the bot asks the table");
}
// CTRI: a classic three-seat room, players[0] in its action phase, holding 4 timber for a bank trade.
let tri = createGame({ humans: NAMES.slice(0, 3).map((name) => ({ name })), bots: 0, seed: 1612 });
tri = primaryMain(setupBy(tri));
hands(tri, { [at(tri, 0)]: { timber: 4 } }, 19);
writeRoom("CTRI", tri);

const t0 = Date.now();
try {
  host = await boot();

  // ---- 6. Classic first: the behaviour every expanded check is compared against. ----
  {
    const g = tri;
    const [A, B, C] = [0, 1, 2].map((i) => at(g, i));
    const cs = await seatAll("CTRI", [A, B, C]);
    let s = newest(cs);
    eq(s.turnPlayer, A, "classic: the window is on the seat in its action phase");
    near(left(s), TURN, "classic: a full window");
    // A acts late in its window: the next window is capped by the budget, and a drop and rejoin keeps it.
    const started = (await saved("CTRI", (r) => r.seats.find((x) => x.pid === A).turnStartedAt)).seats.find((x) => x.pid === A).turnStartedAt;
    await sleep(Math.max(0, started + 0.6 * TURN - Date.now()));
    cs[A].send({ type: "tradeBank", give: "timber", take: "ore" });
    s = await settled(cs, (x) => x.game.seq > g.seq, "classic bank trade");
    near(s.turnDeadline, started + TOTAL, "classic: after an action the window is capped by the budget");
    const before = s.turnDeadline;
    cs[A].ws.terminate();
    await cs[B].until(() => cs[B].logs.includes(`${nameOf(g, A)} lost connection.`), "classic: the seat drops");
    eq((await saved("CTRI", (r) => r.seats.find((x) => x.pid === A).turnDeadline === null, "classic: the dropped seat is disarmed")).seats.find((x) => x.pid === A).turnStartedAt, started, "classic: a dropped seat keeps its budget's start");
    cs[A] = await client("CTRI", A);
    s = cs[A].state;
    near(s.turnDeadline, before, "classic: a rejoin keeps the deadline when the budget binds");
    eq(seatFile("CTRI", A).turnStartedAt, started, "classic: a rejoin keeps the budget's start");
    // A idles: the timer passes.
    s = await settled(cs, (x) => x.game.current === B, "classic: A times out");
    near(Date.now(), before, "classic: the timeout lands on the deadline");
    ok(cs[B].logs.includes(tooLong(g, A)), "classic: the table hears the timeout");
    eq([s.game.phase, s.turnPlayer], ["roll", B], "classic: the next seat rolls next and its window runs");
    near(left(s), TURN, "classic: the next seat gets a full window");
    const bStart = s.turnDeadline - TURN;
    await saved("CTRI", (r) => r.game.current === B && r.seats.find((x) => x.pid === A).turnStartedAt === null, "classic: the passed seat's budget is cleared");
    // B idles twice: the timer rolls, then passes.
    s = await settled(cs, (x) => x.game.phase === "main" && x.game.current === B, "classic: B's roll times out");
    near(s.turnDeadline, bStart + TOTAL, "classic: after the timer's roll the seat's window is what its budget has left");
    s = await settled(cs, (x) => x.game.current === C, "classic: B's action phase times out");
    eq(s.game.phase, "roll", "classic: a pass");
    const ext = `${s.game.turn}:${C}:play`;
    await saved("CTRI", (r) => r.game.current === C && r.seats.every((x) => x.extension?.key === ext), `classic: the extension key is "${ext}", with no activation`);
    checks++;
    for (const c of Object.values(cs)) c.ws.terminate();
    console.log(`classic: CTRI times out ${nameOf(g, A)} in the action phase (passes), rolls then passes for ${nameOf(g, B)}, windows ${TURN} ms, a rejoin keeps the capped deadline, extension key "${ext}"`);
  }

  // ---- 1 and 2 on five seats. ----
  {
    const g = five;
    const pids = g.players.map((p) => p.id);
    const [P, M, Q] = [at(g, 0), at(g, 3), at(g, 1)];
    const cs = await seatAll("XFIV", pids);
    let s = newest(cs);
    eq([s.game.role, s.turnPlayer], ["primary", P], "five: the window is on the primary");
    for (const c of Object.values(cs)) eq([c.state.turnPlayer, c.state.legal.actions.length > 0], [P, c.pid === P], `five: ${c.pid} sees the primary's window, and only the primary may act`);
    cs[P].send({ type: "pass" });
    s = await settled(cs, (x) => x.game.role === "partner", "five: the partner starts");
    eq([s.game.current, s.turnPlayer], [M, M], "five: the window follows the partner");
    near(left(s), TURN, "five: the partner gets a full window");
    const r = await saved("XFIV", (x) => x.game.role === "partner" && x.seats.find((y) => y.pid === M).turnDeadline);
    eq([r.seats.find((y) => y.pid === P).turnDeadline, r.seats.find((y) => y.pid === P).turnStartedAt], [null, null], "five: the primary's window and budget are cleared");
    eq(r.seats.filter((y) => y.turnDeadline).map((y) => y.pid), [M], "five: only the partner's window is armed");
    const deadline = s.turnDeadline;
    s = await settled(cs, (x) => x.game.role === "primary" && x.game.current === Q, "five: the partner times out");
    near(Date.now(), deadline, "five: the partner's timeout lands on its deadline");
    ok(cs[P].logs.includes(tooLong(g, M)), "five: the table hears the partner's timeout");
    eq([s.game.phase, s.turnPlayer], ["roll", Q], "five: a partner timeout passes to the next primary, whose window runs");
    near(left(s), TURN, "five: the next primary gets a full window");
    for (const c of Object.values(cs)) c.ws.terminate();
    console.log(`five: XFIV window on primary ${P}, then partner ${M} (primary cleared), partner timeout after ${TURN} ms passes to primary ${Q}`);
  }

  // ---- 5. A seat's budget restarts per activation, though bots played every activation in between. ----
  {
    const g = lone;
    const H = at(g, 3);
    const cs = await seatAll("XBOT", [H]);
    let s = cs[H].state;
    eq([s.game.role, s.game.current, s.turnPlayer], ["partner", H, H], "bots: the person's partner window runs");
    const started = (await saved("XBOT", (r) => r.seats.find((x) => x.pid === H).turnStartedAt)).seats.find((x) => x.pid === H).turnStartedAt;
    await sleep(Math.max(0, started + 0.8 * TURN - Date.now()));
    cs[H].send({ type: "pass" });
    s = await cs[H].until(() => cs[H].state.game.role === "primary" && cs[H].state.game.current === H && cs[H].state, "bots: four bot activations, then the person is primary");
    eq(s.game.activation, g.activation + 5, "bots: four bot activations ran in between");
    near(left(s), TURN, "bots: the person's primary activation gets a full window, not what its partner budget left");
    const f = await saved("XBOT", (r) => r.game.activation === g.activation + 5);
    ok(f.seats.find((x) => x.pid === H).turnStartedAt >= started + 0.8 * TURN, "bots: the budget restarted with the activation", f.seats.find((x) => x.pid === H).turnStartedAt - started);
    cs[H].ws.terminate();
    console.log(`bots: XBOT ${H} passed its partner activation ${Math.round(0.8 * TURN)} ms in; after 4 bot activations its primary window is ${left(s)} ms`);
  }

  // ---- 5. A bot that was a partner earlier in the round still asks on its own turn. ----
  {
    const g = asks;
    const people = g.players.map((p) => p.id).filter((pid) => pid !== asker);
    const cs = await seatAll("XASK", people);
    const P = at(g, 0);
    // P passes; the bot's partner activation passes; then P+1 and P+2 roll and pass, each with its partner passing.
    const step = async (pid, type) => {
      const seq = cs[pid].state.game.seq;
      cs[pid].send({ type });
      await settled(cs, (x) => x.game.seq > seq, `${pid} ${type}`);
    };
    await step(P, "pass");
    let s = newest(cs);
    eq([s.game.role, s.game.current, s.game.primary], ["primary", at(g, 1), at(g, 1)], "ask: the bot's partner activation passed");
    for (const i of [1, 2]) {
      await step(at(g, i), "roll");
      await step(at(g, i), "pass");
      await step(at(g, i + 3), "pass");
    }
    s = newest(cs);
    eq([s.game.turn, s.game.primary, s.game.role], [g.turn, asker, "primary"], "ask: the bot is the primary in the same round");
    const offer = await cs[P].until(() => cs[P].inbox.find((m) => m.type === "tradeOffer" && m.from === asker), "ask: the bot asks the table");
    eq([offer.give, offer.want], [{ timber: 1 }, { grain: 1 }], "ask: the bot's ask");
    for (const c of Object.values(cs)) c.ws.terminate();
    console.log(`ask: XASK bot ${asker} passed as ${P}'s partner, then asked the table on its own turn in round ${g.turn}`);
  }

  // ---- 1 to 5 on six seats, with a restart mid discard and mid partner activation. ----
  {
    const g = six;
    const pids = g.players.map((p) => p.id);
    const [P1, P2, M1] = [at(g, 0), at(g, 1), at(g, 3)];
    let cs = await seatAll("XSIX", pids);
    let s = newest(cs);
    eq([s.game.role, s.turnPlayer], ["primary", P1], "six: the window is on the primary");
    cs[P1].send({ type: "pass" });
    s = await settled(cs, (x) => x.game.role === "partner", "six: the partner starts");
    eq([s.game.current, s.turnPlayer], [M1, M1], "six: the window follows the partner");
    near(left(s), TURN, "six: the partner gets a full window");
    let r = await saved("XSIX", (x) => x.game.role === "partner" && x.seats.find((y) => y.pid === M1).turnStartedAt);
    eq([r.seats.find((y) => y.pid === P1).turnDeadline, r.seats.find((y) => y.pid === P1).turnStartedAt], [null, null], "six: the primary's window and budget are cleared");
    const started = r.seats.find((y) => y.pid === M1).turnStartedAt;
    // 4. The partner trades late in its window (so the budget caps its next one), drops, and rejoins.
    await sleep(Math.max(0, started + 0.6 * TURN - Date.now()));
    let seq = s.game.seq;
    cs[M1].send({ type: "tradeBank", give: "timber", take: "ore" });
    s = await settled(cs, (x) => x.game.seq > seq, "six: the partner's bank trade");
    eq(cs[M1].state.game.players.find((p) => p.id === M1).resources.ore, 1, "six: a partner may trade with the bank");
    near(s.turnDeadline, started + TOTAL, "six: after the partner's action its window is capped by the activation's budget");
    const before = s.turnDeadline;
    await sleep(Math.max(0, started + 0.75 * TURN - Date.now()));
    const remaining = before - Date.now();
    cs[M1].ws.terminate();
    await cs[P1].until(() => cs[P1].logs.includes(`${nameOf(g, M1)} lost connection.`), "six: the partner drops");
    await saved("XSIX", (x) => x.seats.find((y) => y.pid === M1).turnDeadline === null, "six: the dropped partner is disarmed");
    await sleep(200);
    cs[M1] = await client("XSIX", M1);
    s = cs[M1].state;
    eq([s.game.current, s.game.role, s.turnPlayer], [M1, "partner", M1], "six: back on its partner activation, the window is the partner's");
    near(s.turnDeadline, before, "six: a reconnect mid partner activation keeps the deadline");
    near(left(s), remaining - 200, "six: and so the remaining time");
    eq(seatFile("XSIX", M1).turnStartedAt, started, "six: a reconnect keeps the budget's start");
    // 2. The partner times out at the budget: a pass to the next primary.
    s = await settled(cs, (x) => x.game.role === "primary" && x.game.current === P2, "six: the partner times out");
    near(Date.now(), before, "six: the partner's timeout lands on its deadline");
    ok(cs[P1].logs.includes(tooLong(g, M1)), "six: the table hears the partner's timeout");
    eq([s.game.phase, s.turnPlayer], ["roll", P2], "six: the next primary rolls next");
    near(left(s), TURN, "six: the next primary gets a full window");
    const p2Start = s.turnDeadline - TURN;
    // A primary timeout as classic: a roll, a fresh window, then a pass to its partner.
    s = await settled(cs, (x) => x.game.phase === "main" && x.game.current === P2, "six: the primary's roll times out");
    ok(cs[P1].logs.includes(tooLong(g, P2)), "six: the table hears the primary's timeout");
    eq(s.game.dice, [3, 3], "six: the timer rolled");
    near(s.turnDeadline, p2Start + TOTAL, "six: after the timer's roll the primary's window is what its budget has left, as classic");
    const J = at(g, 4);
    s = await settled(cs, (x) => x.game.role === "partner" && x.game.current === J, "six: the primary's action phase times out");
    eq(s.turnPlayer, J, "six: a primary timeout in the action phase passes to its partner");
    // 5. J's partner activation gets more time by vote; J's primary activation later this round has its own.
    const vote = s.turnExtension;
    const plain = s.turnDeadline;
    eq([vote.target, vote.used], [J, false], "six: the extension targets the partner");
    cs[P1].send({ type: "turnExtensionAsk", target: J, key: vote.key });
    const ballot = await cs[P2].until(() => cs[P2].state.turnExtension?.vote, "six: a vote opens");
    for (const pid of pids) if (pid !== J && pid !== P1) cs[pid].send({ type: "turnExtensionAnswer", voteId: ballot.id, yes: true });
    s = await cs[J].until(() => cs[J].state.turnExtension?.result?.outcome === "passed" && cs[J].state, "six: the vote passes");
    near(s.turnDeadline, plain + EXTRA, "six: the partner's window grew by the extension", 50);
    cs[J].send({ type: "pass" });
    await settled(cs, (x) => x.game.role === "primary" && x.game.current === at(g, 2), "six: J passes");
    for (const i of [2, 3]) {
      const p = at(g, i);
      cs[p].send({ type: "roll" });
      await settled(cs, (x) => x.game.phase === "main" && x.game.current === p, `${p} rolls`);
      cs[p].send({ type: "pass" });
      await settled(cs, (x) => x.game.current === at(g, i + 3), `${p} passes`);
      cs[at(g, i + 3)].send({ type: "pass" });
      await settled(cs, (x) => x.game.current === at(g, i + 1), `${at(g, i + 3)} passes`);
    }
    s = newest(cs);
    eq([s.game.turn, s.game.primary, s.game.phase], [g.turn, J, "roll"], "six: J is the primary in the same round");
    eq([s.turnExtension.target, s.turnExtension.used, s.turnExtension.key === vote.key], [J, false, false], "six: J's primary activation has its own unspent extension");
    near(left(s), TURN, "six: J's primary activation gets a plain window");
    // 3. A seven while players 1, 2 and 5 hold more than seven cards.
    const over = [1, 2, 5].map((i) => at(g, i));
    const handOf = (pid) => cs[pid].state.game.players.find((p) => p.id === pid).resources;
    queueDice(3, 4);
    cs[J].send({ type: "roll" });
    s = await settled(cs, (x) => x.game.phase === "discard", "six: a seven");
    const owe = Object.keys(s.game.discardNeeded).sort();
    ok(over.every((pid) => owe.includes(pid)), "six: every seat over seven owes a discard", owe);
    for (const pid of pids) {
      const l = cs[pid].state.legal;
      if (owe.includes(pid)) eq([l.discard, l.actions, l.outpost, l.path, l.stronghold], [Math.floor(total(handOf(pid)) / 2), ["discard"], [], [], []], `six: ${pid} may only discard`);
      else eq([l.discard, l.actions, l.outpost, l.path, l.stronghold], [0, [], [], [], []], `six: ${pid} has nothing to do, no build choice`);
    }
    r = await saved("XSIX", (x) => x.game.phase === "discard" && owe.every((pid) => x.seats.find((y) => y.pid === pid).turnDeadline));
    const windows = Object.fromEntries(owe.map((pid) => [pid, r.seats.find((y) => y.pid === pid).turnDeadline]));
    eq(r.seats.filter((y) => y.turnDeadline).map((y) => y.pid).sort(), owe, "six: a window for each seat that owes a discard, and no other");
    for (const pid of owe) near(windows[pid] - s.serverNow, TURN, `six: ${pid}'s discard window is a full one`);
    ok(owe.includes(s.turnPlayer), "six: the countdown shows one of the discarding seats", s.turnPlayer);
    // One discards on its own; the other windows do not move.
    const [D0, ...rest] = owe;
    await sleep(0.1 * TURN);
    cs[D0].send({ type: "discard", cards: discardOf(handOf(D0), s.game.discardNeeded[D0]) });
    r = await saved("XSIX", (x) => !(D0 in x.game.discardNeeded) && x.seats.find((y) => y.pid === D0).turnDeadline === null, "six: D0 discarded");
    for (const pid of rest) eq(r.seats.find((y) => y.pid === pid).turnDeadline, windows[pid], `six: ${pid}'s window is untouched by another seat's discard`);
    // 4. Kill -9 mid discard; every remaining deadline comes back.
    const held = Object.fromEntries(rest.map((pid) => [pid, total(handOf(pid))]));
    await kill9();
    const down = Date.now();
    host = await boot();
    cs = await seatAll("XSIX", pids);
    const back = Date.now();
    r = await saved("XSIX", (x) => rest.every((pid) => x.seats.find((y) => y.pid === pid).turnDeadline), `six: windows re-armed after the restart (down ${back - down} ms, ${Math.min(...rest.map((pid) => windows[pid])) - back} ms left)`);
    for (const pid of rest) near(r.seats.find((y) => y.pid === pid).turnDeadline, windows[pid], `six: ${pid}'s discard deadline survives the restart`, 50);
    eq(r.seats.filter((y) => y.turnDeadline).map((y) => y.pid).sort(), rest, "six: no other window is armed after the restart");
    s = await settled(cs, (x) => x.game.phase === "robber", "six: the other discards time out");
    near(Date.now(), Math.max(...rest.map((pid) => windows[pid])), "six: the last discard timeout lands on its deadline");
    for (const pid of rest) {
      ok(cs[J].logs.includes(tooLong(g, pid)), `six: the table hears ${pid}'s timeout`);
      eq(total(handOf(pid)), held[pid] - Math.floor(held[pid] / 2), `six: ${pid}'s hand is halved as classic`);
    }
    eq([s.game.current, s.turnPlayer], [J, J], "six: the wayfarer move is the primary's, and its window runs");
    // The primary's wayfarer move times out (the bot moves it), then its action phase passes to its partner.
    s = await settled(cs, (x) => x.game.phase === "main" && x.game.current === J, "six: the wayfarer move times out");
    const W = at(g, 4 + 3);
    s = await settled(cs, (x) => x.game.role === "partner" && x.game.current === W, "six: J's action phase times out");
    // 4. Kill -9 mid partner activation: its remaining deadline and budget come back.
    await sleep(0.3 * TURN);
    r = await saved("XSIX", (x) => x.game.role === "partner" && x.seats.find((y) => y.pid === W).turnDeadline);
    const [deadline, budget] = [r.seats.find((y) => y.pid === W).turnDeadline, r.seats.find((y) => y.pid === W).turnStartedAt];
    near(deadline, s.turnDeadline, "six: the saved partner deadline is the one every seat counts down", 5);
    await kill9();
    host = await boot();
    cs = await seatAll("XSIX", pids);
    s = newest(cs);
    eq([s.game.role, s.game.current, s.turnPlayer], ["partner", W, W], "six: after the restart the partner's window runs");
    near(s.turnDeadline, deadline, "six: the partner's deadline survives the restart", 50);
    eq(seatFile("XSIX", W).turnStartedAt, budget, "six: the partner's budget survives the restart");
    s = await settled(cs, (x) => x.game.role === "primary" && x.game.current === at(g, 5), "six: the partner times out after the restart");
    near(Date.now(), deadline, "six: on the saved deadline");
    for (const c of Object.values(cs)) c.ws.terminate();
    console.log(`six: XSIX partner ${M1} reconnected with its remaining time kept and timed out on its budget; primary ${P2} timed out roll then pass; ${J}'s partner extension stayed off its primary activation; discards by ${owe.join(" ")} with separate windows, kept through a kill -9; partner ${W}'s deadline kept through a kill -9`);
  }

  console.log(`expanded-timers-prove: ${checks} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)} s (TURN_MS ${TURN}, TURN_TOTAL_MS ${TOTAL}; 5 and 6 seats beside a classic room)`);
  process.exit(0);
} catch (err) {
  console.error(err);
  if (host) console.error(host.err.slice(-2000));
  process.exit(1);
}
