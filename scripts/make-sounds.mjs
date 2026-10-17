// #609, #616: synthesises the table clips Kenney's set lacks into public/audio/ (docs/design/sound.md "The generator").
// Plain sine and filtered noise, a fixed noise seed: the same bytes every run, no sample taken from anywhere, no licence
// to carry. Mono, 16-bit, 22.05 kHz, each peak-normalised to the Kenney clips' level (about 29000 of 32767).
// Run: node scripts/make-sounds.mjs
import { writeFileSync } from "node:fs";

const RATE = 22050;
const PEAK = 29000;
const OUT = new URL("../public/audio/", import.meta.url);

let seed = 609;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};

// One clip is a sum of voices; a voice is a function of time in seconds, already enveloped.
const env = (t, at, decay) => (t < at ? 0 : Math.exp(-(t - at) / decay) * Math.min(1, (t - at) / 0.002));
const tone = (hz, at, decay, gain = 1) => (t) => gain * Math.sin(2 * Math.PI * hz * Math.max(0, t - at)) * env(t, at, decay);
// A one-pole low-passed noise burst: `k` near 0 is dark, near 1 is bright.
const hiss = (at, decay, k, gain = 1) => {
  let y = 0;
  return (t) => {
    y += k * (noise() - y);
    return gain * y * env(t, at, decay);
  };
};
// A tone whose pitch slides from `from` to `to` Hz with a time constant of `glide` seconds (a drop's bloop rises).
const slide = (from, to, glide, at, decay, gain = 1) => {
  let phase = 0, last = 0;
  return (t) => {
    const hz = to + (from - to) * Math.exp(-Math.max(0, t - at) / glide);
    phase += 2 * Math.PI * hz * (t - last);
    last = t;
    return gain * Math.sin(phase) * env(t, at, decay);
  };
};

const CLIPS = {
  // Low thud, then a short rustle.
  wayfarer_move: { ms: 340, voices: [tone(95, 0, 0.05, 1), tone(60, 0, 0.07, 0.8), hiss(0.09, 0.05, 0.35, 0.9)] },
  // Light double tap.
  trade_offer: { ms: 260, voices: [tone(880, 0, 0.018, 1), tone(1320, 0, 0.012, 0.4), tone(1175, 0.11, 0.02, 1), tone(1760, 0.11, 0.012, 0.4)] },
  // Tiny soft pop, then the same a little higher.
  chat_send: { ms: 140, voices: [tone(520, 0, 0.022, 1), tone(1040, 0, 0.012, 0.3)] },
  chat_recv: { ms: 140, voices: [tone(700, 0, 0.022, 1), tone(1400, 0, 0.012, 0.3)] },
  // #616: a soft water plop for a tap on the sea, a rising bloop over a short dark splash.
  plop: { ms: 150, voices: [slide(260, 620, 0.03, 0, 0.045, 1), hiss(0.004, 0.03, 0.12, 0.35)] },
  // #660: dry wood-block knocks 70 ms apart for the acting seat's turn start.
  your_turn: { ms: 150, voices: [tone(640, 0, 0.04, 1), hiss(0, 0.005, 0.15, 0.5), tone(480, 0.07, 0.04, 1), hiss(0.07, 0.005, 0.15, 0.5)] },
};

for (const [name, { ms, voices }] of Object.entries(CLIPS)) {
  seed = 609;
  const n = Math.round((RATE * ms) / 1000);
  const x = Float64Array.from({ length: n }, (_, i) => voices.reduce((s, v) => s + v(i / RATE), 0));
  // Fade the last 10 ms so no clip ends on a click.
  const tail = Math.round(RATE * 0.01);
  for (let i = 0; i < tail; i++) x[n - 1 - i] *= i / tail;
  const top = Math.max(...x.map(Math.abs));
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write("RIFF", 0);
  pcm.writeUInt32LE(36 + n * 2, 4);
  pcm.write("WAVEfmt ", 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(RATE, 24);
  pcm.writeUInt32LE(RATE * 2, 28);
  pcm.writeUInt16LE(2, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write("data", 36);
  pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round((x[i] / top) * PEAK), 44 + i * 2);
  writeFileSync(new URL(`${name}.wav`, OUT), pcm);
  const rms = Math.sqrt(x.reduce((s, v) => s + ((v / top) * PEAK) ** 2, 0) / n);
  console.log(`${name}.wav ${pcm.length} bytes, ${ms} ms, rms ${Math.round(rms)}`);
}
