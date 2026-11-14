import { type ReactNode, useEffect, useRef, useState } from "react";
import { VictoryTargetSelect } from "@/components/game/VictoryTargetSelect";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import { totalVP, victoryTarget } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { useViewport } from "@/lib/viewport";
import { LazyBoundary } from "@/lib/lazy";
import { Award, DiceStrip, playAgain, resultsStory, WantAgain, WantCount, WinList, winList } from "@/components/game/chunks";
import { useFocusTrap } from "@/lib/focus-trap";
import type { PlayerState } from "@/lib/game/types";
import type { Seat } from "@/lib/net/table";
import "./win-screen.css";

// `note` is the row's profile line (#767), only when a seat in this game started bound to a profile; `tag` says who wants to play again (#1411);
// `award` is the player's island award (#1452), from its own lazy chunk.
export type Row = { p: PlayerState; outposts: number; strongholds: number; path: boolean; army: boolean; hiddenVp: number; total: number; note?: string; tag?: ReactNode; award?: ReactNode };

// #1452 and #1453: a part of the results story; if its chunk cannot load, the results show without it.
const story = (el: ReactNode) => <LazyBoundary failed={null}>{el}</LazyBoundary>;

// #1411 (design docs/design/play-again-1411, option A): the host and bots are always in; an away seat is left out of the next game.
const yes = (x: Seat) => !x.away && (x.host || x.bot || x.again);
const tagOf = (x?: Seat) =>
  x?.away ? (
    <span className="win-tag away">Away</span>
  ) : x && yes(x) ? (
    <span className="win-tag">
      <span aria-hidden="true">✓ Play again</span>
      <span className="sr-only">, wants to play again</span>
    </span>
  ) : undefined;

// The end of a game (docs/design/end-of-game, slice 2): one sheet in the tray's style at the bottom of the screen, the island
// in view above it with no wash. The winner's name, how it ended, one row per player on every screen size (WinList), and
// one primary button. "Hide scores" hides the sheet and leaves a small chip (build bible 4.7).
export function WinScreen() {
  // #748: the list is its own chunk; fetch it while the table plays, so it is in memory before the game ends.
  useEffect(() => {
    void winList.prefetch();
    void resultsStory.prefetch();
    // #1411: the guest's I'll play again and the count, in memory before the game ends.
    if (useGame.getState().mode === "online") void playAgain.prefetch();
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
  // Owner 2026-11-12 (q1563-play-again): after a practice game, Play again deals a new practice game with the same bots.
  const playAgain = useGame((s) => (s.mode === "ai" ? s.startAi : s.playAgain));
  const sendSound = useGame((s) => s.sendSound);
  const [resting, setResting] = useState(false);
  const mode = useGame((s) => s.mode);
  const spectator = useGame((s) => s.spectator);
  // #767: the host's committed profile totals for this game. Never counted here, so a repeated state cannot add a win.
  const result = useGame((s) => (s.mode === "online" ? s.gameResult : null));
  // The lobby's host test (EmberisleApp), so a handed-off host gets the button.
  const isHost = useGame((s) => s.seats.find((x) => x.id === s.seatId)?.host ?? s.isHost);
  const hostName = useGame((s) => s.seats.find((x) => x.host)?.name);
  const seats = useGame((s) => s.seats);
  // #1611 (accepted decision 7, answers A to E of 2026-11-06): an expanded game with fewer than five at the table. The host
  // picks: fill with bots up to five, the classic map (three or four only), or Cancel, which changes nothing. The others
  // read that the host is choosing.
  // Only online: the last table's choice is not cleared when the host leaves it (#1611).
  const choose = useGame((s) => (s.mode === "online" ? s.rematchChoice : undefined));
  // docs/design/rematch.md: the online host, hotseat and practice start another; an online guest asks, a watcher cannot.
  const canAgain = mode !== "online" || (isHost && !spectator);
  const waiting = mode === "online" && !isHost && !spectator && hostName;
  const seatOf = (id: string) => (mode === "online" ? seats.find((x) => x.player === id) : undefined);
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
        award: story(<Award id={p.id} />),
        tag: tagOf(seatOf(p.id)),
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
          <Button size="sm" className="whitespace-nowrap" data-testid="win-again-chip" onClick={() => playAgain()}>
            Play again
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" className="whitespace-nowrap" data-testid="win-menu-chip" onClick={goTitle}>
          Menu
        </Button>
      </div>
    );
  }

  const winning = rows.find((r) => r.p.id === winner.id)!;
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
  // The list's stand-in if its chunk cannot load (the next mount tries it again): every player and total, nothing to open.
  const plain = (
    <ul>
      {rows.map((r) => (
        <li key={r.p.id} data-testid="win-row" data-player={r.p.id} className="flex min-h-11 items-center gap-2.5 border-border pr-1.5 pl-2 text-body not-first:border-t">
          <SeatDot color={r.p.color} className="size-3 flex-none" />
          <span className="min-w-0 flex-1 truncate">
            {r.p.name}
            {r.note ? <span data-testid="win-profile" className="block truncate text-caption text-muted">{r.note}</span> : null}
          </span>
          {r.tag}
          <span data-testid="win-total" className="flex-none text-xl font-bold tabular-nums">{r.total}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="win-headline"
      data-testid="win-screen"
      className="win-screen absolute inset-0 z-40 flex items-end justify-center"
    >
      <div className="tray-sheet win-sheet flex w-full max-w-[520px] flex-col short:max-w-2xl">
        {/* #748: 480 px tall or less, the list needs room for four 44 px rows under the host's two-line actions (667x375 with insets). */}
        <div className="short:flex short:items-baseline short:gap-3">
          <div className="flex items-center gap-2.5">
            <SeatDot color={winner.color} className="size-4 flex-none short:size-3" />
            <p id="win-headline" data-testid="win-headline" className="win-head min-w-0 truncate">
              {winner.name} wins
            </p>
          </div>
          <p data-testid="win-action" className="win-how">
            {action} · {reason?.points ?? winning.total} points, target {reason?.target ?? victoryTarget(state)}.
          </p>
        </div>
        {result && !result.tracked ? <p data-testid="win-untracked" className="win-how">This game isn't tracked.</p> : null}
        <div data-testid="win-table-wrap" className="mt-1 min-h-0 overflow-auto border-t border-border text-left short:mt-0">
          <LazyBoundary failed={plain}><WinList rows={rows} /></LazyBoundary>
          {story(<DiceStrip />)}
        </div>
        {waiting ? (
          <p data-testid="win-waiting" className="win-how">
            {choose ? "The host is choosing how to rematch." : `Waiting for ${hostName} to start another.`}
          </p>
        ) : null}
        {mode === "online" ? <LazyBoundary failed={null}><WantCount n={seats.filter(yes).length} seats={seats} /></LazyBoundary> : null}
        <div className="win-actions mt-2 flex flex-wrap items-center gap-2 short:mt-1">
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
          {/* One primary button: Play again, a guest's I'll play again, or Menu when there is neither (a watcher). */}
          <Button variant={canAgain || waiting ? "secondary" : "default"} className="min-w-fit flex-1 whitespace-nowrap" data-testid="win-menu" onClick={goTitle}>
            Menu
          </Button>
          {canAgain && choose ? (
            <>
              {choose.map((c) => (
                <Button key={c} className="min-w-fit flex-1 whitespace-nowrap" data-testid={`win-again-${c}`} onClick={() => playAgain(c)}>
                  {c === "bots" ? "Fill with bots" : "Classic map"}
                </Button>
              ))}
              <Button variant="secondary" className="min-w-fit flex-1 whitespace-nowrap" data-testid="win-again-cancel" onClick={() => playAgain("dismiss")}>
                Cancel
              </Button>
            </>
          ) : canAgain ? (
            <Button className="min-w-fit flex-1 whitespace-nowrap" data-testid="win-again" onClick={() => playAgain()}>
              Play again
            </Button>
          ) : null}
          {/* #1411: every other seated player says "I'll play again"; only the host starts the next game. */}
          {waiting ? <LazyBoundary failed={null}><WantAgain /></LazyBoundary> : null}
        </div>
      </div>
    </div>
  );
}
