import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { play } from "@/lib/sound";
import { RESOURCE_LABEL, type Resource } from "@/lib/game/types";
import { ClaySymbol, GrainSymbol, OreSymbol, TimberSymbol, WoolSymbol } from "./ResourceSymbols";

const ICON = { timber: TimberSymbol, clay: ClaySymbol, wool: WoolSymbol, grain: GrainSymbol, ore: OreSymbol };

// One lazy quantity-card component supplies the shared Table and Bank draft.
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
      if (add.current?.disabled) add.current.closest<HTMLElement>('[role="region"]')?.focus();
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
