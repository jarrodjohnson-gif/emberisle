import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";

export function TradeButton() {
  const setTradeOpen = useGame((s) => s.setTradeOpen);
  return (
    <Button size="sm" variant="secondary" onClick={(e) => setTradeOpen(true, e.currentTarget)}>
      <ArrowLeftRight className="size-4" /> Trade
    </Button>
  );
}
