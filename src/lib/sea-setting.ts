// #1163: the Sea sounds switch under Music and ambience. On unless saved as "0". Playback is #662's (ambience.ts); this is only the saved choice.
import { useSyncExternalStore } from "react";

const KEY = "emberisle-sea-sounds";
const listeners = new Set<() => void>();
let sea = (() => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } })();
export const getSeaSounds = () => sea;
export function setSeaSounds(on: boolean) {
  sea = on;
  try { if (on) localStorage.removeItem(KEY); else localStorage.setItem(KEY, "0"); } catch { /* the in-memory choice still works */ }
  for (const listener of listeners) listener();
}
export function subscribeSeaSounds(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useSeaSounds() {
  return useSyncExternalStore(subscribeSeaSounds, getSeaSounds, () => true);
}
