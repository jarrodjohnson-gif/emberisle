// "Your turn", said once in the middle of the island when a move comes round to this seat (Jarrod's playtest: "not intuitive
// on when it's your turn"; #1140: sound-off players still missed it). Online and in practice it comes in, then stays up with a
// slow calm pulse until the person presses or types anything (they have seen it) or the move passes on (they rolled, placed or
// the turn went elsewhere), and never longer than STAY_MS. It appears on a roll, not during the opening setup. Hotseat has
// no "you", so it names the seat taking the device, on a roll only, and keeps the old timed fade (it fades in, holds about
// 1.2 s and fades out). It takes no pointer events, so it never blocks a tap, and reduced motion gets a steady pill, no pulse.
// It waits for the roll moment to leave the centre (gains show on the hand, #773). The your-turn chime is the store's
// (sound.ts yourTurn), on the same change. A first load or a rejoin replays nothing, and a watcher never has a turn.
import { useEffect, useRef, useState } from "react";
import { SeatDot } from "@/components/game/SeatDot";
import { useMomentUp } from "@/components/game/Dice";
import { useStage } from "@/components/game/stage";
import { cn } from "@/lib/utils";
import { useGame } from "@/lib/game/store";
import type { GameState } from "@/lib/game/types";

// Hotseat: --duration-base in, a 1.2 s hold, about 0.7x of the entry out (docs/design/polish.md "Motion").
const MOMENT_MS = 1800;
// Online and practice: the longest it stays up if nobody presses anything.
const STAY_MS = 8000;

// One id per roll turn of this seat.
function moveKey(s: GameState, me: string) {
  if (s.current !== me) return null;
  if (s.phase === "roll") return `${s.seed}|${s.turn}|${me}`;
  return null;
}

export function TurnMoment() {
  const state = useGame((s) => s.state);
  const mode = useGame((s) => s.mode);
  const localId = useGame((s) => s.localId);
  const spectator = useGame((s) => s.spectator);
  const rolling = useMomentUp((s) => s.up);
  const synced = useGame((s) => s.synced);
  const actor = mode === "hotseat" ? state?.current : localId;
  const key = state && !spectator && actor ? moveKey(state, actor) : null;
  // A mounted or restored move is the baseline, not a new turn.
  const [seen, setSeen] = useState(key);
  const [due, setDue] = useState<string | null>(null);
  const [up, setUp] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(synced);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (baseline !== synced) {
    // A welcome's first state (a rejoin after a drop) is a new baseline: no moment for it, and none still waiting or up.
    setBaseline(synced);
    setSeen(key);
    setDue(null);
    setUp(null);
  } else {
    if (key && key !== seen) {
      setSeen(key);
      setDue(key);
    }
    // The turn moved on, or the seat rolled, before the centre was free: the moment is no longer news.
    if (due && due !== key) setDue(null);
    if (due && !rolling && !up) {
      setUp(due);
      setDue(null);
    }
  }

  const stage = useStage<HTMLParagraphElement>(up);
  const end = () => {
    const el = stage.current;
    if (!up || el?.dataset.leaving) return;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setUp(null);
      return;
    }
    // Freeze the current entry or pulse frame before replacing the animation with the exit transition.
    const style = getComputedStyle(el);
    const opacity = style.opacity, transform = style.transform;
    el.style.opacity = opacity;
    el.style.transform = transform;
    el.dataset.leaving = "true";
    void el.offsetWidth;
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      el.style.opacity = "0";
      el.style.transform = "scale(0.97)";
      exitTimer.current = setTimeout(() => setUp(null), 160);
    });
  };
  useEffect(() => {
    if (!up) return;
    const t = setTimeout(end, mode === "hotseat" ? MOMENT_MS : STAY_MS);
    window.addEventListener("pointerdown", end, true);
    window.addEventListener("keydown", end, true);
    return () => {
      clearTimeout(t);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      window.removeEventListener("pointerdown", end, true);
      window.removeEventListener("keydown", end, true);
    };
  }, [up, mode]);
  useEffect(() => { if (up && up !== key) end(); }, [up, key]);

  const player = state?.players.find((p) => p.id === up?.split("|").at(-1));
  if (!up || !player) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-30 flex items-center justify-center"
      style={{ top: "var(--hole-top, 0px)", right: "var(--hole-right, 0px)", bottom: "var(--hole-bottom, 0px)", left: "var(--hole-left, 0px)" }}
    >
      <p
        key={up}
        ref={stage}
        data-testid="turn-moment"
        className={cn(
          "flex items-center gap-3 turn-stamp",
          mode === "hotseat" ? "motion-safe:animate-[turn-moment_1800ms_both]" : "turn-stay",
        )}
      >
        <SeatDot color={player.color} className="turn-stamp-dot" />
        {mode === "hotseat" ? `${player.name}'s turn` : "Your turn"}
      </p>
    </div>
  );
}
