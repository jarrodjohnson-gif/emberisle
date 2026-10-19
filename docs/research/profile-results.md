# Research: durable profile results and deletion

Issue: #765. This note maps the accepted result and deletion contract to the current host. It does not change runtime behavior.

## Findings

The current host has no durable game identity, result journal, receipt, aggregate, history, or profile-deletion operation. `server/profiles.mjs` currently persists authentication data only. The accepted design already settles result eligibility, privacy, and deletion behavior; implementation work should follow that contract rather than reopen those decisions.

The host has two useful starting points. `pushState()` is the common state-publication path, and the profile store already serializes durable mutations. There are also direct state sends in `freshAction()` and `watch()`, so a terminal publication gate must cover every send path. Neither current room saves nor current terminal publishing provide an awaited durable boundary. Result recording therefore needs a serialized room transition and an independent journal before terminal publication.

## Current source map

| Path | Current behavior | Result integration constraint |
|---|---|---|
| `server/host.mjs:870-891`, `startGame()` | Creates a game, assigns player IDs and colors, runs bots, then publishes state. | #764 must persist the new `gameId`, start time, frozen roster, classification, and eligibility before the first game state. Keep that metadata separate from `GameState`. |
| `server/host.mjs:943-979`, `rematch()` | Reorders live seats, replaces the old game, runs bots, and publishes. | The old terminal game must be durably journaled before `room.game` is replaced. Each rematch gets a new ID and roster. |
| `server/host.mjs:443-473`, `runBots()` | Applies bot actions until no bot is waiting or the game ends. | Bot wins must use the same terminal hook as human wins. Read attribution and assistance from the frozen roster, not current `Player.kind`. |
| `server/host.mjs:1193-1236`, `play()` | Applies human or automated actions, runs bots, then calls `pushState()`. | This is the ordinary transition path. Detect a terminal transition after all same-turn bot actions and before the final state is published. |
| `server/host.mjs:539-548`, `turnOut()` | Converts an expired human turn to a host action through `play(..., true)`. | Timer wins converge on `play()`; tests must prove the timer route reaches the shared hook once. |
| `server/host.mjs:1033-1041`, `botsOn()`; `:1066-1072`, `botAnswer()` | Finishes trade waits and may continue bot play. | Bot continuation after an offer closes can reach the terminal state; its publication also needs the hook. |
| `server/host.mjs:1344-1374`, `rejoin()`; `:1422-1441`, `takeOver()` | Rejoin may restore a bot-controlled player to human. Takeover changes a disconnected player to a bot and may run bots. | Neither path may alter frozen starting attribution. Record assistance separately from the original classification. |
| `server/host.mjs:555-578`, `pushState()` | Calls `save(room)`, then sends seat and watcher state immediately. | Intercept here or at a shared caller boundary, but make it await terminal durability before sending any terminal state. Today it is synchronous. |
| `server/host.mjs:587-608`, `freshAction()`; `:857-867`, `watch()` | Sends a resync or initial state directly, outside `pushState()`. | Route through the same publication gate, or explicitly check terminal durability before these sends. Guard every state-send path, including reconnect and watch snapshots. |
| `server/host.mjs:213-218`, `save()`; `:240-258`, `flush()` | Coalesces changes and asynchronously writes a temporary file then renames it. Errors are logged; callers cannot await success. | `save(room)` is not a commit acknowledgment. A failed write currently does not block publication. Add an awaitable, per-room serialized durable write for result transitions. |
| `server/host.mjs:260-278`, `flushAll()` | Synchronously writes changed rooms on exit. | It is a shutdown flush, not a transaction primitive. Do not use it to acknowledge a game result. |
| `server/host.mjs:220-235`, `snapshot()`; `:118-120`, `ROOM_SHAPE` | Saves game, seats, and table settings. The room shape is version 2. | Add optional, independently versioned profile metadata. The accepted design says not to invalidate legacy games solely by bumping `ROOM_SHAPE`. |
| `server/host.mjs:288-358`, `load()`; `:1496-1497` | Loads rooms synchronously, deletes expired or stale-shape files, then listens. | Reconcile terminal snapshots, pending outcomes, and receipts before expiry cleanup and before `server.listen()`. Gate startup on successful repair. |
| `server/host.mjs:1387-1402`, `dropRoom()`; `:1443-1452`, `letGo()` | Removes the room and its save after the last human seat leaves or its hold expires. | Room cleanup must not delete a separate pending-outcome journal or erase uncommitted history. |
| `server/profiles.mjs:140-157`, `writeDurable()`; `:212-230`, `mutate()` | Uses temp-file write, file sync, rename, directory sync, and a serialized clone-before-commit queue. | Extend this writer for result and deletion transactions. Do not add a second, uncoordinated profile writer. |
| `server/profiles.mjs:79-102`, `validDoc()` / `emptyDoc()`; `:408-424`, store API | Requires a `tombstones` map, but exposes no result, receipt, history, or deletion methods. | Add versioned result records and migration rules without silently replacing an unknown store. Tombstones need an actual serialized deletion operation. |
| `server/profile-protocol.mjs:6-7`, `PROFILE_TYPES`; `:96-147`, `profileHandler()` | Handles hello, create, login, resume, and logout on a seatless profile connection. | Keep local deletion administration out of the player protocol. Add only the accepted owner-authenticated result queries here. |

### Terminal routes

Human actions and timed actions reach `play()`. Bot continuation reaches `runBots()` from `startGame()`, `rematch()`, `play()`, `botsOn()`, `rejoin()`, and `takeOver()`. Most paths publish through `pushState()`, while `freshAction()` resync and `watch()` initial state send directly. A shared gate must protect all terminal state sends. `respond()` and bot trade answers change resources and may resume bots; they also publish through `pushState()`. The hook must be idempotent by `gameId`, because more than one caller can observe the same terminal state during retries or recovery.

Startup is a separate route. `openProfiles()` runs at `server/host.mjs:775`, then the bottom-level `load()` and `server.listen()` run at lines 1496-1497. Today `load()` may delete an expired room before any result repair exists. Future startup must await reconciliation before loading rooms for play, expiring them, or accepting sockets.

## Accepted contract to preserve

- Each game has a random UUID, start time, rules version, frozen participant rows, and frozen eligibility. Store the authenticated profile binding and starting human/bot classification from #764. Do not derive them from reconnect state, current seat order, current names, or later bot takeover.
- Count completed online games that began with at least two human seats. Guest humans count toward eligibility; only authenticated human participants receive profile rows. Exclude practice, hotseat, one-human bot games, and unfinished games.
- Use the rules engine's terminal winner and final `totalVP`. A guest or bot win is a loss for profiled participants, never a fabricated profile win. Preserve assistance flags and final starting names.
- Use one frozen outcome and one immutable receipt fingerprint per `gameId`. Duplicate identical commits are no-ops; a different fingerprint for the same ID is corruption and stops recording.
- Keep history private to its owner, return bounded pages, and publish only explicit aggregate/public-card projections. Never include PINs, credentials, seeds, RNG, hands, or seat secrets.
- A legacy room without reliable game identity and roster remains playable and produces “Not tracked.” Begin counting only after a rematch persists new metadata.

## Durable ordering and failure matrix

The accepted sequence is: durable terminal room snapshot with frozen outcome; independent pending outcome; serialized atomic receipt and participant aggregates; publish refreshed statistics; durable pending-outcome removal. Hold terminal publication and rematch only until the room snapshot and independent pending outcome are durable. After that, the game may be shown and rematched while aggregate recording retries from the journal. A normal win may show “Saving record…” while that retry is pending.

Proposed interfaces and metadata for the implementation children:

- #764 supplies versioned room metadata such as `profileGame: { version: 1, gameId, startedAt, rulesVersion, policyVersion, eligible, roster: [{ playerId, profileId: null | string, startingName, startingColor, classification }] }`. Preserve `originalHuman` and `assistedByBot` separately; do not derive frozen attribution from live seats.
- Child 1 owns the per-room terminal transition, conceptually `finalizeTerminal(room, frozenOutcome)`. It writes the final room snapshot and then `pending/<gameId>.json`; it returns a durable `PendingOutcome` only after both commits. Startup reconciliation repairs the room-to-journal gap and reports pending/committed IDs before expiry cleanup or listen.
- Child 2 consumes `PendingOutcome` through the serialized store transaction, conceptually `recordOutcome(outcome)`. It atomically persists the unique `{ gameId, fingerprint }` receipt and all affected aggregates, returning `committed`, `duplicate`, or `conflict`. Owner history and public aggregate reads return bounded, explicit projections. Keep the pending outcome until the receipt transaction succeeds; use bounded retries.
- Child 3 makes deletion resumable with a durable job marker, for example `deletionJobs[profileId] = { jobId, phase, cursor }`. Apply tombstone and credential revocation first, then redact mutable display rows. Startup resumes unfinished jobs before serving profiles. Keep immutable receipt fingerprints; tombstones suppress attribution during any replay and must never resurrect a profile.

| Failure or race | Required recovery / observable behavior |
|---|---|
| Start or rematch metadata has not reached durable storage | Do not publish the first state for that game. Keep the previous game intact if a rematch cannot persist its new metadata. |
| Final room snapshot write fails | Do not publish the terminal state or allow rematch. Keep the finished in-memory state for retry and show the accepted retry status. |
| Pending-outcome write fails after final room snapshot | Do not publish terminal state or allow rematch. Retry journal persistence; startup can reconstruct it from the durable terminal room snapshot. |
| Crash after terminal room commit, before journal commit | Startup reconstructs the journal from the frozen terminal outcome before room expiry or gameplay. |
| Crash after pending journal commit, before receipt transaction | Startup replays the pending outcome once. Terminal presentation/rematch may proceed because the independent journal is durable. |
| Crash after receipt/aggregate commit, before journal removal | Receipt fingerprint makes replay a no-op; then remove the journal durably. |
| Pending-outcome removal fails after receipt commit | Keep or restore the journal and retry removal. Replays return `duplicate` by fingerprint and do not change aggregates. |
| A room has an older nonterminal snapshot for a game with a pending or committed receipt | Fence it from play. Never resume a `gameId` that is pending or recorded; report local corruption for repair. |
| Rematch races terminal persistence | Serialize the room transition. Preserve the old outcome and durable pending journal before replacing `room.game`; do not allow a stale room write afterward. |
| Room expires or is dropped while a result is pending | Reconcile the independent journal first. Room cleanup cannot erase pending outcomes or profile history. |
| Two rooms finish together | Serialize profile-store mutations across rooms; atomically update each receipt and every affected aggregate. Order equal completion times by `gameId` when recomputing streaks. |
| Profile-store commit fails | Leave the in-memory document unchanged and retain the pending outcome for bounded retry. Do not publish invented aggregates. |
| Deletion races result commit or pending replay | Serialize both operations. The tombstone wins attribution checks; replay cannot recreate the profile. |
| Deletion stops after tombstone but before redaction | Startup completes redaction before serving profiles. Preserve immutable receipt fingerprints and other participants' results. |
| A stale room roster names a deleted profile | Consult the tombstone; suppress future attribution and redact display rows. Never restore the profile or its media binding. |
| Legacy room, unknown room metadata version, or corrupt profile store | Keep legacy play available as “Not tracked.” Fail closed on unknown/corrupt profile data; never reset it to an empty store. |

## Implementation children

The frozen game roster belongs to #764. These children must consume that interface and must not duplicate its work.

1. **Durable terminal outcome journal and startup repair.** Add an awaitable per-room terminal transition, freeze the first terminal outcome, persist the final room and an independent per-game pending record, and reconcile both before room expiry or server listen. Gate every terminal state send, including `freshAction()` resync and `watch()` initial state. Depend on #764. Consumers: `server/host.mjs`, the versioned room metadata from #764, and the private profile/result writer. Proof: inject failures and process exits between the room and journal commits; exercise human, timer, bot, takeover, rejoin, rematch, expired-room, and stale-snapshot paths. Prove no terminal publication or rematch before the pending journal commit; prove rematch can proceed while aggregate retry remains pending.
2. **Exactly-once result receipts, aggregates, and owner queries.** Consume pending outcomes through the existing serialized profile writer. Atomically insert a unique receipt and update all eligible participant aggregates, then expose the accepted bounded owner history and aggregate queries through explicit profile protocol projections. Depend on child 1 and #764. Consumers: `server/profiles.mjs`, `server/profile-protocol.mjs`, and host terminal publication. Proof: duplicate/reordered replay, conflicting fingerprints, simultaneous rooms, equal-time streak ordering, all eligibility/mode/bot cases, pagination, and privacy projections.
3. **Local profile deletion and durable redaction.** Add the owner-confirmed local deletion operation, credential revocation, tombstone-first transaction, result and pending-row redaction, startup completion, and stale-roster replay fence. Preserve receipt fingerprints, other participants' rows, and curated repository assets. Depend on child 2, #763's local administration interface, and #764's frozen roster. Consumers: `server/profiles.mjs`, `server/host.mjs`, and the local administration command. Proof: interrupt deletion at every durable boundary, restart, replay a stale pending outcome and room snapshot, and verify no resurrection, no duplicate result, and unchanged other-player totals.

All runtime children remain subject to fresh lane and file reservations. In particular, #553 / PR #716 and the profile form/authentication work reserve host, store, protocol, and shared wiring. Research grants no runtime file reservation.

## Source references

- Accepted rules and owners' decisions: [`docs/design/profiles.md`](../design/profiles.md), especially “Host storage and completed results,” “Exactly-once recording,” “Which results count,” and “Host administration and privacy.”
- Current profile APIs and durable writes: [`server/profiles.mjs`](../../server/profiles.mjs), [`server/profile-protocol.mjs`](../../server/profile-protocol.mjs).
- Current terminal and room lifecycle paths: [`server/host.mjs`](../../server/host.mjs).
- Required baseline proofs to extend: `server/finish-prove.mjs`, `server/persist-prove.mjs`, `server/save-prove.mjs`, `server/restart-prove.mjs`, `server/rejoin-prove.mjs`, and `server/takeover-prove.mjs`.
- Profile identity and frozen roster interface: issues #764 and #766. Both remain implementation prerequisites; #764 owns host attribution, while #766 owns the client surfaces.

Runtime tests were not run for this documentation-only research. Existing current-main behavior and source symbols were inspected directly.
