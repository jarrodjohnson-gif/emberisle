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
- **Play, by default: the diorama** (#597, reversing #128 by the owner's call): a `PerspectiveCamera` 32° above the
  horizon and 20° off the island's north, fitted by `fitDiorama` to the hole the HUD leaves ("The diorama view" below).
- **Play, by choice: overhead**: the `OrthographicCamera`, fitted by `fitOrtho` to the same hole, on every pointer.

The table menu's **View** row switches between Diorama and Overhead; the choice is saved in `localStorage`
(`emberisle-view`: `"diorama"` | `"overhead"`, like `emberisle-water`) and every entry to the table starts from the chosen
view's home. SSAO is off in both play views. Picking and the highlights are the same meshes.

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

The board seen from a chair: the reference's 3/4 tilt, the whole island and a margin of water in the hole, the far water
fading into the paper.

| | Value | Where |
|---|---|---|
| Elevation | 32° above the horizon (polar 58°) | `DIORAMA_POLAR` |
| Yaw | 20° off north: the eye sits south-south-east, the island's north is up-screen and a little left | `DIORAMA_AZIMUTH` |
| Look-at | the island's centre at cap level, (0, 0.35, 0); the orbit pivots there | `applyPose` |
| Focal length | 24° across the hole's height: `holeH / 2 / tan(12°)` px | `DIORAMA_FOV` |
| Lens shift | the lens axis meets the canvas off centre (`setViewOffset`), so the island sits in the hole without turning the eye | `fitDiorama` |
| Fog | starts 8 units past the eye's distance to the look-at point, 26 deep; the sea fades to paper 16 to 30 units out | `fadeSea` |

**The fit rule.** The points the hole must hold are each coast corner (30) at cap level, the same corners at cap level
plus 1.15 (the tallest pine), and each corner pushed 0.95 further out at the waterline (y 0.1: a dock's pier and boat reach
0.7, plus water). `fitDiorama` bisects the eye's distance until the larger of the points' screen span over the hole's width
and over its height is 1, then shifts the lens so the span's centre is the hole's centre. So the island fills the hole on one
axis, centred, and the HUD covers no corner and no dock, whatever the hole. It is pure math in `mobile-fit.ts`;
`touch-place-prove` checks it against the measured holes (desktop, portrait, the sideways phone, with and without an
offer), and `board-look-prove`, `visual-direction-prove`, `hud-safe-area-prove` and `rotate-prove` against the live HUD.

Measured in the browser on a mid-game board (main phase, Path armed, the live HUD's hole; px per world unit across the
screen at the far, middle and near row of hex centres):

| Viewport | Hole (top / right / bottom / left) | Eye distance | px per unit far / centre / near | Token scale |
|---|---|---|---|---|
| 1280x720 | 68 / 12 / 180 / 200 | 17.6 | 54.6 / 63.0 / 74.4 | 1 |
| 390x844 | 68 / 12 / 270 / 12 | 36.8 | 30.1 / 32.3 / 34.9 | 1.37-1.7 |
| 390x844, offer open | 68 / 12 / 373 / 12 | 29.4 | 29.5 / 32.3 / 35.5 | 1.34-1.7 |
| 844x390 | 68 / 12 / 12 / 284 | 17.6 | 35.8 / 41.4 / 48.9 | 1-1.47 |

The 24° focal length is a choice between depth and evenness: on a desktop hole, at 30° the eye came to 14.5 units and the
far row was 0.69 the size of the near one; at 24° it is 0.73 and the eye is 17.6 out. The portrait phone stays width-bound
(the island and its docks span the hole's 366 px): its tokens are scaled instead (`docs/design/tokens.md` "Angle").

**Gestures.** As in the overhead view: drag orbits (polar 7°-66°, any azimuth, no damping, no pan), wheel and pinch zoom
0.8x-2.4x (here the eye's distance, fitted distance over zoom), and Home, a double click or a double tap on empty board
glide home over 280 ms (instant under reduced motion). A changed hole glides the lens (focal length, distance, axis) and
leaves the eye where the player put it.

**Picking.** The raycaster runs through the perspective camera. A corner or a path is picked when the ray passes within
`pickReach` of it: 14 CSS px on screen at that depth for touch (8 for a mouse), never less than the overhead pick volume
(0.28 for a corner, 0.18 for a path) and never more than 0.5, under half the 1.12 corner spacing; the nearest miss wins
within a kind, corners still beat paths beat hexes. At 390x844 that is 0.38 world units on the near coast and 0.49 on the
far one, 28 px across. The tilt foreshortens a step along the line of sight, so two corners can be 18 px apart on the far
coast of a portrait phone (20 px on the sideways one); a tap dead on one is still outside its neighbour's reach. The
keyboard route (the PlaceList) is unchanged.

**The far side.** Measured in `board-look-prove` at 390x844: a path on the northmost coast edge is 31.6 x 10.6 px on
screen, an outpost on its corner 18.4 x 17.5 px, and the touch pick there 28 px across. No zoom bias: any zoom past the fit
would push a dock out of the hole, and the pick reach, not the piece's drawn size, is the tap target.

## Open

- **Budget and frame time**: draw calls in the overhead play view are about 480 a frame (docs/research/mobile-frame-time.md);
  a real-GPU frame time from Jarrod's PC and a budget line are #464.
- **The phone hole** (#422, done as HUD work): on a sideways phone the bottom stack is a full-height left column (20 rem,
  at most 48 vw so it stays a rail), so the hole is the same in every phase. Main phase, hand shown: 844x390 went from a
  101x85 px island and a 7.1 px token to 270x227 and 19 px (adjacent corners 28 px apart); 667x375 from 101x85 and 7.1 px
  to 251x211 and 17.6 px. Everywhere, the dice ride in the Roll / End turn row instead of a row of their own: 1280x720
  main went from a 23.2 px token to 25.7 px. Portrait stays width-bound (20.7 px).
- **A free perspective view in play** (#463): answered by the diorama view (#597).
