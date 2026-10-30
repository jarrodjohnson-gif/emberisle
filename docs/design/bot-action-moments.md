# Bot action moments

Research and proposed implementation contract for [#608](https://github.com/jarrodjohnson-gif/emberisle/issues/608).
Reconstructed on 2026-10-30 against main `13f73f4` by Codex-p, Model: GPT-6 Astra; parent: Codex-p.

The owner has approved **client-only scope**: exact practice actions, reliably attributable online
changes or summaries, and no host event feed. This document does not implement the feature or
declare the runtime acceptance complete. The desk/owner must accept this design stage before
promoting its existing children; the detailed presentation contract below is a proposal for that review.

## Provenance and current source

The original Codex-bot-moments-design session published its research, child issues and pause in
[#608 comment 6237283200](https://github.com/jarrodjohnson-gif/emberisle/issues/608#issuecomment-6237283200).
Jarrod chose client-only option A in
[comment 6237598643](https://github.com/jarrodjohnson-gif/emberisle/issues/608#issuecomment-6237598643).
That session's document and proof were uncommitted Mac-local files. They are absent from this
workspace and current main; this is a reconstruction from the public handoff, the four child
contracts and current production code, not a recovered copy or a new claim to its historical checks.

| Current source | Consequence for implementation |
|---|---|
| `src/lib/game/store.ts`: `dispatch`, `runBots` | Successful practice commits already carry `action`, `actor`, and `automated`. Capture them at commit time, before React coalesces renders. A bot-kind seat alone does not prove an automated dispatch. |
| `store.ts`: `openOffer`, `respond`, `endOffer` | Table offers use separate callbacks and a real `tradeId`; observing `dispatch` alone misses them. |
| `store.ts`: `hear`, `soundsFor` | Snapshot audio already serves humans, bots and online pushes. Exact-event audio must have one owner, without muting unrelated cues. |
| `server/host.mjs`: `viewFor`, `closedView`; `src/lib/net/table.ts` | Clients receive settled public views, not an ordered action stream. Opponent hands, fortune identities, seed and RNG remain private. No wire/save change belongs here. |
| `src/components/game/TurnMoment.tsx`, `Dice.tsx`, `stage.ts` | Turn stamps and roll moments already occupy the island's centre and avoid blocking input. Use their stage/hole placement; do not add another uncoordinated overlay. |
| `Hud.tsx`, `Hand.tsx`, `hand-motion.css` | Gains/losses now appear on the cards (#773). `GainFloats.tsx` no longer exists. Older child references to it describe coordination intent, not a request to restore island gain text. |
| `src/components/game/moments.ts` | This is a lazy component export module, not a game event queue. Keep capture/scheduling independent of chunk arrival. |

## Why online order cannot be reconstructed

Run `npm run bot-action-order-prove`. It imports production `createGame`, `legalSettle`,
`legalRoads`, `applyAction` and `logBotAction`, completes legal setup, then gives a bot two legal path purchases.
It applies A then B and B then A from identical starting states. Every build succeeds, both paths
are owned, every resource's bank-plus-hands total stays 19 after each path, both action lines
remain through the production bot-log annotation, and sequence increases twice.

The **complete settled states and complete public logs are byte-identical**, while the first
targets differ. The requested-target/metadata comparisons are fixture sanity checks, true by
construction; separate witnesses read the first changed edge from each production board delta
and prove those first commits differ. A one-action state/log control differs from both completed
histories. Any public projection of those identical settled states is also identical. This is an
information limit, not a log-parser bug. It does not claim that all online changes are ambiguous.

No sorting of edge IDs, log text, geometry, or animation timestamps may be described as the true
online action order. #725 is the separate future host-event proposal and remains outside this work.

## Capture and public projection (#720)

Keep the presentation stream outside `GameState`, saves and messages. A proposed event carries
an epoch-local unique ID, actor ID, capture time, provenance (`practice-action` or
`online-observation`), public kind, public display fields and zero or more stable target IDs.
Do not retain a raw `Action`, full state or private bag in the presenter.

Practice capture occurs only after a successful state-changing commit with explicit automated
metadata. Rejections, no-ops, human actions and baseline loads add no bot stamp. Capture committed
outcomes, not proposed intent: a Path fortune may place one or two paths, and a wayfarer action's
actual victim can differ from a null request. Offer callbacks emit once per real trade ID. Human
actions continue to receive their existing sounds without a bot centre line.

| Event | Public line / target | Data excluded |
|---|---|---|
| Path, outpost, stronghold, including setup | “Mira lays a path”, “Finn builds an outpost”, “Jules raises a stronghold”; committed edge/vertex | Hidden hand/cost inferred beyond public action details |
| Wayfarer move/play | “Mira moves the wayfarer to the 8 and takes from Finn” when those outcomes are known; committed hex | Which good was stolen; private loss counters |
| Fortune bought | “Finn buys a fortune”; no board target | Card identity, deck order and private holdings |
| Path fortune | One “Mira places 2 paths” event for the one committed action; both actual edge IDs | Invented two-action timing |
| Other played fortune / discard | Public action and public quantities only; no invented target | Discarded resource composition; unplayed fortune identities |
| Bank/dock exchange | “Jules trades 2 wool for 1 ore with the bank” using the actual public rate/destination; no target | Any unrelated hand contents |
| Table ask | “Mira offers 2 wool for 1 ore”; one event keyed by trade ID, while the existing offer controls remain | Guessed acceptance or guessed bot control of a human seat |
| Roll / end turn | Existing roll and turn systems retain these moments | Duplicate bot roll or end-turn stamp |

Display the existing good labels (Wood/Brick/Sheep/Wheat/Stone) when implementing the examples;
the issue's wool/ore examples describe goods, not a request to reverse current UI vocabulary.
Do not infer automation from the name suffix or `current`: disconnected human seats may be
automated online without an authoritative public controller event.

Online observation starts from a silent baseline. Compare only live, forward snapshots within
the same connection/game epoch. Admit an individual observation only when both actor and public
change are unambiguous. Multiple independent placements can be described as an unordered public
change summary, without assigning a first target. Repeated/truncated log text is not an event ID.
A sequence delta is not a bot move count. Count only confirmed distinct changes; if neither actor
nor count can be established, emit no claim. Exact online per-action parity is not acceptance.

Within an epoch, repeated sequence/snapshot and repeated trade IDs must not re-announce. A
reconnect, rematch or baseline replacement starts a new epoch and seeds state without replay.
Do not use the seed as an online identity: the host strips it. Event IDs and deduplication storage
are local and bounded, cleared at epoch changes; logs are never the durable event store.

## Centre ownership and timing (#721)

Use one atomic centre-slot owner for roll, bot and turn moments. A component reads the arbiter's
decision; it must not independently claim a free-looking slot in a React effect. Existing roll
moments and human setup prompts preempt bot presentation. Preserve the already-approved turn
behaviour, including any accepted changes from PR #1149 when it lands. Do not consume another
system's pending turn stamp simply to display a bot line.

An admitted bot line fades in for **150 ms**, holds **900 ms**, then fades out for **200 ms**.
Its full lifetime is 1250 ms; the next bot line starts only after it ends. That also satisfies
the parent's minimum 700 ms start spacing without overlap. Reduced motion keeps the same
1250 ms reading interval with steady text and target outlines, no fade/pulse.

**Settled owner contract:** each practice action that changes the board or hands produces a
moment, subject to the owner's **queue cap of six** and overflow summary (“Mira made 3 more
moves”). Bot pacing and canonical state are unchanged. Count confirmed overflow actions once;
do not use a guessed sequence delta or silently lose them. The existing #721 proposal counts
active plus waiting entries within six and gives a summary a slot; those counting details still
need design acceptance and must preserve the owner's overflow behaviour.

**Unresolved expiry/drain choice — do not implement:** #721 proposed **2500 ms waiting/summary
expiry** and a **nonextendable 2500 ms human-turn drain deadline**. These were not approved by
the owner's client-only decision. Silent age-based dropping can violate the every-action and
cap-six summary contract: with 700 ms arrivals and 1250 ms line lifetimes, waiting grows by
about 550 ms per action and reaches 2500 ms before the intended overflow is exercised.
The earlier version of this document incorrectly made that child proposal binding.

[Question 6520148623](https://github.com/jarrodjohnson-gif/emberisle/issues/608#issuecomment-6520148623)
asks the owner to choose preservation/draining, explicit expiry, or a bounded drain followed by
summary. **Recommendation, not approval:** preserve admitted lines and overflow summaries with
no silent waiting-age expiry; drain when the centre is available. The question also leaves
human-turn interruption and pending-summary treatment for explicit acceptance. Children must
not implement the 2500 ms deadlines, silent-drop rules or a substitute policy until that answer
is recorded and the affected contract/completion tests are reconciled with #608. The owner-written
spec remains authoritative in the meantime; the question does not reopen client-only option A.

Use monotonic timing for the accepted line animation. Any accepted queue/summary policy must
bound storage without retaining full overflow payloads; an age deadline cannot be assumed as
that bound. Roll/setup priority and human input must never block gameplay or move focus. Whether
an interrupted bot line resumes, becomes a summary or is discarded is part of the unresolved
policy above, not permission to clear waiting actions silently.

Gains remain on hand cards. Coordinate against their existing presentation busy state if needed
to preserve the original gain-preemption intent; do not bring back `GainFloats` or invent a new
island overlay. The implementation proof must show which current signal it uses.

## Decorative targets (#722)

The cue adapter receives only stable edge, vertex or hex IDs and the epoch/deadline. Resolve IDs
against the current scene after mesh rebuilds; never retain disposed meshes. One Path-fortune
event may cue both committed edges together. If a target is missing or the renderer is unavailable,
the text may still run; skip that cue rather than failing the game or substituting another target.

Use the actor-colour accent with a contrasting neutral edge, a soft ring beneath a piece or a
brightened wayfarer hex rim, for exactly the line lifetime. Reduced motion uses a steady outline.
Keep this in a dedicated decorative layer, separate from legal placement highlights, hover and
pickables. It must not change raycasts, camera fit/matrices, board state or production squash.
End of a displayed line, epoch reset and renderer disposal remove cues and release resources.
Queue expiry and interruption behaviour remain dependent on the unresolved #608 policy.

The line reuses the existing stage/hole placement and chrome, with safe-area checks at desktop,
portrait and landscape sizes. **Unaccepted recommendation for desk/owner approval:** text contrast
at least 4.5:1 and decorative target contrast at least 3:1 against its immediate surroundings,
including pale seats. These numbers are not an owner-approved #608 requirement; acceptance is
requested in Question 6520148623 before they become this feature's completion criteria. The canonical game log
remains the accessible history; do not create a second live announcement for the same event.

## One sound owner and lifecycle (#723)

Keep the approved cue inventory in [sound.md](sound.md), with the newer owner decisions taking
precedence. Bank trades and discards gain no new cue. Roll, human, your-turn, trade-answer and
soundboard paths retain their existing ownership.

For an admitted exact practice event, transfer only its matching existing action cue to the
presenter's start time. Suppress that specific snapshot cue atomically with admission, never
all sounds in the commit. An event cancelled under an accepted policy must not play deferred audio later. A trade
ask already has `offerChime` and resource clips; keep one owner and do not replay them from both
paths. Preserve composite Wayfarer/fortune rules and victim-specific cues. Online observation
stamps stay silent: existing snapshot/trade audio remains authoritative. Respect current mute,
mix levels and reduced-motion behaviour without changing audio assets or gains.

Visibility hide, leave/title, win, reconnect, rematch and baseline replacement clear the epoch's
text, targets, counters, timers and deferred audio. Human input never changes game state merely
to dismiss presentation; its effect on pending lines/summaries awaits the decision above. A lazy
module/audio promise carries the epoch and accepted cancellation state; recheck them when it
resolves so previous-game work cannot burst on return. Do not attach the unaccepted 2500 ms
expiry to these promises. Capture starts from
the live baseline even if the visual chunk arrives late; failed lazy loading never blocks play.

## Delivery and acceptance

| Existing child | Deliverable and completion evidence |
|---|---|
| [#720](https://github.com/jarrodjohnson-gif/emberisle/issues/720) | Pure event model and commit/offer observer. Prove actual automation vs human actions, rejects/no-ops, multi-target Path, private projection, duplicate/truncated logs and reconnect/rematch deduplication. Keep the production ordering counterexample passing. |
| [#721](https://github.com/jarrodjohnson-gif/emberisle/issues/721) | Scheduler and presenter. Virtual-clock checks for 150/900/200 timing and the owner's six-entry overflow contract. Expiry, summary-slot counting, interruption and human-turn drain tests wait for Question 6520148623; do not encode the child's unaccepted 2500 ms rules. Browser checks for exclusive centre ownership, input pass-through, no focus movement and no duplicate announcement. |
| [#722](https://github.com/jarrodjohnson-gif/emberisle/issues/722) | Dedicated target adapter. Prove stable IDs through rebuilds, both Path edges, missing targets, unchanged legal/pick IDs and camera matrices, contrast, reduced motion and cleanup without leaks. |
| [#723](https://github.com/jarrodjohnson-gif/emberisle/issues/723) | Integration and `bot-moments-prove`: full practice round at 1280×720 and 390×844, landscape regression, ordered non-overlapping text (±80 ms), synchronized cues, exact approved sound counts, bounded summaries and lifecycle cases. Re-run `hud-safe-area-prove`, server turn proof, `sounds-prove`, affected placement proofs, typecheck, build and unchanged size budgets. |

**Register each new proof in `package.json` and `.github/workflows/ci.yml` in the PR that adds it.**
The children's older “registration belongs to final integration” wording is superseded by current
AGENTS rule 6; do not ship an unregistered intermediate proof. Package/CI registration files are
shared exemptions, not reservations to delay other builders. Every runtime file still needs a
fresh claim check. #720's existing fork checkpoint is an input for its builder/reviewer, not
accepted or modified by this document; its model/eligibility questions remain on that issue.

This PR supplies only the document and registered research proof. It does not satisfy the parent's
browser, visual, audio, scheduler or renderer acceptance. No child is promoted automatically and
#608 remains open. Acceptance of this proposal and later independent Claude review are separate
from the owner's already-settled client-only choice.
