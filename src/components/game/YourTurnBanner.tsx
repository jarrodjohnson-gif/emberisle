// "Your turn" for sound-off players (#1140): a pill in the seat's own colour near the top of the island that fades in, holds
// about 1.2 s and fades out, once each time the move comes round to this seat: a roll, a roll-off throw, a setup placement.
// The word is on it, so colour is never the only cue. It takes no pointer events. A first load, a rejoin and a reload say
// nothing for the move already under way (the first state is the baseline), a watcher, a hotseat table and a bot's seat never
// get one, and the sound toggle does not matter. TurnMoment (#522) still names the turn in the middle of the island.
import { useEffect, useState } from "react";
import { useStage } from "@/components/game/moments";
import { useGame } from "@/lib/game/store";
import type { GameState } from "@/lib/game/types";

// 0.3 s in, a 1.2 s hold, 0.3 s out (the your-turn keyframes in styles.css). Reduced motion is a plain 1.5 s fade with no
// movement (moment-fade), which has ended by then.
const BANNER_MS = 1800;

// One id per move of this seat: a turn's roll, a roll-off throw (keyed on seq: an all-tie
// re-throw has empty rolls again), a setup step (the settlement and its path are one move, setupIndex moves on after the path).
function moveKey(s: GameState, me: string) {
  if (s.current !== me) return null;
  if (s.phase === "roll") return `${s.seed}|t${s.turn}|${me}`;
  if (s.phase === "rollOff") return `${s.seed}|o${s.seq}|${me}`;
  if (s.phase === "setupSettle" || s.phase === "setupRoad") return `${s.seed}|s${s.setupIndex}|${me}`;
  return null;
}

// Black or white, whichever reads better on the seat's colour: at least 4.5:1 on all four seat colours (red is the tightest).
function ink(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? "#000000" : "#ffffff";
}

export function YourTurnBanner() {
  const state = useGame((s) => s.state);
  const mode = useGame((s) => s.mode);
  const localId = useGame((s) => s.localId);
  const spectator = useGame((s) => s.spectator);
  const synced = useGame((s) => s.synced);
  const key = state && !spectator && mode !== "hotseat" && localId ? moveKey(state, localId) : null;
  // Mounted on a move already under way: the baseline, unless nobody has acted yet (a game that has just begun).
  const [seen, setSeen] = useState(state?.seq === 0 ? null : key);
  const [up, setUp] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(synced);

  if (baseline !== synced) {
    // A welcome's first state (a rejoin after a drop) is a new baseline: nothing for it, and nothing still up.
    setBaseline(synced);
    setSeen(key);
    setUp(null);
  } else {
    if (key && key !== seen) {
      setSeen(key);
      setUp(key);
    }
    // The turn went to someone else (or the game ended) before the banner left: it is no longer news. Acting on the move
    // (tapping Roll) does not cut it short; it finishes its fade.
    if (up && !(state && !spectator && state.current === localId && state.phase !== "over")) setUp(null);
  }

  const stage = useStage<HTMLParagraphElement>(up);
  useEffect(() => {
    if (!up) return;
    const t = setTimeout(() => setUp(null), BANNER_MS);
    return () => clearTimeout(t);
  }, [up]);
  const player = state?.players.find((p) => p.id === localId);
  if (!up || !player) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-30 flex items-start justify-center"
      style={{ top: "var(--hole-top, 0px)", right: "var(--hole-right, 0px)", bottom: "var(--hole-bottom, 0px)", left: "var(--hole-left, 0px)" }}
    >
      <p
        key={up}
        ref={stage}
        data-testid="your-turn"
        data-seat={player.id}
        className="your-turn turn-stamp mt-2 max-w-[calc(100%-1rem)] rounded-chip px-5 py-2 text-title"
        style={{ background: player.color, color: ink(player.color) }}
      >
        Your turn
      </p>
    </div>
  );
}
