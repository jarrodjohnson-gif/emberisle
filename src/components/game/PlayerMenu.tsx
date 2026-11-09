// The player action menu, opened from a rail card (desktop) or a seat strip chip (phone). Design: docs/design/chat.md
// "The player action menu". Illegal rows are hidden, not greyed out. Closes on Esc, a pointerdown outside the menu and
// its trigger, the same card again (the trigger toggles `openMenu`), or the phone sheet's Close. Both trade rows open the
// trade panel (#163). On a phone it is a bottom sheet (#1420, docs/design/seat-details-1274).
import { useEffect, useLayoutEffect, useRef } from "react";
import { MessageSquare, Landmark, AtSign, Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import type { PlayerState } from "@/lib/game/types";
import { fortuneBreakdown } from "@/lib/game/fortunes";
import { cards, hiddenCount, publicVP, publicScoreBreakdown } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import type { Seat } from "@/lib/net/table";
import { cn } from "@/lib/utils";
import { chunk, LazyBoundary } from "@/lib/lazy";

const MenuNeeds = chunk(() => import("@/components/game/SeatNeeds")).pick(module => module.MenuNeeds);

// The seat's socket dropped and the table is holding it (docs/design/spectator.md "away").
export function seatAway(seats: Seat[], p: PlayerState) {
  return seats.some((s) => s.away && (s.name === p.name || `${s.name} (bot)` === p.name));
}

const CHAT_INPUT = "chat-input";

function focusChat() {
  // The dock mounts the input on the next render once chatOpen flips.
  requestAnimationFrame(() => document.getElementById(CHAT_INPUT)?.focus());
}

// shrink-0: a capped sheet scrolls, so a row never squeezes under 44 px.
const ROW = "flex h-11 w-full shrink-0 cursor-pointer items-center gap-2 rounded-[8px] px-2 text-left text-sm text-zinc-900 hover:bg-white/70";

// `sheet` is the phone's bottom sheet: it names the seat at the top, since it sits away from its chip, and has a 44 px Close
// for touch. The desktop rail's menu sits under its card, which already says it.
export function PlayerMenu({ player: p, className, sheet }: { player: PlayerState; className?: string; sheet?: boolean }) {
  const state = useGame((s) => s.state)!;
  const spectator = useGame((s) => s.spectator);
  const mode = useGame((s) => s.mode);
  const localId = useGame((s) => s.localId);
  const seats = useGame((s) => s.seats);
  const openMenu = useGame((s) => s.openMenu);
  const setChatOpen = useGame((s) => s.setChatOpen);
  const setChatDraft = useGame((s) => s.setChatDraft);
  const setTradeOpen = useGame((s) => s.setTradeOpen);
  const root = useRef<HTMLDivElement>(null);

  const actor = mode === "hotseat" ? state.current : localId;
  const own = !spectator && p.id === actor;
  const online = mode === "online" && !spectator;
  const myMain = state.phase === "main" && state.current === actor;
  const close = () => openMenu(null);
  const parts = publicScoreBreakdown(state, p.id);
  const labels = { outposts: "Outposts (1 each)", strongholds: "Strongholds (2 each)", longestPath: "Longest path", largestArmy: "Largest army" };
  const reveal = state.phase === "over";
  useLayoutEffect(() => {
    // The sheet rests on the screen's bottom edge and its own max-height caps it.
    if (sheet) return;
    const fit = () => {
      if (root.current) root.current.style.maxHeight = `calc(100dvh - ${root.current.getBoundingClientRect().top}px - max(12px, env(safe-area-inset-bottom)))`;
    };
    fit();
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => { window.removeEventListener("resize", fit); window.visualViewport?.removeEventListener("resize", fit); };
  }, [p.id, className, sheet]);
  // The card or chip that opened this menu; the trade rows hand it on as the panel's opener since the row itself is gone by then (#378).
  const trigger = () => document.querySelector<HTMLElement>(`[data-menu-trigger="${p.id}"]`);

  useEffect(() => {
    const trigger = document.querySelector<HTMLElement>(`[data-menu-trigger="${p.id}"]`);
    // The first row takes focus; a watcher's sheet has only Close.
    (root.current?.querySelector<HTMLElement>("button:not([data-menu-close])") ?? root.current?.querySelector<HTMLElement>("button"))?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (root.current?.contains(t) || trigger?.contains(t)) return;
      openMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      openMenu(null);
      trigger?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [p.id, openMenu]);

  // #443: your own fortunes by kind and a dropped seat's state are facts here, one tap from the seat line.
  const facts: [string, number | string][] = [
    ["Goods", cards(p)],
    ["Fortunes", p.fortunes ?? hiddenCount(p)],
    ["Points", publicVP(state, p.id)],
    ["Wayfarers played", p.knightsPlayed],
  ];
  if (own && hiddenCount(p) > 0) facts.push(["Your fortunes", fortuneBreakdown(p)]);
  if (seatAway(seats, p)) facts.push(["Connection", "Away"]);

  return (
    <div
      ref={root}
      id={`player-menu-${p.id}`}
      data-testid="player-menu"
      aria-label={`${p.name}'s actions`}
      className={cn("@container flex flex-col gap-1 overflow-y-auto overscroll-contain rounded-sheet border border-border bg-surface p-2", className)}
    >
      {sheet ? (
        <div className="flex shrink-0 items-center justify-between gap-2">
          <p data-testid="menu-seat" className="flex min-w-0 items-center gap-2 px-2 text-sm font-medium text-zinc-900">
            <SeatDot color={p.color} className="size-3" />
            <span className="truncate">{p.name}</span>
          </p>
          <Button
            variant="ghost"
            className="size-11 p-0"
            aria-label="Close"
            data-menu-close
            back
            onClick={() => {
              close();
              trigger()?.focus();
            }}
          >
            {/* lucide's X, drawn here: importing it would pull the lazy sheets' shared `x` chunk into index. */}
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </Button>
        </div>
      ) : null}
      <LazyBoundary failed={null}><MenuNeeds player={p.id} /></LazyBoundary>
      <dl data-testid="menu-facts" className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-2 py-1 text-xs text-zinc-600">
        {facts.map(([label, n]) => (
          <div key={label} className="contents">
            <dt className="whitespace-nowrap">{label}</dt>
            <dd className="tabular-nums text-right text-zinc-900">{n}</dd>
          </div>
        ))}
      </dl>
      <dl data-testid="score-breakdown" aria-label={`${p.name}'s public score`} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-control bg-surface px-2 py-2 text-xs text-muted">
        {Object.entries(parts).map(([kind, points]) => (
          <div key={kind} className="contents" data-component={kind} data-points={points}>
            <dt>{labels[kind as keyof typeof labels]}</dt><dd className="text-right tabular-nums text-fg">{points}</dd>
          </div>
        ))}
        {own || reveal ? <>
          <dt>{reveal ? "Point fortunes" : "Your point fortunes"}</dt><dd data-testid="private-points" className="text-right tabular-nums text-fg">{p.hidden.vp}</dd>
          <dt>{reveal ? "Final total" : "Your total"}</dt><dd data-testid="private-total" className="text-right font-medium tabular-nums text-fg">{publicVP(state, p.id) + p.hidden.vp}</dd>
        </> : null}
      </dl>
      {/* The ledger's last line, the same for every seat and viewer, so it never signals a held point card. */}
      <p data-testid="hidden-point-hint" className="-mt-1 px-2 pb-1 text-xs text-muted">Hidden fortunes may add points.</p>
      {own && myMain ? (
        <button
          type="button"
          className={ROW}
          onClick={() => {
            setTradeOpen(true, trigger());
            close();
          }}
        >
          <Landmark className="size-4 shrink-0 text-zinc-600" /> Trade…
        </button>
      ) : null}
      {!own && online && myMain ? (
        <button
          type="button"
          className={ROW}
          onClick={() => {
            setTradeOpen(true, trigger());
            close();
          }}
        >
          <Handshake className="size-4 shrink-0 text-zinc-600" /> Trade…
        </button>
      ) : null}
      {!own && online ? (
        <button
          type="button"
          className={ROW}
          onClick={() => {
            setChatDraft(`@${p.name} `);
            setChatOpen(true);
            focusChat();
            close();
          }}
        >
          <AtSign className="size-4 shrink-0 text-zinc-600" /> Mention @{p.name}
        </button>
      ) : null}
      {own && online ? (
        <button
          type="button"
          className={ROW}
          onClick={() => {
            setChatOpen(true);
            focusChat();
            close();
          }}
        >
          <MessageSquare className="size-4 shrink-0 text-zinc-600" /> Open chat
        </button>
      ) : null}
    </div>
  );
}
