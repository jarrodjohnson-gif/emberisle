# Crystal water (jelly diorama epic #597, PR A)

The open ocean from [jelly-ocean.md](jelly-ocean.md) stays continuous: no square block, no strata. What changes is the water
itself: you see into it. Code: `src/lib/scene/crystal-water.ts`, wired in `isle-renderer.ts`.

## What is drawn

| Mesh | What it is |
|---|---|
| Crystal sea | `MeshPhysicalMaterial`, transmission 0.92, ior 1.33, roughness 0.06, colour `#7fd8cf` (the 8 % that is not transmitted), attenuation colour `#2fb8b0` over 3.2 units, specular 0.5. Thickness is 1.1 per unit of water depth (a vertex attribute), so 0.1-0.3 of water over the shallow band is nearly clear and the 0.9 deep water reads teal. Rings that follow the coast (8 points per coast edge, 0.12 apart across the breaking band), about 13 k vertices, 26 k triangles. |
| Sea floor | 0.9 below the surface from 4 units out, rising through a shallow band (0.1 deep at the beach's edge, 0.26 at 0.9 out). Vertex colours: sand `#dcc9a0` at the waterline, pale cool sand `#e6ead8` by 1.0 out (warm sand under teal water reads olive), teal sand `#b8d8e0` by 2.6. The caustic cells drift over it as emission, fading out by 14 units. Receives the key light's shadows. |
| Floor props | Nine weed tufts, ten stones, two starfish and one anchor, 0.9-5.5 units off the coast, one merged static mesh, 680 triangles (budget 2 k). |
| Swash | A strip over the beach (0-0.42 off the coast): after each breaker, foam runs up the sand and slides back over 2.4 s, fading by 1.8 s, broken up by noise. |
| Foam lace | Unchanged (#130). |

The sea, the floor and the simple sea all fade to the studio paper from 10 to 22 units out. The paper is `#f1efe9` on
screen: the clear colour, the fog and the fade use linear (1.794, 1.598, 1.154), which the composer's ACES at exposure 1.05
turns back into `#f1efe9`. The page behind the canvas (`--color-studio`) is the same paper, so the teal is only the water.

## Waves

Shader-driven, no simulation. Three Gerstner waves plus the old ripple, with normals from the same functions:

| Wave | Travels | Wavelength | Amplitude | Period | Steepness |
|---|---|---|---|---|---|
| Swell | from the north-east (screen top-right at home) | 7 | 0.045 | 6 s | 0.6 |
| Chop 1 | swell +35° | 2.2 | 0.015 | 3.4 s | 0.4 |
| Chop 2 | swell -50° | 1.3 | 0.008 | 2.6 s | 0.3 |

Shoaling: over the last 2 units the swell hands over to a breaker that runs straight at the beach (refraction), 1.6x as tall
(0.072) and 0.6x as long (4.2), steepness 0.8. Its phase varies along the coast, so the coast does not break all at once.
Every wave tapers to nothing at the beach's edge (no water over the sand) and the chop fades out 12-20 units off the coast.
Breaking foam is lace on the crest in the last 1.4 units, trailing behind it and fading over 1.5 s; open-water whitecaps
appear only where both chops crest inside sparse, slowly drifting patches.

The boats and the surfaced visitors ride the same field: `makeSwell` is the CPU twin of the shader's height and slope, so a
boat lifts with the water and pitches and rolls with the slope under it.

Reduced motion: the waves, the breakers, the swash and the ripple go flat (`uMotion` 0); the lace stays. A hidden page
draws nothing. The sea's motion is not "something moving" for the idle rule: still at 12 fps (#331).

Cost: the displacement is the crystal sea's vertex work. On SwiftShader (software GL, a loaded 4-core runner) it measured
4.4 ms a frame for the 13 k vertices (5.1 ms drawn alone to a 1x1 target, 0.6 ms for a 1-triangle stand-in); a phone or
desktop GPU does it in a small fraction of a millisecond.

## Two paths

- **Crystal**, the default everywhere, phones included (every player is on an iPhone 15 Pro Max or newer). Pixel ratio up to 2.
- **Simple**: the opaque caustic shader from jelly-ocean.md, with its gentle motion, over the same floor; boats bob as before.
  Pixel ratio 1.5 on a touch screen, 2 otherwise.

Simple is used when the GPU cannot render to a half-float target (transmission needs one: WebGL 2 with
`EXT_color_buffer_float` or `EXT_color_buffer_half_float`), when the one-time probe finds the GPU slow, or when the player
chose it. The probe runs once per page on the crystal sea: after the island has been drawn five times (shader compiles and
uploads done), it times up to ten frames, each forced to finish with a 1-pixel read; over 22 ms a frame on average, the sea
turns simple for the rest of the page. It stops early once the frames so far pass the ten-frame budget (220 ms), so a slow
GPU stalls for one frame, not ten. On SwiftShader it measures about 400-1000 ms on the first frame and picks simple.

The table menu's **Water: Crystal / Simple** row saves the choice (`localStorage` `emberisle-water`), which then overrides
the probe; switching swaps the sea in place, without a reload or a game change. `window.__emberisle.water` reports
`{ path: "crystal" | "simple", source: "probe" | "saved", ms }` (ms is the probe's average, null if it did not run).

## Proofs

`board-look-prove` (crystal at 1280x720 in play: deep water teal, the shallow band lighter, the zoomed-out corner the
paper), `jelly-ocean-prove` (crystal on, floor props under 2 k triangles, reduced motion lays the waves flat, plus the
visitor checks), `table-menu-prove` (the Water row flips the path both ways and the choice survives a reload) and
`dpr-prove` (1.5 only for the simple sea on a phone). Proofs that do not read the water pin a path or let the probe pick.

## Later in the epic

PR B onward (#597): the tilted diorama camera by default, the light and post pass, and the props (lighthouse, gulls, docks).
