import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { totalVP } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { useFocusTrap } from "@/lib/focus-trap";

// Build bible 4.7: the island stays visible. "Look around" hides the panel and leaves a small chip.
export function WinScreen() {
  const winnerId = useGame((s) => s.state?.winner);
  return winnerId ? <Panel key={winnerId} /> : null;
}

function Panel() {
  const state = useGame((s) => s.state)!;
  const goTitle = useGame((s) => s.goTitle);
  const playAgain = useGame((s) => s.playAgain);
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
        total: totalVP(state, p.id),
      };
    })
    .sort((a, b) => Number(b.p.id === winner.id) - Number(a.p.id === winner.id) || b.total - a.total);

  if (hidden) {
    return (
      <div
        ref={chip}
        data-testid="win-chip"
        className="absolute left-1/2 top-16 z-20 flex -translate-x-1/2 items-center gap-1 rounded-[20px] border border-white/50 bg-white/60 p-1 backdrop-blur-md"
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

  const head = "px-1 py-2 text-right text-[11px] sm:px-2 font-medium uppercase tracking-wide text-zinc-600";
  const cell = "px-1 py-2 sm:px-2 text-right tabular-nums";
  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="win-headline"
      data-testid="win-screen"
      className="absolute inset-0 z-20 flex items-center justify-center bg-bg/60 p-safe backdrop-blur-sm"
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-[28px] border border-white/50 bg-surface p-5 text-center sm:p-6">
        <div className="flex items-center justify-center gap-2.5">
          <span aria-hidden="true" className="size-4 shrink-0 rounded-full" style={{ background: winner.color }} />
          <p id="win-headline" data-testid="win-headline" className="font-display text-3xl text-fg">
            {winner.name} wins
          </p>
        </div>
        <div className="mt-4 min-h-0 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${head} text-left`}>Player</th>
                <th className={head} title="Outposts">
                  <span className="sm:hidden">Out</span>
                  <span className="hidden sm:inline">Outposts</span>
                </th>
                <th className={head} title="Strongholds">
                  <span className="sm:hidden">Str</span>
                  <span className="hidden sm:inline">Strongholds</span>
                </th>
                <th className={head} title="Longest path">
                  <span className="sm:hidden">Path</span>
                  <span className="hidden sm:inline">Longest path</span>
                </th>
                <th className={head} title="Largest army">
                  <span className="sm:hidden">Army</span>
                  <span className="hidden sm:inline">Largest army</span>
                </th>
                <th className={head} title="Hidden">
                  <span className="sm:hidden">Hid</span>
                  <span className="hidden sm:inline">Hidden</span>
                </th>
                <th className={head}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.p.id} data-testid="win-row" data-player={r.p.id} className="border-t border-border">
                  <td className="px-1 py-2 text-left font-medium sm:px-2">
                    <span className="mr-1.5 inline-block align-middle size-2.5 rounded-full" style={{ background: r.p.color }} />
                    {r.p.name}
                  </td>
                  <td className={cell}>{r.outposts}</td>
                  <td className={cell}>{r.strongholds}</td>
                  <td className={cell}>{r.path ? "✓" : ""}</td>
                  <td className={cell}>{r.army ? "✓" : ""}</td>
                  <td className={cell}>{r.hiddenVp}</td>
                  <td data-testid="win-total" className={`${cell} font-medium`}>
                    {r.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {waiting ? (
          <p data-testid="win-waiting" className="mt-4 text-sm text-zinc-600">
            Waiting for {hostName} to start another.
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
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
