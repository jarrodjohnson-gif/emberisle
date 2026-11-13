import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TradeResource } from "@/components/game/TradeResource";
import { RESOURCES, type Resource } from "@/lib/game/types";
import { useGame } from "@/lib/game/store";
import "./trade-panel.css";

const NONE: Record<Resource, number> = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };

// Discarding on a 7 (docs/design/one-tray, slice C): the hand's five numbers become the trade sheet's tokens. A tap adds
// one, up to `n` in all; the minus on a chosen token takes one back. The tray's top line says how many; the one button is
// off until the count is right.
export function DiscardBar({ id, n }: { id: string; n: number }) {
  const me = useGame((s) => s.state!.players.find((p) => p.id === id)!);
  const dispatch = useGame((s) => s.dispatch);
  const [counts, setCounts] = useState(NONE);
  const picked = RESOURCES.reduce((sum, r) => sum + counts[r], 0);
  return (
    <div className="discard-pick" data-testid="discard-pick">
      <div className="trade-resource-grid">
        {RESOURCES.map((r) => (
          <TradeResource key={r} resource={r} side="discard" value={counts[r]} owned={me.resources[r]} canMore={picked < n && counts[r] < me.resources[r]} onChange={(v) => setCounts({ ...counts, [r]: v })} />
        ))}
      </div>
      <span data-testid="discard-count" aria-live="polite" className="sr-only">{picked} of {n}</span>
      <Button disabled={picked !== n} onClick={() => dispatch({ type: "discard", resources: counts }, id)}>
        Discard {n}
      </Button>
    </div>
  );
}
