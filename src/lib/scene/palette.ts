import type { Terrain } from "@/lib/game/types";

// The painted base and speckle of each terrain cap (the base is the colour the tile shows).
export const PAINT: Record<Terrain, [string, string]> = {
  timber: ["#2f6b3a", "#1f4a28"],
  clay: ["#b5522a", "#8a3a1c"],
  wool: ["#8fbf5a", "#6f9e42"],
  grain: ["#e0b13a", "#c4922a"],
  ore: ["#6e7580", "#4f555e"],
  waste: ["#c4a574", "#a88a5c"],
};

// The two steps under every piece: the better of the two is at least 3:1 on every ground (docs/design/pieces.md).
export const RIM = { light: "#fff6e8", dark: "#1c1916" } as const;
