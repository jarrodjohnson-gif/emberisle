// #443, #1544 (docs/design/one-tray, "Seats"): the desktop rail (an accordion: the player menu opens under its card,
// docs/design/chat.md) and the phone strip (docs/design/mobile-hud.md) share SeatLine and SeatCard. No seat has a box: each
// sits on the sea, and only the seat on turn carries `seat-turn`, a white pill, with aria-current so the turn never rests on
// colour alone (#312). The roll-off die shows only while the roll-off is live; the dot is a SeatDot.
// #645: the rail's quiet line carries two public tallies (longest continuous path, wayfarers played); the Longest Path /
// Largest Army holder wears a gold badge on its tally (see Tally). The strip leaves them to the seat sheet (#1509).
// Your fortunes by kind, a dropped seat's state and "Hidden fortunes may add points." are in the player menu, one tap away.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { type LucideIcon, Route, Swords } from "lucide-react";
import { SeatBubbles } from "@/components/game/chunks";
import { chunk, LazyBoundary } from "@/lib/lazy";
import { PlayerMenu, seatAway } from "@/components/game/PlayerMenu";
import { SeatDot } from "@/components/game/SeatDot";
import type { GameState, PlayerState } from "@/lib/game/types";
import { cards, hiddenCount, publicVP, roadLength } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { cn } from "@/lib/utils";

const publicGains = chunk(() => import("@/components/game/SeatPublicGains"));
const SeatPublicGains = publicGains.pick(module => module.SeatPublicGains);
const needs = chunk(() => import("@/components/game/SeatNeeds"));
const SeatNeeds = needs.pick(module => module.SeatNeeds);

// The seat's roll-off die, "–" until it rolls this round; gone once the roll-off is settled (docs/design/first-player.md).
function RollOffDie({ state, id, className }: { state: GameState; id: string; className: string }) {
  if (!state.rollOff || state.phase !== "rollOff") return null;
  return (
    <span data-testid="rolloff-die" className={cn("grid shrink-0 place-items-center rounded-[8px] bg-fg font-medium text-bg tabular-nums", className)}>
      {state.rollOff.rolls[id] ?? "–"}
    </span>
  );
}

// #1544: the rail's quiet line names the hand in words, "7 cards · 1 fortune"; the fortune part goes at zero.
const words = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

// #645: a public tally, a Route icon and n (longest continuous path) or a Swords icon and n (wayfarers played), always drawn, at every width. The
// holder of the award (state.longestRoad / state.largestArmy, which already carry the 5 and 3 minimums and the tie rule)
// wears a gold badge: its accessible name is the award, e.g. "Longest path, 7". The badge pulses once when it lands on a
// seat (the existing `build-ready` keyframes; none under reduced motion); the log line is rules.ts's own.
function Tally({ testid, Icon, n, name, held }: { testid: string; Icon: LucideIcon; n: number; name: [string, string]; held: boolean }) {
  return (
    <span
      data-testid={testid}
      role="img"
      aria-label={`${name[+held]}, ${n}`}
      className={cn("flex shrink-0 items-center gap-0.5 rounded-full px-0.5", held ? "bg-amber-300 font-semibold text-zinc-900 ring-1 ring-amber-600 build-ready" : "text-zinc-700")}
    >
      <Icon aria-hidden="true" className="size-3" />
      {n}
    </span>
  );
}

// `short` is the strip's narrow form (#420); its presence makes this a strip line. A dropped seat's marker shows at every width.
// #1544 (docs/design/one-tray, "Seats"): no boxes. The strip is two centred lines, the dot and the name (without "(bot)": the
// player menu says it), then "N pts" in quiet ink; the short form is left for a name too long for its line (#1509). The rail
// is a row: the dot, the name ("Name · you" on your own seat) and the points at the right, then one quiet line of the hand in
// words and the two public tallies (#645).
function SeatLine({ p, actor, short }: { p: PlayerState; actor: string; short?: string }) {
  const state = useGame((s) => s.state)!;
  const away = seatAway(useGame((s) => s.seats), p);
  const strip = short !== undefined;
  const hidden = p.id === actor && p.hidden.vp > 0 ? p.hidden.vp : 0;
  const goods = cards(p);
  const fortunes = p.fortunes ?? hiddenCount(p);
  const path = useMemo(() => roadLength(state, p.id), [state, p.id]);
  // #1509: the strip draws the whole name when it fits its line, and the short form when it would be cut, measured, not
  // guessed: a name never shows an ellipsis. The full name stays for screen readers. 18 px is the dot and its gap.
  const line = useRef<HTMLSpanElement>(null);
  const full = useRef<HTMLSpanElement>(null);
  const [fits, setFits] = useState(true);
  const label = strip ? p.name.replace(/ \(bot\)$/, "") : p.name;
  useLayoutEffect(() => {
    if (!strip || !line.current || !full.current) return;
    const measure = () => setFits(full.current!.scrollWidth <= line.current!.clientWidth - 18);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(line.current);
    return () => watch.disconnect();
  }, [strip, label]);
  // #420: a strip cell under 100 px shows the die without the points during the roll-off.
  const awayMark = away ? (
    <span data-testid="seat-away" className="seat-away flex min-w-3 shrink-[9] items-center gap-0.5 text-zinc-700">
      {/* A struck ring: the seat's circle with a line through it, in CSS so it costs no icon. */}
      <span className="relative size-2.5 shrink-0 rounded-full border-[1.5px] border-current after:absolute after:-inset-x-0.5 after:top-1/2 after:h-[1.5px] after:-rotate-45 after:bg-current" />
      <span aria-hidden="true" className={cn("truncate", strip && "@max-[200px]:hidden")}>
        Away
      </span>
      <span className="sr-only">reconnecting</span>
    </span>
  ) : null;
  const points = (
    <span data-testid="seat-vp" className={cn("shrink-0 tabular-nums", strip ? cn("text-xs text-zinc-700", state.phase === "rollOff" && "@max-[100px]:hidden") : "ml-auto text-[15px] font-bold leading-5")}>
      {publicVP(state, p.id)}
      {strip ? <span aria-hidden="true"> pts</span> : null}
      <span className="sr-only"> points{hidden ? `, plus ${hidden} hidden` : ""}</span>
      {hidden && !strip ? (
        <span aria-hidden="true" className="text-[13px] font-medium text-zinc-700">
          +{hidden}
        </span>
      ) : null}
    </span>
  );
  if (strip)
    return (
      <>
        <span ref={line} className="flex w-full items-center justify-center gap-1.5">
          <SeatDot color={p.color} className="seat-dot size-3" />
          <span ref={full} data-testid="seat-name" className={cn("min-w-0 truncate text-[13px] font-semibold leading-4", !fits && "sr-only")}>
            {label}
          </span>
          <span data-testid="seat-name" aria-hidden="true" className={cn("min-w-0 truncate text-[13px] font-semibold leading-4", fits && "hidden")}>
            {short}
          </span>
        </span>
        <span className="flex w-full items-center justify-center gap-1.5 leading-4">
          {points}
          <RollOffDie state={state} id={p.id} className="size-4 rounded-[4px] text-xs" />
          {awayMark}
        </span>
      </>
    );
  return (
    <>
      <span className="flex w-full items-center gap-2">
        <SeatDot color={p.color} className="seat-dot size-3" />
        <span data-testid="seat-name" className="min-w-0 truncate text-[15px] font-semibold leading-5">
          {p.name}
          {p.id === actor ? <span className="font-medium"> · you</span> : null}
        </span>
        <RollOffDie state={state} id={p.id} className="size-5 text-xs" />
        {points}
      </span>
      <span className="flex w-full items-center gap-2 text-[13px] leading-[18px] text-zinc-700">
        {awayMark ?? (
          <span className="flex shrink-0 gap-1">
            <span data-testid="seat-goods">{words(goods, "card")}</span>
            {fortunes > 0 ? <><span aria-hidden="true">·</span><span data-testid="seat-fortunes">{words(fortunes, "fortune")}</span></> : null}
          </span>
        )}
        <Tally testid="tally-path" Icon={Route} n={path} name={["Path length", "Longest path"]} held={state.longestRoad === p.id} />
        <Tally testid="tally-army" Icon={Swords} n={p.knightsPlayed} name={["Wayfarers played", "Largest army"]} held={state.largestArmy === p.id} />
      </span>
    </>
  );
}

// One seat's card: the menu's trigger (docs/design/chat.md "The player action menu") with its seat bubble beside it (#899). The rail
// gives it `rail-<id>`, the strip `seat-<id>` and a short name. Each is one button, at least 44 px each way.
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
      className={cn("seat-card relative transition-colors duration-200", className, p.id === current && "seat-turn")}
    >
      <button
        type="button"
        data-menu-trigger={p.id}
        aria-expanded={menuFor === p.id}
        aria-controls={`player-menu-${p.id}`}
        aria-current={p.id === current || undefined}
        onClick={() => openMenu(menuFor === p.id ? null : p.id)}
        className={cn(
          "flex w-full cursor-pointer flex-col justify-center rounded-[inherit]",
          strip ? "h-11 min-w-11 items-center px-2 @max-[100px]:px-1.5 @max-[72px]:px-1" : "min-h-11 px-3 py-1.5 text-left",
        )}
      >
        <SeatLine p={p} actor={actor} short={short} />
      </button>
      {online ? (
        <LazyBoundary failed={null}>
          <SeatBubbles by="player" id={p.id} at={strip ? "strip" : "rail"} />
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
    <aside className={cn("pointer-events-none absolute left-3 top-20 hidden w-56 flex-col gap-1 md:flex", menuFor ? "z-20" : "z-10")}>
      {players.map((p) => (
        <div key={p.id} className="pointer-events-auto flex flex-col gap-1">
          <SeatCard p={p} actor={actor} className="rounded-[14px]" />
          {menuFor === p.id ? <PlayerMenu player={p} /> : null}
        </div>
      ))}
      <LazyBoundary failed={null}><SeatPublicGains scope="rail" /></LazyBoundary>
      <LazyBoundary failed={null}><SeatNeeds scope="rail" /></LazyBoundary>
    </aside>
  );
}

// Hotseat's "Seat 2" .. "Seat 4" would all read "Sea", so a trailing number keeps the initial and the number ("S2").
function shortName(name: string) {
  const n = /\d+$/.exec(name)?.[0];
  return n ? `${name[0]}${n}` : name.slice(0, 3);
}

// Three letters is what a narrow cell holds, so seats that still share a short form ("Ember", "Emberly") fall back to
// the initial and the seat number ("E1", "E2").
function shortNames(names: string[]) {
  const short = names.map(shortName);
  return short.map((s, i) => (short.some((o, j) => j !== i && o === s) ? `${names[i]![0]}${i + 1}` : s));
}

// Phone seat strip (docs/design/mobile-hud.md): 44 px, one cell per seat.
export function SeatStrip({ actor, className }: { actor: string; className: string }) {
  const players = useGame((s) => s.state!.players);
  const short = shortNames(players.map((p) => p.name.replace(/ \(bot\)$/, "")));
  return (
    <div data-testid="seat-strip" className={cn("pointer-events-auto flex h-11 gap-1", className)}>
      {players.map((p, i) => (
        <SeatCard key={p.id} p={p} actor={actor} short={short[i]} className="@container h-11 min-w-11 flex-1 rounded-[14px]" />
      ))}
      <LazyBoundary failed={null}><SeatPublicGains scope="seat" /></LazyBoundary>
      <LazyBoundary failed={null}><SeatNeeds scope="seat" /></LazyBoundary>
    </div>
  );
}
