// What the real host says for one roll at an online table (#687): "<name> rolled <sum>!", then the goods line, and nothing
// else. No "<sum> · <name> +n <good>" summary ahead of them (the host used to say that for a person's roll, so a table
// read the sum twice and had three lines per roll). Two people and a bot sit at a real host.mjs; a person rolls several times
// and the bot rolls on its own turns. Every socket must hear the same two lines for each roll, in order.
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
  env: { ...process.env, PORT: "0", ACT_RATE: "1000", ACT_CAP: "1000", ROOMS_DIR },
});
process.on("exit", () => host.kill("SIGKILL"));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const port = await new Promise((resolve, reject) => {
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  host.on("exit", (c) => reject(new Error(`host exited ${c}`)));
});

function fail(why, extra) {
  console.log("FAIL", why, extra === undefined ? "" : JSON.stringify(extra));
  host.kill("SIGKILL");
  process.exit(1);
}

// Any message to any socket wakes whoever is waiting.
const waiters = new Set();
const tick = (ms = 100) =>
  new Promise((res) => {
    const done = () => {
      clearTimeout(timer);
      waiters.delete(done);
      res();
    };
    const timer = setTimeout(done, ms);
    waiters.add(done);
  });
async function until(ok, why, ms = 10000) {
  const stop = Date.now() + ms;
  for (;;) {
    const v = ok();
    if (v) return v;
    if (Date.now() > stop) fail(`timed out waiting for ${why}`);
    await tick();
  }
}

function client(name, color) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { name, color, ws, state: null, welcome: null, seats: null, logs: [], rolls: [], errors: [], owes: [] };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") {
      c.state = msg;
      // A bot's ask of the table: answer No once this seat holds the state that came with it (its stamp is current).
      for (const tradeId of c.owes.splice(0)) c.send({ type: "tradeAnswer", tradeId, yes: false });
    } else if (msg.type === "log") c.logs.push(msg.text);
    else if (msg.type === "rolled") c.rolls.push(msg);
    else if (msg.type === "welcome") c.welcome = msg;
    else if (msg.type === "seats") c.seats = msg;
    else if (msg.type === "error") c.errors.push(msg.message);
    else if (msg.type === "tradeOffer" && msg.from !== c.state?.you) c.owes.push(msg.tradeId);
    for (const w of [...waiters]) w();
  });
  c.send = (msg) => ws.send(JSON.stringify({ ...c.state?.actionStamp, cid: crypto.randomUUID(), ...msg }));
  c.open = new Promise((res) => ws.on("open", res));
  return c;
}

const ember = client("Ember", "#e23d2e");
const tide = client("Tide", "#2d6ee8");
const people = [ember, tide];
await Promise.all(people.map((c) => c.open));

ember.send({ type: "hello", name: "Ember", color: ember.color });
const { code } = await until(() => ember.welcome, "Ember's welcome");
tide.send({ type: "hello", code, name: "Tide", color: tide.color });
await until(() => tide.welcome, "Tide's welcome");
ember.send({ type: "addBot" });
const botSeat = await until(() => ember.seats?.seats.length === 3 && ember.seats.seats.find((s) => s.bot), "the bot's seat");
const BOT = botSeat.name;
for (const c of people) c.send({ type: "ready", value: true });
await until(() => ember.seats.seats.length === 3 && ember.seats.seats.every((s) => s.ready), "everyone ready");
ember.send({ type: "start" });
await until(() => people.every((c) => c.state), "the first state");
console.log(`table ${code}: Ember and Tide with ${BOT}`);

// The seat the game waits on, once every person holds the same newest state.
const canAct = (c) => {
  const l = c.state.legal;
  return l.outpost.length || l.path.length || l.stronghold.length || l.wayfarer.length || l.actions.length;
};
const actor = () =>
  until(() => {
    const seq = people[0].state.game.seq;
    if (!people.every((c) => c.state.game.seq === seq)) return null;
    return people.find(canAct) ?? null;
  }, "a person to act");

async function act(c, msg) {
  const seq = c.state.game.seq;
  const errors = c.errors.length;
  c.send(msg);
  await until(() => c.state.game.seq > seq || c.errors.length > errors, `${c.name} ${msg.type}`);
  if (c.errors.length > errors) fail(`${c.name} ${JSON.stringify(msg)}`, c.errors.at(-1));
}

// The goods line for `name`'s roll, as rules.ts writes it, with or without a short bank.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const goodsLine = (name) => new RegExp(`^(Nobody gains goods|.+ gains .+) — ${esc(name)}'s roll(; the bank is short of [a-z ]+; nobody gains it)?\\.$`);
const ROLLED = /^(.+) rolled (\d+)!$/;

// Mark before the roll-off: the bot can roll as soon as setup ends, and its roll must count from the first line.
const first = people.map((c) => c.logs.length);
// Roll-off, then setup (the bot plays its own turns inside the host).
while (ember.state.game.phase === "rollOff") await act(await actor(), { type: "roll" });
while (["setupSettle", "setupRoad"].includes(ember.state.game.phase)) {
  const c = await actor();
  const { legal, game } = c.state;
  await act(c, game.phase === "setupSettle" ? { type: "place", kind: "outpost", id: legal.outpost[0] } : { type: "place", kind: "path", id: legal.path[0] });
}
await until(() => people.every((c) => c.state.game.seq === people[0].state.game.seq), "the table to settle");
console.log("setup done, phase", ember.state.game.phase);

// A person's roll: exactly the host's lines for it, the same on every socket.
let humanRolls = 0;
async function humanRoll(c) {
  const marks = people.map((o) => o.logs.length);
  const heard = c.rolls.length;
  await act(c, { type: "roll" });
  const rolled = c.rolls[heard];
  if (!rolled) fail(`${c.name} never got the rolled message`);
  await until(() => people.every((o) => o.state.game.seq === c.state.game.seq), "every seat to see the roll");
  const lines = c.logs.slice(marks[people.indexOf(c)]);
  if (lines[0] !== `${c.name} rolled ${rolled.sum}!`) fail(`${c.name}'s first line for a ${rolled.sum}`, lines);
  if (!goodsLine(c.name).test(lines[1] ?? "")) fail(`${c.name}'s second line is the goods line`, lines);
  if (lines.some((l) => /^\d+ · /.test(l))) fail(`${c.name}'s roll said the old "<sum> · ..." summary`, lines);
  if (lines.filter((l) => ROLLED.test(l)).length !== 1) fail("one roll line per roll", lines);
  // Only a 7 can bring more lines (the bot discarding); any other roll is the two lines and nothing else.
  if (rolled.sum !== 7 && lines.length !== 2) fail(`${c.name}'s ${rolled.sum} is two lines and nothing else`, lines);
  for (const o of people) if (JSON.stringify(o.logs.slice(marks[people.indexOf(o)])) !== JSON.stringify(lines)) fail(`${o.name} heard other lines than ${c.name}`, o.logs.slice(marks[people.indexOf(o)]));
  humanRolls++;
  return rolled.sum;
}

const botRolls = () => ember.logs.filter((l) => ROLLED.exec(l)?.[1] === BOT).length;
const sums = [];
for (let guard = 0; (humanRolls < 4 || botRolls() < 3) && guard < 150; guard++) {
  const c = await actor();
  const { legal, game } = c.state;
  if (game.phase === "roll") sums.push(await humanRoll(c));
  else if (legal.discard > 0) {
    let left = legal.discard;
    const cards = {};
    for (const [r, n] of Object.entries(game.players.find((p) => p.id === c.state.you).resources)) {
      const k = Math.min(n, left);
      if (k) cards[r] = k;
      left -= k;
    }
    await act(c, { type: "discard", cards });
  } else if (game.phase === "robber") {
    const hexId = legal.wayfarer.find((h) => !legal.steal[h]) ?? legal.wayfarer[0];
    await act(c, { type: "rob", hexId, stealFrom: legal.steal[hexId]?.[0] ?? null });
  } else await act(c, { type: "pass" });
}
if (humanRolls < 4 || botRolls() < 3) fail("not enough rolls", { humanRolls, botRolls: botRolls() });
await until(() => people.every((c) => c.state.game.seq === people[0].state.game.seq), "the table to settle");

// Everything either socket heard since setup: each production roll is "<name> rolled <sum>!" and, next, that seat's goods
// line; no line is the old summary; and the lines count the rolls the game made.
for (const [i, c] of people.entries()) {
  const lines = c.logs.slice(first[i]);
  let rolls = 0;
  const bots = [];
  lines.forEach((line, at) => {
    const m = ROLLED.exec(line);
    if (!m) return;
    rolls++;
    const sum = Number(m[2]);
    if (sum < 2 || sum > 12) fail(`${c.name}: a sum of ${sum}`, line);
    if (!goodsLine(m[1]).test(lines[at + 1] ?? "")) fail(`${c.name}: "${line}" is followed by ${m[1]}'s goods line`, lines.slice(at, at + 3));
    if (m[1] === BOT) bots.push(line);
  });
  if (rolls !== c.state.game.rolls) fail(`${c.name} heard ${rolls} roll lines for ${c.state.game.rolls} rolls`, lines);
  if (lines.filter((l) => /'s roll[;.]$/.test(l)).length !== rolls) fail(`${c.name}: one goods line per roll`, lines);
  if (lines.some((l) => /^\d+ · /.test(l))) fail(`${c.name} heard a "<sum> · ..." summary`, lines.filter((l) => /^\d+ · /.test(l)));
  if (bots.length < 3) fail(`${c.name} heard only ${bots.length} bot rolls`, bots);
  console.log(`${c.name}: ${rolls} rolls = ${rolls} roll lines + ${rolls} goods lines (${bots.length} by ${BOT}), no "<sum> · ..." line`);
}
if (people.some((c) => c.errors.some((m) => m !== "Offer is gone."))) fail("a socket was refused", people.map((c) => c.errors));
console.log(`${humanRolls} person rolls (${sums.join(" ")}): each was "<name> rolled <sum>!" then the goods line, the same on every socket`);
console.log("roll lines prove ok");
host.kill("SIGKILL");
process.exit(0);
