// The browser (or a Node proof) talking to server/host.mjs. Design: docs/design/online-client.md.
import type { Action, GameState, Resource } from "@/lib/game/types";

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
}

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

export interface ActionStamp {
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

export interface TableEvents {
  // A watcher's welcome (docs/design/spectator.md) has `spectator: true` and no `you`, `host` or `secret`.
  welcome(msg: { code: string; you?: string; host?: boolean; chat?: ChatLine[]; secret?: string; spectator?: true }): void;
  // `watching`: how many spectators the table has (#347).
  seats(msg: { code: string; seats: Seat[]; watching?: number }): void;
  // `you` is null on a watcher's state. `turnDeadline` is the host's clock (epoch ms) for the seat `turnPlayer`;
  // `serverNow` is the host's clock as it sent this.
  state(msg: { you: string | null; game: GameState; legal: Legal; actionStamp?: ActionStamp; turnDeadline?: number | null; turnPlayer?: string | null; serverNow?: number }): void;
  rolled(msg: { dice: [number, number]; sum: number; gains: Gain[]; short: Resource[] }): void;
  chat(line: ChatLine): void;
  react(r: Reaction): void;
  log(text: string): void;
  error(message: string): void;
  tradeOffer(msg: { tradeId: string; from: string; give: Bag; want: Bag; seconds: number }): void;
  tradeDeclined(msg: { tradeId: string; by: string; name: string }): void;
  tradeClosed(msg: { tradeId: string; taker?: string }): void;
  // The socket dropped and the client is dialing again (attempt 1, 2, ...); `closed` follows only if it gives up.
  reconnecting(attempt: number): void;
  // `keepSeat`: the seat is still ours but open in another tab, so the saved secret stays.
  closed(keepSeat?: boolean): void;
}

export interface Me {
  name: string;
  color?: string;
  avatarId?: string;
}

export interface TableClient {
  open(me: Me): void;
  join(code: string, me: Me): void;
  // Watch a started table, read-only: hello {code, watch:true} (docs/design/spectator.md). No seat, no secret, so no redial.
  watch(code: string): void;
  // Ask which seats a lobby holds before sitting down (docs/design/color-peek.md). Answered as `seats`.
  peek(code: string): void;
  // Sit back down in a held seat (#196): hello {code, secret} from an earlier welcome.
  rejoin(code: string, secret: string): void;
  // Close the socket the way a lost network would (not on purpose), so the client dials again. For proofs.
  drop(): void;
  ready(value: boolean): void;
  start(): void;
  // A rematch at the same table (#266). Host only, once the game is over.
  again(): void;
  act(action: Action): boolean;
  // Ask-the-table trades are host-run (not rules Actions): offer `give` for `want` to every other seat, and answer one.
  ask(give: Bag, want: Bag): void;
  answer(tradeId: string, yes: boolean): void;
  say(text: string): void;
  react(emote: string, to?: string): void;
  // The browser says the network or the tab is back: if a backoff timer is pending, dial now. Otherwise nothing.
  wake(): void;
  close(): void;
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
  const pinned = new URLSearchParams(loc.search).get("host");
  if (pinned) return pinned;
  const scheme = loc.protocol === "https:" ? "wss" : "ws";
  return dev ? `${scheme}://${loc.hostname}:8787` : `${scheme}://${loc.host}`;
}

// Waits between reconnect attempts, then every 15 s, for up to 10 minutes (docs/research/rejoin.md).
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
const GIVE_UP_MS = 10 * 60 * 1000;

// `giveUpMs` is only for proofs that cannot wait 10 minutes.
export function connectTable(url: string, on: Partial<TableEvents>, Socket?: SocketCtor, giveUpMs = GIVE_UP_MS): TableClient {
  const Ctor = Socket ?? (globalThis.WebSocket as unknown as SocketCtor);
  const queue: string[] = [];
  let ws: SocketLike;
  let closedByUs = false;
  // Set by the first welcome. With a seat to go back to, an unexpected close means dial again.
  let seat: { code: string; secret: string } | null = null;
  let attempt = 0;
  let lostAt = 0;
  // True while a hello {code, secret} is out; an error then means the seat is gone for good.
  let rejoining = false;
  // The last rejoin answer was "Seat is taken.": another tab of ours holds the seat, so giving up must keep the secret.
  let taken = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stamp: ActionStamp | null = null;

  const send = (msg: Record<string, unknown>) => {
    const raw = JSON.stringify(msg);
    if (ws.readyState === 1) ws.send(raw);
    else queue.push(raw);
  };

  // Gameplay is never queued. Only the latest state on this connection authorizes an intent.
  const act = (msg: Record<string, unknown>) => {
    if (!stamp || ws.readyState !== 1 || rejoining || closedByUs) return false;
    // getRandomValues also works on the documented plain-HTTP LAN join; randomUUID requires HTTPS.
    const cid = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    ws.send(JSON.stringify({ ...msg, ...stamp, cid }));
    return true;
  };

  const giveUp = (keepSeat = false) => {
    closedByUs = true;
    seat = null;
    rejoining = false;
    on.closed?.(keepSeat);
  };

  const dial = () => {
    timer = null;
    stamp = null;
    ws = new Ctor(url);
    ws.onopen = () => {
      // The rejoin hello goes out here only, never through the queue, so it is sent once per socket.
      if (seat && (attempt > 0 || rejoining)) {
        rejoining = true;
        ws.send(JSON.stringify({ type: "hello", code: seat.code, secret: seat.secret }));
        // Anything sent while the socket was down is stale after a rejoin (a second roll, an old placement).
        queue.length = 0;
      }
      for (const raw of queue.splice(0)) ws.send(raw);
    };
    ws.onclose = () => {
      stamp = null;
      if (closedByUs) return;
      if (!seat) {
        on.closed?.();
        return;
      }
      if (attempt === 0) lostAt = Date.now();
      if (Date.now() - lostAt > giveUpMs) {
        giveUp(taken);
        return;
      }
      attempt += 1;
      on.reconnecting?.(attempt);
      timer = setTimeout(dial, BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length) - 1]!);
    };
    ws.onmessage = (ev) => {
      let msg: { type?: string; [k: string]: unknown };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      handle(msg);
    };
  };

  const handle = (msg: { type?: string; [k: string]: unknown }) => {
    switch (msg.type) {
      case "welcome": {
        stamp = null;
        const m = msg as { code: string; you?: string; host?: boolean; chat?: ChatLine[]; secret?: string; spectator?: true };
        if (typeof m.secret === "string") seat = { code: m.code, secret: m.secret };
        rejoining = false;
        taken = false;
        attempt = 0;
        on.welcome?.(m);
        break;
      }
      case "seats":
        on.seats?.(msg as never);
        break;
      case "state":
        stamp = (msg as { actionStamp?: ActionStamp }).actionStamp ?? null;
        on.state?.(msg as never);
        break;
      case "rolled":
        on.rolled?.(msg as never);
        break;
      case "chat":
        on.chat?.(msg as never);
        break;
      case "react":
        on.react?.(msg as never);
        break;
      case "log":
        on.log?.(String(msg.text));
        break;
      case "tradeOffer":
        on.tradeOffer?.(msg as never);
        break;
      case "tradeDeclined":
        on.tradeDeclined?.(msg as never);
        break;
      case "tradeClosed":
        on.tradeClosed?.(msg as never);
        break;
      case "error": {
        const message = String(msg.message);
        if (rejoining) taken = message === "Seat is taken.";
        if (rejoining && message === "Seat is taken." && attempt > 0) {
          // After a drop the host can still see our old socket as open (no keepalive yet, #202).
          // Close this one and keep backing off until the host lets the old one go.
          ws.close();
          break;
        }
        on.error?.(message);
        if (rejoining) {
          // "Seat is taken." on a fresh rejoin: another tab of ours is sitting in it, so keep the secret.
          // "Seat is gone." or no such table: nothing to go back to.
          ws.close();
          giveUp(taken);
        }
        break;
      }
    }
  };

  dial();

  return {
    open: (me) => send({ type: "hello", ...me }),
    join: (code, me) => send({ type: "hello", code: code.toUpperCase(), ...me }),
    watch: (code) => send({ type: "hello", code: code.toUpperCase(), watch: true }),
    peek: (code) => send({ type: "peek", code: code.toUpperCase() }),
    rejoin: (code, secret) => {
      stamp = null;
      seat = { code: code.toUpperCase(), secret };
      rejoining = true;
      // Not queued: onopen sends it, so a failed first dial cannot leave a second hello behind.
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: "hello", code: seat.code, secret }));
    },
    ready: (value) => send({ type: "ready", value }),
    start: () => send({ type: "start" }),
    again: () => send({ type: "again" }),
    act: (action) => {
      const intent = toIntent(action);
      return intent ? act(intent) : false;
    },
    ask: (give, want) => {
      act({ type: "tradeAsk", give, want });
    },
    answer: (tradeId, yes) => {
      act({ type: "tradeAnswer", tradeId, yes });
    },
    say: (text) => send({ type: "chat", text }),
    react: (emote, to) => send({ type: "react", emote, to }),
    drop: () => ws.close(),
    wake: () => {
      if (!timer) return;
      clearTimeout(timer);
      dial();
    },
    close: () => {
      stamp = null;
      closedByUs = true;
      if (timer) clearTimeout(timer);
      timer = null;
      ws.close();
    },
  };
}
