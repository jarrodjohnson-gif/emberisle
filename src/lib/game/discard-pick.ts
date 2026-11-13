import { useSyncExternalStore } from "react";

// #1595: how many goods the discard picker has picked so far, so the tray's top line (Hud) can count down while the picker
// itself (DiscardBar) loads in its own chunk. One number; 0 when no picker is open.
let picked = 0;
const listeners = new Set<() => void>();

export function setDiscardPicked(n: number) {
  if (n === picked) return;
  picked = n;
  for (const l of listeners) l();
}

export function useDiscardPicked() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => picked,
    () => 0,
  );
}
