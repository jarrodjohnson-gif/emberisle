// Jarrod (playtest): "need some sort of indication on when you are eligible for building something." A build's cost as one
// small chip per good, painted like its hand card (#436), so the build button and the Costs card say the same thing from
// the same COST table. As on the board game's card, a chip alone means one and carries its count only above that. With a
// hand, a good the hand is short of dims and carries the shortfall, so a touch screen sees what is missing without a hover;
// the build tile passes the hand whenever it reads missing goods (#606), ringing each lacking good in #b23a2e.
import { RESOURCE_ICON, RESOURCE_PAINT } from "@/components/game/Hand";
import { legalCities, legalRoads, legalSettle } from "@/lib/game/rules";
import { COST, RESOURCES, RESOURCE_LABEL, type GameState, type PlayerState, type Resource } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export type Price = keyof typeof COST;

export const PRICE_NAME: Record<Price, string> = { path: "Path", outpost: "Outpost", stronghold: "Stronghold", card: "Fortune" };

// "Path · 1 wood, 1 brick": the read-out behind the chips.
export function priceLabel(kind: Price) {
  const name = PRICE_NAME[kind] ?? (typeof kind === "string" ? kind : "Build");
  const cost = COST[kind];
  if (!cost) return name;
  const items = RESOURCES.filter((r) => cost[r]).map((r) => `${cost[r]} ${RESOURCE_LABEL[r]?.toLowerCase() ?? r}`);
  return items.length > 0 ? `${name} · ${items.join(", ")}` : name;
}

// The goods a hand is short of for a build, each with how many; empty when it can pay.
export function shortfall(hand?: Partial<Record<Resource, number>> | null, kind?: Price): Partial<Record<Resource, number>> {
  const short: Partial<Record<Resource, number>> = {};
  if (!kind || !COST[kind]) return short;
  for (const r of RESOURCES) {
    const cost = COST[kind][r] ?? 0;
    const have = typeof hand?.[r] === "number" && Number.isFinite(hand[r]) ? Math.max(0, Math.floor(hand[r] as number)) : 0;
    const n = cost - have;
    if (n > 0) short[r] = n;
  }
  return short;
}

// Whether a build can happen now and, if not, why: the supply (or the deck), then a legal spot; a spot with a hand that cannot pay is missing goods (#606).
export function buildStatus(state: GameState, me: PlayerState, kind: Price) {
  const short = shortfall(me?.resources, kind);
  const missing = Object.values(short).reduce((a, b) => a + (Number.isFinite(b) ? (b as number) : 0), 0);
  const leftMap = {
    path: me?.pathsLeft,
    outpost: me?.outpostsLeft,
    stronghold: me?.strongholdsLeft,
    card: state?.deckLeft ?? state?.deck?.length ?? 0,
  };
  const rawLeft = kind in leftMap ? leftMap[kind] : 0;
  const left = typeof rawLeft === "number" && Number.isFinite(rawLeft) ? rawLeft : 0;
  const spot = () =>
    !state || !me
      ? false
      : kind === "path"
      ? legalRoads(state, me.id, false).length > 0
      : kind === "outpost"
      ? legalSettle(state, me.id, false).length > 0
      : kind === "stronghold"
      ? legalCities(state, me.id).length > 0
      : true;
  const why = left <= 0 ? "None left" : spot() ? null : "No spot";
  return { short, missing, why, ready: !why && !missing };
}

const need = (short: Partial<Record<Resource, number>>, more: string, sep: string) => {
  const parts = RESOURCES
    .filter((r) => typeof short?.[r] === "number" && (short[r] as number) > 0)
    .map((r) => `${short[r]} ${more}${RESOURCE_LABEL[r]?.toLowerCase() ?? r}`);
  return parts.length > 0 ? `Need ${parts.join(sep)}` : "Need nothing";
};

// "Need 1 more ore", "Need 3 more wheat and 2 more ore": what a refused tap on a short build says.
export const needLine = (short: Partial<Record<Resource, number>>) => need(short, "more ", " and ");

// "Need 1 brick", "Need 1 brick, 1 sheep": the chip a tap on a short build shows above it (#535).
export const hintLine = (short: Partial<Record<Resource, number>>) => need(short, "", ", ");

export function CostChips({ kind, hand, className }: { kind: Price; hand?: Record<Resource, number>; className?: string }) {
  const cost = COST[kind];
  if (!cost) return null;
  const short = hand ? shortfall(hand, kind) : {};
  return (
    <span aria-hidden className={cn("inline-flex items-center gap-0.5", className)}>
      {RESOURCES.filter((r) => cost[r]).map((r) => {
        const Icon = RESOURCE_ICON[r];
        const missing = short[r];
        return (
          <span key={r} data-testid={`cost-${kind}-${r}`} data-short={missing} className="relative inline-flex">
            <span
              className={cn(
                "inline-flex h-5 items-center gap-0.5 rounded-[6px] px-1 text-caption tabular-nums ring-1 ring-inset ring-black/10",
                RESOURCE_PAINT[r],
                missing && "ring-2 ring-[#b23a2e]",
              )}
            >
              <Icon className="size-3" />
              {(cost[r] ?? 0) > 1 ? cost[r] : null}
            </span>
            {/* A crimson badge (danger, not the orange ready dot) hung from the chip's top edge and flush with its right edge:
                it widens nothing and never crosses the next chip; it sits in the gap the build tile leaves under its label. */}
            {missing ? (
              <span className="absolute bottom-full right-0 translate-y-1 rounded-full bg-[#b23a2e] px-1 text-[9px] font-semibold leading-[10px] tabular-nums text-white">
                −{missing}
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
