import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";

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
            <span className="mr-1 inline-block size-2.5 rounded-full" style={{ background: p.color }} />
            {p.name}
          </Button>
        );
      })}
    </div>
  );
}
