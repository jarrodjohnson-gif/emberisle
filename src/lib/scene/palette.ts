import type { Terrain } from "@/lib/game/types";

// The painted base and speckle of each terrain cap (the base is the colour the tile shows).
export const PAINT: Record<Terrain, [string, string]> = {
  timber: ["#2f6a4f", "#1e463b"],
  clay: ["#b8533d", "#893d2d"],
  wool: ["#b2ce80", "#809951"],
  grain: ["#e3c462", "#ad913f"],
  ore: ["#63748a", "#4a5666"],
  waste: ["#dfc99a", "#978f76"],
};

// The two steps under every piece: the better of the two is at least 3:1 on every ground (docs/design/pieces.md).
export const RIM = { light: "#fff6e8", dark: "#1c1916" } as const;
