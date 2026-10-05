import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Dices,
  Home,
  Landmark,
  Route,
  ScrollText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatDock, ChromeLanded, FortuneTray, HowTo, sheets, TradePanel, WinScreen } from "@/components/game/chunks";
import { TradeToast } from "@/components/game/TradeToast";
import { WinFailed } from "@/components/game/WinFailed";
import { Announcer } from "@/components/game/Announcer";
import { PlayerMenu } from "@/components/game/PlayerMenu";
import { SeatRail, SeatStrip } from "@/components/game/SeatRail";
import { DiscardBar } from "@/components/game/DiscardBar";
import { TurnCountdown } from "@/components/game/TurnCountdown";
import { Dice, RollMoment } from "@/components/game/Dice";
import { TableMenu } from "@/components/game/TableMenu";
import { HandDock } from "@/components/game/Hand";
import { COST, RESOURCES, type BuildMode, type PlayerState } from "@/lib/game/types";
import { hiddenCount, playable, totalVP } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { play } from "@/lib/sound";
import { LazyBoundary, preloadOnIdle } from "@/lib/lazy";
import { useViewport } from "@/lib/viewport";
import { useMoreBelow } from "@/lib/scroll-fade";
import { cn } from "@/lib/utils";

function affords(p: PlayerState, kind: Price) {
  return RESOURCES.every((r) => p.resources[r] >= (COST[kind][r] ?? 0));
}

function phaseCopy(phase: string) {
  switch (phase) {
    case "rollOff":
      return "Roll one die for first place. The highest roll places first; a tie rolls again.";
    case "setupSettle":
      return "Place an outpost on a highlighted corner.";
    case "setupRoad":
      return "Lay a path from that outpost.";
    case "roll":
      return "Roll the dice to gather from the land.";
    case "discard":
      return "Too many goods. Discard half, rounded down.";
    case "robber":
      return "Move the wayfarer onto another hex.";
    case "main":
      return "Build, trade with the bank, or end your turn.";
    case "over":
      return "The isle has a ruler.";
    default:
      return "";
  }
}

// What to pick, and the label of the button that armed it (a touch screen cancels by tapping that button again).
function armedCopy(mode: BuildMode, roadPicks: number): [string, string] | null {
  switch (mode) {
    case "path":
      return ["Pick a glowing edge", "Path"];
    case "outpost":
      return ["Pick a glowing corner", "Outpost"];
    case "stronghold":
      return ["Pick an outpost to upgrade", "Stronghold"];
    // #423: both fortunes are armed from the tray, and the Fortunes button stays pressed until the pick is made or cancelled.
    case "knight":
      return ["Pick a hex for the wayfarer", "Fortunes"];
    case "roadCard":
      return [roadPicks ? "Pick one more path" : "Pick two paths", "Fortunes"];
    default:
      return null;
  }
}

const HINT_KEY = "emberisle-landscape-hint";

type Price = keyof typeof COST;

function priceLabel(kind: Price) {
  const name = { path: "Path", outpost: "Outpost", stronghold: "Stronghold", card: "Fortune" }[kind];
  return `${name} · ${RESOURCES.filter((r) => COST[kind][r]).map((r) => `${COST[kind][r]} ${r}`).join(", ")}`;
}

// Escape, topmost layer first. One press closes exactly one thing:
//   1. TableMenu (and its Leave question): window capture + stopPropagation (it closes whenever HowTo opens, so the two never stack).
//   2. HowTo: modal, so window capture + stopPropagation; nothing behind it hears the key.
//   3. TradePanel (window) and PlayerMenu (document), bubble phase, each closes itself; PlaceChip's pending tap (window) likewise.
//   4. Disarming a build mode: window capture, but it stands down when 1-3 are open or the key came from a text field
//      (the chat box minimizes itself), because the layers above run later in the same event and must still see their own state.
function useEscapeDisarm() {
  const setBuildMode = useGame((s) => s.setBuildMode);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = useGame.getState();
      if (s.buildMode === "none" || s.tradeOpen || s.menuFor || s.pendingPlace || s.howTo) return;
      if ((e.target as HTMLElement | null)?.closest("input, select, textarea")) return;
      if (document.querySelector('[data-testid="table-menu"]')) return;
      play("ui_back");
      setBuildMode("none");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [setBuildMode]);
}

// The rules' roll line ("Tide rolls 4+5 = 9."): the dice row already shows the roll, so the log line skips it (#440).
const ROLL_LOG = / rolls \d\+\d = \d+\.$/;

// Unaffordable build buttons use aria-disabled, not disabled, so Tab still reaches them and the price is read out.
const UNAFFORDABLE = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:active:scale-100";

export function Hud() {
  const state = useGame((s) => s.state);
  const localId = useGame((s) => s.localId);
  const mode = useGame((s) => s.mode);
  const buildMode = useGame((s) => s.buildMode);
  const roadPicks = useGame((s) => s.roadPicks);
  const banner = useGame((s) => s.banner);
  const error = useGame((s) => s.error);
  const howTo = useGame((s) => s.howTo);
  const chatOpen = useGame((s) => s.chatOpen);
  const tradeOpen = useGame((s) => s.tradeOpen);
  const dispatch = useGame((s) => s.dispatch);
  const setBuildMode = useGame((s) => s.setBuildMode);
  const setHowTo = useGame((s) => s.setHowTo);
  const menuFor = useGame((s) => s.menuFor);
  const openMenu = useGame((s) => s.openMenu);
  // A watcher (docs/design/spectator.md): `me` below falls back to seat 0, so its hand bar is hidden by this flag, never by `localId`.
  const spectator = useGame((s) => s.spectator);
  const { phone, portrait } = useViewport();
  // #422: a sideways phone stacks the HUD in a full-height left column, so the island fills the height beside it.
  const column = phone && !portrait;
  const [hintDismissed, setHintDismissed] = useState(() => sessionStorage.getItem(HINT_KEY) === "1");
  // #492: the sheets chunk failed with the game over, so the win screen cannot show; the winner line gets the way out.
  const [sheetsLost, setSheetsLost] = useState(false);
  useEscapeDisarm();
  const [stackRef, moreBelow] = useMoreBelow();
  useEffect(() => preloadOnIdle(sheets.prefetch), []);
  // #423: the fortune tray is open until a fortune is played, it is closed, the phase moves (a roll with the tray up) or the
  // turn moves on (hotseat: to the next seat); it never comes back on its own.
  const [fortunesOpen, setFortunesOpen] = useState(false);
  const fortunesButton = useRef<HTMLButtonElement>(null);
  const turnKey = state ? `${state.turn}|${state.current}|${state.phase}` : "";
  useEffect(() => setFortunesOpen(false), [turnKey]);

  if (!state) return null;
  const actor = mode === "hotseat" ? state.current : localId;
  const me = state.players.find((p) => p.id === actor) ?? state.players[0]!;
  const mine = state.current === actor;
  // A watcher's `me` is seat 0 in the opponent view, which has no `resources`, so the flag is checked first.
  const fortuneBlocked = spectator || (state.deckLeft ?? state.deck.length) <= 0 || !affords(me, "card");
  // Hotseat has no bots: the first seat still owing a discard takes the bar, whoever rolled the 7.
  const discarder =
    state.phase !== "discard"
      ? null
      : mode === "hotseat"
        ? (state.players.find((p) => (state.discardNeeded[p.id] ?? 0) > 0)?.id ?? null)
        : (state.discardNeeded[actor] ?? 0) > 0
          ? actor
          : null;
  // #423: one "Fortunes ×N" button opens the tray. In `main` it shows whenever a fortune is held; before the roll only a
  // wayfarer can be played (#218), so it shows only then. While a fortune's pick is armed it stays pressed, and pressing it cancels.
  const fortuneArmed = buildMode === "knight" || buildMode === "roadCard";
  const fortunesShown =
    mine && hiddenCount(me) > 0 && (state.phase === "main" || (state.phase === "roll" && !state.playedCard && playable(me, "knight") > 0));
  const fortunes = fortunesShown ? (
    <Button
      ref={fortunesButton}
      size="sm"
      data-testid="fortunes-button"
      className={phone ? "h-11 min-w-11" : undefined}
      aria-pressed={fortunesOpen || fortuneArmed}
      aria-expanded={fortunesOpen}
      variant={fortunesOpen || fortuneArmed ? "primary" : "secondary"}
      onClick={() => {
        if (fortuneArmed) return setBuildMode("none");
        setFortunesOpen((o) => !o);
      }}
    >
      Fortunes ×{hiddenCount(me)}
    </Button>
  ) : null;
  // Hotseat has no "you": every seat is named. The turn banner sits out once the isle has a ruler (the pill says who).
  const subject = state.phase === "discard" && discarder ? discarder : state.current;
  const subjectPlayer = state.players.find((p) => p.id === subject) ?? state.players[0]!;
  const yours = mode !== "hotseat" && subject === actor;
  // #419: an armed build says what to pick and how to cancel (a touch screen has no Esc key).
  const armed = mine ? armedCopy(buildMode, roadPicks.length) : null;
  const phaseText = armed
    ? `${armed[0]} · ${matchMedia("(pointer: coarse)").matches ? `tap ${armed[1]} again to cancel` : "Esc cancels"}`
    : yours && state.phase === "discard"
      ? `discard ${state.discardNeeded[subject] ?? 0}`
      : yours && state.phase === "robber"
        ? "move the wayfarer"
        : phaseCopy(state.phase);
  // #430: in hotseat a seat that owes a discard on another seat's turn is named, not given the turn.
  const turnText =
    !yours && subject !== state.current
      ? `${subjectPlayer.name} — discard ${state.discardNeeded[subject] ?? 0}`
      : `${yours ? "Your" : `${subjectPlayer.name}'s`} turn — ${phaseText}`;
  const winner = state.winner ? state.players.find((p) => p.id === state.winner) : null;
  const menuPlayer = menuFor ? state.players.find((p) => p.id === menuFor) : null;
  // #422: on the player's own Roll or End row the dice ride beside the button instead of taking a row of their own.
  const dice = state.dice ? <Dice values={state.dice} /> : null;
  const diceInBar = mine && /^(main|roll)/.test(state.phase);
  // #491: in the column End turn is its own row pinned to the bottom of the scroller on a solid ground, so it never scrolls out of reach.
  const pinEnd = column && state.phase === "main" && mine;

  const endRow = (
    <div className={cn("flex gap-2 *:self-center", column ? "sticky bottom-0 z-10 justify-end rounded-[16px] bg-surface p-1" : "ml-auto")}>
      {dice}
      <Button size="sm" variant="sea" className={phone ? "h-11" : undefined} onClick={() => dispatch({ type: "endTurn" })}>
        End turn
      </Button>
    </div>
  );

  return (
    <>
      {column ? null : <PlaceChip />}
      {/* #442: one control up top. The turn number, watcher count, How to play, sound and Leave live in the menu, whose open
          sheet rises over the z-20 chat dock (it reaches the header on a sideways phone). A watcher's badge stays out here,
          a chip and not a button, so a watcher always sees why it has no controls (docs/design/spectator.md). */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 px-safe pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] has-[#table-menu]:z-30">
        <div className="pointer-events-auto flex items-center justify-end gap-2">
          {phone && !portrait ? <SeatStrip actor={actor} className="min-w-0 max-w-[48rem] flex-1" /> : null}
          {spectator ? (
            <span data-testid="watching-badge" className="flex h-11 items-center rounded-chip bg-glass px-3 text-caption text-fg backdrop-blur-md">
              Watching
            </span>
          ) : null}
          <TableMenu />
        </div>
      </header>

      {phone && portrait ? (
        <SeatStrip
          actor={actor}
          className="absolute left-safe right-safe top-[calc(env(safe-area-inset-top)+4.25rem)] z-10"
        />
      ) : null}
      {phone && menuPlayer ? (
        <PlayerMenu
          player={menuPlayer}
          className={cn(
            "absolute z-20",
            portrait ? "left-safe right-safe top-[calc(env(safe-area-inset-top)+7.25rem)]" : "right-safe top-16 w-72",
          )}
        />
      ) : null}

      {phone ? null : <SeatRail actor={actor} />}

      {/* #488: the dock comes from the online chunk the lobby already loaded, so it is in the HUD's first frame (tabs-prove).
          A watcher or a rejoin can still be loading it; if that fails the table stands without a dock, and it tries again
          when the chat is next opened or closed. */}
      {mode === "online" ? (
        <LazyBoundary failed={null} retryKey={String(chatOpen)}>
          <ChatDock />
          <ChromeLanded />
        </LazyBoundary>
      ) : null}
      <TradeToast />
      <Announcer />
      <RollMoment />

      <div className="pointer-events-none absolute bottom-0 inset-x-0 z-10 px-safe pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className={cn("relative", column ? "w-80 max-w-[48vw]" : "mx-auto max-w-3xl")}>
          {/* #459: floats above the stack, so it coming and going never reflows the turn banner. */}
          {banner ? (
            <p
              role="status"
              data-testid="banner"
              className={cn(
                "pointer-events-none absolute inset-x-0 animate-[turn-fade_200ms_ease-out] rounded-[16px] border border-accent/40 bg-surface px-3 py-2 text-center text-sm font-medium text-zinc-900",
                // #422: beside the column, over the top of the hole, as it floats over the board above the stack elsewhere.
                column ? "left-full top-0 ml-3 w-max max-w-[calc(100vw-21.5rem-max(0.75rem,env(safe-area-inset-left))-max(0.75rem,env(safe-area-inset-right)))]" : "bottom-full mb-2",
              )}
            >
              {banner}
            </p>
          ) : null}
          <div
            ref={stackRef}
            className={cn(
              "pointer-events-auto flex flex-col gap-2 overflow-y-auto overscroll-contain",
              // #383: stop under the header (or the portrait seat strip) and leave the island at least ~8 rem.
              // #422: the column runs from under the header to the bottom edge every phase, so the hole beside it never moves.
              column
                ? "h-[calc(100dvh-4.25rem-max(0.75rem,env(safe-area-inset-bottom)))] scroll-pb-16 rounded-b-[16px] [&>:first-child]:mt-auto"
                : portrait ? "max-h-[calc(100dvh-16rem)]" : "max-h-[calc(100dvh-13rem)]",
            )}
          >
            {/* #422: in the column the Place chip is the first row, so it never covers the hand or the turn banner. Not
                pointer-events-none: a porous child would make the stack's chrome only its parts, and the column no rail. */}
            {column ? <PlaceChip column /> : null}
            {phone && portrait && !hintDismissed ? (
              <p
                data-testid="landscape-hint"
                className="pointer-events-none flex h-11 items-center justify-between gap-2 rounded-[16px] border border-white/50 bg-glass pl-3 text-sm text-zinc-900 backdrop-blur-md"
              >
                Turn the phone sideways to see the whole isle.
                <button
                  type="button"
                  aria-label="Dismiss"
                  data-testid="landscape-hint-dismiss"
                  className="pointer-events-auto flex size-11 items-center justify-center"
                  onClick={() => {
                    sessionStorage.setItem(HINT_KEY, "1");
                    setHintDismissed(true);
                  }}
                >
                  <X className="size-4" />
                </button>
              </p>
            ) : null}
            {state.phase === "over" ? null : (
              <p
                key={`turn-${state.current}`}
                data-testid="turn-banner"
                style={{ borderLeftColor: yours ? undefined : subjectPlayer.color }}
                className={cn(
                  "animate-[turn-fade_200ms_ease-out] rounded-[16px] border bg-glass px-3 py-2 text-sm font-medium text-zinc-900 backdrop-blur-md",
                  // #424: the accent tint is a layer over the glass, not a replacement for it.
                  yours ? "border-accent bg-linear-to-r from-accent/20 to-accent/20" : "border-white/50 border-l-4",
                )}
              >
                {turnText}
              </p>
            )}
            <TurnCountdown />
            {winner || error ? (
              <p className="rounded-[16px] border border-white/50 bg-glass px-3 py-2 text-sm text-zinc-900 backdrop-blur-md">
                {winner ? <span id="hud-winner">{`${winner.name} wins with ${totalVP(state, winner.id)} points.`}</span> : null}
                {winner && sheetsLost ? <WinFailed /> : null}
                {error ? <span className={cn("block text-orange-700", winner && "mt-1")}>{error}</span> : null}
              </p>
            ) : null}

            {spectator ? null : <HandDock me={me} phase={state.phase} />}

            {discarder ? <DiscardBar key={`discard-${discarder}`} id={discarder} n={state.discardNeeded[discarder]!} /> : null}
            <TakeFromBar />

            {state.phase === "main" && mine ? (
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["path", "path", Route, "Path", me.pathsLeft],
                    ["outpost", "outpost", Home, "Outpost", me.outpostsLeft],
                    ["stronghold", "stronghold", Landmark, "Stronghold", me.strongholdsLeft],
                  ] as const
                ).map(([kind, arm, Icon, label, left]) => {
                  const blocked = left <= 0 || !affords(me, kind);
                  return (
                  <Button
                    key={kind}
                    size="sm"
                    variant={buildMode === arm ? "primary" : "secondary"}
                    className={cn(UNAFFORDABLE, phone && "h-11 min-w-11")}
                    aria-pressed={buildMode === arm}
                    aria-disabled={blocked || undefined}
                    title={priceLabel(kind)}
                    aria-description={priceLabel(kind)}
                    onClick={() => {
                      // aria-disabled keeps the button focusable, so the click itself must refuse (but may still disarm).
                      if (blocked && buildMode !== arm) return;
                      setBuildMode(buildMode === arm ? "none" : arm);
                    }}
                  >
                    <Icon className="size-4" /> {label}
                  </Button>
                  );
                })}
                <Button
                  size="sm"
                  variant="secondary"
                  className={cn(UNAFFORDABLE, phone && "h-11 min-w-11")}
                  aria-disabled={fortuneBlocked || undefined}
                  title={priceLabel("card")}
                  aria-description={priceLabel("card")}
                  onClick={() => {
                    if (!fortuneBlocked) dispatch({ type: "buyCard" });
                  }}
                >
                  <ScrollText className="size-4" /> Fortune
                </Button>
                <TradeButton />
                {fortunes}
                {column ? null : endRow}
              </div>
            ) : null}
            {pinEnd ? endRow : null}

            {(state.phase === "roll" || state.phase === "rollOff") && mine ? (
              <div className="flex flex-col gap-2">
                {fortunes ? <div className="flex flex-wrap gap-1">{fortunes}</div> : null}
                <div className="flex gap-2 *:self-center">
                  {dice}
                  <Button size="lg" className="flex-1" onClick={() => dispatch({ type: "roll" })}>
                    <Dices className="size-5" /> Roll
                  </Button>
                </div>
              </div>
            ) : null}

            {diceInBar ? null : dice}

            <p
              data-testid="log-line"
              className="hidden max-h-16 shrink-0 overflow-y-auto rounded-[16px] bg-glass px-3 py-1 text-xs text-zinc-700 backdrop-blur-md sm:block short:hidden"
            >
              {state.log.filter((l) => !ROLL_LOG.test(l)).slice(-3).join(" · ")}
            </p>
          </div>
          {/* #423: the tray rises over the stack from its bottom edge and may cover the island, like a sheet, but never the
              header or the portrait seat strip; it is inside the sheets chunk, which the table prefetched on idle (#488). */}
          {fortunes && fortunesOpen ? (
            <LazyBoundary failed={<TrayFailed close={() => setFortunesOpen(false)} />}>
              <FortuneTray
                me={me}
                opener={fortunesButton.current}
                onClose={() => setFortunesOpen(false)}
                className={
                  column
                    ? "max-h-full"
                    : portrait
                      ? "max-h-[calc(100dvh-7.25rem-env(safe-area-inset-top)-max(0.75rem,env(safe-area-inset-bottom)))]"
                      : "max-h-[calc(100dvh-5rem-env(safe-area-inset-top)-max(0.75rem,env(safe-area-inset-bottom)))]"
                }
              />
            </LazyBoundary>
          ) : null}
          {moreBelow ? (
            <div
              data-testid="hud-more-below"
              aria-hidden
              className={cn("pointer-events-none absolute inset-x-0 h-8 bg-gradient-to-t from-zinc-900/40 to-transparent", pinEnd ? "bottom-13" : "bottom-0")}
            />
          ) : null}
        </div>
      </div>

      {/* #488: the trade panel, How to play and the win screen share one lazy chunk, fetched on idle once the table is up.
          If it fails the table stands with no sheet; SheetsFailed drops the open flags so the next tap tries again. */}
      <LazyBoundary failed={<SheetsFailed onLost={setSheetsLost} />} retryKey={`${tradeOpen}|${howTo}|${state.winner ?? ""}`}>
        <TradePanel />
        {howTo ? <HowTo onClose={() => setHowTo(false)} /> : null}
        <WinScreen />
        <ChromeLanded />
      </LazyBoundary>

      <p className="sr-only">
        Costs: path {COST.path.timber} timber {COST.path.clay} clay. Outpost timber clay wool grain. Stronghold 3 grain 2
        ore.
      </p>
    </>
  );
}

function TakeFromBar() {
  const state = useGame((s) => s.state);
  const pendingSteal = useGame((s) => s.pendingSteal);
  const chooseSteal = useGame((s) => s.chooseSteal);
  if (!state || !pendingSteal) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[16px] border border-accent/40 bg-surface p-2">
      <span className="text-sm">Take from whom?</span>
      {pendingSteal.targets.map((id) => {
        const p = state.players.find((x) => x.id === id);
        if (!p) return null;
        return (
          <Button key={id} size="sm" variant="secondary" onClick={() => chooseSteal(id)}>
            <span className="mr-1 inline-block size-2.5 rounded-full" style={{ background: p.color }} />
            {p.name}
          </Button>
        );
      })}
    </div>
  );
}

// A column scrolled down to a fortune brings the Place chip back into view. Stable, so it runs when the chip mounts, not on
// every render while a placement is pending (which would undo the player's own scrolling).
const intoView = (el: HTMLElement | null) => el?.scrollIntoView({ block: "nearest" });

// Coarse pointers pick a mark, then confirm here (docs/design/mobile-camera-touch.md). Enter confirms, Esc cancels.
function PlaceChip({ column }: { column?: boolean }) {
  const pending = useGame((s) => s.pendingPlace);
  const confirmPlace = useGame((s) => s.confirmPlace);
  const setPendingPlace = useGame((s) => s.setPendingPlace);
  useEffect(() => {
    if (!pending) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Enter") confirmPlace();
      if (e.key === "Escape") setPendingPlace(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [pending, confirmPlace, setPendingPlace]);
  if (!pending) return null;
  return (
    <div
      ref={column ? intoView : undefined}
      className={
        column
          ? "flex shrink-0 items-center gap-3"
          : "pointer-events-none absolute inset-x-0 bottom-[max(11rem,calc(env(safe-area-inset-bottom)+10.5rem))] z-20 flex items-center justify-end gap-3 px-safe"
      }
    >
      <button type="button" className="pointer-events-auto h-11 px-2 text-sm text-fg underline" onClick={() => setPendingPlace(null)}>
        Cancel
      </button>
      <button
        type="button"
        data-testid="place-chip"
        className="pointer-events-auto h-11 min-w-[88px] rounded-[12px] bg-fg px-4 text-bg"
        onClick={confirmPlace}
      >
        Place
      </button>
    </div>
  );
}

// The sheets chunk did not load: close what was asked for, so How to play or Trade can be pressed again and retry, and
// tell the HUD, whose winner line offers the way out while the win screen cannot show (#492).
function SheetsFailed({ onLost }: { onLost: (lost: boolean) => void }) {
  const setHowTo = useGame((s) => s.setHowTo);
  const setTradeOpen = useGame((s) => s.setTradeOpen);
  useEffect(() => {
    setHowTo(false);
    setTradeOpen(false);
    onLost(true);
    return () => onLost(false);
  }, [setHowTo, setTradeOpen, onLost]);
  return null;
}

// The same for the fortune tray: the next press of Fortunes mounts it again and tries the network again.
function TrayFailed({ close }: { close: () => void }) {
  useEffect(close, [close]);
  return null;
}

function TradeButton() {
  const setTradeOpen = useGame((s) => s.setTradeOpen);
  return (
    <Button size="sm" variant="secondary" onClick={(e) => setTradeOpen(true, e.currentTarget)}>
      <ArrowLeftRight className="size-4" /> Trade
    </Button>
  );
}
