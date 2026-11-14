import { cn } from "@/lib/utils";

// #1297: a thin dark ring (--control-line) on every seat dot so pale seats like Dune show on white. It is inset, so the
// box never changes. A transparent dot (the lobby's empty seat) gets none, so it never draws a hollow circle.
// #1608: on a five or six seat table the seats' dots take the design's 1 px #1c1915 outline instead (styles.css).
export function SeatDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 rounded-full", color !== "transparent" && "[box-shadow:inset_0_0_0_1.5px_var(--control-line)]", className)}
      style={{ background: color }}
    />
  );
}

// #1608: the seat's number beside its dot, so a seat never rests on colour alone (red and green, orange and brown). It
// reads "Seat 3" aloud. A classic seat has none (`seat` unset), so it draws nothing. Its type is in styles.css.
export const SeatNo = ({ n }: { n?: number }) => (n ? <span className="seat-no"><span className="sr-only">Seat </span>{n}</span> : null);
