// "Your turn", said once in the middle of the island when a turn comes round to this seat (Jarrod's playtest: "not intuitive
// on when it's your turn"). Hotseat has no "you", so it names the seat taking the device. It fades in, holds about 1.2 s and
// fades out; it takes no pointer events, and any press or key ends it, since the player has seen it. It waits for the roll
// moment and any gains to leave the centre. Not in the roll-off or setup: there the banner already says what to place, the
// legal corners pulse in your colour, and a moment would sit over the very corners to pick. The your-turn chime is the
// store's (sound.ts yourTurn), on the same change. A first load or a rejoin replays nothing, and a watcher never has a turn.
import { useEffect, useState } from "react";
import { SeatDot } from "@/components/game/SeatDot";
import { useMomentUp } from "@/components/game/Dice";
import { useFloatsUp } from "@/components/game/GainFloats";
import { useStage } from "@/components/game/stage";
import { useGame } from "@/lib/game/store";

// --duration-base in, a 1.2 s hold, about 0.7x of the entry out (docs/design/polish.md "Motion").
const MOMENT_MS = 1580;

export function TurnMoment() {
  const state = useGame((s) => s.state);
  const mode = useGame((s) => s.mode);
  const localId = useGame((s) => s.localId);
  const spectator = useGame((s) => s.spectator);
  const rolling = useMomentUp((s) => s.up);
  const floating = useFloatsUp((s) => s.up);
  const synced = useGame((s) => s.synced);
  const actor = mode === "hotseat" ? state?.current : localId;
  const key = state && !spectator && state.phase === "roll" && state.current === actor ? `${state.seed}|${state.turn}|${state.current}` : null;
  const [seen, setSeen] = useState(key);
  const [due, setDue] = useState<string | null>(null);
  const [up, setUp] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(synced);

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
    if (up && up !== key) setUp(null);
    if (due && !rolling && !floating && !up) {
      setUp(due);
      setDue(null);
    }
  }

  const [stage, { dy, how }] = useStage<HTMLParagraphElement>(up);
  useEffect(() => {
    if (!up) return;
    const end = () => setUp(null);
    const t = setTimeout(end, MOMENT_MS);
    window.addEventListener("pointerdown", end, true);
    window.addEventListener("keydown", end, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", end, true);
      window.removeEventListener("keydown", end, true);
    };
  }, [up]);

  const player = state?.players.find((p) => p.id === state.current);
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
        data-shift={dy}
        data-stage={how}
        style={{ translate: `0 ${dy}px` }}
        className="flex items-center gap-3 rounded-sheet bg-glass px-6 py-4 text-number text-fg backdrop-blur-md motion-safe:animate-[turn-moment_1580ms_both] motion-reduce:animate-[moment-fade_1580ms_linear_both]"
      >
        <SeatDot color={player.color} className="size-5" />
        {mode === "hotseat" ? `${player.name}'s turn` : "Your turn"}
      </p>
    </div>
  );
}
