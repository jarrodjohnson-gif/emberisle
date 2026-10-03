import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Dices,
  Home,
  Landmark,
  Mountain,
  Route,
  Trees,
  Wheat,
  Cloud,
  BrickWall,
  ScrollText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WinScreen } from "@/components/game/WinScreen";
import { ChatDock, ReactionFloats } from "@/components/game/Chat";
import { TradeButton, TradePanel } from "@/components/game/TradePanel";
import { TradeToast } from "@/components/game/TradeToast";
import { PlayerMenu } from "@/components/game/PlayerMenu";
import { DiscardBar } from "@/components/game/DiscardBar";
import { COST, RESOURCES, RESOURCE_LABEL, type DevKind, type PlayerState, type Resource } from "@/lib/game/types";
import { hiddenCount, legalRoads, playable, publicVP, totalVP } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { useViewport } from "@/lib/viewport";
import { cn } from "@/lib/utils";

const ICONS: Record<Resource, typeof Trees> = {
  timber: Trees,
  clay: BrickWall,
  wool: Cloud,
  grain: Wheat,
  ore: Mountain,
};

const FORTUNE_NAMES: [DevKind, string][] = [
  ["knight", "knight"],
  ["road", "path"],
  ["plenty", "plenty"],
  ["monopoly", "monopoly"],
  ["vp", "points"],
];

function phaseCopy(phase: string) {
  switch (phase) {
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

const HINT_KEY = "emberisle-landscape-hint";

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
  const { phone, portrait } = useViewport();
  const [hintDismissed, setHintDismissed] = useState(() => sessionStorage.getItem(HINT_KEY) === "1");

  if (!state) return null;
  const actor = mode === "hotseat" ? state.current : localId;
  const me = state.players.find((p) => p.id === actor) ?? state.players[0]!;
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
  const knightButton =
    mine && !state.playedCard && playable(me, "knight") > 0 ? (
      <Button
        size="sm"
        data-testid="knight-button"
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
  const phaseText =
    yours && state.phase === "discard"
      ? `discard ${state.discardNeeded[subject] ?? 0}`
      : yours && state.phase === "robber"
        ? "move the wayfarer"
        : phaseCopy(state.phase);
  const turnText = `${yours ? "Your" : `${subjectPlayer.name}'s`} turn — ${phaseText}`;
  const winner = state.winner ? state.players.find((p) => p.id === state.winner) : null;
  const menuPlayer = menuFor ? state.players.find((p) => p.id === menuFor) : null;

  return (
    <>
      <PlaceChip />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto flex max-w-5xl items-center justify-between gap-2">
          <div className="flex items-center gap-2 rounded-[20px] border border-white/50 bg-white/45 px-3 py-2 backdrop-blur-md">
            <span className="font-display text-lg tracking-tight">Emberisle</span>
            <span className="hidden text-xs text-zinc-600 sm:inline">Turn {Math.max(1, state.turn)}</span>
          </div>
          {phone && !portrait ? <SeatStrip actor={actor} className="ml-auto min-w-0 max-w-[34rem] flex-1" /> : null}
          <div className="flex gap-1">
            <Button variant="secondary" size="icon" onClick={() => setHowTo(true)} aria-label="How to play">
              <BookOpen className="size-4" />
            </Button>
            <LeaveButton confirm={mode === "online" && state.phase !== "over"} />
          </div>
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

      {phone ? null : (
      <aside className="pointer-events-none absolute left-3 top-20 z-10 hidden w-56 flex-col gap-2 md:flex">
        {state.players.map((p) => (
          <div key={p.id} className="pointer-events-auto flex flex-col gap-1">
            <div
              data-testid={`rail-${p.id}`}
              className={cn(
                "relative rounded-[16px] border bg-white/45 backdrop-blur-md",
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
                  </span>
                  <span className="tabular-nums text-sm text-zinc-600">{publicVP(state, p.id)} vp{p.id === actor && p.hidden.vp > 0 ? ` (+${p.hidden.vp} hidden)` : ""}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-zinc-600">
                  {p.goods ?? RESOURCES.reduce((n, r) => n + p.resources[r], 0)} goods · {p.fortunes ?? hiddenCount(p)} fortunes
                  {seats.some((s) => s.away && (s.name === p.name || `${s.name} (bot)` === p.name)) ? " · reconnecting…" : ""}
                </span>
                {p.id === actor && hiddenCount(p) > 0 ? (
                  <span className="mt-0.5 block text-xs text-zinc-600">
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

      <div className="pointer-events-none absolute bottom-0 inset-x-0 z-10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-2">
          {phone && portrait && !hintDismissed ? (
            <p
              data-testid="landscape-hint"
              className="pointer-events-none flex h-11 items-center justify-between gap-2 rounded-[16px] border border-white/50 bg-white/45 pl-3 text-sm text-zinc-900 backdrop-blur-md"
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
                "animate-[turn-fade_200ms_ease-out] rounded-[16px] border bg-white/45 px-3 py-2 text-sm font-medium text-zinc-900 backdrop-blur-md",
                yours ? "border-accent bg-accent/20" : "border-white/50 border-l-4",
              )}
            >
              {turnText}
            </p>
          )}
          {banner ? (
            <p
              role="status"
              data-testid="banner"
              className="rounded-[16px] border border-accent/40 bg-surface px-3 py-2 text-center text-sm font-medium text-zinc-900"
            >
              {banner}
            </p>
          ) : null}
          {winner || buildMode === "roadCard" || error ? (
            <p className="rounded-[16px] border border-white/50 bg-white/45 px-3 py-2 text-sm text-zinc-900 backdrop-blur-md">
              {winner
                ? `${winner.name} wins with ${totalVP(state, winner.id)} points.`
                : buildMode === "roadCard"
                  ? `Path fortune: pick ${roadPicks.length ? "one more path" : "two paths"} on the glowing edges.`
                  : null}
              {error ? <span className={cn("block text-orange-700", (winner || buildMode === "roadCard") && "mt-1")}>{error}</span> : null}
            </p>
          ) : null}

          <ResourceHand me={me} />

          {discarder ? <DiscardBar key={`discard-${discarder}`} id={discarder} n={state.discardNeeded[discarder]!} /> : null}
          <TakeFromBar />

          {state.phase === "main" && mine ? (
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                variant={buildMode === "path" ? "primary" : "secondary"}
                onClick={() => setBuildMode(buildMode === "path" ? "none" : "path")}
              >
                <Route className="size-4" /> Path
              </Button>
              <Button
                size="sm"
                variant={buildMode === "outpost" ? "primary" : "secondary"}
                onClick={() => setBuildMode(buildMode === "outpost" ? "none" : "outpost")}
              >
                <Home className="size-4" /> Outpost
              </Button>
              <Button
                size="sm"
                variant={buildMode === "stronghold" ? "primary" : "secondary"}
                onClick={() => setBuildMode(buildMode === "stronghold" ? "none" : "stronghold")}
              >
                <Landmark className="size-4" /> Stronghold
              </Button>
              <Button size="sm" variant="secondary" onClick={() => dispatch({ type: "buyCard" })}>
                <ScrollText className="size-4" /> Fortune
              </Button>
              <TradeButton />
              {knightButton}
              {!state.playedCard && playable(me, "road") > 0 && me.pathsLeft > 0 && legalRoads(state, me.id, false).length > 0 ? (
                <Button
                  size="sm"
                  variant={buildMode === "roadCard" ? "primary" : "secondary"}
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

          {state.phase === "roll" && mine ? (
            <div className="flex flex-col gap-2">
              {knightButton ? <div className="flex flex-wrap gap-1">{knightButton}</div> : null}
              <Button size="lg" onClick={() => dispatch({ type: "roll" })}>
                <Dices className="size-5" /> Roll
              </Button>
            </div>
          ) : null}

          {state.dice ? (
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <span className="inline-flex size-9 items-center justify-center rounded-[8px] bg-fg text-bg tabular-nums">
                {state.dice[0]}
              </span>
              <span className="inline-flex size-9 items-center justify-center rounded-[8px] bg-fg text-bg tabular-nums">
                {state.dice[1]}
              </span>
              <span className="tabular-nums">{state.dice[0] + state.dice[1]}</span>
            </div>
          ) : null}

          <p className="hidden max-h-16 overflow-y-auto text-xs text-zinc-600 sm:block">
            {state.log.slice(-3).join(" · ")}
          </p>
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

// Phone seat strip (docs/design/mobile-hud.md): 44 px, one cell per seat. Compact vs the rail: no per-fortune
// breakdown (that line is rail-only), hidden points show as "+N", and "reconnecting…" replaces the counts line.
function SeatStrip({ actor, className }: { actor: string; className: string }) {
  const state = useGame((s) => s.state)!;
  const seats = useGame((s) => s.seats);
  const menuFor = useGame((s) => s.menuFor);
  const openMenu = useGame((s) => s.openMenu);
  return (
    <div data-testid="seat-strip" className={cn("pointer-events-auto flex h-11 gap-1", className)}>
      {state.players.map((p) => {
        const away = seats.some((s) => s.away && (s.name === p.name || `${s.name} (bot)` === p.name));
        const hidden = p.id === actor && p.hidden.vp > 0 ? p.hidden.vp : 0;
        const goods = p.goods ?? RESOURCES.reduce((n, r) => n + p.resources[r], 0);
        return (
          <div
            key={p.id}
            data-testid={`seat-${p.id}`}
            className={cn(
              "relative h-11 min-w-0 flex-1 rounded-[12px] border bg-white/45 leading-tight backdrop-blur-md",
              p.id === state.current ? "border-accent" : "border-white/50",
            )}
          >
            <button
              type="button"
              data-menu-trigger={p.id}
              aria-expanded={menuFor === p.id}
              aria-controls={`player-menu-${p.id}`}
              onClick={() => openMenu(menuFor === p.id ? null : p.id)}
              className="flex h-full w-full cursor-pointer flex-col justify-center rounded-[12px] px-2 text-left"
            >
              <span className="flex w-full items-center gap-1.5">
                <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{p.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-zinc-600">
                  {publicVP(state, p.id)}
                  {hidden ? `+${hidden}` : ""}
                </span>
              </span>
              <span className="block w-full truncate text-[10px] text-zinc-600">
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

const FLASH_MS = 1200;

// The hand's counts are diffed on every state, so a gain flashes +N green and a loss -N red whether it
// came from a roll, a trade, a build, a discard, or a steal, hotseat and online alike (#170). Only this
// hand is read: online, the other players arrive as a `goods` count with no `resources`. A change of
// seat (hotseat) resets the baseline instead of flashing.
function useResourceFlashes(me: PlayerState) {
  type Flash = { delta: number; at: number };
  const [flashes, setFlashes] = useState<Partial<Record<Resource, Flash>>>({});
  const prev = useRef<{ id: string; resources: Record<Resource, number> } | null>(null);
  const timers = useRef<Partial<Record<Resource, { flash: Flash; timer: ReturnType<typeof setTimeout> }>>>({});
  const counts = RESOURCES.map((r) => me.resources[r]).join(",");
  useEffect(() => {
    const was = prev.current;
    prev.current = { id: me.id, resources: me.resources };
    if (!was || was.id !== me.id) return;
    for (const r of RESOURCES) {
      const delta = me.resources[r] - was.resources[r];
      if (delta) setFlashes((f) => ({ ...f, [r]: { delta, at: Date.now() } }));
    }
  }, [me.id, counts]);
  // The label's clock starts once it is on the page. The render that mounts it is a separate task, which
  // on a slow machine can wait behind an island frame longer than FLASH_MS; a timer started with the count
  // change would then be due before the label existed (#248).
  useEffect(() => {
    for (const r of RESOURCES) {
      const flash = flashes[r];
      const cur = timers.current[r];
      if (!flash || cur?.flash === flash) continue;
      if (cur) clearTimeout(cur.timer);
      timers.current[r] = {
        flash,
        timer: setTimeout(() => {
          delete timers.current[r];
          setFlashes((f) => {
            if (f[r] !== flash) return f;
            const next = { ...f };
            delete next[r];
            return next;
          });
        }, FLASH_MS),
      };
    }
  }, [flashes]);
  useEffect(
    () => () => {
      Object.values(timers.current).forEach((t) => clearTimeout(t.timer));
      timers.current = {};
    },
    [],
  );
  return flashes;
}

function ResourceHand({ me }: { me: PlayerState }) {
  const flashes = useResourceFlashes(me);
  return (
    <div className="flex gap-1 overflow-x-auto rounded-[20px] border border-white/50 bg-white/45 p-2 backdrop-blur-md">
      {RESOURCES.map((r) => {
        const Icon = ICONS[r];
        const flash = flashes[r];
        const label = flash ? (flash.delta > 0 ? `+${flash.delta}` : String(flash.delta)) : null;
        return (
          <div
            key={r}
            data-testid={`resource-${r}`}
            className={cn(
              "relative flex min-w-[3.5rem] flex-1 flex-col items-center gap-1 rounded-[12px] px-2 py-2 transition-colors duration-700",
              !flash ? "bg-raised" : flash.delta > 0 ? "bg-emerald-200" : "bg-rose-200",
            )}
          >
            <Icon className="size-4 text-zinc-600" />
            <span className="tabular-nums text-base font-medium">{me.resources[r]}</span>
            <span className="text-[10px] uppercase tracking-wide text-zinc-600">{RESOURCE_LABEL[r]}</span>
            {flash ? (
              <span
                key={flash.at}
                data-testid="resource-flash"
                data-resource={r}
                data-delta={label}
                className={cn(
                  "pointer-events-none absolute right-1 top-1 text-sm font-semibold tabular-nums",
                  flash.delta > 0 ? "text-emerald-700" : "text-rose-700",
                )}
                style={{ animation: `resource-flash ${FLASH_MS}ms ease-out forwards` }}
              >
                {label}
              </span>
            ) : null}
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
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const a = fd.get("plentyA") as Resource;
        const b = fd.get("plentyB") as Resource;
        if (a && b) dispatch({ type: "playPlenty", resources: [a, b] });
      }}
    >
      {["plentyA", "plentyB"].map((name) => (
        <select key={name} name={name} aria-label={name === "plentyA" ? "First plenty resource" : "Second plenty resource"} className="h-9 rounded-[8px] border border-white/50 bg-raised px-2 text-sm">
          {RESOURCES.map((r) => (
            <option key={r} value={r}>
              {RESOURCE_LABEL[r]}
            </option>
          ))}
        </select>
      ))}
      <Button size="sm" variant="secondary" type="submit">
        Plenty
      </Button>
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

export function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-white/45 p-3 sm:items-center">
      <div className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-[28px] border border-white/50 bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-2xl">How to play</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
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

// Leaving an online table frees the seat for good (goTitle wipes the saved secret), so ask first. Stay, Escape or 5 s cancels.
function LeaveButton({ confirm }: { confirm: boolean }) {
  const goTitle = useGame((s) => s.goTitle);
  const phone = useViewport().phone;
  const [asking, setAsking] = useState(false);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const cancel = () => {
    setAsking(false);
    leaveRef.current?.focus();
  };
  useEffect(() => {
    if (!asking) return;
    stayRef.current?.focus();
    const timer = setTimeout(cancel, 5000);
    // Capture phase, so this Escape closes only the popover and not the trade panel behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      cancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [asking]);
  const menuFor = useGame((s) => s.menuFor);
  useEffect(() => {
    if (!confirm || menuFor) setAsking(false);
  }, [confirm, menuFor]);
  return (
    <div className="relative">
      <Button ref={leaveRef} variant="secondary" size="sm" onClick={confirm ? () => setAsking(true) : goTitle}>
        Leave
      </Button>
      {asking ? (
        <div
          role="alertdialog"
          aria-label="Leave the table?"
          aria-describedby="leave-confirm-msg"
          data-testid="leave-confirm"
          className="absolute right-0 top-full z-20 mt-2 flex w-64 flex-col gap-2 rounded-[16px] border border-white/50 bg-surface p-3 text-sm shadow-lg"
        >
          <p id="leave-confirm-msg">Leave the table? Your seat goes to the bot.</p>
          <div className="flex justify-end gap-2">
            <Button ref={stayRef} variant="secondary" size="sm" className={phone ? "h-11 min-w-11" : undefined} onClick={cancel}>
              Stay
            </Button>
            <Button size="sm" className={phone ? "h-11 min-w-11" : undefined} onClick={goTitle}>
              Leave
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
