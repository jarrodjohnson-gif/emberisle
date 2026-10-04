import { useEffect, useRef, useState } from "react";
import {
  Dices,
  Home,
  Landmark,
  Route,
  ScrollText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WinScreen } from "@/components/game/WinScreen";
import { ChatDock, ReactionFloats } from "@/components/game/Chat";
import { TradeButton, TradePanel } from "@/components/game/TradePanel";
import { TradeToast } from "@/components/game/TradeToast";
import { Announcer } from "@/components/game/Announcer";
import { PlayerMenu } from "@/components/game/PlayerMenu";
import { DiscardBar } from "@/components/game/DiscardBar";
import { TurnCountdown } from "@/components/game/TurnCountdown";
import { Dice, RollMoment } from "@/components/game/Dice";
import { TableMenu } from "@/components/game/TableMenu";
import { ResourceHand } from "@/components/game/Hand";
import { COST, RESOURCES, RESOURCE_LABEL, type BuildMode, type DevKind, type GameState, type PlayerState, type Resource } from "@/lib/game/types";
import { hiddenCount, legalRoads, playable, publicVP, totalVP } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { play } from "@/lib/sound";
import { useViewport } from "@/lib/viewport";
import { useMoreBelow } from "@/lib/scroll-fade";
import { cn } from "@/lib/utils";

const FORTUNE_NAMES: [DevKind, string][] = [
  ["knight", "knight"],
  ["road", "path"],
  ["plenty", "plenty"],
  ["monopoly", "monopoly"],
  ["vp", "points"],
];

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
    case "knight":
      return ["Pick a hex for the wayfarer", "Wayfarer card"];
    case "roadCard":
      return [roadPicks ? "Pick one more path" : "Pick two paths", "Path fortune"];
    default:
      return null;
  }
}

// The seat's roll-off die, shown through the roll-off and setup (docs/design/first-player.md); "–" until it rolls this round.
function RollOffDie({ state, id, className }: { state: GameState; id: string; className: string }) {
  if (!state.rollOff || state.turn !== 0) return null;
  return (
    <span data-testid="rolloff-die" className={cn("grid shrink-0 place-items-center rounded-[8px] bg-fg font-medium text-bg tabular-nums", className)}>
      {state.rollOff.rolls[id] ?? "–"}
    </span>
  );
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
  const seats = useGame((s) => s.seats);
  const error = useGame((s) => s.error);
  const howTo = useGame((s) => s.howTo);
  const dispatch = useGame((s) => s.dispatch);
  const setBuildMode = useGame((s) => s.setBuildMode);
  const setHowTo = useGame((s) => s.setHowTo);
  const menuFor = useGame((s) => s.menuFor);
  const openMenu = useGame((s) => s.openMenu);
  // A watcher (docs/design/spectator.md): `me` below falls back to seat 0, so its hand bar is hidden by this flag, never by `localId`.
  const spectator = useGame((s) => s.spectator);
  const { phone, portrait } = useViewport();
  const [hintDismissed, setHintDismissed] = useState(() => sessionStorage.getItem(HINT_KEY) === "1");
  useEscapeDisarm();
  const [stackRef, moreBelow] = useMoreBelow();

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
  const knightButton =
    mine && !state.playedCard && playable(me, "knight") > 0 ? (
      <Button
        size="sm"
        data-testid="knight-button"
        className={phone ? "h-11 min-w-11" : undefined}
        aria-pressed={buildMode === "knight"}
        variant={buildMode === "knight" ? "primary" : "secondary"}
        onClick={() => setBuildMode(buildMode === "knight" ? "none" : "knight")}
      >
        Wayfarer card{playable(me, "knight") > 1 ? ` ×${playable(me, "knight")}` : ""}
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

  return (
    <>
      <PlaceChip />
      {/* #442: one control up top. The turn number, watcher count, How to play, sound and Leave live in the menu, whose open
          sheet rises over the z-20 chat dock (it reaches the header on a sideways phone). A watcher's badge stays out here,
          a chip and not a button, so a watcher always sees why it has no controls (docs/design/spectator.md). */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] has-[#table-menu]:z-30">
        <div className="pointer-events-auto flex items-center justify-end gap-2">
          {phone && !portrait ? <SeatStrip actor={actor} className="min-w-0 max-w-[34rem] flex-1" /> : null}
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
          className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+4.25rem)] z-10"
        />
      ) : null}
      {phone && menuPlayer ? (
        <PlayerMenu
          player={menuPlayer}
          className={cn(
            "absolute z-20",
            portrait ? "inset-x-3 top-[calc(env(safe-area-inset-top)+7.25rem)]" : "right-3 top-16 w-72",
          )}
        />
      ) : null}

      {/* An open player menu is a popover, so the rail rises over the bottom stack while it shows (they overlap at 800x500). */}
      {phone ? null : (
      <aside className={cn("pointer-events-none absolute left-3 top-20 hidden w-56 flex-col gap-2 md:flex", menuFor ? "z-20" : "z-10")}>
        {state.players.map((p) => (
          <div key={p.id} className="pointer-events-auto flex flex-col gap-1">
            <div
              data-testid={`rail-${p.id}`}
              className={cn(
                "relative rounded-[16px] border bg-glass backdrop-blur-md",
                p.id === state.current ? "border-accent" : "border-white/50",
              )}
            >
              {/* The card is the menu's trigger (docs/design/chat.md "The player action menu"). */}
              <button
                type="button"
                data-menu-trigger={p.id}
                aria-expanded={menuFor === p.id}
                aria-controls={`player-menu-${p.id}`}
                onClick={() => openMenu(menuFor === p.id ? null : p.id)}
                className="block w-full cursor-pointer rounded-[16px] px-3 py-2 text-left hover:bg-white/40"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: p.color }} />
                    <span className="text-sm font-medium">{p.name}</span>
                    <RollOffDie state={state} id={p.id} className="size-6 text-sm" />
                  </span>
                  <span className="tabular-nums text-sm text-zinc-700">{publicVP(state, p.id)} vp{p.id === actor && p.hidden.vp > 0 ? ` (+${p.hidden.vp} hidden)` : ""}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-zinc-700">
                  {p.goods ?? RESOURCES.reduce((n, r) => n + p.resources[r], 0)} goods · {p.fortunes ?? hiddenCount(p)} fortunes
                  {seats.some((s) => s.away && (s.name === p.name || `${s.name} (bot)` === p.name)) ? " · reconnecting…" : ""}
                </span>
                {p.id === actor && hiddenCount(p) > 0 ? (
                  <span className="mt-0.5 block text-xs text-zinc-700">
                    {FORTUNE_NAMES.filter(([k]) => p.hidden[k] > 0)
                      .map(([k, label]) => `${label} ×${p.hidden[k]}${p.boughtThisTurn[k] > 0 ? ` (${p.boughtThisTurn[k]} new)` : ""}`)
                      .join(" · ")}
                  </span>
                ) : null}
              </button>
              <ReactionFloats by="player" id={p.id} />
            </div>
            {menuFor === p.id ? <PlayerMenu player={p} /> : null}
          </div>
        ))}
      </aside>
      )}

      <ChatDock />
      <TradeToast />
      <Announcer />
      <RollMoment />

      <div className="pointer-events-none absolute bottom-0 inset-x-0 z-10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="relative mx-auto max-w-3xl">
          {/* #459: floats above the stack, so it coming and going never reflows the turn banner. */}
          {banner ? (
            <p
              role="status"
              data-testid="banner"
              className="pointer-events-none absolute inset-x-0 bottom-full mb-2 animate-[turn-fade_200ms_ease-out] rounded-[16px] border border-accent/40 bg-surface px-3 py-2 text-center text-sm font-medium text-zinc-900"
            >
              {banner}
            </p>
          ) : null}
          <div
            ref={stackRef}
            className={cn(
              "pointer-events-auto flex flex-col gap-2 overflow-y-auto overscroll-contain",
              // #383: stop under the header (or the portrait seat strip) and leave the island at least ~8 rem.
              phone && portrait ? "max-h-[calc(100dvh-16rem)]" : "max-h-[calc(100dvh-13rem)]",
            )}
          >
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
                {winner ? `${winner.name} wins with ${totalVP(state, winner.id)} points.` : null}
                {error ? <span className={cn("block text-orange-700", winner && "mt-1")}>{error}</span> : null}
              </p>
            ) : null}

            {spectator ? null : <ResourceHand me={me} />}

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
                {knightButton}
                {!state.playedCard && playable(me, "road") > 0 && me.pathsLeft > 0 && legalRoads(state, me.id, false).length > 0 ? (
                  <Button
                    size="sm"
                    variant={buildMode === "roadCard" ? "primary" : "secondary"}
                    className={phone ? "h-11 min-w-11" : undefined}
                    aria-pressed={buildMode === "roadCard"}
                    onClick={() => setBuildMode(buildMode === "roadCard" ? "none" : "roadCard")}
                  >
                    Path fortune{playable(me, "road") > 1 ? ` ×${playable(me, "road")}` : ""}
                  </Button>
                ) : null}
                {!state.playedCard && playable(me, "plenty") > 0 ? <PlentyForm /> : null}
                {!state.playedCard && playable(me, "monopoly") > 0 ? <MonopolyForm /> : null}
                <Button size="sm" variant="sea" className="ml-auto" onClick={() => dispatch({ type: "endTurn" })}>
                  End turn
                </Button>
              </div>
            ) : null}

            {(state.phase === "roll" || state.phase === "rollOff") && mine ? (
              <div className="flex flex-col gap-2">
                {knightButton ? <div className="flex flex-wrap gap-1">{knightButton}</div> : null}
                <Button size="lg" onClick={() => dispatch({ type: "roll" })}>
                  <Dices className="size-5" /> Roll
                </Button>
              </div>
            ) : null}

            {state.dice ? <Dice values={state.dice} /> : null}

            <p
              data-testid="log-line"
              className="hidden max-h-16 shrink-0 overflow-y-auto rounded-[16px] bg-glass px-3 py-1 text-xs text-zinc-700 backdrop-blur-md sm:block short:hidden"
            >
              {state.log.filter((l) => !ROLL_LOG.test(l)).slice(-3).join(" · ")}
            </p>
          </div>
          {moreBelow ? (
            <div
              data-testid="hud-more-below"
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-zinc-900/40 to-transparent"
            />
          ) : null}
        </div>
      </div>

      <TradePanel />
      {howTo ? <HowTo onClose={() => setHowTo(false)} /> : null}
      <WinScreen />

      <p className="sr-only">
        Costs: path {COST.path.timber} timber {COST.path.clay} clay. Outpost timber clay wool grain. Stronghold 3 grain 2
        ore.
      </p>
    </>
  );
}

// Hotseat's "Seat 2" .. "Seat 4" would all read "Sea", so a trailing number keeps the initial and the number ("S2").
function shortName(name: string) {
  const n = /\d+$/.exec(name)?.[0];
  return n ? `${name[0]}${n}` : name.slice(0, 3);
}

// Three letters is all an 89 px cell holds, so seats that still share a short form ("Ember", "Emberly") fall back to
// the initial and the seat number ("E1", "E2").
function shortNames(names: string[]) {
  const short = names.map(shortName);
  return short.map((s, i) => (short.some((o, j) => j !== i && o === s) ? `${names[i]![0]}${i + 1}` : s));
}

// Phone seat strip (docs/design/mobile-hud.md): 44 px, one cell per seat. Compact vs the rail: no per-fortune
// breakdown (that line is rail-only), hidden points show as "+N", and "reconnecting…" replaces the counts line.
function SeatStrip({ actor, className }: { actor: string; className: string }) {
  const state = useGame((s) => s.state)!;
  const seats = useGame((s) => s.seats);
  const menuFor = useGame((s) => s.menuFor);
  const openMenu = useGame((s) => s.openMenu);
  const short = shortNames(state.players.map((p) => p.name));
  return (
    <div data-testid="seat-strip" className={cn("pointer-events-auto flex h-11 gap-1", className)}>
      {state.players.map((p, i) => {
        const away = seats.some((s) => s.away && (s.name === p.name || `${s.name} (bot)` === p.name));
        const hidden = p.id === actor && p.hidden.vp > 0 ? p.hidden.vp : 0;
        const goods = p.goods ?? RESOURCES.reduce((n, r) => n + p.resources[r], 0);
        return (
          <div
            key={p.id}
            data-testid={`seat-${p.id}`}
            className={cn(
              "@container relative h-11 min-w-0 flex-1 rounded-[12px] border bg-glass leading-tight backdrop-blur-md",
              p.id === state.current ? "border-accent" : "border-white/50",
            )}
          >
            <button
              type="button"
              data-menu-trigger={p.id}
              aria-expanded={menuFor === p.id}
              aria-controls={`player-menu-${p.id}`}
              onClick={() => openMenu(menuFor === p.id ? null : p.id)}
              className="flex h-full w-full cursor-pointer flex-col justify-center rounded-[12px] px-2 text-left @max-[100px]:px-1.5"
            >
              <span className="flex w-full items-center gap-1.5 @max-[100px]:gap-1">
                <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} />
                {/* #420: under 100 px a deliberate short form: three letters or initial + number (the full name stays for screen readers), and the
                    die only while the roll-off is live, so it never sits beside the points as one number. */}
                <span data-testid="seat-name" className="min-w-0 flex-1 truncate text-xs font-medium @max-[100px]:sr-only">{p.name}</span>
                <span data-testid="seat-name" aria-hidden="true" className="hidden min-w-0 flex-1 text-xs font-medium @max-[100px]:block">
                  {short[i]}
                </span>
                <RollOffDie
                  state={state}
                  id={p.id}
                  className={cn("size-4 rounded-[4px] text-[10px]", state.phase !== "rollOff" && "@max-[100px]:hidden")}
                />
                <span
                  data-testid="seat-vp"
                  className={cn("shrink-0 text-xs tabular-nums text-zinc-700", state.phase === "rollOff" && "@max-[100px]:hidden")}
                >
                  {publicVP(state, p.id)}
                  {hidden ? `+${hidden}` : ""}
                </span>
              </span>
              <span className="block w-full truncate text-[10px] text-zinc-700">
                {away ? "reconnecting…" : `${goods}g · ${p.fortunes ?? hiddenCount(p)}f`}
              </span>
            </button>
            <ReactionFloats by="player" id={p.id} />
          </div>
        );
      })}
    </div>
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

// Coarse pointers pick a mark, then confirm here (docs/design/mobile-camera-touch.md). Enter confirms, Esc cancels.
function PlaceChip() {
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
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(11rem,calc(env(safe-area-inset-bottom)+10.5rem))] z-20 flex items-center justify-end gap-3 px-3">
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

// Year of plenty: two resources from the bank (rules.ts playPlenty).
function PlentyForm() {
  const dispatch = useGame((s) => s.dispatch);
  const bank = useGame((s) => s.state!.bank);
  // The bank cannot pay what it has run out of (#360), so those are greyed out; rules.ts refuses them too.
  const empty = RESOURCES.filter((r) => bank[r] <= 0);
  const why = empty.length ? `The bank has no ${empty.join(" or ")}.` : undefined;
  // Controlled, so a pick the bank empties while the form is open falls back to the first card it still has.
  const [pick, setPick] = useState<[Resource, Resource]>(["timber", "timber"]);
  const first = RESOURCES.find((r) => bank[r] > 0);
  const chosen = pick.map((r) => (bank[r] > 0 ? r : first));
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (first) dispatch({ type: "playPlenty", resources: chosen as Resource[] });
      }}
    >
      {[0, 1].map((i) => (
        <select
          key={i}
          name={i === 0 ? "plentyA" : "plentyB"}
          aria-label={i === 0 ? "First plenty resource" : "Second plenty resource"}
          aria-description={why}
          value={chosen[i] ?? ""}
          onChange={(e) => setPick((p) => (i === 0 ? [e.target.value as Resource, p[1]] : [p[0], e.target.value as Resource]))}
          className="h-9 rounded-[8px] border border-white/50 bg-raised px-2 text-sm"
        >
          {RESOURCES.map((r) => (
            <option key={r} value={r} disabled={empty.includes(r)} aria-disabled={empty.includes(r) || undefined}>
              {empty.includes(r) ? `${RESOURCE_LABEL[r]} (bank empty)` : RESOURCE_LABEL[r]}
            </option>
          ))}
        </select>
      ))}
      <Button size="sm" variant="secondary" type="submit" disabled={!first}>
        Plenty
      </Button>
      {first ? null : <span className="text-xs">The bank is empty.</span>}
    </form>
  );
}

// Monopoly: every other player's cards of one resource (rules.ts playMonopoly).
function MonopolyForm() {
  const dispatch = useGame((s) => s.dispatch);
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const r = new FormData(e.currentTarget).get("monopoly") as Resource;
        if (r) dispatch({ type: "playMonopoly", resource: r });
      }}
    >
      <select name="monopoly" aria-label="Monopoly resource" className="h-9 rounded-[8px] border border-white/50 bg-raised px-2 text-sm">
        {RESOURCES.map((r) => (
          <option key={r} value={r}>
            All {RESOURCE_LABEL[r]}
          </option>
        ))}
      </select>
      <Button size="sm" variant="secondary" type="submit">
        Monopoly
      </Button>
    </form>
  );
}

// A modal dialog: focus goes to Close on open and back to whatever opened it on close; Escape closes it (see useEscapeDisarm for the order).
export function HowTo({ onClose }: { onClose: () => void }) {
  const phone = useViewport().phone;
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    // Safari never focuses a button on click, so the opener comes from the store; activeElement is the fallback.
    const opener = useGame.getState().howToOpener ?? (document.activeElement as HTMLElement | null);
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])].filter(
          (el) => !el.hasAttribute("disabled"),
        );
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === -1 || i === items.length - 1 ? 0 : i + 1;
        e.preventDefault();
        items[next]!.focus();
      }
      if (e.key !== "Escape") return;
      e.stopPropagation();
      play("ui_back");
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="howto-title"
      ref={dialogRef}
      className="absolute inset-0 z-30 flex items-end justify-center bg-white/45 p-3 sm:items-center"
    >
      <div className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-[28px] border border-white/50 bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="howto-title" className="font-display text-2xl">How to play</h2>
          <Button ref={closeRef} variant="ghost" size="icon" className={phone ? "size-11" : undefined} onClick={onClose} aria-label="Close" back>
            <X className="size-4" />
          </Button>
        </div>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-600">
          <p>Settle a wild hex island. Ten points wins.</p>
          <p>Each turn: roll. Matching numbers pay goods from tiles you touch. A seven sends the wayfarer — blocked land pays nothing, and anyone with more than seven goods discards half.</p>
          <p>Build paths (timber + clay), outposts (timber, clay, wool, grain), strongholds (three grain, two ore). Fortunes cost wool, grain, ore.</p>
          <p>Outposts score 1, strongholds 2. Longest path of five and largest army of three wayfarer cards score 2 more. Ports cut bank trade to 3:1 or 2:1.</p>
          <p>Drag to orbit the isle. Tap glowing corners and paths to build.</p>
        </div>
      </div>
    </div>
  );
}
