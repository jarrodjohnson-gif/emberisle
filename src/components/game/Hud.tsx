import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dices,
  Home,
  Landmark,
  Route,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatControls, ChatDock, ChromeLanded, CostCard, FirstGameCoach, FortuneTray, HowTo, MyNumbers, sheets, TradePanel, TurnMoment, WinScreen } from "@/components/game/chunks";
import { TradeToast, tradeSlot } from "@/components/game/TradeToast";
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
import { legalCities, legalRoads, legalSettle, playable, totalVP } from "@/lib/game/rules";
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
    // #423: both fortunes are armed from the tray, and the My fortunes button stays pressed until the pick is made or cancelled.
    case "knight":
      return ["Move the wayfarer", "Play fortune"];
    case "roadCard":
      return [roadPicks ? "Place one more path" : "Place two paths", "Play fortune"];
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
  // #1101: what the trade toast shows this seat (an offer it has not answered, or the outcome), which takes the dock's status slot.
  const tradeHere = useGame((s) => (!!s.offer && !s.declined.includes(s.localId)) || !!s.tradeOutcome);
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
  const [timerHeader, setTimerHeader] = useState<HTMLDivElement | null>(null);
  const [sheetsLost, setSheetsLost] = useState<string | null>(null);
  useEscapeDisarm();
  const [stackRef, moreBelow] = useMoreBelow();
  // #1101: the dock's offer slot too, so an offer never waits on the network.
  useEffect(() => preloadOnIdle(() => { sheets.prefetch(); tradeSlot.prefetch(); }), []);
  // #423: the fortune tray is open until a fortune is played, it is closed, the phase moves (a roll with the tray up) or the
  // turn moves on (hotseat: to the next seat); it never comes back on its own.
  const [fortunesOpen, setFortunesOpen] = useState(false);
  const fortunesButton = useRef<HTMLButtonElement>(null);
  const turnKey = state ? `${state.turn}|${state.current}|${state.phase}` : "";
  useEffect(() => setFortunesOpen(false), [turnKey]);
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
  // #535: a tap on a build the hand cannot pay for hangs "Need 1 brick" above that build for 1.6 s; the next tap restarts it.
  const [hint, setHint] = useState<{ kind: Price } | null>(null);
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
  // #776: "Play fortune · N" or "Fortunes · N" opens the tray of held cards. It shows only while a fortune is held or armed, so a fresh hand has no
  // such button; the deck count lives on the Fortune buy tile.
  const deckLeft = state.deckLeft ?? state.deck.length;
  // #829: on my own turn, the fortunes I can play now (points are never played; ones bought this turn wait). The glow ring is keyed
  // on the turn, so it runs once when the turn starts and no later state change restarts it.
  const playableNow = mine && !spectator && !state.playedCard ? (["knight", "road", "plenty", "monopoly"] as const).reduce((n, k) => n + Math.max(0, playable(me, k)), 0) : 0;
  // Owner decision (#829, provisional): the label itself says a fortune can be played now.
  const fortunesLabel = playableNow > 0 ? "Play fortune" : "Fortunes";
  // #1101 (DECISIONS 2026-10-22): in the phone dock the button never leaves its slot; with nothing held it is greyed with the reason.
  const noFortune = !showFortunes;
  const fortunes = showFortunes || phone ? (
    <Button
      ref={fortunesButton}
      size="sm"
      data-testid="fortunes-button"
      data-deck-left={deckLeft}
      aria-label={spectator ? fortunesLabel : `${fortunesLabel}, ${heldNow} held`}
      className={cn("relative h-11 min-w-11 px-3 text-sm tabular-nums", phone && "w-full whitespace-normal px-1 leading-4", NOT_NOW)}
      aria-pressed={fortunesOpen || fortuneArmed}
      aria-expanded={fortunesOpen}
      aria-disabled={noFortune || undefined}
      aria-description={noFortune ? "No fortune held" : undefined}
      variant={fortunesOpen || fortuneArmed ? "primary" : "secondary"}
      onClick={() => {
        if (noFortune) return;
        if (fortuneArmed) return setBuildMode("none");
        setFortunesOpen((o) => !o);
      }}
    >
      {playableNow > 0 && <span key={cueKey} ref={cueRing} onAnimationStart={() => (glowed.current = cueKey)} aria-hidden="true" data-testid="fortune-cue-glow" className="fortune-cue-glow" />}
      {fortunesLabel}{spectator ? null : <> · {heldNow}</>}
    </Button>
  ) : null;
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
  // docs/design/polish.md "Buttons": End turn is the one primary once nothing else can be bought and nothing is armed.
  // A watcher's `me` has no `resources` online (docs/design/spectator.md) and buys nothing, so it is checked first.
  const canBuy = !spectator && PRICES.some((k) => buildStatus(state, me, k).ready);
  const endPrimary = !canBuy && buildMode === "none";

  // #1101: in the phone dock the line fills the status slot's fixed box (two lines at most), instead of sizing itself.
  const turnLine = (inSlot?: boolean) => state.phase === "over" ? null : (
    <p key={`turn-${state.current}`} data-testid="turn-banner"
      style={{ borderLeftColor: yours ? undefined : subjectPlayer.color }}
      className={cn("turn-instruction rounded-control px-3 text-[15px] font-medium leading-5", inSlot ? "flex h-11 min-w-0 flex-1 items-center overflow-hidden" : "py-1.5", yours ? "turn-instruction-own" : "border-l-4", !waiting && !choosing && (state.phase === "robber" || buildMode === "knight") && "turn-instruction-move")}
    >{turnText}</p>
  );

  const endRow = (
    <div className="tray-end ml-auto flex gap-2 *:self-center">
      {dice}
      <Button size="sm" variant={endPrimary ? "primary" : "secondary"} onClick={() => dispatch({ type: "endTurn" })}>
        End turn
      </Button>
    </div>
  );

  // Each build says whether it can happen now: the cost chips dim what the hand is short of, a build with nothing to build
  // on or none left says so, and one the hand can pay for with a spot waiting wears the dot. #1101: the phone dock shows the
  // row on every turn and phase; off `live` (not this seat's main phase) every tile is greyed with the reason and does nothing.
  const buildRow = (live: boolean) => (
    <div className="build-grid">
      {(
        [
          ["path", "path", Route, "Path"],
          ["outpost", "outpost", Home, "Outpost"],
          ["stronghold", "stronghold", Landmark, "Stronghold"],
          ["card", null, ScrollText, "Fortune"],
        ] as const
      ).map(([kind, arm, Icon, label], at) => {
        // A watcher's `me` has no `resources` online (docs/design/spectator.md): its tiles are only ever greyed.
        const { short, missing, why, ready } = live || me.resources ? buildStatus(state, me, kind) : { short: {}, missing: 0, why: null, ready: false };
        const idle = !live;
        const blocked = idle || !ready || spectator;
        const status = idle ? (mine && /^roll/.test(state.phase) ? "Roll first" : mine ? "Not now" : "Not your turn") : (why ?? (ready ? "Ready" : needLine(short)));
        return (
          <Button
            key={kind}
            size="sm"
            variant={buildMode === arm ? "primary" : "secondary"}
            aria-label={kind === "card" ? `${label}, ${deckLeft} left in deck` : label}
            data-testid={`build-${kind}`}
            data-build={idle || why ? "blocked" : ready ? "ready" : "short"}
            data-build-state={idle ? "idle" : why ? "nospot" : ready ? "ready" : "missing"}
            // A 44 px two-line tile, the piece over its chips (docs/design/polish.md: actions as tiles with their amount),
            // so the row keeps the lines it had before the chips: one at 1280x720, three builds a line on a phone.
            // #1101: 46 px in the phone dock, so the island keeps 60 % of an upright phone's height.
            className={cn("build-tile relative h-[52px] min-w-11 flex-col px-1 py-1", phone && "h-[46px] py-0.5", kind === "card" && !why ? "gap-0" : "gap-1", NOT_NOW, live && pulse.includes(kind) && "build-ready")}
            onAnimationEnd={(e) => e.animationName === "build-ready" && setPulse((p) => p.filter((k) => k !== kind))}
            aria-pressed={arm ? buildMode === arm : undefined}
            aria-disabled={blocked || undefined}
            title={priceLabel(kind)}
            aria-description={`${priceLabel(kind)} · ${status}`}
            onClick={() => {
              if (idle) return;
              // aria-disabled keeps the button focusable, so the click itself must refuse (but may still disarm).
              // A tap the hand cannot pay for says what is missing (a spot waiting, goods short) instead of doing nothing.
              if (!spectator && !why && missing && buildMode !== arm) {
                setHint({ kind });
                // The chip is the one line on screen; the error cue and the screen reader still get the full sentence.
                return void refuseQuietly(needLine(short));
              }
              if (!arm) return void (blocked || dispatch({ type: "buyCard" }));
              if (blocked && buildMode !== arm) return;
              setBuildMode(buildMode === arm ? "none" : arm);
            }}
          >
            <span className="flex items-center gap-1 text-caption leading-4">
              <Icon className="build-icon size-3.5" /> {phone && kind === "stronghold" ? "Upgrade" : label}{live && ready && buildMode !== arm ? READY_DOT : null}
            </span>
            {/* The chips and the reason are aria-hidden: the name stays the piece, the description says the rest. Missing
                goods ring what the hand lacks and say how many short. */}
            {why ? <span aria-hidden className="text-caption text-muted">{why}</span> : <CostChips kind={kind} hand={live && missing ? me.resources : undefined} />}
            {kind === "card" && !why ? <span aria-hidden data-testid="deck-left" className="text-[10px] leading-[10px] tabular-nums text-muted">{deckLeft} left</span> : null}
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
                {hintLine(short)}
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );

  // #643: the seat's numbers share the log line's row, so the tray keeps its height (the declared hole holds). They ride in
  // the moments chunk (off the first load: there are none before the first outpost); if it cannot load, the row is the log
  // line alone. #1101: in the phone dock the offer has the status slot, so this row stays through a trade too.
  const logRow = (keep: boolean) => (
    <div className={cn(tradeVisible && !keep ? "hidden" : "flex", "h-5 shrink-0 items-center gap-1")}>
      {spectator ? null : (
        <LazyBoundary failed={null}>
          <MyNumbers state={state} playerId={me.id} />
        </LazyBoundary>
      )}
      <p
        hidden={tradeVisible && !keep}
        data-testid="log-line"
        className="table-log block h-5 min-w-0 flex-1 overflow-hidden truncate rounded-control px-3 text-xs leading-5"
      >
        {gameLog.at(-1)?.text}
      </p>
      {/* #776: the shared draw deck is public to every seat and watcher, so its count sits here, off the build row. */}
      <span data-testid="deck-count" data-deck-left={deckLeft} title={`${deckLeft} fortunes left in the deck`} className="shrink-0 px-2 text-xs leading-5 tabular-nums">Deck {deckLeft}</span>
    </div>
  );

  const winnerLine = winner || error ? (
    <p className="rounded-[16px] border border-white/50 bg-glass px-3 py-2 text-sm text-zinc-900 backdrop-blur-md">
      {winner ? <span id="hud-winner">{`${winner.name} wins with ${totalVP(state, winner.id)} points.`}</span> : null}
      {winner && sheetsLost === sheetsKey ? <WinFailed /> : null}
      {error ? <span className={cn("block text-orange-700", winner && "mt-1")}>{error}</span> : null}
    </p>
  ) : null;
  const bannerShown = !!banner && !(tradeOutcome && banner.endsWith("'s trade"));
  // #422: beside the column, over the top of the hole, as it floats over the board above the stack elsewhere.
  const besideColumn = "left-full top-0 ml-3 w-max max-w-[calc(100vw-22rem-max(0.75rem,env(safe-area-inset-left))-max(0.75rem,env(safe-area-inset-right)))]";

  return (
    <>

      {/* #442: one control up top. The turn number, watcher count, How to play, sound and Leave live in the menu, whose open
          sheet rises over the z-20 chat dock (it reaches the header on a sideways phone). Online, Open chat (#899: the one chat button)
          sits in this row too, left of the menu, so it never moves with the turn and never reaches the board. A watcher's badge stays out here,
          a chip and not a button, so a watcher always sees why it has no controls (docs/design/spectator.md). */}
      <header className={cn("hud-header pointer-events-none absolute inset-x-0 top-0 z-20 px-safe pt-[max(0.75rem,env(safe-area-inset-top))] has-[#table-menu]:z-30", phone ? "pb-0" : "pb-3")}>
        {/* #1101: on a phone the menu (and, sideways, the chat) live in the dock; sideways the seats sit at the top of its 320 px column. */}
        <div data-slot={phone ? "seats" : undefined} className={cn("pointer-events-auto flex items-center justify-end gap-1", column && "w-[320px]")}>
          {phone ? <SeatStrip actor={actor} className="min-w-0 max-w-[48rem] flex-1" /> : <div className="mr-auto shrink-0">{turnLine()}</div>}
          {phone ? null : <div ref={setTimerHeader} className="mx-2 min-w-0 flex-1 empty:hidden" />}
          {spectator && !(phone && portrait) ? (
            <span data-testid="watching-badge" className="flex h-11 items-center rounded-chip bg-glass px-3 text-caption text-fg backdrop-blur-md">
              Watching
            </span>
          ) : null}
          {mode === "online" && !portrait && !phone ? (
            <LazyBoundary failed={null} retryKey={String(chatOpen)}>
              <ChatControls />
            </LazyBoundary>
          ) : null}
          <span data-coach-skip-slot className="shrink-0 empty:hidden" />
          {phone ? null : <TableMenu />}
        </div>
        {phone ? <div className={column ? "w-[320px]" : undefined}><HiddenPointHint /></div> : null}
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
      {/* If the moments' chunk cannot load, the table stands without them. Gains and losses show on the hand's cards (#773). */}
      <LazyBoundary failed={null}>
        <TurnMoment />
      </LazyBoundary>

      {phone ? (
        // #1101: the phone dock. One fixed box: the goods, the status line, the build row and the actions, every slot in the
        // same place in every state (the offer takes the status line's slot, another seat's turn shows Wait in End turn's,
        // an empty hand shows zeros). Upright it is a 244 px box at the bottom (the island keeps 60 % of 844 px); sideways it is
        // the bottom of the 320 px column, with Menu and Chat in its last row. Anything that comes and goes (the banner, the
        // Place chip, the countdown, the winner, the discard and take bars, the trade card with the chat open) floats over the
        // board beside it and never counts toward the hole (playHole in mobile-fit.ts).
        <div className="pointer-events-none absolute bottom-0 inset-x-0 z-10 px-safe pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] has-[#table-menu]:z-30">
          <div className={cn("relative", column ? "flex h-[calc(100dvh-4.25rem-max(0.75rem,env(safe-area-inset-bottom)))] w-[320px] flex-col justify-end" : "mx-auto max-w-[720px]")}>
            <div data-board-overlay className={cn("pointer-events-none absolute z-20 flex flex-col gap-1", column ? besideColumn : "inset-x-0 bottom-full mb-2")}>
              {/* #459: floats over the board, so it coming and going never moves the dock. */}
              {bannerShown ? (
                <p role="status" data-testid="banner" className="animate-[turn-fade_200ms_ease-out] rounded-[16px] border border-accent/40 bg-surface px-3 py-2 text-center text-sm font-medium text-zinc-900">
                  {banner}
                </p>
              ) : null}
              <div className="pointer-events-auto empty:hidden">
                <PlaceChip column />
              </div>
              <TurnCountdown header={null} />
              {winnerLine}
              {discarder ? <div className="pointer-events-auto"><DiscardBar key={`discard-${discarder}`} id={discarder} n={state.discardNeeded[discarder]!} /></div> : null}
              <div className="pointer-events-auto empty:hidden">
                <TakeFromBar />
              </div>
              {chatOpen ? <div className="pointer-events-auto empty:hidden"><TradeToast /></div> : null}
            </div>
            <LazyBoundary failed={null}>
              <FirstGameCoach hidden={bannerShown} className={cn("absolute inset-x-0", column ? besideColumn : "bottom-full mb-2")} />
            </LazyBoundary>
            {/* data-hud-stack: the dock is a phone's bottom stack, so a centre moment keeps clear of it (stage.ts). */}
            <div data-testid="dock" data-hud-stack className="dock pointer-events-auto flex shrink-0 flex-col">
              <div data-slot="goods" className="dock-goods h-[62px] short:h-11">
                {spectator ? null : <HandDock me={me} phase={state.phase} always />}
              </div>
              <div data-slot="status" className="dock-status mt-2 flex h-11 items-center gap-2 rounded-control">
                {!chatOpen && tradeHere ? (
                  <TradeToast slot />
                ) : (
                  <>
                    {turnLine(true)}
                    {dice ? <div className="shrink-0 pr-1 [&>div]:gap-1 [&_[data-testid=die]]:size-6 [&_[data-testid=die]]:p-0.5 [&_[data-pip]]:size-1">{dice}</div> : null}
                  </>
                )}
              </div>
              <div className="mt-2">{buildRow(state.phase === "main" && mine && !spectator)}</div>
              <div className={cn("mt-2 grid gap-2", column ? "grid-cols-3" : "grid-cols-4")}>
                <div data-slot="trade">
                  <TradeButton disabled={!(state.phase === "main" && mine) || spectator} className="h-11 w-full" />
                </div>
                <div data-slot="fortunes">{fortunes}</div>
                <div data-slot="turn">
                  {mine && state.phase === "main" ? (
                    <Button size="sm" variant={endPrimary ? "primary" : "secondary"} className="h-11 w-full" onClick={() => dispatch({ type: "endTurn" })}>
                      End turn
                    </Button>
                  ) : mine && /^roll/.test(state.phase) ? (
                    <Button size="sm" className="h-11 w-full" data-after-fortune onClick={() => dispatch({ type: "roll" })}>
                      <Dices className="size-4" /> Roll
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" className="h-11 w-full" disabled>
                      {mine ? "End turn" : "Wait"}
                    </Button>
                  )}
                </div>
                {column ? null : (
                  <div data-slot="menu">
                    <TableMenu dock="right" />
                  </div>
                )}
              </div>
              <div className="mt-1">{logRow(true)}</div>
              {column ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div data-slot="menu">
                    <TableMenu dock="left" />
                  </div>
                  <div data-slot="chat" className="h-11">
                    {mode === "online" ? (
                      <LazyBoundary failed={null} retryKey={String(chatOpen)}>
                        <ChatControls />
                      </LazyBoundary>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            {/* #423: the tray rises over the dock from its bottom edge and may cover the island, like a sheet, but never the
                header or the portrait seat strip; it is inside the sheets chunk, which the table prefetched on idle (#488). */}
            {/* #511: in the column the tray's round top corners must not show the banner or the dock, so the column clears behind it. */}
            {column && fortunes && fortunesOpen ? (
              <div data-testid="fortune-tray-backdrop" aria-hidden className="hand-in pointer-events-auto absolute inset-0 z-10 rounded-b-[16px] bg-bg" />
            ) : null}
            {fortunes && fortunesOpen ? (
              <LazyBoundary failed={<TrayFailed close={() => setFortunesOpen(false)} />}>
                <FortuneTray
                  me={spectator ? undefined : me}
                  opener={fortunesButton.current}
                  onClose={() => setFortunesOpen(false)}
                  className={column ? "max-h-full" : "max-h-[calc(100dvh-7.25rem-env(safe-area-inset-top)-max(0.75rem,env(safe-area-inset-bottom)))]"}
                />
              </LazyBoundary>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-0 inset-x-0 z-10 px-safe pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="relative mx-auto max-w-[720px]">
            {/* #459: floats above the stack, so it coming and going never reflows the turn banner. */}
            {bannerShown ? (
              <p
                role="status"
                data-testid="banner"
                className="pointer-events-none absolute inset-x-0 bottom-full mb-2 animate-[turn-fade_200ms_ease-out] rounded-[16px] border border-accent/40 bg-surface px-3 py-2 text-center text-sm font-medium text-zinc-900"
              >
                {banner}
              </p>
            ) : null}
            <LazyBoundary failed={null}>
              <FirstGameCoach hidden={bannerShown} className="absolute inset-x-0 bottom-full mb-2" />
            </LazyBoundary>
            <div
              ref={stackRef}
              data-hud-stack
              className={cn(
                "hud-stack pointer-events-auto flex flex-col gap-1 overflow-y-auto overscroll-contain",
                // #383: stop under the header and leave the island at least ~8 rem.
                portrait ? "max-h-[calc(100dvh-16rem)]" : "max-h-[calc(100dvh-13rem)]",
              )}
            >
              {/* Not pointer-events-none: a porous child would make the stack's chrome only its parts. */}
              <PlaceChip column />
              <TurnCountdown header={timerHeader} />
              {winnerLine}

              {spectator ? null : <HandDock me={me} phase={state.phase} />}

              {discarder ? <DiscardBar key={`discard-${discarder}`} id={discarder} n={state.discardNeeded[discarder]!} /> : null}
              <TakeFromBar />

              {state.phase === "main" && mine ? (
                <div className="hud-actions">
                  {buildRow(true)}
                  <div data-fortunes={fortunes ? "" : undefined} className="action-utilities flex items-center gap-1">
                    <TradeButton />
                    {fortunes}
                    {endRow}
                  </div>
                </div>
              ) : null}

              {(state.phase === "roll" || state.phase === "rollOff") && mine ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2 *:self-center">
                    {dice}
                    {fortunes}
                    <Button size="lg" className="flex-1" data-after-fortune onClick={() => dispatch({ type: "roll" })}>
                      <Dices className="size-5" /> Roll
                    </Button>
                  </div>
                </div>
              ) : null}

              {!mine || !["main", "roll", "rollOff"].includes(state.phase) ? (
                fortunes || dice ? <div className="flex flex-wrap items-center gap-2">{fortunes}{dice}</div> : null
              ) : diceInBar ? null : dice}

              {logRow(false)}
              <TradeToast />
            </div>
            {/* #423: the tray rises over the stack from its bottom edge and may cover the island, like a sheet, but never the
                header; it is inside the sheets chunk, which the table prefetched on idle (#488). */}
            {fortunes && fortunesOpen ? (
              <LazyBoundary failed={<TrayFailed close={() => setFortunesOpen(false)} />}>
                <FortuneTray
                  me={spectator ? undefined : me}
                  opener={fortunesButton.current}
                  onClose={() => setFortunesOpen(false)}
                  className={
                    portrait
                      ? "max-h-[calc(100dvh-7.25rem-env(safe-area-inset-top)-max(0.75rem,env(safe-area-inset-bottom)))]"
                      : "max-h-[calc(100dvh-5rem-env(safe-area-inset-top)-max(0.75rem,env(safe-area-inset-bottom)))]"
                  }
                />
              </LazyBoundary>
            ) : null}
            {moreBelow ? (
              <div data-testid="hud-more-below" aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-zinc-900/40 to-transparent" />
            ) : null}
          </div>
        </div>
      )}

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
