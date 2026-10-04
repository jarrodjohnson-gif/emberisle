# Camera and light (issue #135)

The island reads like a lit Catan board on a table, seen by someone leaning over it
([polish.md](polish.md) "The board look target"). This note records what shipped in `src/lib/scene/` and
what is still open. Proof: `npm run board-look-prove`.

## Light

One warm key lamp carries the light; everything else is low, near-grey bounce. Before, a 1.35 sun, a 1.15
hemisphere and a 0.62 ambient at exposure 1.28 lit every face the same and washed the caps out.

| Light | Colour | Intensity | Notes |
|---|---|---|---|
| Key (`DirectionalLight`) | `#ffe3bd` | 2.1 | From (8, 16, 6). The only shadow caster. |
| Hemisphere | sky `#e9e4da`, ground `#c8ad86` | 0.55 | Near grey, so the caps' own paint is the colour on screen. |
| Fill (`DirectionalLight`) | `#d9e4ea` | 0.3 | From (-8, 8, -4), lifts the sides the key misses. |
| Ambient | — | — | Removed. |

Shadows: `PCFShadowMap`, map 1024 over an 18-unit box, `radius` 6 (three 0.186 dropped `PCFSoftShadowMap`;
the PCF blur is the softness). Tone mapping stays ACES, exposure 1.05.

The proof asserts the claims, not the constants: one shadow caster, no ambient, key at least 3x the bounce,
key linear r/b at least 1.5, sky spread at most 0.1 and ground at most 0.3 in sRGB, map at most 1024 with a
blur of at least 4, exposure at most 1.1.

## Sea

Unlit shader as before (no hotspot). Shallow `#4596a0` to deep `#225a68` from 4.2 to 7.5 units, then the
fog. The ripple now scales the colour (`c *= 1.0 + 0.03 * ...`) instead of adding to it: the added 0.022 was
a third of the deep colour's linear value and painted dark blotches over the whole sea. Measured on a patch
of open water in the drawn frame: luminance p95 - p5 went from 0.148 to 0.01.

## Camera

Two modes on one scene (#128), unchanged in kind:

- **Title and lobby**: the free `PerspectiveCamera` (32°) on OrbitControls, auto-rotating, SSAO off.
- **Play**: the overhead `OrthographicCamera`, fitted by `fitOrtho` to the hole the HUD leaves, on every pointer
  (before, only a coarse pointer got it; a desktop kept the tilted camera and the bottom row sat under the HUD). SSAO
  off. Picking and the highlights are the same meshes.

### The hole

The fit reads the HUD's real footprint, not a table of constants (the #455 HUD is taller than the 168 px the table said,
and the far row sat under it). `IsleRenderer.insets()` walks the canvas's shell: down each branch, the first element that
takes pointer events is chrome (a `pointer-events: none` wrapper is looked into, not counted), and `chromeInsets` in
`mobile-fit.ts` turns those rects into insets: chips at least half the canvas wide are bands that stack from the top or
bottom edge, each within 16 px of the edge or of the band before it (the header, the seat strip under it, the phase bar,
an armed-build banner); narrower chips that touch a side the same way are a rail when together they span a quarter of the
canvas (the seat cards, an open chat), so a lone chat button is not one. Floating chips and overlays that cover nearly
everything (a sheet, a backdrop) count for nothing. The island keeps 12 px from the chrome, or 12 px plus the safe area
from a bare edge. A `ResizeObserver` on the shell's children and a `MutationObserver` on the shell refit when the HUD
changes; a changed hole glides the frustum and the look-at point over 280 ms and leaves the eye where the player put it.
`hudInsets` (the old table) now serves only the free camera's dolly limit on the title, where there is no HUD.

Measured at 1280x720 in the first placement: 70 / 12 / 245 / 248 (top / right / bottom / left), a hole of 1020x405 at
36.4 px per world unit, a token 24.8 px across, the nearest dock 54 px inside; at 390x844 (touch): 124 / 12 / 305 / 12,
366x415, 30.5 px per unit, a token 20.7 px, the dock 35 px inside. The phone hole is width-bound (#422).

### The eye

The overhead camera leans **25°** off straight down toward the player (`OVERHEAD_LEAN`), looking at cap level
(`CAP_LEVEL` 0.35) over the hole's centre, 18 units out. The lean shortens the island's screen depth by cos(25°) and lifts
the far row's tree tops by up to 1.15 units times sin(25°); `fitOrtho` keeps that room, and the shift that puts the
island's centre on the hole's centre is the screen shift over cos(25°), since it runs along the ground. Straight down, the
trees were green blobs and the slabs had no side; leaned, the board has depth and a token still reads as a disc.

That fitted view is **home**, and the default on every entry to the table (Jarrod, 2026-10-04: the 25° lean and the
framing are right; orbit and zoom stay, with a quick way back, and "it shouldn't really be much of an option": no
setting, no chrome). The overhead camera sits on its own OrbitControls, orbiting the look-at point:

| Gesture | Does |
|---|---|
| Drag (mouse or one finger) | Orbits: polar 7°-66°, any azimuth. No damping, so the board stops where the pointer stops. No pan. |
| Wheel, pinch | Zooms the frustum 0.8x-2.4x. |
| Home key (outside a text field), double click or double tap on empty board | Glides home: the fit, the 25° lean, zoom 1, over 280 ms with the ease-out curve; instant under `prefers-reduced-motion`. |

"Empty board" is two taps within 350 ms and 32 px where neither hit a legal mark, so a double tap that places (or selects
then confirms) never moves the camera. A drag never places: a pointer that moves past the tap slop (8 px mouse, 24 px
touch) is a drag, and a pinch swallows its lifts (`TouchGesture`). The keyboard route (the PlaceList, #376) is untouched.
A drag that starts mid-glide takes the eye; the fit keeps gliding.

Proof: `npm run board-look-prove` (the measured hole, every corner on the canvas, the default view, a drag orbits and
places nothing, a wheel zooms, Home and a double click or tap return home, reduced motion snaps) and
`npm run touch-place-prove` (the leaned fit and the `chromeInsets` rules, no browser).

## Open

- **Budget and frame time**: draw calls in the overhead play view are about 480 a frame (docs/research/mobile-frame-time.md);
  a real-GPU frame time from Jarrod's PC and a budget line are #464.
- **The phone hole**: the landscape hole and its island size are #422. The fit now follows the HUD, so growing the hole
  is HUD work.
- **A free perspective view in play** (#463) is no longer needed for orbiting; it is open only if a low, perspective
  look is wanted on top of the orthographic orbit.
