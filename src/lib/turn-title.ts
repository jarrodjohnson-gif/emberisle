import { useEffect } from "react";
import { useGame } from "@/lib/game/store";

const IDLE = "Emberisle";
const YOURS = "● Your turn — Emberisle";

// A background tab shows when it is your move (#252). Hotseat has no "you", so it keeps the plain title.
export function useTurnTitle() {
  const yours = useGame((s) => {
    const st = s.state;
    if (s.screen !== "play" || s.mode === "hotseat" || !st || st.phase === "over") return false;
    return st.current === s.localId || (st.discardNeeded[s.localId] ?? 0) > 0;
  });
  useEffect(() => {
    document.title = yours ? YOURS : IDLE;
    return () => {
      document.title = IDLE;
    };
  }, [yours]);
}
