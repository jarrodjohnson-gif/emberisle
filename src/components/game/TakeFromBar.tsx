import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";
import { SeatDot } from "@/components/game/SeatDot";
import { useViewport } from "@/lib/viewport";
import { cn } from "@/lib/utils";

export function TakeFromBar() {
  const state = useGame((s) => s.state);
  const pendingSteal = useGame((s) => s.pendingSteal);
  const chooseSteal = useGame((s) => s.chooseSteal);
  const aboveChat = useGame((s) => s.mode === "online" && s.chatOpen);
  const { phone } = useViewport();
  if (!state || !pendingSteal) return null;
  return (
    // #557: the phone's chat sheet (z-30, min(48vh, 320px) tall) would hide this choice, so while it is open the bar rides just above it.
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-[16px] border border-accent/40 bg-surface p-2",
        phone && aboveChat && "pointer-events-auto fixed left-safe right-safe bottom-[calc(min(48vh,320px)+0.5rem)] z-30",
      )}
    >
      <span className="text-sm">Take from whom?</span>
      {pendingSteal.targets.map((id) => {
        const p = state.players.find((x) => x.id === id);
        if (!p) return null;
        return (
          <Button key={id} size="sm" variant="secondary" className={phone ? "h-11" : undefined} onClick={() => chooseSteal(id)}>
            <SeatDot color={p.color} className="mr-1 size-3" />
            {p.name}
          </Button>
        );
      })}
    </div>
  );
}
