import { lazy, Suspense, useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatBox, ReactionFloats } from "@/components/game/Chat";
import { CopyFallback, useCopy } from "@/components/game/CopyText";
import { Hud, HowTo } from "@/components/game/Hud";
import { PlaceList } from "@/components/game/PlaceList";
import { useGame } from "@/lib/game/store";
import { play, setMuted, useMuted } from "@/lib/sound";
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
      {screen === "title" ? <Title /> : screen === "lobby" ? <Lobby /> : (
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

  return (
    <>
      {/* On a phone the card itself scrolls: a portrait sheet, or in landscape (#421) a wide two-column card capped at the
          viewport (name and tagline left, buttons right) so nothing sits above the top edge. */}
      <div
        data-testid="title-card"
        className={cn(
          "absolute z-10",
          phone && "overflow-y-auto rounded-[20px] border border-white/50 bg-white/45 p-5 backdrop-blur-md",
          sheet
            ? "inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[55vh]"
            : phone
              ? "bottom-3 left-[max(0.75rem,env(safe-area-inset-left))] w-[min(44rem,calc(100%-1.5rem))] max-h-[calc(100dvh-1.5rem)]"
              : "bottom-5 left-5 w-full max-w-sm pb-[env(safe-area-inset-bottom)] sm:bottom-10 sm:left-10",
        )}
      >
        <div
          className={cn(
            !phone && "rounded-[20px] border border-white/50 bg-white/45 p-5 backdrop-blur-md sm:p-6",
            landscape && "grid grid-cols-2 items-center gap-x-6",
          )}
        >
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-sea-ink">A living island</p>
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
                if (join.length !== 4) return;
                // Enter does what the primary button does.
                if (watchLink) watchTable(join);
                else joinTable(join);
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
                className="h-11 min-w-0 flex-1 rounded-[12px] border border-border bg-surface px-3 tracking-[0.3em]"
              />
              <Button size="lg" variant={watchLink ? "outline" : "sea"} type="submit">
                Join
              </Button>
              <Button
                size="lg"
                variant={watchLink ? "sea" : "outline"}
                type="button"
                onClick={() => {
                  if (join.length === 4) watchTable(join);
                }}
              >
                Watch
              </Button>
            </form>
            {error ? (
              <p role="alert" className="text-sm text-accent-ink">
                {error}
              </p>
            ) : null}
            {/* #411: each offline button carries one tiny muted line on what it is. */}
            <div className="mt-1 flex flex-wrap gap-2">
              <div className="flex flex-1 flex-col items-center gap-1">
                <Button size="sm" variant="outline" className="w-full whitespace-nowrap px-2" onClick={startAi}>
                  Play versus the isle
                </Button>
                <p className="text-xs text-muted">3 bots, no network</p>
              </div>
              <div className="flex flex-1 flex-col items-center gap-1">
                <Button size="sm" variant="outline" className="w-full whitespace-nowrap px-2" onClick={() => startHotseat(4)}>
                  Four seats, one table
                </Button>
                <p className="text-xs text-muted">pass one device around</p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" onClick={(e) => setHowTo(!howTo, e.currentTarget)}>
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
      {howTo ? <HowTo onClose={() => setHowTo(false)} /> : null}
    </>
  );
}

function Lobby() {
  const code = useGame((s) => s.code);
  const seats = useGame((s) => s.seats);
  // The welcome flag goes stale when the host leaves; the live seat list is the truth (#249).
  const isHost = useGame((s) => s.seats.find((x) => x.id === s.seatId)?.host ?? s.isHost);
  const error = useGame((s) => s.error);
  const setReady = useGame((s) => s.setReady);
  const startTable = useGame((s) => s.startTable);
  const goTitle = useGame((s) => s.goTitle);
  const [ready, setReadyLocal] = useState(false);
  const { state: copied, copy } = useCopy<"code" | "link">();
  // #304: the join link. `?host=` is kept so a Vite dev page's link still dials the same host (src/lib/net/table.ts hostUrl).
  const copyLink = () => {
    const host = new URLSearchParams(location.search).get("host");
    copy("link", `${location.origin}${location.pathname}?code=${code}${host ? `&host=${encodeURIComponent(host)}` : ""}`);
  };
  const canStart = isHost && seats.length >= 3 && seats.length <= 4 && seats.every((s) => s.ready);
  // #418: what is still needed before Start appears, read off the seat list (docs/BUILD_BIBLE.md §3.3: 3 or 4 play).
  const missing = 3 - seats.length;
  const readyCount = seats.filter((s) => s.ready).length;
  const status =
    missing > 0
      ? `Need ${missing} more player${missing === 1 ? "" : "s"}`
      : readyCount < seats.length
        ? `${readyCount} of ${seats.length} ready`
        : "Everyone is ready";
  const { phone, portrait } = useViewport();
  const sheet = phone && portrait;

  return (
    <div
      data-testid="lobby-card"
      className={cn(
        "absolute z-10 flex flex-col",
        sheet
          ? "inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[55vh]"
          : "bottom-5 left-5 top-5 w-full max-w-sm sm:bottom-6 sm:left-10 sm:top-6",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[20px] border border-white/50 bg-white/45 p-5 backdrop-blur-md sm:p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-sea-ink">Table code</p>
        <div className="mt-1 flex items-center gap-3">
          <p data-testid="table-code" className="font-display text-6xl tracking-[0.2em]">
            {code}
          </p>
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="outline" onClick={() => copy("code", code)}>
              {copied?.ok && copied.what === "code" ? "Copied" : "Copy"}
            </Button>
            <Button size="sm" variant="outline" onClick={copyLink}>
              {copied?.ok && copied.what === "link" ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
        <CopyFallback state={copied} label={copied?.what === "link" ? "Join link" : "Table code"} className="mt-2" />
        <ul className="mt-5 flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => {
            const s = seats[i];
            return (
              <li key={i} className="relative flex items-center gap-3 rounded-[12px] border border-border bg-surface px-3 py-2">
                <span className="size-3 rounded-full ring-1 ring-inset ring-black/25" style={{ background: s?.color ?? "transparent" }} />
                <span className="flex-1 text-sm">
                  {s ? s.name : "Empty"}
                  {s?.host ? <span data-testid="host-tag" className="text-xs text-muted"> · host</span> : null}
                </span>
                {s ? <span className="text-xs text-muted">{s.away ? "reconnecting…" : s.ready ? "Ready" : "Waiting"}</span> : null}
                {s ? <ReactionFloats by="seat" id={s.id} /> : null}
              </li>
            );
          })}
        </ul>
        {/* #417: the chat log is the one flexible piece (down to about 2 rows), so at 1280x720 Start and Leave stay inside the card. */}
        <div className="mt-2 flex min-h-32 flex-col rounded-[12px] border border-border bg-surface p-2">
          <ChatBox rows={6} />
        </div>
        {/* #389: on a phone Ready/Start stay pinned to the bottom of the card; a fade above them says the rest scrolls. */}
        <div
          data-testid="lobby-actions"
          className={cn(
            "mt-3 flex flex-col gap-2",
            sheet &&
              "sticky -bottom-5 z-10 -mx-5 -mb-5 bg-surface px-5 pb-5 pt-2 before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-gradient-to-t before:from-surface before:to-transparent",
          )}
        >
          {/* #418: one line on what is still needed, in the slot the "sat down" echo had (the seat rows already say who is here). */}
          <p data-testid="lobby-status" aria-live="polite" className="min-h-5 text-center text-xs text-muted">
            {error ?? status}
          </p>
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
