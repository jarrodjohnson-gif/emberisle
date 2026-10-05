// Board reactions share the chat transport and the sender's existing seat anchors.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { EMOTES, QUICK_REACTIONS } from "@/components/game/emotes";
import { useGame } from "@/lib/game/store";
import type { Reaction } from "@/lib/net/table";
import { play } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { useViewport } from "@/lib/viewport";

const COOLDOWN = 1000;
const CONTROL =
  "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control bg-glass text-zinc-700 transition-transform duration-75 active:scale-[0.97] disabled:cursor-default disabled:opacity-50";

export function QuickReactions({ stackTop }: { stackTop?: number | null } = {}) {
  const mode = useGame((s) => s.mode);
  const screen = useGame((s) => s.screen);
  const spectator = useGame((s) => s.spectator);
  const chatOpen = useGame((s) => s.chatOpen);
  const sendReact = useGame((s) => s.sendReact);
  const { phone, portrait } = useViewport();
  const [open, setOpen] = useState(false);
  const [cooling, setCooling] = useState(false);
  const nextSend = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const available = mode === "online" && screen === "play" && !spectator;
  const portraitClosed = phone && portrait && !chatOpen;

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!available) setOpen(false);
  }, [available]);
  useEffect(() => {
    setOpen(false);
  }, [chatOpen]);

  const send = (emote: string) => {
    if (!available || Date.now() < nextSend.current) return;
    nextSend.current = Date.now() + COOLDOWN;
    setCooling(true);
    timer.current = setTimeout(() => setCooling(false), COOLDOWN);
    sendReact(emote);
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open || !available) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable=false])",
        )
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      } else if (
        !event.repeat &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        /^[1-6]$/.test(event.key)
      ) {
        event.preventDefault();
        send(QUICK_REACTIONS[Number(event.key) - 1].emoji);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, available, sendReact]);

  if (!available) return null;
  return (
    <div
      ref={root}
      data-testid="quick-reactions"
      className={cn(
        "absolute z-[25]",
        portraitClosed
          ? "right-safe"
          : !phone && chatOpen
            ? "right-safe mr-[300px]"
            : "right-safe mr-14",
        phone
          ? !chatOpen && !portrait && "bottom-[184px]"
          : "top-16",
      )}
      style={
        phone && chatOpen
          ? { bottom: "calc(min(48vh, 320px) + 12px)" }
          : phone && portraitClosed
            ? { bottom: stackTop === null || stackTop === undefined ? "calc(100dvh - 16rem + 140px)" : `calc(100dvh - ${stackTop}px + 68px)` }
          : undefined
      }
    >
      <button
        ref={trigger}
        type="button"
        aria-label="Quick reactions"
        aria-expanded={open}
        aria-controls="quick-reaction-picker"
        className={cn(CONTROL, "backdrop-blur-md", cooling && "opacity-50")}
        onPointerDown={() => play("ui_click")}
        onClick={() => setOpen(!open)}
      >
        <Smile className="size-5" />
      </button>
      {open ? (
        <div
          id="quick-reaction-picker"
          role="group"
          aria-label="Choose a reaction"
          className={cn(
            "absolute flex w-max max-w-[calc(100vw-24px)] flex-col gap-2 rounded-chip bg-glass p-2 backdrop-blur-md",
            portraitClosed || (!phone && chatOpen) ? "right-0" : "-right-14",
            phone ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          <div className="grid grid-cols-6 gap-1">
            {QUICK_REACTIONS.map(({ emoji, label }, index) => (
              <button
                key={emoji}
                type="button"
                aria-label={`React ${label}`}
                aria-keyshortcuts={String(index + 1)}
                disabled={cooling}
                className={cn(CONTROL, "text-2xl")}
                onPointerDown={() => play("ui_click")}
                onClick={() => send(emoji)}
              >
                <span aria-hidden="true">{emoji}</span>
              </button>
            ))}
          </div>
          {Object.keys(EMOTES).length ? (
            <div
              role="group"
              className="grid max-h-32 grid-cols-6 gap-1 overflow-y-auto"
              aria-label="Image reactions"
            >
              {Object.entries(EMOTES).map(([id, url]) => (
                <button
                  key={id}
                  type="button"
                  aria-label={`React ${id}`}
                  disabled={cooling}
                  className={CONTROL}
                  onPointerDown={() => play("ui_click")}
                  onClick={() => send(id)}
                >
                  <img src={url} alt="" className="size-8 object-contain" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ReactionFloat({
  reaction,
  count,
  target,
}: {
  reaction: Reaction;
  count: number;
  target?: string;
}) {
  const float = useRef<HTMLDivElement>(null);
  const timing = useRef<{ reaction: Reaction; started: number } | null>(null);
  const emoji = QUICK_REACTIONS.find((item) => item.emoji === reaction.emote);
  const image = Object.hasOwn(EMOTES, reaction.emote)
    ? EMOTES[reaction.emote]
    : undefined;
  useLayoutEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;
    const animate = () => {
      animation?.cancel();
      if (timing.current?.reaction !== reaction)
        timing.current = { reaction, started: performance.now() };
      const element = float.current;
      if (!element) return;
      element.style.left = "0px";
      element.style.top = "0px";
      // Include the count badge and target label, which can extend outside the image's box.
      const boxes = [element, ...element.querySelectorAll("img, span")].map(
        (node) => node.getBoundingClientRect(),
      );
      const left = Math.min(...boxes.map((box) => box.left));
      const right = Math.max(...boxes.map((box) => box.right));
      const top = Math.min(...boxes.map((box) => box.top));
      const bottom = Math.max(...boxes.map((box) => box.bottom));
      const dx = Math.max(8 - left, Math.min(0, innerWidth - 8 - right));
      const dy = Math.max(8 - top, Math.min(0, innerHeight - 8 - bottom));
      element.style.left = `${dx}px`;
      element.style.top = `${dy}px`;
      const rise = Math.min(12, Math.max(0, top + dy - 8));
      const start = preference.matches ? {} : { transform: "translateY(0)" };
      const middle = preference.matches
        ? {}
        : { transform: `translateY(${-rise * 0.75}px)` };
      const end = preference.matches
        ? {}
        : { transform: `translateY(${-rise}px)` };
      animation = float.current?.animate(
        [
          { opacity: 1, ...start },
          { opacity: 1, offset: 0.75, ...middle },
          { opacity: 0, ...end },
        ],
        { duration: 2000, fill: "forwards" },
      );
      if (animation)
        animation.currentTime = performance.now() - timing.current.started;
    };
    animate();
    preference.addEventListener("change", animate);
    window.addEventListener("resize", animate);
    return () => {
      animation?.cancel();
      preference.removeEventListener("change", animate);
      window.removeEventListener("resize", animate);
    };
  }, [reaction, count, target]);
  if (!emoji && !image) return null;
  return (
    <div
      data-testid="reaction"
      data-emote={reaction.emote}
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center"
    >
      <div ref={float} className="relative flex flex-col items-center">
        {emoji ? (
          <span
            role="img"
            aria-label={emoji.label}
            className="flex size-12 items-center justify-center rounded-chip bg-glass text-4xl backdrop-blur-md"
          >
            {emoji.emoji}
          </span>
        ) : (
          <img src={image} alt="" className="size-12 object-contain" />
        )}
        {count > 1 ? (
          <span
            data-testid="reaction-count"
            className="absolute -right-3 -top-1 rounded-full bg-glass px-1 text-caption font-semibold tabular-nums text-zinc-700"
          >
            ×{count}
          </span>
        ) : null}
        {target ? (
          <span className="max-w-28 break-words rounded-chip bg-glass px-1 text-center text-caption font-medium text-zinc-700 backdrop-blur-md">
            → {target}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ReactionFloats({
  by,
  id,
}: {
  by: "player" | "seat";
  id: string;
}) {
  const reactions = useGame((s) => s.reactions);
  const seats = useGame((s) => s.seats);
  const players = useGame((s) => s.state?.players);
  const grouped = new Map<string, { reaction: Reaction; count: number }>();
  for (const reaction of reactions) {
    if ((by === "player" ? reaction.player : reaction.seat) !== id) continue;
    if (
      !QUICK_REACTIONS.some((item) => item.emoji === reaction.emote) &&
      !Object.hasOwn(EMOTES, reaction.emote)
    )
      continue;
    const key = JSON.stringify([reaction.emote, reaction.to]);
    const previous = grouped.get(key);
    grouped.delete(key);
    grouped.set(key, { reaction, count: (previous?.count ?? 0) + 1 });
  }
  return (
    <>
      {[...grouped.entries()].slice(-1).map(([key, { reaction, count }]) => {
        const target = reaction.to
          ? (
              seats.find((seat) => seat.id === reaction.to) ??
              players?.find((player) => player.id === reaction.to)
            )?.name
          : undefined;
        return (
          <ReactionFloat
            key={key}
            reaction={reaction}
            count={count}
            target={target}
          />
        );
      })}
    </>
  );
}
