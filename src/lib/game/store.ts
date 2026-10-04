import { create } from "zustand";
import { createGame } from "./board";
import { applyAction, bankShort, legalCities, legalRoads, legalSettle, stealTargets } from "./rules";

const BANNER_MS = 2500;
let bannerTimer: ReturnType<typeof setTimeout> | null = null;
function showBanner(set: (p: { banner: string | null }) => void, text: string) {
  if (bannerTimer) clearTimeout(bannerTimer);
  set({ banner: text });
  bannerTimer = setTimeout(() => set({ banner: null }), BANNER_MS);
}

// "Tide rolls 4+5 = 9 · Ember +1 wool · Pine +2 ore", ending "· bank short of grain" when the bank paid nobody some resource
function rollLine(roller: string, dice: [number, number], gains: { name: string; resource: string; amount: number }[], short: string[]) {
  const parts = gains.map((g) => `${g.name} +${g.amount} ${g.resource}`);
  const tail = short.length ? [`bank short of ${short.join(" and ")}`] : [];
  return [`${roller} rolls ${dice[0]}+${dice[1]} = ${dice[0] + dice[1]}`, ...(parts.length ? parts : ["nobody gathers"]), ...tail].join(" · ");
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

// The roll-off's new log lines as one banner ("Dune rolls a 4. · Dune places first, then …"), or null.
function rollOffLine(before: GameState | null, after: GameState) {
  if (before?.phase !== "rollOff") return null;
  const lines = newLog(before.log, after.log);
  return lines.length ? lines.join(" · ") : null;
}

// The table sound a change of state makes, if any (#303): the same diff serves practice, hotseat, and the host's pushes.
function soundFor(before: GameState | null, after: GameState): SoundName | null {
  if (!before) return null;
  if (after.winner && !before.winner) return "win";
  if (after.dice && !before.dice) return "dice_land";
  const built = (s: GameState, kind: "outpost" | "stronghold") => s.vertices.filter((v) => v.building?.kind === kind).length;
  if (built(after, "stronghold") > built(before, "stronghold")) return "stronghold_place";
  if (built(after, "outpost") > built(before, "outpost")) return "outpost_place";
  const paths = (s: GameState) => s.edges.filter((e) => e.path).length;
  if (paths(after) > paths(before)) return "path_place";
  if ((after.deckLeft ?? after.deck.length) < (before.deckLeft ?? before.deck.length)) return "card_buy";
  if (after.playedCard && !before.playedCard) return "card_play";
  return null;
}

// Play the sound for a state change, and the your-turn chime when the turn comes round to this browser's seat
// (not in hotseat, where every seat is this browser).
function hear(before: GameState | null, after: GameState, me: string, mode: GameStore["mode"]) {
  const sound = soundFor(before, after);
  if (sound) play(sound);
  if (mode !== "hotseat" && before && after.current === me && before.current !== me && after.phase !== "over") yourTurn();
}

// The game log the dock shows (#305): a line of `state.log` or a host `log` message, stamped when this browser saw it.
export interface GameLogLine {
  at: number;
  text: string;
}
const GAME_LOG_MAX = 200;
const LOG_FILTER_KEY = "emberisle-log-filter";

// The engine keeps only the last 41 log lines (rules.ts `log`), so once the log is full its length never grows and
// `after.slice(before.length)` would be empty. The new lines are what follows the longest tail of the old log that
// the new one still starts with.
function newLog(before: string[], after: string[]) {
  for (let k = Math.min(before.length, after.length); k > 0; k--) {
    if (before.slice(-k).every((line, i) => line === after[i])) return after.slice(k);
  }
  return after;
}

function stamp(lines: string[]): GameLogLine[] {
  const at = Date.now();
  return lines.map((text) => ({ at, text }));
}

function appendLog(log: GameLogLine[], lines: string[]) {
  return lines.length ? [...log, ...stamp(lines)].slice(-GAME_LOG_MAX) : log;
}

function savedLogFilter(): "all" | "chat" {
  try {
    return localStorage.getItem(LOG_FILTER_KEY) === "chat" ? "chat" : "all";
  } catch {
    return "all";
  }
}

// The board as it would be with these paths laid, so the second pick of a path fortune can glow (#184).
function withPaths(state: GameState, edgeIds: string[], pid: string): GameState {
  if (!edgeIds.length) return state;
  return { ...state, edges: state.edges.map((e) => (edgeIds.includes(e.id) ? { ...e, path: pid } : e)) };
}
import { chooseBotAction } from "./ai";
import { PLAYER_COLORS, RESOURCES, type Action, type BuildMode, type GameState } from "./types";
import { connectTable, hostUrl, type Bag, type ChatLine, type Legal, type Me, type Reaction, type Seat, type TableClient } from "@/lib/net/table";
import { play, yourTurn, type SoundName } from "@/lib/sound";

// The ask-the-table offer every seat is looking at (docs/BUILD_BIBLE.md 4.4). `until` is when the host's 20 s run out.
export interface OpenOffer {
  tradeId: string;
  from: string;
  fromName: string;
  give: Bag;
  want: Bag;
  until: number;
}

// The window listeners that wake a backing-off table; one connection at a time, so one remover.
let stopWake: (() => void) | null = null;
function clearWake() {
  stopWake?.();
  stopWake = null;
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
  // Bumped on every refused move, so the same error twice is announced twice (#380).
  errorSeq: number;
  buildMode: BuildMode;
  // Edges picked so far for a path fortune (buildMode "roadCard"); sent together as one playRoad.
  roadPicks: string[];
  howTo: boolean;
  /** The element that opened How to play; Safari does not focus buttons on click, so activeElement cannot be trusted. */
  howToOpener: HTMLElement | null;
  toast: string | null;
  // One line everyone reads for a moment: the roll and who got what, or an award changing hands (#188).
  banner: string | null;
  setName: (n: string) => void;
  setColor: (c: string) => void;
  setHowTo: (v: boolean, opener?: HTMLElement | null) => void;
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
  // True when `net` is the pre-join peek connection (docs/design/color-peek.md), not a seated or rejoining one.
  peeking: boolean;
  code: string;
  isHost: boolean;
  seats: Seat[];
  legal: Legal | null;
  lobbyLog: string;
  hostTable: () => void;
  joinTable: (code: string) => void;
  // Ask which colors a lobby already holds, on a connection of its own, before the player joins.
  peekTable: (code: string) => void;
  // Watch a started table read-only (docs/design/spectator.md): no seat, no actions, no chat input, no rejoin.
  watchTable: (code: string) => void;
  // True from a `welcome {spectator:true}` until the Title; every seat-only action returns at once while it is set.
  spectator: boolean;
  // How many spectators the table has, from `seats {watching}` (#347).
  watching: number;
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
  // The whole game log, for the dock (#305): the new lines of `state.log` after each local action, and the host's `log` messages online.
  gameLog: GameLogLine[];
  // Which rows the dock lists: the chat alone, or the chat and the game log together. Remembered like `chatOpen`.
  logFilter: "all" | "chat";
  setLogFilter: (v: "all" | "chat") => void;
  // Ask-the-table trades (docs/BUILD_BIBLE.md 4.4): the open offer, who has said No to it, and the asker's closing line.
  offer: OpenOffer | null;
  declined: string[];
  tradeOutcome: string | null;
  tradeOpen: boolean;
  // Who opened the panel, so focus can go back there on close (Safari does not focus buttons on click, #302).
  tradeOpener: HTMLElement | null;
  setTradeOpen: (v: boolean, opener?: HTMLElement | null) => void;
  askTable: (give: Bag, want: Bag) => void;
  answerTrade: (yes: boolean) => void;
  // The player whose action menu is open in the HUD rail or seat strip (docs/design/chat.md "The player action menu").
  menuFor: string | null;
  openMenu: (id: string | null) => void;
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
  errorSeq: 0,
  buildMode: "none",
  roadPicks: [],
  howTo: false,
  howToOpener: null,
  toast: null,
  banner: null,
  net: null,
  peeking: false,
  code: "",
  isHost: false,
  seats: [],
  legal: null,
  lobbyLog: "",
  spectator: false,
  watching: 0,
  pendingSteal: null,
  seatId: "",
  chat: [],
  reactions: [],
  chatOpen: savedChatOpen(),
  unread: 0,
  chatDraft: "",
  gameLog: [],
  logFilter: savedLogFilter(),
  offer: null,
  declined: [],
  tradeOutcome: null,
  tradeOpen: false,
  tradeOpener: null,
  menuFor: null,
  setName: (n) => {
    const name = n.slice(0, 18) || "Ember";
    if (typeof window !== "undefined") localStorage.setItem("emberisle-name", name);
    set({ name });
  },
  setColor: (c) => {
    if (typeof window !== "undefined") localStorage.setItem("emberisle-color", c);
    set({ color: c });
  },
  setHowTo: (v, opener) => set({ howTo: v, howToOpener: v ? (opener ?? null) : null }),
  setBuildMode: (m) => set({ buildMode: m, roadPicks: [] }),
  startAi: () => {
    // A table left dialing (a reload with a saved seat) must not pull a practice game back to the lobby.
    clearWake();
    get().net?.close();
    const name = get().name;
    const state = createGame({ humans: [{ name }], bots: 3 });
    set({
      screen: "play",
      mode: "ai",
      host: true,
      localId: "p0",
      state,
      gameLog: stamp(state.log),
      error: null,
      toast: null,
      buildMode: "none",
      net: null,
      peeking: false,
      spectator: false,
    });
  },
  startHotseat: (count) => {
    clearWake();
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
      gameLog: stamp(state.log),
      error: null,
      toast: null,
      buildMode: "none",
      net: null,
      peeking: false,
      spectator: false,
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
    clearWake();
    get().net?.close();
    set({
      screen: "title",
      state: null,
      error: null,
      buildMode: "none",
      net: null,
      peeking: false,
      seats: [],
      legal: null,
      code: "",
      spectator: false,
      watching: 0,
      pendingSteal: null,
      chat: [],
      reactions: [],
      unread: 0,
      chatDraft: "",
      gameLog: [],
      menuFor: null,
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
      tradeOpener: null,
    });
  },
  dispatch: (action, asId) => {
    const { state, localId, mode, net, spectator } = get();
    if (!state) return { ok: false, error: "No game." };
    if (spectator) return { ok: false, error: "Watching only." };
    if (mode === "online") {
      // The host is the rules; its next state message updates the board.
      if (!net?.act(action)) return { ok: false, error: "Not available online." };
      set({ buildMode: "none", roadPicks: [] });
      return { ok: true };
    }
    const actor = asId ?? (mode === "hotseat" ? state.current : localId);
    const res = applyAction(state, actor, action);
    if (res.error) {
      set({ error: res.error, toast: res.error, errorSeq: get().errorSeq + 1 });
      play("ui_error");
      return { ok: false, error: res.error };
    }
    set({ state: res.state, gameLog: appendLog(get().gameLog, newLog(state.log, res.state.log)), error: null, toast: null, buildMode: "none", roadPicks: [] });
    hear(state, res.state, localId, mode);
    const rollOff = rollOffLine(state, res.state);
    if (rollOff) {
      showBanner(set, rollOff);
    } else if (action.type === "roll" && res.state.dice) {
      const roller = state.players.find((p) => p.id === actor)?.name ?? actor;
      showBanner(set, rollLine(roller, res.state.dice, gainsBetween(state, res.state), bankShort(res.state)));
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
  joinTable: (code) => {
    // A color the peek showed taken at this table is sent as no color, so the host seats the first free one.
    const { code: peeked, seats, color } = get();
    const free = color && !(peeked === code.toUpperCase() && seats.some((s) => s.color === color));
    connect(set, get, (t, me) => t.join(code, { ...me, color: free ? me.color : undefined }));
  },
  peekTable: (code) => {
    const { screen, net, peeking } = get();
    if (screen !== "title") return;
    // A non-peek `net` is the page-load rejoin; a peek queued on it would reach a seated socket and come back "not ready".
    if (net) return peeking ? net.peek(code) : undefined;
    connect(set, get, (t) => t.peek(code), "peek");
  },
  watchTable: (code) => connect(set, get, (t) => t.watch(code), "watch"),
  rejoinTable: () => {
    const seat = savedSeat();
    if (!seat) return false;
    connect(set, get, (t) => t.rejoin(seat.code, seat.secret), "quiet");
    return true;
  },
  setReady: (value) => {
    if (!get().spectator) get().net?.ready(value);
  },
  startTable: () => {
    if (!get().spectator) get().net?.start();
  },
  setChatOpen: (v) => {
    try {
      localStorage.setItem(CHAT_OPEN_KEY, v ? "1" : "0");
    } catch {
      // storage can be blocked; the dock still works for this page
    }
    set(v ? { chatOpen: true, unread: 0 } : { chatOpen: false });
  },
  setChatDraft: (v) => set({ chatDraft: v }),
  setLogFilter: (v) => {
    try {
      localStorage.setItem(LOG_FILTER_KEY, v);
    } catch {
      // storage can be blocked; the filter still holds for this page
    }
    set({ logFilter: v });
  },
  sendChat: (text) => {
    if (!get().spectator) get().net?.say(text);
  },
  sendReact: (emote, to) => {
    if (!get().spectator) get().net?.react(emote, to);
  },
  setTradeOpen: (v, opener) => set({ tradeOpen: v, tradeOpener: v ? (opener ?? null) : null }),
  askTable: (give, want) => {
    if (!get().spectator) get().net?.ask(give, want);
    set({ tradeOpen: false });
  },
  answerTrade: (yes) => {
    const { offer, net, spectator } = get();
    if (offer && !spectator) net?.answer(offer.tradeId, yes);
  },
  openMenu: (id) => {
    if (!get().spectator) set({ menuFor: id });
  },
}));

type Set = (partial: Partial<GameStore>) => void;
type Get = () => GameStore;

// "quiet" is the automatic rejoin on page load: until the first welcome, a dead seat is dropped without telling the player.
// "peek" asks a lobby for its seats before joining (docs/design/color-peek.md): it never seats, toasts, or touches the saved seat.
// "watch" is a spectator (docs/design/spectator.md): no seat and no secret, so a drop never redials and must not erase a
// seat this browser saved for another table.
type ConnectKind = "normal" | "quiet" | "peek" | "watch";
function connect(set: Set, get: Get, first: (t: TableClient, me: Me) => void, kind: ConnectKind = "normal") {
  clearWake();
  get().net?.close();
  let pending = kind === "quiet";
  let welcomed = false;
  const table = connectTable(hostUrl(window.location), {
    welcome: ({ code, you, host, chat, secret, spectator }) => {
      pending = false;
      welcomed = true;
      if (secret) rememberSeat({ code, secret });
      // A page-load rejoin has no state yet, so it passes through the lobby until the host's state push moves it to play.
      // A mid-game reconnect already holds the game: stay on the board so the HUD keeps its local state.
      const inGame = get().state !== null && get().screen === "play";
      // Chat and game-log lines sort together by this browser's clock, never the host's (#305): the history keeps the
      // stamps of the lines this tab already held, and the rest arrive now, before any log line that follows.
      const known = new Map(get().chat.map((l) => [l.id, l.at]));
      const now = Date.now();
      const history = (chat ?? []).slice(-50).map((l) => ({ ...l, at: known.get(l.id) ?? now }));
      if (spectator) {
        // No lobby for a watcher: the host's first `state`, which follows at once, moves it to the board.
        set({ code, spectator: true, seatId: "", isHost: false, mode: "online", error: null, toast: null, chat: history, reactions: [], unread: 0 });
        return;
      }
      set({ code, spectator: false, seatId: you ?? "", isHost: host ?? false, screen: inGame ? "play" : "lobby", mode: "online", error: null, toast: null, chat: history, reactions: [], unread: 0 });
    },
    reconnecting: (attempt) => set({ error: `Reconnecting… (try ${attempt})`, toast: "Reconnecting…" }),
    chat: (line) => {
      const { chat, chatOpen, unread, seatId, screen } = get();
      // The lobby box is always open, so only lines that arrive during the game can be unread.
      const counts = screen === "play" && !chatOpen && line.seat !== seatId;
      set({ chat: [...chat, { ...line, at: Date.now() }].slice(-50), unread: counts ? unread + 1 : unread });
    },
    react: (r) => {
      set({ reactions: [...get().reactions, r] });
      setTimeout(() => set({ reactions: get().reactions.filter((x) => x !== r) }), 2000);
    },
    seats: ({ code, seats, watching }) => set({ code, seats, watching: watching ?? 0 }),
    rolled: ({ dice, gains, short }) => {
      // The host sends this before the state that follows it, so `current` is still the roller.
      const st = get().state;
      const roller = st?.players.find((p) => p.id === st.current)?.name ?? "Someone";
      showBanner(set, rollLine(roller, dice, gains, short));
    },
    state: ({ you, game, legal }) => {
      // A watcher's `you` is null: "" matches no player, so nothing is ever its turn and the your-turn chime never fires.
      const me = you ?? "";
      const rollOff = rollOffLine(get().state, game);
      const swing = awardLine(get().state, game);
      hear(get().state, game, me, "online");
      // The first state after a join or a page-load rejoin seeds the log with what the engine kept, the way practice does.
      set({ legal, gameLog: get().state ? get().gameLog : appendLog(get().gameLog, game.log) });
      get().loadState(game, me, get().isHost, get().code);
      if (rollOff) showBanner(set, rollOff);
      else if (swing) showBanner(set, swing);
    },
    log: (text) => set({ lobbyLog: text, gameLog: appendLog(get().gameLog, [text]) }),
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
      play(taker ? "trade_yes" : "trade_no");
      if (taker) showBanner(set, `${takerName} takes ${offer.fromName}'s trade`);
      if (offer.from !== localId) return;
      // The asker's toast lingers with the outcome for as long as a banner would.
      if (outcomeTimer) clearTimeout(outcomeTimer);
      set({ tradeOutcome: taker ? `${takerName} takes it.` : "Nobody took it." });
      outcomeTimer = setTimeout(() => set({ tradeOutcome: null }), BANNER_MS);
    },
    error: (message) => {
      if (!pending && kind !== "peek") {
        set({ error: message, toast: message, errorSeq: get().errorSeq + 1 });
        play("ui_error");
      }
      // A refused join leaves an unseated socket the host never closes; drop it so the next peek can open its own.
      if ((kind === "normal" || kind === "watch") && !welcomed) {
        clearWake();
        table.close();
        if (get().net === table) set({ net: null, peeking: false });
      }
    },
    closed: (keepSeat) => {
      clearWake();
      if (kind === "peek") {
        if (get().net === table) set({ net: null, peeking: false });
        return;
      }
      if (keepSeat) {
        set({ error: "Your seat is open in another tab", toast: "Your seat is open in another tab", screen: "title", net: null, peeking: false, seats: [], code: "", state: null });
        return;
      }
      if (kind === "watch") {
        // A watcher holds nothing worth saving, and the seat secret in localStorage may belong to another table.
        set({ error: "Lost the table", toast: "Lost the table", screen: "title", net: null, peeking: false, seats: [], code: "", state: null, spectator: false, watching: 0 });
        return;
      }
      rememberSeat(null);
      if (pending) {
        set({ error: null, toast: null, screen: "title", net: null, peeking: false, seats: [], code: "", state: null });
        return;
      }
      set({ error: "Lost the table", toast: "Lost the table", screen: "title", net: null, peeking: false, seats: [], code: "", state: null });
    },
  });
  // A peek is not the player's action, so it leaves a join error ("Lost the table") on the Title card.
  set(kind === "peek" ? { net: table, peeking: true, mode: "online" } : { net: table, peeking: false, mode: "online", error: null });
  if (kind !== "peek") {
    const online = () => table.wake();
    const visible = () => {
      if (document.visibilityState === "visible") table.wake();
    };
    window.addEventListener("online", online);
    window.addEventListener("visibilitychange", visible);
    stopWake = () => {
      window.removeEventListener("online", online);
      window.removeEventListener("visibilitychange", visible);
    };
  }
  first(table, { name: get().name, color: get().color ?? undefined });
}
