import { useEffect } from "react";
import { useGame } from "@/lib/game/store";

// The sheets chunk did not load: close what was asked for, so How to play or Trade can be pressed again and retry, and
// tell the HUD which ask failed, so the winner line offers the way out while the win screen cannot show (#492).
export function SheetsFailed({ sheetsKey, onLost }: { sheetsKey: string; onLost: (key: string | null) => void }) {
  const setHowTo = useGame((s) => s.setHowTo);
  const setTradeOpen = useGame((s) => s.setTradeOpen);
  useEffect(() => {
    setHowTo(false);
    setTradeOpen(false);
    onLost(sheetsKey);
    return () => onLost(null);
  }, [setHowTo, setTradeOpen, onLost, sheetsKey]);
  return null;
}
