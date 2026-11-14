# Browser table visuals and presentation (issue #124)

> Resolves #124: Make the browser table look good across desktop and mobile.
> Replaces legacy prototype primitives with polished scene geometry, refined ocean shaders, and responsive HUD framing.

Sources: [docs/design/visual-direction.md](visual-direction.md), [docs/design/camera-light.md](camera-light.md),
[docs/design/ocean.md](ocean.md), [docs/design/pieces.md](pieces.md), [docs/design/mobile-fit.ts](../../src/lib/scene/mobile-fit.ts),
and [docs/DECISIONS.md](../DECISIONS.md).

## What was wrong before

The original browser prototype had several visual and layout flaws:

- The HUD covered roughly half the board on desktop screens.
- The prompt status line overlapped the player seat list.
- Resource cards sat directly in the centre of the screen.
- Dock piers extended through the island terrain rim.
- Pieces, boats, wayfarer, and the ocean were flat placeholder meshes.

## Desktop table presentation (1280×720 and up)

Desktop view presents the island as a crafted physical board on a table.

- Default camera: diorama view tilted 38° above the horizon and 20° off north.
- Fallback camera: overhead orthographic view with a 25° forward lean.
- Players can toggle between diorama and overhead views in the table menu.
- The choice persists in `localStorage` under `emberisle-view`.
- Left seat rail occupies 216 px inset with 176 px wide player cards.
- Bottom one-tray occupies 164 px inset with hand numbers beside action buttons.
- Top utility bar occupies 68 px inset for audio, log, and settings.
- Right rail reserves 312 px when chat or trade panels open.
- The board fits inside the free hole so HUD chrome never obstructs tiles.

## Mobile table presentation

Mobile view adapts the table layout for touch devices and narrow screens.

### Portrait phone (390×844)

- Camera: overhead orthographic view with a 40° forward lean (owner decision q1515-table-look B).
- The 40° angle reveals hex slab sides and pieces while tokens remain readable discs.
- The shore spans the screen width up to 4 px from each edge.
- Outermost goods piles stay at least 2 px inside the screen.
- Side trade boats crop past screen edges while dock inspection buttons stay visible.
- Top seat strip occupies a 68 px inset with compact seat pills.
- Bottom one-tray occupies a 232 px inset with hand counts and action buttons.

### Sideways phone (844×390)

- The tray and actions form a 284 px column docked on the left.
- Top chrome occupies a 68 px inset.
- Bottom and right margins occupy 12 px insets.
- The island centres in the remaining wide landscape hole.

## HUD insets and hole fitting

The camera frames the board using a declared layout hole.

- `playHole` declares the static footprint of persistent HUD chrome.
- Transient overlays do not modify the camera hole.
- Trade sheets, chat drawers, and fortune pickers overlay the scene without moving the board.
- The renderer computes frustum bounds from declared insets and safe areas.
- CSS custom properties (`--hole-top`, `--hole-bottom`, `--hole-left`, `--hole-right`) position screen moments.
- Center-screen announcements like `TurnMoment` align to the hole center rather than the viewport center.

## Ocean and coastline styling

The ocean surrounds the island with an unlit shader and animated coastlines.

- Shader material replaces standard PBR to eliminate harsh specular sun hotspots.
- Depth gradient blends shallow turquoise (`#4596a0`) to deep sea (`#225a68`).
- Vertex shader displaces coastal water with gentle wave ripples.
- Sandy beach shelf and white foam lace ring the island perimeter.
- Coastline follows hex boundaries with a 0.42 unit foam band past outer vertices.
- Ambient marine life (whales, dolphins, and turtles) animates through clear sea lanes.
- On smaller desktop screens (1280×720), the whale skips crowded lanes to avoid clipping.

## Pieces, docks, and wayfarer

Board tokens and structures use distinct 3D models with strong visual contrast.

### Outposts and strongholds

- Outposts use stylized cottage geometry with pitched roofs and seat colour accents.
- Strongholds add an elevated keep tower to distinguish settlement tiers.
- A light halo base separates player colours from terrain caps.
- Every seat colour maintains at least 3.0:1 contrast against all terrain textures.

### Paths

- Paths are faceted timber bars connecting adjacent vertex junctions.
- Path ends tuck cleanly underneath outpost and stronghold base collars.

### Wayfarer (robber)

- The wayfarer model features a hooded traveler with travel pack and staff.
- The piece stands tall on hex centres and casts realistic contact shadows.
- Active hex highlights show dark charcoal tinting when the wayfarer blocks production.

### Docks and boats

- Dock piers extend from shore hexes with wooden plank texturing.
- Moored trade boats float in coastal water aligned to trade angles.
- Goods piles are scaled 2.5x with distinct models for timber, clay, wool, grain, and ore.
- Owned docks display subtle status markers on the pier building.

## Verification and proofs

The table presentation is guarded by automated visual and layout proofs:

- Run `npm run board-look-prove` to verify draw calls, triangle counts, and light rigs.
- Run `npm run upright-table-prove` to verify mobile camera framing and dock visibility.
- Run `npm run dock-rates-prove` to verify dock button placement and resize handling.
- Run `npm run client-prove` to verify end-to-end table render stability.
- Run `npm run tabs-prove` to verify desktop and mobile tray tab navigation.
- Verify draw calls stay below 60 (observed 35 calls).
- Verify scene triangles stay below 600,000 (observed ~396,000).
