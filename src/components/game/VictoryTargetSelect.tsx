import { Button } from "@/components/ui/button";
import type { VictoryTarget } from "@/lib/game/types";

// A public table rule. The same compact control is used before the first game and before a rematch.
export function VictoryTargetSelect({ value, onChange, label = "Win at" }: { value: VictoryTarget; onChange?: (value: VictoryTarget) => void; label?: string }) {
  return (
    <div data-testid="victory-target" data-value={value} aria-live={onChange ? undefined : "polite"} className="flex h-11 shrink-0 items-center gap-1 text-xs text-muted">
      <span>{label}{onChange ? "" : ` ${value} points`}</span>
      {onChange ? <div role="radiogroup" aria-label="Victory target" className="flex gap-1">
        {([7, 10] as const).map((n) => <Button
          key={n} role="radio" aria-label={`${n} points`} aria-checked={value === n} tabIndex={value === n ? 0 : -1}
          variant="secondary" className="size-11 p-0 tabular-nums aria-checked:border-fg aria-checked:font-bold aria-checked:underline aria-checked:underline-offset-4"
          onClick={() => onChange(n)}
          onKeyDown={(e) => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
            e.preventDefault();
            const group = e.currentTarget.parentElement;
            const next = e.key === "Home" ? 7 : e.key === "End" ? 10 : n === 7 ? 10 : 7;
            onChange(next);
            group?.querySelector<HTMLButtonElement>(`[aria-label="${next} points"]`)?.focus();
          }}
        >{n}</Button>)}
      </div> : null}
    </div>
  );
}
