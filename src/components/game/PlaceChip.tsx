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
    const key = (e: KeyboardEvent) => {
      if (e.key === "Enter") confirmPlace();
      if (e.key === "Escape") setPendingPlace(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [pending, confirmPlace, setPendingPlace]);
  return null;
}
