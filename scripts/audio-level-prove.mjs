// #1073 (owner decision 2026-10-24): every sound is leveled by type, with no blanket volume. Measures every file in public/audio:
// memes (soundboard and reaction clips) -16 LUFS, music and stings -18 LUFS, table effects -18 (short-clip K-weighted loudness of
// the active part, which is on the LUFS scale; see scripts/audio-level-lib.mjs). Fails if any file is more than 1 LU from its type's
// target or its true peak is above -1 dBTP. Also checks the measure itself against a synthesised tone. Needs ffmpeg.
// Run: npm run audio-level-prove   (levels come from: node scripts/level-audio.mjs)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ebur128, MAX_TRUE_PEAK, measure, shortLoudness, TARGETS, TOLERANCE, typeOf } from "./audio-level-lib.mjs";

const dir = new URL("../public/audio/", import.meta.url).pathname;

// The measure agrees with itself: a 3 s tone read as a short clip equals the R128 integrated reading of the same tone.
const tmp = mkdtempSync(join(tmpdir(), "audio-level-prove-"));
const tone = join(tmp, "tone.wav");
const made = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=1000:duration=3:sample_rate=48000", "-af", "volume=-2dB", tone]);
assert.equal(made.status, 0, "ffmpeg is installed (apt-get install ffmpeg)");
const r128 = ebur128(tone).lufs;
assert.ok(Math.abs(r128 - -23.1) < 0.3, `a -20 dBFS 1 kHz tone reads about -23.1 LUFS (${r128})`);
assert.ok(Math.abs(shortLoudness(tone) - r128) < 0.3, `short-clip loudness matches R128 on a tone (${shortLoudness(tone)} vs ${r128})`);
console.log(`ok the measure: -20 dBFS peak tone = ${r128} LUFS, short-clip method ${shortLoudness(tone).toFixed(1)}`);

const files = readdirSync(dir).filter((f) => /\.(mp3|wav)$/.test(f)).sort();
assert.ok(files.length >= 40, `found the audio files (${files.length})`);
const bad = [];
for (const f of files) {
  try { typeOf(f); } catch (e) { bad.push(e.message); }
}
assert.deepEqual(bad, [], "every file has a type");
for (const f of files) {
  const m = measure(join(dir, f));
  const { target } = TARGETS[typeOf(f)];
  const off = m.level - target;
  const line = `${m.type.padEnd(8)} ${f.padEnd(24)} ${m.level.toFixed(1).padStart(6)} (target ${target}) peak ${m.truePeak.toFixed(1).padStart(5)} dBTP`;
  console.log(line);
  if (!(Math.abs(off) <= TOLERANCE)) bad.push(`${f}: ${m.level.toFixed(1)} is ${off.toFixed(1)} from the ${m.type} target ${target}`);
  if (!(m.truePeak <= MAX_TRUE_PEAK)) bad.push(`${f}: true peak ${m.truePeak.toFixed(1)} dBTP is above ${MAX_TRUE_PEAK}`);
}
assert.deepEqual(bad, [], `every file is within ${TOLERANCE} LU of its type's target and at or below ${MAX_TRUE_PEAK} dBTP`);
console.log(`audio-level-prove ok: ${files.length} files`);
