import { useEffect, useState, useSyncExternalStore } from "react";
import { useGame } from "@/lib/game/store";

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
  const deadline = useGame((s) => s.turnTimer?.deadline ?? null);
  const extension = useSyncExternalStore(net?.subscribeTurnExtension ?? noopSubscribe, net?.getTurnExtension ?? empty);
  const [now, setNow] = useState(Date.now);
  const active = mode === "online" && !spectator && !!game && game.phase !== "over" && !!extension && !!net;
  const vote = extension?.vote;
  const cueAt = deadline === null ? null : deadline - skew;
  const tick = active ? (vote?.id ?? deadline) : null;
  useEffect(() => {
    if (tick == null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [tick]);
  if (!active) return null;
  const name = (pid: string) => game.players.find((p) => p.id === pid)?.name ?? "Player";
  const result = extension.result;
  const button = "min-h-11 min-w-11 rounded-lg border border-white/60 bg-white/70 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white focus-visible:outline-2 focus-visible:outline-fg disabled:opacity-50";
  if (vote) {
    const canVote = vote.voters.includes(localId) && !vote.yes.includes(localId) && !vote.no.includes(localId);
    const seconds = Math.max(0, Math.ceil((vote.until - skew - now) / 1000));
    const target = name(vote.target);
    const mine = vote.target === localId;
    return (
      <section data-testid="turn-extension-vote" aria-label="More time vote" className="flex min-w-0 flex-1 items-center gap-1 rounded-[16px] bg-glass px-2 text-xs text-zinc-900 backdrop-blur-md">
        <p role="status" className="min-w-0 flex-1 truncate" title={`Give ${target} 60 seconds more?`}>{target} +60s?</p>
        <span className="shrink-0 tabular-nums">{seconds}s</span>
        {canVote ? <>
          <button className={button} disabled={!seconds} onClick={() => net.answerTurnExtension(vote.id, false)}>No</button>
          <button aria-label="Yes, more time" className={button} disabled={!seconds} onClick={() => net.answerTurnExtension(vote.id, true)}>Yes</button>
        </> : <span className="min-w-0 truncate" title={mine ? "The other players decide." : "Waiting for the other players."}>{mine ? "Others decide" : "Voted"}</span>}
        <span className="sr-only">{vote.yes.filter((id) => vote.voters.includes(id)).length} of {vote.voters.length} voted yes.</span>
      </section>
    );
  }
  if (result) return <p role="status" data-testid="turn-extension-result" className="min-w-0 flex-1 truncate rounded-[16px] border border-white/50 bg-glass px-2 py-2 text-xs text-zinc-900 backdrop-blur-md">
    {result.outcome === "passed" ? `${name(result.target)} gets 60 seconds more.` : result.outcome === "failed" ? "More time vote did not pass." : "More time vote cancelled."}
  </p>;
  if (!extension.target || !extension.key || extension.used || !game.players.some((p) => p.id !== extension.target && p.kind === "human")) return null;
  const label = extension.target === localId ? "Ask for more time" : `Give ${name(extension.target)} more time`;
  const short = cueAt !== null && cueAt - now <= SHORT_MS;
  const link = "inline-flex min-h-11 min-w-11 items-center justify-center bg-transparent px-2 text-sm font-medium text-zinc-900 underline decoration-zinc-900/40 underline-offset-4 hover:decoration-zinc-900 focus-visible:outline-2 focus-visible:outline-fg";
  return <button data-testid="turn-extension-ask" data-quiet={short ? undefined : "true"} className={short ? `${button} min-w-0 flex-1 truncate` : `${link} min-w-0 max-w-full truncate`} title={label} onClick={() => net.requestTurnExtension(extension.target!, extension.key!)}>{label}</button>;
}
