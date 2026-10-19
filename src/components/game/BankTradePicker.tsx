import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { harborRate } from "@/lib/game/rules";
import { play } from "@/lib/sound";
import { RESOURCES, RESOURCE_LABEL, type GameState, type PlayerState, type Resource } from "@/lib/game/types";
import { ClaySymbol, GrainSymbol, OreSymbol, TimberSymbol, WoolSymbol } from "./ResourceSymbols";

const ICON = { timber: TimberSymbol, clay: ClaySymbol, wool: WoolSymbol, grain: GrainSymbol, ore: OreSymbol };

// Table quantities and bank choices share a lazy resource picker chunk.
export function TradeResource({ resource, value, owned, side, canMore, onChange }: {
  resource: Resource; value: number; owned: number; side: "give" | "want";
  canMore: boolean; onChange: (n: number) => void;
}) {
  const Icon = ICON[resource];
  const add = useRef<HTMLButtonElement>(null);
  const removing = useRef(false);
  const id = `trade-${side}-${resource}`;
  useEffect(() => {
    if (value === 0 && removing.current) {
      removing.current = false;
      if (add.current?.disabled) add.current.closest<HTMLElement>('[role="tabpanel"]')?.focus();
      else add.current?.focus();
    }
  }, [value]);
  return <div className="trade-resource" data-selected={value > 0 || undefined} data-testid={id}>
    <button ref={add} className="trade-add" aria-label={`More ${RESOURCE_LABEL[resource]} to ${side}`} aria-describedby={`${id}-owned ${id}-count`} disabled={!canMore} onClick={() => { play("ui_click"); onChange(value + 1); }}>
      <Icon aria-hidden="true" className="size-5" />
      <span className="trade-resource-name">{RESOURCE_LABEL[resource]}</span>
      <span id={`${id}-owned`} className="trade-owned" data-testid="trade-owned">Have {owned}</span>
      <output id={`${id}-count`} aria-label={`${RESOURCE_LABEL[resource]} to ${side}`} className="trade-quantity">{value}</output>
      <Plus aria-hidden="true" className="size-3" />
    </button>
    {value > 0 ? <button className="trade-remove" aria-label={`Fewer ${RESOURCE_LABEL[resource]} to ${side}`} aria-describedby={`${id}-count`} onFocus={() => { removing.current = true; }} onBlur={() => { removing.current = false; }} onClick={() => {
      play("ui_click");
      if (value === 1) add.current?.focus();
      onChange(value - 1);
    }}><span aria-hidden="true">−</span></button> : null}
    {value > 0 ? <span key={value} aria-hidden="true" className={`trade-selection-motion trade-selection-${side}`} data-testid="trade-selection-motion">{side === "give" ? "−" : "+"}{value}</span> : null}
  </div>;
}

export function BankTradePicker({ state, player, give, want, onGive, onWant }: {
  state: GameState; player: PlayerState; give: Resource | null; want: Resource | null;
  onGive: (r: Resource) => void; onWant: (r: Resource) => void;
}) {
  return <>
    <p className="trade-instructions">Choose one good on each side. Your best bank or dock rate sets the amount.</p>
    {(["give", "want"] as const).map((side) => <section key={side} className="trade-half" aria-labelledby={`bank-${side}-title`}>
      <h3 id={`bank-${side}-title`}>{side === "give" ? "You give" : "You get"}</h3>
      <div className="trade-resource-grid" role="radiogroup" aria-labelledby={`bank-${side}-title`}>
        {RESOURCES.map((r) => {
          const Icon = ICON[r];
          const selected = (side === "give" ? give : want) === r;
          const disabled = (side === "give" ? want : give) === r;
          const id = `bank-${side}-${r}`;
          return <button key={r} role="radio" aria-checked={selected} aria-label={`${RESOURCE_LABEL[r]} to ${side}`} aria-describedby={`${id}-owned ${id}-rate`} disabled={disabled}
            tabIndex={selected || !(side === "give" ? give : want) && r === RESOURCES.find((good) => good !== (side === "give" ? want : give)) ? 0 : -1}
            className="trade-resource trade-bank-choice" data-selected={selected || undefined} data-testid={`bank-${side}-${r}`}
            onClick={() => { play("ui_click"); (side === "give" ? onGive : onWant)(r); }} onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
              e.preventDefault();
              const choices = RESOURCES.filter((good) => good !== (side === "give" ? want : give));
              const index = choices.indexOf(r);
              const next = e.key === "Home" ? choices[0]! : e.key === "End" ? choices.at(-1)! : choices[(index + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + choices.length) % choices.length]!;
              (side === "give" ? onGive : onWant)(next);
              e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-testid="bank-${side}-${next}"]`)?.focus();
            }}>
            <Icon aria-hidden="true" className="size-5" />
            <span className="trade-resource-name">{RESOURCE_LABEL[r]}</span>
            <span id={`${id}-owned`} className="trade-owned">{side === "give" ? `Have ${player.resources[r]}` : `Bank ${state.bank[r]}`}</span>
            <span id={`${id}-rate`} className="trade-quantity">{side === "give" ? `${harborRate(state, player.id, r)}:1` : "1"}</span>
          </button>;
        })}
      </div>
    </section>)}
  </>;
}
