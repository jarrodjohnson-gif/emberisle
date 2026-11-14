import { useEffect } from "react";
import { useGame } from "@/lib/game/store";

// #1679: between a seat press and the player menu's chunk arriving, the menu's own Escape and outside-tap listeners are not
// there yet, so these stand in for them and cancel the open. Once the menu is mounted they stand down and it handles both.
export function useMenuCancel() {
  const menuFor = useGame((s) => s.menuFor);
  const openMenu = useGame((s) => s.openMenu);
  useEffect(() => {
    if (!menuFor) return;
    const trigger = document.querySelector<HTMLElement>(`[data-menu-trigger="${menuFor}"]`);
    const waiting = () => useGame.getState().menuFor === menuFor && !document.getElementById(`player-menu-${menuFor}`);
    const onDown = (e: PointerEvent) => {
      if (!waiting() || trigger?.contains(e.target as Node | null)) return;
      openMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !waiting()) return;
      openMenu(null);
      trigger?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuFor, openMenu]);
}
