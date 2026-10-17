import { useGame } from "@/lib/game/store";
import { cn } from "@/lib/utils";

// The app-level probe is separate from the host's websocket control keepalive.
export function ConnectionStatus({ className }: { className?: string }) {
  const mode = useGame((s) => s.mode);
  const { status, rtt } = useGame((s) => s.connectionHealth);
  if (mode !== "online") return null;
  return (
    <p data-testid="connection-status" role="status" aria-live="polite" className={cn("min-w-0 break-words px-2 text-xs text-muted", className)}>
      {status}{rtt === null ? "" : ` · ${rtt} ms`}
    </p>
  );
}
