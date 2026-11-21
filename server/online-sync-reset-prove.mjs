// Online sync and store reset proof: verifies stale offers and transient HUD state clear across reconnect,
// table loss, online rematch, mode switches (4-seat <-> 6-seat), and returning to the title screen.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { createGame } from "../src/lib/game/board.ts";
import { PLAYER_COLORS } from "../src/lib/game/types.ts";

const SERVER = fileURLToPath(new URL(".", import.meta.url));
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-online-sync-"));
const sockets = [];
let host = null;

process.on("exit", () => {
  host?.proc.kill("SIGKILL");
  for (const s of sockets) s.terminate();
  rmSync(dir, { recursive: true, force: true });
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(130));
setTimeout(() => {
  console.error("FAIL online-sync-reset-prove timed out after 30 s");
  process.exit(1);
}, 30_000).unref();

const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = { visibilityState: "visible", activeElement: null };
globalThis.WebSocket = WebSocket;

function writeRoom(code, over = false) {
  const g = createGame({ seed: 42, humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0 });
  g.phase = over ? "over" : "main";
  g.current = "p0";
  g.dice = [3, 4];
  g.rollOff = null;
  if (over) g.winner = "p0";
  for (const p of g.players) p.resources = { timber: 2, clay: 2, wool: 2, grain: 2, ore: 2 };
  const seats = g.players.map((p, i) => ({
    id: `s${i}`,
    name: p.name,
    color: PLAYER_COLORS[i],
    avatarId: null,
    ready: true,
    secret: `sec-${code}-${i}`,
    pid: p.id,
    url: null,
    away: true,
    ...(i === 2 ? { bot: true, away: false } : {}),
  }));
  const room = { code, host: "s0", next: 3, chat: [], chatSeq: 0, game: g, seats, shape: 3, savedAt: Date.now() };
  writeFileSync(path.join(dir, `${code}.json`), JSON.stringify(room));
  return { code, s0: seats[0].secret, s1: seats[1].secret };
}

function boot() {
  const proc = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: SERVER,
    env: {
      ...process.env,
      PORT: "0",
      ROOMS_DIR: dir,
      RESULTS_DIR: `${dir}/results`,
      PROFILES_DIR: `${dir}/profiles`,
      SAVE_MS: "20",
      ACT_CAP: "1000",
      ACT_RATE: "1000",
      GRACE_MS: "600000",
      HOLD_MS: "600000",
      TURN_MS: "600000",
      TURN_TOTAL_MS: "600000",
    },
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

function rawClient(url) {
  const ws = new WebSocket(url);
  sockets.push(ws);
  const inbox = [];
  const waiters = [];
  ws.on("message", (d) => {
    const msg = JSON.parse(String(d));
    const idx = waiters.findIndex((w) => w.match(msg));
    if (idx >= 0) waiters.splice(idx, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  const open = new Promise((r, j) => { ws.once("open", r); ws.once("error", j); });
  return {
    ws,
    open,
    send: (m) => ws.send(JSON.stringify(m)),
    next: (match, ms = 5000) => {
      const fn = typeof match === "string" ? (m) => m.type === match : match;
      const i = inbox.findIndex(fn);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout waiting for message`)), ms);
        waiters.push({ match: fn, resolve: (m) => { clearTimeout(t); resolve(m); } });
      });
    },
  };
}

async function waitFor(fn, label, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error(`timeout waiting for: ${label}`);
}

const room1 = writeRoom("SYNC");
const room2 = writeRoom("OVER", true);
host = await boot();
const wsUrl = `ws://127.0.0.1:${host.port}`;
globalThis.window = {
  location: { href: `http://127.0.0.1/?host=${encodeURIComponent(wsUrl)}` },
  addEventListener() {},
  removeEventListener() {},
};

const { useGame } = await import("../src/lib/game/store.ts");
const g = () => useGame.getState();

// Connect Player A (seat s0, asker) over raw WebSocket.
const A = rawClient(wsUrl);
await A.open;
A.send({ type: "hello", proto: 1, caps: ["expanded"], code: room1.code, secret: room1.s0 });
await A.next("welcome");
let aState = await A.next("state");

// Connect Player B (seat s1) through the real browser store.
localStorage.setItem("emberisle-seat", JSON.stringify({ code: room1.code, secret: room1.s1 }));
assert.equal(g().rejoinTable(), true, "rejoinTable starts connection");
await waitFor(() => g().screen === "play" && g().localId === "p1" && g().connectionHealth.status === "Reachable", "B joined game");
aState = await A.next("state");

// 1. Mid-game reconnect after offer closed while disconnected clears stale offer.
A.send({ type: "tradeAsk", give: { timber: 1 }, want: { wool: 1 }, ...aState.actionStamp, cid: "ask-1" });
const offer1 = await A.next("tradeOffer");
await waitFor(() => g().offer?.tradeId === offer1.tradeId, "B received offer1");

const syncedBefore = g().synced;
g().net.drop();
await waitFor(() => g().connectionHealth.status === "Reconnecting", "B reconnecting");
assert.equal(g().offer, null, "1: offer clears immediately on disconnect");
assert.deepEqual(g().declined, [], "1: declined clears immediately on disconnect");

// Player A cancels offer while B is disconnected; host broadcasts tradeClosed while B is offline.
A.send({ type: "tradeCancel", tradeId: offer1.tradeId, ...aState.actionStamp, cid: "cancel-1" });
await A.next((m) => m.type === "tradeClosed" && m.tradeId === offer1.tradeId);

g().net.wake();
await waitFor(() => g().synced > syncedBefore && g().connectionHealth.status === "Reachable", "B reconnected after cancel");
assert.equal(g().offer, null, "1: closed offer does not remain stuck after reconnect");
assert.deepEqual(g().declined, [], "1: declined stays empty after reconnect");
console.log("ok 1: offer closed while offline stays cleared after reconnect");

// 2. Live offer still open across reconnect is restored by host resendOffer.
aState = await A.next("state");
A.send({ type: "tradeAsk", give: { clay: 1 }, want: { ore: 1 }, ...aState.actionStamp, cid: "ask-2" });
const offer2 = await A.next("tradeOffer");
await waitFor(() => g().offer?.tradeId === offer2.tradeId, "B received offer2");

const syncedBefore2 = g().synced;
g().net.drop();
await waitFor(() => g().connectionHealth.status === "Reconnecting", "B reconnecting for live offer");
assert.equal(g().offer, null, "2: offer clears while disconnected");

g().net.wake();
await waitFor(() => g().synced > syncedBefore2 && g().offer?.tradeId === offer2.tradeId, "B restored live offer2");
assert.equal(g().offer.tradeId, offer2.tradeId, "2: live offer restored on reconnect");
console.log("ok 2: live offer still open across reconnect is cleanly restored");

// 3. Online rematch clears stale offer, declined, menuFor, rematchChoice, and build/trade state.
const A2 = rawClient(wsUrl);
await A2.open;
A2.send({ type: "hello", proto: 1, caps: ["expanded"], code: room2.code, secret: room2.s0 });
await A2.next("welcome");
await A2.next("state");
g().goTitle();
localStorage.setItem("emberisle-seat", JSON.stringify({ code: room2.code, secret: room2.s1 }));
g().rejoinTable();
await waitFor(() => g().screen === "play" && g().code === room2.code && g().state?.phase === "over", "B joined finished room2");
useGame.setState({
  offer: { tradeId: "stale-rematch", from: "p0", fromName: "Ember", give: { timber: 1 }, want: { wool: 1 }, until: null },
  declined: ["p2"],
  menuFor: "p0",
  rematchChoice: ["bots"],
  tradeOpen: true,
  buildMode: "outpost",
  roadPicks: ["e0"],
  pendingPlace: { kind: "vertex", id: "v0" },
});
A2.send({ type: "again" });
await waitFor(() => g().state?.phase !== "over", "B received rematch state");
assert.equal(g().offer, null, "3: online rematch clears offer");
assert.deepEqual(g().declined, [], "3: online rematch clears declined");
assert.equal(g().menuFor, null, "3: online rematch clears menuFor");
assert.equal(g().rematchChoice, undefined, "3: online rematch clears rematchChoice");
assert.equal(g().tradeOpen, false, "3: online rematch clears tradeOpen");
assert.equal(g().buildMode, "none", "3: online rematch clears buildMode");
assert.deepEqual(g().roadPicks, [], "3: online rematch clears roadPicks");
assert.equal(g().pendingPlace, null, "3: online rematch clears pendingPlace");
console.log("ok 3: online rematch clears stale offer, menuFor, rematchChoice, and build state");

// 4. Table loss (closed: keepSeat and Seat is gone) clears every transient game, trade, and HUD field.
useGame.setState({
  offer: { tradeId: "stale-closed", from: "p0", fromName: "Ember", give: { timber: 1 }, want: { wool: 1 }, until: null },
  declined: ["p2"],
  tradeOpen: true,
  buildMode: "outpost",
  roadPicks: ["e0"],
  pendingPlace: { kind: "vertex", id: "v0" },
  pendingSteal: { hexId: "0,0", kind: "moveRobber", targets: ["p0", "p2"] },
  menuFor: "p0",
  tableVariant: "expanded",
  rematchChoice: ["bots"],
  gameResult: { tracked: true, wins: { p0: 1 } },
  banner: "stale banner",
  ttt: { game: null, reason: "closed" },
});
// Seat taken by another tab triggers closed(keepSeat = true), clearing store while keeping saved seat.
const B2 = rawClient(wsUrl);
await B2.open;
B2.send({ type: "hello", proto: 1, caps: ["expanded"], code: room1.code, secret: room1.s1 });
await B2.next("welcome");
localStorage.setItem("emberisle-seat", JSON.stringify({ code: room1.code, secret: room1.s1 }));
g().rejoinTable();
await waitFor(() => g().screen === "title" && g().error === "Your seat is open in another tab", "keepSeat returned to title");
assert.ok(localStorage.getItem("emberisle-seat"), "4: keepSeat preserves saved seat");
assert.equal(g().offer, null, "4: keepSeat clears offer");
assert.equal(g().tradeOpen, false, "4: keepSeat clears tradeOpen");
assert.equal(g().pendingSteal, null, "4: keepSeat clears pendingSteal");
assert.equal(g().menuFor, null, "4: keepSeat clears menuFor");
assert.deepEqual(g().gameLog, [], "4: keepSeat clears gameLog");
assert.equal(g().tableVariant, undefined, "4: keepSeat clears tableVariant");
assert.equal(g().rematchChoice, undefined, "4: keepSeat clears rematchChoice");
assert.equal(g().banner, null, "4: keepSeat clears banner");

// Missing room triggers closed(keepSeat = false), clearing saved seat and all transient fields.
useGame.setState({
  screen: "play",
  offer: { tradeId: "stale-gone", from: "p0", fromName: "Ember", give: { timber: 1 }, want: { wool: 1 }, until: null },
  declined: ["p2"],
  tradeOpen: true,
  buildMode: "outpost",
  roadPicks: ["e0"],
  pendingPlace: { kind: "vertex", id: "v0" },
  pendingSteal: { hexId: "0,0", kind: "moveRobber", targets: ["p0", "p2"] },
  menuFor: "p0",
  tableVariant: "expanded",
  rematchChoice: ["bots"],
  gameResult: { tracked: true, wins: { p0: 1 } },
  banner: "stale banner",
  ttt: { game: null, reason: "closed" },
  gameLog: [{ at: 1, text: "old log" }],
});
localStorage.setItem("emberisle-seat", JSON.stringify({ code: "GONE", secret: "dead-secret" }));
g().rejoinTable();
await waitFor(() => g().screen === "title" && g().net === null, "closed returned to title");
assert.equal(localStorage.getItem("emberisle-seat"), null, "4: dead seat cleared from localStorage");
assert.equal(g().state, null, "4: state cleared on closed");
assert.equal(g().offer, null, "4: offer cleared on closed");
assert.deepEqual(g().declined, [], "4: declined cleared on closed");
assert.equal(g().tradeOpen, false, "4: tradeOpen cleared on closed");
assert.equal(g().tradeOutcome, null, "4: tradeOutcome cleared on closed");
assert.equal(g().buildMode, "none", "4: buildMode cleared on closed");
assert.deepEqual(g().roadPicks, [], "4: roadPicks cleared on closed");
assert.equal(g().pendingPlace, null, "4: pendingPlace cleared on closed");
assert.equal(g().pendingSteal, null, "4: pendingSteal cleared on closed");
assert.equal(g().menuFor, null, "4: menuFor cleared on closed");
assert.equal(g().legal, null, "4: legal cleared on closed");
assert.equal(g().turnTimer, null, "4: turnTimer cleared on closed");
assert.deepEqual(g().gameLog, [], "4: gameLog cleared on closed");
assert.equal(g().gameResult, null, "4: gameResult cleared on closed");
assert.equal(g().tableVariant, undefined, "4: tableVariant cleared on closed");
assert.equal(g().rematchChoice, undefined, "4: rematchChoice cleared on closed");
assert.equal(g().ttt, null, "4: ttt cleared on closed");
assert.equal(g().banner, null, "4: banner cleared on closed");
console.log("ok 4: table loss (keepSeat and closed) clears all transient trade, HUD, and log state");

// 5. Mode switches (4-seat practice -> 6-seat hotseat -> hotseat rematch -> goTitle) clear all transient fields.
useGame.setState({
  roadPicks: ["e1"],
  pendingPlace: { kind: "edge", id: "e1" },
  pendingSteal: { hexId: "0,0", kind: "playKnight", targets: ["p1", "p2"] },
  tradeOpen: true,
  menuFor: "p1",
  tableVariant: "expanded",
  rematchChoice: ["classic"],
  gameResult: { tracked: true, wins: { p0: 2 } },
  banner: "old banner",
});
g().startAi();
assert.equal(g().state.players.length, 4, "4: practice starts 4 seats");
assert.deepEqual(g().roadPicks, [], "4: startAi clears roadPicks");
assert.equal(g().pendingPlace, null, "4: startAi clears pendingPlace");
assert.equal(g().pendingSteal, null, "4: startAi clears pendingSteal");
assert.equal(g().tradeOpen, false, "4: startAi clears tradeOpen");
assert.equal(g().menuFor, null, "4: startAi clears menuFor");
assert.equal(g().gameResult, null, "4: startAi clears gameResult");
assert.equal(g().tableVariant, undefined, "4: startAi clears tableVariant");
assert.equal(g().rematchChoice, undefined, "4: startAi clears rematchChoice");
assert.equal(g().banner, null, "4: startAi clears banner");

useGame.setState({
  roadPicks: ["e2"],
  pendingPlace: { kind: "hex", id: "0,0" },
  pendingSteal: { hexId: "0,0", kind: "moveRobber", targets: ["p1", "p2"] },
  tradeOpen: true,
  menuFor: "p2",
  banner: "old banner 2",
});
g().startHotseat(6);
await waitFor(() => g().mode === "hotseat" && g().state?.players.length === 6, "6-seat hotseat dealt");
assert.deepEqual(g().roadPicks, [], "4: startHotseat(6) clears roadPicks");
assert.equal(g().pendingPlace, null, "4: startHotseat(6) clears pendingPlace");
assert.equal(g().pendingSteal, null, "4: startHotseat(6) clears pendingSteal");
assert.equal(g().tradeOpen, false, "4: startHotseat(6) clears tradeOpen");
assert.equal(g().menuFor, null, "4: startHotseat(6) clears menuFor");
assert.equal(g().banner, null, "4: startHotseat(6) clears banner");

// Hotseat rematch clears menuFor, offer, and banner while keeping 6 seats.
const logBefore = g().gameLog.length;
useGame.setState({
  state: { ...g().state, phase: "over", winner: "p0" },
  menuFor: "p3",
  offer: { tradeId: "stale", from: "p0", fromName: "Ember", give: { timber: 1 }, want: { wool: 1 }, until: null },
  banner: "win banner",
});
g().playAgain();
await waitFor(() => g().state?.phase !== "over", "6-seat hotseat rematch dealt");
assert.equal(g().state.players.length, 6, "4: hotseat rematch keeps 6 seats");
assert.equal(g().menuFor, null, "4: hotseat rematch clears menuFor");
assert.equal(g().offer, null, "4: hotseat rematch clears offer");
assert.equal(g().banner, null, "4: hotseat rematch clears banner");
assert.ok(g().gameLog.length >= logBefore, "4: hotseat rematch keeps gameLog");

// goTitle clears gameResult, tableVariant, rematchChoice, ttt, and banner.
useGame.setState({
  gameResult: { tracked: true, wins: { p0: 3 } },
  tableVariant: "expanded",
  rematchChoice: ["bots"],
  ttt: { game: null, reason: "closed" },
  banner: "leaving banner",
});
g().goTitle();
assert.equal(g().gameResult, null, "4: goTitle clears gameResult");
assert.equal(g().tableVariant, undefined, "4: goTitle clears tableVariant");
assert.equal(g().rematchChoice, undefined, "4: goTitle clears rematchChoice");
assert.equal(g().ttt, null, "4: goTitle clears ttt");
assert.equal(g().banner, null, "4: goTitle clears banner");
console.log("ok 5: startAi, startHotseat(6), playAgain, and goTitle clear all transient fields");

console.log("online-sync-reset-prove: ok");
process.exit(0);
