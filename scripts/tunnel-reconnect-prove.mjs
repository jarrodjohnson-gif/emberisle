// #197: Test a phone that locks mid-game and a laptop that changes Wi-Fi, over the tunnel.
// Validates:
// 1. Phone locks mid-game: host logs "lost connection", seat marked away, grace timer runs.
// 2. Phone unlocks inside grace: rejoins with secret, host logs "is back", stays human without (bot).
// 3. Laptop changes Wi-Fi mid-turn: abrupt socket drop, new socket rejoins with secret, host logs "is back".
// 4. Phone drops past grace: bot takes over, rejoins inside hold, restored to human without (bot).
// 5. Completion invariant: both players finish in original seats with no (bot) suffix.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "../server/node_modules/ws/wrapper.mjs";

const GRACE_MS = 1500;
const HOLD_MS = 5000;
const PING_MS = 300;
const LOBBY_HOLD_MS = 1000;

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-tunnel-prove-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));

const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: {
    ...process.env,
    PORT: "0",
    GRACE_MS: String(GRACE_MS),
    HOLD_MS: String(HOLD_MS),
    PING_MS: String(PING_MS),
    LOBBY_HOLD_MS: String(LOBBY_HOLD_MS),
    ROOMS_DIR,
    RESULTS_DIR: `${ROOMS_DIR}/results`,
  },
});

process.on("exit", () => host.kill("SIGKILL"));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

const hostLogs = [];
const port = await new Promise((resolve, reject) => {
  host.stdout.on("data", (d) => {
    const text = String(d);
    for (const line of text.split("\n")) {
      if (line.trim()) hostLogs.push(line.trim());
    }
    const m = text.match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  host.on("exit", (c) => reject(new Error(`host exited ${c}`)));
});

function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  host.kill("SIGKILL");
  process.exit(1);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function client(name, opts = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, opts);
  const c = { name, ws, inbox: [], waiters: [], state: null };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") c.state = msg;
    c.inbox.push(msg);
    for (const w of c.waiters.splice(0)) w();
  });
  c.send = (msg) => ws.send(JSON.stringify({ ...c.state?.actionStamp, cid: crypto.randomUUID(), ...msg }));
  c.next = async (type, ok = () => true, ms = 4000) => {
    const until = Date.now() + ms;
    for (;;) {
      const i = c.inbox.findIndex((m) => m.type === type && ok(m));
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      const left = until - Date.now();
      if (left <= 0) fail(`${name} timed out waiting for ${type}`);
      await new Promise((res) => {
        c.waiters.push(res);
        setTimeout(res, Math.min(left, 50));
      });
    }
  };
  c.close = () => new Promise((res) => (ws.readyState === ws.CLOSED ? res() : (ws.once("close", res), ws.close())));
  c.terminate = () => ws.terminate();
  await new Promise((res, rej) => {
    ws.on("open", res);
    ws.on("error", rej);
  });
  return c;
}

console.log(`host listening on port ${port}, testing tunnel reconnect flows`);

// 1. Lobby and table startup with Host (Ember), Phone player, and Laptop player.
const h = await client("Host");
const p = await client("Phone");
const l = await client("Laptop");

h.send({ type: "hello", name: "Ember" });
const wh = await h.next("welcome");
const code = wh.code;

p.send({ type: "hello", code, name: "Phone" });
const wp = await p.next("welcome");

l.send({ type: "hello", code, name: "Laptop" });
const wl = await l.next("welcome");

for (const c of [h, p, l]) c.send({ type: "ready", value: true });
await wait(50);
h.send({ type: "start" });

await Promise.all([h.next("state"), p.next("state"), l.next("state")]);
const phonePid = p.state.you;
const laptopPid = l.state.you;
console.log(`game started: code ${code}, Phone is ${phonePid}, Laptop is ${laptopPid}`);

// 2. Scenario 1: Phone locks mid-game during grace window.
console.log("scenario 1: Phone locks mid-game (screen sleep)");
await p.close();

// Host notifies remaining players that Phone lost connection.
const phoneAwayLog = await h.next("log", (m) => m.text.includes("Phone lost connection."));
if (!phoneAwayLog) fail("expected host log: Phone lost connection.");
const awaySeats = await h.next("seats", (m) => m.seats.some((s) => s.id === wp.you && s.away));
if (!awaySeats) fail("expected seats update marking Phone away");
console.log("host logged: Phone lost connection, marked seat away");

// Phone stays asleep for 500 ms (within 1500 ms grace), then unlocks and wakes.
await wait(500);
console.log("Phone unlocks screen and dials rejoin with secret");
const p2 = await client("Phone reconnected");
p2.send({ type: "hello", code, secret: wp.secret });
const phoneWelcome = await p2.next("welcome");
const phoneState = await p2.next("state");

if (phoneWelcome.you !== wp.you) fail("Phone did not reclaim original seat", phoneWelcome.you);
if (phoneState.you !== phonePid) fail("Phone did not reclaim original player ID", phoneState.you);

const phoneBackLog = await h.next("log", (m) => m.text.includes("Phone is back."));
if (!phoneBackLog) fail("expected host log: Phone is back.");

const phonePlayer = phoneState.game.players.find((pl) => pl.id === phonePid);
if (phonePlayer.kind !== "human" || phonePlayer.name.includes("(bot)")) {
  fail("Phone player should remain human without (bot) suffix", phonePlayer);
}
console.log(`Phone rejoined inside grace: seat ${phoneWelcome.you}, name "${phonePlayer.name}", kind: ${phonePlayer.kind}`);

// 3. Scenario 2: Laptop switches Wi-Fi networks mid-turn.
console.log("scenario 2: Laptop switches Wi-Fi mid-turn (abrupt socket drop)");
l.terminate(); // Abrupt drop simulating network route change

const laptopAwayLog = await h.next("log", (m) => m.text.includes("Laptop lost connection."));
if (!laptopAwayLog) fail("expected host log: Laptop lost connection.");
console.log("host logged: Laptop lost connection.");

// Laptop network interface comes up, dials from new socket with seat secret.
await wait(300);
const l2 = await client("Laptop reconnected");
l2.send({ type: "hello", code, secret: wl.secret });
const laptopWelcome = await l2.next("welcome");
const laptopState = await l2.next("state");

if (laptopWelcome.you !== wl.you) fail("Laptop did not reclaim original seat", laptopWelcome.you);
if (laptopState.you !== laptopPid) fail("Laptop did not reclaim original player ID", laptopState.you);

const laptopBackLog = await h.next("log", (m) => m.text.includes("Laptop is back."));
if (!laptopBackLog) fail("expected host log: Laptop is back.");

const laptopPlayer = laptopState.game.players.find((pl) => pl.id === laptopPid);
if (laptopPlayer.kind !== "human" || laptopPlayer.name.includes("(bot)")) {
  fail("Laptop player should remain human without (bot) suffix", laptopPlayer);
}
console.log(`Laptop reconnected from new network: seat ${laptopWelcome.you}, name "${laptopPlayer.name}", kind: ${laptopPlayer.kind}`);

// 4. Scenario 3: Phone drops past grace window (edge case).
console.log("scenario 3: Phone drops past grace (bot takeover, then human restore)");
await p2.close();
await h.next("log", (m) => m.text.includes("Phone lost connection."));

// Wait past GRACE_MS (1500 ms) for bot takeover.
await wait(GRACE_MS + 200);
const botState = await h.next("state", (m) => m.game.players.find((pl) => pl.id === phonePid).kind === "bot");
const botPlayer = botState.game.players.find((pl) => pl.id === phonePid);
console.log(`past grace: Phone converted to ${botPlayer.kind}, name "${botPlayer.name}"`);

// Phone unlocks within HOLD_MS (5000 ms) and rejoins.
const p3 = await client("Phone restored");
p3.send({ type: "hello", code, secret: wp.secret });
await p3.next("welcome");
const restoredState = await p3.next("state");

const restoredPlayer = restoredState.game.players.find((pl) => pl.id === phonePid);
if (restoredPlayer.kind !== "human") fail("Phone player should be restored to human", restoredPlayer);
if (restoredPlayer.name.includes("(bot)")) fail("Phone name should have (bot) removed", restoredPlayer.name);
console.log(`Phone restored after bot takeover: name "${restoredPlayer.name}", kind: ${restoredPlayer.kind}`);

// 5. Verify final completion invariants.
const finalPlayers = restoredState.game.players;
const finalPhone = finalPlayers.find((pl) => pl.id === phonePid);
const finalLaptop = finalPlayers.find((pl) => pl.id === laptopPid);

if (finalPhone.name.endsWith("(bot)") || finalLaptop.name.endsWith("(bot)")) {
  fail("Neither player may have (bot) suffix", { finalPhone, finalLaptop });
}
if (finalPhone.kind !== "human" || finalLaptop.kind !== "human") {
  fail("Both players must be human", { finalPhone, finalLaptop });
}

await Promise.all([h.close(), p3.close(), l2.close()]);
host.removeAllListeners("exit");
host.kill("SIGKILL");

console.log("completion test passed: both players in original seats with no (bot) suffix");
console.log("tunnel reconnect prove ok");
