import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";

// #492: the game is over but the sheets chunk is gone (a deploy mid-game deleted the old-hash file) and the retry at game
// over failed too, so the win screen cannot load. The index names the winner itself. Online, a reload rejoins the saved
// seat, whose table still holds the final state, so the scores come back from the fresh chunk; a practice or hotseat game
// has no seat to rejoin, so it offers the menu instead.
export function WinFailed() {
  const winner = useGame((s) => s.state?.players.find((p) => p.id === s.state?.winner));
  const online = useGame((s) => s.mode === "online");
  const goTitle = useGame((s) => s.goTitle);
  if (!winner) return null;
  return (
    <div
      role="alert"
      data-testid="win-failed"
      className="absolute left-1/2 top-16 z-20 flex -translate-x-1/2 flex-col items-center gap-2 rounded-[20px] border border-white/50 bg-white/60 p-4 text-center backdrop-blur-md"
    >
      <p className="font-display text-2xl" style={{ color: winner.color }}>
        {winner.name} wins
      </p>
      <Button size="sm" onClick={online ? () => location.reload() : goTitle}>
        {online ? "Reload for the results" : "Back to menu"}
      </Button>
    </div>
  );
}
