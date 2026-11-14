# Research: Host Event Feed for Online Bot Moments (Issue #725)

- step: 1 Research
- date: 2026-11-13
- agent: builder-proofs
- lane: net (tier 1)
- issue: #725

## Why

Issue #608 established client-only bot action moments.
In practice mode, the client dispatches actions directly.
The practice client observes each commit in real time.
In online games, the host runs bots synchronously in `runBots`.
The host broadcasts only the settled final game state.
`scripts/bot-action-order-prove.mjs` proves a fundamental ordering limit.
Two legal action sequences can produce byte-identical settled states.
Their complete public logs are also byte-identical.
A client cannot recover information absent from its input.
Online bot moments must currently fall back to generic summaries.
Issue #725 defines a lightweight host event feed.
This feed provides explicit action order for online games.

## Public Event Specification

The host emits a public event for each applied bot action.
Events are broadcast over the existing WebSocket connection.
No new HTTP endpoints are created.
Game state schema remains untouched.
Turn deadlines and saved room bytes remain unchanged.

### Event Payload

Each event carries a minimal payload:
- `type`: String literal `"botAction"`.
- `seq`: Integer matching `game.seq` after commit.
- `turn`: Integer matching current `game.turn`.
- `player`: String player identifier.
- `kind`: String action kind.
- `target`: Optional target identifier.

Permitted values for `kind`:
- `"path"`: Placing a road with edge ID target.
- `"outpost"`: Placing a settlement with vertex ID target.
- `"stronghold"`: Upgrading a city with vertex ID target.
- `"wayfarer"`: Moving robber with hex ID target.
- `"buy"`: Buying a fortune card with null target.
- `"bankTrade"`: Bank or dock resource trade.
- `"offer"`: Opening a table trade offer.

### Strict Privacy Invariants

The event feed must never leak private information.
It reveals nothing beyond what the public log reveals.
The following data are strictly excluded:
- Hidden hand resources.
- Identity of drawn or purchased fortune cards.
- Cards remaining in the draw deck.
- Specific resources stolen during wayfarer actions.
- Secret dice roll rolls or RNG seeds.

## Action Ordering and Emission

The host executes bot actions inside `runBots` in `server/host.mjs`.
Currently, `runBots` runs all bot moves in a tight loop.
It sends `pushState` only after all bot moves finish.
With the feed, the host calls `broadcast` immediately after each action.
Every committed action gets an immediate event broadcast.
Events arrive at clients in the exact execution order.
TCP sockets preserve message order between host and client.
Watchers receive the exact same public event feed.

## Reconnection and Deterministic Delivery

Reconnection must not replay old historical actions.
Settled turns are already captured by the board and log.
Delivery guarantees are defined as follows:

### Ephemeral Turn Buffer

The host keeps an in-memory buffer on the `room` object.
The buffer stores public bot events for the active turn.
It is capped at 12 events per turn.
The buffer clears when `game.turn` advances.
It is never written to disk or room saves.

### Rejoin Behavior

When a dropped player reconnects, the host sends `state`.
The client establishes a new baseline from `state`.
If the active turn is automated, the buffer is forwarded.
Clients process buffered events to animate pending cues.
If the turn has passed, the client shows settled state.
No synthetic backfill is attempted for earlier turns.

### Packet Loss and Disconnects

WebSocket runs over TCP.
Dropped frames trigger TCP retransmissions or socket drops.
A disconnected socket moves to hold status.
On rejoin, the client receives fresh authoritative state.
Duplicate events are ignored using `seq` checks.

## Client Integration and Fallback

Clients implementing #608 consume `botAction` events when received.
Each event maps to an animated moment and target highlight.
Older clients ignore `"botAction"` messages cleanly.
The store message switch defaults to no-op for unknown types.
If the host emits no events, client-only fallback activates.
The client summarizes changes as "Mira made 2 more moves".
Parity between practice and online is achieved cleanly.

## Recommended Child Issues

| Step | Title | Scope |
|---|---|---|
| Design | Event feed schema and host broadcast design | Small |
| Implementation | Host bot action broadcast in `server/host.mjs` | Small |
| Implementation | Client event ingestion in `src/lib/net/table.ts` | Small |
| Test | Proof of online action order and privacy invariants | Small |

## Handoff

```yaml
done: Researched online bot ordering limits and event feed design.
left: Implementation of host broadcast and client consumer.
broke: None.
next agent: Builder taking design or implementation child.
```
