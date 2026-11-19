// Screen-reader status messages (#380, WCAG 4.1.3): whose turn it is, and what the isle just refused.
// Dice speak through RollMoment; goods events stay in the persistent game log. The roll-off
// and award changes use the HUD status banner, trade offers/outcomes use this region, and the win uses
// WinScreen's dialog, so none of those are repeated here.
import { useEffect, useState } from "react";
import { offerLine } from "@/components/game/offer-line";
import { useGame } from "@/lib/game/store";

export function Announcer() {
  const turn = useGame((s) => {
    const st = s.state;
    if (!st || st.phase === "over") return "";
    if (s.mode !== "hotseat" && st.current === s.localId) return "Your turn.";
    return `${st.players.find((p) => p.id === st.current)?.name ?? "Someone"}'s turn.`;
  });
  const turnKey = useGame((s) => {
    const st = s.state;
    return st ? `${st.turn}-${st.phase}-${st.current}` : "";
  });
  const trade = useGame((s) => {
    if (s.state?.phase === "over") return "";
    if (!s.offer) return s.tradeOutcome ?? "";
    if (s.declined.includes(s.localId)) return "Offer declined.";
    return offerLine(s.offer.from === s.localId ? null : s.offer.fromName, s.offer.give, s.offer.want);
  });
  const tradeKey = useGame((s) => (s.offer ? `${s.offer.tradeId}-${s.declined.length}` : `${s.localTrade}-${s.tradeOutcome ?? ""}`));
  const event = useGame((s) => (s.state?.phase === "over" || s.chatOpen ? "" : (s.gameLog.at(-1)?.text ?? "")));
  const logSeq = useGame((s) => s.gameLog.length);
  const error = useGame((s) => (s.state?.phase === "over" ? null : s.error));
  const announcement = useGame((s) => (s.state?.phase === "over" ? null : s.announcement));
  const alert = error ?? announcement;
  const alertKey = useGame((s) => `${s.errorSeq}-${s.error ?? ""}-${s.announcement ?? ""}`);
  // A live region that mounts with its text already in it is often not read, so the first turn is filled in after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  return (
    <div className="sr-only">
      <p data-testid="announce-turn" aria-live="polite" aria-atomic="true">
        {mounted && turn ? <span key={turnKey}>{turn}</span> : ""}
      </p>
      <p data-testid="announce-log" aria-live="polite" aria-atomic="true">
        {mounted && event ? <span key={logSeq}>{event}</span> : ""}
      </p>
      <p data-testid="announce-trade" aria-live="polite" aria-atomic="true">
        {mounted && trade ? <span key={tradeKey}>{trade}</span> : ""}
      </p>
      {/* Keyed by alertKey: a repeat of the same error replaces the text node, so it is read again. */}
      <p data-testid="announce-error" role="alert">
        {alert ? <span key={alertKey}>{alert}</span> : null}
      </p>
    </div>
  );
}
