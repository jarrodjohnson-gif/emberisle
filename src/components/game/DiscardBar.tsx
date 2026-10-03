import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RESOURCES, RESOURCE_LABEL, type Resource } from "@/lib/game/types";
import { useGame } from "@/lib/game/store";
import { useViewport } from "@/lib/viewport";
import { cn } from "@/lib/utils";

const NONE: Record<Resource, number> = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };

export function DiscardBar({ id, n }: { id: string; n: number }) {
  const me = useGame((s) => s.state!.players.find((p) => p.id === id)!);
  const hotseat = useGame((s) => s.mode === "hotseat");
  const dispatch = useGame((s) => s.dispatch);
  const { phone } = useViewport();
  const [counts, setCounts] = useState(NONE);
  const picked = RESOURCES.reduce((sum, r) => sum + counts[r], 0);
  const ready = picked === n;
  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-[16px] border border-accent/40 bg-surface p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) dispatch({ type: "discard", resources: counts }, id);
      }}
    >
      <span className="text-sm">{hotseat ? `${me.name}: discard ${n}` : `Discard ${n}`}</span>
      <span data-testid="discard-count" aria-live="polite" className={cn("text-sm tabular-nums", picked > n ? "text-red-700" : ready ? "font-medium" : "text-zinc-600")}>
        {picked} of {n}
      </span>
      {RESOURCES.map((r) => (
        <label key={r} className="flex items-center gap-1 text-xs">
          {RESOURCE_LABEL[r]}
          <input
            name={r}
            type="number"
            inputMode="numeric"
            min={0}
            max={me.resources[r]}
            value={counts[r]}
            onChange={(e) => {
              const v = Math.trunc(Number(e.target.value)) || 0;
              setCounts({ ...counts, [r]: Math.min(me.resources[r], Math.max(0, v)) });
            }}
            className={cn("w-12 rounded-[8px] border border-white/50 bg-raised px-1 text-center", phone ? "h-11 w-14" : "h-9")}
          />
        </label>
      ))}
      <Button size="sm" type="submit" disabled={!ready} className={phone ? "h-11 min-w-11" : undefined}>
        Discard
      </Button>
    </form>
  );
}
