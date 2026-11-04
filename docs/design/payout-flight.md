# Payout goods flights

Issue #740 specifies the payout already approved in #642.
Research #739 is accepted through #744.
This design changes presentation only. Rules, turns, sound identity and hand layout remain authoritative.

## Source contract

Inspected main `706d44b97274a915c98f405d332c51cba93594ef` on 2026-10-17.
Line references describe that baseline.

| Evidence | Contract |
| --- | --- |
| `src/lib/game/types.ts:143` | `lastProduction` contains public grants with optional vertex IDs. |
| `src/lib/game/rules.ts:332` | Production records actual payments after bank shortages and blocking. |
| `src/lib/game/rules.ts:374` | `payingHexes` derives paid hexes from grants. |
| `server/host.mjs:408` | Opponent views omit resource hands; watchers have no private hand. |
| `src/lib/scene/isle-renderer.ts:596` | Payer pulses use canonical vertices; unknown vertices remain silent. |
| `src/lib/scene/isle-renderer.ts:642` | Live production requires the same island and exactly one additional roll. |
| `src/components/game/Dice.tsx:61` | Dice hold for 900 ms, then settle for 220 ms. |
| `src/components/game/GainFloats.tsx:16` | Gain lines last 2200 ms, staggered by 150 ms. |
| `src/components/game/Hand.tsx:192` | Hand mounting follows the current local seat and game phase. |
| `src/components/scene/IslandCanvas.tsx:33` | Store changes synchronize scene state and HUD measurements. |

See [board research](../research/board-moments.md), [tokens](tokens.md), and [Jelly Ocean](jelly-ocean.md).
The shared centre contract belongs to [#721](https://github.com/jarrodjohnson-gif/emberisle/issues/721).

## One canonical batch

Capture grants from each eligible live roll once.
Use a client session generation, island identity and roll counter as the batch key.
Include `synced`, local-seat identity and spectator status in the generation reset boundary.
Do not use `seq` alone: several ordinary actions can accompany one roll.
Do not reconstruct production from dice, building counts, hand differences, logs or bank totals.

| Grant field | Visual meaning |
| --- | --- |
| `hex` | Resolve the paying hex's world origin. Skip a missing hex. |
| `player` | Identify the public recipient and decide whether a visible local hand destination exists. |
| `res` | Choose log, brick, wool, sheaf or ore geometry and the matching local resource card. |
| `n` | Preserve the actual positive integer quantity in batch metadata. Never substitute expected production. |
| `vertex?` | Resolve payer pulse and optional origin direction; never require it for a valid hex flight. |

Reject unknown resources, unknown recipients, nonfinite quantities and nonpositive or fractional quantities.
Skip invalid grants individually; do not infer replacements.
Keep canonical grant order for deterministic visual selection.
Aggregate grants sharing `(hex, player, res)` by summing `n`.
Do not merge distinct paying hexes.
Retain vertex IDs separately for the existing pulse path.

A stronghold's grant normally carries two, but a partial bank payment can carry one.
Two recipients with insufficient bank stock receive no grants for that resource: draw nothing for it.
One recipient receives only the recorded partial grants, including whichever hex actually paid.
A blocked hex produces no flight unless the active rules explicitly permit its recorded payment.
Never reapply blocking rules to valid grants; the wayfarer can move after production in a coalesced snapshot.
Seven, empty production and absent legacy `lastProduction` produce no flights.
Starting goods, trades, fortunes and theft are outside this effect.

## Goods and destinations

Use compact, unlit Jelly Ocean goods with existing resource colors.
Use one merged geometry per resource: paired logs, a brick, wool tuft, wheat sheaf and faceted ore.
Keep shapes recognizable without labels, outlines, sparkles or trails.
Draw one object for a grouped grant of one, and at most two for larger quantities.
These objects illustrate delivery; existing gain text carries exact numbers.

For each group, choose the first valid adjacent vertex in canonical grant order.
Place its origin 0.58 world units from the hex centre toward that vertex.
If no grouped grant has a valid adjacent vertex, use the fixed positive world-X direction.
Place it 0.20 units above that hex's rendered cap surface.
Keep the whole initial object outside the token's 0.39-unit exclusion disc.
Use numeric coordinates and stable IDs; never retain terrain or building mesh references.

Only a visible local resource card receives a flight.
Online and practice use the local seat. Hotseat uses the currently displayed hand's seat.
Never select a hand using the roller's ID alone.
For opponents and watchers, preserve the existing public hex flash and payer pulse.
Do not create opponent hand cards, seat-rail destinations or new centre text.
Public grants remain available to the existing public presentation without revealing any current private holdings.

Expose resource-card anchors through a small DOM registry keyed by `(seatId, resource)`.
Register on mount, update after layout, and unregister on unmount.
Publish only rectangles and identity; do not publish counts or complete player objects.
Require a connected, visible card with positive dimensions inside the canvas and visual viewport.
Require the entire target icon rectangle to survive its scrolling ancestors' clipping.
Reject targets obscured by a modal, recovery screen or another HUD surface.
Use DOM hit testing at the icon centre to verify its visible owner.
The overlay must never participate in that hit test.

Aim at the resource icon's centre, not the count or label.
Missing, clipped, covered or hidden targets omit delivery; existing public cues remain.
Never invent an offscreen hand position or queue delivery until a sheet closes.
A hand mounting in the same production commit can qualify after layout, before flight admission.

## Projection and motion

Use a dedicated transparent overlay scene in the existing renderer and canvas.
Render its goods after the world pass with depth testing disabled.
Use an orthographic camera measured in canvas CSS pixels; clear depth before this pass.
Keep the canvas behind HUD text and controls.
This avoids a second WebGL context and allows goods to disappear beneath the target card.

Project the world origin through the current world camera and canvas rectangle every active frame.
Convert DOM target coordinates to canvas-local CSS pixels by subtracting the canvas rectangle origin.
Do not multiply these coordinates by device pixel ratio.
Reject behind-camera origins and origins outside the visible canvas.
Never clamp an unseen source into a plausible paying hex.

At admission, size each object to 14 CSS pixels across, capped at 18 pixels during its pop.
Run a 120 ms upward pop of 10 pixels, followed by a 480 ms eased flight.
Stagger the second object by 40 ms; stagger grouped grants by 40 ms, capped at 200 ms.
Use a quadratic arc rising at most 32 pixels above the direct segment.
Shrink to 6 pixels during the last 120 ms and disappear beneath the card.
Do not bounce the card, alter its count or trigger another hand flash upon arrival.

Camera orbit, zoom, Home and view changes reproject the source without restarting elapsed time.
Read the target's current rectangle while active, including hand entry transforms.
Interpolate using the original progress and newly measured endpoints.
If camera movement makes the source invalid, cancel that object's remaining travel.
Resize and orientation changes cancel the whole batch to avoid sweeping across the new layout.
A destination losing eligibility also cancels its remaining objects immediately.
Canceled objects never arrive later and never play a sound.

## Timing and centre ownership

Existing hex flashes, payer pulses and gain ticks retain their current timing.
Capture the flight batch immediately, but admit travel only when that roll's centre moment releases.
Use the same release edge and 1120 ms absent-moment fallback as GainFloats.
The fallback must not bypass an active roll moment.
Early user dismissal releases the eligible batch with the gains.
Associate the release with the captured batch key; an unrelated later roll cannot release stale goods.

GainFloats keeps its existing 2200 ms duration and 150 ms stagger.
Do not shorten its reading time or defer its start until flights finish.
Flights neither acquire nor hold the shared centre slot.
Give Dice, GainFloats, human setup prompts and TurnMoment priority over decorative goods.
Existing setup prompts live in the HUD banner above the canvas (`src/components/game/Hud.tsx:261`).
Their HUD layer already occludes goods; they need no additional centre registry publisher.
Bot text keeps the preemption and expiry contract specified by #721.

Publish active centre text bounds to the flight renderer after layout.
Suppress an object on every frame where its projected bounds intersect those bounds plus 8 pixels.
Keep its original clock running while suppressed.
This prevents a decorative arc from covering readable text without extending either presentation.
Do not create another moment queue, live region or goods announcement.

The flight layer calls no audio API.
`stepPayers` remains the gain-tick owner, including its existing stagger and sound cap.
The store and dice remain their existing sound owners.
Muted, canceled, legacy-vertex and coalesced cases must never add a second gain tick.
Input, bots, turn timers and authoritative state never wait for flights.

## Bounds and lifecycle

Keep at most one batch, 24 grouped-grant records and 24 active goods meshes.
Prefer eligible local destinations when applying the record cap; omit excess decoration deterministically.
Within each group, allocate its first object before allocating any group's second object.
Keep at most one waiting batch; a newer eligible roll replaces and cancels the older batch.
Expire waiting work 1500 ms after capture, even if its release remains blocked.
Finish all admitted objects within 840 ms of admission, including stagger.
Never extend either deadline because frames arrive late.

Share five geometries and five materials for the renderer's lifetime.
Use no per-frame geometry, texture, material or timer allocation.
Update only active objects; request full-rate rendering only while admitted objects remain.
One bounded wake at a pending admission is sufficient; waiting alone must not force continuous rendering.
Dispose shared GPU resources once with the renderer.
Remove registry subscriptions, timers and visibility listeners with their owning component.

| Boundary | Required behavior |
| --- | --- |
| First mount or first synchronized snapshot | Record a silent baseline, even when grants and dice already exist. |
| Same island, exactly one additional roll | Capture once; coalesced actions need no synthetic intermediate state. |
| Unchanged counter or multiple-roll jump | Draw no new batch; establish the new baseline. |
| Hidden page | Cancel active and pending work; retain no replay debt. |
| Visible again | Baseline the current snapshot before accepting another live roll. |
| Reconnect or changed `synced` | Cancel immediately; first restored state remains silent. |
| Hotseat handover or changed local identity | Cancel; register the new hand and baseline without replay. |
| Spectator transition | Cancel; never inherit the previous seat's destination. |
| Rematch, new island, title, lobby, leave or game over | Cancel and reset the generation. |
| Ordinary piece/terrain rebuild | Resolve numeric anchors afresh; preserve progress and batch identity. |
| Renderer replacement or recovery | Dispose old work; baseline the replacement silently. |
| Reduced motion initially enabled | Omit all flight objects; preserve existing static cues and readable gains. |
| Reduced motion enabled during travel | Cancel immediately; disabling it never replays canceled work. |
| Unmount or renderer disposal | No timers, subscriptions, registered anchors or live goods remain. |

A session generation must change even when a rematch happens to reuse identical land geometry.
Do not rely only on the renderer's land key for session isolation.

## Implementation boundaries

These are expected implementation paths, not reservations or instructions to start runtime work.
Fresh claims must cover every actual change, including files currently reserved by other builders.
The design PR changes only this document.

| Expected file | Responsibility |
| --- | --- |
| `src/lib/scene/payout-flight.ts` | Pure bounded batch planning, progress, geometry ownership and overlay rendering. |
| `src/lib/scene/isle-renderer.ts` | Projection, overlay pass, wake/disposal and rebuild-safe coordinates. |
| `src/components/game/payout-anchors.ts` | Visible local-card rectangles and centre-exclusion rectangles; no hand contents. |
| `src/components/game/Hand.tsx` | Resource-icon anchor registration and cleanup. |
| `src/components/scene/IslandCanvas.tsx` | Session, synchronization, visibility and local-seat bridge. |
| `src/components/game/Dice.tsx` | Expose keyed release and active centre bounds without changing roll timing. |
| `src/components/game/GainFloats.tsx` | Publish centre bounds without changing gain detection or reading time. |
| `src/components/game/TurnMoment.tsx` | Publish active centre bounds. |
| `scripts/payout-flight-prove.mjs` | Deterministic planner/lifecycle assertions and focused browser fixtures. |
| `package.json`, `.github/workflows/ci.yml` | Register the focused proof after separate shared-file reservations. |

Integrate with #721's accepted centre owner when available; publish its bounds through the same bridge.
If that integration needs additional files, name and reserve those exact paths before editing.
No rules, wire-format, host projection, sound asset or private-hand changes are required.

## Acceptance fixtures

Run the focused proof from a fresh clone of the implementation branch.
Use virtual clocks for exact timing and bounds; use browser frames for projection and visibility.
Test desktop 1280×720, portrait 390×844 and 440×956, and landscape 844×390 and 956×440.
Include safe-area insets, coarse pointers and DPR 1, 2 and 3 with existing renderer caps.

| Fixture | Exact expected outcome |
| --- | --- |
| One outpost; one local grant | One matching object originates on the paying hex and reaches its resource icon. |
| Stronghold full and partial payment | Two objects for `n=2`; one for `n=1`; metadata preserves actual quantity. |
| Multiple hexes sharing resource and token | Each recorded paying hex retains its origin; an unpaid hex stays silent. |
| Short bank with multiple recipients | Zero objects for the denied resource, regardless of buildings or dice. |
| Blocked hex and empty production | No fabricated objects; canonical paid grants remain the only input. |
| Missing legacy vertex | Valid hex-to-local-card travel; no invented payer pulse or added sound. |
| Invalid grant mixed with valid grant | Invalid entry omitted; valid entry still presents. |
| Opponent production and watcher | Public flashes/pulses only; zero hand destinations and zero private-hand reads. |
| Hotseat roll followed by handover | Old work canceled before a new seat's anchor can receive it. |
| Mounted, absent, clipped and covered hand | Only the visibly eligible local icon receives travel. |
| Coalesced roll plus build/trade/pass | One canonical batch; no reconstruction from changed private totals. |
| Repeated snapshot and multi-roll jump | No duplicate or historical batch. |
| Dice normal, dismissed and absent | Admission follows release; fallback never bypasses an active moment. |
| Centre gains and bot/turn text | Text stays readable; intersecting goods are suppressed without changing deadlines. |
| Resize, orientation and moving camera | Resize cancels; camera reprojects; invalid sources never snap to screen edges. |
| Rebuild halfway through flight | Stable identity, unchanged deadline, no references to disposed world meshes. |
| Hidden, reconnect, rematch, leave and recovery | Immediate cancellation and silent next baseline, including reused island geometry. |
| Reduced motion and live preference change | Zero traveling objects; existing static gains retain their full reading time. |
| Overflow and back-to-back rolls | One batch, at most 24 records and meshes; deterministic omissions and no backlog. |
| Slow frames and disposal | Deadlines expire absolutely; all resources and callbacks release exactly once. |

Assert byte-equivalent game state, RNG, legal targets and outgoing intents with the effect enabled or disabled.
Assert unchanged sound calls, hand counts, gain-line durations and dice timing.
Assert no new pickables, pointer interception, focus changes or accessibility announcements.
Check idle rendering, production flashes, hand cards, touch placement and existing bundle budgets during implementation validation.
Screenshots must show distinct goods, unclipped targets and readable gains at every required orientation.
This design has source validation only; runtime and visual acceptance belong to the implementation proof.
