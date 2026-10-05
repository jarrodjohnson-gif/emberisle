// The trade panel (docs/BUILD_BIBLE.md 4.4): "I give" and "I want" steppers, Ask the table, and the one bank or dock rate you hold.
import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/lib/focus-trap";
import { harborRate } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { RESOURCES, RESOURCE_LABEL, type Resource } from "@/lib/game/types";
import { play } from "@/lib/sound";
import type { Bag } from "@/lib/net/table";

// "2 wool, 1 grain" in the README's words, or "" for an empty bag.
export function bagText(bag: Bag) {
  return RESOURCES.filter((r) => (bag[r] ?? 0) > 0)
    .map((r) => `${bag[r]} ${r}`)
    .join(", ");
}

const ZERO: Record<Resource, number> = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
const kinds = (bag: Record<Resource, number>) => RESOURCES.filter((r) => bag[r] > 0);

export function TradeButton() {
  const setTradeOpen = useGame((s) => s.setTradeOpen);
  return (
    <Button size="sm" variant="secondary" onClick={(e) => setTradeOpen(true, e.currentTarget)}>
      <ArrowLeftRight className="size-4" /> Trade
    </Button>
  );
}

// 44 px targets, so the steppers work under a thumb (docs/design/mobile-hud.md).
function Stepper({ label, value, canMore, onChange }: { label: string; value: number; canMore: boolean; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="secondary" className="size-11 p-0" aria-label={`Fewer ${label}`} disabled={value === 0} onClick={() => onChange(value - 1)}>
        <Minus className="size-4" />
      </Button>
      <span className="w-6 text-center tabular-nums text-sm font-medium">{value}</span>
      <Button variant="secondary" className="size-11 p-0" aria-label={`More ${label}`} disabled={!canMore} onClick={() => onChange(value + 1)}>
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

export function TradePanel() {
  const open = useGame((s) => s.tradeOpen);
  const setTradeOpen = useGame((s) => s.setTradeOpen);
  const state = useGame((s) => s.state);
  const localId = useGame((s) => s.localId);
  const mode = useGame((s) => s.mode);
  const dispatch = useGame((s) => s.dispatch);
  const askTable = useGame((s) => s.askTable);
  const opener = useGame((s) => s.tradeOpener);
  const [give, setGive] = useState(ZERO);
  const [want, setWant] = useState(ZERO);
  const panel = useRef<HTMLElement>(null);

  const actor = mode === "hotseat" ? state?.current : localId;
  const me = state?.players.find((p) => p.id === actor);
  const mine = Boolean(state && me && state.phase === "main" && state.current === actor);
  const shown = open && mine;

  // #378: a modal dialog. Focus lands on Close (the first focusable), Tab cycles inside, and focus goes back to the opener on close.
  useFocusTrap(panel, shown, undefined, opener);

  useEffect(() => {
    // The turn moved on (or the game ended) with the panel up: drop it rather than pop it on the next turn.
    if (open && !mine) setTradeOpen(false);
  }, [open, mine, setTradeOpen]);
  useEffect(() => {
    if (open) return;
    setGive(ZERO);
    setWant(ZERO);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      play("ui_back");
      setTradeOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, setTradeOpen]);

  if (!shown || !state || !me) return null;

  const giving = kinds(give);
  const wanting = kinds(want);
  const asking = giving.length + wanting.length > 0;

  // The bank and the docks take one kind for one other kind, at the best rate a building of yours earns.
  const g = giving.length === 1 ? giving[0]! : null;
  const w = wanting.length === 1 ? wanting[0]! : null;
  const rate = g ? harborRate(state, me.id, g) : null;
  const bankLabel = rate === null ? "Bank" : rate === 4 ? "Bank 4:1" : `Dock ${rate}:1`;
  const bankWhy = !g || !w
    ? "Pick one kind to give and one to want."
    : me.resources[g] < rate!
      ? `Need ${rate} ${g} for the ${rate === 4 ? "bank" : "dock"}.`
      : state.bank[w] <= 0
        ? `The bank has no ${w}.`
        : null;
  const bankHint = bankWhy ?? `${rate} ${g} for 1 ${w}`;

  const bank = () => {
    if (!g || !w) return;
    if (dispatch({ type: "bankTrade", give: g, want: w }).ok) setTradeOpen(false);
  };

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-white/45 p-safe sm:items-center" onClick={() => setTradeOpen(false)}>
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-title"
        data-testid="trade-panel"
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-[28px] border border-white/50 bg-surface p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="trade-title" className="font-display text-2xl">
            Trade
          </h2>
          <Button variant="ghost" size="icon" onClick={() => setTradeOpen(false)} aria-label="Close" back>
            <X className="size-4" />
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1">
          <span />
          <span className="text-center text-xs uppercase tracking-wide text-zinc-600">I give</span>
          <span className="text-center text-xs uppercase tracking-wide text-zinc-600">I want</span>
          {RESOURCES.map((r) => (
            <div key={r} className="contents">
              <span className="text-sm">
                {RESOURCE_LABEL[r]}
                <span className="ml-1 tabular-nums text-xs text-zinc-600">×{me.resources[r]}</span>
              </span>
              <Stepper
                label={`${r} to give`}
                value={give[r]}
                canMore={give[r] < me.resources[r] && want[r] === 0}
                onChange={(n) => setGive({ ...give, [r]: n })}
              />
              <Stepper label={`${r} to want`} value={want[r]} canMore={want[r] < 19 && give[r] === 0} onChange={(n) => setWant({ ...want, [r]: n })} />
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* Practice asks its bots (#363). Hotseat deals no bots, and its people share the one screen. */}
          {mode !== "hotseat" ? (
            <Button className="h-11 flex-1" disabled={!asking} onClick={() => askTable(give, want)}>
              Ask the table
            </Button>
          ) : null}
          <Button variant="secondary" className="h-11 flex-1" disabled={bankWhy !== null} onClick={bank}>
            {bankLabel}
          </Button>
        </div>
        <p className="mt-2 text-xs text-zinc-600" data-testid="trade-hint">
          {bankHint}
        </p>
      </section>
    </div>
  );
}
