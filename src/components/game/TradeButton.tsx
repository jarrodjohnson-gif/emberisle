import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";

// #1429: the desktop dock keeps Trade in its place on every turn; `idle` greys it with the reason and it does nothing.
export function TradeButton({ idle }: { idle?: string }) {
  const setTradeOpen = useGame((s) => s.setTradeOpen);
  return (
    <Button size="sm" variant="secondary" data-after-fortune aria-disabled={idle ? true : undefined} aria-description={idle} onClick={(e) => idle || setTradeOpen(true, e.currentTarget)}>
      <ArrowLeftRight className="size-4" /> Trade
    </Button>
  );
}
