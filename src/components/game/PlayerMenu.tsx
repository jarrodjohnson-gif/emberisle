// The player action menu, opened from a rail card (desktop) or a seat strip chip (phone). Design: docs/design/chat.md
// "The player action menu". Illegal rows are hidden, not greyed out. Closes on Esc, a pointerdown outside the menu and
// its trigger, or the same card again (the trigger toggles `openMenu`). Both trade rows open the trade panel (#163).
import { useEffect, useRef } from "react";
import { MessageSquare, Landmark, AtSign, Handshake } from "lucide-react";
import { EMOTES } from "@/components/game/emotes";
import type { DevKind, PlayerState } from "@/lib/game/types";
import { cards, hiddenCount, publicVP } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import type { Seat } from "@/lib/net/table";
import { cn } from "@/lib/utils";

export const FORTUNE_NAMES: [DevKind, string][] = [
  ["knight", "knight"],
  ["road", "path"],
  ["plenty", "plenty"],
  ["monopoly", "monopoly"],
  ["vp", "points"],
];

// Your own fortunes by kind, "knight ×1 · points ×2 (1 new)"; "" while you hold none.
export function fortuneBreakdown(p: PlayerState) {
  return FORTUNE_NAMES.filter(([k]) => p.hidden[k] > 0)
    .map(([k, label]) => `${label} ×${p.hidden[k]}${p.boughtThisTurn[k] > 0 ? ` (${p.boughtThisTurn[k]} new)` : ""}`)
    .join(" · ");
}

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

export function PlayerMenu({ player: p, className }: { player: PlayerState; className?: string }) {
  const state = useGame((s) => s.state)!;
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
  const own = p.id === actor;
  const online = mode === "online";
  const myMain = state.phase === "main" && state.current === actor;
  const close = () => openMenu(null);
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
      className={cn("flex flex-col gap-1 rounded-[16px] border border-white/50 bg-white/60 p-2 backdrop-blur-md", className)}
    >
      {online ? (
        <div className="grid grid-cols-6 gap-1" data-testid="menu-emotes">
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
      <dl data-testid="menu-facts" className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-2 py-1 text-xs text-zinc-600">
        {facts.map(([label, n]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd className="tabular-nums text-right text-zinc-900">{n}</dd>
          </div>
        ))}
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
