// #423: the one set of fortune names the player sees, in the seat menu's breakdown and the fortune tray alike. They follow
// the README's Names section (wayfarer, fortune; #411), not the Rule set prose (knight, path-building).
import type { DevKind, PlayerState } from "@/lib/game/types";

export const FORTUNES: { kind: DevKind; name: string; effect: string }[] = [
  { kind: "knight", name: "wayfarer", effect: "Move the wayfarer and steal a card" },
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
