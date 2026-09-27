import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Hud } from "@/components/game/Hud";
import { useGame } from "@/lib/game/store";

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
      {screen === "title" ? <Title /> : screen === "lobby" ? <Lobby /> : <Hud />}
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
  const hostTable = useGame((s) => s.hostTable);
  const joinTable = useGame((s) => s.joinTable);
  const error = useGame((s) => s.error);

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
          <Button size="lg" variant="secondary" onClick={hostTable}>
            Host a table
          </Button>
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
                if (join.length === 4) joinTable(join);
              }}
            >
              Join
            </Button>
          </div>
          {error ? <p className="text-sm text-accent">{error}</p> : null}
          <Button variant="ghost" onClick={() => setHowTo(!howTo)}>
            How to play
          </Button>
        </div>
      </div>
    </div>
  );
}

function Lobby() {
  const code = useGame((s) => s.code);
  const seats = useGame((s) => s.seats);
  const isHost = useGame((s) => s.isHost);
  const lobbyLog = useGame((s) => s.lobbyLog);
  const error = useGame((s) => s.error);
  const setReady = useGame((s) => s.setReady);
  const startTable = useGame((s) => s.startTable);
  const goTitle = useGame((s) => s.goTitle);
  const [ready, setReadyLocal] = useState(false);
  const canStart = isHost && seats.length >= 3 && seats.length <= 4 && seats.every((s) => s.ready);

  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end bg-gradient-to-t from-bg via-bg/40 to-transparent p-5 sm:p-10">
      <div className="mx-auto w-full max-w-md">
        <p className="text-xs uppercase tracking-[0.22em] text-sea">Table code</p>
        <p data-testid="table-code" className="mt-1 font-display text-6xl tracking-[0.2em]">
          {code}
        </p>
        <ul className="mt-5 flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => {
            const s = seats[i];
            return (
              <li key={i} className="flex items-center gap-3 rounded-[12px] border border-border bg-surface px-3 py-2">
                <span className="size-3 rounded-full" style={{ background: s?.color ?? "transparent" }} />
                <span className="flex-1 text-sm">{s ? s.name : "Empty"}</span>
                {s ? <span className="text-xs text-muted">{s.ready ? "Ready" : "Waiting"}</span> : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 min-h-5 text-xs text-muted">{error ?? lobbyLog}</p>
        <div className="mt-3 flex flex-col gap-2">
          <Button
            size="lg"
            variant={ready ? "secondary" : "default"}
            onClick={() => {
              setReadyLocal(!ready);
              setReady(!ready);
            }}
          >
            {ready ? "Not ready" : "Ready"}
          </Button>
          {canStart ? (
            <Button size="lg" variant="sea" onClick={startTable}>
              Start
            </Button>
          ) : null}
          <Button variant="ghost" onClick={goTitle}>
            Leave the table
          </Button>
        </div>
      </div>
    </div>
  );
}
