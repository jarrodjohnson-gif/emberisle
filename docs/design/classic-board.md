# Classic board option (#641, research/design #750)

This contract adds the owner's approved sculpted terrain option beside Jelly.
Jelly remains the default. Each browser chooses its own appearance; the host never chooses for other players.
The runtime feature remains unfinished. This document defines its implementation and acceptance boundaries.

## Source baseline

Research uses main `706d44b97274a915c98f405d332c51cba93594ef`.
Line references below describe that commit, not a future implementation.

| Source | Finding |
| --- | --- |
| [#641](https://github.com/jarrodjohnson-gif/emberisle/issues/641) | The owner approved Jelly/Classic, local preference, separate lazy land builders, shared surroundings, and a possible Classic lite board. |
| `legacy/terrain-v1/README.md:1` | The archive identifies snapshot `cd84ca0`; its files are neither built nor type-checked. |
| `legacy/terrain-v1/terrain.ts:509`, `:890`, `:922`, `:1478` | `sculptHex`, `tileMaterial`, `PropKit`, and `decorate` supply the archived terrain and props. |
| `legacy/terrain-v1/isle-renderer.ts:1430` | `landHex` combines those functions with obsolete renderer-owned tokens and pick meshes. |
| `legacy/terrain-v1/isle-renderer.ts:43` | The archive uses terrain-dependent heights, unlike today's constant top surface. |
| `src/lib/scene/isle-renderer.ts:56` | Current `topOf` uses `TILE_Y + BLOCK_H` for every terrain. |
| `src/lib/scene/isle-renderer.ts:1496` | Current construction yields, compiles, checks generation ownership, and swaps the complete land appearance. |
| `src/lib/scene/isle-renderer.ts:1557` | `buildLand` currently also resets shared tokens, pickables, shores, and ocean life. |
| `legacy/terrain-v1/terrain.ts:427`, `:642` | The clay pit apron depends on lattice resolution and covers deliberately lowered ground triangles. |
| `legacy/terrain-v1/terrain.ts:901`, `:920` | Shared prop materials and shape caches require explicit ownership when restoring repeated switching. |
| `legacy/terrain-v1/isle-renderer.ts:794`, `:984`, `:1148` | Archived occlusion adjustment, animation, and proxy synchronization live outside terrain.ts. |
| `src/lib/scene/jelly-board.ts:346` | `JellyBoard` owns its decorative group, batches, clocks, and cancellation-aware build. |
| `src/lib/game/store.ts:163`, `:955` | Water/View preferences already use guarded device storage and page-local state. |
| `src/components/scene/IslandCanvas.tsx:31` | The scene bridge transfers presentation preferences independently from canonical game state. |
| `scripts/tokens-prove.mjs:40`, `:200` | Existing token checks depend directly on Jelly clearance and occlusion helpers. |
| `tsconfig.json:16` | Only current `src` and Vite configuration enter the TypeScript compilation scope. |

No existing design specifies a Classic selector or builder lifecycle.
[terrain.md](terrain.md) records the archived appearance; it does not define this setting.
Its historical performance numbers cannot establish today's Classic cost.
The archived source uses `RINGS = 18`; terrain.md's earlier description says twelve rings.
The implementation must measure its actual restored geometry.

## Appearance boundary

Classic means the sculpted terrain archived in `legacy/terrain-v1`, not the original painted placeholders.
Retain the archive unchanged as provenance.
Restore its terrain code into a current lazy module; never import the archived renderer into production.
Keep the distinctive sculpt, strata, terrain palette, deterministic variation, and identifiable props.
Adapt its placement and quality to today's common scene contract.

Both looks use the current ocean, shore, harbor, tokens, buildings, paths, Bruno, lighting, and camera.
Classic does not automatically select slab pieces or a plain harbor.
Existing developer overrides for those features remain independent.
Changing the land look does not change water, view, sound, or motion preferences.

Use today's constant `topOf` for both looks.
Pass today's tile origin and slab height into the restored sculpt builder.
Keep the terrain's token center and piece-support rim exactly on that plane.
Do not restore the archive's terrain-dependent `hexHeight` placement.
Render missing neighbors using canonical axial coordinates when calculating coastal sculpt edges.

The archive's `LIGHT`, `PAINT`, `PROP`, and `STRATA` imports still exist in `palette.ts`.
That compatibility does not prove the archived shaders or geometry compile today.
Validate shader hooks against the installed three.js revision before accepting the restored builder.
Retain the current light rig; do not install archived lights or post-processing.

## Builders and ownership

Introduce a small `LandAppearance` interface in `src/lib/scene/land-appearance.ts`.
Keep the interface module free of terrain geometry imports.
Define the concrete Classic adapter in `src/lib/scene/classic-board.ts`.
Restore sculpt helpers into `src/lib/scene/terrain-classic.ts`.
Load that adapter using a dynamic import, independently from `jelly-board.ts`.
Neither default startup nor a Jelly-only session may request the Classic chunk.

| Interface member | Contract |
| --- | --- |
| `group` | Contains only this appearance's sculpted ground, props, and their private animation helpers. |
| `update(t, all, snap)` | Updates local presentation; snap produces a stable reduced-motion pose. |
| `glow(id, level)` | Displays the existing paying-hex signal without creating another payout event. |
| `roll(ids)`, `tap(id)` | Preserve existing presentation hooks; they never dispatch game actions. |
| `robber(id)` | Applies the existing blocked-hex presentation without stealing shared Bruno ownership. |
| `busy()` | Reports pending presentation work without keeping idle frames permanently awake. |
| `setVisibilityContext(snapshot)` | Copies camera/view and token glyph poses for occlusion adjustment; never receives token objects or mutable scene references. |
| `groundAt(id, dx, dz)` | Returns world height for existing Bruno placement; missing IDs return a non-finite value. |
| `stats()` | Reports actual quality, draw calls, triangles, and owned object counts. |
| `dispose()` | Releases owned resources once; repeated cancellation must remain safe. |

Factories receive immutable hex descriptors, deterministic seeds, quality, and a cancellation/yield callback.
Classic additionally needs each hex's axial coordinates or a derived coastal mask.
Do not pass mutable `GameState` or an action dispatcher into either factory.
The Classic adapter owns archived `PropKit`, terrain materials, proxy motion, and any token-occlusion adjustment.
Its animation must use scene time and local deterministic seeds, never game RNG.
Port required archived animation behavior deliberately; the archived renderer itself remains reference material.
Extract its occlusion adjustment and proxy synchronization into the adapter, with explicit camera inputs where required.
The renderer calls `setVisibilityContext` before publication and after orbit, view, viewport, or token-pose changes.
Its immutable snapshot includes camera position/projection, view mode, and token world poses, scales, and glyph bounds.
The adapter copies scalar data and updates only its own props.
It cannot change tokens, camera, highlights, or shared objects.
Visibility adjustment must settle before the same frame publishes the corresponding token pose.
Account for archived module-level shared materials and geometry caches.
Define cache lifetime and reference ownership; disposal must neither leak instances nor invalidate a later Classic build.
Reduced motion freezes decorative motion and settles tap/roll transforms immediately.

The renderer owns canonical pick meshes, highlights, tokens, pieces, Bruno, shores, ocean, camera, and action callbacks.
Builders cannot register pickables or attach tokens.
The old `landHex` token and picking side effects must not survive the adapter.
Preserve public IDs and all vertex/edge/hex hit targets.

Refactor appearance replacement away from `buildLand`'s complete board rebuild.
Only a canonical board change may rebuild shared board objects.
A look change must preserve shared object identities, pan, view, pending selection, active turn cues, and animation clocks.
Do not replay a roll, landing sound, paying-piece tick, or robbery when appearance changes.
Apply current blocked-hex and glow state to the replacement before presenting it.

Keep `jellyBoard` as Jelly-specific proof access during migration.
Add appearance-neutral clearance and occlusion diagnostics for Classic acceptance.
Never return a Classic adapter while pretending it is a `JellyBoard`.
Keep existing Jelly-only proofs unchanged unless their assertion is intentionally generalized with equivalent coverage.

## Preference and control

Add a Board row beside Water and View in the existing Table menu.
Offer exactly Jelly and Classic, with a single selected `aria-pressed` control.
Use existing 44-pixel control sizing and visible focus treatment.
No new screen, modal, account, host setting, or network message is required.
Preserve menu focus and keep all existing controls reachable at 320-pixel width.

Store `jelly` or `classic` under `emberisle-board-look`.
Validate reads; absent, invalid, or inaccessible storage means Jelly.
Catch reads and writes; a storage exception must still permit a session-local choice.
Apply the preference to title, lobby, practice, hotseat, online play, and spectating in that browser.
A second browser may independently display the other look for the same online room.

“Per player” means the existing local presentation-preference boundary, like Water and View.
It does not imply authenticated profile synchronization or a separate preference for each hotseat seat.
Future profile synchronization requires its own accepted contract.
Changing names, joining another room, or starting a rematch does not erase the local choice.
A renderer remount reads the store's current choice rather than resetting it.

## Loading, failure, and quality

Track requested look separately from displayed look and loading/error status.
For the same canonical land identity, keep the displayed appearance while the requested replacement builds.
A canonical land change immediately discards the incompatible appearance before publishing new tokens or pick meshes.
Use the new board's stand-in slabs while its requested appearance builds.
Never retain old terrain under a different deal, topology, or terrain assignment.
On initial load, keep the current playable stand-in slabs until the requested appearance is ready.
Never show partial Classic props arriving across successive visible frames.
Yield between bounded build units and preserve first-frame interactivity.
Compile shaders before the atomic swap where parallel compilation is available.

Every request owns a generation token, including look changes, canonical board changes, and renderer disposal.
Recheck ownership after import, each yield, shader compilation, and immediately before publication.
A stale completion disposes its own resources and cannot overwrite the newest request or shared scene.
On success, attach the complete replacement and detach the previous appearance within one frame.
Dispose the previous appearance only after the replacement is published.

Use the current lazy-load retry policy: initial attempt plus at most five retries, spaced four seconds apart.
Use `chunkUrl` and fresh retry queries for failed module URLs, as the current Jelly loader does.
Bound attempts to the active request; cancellation suppresses scheduled retries and stale error reporting.
An import, build, or compilation failure preserves only an appearance matching the current canonical land identity.
Otherwise, preserve the current board's stand-in slabs.
Never rewrite the stored choice because loading failed.
Show “Classic could not load” or “Jelly could not load” with a Retry action in the existing menu row.
A successful retry clears that message. Avoid a blocking alert or an automatic page reload.

Keep quality separate from appearance.
Preserve the existing software-GPU detection and `emberisle-jelly=full|lite` developer override.
Treat that legacy override as the existing quality choice, not a migration into the new appearance preference.
Fresh software-GPU sessions still request Jelly and retain today's Jelly lite behavior.
An explicit Classic choice on that device requests Classic lite.
No performance claim automatically changes a user's chosen appearance.

Classic lite keeps the sculpted ground and strata, with reduced lattice resolution and no decorative props.
Keep token pads, piece rims, coastal seams, and terrain identity intact at the lower resolution.
Choose lattice resolution using measured geometry and frame cost, not the archive's full-detail constant.
Recompute every resolution-dependent mask and the clay pit apron for that chosen lattice.
The pit apron must cover intentionally lowered ground triangles without cracks at any allowed resolution.
Compare Classic lite with current Jelly lite on the same fixture, browser, software GPU, viewport, and water path.
Require median and p95 frame intervals no worse than baseline by more than ten percent across three interleaved runs.
If that gate fails, optimize Classic lite before enabling it; keep the existing lite board as the default throughout.
Software measurements establish this fallback gate only; real-device speed remains a separate claim.

Both Classic qualities retain playable stand-ins after total construction failure.
Surface requested look, displayed look, quality, readiness, and failure status in test diagnostics.
Readiness means a complete appearance is visible, never merely an imported chunk.

## Acceptance matrix

Use deterministic deals covering every terrain and every harbor type.
Include repeated terrain types, both cameras, an occupied board, a blocked hex, and a paying roll.
Run browser proofs serially.

| Check | Exact evidence |
| --- | --- |
| Source fidelity | Compare Classic screenshots with the archived sculpt; verify six recognizable terrains and retained strata. |
| Appearance isolation | Two clients show different looks in one room; canonical state, actions, save bytes, and event counts remain identical. |
| Startup chunks | Network assertions show no Classic request during Jelly-only startup and no premature import before first board draw. |
| Switching | Jelly→Classic→Jelly preserves camera matrices, shared object identities, selection, highlights, board IDs, and pending actions. |
| Cancellation | Delayed imports/builds plus rapid alternating choices, rematch, rebuild, and disposal never publish stale groups. |
| Failure | Inject import, construction, and compile failures; only matching land stays visible, retries remain bounded, and explicit Retry recovers. |
| New deal | Delay or fail appearance loading during changed topology/terrain; new stand-ins replace old land before new tokens/picks render. |
| Storage | Valid, invalid, missing, blocked-read, and blocked-write cases retain correct session behavior and independent browser choices. |
| Geometry | Verify clay pit apron coverage at every quality resolution, including grazing camera angles. All canonical token pads and piece rims match current topOf; corners, edge rests, coastal gaps, and Bruno placement stay valid. |
| Tokens | Generalized diagnostics prove clearance and unobscured numerals for both looks, cameras, reduced motion, and rebuilt seeds. |
| Presentation | Paying glow and blocked-hex state survive switching; no repeated sound, payout, drop, or game action occurs. |
| Disposal | Repeated switches stabilize renderer resource counts; no owned meshes, materials, timers, or build callbacks leak. |
| Menu | Test 320×568, 440×956, 956×440, and 1280×720; 44-pixel targets, focus, scroll reachability, and unchanged map insets hold. |
| Quality | Exercise both appearance choices under forced full/lite, detected software rendering, and reduced motion. |
| Fallback cost | Paste baseline and Classic-lite median/p95 values from the three interleaved runs described above. |
| Build cost | Paste measured gzip by chunk and dependency graph; Classic stays outside initial IslandCanvas and Jelly dependency paths. |

A new direct command, `node scripts/classic-board-prove.mjs`, owns focused Classic browser coverage.
Pure lifecycle and selection cases may use a separate `scripts/classic-board-state.test.mjs` with Node's test runner.
Neither command may silently skip the requested look because the chunk failed.
Use explicit failure fixtures rather than weakening success-case readiness assertions.

Run `typecheck`, `build`, `size-prove`, `client-prove`, `tokens-prove`, `board-look-prove`, and `idle-prove`.
Also run `touch-place-prove`, `keyboard-place-prove`, `hole-prove`, and `restore-prove` against the integrated feature.
Retain the current required server and browser CI checks.
Register new proofs only after package/CI reservations release.
Do not increase existing bundle budgets without measured need and fresh ownership approval.
No browser tests ran during this documentation-only research.

## Implementation boundaries

The next implementation layer contains three bounded contracts, recorded as tracker children after design review.
These boundaries describe architecture, not a second task list.

1. **Restored builder.** Add `land-appearance.ts`, `terrain-classic.ts`, `classic-board.ts`, and a focused isolated builder proof.
   Verify archived compatibility, height normalization, quality reduction, animation hooks, ownership, and disposal without changing the default renderer.
2. **Atomic scene selection.** Integrate the common appearance interface and cancellable lazy factory into `isle-renderer.ts`.
   Add direct lifecycle and switching coverage; preserve the existing Jelly surface and shared scene objects.
3. **Local control and integration.** Wire preference/store, `IslandCanvas.tsx`, TableMenu controls, diagnostics, cross-look proofs, and final registration.
   Complete the runtime parent's acceptance, including reduced motion, software fallback cost, and unchanged canonical data.

Each child must remain one session, one PR, and one focused acceptance command.
Split again before claiming if implementation evidence exceeds that limit.
Existing renderer, store, scene bridge, TableMenu, package/CI, budget, and wildcard proof reservations remain binding.
A new filename does not bypass an active `scripts/*-prove.mjs` reservation.
Design acceptance does not release those reservations or authorize conflicting implementation.
The parent #641 remains unfinished until the final integrated runtime proof passes.
