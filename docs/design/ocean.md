# Ocean and a coast that follows the hexes (issue #130)

Sources: [docs/research/visual-polish.md](../research/visual-polish.md) §2 and "Cost now"; the constructor in `src/lib/scene/isle-renderer.ts`; the coastal-edge walk in `src/lib/game/board.ts`; `src/components/scene/IslandCanvas.tsx`.

The 19-hex island is convex and centered on the origin (`hexesInRadius(2)`, `HEX_SIZE` 1.12). Its outline does not change when the terrains are dealt. The coast is built once. It is not rebuilt in `buildLand`.

## What is wrong today

The ocean is one flat `CircleGeometry` with `MeshStandardMaterial` roughness 0.28 and metalness 0.06. The sun at `(8, 16, 6)` paints a white hotspot on it. The shore is two cylinders (sand `#e8d7b0`, shelf `#3aa8a8`) and a foam `RingGeometry` at radius 5.15–5.85, so the coast is a circle that ignores the hexes. On the title and the lobby the store has no state, `IslandCanvas` never calls `setBoard`, and the scene is that empty disc with the wayfarer at the origin.

## Water

One mesh. Keep a `CircleGeometry(48, 64)` with the existing `rotation.x = -Math.PI / 2`, so the disc lies flat. Replace the standard material with an unlit `ShaderMaterial`. An unlit shader cannot catch the sun, which is what removes the hotspot. Do not lower the sun and do not change SSAO here (#135 owns lighting).

Heights, in world Y:

| Surface | Y |
|---|---|
| Hex slab bottom | 0.04 |
| Foam strip | 0.028 |
| Beach | 0.015 |
| Wave crest (max) | 0.00 |
| Water rest | −0.02 |

After `rotation.x = -π/2`, local +Z is world +Y. Displace `position.z` in the vertex shader, not `position.y`. A displacement of `position.y` slides the disc sideways.

```glsl
// vertex — local circle is XY; +Z is up after the mesh rotation
uniform float uTime;
varying vec2 vXZ;
void main() {
  vec3 p = position;
  float w = sin(p.x * 1.6 + uTime * 0.55) * sin(p.y * 1.25 + uTime * 0.40);
  p.z += w * 0.012;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vXZ = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
```

The fragment shader is unlit. No lights, no specular, no `toneMapping` inside the shader (the renderer already tone-maps; write a plain colour).

- Shallow `#3d8f96` where `length(vXZ)` is 4.2 or less.
- Deep `#163e4c` by distance 7.5 (`smoothstep`).
- Fade that colour to the scene fog `#6a93a0` from distance 18 to 40, so the disc dies into the background instead of showing a hard edge.
- A ripple of ±0.022 on the colour (`sin` of `vXZ` and `uTime`). That is the visible variation. It is not a white disc.
- `uTime` is `this.clock.getElapsed()` from `tick`.
- The mesh does not cast a shadow, does not receive one, and is not in `pickables`.

## Coast

Build this in the constructor, from the hex grid, not from a dealt `GameState`.

1. Walk every hex's six corners with `hexCorners`, and make vertex and edge ids the same way `board.ts` does.
2. An edge is coastal when exactly one hex uses it.
3. Chain those edges into one closed loop. A radius-2 island has a single loop, and every boundary vertex is on exactly two coastal edges. If the chain forks or does not close, that is a bug in the walk, not a second island.
4. Outward direction at a vertex: the sum of the two edge normals that point away from the island, normalized. Away-from-origin agrees with that on this convex island, and it is the check: the miter must point to the same half-plane as the vertex's position.
5. Offsets along that miter: beach outer 0.22, foam outer 0.42. Pull the inner edge of the beach in by 0.04 so it tucks under the hex slabs and no gap shows between tile and sand.

Beach: one triangle strip at y = 0.015. `MeshStandardMaterial`, colour `#e8d7b0` (the sand colour already in the constructor), roughness 1, metalness 0. It receives shadows and does not cast them. Not pickable.

Foam: one triangle strip from offset 0.22 to 0.42, at y = 0.028. `MeshBasicMaterial`, colour `#e8f8f8`, transparent. In `tick`, set opacity to `0.32 + 0.23 * (0.5 + 0.5 * sin(t * 0.8))`, so it breathes between 0.32 and 0.55. A basic material cannot hotspot. No shadow. Not pickable.

Delete the round foam ring, the shelf cylinder, and the sand cylinder. Nothing else in the constructor stays round.

Do not move piers or boats. A pier still starts at its harbor vertex and runs 0.72 outward, which clears the foam (outer offset 0.42). #131 seats the boats and paints the dock rates on this coast.

The strips are not in `pickables`. Setup clicks still hit vertices and edges. A ray that hits only the beach does nothing.

## Title and lobby

`createGame` already deals tokens, docks, and the wayfarer, and it stops in `setupSettle` before any piece is placed. Use that, with a fixed seed, as the backdrop.

In `board.ts`:

```ts
export const DEMO_SEED = 20260921;

export function demoBoard(): GameState {
  return createGame({ seed: DEMO_SEED, humans: [{ name: "Ember" }], bots: 2 });
}
```

`20260921` is the day the repo was created. It does not change. `bots: 2` makes three seats and places nothing.

`IslandCanvas`: when `screen` is `title` or `lobby` and `state` is null, call `setBoard(demo, { vertices: [], edges: [], hexes: [] }, false)`. Keep one `demoBoard()` result for the life of the page. Do not put it in the zustand store, and do not let a live game copy `DEMO_SEED`. When a real `state` arrives, `setBoard` replaces the land group as it does now. The water and the coast stay, because they are not children of `land`.

`setTitleMode` is unchanged: the camera auto-rotates on the title and the lobby, and stops in play. Do not move the camera. #135 owns the lens. The title card is already a bottom sheet, so the dealt island reads above it. #136 owns the lobby chrome. This only replaces the empty disc behind that chrome.

## Draw calls

`scripts/shots.mjs` records draw calls on the trade screen at 1920×1080, after play has started. The research measured 2307, which counts the shadow map, the SSAO pass, and the colour pass.

This change removes four meshes (standard ocean, round foam, shelf, sand) and adds three (shader ocean, beach, foam). The demo island is gone before that measurement, because play has a real state. Draw calls must not rise by more than 50. The expected change is about zero, slightly down. Do not instance the trees in this change, and do not turn SSAO off.

## What the screenshots must show

The implementation proves this note. This note does not commit screenshots.

| Shot | Must show |
|---|---|
| `03-setup-1280x720` | The sand and the foam follow the hex outline, not a circle. The water changes from shallow to deep and the surface is not still. No white sun disc. |
| `01-title-1280x720` | A dealt island behind the title card: tokens, trees or sheep, and the wayfarer standing on the waste. The same coast and the same water. |

`npm run client-prove` and `npm run tabs-prove` still pass.

## Files the implementation touches

- `src/lib/scene/isle-renderer.ts` — water, coast, delete the three round meshes, foam opacity in `tick`
- `src/lib/game/board.ts` — `DEMO_SEED` and `demoBoard` only
- `src/components/scene/IslandCanvas.tsx` — show the demo board when the store has no state

## Out of scope

- The HUD, the camera, and the lights (#129, #135, and the #128 decision)
- Boat meshes and the dock rates (#131)
- The wayfarer figure (#132)
- Path, outpost, and stronghold shapes (#133)
