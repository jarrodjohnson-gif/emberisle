// #1014 / #662 candidate 3: original procedural sea-and-wind noise, released under CC0 1.0.
// No recording or third-party sample. Regenerate: node scripts/make-ambience.mjs [--output file.mp3].
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

export const RATE = 44100;
export const SECONDS = 20;
export const CROSSFADE_SECONDS = 2;
export const SWELL_HZ = 0.1;

export function makePcm() {
  const n = RATE * SECONDS;
  const fade = RATE * CROSSFADE_SECONDS;
  const source = new Float64Array(n + fade);
  let seed = 662;
  let brown = 0;
  let low = 0;
  let mean = 0;
  const pole = 1 - Math.exp(-2 * Math.PI * 800 / RATE);
  for (let i = 0; i < source.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    brown = 0.997 * brown + 0.02 * (seed / 2147483648 - 1);
    low += pole * (brown - low);
    source[i] = low;
    mean += low / source.length;
  }
  const samples = new Float64Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let value = source[i + fade] - mean;
    if (i >= n - fade) {
      const at = i - (n - fade);
      const blend = 0.5 - 0.5 * Math.cos(Math.PI * at / (fade - 1));
      value = value * (1 - blend) + (source[at] - mean) * blend;
    }
    value *= 0.65 + 0.35 * Math.cos(2 * Math.PI * SWELL_HZ * i / RATE);
    // A 150 ms cosine landing at zero protects the lossy decoder's first/last 10 ms.
    // The full two-second tail crossfade above joins adjacent points of the source stream.
    const edge = Math.min(i, n - 1 - i) / (0.15 * RATE);
    if (edge < 1) value *= 0.5 - 0.5 * Math.cos(Math.PI * edge);
    samples[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  const wave = Buffer.alloc(44 + n * 2);
  wave.write("RIFF", 0);
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(RATE, 24);
  wave.writeUInt32LE(RATE * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) wave.writeInt16LE(Math.round(samples[i] / peak * 0.4 * 32767), 44 + i * 2);
  return wave;
}

export function encode(output) {
  mkdirSync(path.dirname(output), { recursive: true });
  const wave = makePcm();
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-map_metadata", "-1", "-fflags", "+bitexact", "-c:a", "libmp3lame", "-b:a", "96k", "-flags:a", "+bitexact", "-id3v2_version", "0", "-write_id3v1", "0", "-write_xing", "1", "-y", output], { input: wave, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`ffmpeg failed: ${result.error?.message ?? result.stderr}`);
  console.log(JSON.stringify({ output, bytes: statSync(output).size, seconds: SECONDS, rate: RATE, crossfadeSeconds: CROSSFADE_SECONDS, swellHz: SWELL_HZ, pcmSha256: createHash("sha256").update(wave).digest("hex") }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = process.argv.indexOf("--output");
  encode(flag < 0 ? fileURLToPath(new URL("../public/audio/amb_sea.mp3", import.meta.url)) : path.resolve(process.argv[flag + 1]));
}
