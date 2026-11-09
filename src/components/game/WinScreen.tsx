import { useEffect, useRef, useState } from "react";
import { VictoryTargetSelect } from "@/components/game/VictoryTargetSelect";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import { totalVP, victoryTarget } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { readViewport, useViewport } from "@/lib/viewport";
import { LazyBoundary } from "@/lib/lazy";
import { WinList, winList } from "@/components/game/chunks";
import { useFocusTrap } from "@/lib/focus-trap";
import type { PlayerState } from "@/lib/game/types";

// `note` is the row's profile line (#767), only when a seat in this game started bound to a profile.
export type Row = { p: PlayerState; outposts: number; strongholds: number; path: boolean; army: boolean; hiddenVp: number; total: number; note?: string };

// Build bible 4.7: the island stays visible. "Hide scores" hides the panel and leaves a small chip.
export function WinScreen() {
  // #748: the phone list is its own chunk; fetch it while the table plays, so it is in memory before the game ends.
  useEffect(() => {
    if (readViewport().phone) void winList.prefetch();
  }, []);
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
  // #767: the host's committed profile totals for this game. Never counted here, so a repeated state cannot add a win.
  const result = useGame((s) => (s.mode === "online" ? s.gameResult : null));
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

  // #379: Tab stays inside the dialog; "Hide scores" hands focus to the chip so the keyboard does not land on the body.
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

  const rows: Row[] = state.players
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
        total: totalVP(state, p.id),
        note: !result?.tracked
          ? undefined
          : !Object.hasOwn(result.wins, p.id)
            ? "Not tracked"
            : result.wins[p.id] === null
              ? "Saving record…"
              : `${result.wins[p.id]} profile win${result.wins[p.id] === 1 ? "" : "s"}`,
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
  // The desktop table, and the phone list's stand-in if its chunk cannot load (the next mount tries it again).
  const table = (
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
                    {r.note ? <span data-testid="win-profile" className="block pl-[18px] text-xs font-normal text-muted">{r.note}</span> : null}
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
  );
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
        {result && !result.tracked ? <p data-testid="win-untracked" className="mt-1 text-sm short:text-xs text-muted">This game isn't tracked.</p> : null}
        <div className={`win-equation ${phone ? "short:hidden!" : ""}`} data-testid="win-reason">{contribution.map((part, i) => <span key={part}>{i > 0 ? "+ " : ""}{part}</span>)}</div>
        <div data-testid="win-table-wrap" className={`mt-4 min-h-0 overflow-auto ${phone ? "border-t border-border pt-2 text-left short:mt-1 short:pt-0" : "short:mt-1.5"}`}>
          {phone ? <LazyBoundary failed={table}><WinList rows={rows} /></LazyBoundary> : table}
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
            Hide scores
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
