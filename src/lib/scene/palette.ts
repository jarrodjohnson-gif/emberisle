import type { Terrain } from "@/lib/game/types";

// The painted base and speckle of each terrain cap (the base is the colour the tile shows).
export const PAINT: Record<Terrain, [string, string]> = {
  timber: ["#285b4b", "#1e463b"],
  clay: ["#af4a32", "#893d2d"],
  wool: ["#9eb873", "#809951"],
  grain: ["#d1b14d", "#ad913f"],
  ore: ["#616f80", "#4a5666"],
  waste: ["#b9af91", "#978f76"],
};

// The two steps under every piece: the better of the two is at least 3:1 on every ground (docs/design/pieces.md).
export const RIM = { light: "#fff6e8", dark: "#1c1916" } as const;
