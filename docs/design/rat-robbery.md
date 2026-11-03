# Bruno's robbery rat

- Design: [#742](https://github.com/jarrodjohnson-gif/emberisle/issues/742), under [#642](https://github.com/jarrodjohnson-gif/emberisle/issues/642).
- Accepted research: [#739](https://github.com/jarrodjohnson-gif/emberisle/issues/739), [board moments](../research/board-moments.md).
- Source baseline: `706d44b`, inspected 2026-10-18.
- Builder: Codex-rat-742, GPT-6.1 Sol.
- Evidence: source inspection only. This document changes no runtime behavior.

## Result

A committed theft sends Bruno's shoulder rat to one victim building and back.
The outward leg carries nothing. The return leg carries one generic card back.
A move without theft never sends the rat or displays a card.
The rat never reveals a resource, private hand, fortune identity or random choice.
No animation delays rules, bots, input, state delivery or another player's turn.

Practice and hotseat can capture individual committed actions today.
Online seats and watchers omit the rat until the public-event prerequisite below ships.
A sequence increment alone does not prove one atomic action.
Public narration stays available when decorative travel is omitted.

## Current evidence

| Source | Finding |
| --- | --- |
| [rules.ts](../../src/lib/game/rules.ts), `stealTargets`, lines 162–175 | Targets exclude empty hands and require an opponent building adjoining the destination. |
| [rules.ts](../../src/lib/game/rules.ts), `stealOne` and `applyRobber`, lines 389–423 | Theft transfers one resource card. Movement can succeed without theft. |
| [rules.ts](../../src/lib/game/rules.ts), `applyAction`, lines 444–487 | Canonical narration reports victim and quantity without resource identity. |
| [rules.ts](../../src/lib/game/rules.ts), `moveRobber` and `playKnight`, lines 593–598 and 660–675 | Both action paths can move Bruno. A Wayfarer played with wayfarer mode off performs no robbery. |
| [store.ts](../../src/lib/game/store.ts), `dispatch`, lines 682–712 | Local rules return before state publication. Online dispatch only sends intent. |
| [store.ts](../../src/lib/game/store.ts), `soundsFor` and `hear`, lines 35–54 and 121–134 | FAHH substitutes for movement audio using adjacency, rather than confirmed theft. |
| [store.ts](../../src/lib/game/store.ts), connection callbacks, lines 1110–1145 | Welcome and reconnect establish recovery boundaries. |
| [host.mjs](../../server/host.mjs), `viewFor`, lines 408–437 | Live projections remove seed, RNG and opponents' resource hands. |
| [host.mjs](../../server/host.mjs), `botsOn`, lines 445–465 | Multiple committed bot actions can precede one state push. |
| [host.mjs](../../server/host.mjs), `pushState` and `play`, lines 547–565 and 1165–1178 | State delivery and committed human actions have separate boundaries. |
| [bruno.ts](../../src/lib/scene/bruno.ts), lines 104–147 | The shoulder rat exists; its idle transform currently updates each frame. |
| [isle-renderer.ts](../../src/lib/scene/isle-renderer.ts), lines 642–710 | Board updates move Bruno; movement lasts at most 900 ms. |
| [sound.ts](../../src/lib/sound.ts), lines 68–69, 99–105 and 123–169 | Existing meme volume, mute and bounded playback queue own sound policy. |

Line references describe this baseline. Function names remain the primary navigation aids.
Never parse the superseded “steals a card” log or canonical display prose.
Names can collide, change or contain punctuation. Log retention can also lose actions.

## Committed capture contract

Capture immediately after a successful rules result, before publishing another local action.
Accept only `moveRobber` or `playKnight` from that exact call.
Reject errors, unchanged states, missing players and malformed results.
Require the destination to differ from the previous robber hex.
Use the action actor, never the later state's current player.

At this trusted boundary, compare total resource-card counts for the actor and possible victims.
Require exactly one opponent to lose one card and the actor to gain one card.
Require every other player's total to remain unchanged.
Require the victim's building to adjoin the committed destination.
Any mismatch yields no robbery cue; never repair evidence by guessing.
This comparison uses one rules transaction, never an arbitrary pair of snapshots.
Do not retain per-resource differences after capture.

Emit this presentation record only after committing the successful result:

```ts
type PublicRobbery = {
  kind: "robbery";
  gameId: string;       // opaque game incarnation, never seed or RNG
  seq: number;          // committed resulting game sequence
  actorId: string;
  victimId: string;
  hexId: string;
  quantity: 1;
};
```

`gameId` changes on every new game, including identical-island rematches.
Use an in-memory local incarnation for local games; do not derive identity from terrain alone.
One robbery can occur per action. `(gameId, seq, kind)` identifies the event.
The record contains no action payload, resource key, hand array, deck data or fortune data.
A knight theft uses the same record. The record does not name its cause.
Zero-card moves produce no record, including moves beside empty opponents.
Multiple eligible victims with no selection can also produce movement without theft.
A rejected explicit empty victim produces neither movement nor a robbery record.
Do not represent an attempted theft as a successful one.

## Online prerequisite and coalescing

Current snapshots lack a typed atomic robbery record.
Do not infer theft from local intent, resource-hand changes, adjacency, log text or the final robber hex.
Do not infer intermediate routes from a sequence gap, even when the final geometry looks plausible.
Online seats and watchers therefore omit rat travel with today's protocol.
This safe omission does not block the local animation implementation.

A separate protocol leaf may deliver `PublicRobbery` records for all committed robberies.
It must capture each human, bot and recovery action at its actual commit boundary.
Centralize trusted capture rather than duplicating theft inference in each host action path.
Project the same public record to every seat and watcher.
Do not serialize raw before/after states into the event channel.

The proposed delivery contract attaches records to the state push they describe:

- Include opaque `gameId`, exclusive `fromSeq`, inclusive `toSeq`, `complete`, and `robberies`.
- Define `fromSeq` as the recipient's previously delivered state sequence, excluding that sequence.
- Require `toSeq` to equal the attached state's sequence.
- Set `complete` only when the envelope covers every commit in that interval.
- Bound retained pending robbery records to eight per recipient.
- On overflow, send `complete: false` and an empty list; establish the attached state as baseline.
- Send initial, resumed, restarted and rematch states as silent baselines without historical records.
- Keep records ephemeral. Never persist or replay them across host restarts or socket replacement.
- Validate integer bounds, known IDs, destination membership and unique sequence keys before presentation.
- Reject the entire envelope on duplicates, disorder, wrong incarnation or interval mismatch.
- Treat absent envelopes and unsupported protocol versions as silent baselines.

This envelope is proposed prerequisite work, not a description of today's wire format.
It needs protocol compatibility and projection tests before client consumption.
A live envelope containing exactly one robbery can support one route only when `robbery.seq === toSeq`.
Its covered interval is `(fromSeq, toSeq]`.
Require its destination to equal the attached state's robber hex.
Require its chosen victim building still to exist beside that hex.
Two or more robbery records in one envelope yield no rat routes.
Any action after that robbery yields no route, including unrelated actions and no-theft moves away and back.
The renderer cannot truthfully reconstruct those intermediate scenes from one settled board.
Consume omitted events so later snapshots cannot replay them.
Never use event delivery to rewind Bruno or replay rules.

[#725](https://github.com/jarrodjohnson-gif/emberisle/issues/725) owns optional exact online bot ordering.
This prerequisite covers successful robberies by every actor, including humans.
Reuse a compatible committed-event transport if #725 provides one.
Do not add a second general event stream, bot observer, action scheduler or bot target pulse.
Future leaves require fresh dependency and file checks before claiming shared transport files.

## Deterministic victim building

Use only the captured victim ID and destination hex.
Collect vertices whose building belongs to that victim and whose `hexes` include that destination.
Sort vertex IDs by ascending JavaScript code-unit order; choose the first.
Never use locale sorting, object enumeration, camera distance or building kind as a tiebreaker.
An outpost and stronghold qualify equally. Another victim's building never qualifies.
This anchor is a presentation convention, not a claim that cards belong to buildings.
No candidate means omission, without a substitute destination or invented victim.

Resolve that stable vertex ID against the current board when starting the route.
Derive its ground position using the renderer's existing vertex placement calculation.
Do not retain a piece mesh reference across `buildPieces` rebuilds.
Upgrading the same vertex preserves the anchor; changing ownership cancels the route.
Record destination and vertex IDs with the route for subsequent validation.

## Route and presentation

Wait for Bruno's existing movement to finish before starting rat travel.
The rat remains attached to his shoulder during that movement.
A pending event expires 1200 ms after capture or receipt if Bruno has not arrived.
This wait never blocks game state or input.

At departure, save the shoulder transform and resolve its world position.
Use a separate non-pickable effect group for the traveling rat and card.
Hide the shoulder rat during travel. Restore it on completion or cancellation.
Do not let Bruno's idle rat update overwrite the traveling rat's transform.
Reuse the existing rat geometry and approved appearance.
Use one plain opaque card back with identical faces and edges for every theft.
Use no resource colour, icon, text, fortune art or victim hand texture.

The route uses these fixed phases:

| Elapsed time | Presentation |
| --- | --- |
| 0–360 ms | Rat scampers from shoulder to the selected building, carrying nothing. |
| 360–440 ms | Rat pauses beside the building. The generic card becomes visible at 440 ms. |
| 440–800 ms | Rat returns along the same route carrying the card. |
| 800 ms | Remove card and traveler. Restore the shoulder rat at its normal transform. |

Use a straight horizontal segment and its reverse, with linear distance progress.
Interpolate endpoint ground heights; add at most 0.04 world units of vertical scurry.
Do not move the building, camera, hand cards, legal marks or Bruno during rat travel.
No screen overlay, centre message or hand destination belongs to this effect.
The rat and card never enter `pickables`, cast extra shadows or receive interaction handlers.
Do not add particles, lights, external art, textures or audio assets.

If the destination changes before departure or during travel, cancel instead of following it.
Do not retarget an active rat onto a newer victim.
A new live robbery replaces pending travel and cancels active travel before starting its own wait.
There is no route backlog. At most one pending or active robbery exists.
Dropped routes remain consumed and never restart on redraw.

## Sound ownership

Preserve `store.ts` as the sole robbery-related audio owner.
The rat event, renderer, card pickup and return emit no sound.
Keep `hear` and `soundsFor` responsible for existing FAHH substitution and normal wayfarer audio.
Continue using the existing sound queue and global mute; the clip plays at volume 1, since it is leveled with the other reactions (#1073).
Muting before or during travel produces no deferred sound on unmute.

Today's FAHH means a local building faces an incoming wayfarer; it does not prove successful theft.
It can therefore play when the rat correctly stays home, including an empty victim or another chosen victim.
Keep that existing behavior for this leaf rather than silently redefining sound policy.
Hotseat keeps its existing normal wayfarer cue and no victim-side FAHH.
Watchers have no local victim seat and receive no FAHH.
No event subscription calls `play`, and no second movement sound accompanies rat departure.
Any future change from adjacency-based FAHH to actual-victim FAHH requires a separate explicit sound-policy scope.

## Reduced motion, lifecycle and bounds

Under reduced motion, keep the rat on Bruno's shoulder and omit the card and route entirely.
Existing static board and public narration communicate the outcome.
Do not replace travel with a faster route, pulse, wobble or flashing card.
Turning reduced motion on cancels active travel immediately.
Turning it off establishes a new baseline without replay.

Clear pending and active effects on hidden pages, disconnect, resync, welcome, leave, rematch and game over.
Also clear them on scene replacement, island replacement and renderer disposal.
Returning to a visible page starts from the current board, without catching up.
Cancel when captured victim, destination or selected building becomes invalid.
Preserve ordinary state updates and existing Bruno movement when the decorative route cancels.

Use the renderer's clock and tick loop; add no interval, RAF loop or independent timeout chain.
Wake rendering only during Bruno's existing walk or the bounded rat effect.
Allow idle throttling again immediately after cleanup.
Allocate at most one traveling rat, one card mesh and one effect group per renderer.
Reuse geometry/materials for subsequent robberies. Do not allocate per frame.
Dispose owned resources once; do not dispose Bruno's shared geometry through the effect owner.
Keep at most one consumed sequence watermark per game incarnation, not an unbounded event-ID set.
Clear that watermark at the explicit baseline boundary.

## Acceptance matrix

| Fixture | Required outcome |
| --- | --- |
| Practice human theft | Capture after commit; one outward trip, one generic card return, one deterministic anchor. |
| Practice bot theft | Same capture boundary and route; bot processing never waits. No duplicate #722 target effect. |
| Hotseat theft and device handover | Show only public rat/card information. Preserve existing audio; handover cancels pending travel. |
| Online seat with today's snapshots | No rat, even with a matching local intent, private loss or sequence increment. |
| Watcher with today's snapshots | No rat and no invented hand. Existing public board and narration remain. |
| Online seat or watcher with complete single-event envelope | Same public route and card, provided destination and victim anchor still match. |
| Multiple victims | Only the actually captured victim qualifies. An unselected possible victim never receives a route. |
| Multiple victim buildings | Ascending vertex ID selects identically across seat, watcher, redraw and camera angle. |
| Empty victim, no targets, declined selection | No card and no route. Preserve existing move/audio behavior. |
| Knight theft | Same successful-theft route; no fortune identity in the event or card appearance. |
| Knight without theft, including mode off | No robbery event or route. Do not mistake played-card audio for theft. |
| Rejected action | No event, movement, card or route. |
| Coalesced one theft plus unrelated actions | Future envelope allows travel only when theft is the final committed action and anchors match. |
| Batched two robberies or changed final destination | No inferred intermediate travel; consume and omit both. |
| Theft followed by no-theft moves away and back | Omit despite matching final hex; robbery sequence predates the attached state. |
| Duplicate, malformed, stale or overflow envelope | No route. Reset to attached baseline where appropriate; no replay. |
| Reconnect, host restart, first load, identical-island rematch | Silent baseline; no historical route or card. |
| Rebuild or upgrade during travel | Resolve stable IDs; preserve valid route without disposed mesh references. |
| New destination, missing building, leave or disposal | Cancel; restore shoulder rat and remove card immediately. |
| Hidden page or reduced-motion transition | Cancel without catch-up; reduced motion remains static. |
| Rapid committed robberies | At most one active/pending effect; newest replaces older, never a growing queue. |
| Muted and unmuted seat | Existing sound ownership only; zero playback calls from rat rendering. |
| Repeated robbery/dispose cycles | Mesh/material counts return to baseline; no new timers, listeners or late callbacks. |

Prove privacy by recursively checking serialized events against the exact field allowlist.
Compare records and generic card materials across thefts of each resource; only public IDs and sequences may differ.
Assert capture leaves game state, seed and RNG unchanged beyond the rules result already committed.
Assert no renderer or transport code reads opponents' hands to recover missing evidence.

## Implementation boundaries and verification

This design does not authorize runtime edits under another agent's reservation.
Each runtime leaf needs fresh claims and an independent review.
Keep protocol delivery separate from client presentation and optional bot ordering.

| Bounded scope | Exact expected files | Acceptance |
| --- | --- | --- |
| Local capture and public type | `src/lib/game/robbery.ts`, `src/lib/game/store.ts`, `scripts/robbery-capture-prove.mjs` | Transaction fixtures, rejection/no-theft cases, privacy allowlist, incarnation and consumption tests. |
| Rat geometry and renderer integration | `src/lib/scene/bruno.ts`, `src/lib/scene/rat-robbery.ts`, `src/lib/scene/isle-renderer.ts`, `src/components/scene/IslandCanvas.tsx`, `scripts/rat-robbery-prove.mjs` | Virtual-clock phases plus browser geometry, static reduced motion, picking, audio ownership and cleanup fixtures. |
| Optional public-event prerequisite | `server/host.mjs`, `src/lib/net/table.ts`, `src/lib/game/robbery.ts`, `src/lib/game/store.ts`, `server/robbery-prove.mjs` | All commit paths, recipient projection equality, coalescing, overflow, compatibility and recovery baselines. |
| Proof registration | `package.json`, `.github/workflows/ci.yml` | Register the focused proofs after fresh shared-file reservations. |

Future runtime PRs run typecheck, build and their registered focused proofs from a fresh clone.
Renderer verification also runs existing wayfarer, tokens, keyboard placement, touch placement and idle proofs.
Check size budgets after adding meshes and client capture code.
Protocol verification runs server tests, watcher projection and reconnect proofs.
Inspect screenshots at desktop, phone portrait and phone landscape sizes for visible rat/card travel without obscured controls.
A document-only review checks source accuracy, local links, whitespace and every acceptance row above.
No runtime tests ran for this design.
