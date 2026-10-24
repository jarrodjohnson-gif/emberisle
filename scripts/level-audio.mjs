// Levels every file in public/audio by type (#1073, owner decision 2026-10-24). Reproducible: it reads the ORIGINAL files from git
// history (ORIGINALS_REV, the last commit before levelling) and writes the leveled files over public/audio, so running it twice
// gives the same files and never levels a leveled file again.  Run: node scripts/level-audio.mjs [--report out.md] [--listen dir]
//
// Types and targets (scripts/audio-level-lib.mjs): memes -16 LUFS, music -18 LUFS, table effects -18 (short-clip K-weighted
// loudness of the active part). Every file ends at or below -1 dBTP. Method per file, in order:
//   mp3 of 1 s or more: ffmpeg two-pass loudnorm in linear mode (measure, then one pure gain), TP ceiling -1.5 dBTP.
//   anything that pass leaves more than 0.3 off, and every wav: a gain found by iteration (measure, correct, repeat, always
//   applied to the original) followed by alimiter, whose ceiling drops 0.25 dB at a time until the true peak is at or below -1.0.
// Re-encoded the same way: mp3 at the original bitrate, sample rate and channels (no cover art); wav as 16-bit PCM at the
// original sample rate and channels. File names never change.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measure, TARGETS, typeOf, MAX_TRUE_PEAK } from "./audio-level-lib.mjs";

export const ORIGINALS_REV = "8d5e23c";
const root = new URL("..", import.meta.url).pathname;
const audio = join(root, "public/audio");
const work = mkdtempSync(join(tmpdir(), "level-audio-"));

const git = (...a) => execFileSync("git", ["-C", root, ...a], { maxBuffer: 1 << 28 });
const names = String(git("ls-tree", "--name-only", ORIGINALS_REV, "public/audio/")).trim().split("\n").map((n) => n.split("/").pop());
const probe = (f, entry) => String(execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", `stream=${entry}`, "-of", "csv=p=0", f])).trim().split(",")[0];
const run = (args) => { const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-y", ...args], { maxBuffer: 1 << 28 }); if (r.status) throw new Error(String(r.stderr).slice(-500)); return String(r.stderr); };

function encode(src, out, filter) {
  const wav = out.endsWith(".wav");
  const fmt = wav
    ? ["-c:a", "pcm_s16le"]
    : ["-c:a", "libmp3lame", "-b:a", `${Math.round(Number(probe(src, "bit_rate")) / 1000)}k`];
  run(["-i", src, "-vn", "-map_metadata", "-1", "-af", filter, "-ar", probe(src, "sample_rate"), "-ac", probe(src, "channels"), ...fmt, out]);
}

function loudnormTwoPass(src, out, target) {
  const log = run(["-i", src, "-af", `loudnorm=I=${target}:TP=-1.5:LRA=20:print_format=json`, "-f", "null", "-"]);
  const j = JSON.parse(log.slice(log.lastIndexOf("{"), log.lastIndexOf("}") + 1));
  encode(src, out, `loudnorm=I=${target}:TP=-1.5:LRA=20:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`);
}

function gainLimit(src, out, target, level0) {
  let ceiling = -1.5;
  let gain = target - level0;
  for (let i = 0; i < 40; i++) {
    const lim = (10 ** (ceiling / 20)).toFixed(5);
    encode(src, out, `volume=${gain.toFixed(3)}dB,alimiter=limit=${lim}:attack=1:release=30:level=0`);
    const m = measure(out, typeOf(out));
    const err = target - m.level;
    if (m.truePeak > MAX_TRUE_PEAK) { ceiling -= 0.25; continue; }
    if (Math.abs(err) <= 0.1) return;
    gain += err;
  }
  throw new Error(`${src}: cannot reach ${target} at <= ${MAX_TRUE_PEAK} dBTP`);
}

const rows = [];
for (const name of names) {
  const src = join(work, "orig_" + name);
  writeFileSync(src, git("show", `${ORIGINALS_REV}:public/audio/${name}`));
  const type = typeOf(name);
  const { target } = TARGETS[type];
  const before = { ...measure(src, type), file: name };
  const out = join(work, name);
  let how = "gain + alimiter";
  if (name.endsWith(".mp3") && before.seconds >= 1 && TARGETS[type].method === "lufs") {
    how = "loudnorm two-pass linear";
    try {
      loudnormTwoPass(src, out, target);
      const m = measure(out);
      if (Math.abs(m.level - target) > 0.3 || m.truePeak > MAX_TRUE_PEAK) how = "";
    } catch { how = ""; } // e.g. a clip that clips (loudnorm cannot take a positive measured_I)
    if (!how) { gainLimit(src, out, target, before.level); how = "gain + alimiter"; }
  } else gainLimit(src, out, target, before.level);
  copyFileSync(out, join(audio, name));
  rows.push({ before, after: measure(join(audio, name), type), type, how });
  const r = rows.at(-1);
  console.log(`${type.padEnd(8)} ${name.padEnd(24)} ${r.before.level.toFixed(1).padStart(6)} -> ${r.after.level.toFixed(1).padStart(6)}  tp ${r.before.truePeak.toFixed(1).padStart(5)} -> ${r.after.truePeak.toFixed(1).padStart(5)}  ${how}`);
}

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
if (arg("--report")) {
  const unit = { lufs: "LUFS", short: "dB (short)" };
  const md = ["| Type | Clip | Method | Before | After | True peak before | True peak after | Processing |", "|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.type} | \`${r.before.file}\` | ${unit[r.before.method]} | ${r.before.level.toFixed(1)} | ${r.after.level.toFixed(1)} | ${r.before.truePeak.toFixed(1)} | ${r.after.truePeak.toFixed(1)} | ${r.how} |`)];
  writeFileSync(arg("--report"), md.join("\n") + "\n");
}
if (arg("--listen")) {
  // One before-then-after file per type: each clip, original then leveled, 0.4 s apart. Not committed.
  const dir = arg("--listen");
  mkdirSync(dir, { recursive: true });
  for (const type of Object.keys(TARGETS)) {
    const list = rows.filter((r) => r.type === type).map((r) => r.before.file);
    const inputs = [], parts = [];
    list.forEach((n, i) => { inputs.push("-i", join(work, "orig_" + n), "-i", join(audio, n)); });
    const labels = list.flatMap((_, i) => [`[a${2 * i}]`, `[a${2 * i + 1}]`]);
    list.forEach((_, i) => { for (const k of [2 * i, 2 * i + 1]) parts.push(`[${k}:a]aformat=sample_rates=44100:channel_layouts=mono,apad=pad_dur=0.5[a${k}]`); });
    run([...inputs, "-filter_complex", `${parts.join(";")};${labels.join("")}concat=n=${labels.length}:v=0:a=1[o]`, "-map", "[o]", "-c:a", "pcm_s16le", join(dir, `${type}-before-after.wav`)]);
    run(["-i", join(dir, `${type}-before-after.wav`), "-c:a", "libmp3lame", "-b:a", "192k", join(dir, `${type}-before-after.mp3`)]);
  }
}
