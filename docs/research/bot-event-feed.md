# Online bot event feed: source facts and unresolved delivery (#725)

Research only, updated 2026-11-17 by Codex-p (GPT-6.1 Sol).
Original research: builder-proofs (AntiGravity), 2026-11-13; exact model unrecorded.
Source snapshot: main `f1d2c155616b37370ac37f9de00cf4df74493148`.
No host, client, protocol, save, deadline or proof change is implemented here.

## Existing ordering limit and issue scope

[#725](https://github.com/jarrodjohnson-gif/emberisle/issues/725) requests ordered public bot events over the existing broadcast.
It names path, outpost, stronghold, wayfarer, buy, bank trade and offer events.
Events must reveal nothing beyond the public log. Ignoring them must preserve existing client behavior.
The issue requires bounded per-turn data, unchanged game state/deadlines/save bytes and watcher coverage.
Its #608 runtime dependencies (#720–#723) remain prerequisites for implementation.

[bot-action-order-prove](../../scripts/bot-action-order-prove.mjs) demonstrates that different path orders can share settled state and log.
That source establishes an information gap, not a fresh passing run for this note.
An online consumer cannot reconstruct an exact missing order from those inputs alone.

## What the current host actually sends

[runBots](../../server/host.mjs#L915) executes applied bot actions synchronously within each invocation.
It can return for an open trade offer; a complete turn need not finish in one invocation.
After a successful action it assigns the logged next state to `room.game`.
It also calls `publish(room)` when room needs change.
[publish](../../server/host.mjs#L366) broadcasts a [seats message](../../server/host.mjs#L343) and saves the room.
That call is not a game-state broadcast. [pushState](../../server/host.mjs#L1064) is the separate state-publication path.

A bot's trade ask already calls [openOffer](../../server/host.mjs#L1818).
That function broadcasts `tradeOffer`; a new feed must account for this existing event without duplicate moments.
[broadcast](../../server/host.mjs#L226) includes connected seats and watchers.
That source fact does not prove future event privacy or ordering.

## Client integration and public mappings still needed

The transport's [ALLOWED_EVENTS](../../src/lib/net/table.ts#L287) controls the default message-dispatch path.
The [default switch case](../../src/lib/net/table.ts#L482) forwards only listed event types.
A new `botAction` type would need types/allowlist/consumer integration; a store-only handler is insufficient.
Older clients currently drop unrecognized types through that path.
This note does not choose a wire schema or claim a new event already works.

Use the game's path, outpost, stronghold and wayfarer terms in public moments.
The implementation must map supported actions to those public targets.
In particular, [playKnight](../../src/lib/net/table.ts#L245) is an existing action that the earlier proposal omitted.
Its public wayfarer move needs explicit mapping without leaking the stolen goods or private hand.
Dice rolls are already [public rolled events](../../server/host.mjs#L2008), not secret rolls.
Seeds, hidden goods, purchased fortune identities and stolen-goods identities stay outside the proposed feed.
Each emitted field still needs a source-specific public-information proof.

## Rejoin, deduplication and cap are unresolved

A synchronous bot slice finishes before a reconnect can interleave with its actions.
A newly sent state can therefore already show moves that buffered cues would animate.
An open trade offer complicates any assumption that one turn is one synchronous slice.
The earlier twelve-event active-turn replay buffer had no approved cap or baseline semantics.
That prescription is withdrawn.

[Question 6941166387](https://github.com/jarrodjohnson-gif/emberisle/issues/725#issuecomment-6941166387)
asks whether to omit replay or specify explicit replay/baseline behavior first.
It also leaves the numerical bound unresolved. The recommendation is not approval.
This research selects no replay policy, sequence key, duplicate filter or queue architecture.
Implementation must resolve those choices before claiming deterministic delivery or online/practice parity.

## Future completion evidence

The issue requires a real online room with a bot seat and true applied-order comparison.
Include the ambiguous two-path case, watchers, fallback clients and private-information exclusion.
Resolve replay/baseline behavior and its bounded-data test before implementing that part.
Retain the server and #608 proofs. Register any new permanent proof in package.json and CI.

For this documentation revision, I checked source facts, link targets and diff whitespace.
I ran no host, browser or ordering proof. Earlier PR-body PASS claims are not fresh validation.
This note does not complete #725 or establish an approved delivery design.
