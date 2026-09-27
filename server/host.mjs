import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomInt } from "node:crypto";
import { WebSocketServer } from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, legalCities, legalRoads, legalSettle, playable, stealTargets } from "../src/lib/game/rules.ts";
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
const AVATAR_TTL = 60 * 60 * 1000; // an upload nobody sat down with is dropped after an hour
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
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  const raw = JSON.stringify(msg);
  for (const seat of room.seats) if (seat.ws.readyState === seat.ws.OPEN) seat.ws.send(raw);
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
    url: s.avatarId ? `/avatars/${s.avatarId}.jpg` : null,
  }));
}

function publish(room) {
  broadcast(room, { type: "seats", code: room.code, seats: seatsOf(room) });
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
  const { seed, rng, ...open } = game;
  return {
    ...open,
    deck: [],
    deckLeft: game.deck.length,
    players: game.players.map((p) =>
      p.id === you
        ? p
        : {
            ...p,
            hidden: { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 },
            boughtThisTurn: { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 },
            fortunes: Object.values(p.hidden).reduce((a, b) => a + b, 0),
          },
    ),
  };
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
  for (const seat of room.seats) {
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

function openTable(ws, msg) {
  const room = { code: code(), seats: [], game: null, host: null, next: 0, avatarIds: [], offer: null, offerTimer: null, chat: [], chatSeq: 0 };
  rooms.set(room.code, room);
  const seat = {
    id: `s${room.next++}`,
    name: String(msg.name || "Ember").slice(0, 16),
    color: msg.color || "#c45c3e",
    avatarId: avatars.has(msg.avatarId) ? msg.avatarId : null,
    ready: false,
    ws,
    bucket: { tokens: 5, at: Date.now() },
  };
  if (seat.avatarId) room.avatarIds.push(seat.avatarId);
  room.seats.push(seat);
  room.host = seat.id;
  ws.room = room;
  ws.seat = seat;
  send(ws, { type: "welcome", code: room.code, you: seat.id, host: true, chat: room.chat });
  say(room, `${seat.name} sat down.`);
  publish(room);
}

function sitDown(ws, msg) {
  const room = rooms.get(String(msg.code || "").toUpperCase());
  if (!room) return send(ws, { type: "error", message: "No table with that code" });
  if (room.game) return send(ws, { type: "error", message: "Game already started." });
  if (room.seats.length >= 4) return send(ws, { type: "error", message: "Table full." });
  const color = typeof msg.color === "string" && msg.color ? msg.color : PLAYER_COLORS.find((c) => !room.seats.some((s) => s.color === c));
  if (!color || room.seats.some((s) => s.color === color)) return send(ws, { type: "error", message: "Color taken." });
  const seat = {
    id: `s${room.next++}`,
    name: String(msg.name || "Tide").slice(0, 16),
    color,
    avatarId: avatars.has(msg.avatarId) ? msg.avatarId : null,
    ready: false,
    ws,
    bucket: { tokens: 5, at: Date.now() },
  };
  if (seat.avatarId) room.avatarIds.push(seat.avatarId);
  room.seats.push(seat);
  ws.room = room;
  ws.seat = seat;
  send(ws, { type: "welcome", code: room.code, you: seat.id, host: false, chat: room.chat });
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
  closeOffer(room);
  const tradeId = `t${room.game.seq}`;
  room.offer = { tradeId, from: actor, give: msg.give ?? {}, want: msg.want ?? {} };
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
    hear("trade_no");
    return send(ws, { type: "tradeClosed", tradeId: offer.tradeId, you: actor });
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
  pushState(room);
}

wss.on("connection", (ws) => {
  // An over-limit frame (maxPayload) raises 'error' on this one socket; with no listener here,
  // Node's default behavior is to throw and take down the whole host. One bad frame must only
  // close that socket (ws already sends close code 1009) and never the other tables.
  ws.on("error", () => {});
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
    // hello with no code opens a table; hello with a code sits down (build bible 2.3, 10).
    if (msg.type === "create" || (msg.type === "hello" && !msg.code)) return openTable(ws, msg);
    if (msg.type === "join" || msg.type === "hello") return sitDown(ws, msg);
    return send(ws, { type: "error", message: "not ready" });
  }
  const room = ws.room;
  if (msg.type === "ready") {
    ws.seat.ready = Boolean(msg.value);
    return publish(room);
  }
  if (msg.type === "start") return room.game ? send(ws, { type: "error", message: "Game already started." }) : startGame(ws, room);
  if (msg.type === "chat" || msg.type === "react") return talk(ws, room, msg);
  if (!room.game) return send(ws, { type: "error", message: "not ready" });
  if (msg.type === "tradeAsk") return ask(ws, room, msg);
  if (msg.type === "tradeAnswer") return answer(ws, room, msg);
  return play(ws, room, msg);
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  room.seats = room.seats.filter((s) => s !== ws.seat);
  if (room.seats.length === 0) {
    closeOffer(room);
    for (const id of room.avatarIds) avatars.delete(id);
    rooms.delete(room.code);
    return;
  }
  if (room.host === ws.seat.id) room.host = room.seats[0].id;
  say(room, `${ws.seat.name} left.`);
  if (room.game && ws.seat.pid) {
    const p = room.game.players.find((x) => x.id === ws.seat.pid);
    if (p) {
      room.game = { ...room.game, players: room.game.players.map((x) => (x === p ? { ...x, kind: "bot", name: `${x.name} (bot)` } : x)) };
      const seen = room.game.log.length;
      runBots(room);
      for (const line of room.game.log.slice(seen)) say(room, line);
      pushState(room);
    }
  } else publish(room);
}

server.listen(PORT, () => console.log(`host listening ${server.address().port}`));
