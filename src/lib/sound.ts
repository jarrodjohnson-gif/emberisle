// Table sounds in the browser (docs/BUILD_BIBLE.md §7, #303). The files are the CC0 Kenney wavs in public/audio/,
// named as in server/cue.mjs. Nothing plays before the first pointer or key gesture (browsers refuse autoplay), and a
// missing or blocked file is silent, never a thrown error or a console error.
import { useSyncExternalStore } from "react";

const FILES = {
  dice_land: "drop_001.wav",
  path_place: "drop_002.wav",
  outpost_place: "drop_003.wav",
  stronghold_place: "bong_001.wav",
  card_buy: "open_001.wav",
  card_play: "scratch_001.wav",
  trade_yes: "confirmation_001.wav",
  trade_no: "error_002.wav",
  ui_error: "error_001.wav",
  win: "pluck_001.wav",
  // Reused as the your-turn chime.
  chip_gain: "click_005.wav",
} as const;

export type SoundName = keyof typeof FILES;

const MUTED_KEY = "emberisle-muted";
const clips = new Map<SoundName, HTMLAudioElement>();
let unlocked = false;
let muted = savedMuted();
const listeners = new Set<() => void>();

function savedMuted() {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

if (typeof window !== "undefined") {
  const unlock = () => {
    unlocked = true;
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true, passive: true });
}

export function isMuted() {
  return muted;
}

export function setMuted(v: boolean) {
  muted = v;
  try {
    if (v) localStorage.setItem(MUTED_KEY, "1");
    else localStorage.removeItem(MUTED_KEY);
  } catch {
    // storage can be blocked; the toggle still holds for this page
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useMuted() {
  return useSyncExternalStore(subscribe, isMuted, () => false);
}

export function play(name: SoundName) {
  if (!unlocked || muted || typeof Audio === "undefined") return;
  try {
    let clip = clips.get(name);
    if (!clip) {
      clip = new Audio(`/audio/${FILES[name]}`);
      clips.set(name, clip);
    }
    clip.currentTime = 0;
    clip.play()?.catch(() => {});
  } catch {
    // a blocked or unsupported file stays quiet
  }
}

// The your-turn chime, with a short buzz on phones that have a motor.
export function yourTurn() {
  play("chip_gain");
  if (unlocked && !muted) navigator.vibrate?.(30);
}
