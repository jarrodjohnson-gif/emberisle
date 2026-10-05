// #443: each seat is one line and the points are the number (docs/design/polish.md: numbers are heroes, colour is
// information). The desktop rail (an accordion: the player menu opens under its card, docs/design/chat.md) and the phone
// strip (docs/design/mobile-hud.md) share SeatLine: colour dot, name, goods and fortunes as two small counts only when
// non-zero, the roll-off die only while the roll-off is live, and the points at text-title. The seat on turn carries
// `seat-turn`: its dot pulses softly (bible §4.3) and the card brightens over 200 ms (§8), with an ink ring on the dot and
// aria-current so the turn never rests on colour or motion alone (#312); the dot is a SeatDot, so it carries the seat's
// mark. Your fortunes by kind and a dropped seat's state are facts in the player menu, one tap away.
import { ScrollText } from "lucide-react";
import { ReactionFloats } from "@/components/game/chunks";
import { LazyBoundary } from "@/lib/lazy";
import { PlayerMenu, seatAway } from "@/components/game/PlayerMenu";
import { SeatDot } from "@/components/game/SeatDot";
import type { GameState, PlayerState } from "@/lib/game/types";
import { cards, hiddenCount, publicVP } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { cn } from "@/lib/utils";

// The seat's roll-off die, "–" until it rolls this round; gone once the roll-off is settled (docs/design/first-player.md).
function RollOffDie({ state, id, className }: { state: GameState; id: string; className: string }) {
  if (!state.rollOff || state.phase !== "rollOff") return null;
  return (
    <span data-testid="rolloff-die" className={cn("grid shrink-0 place-items-center rounded-[8px] bg-fg font-medium text-bg tabular-nums", className)}>
      {state.rollOff.rolls[id] ?? "–"}
    </span>
  );
}

// A small count with its unit as a mark (a card outline for goods, the Fortune button's scroll for fortunes); the unit's
// word stays for screen readers. zinc-700 reads ≥ 4.5:1 on the glass.
function Count({ testid, n, unit, className }: { testid: string; n: number; unit: "good" | "fortune"; className?: string }) {
  return (
    <span data-testid={testid} className={cn("flex shrink-0 items-center gap-0.5 text-caption tabular-nums text-zinc-700", className)}>
      {n}
      {unit === "good" ? <span className="h-3 w-2.5 rounded-[2px] border-[1.5px] border-current" /> : <ScrollText className="size-3" aria-hidden="true" />}
      <span className="sr-only"> {unit}{n === 1 ? "" : "s"}</span>
    </span>
  );
}

// `short` is the strip's under-100 px form (#420); its presence makes this a strip line, which also hides the counts in
// a cell under 200 px so the name keeps its room. A dropped seat's marker shows at every width (the word only where it fits).
function SeatLine({ p, actor, short }: { p: PlayerState; actor: string; short?: string }) {
  const state = useGame((s) => s.state)!;
  const away = seatAway(useGame((s) => s.seats), p);
  const strip = short !== undefined;
  const hidden = p.id === actor && p.hidden.vp > 0 ? p.hidden.vp : 0;
  const goods = cards(p);
  const fortunes = p.fortunes ?? hiddenCount(p);
  const narrow = strip ? "@max-[200px]:hidden" : undefined;
  return (
    <>
      {/* Under 100 px a cell holds "Emb" and the points with 4 px gaps; the dot gives back its two extra pixels there (#420). */}
      <SeatDot color={p.color} className={cn("seat-dot size-3", strip && "@max-[100px]:size-2.5")} />
      <span data-testid="seat-name" className={cn("min-w-0 flex-auto truncate text-sm font-medium", strip && "@max-[100px]:sr-only")}>
        {p.name}
      </span>
      {strip ? (
        <span data-testid="seat-name" aria-hidden="true" className="hidden min-w-0 flex-auto text-xs font-medium @max-[100px]:block">
          {short}
        </span>
      ) : null}
      {away ? (
        <span data-testid="seat-away" className="flex min-w-4 shrink-[9] items-center gap-0.5 text-caption text-zinc-700">
          {/* A struck ring: the seat's circle with a line through it, in CSS so it costs no icon. */}
          <span className="relative size-2.5 shrink-0 rounded-full border-[1.5px] border-current after:absolute after:-inset-x-0.5 after:top-1/2 after:h-[1.5px] after:-rotate-45 after:bg-current" />
          <span aria-hidden="true" className={cn("truncate", narrow)}>
            reconnecting…
          </span>
          <span className="sr-only">reconnecting</span>
        </span>
      ) : (
        <>
          {goods > 0 ? <Count testid="seat-goods" n={goods} unit="good" className={narrow} /> : null}
          {fortunes > 0 ? <Count testid="seat-fortunes" n={fortunes} unit="fortune" className={narrow} /> : null}
        </>
      )}
      <RollOffDie state={state} id={p.id} className={strip ? "size-5 rounded-[4px] text-xs" : "size-6 text-sm"} />
      <span
        data-testid="seat-vp"
        className={cn("shrink-0 text-title tabular-nums", strip && state.phase === "rollOff" && "@max-[100px]:hidden")}
      >
        {publicVP(state, p.id)}
        <span className="sr-only"> points{hidden ? `, plus ${hidden} hidden` : ""}</span>
        {hidden ? (
          <span aria-hidden="true" className="text-caption text-zinc-700">
            +{hidden}
          </span>
        ) : null}
      </span>
    </>
  );
}

// One seat's card: the menu's trigger (docs/design/chat.md "The player action menu") with its reactions over it. The rail
// gives it `rail-<id>` and chip corners, the strip `seat-<id>`, control corners and a short name.
function SeatCard({ p, actor, short, className }: { p: PlayerState; actor: string; short?: string; className: string }) {
  const current = useGame((s) => s.state!.current);
  const menuFor = useGame((s) => s.menuFor);
  const openMenu = useGame((s) => s.openMenu);
  // #488: reactions only arrive at an online table; the chunk that draws them is loaded by then (see chunks.ts).
  const online = useGame((s) => s.mode === "online");
  const strip = short !== undefined;
  return (
    <div
      data-testid={`${strip ? "seat" : "rail"}-${p.id}`}
      className={cn("relative bg-glass backdrop-blur-md transition-colors duration-200 [&.seat-turn]:bg-raised/90", className, p.id === current && "seat-turn")}
    >
      <button
        type="button"
        data-menu-trigger={p.id}
        aria-expanded={menuFor === p.id}
        aria-controls={`player-menu-${p.id}`}
        aria-current={p.id === current || undefined}
        onClick={() => openMenu(menuFor === p.id ? null : p.id)}
        className={cn(
          "flex h-11 w-full cursor-pointer items-center rounded-[inherit] text-left hover:bg-white/40",
          strip ? "gap-1.5 px-2 @max-[100px]:gap-1 @max-[100px]:px-1.5" : "gap-2 px-3",
        )}
      >
        <SeatLine p={p} actor={actor} short={short} />
      </button>
      {online ? (
        <LazyBoundary failed={null}>
          <ReactionFloats by="player" id={p.id} />
        </LazyBoundary>
      ) : null}
    </div>
  );
}

// An open player menu is a popover, so the rail rises over the bottom stack while it shows (they overlap at 800x500).
export function SeatRail({ actor }: { actor: string }) {
  const players = useGame((s) => s.state!.players);
  const menuFor = useGame((s) => s.menuFor);
  return (
    <aside className={cn("pointer-events-none absolute left-3 top-20 hidden w-56 flex-col gap-2 md:flex", menuFor ? "z-20" : "z-10")}>
      {players.map((p) => (
        <div key={p.id} className="pointer-events-auto flex flex-col gap-1">
          <SeatCard p={p} actor={actor} className="rounded-chip" />
          {menuFor === p.id ? <PlayerMenu player={p} /> : null}
        </div>
      ))}
    </aside>
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

// Phone seat strip (docs/design/mobile-hud.md): 44 px, one cell per seat.
export function SeatStrip({ actor, className }: { actor: string; className: string }) {
  const players = useGame((s) => s.state!.players);
  const short = shortNames(players.map((p) => p.name));
  return (
    <div data-testid="seat-strip" className={cn("pointer-events-auto flex h-11 gap-1", className)}>
      {players.map((p, i) => (
        <SeatCard key={p.id} p={p} actor={actor} short={short[i]} className="@container h-11 min-w-0 flex-1 rounded-control" />
      ))}
    </div>
  );
}
