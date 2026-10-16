// Screen-reader status messages (#380, WCAG 4.1.3): whose turn it is, and what the isle just refused.
// Dice speak through RollMoment; goods events stay in the persistent game log. The roll-off
// and award changes use the HUD status banner, trade offers/outcomes use this region, and the win uses
// WinScreen's dialog, so none of those are repeated here.
import { useEffect, useState } from "react";
import { offerLine } from "@/components/game/TradeToast";
import { useGame } from "@/lib/game/store";

export function Announcer() {
  const turn = useGame((s) => {
    const st = s.state;
    if (!st || st.phase === "over") return "";
    if (s.mode !== "hotseat" && st.current === s.localId) return "Your turn.";
    return `${st.players.find((p) => p.id === st.current)?.name ?? "Someone"}'s turn.`;
  });
  const trade = useGame((s) => {
    if (!s.offer) return s.tradeOutcome ?? "";
    if (s.declined.includes(s.localId)) return "Offer declined.";
    return offerLine(s.offer.from === s.localId ? null : s.offer.fromName, s.offer.give, s.offer.want);
  });
  const event = useGame((s) => s.chatOpen ? "" : (s.gameLog.at(-1)?.text ?? ""));
  const error = useGame((s) => s.error);
  const announcement = useGame((s) => s.announcement);
  const errorSeq = useGame((s) => s.errorSeq);
  const alert = error ?? announcement;
  // A live region that mounts with its text already in it is often not read, so the first turn is filled in after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="sr-only">
      <p data-testid="announce-turn" aria-live="polite" aria-atomic="true">
        {mounted ? turn : ""}
      </p>
      <p data-testid="announce-log" aria-live="polite" aria-atomic="true">{mounted ? event : ""}</p>
      <p data-testid="announce-trade" aria-live="polite" aria-atomic="true">{mounted ? trade : ""}</p>
      {/* Keyed by errorSeq: a repeat of the same error replaces the text node, so it is read again. */}
      <p data-testid="announce-error" role="alert">
        {alert ? <span key={errorSeq}>{alert}</span> : null}
      </p>
    </div>
  );
}
