import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";

// #1101: the phone dock keeps Trade in its slot on every turn, disabled while it cannot be used.
export function TradeButton({ disabled, className }: { disabled?: boolean; className?: string }) {
  const setTradeOpen = useGame((s) => s.setTradeOpen);
  return (
    <Button size="sm" variant="secondary" data-after-fortune disabled={disabled} className={className} onClick={(e) => setTradeOpen(true, e.currentTarget)}>
      <ArrowLeftRight className="size-4" /> Trade
    </Button>
  );
}
