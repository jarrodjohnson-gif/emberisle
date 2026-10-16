import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";
import { SeatDot } from "@/components/game/SeatDot";
import { useViewport } from "@/lib/viewport";
import { cn } from "@/lib/utils";

export function TakeFromBar() {
  const state = useGame((s) => s.state);
  const pendingSteal = useGame((s) => s.pendingSteal);
  const chooseSteal = useGame((s) => s.chooseSteal);
  const aboveChat = useGame((s) => s.mode === "online" && s.chatOpen);
  const { phone } = useViewport();
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el || !phone || !aboveChat) return;
    const root = document.documentElement;
    let last = -1;
    const measure = () => {
      const height = el.getBoundingClientRect().height;
      if (height === last) return;
      last = height;
      root.style.setProperty("--active-prompt-height", `${height + 8}px`);
      useGame.getState().chromeLanded();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => { observer.disconnect(); root.style.removeProperty("--active-prompt-height"); };
  }, [pendingSteal, phone, aboveChat]);
  if (!state || !pendingSteal) return null;
  const prompt = (
    // #557: the phone's chat sheet (z-30, min(48vh, 320px) tall) would hide this choice, so while it is open the bar rides just above it.
    <div
      ref={bar}
      role="group"
      aria-label="The wayfarer takes a card"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-[16px] border border-accent/40 bg-surface p-2",
        phone && aboveChat && "pointer-events-auto fixed left-safe right-safe bottom-[calc(var(--chat-sheet-height)+var(--keyboard-inset,0px)+var(--active-offer-height,0px)+0.5rem)] z-40",
      )}
    >
      <span className="text-sm">Take from whom?</span>
      {pendingSteal.targets.map((id) => {
        const p = state.players.find((x) => x.id === id);
        if (!p) return null;
        return (
          <Button key={id} size="sm" variant="secondary" className={phone ? "h-11" : undefined} onClick={() => chooseSteal(id)}>
            <SeatDot color={p.color} className="mr-1 size-3" />
            {p.name}
          </Button>
        );
      })}
    </div>
  );
  const shell = document.querySelector("[data-game-shell]");
  return phone && aboveChat && shell ? createPortal(prompt, shell) : prompt;
}
