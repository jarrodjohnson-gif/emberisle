// Jarrod (playtest): "a quick reference card that in-game board comes with." One small sheet: each build with its cost
// chips, what the pieces and the two awards are worth, and the win line, all read from COST and POINTS. Opened from the
// Table menu; focus lands on Close and goes back to the opener; Escape closes (see useEscapeDisarm for the order).
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CostChips, PRICE_NAME, priceLabel, type Price } from "@/components/game/BuildCost";
import { useFocusTrap } from "@/lib/focus-trap";
import { useGame } from "@/lib/game/store";
import {
  COST,
  LARGEST_ARMY_MIN,
  LONGEST_PATH_MIN,
  POINTS,
} from "@/lib/game/types";
import { play } from "@/lib/sound";

const WORTH: [string, number][] = [
  [PRICE_NAME.outpost, POINTS.outpost],
  [PRICE_NAME.stronghold, POINTS.stronghold],
  [`Longest path (${LONGEST_PATH_MIN}+)`, POINTS.longestPath],
  [`Largest army (${LARGEST_ARMY_MIN} wayfarers)`, POINTS.largestArmy],
  ["Points fortune, hidden", POINTS.pointsFortune],
];

export function CostCard({ onClose }: { onClose: () => void }) {
  const opener = useGame((s) => s.costsOpener);
  const root = useRef<HTMLDivElement>(null);
  useFocusTrap(root, true, undefined, opener);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      play("ui_back");
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-white/45 p-safe sm:items-center">
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="costs-title"
        data-testid="cost-card"
        className="max-h-[80dvh] w-full max-w-xs overflow-y-auto rounded-sheet sm:max-w-md bg-surface p-5 shadow-[0_8px_32px_rgb(28_25_21/0.18)]"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="costs-title" className="text-title">
            Costs
          </h2>
          <Button
            variant="ghost"
            className="size-11 p-0"
            onClick={onClose}
            aria-label="Close"
            back
          >
            <X className="size-4" />
          </Button>
        </div>
        {/* Two columns from 640 px wide, so a sideways phone's 312 px holds it without scrolling. */}
        <div className="sm:grid sm:grid-cols-2 sm:gap-x-6">
          <ul className="mt-2 flex flex-col gap-2">
            {(Object.keys(COST) as Price[]).map((kind) => (
              <li
                key={kind}
                data-testid={`cost-row-${kind}`}
                className="flex h-8 items-center justify-between gap-3 text-body"
              >
                {/* The chips are aria-hidden (a row of icons): the read-out carries the same price. */}
                <span aria-hidden>{PRICE_NAME[kind]}</span>
                <span className="sr-only">{priceLabel(kind)}</span>
                <CostChips kind={kind} />
              </li>
            ))}
          </ul>
          <ul className="mt-4 flex flex-col gap-1 text-caption text-muted sm:mt-2">
            {WORTH.map(([what, n]) => (
              <li key={what} data-testid="worth-row" className="flex justify-between gap-3">
                <span>{what}</span>
                <span className="tabular-nums text-fg">{n}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-body">{POINTS.win} points claims the isle.</p>
      </div>
    </div>
  );
}
