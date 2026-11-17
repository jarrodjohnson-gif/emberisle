import { useEffect, useState, useSyncExternalStore } from "react";
import { useGame } from "@/lib/game/store";
import "./turn-extension-vote.css";

const empty = () => null;
const noopSubscribe = () => () => {};
// The countdown chip appears in this same last half-minute (TurnCountdown SHOW_MS).
const SHORT_MS = 30_000;

// Lives beside the countdown in the existing HUD stack, including while its clock chip is hidden.
export function TurnExtensionVote() {
  const net = useGame((s) => s.net);
  const mode = useGame((s) => s.mode);
  const spectator = useGame((s) => s.spectator);
  const localId = useGame((s) => s.localId);
  const game = useGame((s) => s.state);
  const skew = useGame((s) => s.clockSkew);
  const timerAt = useGame((s) => s.turnTimer?.at ?? null);
  const extension = useSyncExternalStore(net?.subscribeTurnExtension ?? noopSubscribe, net?.getTurnExtension ?? empty);
  const [now, setNow] = useState(Date.now);
  const vote = extension?.vote;
  const tick = vote?.id ?? timerAt;
  useEffect(() => {
    if (tick == null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [tick]);
  if (mode !== "online" || spectator || !game || game.phase === "over" || !extension || !net) return null;
  const name = (pid: string) => game.players.find((p) => p.id === pid)?.name ?? "Player";
  const result = extension.result;
  const canVote = vote?.voters.includes(localId) && !vote.yes.includes(localId) && !vote.no.includes(localId);
  const seconds = vote ? Math.max(0, Math.ceil((vote.until - skew - now) / 1000)) : 0;
  if (vote) return (
    <section data-testid="turn-extension-vote" aria-label="More time vote" className="tev-bar">
      <p role="status" title={`Give ${name(vote.target)} 60 seconds more?`}>{name(vote.target)} +60s?</p>
      <span className="tev-sec">{seconds}s</span>
      {canVote ? <>
        <button className="tev-btn" disabled={!seconds} onClick={() => net.answerTurnExtension(vote.id, false)}>No</button>
        <button aria-label="Yes, more time" className="tev-btn" disabled={!seconds} onClick={() => net.answerTurnExtension(vote.id, true)}>Yes</button>
      </> : <span className="tev-wait" title={vote.target === localId ? "The other players decide." : "Waiting for the other players."}>{vote.target === localId ? "Others decide" : "Voted"}</span>}
      <span className="sr-only">{vote.yes.filter((id) => vote.voters.includes(id)).length} of {vote.voters.length} voted yes.</span>
    </section>
  );
  if (result) return <p role="status" data-testid="turn-extension-result" className="tev-res">
    {result.outcome === "passed" ? `${name(result.target)} gets 60 seconds more.` : result.outcome === "failed" ? "More time vote did not pass." : "More time vote cancelled."}
  </p>;
  if (!extension.target || !extension.key || extension.used || !game.players.some((p) => p.id !== extension.target && p.kind === "human")) return null;
  const label = extension.target === localId ? "Ask for more time" : `Give ${name(extension.target)} more time`;
  const left = timerAt === null ? null : timerAt - now;
  const short = left !== null && left <= SHORT_MS;
  return <button data-testid="turn-extension-ask" data-quiet={short ? undefined : "true"} className={short ? "tev-btn tev-ask" : "tev-link"} title={label} onClick={() => net.requestTurnExtension(extension.target!, extension.key!)}>{label}</button>;
}
