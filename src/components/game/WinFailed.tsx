import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { savedSeat, useGame } from "@/lib/game/store";

// #492: the game is over but the sheets chunk is gone (a deploy mid-game deleted the old-hash file) and the retry at game
// over failed too, so the win screen cannot load. The HUD's winner line already names the winner; this is its way out,
// rendered inside that line. A seated online player reloads: the saved seat rejoins a table that still holds the final
// state, so the scores come back from the fresh chunk. Practice, hotseat and a watcher have no seat to rejoin, so they
// get the menu instead of a reload that would land on the title with the result gone.
export function WinFailed() {
  const seated = useGame((s) => s.mode === "online" && !s.spectator);
  const goTitle = useGame((s) => s.goTitle);
  const canReload = seated && savedSeat() !== null;
  const button = useRef<HTMLButtonElement>(null);
  // The win screen would have taken focus; with it gone, its way out does.
  useEffect(() => button.current?.focus(), []);
  return (
    <Button
      ref={button}
      size="sm"
      variant="secondary"
      className="mt-2 flex"
      data-testid="win-failed"
      aria-describedby="hud-winner"
      onClick={canReload ? () => location.reload() : goTitle}
    >
      {canReload ? "Reload for the results" : "Back to menu"}
    </Button>
  );
}
