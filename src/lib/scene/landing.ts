// How long a newly placed piece takes to land (docs/design/polish.md "Motion", build bible §8). The renderer animates
// over these and the store plays the piece's knock when they end, so the sound lands with the piece (#438).
// No three.js here: the store imports it.
export const LAND_MS = { path_place: 220, outpost_place: 280, stronghold_place: 320 } as const;

export function calmMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
