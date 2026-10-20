// Chat C (#899, docs/design/chat-c/README.md): the reactions and sounds live in the chat panel, and what a seat sends shows
// as a bubble hung off that seat's card, never on its name. Emotes, stickers and sounds are also light lines in the log.
// This is the online chunk's half: the shared state, the six emoji and mute. The Sounds & stickers tab and the bubbles are
// a chunk of their own (Reactions.tsx), fetched as soon as this one loads.
import { useEffect, useState } from "react";
import { create } from "zustand";
import { EMOTES, QUICK_REACTIONS } from "@/components/game/emotes";
import { useGame } from "@/lib/game/store";
import { chunk } from "@/lib/lazy";
import type { Reaction } from "@/lib/net/table";
import { play } from "@/lib/sound";
import { MUTE_KEY, mutedByCode, readMutedSeats } from "@/lib/muted-seats";
import { cn } from "@/lib/utils";

const reactions = chunk(() => import("@/components/game/Reactions"));
export const SoundsTab = reactions.pick((m) => m.SoundsTab);
export const SeatBubbles = reactions.pick((m) => m.SeatBubbles);
void reactions.prefetch();

const COOLDOWN = 1000;
// The host takes one soundboard tap per seat every 3 s (server/host.mjs SOUND_MS); the chips rest for the same time.
const SOUND_REST = 3000;
// How long each kind of bubble stays at the seat. A reaction's 2 s is the store's own lifetime for it.
export const LIFE = { react: 2000, sound: 3000, chat: 4000 } as const;
const MUTE_EVENT = "emberisle:chat-mutes-changed";
const TAB_KEY = "emberisle-chat-tab";
export const CONTROL =
  "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control bg-glass text-zinc-700 transition-transform duration-75 active:scale-[0.97] disabled:cursor-default disabled:opacity-50";

// Muting is a browser preference, scoped to one table code; no message reaches the host.
export function useMutedSeats(code: string) {
  const [seats, setSeats] = useState<string[]>(() => readMutedSeats(code));

  useEffect(() => {
    const syncLocal = () => setSeats(readMutedSeats(code));
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== `${MUTE_KEY}${code}`) return;
      mutedByCode.delete(code);
      setSeats(readMutedSeats(code));
    };
    window.addEventListener(MUTE_EVENT, syncLocal);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener(MUTE_EVENT, syncLocal);
      window.removeEventListener("storage", syncStorage);
    };
  }, [code]);

  useEffect(() => setSeats(readMutedSeats(code)), [code]);

  const toggle = (seat: string) => {
    if (!code || !seat) return;
    const next = new Set(readMutedSeats(code));
    if (next.has(seat)) next.delete(seat);
    else next.add(seat);
    const value = [...next];
    mutedByCode.set(code, value);
    try {
      localStorage.setItem(`${MUTE_KEY}${code}`, JSON.stringify(value));
    } catch {
      // The in-memory preference still applies and syncs to this tab's chat and reaction views.
    }
    setSeats(value);
    window.dispatchEvent(new Event(MUTE_EVENT));
  };

  return { muted: new Set(seats), toggle };
}

export type ChatTab = "chat" | "sounds";

// A reaction as the log keeps it: who sent it (name and colour as they were then) and when this browser saw it.
export interface ReactLine {
  id: number;
  seat: string;
  name: string;
  color: string;
  emote: string;
  at: number;
}

function savedTab(): ChatTab {
  try {
    return localStorage.getItem(TAB_KEY) === "sounds" ? "sounds" : "chat";
  } catch {
    return "chat";
  }
}

// This chunk's own state: the remembered tab, the reactions the log keeps after their 2 s on the seat, when each chat line
// arrived live (a rejoin's history never bubbles), and the shared send cooldowns.
interface Talk {
  tab: ChatTab;
  reactLog: ReactLine[];
  arrived: Map<number, number>;
  cooling: boolean;
  resting: boolean;
}
export const useTalk = create<Talk>(() => ({ tab: savedTab(), reactLog: [], arrived: new Map(), cooling: false, resting: false }));

export function setTab(tab: ChatTab) {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // storage can be blocked; the tab still holds for this page
  }
  useTalk.setState({ tab });
}

let reactSeq = 0;
// When this browser saw each reaction (its own `at` is the host's clock), so a seat's newest bubble is picked on one clock.
export const reactArrived = new WeakMap<Reaction, number>();
useGame.subscribe((s, p) => {
  if (s.code !== p.code) useTalk.setState({ reactLog: [], arrived: new Map() });
  // The store's chat handler appends one line to the old array; a welcome replaces the array with the history.
  const last = s.chat.at(-1);
  if (s.chat !== p.chat && last && last !== p.chat.at(-1) && s.chat.at(-2) === p.chat.at(-1)) {
    const arrived = new Map(useTalk.getState().arrived);
    arrived.set(last.id, Date.now());
    useTalk.setState({ arrived });
  }
  if (s.reactions !== p.reactions) {
    const fresh = s.reactions.filter((r) => !p.reactions.includes(r));
    if (!fresh.length) return;
    const lines = fresh.map((r) => {
      reactArrived.set(r, Date.now());
      const seat = s.seats.find((x) => x.id === r.seat);
      return { id: reactSeq++, seat: r.seat, name: seat?.name ?? "", color: seat?.color ?? "transparent", emote: r.emote, at: Date.now() };
    });
    useTalk.setState({ reactLog: [...useTalk.getState().reactLog, ...lines].slice(-50) });
  }
});

let coolTimer: ReturnType<typeof setTimeout> | undefined;
let restTimer: ReturnType<typeof setTimeout> | undefined;
export function sendReaction(emote: string) {
  const s = useGame.getState();
  if (s.spectator || useTalk.getState().cooling) return;
  useTalk.setState({ cooling: true });
  clearTimeout(coolTimer);
  coolTimer = setTimeout(() => useTalk.setState({ cooling: false }), COOLDOWN);
  s.sendReact(emote);
}
export function sendBoard(id: string) {
  if (useTalk.getState().resting) return;
  useTalk.setState({ resting: true });
  clearTimeout(restTimer);
  restTimer = setTimeout(() => useTalk.setState({ resting: false }), SOUND_REST);
  useGame.getState().sendSound(id);
}

// Tab 1's row of the six basic emoji, right above the composer: one tap sends. In the game dock, keys 1-6 send them too
// while the panel is open and the focus is not in a text field.
export function EmojiRow({ keys, dense }: { keys?: boolean; dense?: boolean }) {
  const cooling = useTalk((s) => s.cooling);
  useEffect(() => {
    if (!keys) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])")) return;
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || !/^[1-6]$/.test(event.key)) return;
      event.preventDefault();
      sendReaction(QUICK_REACTIONS[Number(event.key) - 1].emoji);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [keys]);
  return (
    <div role="group" aria-label="Send a reaction" data-testid="emoji-row" className="grid shrink-0 grid-cols-6 gap-1">
      {QUICK_REACTIONS.map(({ emoji, label }, index) => (
        <button
          key={emoji}
          type="button"
          aria-label={`React ${label}`}
          aria-keyshortcuts={keys ? String(index + 1) : undefined}
          disabled={cooling}
          className={cn(CONTROL, "w-full text-2xl", dense && "h-8 text-xl")}
          onPointerDown={() => play("ui_click")}
          onClick={() => sendReaction(emoji)}
        >
          <span aria-hidden="true">{emoji}</span>
        </button>
      ))}
    </div>
  );
}

// A reaction's face: the emoji or the sticker image, at the bubble's size.
export function Emote({ emote, className }: { emote: string; className?: string }) {
  const emoji = QUICK_REACTIONS.find((item) => item.emoji === emote);
  if (emoji)
    return (
      <span role="img" aria-label={emoji.label} className={className}>
        {emoji.emoji}
      </span>
    );
  return Object.hasOwn(EMOTES, emote) ? <img src={EMOTES[emote]} alt={emote} className={cn("object-contain", className)} /> : null;
}

