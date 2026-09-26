import { WebSocketServer } from "ws";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";

const port = 8787;
const wss = new WebSocketServer({ port });
let game = null;

function send(ws, msg) {
  ws.send(JSON.stringify(msg));
}

function broadcast(msg) {
  const raw = JSON.stringify(msg);
  for (const client of wss.clients) client.send(raw);
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      send(ws, { type: "error", message: "not ready" });
      return;
    }
    if (!game && msg.type !== "start") {
      send(ws, { type: "error", message: "not ready" });
      return;
    }
    if (msg.type === "start") {
      const names = msg.names ?? ["Ember", "Tide", "Pine"];
      game = createGame({ humans: names.map((name) => ({ name })), bots: 0 });
      broadcast({ type: "state", you: game.hostId, game });
      return;
    }
    const actor = msg.actor ?? game.current;
    let action = null;
    if (msg.type === "roll") action = { type: "roll" };
    else if (msg.type === "place" && msg.kind === "outpost") {
      action = { type: game.phase === "setupSettle" ? "setupSettle" : "buildOutpost", vertexId: msg.id };
    } else if (msg.type === "place" && msg.kind === "path") {
      action = { type: game.phase === "setupRoad" ? "setupRoad" : "buildPath", edgeId: msg.id };
    } else if (msg.type === "place" && msg.kind === "stronghold") {
      action = { type: "buildStronghold", vertexId: msg.id };
    } else if (msg.type === "pass") action = { type: "endTurn" };
    else {
      send(ws, { type: "error", message: "not ready" });
      return;
    }
    const next = applyAction(game, actor, action);
    if (next.error) {
      send(ws, { type: "error", message: next.error });
      return;
    }
    game = next.state;
    const rolled = msg.type === "roll" ? { type: "rolled", dice: game.dice, sum: game.dice[0] + game.dice[1] } : null;
    if (rolled) broadcast(rolled);
    broadcast({ type: "state", you: actor, game });
  });
});

console.log(`host listening ${port}`);
