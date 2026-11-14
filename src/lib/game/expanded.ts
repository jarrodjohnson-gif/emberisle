// The expanded island for five and six seats (#1604; docs/design/six-players.md, "Expanded board and components" and
// "Board generator, coast, docks, and camera"). Nothing in the client imports this file yet, so it adds nothing to the
// index chunk. createGame in board.ts keeps the classic island byte for byte; createAnyGame picks between them.
import { mulberry32 } from "./random";
import { AXIAL_DIRS, axialKey, edgeId, hexCorners, hexToWorld, vertexId } from "./hex";
import { adjacentPips, createGame, makePlayer, shuffle, type GameOptions } from "./board";
import { totalVP, turnRules, victoryTarget } from "./rules";
import type { Action, DevKind, Edge, ExpandedVariant, GameState, HarborKind, HexCell, PlayerState, Terrain, Vertex } from "./types";
import { PLAYER_NAMES } from "./types";

// The 30 hexes in seven staggered rows of 3, 4, 5, 6, 5, 4, 3: axial r with its inclusive q range (design table).
export const EXPANDED_ROWS: [r: number, qMin: number, qMax: number][] = [
  [-3, 1, 3],
  [-2, 0, 3],
  [-1, -1, 3],
  [0, -2, 3],
  [1, -2, 2],
  [2, -2, 1],
  [3, -2, 0],
];

export const EXPANDED_COORDS: { q: number; r: number }[] = EXPANDED_ROWS.flatMap(([r, lo, hi]) =>
  Array.from({ length: hi - lo + 1 }, (_, i) => ({ q: lo + i, r })),
);

// Terrain: timber, wool and grain 6 each, clay and ore 5 each, waste 2.
export const EXPANDED_TERRAIN: Record<Terrain, number> = { timber: 6, clay: 5, wool: 6, grain: 6, ore: 5, waste: 2 };

// The extension's 28 tokens in letter order, A to Y then Za, Zb, Zc (official 5-6 rules, Illustration B). They replace
// the classic 18; the two sets are never combined.
export const EXPANDED_TOKENS = [2, 5, 4, 6, 3, 9, 8, 11, 11, 10, 6, 3, 8, 4, 8, 10, 11, 12, 10, 5, 4, 9, 5, 9, 12, 3, 2, 6];

// Eleven docks: five generic 3:1, two wool 2:1, and one 2:1 for each other good.
export const EXPANDED_DOCKS: HarborKind[] = ["any", "any", "any", "any", "any", "wool", "wool", "timber", "clay", "grain", "ore"];

// Bank per good, and the fortune deck by kind (knight 20, points 5, path, plenty and monopoly 3 each). Pieces per seat
// stay 15 paths, 5 outposts and 4 strongholds (makePlayer).
export const EXPANDED_BANK = 24;
export const EXPANDED_DECK: Record<DevKind, number> = { knight: 20, vp: 5, road: 3, plenty: 3, monopoly: 3 };

// The six official colour families (accepted decision 4) with the design's candidate swatches, in seat order: red, blue,
// white, orange, green, brown. Classic games keep PLAYER_COLORS. Piece 5 owns the contrast proof for these swatches.
export const EXPANDED_COLORS = ["#e23d2e", "#2d6ee8", "#f3ecd9", "#dd6b20", "#216d3c", "#805532"] as const;
// Two default names past the classic four, so a fifth or sixth bot never reads "undefined (bot)".
export const EXPANDED_NAMES = [...PLAYER_NAMES, "Moss", "Flint"] as const;

export const EXPANDED_SEATS = [5, 6] as const;

const key = (c: { q: number; r: number }) => axialKey(c.q, c.r);

function neighbours(cells: Set<string>, q: number, r: number): number[] {
  return AXIAL_DIRS.flatMap(([dq, dr], d) => (cells.has(axialKey(q + dq, r + dr)) ? [d] : []));
}

// The six corner hexes: those with only three neighbours on the island, in angle order around its middle.
export function cornerHexes(coords: { q: number; r: number }[]): { q: number; r: number }[] {
  const cells = new Set(coords.map(key));
  const world = coords.map((c) => hexToWorld(c.q, c.r, 1));
  const mx = world.reduce((s, w) => s + w.x, 0) / world.length;
  const mz = world.reduce((s, w) => s + w.z, 0) / world.length;
  const angle = (c: { q: number; r: number }) => {
    const w = hexToWorld(c.q, c.r, 1);
    return Math.atan2(w.z - mz, w.x - mx);
  };
  return coords.filter((c) => neighbours(cells, c.q, c.r).length === 3).sort((a, b) => angle(a) - angle(b));
}

// The letter spiral: from a corner hex, along the coast, then inward ring by ring until every hex is visited. At each
// step it keeps to the outside: it tries the outward turn, straight on, then the inward turns. Direction 1 turns the way
// createGame's classic spiral does with direction 1; on the classic 19 hexes this walk is exactly that spiral.
export function spiralPath(coords: { q: number; r: number }[], start: { q: number; r: number }, direction: 1 | -1) {
  const cells = new Set(coords.map(key));
  const inward = -direction;
  const near = neighbours(cells, start.q, start.r);
  const first = near.find((d) => !near.includes((d - inward + 6) % 6) && near.includes((d + inward + 6) % 6));
  if (first === undefined) throw new Error(`spiralPath: ${key(start)} is not a corner hex`);
  let heading: number = first;
  const path = [start];
  const seen = new Set([key(start)]);
  let at = start;
  while (path.length < coords.length) {
    let next: { q: number; r: number } | null = null;
    for (const turn of path.length === 1 ? [0] : [-1, 0, 1, 2]) {
      const d: number = (heading + turn * inward + 12) % 6;
      const c = { q: at.q + AXIAL_DIRS[d]![0], r: at.r + AXIAL_DIRS[d]![1] };
      if (cells.has(key(c)) && !seen.has(key(c))) {
        next = c;
        heading = d;
        break;
      }
    }
    if (!next) throw new Error(`spiralPath: stuck after ${path.length} hexes`);
    path.push(next);
    seen.add(key(next));
    at = next;
  }
  return path;
}

// The coastal edges in order around the island, traced corner to corner (design: "a traced boundary").
export function coastLoop(edges: Edge[], edgeHexCount: Map<string, number>): Edge[] {
  const coastal = edges.filter((e) => edgeHexCount.get(e.id) === 1);
  const at = new Map<string, Edge[]>();
  for (const e of coastal) for (const v of [e.va, e.vb]) at.set(v, [...(at.get(v) ?? []), e]);
  const start = coastal.reduce((a, b) => (b.id < a.id ? b : a));
  const loop = [start];
  let corner = start.vb;
  for (let e = start; ; ) {
    const next = at.get(corner)!.find((x) => x !== e)!;
    if (next === start) break;
    loop.push(next);
    corner = next.va === corner ? next.vb : next.va;
    e = next;
  }
  return loop;
}

// A five or six seat game on the expanded island. It follows createGame step for step (terrain, tokens, docks, seats,
// deck, in that order from the seed), with the expanded inventories.
export function createExpandedGame(opts: GameOptions): GameState {
  const seed = opts.seed ?? (Math.floor(Math.random() * 1e9) | 0);
  const rand = mulberry32(seed);

  const terrains: Terrain[] = shuffle(
    (Object.keys(EXPANDED_TERRAIN) as Terrain[]).flatMap((t) => Array<Terrain>(EXPANDED_TERRAIN[t]).fill(t)),
    rand,
  );
  const hexes: HexCell[] = EXPANDED_COORDS.map((c, i) => ({ id: key(c), q: c.q, r: c.r, terrain: terrains[i]!, pip: null, blocked: false }));
  const wastes = hexes.filter((h) => h.terrain === "waste").map((h) => h.id);
  const robberHex = wastes[0]!;
  // The wayfarer starts on one waste; the other starts unblocked. With the wayfarer off, both stay unblocked.
  if (opts.wayfarerMode !== "off") hexes.find((h) => h.id === robberHex)!.blocked = true;

  const variant: ExpandedVariant = { kind: "expanded", version: 1, wastes, turns: { rule: "paired", version: 1 } };
  if (opts.numberTokens !== "random") {
    const corners = cornerHexes(EXPANDED_COORDS);
    const corner = corners[Math.floor(rand() * 6)]!;
    const direction = rand() < 0.5 ? 1 : -1;
    let index = 0;
    for (const c of spiralPath(EXPANDED_COORDS, corner, direction)) {
      const hex = hexes.find((h) => h.id === key(c))!;
      if (hex.terrain !== "waste") hex.pip = EXPANDED_TOKENS[index++]!;
    }
    variant.spiral = { start: key(corner), direction };
  } else {
    // The classic random deal with the extension's tokens: reshuffle until no 6 or 8 touches another 6 or 8.
    const land = hexes.filter((h) => h.terrain !== "waste");
    for (;;) {
      const order = shuffle(EXPANDED_TOKENS, rand);
      let ok = true;
      land.forEach((h) => (h.pip = null));
      for (let i = 0; i < land.length; i++) {
        if (adjacentPips(hexes, land[i]!.id, order[i]!)) {
          ok = false;
          break;
        }
        land[i]!.pip = order[i]!;
      }
      if (ok) break;
    }
  }

  const vmap = new Map<string, Vertex>();
  const emap = new Map<string, Edge>();
  const edgeHexCount = new Map<string, number>();
  for (const h of hexes) {
    const ids = hexCorners(h.q, h.r).map((c) => {
      const id = vertexId(c.x, c.z);
      let v = vmap.get(id);
      if (!v) vmap.set(id, (v = { id, x: c.x, z: c.z, hexes: [], building: null, harbor: null }));
      if (!v.hexes.includes(h.id)) v.hexes.push(h.id);
      return id;
    });
    for (let i = 0; i < 6; i++) {
      const eid = edgeId(ids[i]!, ids[(i + 1) % 6]!);
      edgeHexCount.set(eid, (edgeHexCount.get(eid) ?? 0) + 1);
      if (!emap.has(eid)) emap.set(eid, { id: eid, va: ids[i]!, vb: ids[(i + 1) % 6]!, path: null });
    }
  }

  // Docks sit at even steps around the traced coast, so no two share a corner; the seed shuffles which kind goes where.
  const coast = coastLoop([...emap.values()], edgeHexCount);
  const kinds = shuffle(EXPANDED_DOCKS, rand);
  for (let i = 0; i < kinds.length; i++) {
    const e = coast[Math.floor((i * coast.length) / kinds.length)]!;
    vmap.get(e.va)!.harbor = kinds[i]!;
    vmap.get(e.vb)!.harbor = kinds[i]!;
  }

  const total = Math.min(6, Math.max(5, opts.humans.length + opts.bots));
  const players: PlayerState[] = [];
  for (let i = 0; i < total; i++) {
    const human = i < opts.humans.length;
    const p = makePlayer(i, human ? opts.humans[i]!.name || EXPANDED_NAMES[i]! : `${EXPANDED_NAMES[i]} (bot)`, human ? "human" : "bot");
    p.color = EXPANDED_COLORS[i]!;
    players.push(p);
  }
  const pending = players.slice(opts.winnerFirst ? 1 : 0).map((p) => p.id);

  const deck = shuffle(
    (Object.keys(EXPANDED_DECK) as DevKind[]).flatMap((k) => Array<DevKind>(EXPANDED_DECK[k]).fill(k)),
    rand,
  );

  const b = EXPANDED_BANK;
  return {
    seed,
    rng: (seed ^ 0x9e3779b9) >>> 0,
    seq: 0,
    hexes,
    vertices: [...vmap.values()],
    edges: [...emap.values()],
    robberHex,
    wayfarerMode: opts.wayfarerMode ?? "on",
    players,
    current: pending[0]!,
    phase: "rollOff",
    turn: 0,
    dice: null,
    rollOff: opts.winnerFirst ? { rolls: {}, pending, first: players[0]!.id } : { rolls: {}, pending },
    setupIndex: 0,
    lastSetupVertex: null,
    longestRoad: null,
    largestArmy: null,
    winner: null,
    victoryTarget: opts.victoryTarget === 7 ? 7 : 10,
    bank: { timber: b, clay: b, wool: b, grain: b, ore: b },
    deck,
    trade: null,
    log: [opts.winnerFirst ? `The isle is dealt. ${players[0]!.name} places first; the rest roll for their order.` : "The isle is dealt. Roll for first place."],
    discardNeeded: {},
    playedCard: false,
    rolls: 0,
    lastProduction: [],
    hostId: opts.hostId ?? players[0]!.id,
    variant,
  };
}

// Three to six seats: five or six take the expanded island, three or four the classic one exactly as createGame deals it.
export function createAnyGame(opts: GameOptions): GameState {
  return opts.humans.length + opts.bots >= 5 ? createExpandedGame(opts) : createGame(opts);
}

// Paired turns (#1605; docs/design/six-players.md, "Rules, setup, turns, and scoring"; accepted decision 1). The primary at
// `players` position i acts first, then the partner at (i + 3) % n; the partner's endTurn makes (i + 1) % n the next
// primary. Only primaries roll, so production, sevens and discards happen only on primary activations. rules.ts calls this
// for every action on a game with a variant, through `turnRules`.
export const PARTNER_NO_TRADE = "No player trades on a partner turn.";

type Step = (prev: GameState, actor: string, action: Action) => { state: GameState; error?: string };

export function pairedStep(prev: GameState, actor: string, action: Action, base: Step): ReturnType<Step> {
  if (prev.variant?.turns?.rule !== "paired") return base(prev, actor, action);
  // A partner never trades with players: no offer, and no acceptance, even of an offer left open from before.
  if (prev.role === "partner" && (action.type === "offerTrade" || (action.type === "respondTrade" && action.accept))) {
    return { state: prev, error: PARTNER_NO_TRADE };
  }
  if (action.type !== "endTurn" || !prev.role) {
    const result = base(prev, actor, action);
    const next = result.state;
    // Setup has just ended: the first player in order starts the first primary activation.
    if (!result.error && !next.role && next.phase === "roll") {
      next.primary = next.current;
      next.role = "primary";
      next.activation = 1;
    }
    return result;
  }
  if (prev.phase === "over") return { state: prev, error: "The game is over." };
  if (prev.current !== actor) return { state: prev, error: "Not your turn." };
  if (prev.phase !== "main") return { state: prev, error: "Finish your turn first." };
  const state = structuredClone(prev);
  state.seq += 1;
  // Offers close before either actor changes.
  state.trade = null;
  const n = state.players.length;
  const at = state.players.findIndex((p) => p.id === state.primary);
  const primary = state.players[at]!;
  let next: PlayerState;
  if (state.role === "primary") {
    // The partner acts in the action phase straight away; the primary's dice stay on the table for this paired turn.
    next = state.players[(at + 3) % n]!;
    state.role = "partner";
    state.phase = "main";
    log(state, `${next.name}'s turn as ${primary.name}'s partner.`);
  } else {
    const i = (at + 1) % n;
    next = state.players[i]!;
    state.primary = next.id;
    state.role = "primary";
    state.phase = "roll";
    state.dice = null;
    if (i === 0) state.turn += 1;
    log(state, `${next.name}'s turn.`);
  }
  state.current = next.id;
  state.activation = (state.activation ?? 1) + 1;
  // Each activation may play one fortune; what this actor bought at an earlier activation is now playable.
  state.playedCard = false;
  next.boughtThisTurn = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
  // Points can arrive while another seat acts (an award handed over by a cut); they win as this activation starts.
  const points = totalVP(state, next.id);
  if (points >= victoryTarget(state)) {
    state.phase = "over";
    state.winner = next.id;
    state.winReason = { trigger: "turnStart", points, target: victoryTarget(state) };
    log(state, `${next.name} claims the isle with ${points} points.`);
  }
  return { state };
}

function log(state: GameState, line: string) {
  state.log = [...state.log.slice(-199), line];
}

turnRules.paired = pairedStep;
