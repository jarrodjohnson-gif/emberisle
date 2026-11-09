// #1449: a tap on a sheet's backdrop closes it, as Trade does. The press must start and end on the backdrop itself, so a
// drag that starts inside the sheet (selecting text in a field) and ends outside does not close it.
import { useRef, type MouseEvent, type PointerEvent } from "react";

export function useBackdropClose(onClose: () => void) {
  const down = useRef(false);
  return {
    onPointerDown: (e: PointerEvent) => {
      down.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent) => {
      if (down.current && e.target === e.currentTarget) onClose();
    },
  };
}
