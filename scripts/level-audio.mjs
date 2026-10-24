// Levels files in public/audio by type (#1073, owner decision 2026-10-24). Types, targets and the method are in
// scripts/audio-level-lib.mjs (memes -16 LUFS, music -18 LUFS, table effects -18 short-clip loudness, true peak <= -1 dBTP;
// mp3: two-pass loudnorm where it lands, else measured gain + alimiter; wav: measured gain + alimiter; same name, rate, channels).
//
// Two modes. Neither ever levels a file twice, and neither touches a file it was not asked about.
//
//   node scripts/level-audio.mjs [--report out.md] [--listen dir]
//     REPRODUCE the #1073 levelling: reads the original files from git history (ORIGINALS_REV, the last commit before the
//     levelling) and writes the leveled files over public/audio. Same result every run. Use it only to redo #1073's 41 files; it
//     writes ALL of them, so it would revert any later change to one of those files (a regenerated or replaced clip).
//
//   node scripts/level-audio.mjs --new <name>...      e.g.  --new amb_sea your_turn
//     LEVEL NEW OR REPLACED FILES: takes each named file from the CURRENT tree (public/audio/<name>.mp3 or .wav, which must not
//     be leveled yet) and levels it in place. Add the name to TYPE_OF in scripts/audio-level-lib.mjs first (a new kind of sound
//     may need its own target, which is the owner's call). Every other file is left alone.
//
// The synth wavs of scripts/make-sounds.mjs are leveled by make-sounds itself through the same levelFile().
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { levelFile, measure, TARGETS, typeOf } from "./audio-level-lib.mjs";

export const ORIGINALS_REV = "8d5e23c";
const root = new URL("..", import.meta.url).pathname;
const audio = join(root, "public/audio");
const work = mkdtempSync(join(tmpdir(), "level-audio-"));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const git = (...a) => execFileSync("git", ["-C", root, ...a], { maxBuffer: 1 << 28 });

const rows = [];
const newMode = process.argv.indexOf("--new");
if (newMode > 0) {
  const asked = process.argv.slice(newMode + 1).filter((a) => !a.startsWith("--"));
  if (!asked.length) throw new Error("--new needs at least one clip name");
  for (const n of asked) {
    const name = [`${n}.mp3`, `${n}.wav`, n].find((f) => existsSync(join(audio, f)) && /\.(mp3|wav)$/.test(f));
    if (!name) throw new Error(`public/audio/${n} not found`);
    const src = join(work, "orig_" + name);
    copyFileSync(join(audio, name), src);
    const type = typeOf(name); // throws, naming the file, until it has a type
    const out = join(work, name);
    const { before, how } = levelFile(src, out, type);
    copyFileSync(out, join(audio, name));
    rows.push({ before: { ...before, file: name }, after: measure(join(audio, name), type), type, how, src });
  }
} else {
  const names = String(git("ls-tree", "--name-only", ORIGINALS_REV, "public/audio/")).trim().split("\n").map((n) => n.split("/").pop());
  for (const name of names) {
    const src = join(work, "orig_" + name);
    writeFileSync(src, git("show", `${ORIGINALS_REV}:public/audio/${name}`));
    const type = typeOf(name);
    const out = join(work, name);
    const { before, how } = levelFile(src, out, type);
    copyFileSync(out, join(audio, name));
    rows.push({ before: { ...before, file: name }, after: measure(join(audio, name), type), type, how, src });
  }
}
for (const r of rows) {
  console.log(`${r.type.padEnd(8)} ${r.before.file.padEnd(24)} ${r.before.level.toFixed(1).padStart(6)} -> ${r.after.level.toFixed(1).padStart(6)}  tp ${r.before.truePeak.toFixed(1).padStart(5)} -> ${r.after.truePeak.toFixed(1).padStart(5)}  ${r.how}`);
}

if (arg("--report")) {
  const unit = { lufs: "LUFS", short: "dB (short)" };
  const md = ["| Type | Clip | Method | Before | After | True peak before | True peak after | Processing |", "|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.type} | \`${r.before.file}\` | ${unit[r.before.method]} | ${r.before.level.toFixed(1)} | ${r.after.level.toFixed(1)} | ${r.before.truePeak.toFixed(1)} | ${r.after.truePeak.toFixed(1)} | ${r.how} |`)];
  writeFileSync(arg("--report"), md.join("\n") + "\n");
}
if (arg("--listen")) {
  // One before-then-after file per type: each clip, original then leveled, 0.5 s apart. Not committed.
  const dir = arg("--listen");
  mkdirSync(dir, { recursive: true });
  const { spawnSync } = await import("node:child_process");
  const run = (args) => { const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-y", ...args], { maxBuffer: 1 << 28 }); if (r.status) throw new Error(String(r.stderr).slice(-500)); };
  for (const type of Object.keys(TARGETS)) {
    const list = rows.filter((r) => r.type === type);
    if (!list.length) continue;
    const inputs = [], parts = [];
    list.forEach((r) => inputs.push("-i", r.src, "-i", join(audio, r.before.file)));
    const labels = list.flatMap((_, i) => [`[a${2 * i}]`, `[a${2 * i + 1}]`]);
    list.forEach((_, i) => { for (const k of [2 * i, 2 * i + 1]) parts.push(`[${k}:a]aformat=sample_rates=44100:channel_layouts=mono,apad=pad_dur=0.5[a${k}]`); });
    run([...inputs, "-filter_complex", `${parts.join(";")};${labels.join("")}concat=n=${labels.length}:v=0:a=1[o]`, "-map", "[o]", "-c:a", "pcm_s16le", join(dir, `${type}-before-after.wav`)]);
    run(["-i", join(dir, `${type}-before-after.wav`), "-c:a", "libmp3lame", "-b:a", "192k", join(dir, `${type}-before-after.mp3`)]);
  }
}
