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
   attenuation colour `#38c7bf` reached over 0.5 units (red goes first, so warm sand turns aqua);
3. blends toward the water's own colour with depth (weight `1 - exp(-d / 0.55)`): shallow linear (0, 2, 1.95), deep linear
   (0, 0.29, 0.28), pre-tonemap values tuned by read-back so the drawn shallows land near `#a8e6df` and the deep near `#2aa7a3`;
4. adds a Fresnel sky (0.02 + 0.55 F) and a sun glint, then the breaker foam and whitecaps.

Read back at 1280x720 in play with the waves at rest: deep [31,163,159] against the reference's [42,167,163], shallows
[163,224,217] against [168,230,223]. A passing breaker deepens the shallow band by up to half and shifts it toward sand. A submerged visitor or prop is absorbed by its own depth; a surfaced one is drawn as is.

### Paper

The studio paper is `#f1efe9` on screen: the clear colour, the fog and the fade use linear (1.794, 1.598, 1.154), which the
composer's ACES at exposure 1.05 turns back into `#f1efe9`. The page behind the canvas (`--color-studio`) is the same paper.
In play (overhead) the sea fills the canvas: the fade to paper starts 1.5x past the farthest visible point (at most 40-47
units, inside the meshes). In the free view it runs 11-22 units out, so the far horizon reaches the paper.

## Waves

Shader-driven, no simulation. Three Gerstner waves plus the old ripple, with normals from the same functions:

| Wave | Travels | Wavelength | Amplitude | Period | Steepness |
|---|---|---|---|---|---|
| Swell | from the north-east (screen top-right at home) | 7 | 0.06 | 6 s | 0.6 |
| Chop 1 | swell +35° | 2.2 | 0.015 | 3.4 s | 0.4 |
| Chop 2 | swell -50° | 1.3 | 0.008 | 2.6 s | 0.3 |

Shoaling: over the last 2 units the swell hands over to a breaker that runs straight at the beach (refraction), 1.6x as tall
(0.096) and 0.6x as long (4.2), steepness 0.8. Its phase varies along the coast, so the coast does not break all at once.
Every wave tapers to nothing at the beach's edge (no water over the sand) and the chop fades out 12-20 units off the coast.
Breaking foam is fine-grained (two noise scales, 18 and 41 per unit) on the crest in the last unit, trailing behind it and
gone within 1 s; open-water whitecaps are small flecks where both chops crest inside sparse, slowly drifting patches.

The boats and the surfaced visitors ride the same field: `makeSwell` is the CPU twin of the shader's height and slope, so a
boat lifts with the water and pitches and rolls with the slope under it.

Reduced motion: the waves, the breakers, the swash and the ripple go flat (`uMotion` 0); the lace stays. A hidden page
draws nothing. The sea's motion is not "something moving" for the idle rule: still at 12 fps (#331).

Cost: the displacement is the crystal sea's vertex work. On SwiftShader (software GL, a loaded 4-core runner) it measured
2.7 ms a frame for the 13 k vertices (3.0 ms drawn alone to a 1x1 target, 0.2 ms for a 1-triangle stand-in); a phone or
desktop GPU does it in a small fraction of a millisecond. The refraction's under pass draws the scene a second time (the
transmission pass it replaces did the same).

## Two paths

- **Crystal**, the default everywhere, phones included (every player is on an iPhone 15 Pro Max or newer). Pixel ratio up to 2.
- **Simple**: the opaque caustic shader from jelly-ocean.md, with its gentle motion, over the same floor; boats bob as before.
  Pixel ratio 1.5 on a touch screen, 2 otherwise.

Simple is used when the GPU cannot render to a half-float target (the under pass needs one: WebGL 2 with
`EXT_color_buffer_float` or `EXT_color_buffer_half_float`), when the one-time probe finds the GPU slow, or when the player
chose it. The probe runs once per page on the crystal sea: after the island has been drawn five times (shader compiles and
uploads done), it times up to ten frames, each forced to finish with a 1-pixel read; over 22 ms a frame on average, the sea
turns simple for the rest of the page. It stops early once the frames so far pass the ten-frame budget (220 ms), so a slow
GPU stalls for one frame, not ten. On SwiftShader it measures about 400-1000 ms on the first frame and picks simple.

The table menu's **Water: Crystal / Simple** row saves the choice (`localStorage` `emberisle-water`), which then overrides
the probe; switching swaps the sea in place, without a reload or a game change. `window.__emberisle.water` reports
`{ path: "crystal" | "simple", source: "probe" | "saved", ms }` (ms is the probe's average, null if it did not run).

## Proofs

`board-look-prove` (crystal at 1280x720 in play: deep and shallow within 20/255 of the reference, the zoomed-out corner
still sea, the free view's far horizon the paper), `jelly-ocean-prove` (crystal on, floor props under 2 k triangles, reduced motion lays the waves flat, plus the
visitor checks), `table-menu-prove` (the Water row flips the path both ways and the choice survives a reload) and
`dpr-prove` (1.5 only for the simple sea on a phone). Proofs that do not read the water pin a path or let the probe pick.

## Later in the epic

PR B onward (#597): the tilted diorama camera by default, the light and post pass, and the props (lighthouse, gulls, docks).
