// Shared loudness measurement for public/audio (#1073): used by level-audio.mjs and audio-level-prove.mjs. Needs ffmpeg.
//   "lufs"  : EBU R128 integrated loudness (ffmpeg ebur128) for clips of 1 s or more: memes and music.
//   "short" : for the table effects, which are far too short for LUFS: the K-weighted (BS.1770) mean square of the active part,
//             on the LUFS scale (a steady tone would read the same in LUFS). Decoded to 48 kHz mono, cut into 2 ms blocks, and only
//             the blocks within 30 dB of the loudest block count, so silence and a decay below that do not dilute the clip.
// True peak is always ffmpeg ebur128 peak=true (4x oversampled), in dBTP.
import { spawnSync } from "node:child_process";
import { basename } from "node:path";

export const MEMES = ["robbed_fah", "sb_airhorn", "sb_only_wood", "sb_perfect", "sb_quit_touchin", "sb_win_reaction", "sb_wololo"];
export const MUSIC = ["end_music", "game_lose", "game_start", "match_point", "old_tower_inn_loop"];
// The Pasture tap is a clip of the owner's sheep, but it plays as a table touch (tap_pasture), so it is levelled with the effects.
export const EFFECT_MP3 = ["sb_plump_sheep"];
export const TARGETS = { memes: { method: "lufs", target: -16 }, music: { method: "lufs", target: -18 }, effects: { method: "short", target: -18 } };
export const TOLERANCE = 1; // LU or dB
export const MAX_TRUE_PEAK = -1; // dBTP

export function typeOf(file) {
  const name = basename(file).replace(/\.(mp3|wav)$/, "");
  if (MEMES.includes(name)) return "memes";
  if (MUSIC.includes(name)) return "music";
  return "effects";
}

function ff(args, opts = {}) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(" ")}: ${String(r.stderr).slice(-400)}`);
  return r;
}

export function duration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return parseFloat(String(r.stdout));
}

export function ebur128(file) {
  const out = String(ff(["-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr);
  const sum = out.slice(out.lastIndexOf("Summary:"));
  const num = (re) => { const m = sum.match(re); return m ? parseFloat(m[1]) : NaN; };
  return { lufs: num(/I:\s+(-?[\d.]+|-inf) LUFS/), truePeak: num(/Peak:\s+(-?[\d.]+) dBFS/) };
}

// BS.1770 K-weighting at 48 kHz: a high-shelf stage, then a 38 Hz high-pass.
const K = [
  { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [1, -1.69065929318241, 0.73248077421585] },
  { b: [1, -2, 1], a: [1, -1.99004745483398, 0.99007225036621] },
];

export function shortLoudness(file) {
  const fs = 48000;
  const pcm = ff(["-i", file, "-ac", "1", "-ar", String(fs), "-f", "f32le", "-"]).stdout;
  let y = Float64Array.from(new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4)));
  for (const { b, a } of K) {
    const out = new Float64Array(y.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) {
      out[i] = b[0] * y[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      x2 = x1; x1 = y[i]; y2 = y1; y1 = out[i];
    }
    y = out;
  }
  const block = fs / 500; // 2 ms
  const ms = [];
  for (let i = 0; i + block <= y.length; i += block) {
    let s = 0;
    for (let j = i; j < i + block; j++) s += y[j] ** 2;
    ms.push(s / block);
  }
  if (!ms.length) return NaN;
  const floor = Math.max(...ms) / 1000; // 30 dB below the loudest block
  const active = ms.filter((v) => v >= floor);
  return -0.691 + 10 * Math.log10(active.reduce((a, v) => a + v, 0) / active.length);
}

export function measure(file, type = typeOf(file)) {
  
  const { method } = TARGETS[type];
  const e = ebur128(file);
  const level = method === "lufs" ? e.lufs : shortLoudness(file);
  return { file: basename(file), type, method, level, truePeak: e.truePeak, seconds: duration(file) };
}
