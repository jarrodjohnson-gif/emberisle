// Jarrod (playtest): "need some sort of indication on when you are eligible for building something." A build's cost as one
// small chip per good, painted like its hand card (#436), so the build button and the Costs card say the same thing from
// the same COST table. As on the board game's card, a chip alone means one and carries its count only above that. With a
// hand, a good the hand is short of dims and carries the shortfall, so a touch screen sees what is missing without a hover.
import { RESOURCE_ICON, RESOURCE_PAINT } from "@/components/game/Hand";
import { COST, RESOURCES, type Resource } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export type Price = keyof typeof COST;

export const PRICE_NAME: Record<Price, string> = { path: "Path", outpost: "Outpost", stronghold: "Stronghold", card: "Fortune" };

// "Path · 1 timber, 1 clay": the read-out behind the chips.
export function priceLabel(kind: Price) {
  return `${PRICE_NAME[kind]} · ${RESOURCES.filter((r) => COST[kind][r]).map((r) => `${COST[kind][r]} ${r}`).join(", ")}`;
}

// The goods a hand is short of for a build, each with how many; empty when it can pay.
export function shortfall(hand: Record<Resource, number>, kind: Price): Partial<Record<Resource, number>> {
  const short: Partial<Record<Resource, number>> = {};
  for (const r of RESOURCES) {
    const n = (COST[kind][r] ?? 0) - hand[r];
    if (n > 0) short[r] = n;
  }
  return short;
}

export function CostChips({ kind, hand, className }: { kind: Price; hand?: Record<Resource, number>; className?: string }) {
  const short = hand ? shortfall(hand, kind) : {};
  return (
    <span aria-hidden className={cn("inline-flex items-center gap-1", className)}>
      {RESOURCES.filter((r) => COST[kind][r]).map((r) => {
        const Icon = RESOURCE_ICON[r];
        const missing = short[r];
        return (
          <span key={r} data-testid={`cost-${kind}-${r}`} data-short={missing} className="inline-flex items-center gap-0.5">
            <span
              className={cn(
                "inline-flex h-5 items-center gap-0.5 rounded-[6px] px-1 text-caption tabular-nums ring-1 ring-inset ring-black/10",
                RESOURCE_PAINT[r],
                missing && "opacity-40",
              )}
            >
              <Icon className="size-3" />
              {(COST[kind][r] ?? 0) > 1 ? COST[kind][r] : null}
            </span>
            {missing ? <span className="text-caption tabular-nums text-danger">−{missing}</span> : null}
          </span>
        );
      })}
    </span>
  );
}
