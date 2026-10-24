// Table sounds in the browser (docs/BUILD_BIBLE.md §7, #303). The files are the CC0 Kenney wavs in public/audio/,
// named as in server/cue.mjs. Nothing plays before the first pointer or key gesture (browsers refuse autoplay), and a
// missing or blocked file is silent, never a thrown error or a console error.
import { useSyncExternalStore } from "react";
import { categoryGain, subscribeSoundMix, type SoundCategory } from "./sound-settings";

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
  your_turn: "your_turn.wav",
  // The last 5 s of your turn online (#661): a tick for each of 5..1, a knock at 0.
  timer_tick: "timer_tick.wav",
  timer_final: "timer_final.wav",
  chip_gain: "click_005.wav",
  gain_tick: "click_002.wav",
  // Synthesised by scripts/make-sounds.mjs (docs/design/sound.md).
  wayfarer_move: "wayfarer_move.wav",
  trade_offer: "trade_offer.wav",
  chat_send: "chat_send.wav",
  chat_recv: "chat_recv.wav",
  // A tap on the sea (#616): a normal table clip, paced and burst-dropped like the rest.
  plop: "plop.wav",
  // The player the wayfarer is set against hears this instead of wayfarer_move (the owner's clip).
  robbed_fah: "robbed_fah.mp3",
  // Music: a short sting when a game starts (cut off by the first roll), when a player is one point from winning, and for the
  // seats that did not win. Played at MUSIC volume.
  game_start: "game_start.mp3",
  match_point: "match_point.mp3",
  game_lose: "game_lose.mp3",
  // The chat soundboard (server/chat.mjs SOUNDBOARD): a tap plays on every seat's page.
  sb_wololo: "sb_wololo.mp3",
  sb_win_reaction: "sb_win_reaction.mp3",
  sb_airhorn: "sb_airhorn.mp3",
  sb_quit_touchin: "sb_quit_touchin.mp3",
  sb_only_wood: "sb_only_wood.mp3",
  sb_perfect: "sb_perfect.mp3",
  // End-of-game music: starts a moment after the win or loss sting, stops when the end screen is left or a new game starts.
  end_music: "end_music.mp3",
  board_bong: "bong_001.wav",
  board_plop: "plop.wav",
  board_pluck: "pluck_001.wav",
  // #667: a tap on a hex that places nothing. Pasture is the owner's own sheep clip; the rest are synthesised (make-sounds.mjs).
  tap_pasture: "sb_plump_sheep.mp3",
  tap_forest: "tap_forest.wav",
  tap_hills: "tap_hills.wav",
  tap_fields: "tap_fields.wav",
  tap_mountains: "tap_mountains.wav",
  tap_waste: "tap_waste.wav",
} as const;

// The soundboard buttons in the chat, in order. `id` is what the host whitelists and relays; `clip` is what a page plays.
export const SOUNDBOARD = [
  { id: "robbed_fah", label: "Fah", clip: "robbed_fah" },
  { id: "sb_wololo", label: "Wololo", clip: "sb_wololo" },
  { id: "sb_win_reaction", label: "GG!", clip: "sb_win_reaction" },
  { id: "sb_airhorn", label: "Airhorn", clip: "sb_airhorn" },
  { id: "sb_quit_touchin", label: "Quit touchin' me", clip: "sb_quit_touchin" },
  { id: "sb_only_wood", label: "Only wood?", clip: "sb_only_wood" },
  { id: "sb_perfect", label: "Perfect", clip: "sb_perfect" },
  { id: "bong", label: "Bong", clip: "board_bong" },
  { id: "plop", label: "Plop", clip: "board_plop" },
  { id: "pluck", label: "Pluck", clip: "board_pluck" },
] as const satisfies readonly { id: string; label: string; clip: keyof typeof FILES }[];
export type BoardSound = (typeof SOUNDBOARD)[number]["id"];

// Music is quieter than the table's knocks and clicks.
export const MUSIC_VOLUME = 0.5;
// The soundboard and the meme clips (robbed_fah) sit below the music (docs/design/sound.md, decisions).
export const MEME_VOLUME = 0.4;

export type SoundName = keyof typeof FILES;

// Board soundboard buttons are memes; only plain board touches belong to touch. Match point is a meme (#669).
export function soundCategory(name: SoundName): SoundCategory {
  if (/^tap_|^plop$/.test(name)) return "touch";
  if (/^sb_|^board_|^robbed_fah$|^match_point$/.test(name)) return "memes";
  if (/^game_|^end_music$/.test(name)) return "music";
  return "game";
}

const MUTED_KEY = "emberisle-muted";
const clips = new Map<SoundName, HTMLAudioElement>();
const gains = new Map<SoundName, number>();
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

export let haptics: typeof import("./haptics") | undefined;
// Installed once by the phone bootstrap, before rejoin and interactive rendering.
export function installHaptics(module: typeof import("./haptics")) { haptics = module; }

if (typeof window !== "undefined") {
  const unlock = () => {
    unlocked = true;
    syncMusic();
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true, passive: true });
}

export function isMuted() {
  return muted;
}

export function setMuted(v: boolean) {
  muted = v;
  if (v) stop("end_music");
  syncVolumes();
  syncMusic();
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

export const canHaptic = () => unlocked && !muted;
export const hapticsAvailable = () => haptics?.available() ?? false;
export const haptic = (ms: number) => { haptics?.buzz(ms); };

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
  const gain = volume * categoryGain(soundCategory(name));
  if (muted || !gain) return;
  try {
    // The first roll cuts the game-start sting off.
    if (name === "dice_land") clips.get("game_start")?.pause();
    let clip = clips.get(name);
    if (!clip) {
      clip = new Audio(`${import.meta.env.BASE_URL}audio/${FILES[name]}`);
      clips.set(name, clip);
      if (DUCKERS.has(name)) for (const e of ["play", "pause", "ended"]) clip.addEventListener(e, duckMusic);
    }
    clip.currentTime = 0;
    gains.set(name, volume);
    clip.volume = gain;
    clip.play()?.catch(() => {});
  } catch {
    // a blocked or unsupported file stays quiet
  }
}

export function play(name: SoundName, volume = 1) {
  if (!unlocked || muted || !categoryGain(soundCategory(name)) || typeof Audio === "undefined") return;
  // Paying pieces are already staggered by the renderer at 90 ms, capped at eight per roll. The general 150 ms
  // burst filter would silently lose every other tick; play these directly at their visual onset.
  if (name === "gain_tick") { start(name, volume); return; }
  const now = Date.now();
  if ((!UI.has(name) && now - (asked.get(name) ?? -GAP_MS) < GAP_MS) || queue.length >= MAX_QUEUE) return;
  asked.set(name, now);
  queue.push([name, volume]);
  if (!pacing) pump();
}

// Start a clip after `ms`; stop(name) cancels it before then. One pending start per clip.
const later = new Map<SoundName, ReturnType<typeof setTimeout>>();
export function playLater(name: SoundName, volume: number, ms: number) {
  const old = later.get(name);
  if (old) clearTimeout(old);
  later.set(name, setTimeout(() => {
    later.delete(name);
    play(name, volume);
  }, ms));
}

// Stop a clip that is playing (the end music, when its screen is left or the sound is muted).
export function stop(name: SoundName) {
  // A clip still waiting (its delay, or its place in the pacing queue) is cancelled too, so muting or leaving never lets it start late.
  const wait = later.get(name);
  if (wait) clearTimeout(wait);
  later.delete(name);
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i]![0] === name) queue.splice(i, 1);
  const clip = clips.get(name);
  if (!clip) return;
  clip.pause();
  clip.currentTime = 0;
}

// The your-turn chime, with a short buzz on phones that have a motor (#542: 15 ms, was 30).
export function yourTurn() {
  play("your_turn");
  haptics?.turn();
}

// Background music (#814): "Medieval: The Old Tower Inn" (docs/design/sound.md). The file is fetched on the first start, after
// the first gesture, never before, and is not part of any JS chunk. It plays while the table wants it (the lobby and play, not
// the title or the end screen), unless muted or switched off; it dips under the stings.
const MUSIC_FILE = "old_tower_inn_loop.mp3";
export const BG_VOLUME = 0.25;
const BG_DUCK = 0.3;
const DUCKERS: ReadonlySet<SoundName> = new Set<SoundName>(["game_start", "match_point", "game_lose", "end_music"]);
const MUSIC_KEY = "emberisle-music";
let bg: HTMLAudioElement | null = null;
let bgWanted = false;
let bgOn = savedMusicOn();
let bgRetry = false;

function savedMusicOn() {
  try {
    return localStorage.getItem(MUSIC_KEY) !== "0";
  } catch {
    return true;
  }
}

export function isMusicOn() {
  return bgOn;
}

export function useMusicOn() {
  return useSyncExternalStore(subscribe, isMusicOn, () => true);
}

export function setMusicOn(v: boolean) {
  bgOn = v;
  try {
    if (v) localStorage.removeItem(MUSIC_KEY);
    else localStorage.setItem(MUSIC_KEY, "0");
  } catch {
    // storage can be blocked; the toggle still holds for this page
  }
  syncMusic();
  for (const l of listeners) l();
}

// The screen says whether the table wants music now; the other conditions are checked here.
export function setMusicWanted(v: boolean) {
  bgWanted = v;
  syncMusic();
}

// Quieter while any of the stings plays; back to full when the last one ends or is cut off.
function duckMusic() {
  if (!bg) return;
  let ducked = false;
  for (const n of DUCKERS) {
    const c = clips.get(n);
    if (c && !c.paused && !c.ended && c.volume > 0) ducked = true;
  }
  bg.volume = BG_VOLUME * (ducked ? BG_DUCK : 1) * categoryGain("music");
}

function syncMusic() {
  if (typeof Audio === "undefined") return;
  if (!(bgWanted && bgOn && unlocked && !muted && categoryGain("music"))) {
    if (bg) {
      bg.pause();
      if (!bgWanted) bg.currentTime = 0;
    }
    return;
  }
  try {
    if (!bg) {
      bg = new Audio(`${import.meta.env.BASE_URL}audio/${MUSIC_FILE}`);
      bg.loop = true;
    }
    duckMusic();
    bg.play()?.catch(() => {
      // refused: try once more on the next press or key
      if (bgRetry) return;
      bgRetry = true;
      const again = () => {
        bgRetry = false;
        syncMusic();
      };
      window.addEventListener("pointerup", again, { once: true, passive: true });
      window.addEventListener("keydown", again, { once: true, passive: true });
    });
  } catch {
    // a blocked or unsupported file stays quiet
  }
}

function syncVolumes() {
  for (const [name, clip] of clips) clip.volume = muted ? 0 : (gains.get(name) ?? 1) * categoryGain(soundCategory(name));
}
subscribeSoundMix(() => { syncVolumes(); syncMusic(); });

// #667: a tap on a hex that places nothing plays that terrain's clip, quietly, at most once per TOUCH_GAP_MS. Only a sheep
// hex (Pasture, "wool") baas. The renderer calls this for a plain tap only: never for a drag, a pinch or an armed placement.
const TOUCH_GAP_MS = 400;
export const TOUCH_VOLUME = 0.3;
const TOUCH_CLIP: Record<string, SoundName> = {
  wool: "tap_pasture",
  timber: "tap_forest",
  clay: "tap_hills",
  grain: "tap_fields",
  ore: "tap_mountains",
  waste: "tap_waste",
};
let touchedAt = -TOUCH_GAP_MS;
export function touchHex(terrain: string) {
  const clip = TOUCH_CLIP[terrain];
  if (!clip || !unlocked || muted) return;
  const now = Date.now();
  if (now - touchedAt < TOUCH_GAP_MS) return;
  touchedAt = now;
  play(clip, TOUCH_VOLUME);
}
