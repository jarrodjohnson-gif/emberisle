# Table sounds

Every sound at the table is one `play(name)` in `src/lib/sound.ts`. Nothing plays before the first pointer or key gesture
(browsers refuse autoplay), and a muted browser plays nothing. `server/cue.mjs` maps the same names for the host.

## The generator

`node scripts/make-sounds.mjs` writes the clips Kenney's set lacks to `public/audio/`. They are synthesised from sine tones and
low-passed noise with a fixed noise seed (the same bytes every run), so there is no sample and no licence to carry: they are
ours, CC0 like the rest of the folder. Mono, 16-bit, 22.05 kHz, peak-normalised to 29000, which is where the Kenney clips sit.

| File | Sound | Played on | Length | Bytes |
|---|---|---|---|---|
| `plop.wav` | a soft water plop: a bloop rising 260 to 620 Hz over a short dark splash | a tap on open water (not a drag's trail), #616 | 150 ms | 6660 |
