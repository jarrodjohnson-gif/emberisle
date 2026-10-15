# Crystal water (jelly diorama epic #597, PR A)

The open ocean from [jelly-ocean.md](jelly-ocean.md) stays continuous: no square block, no strata. What changes is the water
itself: you see into it. Code: `src/lib/scene/crystal-water.ts`, wired in `isle-renderer.ts`.

## What is drawn

| Mesh | What it is |
|---|---|
| Crystal sea | A `ShaderMaterial` over a refraction of the scene beneath it (below). Rings that follow the coast (8 points per coast edge, 0.12 apart across the breaking band), about 13 k vertices, 26 k triangles. |
| Sea floor | 0.9 below the surface from 4 units out, rising through a shallow band (0.1 deep at the beach's edge, 0.26 at 0.9 out). Vertex colours: warm sand `#e2d3a8` to 1 unit out, teal sand `#b8d8e0` by 2.6. Soft caustic light (two drifting scales of wide-edged cells, at most 25 % contrast, gone by 14 units) on the floor only. Receives the key light's shadows. |
| Floor props | Nine weed tufts, ten stones, two starfish (0.6-1.3 off the coast, under shallow water) and one anchor, one merged static mesh, 680 triangles (budget 2 k). |
| Edge strip | Over the beach and the first 0.42 units of water: a thin, broken lace line at the waterline (it stays under reduced motion) and the swash, foam that runs up the sand after each breaker and slides back. The old foam strip shows only with the simple sea. |

### Refraction: why a custom shader, not transmission

The first cut used `MeshPhysicalMaterial` transmission. It rendered, but its look is set by one thickness and one attenuation,
so the sea read grass-green and nearly opaque and the floor props did not show. The shipped path renders the scene without the
sea (and its edge strip) into a half-float target with a depth texture each crystal frame (`drawUnder` in `isle-renderer.ts`;
the key light's shadow map is drawn once for both passes). The surface shader then:

1. samples that colour through the surface normal (offset 0.04 x the path, never picking up anything in front of the water);
2. takes the real path length through the water from the depth buffer and absorbs the floor by it, per channel, from the
   pale attenuation colour `#6fd6cf` reached over 2 units, then multiplies it by a cool in-scatter tint (0.6, 2.1, 3.0),
   ramped in over the first 0.3 units: a multiplier, so the floor keeps its contrast while warm sand reads near-white aqua;
3. blends toward the water's own colour only slowly with depth (weight `1 - exp(-d / 1.8)`): shallow linear (0.7, 3.4, 3.2),
   deep linear (0.04, 0.5, 0.5), pre-tonemap values tuned by read-back;
4. adds a Fresnel sky (0.02 + 0.55 F) so far water picks up the pale sky, a fine sun glint (power 900) and sparse sparkle
   flecks on the crests that face the sun, then the breaker foam.

Read back at 1280x720 in play with the waves at rest: shallows about [193-200,227-228,217-218] against the near-white aqua
`#cdf1ec` [205,241,236]; deep about [135,210,211], a light blue-green, lighter than the `#4ab9b5` ceiling. A passing breaker
deepens the shallow band by up to half. Through the first few units the sand and the props show; a prop's own colour is
cooled by the tint (an orange starfish reads grey-beige), its shape and edges stay sharp. A submerged visitor or prop is absorbed by its own depth; a surfaced one is drawn as is.

### Paper

The studio paper is `#f1efe9` on screen: the clear colour, the fog and the fade use linear (1.794, 1.598, 1.154), which the
composer's ACES at exposure 1.05 turns back into `#f1efe9`. The page behind the canvas (`--color-studio`) is the same paper.
In play (overhead) the sea fills the canvas: the fade to paper starts 1.5x past the farthest visible point (at most 40-47
units, inside the meshes). In the free view it runs 11-22 units out, so the far horizon reaches the paper.

## Waves

Shader-driven, no simulation; the reasoning and the references are in [docs/research/waves.md](../research/waves.md). Four
Gerstner waves plus a faint ripple, with normals from the same functions. Periods follow T = sqrt(5.15 L) (g = 1.22 units/s²):

| Wave | Travels | Wavelength | Amplitude | Period | Steepness |
|---|---|---|---|---|---|
| Swell A | from the north-east (screen top-right at home) | 6.6 | 0.050 | 5.8 s | 0.35 |
| Swell B | swell A +12° | 8.2 | 0.040 | 6.5 s | 0.30 |
| Chop 1 | swell A -40° | 3.0 | 0.006 | 3.9 s | 0.25 |
| Chop 2 | swell A +70° | 4.2 | 0.008 | 4.65 s | 0.20 |

- **Sets.** A and B beat every 1 / (1/5.8 - 1/6.5) = 54 s: their group stands 0.09 at a set and 0.01 in a lull. B is 0.040,
  not the research's 0.030: at 0.030 the crests still arrive like a metronome (interval CV 0.06), at 0.040 they vary (0.21).
- **Chop** carries a third of the swells' slope, comes in drifting patches about 15 units across (two crossed sines, so the
  CPU twin matches the GPU), fades in from 0.5 to 2.5 units off the coast and out 12-20 units off it. No open-water whitecaps.
- **Ripple and sparkle**: the normal ripple is 0.8 / 0.6 per unit at half its old slope; the sun sparkle noise is 25 per unit.

### The break

One crest runs from the open sea to the beach. Each surface vertex carries its depth (`aDepth`) and the time a crest takes from
there to the coast (`aTravel`), integrated once on the CPU from the floor profile with the finite-depth celerity
c(d) = c0 sqrt(tanh(k d) / tanh(0.9 k)) (k of swell A, c0 = 6.6 / 5.8). Between 4.5 and 2.5 units out each swell's phase
hands over from the open sea's to the open sea's phase at an anchor 4.5 out, delayed by the travel time from there: the phase
is continuous, so the crest never jumps, and it slows from about 1.0 units/s 2 units out to 0.5 at 0.4 out. The anchor is
straight out from the island's centre, not along the coast's normal, because the hex coast's zigzag would kink the crest;
arrival order round the island follows from the swell's direction.

| Shoaling constant (`SHOAL`) | Value |
|---|---|
| Phase hand-over | 4.5 to 2.5 units out |
| Height | Green's law, (0.9 / d)^0.25 (d at least 0.08) |
| Breaking | smoothstep(0.7, 0.95) of the group's height over the depth (0.78 is the classic limit), at the drawn height |
| After breaking | the height holds 0.9 x the depth |
| Breaking steepness | q rises to 0.85 / (k a), at most 1.5, so q k a stays under 1 and the surface never loops |

A set breaks about 1.0 unit out, a median wave about 0.8, and the smallest fifth never break. The research's 3.5 cap on the
breaking q left the crest's vertices swinging 0.4 units and streaking the foam; 1.5 keeps the crest sharp.

**Foam** lives only where the wave is breaking. Behind each crest: a solid lip for 0.35 s, then lace from two noises (2.2 and 7
per unit, features 0.45 and 0.14 units) whose threshold rises 0.05 + 0.17 per second until it is gone at 2.2 s. The noise is
carried shoreward 0.5 units per second of the foam's age and slides sideways with the clock, so each wave's lace is new.

**Swash**: as each wave reaches the waterline the foam runs up the sand in 0.9 s and draws back over 2.1 s, as far as that
wave is big: a lull laps, a set rushes. The thin waterline lace stays as before.

The boats and the surfaced visitors ride the same field: `makeSwell` is the CPU twin of the shader's height and slope, line
for line from the same table (`WAVES`, `SHOAL`, `GUST`, the travel-time table), so a boat lifts with the water and pitches and
rolls with the slope under it. It also reports `brk` and `group` for the proof.

Reduced motion: the waves, the breakers, the swash and the ripple go flat (`uMotion` 0); the lace stays. A hidden page
draws nothing. The sea's motion is not "something moving" for the idle rule: still at 12 fps (#331).

Cost: the displacement is the crystal sea's vertex work. On SwiftShader (software GL, a loaded 4-core runner) the old three-wave
sea measured 2.7 ms a frame for the 13 k vertices (3.0 ms drawn alone to a 1x1 target, 0.2 ms for a 1-triangle stand-in). The
break adds a tanh, a pow, two phase hand-overs and an atan per vertex: drawn alone to a 1x1 target on a slower cloud machine
it went from 4.4 ms (main) to 4.7-5.9 ms (median about 5.4), about +20 %. A phone or desktop GPU does it in a small fraction of
a millisecond. The two new attributes are 104 KB. The refraction's under pass draws the scene a second time (the transmission
pass it replaces did the same).

## Touch the sea

The island answers a finger (#616): on `pointerdown`, not the release, so it starts in the next frame. Code: `SPLASH`,
`SPLASH_GLSL` and `makeSplashes` in `crystal-water.ts`, the scatter in `ocean-life.ts`, `wobble.ts`, and `poke` / `stir` /
`splashAt` / `wobbleHex` in `isle-renderer.ts`.

- **What a press does.** The renderer runs the same pick as a tap. A corner or a path under the finger (in build mode, inside
  its pick reach) takes the press for the game: no splash, no wobble. A tile wobbles. Anything else that lands on open water
  (off the island, at least 0.15 past the coast, so not the beach) splashes there at strength 1 and plays `plop`
  ([sound.md](sound.md)). A drag that started on the water stirs a trail: a splash of strength 0.45 every 0.35 units and
  80 ms at most, silent and without droplets.
- **A splash** is a crater 0.07 deep and 0.22 across (Gaussian) that rebounds on a 0.42 s period, decaying by e every 0.32 s
  (it lifts about 0.035 above the swell before settling); then three rings leaving 0.1 out at 1.1 units/s, 0.16 s apart, heights
  0.022 x 1, 0.7, 0.4, half-width 0.08, dying by e every 0.75 s: the crest is 0.43, 0.76 and 1.09 out after 0.3, 0.6 and
  0.9 s. A foam patch 0.3 across fades over 0.9 s; six droplets fly on the GPU for up to 0.7 s (a tap only). All of it fades
  out over the last 40 % of its 1.8 s life. The rings add to the swell: the vertices carry the height (times the beach taper),
  the pixels its slope and the crests' white, so a ring reads on the coarse outer rings of the mesh too.
- **The CPU twin.** `makeSplashes().field` is `splashField` line for line, and `makeSwell` adds it, so a boat lifts and rolls
  as a ring passes.
- **Budget.** One `vec4[8]` uniform (x, z, start, strength) and a live flag; no render target. At most 8 live: a new splash
  takes a dead slot, else the oldest. The loop holds full frame rate for a splash's life.
- **Fish.** Two schools of five small fish (one instanced draw) circle 0.28 across about 5.75 from the middle, under the
  shallows. A splash within 1.5 sends each fish, and a visitor, darting away (0.45-0.9 units, further the closer it was) over
  0.25 s; it holds there to 1.5 s and is back on its round by 4 s. A dart never points toward the island; a visitor also dips
  0.15.
- **The tile.** A tap on a hex scales the tile, its token and its props about the tile's base, 1.0 to 1.03 and back over
  220 ms (a half sine on an eased-out clock, peak at 64 ms). Never on a corner or path pick, never under reduced motion, never
  while a piece is landing (a bot's placement included).
- **Reduced motion:** no crater, rings, droplets, scatter or wobble; the foam patch alone shows and fades by 0.9 s.
- **Simple sea:** the rings alone, as lighter lines in its fragment shader; no crater, foam, droplets or boat bob (its boats
  keep their own bob). Under reduced motion it draws nothing.
- **Cost** (the crystal sea alone on SwiftShader on a loaded 4-core machine, median of 20 frames; main / this, nothing live /
  this, 8 live in view): vertex work to a 1x1 target 2.7-2.9 / 2.9-3.6 / 5.0-7.4 ms; a 1280x720 frame 38-40 / 47-50 / 95 ms.
  With nothing live the field returns at once on the live flag; the rest is the bigger shader. Eight live splashes are a
  burst of at most 1.8 s; a phone or desktop GPU runs the 8-slot loop in a small fraction of a millisecond.
- **Proof:** `splash-prove` (README).

## Two paths

- **Crystal**, the default everywhere, phones included (every player is on an iPhone 15 Pro Max or newer). Pixel ratio up to 2.
- **Simple**: the opaque caustic shader from jelly-ocean.md, with its gentle motion, over the same floor; boats bob as before.
  Pixel ratio 1.5 on a touch screen, 2 otherwise.

Simple is used when the GPU cannot render to a half-float target (the under pass needs one: WebGL 2 with
`EXT_color_buffer_float` or `EXT_color_buffer_half_float`), when the one-time probe finds the GPU slow, or when the player
chose it. Every page load starts on the simple sea, and nothing of the crystal sea exists until the first switch to it: the
surface, the edge strip, the floor and its props, the CPU wave field and the under target are all built then. So a page on
the simple sea draws and builds what it did before the crystal sea, and a software-GL client that is reloading or rejoining a
table pays nothing extra; only a saved Crystal choice or a passed probe switches it, between frames. The probe never runs
during boot, a restore or a rejoin: `IslandCanvas` marks the client settled (the title with nothing dialling, or play once
its first state has landed), and the probe starts a second after that and a second after the last pointer on the canvas.
It runs once per page, each frame forced to finish with a 1-pixel read. First, after five warm frames, up to ten simple
frames: over 11 ms on average (the crystal sea draws the scene twice), the sea stays simple and the
crystal sea is never drawn. Otherwise up to ten crystal frames after three warm ones: over 22 ms, back to simple. Each stage
stops as soon as its frames pass its ten-frame budget, so a slow GPU stalls for one frame. On SwiftShader the first simple
frame already takes a few hundred ms. `ms` reports the last stage's average.

The table menu's **Water: Crystal / Simple** row saves the choice (`localStorage` `emberisle-water`), which then overrides
the probe; switching swaps the sea in place, without a reload or a game change. `window.__emberisle.water` reports
`{ path: "crystal" | "simple", source: "probe" | "saved", ms }` (ms is the probe's average, null if it did not run).

## Proofs

`board-look-prove` (crystal at 1280x720 in play: shallows within 20/255 of `#cdf1ec`, deep no darker than `#4ab9b5`, the
zoomed-out corner still sea, the free view's far horizon the paper), `jelly-ocean-prove` (crystal on, floor props under 2 k triangles, reduced motion lays the waves flat, plus the
visitor checks), `table-menu-prove` (the Water row flips the path both ways and the choice survives a reload) and
`dpr-prove` (1.5 only for the simple sea on a phone). `waves-prove` (the CPU twin: arrival-interval CV 0.15-0.45 at the shore,
sets every 40-60 s, under 5 % of the energy below 3.5 s, open-sea slope at most 0.12, crests slowing to 0.35-0.5x between 2.0
and 0.4 out, bigger waves breaking further out and the smallest fifth not at all; then the foam alone on SwiftShader, 120 s at
4 fps: median life 1.5-2.5 s, p95 at most 3.5 s, nothing under reduced motion). Proofs that do not read the water pin a path or let the probe pick.

## Later in the epic

PR B onward (#597): the tilted diorama camera by default, the light and post pass, and the props (lighthouse, gulls, docks).
