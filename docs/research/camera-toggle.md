# Research: overhead ⇄ free-camera toggle (issue #147)

- step: 1 Research, node #124
- date: 2026-09-27
- agent: Grok

## What I read

`src/lib/scene/isle-renderer.ts` constructor, `resize`, `tick`, `setTitleMode`;
`src/components/scene/IslandCanvas.tsx`; `docs/research/visual-polish.md` §7;
issue #128 (closed) and its decision comment; issue #135 body (updated for two modes).

## What is true

### The camera today is one tilted perspective rig

`IsleRenderer` builds a single `THREE.PerspectiveCamera(32, …)` at `(6.6, 9.1, 7.4)` and one `OrbitControls` on the canvas:

- `minDistance = 10`, `maxDistance = 18`
- `minPolarAngle = 0.7`, `maxPolarAngle = 1.02` (about 40°–58° from vertical — never overhead, never a low side view)
- `enableDamping = true`
- `autoRotate = true` at 0.28, turned **on** whenever `screen !== "play"` (`IslandCanvas` → `setTitleMode`)

There is no orthographic camera, no mode flag, no `localStorage` key, no HUD chip. `resize` only updates aspect. Distance does not scale with window size, which is why visual-polish §7 recorded the bottom hex row falling off at 1280 and 1920.

Picking is `raycaster.setFromCamera(this.pointer, this.camera)` against `pickables`. Highlights are world-space meshes. Both keep working if the camera changes, as long as there is still *a* camera the raycaster uses.

Title and lobby already reuse this rig with autoRotate. Play turns autoRotate off but leaves the same polar clamp, so the player can orbit a little and zoom 10–18, not freely "move around the side."

### #128 is a toggle, not a replacement

Closed 2026-09-27: ship option 1 (top-down / orthographic on this same scene) as the **v1 default**, and keep the tilted 3D camera reachable behind a toggle. Same meshes, same picking, same highlights. v2 polishes the same toggle. v3 is Unreal and does not care.

### What the two modes actually are, in this renderer

| | Overhead (default in play) | Side / moveable |
|---|---|---|
| Lens | New `OrthographicCamera` sized to the HUD hole, or a perspective locked at polar ≈ 0 with a much higher eye. Orthographic is the one that stops back hexes shrinking. | Keep today's `PerspectiveCamera` + OrbitControls |
| Orbit | Off. Maybe allow a 90° snap later; not v1. | On. Widen `maxPolarAngle` / `minPolarAngle` so a side view is actually possible (today 1.02 rad is still a high three-quarter). |
| Zoom | Orthographic `zoom` or `left/right/top/bottom` so all 19 hexes + 9 docks fit the HUD hole at 1280×720 and 1920×1080 | Keep 10–18 or retune once #135 measures framing |
| Auto-rotate | Title/lobby only, as now | Title/lobby only |
| Picking | Same raycaster, swap `this.camera` | Same |
| SSAO | Candidate to disable — overhead + SSAO is cost for little depth | Keep until #135's budget says otherwise |

Do **not** add a second renderer or an SVG board. #128 already rejected that.

### Where the toggle lives

Client-only. The host does not need to know. Suggested:

- A single chip on the play HUD (and usable on title if someone wants to inspect the demo island), label pair **Overhead** / **Free camera**.
- Persist per browser, `localStorage` key e.g. `emberisle-camera`, default `overhead` in play.
- Title/lobby can stay on the current auto-rotating three-quarter view so the island reads as an object, then snap to overhead when `screen === "play"` unless the player last left it on Free.

Exact placement belongs in #135 / #129 so the chip does not cover hex click targets.

### #135 is enough Design

#135 already owns `docs/design/camera-light.md`, framing, lighting, and the draw-call budget. The body was updated to name both modes. Splitting a second Design issue would duplicate the framing work. This Research files **no** new Design child.

Implementation (after #135) is one leaf: `IsleRenderer.setView(mode)`, the HUD chip, the `localStorage` key, and a `shots.mjs` pair. File that Implementation when Design is in Review, not now.

## What I am not sure about

- Orthographic vs a perspective locked straight down. Orthographic is cleaner for tokens; perspective-down keeps one camera class. #135 should pick with a screenshot of each.
- How far to open polar angle in Free mode. Opening it to ~1.3 lets you see a side of the tiles; opening it to 1.5 lets you go under the island, which is useless.
- Real-GPU frame time with SSAO on in both modes (`needs: jarrod` on #135).

## Prove output

(research gate — no command)

## Handoff

```
done: mapped the current OrbitControls; described both modes on one scene; no extra Design issue (#135 absorbs the toggle)
left: #135 Design camera-light.md for both modes, then one Implementation leaf
broke: nothing
next agent: #135 (S, Backlog). Do not start implementation until that spec exists.
```
