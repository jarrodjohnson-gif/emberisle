# Board award markers

- Design: [#743](https://github.com/jarrodjohnson-gif/emberisle/issues/743), beneath [#642](https://github.com/jarrodjohnson-gif/emberisle/issues/642).
- Research: [board moments](../research/board-moments.md), accepted through closed #739 and merged #744.
- Source baseline: `706d44b`, inspected 2026-10-17.
- Builder: Codex-awards-743, GPT-6.1 Sol.
- Evidence: source inspection only; no runtime or browser validation.

## Approved scope

Show a banner along the canonical longest-path holder's route.
Show one flag on the canonical largest-army holder's stronghold.
Use the current Jelly Ocean piece style and seat colours.
Use static decorations, including outside reduced motion.
Add no sound, pause, announcement, control or new game piece.
Leave all HUD award counts, badges and accessible award descriptions to #645.

These anchor choices complete #642's approval without changing rules or introducing another location.
A missing stronghold omits the flag.
Multiple strongholds use the smallest vertex ID.
Neither case needs a new player choice or owner decision.

## Authoritative inputs

| Contract | Current source |
| --- | --- |
| Canonical holder IDs | [types.ts](../../src/lib/game/types.ts#L126): `longestRoad` and `largestArmy` |
| Existing trail semantics | [rules.ts](../../src/lib/game/rules.ts#L179): `roadLength` |
| Thresholds and retained ties | [rules.ts](../../src/lib/game/rules.ts#L211): `updateLongest` and `updateArmy` |
| Public topology and buildings | [types.ts](../../src/lib/game/types.ts#L60): `Vertex` and `Edge` |
| State delivery and piece rebuild | [isle-renderer.ts](../../src/lib/scene/isle-renderer.ts#L641): `setBoard` |
| Recreated pieces and stable landing keys | [isle-renderer.ts](../../src/lib/scene/isle-renderer.ts#L1651): `buildPieces` |
| Terrain-relative piece heights | [isle-renderer.ts](../../src/lib/scene/isle-renderer.ts#L1832): `hexTops`, `vertexTop`, `edgeTop` |
| Legal targets and picking objects | [isle-renderer.ts](../../src/lib/scene/isle-renderer.ts#L1757): `buildMarks` |
| Existing stronghold geometry | [pieces-jelly.ts](../../src/lib/scene/pieces-jelly.ts#L73) and [isle-renderer.ts](../../src/lib/scene/isle-renderer.ts#L2159) |
| Renderer cleanup | [isle-renderer.ts](../../src/lib/scene/isle-renderer.ts#L752): `dispose` |

Read ownership directly from holder IDs on each accepted state.
Never award a marker by comparing paths, knights, points, remaining pieces or log messages.
Null holders produce no corresponding decoration.
An unknown holder or invalid anchor produces no corresponding decoration.
Keep canonical state untouched when decoration cannot resolve an anchor.
Watchers, online seats, practice and hotseat resolve the same public anchors.
No private hand, fortune identity, RNG or protocol addition is required.

## One canonical trail traversal

Extend the existing rules traversal rather than implementing another DFS inside the renderer.
Export `roadWitness(state, pid): { edgeIds: string[]; vertexIds: string[] }` from `rules.ts`.
Make `roadLength(state, pid)` return `roadWitness(state, pid).edgeIds.length`.
Preserve the existing `roadLength` signature and every existing rules outcome.
Keep the shared helper pure and free of renderer imports.

The implementation must retain the existing traversal's exact semantics:

1. Consider only edges whose `path` equals `pid`.
2. Start from every incident vertex, including opponent-occupied vertices.
3. Traverse each edge at most once within a candidate trail.
4. Permit repeated vertices, including cycles and fork junctions.
5. Stop immediately upon entering an opponent-occupied vertex after traversing an edge.
6. Permit an opponent-occupied vertex as the initial endpoint.
7. Keep the candidate with the greatest edge count.

Own buildings do not interrupt a trail.
Do not use a visited-vertex set or combine disconnected branches.
Do not count all owned edges as one route.
A closed trail may return to its starting vertex through unused edges.
An opponent-occupied start cannot become a passage when the trail returns there.

Resolve equal-length candidates with this total ordering:

1. Compare edge-ID arrays lexicographically, using raw JavaScript string ordering.
2. Compare vertex-ID arrays lexicographically if edge arrays match.
3. Prefer the smaller array at the first differing entry.

Enumerate both traversal directions through the same start-vertex search.
For cycles, enumerate valid starting vertices through that search too.
Choose among legal candidates only; never rotate a cycle across an opponent blocker afterward.
Sort incident edges and starting vertices with the same comparator for reproducible enumeration.
Never use locale sorting, coordinates, array insertion order, seat order or prior animation history.
The empty witness has empty edge and vertex arrays.
A nonempty witness has exactly one more vertex than edge.

Compute a witness only for the canonical `longestRoad` holder in the presentation adapter.
Never search other players to decide who deserves the banner.
A retained tie keeps the existing holder's banner, even when another player's path has the same length.
Use the returned ordered vertices to orient each edge segment.
Recompute after an owned path, building, topology or holder changes.
Cache by those public values; camera movement and clock/chat updates need no new traversal.
The supported inventory bounds a player's search to 15 paths.
For malformed input exceeding that bound, omit decoration rather than run an unbounded presentation search.
Do not impose that presentation guard on canonical rules evaluation.

## Banner geometry

Draw one narrow cloth strip on each edge in the chosen witness.
Together these strips form the banner along the route, including legal turns and loops.
Leave gaps at vertices so junctions, buildings and legal corner rings remain readable.
Use each edge midpoint, `edgeTop`, and the current path's orientation.
Each strip spans 60% of its edge length and measures at most 0.055 world units across.
Place its face 0.045 world units above the resting path's upper surface.
Resolve that surface from current piece geometry bounds during construction.
Store the resulting scalar height, never the piece mesh.

Use the holder's seat colour for the face.
Add a dark outer edge and a light inner seam so pale and dark seats remain distinguishable.
Use a forked end silhouette; colour alone must not identify the decoration.
Use opaque materials with depth testing enabled and no shadows.
Do not use glow, pulsing, cloth simulation, billboarding or always-on-top rendering.
A strip must never cover the full path width.

Do not draw a strip while its edge has an active piece landing.
Restore that strip at rest without restarting the landing or changing its clock.
A state rebuild midway through landing preserves this suppression using the existing stable `e:<id>` key.
Give legal marks and pending-placement cues priority over overlapping decorative strips.
Hide a strip on an actively highlighted or pending edge until that interaction clears.
Keep the witness unchanged while a strip is hidden.

## Army flag anchor

Filter vertices to buildings owned by `largestArmy` with kind `stronghold`.
Choose the smallest vertex ID using the same raw string comparator.
Choose from all eligible strongholds before any screen visibility checks.
Never switch anchors because another stronghold projects nearer the viewer.

With no eligible stronghold, show no army flag.
Keep the canonical award and its HUD representation unchanged.
Do not put the flag on an outpost, Bruno, a path, sea or an invented pedestal.
When the holder upgrades an outpost, recompute the anchor immediately.
A newly smaller stronghold ID replaces the earlier anchor deterministically.
An army transfer removes the old flag before creating the replacement.
If the new holder lacks a stronghold, only the old flag disappears.

Use one short pole and one pennant above the selected stronghold's resting roof.
Resolve the roof from the current stronghold geometry bounds.
Place the pole at the vertex centre, starting at the roof's upper surface.
Limit pole height to 0.12 world units and pennant width to 0.10.
Use a triangular pennant, seat-coloured face, dark edge and light seam.
Orient it along world positive X, independent of camera and wind.
Suppress the flag while that stronghold lands, using `v:<id>`.
Suppress it while its corner has an active legal or pending-placement cue.
Restore it directly at rest when these conditions clear.

## Bounds, camera and interaction

- Own all decorations in one dedicated `awardMarkers` scene group.
- Keep that group separate from pieces, legal marks, terrain and pickables.
- Disable raycasting on the group and every descendant.
- Never add award objects to `pickables` or attach game-action metadata.
- Allocate at most 15 banner segments and one flag assembly.
- Merge face, edge and seam geometry into one mesh per segment.
- Use at most two flag meshes: pole and pennant.
- Keep at most 17 live meshes, with no particles, timers, queues or DOM nodes.
- Reuse bounded materials; dispose owned geometries when replacing an assembly.
- Never modify piece transforms, terrain geometry, token clearance or legal target sizes.

Do not include decorations in camera-fit bounds.
Project each assembly's bounds into the current canvas and measured board hole after camera or layout changes.
Hide assemblies crossing that hole or canvas boundary; do not move them onto unrelated pieces.
Restore the same anchored assembly when it fits again.
Preserve existing orbit, zoom, Home, overhead and diorama behavior.
Do not move the camera to reveal a decoration.
Rendering a marker must not change pointer results or keyboard placement lists.
At every seat colour, retain visible face and contrasting edges against light and dark terrain.
Check these actual rendered edges at phone sizes; material swatches alone are insufficient.

## State and resource lifecycle

Store only holder IDs, edge IDs, vertex IDs, numeric transforms and owned decoration resources.
Never retain piece, legal-mark or terrain mesh references between rebuilds.
After `buildPieces`, resolve IDs against the current state and recreate necessary scalar anchors.
After `buildMarks`, apply legal-cue suppression without changing any mark.
During landing steps, update suppression from stable keys without retaining landing objects.

A normal duplicate state creates no extra geometry and no visual replay.
A holder change replaces the affected assembly atomically within the state update.
A path cut recomputes the witness from the new canonical state.
Coalesced snapshots render only the final holders and route; never fabricate intermediate transfers.
Initial load, reconnect and watcher entry draw the current decorations immediately at rest.
There is no acquisition animation to replay or queue.

On hide, stop decoration work and preserve only the latest public IDs.
On visibility return, rebuild from the latest state before drawing.
On island replacement, rematch, title entry or leave, clear assemblies and cached topology immediately.
Do not decorate the title's demo island.
On renderer disposal, detach the group and dispose every owned geometry and material exactly once.
Remove any added listeners and release ID caches.
Existing shared piece materials remain owned by their current subsystem.
Reduced motion uses the same static geometry, sizes and anchor rules.
Marker presence never requests continuous frames; wake only on state, visibility or suppression changes.

## Expected runtime boundaries

This design changes only this document.
A later runtime claim must reserve these exact expected files afresh:

| File | Responsibility |
| --- | --- |
| `src/lib/game/rules.ts` | Shared witness traversal; unchanged `roadLength` results and ownership rules |
| `src/lib/scene/award-markers.ts` | Pure public anchor adapter, bounded geometry and owned cleanup |
| `src/lib/scene/isle-renderer.ts` | State integration, terrain heights, landing suppression, camera clipping and disposal |
| `server/award-witness-prove.mjs` | Canonical trail fixtures and existing length regression checks |
| `scripts/award-markers-prove.mjs` | Focused renderer fixtures and lifecycle assertions |
| `package.json` | Register the focused proofs after shared-file reservations release |
| `.github/workflows/ci.yml` | Run focused proofs after shared-file reservations release |

The renderer reservation in #538 must release before overlapping implementation starts.
Do not add HUD components, styles, host messages or another award observer.
Do not modify `pieces-jelly.ts`; inspect its bounds through the existing renderer construction.
Do not duplicate payout, bot cue, landing-dust or sound ownership.

## Focused acceptance matrix

Use explicit public topology fixtures and canonical holder IDs.
Test the shared traversal separately from renderer geometry.
Compare existing `roadLength` outputs before and after extraction across every existing rules fixture.
Preserve all existing rules proofs, including retained ties and opponent cuts.

| Fixture | Required result |
| --- | --- |
| No holders, including players below thresholds | Zero banner segments and zero flags |
| Equal qualifying paths, canonical holder null | No banner; renderer never awards the tie |
| Equal paths with retained holder | Only the canonical holder's witness receives strips |
| Holder transfer, loss below five, or cut producing a no-holder tie | Old strips disappear; only final canonical ownership appears |
| Fork with a short branch | Witness chooses the longest legal trail rather than all branches |
| Equal-length branches and reversed input arrays | Identical ordered edge and vertex IDs |
| Closed cycle and cycle with a tail | No repeated edge; repeated vertices permitted; deterministic legal start |
| Opponent building at a junction or cycle start | Arrival stops; starting there remains legal; no traversal through blocker |
| Own building at that junction | Traversal continues unchanged |
| Disconnected owned paths | Only one maximal trail receives strips |
| Army transfer and retained knight tie | Flag follows canonical ID only; tie never infers another holder |
| Army holder with only outposts | No flag, no invented anchor, canonical award unchanged |
| One stronghold, multiple strongholds, reordered vertices | One flag at smallest eligible vertex ID |
| Upgrade creates the first or smaller-ID stronghold | Flag appears at the chosen roof after landing completes |
| Banner edge or flag anchor landing; rebuild midway | Suppress decoration until original landing ends; no pose or sound changes |
| Duplicate push, chat/timer update, coalesced transfer | Stable resources; no duplicate assemblies or historical replay |
| Initial load, reconnect, watcher and hotseat handover | Same public anchors; static baseline; no private input access |
| Legal marks and pending touch placement at decorated anchors | Cues stay legible; decorative suppression leaves legal IDs unchanged |
| Hide/show, new island, rematch, leave and disposal | Current-state rebuild or empty group; no stale references or resource growth |
| Reduced motion on entry and changed while playing | Static identical anchors; no frame loop or animation |

Run renderer fixtures at 1280×720, 390×844, 844×390 and 320×568.
Cover overhead and diorama, all four seat colours, simple sea and crystal sea.
Exercise orbit, zoom, Home and resize with markers present.
Assert camera matrices and fitted hole match the same fixture without markers.
Assert every pickable identity, legal edge/vertex/hex ID and keyboard placement choice remains unchanged.
Pick decorated edges and strongholds with mouse and touch.
Verify those picks invoke the same underlying action as the undecorated fixture.
Check projected clipping and edge contrast from rendered frames.
Count live meshes, geometries and materials over repeated transfers, rebuilds and disposal.
Assert no resources accumulate and no disposed piece references survive.
Run typecheck, build, rules proofs, pieces-land, keyboard-place, touch-place, board-look, idle and size proofs.
Record actual commands and results in the runtime PR.
This design makes no claim that those runtime checks have already passed.
