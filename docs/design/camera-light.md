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

Three views on one scene:

- **Title and lobby**: the free `PerspectiveCamera` (32°) on OrbitControls, auto-rotating, SSAO off.
- **Play, diorama** (#597, reversing #128 by the owner's call): a `PerspectiveCamera` 38° above the horizon and 20° off
  the island's north, fitted by `fitDiorama` to the hole the HUD leaves ("The diorama view" below).
- **Play, overhead**: the `OrthographicCamera`, fitted by `fitOrtho` to the same hole, on every pointer.

With no choice saved, play opens in the diorama on a landscape canvas at least 900 CSS px wide (`DIORAMA_MIN_WIDTH`) and
overhead otherwise (`defaultView`), and a canvas that crosses the line (a rotation, a resize) switches with it. Upright, the
island is bound by the phone's width either way and the tilt would only shrink it and crowd its far corners; on a sideways
phone (844x390) the diorama's tokens, held to 38 % of a hex, read at an 11.4 px numeral but 1.6 px pips, under the 2 px
floor (`docs/design/tokens.md` "Angle"). The table menu's **View** row
switches between Diorama and Overhead; a choice is saved in `localStorage` (`emberisle-view`: `"diorama"` | `"overhead"`,
like `emberisle-water`) and wins on every screen. Every entry to the table starts from the view's home. SSAO is off in both
play views. Picking and the highlights are the same meshes.

### The hole

The fit reads the HUD's real footprint, not a table of constants (the #455 HUD is taller than the 168 px the table said,
and the far row sat under it). `IsleRenderer.insets()` walks the canvas's shell: an element that takes pointer events is chrome, unless something inside
it lets taps through (`pointer-events: none`), in which case it counts as the union of the parts that do take them (so the
chat dock is its button, not the 288 px preview list beside it, and a wrapper that lets taps through is only what is inside
it), and `chromeInsets` in
`mobile-fit.ts` turns those rects into insets: chips at least half the canvas wide are bands that stack from the top or
bottom edge, each within 16 px of the edge or of the band before it (the header, the seat strip under it, the phase bar,
an armed-build banner); narrower chips that touch a side the same way are a rail when together they span a quarter of the
canvas (the seat cards, an open chat), so a lone chat button is not one. Floating chips and overlays that cover nearly
everything (a sheet, a backdrop) count for nothing. The island keeps 12 px from the chrome, or 12 px plus the safe area
from a bare edge. The hole is re-measured on the first frame after a view or state change (React has committed the HUD by
then), when the marks change (an armed build swaps the phase bar), when the player opens or closes the chat dock or
the trade sheet (`IslandCanvas` calls `remeasure()`), when focus enters or leaves the chrome (the keyboard PlaceList
shows while focused) and on a window resize, never on HUD housekeeping alone: a timed notice leaving the phase bar,
chat previews or the Place chip appearing do not move the camera, so the board moves with the game and an idle board idles at 12 fps (#331,
`idle-prove`). A changed hole glides the frustum and the look-at point over 280 ms and leaves the eye where the player put
it. `hudInsets` (the old table) now serves only the free camera's dolly limit on the title, where there is no HUD.

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
| Home key, double click or double tap on empty board | Glides home: the fit, the 25° lean, zoom 1, over 280 ms with the ease-out curve; instant under `prefers-reduced-motion`. |

"Empty board" is two taps within 350 ms and 32 px where neither hit a legal mark, so a double tap that places (or selects
then confirms) never moves the camera. Home is left alone in a text field, a dialog, a region that scrolls on its own (the
chat log, the bottom stack), with a modifier held, or when a handler already took it. A drag never places: a pointer that
ever moves past the tap slop (8 px mouse, 24 px touch) is a drag, even one that comes back to the corner it started on, and
a pinch swallows its lifts (`TouchGesture`). The keyboard route (the PlaceList, #376) is untouched.
A drag past the slop mid-glide takes the eye (a tap during the glide does not); the fit keeps gliding.

Proof: `npm run board-look-prove` (the measured hole, every corner on the canvas, the default view, a drag orbits and
places nothing, a wheel zooms, Home and a double click or tap return home, reduced motion snaps) and
`npm run touch-place-prove` (the leaned fit and the `chromeInsets` rules, no browser).

### The diorama view (#597)

The board seen from a chair: the reference's 3/4 tilt, the whole island in the hole, the far water fading into the paper.

| | Value | Where |
|---|---|---|
| Elevation | 38° above the horizon (polar 52°) | `DIORAMA_POLAR` |
| Yaw | 20° off north: the eye sits south-south-east, the island's north is up-screen and a little left | `DIORAMA_AZIMUTH` |
| Look-at | the island's centre at cap level, (0, 0.35, 0); the orbit pivots there | `applyPose` |
| Focal length | 24° across the hole's height: `holeH / 2 / tan(12°)` px | `DIORAMA_FOV` |
| Lens shift | the lens axis meets the canvas off centre (`setViewOffset`), so the island sits in the hole without turning the eye | `fitDiorama` |
| Fog | starts 8 units past the eye's distance to the look-at point, 26 deep; the sea fades to paper 16 to 30 units out | `fadeSea` |

**The fit rule.** `fitDiorama` bisects the eye's distance twice: once until the 30 coast corners (at cap level) span 94 %
of the hole on its limiting axis, once until the coast, every dock's reach (0.7 along the coast miter at the waterline) and the
tallest prop's top wherever one can stand on the outer ring (0.86 from its hex's centre, 1.15 over cap level) just fill
the hole. It takes the farther of the two, then shifts the lens so that whole span is centred in the hole. So the coast
reaches within 6 % of the hole unless that would push a dock or a far pine past its edge, in which case those touch it.
On every landscape hole measured the docks and pines bind: the coast spans 78 % of the hole's height (the far pines rise
about 0.9 world units up-screen over the far coast, the near docks reach 0.43 below the near coast), and the hole's width
is not the limit (a 1280x720 hole is 2.3 times as wide as tall; the island at this tilt about 1.5). It is pure math
in `mobile-fit.ts`; `touch-place-prove` checks it on the measured holes, and `board-look-prove`, `visual-direction-prove`,
`hud-safe-area-prove` and `rotate-prove` against the live HUD.

Measured in the browser on a mid-game board (main phase, Path armed; px per world unit across the screen at the far, middle
and near row of hex centres):

| Viewport | Hole (top / right / bottom / left) | Eye distance | px per unit far / centre / near | Adjacent corners, closest |
|---|---|---|---|---|
| 1280x720 | 68 / 12 / 180 / 216 | 18.8 | 52.0 / 58.9 / 68.0 | 34.4 px |
| 844x390 | 68 / 12 / 12 / 284 | 18.8 | 34.1 / 38.7 / 44.7 | 22.6 px |

At 32° (the first cut) the far side of a sideways phone had corners 20 px apart and a portrait phone 18 px; 38° shows more
of the caps' tops and keeps every landscape hole at 18 px or more, which `board-look-prove` (844x390 with the diorama
chosen) and `touch-place-prove` hold.
The overhead view keeps 24 px; 18 px still puts a tap dead on one corner well outside its neighbour's 14 px touch reach.

**Gestures.** As in the overhead view: drag orbits (polar 7°-66°, any azimuth, no damping, no pan), wheel and pinch zoom
0.8x-2.4x (here the eye's distance, fitted distance over zoom), and Home, a double click or a double tap on empty board
glide home over 280 ms (instant under reduced motion). A changed hole glides the lens (focal length, distance, axis) and
leaves the eye where the player put it.

**Picking.** The raycaster runs through the perspective camera. A corner or a path is picked when the ray passes within
`pickReach` of it: 14 CSS px on screen at that depth for touch (8 for a mouse), but never less than the overhead pick volume
(0.28 world units for a corner, 0.18 for a path) and never more than 0.5 world units. The 0.5 cap is the real invariant: it
is under half the 1.12 corner spacing, so two corners never share a pick however far out the eye is. The pixel reach is
what is left after the cap and the floor, per corner (`touch-place-prove` asserts it at home): at 1280x720 14-20.7 px at
home (the floor lifts the near corners) and 14-15.8 px zoomed fully out; at 844x390 (diorama by choice) 14 px at home and
13.3-14 px zoomed out, where the cap binds on the far coast; on an upright phone by choice, 12.2 px at the far coast zoomed
out. Within a kind the smallest miss on screen wins; corners still beat paths beat hexes. The keyboard route (the
PlaceList) is unchanged.

**The far side.** `board-look-prove` chooses the diorama at 844x390, puts a path on the northmost coast edge and an outpost
on its corner, and measures their meshes on screen: the path is 34.0 x 11.7 px, the outpost 20.4 x 19.2 px, and the touch pick at that
corner 28 px across (the 24 px touch slop or more). No zoom bias: any zoom past the fit pushes a
dock or a pine out of the hole, and the pick reach, not the piece's drawn size, is the tap target.

## Open

- **Budget and frame time**: draw calls in the overhead play view are about 480 a frame (docs/research/mobile-frame-time.md);
  a real-GPU frame time from Jarrod's PC and a budget line are #464.
- **The phone hole** (#422, done as HUD work): on a sideways phone the bottom stack is a full-height left column (20 rem,
  at most 48 vw so it stays a rail), so the hole is the same in every phase. Main phase, hand shown: 844x390 went from a
  101x85 px island and a 7.1 px token to 270x227 and 19 px (adjacent corners 28 px apart); 667x375 from 101x85 and 7.1 px
  to 251x211 and 17.6 px. Everywhere, the dice ride in the Roll / End turn row instead of a row of their own: 1280x720
  main went from a 23.2 px token to 25.7 px. Portrait stays width-bound (20.7 px).
- **A free perspective view in play** (#463): answered by the diorama view (#597).
