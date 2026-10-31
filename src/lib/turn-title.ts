import { useEffect } from "react";
import { useGame } from "@/lib/game/store";

const IDLE = "Emberisle";
const YOURS = "● Your turn — Emberisle";
const WATCHING = "Watching — Emberisle";

// A background tab shows when it is your move (#252). Hotseat has no "you", so it keeps the plain title.
// A spectator's tab (docs/design/spectator.md) says it is watching and never claims a turn.
// #840: while the tab is hidden on your turn, flash the title until the tab is focused again.
export function useTurnTitle() {
  const title = useGame((s) => {
    const st = s.state;
    if (s.screen !== "play" || !st) return IDLE;
    if (s.spectator) return WATCHING;
    if (s.mode === "hotseat" || st.phase === "over") return IDLE;
    return st.current === s.localId || (st.discardNeeded[s.localId] ?? 0) > 0 ? YOURS : IDLE;
  });
  useEffect(() => {
    if (title !== YOURS) {
      document.title = title;
      return () => {
        document.title = IDLE;
      };
    }

    let flashOn = true;
    const paint = () => {
      if (document.hidden) {
        document.title = flashOn ? YOURS : IDLE;
      } else {
        flashOn = true;
        document.title = YOURS;
      }
    };
    paint();
    const tick = setInterval(() => {
      if (!document.hidden) return;
      flashOn = !flashOn;
      document.title = flashOn ? YOURS : IDLE;
    }, 1000);
    document.addEventListener("visibilitychange", paint);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", paint);
      document.title = IDLE;
    };
  }, [title]);
}
