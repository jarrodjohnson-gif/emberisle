# Payout Goods Flights Specification (#642)

This document specifies 3D flight paths, geometry budgets, and draw call limits for payout goods flights.
It defines the visual flight sub-architecture for Issue #642.
Goods pop off paying hexes and fly to local player hand cards.

## 1. Flight Trajectory and Coordinate Systems

Flight paths bridge 3D island world coordinates and 2D canvas interface space.

- 3D Source origin: Place source 0.58 world units from hex center toward the winning vertex.
- Source elevation: Situate goods 0.20 world units above the hex topOf surface.
- Center clearance: Keep origins outside the 0.39 unit number token exclusion radius.
- Screen reprojection: Project 3D source coordinates to canvas CSS pixels on every rendered frame.
- 2D Destination: Target the center point of the matching visible local hand card icon.
- Camera movement: Recompute origin projections during camera orbits without restarting animation clocks.
- Layout changes: Update destination coordinates when hand trays shift or animate.
- Cancellation: Cancel active flights immediately upon viewport resize, screen orientation change, or seat handover.

## 2. Animation Phases and Timing

Each payout flight completes within a strict 600 ms lifecycle.

- Pop phase (0 to 120 ms): Object pops upward 10 pixels while scaling from 14 px to 18 px.
- Flight phase (120 to 480 ms): Object follows a quadratic Bezier curve toward the target icon.
- Arc curvature: Curve peaks 32 pixels perpendicular to the direct chord between endpoints.
- Easing: Use cubic ease-in-out interpolation across the flight path.
- Sink phase (480 to 600 ms): Object shrinks from 14 px down to 6 px.
- Fade: Opacity fades to zero as the object sinks beneath the card.
- Stagger: Stagger second items and multiple grants by 40 ms, capped at 200 ms total.

## 3. Goods Geometries and Visual Identity

Distinct low-polygon meshes identify each resource type without text labels.

- Timber: Crossed log pair built from low-poly cylinders (48 triangles).
- Clay: Rectangular kiln brick with chamfered edges (24 triangles).
- Wool: Rounded fleece tuft droplet (36 triangles).
- Grain: Stylized tapered wheat sheaf bundle (40 triangles).
- Ore: Faceted mineral crystal cluster (32 triangles).
- Materials: Use unlit pastel shaders matching canonical resource palette colors.
- Preallocation: Preallocate all five geometries and materials during scene initialization.
- Allocation ban: Ban runtime geometry creation, texture allocation, or material cloning during flights.

## 4. Strict Triangle and Draw Call Ceilings

Strict resource budgets prevent frame drops on mobile and software renderers.

- Concurrency cap: Allow at most 24 active flight objects on screen simultaneously.
- Triangle ceiling: Total flight geometry must never exceed 1,200 triangles.
- Observed maximum: 24 objects at 48 triangles yields at most 1,152 triangles.
- Draw call ceiling: Overlay pass must draw in at most 5 draw calls.
- Batching strategy: Render each resource type with a single batched or instanced draw call.
- Single-pass target: Aim for 1 combined draw call using vertex coloring where supported.

## 5. Overlay Pass and Text Occlusion

An independent overlay scene prevents interference with main scene depth buffers.

- Camera pass: Render through a dedicated orthographic camera matching canvas CSS dimensions.
- Depth state: Disable depth writing and depth testing for all flight items.
- Layer position: Render overlay between the 3D scene canvas and HUD HTML elements.
- Text suppression: Suppress flight objects intersecting active center text bounds plus 8 px margin.
- Protected prompts: Dice results, GainFloats lines, and TurnMoment banners maintain uninterrupted readability.
- Audio decoupling: Flight animations never invoke audio APIs or trigger secondary gain clicks.

## 6. Edge Cases and Accessibility

Edge cases fail silently to protect game state integrity.

- Reduced motion: Skip all flight meshes and display existing static gain float lines.
- Opponents and spectators: Draw no flight meshes toward opponent seats or watcher screens.
- Blocked hexes: Skip flights entirely for blocked hexes or zero-payout rolls.
- Bank shortages: Generate flights only for resources actually granted by the bank.
- Offscreen targets: Omit flight objects whose destination cards are scrolled out of view.

## 7. Verification and Test Suite

Focused proofs validate implementation correctness.

- Verify Bezier trajectory coordinates with scripts/payout-flight-prove.mjs.
- Confirm total flight draw calls remain at or below 5 calls.
- Confirm flight triangle counts stay under 1,200 triangles across multi-hex rolls.
- Verify zero memory allocation during active flights using performance profiling.
- Run npm run typecheck and loosen-prove to verify repository integrity.
