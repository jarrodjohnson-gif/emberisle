// #1014: validate the decoded shipped clip, its recipe, and same-toolchain repeatability.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { RATE, SECONDS, CROSSFADE_SECONDS, SWELL_HZ } from "./make-ambience.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const flag = process.argv.indexOf("--file");
const shipped = flag < 0 ? path.join(root, "public/audio/amb_sea.mp3") : path.resolve(process.argv[flag + 1]);
const temp = mkdtempSync(path.join(tmpdir(), "emberisle-ambience-"));
let passed = 0;
const check = (why, ok) => { assert.ok(ok, why); passed++; console.log("ok", why); };
const command = (name, args) => {
  const result = spawnSync(name, args, { maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, `${name}: ${result.error?.message ?? result.stderr.toString()}`);
  return result.stdout;
};
const decode = (file) => command(ffmpeg.path, ["-hide_banner", "-loglevel", "error", "-i", file, "-f", "f32le", "-ar", "44100", "-ac", "1", "pipe:1"]);
try {
  check("the specified recipe remains 20 s, 2 s crossfade and 0.1 Hz swell", RATE === 44100 && SECONDS === 20 && CROSSFADE_SECONDS === 2 && SWELL_HZ === 0.1);
  const pcm = decode(shipped);
  const n = pcm.length / 4;
  check("decoded duration is exactly 20 seconds", n === 20 * 44100);
  let peak = 0, squares = 0;
  for (let i = 0; i < n; i++) {
    const value = pcm.readFloatLE(i * 4);
    assert.ok(Number.isFinite(value), "decoded samples are finite");
    peak = Math.max(peak, Math.abs(value));
    squares += value * value;
  }
  const rms = Math.sqrt(squares / n);
  check("the candidate is non-silent", rms > 0.01);
  check("the decoded clip never clips", peak < 1);
  const window = Math.ceil(0.01 * 44100);
  let seam = 0;
  for (let i = 0; i < window; i++) seam = Math.max(seam, Math.abs(pcm.readFloatLE(i * 4) - pcm.readFloatLE((n - window + i) * 4)));
  check("first/last 10 ms differ by less than 2% of full scale", seam < 0.02);
  check("the decoded loop endpoints remain near zero", Math.abs(pcm.readFloatLE(0)) < 0.002 && Math.abs(pcm.readFloatLE((n - 1) * 4)) < 0.002);
  // A zero-crossing seam must not hide a restart dip under a 150 ms edge envelope.
  const edge = Math.round(0.15 * RATE);
  const energy = (from) => {
    let total = 0;
    for (let i = from; i < from + edge; i++) total += pcm.readFloatLE(i * 4) ** 2;
    return Math.sqrt(total / edge);
  };
  const startRatio = energy(0) / energy(edge);
  const endRatio = energy(n - edge) / energy(n - 2 * edge);
  check("the first 150 ms retain at least 60% of adjacent RMS without a restart fade", startRatio >= 0.6);
  check("the last 150 ms retain at least 60% of adjacent RMS without a restart fade", endRatio >= 0.6);
  const a = path.join(temp, "a.mp3"), b = path.join(temp, "b.mp3");
  for (const output of [a, b]) command(process.execPath, [path.join(root, "scripts/make-ambience.mjs"), "--output", output]);
  check("two regenerations with the same encoder are byte-identical", readFileSync(a).equals(readFileSync(b)));
  const rebuilt = decode(a);
  check("regeneration preserves the decoded length", rebuilt.length === pcm.length);
  let delta = 0;
  for (let i = 0; i < n; i++) delta = Math.max(delta, Math.abs(pcm.readFloatLE(i * 4) - rebuilt.readFloatLE(i * 4)));
  // MP3 encoder versions can differ slightly. Compare decoded waveforms as well as exact local repeatability.
  check("the shipped waveform matches the reproducible recipe within 2% full scale", delta < 0.02);
  const credits = readFileSync(path.join(root, "public/audio/CREDITS.md"), "utf8");
  check("the original clip has a CC0 attribution", credits.includes("amb_sea.mp3") && credits.includes("https://creativecommons.org/publicdomain/zero/1.0/"));
  console.log(`ambience-loop-prove: ${passed} checks passed ${JSON.stringify({ seconds: n / 44100, peak, rms, seamMax: seam, recipeDeltaMax: delta, startRatio, endRatio, bytes: readFileSync(shipped).length })}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
