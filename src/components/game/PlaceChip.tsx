import { useEffect } from "react";
import { useGame } from "@/lib/game/store";

// Coarse pointers pick a mark, then confirm it (docs/design/mobile-camera-touch.md). #1539: the Cancel and Place buttons are
// the tray's action row (Hud.tsx); this keeps the keys: Enter confirms, Esc cancels.
export function PlaceChip() {
  const pending = useGame((s) => s.pendingPlace);
  const confirmPlace = useGame((s) => s.confirmPlace);
  const setPendingPlace = useGame((s) => s.setPendingPlace);
  useEffect(() => {
    if (!pending) return;
    const cancel = () => {
      setPendingPlace(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      const s = useGame.getState();
      if (s.howTo || s.costs || s.tradeOpen || s.menuFor || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (e.key === "Enter") {
        if (t?.closest("button, a, summary, [role=button], [role=radio], [role=tab], [role=menuitem], input, select, textarea, [contenteditable]")) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        confirmPlace();
      } else {
        if (t?.closest("input, select, textarea, [contenteditable]")) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        cancel();
      }
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
    };
  }, [pending, confirmPlace, setPendingPlace]);
  return null;
}
