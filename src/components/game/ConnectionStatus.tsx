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
export function ConnectionOverlay({ dock }: { dock?: "left" | "right" }) {
  const { phone } = useViewport();
  // #1101: the phone Menu sits in the bottom dock. top-full (and mt-14 on a portrait phone) hangs this readout past the screen. Open it above the button,
  // from the Menu's own side (sideways the Menu is at the left of the column). The header Menu still hangs just below.
  return (
    <div className={cn(
      "pointer-events-none absolute whitespace-nowrap rounded bg-surface/90",
      phone ? cn("bottom-full mb-1", dock === "left" ? "left-0" : "right-0") : "right-0 top-full mt-1",
    )}>
      <ConnectionStatus />
    </div>
  );
}
