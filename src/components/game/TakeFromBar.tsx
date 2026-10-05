import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";
import { SeatDot } from "@/components/game/SeatDot";

export function TakeFromBar() {
  const state = useGame((s) => s.state);
  const pendingSteal = useGame((s) => s.pendingSteal);
  const chooseSteal = useGame((s) => s.chooseSteal);
  if (!state || !pendingSteal) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[16px] border border-accent/40 bg-surface p-2">
      <span className="text-sm">Take from whom?</span>
      {pendingSteal.targets.map((id) => {
        const p = state.players.find((x) => x.id === id);
        if (!p) return null;
        return (
          <Button key={id} size="sm" variant="secondary" onClick={() => chooseSteal(id)}>
            <SeatDot color={p.color} className="mr-1 size-3" />
            {p.name}
          </Button>
        );
      })}
    </div>
  );
}
