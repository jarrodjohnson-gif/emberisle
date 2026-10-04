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
- **Play**: the overhead `OrthographicCamera`, fitted by `fitOrtho` to the hole `hudInsets` leaves, on every
  pointer (before, only a coarse pointer got it; a desktop kept the tilted camera and the bottom row sat under
  the HUD). SSAO off. Picking and the highlights are the same meshes.

The overhead camera leans **25°** off straight down toward the player (`OVERHEAD_LEAN`), looking at cap level
(`CAP_LEVEL` 0.35) over the hole's centre, 18 units out. The lean shortens the island's screen depth by
cos(25°) and lifts the far row's tree tops by up to 1.15 units times sin(25°); `fitOrtho` keeps that room.
Straight down, the trees were green blobs and the slabs had no side; leaned, the board has depth and a token
still reads as a disc (27 px across at 1280x720, 19 px at 390x844 where the hole is width-bound: #422).

Measured fit, from `window.__isle.screenOf` on every corner: at 1280x720 the hole is 248..968 x 72..552, 40 px
per world unit, the nearest dock 60 px inside the hole; at 390x844 (touch) the hole is 12..378 x 116..648,
28 px per unit, the nearest dock 35 px inside.

## Open

- **Toggle**: Overhead ⇄ Free in play needs a control in the HUD menu (#463); `IsleRenderer.setView` is ready
  for it. Until then a desktop has no orbit in play.
- **Budget and frame time**: draw calls in the overhead play view are about 480 a frame (docs/research/mobile-frame-time.md);
  a real-GPU frame time from Jarrod's PC and a budget line are #464.
- **The phone hole**: the landscape hole and its island size are #422.
