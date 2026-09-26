export const RESOURCES = ["timber", "clay", "wool", "grain", "ore"] as const;
export type Resource = (typeof RESOURCES)[number];
export type Terrain = Resource | "waste";
export type HarborKind = Resource | "any";
export type DevKind = "knight" | "road" | "plenty" | "monopoly" | "vp";
export type Phase =
  | "setupSettle"
  | "setupRoad"
  | "roll"
  | "discard"
  | "robber"
  | "main"
  | "over";

export type PlayerKind = "human" | "bot";

export const RESOURCE_LABEL: Record<Resource, string> = {
  timber: "Timber",
  clay: "Clay",
  wool: "Wool",
  grain: "Grain",
  ore: "Ore",
};

export const TERRAIN_LABEL: Record<Terrain, string> = {
  timber: "Forest",
  clay: "Clay hills",
  wool: "Pasture",
  grain: "Fields",
  ore: "Mountains",
  waste: "Wastes",
};

export const PLAYER_COLORS = ["#c45c3e", "#2a8f8a", "#e4c9a0", "#3d6b4f"] as const;
export const PLAYER_NAMES = ["Ember", "Tide", "Dune", "Pine"] as const;

export const COST = {
  path: { timber: 1, clay: 1 } as Partial<Record<Resource, number>>,
  outpost: { timber: 1, clay: 1, wool: 1, grain: 1 } as Partial<Record<Resource, number>>,
  stronghold: { grain: 3, ore: 2 } as Partial<Record<Resource, number>>,
  card: { wool: 1, grain: 1, ore: 1 } as Partial<Record<Resource, number>>,
};

export interface HexCell {
  id: string;
  q: number;
  r: number;
  terrain: Terrain;
  pip: number | null;
  blocked: boolean;
}

export interface Vertex {
  id: string;
  x: number;
  z: number;
  hexes: string[];
  building: { playerId: string; kind: "outpost" | "stronghold" } | null;
  harbor: HarborKind | null;
}

export interface Edge {
  id: string;
  va: string;
  vb: string;
  path: string | null;
}

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  kind: PlayerKind;
  resources: Record<Resource, number>;
  hidden: Record<DevKind, number>;
  knightsPlayed: number;
  pathsLeft: number;
  outpostsLeft: number;
  strongholdsLeft: number;
}

export interface TradeOffer {
  from: string;
  to: string;
  give: Partial<Record<Resource, number>>;
  want: Partial<Record<Resource, number>>;
}

export interface GameState {
  seed: number;
  rng: number;
  seq: number;
  hexes: HexCell[];
  vertices: Vertex[];
  edges: Edge[];
  robberHex: string;
  players: PlayerState[];
  current: string;
  phase: Phase;
  turn: number;
  dice: [number, number] | null;
  setupIndex: number;
  lastSetupVertex: string | null;
  longestRoad: string | null;
  largestArmy: string | null;
  winner: string | null;
  bank: Record<Resource, number>;
  deck: DevKind[];
  trade: TradeOffer | null;
  log: string[];
  discardNeeded: Record<string, number>;
  playedCard: boolean;
  hostId: string;
}

export type Action =
  | { type: "setupSettle"; vertexId: string }
  | { type: "setupRoad"; edgeId: string }
  | { type: "roll" }
  | { type: "discard"; resources: Partial<Record<Resource, number>> }
  | { type: "moveRobber"; hexId: string; stealFrom: string | null }
  | { type: "buildPath"; edgeId: string }
  | { type: "buildOutpost"; vertexId: string }
  | { type: "buildStronghold"; vertexId: string }
  | { type: "buyCard" }
  | { type: "playKnight"; hexId: string; stealFrom: string | null }
  | { type: "playRoad"; edgeIds: string[] }
  | { type: "playPlenty"; resources: Resource[] }
  | { type: "playMonopoly"; resource: Resource }
  | { type: "bankTrade"; give: Resource; want: Resource }
  | { type: "offerTrade"; to: string; give: Partial<Record<Resource, number>>; want: Partial<Record<Resource, number>> }
  | { type: "respondTrade"; accept: boolean }
  | { type: "endTurn" };

export type BuildMode = "none" | "path" | "outpost" | "stronghold" | "robber" | "knight";
