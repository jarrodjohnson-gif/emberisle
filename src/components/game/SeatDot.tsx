import { cn } from "@/lib/utils";

// #1297: a thin dark ring (--control-line) on every seat dot so pale seats like Dune show on white. It is inset, so the
// box never changes. A transparent dot (the lobby's empty seat) gets none, so it never draws a hollow circle.
export function SeatDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 rounded-full", color !== "transparent" && "[box-shadow:inset_0_0_0_1.5px_var(--control-line)]", className)}
      style={{ background: color }}
    />
  );
}
