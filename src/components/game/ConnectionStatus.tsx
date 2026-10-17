import { useGame } from "@/lib/game/store";

// The app-level probe is separate from the host's websocket control keepalive.
export function ConnectionStatus() {
  const mode = useGame((s) => s.mode);
  const { status, rtt } = useGame((s) => s.connectionHealth);
  if (mode !== "online") return null;
  return (
    <p data-testid="connection-status" role="status" aria-live="polite" className="px-2 text-xs text-muted">
      {status}{rtt === null ? "" : ` · ${rtt} ms`}
    </p>
  );
}
