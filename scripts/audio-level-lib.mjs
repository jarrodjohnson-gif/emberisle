// Shared loudness measurement for public/audio (#1073): used by level-audio.mjs and audio-level-prove.mjs. Needs ffmpeg.
//   "lufs"  : EBU R128 integrated loudness (ffmpeg ebur128) for clips of 1 s or more: memes and music.
//   "short" : for the table effects, which are far too short for LUFS: the K-weighted (BS.1770) mean square of the active part,
//             on the LUFS scale (a steady tone would read the same in LUFS). Decoded to 48 kHz mono, cut into 2 ms blocks, and only
//             the blocks within 30 dB of the loudest block count, so silence and a decay below that do not dilute the clip.
// True peak is always ffmpeg ebur128 peak=true (4x oversampled), in dBTP.
import { execFileSync, spawnSync } from "node:child_process";
import { basename } from "node:path";

// Every file in public/audio has exactly one type here. A file with no entry is an error (audio-level-prove names it): a new sound
// needs a type, and a type may need its own target (an ambience bed is not a table effect), which is the owner's call.
// The Pasture tap is a clip of the owner's sheep, but it plays as a table touch (tap_pasture), so it is levelled with the effects.
export const TYPE_OF = {
  memes: ["corn_no", "daking_wood", "isaac_win", "robbed_fah", "sb_airhorn", "sb_brick_please", "sb_grain_please", "sb_nice_sheep", "sb_only_wood", "sb_perfect", "sb_quit_touchin", "sb_sheep_please", "sb_win_reaction", "sb_wololo", "sheep_for_wood", "stone_for_wood", "three_wood"],
  music: ["end_music", "game_lose", "game_start", "match_point", "old_tower_inn_loop"],
  effects: [
    "back_001", "bong_001", "chat_recv", "chat_send", "click_001", "click_002", "click_005", "confirmation_001", "drop_001", "drop_002",
    "drop_003", "drop_004", "error_001", "error_002", "open_001", "plop", "pluck_001", "sb_plump_sheep", "scratch_001", "tap_fields",
    "lucke_diggler", "tap_forest", "tap_hills", "tap_mountains", "tap_pasture", "tap_waste", "timer_final", "timer_tick", "trade_offer", "wayfarer_move", "your_turn",
  ],
};
export const TARGETS = { memes: { method: "lufs", target: -16 }, music: { method: "lufs", target: -18 }, effects: { method: "short", target: -18 } };
export const TOLERANCE = 1; // LU or dB
export const MAX_TRUE_PEAK = -1; // dBTP

export function typeOf(file) {
  const name = basename(file).replace(/\.(mp3|wav)$/, "");
  const type = Object.keys(TYPE_OF).find((t) => TYPE_OF[t].includes(name));
  if (!type) throw new Error(`assign a type to ${basename(file)} in scripts/audio-level-lib.mjs (TYPE_OF)`);
  return type;
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

// ---- Levelling (used by level-audio.mjs and by make-sounds.mjs for the synth wavs) ----
const probe = (f, entry) => String(execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", `stream=${entry}`, "-of", "csv=p=0", f])).trim().split(",")[0];
const run = (args) => { const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-y", ...args], { maxBuffer: 1 << 28 }); if (r.status) throw new Error(String(r.stderr).slice(-500)); return String(r.stderr); };

function encode(src, out, filter) {
  const fmt = out.endsWith(".wav") ? ["-c:a", "pcm_s16le"] : ["-c:a", "libmp3lame", "-b:a", `${Math.round(Number(probe(src, "bit_rate")) / 1000)}k`];
  run(["-i", src, "-vn", "-map_metadata", "-1", "-af", filter, "-ar", probe(src, "sample_rate"), "-ac", probe(src, "channels"), ...fmt, out]);
}

function loudnormTwoPass(src, out, target) {
  const log = run(["-i", src, "-af", `loudnorm=I=${target}:TP=-1.5:LRA=20:print_format=json`, "-f", "null", "-"]);
  const j = JSON.parse(log.slice(log.lastIndexOf("{"), log.lastIndexOf("}") + 1));
  encode(src, out, `loudnorm=I=${target}:TP=-1.5:LRA=20:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`);
}

function gainLimit(src, out, type, level0) {
  const target = TARGETS[type].target;
  let ceiling = -1.5;
  let gain = target - level0;
  for (let i = 0; i < 40; i++) {
    encode(src, out, `volume=${gain.toFixed(3)}dB,alimiter=limit=${(10 ** (ceiling / 20)).toFixed(5)}:attack=1:release=30:level=0`);
    const m = measure(out, type);
    const err = target - m.level;
    if (m.truePeak > MAX_TRUE_PEAK) { ceiling -= 0.25; continue; }
    if (Math.abs(err) <= 0.1) return;
    gain += err;
  }
  throw new Error(`${src}: cannot reach ${target} at <= ${MAX_TRUE_PEAK} dBTP`);
}

// Levels the ORIGINAL file `src` to its type's target and writes `out` (the same name as the clip, so its type is known).
// Returns { before, how }. Always start from an unleveled file: levelling a leveled file is a second pass.
export function levelFile(src, out, type = typeOf(out)) {
  const before = measure(src, type);
  let how = "";
  if (out.endsWith(".mp3") && before.seconds >= 1 && TARGETS[type].method === "lufs") {
    try {
      loudnormTwoPass(src, out, TARGETS[type].target);
      const m = measure(out, type);
      how = Math.abs(m.level - TARGETS[type].target) > 0.3 || m.truePeak > MAX_TRUE_PEAK ? "" : "loudnorm two-pass linear";
    } catch { how = ""; } // e.g. a clip that clips (loudnorm cannot take a positive measured_I)
  }
  if (!how) { gainLimit(src, out, type, before.level); how = "gain + alimiter"; }
  return { before, how };
}
