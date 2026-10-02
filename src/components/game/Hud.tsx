import { useEffect } from "react";
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
import { ChatDock, ReactionFloats } from "@/components/game/Chat";
import { COST, RESOURCES, RESOURCE_LABEL, type Resource } from "@/lib/game/types";
import { harborRate, hiddenCount, legalRoads, playable, publicVP, totalVP } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { cn } from "@/lib/utils";

const ICONS: Record<Resource, typeof Trees> = {
  timber: Trees,
  clay: BrickWall,
  wool: Cloud,
  grain: Wheat,
  ore: Mountain,
};

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
  const goTitle = useGame((s) => s.goTitle);
  const setHowTo = useGame((s) => s.setHowTo);

  if (!state) return null;
  const actor = mode === "hotseat" ? state.current : localId;
  const me = state.players.find((p) => p.id === actor) ?? state.players[0]!;
  const mine = state.current === actor;
  const needDiscard = state.phase === "discard" && (state.discardNeeded[actor] ?? 0) > 0;
  const winner = state.winner ? state.players.find((p) => p.id === state.winner) : null;

  return (
    <>
      <PlaceChip />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto flex max-w-5xl items-center justify-between gap-2">
          <div className="flex items-center gap-2 rounded-[20px] border border-white/50 bg-white/45 px-3 py-2 backdrop-blur-md">
            <span className="font-display text-lg tracking-tight">Emberisle</span>
            <span className="hidden text-xs text-zinc-600 sm:inline">Turn {Math.max(1, state.turn)}</span>
          </div>
          <div className="flex gap-1">
            <Button variant="secondary" size="icon" onClick={() => setHowTo(true)} aria-label="How to play">
              <BookOpen className="size-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={goTitle}>
              Leave
            </Button>
          </div>
        </div>
      </header>

      <aside className="pointer-events-none absolute left-3 top-20 z-10 hidden w-56 flex-col gap-2 md:flex">
        {state.players.map((p) => (
          <div
            key={p.id}
            className={cn(
              "pointer-events-auto relative rounded-[16px] border bg-white/45 px-3 py-2 backdrop-blur-md",
              p.id === state.current ? "border-accent" : "border-white/50",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: p.color }} />
                <span className="text-sm font-medium">{p.name}</span>
              </div>
              <span className="tabular-nums text-sm text-zinc-600">{publicVP(state, p.id)} vp</span>
            </div>
            <p className="mt-1 text-xs text-zinc-600">
              {p.goods ?? RESOURCES.reduce((n, r) => n + p.resources[r], 0)} goods · {p.fortunes ?? hiddenCount(p)} fortunes
              {seats.some((s) => s.away && (s.name === p.name || `${s.name} (bot)` === p.name)) ? " · reconnecting…" : ""}
            </p>
            <ReactionFloats by="player" id={p.id} />
          </div>
        ))}
      </aside>

      <ChatDock />

      <div className="pointer-events-none absolute bottom-0 inset-x-0 z-10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-2">
          {banner ? (
            <p
              role="status"
              data-testid="banner"
              className="rounded-[16px] border border-accent/40 bg-surface px-3 py-2 text-center text-sm font-medium text-zinc-900"
            >
              {banner}
            </p>
          ) : null}
          <p className="rounded-[16px] border border-white/50 bg-white/45 px-3 py-2 text-sm text-zinc-900 backdrop-blur-md">
            {winner
              ? `${winner.name} wins with ${totalVP(state, winner.id)} points.`
              : buildMode === "roadCard"
                ? `Path fortune: pick ${roadPicks.length ? "one more path" : "two paths"} on the glowing edges.`
                : phaseCopy(state.phase)}
            {error ? <span className="mt-1 block text-orange-700">{error}</span> : null}
          </p>

          <div className="flex gap-1 overflow-x-auto rounded-[20px] border border-white/50 bg-white/45 p-2 backdrop-blur-md">
            {RESOURCES.map((r) => {
              const Icon = ICONS[r];
              return (
                <div key={r} className="flex min-w-[3.5rem] flex-1 flex-col items-center gap-1 rounded-[12px] bg-raised px-2 py-2">
                  <Icon className="size-4 text-zinc-600" />
                  <span className="tabular-nums text-base font-medium">{me.resources[r]}</span>
                  <span className="text-[10px] uppercase tracking-wide text-zinc-600">{RESOURCE_LABEL[r]}</span>
                </div>
              );
            })}
          </div>

          {needDiscard ? <DiscardBar n={state.discardNeeded[actor]!} /> : null}
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
              <BankTrade />
              {!state.playedCard && playable(me, "knight") > 0 ? (
                <Button
                  size="sm"
                  variant={buildMode === "knight" ? "primary" : "secondary"}
                  onClick={() => setBuildMode(buildMode === "knight" ? "none" : "knight")}
                >
                  Wayfarer card{playable(me, "knight") > 1 ? ` ×${playable(me, "knight")}` : ""}
                </Button>
              ) : null}
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
            <Button size="lg" onClick={() => dispatch({ type: "roll" })}>
              <Dices className="size-5" /> Roll
            </Button>
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

      {howTo ? <HowTo onClose={() => setHowTo(false)} /> : null}
      {winner ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] border border-white/50 bg-surface p-6 text-center">
            <p className="font-display text-3xl">{winner.name} rules the isle</p>
            <p className="mt-2 text-zinc-600">{totalVP(state, winner.id)} points</p>
            <Button className="mt-6 w-full" onClick={goTitle}>
              Return
            </Button>
          </div>
        </div>
      ) : null}

      <p className="sr-only">
        Costs: path {COST.path.timber} timber {COST.path.clay} clay. Outpost timber clay wool grain. Stronghold 3 grain 2
        ore.
      </p>
    </>
  );
}

function DiscardBar({ n }: { n: number }) {
  const me = useGame((s) => {
    const st = s.state!;
    const id = s.mode === "hotseat" ? st.current : s.localId;
    return st.players.find((p) => p.id === id)!;
  });
  const dispatch = useGame((s) => s.dispatch);
  const picked = useGame(() => null);
  void picked;
  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-[16px] border border-accent/40 bg-surface p-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const resources: Partial<Record<Resource, number>> = {};
        let sum = 0;
        for (const r of RESOURCES) {
          const v = Number(fd.get(r) || 0);
          resources[r] = v;
          sum += v;
        }
        if (sum !== n) return;
        dispatch({ type: "discard", resources });
      }}
    >
      <span className="text-sm">Discard {n}</span>
      {RESOURCES.map((r) => (
        <label key={r} className="flex items-center gap-1 text-xs">
          {RESOURCE_LABEL[r]}
          <input
            name={r}
            type="number"
            min={0}
            max={me.resources[r]}
            defaultValue={0}
            className="h-9 w-12 rounded-[8px] border border-white/50 bg-raised px-1 text-center"
          />
        </label>
      ))}
      <Button size="sm" type="submit">
        Discard
      </Button>
    </form>
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

function BankTrade() {
  const state = useGame((s) => s.state)!;
  const localId = useGame((s) => s.localId);
  const mode = useGame((s) => s.mode);
  const dispatch = useGame((s) => s.dispatch);
  const actor = mode === "hotseat" ? state.current : localId;
  const me = state.players.find((p) => p.id === actor)!;
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const give = fd.get("give") as Resource;
        const want = fd.get("want") as Resource;
        if (give && want && give !== want) dispatch({ type: "bankTrade", give, want });
      }}
    >
      <select name="give" className="h-9 rounded-[8px] border border-white/50 bg-raised px-2 text-sm">
        {RESOURCES.map((r) => (
          <option key={r} value={r}>
            Give {harborRate(state, me.id, r)} {RESOURCE_LABEL[r]}
          </option>
        ))}
      </select>
      <select name="want" className="h-9 rounded-[8px] border border-white/50 bg-raised px-2 text-sm">
        {RESOURCES.map((r) => (
          <option key={r} value={r}>
            For {RESOURCE_LABEL[r]}
          </option>
        ))}
      </select>
      <Button size="sm" variant="secondary" type="submit">
        Bank
      </Button>
    </form>
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
