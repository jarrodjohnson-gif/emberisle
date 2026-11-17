// One tray (#1539, docs/design/one-tray): the Build list. A sheet that rises from the tray with one row per build: its
// cost, and either a Place or Buy pill or the reason it cannot be built, in words. A row that can be built arms that build
// (or buys the fortune) and closes the sheet. Focus lands on Close and goes back to the Build button; Escape and a tap on
// the backdrop close it.
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildStatus, needLine, PRICE_NAME, priceLabel, type Price } from "@/components/game/BuildCost";
import { RESOURCE_ICON, RESOURCE_PAINT } from "@/components/game/Hand";
import { useBackdropClose } from "@/lib/backdrop-close";
import { useFocusTrap } from "@/lib/focus-trap";
import { useGame } from "@/lib/game/store";
import { COST, RESOURCES, type GameState, type PlayerState } from "@/lib/game/types";
import { play } from "@/lib/sound";
import { cn } from "@/lib/utils";

const NO_SPOT: Record<Price, string> = {
  path: "No free spot.",
  outpost: "No free spot. Build a path first.",
  stronghold: "No homes to upgrade.",
  card: "",
};

export function BuildList({ state, me, opener, onClose }: { state: GameState; me: PlayerState; opener: HTMLElement | null; onClose: () => void }) {
  const dispatch = useGame((s) => s.dispatch);
  const setBuildMode = useGame((s) => s.setBuildMode);
  const refuseQuietly = useGame((s) => s.refuseQuietly);
  const root = useRef<HTMLDivElement>(null);
  useFocusTrap(root, true, undefined, opener);
  const backdrop = useBackdropClose(onClose);
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
  const deckLeft = state.deckLeft ?? state.deck.length;
  return (
    <div className="build-wash absolute inset-0 z-30 flex items-end justify-center" {...backdrop}>
      <div ref={root} role="dialog" aria-modal="true" aria-labelledby="build-title" data-testid="build-list" className="tray-sheet flex max-h-[80dvh] w-full max-w-[520px] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <h2 id="build-title" className="text-[20px] font-bold leading-7">Build</h2>
          <Button variant="ghost" className="-mr-3 size-11 p-0" onClick={onClose} aria-label="Close" back>
            <X className="size-5" />
          </Button>
        </div>
        <ul className="min-h-0 overflow-y-auto">
          {(Object.keys(COST) as Price[]).map((kind) => {
            const { short, missing, why, ready } = buildStatus(state, me, kind);
            const reason = why === "None left" ? (kind === "card" ? "The deck is empty." : "None left.") : why ? NO_SPOT[kind] : missing ? `You n${needLine(short).slice(1)}` : null;
            return (
              <li key={kind}>
                <button
                  type="button"
                  data-testid={`build-${kind}`}
                  data-build={why ? "blocked" : ready ? "ready" : "short"}
                  data-build-state={why ? "nospot" : ready ? "ready" : "missing"}
                  aria-disabled={!ready || undefined}
                  aria-label={PRICE_NAME[kind]}
                  aria-description={`${priceLabel(kind)} · ${reason ?? (kind === "card" ? `Buy, ${deckLeft} left` : "Place")}`}
                  className="build-row"
                  onClick={() => {
                    // aria-disabled keeps the row focusable, so the click itself refuses: the error cue plays and the reason is read out.
                    if (!ready) return void refuseQuietly(reason!);
                    if (kind === "card") dispatch({ type: "buyCard" });
                    else setBuildMode(kind);
                    onClose();
                  }}
                >
                  <span className="min-w-0">
                    <b className="block text-[16px] font-semibold leading-6">{PRICE_NAME[kind]}</b>
                    {reason ? (
                      <span data-testid={`build-why-${kind}`} className={cn("block text-[13px] leading-5", missing && !why ? "font-semibold text-danger" : "text-muted")}>{reason}</span>
                    ) : (
                      <span aria-hidden className="flex items-center gap-1 pt-0.5">
                        {RESOURCES.filter((r) => COST[kind][r]).map((r) => {
                          const Icon = RESOURCE_ICON[r];
                          return (
                            <span key={r} data-testid={`cost-${kind}-${r}`} className={cn("inline-flex h-6 items-center gap-0.5 rounded-[6px] px-1 text-[13px] font-semibold tabular-nums", RESOURCE_PAINT[r])}>
                              <Icon className="size-5" />
                              {(COST[kind][r] ?? 0) > 1 ? COST[kind][r] : null}
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </span>
                  {ready ? (
                    <span aria-hidden className="build-pill">
                      {kind === "card" ? <>Buy · <span data-testid="deck-left">{deckLeft}</span> left</> : "Place"}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
