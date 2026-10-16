import type { Terrain } from "@/lib/game/types";

// The light rig (#599, docs/design/terrain.md "Colour and light"): a warm key 55 degrees up from the viewer's front left (so
// shadows fall back and to the right across the paper, as in the jelly-diorama references), a pale aqua sky fill and a warm
// sand ground bounce. KEY is the direction toward the lamp (not normalised); the tiles' baked tints and the sea's glints use it too.
export const LIGHT = { key: [-0.82, 1.43, 0.57] as const, keyColor: "#ffe2b8", sky: "#dff6f4", ground: "#c9b58f" };

// The sculpted tiles' tops (#599, docs/design/terrain.md): saturated but soft, a lit cartoon diorama rather than a photo.
// [base, shade]: hollows, furrows and the tile's lip lean to the shade, crests to the base.
export const PAINT: Record<Terrain, [string, string]> = {
  timber: ["#4f9b47", "#2f6c3a"],
  clay: ["#d56b3b", "#9b4528"],
  wool: ["#94cf56", "#629c36"],
  grain: ["#f1c540", "#c9962c"],
  ore: ["#8e959f", "#5f6771"],
  waste: ["#ecd8ab", "#c8ae81"],
};

// The side of every tile under the terrain's lip, top to bottom: sand, a thin shell band, caramel soil, chocolate rock
// (the candy strata of the Atoll Jelly slab).
export const STRATA = { sand: "#ecdbb2", shell: "#f7f0e2", soil: "#bb7a42", rock: "#5f4234" } as const;

// The props on the tiles (#599). Pines are three greens, bottom tier darkest.
export const PROP = {
  pine: ["#265f30", "#2f7337", "#3a853d", "#4a9642", "#5aa348"],
  trunk: "#6b4428",
  wood: "#9b6a40",
  woodEnd: "#d9b47e",
  hedge: "#3f8b3b",
  grass: "#7cc243",
  stone: "#a3a8ad",
  straw: "#e8c15a",
  strawEnd: "#f6dc8f",
  strawCore: "#b98f38",
  twine: "#8a6a3c",
  wheat: "#f4d46a",
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
