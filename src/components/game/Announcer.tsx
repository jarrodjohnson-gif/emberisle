// Screen-reader status messages (#380, WCAG 4.1.3): whose turn it is, and what the isle just refused.
// Roll results and the roll-off ("Dune rolls a 4.", "… places first") already speak through the Hud's role="status"
// banner, trade news through TradeToast, and the win through WinScreen's dialog, so none of those are repeated here.
import { useEffect, useState } from "react";
import { useGame } from "@/lib/game/store";

export function Announcer() {
  const turn = useGame((s) => {
    const st = s.state;
    if (!st || st.phase === "over") return "";
    if (s.mode !== "hotseat" && st.current === s.localId) return "Your turn.";
    return `${st.players.find((p) => p.id === st.current)?.name ?? "Someone"}'s turn.`;
  });
  const error = useGame((s) => s.error);
  const errorSeq = useGame((s) => s.errorSeq);
  // A live region that mounts with its text already in it is often not read, so the first turn is filled in after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="sr-only">
      <p data-testid="announce-turn" aria-live="polite" aria-atomic="true">
        {mounted ? turn : ""}
      </p>
      {/* Keyed by errorSeq: a repeat of the same error replaces the text node, so it is read again. */}
      <p data-testid="announce-error" role="alert">
        {error ? <span key={errorSeq}>{error}</span> : null}
      </p>
    </div>
  );
}
