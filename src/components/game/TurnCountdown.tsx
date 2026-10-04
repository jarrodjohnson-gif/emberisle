import { useEffect, useState } from "react";
import { useGame } from "@/lib/game/store";
import { cn } from "@/lib/utils";

// The chip shows only in the last SHOW_MS of the host's window and turns to the accent in the last URGENT_MS (#345).
const SHOW_MS = 30_000;
const URGENT_MS = 10_000;

const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

// The host's turn timer (#344) counted down for the seat it waits on. Online only: practice and hotseat have no timer.
// The number ticks silently; screen readers hear one polite line when the window reaches its last ten seconds.
export function TurnCountdown() {
  const timer = useGame((s) => s.turnTimer);
  const state = useGame((s) => s.state);
  const mode = useGame((s) => s.mode);
  const localId = useGame((s) => s.localId);
  const [secs, setSecs] = useState<number | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const at = timer?.at ?? null;
  const player = state?.players.find((p) => p.id === timer?.player);
  const who = !player ? null : player.id === localId ? "You" : player.name;

  useEffect(() => {
    setSaid(null);
    if (at === null) return setSecs(null);
    const tick = () => setSecs(Math.max(0, Math.ceil((at - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [at]);

  const left = secs === null ? null : secs * 1000;
  const urgent = left !== null && left <= URGENT_MS;
  useEffect(() => {
    if (urgent && who && secs && !said) setSaid(`${secs} seconds left for ${who === "You" ? "you" : who}`);
  }, [urgent, who, secs, said]);

  if (mode !== "online" || !state || state.phase === "over" || left === null || left > SHOW_MS || !who) return null;
  return (
    <>
      <p
        key={at}
        data-testid="turn-countdown"
        data-player={player!.id}
        data-seconds={secs}
        style={{ borderLeftColor: urgent ? undefined : player!.color }}
        className={cn(
          "animate-[turn-fade_200ms_ease-out] rounded-[16px] border bg-glass px-3 py-2 text-sm font-medium tabular-nums text-zinc-900 backdrop-blur-md",
          urgent ? "border-accent bg-linear-to-r from-accent/20 to-accent/20" : "border-white/50 border-l-4",
        )}
      >
        {who}: {clock(secs!)}
      </p>
      <p aria-live="polite" className="sr-only" data-testid="turn-countdown-live">
        {said}
      </p>
    </>
  );
}
