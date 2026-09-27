import http from "node:http";
import { randomInt } from "node:crypto";
import { WebSocketServer } from "ws";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, legalCities, legalRoads, legalSettle, stealTargets } from "../src/lib/game/rules.ts";
import { COST, RESOURCES } from "../src/lib/game/types.ts";
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
const avatars = new Map();

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
  if (game.phase === "robber") {
    out.wayfarer = game.hexes.filter((h) => h.id !== game.robberHex).map((h) => h.id);
    for (const id of out.wayfarer) {
      const targets = stealTargets(game, id, you);
      if (targets.length) out.steal[id] = targets;
    }
  }
  if (game.phase === "main") {
    if (me.pathsLeft > 0 && affords(me, COST.path)) out.path = legalRoads(game, you, false);
    if (me.outpostsLeft > 0 && affords(me, COST.outpost)) out.outpost = legalSettle(game, you, false);
    if (me.strongholdsLeft > 0 && affords(me, COST.stronghold)) out.stronghold = legalCities(game, you);
    if (affords(me, COST.card) && game.deck.length > 0) out.actions.push("buy");
    out.actions.push("trade", "pass");
  }
  if ((game.phase === "roll" || game.phase === "main") && !game.playedCard) {
    for (const card of ["knight", "road", "plenty", "monopoly"]) {
      if (me.hidden[card] > 0 && (card === "knight" || game.phase === "main")) out.actions.push(`play:${card}`);
    }
  }
  return out;
}

// Hidden fortunes and the deck order stay on the host until the game ends.
export function viewFor(game, you) {
  if (game.phase === "over") return { ...game, deckLeft: game.deck.length };
  return {
    ...game,
    deck: [],
    deckLeft: game.deck.length,
    players: game.players.map((p) =>
      p.id === you
        ? p
        : {
            ...p,
            hidden: { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 },
            fortunes: Object.values(p.hidden).reduce((a, b) => a + b, 0),
          },
    ),
  };
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
    const id = req.headers["x-player-id"];
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      if (!id || !/^[\w-]{1,40}$/.test(String(id)) || body.length > 256 * 1024) {
        res.writeHead(400);
        res.end();
        return;
      }
      avatars.set(String(id), body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ avatarId: id, url: `/avatars/${id}.jpg` }));
    });
    return;
  }
  const got = url.pathname.match(/^\/avatars\/(.+)\.jpg$/);
  if (req.method === "GET" && got && avatars.has(got[1])) {
    res.writeHead(200, { "content-type": "image/jpeg" });
    res.end(avatars.get(got[1]));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

function openTable(ws, msg) {
  const room = { code: code(), seats: [], game: null, host: null, next: 0, avatarIds: [], offer: null, offerTimer: null };
  rooms.set(room.code, room);
  const seat = {
    id: `s${room.next++}`,
    name: String(msg.name || "Ember").slice(0, 16),
    color: msg.color || "#c45c3e",
    avatarId: msg.avatarId || null,
    ready: false,
    ws,
  };
  if (seat.avatarId) room.avatarIds.push(seat.avatarId);
  room.seats.push(seat);
  room.host = seat.id;
  ws.room = room;
  ws.seat = seat;
  send(ws, { type: "welcome", code: room.code, you: seat.id, host: true });
  say(room, `${seat.name} sat down.`);
  publish(room);
}

function sitDown(ws, msg) {
  const room = rooms.get(String(msg.code || "").toUpperCase());
  if (!room) return send(ws, { type: "error", message: "No table with that code" });
  if (room.game) return send(ws, { type: "error", message: "Game already started." });
  if (room.seats.length >= 4) return send(ws, { type: "error", message: "Table full." });
  if (room.seats.some((s) => s.color === msg.color)) return send(ws, { type: "error", message: "Color taken." });
  const seat = {
    id: `s${room.next++}`,
    name: String(msg.name || "Tide").slice(0, 16),
    color: msg.color || "#2a8f8a",
    avatarId: msg.avatarId || null,
    ready: false,
    ws,
  };
  if (seat.avatarId) room.avatarIds.push(seat.avatarId);
  room.seats.push(seat);
  ws.room = room;
  ws.seat = seat;
  send(ws, { type: "welcome", code: room.code, you: seat.id, host: false });
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
  for (const line of room.game.log.slice(before.log.length)) say(room, line);
  if (room.game.phase === "over" && before.phase !== "over") hear("win");
  pushState(room);
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
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
    if (!room.game) return send(ws, { type: "error", message: "not ready" });
    if (msg.type === "tradeAsk") return ask(ws, room, msg);
    if (msg.type === "tradeAnswer") return answer(ws, room, msg);
    return play(ws, room, msg);
  });

  ws.on("close", () => {
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
    publish(room);
  });
});

server.listen(PORT, () => console.log(`host listening ${server.address().port}`));
