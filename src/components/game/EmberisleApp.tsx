import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Hud } from "@/components/game/Hud";
import { useGame } from "@/lib/game/store";
import { tableCode } from "@/lib/utils";

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
  const runBots = useGame((s) => s.runBots);
  const seq = useGame((s) => s.state?.seq);

  useEffect(() => {
    (window as unknown as { __emberisle: typeof useGame }).__emberisle = useGame;
  }, []);

  useEffect(() => {
    if (screen !== "play") return;
    const t = window.setTimeout(() => runBots(), 700);
    return () => window.clearTimeout(t);
  }, [seq, screen, runBots]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg">
      <ClientCanvas />
      {screen === "title" || screen === "lobby" ? <Title /> : <Hud />}
    </div>
  );
}

function Title() {
  const name = useGame((s) => s.name);
  const setName = useGame((s) => s.setName);
  const startAi = useGame((s) => s.startAi);
  const startHotseat = useGame((s) => s.startHotseat);
  const setHowTo = useGame((s) => s.setHowTo);
  const howTo = useGame((s) => s.howTo);
  const [join, setJoin] = useState("");
  const [hostCode, setHostCode] = useState<string | null>(null);

  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end bg-gradient-to-t from-bg via-bg/40 to-transparent p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-10">
      <div className="mx-auto w-full max-w-md">
        <p className="text-xs uppercase tracking-[0.22em] text-sea">A living island</p>
        <h1 className="mt-2 font-display text-5xl leading-none tracking-tight sm:text-6xl">Emberisle</h1>
        <p className="mt-3 max-w-sm text-pretty text-muted">
          Claim hexes, graze the pastures, and trade the land. Sheep wander. Boats rock. The wayfarer crosses the wastes.
        </p>
        <label className="mt-6 block text-xs uppercase tracking-wide text-muted">
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-base text-fg"
          />
        </label>
        <div className="mt-4 flex flex-col gap-2">
          <Button size="lg" onClick={startAi}>
            Play versus the isle
          </Button>
          <Button size="lg" variant="secondary" onClick={() => startHotseat(4)}>
            Four seats, one table
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => {
              const code = tableCode();
              setHostCode(code);
              const url = new URL(window.location.href);
              url.searchParams.set("table", code);
              void navigator.clipboard?.writeText(url.toString()).catch(() => {});
            }}
          >
            Host a table
          </Button>
          {hostCode ? (
            <p className="rounded-[12px] border border-border bg-raised px-3 py-2 text-sm">
              Table code <span className="font-medium tabular-nums">{hostCode}</span>. Share this page link with friends,
              then start versus the isle if they have not joined yet. Online seats use the same living board.
            </p>
          ) : null}
          <div className="flex gap-2">
            <input
              value={join}
              onChange={(e) => setJoin(e.target.value.toUpperCase())}
              placeholder="Join code"
              maxLength={4}
              className="h-11 flex-1 rounded-[12px] border border-border bg-surface px-3 tracking-[0.3em]"
            />
            <Button
              variant="sea"
              onClick={() => {
                if (join.length === 4) {
                  const url = new URL(window.location.href);
                  url.searchParams.set("table", join);
                  window.history.replaceState(null, "", url.toString());
                  startAi();
                }
              }}
            >
              Join
            </Button>
          </div>
          <Button variant="ghost" onClick={() => setHowTo(!howTo)}>
            How to play
          </Button>
        </div>
      </div>
    </div>
  );
}
