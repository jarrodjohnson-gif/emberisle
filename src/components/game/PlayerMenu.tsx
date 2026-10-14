// The player action menu, opened from a rail card (desktop) or a seat strip chip (phone). Design: docs/design/chat.md
// "The player action menu". Illegal rows are hidden, not greyed out. Closes on Esc, a pointerdown outside the menu and
// its trigger, or the same card again (the trigger toggles `openMenu`). Both trade rows open the trade panel (#163).
import { useEffect, useLayoutEffect, useRef } from "react";
import { MessageSquare, Landmark, AtSign, Handshake } from "lucide-react";
import { EMOTES } from "@/components/game/emotes";
import { SeatDot } from "@/components/game/SeatDot";
import type { PlayerState } from "@/lib/game/types";
import { fortuneBreakdown } from "@/lib/game/fortunes";
import { cards, hiddenCount, publicVP, publicScoreBreakdown } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import type { Seat } from "@/lib/net/table";
import { cn } from "@/lib/utils";

// The seat's socket dropped and the table is holding it (docs/design/spectator.md "away").
export function seatAway(seats: Seat[], p: PlayerState) {
  return seats.some((s) => s.away && (s.name === p.name || `${s.name} (bot)` === p.name));
}

const CHAT_INPUT = "chat-input";

function focusChat() {
  // The dock mounts the input on the next render once chatOpen flips.
  requestAnimationFrame(() => document.getElementById(CHAT_INPUT)?.focus());
}

const ROW = "flex h-11 w-full cursor-pointer items-center gap-2 rounded-[8px] px-2 text-left text-sm text-zinc-900 hover:bg-white/70";

// `heading` names the seat at the top: for the phone menus, which float away from their chip; the desktop rail's menu
// sits under its card, which already says it.
export function PlayerMenu({ player: p, className, heading }: { player: PlayerState; className?: string; heading?: boolean }) {
  const state = useGame((s) => s.state)!;
  const spectator = useGame((s) => s.spectator);
  const mode = useGame((s) => s.mode);
  const localId = useGame((s) => s.localId);
  const seats = useGame((s) => s.seats);
  const openMenu = useGame((s) => s.openMenu);
  const sendReact = useGame((s) => s.sendReact);
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
    const fit = () => {
      if (root.current) root.current.style.maxHeight = `calc(100dvh - ${root.current.getBoundingClientRect().top}px - max(12px, env(safe-area-inset-bottom)))`;
    };
    fit();
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => { window.removeEventListener("resize", fit); window.visualViewport?.removeEventListener("resize", fit); };
  }, [p.id, className]);
  // The card or chip that opened this menu; the trade rows hand it on as the panel's opener since the row itself is gone by then (#378).
  const trigger = () => document.querySelector<HTMLElement>(`[data-menu-trigger="${p.id}"]`);

  useEffect(() => {
    const trigger = document.querySelector<HTMLElement>(`[data-menu-trigger="${p.id}"]`);
    root.current?.querySelector<HTMLElement>("button")?.focus();
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
    ["Cards in hand", cards(p)],
    ["Fortunes held", p.fortunes ?? hiddenCount(p)],
    ["Points shown", publicVP(state, p.id)],
    ["Wayfarers played", p.knightsPlayed],
  ];
  if (own && hiddenCount(p) > 0) facts.push(["Your fortunes", fortuneBreakdown(p)]);
  if (seatAway(seats, p)) facts.push(["Connection", "reconnecting…"]);

  return (
    <div
      ref={root}
      id={`player-menu-${p.id}`}
      data-testid="player-menu"
      aria-label={`${p.name}'s actions`}
      className={cn("@container flex flex-col gap-1 overflow-y-auto overscroll-contain rounded-sheet border border-white/50 bg-white/60 p-2 backdrop-blur-md", className)}
    >
      {heading ? (
        <p data-testid="menu-seat" className="flex items-center gap-2 px-2 pt-1 text-sm font-medium text-zinc-900">
          <SeatDot color={p.color} className="size-3" />
          {p.name}
        </p>
      ) : null}
      {online ? (
        <div className="grid grid-cols-3 gap-1 @min-[280px]:grid-cols-6" data-testid="menu-emotes">
          {Object.entries(EMOTES).map(([id, url]) => (
            <button
              key={id}
              type="button"
              aria-label={`React ${id}`}
              onClick={() => {
                sendReact(id, own ? undefined : p.id);
                close();
              }}
              className="flex size-11 cursor-pointer items-center justify-center rounded-[8px] hover:bg-white/70"
            >
              <img src={url} alt="" className="size-8 object-contain" />
            </button>
          ))}
        </div>
      ) : null}
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
      {own && myMain ? (
        <button
          type="button"
          className={ROW}
          onClick={() => {
            setTradeOpen(true, trigger());
            close();
          }}
        >
          <Landmark className="size-4 shrink-0 text-zinc-600" /> Trade with the bank or a dock…
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
          <Handshake className="size-4 shrink-0 text-zinc-600" /> Offer a trade…
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
          <AtSign className="size-4 shrink-0 text-zinc-600" /> Mention @{p.name} in chat
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
