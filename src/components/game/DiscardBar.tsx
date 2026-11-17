import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RESOURCE_ICON } from "@/components/game/ResourceSymbols";
import { setDiscardPicked } from "@/lib/game/discard-pick";
import { RESOURCES, RESOURCE_LABEL, type Resource } from "@/lib/game/types";
import { useGame } from "@/lib/game/store";

const NONE: Record<Resource, number> = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };

// Discarding on a 7 (docs/design/one-tray, slice C; #1595): the hand's five columns become the picker. A tap on a column picks
// one of that good (its number shows what you keep); a fixed row of take-back buttons stands where the names were, each a full
// 44 px target that reads "−N" for what goes and is off ("−") until its good is picked, so nothing overlaps and nothing jumps.
// The tray's top line counts what is left to pick (Hud, from setDiscardPicked); the one button is off until the count is right.
export function DiscardBar({ id, n }: { id: string; n: number }) {
  const me = useGame((s) => s.state!.players.find((p) => p.id === id)!);
  const dispatch = useGame((s) => s.dispatch);
  const [counts, setCounts] = useState(NONE);
  const picked = RESOURCES.reduce((sum, r) => sum + counts[r], 0);
  const left = n - picked;
  useEffect(() => {
    setDiscardPicked(picked);
    return () => setDiscardPicked(0);
  }, [picked]);
  const pick = (r: Resource, d: number) => setCounts({ ...counts, [r]: counts[r] + d });
  return (
    <div className="discard-pick" data-testid="discard-pick">
      <div className="discard-goods">
        {RESOURCES.map((r) => {
          const Icon = RESOURCE_ICON[r];
          const have = me.resources[r];
          const off = counts[r] >= have || !left;
          return (
            <button
              key={r}
              type="button"
              data-testid={`discard-${r}`}
              disabled={!have}
              aria-disabled={off || undefined}
              aria-label={`Discard ${RESOURCE_LABEL[r]}: ${counts[r]} picked, ${have - counts[r]} kept`}
              onClick={() => off || pick(r, 1)}
              className={`discard-good goods-${r}${have ? "" : " goods-empty"}`}
            >
              <Icon className="goods-icon" aria-hidden />
              <span className="discard-keep">{have - counts[r]}</span>
            </button>
          );
        })}
      </div>
      <div className="discard-back">
        {RESOURCES.map((r) => (
          <button
            key={r}
            type="button"
            data-testid={`discard-back-${r}`}
            aria-disabled={!counts[r] || undefined}
            aria-label={`Keep one more ${RESOURCE_LABEL[r]}`}
            onClick={() => counts[r] && pick(r, -1)}
          >
            <span aria-hidden>−{counts[r] || ""}</span>
          </button>
        ))}
      </div>
      <span data-testid="discard-count" aria-live="polite" className="sr-only">{left ? `Pick ${left} more` : "Ready"}</span>
      <Button disabled={!!left} onClick={() => dispatch({ type: "discard", resources: counts }, id)}>
        Discard {n}
      </Button>
    </div>
  );
}
