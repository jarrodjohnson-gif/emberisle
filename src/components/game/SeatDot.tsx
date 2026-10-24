import { cn } from "@/lib/utils";

export function SeatDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block shrink-0 rounded-full", className)} style={{ background: color }} />;
}

// #531: the non-colour half of the current-turn marker. Every chip of the seat on turn (rail, phone strip, trade toast, win rows)
// wears one beside its ring: an ink pointer hanging from the top edge, so the turn never rests on the seat's colour alone (#312).
// It sits out of the flow, so a chip with and without it is the same size. The parent must be positioned.
export function TurnMark() {
  return <span aria-hidden="true" data-testid="turn-mark" className="turn-mark" />;
}
