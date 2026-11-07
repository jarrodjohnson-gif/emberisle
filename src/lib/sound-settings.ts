// Per-device mixer contract for #669. Gains are 0..1 in 10% steps; clip gains remain in sound.ts's callers.
import { useSyncExternalStore } from "react";

export const SOUND_CATEGORIES = ["game", "touch", "memes", "music"] as const;
export type SoundCategory = (typeof SOUND_CATEGORIES)[number];
export type SoundMix = Readonly<{ master: number } & Record<SoundCategory, Readonly<{ volume: number; muted: boolean }>>>;
// The chat's Mute players list asks the Table menu to open the Sound panel (#669).
export const OPEN_SOUND_EVENT = "emberisle:open-sound";
const KEY = "emberisle-sound-mix";
const listeners = new Set<() => void>();
const level = (value: unknown, fallback: number): number => typeof value === "number" && Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 10) / 10 : fallback;
const defaults = (): SoundMix => Object.freeze({ master: 1, ...Object.fromEntries(SOUND_CATEGORIES.map((c) => [c, Object.freeze({ volume: 1, muted: false })])) }) as SoundMix;
let mix = defaults();
try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
  if (saved && typeof saved === "object") mix = Object.freeze({
    master: level(saved.master, 1),
    ...Object.fromEntries(SOUND_CATEGORIES.map((c) => [c, Object.freeze({ volume: level(saved[c]?.volume, 1), muted: saved[c]?.muted === true })])),
  }) as SoundMix;
} catch { /* unavailable or malformed storage uses the defaults */ }

export const getSoundMix = () => mix;
export function subscribeSoundMix(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useSoundMix() {
  return useSyncExternalStore(subscribeSoundMix, getSoundMix, getSoundMix);
}
function save(next: SoundMix) {
  mix = Object.freeze(next);
  try { localStorage.setItem(KEY, JSON.stringify(mix)); } catch { /* in-memory settings still work */ }
  for (const listener of listeners) listener();
}
export function setMasterVolume(volume: number) {
  save({ ...mix, master: level(volume, mix.master) });
}
export function setCategoryVolume(category: SoundCategory, volume: number) {
  save({ ...mix, [category]: Object.freeze({ ...mix[category], volume: level(volume, mix[category].volume) }) });
}
export function setCategoryMuted(category: SoundCategory, muted: boolean) {
  save({ ...mix, [category]: Object.freeze({ ...mix[category], muted }) });
}
export function categoryGain(category: SoundCategory) {
  return mix.master * (mix[category].muted ? 0 : mix[category].volume);
}

// #1163: the Sea sounds switch under Music and ambience. On unless saved as "0". Playback is #662's; this is only the saved choice.
const SEA_KEY = "emberisle-sea-sounds";
let sea = (() => { try { return localStorage.getItem(SEA_KEY) !== "0"; } catch { return true; } })();
export const getSeaSounds = () => sea;
export function setSeaSounds(on: boolean) {
  sea = on;
  try { if (on) localStorage.removeItem(SEA_KEY); else localStorage.setItem(SEA_KEY, "0"); } catch { /* the in-memory choice still works */ }
  for (const listener of listeners) listener();
}
