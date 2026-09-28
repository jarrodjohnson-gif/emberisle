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

export interface TableEvents {
  welcome(msg: { code: string; you: string; host: boolean; chat?: ChatLine[] }): void;
  seats(msg: { code: string; seats: Seat[] }): void;
  state(msg: { you: string; game: GameState; legal: Legal }): void;
  rolled(msg: { dice: [number, number]; sum: number; gains: Gain[] }): void;
  chat(line: ChatLine): void;
  react(r: Reaction): void;
  log(text: string): void;
  error(message: string): void;
  closed(): void;
}

export interface Me {
  name: string;
  color?: string;
  avatarId?: string;
}

export interface TableClient {
  open(me: Me): void;
  join(code: string, me: Me): void;
  ready(value: boolean): void;
  start(): void;
  act(action: Action): boolean;
  say(text: string): void;
  react(emote: string, to?: string): void;
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

export function connectTable(url: string, on: Partial<TableEvents>, Socket?: SocketCtor): TableClient {
  const Ctor = Socket ?? (globalThis.WebSocket as unknown as SocketCtor);
  const ws = new Ctor(url);
  const queue: string[] = [];
  let closedByUs = false;

  const send = (msg: Record<string, unknown>) => {
    const raw = JSON.stringify(msg);
    if (ws.readyState === 1) ws.send(raw);
    else queue.push(raw);
  };

  ws.onopen = () => {
    for (const raw of queue.splice(0)) ws.send(raw);
  };
  ws.onclose = () => {
    if (!closedByUs) on.closed?.();
  };
  ws.onmessage = (ev) => {
    let msg: { type?: string; [k: string]: unknown };
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    switch (msg.type) {
      case "welcome":
        on.welcome?.(msg as never);
        break;
      case "seats":
        on.seats?.(msg as never);
        break;
      case "state":
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
      case "error":
        on.error?.(String(msg.message));
        break;
    }
  };

  return {
    open: (me) => send({ type: "hello", ...me }),
    join: (code, me) => send({ type: "hello", code: code.toUpperCase(), ...me }),
    ready: (value) => send({ type: "ready", value }),
    start: () => send({ type: "start" }),
    act: (action) => {
      const intent = toIntent(action);
      if (intent) send(intent);
      return Boolean(intent);
    },
    say: (text) => send({ type: "chat", text }),
    react: (emote, to) => send({ type: "react", emote, to }),
    close: () => {
      closedByUs = true;
      ws.close();
    },
  };
}
