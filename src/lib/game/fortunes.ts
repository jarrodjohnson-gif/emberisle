// #423: the one set of fortune names the player sees, in the seat menu's breakdown and the fortune tray alike. They follow
// the README's Names section (wayfarer, fortune; #411), not the Rule set prose (knight, path-building).
import type { DevKind, PlayerState } from "@/lib/game/types";

export const FORTUNES: { kind: DevKind; name: string; effect: string }[] = [
  { kind: "knight", name: "wayfarer", effect: "Move and block a hex. The wayfarer takes a card." },
  { kind: "road", name: "path", effect: "Lay two paths for free" },
  { kind: "plenty", name: "plenty", effect: "Take two goods from the bank" },
  { kind: "monopoly", name: "monopoly", effect: "Take every other seat's goods of one kind" },
  { kind: "vp", name: "points", effect: "A hidden point toward the win" },
];

// Your own fortunes by kind, "wayfarer ×1 · points ×2 (1 new)"; "" while you hold none.
export function fortuneBreakdown(p: PlayerState) {
  return FORTUNES.filter(({ kind }) => p.hidden[kind] > 0)
    .map(({ kind, name }) => `${name} ×${p.hidden[kind]}${p.boughtThisTurn[kind] > 0 ? ` (${p.boughtThisTurn[kind]} new)` : ""}`)
    .join(" · ");
}

// One effect per creation rule, shared by the tray and contextual help.
export const WAYFARER_EFFECT = {
  on: FORTUNES[0]!.effect,
  gentle: "Move and block a hex. The wayfarer takes no cards.",
  off: "Muster: add 1 to your army. No target needed.",
};
export function wayfarerRules(mode: import("./types").WayfarerMode) {
  const discard = "On a seven, anyone with more than seven goods discards half.";
  return `${discard} ${mode === "off" ? "No movement, blocked land or taking cards. Wayfarer fortunes add 1 to the army." : mode === "gentle" ? "Move and block a hex, without taking cards. Blocked land pays nothing." : "Move and block a hex; the wayfarer takes a card from an adjacent seat. Blocked land pays nothing."}`;
}
