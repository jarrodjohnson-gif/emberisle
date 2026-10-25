import { cn } from "@/lib/utils";

export function SeatDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block shrink-0 rounded-full", className)} style={{ background: color }} />;
}
