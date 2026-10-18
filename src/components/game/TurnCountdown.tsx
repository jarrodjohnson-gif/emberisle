import { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/game/store";
import { play } from "@/lib/sound";
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

  // #661: only the seat the timer waits on hears it, online. A tick as the count reaches each of 5..1 and a knock at 0, once per
  // value. The cues are timed from the deadline itself, not from the 250 ms read-out above: the host moves the turn on at the
  // deadline, and a read-out could miss the 0. A new `at` (or the turn ending early) clears them. A page that arrives inside
  // the last 5 s ticks for the value it lands on, then goes on from there; it never replays the earlier ones.
  const spectator = useGame((s) => s.spectator);
  const mine = mode === "online" && !spectator && timer?.player === localId;
  // The window the HUD holds now, read by the cleanup below after the render that replaced the old one.
  // The deadline whose knock has played. A resend of the same window brings a new `at` (the skew wobbles), but never a second knock.
  const knockedFor = useRef<number | null>(null);
  const armedFor = useRef<number | null>(null);
  const deadline = timer?.deadline ?? null;
  // The cues run off the best clock estimate, which a late push cannot spoil; the chip keeps its own `at` so it never remounts.
  const skew = useGame((s) => s.clockSkew);
  const cueAt = (deadline ?? 0) - skew;
  useEffect(() => {
    if (!mine || deadline === null) return;
    const tick = () => play("timer_tick", 0.5);
    const knock = () => {
      if (knockedFor.current !== deadline) play("timer_final", 0.8);
      knockedFor.current = deadline;
    };
    const left = cueAt - Date.now();
    if (left <= 0) return void (left > -1000 && knock());
    if (knockedFor.current === deadline) return;
    // The value the count is on now. A page that lands inside the last 5 s ticks for it, then carries on from there. A re-arm for
    // the same deadline (the clock estimate improved) lands silently: that tick already played.
    const now = Math.ceil(left / 1000);
    if (now <= 5 && armedFor.current !== deadline) tick();
    armedFor.current = deadline;
    const ids = [setTimeout(knock, left)];
    for (let k = Math.min(now, 6) - 1; k >= 1; k--) ids.push(setTimeout(tick, left - k * 1000));
    return () => {
      ids.forEach(clearTimeout);
      // The host moves the turn on at the deadline, so the next window can arrive before this knock fires, a long way before
      // it when this tab's clock estimate ran late. The window that replaced this one says on the host's own clock whether the
      // deadline had passed when it was sent; that, or being within 400 ms of it here, plays the knock. A turn that ends with
      // time to spare plays nothing, and a deadline that moved later is a new window, not this one's knock.
      const next = useGame.getState().turnTimer;
      if (cueAt - Date.now() < 400 || (next && next.deadline !== deadline && next.host >= deadline - 400)) knock();
    };
  }, [mine, cueAt, deadline]);

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
