import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { Dices } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BuildList, buildList, ChatControls, ChatDock, ChromeLanded, CostCard, DiscardBar, FirstGameCoach, FortuneTray, HowTo, losses, MyNumbers, sheets, TakeFromBar, TradePanel, tradeToast, TradeToast, TurnMoment, WinScreen } from "@/components/game/chunks";
import { WinFailed } from "@/components/game/WinFailed";
import { Announcer } from "@/components/game/Announcer";
import { PlayerMenu } from "@/components/game/PlayerMenu";
import { SeatRail, SeatStrip } from "@/components/game/SeatRail";
import { TurnCountdown } from "@/components/game/TurnCountdown";
import { Dice, RollMoment } from "@/components/game/Dice";
import { TableMenu } from "@/components/game/TableMenu";
import { HandDock } from "@/components/game/Hand";
import { PlaceChip } from "@/components/game/PlaceChip";
import { SheetsFailed } from "@/components/game/SheetsFailed";
import { TrayFailed } from "@/components/game/TrayFailed";
import { TradeButton } from "@/components/game/TradeButton";
import { buildStatus, type Price } from "@/components/game/BuildCost";
import { useEscapeDisarm } from "@/components/game/escape-disarm";
import { COST, RESOURCES, type BuildMode, type GameState, type PlayerState } from "@/lib/game/types";
import { playable, totalVP } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { LazyBoundary, preloadOnIdle } from "@/lib/lazy";
import { useViewport } from "@/lib/viewport";
import { useMoreBelow } from "@/lib/scroll-fade";
import { cn } from "@/lib/utils";

const PRICES = Object.keys(COST) as Price[];

function phaseCopy(phase: string) {
  switch (phase) {
    case "rollOff":
      return "Roll for first place";
    case "setupSettle":
      return "Place an outpost · tap a glowing corner";
    case "setupRoad":
      return "Place a path · tap a glowing edge";
    case "roll":
      return "Roll the dice";
    case "discard":
      return "Discard goods";
    case "robber":
      return "Move the wayfarer";
    case "main":
      // #1539: the three buttons under the hand say what a turn can do; the line only says whose it is.
      return "Your turn";
    case "over":
      return "The isle has a ruler.";
    default:
      return "";
  }
}

// Another seat's turn, seen from this one (online, practice, a watcher): whose turn it is and that this seat waits.
function waitingCopy(phase: string, name: string) {
  switch (phase) {
    case "rollOff":
      return `Wait for ${name} to roll for first place`;
    case "setupSettle":
      return `Wait for ${name} to place an outpost`;
    case "setupRoad":
      return `Wait for ${name} to place a path`;
    case "roll":
      return `Wait for ${name} to roll`;
    case "discard":
      return "Wait for discards";
    case "robber":
      return `Wait for ${name} to move the wayfarer`;
    default:
      return `Wait for ${name} to build or trade`;
  }
}

// What to pick, and the label of the button that armed it (a touch screen cancels by tapping that button again).
function armedCopy(mode: BuildMode, roadPicks: number): [string, string] | null {
  switch (mode) {
    case "path":
      return ["Place a path", "Path"];
    case "outpost":
      return ["Place an outpost", "Outpost"];
    case "stronghold":
      return ["Pick a home to upgrade", "Upgrade"];
    // #423: both fortunes are armed from the tray, and the My fortunes button stays pressed until the pick is made or cancelled.
    case "knight":
      return ["Move the wayfarer", "Play fortune"];
    case "roadCard":
      return [roadPicks ? "Place one more path" : "Place two paths", "Play fortune"];
    default:
      return null;
  }
}

// #954: practice and hotseat have no chat. While the newest lines are that roll's goods and awards, the chip shows the roll.
const HUD_ASIDE = / — .+'s roll[;.]| (holds|loses) the (longest path|largest army)\.$/;
function hudRollChip(lines: { text: string }[], mine: string) {
  const last = lines.at(-1)?.text;
  if (!last || / claims the isle |^The isle is settled/.test(last)) return null;
  let i = lines.length - 1;
  while (i >= 0 && HUD_ASIDE.test(lines[i]!.text)) i -= 1;
  const roll = /^(.+) rolled (1[0-2]|[2-9])!$/.exec(lines[i]?.text ?? "");
  if (!roll) return null;
  const sum = +roll[2]!;
  return { name: roll[1]!, sum, own: mine !== "" && roll[1] === mine, hot: sum === 6 || sum === 8 };
}


// A build the hand can pay for with a legal spot waiting: a small warm dot on the button's corner (docs/design/polish.md: no glows).
// #606: the corner check badge on a Ready chip (the chip's own fill and outline are in styles.css).
const READY_DOT = (
  <span aria-hidden className="build-ready-mark absolute right-0 top-0 flex size-4 items-center justify-center rounded-full ">
    <svg viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5.4 4.1 7.5 8 3" /></svg>
  </span>
);

// A sideways column scrolled away from its foot brings Cancel and Place back into view. Stable, so it runs when the row mounts.
const intoView = (el: HTMLElement | null) => el?.scrollIntoView({ block: "nearest" });

function LossesFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      data-testid="losses-failed"
      role="alert"
      className="flex items-center justify-between gap-3 rounded-[16px] border border-white/50 bg-glass px-4 py-2 text-sm text-zinc-900 backdrop-blur-md"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-[10px] bg-zinc-900 px-3 py-1 font-medium text-white hover:bg-zinc-800"
      >
        Try again
      </button>
    </div>
  );
}

export function Hud() {
  const gameLog = useGame((s) => s.gameLog);
  const state = useGame((s) => s.state);
  const localId = useGame((s) => s.localId);
  const mode = useGame((s) => s.mode);
  const buildMode = useGame((s) => s.buildMode);
  const roadPicks = useGame((s) => s.roadPicks);
  const tradeVisible = useGame((s) => !!s.offer || !!s.tradeOutcome);
  const tradeOutcome = useGame((s) => s.tradeOutcome);
  const banner = useGame((s) => s.banner);
  const error = useGame((s) => s.error);
  const howTo = useGame((s) => s.howTo);
  const costs = useGame((s) => s.costs);
  const setCosts = useGame((s) => s.setCosts);
  const chatOpen = useGame((s) => s.chatOpen);
  const tradeOpen = useGame((s) => s.tradeOpen);
  const dispatch = useGame((s) => s.dispatch);
  const choosing = useGame((s) => !!s.pendingSteal);
  const setBuildMode = useGame((s) => s.setBuildMode);
  const setHowTo = useGame((s) => s.setHowTo);
  const menuFor = useGame((s) => s.menuFor);
  const openMenu = useGame((s) => s.openMenu);
  // A watcher (docs/design/spectator.md): `me` below falls back to seat 0, so its hand bar is hidden by this flag, never by `localId`.
  const spectator = useGame((s) => s.spectator);
  const { phone, portrait } = useViewport();
  // #422: a sideways phone stacks the HUD in a full-height left column, so the island fills the height beside it.
  const column = phone && !portrait;
  // #1509 (option A, owner card q1508-table-goal): the upright phone table has 16 px gutters, a turn line, hand and build
  // row with no boxes round them, and a last-event line with the row to itself (styles.css, `.upright-table`).
  const upright = phone && portrait;
  // #492: the sheets chunk is asked for again on each open and at the win (the boundary's key). When the ask made at the
  // win fails, the win screen cannot show and the winner line gets the way out; a failure under an earlier key is not it.
  const sheetsKey = `${tradeOpen}|${howTo}|${costs}|${state?.winner ?? ""}`;
  const [timerHeader, setTimerHeader] = useState<HTMLDivElement | null>(null);
  const [sheetsLost, setSheetsLost] = useState<string | null>(null);
  useEscapeDisarm();
  const [stackRef, moreBelow] = useMoreBelow();
  const [lossesRetry, setLossesRetry] = useState(0);
  useEffect(() => {
    const cancelSheets = preloadOnIdle(() => (void buildList.prefetch(), sheets.prefetch()));
    const cancelToast = preloadOnIdle(tradeToast.prefetch);
    const cancelLosses = preloadOnIdle(losses.prefetch);
    return () => {
      cancelSheets();
      cancelToast();
      cancelLosses();
    };
  }, []);
  // #423: the fortune tray is open until a fortune is played, it is closed, the phase moves (a roll with the tray up) or the
  // turn moves on (hotseat: to the next seat); it never comes back on its own.
  const [fortunesOpen, setFortunesOpen] = useState(false);
  // #1539: the Build list is open until a row is pressed, it is closed, or the turn or phase moves on.
  const [buildOpen, setBuildOpen] = useState(false);
  const pending = useGame((st) => st.pendingPlace);
  const confirmPlace = useGame((st) => st.confirmPlace);
  const setPendingPlace = useGame((st) => st.setPendingPlace);
  // A build or fortune left armed when the turn moves on (online the host moves it on a timeout) is dropped, so it never
  // hides Roll on this seat's next turn.
  const turnOf = state?.current;
  useEffect(() => {
    if (useGame.getState().buildMode !== "none") useGame.getState().setBuildMode("none");
  }, [turnOf]);
  // A roll is newer than a trade's outcome line ("Nobody took it."), so the outcome gives the top line back at once.
  const rolled = state?.dice?.join();
  useEffect(() => {
    if (useGame.getState().tradeOutcome) useGame.setState({ tradeOutcome: null, tradeTaker: null });
  }, [rolled]);
  const buildButton = useRef<HTMLButtonElement>(null);
  const fortunesButton = useRef<HTMLButtonElement>(null);
  const turnKey = state ? `${state.turn}|${state.current}|${state.phase}` : "";
  useEffect(() => {
    setFortunesOpen(false);
    setBuildOpen(false);
  }, [turnKey]);
  // #829: the cue glows once per turn. The button is rendered in more than one place (roll, main, robber), so a phase change
  // remounts it; a ring that mounts for a turn whose glow already started is marked done and does not animate again.
  const cueKey = state ? `${state.turn}|${state.current}` : "";
  const glowed = useRef("");
  const cueRing = useCallback((el: HTMLSpanElement | null) => {
    if (!el) return;
    if (glowed.current === cueKey) el.dataset.done = "1";
  }, [cueKey]);
  const actor = mode === "hotseat" ? (state?.current ?? "") : localId;
  const me = state ? (state.players.find((p) => p.id === actor) ?? state.players[0]!) : null;
  // #776: My fortunes leaves with the last held fortune; when that drops focus to the page, End turn takes it.
  const heldNow = state && me && !spectator ? Object.values(me.hidden).reduce((n, c) => n + c, 0) : 0;
  const fortuneArmed = buildMode === "knight" || buildMode === "roadCard";
  const showFortunes = heldNow > 0 || fortuneArmed;
  const hadFortunes = useRef(showFortunes);
  useEffect(() => {
    // Trade in the main phase, Roll in the roll phase: neither ends the turn on a stray Enter.
    if (hadFortunes.current && !showFortunes && document.activeElement === document.body) document.querySelector<HTMLElement>("[data-after-fortune]")?.focus();
    hadFortunes.current = showFortunes;
  }, [showFortunes]);
  // A build that just became ready (a roll, a trade) pulses its button once; a change of seat is not that, and a build with
  // no spot or none left never is. The key is empty on another seat's turn (buildStatus does not look at the phase, so it is the same from a roll to main), and the hand's counts are in it, so any
  // other change (a steal, the row leaving) clears a pulse instead of leaving one to fire later. A watcher's `me` is seat 0 of
  // the opponent view, which has no `resources` online (docs/design/spectator.md), so it is checked first.
  const rowShown = !!state && !!me?.resources && state.current === actor;
  const readyKey = rowShown ? `${me!.id}|${PRICES.map((k) => (buildStatus(state, me!, k).ready ? 1 : 0)).join("")}|${RESOURCES.map((r) => me!.resources[r]).join(",")}` : "";
  const wasReady = useRef(readyKey);
  const [pulse, setPulse] = useState<Price[]>([]);
  useEffect(() => {
    const [wasId, was = ""] = wasReady.current.split("|");
    const [id, now = ""] = readyKey.split("|");
    wasReady.current = readyKey;
    const newly = wasId === id ? PRICES.filter((_, i) => now[i] === "1" && was[i] === "0") : [];
    setPulse(newly);
    // The button's animationend clears it; under reduced motion no animation runs, so a timer does. (Not a timer always: a
    // frame can come late behind an island refit, and a class gone before the first frame never pulses.)
    if (!newly.length || !matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setPulse([]), 400);
    return () => clearTimeout(t);
  }, [readyKey]);

  if (!state || !me) return null;
  const mine = state.current === actor;
  // This seat, same test as the online log (Chat.tsx): hotseat's other seats are not this device's seat.
  const rollChip = hudRollChip(gameLog, spectator ? "" : (state.players.find((p) => p.id === localId)?.name ?? ""));
  // Hotseat has no bots: the first seat still owing a discard takes the bar, whoever rolled the 7.
  const discarder =
    state.phase !== "discard"
      ? null
      : mode === "hotseat"
        ? (state.players.find((p) => (state.discardNeeded[p.id] ?? 0) > 0)?.id ?? null)
        : (state.discardNeeded[actor] ?? 0) > 0
          ? actor
          : null;
  // #776: "Play fortune · N" or "Fortunes · N" opens the tray of held cards. It shows only while a fortune is held or armed, so a fresh hand has no
  // such button; the deck count lives on the Fortune buy tile.
  const deckLeft = state.deckLeft ?? state.deck.length;
  // #829: on my own turn, the fortunes I can play now (points are never played; ones bought this turn wait). The glow ring is keyed
  // on the turn, so it runs once when the turn starts and no later state change restarts it.
  const playableNow = mine && !spectator && !state.playedCard ? (["knight", "road", "plenty", "monopoly"] as const).reduce((n, k) => n + Math.max(0, playable(me, k)), 0) : 0;
  // Owner decision (#829, provisional): the label itself says a fortune can be played now.
  const fortunesLabel = playableNow > 0 ? "Play fortune" : "Fortunes";
  // #1539: in the tray's action row the button is short, "Fortune · N"; the glow says one can be played, and the read-out keeps the full label.
  const fortunes = showFortunes ? (
    <Button
      ref={fortunesButton}
      size="sm"
      data-testid="fortunes-button"
      data-deck-left={deckLeft}
      aria-label={`${fortunesLabel}, ${heldNow} held`}
      className="relative h-11 min-w-11 px-3 text-sm tabular-nums"
      aria-pressed={fortunesOpen || fortuneArmed}
      aria-expanded={fortunesOpen}
      variant={fortunesOpen || fortuneArmed ? "primary" : "secondary"}
      onClick={() => {
        if (fortuneArmed) return setBuildMode("none");
        setFortunesOpen((o) => !o);
      }}
    >
      {playableNow > 0 && <span key={cueKey} ref={cueRing} onAnimationStart={() => (glowed.current = cueKey)} aria-hidden="true" data-testid="fortune-cue-glow" className="fortune-cue-glow" />}
      Fortune · {heldNow}
    </Button>
  ) : null;
  // Hotseat has no "you": every seat is named. The turn banner sits out once the isle has a ruler (the pill says who).
  const subject = state.phase === "discard" && discarder ? discarder : state.current;
  const subjectPlayer = state.players.find((p) => p.id === subject) ?? state.players[0]!;
  const yours = mode !== "hotseat" && subject === actor && (state.phase !== "discard" || discarder !== null);
  // #419: an armed build says what to pick and how to cancel (a touch screen has no Esc key).
  // A build is armed only in the main phase; a fortune can be armed before the roll. A build left armed when a turn timed out
  // (online, the host moves the turn) must not hide Roll on the next one.
  const armed = mine && (state.phase === "main" || fortuneArmed) ? armedCopy(buildMode, roadPicks.length) : null;
  // #1539: an armed build or fortune has its own Cancel button in the action row, so a touch screen needs no hint.
  const armedNow = !!armed && !spectator;
  // #1609: a partner turn (paired turns, five and six seats) has no dice, so the line only says whose it is.
  const partner = state.role === "partner";
  const phaseText = choosing
    ? "Take from whom?"
    : armed
    ? matchMedia("(pointer: coarse)").matches ? armed[0] : `${armed[0]} · Esc cancels`
    : state.phase === "discard"
      ? `Discard ${state.discardNeeded[subject] ?? 0} goods`
      : partner ? "Your partner turn" : phaseCopy(state.phase);
  const waiting = mode !== "hotseat" && !yours;
  // #430: in hotseat a seat that owes a discard on another seat's turn is named, not given the turn.
  const turnText =
    mode === "hotseat" && (subject !== state.current || state.phase === "discard")
      ? `${phaseText} · ${subjectPlayer.name}`
      : waiting
        ? partner ? `${subjectPlayer.name}'s partner turn` : waitingCopy(state.phase, subjectPlayer.name)
        : phaseText;
  const winner = state.winner ? state.players.find((p) => p.id === state.winner) : null;
  const menuPlayer = menuFor ? state.players.find((p) => p.id === menuFor) : null;
  // #422: on the player's own Roll or End row the dice ride beside the button instead of taking a row of their own.
  const dice = state.dice ? <Dice values={state.dice} /> : null;
  const diceInBar = mine && /^(main|roll)/.test(state.phase);
  // #491: in the column End turn is its own row pinned to the bottom of the scroller on a solid ground, so it never scrolls out of reach.
  const pinEnd = column && state.phase === "main" && mine && !armedNow;
  // A watcher's `me` has no `resources` online (docs/design/spectator.md) and buys nothing, so it is checked first.
  const canBuy = !spectator && PRICES.some((k) => buildStatus(state, me, k).ready);

  const instruction = state.phase === "over" ? null : (
    <p key={`turn-${state.current}`} data-testid="turn-banner"
      // #1509: on the upright table the line has no box, so another seat's colour is a dot before it (styles.css, --seat).
      style={{ borderLeftColor: yours ? undefined : subjectPlayer.color, ...(yours ? {} : { "--seat": subjectPlayer.color }) } as CSSProperties}
      className={cn("turn-instruction rounded-control px-3 py-1.5 text-[15px] font-medium leading-5", yours ? "turn-instruction-own" : "border-l-4", !waiting && !choosing && (state.phase === "robber" || buildMode === "knight") && "turn-instruction-move")}
    >{turnText}</p>
  );

  const numbers = (
    <LazyBoundary failed={null}>
      <MyNumbers state={state} playerId={me.id} />
    </LazyBoundary>
  );
  const endRow = (
    <div className={cn("flex *:self-center", column ? "end-footer sticky z-10 justify-between gap-1 rounded-control bg-surface p-1" : "tray-end ml-auto gap-2")}>
      {/* The 260 px column has room for End turn and the dice only with the faces shrunk (they are not targets). */}
      {column ? <div className="[&>div]:gap-1 [&_[data-testid=die]]:size-6 [&_[data-testid=die]]:p-0.5 [&_[data-pip]]:size-1">{dice}</div> : null}
      <Button size="sm" variant="primary" className={cn(phone && "h-11", column && "flex-1")} onClick={() => dispatch({ type: "endTurn" })}>
        End turn
      </Button>
    </div>
  );

  return (
    <>

      {/* #442: one control up top. The turn number, watcher count, How to play, sound and Leave live in the menu, whose open
          sheet rises over the z-20 chat dock (it reaches the header on a sideways phone). Online, Open chat (#899: the one chat button)
          sits in this row too, left of the menu, so it never moves with the turn and never reaches the board. A watcher's badge stays out here,
          a chip and not a button, so a watcher always sees why it has no controls (docs/design/spectator.md). */}
      <header className={cn("hud-header pointer-events-none absolute inset-x-0 top-0 z-20 px-safe pt-[max(0.75rem,env(safe-area-inset-top))] has-[#table-menu]:z-30", phone ? "pb-0" : "pb-3", upright && "upright-table")}>
        <div className="pointer-events-auto flex items-center justify-end gap-1">
          {phone ? <SeatStrip actor={actor} className="min-w-0 max-w-[48rem] flex-1" /> : <div className="mr-auto shrink-0" />}
          {phone ? null : <div ref={setTimerHeader} className="mx-2 min-w-0 flex-1 empty:hidden" />}
          {spectator && !(phone && portrait) ? (
            <span data-testid="watching-badge" className="flex h-11 items-center rounded-chip bg-glass px-3 text-caption text-fg backdrop-blur-md">
              Watching
            </span>
          ) : null}
          {mode === "online" && !portrait ? (
            <LazyBoundary failed={null} retryKey={String(chatOpen)}>
              <ChatControls />
            </LazyBoundary>
          ) : null}
          <span data-coach-skip-slot className="shrink-0 empty:hidden" />
          <TableMenu />
        </div>
      </header>

      {phone && portrait && (mode === "online" || spectator) ? (
        <div className="hud-utilities upright-table pointer-events-none absolute right-safe top-[calc(max(0.75rem,env(safe-area-inset-top))+3rem)] z-20 flex gap-1">
          {spectator ? <span data-testid="watching-badge" className="pointer-events-auto flex h-11 items-center rounded-control bg-surface px-3 text-caption text-fg">Watching</span> : null}
          {mode === "online" ? <LazyBoundary failed={null} retryKey={String(chatOpen)}><ChatControls /></LazyBoundary> : null}
        </div>
      ) : null}
      {/* #1420: a bottom sheet, so the trade rows sit under the thumb. Upright it spans the screen and its top edge stays in
          the bottom half; sideways it is 320 px at the left, over the dock column and clear of the island. */}
      {phone && menuPlayer ? (
        <PlayerMenu
          player={menuPlayer}
          sheet
          className={cn(
            // The bottom room is a border, not padding: a border is outside the scrollport, so rows that scroll never pass under the home bar.
            "absolute bottom-0 z-30 rounded-b-none border-b-[length:max(1rem,env(safe-area-inset-bottom))] border-b-surface p-4 pb-0 shadow-[var(--shadow-sheet)]",
            portrait ? "inset-x-0 max-h-[50dvh] border-x-0 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]" : "left-safe max-h-[70dvh] w-80",
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
      <Announcer />
      <RollMoment />
      {/* If the moments' chunk cannot load, the table stands without them. Gains and losses show on the hand's cards (#773). */}
      <LazyBoundary failed={null}>
        <TurnMoment />
      </LazyBoundary>

      <div className={cn("pointer-events-none absolute bottom-0 inset-x-0 z-10 px-safe pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]", upright && "upright-table")}>
        <div className={cn("relative", column ? "flex h-[calc(100dvh-4.25rem-max(0.75rem,env(safe-area-inset-bottom)))] w-[260px] max-w-[42vw] flex-col justify-end" : "mx-auto max-w-[720px]")}>
          {/* #459: floats above the stack, so it coming and going never reflows the turn banner. */}
          {banner && !(tradeOutcome && banner.endsWith("'s trade")) ? (
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
          <LazyBoundary failed={null}>
            <FirstGameCoach
              hidden={!!banner && !(tradeOutcome && banner.endsWith("'s trade"))}
              className={cn("absolute inset-x-0", column ? "left-full top-0 ml-3 w-max max-w-[calc(100vw-21.5rem-max(0.75rem,env(safe-area-inset-left))-max(0.75rem,env(safe-area-inset-right)))]" : "bottom-full mb-2")}
            />
          </LazyBoundary>
          <div
            ref={stackRef}
            data-hud-stack
            className={cn(
              "hud-stack pointer-events-auto flex flex-col gap-1 overflow-y-auto overscroll-contain",
              "hud-tray", column && "hud-col",
              // #383: stop under the header (or the portrait seat strip) and leave the island at least ~8 rem.
              // #422, #1539: the column's room runs from under the header to the bottom edge; the tray sits at its foot, as tall as its rows.
              column
                ? "max-h-full scroll-pb-16"
                : portrait ? "max-h-[calc(100dvh-16rem)]" : "max-h-[calc(100dvh-13rem)]",
            )}
          >
            {/* #1539: a picked spot is confirmed in the action row (Cancel and Place); PlaceChip keeps Enter and Esc. */}
            <PlaceChip />
            {/* #1539: the tray's top line. The status is on the left; the newest event (the roll, or the last log line) is quiet
                text on the right. The public deck count is read out for every seat and shown to a watcher, who has no Build list. */}
            <div className="tray-top flex shrink-0 items-center justify-between gap-3">
              {instruction}
              {phone || spectator || tradeVisible ? null : numbers}
              <p
                hidden={tradeVisible}
                data-testid="log-line"
                data-roll={rollChip ? rollChip.sum : undefined}
                data-own={rollChip?.own ? "true" : undefined}
                className="tray-event min-w-0 shrink truncate text-[13px] leading-5"
              >
                {rollChip ? (
                  <span className={rollChip.own ? "text-gain" : undefined}>
                    <span data-testid="log-roll-name" className={rollChip.own ? "font-bold" : undefined}>{rollChip.name}</span>
                    <span> rolled </span>
                    <span data-testid="log-roll-sum" className={rollChip.hot ? "text-danger" : undefined}>{rollChip.sum}</span>
                    !
                  </span>
                ) : gameLog.at(-1)?.text}
              </p>
              {/* Slice C: an open offer is the top line and, for a seat that can answer or cancel, the action row (styles.css). */}
              {tradeVisible ? (
                <LazyBoundary failed={null}>
                  <TradeToast />
                </LazyBoundary>
              ) : null}
              <span data-testid="deck-count" data-deck-left={deckLeft} title={`${deckLeft} fortunes left in the deck`} className={cn("shrink-0 text-[13px] leading-5 tabular-nums", !spectator && "sr-only")}>Deck {deckLeft}</span>
            </div>
            <TurnCountdown header={phone ? null : timerHeader} />
            {winner || error ? (
              <p className="rounded-[16px] border border-white/50 bg-glass px-3 py-2 text-sm text-zinc-900 backdrop-blur-md">
                {winner ? <span id="hud-winner">{`${winner.name} wins with ${totalVP(state, winner.id)} points.`}</span> : null}
                {winner && sheetsLost === sheetsKey ? <WinFailed /> : null}
                {error ? <span className={cn("block text-orange-700", winner && "mt-1")}>{error}</span> : null}
              </p>
            ) : null}

            {spectator ? null : <HandDock me={me} phase={state.phase} />}

            {discarder ? (
              <LazyBoundary
                key={`discard-${discarder}`}
                retryKey={String(lossesRetry)}
                failed={
                  <LossesFailed
                    message="Discard choices could not load."
                    onRetry={() => setLossesRetry((r) => r + 1)}
                  />
                }
              >
                <DiscardBar key={`discard-${discarder}`} id={discarder} n={state.discardNeeded[discarder]!} />
              </LazyBoundary>
            ) : null}
            {choosing ? (
              <LazyBoundary
                retryKey={String(lossesRetry)}
                failed={
                  <LossesFailed
                    message="Victim choices could not load."
                    onRetry={() => setLossesRetry((r) => r + 1)}
                  />
                }
              >
                <TakeFromBar />
              </LazyBoundary>
            ) : null}

            {/* #1539: one action row. An armed build or fortune leaves one button, Cancel; otherwise Build, Trade, the held
                fortunes and End turn. The builds themselves, with their costs and reasons, are in the Build list. */}
            {pending && !spectator ? (
              <div ref={column ? intoView : undefined} className="hud-actions hud-place flex gap-2">
                <Button size="sm" variant="secondary" data-testid="place-cancel" className="h-12 flex-1" onClick={() => setPendingPlace(null)}>Cancel</Button>
                <Button size="sm" variant="primary" data-testid="place-chip" className="h-12 flex-[2]" onClick={confirmPlace}>Place</Button>
              </div>
            ) : armedNow ? (
              <div className="hud-actions">
                <Button size="sm" variant="secondary" data-testid="build-cancel" className="h-12 w-full" onClick={() => setBuildMode("none")}>Cancel</Button>
              </div>
            ) : state.phase === "main" && mine ? (
              <div className="hud-actions">
                <div data-fortunes={fortunes ? "" : undefined} className="action-utilities flex items-center gap-2">
                  <Button
                    ref={buildButton}
                    size="sm"
                    variant="secondary"
                    data-testid="build-open"
                    data-build={canBuy ? "ready" : "short"}
                    aria-expanded={buildOpen}
                    className={cn("relative h-12 min-w-11 flex-1", pulse.length > 0 && "build-ready")}
                    onAnimationEnd={(e) => e.animationName === "build-ready" && setPulse([])}
                    onClick={() => setBuildOpen(true)}
                  >
                    Build{canBuy ? READY_DOT : null}
                  </Button>
                  <TradeButton />
                  {fortunes}
                  {column ? null : endRow}
                </div>
              </div>
            ) : null}

            {(state.phase === "roll" || state.phase === "rollOff") && mine && !armedNow ? (
              <div className="hud-roll flex flex-col gap-2">
                <div className="flex flex-wrap gap-2 *:self-center">
                  {column ? dice : null}
                  {fortunes}
                  <Button size="lg" className="flex-1" data-after-fortune onClick={() => dispatch({ type: "roll" })}>
                    <Dices className="size-5" /> Roll
                  </Button>
                </div>
              </div>
            ) : null}

            {!mine || !["main", "roll", "rollOff"].includes(state.phase) ? (
              fortunes || (column && dice) ? <div className="tray-extra flex flex-wrap items-center gap-2">{fortunes}{column ? dice : null}</div> : null
            ) : diceInBar || !column ? null : dice}

            {/* #643: on a sideways phone the seat's numbers are one quiet line under the action row. A desktop has them in
                the tray's top line; the upright phone table has none (#1509). */}
            {phone && !spectator && !upright && !tradeVisible ? <div className="tray-numbers flex h-5 shrink-0 items-center gap-1">{numbers}</div> : null}
            {pinEnd ? endRow : null}
          </div>
          {/* #423: the tray rises over the stack from its bottom edge and may cover the island, like a sheet, but never the
              header or the portrait seat strip; it is inside the sheets chunk, which the table prefetched on idle (#488). */}
          {/* #511: in the column the tray's round top corners must not show the banner or the stack, so the column clears behind it. */}
          {column && fortunes && fortunesOpen ? (
            <div data-testid="fortune-tray-backdrop" aria-hidden className="hand-in pointer-events-auto absolute inset-0 z-10 rounded-b-[16px] bg-bg" />
          ) : null}
          {fortunes && fortunesOpen ? (
            <LazyBoundary failed={<TrayFailed close={() => setFortunesOpen(false)} />}>
              <FortuneTray
                me={spectator ? undefined : me}
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
              className={cn("pointer-events-none absolute inset-x-0 h-8 bg-gradient-to-t from-zinc-900/40 to-transparent", pinEnd ? "bottom-[58px]" : "bottom-0")}
            />
          ) : null}
        </div>
      </div>

      {/* #488: the trade panel, How to play and the win screen share one lazy chunk, fetched on idle once the table is up.
          If it fails the table stands with no sheet; SheetsFailed drops the open flags so the next tap tries again. */}
      {/* The Build list is its own chunk: if it cannot load, Build closes, so the next press tries again and the other sheets stay up. */}
      {buildOpen && state.phase === "main" && mine && !spectator ? (
        <LazyBoundary failed={<TrayFailed close={() => setBuildOpen(false)} />}>
          <BuildList state={state} me={me} opener={buildButton.current} onClose={() => setBuildOpen(false)} />
        </LazyBoundary>
      ) : null}
      <LazyBoundary failed={<SheetsFailed sheetsKey={sheetsKey} onLost={setSheetsLost} />} retryKey={sheetsKey}>
        <TradePanel />
        {howTo ? <HowTo onClose={() => setHowTo(false)} /> : null}
        {costs ? <CostCard onClose={() => setCosts(false)} /> : null}
        
        <WinScreen />
        <ChromeLanded />
      </LazyBoundary>
    </>
  );
}
