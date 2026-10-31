import { mulberry32 } from "./random";
import {
  AXIAL_DIRS,
  HEX_SIZE,
  axialKey,
  edgeId,
  hexCorners,
  hexToWorld,
  hexesInRadius,
  vertexId,
} from "./hex";
import type {
  DevKind,
  Edge,
  GameState,
  HarborKind,
  HexCell,
  PlayerKind,
  PlayerState,
  Resource,
  Terrain,
  Vertex,
  VictoryTarget,
} from "./types";
import { PLAYER_COLORS, PLAYER_NAMES, RESOURCES } from "./types";

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function emptyRes(): Record<Resource, number> {
  return { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
}

function makePlayer(i: number, name: string, kind: PlayerKind): PlayerState {
  return {
    id: `p${i}`,
    name,
    color: PLAYER_COLORS[i] ?? "#e23d2e",
    kind,
    resources: emptyRes(),
    hidden: { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 },
    boughtThisTurn: { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 },
    knightsPlayed: 0,
    pathsLeft: 15,
    outpostsLeft: 5,
    strongholdsLeft: 4,
  };
}

function adjacentPips(hexes: HexCell[], id: string, pip: number): boolean {
  const h = hexes.find((x) => x.id === id);
  if (!h) return false;
  for (const [dq, dr] of AXIAL_DIRS) {
    const n = hexes.find((x) => x.q === h.q + dq && x.r === h.r + dr);
    if (n && (n.pip === 6 || n.pip === 8) && (pip === 6 || pip === 8)) return true;
  }
  return false;
}

export function createGame(opts: {
  seed?: number;
  humans: { name: string }[];
  bots: number;
  hostId?: string;
  // A rematch (#266): the first human is the last winner. It places first and sits out the roll-off.
  winnerFirst?: boolean;
  wayfarerMode?: import("./types").WayfarerMode;
  victoryTarget?: VictoryTarget;
  numberTokens?: "official" | "random";
}): GameState {
  const seed = opts.seed ?? (Math.floor(Math.random() * 1e9) | 0);
  const rand = mulberry32(seed);

  const coords = hexesInRadius(2);
  const terrains: Terrain[] = shuffle(
    [
      ...Array(4).fill("timber"),
      ...Array(4).fill("wool"),
      ...Array(4).fill("grain"),
      ...Array(3).fill("clay"),
      ...Array(3).fill("ore"),
      "waste",
    ] as Terrain[],
    rand,
  );

  const hexes: HexCell[] = coords.map((c, i) => ({
    id: axialKey(c.q, c.r),
    q: c.q,
    r: c.r,
    terrain: terrains[i]!,
    pip: null,
    blocked: opts.wayfarerMode !== "off" && terrains[i] === "waste",
  }));

  if (opts.numberTokens !== "random" && hexes.length === 19) {
    const outer: [number, number][] = [[0, -2], [1, -2], [2, -2], [2, -1], [2, 0], [1, 1], [0, 2], [-1, 2], [-2, 2], [-2, 1], [-2, 0], [-1, -1]];
    const inner: [number, number][] = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
    const corner = Math.floor(rand() * 6);
    const direction = rand() < 0.5 ? 1 : -1;
    const rotate = ([q, r]: [number, number]): [number, number] => {
      for (let i = 0; i < corner; i++) [q, r] = [-r, q + r];
      return [q, r];
    };
    const path = [
      ...outer.map((_, i) => outer[(i * direction + 12) % 12]!),
      ...inner.map((_, i) => inner[(i * direction + 6) % 6]!),
      [0, 0] as [number, number],
    ].map(rotate);
    const order = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];
    let index = 0;
    for (const [q, r] of path) {
      const hex = hexes.find((h) => h.q === q && h.r === r)!;
      if (hex.terrain !== "waste") hex.pip = order[index++]!;
    }
  } else {
    const pips = shuffle([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12], rand);
    const land = hexes.filter((h) => h.terrain !== "waste");
    // Deal until no 6 or 8 touches another 6 or 8. About one shuffle in eight passes, so this ends
    // quickly, and a cap would leave a board with empty hexes (#182: 68 of 20,000 seeds did).
    for (let attempt = 0; ; attempt++) {
      const order = attempt === 0 ? pips : shuffle(pips, rand);
      let ok = true;
      land.forEach((h) => (h.pip = null));
      for (let i = 0; i < land.length; i++) {
        const pip = order[i]!;
        if (adjacentPips(hexes, land[i]!.id, pip)) {
          ok = false;
          break;
        }
        land[i]!.pip = pip;
      }
      if (ok) break;
    }
  }

  const robberHex = hexes.find((h) => h.terrain === "waste")?.id ?? hexes[0]!.id;

  const vmap = new Map<string, Vertex>();
  const emap = new Map<string, Edge>();
  const edgeHexCount = new Map<string, number>();

  for (const h of hexes) {
    const corners = hexCorners(h.q, h.r);
    const ids: string[] = [];
    for (const c of corners) {
      const id = vertexId(c.x, c.z);
      ids.push(id);
      let v = vmap.get(id);
      if (!v) {
        v = { id, x: c.x, z: c.z, hexes: [], building: null, harbor: null };
        vmap.set(id, v);
      }
      if (!v.hexes.includes(h.id)) v.hexes.push(h.id);
    }
    for (let i = 0; i < 6; i++) {
      const eid = edgeId(ids[i]!, ids[(i + 1) % 6]!);
      edgeHexCount.set(eid, (edgeHexCount.get(eid) ?? 0) + 1);
      if (!emap.has(eid)) {
        emap.set(eid, { id: eid, va: ids[i]!, vb: ids[(i + 1) % 6]!, path: null });
      }
    }
  }

  const coastal = [...emap.values()].filter((e) => (edgeHexCount.get(e.id) ?? 0) === 1);
  coastal.sort((a, b) => {
    const va = vmap.get(a.va)!;
    const vb = vmap.get(a.vb)!;
    const ma = Math.atan2((va.z + vb.z) / 2, (va.x + vb.x) / 2);
    const mb = Math.atan2((vmap.get(b.va)!.z + vmap.get(b.vb)!.z) / 2, (vmap.get(b.va)!.x + vmap.get(b.vb)!.x) / 2);
    return ma - mb;
  });

  const harborTypes: HarborKind[] = shuffle(
    ["any", "any", "any", "any", "timber", "clay", "wool", "grain", "ore"],
    rand,
  );
  const step = coastal.length / 9;
  for (let i = 0; i < 9; i++) {
    const e = coastal[Math.min(coastal.length - 1, Math.round(i * step))]!;
    const kind = harborTypes[i]!;
    const va = vmap.get(e.va);
    const vb = vmap.get(e.vb);
    if (va && !va.harbor) va.harbor = kind;
    if (vb && !vb.harbor) vb.harbor = kind;
  }

  const humans = opts.humans;
  const bots = opts.bots;
  const total = Math.min(4, Math.max(3, humans.length + bots));
  const players: PlayerState[] = [];
  for (let i = 0; i < total; i++) {
    if (i < humans.length) players.push(makePlayer(i, humans[i]!.name || PLAYER_NAMES[i]!, "human"));
    else players.push(makePlayer(i, `${PLAYER_NAMES[i]} (bot)`, "bot"));
  }

  const pending = players.slice(opts.winnerFirst ? 1 : 0).map((p) => p.id);

  const deck: DevKind[] = shuffle(
    [
      ...Array(14).fill("knight"),
      ...Array(5).fill("vp"),
      ...Array(2).fill("road"),
      ...Array(2).fill("plenty"),
      ...Array(2).fill("monopoly"),
    ] as DevKind[],
    rand,
  );

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
    bank: { timber: 19, clay: 19, wool: 19, grain: 19, ore: 19 },
    deck,
    trade: null,
    log: [opts.winnerFirst ? `The isle is dealt. ${players[0]!.name} places first; the rest roll for their order.` : "The isle is dealt. Roll for first place."],
    discardNeeded: {},
    playedCard: false,
    rolls: 0,
    lastProduction: [],
    hostId: opts.hostId ?? players[0]!.id,
  };
}

// The island behind the title and the lobby (#130), seeded with the day the repo was created.
export const DEMO_SEED = 20260921;

export function demoBoard(): GameState {
  return createGame({ seed: DEMO_SEED, humans: [{ name: "Ember" }], bots: 2 });
}

export function hexHeight(terrain: Terrain) {
  switch (terrain) {
    case "ore":
      return 0.24;
    case "clay":
      return 0.2;
    case "timber":
      return 0.16;
    case "waste":
      return 0.12;
    default:
      return 0.15;
  }
}

export function worldOfHex(h: HexCell) {
  return hexToWorld(h.q, h.r, HEX_SIZE);
}
