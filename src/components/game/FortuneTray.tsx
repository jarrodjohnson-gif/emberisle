// #423: the fortunes you hold, one row per kind with its count, what it does and its own Play, in a card that rises over the
// bottom stack when the Fortunes button is pressed (docs/design/polish.md: one thing at a time, hide complexity until asked).
// Plenty and Monopoly pick their goods here with resource chips; the wayfarer and the path fortune arm a pick on the board.
// Playing closes the tray. Names come from src/lib/game/fortunes.ts, the same set the seat menu's breakdown uses.
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RESOURCE_ICON, RESOURCE_PAINT } from "@/components/game/Hand";
import { useFocusTrap } from "@/lib/focus-trap";
import { FORTUNES } from "@/lib/game/fortunes";
import { legalRoads, playable } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { RESOURCES, RESOURCE_LABEL, type DevKind, type PlayerState, type Resource } from "@/lib/game/types";
import { play } from "@/lib/sound";
import { cn } from "@/lib/utils";

const CHIP = "h-11 min-w-11 flex-1 border-0 px-0 ring-1 ring-inset ring-black/10 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:active:scale-100";

// "Timber ×2" or "Timber and ore".
function pickText(picks: Resource[]) {
  if (picks.length === 2 && picks[0] === picks[1]) return `${RESOURCE_LABEL[picks[0]!]} ×2`;
  return picks.map((r, i) => (i ? r : RESOURCE_LABEL[r])).join(" and ");
}

function Chips({ kind, picks, bank, onPick }: { kind: "plenty" | "monopoly"; picks: Resource[]; bank: Record<Resource, number>; onPick: (r: Resource) => void }) {
  return (
    <div role="group" aria-label={kind === "plenty" ? "Goods to take" : "Kind to take"} className="flex gap-1">
      {RESOURCES.map((r) => {
        const Icon = RESOURCE_ICON[r];
        const n = picks.filter((x) => x === r).length;
        // The bank cannot pay what it has run out of (#360); rules.ts refuses it too. Monopoly takes from the seats, not the bank.
        const empty = kind === "plenty" && bank[r] - n <= 0;
        return (
          <Button
            key={r}
            variant="secondary"
            data-testid={`${kind}-chip-${r}`}
            aria-label={n ? `${RESOURCE_LABEL[r]}, picked${n > 1 ? ` ${n}` : ""}` : RESOURCE_LABEL[r]}
            aria-pressed={n > 0}
            aria-disabled={empty || undefined}
            aria-description={empty ? `The bank has no ${r}.` : undefined}
            className={cn(CHIP, RESOURCE_PAINT[r], n > 0 && "outline-2 outline-offset-2 outline-sea-ink")}
            onClick={() => {
              if (!empty) onPick(r);
            }}
          >
            <Icon className="size-4" aria-hidden />
            {n > 1 ? <span className="text-caption tabular-nums">×{n}</span> : null}
          </Button>
        );
      })}
    </div>
  );
}

export function FortuneTray({ me, opener, onClose, className }: { me: PlayerState; opener: HTMLElement | null; onClose: () => void; className?: string }) {
  const state = useGame((s) => s.state)!;
  const dispatch = useGame((s) => s.dispatch);
  const setBuildMode = useGame((s) => s.setBuildMode);
  const root = useRef<HTMLElement>(null);
  const [plenty, setPlenty] = useState<Resource[]>([]);
  const [monopoly, setMonopoly] = useState<Resource | null>(null);

  // #378: focus lands on Close, Tab cycles inside, and goes back to the Fortunes button on close. Esc or a press outside closes.
  useFocusTrap(root, true, undefined, opener);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      play("ui_back");
      onClose();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (root.current?.contains(t) || opener?.contains(t)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose, opener]);

  // A pick the bank empties while the tray is open is dropped, so Play waits for two the bank can still pay (#412).
  const bank = state.bank;
  const picks = plenty.filter((r, i) => bank[r] > plenty.slice(0, i).filter((x) => x === r).length);
  const bankEmpty = RESOURCES.every((r) => bank[r] <= 0);

  // Why a kind cannot be played right now; null when it can. Points are never played: they count at the end.
  const blocked = (kind: DevKind): string | null => {
    if (playable(me, kind) <= 0) return "Bought this turn";
    if (state.playedCard) return "One fortune a turn";
    if (state.phase !== "main") return kind === "knight" ? null : "After the roll";
    if (kind === "road" && (me.pathsLeft <= 0 || legalRoads(state, me.id, false).length === 0)) return "No path to lay";
    if (kind === "plenty" && bankEmpty) return "The bank is empty";
    return null;
  };
  const act = (kind: DevKind) => {
    if (kind === "knight" || kind === "road") {
      setBuildMode(kind === "knight" ? "knight" : "roadCard");
      return onClose();
    }
    const r =
      kind === "plenty"
        ? picks.length === 2 && dispatch({ type: "playPlenty", resources: picks })
        : kind === "monopoly" && monopoly && dispatch({ type: "playMonopoly", resource: monopoly });
    if (r && r.ok) onClose();
  };

  return (
    <section
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fortune-title"
      data-testid="fortune-tray"
      className={cn("hand-in pointer-events-auto absolute inset-x-0 bottom-0 flex max-w-md flex-col gap-2 overflow-y-auto rounded-[24px] bg-surface p-3 shadow-[0_8px_32px_rgb(28_25_21/0.18)]", className)}
    >
      <div className="flex items-center justify-between gap-3 pl-1">
        <h2 id="fortune-title" className="text-title">
          Fortunes
        </h2>
        <Button variant="ghost" className="size-11 p-0" onClick={onClose} aria-label="Close" back>
          <X className="size-4" />
        </Button>
      </div>
      <ul className="flex flex-col gap-1">
        {FORTUNES.filter(({ kind }) => me.hidden[kind] > 0).map(({ kind, name, effect }) => {
          const why = kind === "vp" ? null : blocked(kind);
          const open = why === null;
          // Plenty waits for two picks and Monopoly for one; the others play on the press.
          const ready = kind === "plenty" ? picks.length === 2 : kind === "monopoly" ? monopoly !== null : true;
          return (
            <li key={kind} data-testid={`fortune-row-${kind}`} className="flex flex-col gap-2 rounded-[12px] bg-raised p-2 pl-3 ring-1 ring-inset ring-black/10">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-body">
                    <span className="capitalize">{name}</span> <span className="tabular-nums text-muted">×{me.hidden[kind]}</span>
                  </p>
                  <p className="text-caption text-muted">{effect}</p>
                  {why ? (
                    <p data-testid="fortune-blocked" className="text-caption text-danger">
                      {why}
                    </p>
                  ) : null}
                </div>
                {kind === "vp" ? null : (
                  <Button
                    variant={open && ready ? "primary" : "secondary"}
                    data-testid={`fortune-play-${kind}`}
                    className="h-11 min-w-16 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:active:scale-100"
                    aria-disabled={!open || !ready || undefined}
                    aria-description={why ?? undefined}
                    onClick={() => {
                      if (open && ready) act(kind);
                    }}
                  >
                    Play
                  </Button>
                )}
              </div>
              {open && kind === "plenty" ? (
                <>
                  <Chips kind="plenty" picks={picks} bank={bank} onPick={(r) => setPlenty([...picks, r].slice(-2))} />
                  <p data-testid="plenty-picks" className="text-caption text-muted">
                    {picks.length ? pickText(picks) : "Tap two goods"}
                  </p>
                </>
              ) : null}
              {open && kind === "monopoly" ? (
                <>
                  <Chips kind="monopoly" picks={monopoly ? [monopoly] : []} bank={bank} onPick={setMonopoly} />
                  <p data-testid="monopoly-pick" className="text-caption text-muted">
                    {monopoly ? `Every seat's ${monopoly}` : "Tap a kind"}
                  </p>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
