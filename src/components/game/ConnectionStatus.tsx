import { useGame } from "@/lib/game/store";
import { cn } from "@/lib/utils";
import { useViewport } from "@/lib/viewport";

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

// Online-only UI stays with the lobby and chat instead of the first-load index.
export function ConnectionOverlay() {
  const { phone } = useViewport();
  // #1101: the phone Menu sits in the bottom dock. top-full (and mt-14 on a portrait phone) hangs this readout past the screen. Open it above the button. The header Menu still hangs just below.
  return (
    <div className={cn(
      "pointer-events-none absolute right-0 whitespace-nowrap rounded bg-surface/90",
      phone ? "bottom-full mb-1" : "top-full mt-1",
    )}>
      <ConnectionStatus />
    </div>
  );
}
