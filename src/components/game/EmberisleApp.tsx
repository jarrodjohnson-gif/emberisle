import { useEffect, useState, type ComponentType } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpenModeToggle, HowTo, island, LoadingScreen, Lobby, online, openTables, OpenTables, ProfileSheet, profileSheet, SetupPipHints, sheets, WayfarerOptions } from "@/components/game/chunks";
import { Hud } from "@/components/game/Hud";
import { PlaceList } from "@/components/game/PlaceList";
import { TableRecoveryBoundary } from "@/components/game/TableRecoveryBoundary";
import { SeatDot } from "@/components/game/SeatDot";
import { useGame } from "@/lib/game/store";
import { JOIN_CODE, LazyBoundary, preloadOnIdle, reloadOnStaleChunk } from "@/lib/lazy";
import { play, setMusicWanted, setMuted, useMuted } from "@/lib/sound";
import { useTurnTitle } from "@/lib/turn-title";
import { PLAYER_COLORS, PLAYER_NAMES } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { useViewport } from "@/lib/viewport";

// The island mounts once its chunk is in, never on the first pass. A failed download leaves the title standing and waits for
// the next try (`tries`, bumped by the loading screen's Try again); a render fault still reaches the table's recovery.
function ClientCanvas({ tries }: { tries: number }) {
  const [Canvas, setCanvas] = useState<ComponentType | null>(null);
  useEffect(() => {
    let live = true;
    island.load().then((m) => live && setCanvas(() => m.default), () => {});
    return () => {
      live = false;
    };
  }, [tries]);
  return Canvas ? <Canvas /> : null;
}

export function EmberisleApp() {
  const screen = useGame((s) => s.screen);
  const restoring = useGame((s) => s.restoring);
  const runBots = useGame((s) => s.runBots);
  const seq = useGame((s) => s.state?.seq);
  // A bot's turn waits while its own ask is open (#363); the offer's close wakes it again.
  const offerOpen = useGame((s) => s.offer !== null);
  // #1281: a page load that opens at the title opens on the loading screen ("load"), and the title card rises in at the end
  // of the push ("arrive"). A reload into a held seat skips it, and so does a page that sets `__emberisleSkipIntro` before it
  // loads (the proofs, through scripts/proof-browser.mjs).
  const [intro, setIntro] = useState(() =>
    screen === "title" && !restoring && !(window as { __emberisleSkipIntro?: boolean }).__emberisleSkipIntro ? "load" : "",
  );
  const [tries, setTries] = useState(0);
  useTurnTitle();
  // #814, #1279: background music from the title through the lobby and play, after the first tap or key.
  // The end screen stays quiet, where end_music plays.
  const over = useGame((s) => s.state?.phase === "over");
  useEffect(() => {
    setMusicWanted(!(screen === "play" && over));
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
    if (screen === "title") return;
    stripLink();
    setIntro("");
  }, [screen]);

  useEffect(() => {
    if (screen !== "play") return;
    const t = window.setTimeout(() => runBots(), 700);
    return () => window.clearTimeout(t);
  }, [seq, screen, offerOpen, runBots]);

  return (
    <div data-game-shell className="relative h-dvh w-full overflow-hidden bg-studio">
      <TableRecoveryBoundary>
        <ClientCanvas tries={tries} />
        {/* #488: the lobby (with chat) is online-only, so it is a lazy chunk; Host and Join prefetch it on hover or focus. */}
        {screen === "title" ? restoring ? <Restoring /> : (
          <>
            {intro ? (
              <LazyBoundary failed={<Gone then={() => setIntro("")} />}>
                <LoadingScreen onArrive={() => setIntro("arrive")} onDone={() => setIntro("")} onRetry={() => setTries((n) => n + 1)} />
              </LazyBoundary>
            ) : null}
            {intro !== "load" ? <Title arrive={intro === "arrive"} /> : null}
          </>
        ) : screen === "lobby" ? (
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

const PEEK_CODE = JOIN_CODE;
// A join link is read on the first Title of a page load only: later visits to the title (goTitle) start empty.
let linkRead = false;
function stripLink() {
  const url = new URL(location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("watch");
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

// #1505: ?code= on the first load. A watch link is not this screen.
function joinLinkCode(): string | null {
  if (typeof location === "undefined") return null;
  const code = new URL(location.href).searchParams.get("code")?.toUpperCase() ?? "";
  return PEEK_CODE.test(code) ? code : null;
}

// A lazy chunk that did not load: carry on without it.
function Gone({ then }: { then: () => void }) {
  useEffect(then, []);
  return null;
}

function SeatColors({ taken, color }: { taken: string[]; color: string | null }) {
  return (
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
          onClick={() => useGame.getState().setColor(c)}
          className={cn("grid size-11 place-items-center rounded-control border-2 p-1 transition", taken.includes(c) && "cursor-not-allowed opacity-35")}
          style={{ borderColor: !taken.includes(c) && color === c ? "#1c1915" : "transparent" }}
        >
          <SeatDot color={c} className="size-7" />
        </button>
      ))}
    </div>
  );
}

function Title({ arrive }: { arrive: boolean }) {
  const name = useGame((s) => s.name);
  const color = useGame((s) => s.color);
  const choices = useGame((s) => s.wayfarerChoices);
  const rules = { ai: choices.ai ?? "on", online: choices.online ?? "on", hotseat: choices.hotseat ?? "on" };
  const setHowTo = useGame.getState().setHowTo;
  const howTo = useGame((s) => s.howTo);
  const [join, setJoin] = useState(() => joinLinkCode() ?? "");
  // #1505: a ?code= link opens the join card on the first paint, before the effect below.
  const [linkedCode, setLinkedCode] = useState(joinLinkCode);
  const [joinName, setJoinName] = useState("");
  const applyJoinName = () => {
    const typed = joinName.trim();
    if (typed) useGame.getState().setName(typed);
  };
  const joinLinked = () => {
    if (!linkedCode) return;
    applyJoinName();
    useGame.getState().joinTable(linkedCode);
  };
  // #1449: Join or Watch with fewer than four characters says why nothing was sent, until the field changes.
  const [shortCode, setShortCode] = useState(false);
  const [openMode, setOpenMode] = useState(false);
  // #766: the Profile sheet is open while this holds the button that opened it, where focus returns on close.
  const [profileOpener, setProfileOpener] = useState<HTMLElement | null>(null);
  const watchTable = useGame.getState().watchTable;
  // A ?watch= link makes Watch the primary button for this visit (docs/design/spectator.md).
  const [watchLink, setWatchLink] = useState(false);
  const [discoveryReady, setDiscoveryReady] = useState(false);
  const peekTable = useGame.getState().peekTable;
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

  // Optional discovery keeps its null fallback when a dependency fails (#1493).
  // Resolve the load outside render so a known rejection never enters React's concurrent render.
  useEffect(() => {
    let mounted = true;
    void openTables.load().then(() => { if (mounted) setDiscoveryReady(true); }, () => {});
    return () => { mounted = false; };
  }, []);

  // #304: a join link (?code=K7QP) fills the field so the peek above runs; nothing is sent until Join is pressed. A watch
  // link (?watch=K7QP) does the same and makes Watch the primary button. #492: the link stays in the URL until the online
  // chunk has loaded, so the stale-chunk reload refills the field; then it leaves the URL so a later reload does not refill
  // a dead code. Only the first Title of a page load reads it.
  useEffect(() => {
    if (linkRead) return;
    linkRead = true;
    const url = new URL(location.href);
    const code = url.searchParams.get("code")?.toUpperCase();
    const watch = url.searchParams.get("watch")?.toUpperCase();
    if (code === undefined && watch === undefined) return;
    const fill = code ?? watch!;
    if (!PEEK_CODE.test(fill)) return stripLink();
    setJoin(fill);
    void online.prefetch().then((ok) => ok && stripLink());
    if (code === undefined) setWatchLink(true);
    else setLinkedCode(fill);
  }, []);

  // #488: How to play is a lazy chunk; idle time on the title fetches it, and so does a pointer or focus on its button.
  useEffect(() => preloadOnIdle(sheets.prefetch), []);

  // One primary per screen (docs/design/polish.md): Play, or Watch on a watch link. Watch only shows once there is a code.
  // A join link's one primary is Join table, on its own card.
  const showWatch = watchLink || (!linkedCode && join.length === 4);

  return (
    <>
      {/* On a phone the card itself scrolls: a portrait sheet, or in landscape (#421) a wide two-column card capped at the
          viewport (name left, buttons right). `phone` is a coarse pointer or under 768 px wide, so a tablet held sideways
          gets the two-column card too, on purpose: it keeps the island's centre clear. The desktop card is capped as well so
          a short window (1280x500) never pushes the wordmark above the top edge. */}
      <div
        data-testid="title-card"
        data-join-link={linkedCode || undefined}
        className={cn(
          "title-cover absolute z-10",
          arrive && "title-arrive",
          phone && "overflow-y-auto rounded-[20px] border border-white/50 bg-surface p-5 backdrop-blur-md",
          sheet
            ? `inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] ${linkedCode ? "max-h-[calc(100dvh-max(0.75rem,env(safe-area-inset-top))-max(0.75rem,env(safe-area-inset-bottom)))]" : "max-h-[55vh]"}`
            : phone
              ? "bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] w-[min(44rem,calc(100%-1.5rem))] max-h-[calc(100dvh_-_max(0.75rem,env(safe-area-inset-top))_-_max(0.75rem,env(safe-area-inset-bottom)))]"
              : "bottom-5 left-5 max-h-[calc(100dvh-2.5rem)] w-full max-w-sm overflow-y-auto pb-[env(safe-area-inset-bottom)] sm:bottom-10 sm:left-10 sm:max-h-[calc(100dvh-5rem)]",
        )}
      >
        <div
          className={cn(
            !phone && "rounded-sheet bg-surface p-5 sm:p-6",
            landscape && "grid grid-cols-2 items-center gap-x-6",
          )}
        >
          <div>
            <h1 className="title-wordmark font-display">Emberisle</h1>
            {linkedCode ? (
              <input
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  joinLinked();
                }}
                placeholder="Your name"
                aria-label="Your name"
                autoComplete="off"
                data-testid="join-name"
                className="mt-5 h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-base text-fg"
              />
            ) : null}
            {linkedCode ? <SeatColors taken={taken} color={color} /> : (
            <details className="seat-settings">
              <summary aria-label="Your seat">
                <SeatDot color={color ?? PLAYER_COLORS[0]!} className="size-4" />
                <span>{name || "Your seat"}</span>
              </summary>
            <input
              value={name}
              onChange={(e) => useGame.getState().setName(e.target.value)}
              onBlur={useGame.getState().commitName}
              placeholder="Your name"
              aria-label="Your name"
              className="mt-5 h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-base text-fg"
            />
            <SeatColors taken={taken} color={color} />
            {/* #766: inside the seat settings, so the closed title card keeps its height (title-prove at 1280x500). */}
            <Button variant="ghost" className="mt-2 px-3" onPointerEnter={profileSheet.prefetch} onFocus={profileSheet.prefetch} onClick={(e) => setProfileOpener(e.currentTarget)}>
              Profile
            </Button>
            </details>
            )}
            {linkedCode ? null : <details data-testid="wayfarer-setup" className="group border-t border-border">
              <summary className="flex min-h-11 cursor-pointer flex-col justify-center text-xs text-muted">
                <span className="flex w-full items-center justify-between text-sm font-medium text-fg">Wayfarer<svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4 group-open:rotate-180"><path d="m6 9 6 6 6-6" /></svg></span>
                <span className="capitalize">Practice: {rules.ai} · Online: {rules.online} · Hotseat: {rules.hotseat}</span>
              </summary>
              <LazyBoundary failed={null}>
                <WayfarerOptions rules={rules} choose={useGame.getState().setWayfarerChoice} />
              </LazyBoundary>
            </details>}
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {linkedCode ? (
              <>
                <Button size="lg" variant="primary" className="w-full" data-testid="join-table" onPointerEnter={online.prefetch} onFocus={online.prefetch} onClick={joinLinked}>
                  {`Join table ${linkedCode}`}
                </Button>
                <div className="flex justify-center">
                  <Button type="button" variant="ghost" data-testid="join-host" className="underline decoration-fg/40 underline-offset-4" onPointerEnter={online.prefetch} onFocus={online.prefetch} onClick={() => { applyJoinName(); useGame.getState().hostTable(); }}>
                    Host a table
                  </Button>
                </div>
                {error ? <p role="alert" className="text-sm text-accent-ink">{error}</p> : null}
              </>
            ) : (
            <>
            <div className="flex flex-col items-center gap-1">
              <Button size="lg" variant={watchLink ? "secondary" : "primary"} className="w-full" onClick={useGame.getState().startAi}>
                Play
              </Button>
              {/* #411: the offline button says what it is in one tiny muted line. */}
              <p className="text-xs text-muted">3 bots, no network</p>
            </div>
            {/* #488: a pointer or focus on Host or Join fetches the online chunk (lobby and chat) before either is pressed. */}
            <div className="flex flex-wrap gap-x-2" onPointerEnter={online.prefetch} onFocus={online.prefetch}>
              <div className="relative flex min-w-max flex-1 overflow-hidden rounded-control border border-control-line">
                <Button size="lg" variant="secondary" className="mr-11 flex-1 whitespace-nowrap rounded-none border-0 px-2"
                  onClick={() => useGame.getState().hostTable(openMode ? "open" : undefined)}>
                  Host a table
                </Button>
                <LazyBoundary failed={null}>
                  {discoveryReady ? <OpenModeToggle openMode={openMode} setOpenMode={setOpenMode} /> : null}
                </LazyBoundary>
              </div>
              <form
                aria-label="Join code"
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (join.length !== 4) return setShortCode(true);
                  // Enter does what the primary button does.
                  if (watchLink) watchTable(join);
                  else useGame.getState().joinTable(join);
                }}
              >
                <input
                  value={join}
                  onChange={(e) => {
                    setJoin(e.target.value.toUpperCase());
                    setShortCode(false);
                  }}
                  placeholder="Code"
                  aria-label="Join code"
                  aria-describedby="code-help"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={4}
                  className="h-12 w-0 min-w-[4.5rem] flex-1 rounded-[12px] border border-border bg-surface px-3 tracking-[0.3em]"
                />
                <Button size="lg" variant="secondary" type="submit" className="px-2">
                  Join
                </Button>
              </form>
              <p id="code-help" className="w-full text-xs text-muted">Code for private tables</p>
            </div>
            {showWatch ? (
              <Button
                size="lg"
                variant={watchLink ? "primary" : "secondary"}
                type="button"
                onPointerEnter={online.prefetch}
                onFocus={online.prefetch}
                onClick={() => {
                  if (join.length === 4) watchTable(join);
                  else setShortCode(true);
                }}
              >
                Watch
              </Button>
            ) : null}
            {/* Always mounted, so the text arriving is what a screen reader hears when the Watch button appears. */}
            <p className="sr-only" aria-live="polite" data-testid="watch-announce">
              {showWatch ? "Watch available" : ""}
            </p>
            {shortCode || error ? (
              <p role="alert" className="text-sm text-accent-ink">
                {shortCode ? "Enter the 4-letter code." : error}
              </p>
            ) : null}
            <LazyBoundary failed={null}>
              {discoveryReady ? <OpenTables /> : null}
            </LazyBoundary>
            </>
            )}
            {/* #1418: the quiet row may use the card's side padding (its buttons have no fill), so at 15 px / 600 the sound
                button keeps its place beside How to play and a short window (1280x500) gains no line. */}
            <div className="-mx-5 flex flex-wrap items-center justify-center">
              {linkedCode ? null : <Button variant="ghost" className="px-3" title="Pass one device around" onClick={() => useGame.getState().startHotseat(4)}>
                Four seats, one table
              </Button>}
              <Button variant="ghost" className="px-3" onPointerEnter={sheets.prefetch} onFocus={sheets.prefetch} onClick={(e) => setHowTo(!howTo, e.currentTarget)}>
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
        <LazyBoundary failed={<HowToFailed />}>
          <HowTo onClose={() => setHowTo(false)} />
        </LazyBoundary>
      ) : null}
      {profileOpener ? (
        <LazyBoundary failed={<Closed close={() => setProfileOpener(null)} />}>
          <ProfileSheet opener={profileOpener} onClose={() => setProfileOpener(null)} />
        </LazyBoundary>
      ) : null}
    </>
  );
}

// The sheets chunk did not load: drop the open flag so the next press mounts How to play again and retries (#492).
function HowToFailed() {
  const setHowTo = useGame((s) => s.setHowTo);
  useEffect(() => setHowTo(false), [setHowTo]);
  return null;
}

// The profile chunk did not load: close it, so the next press mounts the sheet again and retries (#492).
function Closed({ close }: { close: () => void }) {
  useEffect(close, [close]);
  return null;
}

// The online chunk did not load, so there is no lobby to show: say so where the lobby card goes, with the one way out.
function LobbyFailed() {
  return (
    <div data-testid="lobby-failed" role="alert" className="absolute bottom-5 left-5 z-10 w-full max-w-sm rounded-[20px] border border-white/50 bg-surface p-5 backdrop-blur-md sm:bottom-10 sm:left-10">
      <p className="text-sm">Couldn't load the table lobby.</p>
      <Button size="lg" variant="primary" className="mt-3 w-full" onClick={() => location.reload()}>
        Reload
      </Button>
    </div>
  );
}
