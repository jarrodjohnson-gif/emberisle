import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";
import { SeatDot } from "@/components/game/SeatDot";
import { useViewport } from "@/lib/viewport";

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
  const above = phone && aboveChat;
  const prompt = (
    // #557: the phone's chat sheet (z-30, min(48vh, 320px) tall) would hide this choice, so while it is open the bar rides just above it.
    // #1546: otherwise it takes over the tray: the question is the top line, one button per seat is the action row (styles.css).
    <div
      ref={bar}
      role="group"
      aria-label="The wayfarer takes a card"
      className={above ? "take-from-above" : "tray-takeover"}
    >
      <span className="tray-line">Take from whom?</span>
      <div className="tray-row take-row">
        {pendingSteal.targets.map((id) => {
          const p = state.players.find((x) => x.id === id);
          if (!p) return null;
          // #1546: the seat as its chip names it (no "(bot)"), and its card count in quiet text: "Tide 2".
          const name = p.name.replace(/ \(bot\)$/, "");
          const n = p.goods ?? Object.values(p.resources).reduce((a, b) => a + b, 0);
          return (
            <Button key={id} variant="secondary" aria-label={`${name}, ${n} cards`} onClick={() => chooseSteal(id)}>
              <SeatDot color={p.color} className="size-2" />
              <span className="truncate">{name}</span>
              <span className="tray-quiet">{n}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
  const shell = document.querySelector("[data-game-shell]");
  return above && shell ? createPortal(prompt, shell) : prompt;
}
