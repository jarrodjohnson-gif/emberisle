# Scene and Renderer Proof Audit: 2026-11-12

This audit verifies rendering performance, draw calls, and board fitting in emberisle.
All tests ran against commit e4cbf246 on main.

## 1. Draw Calls and Geometry

The Hex Jelly board renders through batched scenes.
All draw call and triangle metrics remain within approved limits.

- Terrain draw calls: 35 calls (ceiling: <= 60 calls; 25 calls headroom).
- Terrain triangles: 333,544 triangles (ceiling: <= 600,000 triangles; 266,456 headroom).
- Whole island triangles: 396,316 triangles (ceiling: <= 620,000 triangles; 223,684 headroom).
- Hex center clearance: minimum 0.335 on ore (requirement: >= 0.31).
- Pad and rim deviation: under 1e-4 across all 6 terrain types.

## 2. Light Rig and Materials

The scene lighting follows the board look specifications.

- Shadow caster: one warm key directional lamp.
- Flat ambient lights: 0 ambient lamps present.
- Key over bounce ratio: 3.82 (requirement: at least 3.0).
- Key warmth ratio: 1.97 linear red to blue.
- Shadow filter: PCF blur radius 6 on 1024 texture map.
- Tone mapping exposure: 1.05 (ceiling: <= 1.1).
- Crystal sea deep water: light blue-green [140, 212, 214].
- Crystal sea shallow water: near-white aqua [200, 229, 219].
- Far horizon color: studio paper #f1efe9 within 6/255 tolerance.

## 3. Board Fitting and Camera Orientation

Commit 974f4045 introduced the upright phone table fit (#1509, #1515).
The camera adapts to phone orientation and layout changes.

- Default upright phone view: overhead at 40° lean.
- Default landscape view: diorama at 38° above horizon or overhead at 25°.
- Shore fitting: island shore spans to edge gaps inside the hole.
- Dock inspection buttons: all 9 buttons clamp on screen.
- Harbor geometry: 9 piers and 9 boats, matching dock kinds.
- Desktop token diameter: 31.3 px (requirement: >= 24 px).
- Phone token diameter: 19.6 px (requirement: >= 18 px).

## 4. Render Loops and Resize Handling

The renderer lifecycle handles animation and resizing cleanly.

- Animation loop: IsleRenderer uses setAnimationLoop with requestAnimationFrame fallback.
- Disposal: dispose clears animation loop and event listeners.
- GPU synchronization: WebGLSync fences handle frame timing and drop cleanly on context loss.
- SSAO buffer sizing: half-resolution in free view and full resolution in play views.
- Pan preservation: user camera offset survives view refits without resetting home.

## 5. Verification Commands

All proofs ran and passed with zero errors:

- npm run board-look-prove: passed all checks.
- npm run upright-table-prove: passed across 4 phone viewports.
- npm run dock-rates-prove: passed across desktop and mobile viewports.
- npm run visual-direction-prove: passed across all 6 viewports.
- npm run typecheck: passed with zero compiler errors.
