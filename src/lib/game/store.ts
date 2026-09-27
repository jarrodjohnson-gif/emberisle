import { create } from "zustand";
import { createGame } from "./board";
import { applyAction, legalCities, legalRoads, legalSettle } from "./rules";
import { chooseBotAction } from "./ai";
import type { Action, BuildMode, GameState } from "./types";
import { connectTable, hostUrl, type Legal, type Seat, type TableClient } from "@/lib/net/table";

export type Screen = "title" | "lobby" | "play";

interface GameStore {
  screen: Screen;
  name: string;
  mode: "ai" | "hotseat" | "online";
  table: string;
  localId: string;
  host: boolean;
  state: GameState | null;
  error: string | null;
  buildMode: BuildMode;
  howTo: boolean;
  toast: string | null;
  setName: (n: string) => void;
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
  highlights: () => { vertices: string[]; edges: string[]; hexes: string[] };
  // Online table (docs/design/online-client.md)
  net: TableClient | null;
  code: string;
  isHost: boolean;
  seats: Seat[];
  legal: Legal | null;
  lobbyLog: string;
  hostTable: () => void;
  joinTable: (code: string) => void;
  setReady: (value: boolean) => void;
  startTable: () => void;
}

function savedName() {
  if (typeof window === "undefined") return "Ember";
  return localStorage.getItem("emberisle-name") || "Ember";
}

export const useGame = create<GameStore>((set, get) => ({
  screen: "title",
  name: savedName(),
  mode: "ai",
  table: "",
  localId: "p0",
  host: true,
  state: null,
  error: null,
  buildMode: "none",
  howTo: false,
  toast: null,
  net: null,
  code: "",
  isHost: false,
  seats: [],
  legal: null,
  lobbyLog: "",
  setName: (n) => {
    const name = n.slice(0, 18) || "Ember";
    if (typeof window !== "undefined") localStorage.setItem("emberisle-name", name);
    set({ name });
  },
  setHowTo: (v) => set({ howTo: v }),
  setBuildMode: (m) => set({ buildMode: m }),
  startAi: () => {
    const name = get().name;
    const state = createGame({ humans: [{ name }], bots: 3 });
    set({
      screen: "play",
      mode: "ai",
      host: true,
      localId: "p0",
      state,
      error: null,
      buildMode: "none",
    });
  },
  startHotseat: (count) => {
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
      buildMode: "none",
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
    }),
  goTitle: () => {
    get().net?.close();
    set({ screen: "title", state: null, error: null, buildMode: "none", net: null, seats: [], legal: null, code: "" });
  },
  dispatch: (action, asId) => {
    const { state, localId, mode, net } = get();
    if (!state) return { ok: false, error: "No game." };
    if (mode === "online") {
      // The host is the rules; its next state message updates the board.
      if (!net?.act(action)) return { ok: false, error: "Not available online." };
      set({ buildMode: "none" });
      return { ok: true };
    }
    const actor = asId ?? (mode === "hotseat" ? state.current : localId);
    const res = applyAction(state, actor, action);
    if (res.error) {
      set({ error: res.error, toast: res.error });
      return { ok: false, error: res.error };
    }
    set({ state: res.state, error: null, toast: null, buildMode: "none" });
    return { ok: true, state: res.state };
  },
  runBots: () => {
    const { state, dispatch } = get();
    if (!state || state.phase === "over") return;
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
    const { state, localId, mode, buildMode, dispatch } = get();
    if (!state) return;
    const actor = mode === "hotseat" ? state.current : localId;
    if (state.phase === "robber" && state.current === actor) {
      const from = mode === "online" ? (get().legal?.steal[id]?.[0] ?? null) : null;
      dispatch({ type: "moveRobber", hexId: id, stealFrom: from });
      return;
    }
    if (buildMode === "knight") {
      dispatch({ type: "playKnight", hexId: id, stealFrom: null });
    }
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
    const { state, localId, mode, buildMode, dispatch } = get();
    if (!state) return;
    const actor = mode === "hotseat" ? state.current : localId;
    if (state.phase === "setupRoad" && state.current === actor) {
      dispatch({ type: "setupRoad", edgeId: id });
      return;
    }
    if (buildMode === "path") dispatch({ type: "buildPath", edgeId: id });
  },
  highlights: () => {
    const { state, localId, mode, buildMode, legal } = get();
    if (!state) return { vertices: [], edges: [], hexes: [] };
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
  setReady: (value) => get().net?.ready(value),
  startTable: () => get().net?.start(),
}));

type Set = (partial: Partial<GameStore>) => void;
type Get = () => GameStore;

function connect(set: Set, get: Get, first: (t: TableClient, me: { name: string }) => void) {
  get().net?.close();
  const table = connectTable(hostUrl(window.location), {
    welcome: ({ code, host }) => set({ code, isHost: host, screen: "lobby", mode: "online", error: null }),
    seats: ({ code, seats }) => set({ code, seats }),
    state: ({ you, game, legal }) => {
      set({ legal });
      get().loadState(game, you, get().isHost, get().code);
    },
    log: (text) => set({ lobbyLog: text }),
    error: (message) => set({ error: message, toast: message }),
    closed: () => set({ error: "Lost the table", toast: "Lost the table", screen: "title", net: null, state: null }),
  });
  set({ net: table, mode: "online", error: null });
  first(table, { name: get().name });
}
