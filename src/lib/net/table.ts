// The browser (or a Node proof) talking to server/host.mjs. Design: docs/design/online-client.md.
import type { Action, GameState, Resource, VictoryTarget, WayfarerMode } from "@/lib/game/types";
import { PROTO } from "@/lib/net/proto";
import type { ProfileAttachment } from "@/lib/net/profiles";

export interface Seat {
  id: string;
  name: string;
  color: string;
  avatarId: string | null;
  ready: boolean;
  host: boolean;
  url: string | null;
  // The host marks a seat whose socket is gone (#195); it is held for the player to rejoin.
  away?: boolean;
  // A lobby bot the host seated (README: addBot). It is always ready and never away.
  bot?: boolean;
  player?: string | null;
  needs?: Resource[];
  // #1411: the player said they want another game. Only once a game is over; the next game clears it.
  again?: boolean;
  // #764: the public profile of a bound seat. A guest seat has no such field.
  profile?: { profileId: string; displayName: string };
}

// What a peek answers (G10): enough to dim taken swatches, no names or pictures.
type PeekSeat = Pick<Seat, "id" | "color" | "ready">;

export interface Legal {
  outpost: string[];
  path: string[];
  stronghold: string[];
  wayfarer: string[];
  steal: Record<string, string[]>;
  discard: number;
  actions: string[];
}

export interface Gain {
  player: string;
  name: string;
  resource: Resource;
  amount: number;
}

interface ActionStamp {
  turn: number;
  baseSeq: number;
  connection: string;
}

export interface ChatLine {
  id: number;
  seat: string;
  player: string | null;
  name: string;
  color: string;
  text: string;
  at: number;
  // A soundboard line (README: sound): the clip id; `text` is its chip.
  sound?: string;
}

export interface Reaction {
  seat: string;
  player: string | null;
  emote: string;
  to: string | null;
  at: number;
}

// An ask-the-table offer (README "Messages between client and host"). Bags are resource counts, empty when absent.
export type Bag = Partial<Record<Resource, number>>;

interface TurnExtensionState {
  target: string | null;
  key: string | null;
  used: boolean;
  vote: { id: string; target: string; until: number; voters: string[]; yes: string[]; no: string[] } | null;
  result: { id: string; target: string; outcome: "passed" | "failed" | "cancelled" } | null;
}

// Lobby tic-tac-toe (#1263, README "Messages between client and host"): seat ids, and nine cells of "x", "o" or ".".
interface TttGame {
  id: string;
  x: string;
  o: string;
  board: string;
  status: "invited" | "playing" | "won" | "draw";
  turn: string | null;
  winner: string | null;
  line: number[] | null;
}
// `game` is null once the game closes, with why and which seat closed it (null at Start).
export interface TttMsg {
  game: TttGame | null;
  reason?: "closed" | "declined" | "left" | "start";
  by?: string | null;
}

export type ConnectionHealth = { status: "Reachable" | "Reconnecting" | "Offline"; rtt: number | null };

export interface TableEvents {
  health(value: ConnectionHealth): void;
  // A watcher's welcome (docs/design/spectator.md) has `spectator: true` and no `you`, `host` or `secret`. `proto` is the
  // host's wire protocol (G2): newer than PROTO means this page is out of date.
  // `holdMs`/`lobbyHoldMs`: how long the host holds this seat after a drop, in a game and in the lobby (G7).
  welcome(msg: { proto?: number; serverSha?: string; code: string; you?: string; host?: boolean; chat?: ChatLine[]; secret?: string; spectator?: true; holdMs?: number; lobbyHoldMs?: number; victoryTarget?: VictoryTarget; wayfarerMode?: WayfarerMode }): void;
  // `watching`: how many spectators the table has (#347).
  seats(msg: { code: string; seats: Seat[] | PeekSeat[]; watching?: number; victoryTarget?: VictoryTarget; wayfarerMode?: WayfarerMode }): void;
  // `you` is null on a watcher's state. `turnDeadline` is the host's clock (epoch ms) for the seat `turnPlayer`;
  // `serverNow` is the host's clock as it sent this.
  state(msg: { you: string | null; game: GameState; legal: Legal; actionStamp?: ActionStamp; turnDeadline?: number | null; turnPlayer?: string | null; serverNow?: number; result?: unknown }): void;
  rolled(msg: { dice: [number, number]; sum: number; gains: Gain[]; short: Resource[] }): void;
  chat(line: ChatLine): void;
  react(r: Reaction): void;
  log(text: string): void;
  error(message: string, request?: "need"): void;
  tradeOffer(msg: { tradeId: string; from: string; give: Bag; want: Bag; seconds: number | null }): void;
  tradeDeclined(msg: { tradeId: string; by: string; name: string }): void;
  tradeClosed(msg: { tradeId: string; taker?: string }): void;
  // The socket dropped and the client is dialing again (attempt 1, 2, ...); `closed` follows only if it gives up.
  reconnecting(attempt: number): void;
  // `keepSeat`: the seat is still ours but open in another tab, so the saved secret stays.
  closed(keepSeat?: boolean): void;
  // Open tables on this host (#833); never includes private codes. Seatless `list` replies only.
  openTables(tables: OpenTableEntry[]): void;
  ttt(msg: TttMsg): void;
  // #1350: the host's answers to profileCard, carrying the request's `id`.
  tableProfileCard(msg: ProfileCardReply): void;
  profileError(msg: ProfileCardReply): void;
}

// A card holds public fields only (server/profiles.mjs publicCard); a profileError has no card.
export interface ProfileCardReply {
  type: "tableProfileCard" | "profileError";
  id: number;
  card?: { profileId: string; displayName: string; catchphrase: string };
}

export interface Me {
  name: string;
  color?: string;
  avatarId?: string;
  profile?: ProfileAttachment;
}

// An open table entry from the server's openTables list (never includes private table codes).
export interface OpenTableEntry {
  code: string;
  name: string;
  seated: number;
  total: number;
  status: "lobby" | "playing" | "over";
}

export interface TableClient {
  open(me: Me, options?: { wayfarerMode?: WayfarerMode; visibility?: "open" | "private" }): void;
  join(code: string, me: Me): void;
  // Watch a started table, read-only: hello {code, watch:true} (docs/design/spectator.md). No seat, no secret, so no redial.
  watch(code: string): void;
  // Ask which seats a lobby holds before sitting down (docs/design/color-peek.md). Answered as `seats`.
  peek(code: string): void;
  // Ask for the open-table list on a seatless socket (#833). Answered as `openTables`.
  list(): void;
  // Sit back down in a held seat (#196): hello {code, secret} from an earlier welcome.
  rejoin(code: string, secret: string): void;
  // Close the socket the way a lost network would (not on purpose), so the client dials again. For proofs.
  drop(): void;
  ready(value: boolean): void;
  start(): void;
  setVictoryTarget(value: VictoryTarget): void;
  // Lobby: change your own seat's name; the host cleans it and answers with `seats`.
  rename(name: string): void;
  // Lobby, host only: seat a practice bot, or take the bot at seat `id` out.
  addBot(): void;
  removeBot(id: string): void;
  // A rematch at the same table (#266). Host only, once the game is over.
  again(): void;
  // #1411: say "I'll play again" (or take it back) on the results screen. It never starts the next game.
  wantAgain(value: boolean): void;
  act(action: Action): boolean;
  // Ask-the-table trades are host-run (not rules Actions): offer `give` for `want` to every other seat, and answer one.
  ask(give: Bag, want: Bag): void;
  answer(tradeId: string, yes: boolean): void;
  need(kinds: Resource[]): void;
  cancel(tradeId: string): void;
  requestTurnExtension(target: string, key: string): boolean;
  answerTurnExtension(voteId: string, yes: boolean): boolean;
  getTurnExtension(): TurnExtensionState | null;
  subscribeTurnExtension(listener: () => void): () => void;
  say(text: string): void;
  sound(id: string): void;
  react(emote: string, to?: string): void;
  // Lobby tic-tac-toe: one of the five ttt messages, e.g. ttt("tttMove", { id, cell }).
  // #1350: it also sends the card read, ttt("tableProfileCard", { id, profileId }); the host answers with the same `id`.
  // The table chunk sits at its size ceiling, so the read shares this sender and adds no second one.
  ttt(type: "tttInvite" | "tttAnswer" | "tttMove" | "tttAgain" | "tttClose" | "tableProfileCard", fields: Record<string, unknown>): void;
  // The browser says the network or the tab is back: if a backoff timer is pending, dial now. Otherwise nothing.
  wake(): void;
  // Leave on purpose: the host frees a lobby seat at once. `leave: false` only closes, and the seat is held as a drop.
  close(leave?: boolean): void;
}

interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
}

type SocketCtor = new (url: string) => SocketLike;

// A rules Action becomes the host intent from build bible section 10. Trades between players are host-run, so they are null here.
export function toIntent(action: Action): Record<string, unknown> | null {
  switch (action.type) {
    case "setupSettle":
    case "buildOutpost":
      return { type: "place", kind: "outpost", id: action.vertexId };
    case "setupRoad":
    case "buildPath":
      return { type: "place", kind: "path", id: action.edgeId };
    case "buildStronghold":
      return { type: "place", kind: "stronghold", id: action.vertexId };
    case "roll":
      return { type: "roll" };
    case "buyCard":
      return { type: "buy" };
    case "endTurn":
      return { type: "pass" };
    case "moveRobber":
      return { type: "rob", hexId: action.hexId, stealFrom: action.stealFrom };
    case "playKnight":
      return { type: "play", card: "knight", hexId: action.hexId, stealFrom: action.stealFrom };
    case "playRoad":
      return { type: "play", card: "road", ids: action.edgeIds };
    case "playPlenty":
      return { type: "play", card: "plenty", resources: action.resources };
    case "playMonopoly":
      return { type: "play", card: "monopoly", resource: action.resource };
    case "discard":
      return { type: "discard", cards: action.resources };
    case "bankTrade":
      return { type: "tradeBank", give: action.give, take: action.want };
    default:
      return null;
  }
}

// ?host=wss://play.example.com wins (the browser's host.txt). In `npm run dev` the page is on Vite (8080)
// and the host on 8787. A built page was served by the host itself, so it dials the address it came from.
export function hostUrl(
  loc: { protocol: string; hostname: string; host: string; search: string },
  dev: boolean = import.meta.env?.DEV ?? false,
): string {
  return (
    new URLSearchParams(loc.search).get("host") ||
    `ws${loc.protocol === "https:" ? "s" : ""}://${dev ? `${loc.hostname}:8787` : loc.host}`
  );
}

// Waits between reconnect attempts: 1, 2, 4, 8 s, then every 15 s, for as long as the host holds the seat (docs/research/rejoin.md).
// What a host that says nothing about its hold is assumed to do: its own `HOLD_MS` and `LOBBY_HOLD_MS` defaults.
const GIVE_UP_MS = 10 * 60 * 1000;
const LOBBY_GIVE_UP_MS = 90 * 1000;
// The last redial lands this long before the host lets the seat go, so the hold always outlasts the retries (G7, #528).
const LAST_CALL_MS = 1000;

// Both action IDs and health challenges use 128 random bits, including on plain-HTTP LAN joins.
const randomNonce = () => crypto.getRandomValues(new Uint8Array(16)).reduce((hex, b) => hex + b.toString(16).padStart(2, "0"), "");

const ALLOWED_EVENTS = ["seats", "rolled", "chat", "react", "tradeOffer", "tradeDeclined", "tradeClosed", "ttt", "profileError", "tableProfileCard"];

// `giveUpMs` is only for proofs that cannot wait 10 minutes: it stands in for both holds until a welcome says otherwise.
export function connectTable(url: string, on: Partial<TableEvents>, Socket?: SocketCtor, giveUpMs?: number): TableClient {
  const Ctor = Socket ?? (globalThis.WebSocket as unknown as SocketCtor);
  const queue: (() => Record<string, unknown>)[] = [];
  let ws: SocketLike;
  let closedByUs = false;
  // Set by the first welcome. With a seat to go back to, an unexpected close means dial again.
  let seat: { code: string; secret: string } | null = null;
  let attempt = 0;
  let lostAt = 0;
  // The host's hold on a dropped seat, from the welcome; which one applies is whether a game has started.
  let hold = { game: giveUpMs ?? GIVE_UP_MS, lobby: giveUpMs ?? LOBBY_GIVE_UP_MS };
  let inGame = false;
  // True while a hello {code, secret} is out; an error then means the seat is gone for good.
  let rejoining = false;
  // The last rejoin answer was "Seat is taken.": another tab of ours holds the seat, so giving up must keep the secret.
  let taken = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stamp: ActionStamp | null = null;
  let extension: TurnExtensionState | null = null;
  const extensionListeners = new Set<() => void>();
  const setExtension = (value: TurnExtensionState | null) => {
    extension = value;
    extensionListeners.forEach((listener) => listener());
  };
  let healthTimer: ReturnType<typeof setTimeout> | undefined;
  // Undefined until welcome (or after close), null while authenticated and idle, otherwise the outstanding nonce.
  // lastProbe is its send time; another probe cannot start until it is cleared.
  let probe: string | null | undefined;
  let lastProbe = -Infinity;
  let awaitingState = false;
  const health = (status: ConnectionHealth["status"], rtt: number | null = null) => on.health?.({ status, rtt });
  const stopHealth = () => {
    clearTimeout(healthTimer);
    healthTimer = undefined;
    probe = undefined;
  };
  const probeHealth = () => {
    // A repeated welcome must not cancel the timeout of a challenge already in flight.
    if (probe !== null || closedByUs || ws.readyState !== 1) return;
    clearTimeout(healthTimer);
    const wait = 30_000 - (performance.now() - lastProbe);
    if (wait > 0) {
      healthTimer = setTimeout(probeHealth, wait);
      return;
    }
    const nonce = randomNonce();
    lastProbe = performance.now();
    probe = nonce;
    send({ type: "healthPing", nonce });
    healthTimer = setTimeout(() => {
      probe = null;
      health("Reconnecting");
      // Health never forces a seat drop. A real socket close owns recovery; probeHealth waits out the rest of the 30 s.
      probeHealth();
    }, 3000);
  };

  const raw = (msg: Record<string, unknown>) => ws.send(JSON.stringify(msg));
  const send = (msg: Record<string, unknown> | (() => Record<string, unknown>)) => {
    const fn = typeof msg === "function" ? msg : () => msg;
    if (ws.readyState === 1) raw(fn());
    else queue.push(fn);
  };

  // Gameplay is never queued. Only the latest state on this connection authorizes an intent.
  const act = (msg: Record<string, unknown>) => {
    if (!stamp || ws.readyState !== 1 || rejoining || closedByUs) return false;
    raw({ ...msg, ...stamp, cid: randomNonce() });
    return true;
  };

  const giveUp = (keepSeat = false) => {
    stopHealth();
    health("Offline");
    closedByUs = true;
    seat = null;
    rejoining = false;
    on.closed?.(keepSeat);
  };

  // The socket `sock` is gone: redial with the seat secret while the host still holds the seat, or give up.
  const lost = (sock: SocketLike) => {
    // A socket a later dial replaced closing late is not a drop of the live one.
    if (sock !== ws) return;
    stamp = null;
    setExtension(null);
    stopHealth();
    if (closedByUs) return;
    if (attempt === 0) lostAt = Date.now();
    // Redial until the last call before the host's hold ends; by then the seat is as good as gone.
    const left = lostAt + (inGame ? hold.game : hold.lobby) - LAST_CALL_MS - Date.now();
    if (!seat || left <= 0) {
      giveUp(taken);
      return;
    }
    attempt += 1;
    health("Reconnecting");
    on.reconnecting?.(attempt);
    timer = setTimeout(dial, Math.min(1000 * 2 ** (attempt - 1), 15000, left));
  };

  const dial = () => {
    timer = null;
    const sock = (ws = new Ctor(url));
    ws.onopen = () => {
      // The rejoin hello goes out here only, never through the queue, so it is sent once per socket.
      if (seat && (attempt > 0 || rejoining)) {
        rejoining = true;
        raw({ type: "hello", proto: PROTO, ...seat });
        // Anything sent while the socket was down is stale after a rejoin (a second roll, an old placement).
        queue.length = 0;
      }
      for (const fn of queue.splice(0)) raw(fn());
    };
    ws.onclose = () => lost(sock);
    ws.onmessage = (ev) => {
      if (sock !== ws) return;
      try { handle(JSON.parse(String(ev.data))); } catch {}
    };
  };

  const handle = (msg: { type?: string; [k: string]: unknown }) => {
    switch (msg.type) {
      case "healthPong": {
        if (!probe || msg.nonce !== probe) break;
        const elapsed = performance.now() - lastProbe;
        if (elapsed < 0 || elapsed >= 3000) break;
        clearTimeout(healthTimer);
        probe = null;
        if (!awaitingState) health("Reachable", Math.round(elapsed));
        probeHealth();
        break;
      }
      case "welcome": {
        stamp = null;
        const m = msg as Parameters<TableEvents["welcome"]>[0];
        if (typeof m.secret === "string") seat = { code: m.code, secret: m.secret };
        if (typeof m.holdMs === "number" && typeof m.lobbyHoldMs === "number") hold = { game: m.holdMs, lobby: m.lobbyHoldMs };
        awaitingState = rejoining && inGame;
        probe ??= null;
        if (!awaitingState) health("Reachable");
        probeHealth();
        rejoining = false;
        taken = false;
        attempt = 0;
        on.welcome?.(m);
        break;
      }
      case "turnExtension":
        setExtension(msg as unknown as TurnExtensionState);
        break;
      case "state":
        setExtension((msg.turnExtension as TurnExtensionState) ?? null);
        stamp = (msg as { actionStamp?: ActionStamp }).actionStamp ?? null;
        inGame = true;
        on.state?.(msg as never);
        if (awaitingState) { awaitingState = false; health("Reachable"); }
        break;
      case "log":
        on.log?.(String(msg.text));
        break;
      case "openTables":
        on.openTables?.(Array.isArray(msg.tables) ? (msg.tables as OpenTableEntry[]) : []);
        break;
      case "error": {
        const message = String(msg.message);
        taken = rejoining && message === "Seat is taken.";
        if (taken && attempt > 0) {
          // After a drop the host can still see our old socket as open (no keepalive yet, #202).
          // Close this one and keep backing off until the host lets the old one go.
          ws.close();
          break;
        }
        on.error?.(message, msg.request === "need" ? "need" : undefined);
        if (rejoining) {
          // "Seat is taken." on a fresh rejoin: another tab of ours is sitting in it, so keep the secret.
          // "Seat is gone." or no such table: nothing to go back to.
          ws.close();
          giveUp(taken);
        }
        break;
      }
      default:
        if (ALLOWED_EVENTS.includes(msg.type ?? "")) (on as Record<string, ((m: unknown) => void) | undefined>)[msg.type!]?.(msg);
    }
  };

  dial();

  const initialHello = (me: Me, extra?: Record<string, unknown>) =>
    send(() => ({
      type: "hello", proto: PROTO, name: me.name, color: me.color, avatarId: me.avatarId, ...extra,
      credential: me.profile?.credentialForHost(url) || undefined,
    }));

  const up = (code: string) => code.toUpperCase();

  return {
    open: (me, options) => initialHello(me, options),
    join: (code, me) => initialHello(me, { code: up(code) }),
    watch: (code) => send({ type: "hello", proto: PROTO, code: up(code), watch: true }),
    peek: (code) => send({ type: "peek", code: up(code) }),
    list: () => send({ type: "list" }),
    rejoin: (code, secret) => {
      stamp = null;
      seat = { code: up(code), secret };
      rejoining = true;
      // Not queued: onopen sends it, so a failed first dial cannot leave a second hello behind.
      if (ws.readyState === 1) raw({ type: "hello", proto: PROTO, ...seat });
    },
    ready: (value) => send({ type: "ready", value }),
    start: () => send({ type: "start" }),
    setVictoryTarget: (value) => send({ type: "setVictoryTarget", value }),
    rename: (name) => send({ type: "rename", name }),
    addBot: () => send({ type: "addBot" }),
    removeBot: (id) => send({ type: "removeBot", id }),
    again: () => send({ type: "again" }),
    wantAgain: (value) => send({ type: "wantAgain", value }),
    act: (action) => {
      const i = toIntent(action);
      return i ? act(i) : false;
    },
    ask: (give, want) => act({ type: "tradeAsk", give, want }),
    answer: (tradeId, yes) => act({ type: "tradeAnswer", tradeId, yes }),
    need: (kinds) => send({ type: "need", kinds }),
    cancel: (tradeId) => act({ type: "tradeCancel", tradeId }),
    requestTurnExtension: (target, key) => act({ type: "turnExtensionAsk", target, key }),
    answerTurnExtension: (voteId, yes) => act({ type: "turnExtensionAnswer", voteId, yes }),
    getTurnExtension: () => extension,
    subscribeTurnExtension: (listener) => {
      extensionListeners.add(listener);
      return () => extensionListeners.delete(listener);
    },
    say: (text) => send({ type: "chat", text }),
    sound: (id) => send({ type: "sound", id }),
    react: (emote, to) => send({ type: "react", emote, to }),
    ttt: (type, fields) => send({ type, ...fields }),
    // The connection is lost, as when the network goes: recovery starts now. A plain close() waits for the host to
    // answer the closing handshake first, and Chromium waits up to 60 s for that answer (#1442).
    drop: () => {
      const sock = ws;
      if (sock.readyState > 1) return;
      sock.onopen = sock.onmessage = sock.onclose = null;
      sock.close();
      lost(sock);
    },
    wake: () => {
      if (!timer) return;
      clearTimeout(timer);
      dial();
    },
    close: (leave = true) => {
      stopHealth();
      stamp = null;
      setExtension(null);
      closedByUs = true;
      if (timer) clearTimeout(timer);
      timer = null;
      if (leave && ws.readyState === 1) raw({ type: "leave" });
      ws.close();
    },
  };
}
