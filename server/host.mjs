import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomInt } from "node:crypto";
import { WebSocketServer } from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, legalCities, legalRoads, legalSettle, playable, stealTargets, validBag } from "../src/lib/game/rules.ts";
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
const avatars = new Map(); // avatarId -> { body, at }
const AVATAR_BYTES = 256 * 1024;
const AVATAR_MAX = 64;
const ROOM_MAX = Number(process.env.ROOM_MAX ?? 64);
// A seat's non-chat messages (ready, start, intents, trades): a burst of 20, refilled 4 a second. A person or a bot
// client stays far under this; a flood does not. Chat keeps its own 5-per-5s bucket. The proofs raise it through env.
const ACT_CAP = Number(process.env.ACT_CAP ?? 20);
const ACT_RATE = Number(process.env.ACT_RATE ?? 4);
const AVATAR_TTL = 60 * 60 * 1000; // an upload nobody sat down with is dropped after an hour
// A dropped player keeps the seat: the bot takes over after the grace, the seat is let go after the hold
// (docs/research/rejoin.md). The proofs shorten both through env.
const GRACE_MS = Number(process.env.GRACE_MS ?? 90 * 1000);
const HOLD_MS = Number(process.env.HOLD_MS ?? 10 * 60 * 1000);
const LOBBY_HOLD_MS = Number(process.env.LOBBY_HOLD_MS ?? 90 * 1000);
// Every socket is pinged this often; one that has not answered the last ping is cut, so a phone that
// locked or changed Wi-Fi frees its seat for the rejoin instead of holding it half-open (#202, #113).
const PING_MS = Number(process.env.PING_MS ?? 30 * 1000);
// Every room is saved to ROOMS/<code>.json after each change and reloaded on boot, so a host PC
// that sleeps or a Node crash does not end the game. Rooms saved more than a day ago are dropped.
const ROOMS = path.resolve(process.env.ROOMS_DIR ?? fileURLToPath(new URL("./rooms/", import.meta.url)));
const ROOM_TTL = 24 * 60 * 60 * 1000;
// The built client (npm run build). DIST lets a proof point the host at a small temp folder.
const DIST = path.resolve(process.env.DIST ?? fileURLToPath(new URL("../dist/", import.meta.url)));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
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
}

function say(room, text) {
  broadcast(room, { type: "log", text });
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

function publish(room) {
  broadcast(room, { type: "seats", code: room.code, seats: seatsOf(room) });
  save(room);
}

// Sockets, timers and the open trade offer stay in memory; everything else goes to disk.
function save(room) {
  if (!rooms.has(room.code)) return;
  const out = {
    code: room.code,
    host: room.host,
    next: room.next,
    chat: room.chat,
    chatSeq: room.chatSeq,
    game: room.game,
    seats: room.seats.map(({ id, name, color, ready, pid, secret }) => ({ id, name, color, ready, pid, secret })),
    savedAt: Date.now(),
  };
  try {
    mkdirSync(ROOMS, { recursive: true });
    const file = path.join(ROOMS, `${room.code}.json`);
    // Write then rename, so a crash mid-write never leaves half a room behind.
    writeFileSync(`${file}.tmp`, JSON.stringify(out));
    renameSync(`${file}.tmp`, file);
  } catch (err) {
    console.error("save failed:", err);
  }
}

function unsave(room) {
  rmSync(path.join(ROOMS, `${room.code}.json`), { force: true });
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
    // A file that parses but does not rebuild (a null seat, say) is skipped like one that does not parse.
    let room;
    try {
      room = { ...saved, avatarIds: [], offer: null, offerTimer: null, seats: [] };
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
  if (game.phase === "roll") out.actions.push("roll");
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
    const action = chooseBotAction(g, waiting.id);
    const next = action && applyAction(g, waiting.id, action);
    if (!next || next.error) {
      const pass = applyAction(g, waiting.id, { type: "endTurn" });
      if (pass.error) return;
      room.game = pass.state;
    } else room.game = next.state;
  }
}

function pushState(room) {
  save(room);
  for (const seat of room.seats) {
    if (!seat.ws) continue;
    send(seat.ws, {
      type: "state",
      you: seat.pid,
      game: viewFor(room.game, seat.pid),
      legal: legalFor(room.game, seat.pid),
    });
  }
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "POST" && url.pathname === "/avatars") {
    // The host picks the id, so nobody can overwrite someone else's picture.
    const inUse = new Set([...rooms.values()].flatMap((r) => r.avatarIds));
    for (const [id, a] of avatars) if (!inUse.has(id) && Date.now() - a.at > AVATAR_TTL) avatars.delete(id);
    if (avatars.size >= AVATAR_MAX) {
      res.writeHead(503);
      res.end();
      req.destroy();
      return;
    }
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
      if (size > AVATAR_BYTES || size === 0) {
        if (!res.headersSent) res.writeHead(400).end();
        return;
      }
      const id = randomBytes(8).toString("hex");
      avatars.set(id, { body: Buffer.concat(chunks), at: Date.now() });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ avatarId: id, url: `/avatars/${id}.jpg` }));
    });
    req.on("error", () => {});
    return;
  }
  const got = url.pathname.match(/^\/avatars\/(.+)\.jpg$/);
  if (req.method === "GET" && got && avatars.has(got[1])) {
    res.writeHead(200, { "content-type": "image/jpeg" });
    res.end(avatars.get(got[1]).body);
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }
  res.writeHead(404);
  res.end();
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
  const room = { code: code(), seats: [], game: null, host: null, next: 0, avatarIds: [], offer: null, offerTimer: null, chat: [], chatSeq: 0 };
  rooms.set(room.code, room);
  const seat = {
    id: `s${room.next++}`,
    name: seatName(room, msg.name, "Ember"),
    color: seatColor(room, msg.color),
    avatarId: avatars.has(msg.avatarId) ? msg.avatarId : null,
    ready: false,
    ws,
    bucket: { tokens: 5, at: Date.now() },
    act: { tokens: ACT_CAP, at: Date.now() },
    secret: randomBytes(16).toString("hex"),
  };
  if (seat.avatarId) room.avatarIds.push(seat.avatarId);
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
    avatarId: avatars.has(msg.avatarId) ? msg.avatarId : null,
    ready: false,
    ws,
    bucket: { tokens: 5, at: Date.now() },
    act: { tokens: ACT_CAP, at: Date.now() },
    secret: randomBytes(16).toString("hex"),
  };
  if (seat.avatarId) room.avatarIds.push(seat.avatarId);
  room.seats.push(seat);
  ws.room = room;
  ws.seat = seat;
  send(ws, { type: "welcome", code: room.code, you: seat.id, host: false, chat: room.chat, secret: seat.secret });
  say(room, `${seat.name} sat down.`);
  publish(room);
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
  hear("ui_confirm");
  say(room, `${game.players[0].name} places first.`);
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
  room.offerTimer = null;
  room.offer = null;
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
  if (room.offer) broadcast(room, { type: "tradeClosed", tradeId: room.offer.tradeId });
  closeOffer(room);
  const tradeId = `t${room.game.seq}-${(room.offerSeq = (room.offerSeq ?? 0) + 1)}`;
  room.offer = { tradeId, from: actor, give: msg.give, want: msg.want, declined: new Set() };
  room.offerTimer = setTimeout(() => {
    room.offer = null;
    broadcast(room, { type: "tradeClosed", tradeId });
  }, 20000);
  broadcast(room, { type: "tradeOffer", tradeId, from: actor, give: room.offer.give, want: room.offer.want, seconds: 20 });
}

function answer(ws, room, msg) {
  const actor = ws.seat.pid;
  const offer = room.offer;
  if (!offer || actor === offer.from || (msg.tradeId && msg.tradeId !== offer.tradeId)) {
    return send(ws, { type: "error", message: "Offer is gone." });
  }
  if (!(msg.yes ?? msg.accept)) {
    // A "No" is told to the whole table. The offer stays open for seats that have not answered and
    // closes once every other human seat has declined (bots never answer an ask).
    if (offer.declined.has(actor)) return;
    offer.declined.add(actor);
    hear("trade_no");
    const name = room.game.players.find((p) => p.id === actor)?.name ?? ws.seat.name;
    broadcast(room, { type: "tradeDeclined", tradeId: offer.tradeId, by: actor, name });
    say(room, `${name} declines.`);
    const askees = room.game.players.filter((p) => p.id !== offer.from && p.kind === "human");
    if (askees.every((p) => offer.declined.has(p.id))) {
      closeOffer(room);
      broadcast(room, { type: "tradeClosed", tradeId: offer.tradeId });
    }
    return;
  }
  const offered = applyAction(room.game, offer.from, { type: "offerTrade", to: actor, give: offer.give, want: offer.want });
  if (offered.error) return send(ws, { type: "error", message: offered.error });
  const accepted = applyAction(offered.state, actor, { type: "respondTrade", accept: true });
  if (accepted.error) return send(ws, { type: "error", message: accepted.error });
  closeOffer(room);
  room.game = accepted.state;
  hear("trade_yes");
  broadcast(room, { type: "tradeClosed", tradeId: offer.tradeId, taker: actor });
  pushState(room);
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
  if (!EMOTES.has(msg.emote)) return;
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
  hear(msg.type === "place" ? `${msg.kind}_place` : SOUND[msg.type]);
  if (msg.type === "roll") {
    const [a, b] = room.game.dice;
    const paid = gains(before, room.game);
    broadcast(room, { type: "rolled", dice: [a, b], sum: a + b, gains: paid });
    const parts = paid.map((g) => `${g.name} +${g.amount} ${g.resource}`);
    say(room, [String(a + b), ...parts].join(" · "));
  }
  runBots(room);
  for (const line of room.game.log.slice(before.log.length)) say(room, line);
  if (room.game.phase === "over" && before.phase !== "over") hear("win");
  // An offer lives only while its asker still has the turn in `main`.
  const open = room.offer;
  if (open && (room.game.current !== open.from || room.game.phase !== "main")) {
    closeOffer(room);
    broadcast(room, { type: "tradeClosed", tradeId: open.tradeId });
  }
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
  if (!room.game) return send(ws, { type: "error", message: "not ready" });
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
  const seen = room.game.log.length;
  runBots(room);
  for (const line of room.game.log.slice(seen)) say(room, line);
  pushState(room);
}

function dropRoom(room) {
  closeOffer(room);
  for (const seat of room.seats) {
    clearTimeout(seat.graceTimer);
    clearTimeout(seat.holdTimer);
  }
  for (const id of room.avatarIds) avatars.delete(id);
  rooms.delete(room.code);
  unsave(room);
}

// A seat with no socket: the bot takes it after the grace (in a game), and it is let go after the hold.
function hold(room, seat) {
  seat.ws = null;
  seat.gone = Date.now();
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
  const seen = room.game.log.length;
  runBots(room);
  for (const line of room.game.log.slice(seen)) say(room, line);
  pushState(room);
}

// The hold is over: the seat is let go for good. The bot keeps playing the player.
function letGo(room, seat) {
  clearTimeout(seat.graceTimer);
  room.seats = room.seats.filter((s) => s !== seat);
  if (room.seats.length === 0) return dropRoom(room);
  if (!room.game) say(room, `${seat.name} left.`);
  if (room.host === seat.id) handOffHost(room);
  publish(room);
}

function leave(ws) {
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
