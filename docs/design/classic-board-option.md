# Classic Board Option Specification (#641)

This design specifies the Classic board look option for Issue #641.
It restores the pre-jelly sculpted terrain as a player preference beside Jelly.
Jelly remains the default appearance.
The setting is local to each browser.
Changing board appearance alters presentation only and never affects canonical game state.

## 1. Setting and Store Wiring

The setting integrates into the existing client preferences architecture.

- Menu control: Add a "Board" row in the Table menu beside View and Water.
- Options: Provide exactly two choices, Jelly and Classic, using standard 44 px touch targets.
- Client store: Add boardLook property to client presentation state in store.ts.
- Persistence: Persist choice in localStorage under emberisle-board-look.
- Fallback: Default to "jelly" if storage is empty, corrupted, or unavailable.
- Scene bridge: IslandCanvas passes boardLook to IsleRenderer via presentation props.
- Network isolation: The setting never sends network packets or synchronizes across hotseat players.

## 2. Land Appearance Abstraction

IsleRenderer decouples from specific land builders using the LandAppearance interface.
Both JellyBoard and ClassicBoard implement this shared contract.

- Scene group: group contains only terrain meshes, props, and decorative animations.
- Frame updates: update(t, all, snap) advances local animation clocks.
- Glow signals: glow(id, level) renders paying-hex highlights without triggering game payouts.
- Wayfarer dulling: robber(id) darkens the blocked hex terrain without moving Bruno.
- Surface queries: groundAt(id, dx, dz) reports terrain elevation for piece and Bruno placement.
- Resource disposal: dispose() releases owned geometries, materials, and textures.

The renderer preserves shared scene elements during look changes.
Pieces, roads, tokens, harbors, ocean, camera, and highlights remain untouched.
This prevents replaying piece drop animations or dice roll audio during swaps.

## 3. Lazy Chunking Architecture

Classic terrain assets load through dynamic imports to protect initial page load.

- Separate chunk: classic-board.ts and terrain-classic.ts compile into an isolated Vite chunk.
- On-demand loading: The client fetches the Classic chunk only when selected.
- Startup protection: First-time visits and Jelly-only sessions never download Classic code.
- Yielding builds: Scene generation yields across animation frames to prevent main thread blocking.
- Stand-in slabs: Hex prism stand-in slabs render immediately while terrain chunks compile.
- Failure safety: Failed chunk downloads leave stand-in slabs active without crashing the renderer.

## 4. Lite-Board Performance on Software GPUs

The Classic board supports two quality tiers to accommodate low-powered devices.

- Full quality: Uses 18 concentric lattice rings with complete animated props.
- Lite quality: Uses 12 concentric lattice rings with landforms and zero props.
- Apron constraint: 12 rings is the coarsest lattice keeping clay pit aprons within tile bounds.
- Software fallback: Detected software WebGL devices automatically receive Lite quality.
- Token pad: Center token pad stays completely flat at constant topOf height.
- Piece rim: Hex outer perimeter rim stays flat at topOf to support settlements.
- Token clearance: Props stay outside the 0.31 unit exclusion circle around hex centers.
- Numeral occlusion: Tall props shrink dynamically when crossing sightlines between camera and tokens.

## 5. Performance and Geometry Ceilings

Performance thresholds ensure fast frame rates across all platforms.

- Draw calls: Classic Lite draws within 40 calls; Classic Full draws within 55 calls.
- Triangles: Classic Lite renders under 150,000 triangles; Classic Full renders under 350,000 triangles.
- Chunk size: The Classic bundle chunk must remain under 35 KB gzipped.
- Frame rate: Maintains 60 fps on discrete GPUs and 30 fps on mobile hardware.

## 6. Verification and Testing Strategy

Focused proofs validate implementation correctness.

- Run npm run classic-builder-prove to verify isolated Classic geometry and shaders.
- Run npm run board-look-prove to test lighting and camera alignment.
- Run npm run tokens-prove to confirm token pad flatness and clearance.
- Run npm run size-prove to verify chunk budget boundaries.
- Run npm run typecheck to ensure TypeScript type integrity.
