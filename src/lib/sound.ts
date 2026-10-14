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
  ui_click: "click_001.wav",
  ui_back: "back_001.wav",
  ui_error: "error_001.wav",
  win: "pluck_001.wav",
  // Reused as the your-turn chime.
  chip_gain: "click_005.wav",
  // Synthesised by scripts/make-sounds.mjs (docs/design/sound.md).
  wayfarer_move: "wayfarer_move.wav",
  trade_offer: "trade_offer.wav",
  chat_send: "chat_send.wav",
  chat_recv: "chat_recv.wav",
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

// A clip never starts twice within GAP_MS of its last request (a burst is one sound), and clips start at least GAP_MS apart
// in the order asked, so a bot round of five moves is five separate sounds. A backlog past MAX_QUEUE is dropped, not played late.
// The UI clips answer a person's own press, so a quick second press still clicks: they are paced but never dropped as a burst.
const GAP_MS = 150;
const MAX_QUEUE = 8;
const UI: ReadonlySet<SoundName> = new Set<SoundName>(["ui_click", "ui_back", "ui_error"]);
const asked = new Map<SoundName, number>();
const queue: [SoundName, number][] = [];
let pacing = false;

function pump() {
  const next = queue.shift();
  if (!next) {
    pacing = false;
    return;
  }
  pacing = true;
  start(...next);
  setTimeout(pump, GAP_MS);
}

function start(name: SoundName, volume: number) {
  if (muted) return;
  try {
    let clip = clips.get(name);
    if (!clip) {
      clip = new Audio(`/audio/${FILES[name]}`);
      clips.set(name, clip);
    }
    clip.currentTime = 0;
    clip.volume = volume;
    clip.play()?.catch(() => {});
  } catch {
    // a blocked or unsupported file stays quiet
  }
}

export function play(name: SoundName, volume = 1) {
  if (!unlocked || muted || typeof Audio === "undefined") return;
  const now = Date.now();
  if ((!UI.has(name) && now - (asked.get(name) ?? -GAP_MS) < GAP_MS) || queue.length >= MAX_QUEUE) return;
  asked.set(name, now);
  queue.push([name, volume]);
  if (!pacing) pump();
}

// The your-turn chime, with a short buzz on phones that have a motor.
export function yourTurn() {
  play("chip_gain");
  if (unlocked && !muted) navigator.vibrate?.(30);
}
