// #748: the win screen's list, on every screen size (owner 2026-11-12, q1563-results-desktop), its own chunk (chunks.ts). One row per player; one opens at a time, scrolls to the top of the list and shows the breakdown.
import { useEffect, useRef, useState } from "react";
import { SeatDot } from "@/components/game/SeatDot";
import type { Row } from "@/components/game/WinScreen";
import { publicScoreBreakdown } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";

const pts = (n: number) => `${n} point${n === 1 ? "" : "s"}`;

export function WinList({ rows }: { rows: Row[] }) {
  const state = useGame((s) => s.state)!;
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const wrap = list.current!.parentElement!;
    const row = open && wrap.querySelector(`[aria-controls="win-part-${open}"]`);
    if (row) wrap.scrollTop += row.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
  }, [open]);
  return (
    <>
      <ul ref={list}>
        {rows.map((r) => {
          const id = r.p.id;
          const on = open === id;
          const parts = publicScoreBreakdown(state, id);
          const lines: [string, string | number, number, string?][] = [
            ["Outposts", r.outposts, parts.outposts],
            ["Strongholds", r.strongholds, parts.strongholds],
            ["Longest path", r.path ? "Yes" : "No", parts.longestPath],
            ["Largest army", r.army ? "Yes" : "No", parts.largestArmy],
            ["Hidden points", r.hiddenVp, r.total - Object.values(parts).reduce((a, b) => a + b, 0), "win-hidden"],
          ];
          return (
            <li key={id} className="border-border not-first:border-t">
              <h3>
                <button
                  type="button"
                  data-testid="win-row"
                  data-player={id}
                  aria-expanded={on}
                  aria-controls={`win-part-${id}`}
                  onClick={() => setOpen(on ? null : id)}
                  className="flex min-h-11 w-full items-center gap-2.5 pr-1.5 pl-2 text-left text-body text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sea-ink"
                >
                  <SeatDot color={r.p.color} className="size-3 flex-none" />
                  <span className={`min-w-0 flex-1 ${on ? "py-[11px]" : "truncate"}`}>
                    {r.p.name}
                    {r.note ? <span data-testid="win-profile" className="block truncate text-caption text-muted">{r.note}</span> : null}
                  </span>
                  {r.tag}
                  <span data-testid="win-total" className="flex-none text-xl font-bold tabular-nums">{r.total}</span>
                  <svg viewBox="0 0 20 20" aria-hidden="true" className={`size-5 flex-none text-muted ${on ? "rotate-180" : ""}`}>
                    <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </h3>
              <div id={`win-part-${id}`} role="region" aria-label={`${r.p.name}'s score`} data-player={id} hidden={!on} className="pr-9 pb-2.5 pl-[30px]">
                {r.award}
                <dl className="grid grid-cols-[1fr_auto_auto] gap-y-0.5 text-[13px] leading-5 text-muted">
                  {lines.map(([label, count, n, testId]) => (
                    <div key={label} className="contents">
                      <dt>{label}</dt>
                      <dd data-testid={testId} className="pl-4 text-right tabular-nums">{count}</dd>
                      <dd className="pl-4 text-right font-semibold tabular-nums text-fg">{pts(n)}</dd>
                    </div>
                  ))}
                  <div className="contents font-semibold text-fg [&>*]:border-t [&>*]:border-border [&>*]:pt-0.5">
                    <dt>Total</dt>
                    <dd />
                    <dd className="pl-4 text-right tabular-nums">{pts(r.total)}</dd>
                  </div>
                </dl>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
