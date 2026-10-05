import { useEffect } from "react";
import { useGame } from "@/lib/game/store";

// A column scrolled down to a fortune brings the Place chip back into view. Stable, so it runs when the chip mounts, not on
// every render while a placement is pending (which would undo the player's own scrolling).
const intoView = (el: HTMLElement | null) => el?.scrollIntoView({ block: "nearest" });

// Coarse pointers pick a mark, then confirm here (docs/design/mobile-camera-touch.md). Enter confirms, Esc cancels.
export function PlaceChip({ column }: { column?: boolean }) {
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
  if (!pending) return null;
  return (
    <div
      ref={column ? intoView : undefined}
      className={
        column
          ? "flex shrink-0 items-center gap-3"
          : "pointer-events-none absolute inset-x-0 bottom-[max(11rem,calc(env(safe-area-inset-bottom)+10.5rem))] z-20 flex items-center justify-end gap-3 px-safe"
      }
    >
      <button type="button" className="pointer-events-auto h-11 px-2 text-sm text-fg underline" onClick={() => setPendingPlace(null)}>
        Cancel
      </button>
      <button
        type="button"
        data-testid="place-chip"
        className="pointer-events-auto h-11 min-w-[88px] rounded-[12px] bg-fg px-4 text-bg"
        onClick={confirmPlace}
      >
        Place
      </button>
    </div>
  );
}
