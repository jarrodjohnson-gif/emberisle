import { useSyncExternalStore } from "react";

// #1595: how many goods the discard picker has picked so far, so the tray's top line (Hud, its one reader) can count down
// while the picker itself (DiscardBar) loads in its own chunk. One number; 0 when no picker is open.
let picked = 0;
let ping = () => {};

export function setDiscardPicked(n: number) {
  picked = n;
  ping();
}

export const useDiscardPicked = () => useSyncExternalStore((l) => ((ping = l), () => (ping = () => {})), () => picked);
