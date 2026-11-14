import { useEffect, useRef, type ReactNode } from "react";
import { play } from "@/lib/sound";
import { RESOURCE_LABEL, type Resource } from "@/lib/game/types";
import { ClaySymbol, GrainSymbol, OreSymbol, TimberSymbol, WoolSymbol } from "./ResourceSymbols";

const ICON = { timber: TimberSymbol, clay: ClaySymbol, wool: WoolSymbol, grain: GrainSymbol, ore: OreSymbol };

// #1537: one Give or Get token; the tray's discard picker uses it too (side "discard": red, with the count held). Tap, Enter, Space or "+" adds one; long press, right click, "-" or the minus button takes one away.
export function TradeResource({ resource, value, owned, side, canMore, onChange, children }: {
  resource: Resource; value: number; owned: number; side: "give" | "want" | "discard";
  canMore: boolean; onChange: (n: number) => void; children?: ReactNode;
}) {
  const Icon = ICON[resource];
  const add = useRef<HTMLButtonElement>(null);
  const removing = useRef(false);
  const timer = useRef(0);
  const held = useRef(false);
  const id = `trade-${side}-${resource}`;
  const name = RESOURCE_LABEL[resource];
  const more = () => { if (canMore) { play("ui_click"); onChange(value + 1); } };
  const less = () => { if (value) { play("ui_click"); onChange(value - 1); } };
  const stop = () => clearTimeout(timer.current);
  useEffect(() => {
    if (value === 0 && removing.current) {
      removing.current = false;
      if (add.current?.disabled) add.current.closest<HTMLElement>('[role="region"]')?.focus();
      else add.current?.focus();
    }
  }, [value]);
  return <div className={`trade-resource trade-side-${side} goods-${resource}`} data-selected={value > 0 || undefined} data-testid={id}>
    <button ref={add} className="trade-add" aria-label={`More ${name} to ${side}`} aria-describedby={side !== "want" ? `${id}-owned ${id}-count` : `${id}-count`}
      disabled={!canMore && !value} aria-disabled={!canMore || undefined}
      onClick={() => { if (held.current) held.current = false; else more(); }}
      onKeyDown={(e) => { if (e.key === "-") less(); else if (e.key === "+") more(); }}
      onPointerDown={() => { held.current = false; stop(); timer.current = window.setTimeout(() => { held.current = true; less(); }, 500); }}
      onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onContextMenu={(e) => { e.preventDefault(); stop(); if (!held.current) less(); held.current = true; }}>
      <Icon aria-hidden="true" className="size-5" />
      {side !== "want"
        ? <span id={`${id}-owned`} className="trade-owned" data-testid="trade-owned"><span className="sr-only">Have </span>{owned}</span>
        : <span className="trade-resource-name">{name}</span>}
      <output id={`${id}-count`} aria-label={`${name} to ${side}`} className="sr-only">{value}</output>
    </button>
    {value > 0 ? <span aria-hidden="true" className="trade-badge" data-testid="trade-badge">{side === "want" ? "+" : "−"}{value}</span> : null}
    {value > 0 ? <button className="trade-remove" data-testid={`trade-minus-${side}-${resource}`} aria-label={`Fewer ${name} to ${side}`} aria-describedby={`${id}-count`} onFocus={() => { removing.current = true; }} onBlur={() => { removing.current = false; }} onClick={() => {
      if (value === 1) add.current?.focus();
      less();
    }}><span aria-hidden="true">−</span></button> : null}
    {children}
  </div>;
}
