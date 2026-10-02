import { create } from "zustand";
import { createGame } from "./board";
import { applyAction, legalCities, legalRoads, legalSettle, stealTargets } from "./rules";

const BANNER_MS = 2500;
let bannerTimer: ReturnType<typeof setTimeout> | null = null;
function showBanner(set: (p: { banner: string | null }) => void, text: string) {
  if (bannerTimer) clearTimeout(bannerTimer);
  set({ banner: text });
  bannerTimer = setTimeout(() => set({ banner: null }), BANNER_MS);
}

// "Tide rolls 4+5 = 9 · Ember +1 wool · Pine +2 ore"
function rollLine(roller: string, dice: [number, number], gains: { name: string; resource: string; amount: number }[]) {
  const parts = gains.map((g) => `${g.name} +${g.amount} ${g.resource}`);
  return [`${roller} rolls ${dice[0]}+${dice[1]} = ${dice[0] + dice[1]}`, ...(parts.length ? parts : ["nobody gathers"])].join(" · ");
}

function gainsBetween(before: GameState, after: GameState) {
  const out: { name: string; resource: string; amount: number }[] = [];
  for (const p of after.players) {
    const was = before.players.find((x) => x.id === p.id);
    if (!was) continue;
    for (const r of RESOURCES) {
      const d = p.resources[r] - was.resources[r];
      if (d > 0) out.push({ name: p.name, resource: r, amount: d });
    }
  }
  return out;
}

// An award that changed hands between two states, as one line, or null.
function awardLine(before: GameState | null, after: GameState) {
  if (!before) return null;
  const who = (id: string | null) => after.players.find((p) => p.id === id)?.name ?? "Nobody";
  if (after.longestRoad !== before.longestRoad) {
    return after.longestRoad ? `${who(after.longestRoad)} holds the longest path` : `${who(before.longestRoad)} loses the longest path`;
  }
  if (after.largestArmy !== before.largestArmy) return `${who(after.largestArmy)} holds the largest army`;
  return null;
}

// The board as it would be with these paths laid, so the second pick of a path fortune can glow (#184).
function withPaths(state: GameState, edgeIds: string[], pid: string): GameState {
  if (!edgeIds.length) return state;
  return { ...state, edges: state.edges.map((e) => (edgeIds.includes(e.id) ? { ...e, path: pid } : e)) };
}
import { chooseBotAction } from "./ai";
import { PLAYER_COLORS, RESOURCES, type Action, type BuildMode, type GameState } from "./types";
import { connectTable, hostUrl, type Bag, type ChatLine, type Legal, type Me, type Reaction, type Seat, type TableClient } from "@/lib/net/table";

// The ask-the-table offer every seat is looking at (docs/BUILD_BIBLE.md 4.4). `until` is when the host's 20 s run out.
export interface OpenOffer {
  tradeId: string;
  from: string;
  fromName: string;
  give: Bag;
  want: Bag;
  until: number;
}

let outcomeTimer: ReturnType<typeof setTimeout> | null = null;

export type Screen = "title" | "lobby" | "play";

interface GameStore {
  screen: Screen;
  name: string;
  // null until the player picks a swatch; see savedColor().
  color: string | null;
  mode: "ai" | "hotseat" | "online";
  table: string;
  localId: string;
  host: boolean;
  state: GameState | null;
  error: string | null;
  buildMode: BuildMode;
  // Edges picked so far for a path fortune (buildMode "roadCard"); sent together as one playRoad.
  roadPicks: string[];
  howTo: boolean;
  toast: string | null;
  // One line everyone reads for a moment: the roll and who got what, or an award changing hands (#188).
  banner: string | null;
  setName: (n: string) => void;
  setColor: (c: string) => void;
  setHowTo: (v: boolean) => void;
  setBuildMode: (m: BuildMode) => void;
  startAi: () => void;
  startHotseat: (count: number) => void;
  loadState: (s: GameState, localId: string, host: boolean, table?: string) => void;
  goTitle: () => void;
  dispatch: (action: Action, asId?: string) => { ok: boolean; state?: GameState; error?: string };
  runBots: () => void;
  pickHex: (id: string) => void;
  pickVertex: (id: string) => void;
  pickEdge: (id: string) => void;
  // Coarse pointers pick a mark first and confirm it with the Place chip (docs/design/mobile-camera-touch.md).
  pendingPlace: { kind: "hex" | "vertex" | "edge"; id: string } | null;
  setPendingPlace: (p: { kind: "hex" | "vertex" | "edge"; id: string } | null) => void;
  confirmPlace: () => void;
  highlights: () => { vertices: string[]; edges: string[]; hexes: string[] };
  // Set when a robber/knight hex has 2+ steal targets and needs the player to pick one.
  pendingSteal: { hexId: string; kind: "moveRobber" | "playKnight"; targets: string[] } | null;
  chooseSteal: (playerId: string) => void;
  // Online table (docs/design/online-client.md)
  net: TableClient | null;
  code: string;
  isHost: boolean;
  seats: Seat[];
  legal: Legal | null;
  lobbyLog: string;
  hostTable: () => void;
  joinTable: (code: string) => void;
  // Sit back down in the seat this browser held (localStorage), e.g. after a reload (#196).
  rejoinTable: () => boolean;
  setReady: (value: boolean) => void;
  startTable: () => void;
  // Table chat (docs/design/chat.md)
  // This tab's seat id (s0...), from welcome. localId is the player id once the game starts.
  seatId: string;
  chat: ChatLine[];
  reactions: Reaction[];
  chatOpen: boolean;
  unread: number;
  chatDraft: string;
  setChatOpen: (v: boolean) => void;
  setChatDraft: (v: string) => void;
  sendChat: (text: string) => void;
  sendReact: (emote: string, to?: string) => void;
  // Ask-the-table trades (docs/BUILD_BIBLE.md 4.4): the open offer, who has said No to it, and the asker's closing line.
  offer: OpenOffer | null;
  declined: string[];
  tradeOutcome: string | null;
  tradeOpen: boolean;
  setTradeOpen: (v: boolean) => void;
  askTable: (give: Bag, want: Bag) => void;
  answerTrade: (yes: boolean) => void;
}

const CHAT_OPEN_KEY = "emberisle-chat-open";
// The table code and this seat's secret from the last welcome, so a reload or a new tab can rejoin (#196).
const SEAT_KEY = "emberisle-seat";

function savedSeat(): { code: string; secret: string } | null {
  try {
    const raw = localStorage.getItem(SEAT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { code?: unknown; secret?: unknown };
    return typeof v.code === "string" && typeof v.secret === "string" ? { code: v.code, secret: v.secret } : null;
  } catch {
    return null;
  }
}

function rememberSeat(seat: { code: string; secret: string } | null) {
  try {
    if (seat) localStorage.setItem(SEAT_KEY, JSON.stringify(seat));
    else localStorage.removeItem(SEAT_KEY);
  } catch {
    // storage can be blocked; the game still plays, it just cannot rejoin after a reload
  }
}

function savedChatOpen() {
  try {
    return localStorage.getItem(CHAT_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function savedName() {
  if (typeof window === "undefined") return "Ember";
  return localStorage.getItem("emberisle-name") || "Ember";
}

// null (not a default swatch) until the player actively picks one, so a fresh tab sends no `color`
// in `hello` and the host's existing free-color assignment runs — otherwise two players who never
// touch the picker would both request the same default color and the second would be rejected.
function savedColor(): string | null {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem("emberisle-color");
  return saved && (PLAYER_COLORS as readonly string[]).includes(saved) ? saved : null;
}

export const useGame = create<GameStore>((set, get) => ({
  screen: "title",
  name: savedName(),
  color: savedColor(),
  mode: "ai",
  table: "",
  localId: "p0",
  host: true,
  state: null,
  error: null,
  buildMode: "none",
  roadPicks: [],
  howTo: false,
  toast: null,
  banner: null,
  net: null,
  code: "",
  isHost: false,
  seats: [],
  legal: null,
  lobbyLog: "",
  pendingSteal: null,
  seatId: "",
  chat: [],
  reactions: [],
  chatOpen: savedChatOpen(),
  unread: 0,
  chatDraft: "",
  offer: null,
  declined: [],
  tradeOutcome: null,
  tradeOpen: false,
  setName: (n) => {
    const name = n.slice(0, 18) || "Ember";
    if (typeof window !== "undefined") localStorage.setItem("emberisle-name", name);
    set({ name });
  },
  setColor: (c) => {
    if (typeof window !== "undefined") localStorage.setItem("emberisle-color", c);
    set({ color: c });
  },
  setHowTo: (v) => set({ howTo: v }),
  setBuildMode: (m) => set({ buildMode: m, roadPicks: [] }),
  startAi: () => {
    // A table left dialing (a reload with a saved seat) must not pull a practice game back to the lobby.
    get().net?.close();
    const name = get().name;
    const state = createGame({ humans: [{ name }], bots: 3 });
    set({
      screen: "play",
      mode: "ai",
      host: true,
      localId: "p0",
      state,
      error: null,
      toast: null,
      buildMode: "none",
      net: null,
    });
  },
  startHotseat: (count) => {
    get().net?.close();
    const humans = Array.from({ length: count }, (_, i) => ({
      name: i === 0 ? get().name : `Seat ${i + 1}`,
    }));
    const state = createGame({ humans, bots: 0 });
    set({
      screen: "play",
      mode: "hotseat",
      host: true,
      localId: "p0",
      state,
      error: null,
      toast: null,
      buildMode: "none",
      net: null,
    });
  },
  loadState: (s, localId, host, table) =>
    set({
      screen: "play",
      mode: "online",
      state: s,
      localId,
      host,
      table: table ?? get().table,
      error: null,
      pendingSteal: null,
    }),
  goTitle: () => {
    // Leaving on purpose frees the seat; only a drop keeps it.
    rememberSeat(null);
    get().net?.close();
    set({
      screen: "title",
      state: null,
      error: null,
      buildMode: "none",
      net: null,
      seats: [],
      legal: null,
      code: "",
      pendingSteal: null,
      chat: [],
      reactions: [],
      unread: 0,
      chatDraft: "",
      lobbyLog: "",
      seatId: "",
      isHost: false,
      roadPicks: [],
      pendingPlace: null,
      toast: null,
      offer: null,
      declined: [],
      tradeOutcome: null,
      tradeOpen: false,
    });
  },
  dispatch: (action, asId) => {
    const { state, localId, mode, net } = get();
    if (!state) return { ok: false, error: "No game." };
    if (mode === "online") {
      // The host is the rules; its next state message updates the board.
      if (!net?.act(action)) return { ok: false, error: "Not available online." };
      set({ buildMode: "none", roadPicks: [] });
      return { ok: true };
    }
    const actor = asId ?? (mode === "hotseat" ? state.current : localId);
    const res = applyAction(state, actor, action);
    if (res.error) {
      set({ error: res.error, toast: res.error });
      return { ok: false, error: res.error };
    }
    set({ state: res.state, error: null, toast: null, buildMode: "none", roadPicks: [] });
    if (action.type === "roll" && res.state.dice) {
      const roller = state.players.find((p) => p.id === actor)?.name ?? actor;
      showBanner(set, rollLine(roller, res.state.dice, gainsBetween(state, res.state)));
    } else {
      const swing = awardLine(state, res.state);
      if (swing) showBanner(set, swing);
    }
    return { ok: true, state: res.state };
  },
  runBots: () => {
    const { state, dispatch, mode } = get();
    // Online, the host runs the bots; a bot move sent as our own intent only draws "Not your turn."
    if (!state || mode === "online" || state.phase === "over") return;
    if (state.phase === "discard") {
      for (const p of state.players) {
        if (p.kind === "bot" && (state.discardNeeded[p.id] ?? 0) > 0) {
          const a = chooseBotAction(state, p.id);
          if (a) dispatch(a, p.id);
          return;
        }
      }
    }
    const cur = state.players.find((p) => p.id === state.current);
    if (cur?.kind !== "bot") return;
    const a = chooseBotAction(state, cur.id);
    if (a) dispatch(a, cur.id);
  },
  pickHex: (id) => {
    const { state, localId, mode, buildMode, legal, dispatch } = get();
    if (!state) return;
    const actor = mode === "hotseat" ? state.current : localId;
    const kind: "moveRobber" | "playKnight" | null =
      state.phase === "robber" && state.current === actor ? "moveRobber" : buildMode === "knight" ? "playKnight" : null;
    if (!kind) return;
    // Online, the host says whom each hex can rob. Offline, ask the rules the same question (#189).
    const targets = mode === "online" ? (legal?.steal[id] ?? []) : stealTargets(state, id, actor);
    if (targets.length > 1) {
      set({ pendingSteal: { hexId: id, kind, targets } });
      return;
    }
    set({ pendingSteal: null });
    const stealFrom = targets[0] ?? null;
    if (kind === "moveRobber") dispatch({ type: "moveRobber", hexId: id, stealFrom });
    else dispatch({ type: "playKnight", hexId: id, stealFrom });
  },
  pendingPlace: null,
  setPendingPlace: (p) => set({ pendingPlace: p }),
  confirmPlace: () => {
    const { pendingPlace: p, pickHex, pickVertex, pickEdge } = get();
    if (!p) return;
    set({ pendingPlace: null });
    if (p.kind === "hex") pickHex(p.id);
    if (p.kind === "vertex") pickVertex(p.id);
    if (p.kind === "edge") pickEdge(p.id);
  },
  chooseSteal: (playerId) => {
    const { pendingSteal, dispatch } = get();
    if (!pendingSteal) return;
    const { hexId, kind } = pendingSteal;
    if (kind === "moveRobber") dispatch({ type: "moveRobber", hexId, stealFrom: playerId });
    else dispatch({ type: "playKnight", hexId, stealFrom: playerId });
    set({ pendingSteal: null });
  },
  pickVertex: (id) => {
    const { state, localId, mode, buildMode, dispatch } = get();
    if (!state) return;
    const actor = mode === "hotseat" ? state.current : localId;
    if (state.phase === "setupSettle" && state.current === actor) {
      dispatch({ type: "setupSettle", vertexId: id });
      return;
    }
    if (buildMode === "outpost") dispatch({ type: "buildOutpost", vertexId: id });
    if (buildMode === "stronghold") dispatch({ type: "buildStronghold", vertexId: id });
  },
  pickEdge: (id) => {
    const { state, localId, mode, buildMode, roadPicks, dispatch } = get();
    if (!state) return;
    const actor = mode === "hotseat" ? state.current : localId;
    if (state.phase === "setupRoad" && state.current === actor) {
      dispatch({ type: "setupRoad", edgeId: id });
      return;
    }
    if (buildMode === "path") dispatch({ type: "buildPath", edgeId: id });
    if (buildMode === "roadCard") {
      // One pick at a time, each legal given the ones before it. Two picks play the card; one is
      // enough when no second path is legal or the stock is down to one (rules.ts playRoad).
      if (!legalRoads(withPaths(state, roadPicks, actor), actor, false).includes(id)) return;
      const picks = [...roadPicks, id];
      const me = state.players.find((p) => p.id === actor);
      const canPlaceMore = (me?.pathsLeft ?? 0) > picks.length && legalRoads(withPaths(state, picks, actor), actor, false).length > 0;
      if (picks.length < 2 && canPlaceMore) {
        set({ roadPicks: picks });
        return;
      }
      dispatch({ type: "playRoad", edgeIds: picks });
    }
  },
  highlights: () => {
    const { state, localId, mode, buildMode, legal, roadPicks } = get();
    if (!state) return { vertices: [], edges: [], hexes: [] };
    if (buildMode === "roadCard") {
      // Same rules online and offline: the client holds the whole board, and the host re-checks the play.
      const actor = mode === "hotseat" ? state.current : localId;
      return { vertices: [], edges: legalRoads(withPaths(state, roadPicks, actor), actor, false), hexes: [] };
    }
    if (mode === "online") {
      const l = legal;
      if (!l) return { vertices: [], edges: [], hexes: [] };
      if (state.phase === "setupSettle") return { vertices: l.outpost, edges: [], hexes: [] };
      if (state.phase === "setupRoad") return { vertices: [], edges: l.path, hexes: [] };
      if (state.phase === "robber") return { vertices: [], edges: [], hexes: l.wayfarer };
      if (buildMode === "knight") return { vertices: [], edges: [], hexes: state.hexes.filter((h) => h.id !== state.robberHex).map((h) => h.id) };
      if (buildMode === "outpost") return { vertices: l.outpost, edges: [], hexes: [] };
      if (buildMode === "stronghold") return { vertices: l.stronghold, edges: [], hexes: [] };
      if (buildMode === "path") return { vertices: [], edges: l.path, hexes: [] };
      return { vertices: [], edges: [], hexes: [] };
    }
    const actor = mode === "hotseat" ? state.current : localId;
    if (state.current !== actor && state.phase !== "discard") {
      return { vertices: [], edges: [], hexes: [] };
    }
    if (state.phase === "setupSettle") return { vertices: legalSettle(state, actor, true), edges: [], hexes: [] };
    if (state.phase === "setupRoad") return { vertices: [], edges: legalRoads(state, actor, true), hexes: [] };
    if (state.phase === "robber" || buildMode === "knight") {
      return { vertices: [], edges: [], hexes: state.hexes.filter((h) => h.id !== state.robberHex).map((h) => h.id) };
    }
    if (buildMode === "outpost") return { vertices: legalSettle(state, actor, false), edges: [], hexes: [] };
    if (buildMode === "stronghold") return { vertices: legalCities(state, actor), edges: [], hexes: [] };
    if (buildMode === "path") return { vertices: [], edges: legalRoads(state, actor, false), hexes: [] };
    return { vertices: [], edges: [], hexes: [] };
  },
  hostTable: () => connect(set, get, (t, me) => t.open(me)),
  joinTable: (code) => connect(set, get, (t, me) => t.join(code, me)),
  rejoinTable: () => {
    const seat = savedSeat();
    if (!seat) return false;
    connect(set, get, (t) => t.rejoin(seat.code, seat.secret));
    return true;
  },
  setReady: (value) => get().net?.ready(value),
  startTable: () => get().net?.start(),
  setChatOpen: (v) => {
    try {
      localStorage.setItem(CHAT_OPEN_KEY, v ? "1" : "0");
    } catch {
      // storage can be blocked; the dock still works for this page
    }
    set(v ? { chatOpen: true, unread: 0 } : { chatOpen: false });
  },
  setChatDraft: (v) => set({ chatDraft: v }),
  sendChat: (text) => get().net?.say(text),
  sendReact: (emote, to) => get().net?.react(emote, to),
  setTradeOpen: (v) => set({ tradeOpen: v }),
  askTable: (give, want) => {
    get().net?.ask(give, want);
    set({ tradeOpen: false });
  },
  answerTrade: (yes) => {
    const { offer, net } = get();
    if (offer) net?.answer(offer.tradeId, yes);
  },
}));

type Set = (partial: Partial<GameStore>) => void;
type Get = () => GameStore;

function connect(set: Set, get: Get, first: (t: TableClient, me: Me) => void) {
  get().net?.close();
  const table = connectTable(hostUrl(window.location), {
    welcome: ({ code, you, host, chat, secret }) => {
      if (secret) rememberSeat({ code, secret });
      // A rejoin lands in the lobby for a moment; the host's state push (if the game started) moves it to play.
      set({ code, seatId: you, isHost: host, screen: "lobby", mode: "online", error: null, toast: null, chat: (chat ?? []).slice(-50), reactions: [], unread: 0 });
    },
    reconnecting: (attempt) => set({ error: `Reconnecting… (try ${attempt})`, toast: "Reconnecting…" }),
    chat: (line) => {
      const { chat, chatOpen, unread, seatId, screen } = get();
      // The lobby box is always open, so only lines that arrive during the game can be unread.
      const counts = screen === "play" && !chatOpen && line.seat !== seatId;
      set({ chat: [...chat, line].slice(-50), unread: counts ? unread + 1 : unread });
    },
    react: (r) => {
      set({ reactions: [...get().reactions, r] });
      setTimeout(() => set({ reactions: get().reactions.filter((x) => x !== r) }), 2000);
    },
    seats: ({ code, seats }) => set({ code, seats }),
    rolled: ({ dice, gains }) => {
      // The host sends this before the state that follows it, so `current` is still the roller.
      const st = get().state;
      const roller = st?.players.find((p) => p.id === st.current)?.name ?? "Someone";
      showBanner(set, rollLine(roller, dice, gains));
    },
    state: ({ you, game, legal }) => {
      const swing = awardLine(get().state, game);
      set({ legal });
      get().loadState(game, you, get().isHost, get().code);
      if (swing) showBanner(set, swing);
    },
    log: (text) => set({ lobbyLog: text }),
    tradeOffer: ({ tradeId, from, give, want, seconds }) => {
      const fromName = get().state?.players.find((p) => p.id === from)?.name ?? "Someone";
      set({ offer: { tradeId, from, fromName, give, want, until: Date.now() + seconds * 1000 }, declined: [], tradeOutcome: null });
    },
    tradeDeclined: ({ tradeId, by }) => {
      const { offer, declined } = get();
      if (offer?.tradeId === tradeId && !declined.includes(by)) set({ declined: [...declined, by] });
    },
    tradeClosed: ({ tradeId, taker }) => {
      const { offer, localId, state } = get();
      if (offer?.tradeId !== tradeId) return;
      const takerName = state?.players.find((p) => p.id === taker)?.name ?? "Someone";
      set({ offer: null, declined: [] });
      if (taker) showBanner(set, `${takerName} takes ${offer.fromName}'s trade`);
      if (offer.from !== localId) return;
      // The asker's toast lingers with the outcome for as long as a banner would.
      if (outcomeTimer) clearTimeout(outcomeTimer);
      set({ tradeOutcome: taker ? `${takerName} takes it.` : "Nobody took it." });
      outcomeTimer = setTimeout(() => set({ tradeOutcome: null }), BANNER_MS);
    },
    error: (message) => set({ error: message, toast: message }),
    closed: (keepSeat) => {
      if (keepSeat) {
        set({ error: "Your seat is open in another tab", toast: "Your seat is open in another tab", screen: "title", net: null, state: null });
        return;
      }
      rememberSeat(null);
      set({ error: "Lost the table", toast: "Lost the table", screen: "title", net: null, state: null });
    },
  });
  set({ net: table, mode: "online", error: null });
  first(table, { name: get().name, color: get().color ?? undefined });
}
