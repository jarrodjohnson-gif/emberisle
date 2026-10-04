import { useEffect } from "react";
import { useGame } from "@/lib/game/store";

const IDLE = "Emberisle";
const YOURS = "● Your turn — Emberisle";
const WATCHING = "Watching — Emberisle";

// A background tab shows when it is your move (#252). Hotseat has no "you", so it keeps the plain title.
// A spectator's tab (docs/design/spectator.md) says it is watching and never claims a turn.
export function useTurnTitle() {
  const title = useGame((s) => {
    const st = s.state;
    if (s.screen !== "play" || !st) return IDLE;
    if (s.spectator) return WATCHING;
    if (s.mode === "hotseat" || st.phase === "over") return IDLE;
    return st.current === s.localId || (st.discardNeeded[s.localId] ?? 0) > 0 ? YOURS : IDLE;
  });
  useEffect(() => {
    document.title = title;
    return () => {
      document.title = IDLE;
    };
  }, [title]);
}
