// #1449: a tap on a sheet's backdrop closes it, as Trade does. The press must start and end on the backdrop itself, so a
// drag that starts inside the sheet (selecting text in a field) and ends outside does not close it.
// One press is in flight at a time, so a module variable does the job a ref did, in fewer bytes (focus-trap size ceiling).
import type { MouseEvent, PointerEvent } from "react";

let down = false;

export function useBackdropClose(onClose: () => void) {
  return {
    onPointerDown: (e: PointerEvent) => {
      down = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent) => {
      if (down && e.target === e.currentTarget) onClose();
    },
  };
}
