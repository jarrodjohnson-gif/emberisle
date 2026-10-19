// The trade panel (docs/BUILD_BIBLE.md 4.4): "I give" and "I want" steppers, Ask the table, and the one bank or dock rate you hold.
import { useEffect, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/lib/focus-trap";
import { harborRate } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { RESOURCES, RESOURCE_LABEL, type Resource } from "@/lib/game/types";
import { play } from "@/lib/sound";
import { bagText } from "@/lib/game/trade";
import { ClaySymbol, GrainSymbol, OreSymbol, TimberSymbol, WoolSymbol } from "./ResourceSymbols";
import "./trade-panel.css";
import { NeedPicker } from "./SeatNeeds";

const ICON = { timber: TimberSymbol, clay: ClaySymbol, wool: WoolSymbol, grain: GrainSymbol, ore: OreSymbol };

const ZERO: Record<Resource, number> = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
const kinds = (bag: Record<Resource, number>) => RESOURCES.filter((r) => bag[r] > 0);

// Each resource keeps its name, owned count, and 44 px controls together.
function Stepper({ resource, value, owned, side, canMore, onChange }: {
  resource: Resource; value: number; owned: number; side: "give" | "want";
  canMore: boolean; onChange: (n: number) => void;
}) {
  const Icon = ICON[resource];
  return (
    <div className="trade-resource" data-selected={value > 0 || undefined} data-testid={`trade-${side}-${resource}`}>
      <Icon aria-hidden="true" className="size-5" />
      <span className="trade-resource-name">{RESOURCE_LABEL[resource]}</span>
      <span className="trade-owned" data-testid="trade-owned">Have {owned}</span>
      <div className="trade-stepper">
        <Button variant="ghost" size="icon" aria-label={`Fewer ${RESOURCE_LABEL[resource]} to ${side}`} disabled={value === 0} onClick={() => onChange(value - 1)}>
          <Minus className="size-4" />
        </Button>
        <output aria-label={`${RESOURCE_LABEL[resource]} to ${side}`} className="trade-quantity">{value}</output>
        <Button variant="ghost" size="icon" aria-label={`More ${RESOURCE_LABEL[resource]} to ${side}`} disabled={!canMore} onClick={() => onChange(value + 1)}>
          <Plus className="size-4" />
        </Button>
      </div>
      {value > 0 ? <span key={value} aria-hidden="true" className={`trade-selection-motion trade-selection-${side}`} data-testid="trade-selection-motion">{value}</span> : null}
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
  const [draftGive, setGive] = useState(ZERO);
  const [want, setWant] = useState(ZERO);
  const panel = useRef<HTMLElement>(null);

  const actor = mode === "hotseat" ? state?.current : localId;
  const me = state?.players.find((p) => p.id === actor);
  const mine = Boolean(state && me && state.phase === "main" && state.current === actor);
  const shown = open && mine;

  // Clamp both the rendered offer and its draft when a live hand loses goods.
  const give = { ...draftGive };
  for (const r of RESOURCES) give[r] = Math.min(give[r], me?.resources[r] ?? 0);
  useEffect(() => {
    if (!me) return;
    setGive((old) => {
      const next = { ...old };
      for (const r of RESOURCES) next[r] = Math.min(next[r], me.resources[r]);
      return RESOURCES.some((r) => next[r] !== old[r]) ? next : old;
    });
  }, [me?.resources]);

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
  const asking = giving.length > 0 && wanting.length > 0;

  // The bank and the docks take one kind for one other kind, at the best rate a building of yours earns.
  const g = giving.length === 1 ? giving[0]! : null;
  const w = wanting.length === 1 ? wanting[0]! : null;
  const rate = g ? harborRate(state, me.id, g) : null;
  const bankLabel = rate === null ? "Bank" : rate === 4 ? "Bank 4:1" : `Dock ${rate}:1`;
  const bankWhy = !g || !w
    ? "Choose one kind on each side for a bank or dock exchange."
    : me.resources[g] < rate!
      ? `Need ${rate} ${RESOURCE_LABEL[g].toLowerCase()} for the ${rate === 4 ? "bank" : "dock"}.`
      : state.bank[w] <= 0
        ? `The bank has no ${RESOURCE_LABEL[w].toLowerCase()}.`
        : null;
  const bankHint = bankWhy ?? `You give ${rate} ${RESOURCE_LABEL[g!].toLowerCase()}. You get 1 ${RESOURCE_LABEL[w!].toLowerCase()}.`;

  const bank = () => {
    if (!g || !w || bankWhy) return;
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
        className="trade-composer"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="trade-composer-header">
          <h2 id="trade-title" className="font-display text-2xl">Trade</h2>
          <Button variant="ghost" size="icon" onClick={() => setTradeOpen(false)} aria-label="Close" back>
            <X className="size-4" />
          </Button>
        </header>

        <div className="trade-composer-scroll">
          <NeedPicker player={me.id} />
          <p className="trade-instructions">Choose goods below. You can mix goods when trading with players.</p>
          {(["give", "want"] as const).map((side) => {
            const bag = side === "give" ? give : want;
            return (
              <section key={side} className="trade-half" data-testid={`trade-${side}-row`} aria-labelledby={`trade-${side}-title`}>
                <h3 id={`trade-${side}-title`}>{side === "give" ? "You give" : "You get"}</h3>
                <div className="trade-resource-grid">
                  {RESOURCES.map((r) => (
                    <Stepper key={r} resource={r} side={side} owned={me.resources[r]} value={bag[r]}
                      canMore={side === "give" ? give[r] < me.resources[r] && want[r] === 0 : want[r] < 19 && give[r] === 0}
                      onChange={(n) => side === "give" ? setGive({ ...give, [r]: n }) : setWant({ ...want, [r]: n })}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="trade-composer-footer">
          {mode !== "hotseat" ? (
            <div className="trade-route">
              <h3>With players</h3>
              <p className="trade-exact-preview" data-testid="trade-player-preview" aria-live="polite">
                <span>You give: {bagText(give) || "choose goods"}</span>
                <span>You get: {bagText(want) || "choose goods"}</span>
              </p>
              <Button className="h-11 w-full" disabled={!asking} onClick={() => askTable(give, want)}>Ask the table</Button>
            </div>
          ) : null}
          <div className="trade-route">
            <h3>Bank &amp; docks · one exchange</h3>
            <p className="trade-exact-preview" data-testid="trade-hint">{bankHint}</p>
            <Button variant="secondary" className="h-11 w-full" disabled={bankWhy !== null} onClick={bank}>{bankLabel}</Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
