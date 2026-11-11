// #1163: Sea sounds under Music and ambience. On unless saved as "0". Volume is 100% unless a tenth 0–9 is saved.
// Playback is #662's (ambience.ts). Both choices are this device's only.
import { useSyncExternalStore } from "react";

const KEY = "emberisle-sea-sounds";
const VOL_KEY = "emberisle-sea-volume";
const listeners = new Set<() => void>();
const readOn = () => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } };
const readVolume = () => {
  try {
    const raw = localStorage.getItem(VOL_KEY);
    if (raw == null) return 1;
    const step = Number(raw);
    if (!Number.isInteger(step) || step < 0 || step > 9) return 1;
    return step / 10;
  } catch { return 1; }
};
let sea = readOn();
let volume = readVolume();
const tell = () => { for (const listener of listeners) listener(); };
export const getSeaSounds = () => sea;
export const getSeaVolume = () => volume;
export function setSeaSounds(on: boolean) {
  sea = on;
  try { if (on) localStorage.removeItem(KEY); else localStorage.setItem(KEY, "0"); } catch { /* the in-memory choice still works */ }
  tell();
}
export function setSeaVolume(level: number) {
  const step = Math.max(0, Math.min(10, Math.round(level * 10)));
  volume = step / 10;
  try { if (step === 10) localStorage.removeItem(VOL_KEY); else localStorage.setItem(VOL_KEY, String(step)); } catch { /* the in-memory level still works */ }
  tell();
}
export function subscribeSeaSounds(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useSeaSounds() {
  return useSyncExternalStore(subscribeSeaSounds, getSeaSounds, () => true);
}
export function useSeaVolume() {
  return useSyncExternalStore(subscribeSeaSounds, getSeaVolume, () => 1);
}
