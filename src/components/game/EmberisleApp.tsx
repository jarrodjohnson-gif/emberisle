import { lazy, Suspense, useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HowTo, Lobby, online, sheets } from "@/components/game/chunks";
import { Hud } from "@/components/game/Hud";
import { PlaceList } from "@/components/game/PlaceList";
import { useGame } from "@/lib/game/store";
import { play, setMuted, useMuted } from "@/lib/sound";
import { useTurnTitle } from "@/lib/turn-title";
import { PLAYER_COLORS, PLAYER_NAMES } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { preloadOnIdle } from "@/lib/lazy";
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
  // A bot's turn waits while its own ask is open (#363); the offer's close wakes it again.
  const offerOpen = useGame((s) => s.offer !== null);
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
  }, [seq, screen, offerOpen, runBots]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg">
      <ClientCanvas />
      {/* #488: the lobby (with chat) is online-only, so it is a lazy chunk; Host and Join prefetch it on hover or focus. */}
      {screen === "title" ? <Title /> : screen === "lobby" ? (
        <Suspense fallback={null}>
          <Lobby />
        </Suspense>
      ) : (
        <>
          <Hud />
          <PlaceList />
        </>
      )}
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
  const watchTable = useGame((s) => s.watchTable);
  // A ?watch= link makes Watch the primary button for this visit (docs/design/spectator.md).
  const [watchLink, setWatchLink] = useState(false);
  const peekTable = useGame((s) => s.peekTable);
  const peekedCode = useGame((s) => s.code);
  const peekedSeats = useGame((s) => s.seats);
  const error = useGame((s) => s.error);
  const muted = useMuted();
  const { phone, portrait } = useViewport();
  const sheet = phone && portrait;
  const landscape = phone && !portrait;
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

  // #304: a join link (?code=K7QP) fills the field so the peek above runs; nothing is sent until Join is pressed.
  // The code then leaves the URL so a reload does not refill a dead one. A watch link (?watch=K7QP) does the same and
  // makes Watch the primary button, so a reload never re-watches either.
  useEffect(() => {
    const url = new URL(location.href);
    const code = url.searchParams.get("code")?.toUpperCase();
    const watch = url.searchParams.get("watch")?.toUpperCase();
    if (code === undefined && watch === undefined) return;
    url.searchParams.delete("code");
    url.searchParams.delete("watch");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    const fill = code ?? watch!;
    if (!PEEK_CODE.test(fill)) return;
    setJoin(fill);
    if (code === undefined) setWatchLink(true);
  }, []);

  // #488: How to play is a lazy chunk; idle time on the title fetches it, and so does a pointer or focus on its button.
  useEffect(() => preloadOnIdle(sheets.preload), []);

  // One primary per screen (docs/design/polish.md): Play, or Watch on a watch link. Watch only shows once there is a code.
  const showWatch = watchLink || join.length === 4;

  return (
    <>
      {/* On a phone the card itself scrolls: a portrait sheet, or in landscape (#421) a wide two-column card capped at the
          viewport (name left, buttons right). `phone` is a coarse pointer or under 768 px wide, so a tablet held sideways
          gets the two-column card too, on purpose: it keeps the island's centre clear. The desktop card is capped as well so
          a short window (1280x500) never pushes the wordmark above the top edge. */}
      <div
        data-testid="title-card"
        className={cn(
          "absolute z-10",
          phone && "overflow-y-auto rounded-[20px] border border-white/50 bg-white/45 p-5 backdrop-blur-md",
          sheet
            ? "inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[55vh]"
            : phone
              ? "bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] w-[min(44rem,calc(100%-1.5rem))] max-h-[calc(100dvh_-_max(0.75rem,env(safe-area-inset-top))_-_max(0.75rem,env(safe-area-inset-bottom)))]"
              : "bottom-5 left-5 max-h-[calc(100dvh-2.5rem)] w-full max-w-sm overflow-y-auto pb-[env(safe-area-inset-bottom)] sm:bottom-10 sm:left-10 sm:max-h-[calc(100dvh-5rem)]",
        )}
      >
        <div
          className={cn(
            !phone && "rounded-[20px] border border-white/50 bg-white/45 p-5 backdrop-blur-md sm:p-6",
            landscape && "grid grid-cols-2 items-center gap-x-6",
          )}
        >
          <div>
            <h1 className="font-display text-5xl leading-none tracking-tight sm:text-6xl">Emberisle</h1>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              aria-label="Your name"
              className="mt-5 h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-base text-fg"
            />
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
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex flex-col items-center gap-1">
              <Button size="lg" variant={watchLink ? "secondary" : "primary"} className="w-full" onClick={startAi}>
                Play
              </Button>
              {/* #411: the offline button says what it is in one tiny muted line. */}
              <p className="text-xs text-muted">3 bots, no network</p>
            </div>
            {/* #488: a pointer or focus on Host or Join fetches the online chunk (lobby and chat) before either is pressed. */}
            <div className="flex flex-wrap gap-2" onPointerEnter={online.preload} onFocus={online.preload}>
              <Button size="lg" variant="secondary" className="grow" onClick={hostTable}>
                Host a table
              </Button>
              <form
                aria-label="Join code"
                className="flex min-w-[11rem] flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (join.length !== 4) return;
                  // Enter does what the primary button does.
                  if (watchLink) watchTable(join);
                  else joinTable(join);
                }}
              >
                <input
                  value={join}
                  onChange={(e) => setJoin(e.target.value.toUpperCase())}
                  placeholder="Code"
                  aria-label="Join code"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={4}
                  className="h-12 w-0 min-w-[4.5rem] flex-1 rounded-[12px] border border-border bg-surface px-3 tracking-[0.3em]"
                />
                <Button size="lg" variant="secondary" type="submit">
                  Join
                </Button>
              </form>
            </div>
            {showWatch ? (
              <Button
                size="lg"
                variant={watchLink ? "primary" : "secondary"}
                type="button"
                onClick={() => {
                  if (join.length === 4) watchTable(join);
                }}
              >
                Watch
              </Button>
            ) : null}
            {/* Always mounted, so the text arriving is what a screen reader hears when the Watch button appears. */}
            <p className="sr-only" aria-live="polite" data-testid="watch-announce">
              {showWatch ? "Watch available" : ""}
            </p>
            {error ? (
              <p role="alert" className="text-sm text-accent-ink">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-center">
              <Button variant="ghost" className="px-3" title="Pass one device around" onClick={() => startHotseat(4)}>
                Four seats, one table
              </Button>
              <Button variant="ghost" className="px-3" onPointerEnter={sheets.preload} onFocus={sheets.preload} onClick={(e) => setHowTo(!howTo, e.currentTarget)}>
                How to play
              </Button>
              <Button
                variant="ghost"
                size="icon"
                data-testid="sound-toggle"
                aria-label={muted ? "Table sounds off" : "Table sounds on"}
                aria-pressed={!muted}
                title={muted ? "Table sounds off" : "Table sounds on"}
                silent
                onClick={() => {
                  setMuted(!muted);
                  if (muted) play("ui_click");
                }}
              >
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
      {/* Beside the card, not inside it: the card is absolute (and scrolls on a phone), so a dialog inside it is
          clipped to the card's box and its Close can sit off-screen. */}
      {howTo ? (
        <Suspense fallback={null}>
          <HowTo onClose={() => setHowTo(false)} />
        </Suspense>
      ) : null}
    </>
  );
}
