import { useEffect, useRef, useState } from "react";
import { VictoryTargetSelect } from "@/components/game/VictoryTargetSelect";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import { publicScoreBreakdown, totalVP, victoryTarget } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { useViewport } from "@/lib/viewport";
import { useFocusTrap } from "@/lib/focus-trap";

// Build bible 4.7: the island stays visible. "Look around" hides the panel and leaves a small chip.
export function WinScreen() {
  const winnerId = useGame((s) => s.state?.phase === "over" ? s.state.winner : null);
  return winnerId ? <Panel key={winnerId} /> : null;
}

function Panel() {
  const { phone, portrait } = useViewport();
  const state = useGame((s) => s.state)!;
  const target = useGame((s) => s.tableVictoryTarget);
  const setTarget = useGame((s) => s.setVictoryTarget);
  const goTitle = useGame((s) => s.goTitle);
  const playAgain = useGame((s) => s.playAgain);
  const sendSound = useGame((s) => s.sendSound);
  const [resting, setResting] = useState(false);
  const mode = useGame((s) => s.mode);
  const spectator = useGame((s) => s.spectator);
  // The lobby's host test (EmberisleApp), so a handed-off host gets the button.
  const isHost = useGame((s) => s.seats.find((x) => x.id === s.seatId)?.host ?? s.isHost);
  const hostName = useGame((s) => s.seats.find((x) => x.host)?.name);
  // docs/design/rematch.md: the online host and hotseat start another; practice has no table to keep.
  const canAgain = mode === "hotseat" || (mode === "online" && isHost);
  const waiting = mode === "online" && !isHost && !spectator && hostName;
  const [hidden, setHidden] = useState(false);
  const winner = state.players.find((p) => p.id === state.winner)!;
  const dialog = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // #748: on touch and narrow screens, one row per player; one opens at a time and scrolls to the top of the list.
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const row = open && wrap.current?.querySelector(`[aria-controls="win-part-${open}"]`);
    if (row) wrap.current!.scrollTop += row.getBoundingClientRect().top - wrap.current!.getBoundingClientRect().top;
  }, [open]);

  // #379: Tab stays inside the dialog; "Look around" hands focus to the chip so the keyboard does not land on the body.
  useFocusTrap(dialog, !hidden, '[data-testid="win-menu"]');
  useEffect(() => {
    if (hidden) {
      chip.current?.querySelector<HTMLElement>('[data-testid="win-show"]')?.focus();
      return;
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setHidden(true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden]);

  const rows = state.players
    .map((p) => {
      let outposts = 0;
      let strongholds = 0;
      for (const v of state.vertices) {
        if (v.building?.playerId !== p.id) continue;
        if (v.building.kind === "stronghold") strongholds++;
        else outposts++;
      }
      return {
        p,
        outposts,
        strongholds,
        path: state.longestRoad === p.id,
        army: state.largestArmy === p.id,
        hiddenVp: p.hidden.vp,
        parts: publicScoreBreakdown(state, p.id),
        total: totalVP(state, p.id),
      };
    })
    .sort((a, b) => Number(b.p.id === winner.id) - Number(a.p.id === winner.id) || b.total - a.total);

  if (hidden) {
    return (
      <div
        ref={chip}
        data-testid="win-chip"
        style={{ top: `calc(max(12px, env(safe-area-inset-top)) + ${phone && portrait && mode === "online" ? 96 : 48}px)` }}
        className="absolute left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-[20px] border border-border bg-surface p-1"
      >
        <Button size="sm" variant="secondary" className="whitespace-nowrap" data-testid="win-show" onClick={() => setHidden(false)}>
          Show scores
        </Button>
        {canAgain ? (
          <Button size="sm" className="whitespace-nowrap" data-testid="win-again-chip" onClick={playAgain}>
            Play again
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" className="whitespace-nowrap" data-testid="win-menu-chip" onClick={goTitle}>
          Back to menu
        </Button>
      </div>
    );
  }

  const winning = rows.find((r) => r.p.id === winner.id)!;
  const contribution = [
    winning.outposts ? `${winning.outposts} outpost${winning.outposts === 1 ? "" : "s"}` : null,
    winning.strongholds ? `${winning.strongholds * 2} stronghold points` : null,
    winning.path ? "2 longest path" : null,
    winning.army ? "2 largest army" : null,
    winning.hiddenVp ? `${winning.hiddenVp} hidden` : null,
  ].filter(Boolean);
  const reason = state.winReason;
  const action = {
    outpost: "Built an outpost",
    stronghold: "Upgraded to a stronghold",
    longestPath: "Took longest path (+2)",
    largestArmy: "Took largest army (+2)",
    pointFortune: "Drew a point fortune (+1)",
    turnStart: "Started their turn with winning points",
    points: "Reached the winning score",
  }[reason?.trigger ?? "points"];
  const head = "px-1 py-2 short:py-0.5 short:px-1 text-right text-[11px] sm:px-2 font-medium uppercase tracking-wide text-zinc-600";
  const cell = "px-1 py-2 short:py-0.5 short:px-1 sm:px-2 text-right tabular-nums whitespace-nowrap short:text-xs";
  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="win-headline"
      data-testid="win-screen"
      className="absolute inset-0 z-40 flex items-center justify-center bg-bg/60 p-safe"
    >
      <div className={`flex max-h-full w-full max-w-2xl flex-col rounded-sheet border border-border bg-surface p-5 text-center sm:p-6 short:px-4 ${phone ? "short:py-1" : "short:py-2"}`}>
        {/* #748: 480 px tall or less, the list needs room for four 44 px rows under the host's two-line actions (667x375 with insets). */}
        <div className={phone ? "short:flex short:items-center short:justify-center short:gap-3" : undefined}>
        <div className="flex items-center justify-center gap-2.5">
          <SeatDot color={winner.color} className="size-4" />
          <p id="win-headline" data-testid="win-headline" className="font-display text-3xl short:text-lg text-fg">
            {winner.name} wins
          </p>
        </div>
        <p className={`win-total-hero mt-3 ${phone ? "short:mt-0" : "short:mt-0.5"}`} data-testid="win-points">{winning.total}<span className="ml-2 text-body font-medium tracking-normal">points</span></p>
        </div>
        <p data-testid="win-action" className="mt-2 short:mt-0.5 text-sm short:text-xs text-muted">
          {action} · {reason?.points ?? winning.total} points, target {reason?.target ?? victoryTarget(state)}.
        </p>
        <div className={`win-equation ${phone ? "short:hidden!" : ""}`} data-testid="win-reason">{contribution.map((part, i) => <span key={part}>{i > 0 ? "+ " : ""}{part}</span>)}</div>
        <div ref={wrap} data-testid="win-table-wrap" className={`mt-4 min-h-0 ${phone ? "overflow-y-auto overflow-x-hidden border-t border-border pt-2 text-left short:mt-1 short:pt-0" : "overflow-auto short:mt-1.5"}`}>
          {phone ? (
            <>
              <p className="mb-1 text-caption text-muted short:hidden">Tap a player to see how they scored.</p>
              <ul>
                {rows.map((r) => {
                  const id = r.p.id;
                  const on = open === id;
                  const pts = (n: number) => `${n} point${n === 1 ? "" : "s"}`;
                  const lines: [string, string | number, number, string?][] = [
                    ["Outposts", r.outposts, r.parts.outposts],
                    ["Strongholds", r.strongholds, r.parts.strongholds],
                    ["Longest path", r.path ? "Yes" : "No", r.parts.longestPath],
                    ["Largest army", r.army ? "Yes" : "No", r.parts.largestArmy],
                    ["Hidden points", r.hiddenVp, r.total - Object.values(r.parts).reduce((a, b) => a + b, 0), "win-hidden"],
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
                          <span className={`min-w-0 flex-1 ${on ? "py-[11px]" : "truncate"}`}>{r.p.name}</span>
                          <span data-testid="win-total" className="flex-none text-xl font-bold tabular-nums">{r.total}</span>
                          <svg viewBox="0 0 20 20" aria-hidden="true" className={`size-5 flex-none text-muted ${on ? "rotate-180" : ""}`}>
                            <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </h3>
                      <div id={`win-part-${id}`} role="region" aria-label={`${r.p.name}'s score`} data-player={id} hidden={!on} className="pr-9 pb-2.5 pl-[30px]">
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
          ) : (
          <table className="w-full min-w-0 border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${head} text-left whitespace-nowrap`}>Player</th>
                <th className={head}>Outposts</th>
                <th className={head}>Strongholds</th>
                <th className={head}>Longest path</th>
                <th className={head}>Largest army</th>
                <th className={head}>Hidden</th>
                <th className={head}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.p.id} data-testid="win-row" data-player={r.p.id} className="border-t border-border">
                  <td className="px-1 py-2 short:py-0.5 short:px-1 text-left font-medium sm:px-2 whitespace-nowrap short:text-xs">
                    <SeatDot color={r.p.color} className="mr-1.5 size-3 align-[-2px]" />
                    {r.p.name}
                  </td>
                  <td className={cell}>{r.outposts}</td>
                  <td className={cell}>{r.strongholds}</td>
                  <td className={cell}>{r.path ? "✓" : ""}</td>
                  <td className={cell}>{r.army ? "✓" : ""}</td>
                  <td data-testid="win-hidden" className={cell}>{r.hiddenVp}</td>
                  <td data-testid="win-total" className={`${cell} font-medium`}>
                    {r.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
        {waiting ? (
          <p data-testid="win-waiting" className="mt-4 text-sm text-zinc-600">
            Waiting for {hostName} to start another.
          </p>
        ) : null}
        <div className={`mt-5 ${phone ? "short:mt-1" : "short:mt-2"} flex flex-wrap items-center gap-2`}>
          {mode === "online" ? <VictoryTargetSelect label="Next game" value={target} onChange={isHost && !spectator ? setTarget : undefined} /> : null}
          {mode === "online" && !spectator ? (
            <Button
              variant="secondary"
              className="min-w-fit flex-1 whitespace-nowrap"
              data-testid="win-react"
              disabled={resting}
              onClick={() => {
                sendSound("sb_win_reaction");
                setResting(true);
                window.setTimeout(() => setResting(false), 3000);
              }}
            >
              React
            </Button>
          ) : null}
          <Button variant="secondary" className="min-w-fit flex-1 whitespace-nowrap" data-testid="win-look" onClick={() => setHidden(true)}>
            Look around
          </Button>
          {canAgain ? (
            <Button className="min-w-fit flex-1 whitespace-nowrap" data-testid="win-again" onClick={playAgain}>
              Play again
            </Button>
          ) : null}
          <Button variant={canAgain ? "secondary" : "default"} className="min-w-fit flex-1 whitespace-nowrap" data-testid="win-menu" onClick={goTitle}>
            Back to menu
          </Button>
        </div>
      </div>
    </div>
  );
}
