// Lobby rename and lobby bots against server/host.mjs: validation, who may, what is broadcast and saved, the start with a bot seat.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-lobby-"));
let host;
const sockets = [];
process.on("exit", () => {
  host?.kill("SIGKILL");
  for (const c of sockets) c.ws.terminate();
  rmSync(ROOMS_DIR, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

function boot(env = {}) {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results`, SAVE_MS: "20", ACT_RATE: "1000", ACT_CAP: "1000", ...env },
  });
  return new Promise((resolve, reject) => {
    host.stdout.on("data", (d) => {
      const m = String(d).match(/listening (\d+)/);
      if (m) resolve(Number(m[1]));
    });
    host.on("exit", (c) => reject(new Error(`host exited ${c}`)));
  });
}

function client(port, name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { name, ws, inbox: [], waiters: [], state: null, seats: null };
  sockets.push(c);
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") c.state = msg;
    if (msg.type === "seats") c.seats = msg.seats;
    c.inbox.push(msg);
    for (const w of c.waiters.splice(0)) w();
  });
  c.send = (msg) => ws.send(JSON.stringify({ ...c.state?.actionStamp, cid: crypto.randomUUID(), ...msg }));
  c.next = async (type, ms = 3000) => {
    const end = Date.now() + ms;
    for (;;) {
      const i = c.inbox.findIndex((m) => m.type === type);
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      if (Date.now() > end) throw new Error(`${name} waited for ${type}`);
      await new Promise((res) => {
        c.waiters.push(res);
        setTimeout(res, 100);
      });
    }
  };
  // The next message of any kind in `types`, skipping others.
  c.drain = () => (c.inbox.length = 0);
  c.open = new Promise((res) => ws.on("open", res));
  return c;
}

const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const roomFile = (code) => JSON.parse(readFileSync(path.join(ROOMS_DIR, `${code}.json`), "utf8"));
async function sit(port, names) {
  const [first, ...rest] = names.map((n) => client(port, n));
  await first.open;
  first.send({ type: "hello", name: first.name });
  const welcome = await first.next("welcome");
  const code = welcome.code;
  first.secret = welcome.secret;
  for (const c of rest) {
    await c.open;
    c.send({ type: "hello", code, name: c.name });
    c.secret = (await c.next("welcome")).secret;
  }
  await settle();
  return { code, clients: [first, ...rest] };
}
async function errorOf(c, msg) {
  c.drain();
  c.send(msg);
  return (await c.next("error")).message;
}

const port = await boot({ RENAME_MS: "0" });
{
  const { code, clients: [ember, tide] } = await sit(port, ["Ember", "Tide"]);
  const mine = (c) => c.seats.find((s) => s.name !== undefined && s.id === (c === ember ? "s0" : "s1"));

  // Rename: cleaned like a hello name, broadcast to every seat, saved.
  ember.drain();
  tide.drain();
  ember.send({ type: "rename", name: "  Ash\u0007  ​field   Wanderer-of-the-Isles " });
  const seen = await tide.next("seats");
  assert.equal(seen.seats[0].name, "Ash field Wander", "control characters, runs of spaces and length 16");
  await settle();
  assert.equal(mine(ember).name, "Ash field Wander");
  assert.match((await tide.next("log")).text, /^Ember is now Ash field Wander\.$/);
  await settle();
  assert.equal(roomFile(code).seats[0].name, "Ash field Wander", "the new name is in the room file");

  // Markup is text: it is kept as the characters typed (clients render text, never HTML).
  ember.send({ type: "rename", name: "<b>x</b>" });
  assert.equal((await tide.next("seats")).seats[0].name, "<b>x</b>");

  // A name taken at the table gets a number; your own name is not a duplicate; case does not matter.
  tide.send({ type: "rename", name: "<B>X</B>" });
  await settle();
  assert.equal(ember.seats[1].name, "<B>X</B> 2");
  ember.send({ type: "rename", name: "<b>x</b>" });
  await settle();
  assert.equal(mine(ember).name, "<b>x</b>", "renaming to your own name keeps it");

  // Nothing left after cleaning.
  assert.equal(await errorOf(ember, { type: "rename", name: " \u0007 " }), "Pick a name.");
  assert.equal(await errorOf(ember, { type: "rename", name: 42 }), "Pick a name.");
  assert.equal(await errorOf(ember, { type: "rename" }), "Pick a name.");
  assert.equal(mine(ember).name, "<b>x</b>");

  // Only the host adds or removes a bot.
  assert.equal(await errorOf(tide, { type: "addBot" }), "Only the host can add a bot.");
  assert.equal(await errorOf(tide, { type: "removeBot", id: "s0" }), "Only the host can remove a bot.");
  assert.equal(await errorOf(ember, { type: "removeBot", id: "s1" }), "No such bot.", "a person's seat is not a bot");
  assert.equal(await errorOf(ember, { type: "removeBot", id: "s9" }), "No such bot.");

  // Add one: ready, no away marker, a free colour, saved with bot:true.
  ember.drain();
  ember.send({ type: "addBot" });
  const withBot = await tide.next("seats");
  const bot = withBot.seats[2];
  assert.deepEqual([withBot.seats.length, bot.bot, bot.ready, bot.away, bot.name], [3, true, true, false, "Bot"]);
  assert.ok(!withBot.seats.slice(0, 2).some((s) => s.color === bot.color), "the bot took a free colour");
  await settle();
  assert.equal(roomFile(code).seats[2].bot, true);
  assert.equal(roomFile(code).shape, 2, "the room shape is unchanged: a bot is one more optional seat field");

  // Remove it, add again, fill the table: a fifth seat is refused.
  ember.send({ type: "removeBot", id: bot.id });
  await settle();
  assert.equal(tide.seats.length, 2);
  ember.send({ type: "addBot" });
  ember.send({ type: "addBot" });
  await settle();
  assert.deepEqual(ember.seats.map((s) => s.name), ["<b>x</b>", "<B>X</B> 2", "Bot", "Bot 2"]);
  assert.equal(await errorOf(ember, { type: "addBot" }), "Table full.");
  ember.send({ type: "removeBot", id: ember.seats[3].id });
  await settle();
  assert.equal(ember.seats.length, 3);

  // Soundboard (a chat line with a clip id): whitelisted, one per seat per 3 s, relayed to every seat and kept in the chat history.
  assert.equal(await errorOf(ember, { type: "sound", id: "../../etc/passwd" }), "Unknown sound.");
  assert.equal(await errorOf(ember, { type: "sound" }), "Unknown sound.");
  tide.drain();
  ember.send({ type: "sound", id: "robbed_fah" });
  const heard = await tide.next("chat");
  assert.deepEqual([heard.sound, heard.text, heard.name], ["robbed_fah", "\u{1F50A} Fah", "<b>x</b>"]);
  assert.equal(await errorOf(ember, { type: "sound", id: "bong" }), "Slow down.", "a second tap inside 3 s is refused");
  assert.equal(await errorOf(tide, { type: "sound", id: "plop" }), "Unknown sound.", "old clients cannot play the removed Plop chip");
  assert.equal(await errorOf(tide, { type: "sound", id: "pluck" }), "Unknown sound.", "old clients cannot play the removed Pluck chip");
  tide.send({ type: "sound", id: "bong" });
  assert.equal((await ember.next("chat")).sound, "bong", "the pace is per seat: Tide can tap right after Ember");
  await settle();
  assert.ok(roomFile(code).chat.some((l) => l.sound === "robbed_fah"), "the sound line is in the room's chat");

  // The end music is not a soundboard clip; the in-game clips are.
  await settle(3100);
  assert.equal(await errorOf(ember, { type: "sound", id: "end_music" }), "Unknown sound.");
  assert.equal(await errorOf(ember, { type: "sound", id: "sb_charlie_kirk" }), "Unknown sound.");
  tide.drain();
  ember.send({ type: "sound", id: "sb_quit_touchin" });
  assert.equal((await tide.next("chat")).text, "\u{1F50A} Quit touchin' me");
  await settle(3100);
  tide.drain();
  for (const id of ["sb_airhorn", "sb_only_wood"]) {
    ember.send({ type: "sound", id });
    assert.equal((await tide.next("chat")).sound, id);
    await settle(3100);
  }

  // Start with 2 humans + 1 bot: needs only the humans ready.
  assert.equal(await errorOf(ember, { type: "start" }), "Not everyone is ready.");
  ember.send({ type: "ready", value: true });
  tide.send({ type: "ready", value: true });
  await settle();
  tide.drain();
  ember.send({ type: "start" });
  const st = await tide.next("state");
  const kinds = st.game.players.map((p) => p.kind);
  assert.deepEqual(kinds, ["human", "human", "bot"]);
  assert.equal(st.game.players[2].name, "Bot");

  // A started table: no rename, no new bot, no bot removal.
  assert.equal(await errorOf(ember, { type: "rename", name: "Late" }), "Names are fixed once the game starts.");
  assert.equal(await errorOf(ember, { type: "addBot" }), "Game already started.");
  assert.equal(await errorOf(ember, { type: "removeBot", id: "s2" }), "Game already started.");

  // The bot plays by itself: once the people have rolled their roll-off dice, its die is rolled by the host, and the log says so.
  for (const c of [ember, tide]) {
    await settle();
    if (c.state.legal.actions.includes("roll")) c.send({ type: "roll" });
  }
  await settle(300);
  const g = ember.state.game;
  assert.deepEqual(g.players.map((p) => p.kind).sort(), ["bot", "human", "human"], "the roll-off may reorder the seats, not change who is a bot");
  assert.equal(ember.seats.find((s) => s.bot).away, false);
  assert.ok(g.log.some((l) => l.startsWith("Bot ")), `the bot rolled: ${g.log.join(" | ")}`);
}

// The ACT limit covers rename: a burst past the cap is "Slow down."
host.kill("SIGKILL");
await new Promise((r) => host.once("exit", r));
const slowPort = await boot({ ACT_CAP: "5", ACT_RATE: "0.001" });
{
  const { clients: [a] } = await sit(slowPort, ["Ada", "Bo"]);
  a.drain();
  for (let i = 0; i < 12; i++) a.send({ type: "rename", name: `Ada ${i}` });
  await settle(300);
  assert.ok(a.inbox.some((m) => m.type === "error" && m.message === "Slow down."), "rename is rate-limited with the other seat messages");
}

// Rename has its own pace: a second accepted rename inside RENAME_MS is "Slow down.", whatever the action bucket says.
host.kill("SIGKILL");
await new Promise((r) => host.once("exit", r));
const paced = await boot({ RENAME_MS: "700" });
{
  const { clients: [a] } = await sit(paced, ["Ada", "Bo"]);
  a.drain();
  a.send({ type: "rename", name: "Ada 1" });
  a.send({ type: "rename", name: "Ada 2" });
  assert.equal((await a.next("error")).message, "Slow down.");
  await settle(800);
  a.drain();
  a.send({ type: "rename", name: "Ada 3" });
  await settle();
  assert.equal(a.seats[0].name, "Ada 3", "after the pause a rename is accepted");
}

// A restart mid-game: the lobby bot is not a recovery seat, so after the humans rejoin it still plays like any bot.
host.kill("SIGKILL");
await new Promise((r) => host.once("exit", r));
rmSync(ROOMS_DIR, { recursive: true, force: true });
const gamePort = await boot({ GRACE_MS: "60000", HOLD_MS: "60000" });
let gameCode, secrets;
{
  const { code, clients: [a, b] } = await sit(gamePort, ["Ann", "Ben"]);
  gameCode = code;
  secrets = [a.secret, b.secret];
  a.send({ type: "addBot" });
  a.send({ type: "ready", value: true });
  b.send({ type: "ready", value: true });
  await settle();
  a.send({ type: "start" });
  await a.next("state");
  await settle(300);
}
host.kill("SIGKILL");
await new Promise((r) => host.once("exit", r));
assert.equal(roomFile(gameCode).seats.filter((s) => s.bot).length, 1, "the bot seat is on disk");
const restarted = await boot({ GRACE_MS: "60000", HOLD_MS: "60000" });
{
  const humans = secrets.map((secret, i) => {
    const c = client(restarted, `h${i}`);
    c.secret = secret;
    return c;
  });
  for (const c of humans) {
    await c.open;
    c.send({ type: "hello", code: gameCode, secret: c.secret });
    await c.next("welcome");
  }
  await settle(300);
  assert.deepEqual(roomFile(gameCode).recoveryPids, [], "no seat is in recovery: the bot is a normal bot, not a held human");
  // Play the people's moves from their legal lists until the bot has built: a recovery bot only rolls and declines.
  const botPid = () => humans[0].state.game.players.find((p) => p.kind === "bot").id;
  let built = false;
  for (let i = 0; i < 80 && !built; i++) {
    for (const c of humans) {
      const l = c.state?.legal;
      if (!l) continue;
      if (l.actions.includes("roll")) c.send({ type: "roll" });
      else if (l.outpost.length) c.send({ type: "place", kind: "outpost", id: l.outpost[0] });
      else if (l.path.length) c.send({ type: "place", kind: "path", id: l.path[0] });
    }
    await settle(120);
    built = humans[0].state.game.vertices.some((v) => v.building?.playerId === botPid());
  }
  assert.ok(built, "after the restart the lobby bot places its setup outpost like a normal bot");
  assert.deepEqual(roomFile(gameCode).recoveryPids, [], "still no recovery seats once the bot has played");
}

// A room restored from disk keeps the bot, the renamed seat and the bot's readiness.
host.kill("SIGKILL");
await new Promise((r) => host.once("exit", r));
rmSync(ROOMS_DIR, { recursive: true, force: true });
const port3 = await boot();
let code3;
{
  const { code, clients: [a] } = await sit(port3, ["Ada", "Bo"]);
  code3 = code;
  a.send({ type: "addBot" });
  a.send({ type: "rename", name: "Ada L" });
  await settle(300);
}
host.kill("SIGTERM");
await new Promise((r) => host.once("exit", r));
const port4 = await boot({ LOBBY_HOLD_MS: "100" });
{
  const c = client(port4, "peek");
  await c.open;
  c.send({ type: "peek", code: code3 });
  const peeked = await c.next("seats");
  assert.equal(peeked.seats.length, 3, "restored lobby still has the bot and both humans");
  const file = roomFile(code3);
  assert.deepEqual(file.seats.map((s) => s.name), ["Ada L", "Bo", "Bot"]);
  assert.ok(peeked.seats[2].ready, "the bot stays ready after a restart; held humans are not");
  assert.ok(!peeked.seats[0].ready);
  // Both humans are let go after the hold; with no person left the room closes, bots do not keep it alive.
  await settle(500);
  c.send({ type: "peek", code: code3 });
  assert.equal((await c.next("seats")).seats.length, 0, "a lobby with only bots left is closed");
}
console.log("lobby-prove ok: soundboard, rename (clean, dedupe, empty, burst, started), add/remove bot (host only, 4 max), start 2 humans + 1 bot, restore");
process.exit(0);
