import http from "node:http";
import { randomInt } from "node:crypto";
import { WebSocketServer } from "ws";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";

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

function seatsOf(room) {
  return room.seats.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    avatarId: s.avatarId,
    ready: s.ready,
    url: s.avatarId ? `/avatars/${s.avatarId}.jpg` : null,
  }));
}

function publish(room) {
  broadcast(room, { type: "seats", code: room.code, seats: seatsOf(room) });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "POST" && url.pathname === "/avatars") {
    const id = req.headers["x-player-id"];
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      if (!id || body.length > 256 * 1024) {
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
  if (got) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      send(ws, { type: "error", message: "not ready" });
      return;
    }
    if (msg.type === "create") {
      const room = {
        code: code(),
        seats: [],
        game: null,
        host: null,
      };
      room.playerIds = [];
      rooms.set(room.code, room);
      const seat = {
        id: "p0",
        name: String(msg.name || "Ember").slice(0, 16),
        color: msg.color || "#c45c3e",
        avatarId: msg.avatarId || null,
        ready: false,
        ws,
      };
      room.playerIds.push(seat.id);
      room.seats.push(seat);
      room.host = seat.id;
      ws.room = room;
      ws.seat = seat;
      send(ws, { type: "log", text: `${seat.name} sat down.` });
      publish(room);
      return;
    }
    if (msg.type === "hello" || msg.type === "join") {
      const room = rooms.get(String(msg.code || "").toUpperCase());
      if (!room || room.game) {
        send(ws, { type: "error", message: room?.game ? "Game already started." : "No table with that code" });
        return;
      }
      if (room.seats.length >= 4) {
        send(ws, { type: "error", message: "Table full." });
        return;
      }
      if (room.seats.some((s) => s.color === msg.color)) {
        send(ws, { type: "error", message: "Color taken." });
        return;
      }
      const seat = {
        id: `p${room.seats.length}`,
        name: String(msg.name || "Tide").slice(0, 16),
        color: msg.color || "#2a8f8a",
        avatarId: msg.avatarId || null,
        ready: false,
        ws,
      };
      room.playerIds.push(seat.id);
      room.seats.push(seat);
      ws.room = room;
      ws.seat = seat;
      broadcast(room, { type: "log", text: `${seat.name} sat down.` });
      publish(room);
      return;
    }
    const room = ws.room;
    if (!room) {
      send(ws, { type: "error", message: "not ready" });
      return;
    }
    if (msg.type === "ready") {
      ws.seat.ready = Boolean(msg.value);
      publish(room);
      return;
    }
    if (msg.type === "start") {
      const n = room.seats.length;
      if (ws.seat.id !== room.host || n < 3 || n > 4 || room.seats.some((s) => !s.ready)) {
        send(ws, { type: "error", message: "Not everyone is ready." });
        return;
      }
      room.game = createGame({ humans: room.seats.map((s) => ({ name: s.name })), bots: 0 });
      broadcast(room, { type: "state", game: room.game });
      return;
    }
    if (!room.game) {
      send(ws, { type: "error", message: "not ready" });
      return;
    }
    const actor = ws.seat.id;
    let action = null;
    if (msg.type === "roll") action = { type: "roll" };
    else if (msg.type === "place" && msg.kind === "outpost") {
      action = { type: room.game.phase === "setupSettle" ? "setupSettle" : "buildOutpost", vertexId: msg.id };
    } else if (msg.type === "place" && msg.kind === "path") {
      action = { type: room.game.phase === "setupRoad" ? "setupRoad" : "buildPath", edgeId: msg.id };
    } else if (msg.type === "pass") action = { type: "endTurn" };
    else {
      send(ws, { type: "error", message: "not ready" });
      return;
    }
    const next = applyAction(room.game, actor, action);
    if (next.error) {
      send(ws, { type: "error", message: next.error });
      return;
    }
    room.game = next.state;
    if (msg.type === "roll") broadcast(room, { type: "rolled", dice: room.game.dice, sum: room.game.dice[0] + room.game.dice[1] });
    broadcast(room, { type: "state", you: actor, game: room.game });
  });

  ws.on("close", () => {
    const room = ws.room;
    if (!room) return;
    room.seats = room.seats.filter((s) => s !== ws.seat);
    if (room.seats.length === 0) {
      for (const id of room.playerIds) avatars.delete(id);
      rooms.delete(room.code);
    }
  });
});

server.listen(8787, () => console.log("host listening 8787"));
