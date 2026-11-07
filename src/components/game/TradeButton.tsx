import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";

// #1101: the phone dock keeps Trade in its slot on every turn. While it cannot be used it stays focusable and says why.
export function TradeButton({ why, className }: { why?: string; className?: string }) {
  const setTradeOpen = useGame((s) => s.setTradeOpen);
  return (
    <Button
      size="sm"
      variant="secondary"
      data-after-fortune
      aria-disabled={why ? true : undefined}
      aria-description={why}
      className={className}
      onClick={(e) => why || setTradeOpen(true, e.currentTarget)}
    >
      <ArrowLeftRight className="size-4" /> Trade
    </Button>
  );
}
