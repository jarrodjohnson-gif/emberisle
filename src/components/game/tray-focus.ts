import { useLayoutEffect, useRef, type FocusEvent } from "react";

const OVERLAY = "[role='dialog'],[data-testid='chat-sheet'],[data-testid='sound-sheet'],[data-testid='player-menu']";
const ROW = ".trade-dock,.discard-pick,.take-row";

// Return focus to Trade if present, else End turn, when a tray row ends (#1592).
function returnTrayFocus() {
  let tries = 0;
  const settle = () => {
    if (tries++ > 30 || document.querySelector(OVERLAY)) return;
    const at = document.activeElement;
    if (at && at !== document.body && at !== document.documentElement && !at.closest(ROW)) return;
    const stack = document.querySelector("[data-hud-stack]");
    if (!stack) return void requestAnimationFrame(settle);
    const visible = [...stack.querySelectorAll<HTMLButtonElement>("button")].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && getComputedStyle(b).visibility !== "hidden" && !b.closest(".sr-only,[hidden]");
    });
    const target = visible.find((b) => b.textContent?.trim().includes("Trade")) ?? visible.find((b) => b.textContent?.trim() === "End turn");
    if (target) return void target.focus();
    if (tries < 15) requestAnimationFrame(settle);
  };
  requestAnimationFrame(settle);
}

// Track focus inside a tray row and restore it to the tray when the row leaves (#1592).
export function useTrayFocus() {
  const had = useRef(false);
  const restore = () => {
    if (!had.current) return;
    had.current = false;
    returnTrayFocus();
  };
  useLayoutEffect(() => restore, []);
  return {
    restore,
    props: {
      onFocusCapture: () => { had.current = true; },
      onPointerDownCapture: () => { had.current = true; },
      onBlurCapture: (e: FocusEvent) => {
        const next = e.relatedTarget as Node | null;
        if (next && !e.currentTarget.contains(next)) had.current = false;
      },
    },
  };
}
