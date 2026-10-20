// #899: the lazy half of Chat C, its own chunk so the online chunk stays in budget: the Sounds & stickers tab and the
// seat bubbles. The online chunk prefetches it as it loads (talk.tsx), so it is in memory long before a bubble is due.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { EMOTES, QUICK_REACTIONS } from "@/components/game/emotes";
import { CONTROL, Emote, LIFE, reactArrived, sendBoard, sendReaction, useMutedSeats, useTalk } from "@/components/game/talk";
import { useGame } from "@/lib/game/store";
import type { ChatLine, Reaction } from "@/lib/net/table";
import { play, SOUNDBOARD } from "@/lib/sound";
import { cn } from "@/lib/utils";

// Tab 2: all nine sound chips in a wrapping grid (14 px labels, no sideways scroll), then the stickers.
export function SoundsTab({ dense }: { dense?: boolean }) {
  const resting = useTalk((s) => s.resting);
  const cooling = useTalk((s) => s.cooling);
  const stickers = Object.entries(EMOTES);
  return (
    <div data-testid="sounds-tab" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
      <p className="flex items-baseline justify-between text-caption text-zinc-700">
        <span>Sounds · everyone hears</span>
        <span>one every 3 s</span>
      </p>
      <div role="group" aria-label="Sounds" data-testid="soundboard" className="flex flex-wrap gap-1">
        {SOUNDBOARD.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            disabled={resting}
            aria-label={`Play sound ${label}`}
            onClick={() => sendBoard(id)}
            className={cn("inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-control bg-glass px-2 text-sm text-zinc-700 hover:text-zinc-900 disabled:cursor-default disabled:opacity-50", dense ? "h-8" : "h-11")}
          >
            <Volume2 aria-hidden="true" className="size-4" />
            {label}
          </button>
        ))}
      </div>
      {stickers.length ? (
        <>
          <p className="mt-1 text-caption text-zinc-700">Stickers · silent</p>
          <div role="group" aria-label="Stickers" data-testid="stickers" className="flex flex-wrap gap-1">
            {stickers.map(([id, url]) => (
              <button
                key={id}
                type="button"
                aria-label={`React ${id}`}
                disabled={cooling}
                className={cn(CONTROL, dense && "size-8")}
                onPointerDown={() => play("ui_click")}
                onClick={() => sendReaction(id)}
              >
                <img src={url} alt="" className={cn("object-contain", dense ? "size-6" : "size-8")} />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

type Bubble =
  | { kind: "react"; key: string; at: number; reaction: Reaction; count: number; target?: string }
  | { kind: "sound" | "chat"; key: string; at: number; line: ChatLine };

// Where the bubble hangs. Rail: to the right of the desktop card, over the sea. Strip: under the phone cell, below the hidden
// points hint. Lobby: in the row, between the name and the status, so it can never sit on the name (#847).
export type BubbleAt = "rail" | "strip" | "lobby";
const PLACE: Record<BubbleAt, string> = {
  rail: "absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2",
  strip: "absolute left-1/2 top-full z-30 mt-4 -translate-x-1/2",
  lobby: "relative",
};
const TAIL: Record<BubbleAt, string> = {
  rail: "-left-1 top-1/2 -translate-y-1/2",
  strip: "-top-1 left-1/2 -translate-x-1/2",
  lobby: "hidden",
};

function SeatBubble({ bubble, at }: { bubble: Bubble; at: BubbleAt }) {
  const inner = useRef<HTMLDivElement>(null);
  const life = LIFE[bubble.kind];
  useLayoutEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;
    const animate = () => {
      animation?.cancel();
      const element = inner.current;
      if (!element) return;
      // Keep the whole bubble 8 px inside the viewport: a phone's end cell would otherwise push it off the edge.
      element.style.left = "0px";
      const box = element.getBoundingClientRect();
      element.style.left = `${Math.max(8 - box.left, Math.min(0, innerWidth - 8 - box.right))}px`;
      // Reduced motion: the bubble appears and goes with no movement and no fade.
      if (preference.matches) return;
      animation = element.animate(
        [
          { opacity: 0 },
          { opacity: 1, offset: 0.08 },
          { opacity: 1, offset: 0.8 },
          { opacity: 0 },
        ],
        { duration: life, fill: "forwards" },
      );
      // A repeat restarts the clock: the bubble lives from the newest arrival in its group.
      animation.currentTime = Math.max(0, Date.now() - bubble.at);
    };
    animate();
    preference.addEventListener("change", animate);
    window.addEventListener("resize", animate);
    return () => {
      animation?.cancel();
      preference.removeEventListener("change", animate);
      window.removeEventListener("resize", animate);
    };
  }, [bubble.key, bubble.at, at, life]);
  const testid = bubble.kind === "react" ? "reaction" : bubble.kind === "sound" ? "sound-bubble" : "chat-bubble";
  const big = at === "rail";
  return (
    <div
      data-testid={testid}
      data-seat-bubble={bubble.kind}
      data-emote={bubble.kind === "react" ? bubble.reaction.emote : undefined}
      data-sound={bubble.kind === "sound" ? bubble.line.sound : undefined}
      className={cn("seat-bubble pointer-events-none", PLACE[at])}
    >
      <div
        ref={inner}
        className="relative flex w-max max-w-48 items-center gap-1 rounded-chip bg-glass px-2 py-1 text-sm text-zinc-900 shadow-[var(--shadow-control)] backdrop-blur-md"
      >
        <span aria-hidden="true" className={cn("absolute size-2 rotate-45 bg-inherit", TAIL[at])} />
        {bubble.kind === "react" ? (
          <>
            <Emote emote={bubble.reaction.emote} className={cn("flex items-center justify-center", big ? "size-12 text-4xl" : "size-8 text-2xl")} />
            {bubble.count > 1 ? (
              <span data-testid="reaction-count" className="text-caption font-semibold tabular-nums text-zinc-700">
                ×{bubble.count}
              </span>
            ) : null}
            {bubble.target ? <span className="max-w-28 break-words text-caption font-medium text-zinc-700">→ {bubble.target}</span> : null}
          </>
        ) : bubble.kind === "sound" ? (
          <span className="flex flex-col">
            <span className="flex items-center gap-1 font-medium">
              <Volume2 aria-hidden="true" className="size-4 text-zinc-700" />
              {bubble.line.text.replace(/^🔊\s*/, "")}
            </span>
            <span className="mt-0.5 h-0.5 w-full rounded-full bg-zinc-700/30" />
          </span>
        ) : (
          <span className="line-clamp-2 break-words">{bubble.line.text}</span>
        )}
      </div>
    </div>
  );
}

// The newest live bubble for one seat: a reaction (repeats coalesce as ×n), a sound, or, while this viewer's chat panel is
// closed in a game, a chat line from another seat. A muted seat shows none.
export function SeatBubbles({ by, id, at }: { by: "player" | "seat"; id: string; at: BubbleAt }) {
  const reactions = useGame((s) => s.reactions);
  const chat = useGame((s) => s.chat);
  const seats = useGame((s) => s.seats);
  const code = useGame((s) => s.code);
  const me = useGame((s) => s.seatId);
  const chatClosed = useGame((s) => s.screen === "play" && !s.chatOpen);
  const players = useGame((s) => s.state?.players);
  const arrived = useTalk((s) => s.arrived);
  const { muted } = useMutedSeats(code);
  const [, tick] = useState(0);
  const now = Date.now();
  const mine = (x: { seat: string; player: string | null }) => (by === "player" ? x.player : x.seat) === id && !muted.has(x.seat);

  const grouped = new Map<string, { reaction: Reaction; count: number }>();
  for (const reaction of reactions) {
    if (!mine(reaction)) continue;
    if (!QUICK_REACTIONS.some((item) => item.emoji === reaction.emote) && !Object.hasOwn(EMOTES, reaction.emote)) continue;
    const key = JSON.stringify([reaction.emote, reaction.to]);
    const previous = grouped.get(key);
    grouped.delete(key);
    grouped.set(key, { reaction, count: (previous?.count ?? 0) + 1 });
  }
  const bubbles: Bubble[] = [...grouped].map(([key, { reaction, count }]) => {
    const to = reaction.to ? (seats.find((seat) => seat.id === reaction.to) ?? players?.find((player) => player.id === reaction.to))?.name : undefined;
    return { kind: "react", key: `r${key}`, at: reactArrived.get(reaction) ?? 0, reaction, count, target: to };
  });
  const live: Bubble[] = [];
  for (const line of chat) {
    const t = arrived.get(line.id);
    if (t === undefined || !mine(line)) continue;
    const kind = line.sound ? "sound" : "chat";
    if (kind === "chat" && (!chatClosed || line.seat === me)) continue;
    if (now - t < LIFE[kind]) live.push({ kind, key: `l${line.id}`, at: t, line });
  }
  const newest = [...bubbles, ...live].reduce<Bubble | undefined>((best, b) => (!best || b.at >= best.at ? b : best), undefined);

  // Re-render when the newest line bubble runs out (reactions leave the store on their own).
  useEffect(() => {
    if (!live.length) return;
    const left = Math.max(...live.map((b) => LIFE[b.kind] - (Date.now() - b.at)));
    const timer = setTimeout(() => tick((n) => n + 1), Math.max(16, left + 16));
    return () => clearTimeout(timer);
  });

  return newest ? <SeatBubble key={newest.key} bubble={newest} at={at} /> : null;
}
