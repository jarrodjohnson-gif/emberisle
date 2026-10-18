import { DurableObject } from "cloudflare:workers";
import { createGame } from "../../src/lib/game/board";
import { applyAction } from "../../src/lib/game/rules";
import { chooseBotAction } from "../../src/lib/game/ai";
import { PLAYER_COLORS, RESOURCES } from "../../src/lib/game/types";
import { PROTO } from "../../src/lib/net/proto";

const CODE = "TEST";
const HOLD_MS = 600_000;
const legalEmpty = () => ({ outpost: [], path: [], stronghold: [], wayfarer: [], steal: {}, discard: 0, actions: [] });
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (env.LOCAL_SPIKE !== "true" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      return new Response("Local research spike only", { status: 403 });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket" || url.pathname.startsWith("/__spike/")) {
      return env.TABLES.get(env.TABLES.idFromName(CODE)).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

export class TableSpike extends DurableObject {
  room = null;
  boot = 0;

  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS boots (id INTEGER PRIMARY KEY CHECK(id=1), count INTEGER NOT NULL)");
    ctx.storage.sql.exec("INSERT INTO boots VALUES (1, 1) ON CONFLICT(id) DO UPDATE SET count=count+1");
    this.boot = ctx.storage.sql.exec("SELECT count FROM boots WHERE id=1").one().count;
    const saved = ctx.storage.sql.exec("SELECT data FROM snapshot WHERE id=1").toArray();
    this.room = saved.length ? JSON.parse(saved[0].data) : null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/__spike/status") {
      const game = JSON.stringify(this.room?.game ?? null);
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(game));
      return Response.json({
        boot: this.boot,
        revision: this.room?.revision ?? 0,
        code: this.room?.code ?? null,
        seats: this.room?.seats.map(({ id, name, ready, bot }) => ({ id, name, ready, bot })) ?? [],
        gameSeq: this.room?.game?.seq ?? null,
        gameDigest: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(""),
        snapshotBytes: this.room ? new TextEncoder().encode(JSON.stringify(this.room)).length : 0,
        databaseBytes: this.ctx.storage.sql.databaseSize,
        sockets: this.ctx.getWebSockets().filter((s) => s.readyState === 1).length,
      });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Not found", { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seatId: null, connection: token() });
    return new Response(null, { status: 101, webSocket: client });
  }

  save() {
    this.room.revision++;
    this.ctx.storage.sql.exec("INSERT INTO snapshot VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data", JSON.stringify(this.room));
  }

  send(ws, message) {
    if (ws.readyState === 1) ws.send(JSON.stringify(message));
  }

  sockets(seatId) {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === 1 && ws.deserializeAttachment()?.seatId === seatId);
  }

  broadcast(message) {
    for (const ws of this.ctx.getWebSockets()) if (ws.deserializeAttachment()?.seatId) this.send(ws, message);
  }

  publicSeats() {
    return this.room.seats.map((s) => ({ id: s.id, name: s.name, color: s.color, avatarId: null, ready: s.ready, host: s.id === this.room.host, bot: s.bot, away: !s.bot && this.sockets(s.id).length === 0, url: null }));
  }

  welcome(ws, seat) {
    this.send(ws, { type: "welcome", proto: PROTO, code: CODE, you: seat.id, host: seat.id === this.room.host, secret: seat.secret, chat: this.room.chat, holdMs: HOLD_MS, lobbyHoldMs: HOLD_MS, victoryTarget: 10, wayfarerMode: "on" });
  }

  publish() {
    this.broadcast({ type: "seats", code: CODE, seats: this.publicSeats(), watching: 0, victoryTarget: 10, wayfarerMode: "on" });
    if (!this.room.game) return;
    const game = this.room.game;
    for (const seat of this.room.seats) {
      for (const ws of this.sockets(seat.id)) {
        const { seed, rng, winReason, ...publicGame } = game;
        const projection = { ...publicGame, deck: [], deckLeft: game.deck.length, players: game.players.map((p) => {
          if (p.id === seat.pid) return p;
          const { resources, ...other } = p;
          return { ...other, goods: RESOURCES.reduce((n, r) => n + resources[r], 0), hidden: { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 }, boughtThisTurn: { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 }, fortunes: Object.values(p.hidden).reduce((a: number, b: number) => a + b, 0) };
        }) };
        const legal = legalEmpty();
        if (game.current === seat.pid && ["rollOff", "roll"].includes(game.phase)) legal.actions.push("roll");
        this.send(ws, { type: "state", you: seat.pid, game: projection, legal, actionStamp: { turn: game.turn, baseSeq: game.seq, connection: ws.deserializeAttachment().connection }, turnDeadline: null, turnPlayer: null, serverNow: Date.now() });
      }
    }
  }

  async webSocketMessage(ws, raw) {
    try {
      if (typeof raw !== "string" || raw.length > 16_384) throw new Error("Frame refused.");
      const msg = JSON.parse(raw);
      const attachment = ws.deserializeAttachment();
      if (!attachment.seatId) {
        if (msg.type === "peek") {
          return this.send(ws, { type: "seats", code: msg.code, seats: msg.code === CODE && this.room ? this.publicSeats().map(({ id, color, ready }) => ({ id, color, ready })) : [] });
        }
        if (msg.type !== "hello" || msg.proto !== PROTO || msg.watch) throw new Error("Only the real client hello subset is supported.");
        if (msg.secret) {
          const seat = this.room?.seats.find((s) => s.secret === msg.secret && !s.bot);
          if (msg.code !== CODE || !seat || seat.holdUntil < Date.now()) throw new Error("Seat is gone.");
          if (this.sockets(seat.id).length) throw new Error("Seat is taken.");
          seat.holdUntil = Date.now() + HOLD_MS;
          ws.serializeAttachment({ ...attachment, seatId: seat.id });
          this.save();
          this.welcome(ws, seat);
          this.publish();
          return;
        }
        if (!msg.code) {
          if (this.room) throw new Error("The single spike room already exists.");
          this.room = { code: CODE, seats: [], host: "s0", next: 0, revision: 0, game: null, chat: [], chatSeq: 0 };
        } else if (msg.code !== CODE || !this.room) throw new Error("No table with that code");
        if (this.room.game || this.room.seats.length >= 4) throw new Error("Table full or started.");
        const color = PLAYER_COLORS.find((c) => !this.room.seats.some((s) => s.color === c));
        const seat = { id: `s${this.room.next++}`, name: String(msg.name || "Player").replace(/[\x00-\x1f]/g, "").slice(0, 16), color, ready: false, bot: false, secret: token(), holdUntil: Date.now() + HOLD_MS, cids: [] };
        this.room.seats.push(seat);
        ws.serializeAttachment({ ...attachment, seatId: seat.id });
        this.save();
        this.welcome(ws, seat);
        this.publish();
        return;
      }
      const seat = this.room.seats.find((s) => s.id === attachment.seatId);
      if (!seat) throw new Error("Seat is gone.");
      seat.holdUntil = Date.now() + HOLD_MS;
      if (msg.type === "ready") seat.ready = Boolean(msg.value);
      else if (msg.type === "addBot" && seat.id === this.room.host && !this.room.game && this.room.seats.length < 4) {
        const color = PLAYER_COLORS.find((c) => !this.room.seats.some((s) => s.color === c));
        this.room.seats.push({ id: `s${this.room.next++}`, name: "Dune (bot)", color, ready: true, bot: true, secret: token(), holdUntil: 0, cids: [] });
      } else if (msg.type === "start" && seat.id === this.room.host && !this.room.game && this.room.seats.length >= 3 && this.room.seats.every((s) => s.ready)) {
        this.room.game = createGame({ humans: this.room.seats.map((s) => ({ name: s.name })), bots: 0, seed: 779 });
        this.room.seats.forEach((s, i) => { s.pid = this.room.game.players[i].id; this.room.game.players[i].color = s.color; if (s.bot) this.room.game.players[i].kind = "bot"; });
      } else if (msg.type === "roll" && this.room.game) {
        const game = this.room.game;
        if (msg.connection !== attachment.connection || msg.baseSeq !== game.seq || msg.turn !== game.turn || typeof msg.cid !== "string" || seat.cids.includes(msg.cid)) throw new Error("The table has updated. Please try again.");
        const result = applyAction(game, seat.pid, { type: "roll" });
        if (result.error) throw new Error(result.error);
        this.room.game = result.state;
        seat.cids = [...seat.cids, msg.cid].slice(-32);
      } else if (msg.type === "chat") {
        const text = String(msg.text ?? "").trim().slice(0, 200);
        if (!text) throw new Error("Empty chat.");
        const line = { id: ++this.room.chatSeq, seat: seat.id, player: seat.pid ?? null, name: seat.name, color: seat.color, text, at: Date.now() };
        this.room.chat = [...this.room.chat, line].slice(-100);
        this.save();
        this.broadcast({ type: "chat", ...line });
        this.publish();
        return;
      } else throw new Error("Outside the spike's supported subset.");
      for (let i = 0; i < 8 && this.room.game; i++) {
        const game = this.room.game;
        const current = game.players.find((p) => p.id === game.current);
        if (!current || current.kind !== "bot") break;
        const action = chooseBotAction(game, current.id);
        if (!action) break;
        const result = applyAction(game, current.id, action);
        if (result.error) throw new Error(result.error);
        this.room.game = result.state;
      }
      this.save();
      this.publish();
    } catch (error) {
      this.send(ws, { type: "error", message: error.message });
    }
  }

  webSocketClose(ws, code) {
    const seatId = ws.deserializeAttachment()?.seatId;
    const seat = this.room?.seats.find((s) => s.id === seatId);
    if (seat) {
      seat.holdUntil = Date.now() + HOLD_MS;
      this.save();
      this.publish();
    }
    ws.close(1000);
  }

  webSocketError(ws) {
    this.webSocketClose(ws, 1011);
  }
}
