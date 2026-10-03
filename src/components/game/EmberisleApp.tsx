import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChatBox, ReactionFloats } from "@/components/game/Chat";
import { Hud, HowTo } from "@/components/game/Hud";
import { useGame } from "@/lib/game/store";
import { useTurnTitle } from "@/lib/turn-title";
import { PLAYER_COLORS, PLAYER_NAMES } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { useViewport } from "@/lib/viewport";

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
  useTurnTitle();

  useEffect(() => {
    (window as unknown as { __emberisle: typeof useGame }).__emberisle = useGame;
    // A reload mid-game goes straight back to the held seat (#196).
    useGame.getState().rejoinTable();
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

const PEEK_CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

function Title() {
  const name = useGame((s) => s.name);
  const setName = useGame((s) => s.setName);
  const color = useGame((s) => s.color);
  const setColor = useGame((s) => s.setColor);
  const startAi = useGame((s) => s.startAi);
  const startHotseat = useGame((s) => s.startHotseat);
  const setHowTo = useGame((s) => s.setHowTo);
  const howTo = useGame((s) => s.howTo);
  const [join, setJoin] = useState("");
  const hostTable = useGame((s) => s.hostTable);
  const joinTable = useGame((s) => s.joinTable);
  const peekTable = useGame((s) => s.peekTable);
  const peekedCode = useGame((s) => s.code);
  const peekedSeats = useGame((s) => s.seats);
  const error = useGame((s) => s.error);
  const { phone, portrait } = useViewport();
  const sheet = phone && portrait;
  // Colors already seated at the table whose code is in the field (docs/design/color-peek.md).
  const taken = peekedCode === join ? peekedSeats.map((s) => s.color) : [];

  useEffect(() => {
    if (!PEEK_CODE.test(join)) return;
    const timer = setTimeout(() => peekTable(join), 300);
    const again = setInterval(() => peekTable(join), 5000);
    return () => {
      clearTimeout(timer);
      clearInterval(again);
    };
  }, [join, peekTable]);

  return (
    <div
      data-testid="title-card"
      className={cn(
        "absolute z-10",
        sheet
          ? "inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[55vh] overflow-y-auto rounded-[20px] border border-white/50 bg-white/45 p-5 backdrop-blur-md"
          : "bottom-5 left-5 w-full max-w-sm pb-[env(safe-area-inset-bottom)] sm:bottom-10 sm:left-10",
      )}
    >
      <div className={sheet ? undefined : "rounded-[20px] border border-white/50 bg-white/45 p-5 backdrop-blur-md sm:p-6"}>
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
        <div role="radiogroup" aria-label="Your color" className="mt-3 flex gap-2">
          {PLAYER_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={!taken.includes(c) && color === c}
              aria-label={taken.includes(c) ? `${PLAYER_NAMES[i]} (taken)` : PLAYER_NAMES[i]}
              title={taken.includes(c) ? `${PLAYER_NAMES[i]} (taken)` : PLAYER_NAMES[i]}
              disabled={taken.includes(c)}
              onClick={() => setColor(c)}
              className={cn("size-8 rounded-full border-2 transition", taken.includes(c) && "cursor-not-allowed opacity-35")}
              style={{ background: c, borderColor: !taken.includes(c) && color === c ? "#1c1915" : "transparent" }}
            />
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Button size="lg" variant="accent" onClick={hostTable}>
            Host a table
          </Button>
          <form
            aria-label="Join code"
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (join.length === 4) joinTable(join);
            }}
          >
            <input
              value={join}
              onChange={(e) => setJoin(e.target.value.toUpperCase())}
              placeholder="Join code"
              aria-label="Join code"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={4}
              className="h-11 flex-1 rounded-[12px] border border-border bg-surface px-3 tracking-[0.3em]"
            />
            <Button size="lg" variant="sea" type="submit">
              Join
            </Button>
          </form>
          {error ? (
            <p role="alert" className="text-sm text-accent">
              {error}
            </p>
          ) : null}
          <div className="mt-1 flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 whitespace-nowrap px-2" onClick={startAi}>
              Play versus the isle
            </Button>
            <Button size="sm" variant="outline" className="flex-1 whitespace-nowrap px-2" onClick={() => startHotseat(4)}>
              Four seats, one table
            </Button>
          </div>
          <Button variant="ghost" className="self-center" onClick={(e) => setHowTo(!howTo, e.currentTarget)}>
            How to play
          </Button>
        </div>
      </div>
      {howTo ? <HowTo onClose={() => setHowTo(false)} /> : null}
    </div>
  );
}

function Lobby() {
  const code = useGame((s) => s.code);
  const seats = useGame((s) => s.seats);
  // The welcome flag goes stale when the host leaves; the live seat list is the truth (#249).
  const isHost = useGame((s) => s.seats.find((x) => x.id === s.seatId)?.host ?? s.isHost);
  const lobbyLog = useGame((s) => s.lobbyLog);
  const error = useGame((s) => s.error);
  const setReady = useGame((s) => s.setReady);
  const startTable = useGame((s) => s.startTable);
  const goTitle = useGame((s) => s.goTitle);
  const [ready, setReadyLocal] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyCode = () => {
    // Never throws: clipboard is missing on insecure origins (a LAN IP over http) and can be denied.
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };
  const canStart = isHost && seats.length >= 3 && seats.length <= 4 && seats.every((s) => s.ready);
  const { phone, portrait } = useViewport();
  const sheet = phone && portrait;

  return (
    <div
      data-testid="lobby-card"
      className={cn(
        "absolute z-10 flex flex-col",
        sheet
          ? "inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[55vh]"
          : "bottom-5 left-5 top-5 w-full max-w-sm sm:bottom-10 sm:left-10 sm:top-10",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[20px] border border-white/50 bg-white/45 p-5 backdrop-blur-md sm:p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-sea">Table code</p>
        <div className="mt-1 flex items-center gap-3">
          <p data-testid="table-code" className="font-display text-6xl tracking-[0.2em]">
            {code}
          </p>
          <Button size="sm" variant="outline" onClick={copyCode}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <ul className="mt-5 flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => {
            const s = seats[i];
            return (
              <li key={i} className="relative flex items-center gap-3 rounded-[12px] border border-border bg-surface px-3 py-2">
                <span className="size-3 rounded-full ring-1 ring-inset ring-black/25" style={{ background: s?.color ?? "transparent" }} />
                <span className="flex-1 text-sm">{s ? s.name : "Empty"}</span>
                {s ? <span className="text-xs text-muted">{s.ready ? "Ready" : "Waiting"}</span> : null}
                {s ? <ReactionFloats by="seat" id={s.id} /> : null}
              </li>
            );
          })}
        </ul>
        <div className="mt-2 rounded-[12px] border border-border bg-surface p-2">
          <ChatBox rows={6} />
        </div>
        <p aria-live="polite" className="mt-2 min-h-5 text-xs text-muted">{error ?? lobbyLog}</p>
        <div className="mt-3 flex flex-col gap-2">
          <Button
            size="lg"
            variant="outline"
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
