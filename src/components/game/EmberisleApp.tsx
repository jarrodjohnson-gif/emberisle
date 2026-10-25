import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Lobby, SetupPipHints } from "@/components/game/chunks";
import { Hud } from "@/components/game/Hud";
import { PlaceList } from "@/components/game/PlaceList";
import { TableRecoveryBoundary } from "@/components/game/TableRecoveryBoundary";
import { useGame } from "@/lib/game/store";
import { LazyBoundary, reloadOnStaleChunk } from "@/lib/lazy";
import { setMusicWanted } from "@/lib/sound";
import { useTurnTitle } from "@/lib/turn-title";

function stripLink() {
  const url = new URL(location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("watch");
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

const Title = lazy(() => import("@/components/game/Title").then(m => ({ default: m.Title })));

const IslandCanvas = lazy(() => import("@/components/scene/IslandCanvas"));

function ClientCanvas() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <IslandCanvas />
    </Suspense>
  );
}

export function EmberisleApp() {
  const screen = useGame((s) => s.screen);
  const restoring = useGame((s) => s.restoring);
  const runBots = useGame((s) => s.runBots);
  const seq = useGame((s) => s.state?.seq);
  // A bot's turn waits while its own ask is open (#363); the offer's close wakes it again.
  const offerOpen = useGame((s) => s.offer !== null);
  useTurnTitle();
  // #814: background music from the lobby through play; the title and the end screen (where end_music plays) are quiet.
  const over = useGame((s) => s.state?.phase === "over");
  useEffect(() => {
    setMusicWanted(screen !== "title" && !(screen === "play" && over));
  }, [screen, over]);

  useEffect(() => {
    (window as unknown as { __emberisle: typeof useGame }).__emberisle = useGame;
    // `__emberisle.water`: the sea's path, why, and the probe's ms a frame, for proofs and the console (crystal-water.md).
    Object.defineProperty(useGame, "water", { configurable: true, get: () => useGame.getState().water });
    // #488: a chunk that fails to load while still at the title is read as a stale page after a deploy: reload once.
    return reloadOnStaleChunk(() => useGame.getState().screen === "title");
  }, []);

  // #492: a link whose chunk never loaded at the title still leaves the URL once the title is left.
  useEffect(() => {
    if (screen !== "title") stripLink();
  }, [screen]);

  useEffect(() => {
    if (screen !== "play") return;
    const t = window.setTimeout(() => runBots(), 700);
    return () => window.clearTimeout(t);
  }, [seq, screen, offerOpen, runBots]);

  return (
    <div data-game-shell className="relative h-dvh w-full overflow-hidden bg-studio">
      <TableRecoveryBoundary>
        <ClientCanvas />
        {/* #488: the lobby (with chat) is online-only, so it is a lazy chunk; Host and Join prefetch it on hover or focus. */}
        {screen === "title" ? restoring ? <Restoring /> : <LazyBoundary failed={<LobbyFailed title />}><Title /></LazyBoundary> : screen === "lobby" ? (
          <LazyBoundary failed={<LobbyFailed />}>
            <Lobby />
          </LazyBoundary>
        ) : (
          <>
            <Hud />
            <PlaceList />
            <LazyBoundary failed={null}>
              <SetupPipHints />
            </LazyBoundary>
          </>
        )}
      </TableRecoveryBoundary>
    </div>
  );
}

// #543: a reload into a table in play shows the wordmark, then the board, and never the title in between. The static copy of
// this in index.html paints before any script runs; keep the two alike.
function Restoring() {
  return (
    <div data-testid="restoring" role="status" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-bg">
      <h1 className="title-wordmark font-display">Emberisle</h1>
      <p className="text-sm text-muted">Back to your table…</p>
    </div>
  );
}

// The online chunk did not load, so there is no lobby to show: say so where the lobby card goes, with the one way out.
function LobbyFailed({ title = false }: { title?: boolean }) {
  return (
    <div data-testid="lobby-failed" role="alert" className="absolute bottom-5 left-5 z-10 w-full max-w-sm rounded-[20px] border border-white/50 bg-surface p-5 backdrop-blur-md sm:bottom-10 sm:left-10">
      <p className="text-sm">{title ? "Couldn't load play choices." : "Couldn't load the table lobby."}</p>
      <Button size="lg" variant="primary" className="mt-3 w-full" onClick={() => location.reload()}>
        Reload
      </Button>
    </div>
  );
}
