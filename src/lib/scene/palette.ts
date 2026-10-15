import type { Terrain } from "@/lib/game/types";

// The sculpted tiles' tops (#599, docs/design/terrain.md): saturated but soft, a lit cartoon diorama rather than a photo.
// [base, shade, sun]: hollows and slopes turned from the key lamp lean to the shade, crests and slopes turned to it to the sun.
export const PAINT: Record<Terrain, [string, string, string]> = {
  timber: ["#4f9b47", "#2f6c3a", "#86c24a"],
  clay: ["#d56b3b", "#9b4528", "#ec9452"],
  wool: ["#94cf56", "#629c36", "#c3e46e"],
  grain: ["#f1c540", "#c9962c", "#ffe07a"],
  ore: ["#8e959f", "#5f6771", "#b9bec4"],
  waste: ["#ecd8ab", "#c8ae81", "#f7ead0"],
};

// The side of every tile under the terrain's lip, top to bottom: sand, a thin shell band, caramel soil, chocolate rock
// (the candy strata of the Atoll Jelly slab).
export const STRATA = { sand: "#ecdbb2", shell: "#f7f0e2", soil: "#bb7a42", rock: "#5f4234" } as const;

// The props on the tiles (#599). Pines are three greens, bottom tier darkest.
export const PROP = {
  pine: ["#265f30", "#2f7337", "#3a853d", "#4a9642", "#5aa348"],
  pineLight: "#86c552",
  pineDark: "#163f2a",
  fern: "#4f9e45",
  fernLight: "#a6d86a",
  berry: "#d8443a",
  cap: "#d9473b",
  trunk: "#6b4428",
  trunkDark: "#4e3020",
  wood: "#9b6a40",
  woodEnd: "#d9b47e",
  hedge: "#3f8b3b",
  blossom: "#fbf3e4",
  wool: "#f4efe4",
  woolLight: "#fffdf7",
  woolShade: "#d9d0c2",
  face: "#3b302b",
  faceLight: "#5a4a40",
  flowers: ["#fbf6ea", "#f7d54a", "#f19ab8", "#b9a3f0"],
  grass: "#7cc243",
  stone: "#a3a8ad",
  straw: "#e8c15a",
  strawEnd: "#f6dc8f",
  strawCore: "#a87c2c",
  strawRing: "#d7aa47",
  twine: "#d6ad52",
  wheat: "#f4d46a",
  furrow: "#a8752f",
  shirt: "#c9583e",
  smock: "#4f8a6c",
  smockLight: "#77b08d",
  trousers: "#3b4a45",
  skin: "#d9a57c",
  skinLight: "#f0c39b",
  shirtLight: "#e58262",
  sack: "#d8c49a",
  brick: ["#b84a2c", "#c65a36", "#a5412a"],
  rope: "#e3d1a4",
  peakLow: "#7a818b",
  peakHigh: "#d4d8dd",
  portal: "#1c1816",
  iron: "#4a4f55",
  cactus: "#5e9e4b",
  deadwood: "#8d7864",
  bleached: "#eee4cf",
} as const;

// The two steps under every piece: the better of the two is at least 3:1 on every ground (docs/design/pieces.md).
export const RIM = { light: "#fff6e8", dark: "#1c1916" } as const;
