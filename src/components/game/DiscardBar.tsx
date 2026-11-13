import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RESOURCE_ICON } from "@/components/game/ResourceSymbols";
import { SeatDot } from "@/components/game/SeatDot";
import { RESOURCES, RESOURCE_LABEL, type Resource } from "@/lib/game/types";
import { useGame } from "@/lib/game/store";

const NONE: Record<Resource, number> = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };

// #1546 (docs/design/one-tray): the discard takes over the tray. The top line counts down what is left to pick; the hand's
// five columns are the picker (a tap adds one of that good, the number shows what you keep, the name is in its label); a
// fixed row of minus buttons stands where the names were and takes one back; the action row is one button, off until the
// count is exact. The tray stays the height of the my-turn tray.
export function DiscardBar({ id, n }: { id: string; n: number }) {
  const me = useGame((s) => s.state!.players.find((p) => p.id === id)!);
  // In hotseat a seat that owes a discard on another seat's turn is named (#430).
  const named = useGame((s) => s.mode === "hotseat" && s.state!.current !== id);
  const dispatch = useGame((s) => s.dispatch);
  const [counts, setCounts] = useState(NONE);
  const left = n - RESOURCES.reduce((sum, r) => sum + counts[r], 0);
  const pick = (r: Resource, d: number) => setCounts({ ...counts, [r]: counts[r] + d });
  return (
    <form
      className="tray-takeover discard-bar"
      aria-label={`Discard ${n}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!left) dispatch({ type: "discard", resources: counts }, id);
      }}
    >
      {/* #1546: a dot in the top line always means a seat, so only a named hotseat seat gets one, in its own colour. */}
      <p data-testid="turn-banner" className="tray-line turn-instruction">
        {named ? <SeatDot color={me.color} className="mr-2 size-2.5" /> : null}
        Discard {n}{named ? ` · ${me.name}` : ""}: <span data-testid="discard-count" aria-live="polite">{left ? `pick ${left} more` : "ready"}</span>
      </p>
      <div className="discard-pick goods-tray">
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
              className={`hand-resource-card-slot goods-card goods-${r}${have ? "" : " goods-empty"}`}
            >
              <Icon className="goods-icon" aria-hidden />
              <span className="goods-count">{have - counts[r]}</span>
              {counts[r] ? <span aria-hidden className="tray-tag">−{counts[r]}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="discard-back goods-tray">
        {RESOURCES.map((r) => (
          <button key={r} type="button" data-testid={`discard-back-${r}`} aria-disabled={!counts[r] || undefined} aria-label={`Keep one more ${RESOURCE_LABEL[r]}`} onClick={() => counts[r] && pick(r, -1)}>
            <span aria-hidden>−</span>
          </button>
        ))}
      </div>
      <div className="tray-row">
        <Button type="submit" disabled={!!left}>Discard {n}</Button>
      </div>
    </form>
  );
}
