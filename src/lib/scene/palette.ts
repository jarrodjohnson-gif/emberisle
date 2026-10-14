import type { Terrain } from "@/lib/game/types";

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

// The side of every tile under the terrain's lip, top to bottom: sand, soil, rock (the strata of the Atoll Jelly slab).
export const STRATA = { sand: "#ecdbb2", soil: "#b27b4b", rock: "#78665a" } as const;

// The props on the tiles (#599). Pines are three greens, bottom tier darkest.
export const PROP = {
  pine: ["#2b6b34", "#3a853d", "#56a046"],
  trunk: "#6b4428",
  wood: "#9b6a40",
  woodEnd: "#d9b47e",
  hedge: "#3f8b3b",
  grass: "#7cc243",
  stone: "#a3a8ad",
  straw: "#e8c15a",
  strawEnd: "#f6dc8f",
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
