import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { chooseBotAction, chooseTradeAsk, shouldAcceptTrade } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, bankShort, legalCities, legalRoads, legalSettle, playable, stealTargets, validBag } from "../src/lib/game/rules.ts";
import { COST, PLAYER_COLORS, RESOURCES } from "../src/lib/game/types.ts";
import { allow, cleanText, loadEmotes, remember } from "./chat.mjs";
import { cue } from "./cue.mjs";

function hear(name) {
  try {
    cue(name);
  } catch {
    /* a missing sound must not take down the table */
  }
}

const PORT = Number(process.env.PORT ?? 8787);
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rooms = new Map();
const avatars = new Map(); // avatarId -> { body }
const AVATAR_BYTES = 256 * 1024;
// An env limit, or its default when the variable is unset or not a number.
function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}
// Every picture belongs to one seat and a seat holds one picture, so a table carries at most 4 x 256 KB (#369).
// These two cap the whole host: a full store refuses (503) rather than evict a seated player's picture.
const AVATAR_MAX = envNum("AVATAR_MAX", 128);
const AVATAR_STORE_BYTES = envNum("AVATAR_STORE_BYTES", 16 * 1024 * 1024);
const ROOM_MAX = envNum("ROOM_MAX", 64);
// Watchers per room (docs/design/spectator.md). A watcher has no seat and is never saved; 0 turns watching off.
const SPECTATOR_MAX = envNum("SPECTATOR_MAX", 8);
// A watcher coming or going is logged to the table at most this often per room, so a watch-and-close loop cannot
// flood the log; the `watching` count on `seats` is always exact.
const WATCH_LOG_MS = 5000;
// A seat's non-chat messages (ready, start, intents, trades): a burst of 20, refilled 4 a second. A person or a bot
// client stays far under this; a flood does not. Chat keeps its own 5-per-5s bucket. The proofs raise it through env.
const ACT_CAP = Number(process.env.ACT_CAP ?? 20);
const ACT_RATE = Number(process.env.ACT_RATE ?? 4);
// A dropped player keeps the seat: the bot takes over after the grace, the seat is let go after the hold
// (docs/research/rejoin.md). The proofs shorten both through env.
const GRACE_MS = Number(process.env.GRACE_MS ?? 90 * 1000);
const HOLD_MS = Number(process.env.HOLD_MS ?? 10 * 60 * 1000);
const LOBBY_HOLD_MS = Number(process.env.LOBBY_HOLD_MS ?? 90 * 1000);
// A connected player who stops taking their turn: after this long the host's bot makes that one move for the
// seat and the seat stays human (#344, Jarrod's call on #324). A dropped seat follows GRACE_MS instead, never this.
const TURN_MS = Number(process.env.TURN_MS ?? 120 * 1000);
// A bot seat answers a table ask after BOT_ANSWER_MS to twice that, so its Yes or No lands like a person's (#363).
const BOT_ANSWER_MS = Number(process.env.BOT_ANSWER_MS ?? 1000);
// Every socket is pinged this often; one that has not answered the last ping is cut, so a phone that
// locked or changed Wi-Fi frees its seat for the rejoin instead of holding it half-open (#202, #113).
const PING_MS = Number(process.env.PING_MS ?? 30 * 1000);
// Every room is saved to ROOMS/<code>.json after each change and reloaded on boot, so a host PC
// that sleeps or a Node crash does not end the game. Rooms saved more than a day ago are dropped.
const ROOMS = path.resolve(process.env.ROOMS_DIR ?? fileURLToPath(new URL("./rooms/", import.meta.url)));
// A change marks its room dirty and one write goes out SAVE_MS after the first change of a burst, so 50 quick
// actions are a handful of writes, not 50 (G5). SIGTERM, SIGINT and a normal exit flush every dirty room at once;
// kill -9 or a power cut can lose at most the last SAVE_MS of changes. The proofs shorten it through env.
const SAVE_MS = Number(process.env.SAVE_MS ?? 250);
const ROOM_TTL = 24 * 60 * 60 * 1000;
// Stamped on every saved room. Bump it whenever GameState, the seat record or the chat record changes
// shape: load() drops files with any other stamp (including none), so a bump ends the saved rooms on the next restart.
const ROOM_SHAPE = 2;
// The built client (npm run build). DIST lets a proof point the host at a small temp folder.
const DIST = path.resolve(process.env.DIST ?? fileURLToPath(new URL("../dist/", import.meta.url)));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
};
const EMOTES_DIR = fileURLToPath(new URL("../src/assets/emotes/", import.meta.url));
const EMOTES = loadEmotes(EMOTES_DIR);

function code() {
  let out = "";
  for (let i = 0; i < 4; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return rooms.has(out) ? code() : out;
}

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  const raw = JSON.stringify(msg);
  for (const seat of room.seats) if (seat.ws && seat.ws.readyState === seat.ws.OPEN) seat.ws.send(raw);
  for (const ws of room.watchers) if (ws.readyState === ws.OPEN) ws.send(raw);
}

function say(room, text) {
  broadcast(room, { type: "log", text });
}

// The engine keeps only the last 41 log lines (rules.ts `log`), so once the log is full its length never grows and
// `after.slice(before.length)` is empty (#319: the winner line never reached a seat). The new lines are what follows
// the longest tail of the old log that the new one still starts with.
function newLog(before, after) {
  for (let k = Math.min(before.length, after.length); k > 0; k--) {
    if (before.slice(-k).every((line, i) => line === after[i])) return after.slice(k);
  }
  return after;
}

function seatsOf(room) {
  return room.seats.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    avatarId: s.avatarId,
    ready: s.ready,
    host: s.id === room.host,
    away: !s.ws,
    url: s.avatarId ? `/avatars/${s.avatarId}.jpg` : null,
  }));
}

function seatsMsg(room) {
  return { type: "seats", code: room.code, seats: seatsOf(room), watching: room.watchers.size };
}

function publish(room) {
  broadcast(room, seatsMsg(room));
  save(room);
}

// A watcher came or went: the count goes out, nothing is saved (a watcher is never on disk), and the log line is coalesced.
function watchersChanged(room, text) {
  const now = Date.now();
  if (!(now - (room.watchSaid ?? 0) < WATCH_LOG_MS)) {
    room.watchSaid = now;
    say(room, text);
  }
  broadcast(room, seatsMsg(room));
}

// Sockets, timers and the open trade offer stay in memory; everything else goes to disk.
function save(room) {
  if (!rooms.has(room.code)) return;
  room.dirty = true;
  if (!room.saveTimer && !room.saving) room.saveTimer = setTimeout(() => flush(room), SAVE_MS);
}

function snapshot(room) {
  return JSON.stringify({
    code: room.code,
    host: room.host,
    next: room.next,
    chat: room.chat,
    chatSeq: room.chatSeq,
    game: room.game,
    seats: room.seats.map(({ id, name, color, ready, pid, secret }) => ({ id, name, color, ready, pid, secret })),
    shape: ROOM_SHAPE,
    savedAt: Date.now(),
  });
}

// One write at a time per room: changes that land mid-write set `dirty` again and the next write follows.
// Write then rename, so a crash mid-write never leaves half a room behind.
async function flush(room) {
  room.saveTimer = null;
  if (!room.dirty || !rooms.has(room.code)) return;
  room.dirty = false;
  room.saving = true;
  const file = path.join(ROOMS, `${room.code}.json`);
  try {
    const json = snapshot(room);
    await mkdir(ROOMS, { recursive: true });
    await writeFile(`${file}.tmp`, json);
    await rename(`${file}.tmp`, file);
  } catch (err) {
    console.error("save failed:", err);
  }
  room.saving = false;
  // The table closed while the write was in flight: the rename may have landed after unsave(), so remove it again.
  if (room.dropped) unsave(room);
  else if (room.dirty) room.saveTimer = setTimeout(() => flush(room), SAVE_MS);
}

// Synchronous, for the end of the process: every room with a change not yet on disk (or a write in flight) is written now.
function flushAll() {
  for (const room of rooms.values()) {
    if (!room.dirty && !room.saving) continue;
    clearTimeout(room.saveTimer);
    room.saveTimer = null;
    room.dirty = false;
    try {
      const file = path.join(ROOMS, `${room.code}.json`);
      mkdirSync(ROOMS, { recursive: true });
      writeFileSync(`${file}.tmp`, snapshot(room));
      renameSync(`${file}.tmp`, file);
    } catch (err) {
      console.error("save failed:", err);
    }
  }
}
process.on("exit", flushAll);
for (const [sig, code] of [["SIGINT", 130], ["SIGTERM", 143]]) process.on(sig, () => process.exit(code));

function unsave(room) {
  room.dropped = true;
  clearTimeout(room.saveTimer);
  room.saveTimer = null;
  rmSync(path.join(ROOMS, `${room.code}.json`), { force: true });
  rmSync(path.join(ROOMS, `${room.code}.json.tmp`), { force: true });
}

// Rebuild every saved room. Nobody is connected yet, so each seat is held as if it had just dropped.
function load() {
  let names;
  try {
    names = readdirSync(ROOMS).filter((n) => n.endsWith(".json"));
  } catch {
    return;
  }
  for (const name of names) {
    const file = path.join(ROOMS, name);
    let saved;
    try {
      saved = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      console.error("unreadable room file:", name);
      continue;
    }
    if (typeof saved?.code !== "string" || !Array.isArray(saved.seats) || !(Date.now() - saved.savedAt < ROOM_TTL) || saved.seats.length === 0) {
      rmSync(file, { force: true });
      continue;
    }
    if (saved.shape !== ROOM_SHAPE) {
      console.error(`stale room file: ${name} (shape ${saved.shape}, want ${ROOM_SHAPE})`);
      rmSync(file, { force: true });
      continue;
    }
    const g = saved.game;
    if (g !== null && (typeof g !== "object" || !["players", "vertices", "edges", "seq", "phase"].every((k) => k in g))) {
      console.error(`bad game in room file: ${name}`);
      rmSync(file, { force: true });
      continue;
    }
    // A file that parses but does not rebuild (a null seat, say) is skipped like one that does not parse.
    let room;
    try {
      room = { ...saved, offer: null, offerTimer: null, seats: [], watchers: new Set() };
      delete room.savedAt;
      for (const s of saved.seats) {
        if (typeof s?.id !== "string" || typeof s.secret !== "string") throw new Error(`bad seat ${JSON.stringify(s)}`);
        // Avatars live in memory only, so a restored seat has none.
        room.seats.push({ ...s, avatarId: null, ws: null, bucket: { tokens: 5, at: Date.now() }, act: { tokens: ACT_CAP, at: Date.now() } });
      }
    } catch (err) {
      console.error("unreadable room file:", name, err.message);
      continue;
    }
    // Every seat comes back held, and a held seat is not ready (#280).
    if (!room.game) for (const seat of room.seats) seat.ready = false;
    for (const seat of room.seats) hold(room, seat);
    rooms.set(room.code, room);
  }
  if (rooms.size) console.log(`restored ${rooms.size} room(s): ${[...rooms.keys()].join(" ")}`);
}

function affords(player, cost) {
  return Object.entries(cost).every(([r, n]) => player.resources[r] >= n);
}

// What `you` may do right now. Empty lists mean hide the button (build bible 4.2).
export function legalFor(game, you) {
  const me = game.players.find((p) => p.id === you);
  const out = { outpost: [], path: [], stronghold: [], wayfarer: [], steal: {}, discard: 0, actions: [] };
  if (!me || game.phase === "over") return out;
  if (game.phase === "discard") {
    out.discard = game.discardNeeded[you] ?? 0;
    if (out.discard > 0) out.actions.push("discard");
    return out;
  }
  if (game.current !== you) return out;
  if (game.phase === "setupSettle") out.outpost = legalSettle(game, you, true);
  if (game.phase === "setupRoad") out.path = legalRoads(game, you, true);
  if (game.phase === "roll" || game.phase === "rollOff") out.actions.push("roll");
  if (game.phase === "robber") out.wayfarer = game.hexes.filter((h) => h.id !== game.robberHex).map((h) => h.id);
  if (game.phase === "main") {
    if (me.pathsLeft > 0 && affords(me, COST.path)) out.path = legalRoads(game, you, false);
    if (me.outpostsLeft > 0 && affords(me, COST.outpost)) out.outpost = legalSettle(game, you, false);
    if (me.strongholdsLeft > 0 && affords(me, COST.stronghold)) out.stronghold = legalCities(game, you);
    if (affords(me, COST.card) && game.deck.length > 0) out.actions.push("buy");
    out.actions.push("trade", "pass");
  }
  if ((game.phase === "roll" || game.phase === "main") && !game.playedCard) {
    for (const card of ["knight", "road", "plenty", "monopoly"]) {
      if (playable(me, card) > 0 && (card === "knight" || game.phase === "main")) out.actions.push(`play:${card}`);
    }
  }
  // Moving the wayfarer and playing a knight both need to know whom each hex can rob.
  if (game.phase === "robber" || out.actions.includes("play:knight")) {
    for (const h of game.hexes) {
      if (h.id === game.robberHex) continue;
      const targets = stealTargets(game, h.id, you);
      if (targets.length) out.steal[h.id] = targets;
    }
  }
  return out;
}

// Hidden fortunes and the deck order stay on the host until the game ends.
export function viewFor(game, you) {
  if (game.phase === "over") return { ...game, deckLeft: game.deck.length };
  return closedView(game, you);
}

// A watcher gets the opponent view, and at the win the same reveal as the seats minus the seed and rng (#347).
function watchView(game) {
  if (game.phase !== "over") return closedView(game, null);
  const { seed, rng, ...open } = game;
  return { ...open, deckLeft: game.deck.length };
}

function closedView(game, you) {
  // The seed rebuilds the whole fortune deck, and rng predicts which card a steal takes (#111).
  // Other players' hands go out as a count only, like cards held face down (#186).
  const { seed, rng, ...open } = game;
  return {
    ...open,
    deck: [],
    deckLeft: game.deck.length,
    players: game.players.map((p) =>
      p.id === you
        ? p
        : {
            ...withoutHand(p),
            goods: RESOURCES.reduce((n, r) => n + p.resources[r], 0),
            hidden: { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 },
            boughtThisTurn: { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 },
            fortunes: Object.values(p.hidden).reduce((a, b) => a + b, 0),
          },
    ),
  };
}

function withoutHand({ resources, ...rest }) {
  return rest;
}

// A player who leaves mid-game is played by the practice bot so the table never hangs.
function runBots(room) {
  for (let i = 0; i < 500 && room.game.phase !== "over"; i++) {
    const g = room.game;
    const waiting =
      g.phase === "discard"
        ? g.players.find((p) => p.kind === "bot" && (g.discardNeeded[p.id] ?? 0) > 0)
        : g.players.find((p) => p.kind === "bot" && p.id === g.current);
    if (!waiting) return;
    // A bot's own ask is open: its turn waits for the answers, and the offer's close plays on (botsOn).
    if (room.offer?.from === waiting.id) return;
    // Once per bot turn, before its other moves, the bot may ask the table (#363).
    if (g.phase === "main" && !room.offer && room.botAsked !== `${g.turn}:${waiting.id}`) {
      room.botAsked = `${g.turn}:${waiting.id}`;
      const ask = chooseTradeAsk(g, waiting.id);
      if (ask) return openOffer(room, waiting.id, ask.give, ask.want);
    }
    const action = chooseBotAction(g, waiting.id);
    const next = action && applyAction(g, waiting.id, action);
    if (!next || next.error) {
      const pass = applyAction(g, waiting.id, { type: "endTurn" });
      if (pass.error) return;
      room.game = pass.state;
    } else room.game = next.state;
  }
}

// The game waits on `pid` when legalFor gives it anything to do: the current seat in setup, roll, main or robber,
// and every seat that owes a discard. Any phase that waits on one seat (a roll-off, say) is covered the same way.
function waitedOn(game, pid) {
  const l = legalFor(game, pid);
  return l.actions.length > 0 || l.outpost.length > 0 || l.path.length > 0 || l.stronghold.length > 0 || l.wayfarer.length > 0;
}

function disarmTurn(seat) {
  clearTimeout(seat.turnTimer);
  seat.turnTimer = null;
  seat.turnDeadline = null;
}

// Every connected human seat the game waits on gets TURN_MS from the moment it became waited on. An accepted action
// from the seat disarms it first (play), so its window restarts; a dropped seat is disarmed (hold) and left to GRACE_MS.
function armTurns(room) {
  for (const seat of room.seats) {
    const human = room.game?.players.find((p) => p.id === seat.pid)?.kind === "human";
    if (!seat.ws || !human || !waitedOn(room.game, seat.pid)) disarmTurn(seat);
    else if (!seat.turnTimer) {
      seat.turnDeadline = Date.now() + TURN_MS;
      seat.turnTimer = setTimeout(() => turnOut(room, seat), TURN_MS);
    }
  }
}

// A bot action as the client would have sent it, so the timer's move runs through play() like any other.
function toIntent(action) {
  switch (action?.type) {
    case "roll":
      return { type: "roll" };
    case "setupSettle":
      return { type: "place", kind: "outpost", id: action.vertexId };
    case "setupRoad":
      return { type: "place", kind: "path", id: action.edgeId };
    case "moveRobber":
      return { type: "rob", hexId: action.hexId, stealFrom: action.stealFrom };
    case "discard":
      return { type: "discard", cards: action.resources };
    default:
      return null;
  }
}

// The window ran out: the host's bot makes one move for the seat (a roll, a halved discard, a wayfarer move, a setup
// placement; in main it passes and spends nothing). The seat stays human, and its next move is its own.
function turnOut(room, seat) {
  seat.turnTimer = null;
  seat.turnDeadline = null;
  if (!seat.ws || !waitedOn(room.game, seat.pid)) return;
  const intent = room.game.phase === "main" ? { type: "pass" } : toIntent(chooseBotAction(room.game, seat.pid));
  // A phase the bot has no move for yet: wait another window rather than send a move play() would refuse.
  if (!intent) return armTurns(room);
  say(room, `${seat.name} took too long; the table moved on.`);
  play(seat.ws, room, intent);
}

// The soonest armed window at the table, or null.
function deadlineOf(room) {
  return room.seats.reduce((d, s) => (s.turnDeadline && (!d || s.turnDeadline < d) ? s.turnDeadline : d), null);
}

function pushState(room) {
  armTurns(room);
  // The soonest armed window, and whose it is, so every HUD can count it down (#345). `serverNow` lets a client
  // whose clock is off still land on the host's moment.
  const soonest = room.seats.reduce((d, s) => (s.turnDeadline && (!d || s.turnDeadline < d.turnDeadline) ? s : d), null);
  const turnDeadline = soonest?.turnDeadline ?? null;
  save(room);
  for (const seat of room.seats) {
    if (!seat.ws) continue;
    send(seat.ws, {
      type: "state",
      you: seat.pid,
      game: viewFor(room.game, seat.pid),
      legal: legalFor(room.game, seat.pid),
      actionStamp: actionStamp(room, seat.ws),
      turnDeadline,
      turnPlayer: soonest?.pid ?? null,
      serverNow: Date.now(),
    });
  }
  if (!room.watchers.size) return;
  const raw = JSON.stringify({ type: "state", you: null, game: watchView(room.game), legal: legalFor(room.game, null), turnDeadline, turnPlayer: soonest?.pid ?? null, serverNow: Date.now() });
  for (const ws of room.watchers) if (ws.readyState === ws.OPEN) ws.send(raw);
}

// A connection-bound baseline for gameplay intents. Rejoin/restart gets a new connection id even when
// the game has not advanced; a rematch rotates it too, since turn/seq start over on the new island.
function actionStamp(room, ws) {
  ws.actionConnection ??= randomBytes(16).toString("hex");
  return { turn: room.game.turn, baseSeq: room.game.seq, connection: ws.actionConnection };
}

function freshAction(ws, room, msg) {
  const stamp = actionStamp(room, ws);
  const seen = (ws.seat.actionCids ??= []);
  if (
    ws.seat.ws !== ws ||
    typeof msg.cid !== "string" || msg.cid.length === 0 || msg.cid.length > 64 ||
    !Number.isSafeInteger(msg.turn) || msg.turn !== stamp.turn ||
    !Number.isSafeInteger(msg.baseSeq) || msg.baseSeq !== stamp.baseSeq ||
    msg.connection !== stamp.connection || seen.includes(msg.cid)
  ) {
    send(ws, { type: "error", message: "stale action: wait for the latest table state and try again." });
    // Resync this seat only. Refusing an intent must not rearm any clock, run bots, or write a room.
    const soonest = room.seats.reduce((d, s) => (s.turnDeadline && (!d || s.turnDeadline < d.turnDeadline) ? s : d), null);
    send(ws, {
      type: "state", you: ws.seat.pid, game: viewFor(room.game, ws.seat.pid),
      legal: legalFor(room.game, ws.seat.pid), actionStamp: stamp,
      turnDeadline: soonest?.turnDeadline ?? null, turnPlayer: soonest?.pid ?? null, serverNow: Date.now(),
    });
    return false;
  }
  // Consume once before dispatch, including a rules refusal: retrying is a new intent with a new cid.
  // The bounded seat ledger also covers asks/declines, which do not advance game.seq.
  seen.push(msg.cid);
  if (seen.length > 32) seen.shift();
  return true;
}

function gains(before, after) {
  const out = [];
  for (const p of after.players) {
    const was = before.players.find((x) => x.id === p.id);
    for (const r of RESOURCES) {
      const d = p.resources[r] - was.resources[r];
      if (d > 0) out.push({ player: p.id, name: p.name, resource: r, amount: d });
    }
  }
  return out;
}

// The seat whose welcome carried this secret, in whichever room.
function seatOf(secret) {
  if (typeof secret !== "string" || !secret) return null;
  const given = Buffer.from(secret);
  const same = (s) => {
    const own = Buffer.from(s.secret);
    return own.length === given.length && timingSafeEqual(own, given);
  };
  for (const room of rooms.values()) {
    const seat = room.seats.find(same);
    if (seat) return { room, seat };
  }
  return null;
}

function storeBytes() {
  let n = 0;
  for (const a of avatars.values()) n += a.body.length;
  return n;
}

function forgetAvatar(seat) {
  if (seat.avatarId) avatars.delete(seat.avatarId);
  seat.avatarId = null;
}

function route(req, res) {
  // #368: a target like "//" or "//[" makes new URL throw, which used to take the whole host down.
  const url = URL.parse(req.url, "http://127.0.0.1");
  if (!url) {
    res.writeHead(400);
    res.end();
    return;
  }
  if (req.method === "POST" && url.pathname === "/avatars") {
    // #369: only a seated player uploads, keyed by the secret from their welcome, and the picture becomes that
    // seat's own: it goes when the seat goes, and nobody else's hello can claim it. The host picks the id.
    const found = seatOf(req.headers["x-seat-secret"]);
    // Cut the socket once the answer is out, so a body still coming in is not read and the client still sees the status.
    const refuse = (status) => {
      res.writeHead(status, { connection: "close" });
      res.end(() => req.destroy());
    };
    if (!found) return refuse(403);
    const { room, seat } = found;
    if (!allow(seat.act, Date.now(), ACT_CAP, ACT_RATE)) return refuse(429);
    // Bytes this seat's current picture holds; its replacement frees them. Read again at the end, since the body
    // arrives over time and another upload may have landed meanwhile.
    const held = () => (seat.avatarId ? avatars.get(seat.avatarId).body.length : 0);
    if (avatars.size - (held() ? 1 : 0) >= AVATAR_MAX) return refuse(503);
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > AVATAR_BYTES) {
        res.writeHead(413, { connection: "close" });
        res.end();
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (res.headersSent) return;
      // The seat was let go, or its room dropped, while the body was still coming: nothing would ever free it.
      if (rooms.get(room.code) !== room || !room.seats.includes(seat)) return res.writeHead(410).end();
      const body = Buffer.concat(chunks);
      // Served as image/jpeg, so only JPEG bytes (SOI marker) are kept.
      if (size < 3 || body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff) return res.writeHead(400).end();
      if (storeBytes() - held() + size > AVATAR_STORE_BYTES) return res.writeHead(503).end();
      forgetAvatar(seat);
      const id = randomBytes(8).toString("hex");
      avatars.set(id, { body });
      seat.avatarId = id;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ avatarId: id, url: `/avatars/${id}.jpg` }));
      publish(room);
    });
    req.on("error", () => {});
    return;
  }
  const got = url.pathname.match(/^\/avatars\/(.+)\.jpg$/);
  if (req.method === "GET" && got && avatars.has(got[1])) {
    res.writeHead(200, { "content-type": "image/jpeg", "x-content-type-options": "nosniff" });
    res.end(avatars.get(got[1]).body);
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }
  res.writeHead(404);
  res.end();
}

// No single request may crash the host and drop every table.
const server = http.createServer((req, res) => {
  try {
    route(req, res);
  } catch (e) {
    console.error("http request failed:", e);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

// One address carries the page, the socket and the avatars, so a single tunnel reaches all three.
async function serveStatic(req, res) {
  const raw = req.url.split("?")[0];
  let file;
  try {
    const rel = decodeURIComponent(raw);
    if (rel.includes("\0")) throw new Error("nul");
    file = path.resolve(DIST, "." + (rel === "/" ? "/index.html" : rel));
  } catch {
    file = null;
  }
  if (!file || !file.startsWith(DIST + path.sep)) {
    res.writeHead(404);
    res.end();
    return;
  }
  let body;
  try {
    body = await readFile(file);
  } catch {
    if (raw === "/") {
      res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
      res.end("Run npm run build first.");
    } else {
      res.writeHead(404);
      res.end();
    }
    return;
  }
  const hashed = raw.startsWith("/assets/");
  res.writeHead(200, {
    "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
    "x-content-type-options": "nosniff",
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

// A name is the join key for the away marker, chat mentions and the log, so it is cleaned and made unique.
function seatName(room, raw, fallback) {
  const base = typeof raw === "string" ? Array.from(raw.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/ {2,}/g, " ").trim()).slice(0, 16).join("").trimEnd() : "";
  const name = base || fallback;
  const taken = (n) => room.seats.some((s) => s.name.toLowerCase() === n.toLowerCase());
  if (!taken(name)) return name;
  for (let i = 2; ; i++) {
    const tag = ` ${i}`;
    const next = Array.from(name).slice(0, 16 - tag.length).join("").trimEnd() + tag;
    if (!taken(next)) return next;
  }
}

// Only a palette swatch is accepted, since the colour reaches inline styles; anything else gets the first free one.
function seatColor(room, raw) {
  if (PLAYER_COLORS.includes(raw)) return raw;
  return PLAYER_COLORS.find((c) => !room.seats.some((s) => s.color === c));
}

function openTable(ws, msg) {
  if (rooms.size >= ROOM_MAX) return send(ws, { type: "error", message: "The host is full." });
  const room = { code: code(), seats: [], game: null, host: null, next: 0, offer: null, offerTimer: null, chat: [], chatSeq: 0, watchers: new Set() };
  rooms.set(room.code, room);
  const seat = {
    id: `s${room.next++}`,
    name: seatName(room, msg.name, "Ember"),
    color: seatColor(room, msg.color),
    // A picture is set by POST /avatars with this seat's secret, never by hello (#369).
    avatarId: null,
    ready: false,
    ws,
    bucket: { tokens: 5, at: Date.now() },
    act: { tokens: ACT_CAP, at: Date.now() },
    secret: randomBytes(16).toString("hex"),
  };
  room.seats.push(seat);
  room.host = seat.id;
  ws.room = room;
  ws.seat = seat;
  send(ws, { type: "welcome", code: room.code, you: seat.id, host: true, chat: room.chat, secret: seat.secret });
  say(room, `${seat.name} sat down.`);
  publish(room);
}

function sitDown(ws, msg) {
  const room = rooms.get(String(msg.code || "").toUpperCase());
  if (!room) return send(ws, { type: "error", message: "No table with that code" });
  if (room.game) return send(ws, { type: "error", message: "Game already started." });
  if (room.seats.length >= 4) return send(ws, { type: "error", message: "Table full." });
  const color = seatColor(room, msg.color);
  if (!color || room.seats.some((s) => s.color === color)) return send(ws, { type: "error", message: "Color taken." });
  const seat = {
    id: `s${room.next++}`,
    name: seatName(room, msg.name, "Tide"),
    color,
    avatarId: null,
    ready: false,
    ws,
    bucket: { tokens: 5, at: Date.now() },
    act: { tokens: ACT_CAP, at: Date.now() },
    secret: randomBytes(16).toString("hex"),
  };
  room.seats.push(seat);
  ws.room = room;
  ws.seat = seat;
  send(ws, { type: "welcome", code: room.code, you: seat.id, host: false, chat: room.chat, secret: seat.secret });
  say(room, `${seat.name} sat down.`);
  publish(room);
}

// hello {code, watch:true} on a started table: no seat, no secret, read-only (docs/design/spectator.md, #347).
function watch(ws, msg) {
  const room = rooms.get(String(msg.code || "").toUpperCase());
  if (!room) return send(ws, { type: "error", message: "No table with that code" });
  if (!room.game) return send(ws, { type: "error", message: "Not started yet." });
  if (room.watchers.size >= SPECTATOR_MAX) return send(ws, { type: "error", message: "Table is full to watch." });
  room.watchers.add(ws);
  ws.watch = room;
  send(ws, { type: "welcome", code: room.code, spectator: true, chat: room.chat });
  watchersChanged(room, "Someone is watching.");
  const soonest = room.seats.reduce((d, s) => (s.turnDeadline && (!d || s.turnDeadline < d.turnDeadline) ? s : d), null);
  send(ws, { type: "state", you: null, game: watchView(room.game), legal: legalFor(room.game, null), turnDeadline: deadlineOf(room), turnPlayer: soonest?.pid ?? null, serverNow: Date.now() });
}

function startGame(ws, room) {
  const n = room.seats.length;
  if (ws.seat.id !== room.host) return send(ws, { type: "error", message: "Only the host can start." });
  if (n < 3 || n > 4) return send(ws, { type: "error", message: "Need 3 or 4 at the table." });
  if (room.seats.some((s) => !s.ready)) return send(ws, { type: "error", message: "Not everyone is ready." });
  const game = createGame({ humans: room.seats.map((s) => ({ name: s.name })), bots: 0 });
  room.seats.forEach((s, i) => {
    s.pid = game.players[i].id;
    game.players[i].color = s.color;
  });
  room.game = game;
  for (const seat of room.seats) if (seat.ws) seat.ws.actionConnection = randomBytes(16).toString("hex");
  hear("ui_confirm");
  say(room, "Roll for first place.");
  pushState(room);
}

// `again` (#266, docs/design/rematch.md): a new island at the same table. The last winner places first and the rest
// roll off behind it (Jarrod, 2026-10-03). Seats with no socket are let go; watchers stay and get the new game.
function rematch(ws, room) {
  if (ws.seat.id !== room.host) return send(ws, { type: "error", message: "Only the host can start." });
  if (room.game?.phase !== "over") return send(ws, { type: "error", message: "Game is not over." });
  const live = room.seats.filter((s) => s.ws && s.ws.readyState === s.ws.OPEN);
  if (live.length < 3) return send(ws, { type: "error", message: "Need 3 or 4 at the table." });
  for (const seat of room.seats) {
    if (live.includes(seat)) continue;
    clearTimeout(seat.graceTimer);
    clearTimeout(seat.holdTimer);
    disarmTurn(seat);
    forgetAvatar(seat);
    seat.ws = null;
  }
  room.seats = live;
  // Seats get new pids below, so no offer (or a bot's answer timer on it) may outlive the old game.
  if (room.offer) broadcast(room, { type: "tradeClosed", tradeId: room.offer.tradeId });
  closeOffer(room);
  const winner = live.find((s) => s.pid === room.game.winner);
  const order = winner ? [winner, ...live.filter((s) => s !== winner)] : live;
  const game = createGame({ humans: order.map((s) => ({ name: s.name })), bots: 0, winnerFirst: Boolean(winner) });
  order.forEach((s, i) => {
    s.pid = game.players[i].id;
    game.players[i].color = s.color;
  });
  room.game = game;
  for (const seat of room.seats) seat.ws.actionConnection = randomBytes(16).toString("hex");
  hear("ui_confirm");
  say(room, winner ? `${winner.name} won last time and places first. The rest roll for their order.` : "Roll for first place.");
  publish(room);
  pushState(room);
}

// Build bible section 10 intents -> rules.ts actions.
function toAction(game, msg) {
  switch (msg.type) {
    case "roll":
      return { type: "roll" };
    case "place":
      if (msg.kind === "outpost") {
        return { type: game.phase === "setupSettle" ? "setupSettle" : "buildOutpost", vertexId: msg.id };
      }
      if (msg.kind === "path") return { type: game.phase === "setupRoad" ? "setupRoad" : "buildPath", edgeId: msg.id };
      if (msg.kind === "stronghold") return { type: "buildStronghold", vertexId: msg.id };
      return null;
    case "buy":
      return { type: "buyCard" };
    case "play":
      if (msg.card === "knight") return { type: "playKnight", hexId: msg.hexId, stealFrom: msg.stealFrom ?? null };
      if (msg.card === "road") return { type: "playRoad", edgeIds: msg.ids ?? [] };
      if (msg.card === "plenty") return { type: "playPlenty", resources: msg.resources ?? [] };
      if (msg.card === "monopoly") return { type: "playMonopoly", resource: msg.resource };
      return null;
    case "rob":
      return { type: "moveRobber", hexId: msg.hexId, stealFrom: msg.stealFrom ?? null };
    case "discard":
      return { type: "discard", resources: msg.cards ?? msg.resources ?? {} };
    case "tradeBank":
      return { type: "bankTrade", give: msg.give, want: msg.take ?? msg.want };
    case "pass":
      return { type: "endTurn" };
    default:
      return null;
  }
}

const SOUND = {
  roll: "dice_land",
  buy: "card_buy",
  play: "card_play",
  rob: "ui_confirm",
  discard: "chip_gain",
  tradeBank: "trade_yes",
  pass: "ui_click",
};

function closeOffer(room) {
  if (room.offerTimer) clearTimeout(room.offerTimer);
  for (const t of room.offer?.botTimers ?? []) clearTimeout(t);
  room.offerTimer = null;
  room.offer = null;
}

// A bot's ask paused its turn in runBots; once that offer is gone the bots play on. With nobody connected they wait,
// as in takeOver, and a rejoin runs them. True when it pushed the state.
function botsOn(room, offer) {
  if (room.game.players.find((p) => p.id === offer.from)?.kind !== "bot" || !room.seats.some((s) => s.ws)) return false;
  const seen = room.game.log;
  const phase = room.game.phase;
  runBots(room);
  for (const line of newLog(seen, room.game.log)) say(room, line);
  if (room.game.phase === "over" && phase !== "over") hear("win");
  pushState(room);
  return true;
}

// Opens the table offer for `from`, closing any earlier one. Every other bot seat answers it after a short delay.
function openOffer(room, from, give, want) {
  if (room.offer) broadcast(room, { type: "tradeClosed", tradeId: room.offer.tradeId });
  closeOffer(room);
  const tradeId = `t${room.game.seq}-${(room.offerSeq = (room.offerSeq ?? 0) + 1)}`;
  const offer = (room.offer = { tradeId, from, give, want, declined: new Set(), botTimers: [] });
  room.offerTimer = setTimeout(() => {
    closeOffer(room);
    broadcast(room, { type: "tradeClosed", tradeId });
    botsOn(room, offer);
  }, 20000);
  broadcast(room, { type: "tradeOffer", tradeId, from, give, want, seconds: 20 });
  for (const p of room.game.players) {
    if (p.kind !== "bot" || p.id === from) continue;
    offer.botTimers.push(setTimeout(() => botAnswer(room, offer, p.id), BOT_ANSWER_MS + randomInt(BOT_ANSWER_MS + 1)));
  }
}

// The seat may have been taken back by its player, or the offer closed, while the bot was "thinking".
function botAnswer(room, offer, pid) {
  if (room.offer !== offer || room.game.players.find((p) => p.id === pid)?.kind !== "bot") return;
  respond(room, pid, shouldAcceptTrade(room.game, pid, offer));
}

function ask(ws, room, msg) {
  const actor = ws.seat.pid;
  if (room.game.phase !== "main" || room.game.current !== actor) {
    return send(ws, { type: "error", message: "Cannot trade now." });
  }
  if (!validBag(msg.give) || !validBag(msg.want)) return send(ws, { type: "error", message: "Bad trade." });
  const asker = room.game.players.find((p) => p.id === actor);
  if (RESOURCES.some((r) => (msg.give[r] ?? 0) > asker.resources[r])) return send(ws, { type: "error", message: "You lack those goods." });
  if (RESOURCES.every((r) => !msg.give[r] && !msg.want[r])) return send(ws, { type: "error", message: "Offer something." });
  openOffer(room, actor, msg.give, msg.want);
}

function answer(ws, room, msg) {
  const actor = ws.seat.pid;
  const offer = room.offer;
  if (!offer || actor === offer.from || (msg.tradeId && msg.tradeId !== offer.tradeId)) {
    return send(ws, { type: "error", message: "Offer is gone." });
  }
  const error = respond(room, actor, Boolean(msg.yes ?? msg.accept));
  if (error) send(ws, { type: "error", message: error });
}

// `actor`'s Yes or No to the open offer, from a person or a bot seat. Returns an error for that seat, if any.
function respond(room, actor, yes) {
  const offer = room.offer;
  if (!yes) {
    // A "No" is told to the whole table. The offer stays open for seats that have not answered and
    // closes once every other seat, person or bot, has declined.
    if (offer.declined.has(actor)) return;
    offer.declined.add(actor);
    hear("trade_no");
    const name = room.game.players.find((p) => p.id === actor).name;
    broadcast(room, { type: "tradeDeclined", tradeId: offer.tradeId, by: actor, name });
    say(room, `${name} declines.`);
    const askees = room.game.players.filter((p) => p.id !== offer.from);
    if (askees.every((p) => offer.declined.has(p.id))) {
      closeOffer(room);
      broadcast(room, { type: "tradeClosed", tradeId: offer.tradeId });
      botsOn(room, offer);
    }
    return;
  }
  const offered = applyAction(room.game, offer.from, { type: "offerTrade", to: actor, give: offer.give, want: offer.want });
  // Every offerTrade refusal is the asker's (wrong phase, short of the goods), so the offer is dead for the whole table.
  if (offered.error) {
    closeOffer(room);
    broadcast(room, { type: "tradeClosed", tradeId: offer.tradeId });
    botsOn(room, offer);
    return "Offer is gone.";
  }
  const accepted = applyAction(offered.state, actor, { type: "respondTrade", accept: true });
  if (accepted.error) return accepted.error;
  closeOffer(room);
  room.game = accepted.state;
  // The asker's trade went through: that is their action, so their window restarts (pushState re-arms it).
  const asker = room.seats.find((s) => s.pid === offer.from);
  if (asker) disarmTurn(asker);
  hear("trade_yes");
  broadcast(room, { type: "tradeClosed", tradeId: offer.tradeId, taker: actor });
  if (!botsOn(room, offer)) pushState(room);
}

function talk(ws, room, msg) {
  const seat = ws.seat;
  if (!allow(seat.bucket, Date.now())) return send(ws, { type: "error", message: "Slow down." });
  if (msg.type === "chat") {
    const text = cleanText(msg.text);
    if (text === null) return;
    const line = { id: room.chatSeq++, seat: seat.id, player: seat.pid ?? null, name: seat.name, color: seat.color, text, at: Date.now() };
    remember(room.chat, line);
    broadcast(room, { type: "chat", ...line });
    save(room);
    return;
  }
  // Keep the six exact emoji in sync with emotes.ts; chat-prove exercises every picker entry.
  const emoji = new Set(["😠", "😊", "👏", "😂", "🔥", "🐑"]);
  if (!EMOTES.has(msg.emote) && !emoji.has(msg.emote)) return;
  let to = typeof msg.to === "string" ? msg.to : null;
  if (to && !room.seats.some((s) => s.id === to || s.pid === to)) to = null;
  broadcast(room, { type: "react", seat: seat.id, player: seat.pid ?? null, emote: msg.emote, to, at: Date.now() });
}

function play(ws, room, msg) {
  const before = room.game;
  const action = toAction(before, msg);
  if (!action) return send(ws, { type: "error", message: "not ready" });
  const next = applyAction(before, ws.seat.pid, action);
  if (next.error) {
    hear("ui_error");
    return send(ws, { type: "error", message: next.error });
  }
  room.game = next.state;
  disarmTurn(ws.seat);
  hear(msg.type === "place" ? `${msg.kind}_place` : SOUND[msg.type]);
  // A roll-off die is not a production roll: its lines reach every seat through the log below.
  if (msg.type === "roll" && before.phase === "roll") {
    const [a, b] = room.game.dice;
    const paid = gains(before, room.game);
    const short = bankShort(room.game);
    broadcast(room, { type: "rolled", dice: [a, b], sum: a + b, gains: paid, short });
    const parts = paid.map((g) => `${g.name} +${g.amount} ${g.resource}`);
    if (short.length) parts.push(`bank short of ${short.join(" and ")}`);
    say(room, [String(a + b), ...parts].join(" · "));
  }
  // An offer lives only while its asker still has the turn in `main` and still holds the offered goods. Checked before
  // the bots play, so a bot never sees the stale offer of a seat that just passed.
  const open = room.offer;
  let withdrawn = null;
  if (open) {
    const asker = room.game.players.find((p) => p.id === open.from);
    const turnOver = room.game.current !== open.from || room.game.phase !== "main";
    const spent = RESOURCES.some((r) => (open.give[r] ?? 0) > asker.resources[r]);
    if (turnOver || spent) {
      closeOffer(room);
      broadcast(room, { type: "tradeClosed", tradeId: open.tradeId });
      if (!turnOver) withdrawn = `${asker.name} spent the offered goods; the offer is withdrawn.`;
    }
  }
  runBots(room);
  for (const line of newLog(before.log, room.game.log)) say(room, line);
  if (withdrawn) say(room, withdrawn);
  if (room.game.phase === "over" && before.phase !== "over") hear("win");
  pushState(room);
}

wss.on("connection", (ws) => {
  // An over-limit frame (maxPayload) raises 'error' on this one socket; with no listener here,
  // Node's default behavior is to throw and take down the whole host. One bad frame must only
  // close that socket (ws already sends close code 1009) and never the other tables.
  ws.on("error", () => {});
  ws.alive = true;
  ws.bucket = { tokens: 5, at: Date.now() };
  ws.on("pong", () => (ws.alive = true));
  ws.on("message", (raw) => {
    try {
      handle(ws, raw);
    } catch (err) {
      // One bad message must never take down every table on this host.
      console.error("message failed:", err);
      send(ws, { type: "error", message: "not ready" });
    }
  });
  ws.on("close", () => {
    try {
      leave(ws);
    } catch (err) {
      console.error("leave failed:", err);
    }
  });
});

function handle(ws, raw) {
  // A watcher sends nothing after its hello. Above the parse and the seatless branch, so it can never sit down or rejoin.
  if (ws.watch) {
    if (!allow(ws.bucket, Date.now())) return;
    return send(ws, { type: "error", message: "Watching only." });
  }
  let msg;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    return send(ws, { type: "error", message: "not ready" });
  }
  if (!msg || typeof msg !== "object") return send(ws, { type: "error", message: "not ready" });
  if (!ws.room) {
    // A socket with no seat has no seat.bucket; this one throttles the pre-seat frames (docs/design/color-peek.md).
    const ok = allow(ws.bucket, Date.now());
    if (msg.type === "peek") return ok ? peek(ws, msg) : undefined;
    if (!ok && (msg.type === "create" || msg.type === "join" || msg.type === "hello")) return send(ws, { type: "error", message: "Slow down." });
    if (msg.type === "hello" && msg.watch === true) return watch(ws, msg);
    // hello with no code opens a table; hello with a code sits down (build bible 2.3, 10).
    if (msg.type === "create" || (msg.type === "hello" && !msg.code)) return openTable(ws, msg);
    if (msg.type === "hello" && typeof msg.secret === "string") return rejoin(ws, msg);
    if (msg.type === "join" || msg.type === "hello") return sitDown(ws, msg);
    return send(ws, { type: "error", message: "not ready" });
  }
  const room = ws.room;
  if (msg.type === "chat" || msg.type === "react") return talk(ws, room, msg);
  if (!allow(ws.seat.act, Date.now(), ACT_CAP, ACT_RATE)) return send(ws, { type: "error", message: "Slow down." });
  if (msg.type === "ready") {
    const value = Boolean(msg.value);
    if (ws.seat.ready === value) return;
    ws.seat.ready = value;
    return publish(room);
  }
  if (msg.type === "start") return room.game ? send(ws, { type: "error", message: "Game already started." }) : startGame(ws, room);
  if (msg.type === "again") return rematch(ws, room);
  if (!room.game) return send(ws, { type: "error", message: "not ready" });
  if (!freshAction(ws, room, msg)) return;
  if (msg.type === "tradeAsk") return ask(ws, room, msg);
  if (msg.type === "tradeAnswer") return answer(ws, room, msg);
  return play(ws, room, msg);
}

const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

// Answers which seats a lobby holds, without sitting down (docs/design/color-peek.md).
function peek(ws, msg) {
  const code = typeof msg.code === "string" ? msg.code.toUpperCase() : "";
  if (!CODE.test(code)) return;
  const room = rooms.get(code);
  send(ws, { type: "seats", code, seats: room && !room.game ? seatsOf(room) : [] });
}

// hello {code, secret} puts a dropped player back in their own seat, even after the bot took over.
function rejoin(ws, msg) {
  const room = rooms.get(String(msg.code || "").toUpperCase());
  if (!room) return send(ws, { type: "error", message: "No table with that code" });
  const seat = room.seats.find((s) => s.secret === msg.secret);
  if (!seat) return send(ws, { type: "error", message: "Seat is gone." });
  if (seat.ws && seat.ws.readyState === seat.ws.OPEN) return send(ws, { type: "error", message: "Seat is taken." });
  clearTimeout(seat.graceTimer);
  clearTimeout(seat.holdTimer);
  seat.graceTimer = seat.holdTimer = null;
  seat.ws = ws;
  seat.gone = null;
  ws.room = room;
  ws.seat = seat;
  send(ws, { type: "welcome", code: room.code, you: seat.id, host: seat.id === room.host, chat: room.chat, secret: seat.secret });
  say(room, `${seat.name} is back.`);
  publish(room);
  if (!room.game) return;
  const p = room.game.players.find((x) => x.id === seat.pid);
  if (p?.kind === "bot") {
    room.game = { ...room.game, players: room.game.players.map((x) => (x === p ? { ...x, kind: "human", name: seat.name } : x)) };
  }
  // Other seats may have become bots while nobody was here to watch them play.
  const seen = room.game.log;
  runBots(room);
  for (const line of newLog(seen, room.game.log)) say(room, line);
  pushState(room);
}

function dropRoom(room) {
  closeOffer(room);
  for (const seat of room.seats) {
    clearTimeout(seat.graceTimer);
    clearTimeout(seat.holdTimer);
    clearTimeout(seat.turnTimer);
    forgetAvatar(seat);
  }
  for (const ws of room.watchers) {
    send(ws, { type: "error", message: "The table closed." });
    ws.close();
  }
  room.watchers.clear();
  rooms.delete(room.code);
  unsave(room);
}

// A seat with no socket: the bot takes it after the grace (in a game), and it is let go after the hold.
function hold(room, seat) {
  seat.ws = null;
  seat.gone = Date.now();
  // A dropped seat is the grace timer's business, never the turn timer's (#344).
  disarmTurn(seat);
  if (room.game && seat.pid) seat.graceTimer = setTimeout(() => takeOver(room, seat), GRACE_MS);
  seat.holdTimer = setTimeout(() => letGo(room, seat), room.game ? HOLD_MS : LOBBY_HOLD_MS);
}

// The host role goes to the first seat with a socket; with none, to the first held seat.
function handOffHost(room) {
  const next = room.seats.find((s) => s.ws) ?? room.seats[0];
  room.host = next.id;
  say(room, `${next.name} is now the host.`);
}

// The grace is over: the practice bot plays the seat so the table never waits longer than that.
function takeOver(room, seat) {
  seat.graceTimer = null;
  const p = room.game.players.find((x) => x.id === seat.pid);
  if (!p || p.kind === "bot") return;
  room.game = { ...room.game, players: room.game.players.map((x) => (x === p ? { ...x, kind: "bot", name: `${x.name} (bot)` } : x)) };
  say(room, `${seat.name} is played by the bot until they return.`);
  save(room);
  // With nobody connected, the bots wait too: a rejoin runs them.
  if (!room.seats.some((s) => s.ws)) return;
  const seen = room.game.log;
  runBots(room);
  for (const line of newLog(seen, room.game.log)) say(room, line);
  pushState(room);
}

// The hold is over: the seat is let go for good. The bot keeps playing the player.
function letGo(room, seat) {
  clearTimeout(seat.graceTimer);
  forgetAvatar(seat);
  room.seats = room.seats.filter((s) => s !== seat);
  if (room.seats.length === 0) return dropRoom(room);
  if (!room.game) say(room, `${seat.name} left.`);
  if (room.host === seat.id) handOffHost(room);
  publish(room);
}

function leave(ws) {
  if (ws.watch) {
    const room = ws.watch;
    ws.watch = null;
    if (!room.watchers.delete(ws) || !rooms.has(room.code)) return;
    watchersChanged(room, "A watcher left.");
    return;
  }
  const room = ws.room;
  if (!room) return;
  const seat = ws.seat;
  // A socket replaced by a rejoin closing late must not touch the seat it no longer holds.
  if (seat.ws !== ws) return;
  if (room.game && seat.pid) {
    hold(room, seat);
    say(room, `${seat.name} lost connection.`);
    publish(room);
    return;
  }
  // In the lobby the seat is held too, so a locked phone keeps its seat; it cannot be ready while away.
  seat.ready = false;
  hold(room, seat);
  say(room, `${seat.name} lost connection.`);
  // A held host hands the role to a live seat now and does not get it back on return.
  if (room.host === seat.id && room.seats.some((s) => s.ws)) handOffHost(room);
  publish(room);
}

// terminate() fires "close", so leave() holds the seat and starts the grace like any other drop.
const pinger = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
}, PING_MS);
pinger.unref();
wss.on("close", () => clearInterval(pinger));

load();
server.listen(PORT, () => console.log(`host listening ${server.address().port}`));
