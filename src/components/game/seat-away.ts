import type { PlayerState } from "@/lib/game/types";
import type { Seat } from "@/lib/net/table";

// The seat's socket dropped and the table is holding it (docs/design/spectator.md "away").
export function seatAway(seats: Seat[], p: PlayerState) {
  return seats.some((s) => s.away && (s.name === p.name || `${s.name} (bot)` === p.name));
}
