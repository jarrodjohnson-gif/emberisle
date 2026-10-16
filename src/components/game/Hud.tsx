import { useEffect, useRef, useState } from "react";
import {
  Dices,
  Home,
  Landmark,
  Route,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatControls, ChatDock, ChromeLanded, CostCard, FortuneTray, GainFloats, HowTo, sheets, TradePanel, TurnMoment, WinScreen } from "@/components/game/chunks";
import { TradeToast } from "@/components/game/TradeToast";
import { WinFailed } from "@/components/game/WinFailed";
import { Announcer } from "@/components/game/Announcer";
import { PlayerMenu } from "@/components/game/PlayerMenu";
import { SeatRail, SeatStrip, HiddenPointHint } from "@/components/game/SeatRail";
import { DiscardBar } from "@/components/game/DiscardBar";
import { TurnCountdown } from "@/components/game/TurnCountdown";
import { Dice, RollMoment } from "@/components/game/Dice";
import { TableMenu } from "@/components/game/TableMenu";
import { HandDock } from "@/components/game/Hand";
import { TakeFromBar } from "@/components/game/TakeFromBar";
import { PlaceChip } from "@/components/game/PlaceChip";
import { SheetsFailed } from "@/components/game/SheetsFailed";
import { TrayFailed } from "@/components/game/TrayFailed";
import { TradeButton } from "@/components/game/TradeButton";
import { CostChips, hintLine, needLine, priceLabel, shortfall, type Price } from "@/components/game/BuildCost";
import { useEscapeDisarm } from "@/components/game/escape-disarm";
import { COST, RESOURCES, type BuildMode, type GameState, type PlayerState } from "@/lib/game/types";
import { legalCities, legalRoads, legalSettle, totalVP } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { LazyBoundary, preloadOnIdle } from "@/lib/lazy";
import { useViewport } from "@/lib/viewport";
import { useMoreBelow } from "@/lib/scroll-fade";
import { cn } from "@/lib/utils";

const PRICES = Object.keys(COST) as Price[];
const HINT_MS = 1600;

// Whether a build can happen now and, if not, why: the supply (or the deck), then a legal spot; a spot with a hand that cannot pay is missing goods (#606).
function buildStatus(state: GameState, me: PlayerState, kind: Price) {
  const short = shortfall(me.resources, kind);
  const missing = Object.values(short).reduce((a, b) => a + b, 0);
  const left = { path: me.pathsLeft, outpost: me.outpostsLeft, stronghold: me.strongholdsLeft, card: state.deckLeft ?? state.deck.length }[kind];
  const spot = () =>
    kind === "path" ? legalRoads(state, me.id, false).length > 0 : kind === "outpost" ? legalSettle(state, me.id, false).length > 0 : kind === "stronghold" ? legalCities(state, me.id).length > 0 : true;
  const why = left <= 0 ? "None left" : spot() ? null : "No spot";
  return { short, missing, why, ready: !why && !missing };
}

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
      return "Build, trade, or end your turn";
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
      return ["Build a stronghold", "Stronghold"];
    // #423: both fortunes are armed from the tray, and the Fortunes button stays pressed until the pick is made or cancelled.
    case "knight":
      return ["Move the wayfarer", "Fortunes"];
    case "roadCard":
      return [roadPicks ? "Place one more path" : "Place two paths", "Fortunes"];
    default:
      return null;
  }
}


// A build that cannot happen now uses aria-disabled, not disabled, so Tab still reaches it and the price is read out. It
// goes muted ink, not translucent, so the chips and the reason on it stay readable.
const NOT_NOW = "aria-disabled:cursor-not-allowed aria-disabled:text-muted aria-disabled:active:scale-100";
// A build the hand can pay for with a legal spot waiting: a small warm dot on the button's corner (docs/design/polish.md: no glows).
// #606: the corner check badge on a Ready chip (the chip's own fill and outline are in styles.css).
const READY_DOT = (
  <span aria-hidden className="build-ready-mark absolute right-0 top-0 flex size-4 items-center justify-center rounded-full text-[10px] font-bold leading-none">
    ✓
  </span>
);

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
  const refuseQuietly = useGame((s) => s.refuseQuietly);
  const setBuildMode = useGame((s) => s.setBuildMode);
  const setHowTo = useGame((s) => s.setHowTo);
  const menuFor = useGame((s) => s.menuFor);
  const openMenu = useGame((s) => s.openMenu);
  // A watcher (docs/design/spectator.md): `me` below falls back to seat 0, so its hand bar is hidden by this flag, never by `localId`.
  const spectator = useGame((s) => s.spectator);
  const { phone, portrait } = useViewport();
  // #422: a sideways phone stacks the HUD in a full-height left column, so the island fills the height beside it.
  const column = phone && !portrait;
  // #492: the sheets chunk is asked for again on each open and at the win (the boundary's key). When the ask made at the
  // win fails, the win screen cannot show and the winner line gets the way out; a failure under an earlier key is not it.
  const sheetsKey = `${tradeOpen}|${howTo}|${costs}|${state?.winner ?? ""}`;
  const [sheetsLost, setSheetsLost] = useState<string | null>(null);
  useEscapeDisarm();
  const [stackRef, moreBelow] = useMoreBelow();
  useEffect(() => preloadOnIdle(sheets.prefetch), []);
  // #423: the fortune tray is open until a fortune is played, it is closed, the phase moves (a roll with the tray up) or the
  // turn moves on (hotseat: to the next seat); it never comes back on its own.
  const [fortunesOpen, setFortunesOpen] = useState(false);
  const fortunesButton = useRef<HTMLButtonElement>(null);
  const turnKey = state ? `${state.turn}|${state.current}|${state.phase}` : "";
  useEffect(() => setFortunesOpen(false), [turnKey]);
  const actor = mode === "hotseat" ? (state?.current ?? "") : localId;
  const me = state ? (state.players.find((p) => p.id === actor) ?? state.players[0]!) : null;
  // A build that just became ready (a roll, a trade) pulses its button once; a change of seat is not that, and a build with
  // no spot or none left never is. The key is empty on another seat's turn (buildStatus does not look at the phase, so it is the same from a roll to main), and the hand's counts are in it, so any
  // other change (a steal, the row leaving) clears a pulse instead of leaving one to fire later. A watcher's `me` is seat 0 of
  // the opponent view, which has no `resources` online (docs/design/spectator.md), so it is checked first.
  const rowShown = !!state && !!me?.resources && state.current === actor;
  const readyKey = rowShown ? `${me!.id}|${PRICES.map((k) => (buildStatus(state, me!, k).ready ? 1 : 0)).join("")}|${RESOURCES.map((r) => me!.resources[r]).join(",")}` : "";
  const wasReady = useRef(readyKey);
  const [pulse, setPulse] = useState<Price[]>([]);
  // #535: a tap on a build the hand cannot pay for hangs "Need 1 clay" above that build for 1.6 s; the next tap restarts it.
  const [hint, setHint] = useState<{ kind: Price; text: string; n: number } | null>(null);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), HINT_MS);
    return () => clearTimeout(t);
  }, [hint]);
  useEffect(() => {
    // The chip names what was missing for the hand it was tapped with: a new hand or seat takes it down.
    setHint(null);
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
  // Hotseat has no bots: the first seat still owing a discard takes the bar, whoever rolled the 7.
  const discarder =
    state.phase !== "discard"
      ? null
      : mode === "hotseat"
        ? (state.players.find((p) => (state.discardNeeded[p.id] ?? 0) > 0)?.id ?? null)
        : (state.discardNeeded[actor] ?? 0) > 0
          ? actor
          : null;
  // The shared deck count is inspectable with an empty hand and off turn too.
  const fortuneArmed = buildMode === "knight" || buildMode === "roadCard";
  const deckLeft = state.deckLeft ?? state.deck.length;
  const fortunes = (
    <Button
      ref={fortunesButton}
      size="sm"
      data-testid="fortunes-button"
      data-deck-left={deckLeft}
      aria-label={`Fortunes, ${deckLeft} left in deck`}
      className="h-11 min-w-11 flex-col gap-0 px-2 text-xs leading-4 tabular-nums"
      aria-pressed={fortunesOpen || fortuneArmed}
      aria-expanded={fortunesOpen}
      variant={fortunesOpen || fortuneArmed ? "primary" : "secondary"}
      onClick={() => {
        if (fortuneArmed) return setBuildMode("none");
        setFortunesOpen((o) => !o);
      }}
    >
      <span>Fortunes</span>{" "}<span>{deckLeft} left</span>
    </Button>
  );
  // Hotseat has no "you": every seat is named. The turn banner sits out once the isle has a ruler (the pill says who).
  const subject = state.phase === "discard" && discarder ? discarder : state.current;
  const subjectPlayer = state.players.find((p) => p.id === subject) ?? state.players[0]!;
  const yours = mode !== "hotseat" && subject === actor && (state.phase !== "discard" || discarder !== null);
  // #419: an armed build says what to pick and how to cancel (a touch screen has no Esc key).
  const armed = mine ? armedCopy(buildMode, roadPicks.length) : null;
  const phaseText = armed
    ? `${armed[0]} · ${matchMedia("(pointer: coarse)").matches ? `tap ${armed[1]} again to cancel` : "Esc cancels"}`
    : state.phase === "discard"
      ? `Discard ${state.discardNeeded[subject] ?? 0} goods`
      : phaseCopy(state.phase);
  const waiting = mode !== "hotseat" && !yours;
  // #430: in hotseat a seat that owes a discard on another seat's turn is named, not given the turn.
  const turnText =
    mode === "hotseat" && subject !== state.current
      ? `${phaseText} · ${subjectPlayer.name}`
      : waiting
        ? waitingCopy(state.phase, subjectPlayer.name)
        : phaseText;
  const winner = state.winner ? state.players.find((p) => p.id === state.winner) : null;
  const menuPlayer = menuFor ? state.players.find((p) => p.id === menuFor) : null;
  // #422: on the player's own Roll or End row the dice ride beside the button instead of taking a row of their own.
  const dice = state.dice ? <Dice values={state.dice} /> : null;
  const diceInBar = mine && /^(main|roll)/.test(state.phase);
  // #491: in the column End turn is its own row pinned to the bottom of the scroller on a solid ground, so it never scrolls out of reach.
  const pinEnd = column && state.phase === "main" && mine;
  // docs/design/polish.md "Buttons": End turn is the one primary once nothing else can be bought and nothing is armed.
  // A watcher's `me` has no `resources` online (docs/design/spectator.md) and buys nothing, so it is checked first.
  const canBuy = !spectator && PRICES.some((k) => buildStatus(state, me, k).ready);
  const endPrimary = !canBuy && buildMode === "none";

  const instruction = state.phase === "over" ? null : (
    <p key={`turn-${state.current}`} data-testid="turn-banner"
      style={{ borderLeftColor: yours ? undefined : subjectPlayer.color }}
      className={cn("turn-instruction rounded-control px-3 py-1.5 text-[15px] font-medium leading-5", yours ? "turn-instruction-own" : "border-l-4")}
    >{turnText}</p>
  );

  const endRow = (
    <div className={cn("flex *:self-center", column ? "end-footer sticky z-10 justify-between gap-1 rounded-control bg-surface p-1" : "tray-end ml-auto gap-2")}>
      {/* The 260 px column has room for Trade, End turn and the dice only with the faces shrunk (they are not targets). */}
      {column ? <><TradeButton /><div className="[&>div]:gap-1 [&_[data-testid=die]]:size-6 [&_[data-testid=die]]:p-0.5 [&_[data-pip]]:size-1">{dice}</div></> : dice}
      <Button size="sm" variant={endPrimary ? "primary" : "secondary"} className={phone ? "h-11" : undefined} onClick={() => dispatch({ type: "endTurn" })}>
        End turn
      </Button>
    </div>
  );

  return (
    <>

      {/* #442: one control up top. The turn number, watcher count, How to play, sound and Leave live in the menu, whose open
          sheet rises over the z-20 chat dock (it reaches the header on a sideways phone). Online, Open chat and Quick reactions
          sit in this row too, left of the menu, so they never move with the turn and never reach the board. A watcher's badge stays out here,
          a chip and not a button, so a watcher always sees why it has no controls (docs/design/spectator.md). */}
      <header className={cn("hud-header pointer-events-none absolute inset-x-0 top-0 z-20 px-safe pt-[max(0.75rem,env(safe-area-inset-top))] has-[#table-menu]:z-30 has-[#quick-reaction-picker]:z-[25]", phone ? "pb-0" : "pb-3")}>
        <div className="pointer-events-auto flex items-center justify-end gap-1">
          {phone ? <SeatStrip actor={actor} className="min-w-0 max-w-[48rem] flex-1" /> : <div className="mr-auto">{instruction}</div>}
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
          <TableMenu />
        </div>
        {phone ? <HiddenPointHint /> : null}
      </header>

      {phone && portrait && (mode === "online" || spectator) ? (
        <div className="hud-utilities pointer-events-none absolute right-safe top-[calc(max(0.75rem,env(safe-area-inset-top))+3rem)] z-20 flex gap-1">
          {spectator ? <span data-testid="watching-badge" className="pointer-events-auto flex h-11 items-center rounded-control bg-surface px-3 text-caption text-fg">Watching</span> : null}
          {mode === "online" ? <LazyBoundary failed={null} retryKey={String(chatOpen)}><ChatControls /></LazyBoundary> : null}
        </div>
      ) : null}
      {phone && menuPlayer ? (
        <PlayerMenu
          player={menuPlayer}
          heading
          className={cn(
            "absolute z-20",
            portrait ? "left-safe right-safe top-[calc(env(safe-area-inset-top)+4.25rem)]" : "right-safe top-16 w-72",
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
      {/* If the moments' chunk cannot load, the table stands without them; the hand still flashes every change. */}
      <LazyBoundary failed={null}>
        <TurnMoment />
        {spectator ? null : <GainFloats me={me} rolls={state.rolls ?? 0} />}
      </LazyBoundary>

      <div className="pointer-events-none absolute bottom-0 inset-x-0 z-10 px-safe pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className={cn("relative", column ? "w-[260px] max-w-[42vw]" : "mx-auto max-w-[720px]")}>
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
          <div
            ref={stackRef}
            data-hud-stack
            className={cn(
              "hud-stack pointer-events-auto flex flex-col gap-1 overflow-y-auto overscroll-contain",
              // #383: stop under the header (or the portrait seat strip) and leave the island at least ~8 rem.
              // #422: the column runs from under the header to the bottom edge every phase, so the hole beside it never moves.
              column
                ? "h-[calc(100dvh-4.25rem-max(0.75rem,env(safe-area-inset-bottom)))] scroll-pb-16 rounded-b-[16px] [&>:first-child]:mt-auto"
                : portrait ? "max-h-[calc(100dvh-16rem)]" : "max-h-[calc(100dvh-13rem)]",
            )}
          >
            {/* #422: in the column the Place chip is the first row, so it never covers the hand or the turn banner. Not
                pointer-events-none: a porous child would make the stack's chrome only its parts, and the column no rail. */}
            <PlaceChip column />
            {phone ? instruction : null}
            <TurnCountdown />
            {winner || error ? (
              <p className="rounded-[16px] border border-white/50 bg-glass px-3 py-2 text-sm text-zinc-900 backdrop-blur-md">
                {winner ? <span id="hud-winner">{`${winner.name} wins with ${totalVP(state, winner.id)} points.`}</span> : null}
                {winner && sheetsLost === sheetsKey ? <WinFailed /> : null}
                {error ? <span className={cn("block text-orange-700", winner && "mt-1")}>{error}</span> : null}
              </p>
            ) : null}

            {spectator ? null : <HandDock me={me} phase={state.phase} />}

            {discarder ? <DiscardBar key={`discard-${discarder}`} id={discarder} n={state.discardNeeded[discarder]!} /> : null}
            <TakeFromBar />

            {state.phase === "main" && mine ? (
              <div className="hud-actions">
                <div className="build-grid">
                {/* Each build says whether it can happen now: the cost chips dim what the hand is short of, a build with
                    nothing to build on or none left says so, and one the hand can pay for with a spot waiting wears the dot. */}
                {(
                  [
                    ["path", "path", Route, "Path"],
                    ["outpost", "outpost", Home, "Outpost"],
                    ["stronghold", "stronghold", Landmark, "Stronghold"],
                    ["card", null, ScrollText, "Fortune"],
                  ] as const
                ).map(([kind, arm, Icon, label], at) => {
                  const { short, missing, why, ready } = buildStatus(state, me, kind);
                  const blocked = !ready || spectator;
                  const status = why ?? (ready ? "Ready" : needLine(short));
                  return (
                    <Button
                      key={kind}
                      size="sm"
                      variant={buildMode === arm ? "primary" : "secondary"}
                      aria-label={label}
                      data-testid={`build-${kind}`}
                      data-build={why ? "blocked" : ready ? "ready" : "short"}
                      data-build-state={why ? "nospot" : ready ? "ready" : "missing"}
                      // A 44 px two-line tile, the piece over its chips (docs/design/polish.md: actions as tiles with their amount),
                      // so the row keeps the lines it had before the chips: one at 1280x720, three builds a line on a phone.
                      className={cn("build-tile relative h-[52px] min-w-11 flex-col gap-1 px-1 py-1", NOT_NOW, pulse.includes(kind) && "build-ready")}
                      onAnimationEnd={(e) => e.animationName === "build-ready" && setPulse((p) => p.filter((k) => k !== kind))}
                      aria-pressed={arm ? buildMode === arm : undefined}
                      aria-disabled={blocked || undefined}
                      title={priceLabel(kind)}
                      aria-description={`${priceLabel(kind)} · ${status}`}
                      onClick={() => {
                        // aria-disabled keeps the button focusable, so the click itself must refuse (but may still disarm).
                        // A tap the hand cannot pay for says what is missing (a spot waiting, goods short) instead of doing nothing.
                        if (!spectator && !why && missing && buildMode !== arm) {
                          setHint((h) => ({ kind, text: hintLine(short), n: (h?.n ?? 0) + 1 }));
                          // The chip is the one line on screen; the error cue and the screen reader still get the full sentence.
                          return void refuseQuietly(needLine(short));
                        }
                        if (!arm) return void (blocked || dispatch({ type: "buyCard" }));
                        if (blocked && buildMode !== arm) return;
                        setBuildMode(buildMode === arm ? "none" : arm);
                      }}
                    >
                      <span className="flex items-center gap-1 text-caption leading-4">
                        <Icon className="build-icon size-3.5" /> {phone && kind === "stronghold" ? "Upgrade" : label}{ready && buildMode !== arm ? READY_DOT : null}
                      </span>
                      {/* The chips and the reason are aria-hidden: the name stays the piece, the description says the rest. Missing
                          goods ring what the hand lacks and say how many short. */}
                      {why ? <span aria-hidden className="text-caption text-muted">{why}</span> : <CostChips kind={kind} hand={missing ? me.resources : undefined} />}
                      {/* The ends of the row hang the chip inward, so it stays on a phone's screen. Last child: the tile's own
                          styles address its first span. */}
                      {hint?.kind === kind ? (
                        <span
                          aria-hidden
                          data-testid={`build-hint-${kind}`}
                          className={cn(
                            "pointer-events-none absolute bottom-full z-20 mb-1 whitespace-nowrap rounded-[12px] border border-white/50 bg-glass px-2 py-1 text-xs font-medium text-zinc-900 backdrop-blur-md",
                            at === 0 ? "left-0" : at === 3 ? "right-0" : "left-1/2 -translate-x-1/2",
                          )}
                        >
                          {hint.text}
                        </span>
                      ) : null}
                    </Button>
                  );
                })}
                </div>
                {!column || fortunes ? <div className="action-utilities flex items-center gap-1">
                  {column ? null : <TradeButton />}
                  {fortunes}
                  {column ? null : endRow}
                </div> : null}
              </div>
            ) : null}

            {(state.phase === "roll" || state.phase === "rollOff") && mine ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2 *:self-center">
                  {dice}
                  {fortunes}
                  <Button size="lg" className="flex-1" onClick={() => dispatch({ type: "roll" })}>
                    <Dices className="size-5" /> Roll
                  </Button>
                </div>
              </div>
            ) : null}

            {!mine || !["main", "roll", "rollOff"].includes(state.phase) ? (
              <div className="flex flex-wrap items-center gap-2">{fortunes}{dice}</div>
            ) : diceInBar ? null : dice}

            <p
              hidden={tradeVisible}
              data-testid="log-line"
              className="table-log block h-5 shrink-0 overflow-hidden rounded-control px-3 text-xs leading-5"
            >
              {gameLog.at(-1)?.text}
            </p>
            {pinEnd ? endRow : null}
            <TradeToast />
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
              className={cn("pointer-events-none absolute inset-x-0 h-8 bg-gradient-to-t from-zinc-900/40 to-transparent", pinEnd ? "bottom-13" : "bottom-0")}
            />
          ) : null}
        </div>
      </div>

      {/* #488: the trade panel, How to play and the win screen share one lazy chunk, fetched on idle once the table is up.
          If it fails the table stands with no sheet; SheetsFailed drops the open flags so the next tap tries again. */}
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
