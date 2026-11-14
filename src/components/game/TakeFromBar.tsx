import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";
import { SeatDot } from "@/components/game/SeatDot";
import { useViewport } from "@/lib/viewport";
import { returnTrayFocus } from "@/components/game/DiscardBar";
import { cn } from "@/lib/utils";

export function TakeFromBar() {
  const state = useGame((s) => s.state);
  const pendingSteal = useGame((s) => s.pendingSteal);
  const chooseSteal = useGame((s) => s.chooseSteal);
  const aboveChat = useGame((s) => s.mode === "online" && s.chatOpen);
  const { phone } = useViewport();
  const bar = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);

  useLayoutEffect(() => {
    return () => {
      if (hadFocus.current) {
        hadFocus.current = false;
        returnTrayFocus();
      }
    };
  }, []);
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
  const over = phone && aboveChat;
  const prompt = (
    // One button per seat, in the tray's action row (docs/design/one-tray, slice C); the tray's top line asks "Take from whom?".
    // #557: the phone's chat sheet (z-30, min(48vh, 320px) tall) would hide the tray, so while it is open the choice rides
    // just above the sheet and asks for itself.
    <div
      ref={bar}
      role="group"
      aria-label="The wayfarer takes a card"
      className={cn("take-row", over && "take-over")}
      onFocusCapture={() => { hadFocus.current = true; }}
      onPointerDownCapture={() => { hadFocus.current = true; }}
      onBlurCapture={(e) => {
        const next = e.relatedTarget as Element | null;
        if (next?.closest?.("input, textarea, select, [role='dialog'], [data-testid='chat-dock'], [data-testid='chat-input']")) {
          hadFocus.current = false;
        }
      }}
    >
      {over ? <span>Take from whom?</span> : null}
      {pendingSteal.targets.map((id) => {
        const p = state.players.find((x) => x.id === id);
        if (!p) return null;
        return (
          <Button key={id} variant="secondary" onClick={() => chooseSteal(id)}>
            <SeatDot color={p.color} className="size-3" />
            {p.name}
          </Button>
        );
      })}
    </div>
  );
  const shell = document.querySelector("[data-game-shell]");
  return over && shell ? createPortal(prompt, shell) : prompt;
}
