import { useEffect, useState, useSyncExternalStore } from "react";
import { useGame } from "@/lib/game/store";

const empty = () => null;
const noopSubscribe = () => () => {};

// Lives beside the countdown in the existing HUD stack, including while its clock chip is hidden.
export function TurnExtensionVote() {
  const net = useGame((s) => s.net);
  const mode = useGame((s) => s.mode);
  const spectator = useGame((s) => s.spectator);
  const localId = useGame((s) => s.localId);
  const game = useGame((s) => s.state);
  const skew = useGame((s) => s.clockSkew);
  const extension = useSyncExternalStore(net?.subscribeTurnExtension ?? noopSubscribe, net?.getTurnExtension ?? empty);
  const [now, setNow] = useState(Date.now);
  const vote = extension?.vote;
  useEffect(() => {
    if (!vote) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [vote?.id]);
  if (mode !== "online" || spectator || !game || game.phase === "over" || !extension || !net) return null;
  const name = (pid: string) => game.players.find((p) => p.id === pid)?.name ?? "Player";
  const result = extension.result;
  const canVote = vote?.voters.includes(localId) && !vote.yes.includes(localId) && !vote.no.includes(localId);
  const seconds = vote ? Math.max(0, Math.ceil((vote.until - skew - now) / 1000)) : 0;
  const button = "min-h-11 min-w-11 rounded-lg border border-white/60 bg-white/70 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";
  if (vote) return (
    <section data-testid="turn-extension-vote" aria-label="More time vote" className="flex min-w-0 flex-1 items-center gap-1 rounded-[16px] bg-glass px-2 text-xs text-zinc-900 backdrop-blur-md">
      <p role="status" className="min-w-0 flex-1 truncate" title={`Give ${name(vote.target)} 60 seconds more?`}>{name(vote.target)} +60s?</p>
      <span className="shrink-0 tabular-nums">{seconds}s</span>
      {canVote ? <>
        <button aria-label="Yes, more time" className={button} disabled={!seconds} onClick={() => net.answerTurnExtension(vote.id, true)}>Yes</button>
        <button className={button} disabled={!seconds} onClick={() => net.answerTurnExtension(vote.id, false)}>No</button>
      </> : <span className="min-w-0 truncate" title={vote.target === localId ? "The other players decide." : "Waiting for the other players."}>{vote.target === localId ? "Others decide" : "Voted"}</span>}
      <span className="sr-only">{vote.yes.filter((id) => vote.voters.includes(id)).length} of {vote.voters.length} voted yes.</span>
    </section>
  );
  if (result) return <p role="status" data-testid="turn-extension-result" className="min-w-0 flex-1 truncate rounded-[16px] border border-white/50 bg-glass px-2 py-2 text-xs text-zinc-900 backdrop-blur-md">
    {result.outcome === "passed" ? `${name(result.target)} gets 60 seconds more.` : result.outcome === "failed" ? "More time vote did not pass." : "More time vote cancelled."}
  </p>;
  if (!extension.target || !extension.key || extension.used || !game.players.some((p) => p.id !== extension.target && p.kind === "human")) return null;
  return <button data-testid="turn-extension-ask" className={`${button} min-w-0 flex-1 truncate`} title={`Give ${name(extension.target)} more time`} onClick={() => net.requestTurnExtension(extension.target!, extension.key!)}>Give {name(extension.target)} more time</button>;
}
