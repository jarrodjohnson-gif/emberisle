// #443: each seat is one line and the points are the number (docs/design/polish.md: numbers are heroes, colour is
// information). The desktop rail (an accordion: the player menu opens under its card, docs/design/chat.md) and the phone
// strip (docs/design/mobile-hud.md) share SeatLine: colour dot, name, goods and fortunes as two small counts only when
// non-zero, the roll-off die only while the roll-off is live, and the points at text-title. The seat on turn carries
// `seat-turn`: its dot pulses softly (bible §4.3) and the card brightens over 200 ms (§8), with an ink ring on the dot and
// aria-current so the turn never rests on colour or motion alone (#312). Your fortunes by kind and a dropped seat's
// state are facts in the player menu, one tap away.
import type { LucideIcon } from "lucide-react";
import { RectangleVertical, Sparkles, WifiOff } from "lucide-react";
import { ReactionFloats } from "@/components/game/Chat";
import { PlayerMenu, seatAway } from "@/components/game/PlayerMenu";
import { RESOURCES, type GameState, type PlayerState } from "@/lib/game/types";
import { hiddenCount, publicVP } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { cn } from "@/lib/utils";

const SEAT_CARD = "relative bg-glass backdrop-blur-md transition-colors duration-200 [&.seat-turn]:bg-raised/90";
const SEAT_BUTTON = "flex h-11 w-full cursor-pointer items-center rounded-[inherit] text-left hover:bg-white/40";

// The seat's roll-off die, "–" until it rolls this round; gone once the roll-off is settled (docs/design/first-player.md).
function RollOffDie({ state, id, className }: { state: GameState; id: string; className: string }) {
  if (!state.rollOff || state.phase !== "rollOff") return null;
  return (
    <span data-testid="rolloff-die" className={cn("grid shrink-0 place-items-center rounded-[8px] bg-fg font-medium text-bg tabular-nums", className)}>
      {state.rollOff.rolls[id] ?? "–"}
    </span>
  );
}

// A small count with its unit as an icon; the unit's word stays for screen readers. zinc-700 reads ≥ 4.5:1 on the glass.
function Count({ testid, n, unit, Icon, className }: { testid: string; n: number; unit: string; Icon: LucideIcon; className?: string }) {
  return (
    <span data-testid={testid} className={cn("flex shrink-0 items-center gap-0.5 text-caption tabular-nums text-zinc-700", className)}>
      {n}
      <Icon className="size-3" aria-hidden="true" />
      <span className="sr-only">
        {" "}
        {unit}
        {n === 1 ? "" : "s"}
      </span>
    </span>
  );
}

// `short` is the strip's under-100 px form (#420); its presence makes this a strip line, which also hides the counts in
// a cell under 160 px so the name keeps its room. A dropped seat's marker shows at every width (the word only where it fits).
function SeatLine({ state, p, actor, away, short }: { state: GameState; p: PlayerState; actor: string; away: boolean; short?: string }) {
  const strip = short !== undefined;
  const hidden = p.id === actor && p.hidden.vp > 0 ? p.hidden.vp : 0;
  const goods = p.goods ?? RESOURCES.reduce((n, r) => n + p.resources[r], 0);
  const fortunes = p.fortunes ?? hiddenCount(p);
  const narrow = strip ? "@max-[160px]:hidden" : undefined;
  return (
    <>
      <span className="seat-dot size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
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
          <WifiOff className="size-3 shrink-0" aria-hidden="true" />
          <span aria-hidden="true" className={cn("truncate", narrow)}>
            reconnecting…
          </span>
          <span className="sr-only">reconnecting</span>
        </span>
      ) : (
        <>
          {goods > 0 ? <Count testid="seat-goods" n={goods} unit="good" Icon={RectangleVertical} className={narrow} /> : null}
          {fortunes > 0 ? <Count testid="seat-fortunes" n={fortunes} unit="fortune" Icon={Sparkles} className={narrow} /> : null}
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

// An open player menu is a popover, so the rail rises over the bottom stack while it shows (they overlap at 800x500).
export function SeatRail({ actor }: { actor: string }) {
  const state = useGame((s) => s.state)!;
  const seats = useGame((s) => s.seats);
  const menuFor = useGame((s) => s.menuFor);
  const openMenu = useGame((s) => s.openMenu);
  return (
    <aside className={cn("pointer-events-none absolute left-3 top-20 hidden w-56 flex-col gap-2 md:flex", menuFor ? "z-20" : "z-10")}>
      {state.players.map((p) => (
        <div key={p.id} className="pointer-events-auto flex flex-col gap-1">
          <div data-testid={`rail-${p.id}`} className={cn(SEAT_CARD, "rounded-chip", p.id === state.current && "seat-turn")}>
            {/* The card is the menu's trigger (docs/design/chat.md "The player action menu"). */}
            <button
              type="button"
              data-menu-trigger={p.id}
              aria-expanded={menuFor === p.id}
              aria-controls={`player-menu-${p.id}`}
              aria-current={p.id === state.current || undefined}
              onClick={() => openMenu(menuFor === p.id ? null : p.id)}
              className={cn(SEAT_BUTTON, "gap-2 px-3")}
            >
              <SeatLine state={state} p={p} actor={actor} away={seatAway(seats, p)} />
            </button>
            <ReactionFloats by="player" id={p.id} />
          </div>
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
  const state = useGame((s) => s.state)!;
  const seats = useGame((s) => s.seats);
  const menuFor = useGame((s) => s.menuFor);
  const openMenu = useGame((s) => s.openMenu);
  const short = shortNames(state.players.map((p) => p.name));
  return (
    <div data-testid="seat-strip" className={cn("pointer-events-auto flex h-11 gap-1", className)}>
      {state.players.map((p, i) => (
        <div
          key={p.id}
          data-testid={`seat-${p.id}`}
          className={cn(SEAT_CARD, "@container h-11 min-w-0 flex-1 rounded-control", p.id === state.current && "seat-turn")}
        >
          <button
            type="button"
            data-menu-trigger={p.id}
            aria-expanded={menuFor === p.id}
            aria-controls={`player-menu-${p.id}`}
            aria-current={p.id === state.current || undefined}
            onClick={() => openMenu(menuFor === p.id ? null : p.id)}
            className={cn(SEAT_BUTTON, "gap-1.5 px-2 @max-[100px]:gap-1 @max-[100px]:px-1.5")}
          >
            <SeatLine state={state} p={p} actor={actor} away={seatAway(seats, p)} short={short[i]} />
          </button>
          <ReactionFloats by="player" id={p.id} />
        </div>
      ))}
    </div>
  );
}
