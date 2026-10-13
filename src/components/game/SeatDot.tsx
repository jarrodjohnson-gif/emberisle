// #312: the seat swatch, everywhere the UI shows one: a round of the seat colour with the seat's mark on it in its ink
// (SEAT_MARKS in src/lib/game/types.ts, docs/design/seat-marks.md). The mark is the non-colour cue; the dot keeps its
// size from the caller, and `data-seat-mark` names the shape for the proofs.
import { seatMark } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const W = 2.4; // stroke, in a 16-unit box: 2 px on a 14 px dot

export function SeatDot({ color, className }: { color: string; className?: string }) {
  const m = seatMark(color);
  // A span wears the colour and the caller's size, as the plain dot did; the svg inside draws only the glyph.
  return (
    <span aria-hidden="true" data-seat-mark={m?.mark} className={cn("inline-block shrink-0 rounded-full", className)} style={{ background: color }}>
      <svg viewBox="0 0 16 16" className="block size-full">
        {m?.mark === "triangle" ? <polygon points="8,3.4 12.4,11.4 3.6,11.4" fill={m.ink} /> : null}
        {m?.mark === "bars" ? <path d="M5.6 4v8M10.4 4v8" stroke={m.ink} strokeWidth={W} /> : null}
        {m?.mark === "ring" ? <circle cx="8" cy="8" r="3.1" fill="none" stroke={m.ink} strokeWidth={W} /> : null}
        {m?.mark === "plus" ? <path d="M8 3.6v8.8M3.6 8h8.8" stroke={m.ink} strokeWidth={W} /> : null}
      </svg>
    </span>
  );
}
