# Mobile camera fit and touch-to-place (issue #171)

Sources: [docs/research/mobile.md](../research/mobile.md) §1 and §3, [docs/research/camera-toggle.md](../research/camera-toggle.md) (#147),
issue #135 (desktop framing + toggle; this file is the addendum, not a second camera), `src/lib/scene/isle-renderer.ts`
(constructor, `resize`, `onDown` / `onUp`, `buildMarks`), `src/lib/game/hex.ts` (`HEX_SIZE = 1.12`),
`src/components/scene/IslandCanvas.tsx`.

This is an addendum to #135. Do not add a third camera. Teach the one fit function about viewport size and
aspect, and give Free-mode `maxDistance` a viewport rule. Touch slop, hit volumes, and tap-then-confirm live
in the same Implementation because they edit `isle-renderer.ts` and must be tested on the same board.

#135 still owns lighting, the draw-call budget, the Overhead ⇄ Free chip, and `needs: jarrod` frame time.
When `docs/design/camera-light.md` is written, copy the **Fit** and **Free maxDistance** sections from here
rather than reinventing them.

## World extents (measured, not guessed)

Pointy-top axial, `HEX_SIZE = 1.12`, 19 hexes (`|q|,|r|,|s| ≤ 2`):

| | min | max | half-extent |
|---|---|---|---|
| Hex centers X | −3.880 | 3.880 | 3.88 |
| Hex centers Z | −3.360 | 3.360 | 3.36 |
| Vertices X | −4.850 | 4.850 | 4.85 |
| Vertices Z | −4.480 | 4.480 | 4.48 |
| Vertices + boats (~0.62 along the coast miter) | | | **X 5.55, Z 5.18** |

Pad 8% so a dock sail is not flush with the HUD:

```ts
export const ISLE_HALF = { x: 6.00, z: 5.60 };
```

Vertex-to-vertex spacing is `HEX_SIZE` (1.12). Hit volumes below stay under half of that so two legal
corners never share a pick.

## HUD hole (the fit target)

The canvas is full-viewport. The island must sit in the rectangle the chrome leaves, not in the raw window.
#172 owns the chrome itself. This file owns the **inset contract** the fit function reads, so a later HUD
PR can change pixels without inventing a new camera.

```ts
export type Insets = { top: number; right: number; bottom: number; left: number };

export function hudInsets(cssW: number, cssH: number): Insets {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const narrow = cssW < 768;
  if (coarse && cssH > cssW) {
    // phone portrait — #172's compact seat strip + hand bar
    return { top: 72, right: 12, bottom: 196, left: 12 };
  }
  if (coarse && cssW >= cssH) {
    // phone landscape — hand bar is a short strip; seats can sit top-right
    return { top: 56, right: 12, bottom: 96, left: 12 };
  }
  // desktop, matching #135 / #119: left rail ~224, chat dock 288
  return { top: 72, right: 312, bottom: 168, left: 248 };
}
```

Safe-area insets add on top: `top += env(safe-area-inset-top)`, `bottom += env(safe-area-inset-bottom)`.
Implementation reads them from `getComputedStyle` on the play shell, not from a hardcoded notch height.

If #172's chrome grows past these numbers, that PR updates `hudInsets` in the same change. The camera
does not hard-code 390 or 844.

## Fit: Overhead (v1 default in Play)

One `THREE.OrthographicCamera`, looking down −Y at target `(0.15, 0.05, 0)` — the same target OrbitControls
already uses. No orbit. Pinch changes `camera.zoom` (clamp 1.0–2.4). One finger does nothing.

```ts
function fitOrtho(cam: THREE.OrthographicCamera, cssW: number, cssH: number, insets: Insets) {
  const holeW = Math.max(1, cssW - insets.left - insets.right);
  const holeH = Math.max(1, cssH - insets.top - insets.bottom);
  const aspect = holeW / holeH;
  const halfW = ISLE_HALF.x;
  const halfZ = ISLE_HALF.z;
  if (halfW / halfZ > aspect) {
    cam.left = -halfW; cam.right = halfW;
    cam.top = halfW / aspect; cam.bottom = -halfW / aspect;
  } else {
    cam.top = halfZ; cam.bottom = -halfZ;
    cam.left = -halfZ * aspect; cam.right = halfZ * aspect;
  }
  cam.near = 0.1;
  cam.far = 80;
  cam.position.set(0.15, 18, 0.05);
  cam.lookAt(0.15, 0.05, 0);
  cam.zoom = 1;
  cam.updateProjectionMatrix();
}
```

The canvas is larger than the hole, so the framed world would sit in the window center and slide under the
bottom bar. Offset the camera after the frustum is set so the world center maps to the **hole** center:

```ts
function shiftToHole(cam: THREE.OrthographicCamera, cssW: number, cssH: number, insets: Insets) {
  const holeCx = insets.left + (cssW - insets.left - insets.right) / 2;
  const holeCy = insets.top + (cssH - insets.top - insets.bottom) / 2;
  const ndcX = (holeCx / cssW) * 2 - 1; // hole center in clip space
  const ndcY = -((holeCy / cssH) * 2 - 1);
  const worldW = cam.right - cam.left;
  const worldH = cam.top - cam.bottom;
  cam.position.x = 0.15 - ndcX * worldW * 0.5;
  cam.position.z = 0.05 + ndcY * worldH * 0.5;
  cam.lookAt(cam.position.x, 0.05, cam.position.z);
}
```

Call `fitOrtho` + `shiftToHole` from `resize` and from `setView("overhead")`. Title/lobby stay on today's
auto-rotating PerspectiveCamera; they do not call this fit.

## Fit: Free (tilted OrbitControls)

Keep the existing `PerspectiveCamera(32, …)` at `(6.6, 9.1, 7.4)` and the polar clamp `0.7–1.02` until #135
opens the side view. Change only distance:

```ts
const MIN_DISTANCE = 10; // close-up of one hex; do not lower
const MAX_DISTANCE_FLOOR = 18;
const MAX_DISTANCE_CEIL = 36;

function freeMaxDistance(cssW: number, cssH: number, insets: Insets) {
  const holeH = Math.max(1, cssH - insets.top - insets.bottom);
  const usable = holeH / cssH;
  const need = ISLE_HALF.z * 2;          // world height we must see
  const fov = (32 * Math.PI) / 180;
  const d = need / usable / (2 * Math.tan(fov / 2));
  return Math.min(MAX_DISTANCE_CEIL, Math.max(MAX_DISTANCE_FLOOR, d));
}
```

Worked values (no safe-area):

| Viewport | insets | usable | maxDistance |
|---|---|---|---|
| 1280×720 desktop | 72/312/168/248 | 0.667 | 18 (floor; already enough height, width is the desktop problem #135 owns) |
| 1920×1080 desktop | same | 0.778 | 18 |
| 390×844 portrait | 72/12/196/12 | 0.682 | **23.6** |
| 844×390 landscape | 56/12/96/12 | 0.610 | **26.4** |

`resize` writes `controls.maxDistance = freeMaxDistance(...)` and, if `controls.getDistance()` is now past
the new max, calls `controls.reset` is wrong — instead dolly in by setting the camera along the existing
eye−target ray at the new max. `minDistance` stays 10.

Pinch-zoom (`touches: 2`) stays. One-finger orbit stays in Free only. Overhead never orbits.

## Viewports the Implementation must prove

HTML overlays (schematic, not live WebGL) live next to this file so a later session can see the hole without
running Playwright on a phone:

- [mobile-camera-touch/portrait-390x844.svg](mobile-camera-touch/portrait-390x844.svg) — 390×844, overhead hole,
  19 hexes + 9 docks inside the inner dashed rectangle, Place chip above the hand bar.
- [mobile-camera-touch/landscape-844x390.svg](mobile-camera-touch/landscape-844x390.svg) — 844×390, same.

Implementation later adds `ONLY=390` and `ONLY=844` (or `WIDTH`/`HEIGHT`) to `scripts/shots.mjs` and pastes
`03-setup-390x844.png` / `03-setup-844x390.png` on that PR. This Design does not block on those PNGs.

Pass rule: every hex cap and every dock sail is inside the dashed hole. A vertex mark on the outer ring may
touch the dashed line; it may not sit under the solid chrome.

## Touch slop

`onUp` today:

```ts
if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 8) return;
```

| Pointer | Slop (CSS px) |
|---|---|
| `mouse` / `pen` (fine) | **8** (unchanged) |
| `touch`, or `matchMedia("(pointer: coarse)")` | **24** |

Use the `pointerdown` event's `pointerType` for the whole gesture, not the `pointerup` type (some browsers
flip). 24 px is a sitting-on-the-couch tap that also jiggled OrbitControls; it is not a drag. A move past
24 px is an orbit and must not place.

Do not switch to `click`. Do not add a parallel `touchstart` path.

## Hit volumes

Visual meshes stay exactly as they are so desktop shots do not change.

| Kind | Visual (unchanged) | Invisible pick mesh | Pick radius / size |
|---|---|---|---|
| vertex | `TorusGeometry(0.13, 0.025)` | `SphereGeometry(0.28)` , `visible = false` | **0.28** world |
| edge | `BoxGeometry(0.16, 0.07, length·0.72)` | `BoxGeometry(0.36, 0.16, length·0.90)` , `visible = false` | **0.36 × 0.16** |
| hex | `hexCap(HEX_SIZE * 0.9)` | the cap itself | already large |

Both visual and pick mesh get the same `userData = { kind, id }`. Only the pick mesh is pushed onto
`this.pickables` for vertices and edges (today the visual torus *is* the pickable — swap it). Hexes stay
one mesh.

Raycast order: vertices first, then edges, then hexes. Implementation sorts `intersectObjects` hits by that
rank, not by distance, so a vertex sphere sitting on an edge box wins. Two vertex spheres never overlap
(0.56 < 1.12).

## Tap-then-confirm (coarse only)

Desktop (`pointerType === "mouse"` and not coarse): first `pointerup` on a legal mark still calls `onPick`
immediately. No chip.

Coarse / touch:

1. First `pointerup` on a legal mark **selects** it. Renderer pulses that mark (`emissiveIntensity` 0.8 → 1.4)
   and calls a new callback `onSelect(kind, id)` instead of `onPick`.
2. Store keeps `pendingPlace: { kind, id } | null`. Hud renders a 44×44 CSS-px chip, label **Place**, sitting
   in the HUD hole just above the hand bar (portrait) or just left of the hand strip (landscape). A **Cancel**
   text button sits next to it. Both are `pointer-events-auto`.
3. Confirm is any of: second `pointerup` on the **same** id, tap the Place chip, or Enter. That calls the
   existing `pickVertex` / `pickEdge` / `pickHex`.
4. Retarget: `pointerup` on a different legal mark selects that one instead. `pointerup` on empty space,
   Esc, Cancel, or a new `state` message that drops the id from `legal` clears `pendingPlace`.
5. While `pendingPlace` is set, `controls.enableRotate = false`. Pinch-zoom stays (`controls.enableZoom = true`).
   Clearing the pending pick restores rotate in Free mode. Overhead never had rotate.

Do not invent a long-press. Do not auto-confirm after a timeout.

`IslandCanvas` already forwards `onPick` into `pickHex` / `pickVertex` / `pickEdge`. Add `onSelect` next to
it; the store, not the renderer, decides whether a pick is a select or a commit.

```ts
const coarse = event.pointerType === "touch" || matchMedia("(pointer: coarse)").matches;
if (coarse && pending?.id !== hitId) onSelect(kind, id);
else onPick(kind, id);
```

## What does not change

- Host, `table.ts`, legality. A phone is another client of the same socket.
- Title/lobby camera. Auto-rotate three-quarter view stays; `setTitleMode(true)` still disables SSAO.
- #135's lighting, budget, and the Overhead / Free chip copy.
- Visual mark size and color.
- Mouse one-click place.

## Implementation shape (one leaf, filed after this lands)

One PR, one file pair:

- `isle-renderer.ts`: `hudInsets`, `fitOrtho`, `shiftToHole`, `freeMaxDistance`, slop, pick spheres/boxes,
  `setView`, `setPending`, rotate lock.
- `IslandCanvas.tsx` + a thin chip in `Hud.tsx` (or a 30-line `PlaceChip.tsx`).
- `store.ts`: `pendingPlace`.

Do not wait on #135's lighting. Do not wait on #172's chrome — use the inset numbers above until #172
replaces them.

## Test plan

Research gate is already done. Implementation proves:

```
npm run typecheck
npm test
npm run client-prove
```

Plus, on the Implementation PR:

1. `scripts/shots.mjs` at 390×844 and 844×390 in overhead: all 19 hexes and 9 docks inside the hole.
2. A unit-less prove script `scripts/touch-place-prove.mjs` (jsdom or a tiny Three raycast harness) that
   plants two adjacent legal vertices 1.12 apart, fires a ray at the midpoint offset 0.20 toward one, and
   asserts that vertex wins; and that a 20 px drag on a touch pointer still counts as a tap while a 30 px
   drag does not.

## Handoff

```
done: exact fit, insets, maxDistance formula, slop 8/24, hit 0.28 / 0.36, tap-then-confirm on coarse only
left: Implementation leaf (file as Todo). #172 still Backlog unless a session takes it. #135 copies Fit + maxDistance when it writes camera-light.md.
broke: nothing
```
