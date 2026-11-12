# Open-ended trade asks, counters, and requests

Design for [#561](https://github.com/jarrodjohnson-gif/emberisle/issues/561).
This note changes no gameplay or protocol.
It reconciles owner decisions, accepted research, and current source.
The proposed wire contract is reviewable; unresolved policies below still need Jarrod's decision before implementation.

## Authority and scope

| Record | What it establishes |
|---|---|
| [Owner decisions, October 17](https://github.com/jarrodjohnson-gif/emberisle/issues/561#issuecomment-6244802140) | Mixed payments; exactly N eligible cards selected by the responder; exact preview; one Accept; visible owned counts. No gifts or matching resource types across directions. |
| [Owner request, October 18](https://github.com/jarrodjohnson-gif/emberisle/issues/561#issuecomment-6250347429) | Actual counteroffers and request-only “Looking for X” asks. The asker chooses one response. |
| [Research acceptance](https://github.com/jarrodjohnson-gif/emberisle/issues/561#issuecomment-6253888543) and [fast-trading research](../research/fast-trading.md) | Reconcile this design with actual counters and complete response proposals. Research recommendations remain recommendations. |
| [Human-offer hold decision, #1245](https://github.com/jarrodjohnson-gif/emberisle/issues/1245) and [bot exception](https://github.com/jarrodjohnson-gif/emberisle/issues/1245#issuecomment-6551936127) | Human offers no longer expire after 20 seconds. Bot offers retain their timeout. |
| [People-first decision](../DECISIONS.md) | Bots wait up to eight seconds before accepting while humans have not declined. |

The later request expands the earlier nonbinding-counter suggestion into an actual negotiated deal.
Reposting a suggestion to the whole table does not satisfy that request.
Publishing a request or proposal moves no goods.
Accepting one complete, agreed deal settles it once; there is no additional confirmation.

Bank and dock exchanges remain separate.
Bank exchanges use four identical resources; generic owned docks use three; specific owned docks use two of their resource.
Each buys one other resource.
These ratios do not constrain negotiated player trades.

## Research pattern and limits

Follow the accepted research's explicit give/get receipts and editable complete counteroffers.
Keep request-only discovery separate from executable deals, so interest cannot look like a gift.
This follows the documented Colonist pattern as inherited by the research, not a verified current-client measurement.
CATAN Universe evidence is historical publisher documentation; current Colonist behavior could not be checked.
No source establishes a measured fastest product or proves request-only selection is a current competitor feature.
The request-only selection requirement comes from Jarrod.

## Verified current behavior

Source baseline: `2c161a1e8356aecb238e1966f0e2956eccfbf671`, checked November 4, 2026.
The links below name files and the symbols inspected.

| Source | Current behavior |
|---|---|
| [types.ts](../../src/lib/game/types.ts), `RESOURCES`; [rules.ts](../../src/lib/game/rules.ts), `validBag` | Five resources: timber, clay, wool, grain, ore. Bags allow known keys and nonnegative integer counts, including empty bags. Safe-integer totals are not enforced. |
| [host.mjs](../../server/host.mjs), `ask` | Only the current seat in main phase publishes an offer. It checks bags and offered holdings, but rejects only the completely empty pair. One-sided and overlapping named bags remain possible. |
| `openOffer`, `cancelOffer`, `resendOffer` | One in-memory offer has `tradeId`, declined seats, bot timers, and nullable `until`. Humans have no offer timeout; bots have 20 seconds. Replacement closes the previous identity. `tradeCancel` already exists. Rejoin restores the offer and declines after private state, including for its asker. |
| `answer`, `respond`; rules `offerTrade`, `respondTrade` | Replies check a supplied trade ID but permit omission. Yes constructs both rules actions on temporary state. Only success replaces the game; failed responder payment leaves the offer open. Failed offerer validation closes it. |
| `play`, `takeOver`, `rematch`, `closeOffer` | Phase/turn loss or insufficient offered holdings closes an offer. Goods are not reserved. Relevant takeover and rematch close it. Offers and timers are ephemeral. |
| `actionStamp`, `freshAction`; [table.ts](../../src/lib/net/table.ts), `act` | Gameplay uses `cid`, `turn`, `baseSeq`, and `connection`. Refused dispatched intents consume IDs; the ledger keeps 32. Noncurrent `tradeAnswer` permits an older same-turn baseline, never a future sequence. Other trade intents require the current sequence. Gameplay is not queued for reconnect. |
| `botAnswer`, `peopleWaiting`, `releaseHeld`, `runBots` | Bots evaluate after a default 1–2 seconds. Positive answers wait while humans remain undecided, up to eight seconds. Recovery bots decline. Bot asks are limited to one per turn; their own offer pauses play. |
| [ai.ts](../../src/lib/game/ai.ts), `shouldAcceptTrade`, `chooseTradeAsk` | Bots use their own hand and public information. They require affordability, no card-count loss, fewer missing goal resources, and the existing public-leader check. Originated asks are concrete one-for-one trades. |
| [store.ts](../../src/lib/game/store.ts), `openOffer`, `respond`, `releaseHeld` | Practice mirrors human holds, bot expiry, people-first answers, and temporary concrete settlement. |
| [proto.ts](../../src/lib/net/proto.ts), `PROTO`; host handshake | Version is 1. The host accepts missing/older versions, so a version bump alone cannot safely negotiate new trade semantics. |

Current source supports neither actual counteroffers nor request proposal collection.
A short “looking for” label on an unaffordable named offer is not request-only negotiation.
The October research's universal 20-second baseline predates #1245.
Do not restore that timeout for existing human offers.

## Approved interaction requirements

Use A for the active asker, and B/C for other seated players.
All examples name resource keys in messages; visible receipts use the game's resource labels.

| Flow | Commitment and final action |
|---|---|
| Named offer | A publishes exact give/get terms. Another seat's Accept settles those terms once. |
| Any-N offer | A publishes a concrete give bag and an exact count N. B selects exactly N eligible cards. B sees the exact receipt, then Accept settles it once. |
| Actual counteroffer | B publishes changed, complete terms. A sees both payments and accepts that counter once. B does not confirm again. |
| Request-only ask | A publishes only desired goods. No payment is promised and no transfer is authorized. |
| Request response | B publishes both payments. A compares complete proposals and accepts one. The request closes with its sibling proposals. |

“Send proposal” and “Accept” are different actions, not two confirmations of the same deal.
Changing a published deal requires a new immutable identity or revision and fresh acceptance by its recipient.
Never reuse a previous Yes for changed terms.
The exact permissions for counter chains remain an owner policy below.

For Any-N, N is a positive safe integer, not a value score or range.
Eligible cards are the five resources absent from A's positive give bag.
Mixed eligible payments are allowed.
Offering all five resource types leaves no eligible payment and must fail.

Every settling deal has two nonempty, disjoint positive bags.
Reject unknown resources, negative/fractional/unsafe counts, unsafe totals, and unaffordable payments.
Ignore zero entries when comparing positive resource types.
Reject matching positive types outright; do not silently net an invalid receipt into a different trade.
Unequal card counts are allowed.
Fortunes, pieces, and bank inventory cannot satisfy player payments.

Apply these checks to named, Any-N, counter, and request-response settlement in the future implementation.
Legacy named messages must not bypass the no-gift rule.
This is an intentional future validation change; this documentation changes no current named-good behavior.
A request's absent give bag is discovery data, never a zero-payment executable offer.

Show owned counts and the exact “You give” / “You get” receipt before Accept.
Identify the other player and every quantity.
Local selection moves no goods and sends no acceptance.
An unaffordable original offer must not prevent submitting an affordable changed counter.
Keep publication, acceptance, refusal, cancellation, and completion distinguishable.
Closing an editor must not silently accept a deal.
No sizes, screen layout, new art, or placement choices are specified here.

## Proposed protocol model

Everything in this section is a technical proposal, not a shipped API or an owner policy decision.
Policy-dependent transitions explicitly reference the choices below.

Retain one active negotiation root per active player turn, building on today's one-offer record.
Use the existing host-issued `tradeId` for that root.
A replacement root gets a new identity and invalidates its children.
Keep rules `TradeOffer` concrete: only resolved payments enter `applyAction`.

Proposed root variants:

```text
named:   { tradeId, from:A, kind:"named", give, want, until }
any:     { tradeId, from:A, kind:"any", give, count:N, until }
request: { tradeId, from:A, kind:"request", want, until }
```

A concrete proposal carries `{tradeId, proposalId, author, recipient, give, want, until}`.
Its bags always use A's perspective: `give` leaves A; `want` reaches A.
A is always one participant; this does not authorize B–C trading during A's turn.
Only the addressed recipient can accept the proposal under the recommended bilateral policy P4.
The author commits by publishing those exact terms, subject to live validation at settlement.

Give each revision a fresh host-issued `proposalId`; never mutate terms behind an existing ID.
A revision identifies the proposal it replaces.
Accept must name both the exact root and exact proposal identity seen in its receipt.
Retain author/recipient identity even when another player edits a local draft.

The following candidate names illustrate discrimination; implementation review must finalize encoding and compatibility.
Every client intent includes the existing action stamp.

| Message or event | Proposed transition |
|---|---|
| A: `tradeAsk {kind:"any", give:{wool:2}, count:2}` | Closed → open Any-N root T. No goods move. |
| B: `tradeAnswer {tradeId:T, reply:"accept", pay:{ore:1,grain:1}}` | Validate exact N and live holdings. Commit A −2 wool/+1 ore/+1 grain; B receives the inverse. Close T. |
| B: `tradeAnswer {tradeId:T, reply:"decline"}` | Record B's decline once. Root closure and existing proposals follow P2/P3, not implicit acceptance. |
| B: `tradeAnswer {tradeId:T, reply:"propose", give:{wool:3}, want:{ore:1}}` | Publish counter P1 addressed to A. No transfer. Original-offer availability follows P2. Visibility follows P1. |
| A: `tradeAsk {kind:"request", want:{ore:1}}` | Closed → request R. No offered payment and no transfer. |
| B: `tradeAnswer {tradeId:R, reply:"propose", give:{timber:1}, want:{ore:1}}` | Publish response P2: A gives timber; B gives ore. Validate B's payment. Request matching follows P6. |
| C: same request with `give:{wool:1}, want:{ore:1}` | Publish distinct P3. Response capacity follows P3 policy. |
| A: `tradeSelect {tradeId:R, proposalId:P2}` | Accept exactly P2. Atomically settle with B, close R, and invalidate P3. No second confirmation. |
| Author: `tradeRevise {tradeId, proposalId, give, want}` | If revision is permitted, invalidate the old identity and publish a new one. Never transfer. |
| Author: `tradeWithdrawProposal {tradeId, proposalId}` | Withdraw that proposal only. Do not close unrelated proposals. |
| A: `tradeCancel {tradeId}` | Reuse the existing root-cancellation concept. Close root and every child without transfer. |
| Host: `tradeProposal`, `tradeProposalClosed`, `tradeClosed` | Acknowledge immutable terms and authoritative lifecycle results to authorized viewers under P1. |

Require mutually exclusive message fields and a valid discriminator before side effects.
A request cannot include an executable empty `give`.
An Any-N acceptance must include `pay`; legacy Yes cannot choose payment automatically.
Do not let `reply:"propose"` fall into today's Boolean-coercion decline path.
Require exact IDs for every new-mode action, including cancel and withdrawal.
Reject watcher actions, forged authors, self-trades, unauthorized recipients, and unknown or closed parents.

Preserve `freshAction` connection/turn/cid checks.
Noncurrent proposals using `tradeAnswer` retain its existing older-same-turn baseline allowance.
Current-player selection requires the exact current baseline, like current asks/cancellation.
New revision/withdrawal messages should require exact baseline unless their race allowance is separately specified and tested.
A refusal resynchronizes without retrying settlement or extending a deadline.

## Proposed settlement and lifecycle

1. Authenticate the socket's seat and validate its action stamp.
2. Resolve the exact open root and proposal, if any.
3. Check author, recipient, current main turn, permitted response state, and unchanged displayed terms.
4. Check any finite authoritative deadline with `now < until`, even before its timeout callback executes.
5. Resolve Any-N payment or proposal bags into the same concrete A/B exchange.
6. Recheck both live hands and every bag, total, eligibility, and no-gift constraint.
7. Run `offerTrade` for A to B on temporary state, then `respondTrade` for B.
8. Commit only the successful pair, close the root, and invalidate every child synchronously.
9. Publish the authoritative result through existing private state, goods-event, and log machinery.

A selecting A can authorize B's rules response only because B published that exact proposal.
Never expose an unrestricted client ability to act as B.
The intermediate rules offer is not published.
Do not assume settlement advances `seq` exactly once; retain existing rules-action sequencing.
Keep bank and uninvolved players' goods unchanged.

Host processing order decides races, not client timestamps or seat numbers.
Acceptance versus revision, withdrawal, cancellation, or another acceptance has exactly one winning transition.
A late or duplicate request cannot execute against a replacement identity.
A replay with a fresh cid still fails once its original root/proposal is closed.
Connection rotation and absent ephemeral roots prevent reconnect/rematch/restart replay.

For a direct offer, insufficient asker goods invalidates the root; insufficient responder payment rejects only that response.
For a proposal, insufficient payment invalidates that proposal without discarding unrelated affordable proposals.
For request discovery, there is no fixed offered bag to reserve or invalidate.
Do not require A to own another player's entire hand or expose holdings to validate proposed terms.
Host validation uses private hands without publishing them.

Proposed no-reservation semantics preserve current building and bank-trading freedom.
Revalidate at acceptance rather than promising that publication locks cards.
Phase/turn end, root cancellation/replacement, rematch, and relevant takeover close the negotiation and its children.
A takeover must invalidate proposals authored by that seat; a recovery bot cannot inherit its outstanding commitments.

Human named offers keep their current null deadline.
Bot named offers keep their 20-second timeout.
New-mode deadline inheritance remains P5; do not infer a new timeout from the October research.
If P5 chooses a finite deadline, replies and revisions cannot silently renew it.
Negotiation must not bypass the existing total-turn cap.

On rejoin, send fresh private state before live negotiation state visible under P1.
Restore remaining finite time or the null hold; never restart a clock or revive closed proposals.
Do not replay pending gameplay intents.
Host restart drops the ephemeral negotiation; saved rules state needs no wildcard migration.

## Bots, practice, and rollout

Preserve #363/#414 concrete evaluation and the #850 people-first gate.
For a future Any-N selector, enumerate affordable eligible payment bags using only the bot's own holdings.
Prune N greater than the offered card count: existing acceptance policy cannot approve that payment.
Run unchanged `shouldAcceptTrade` on each concrete candidate.
Recommend deterministic resource-order selection among approved candidates; this recommendation belongs to P7, not a new approved bot strategy.
Recheck identity, affordability, seat kind, recovery status, and deadline when a delayed or held answer executes.

Counter pricing, request responses, counter depth, and bot-originated new modes need P7's explicit policy.
Do not treat existing named-offer strategy as permission to generate proposals.
Recovery bots keep conservative declines.
Practice must share the same validation and lifecycle contract, without inventing socket stamps for local play.

A capability gate is required before exposing new variants to old clients.
Proposed capability: `tradeNegotiation:1` in hello/welcome, recorded for seated humans.
Enable new roots only when host and seated human clients support the chosen contract.
An incompatible rejoin closes a new-mode root before sending that client executable trade data.
Legacy spectators must never receive an unsupported payload resembling a free trade.
Visibility under P1 also applies to spectator summaries.
Upgraded clients must omit new modes against old hosts.
Keep ordinary named wire messages compatible, with the explicit future no-gift validation tightening described above.

Implementation touches host negotiation records/dispatch, typed network events, store/practice mirrors, and concrete settlement guards.
Payment/proposal controls must follow a separately approved UI specification.
No new implementation children or readiness claims follow automatically from this document.

## Remaining owner policies

These research recommendations are not approvals.
Each policy blocks only its dependent implementation decisions, not this reconciliation or the approved requirements above.

| ID | Decision needed | Recommendation and alternative |
|---|---|---|
| P1 | Who sees proposals and their terms? | Public terms, matching current table offers. Alternative: only author/recipient; projection and rejoin must then hide others' terms. |
| P2 | Does a counter leave the original offer available? What does declining do to that seat's proposal? | Keep the original independently available. Make decline affect the original only; withdraw a proposal explicitly. Alternative: counter/decline removes that seat's original opportunity. Define all-decline closure with outstanding proposals explicitly. |
| P3 | How many proposals and revisions per seat? Can the asker counter a response? | One live response per seat/root, replaced explicitly. Initially no nested counter chains; asker asks for a revised proposal. Alternative: bounded alternating counters with explicit recipient and revision rules. |
| P4 | Can a third player take another player's counter? | Addressed bilateral proposals only. Alternative: public joinable counters with separate authorization; never allow accidental third-party acceptance. |
| P5 | Do new human negotiation roots and children inherit #1245's hold? | Inherit human hold until closure/turn end; children never outlive their root. Preserve bot timeouts. Alternative: an explicit finite new-mode deadline, requiring Jarrod's exception to the current hold direction. |
| P6 | Must request responses supply exactly the requested goods? | Require exact requested bags for matching responses. Alternative: visibly distinct changed-request counters; never present changed quantities as an exact match. |
| P7 | Which new flows may bots use? | Retain named behavior; review Any-N selection separately. Keep counter/request generation off until a bounded pricing policy is approved. Alternative: specify and test a complete proposal policy now. |

P5 updates the research recommendation to account for the later human-offer decision.
Nothing here reopens the settled mixed-payment or single-Accept choices.

## Acceptance plan for implementation

These are future tests, not claims that the runtime already supports new flows.
Policy-dependent cases run against Jarrod's recorded P1–P7 answers.

| Case | Required result |
|---|---|
| One human Any-N | A offers two wool for any two. B chooses ore and grain, sees both directions, then Accept transfers exactly those bags once. Selection alone changes nothing. |
| Invalid inputs | Empty payments, gifts, overlapping types, unknown keys, unsafe totals/counts, fractions, negative values, wrong N, and unavailable cards fail without partial movement. All-five-resource give fails Any-N eligibility. |
| Simultaneous direct accepts | B and C use the same observed baseline and root. First valid host-processed acceptance wins; the other loses no cards. Exactly one committed trade event. |
| Actual counter | B publishes three wool for one ore from A's perspective. A accepts that exact proposal once. B receives wool without another Yes; no public repost is required. |
| Request collection | A requests ore without offering payment. B proposes timber-for-ore; C proposes wool-for-ore. Publication transfers nothing. A accepts B; only A/B exchange and C's sibling closes. |
| Two request selections | A submits acceptance of B and C. At most one commits, including when selection messages arrive with fresh stamps. |
| Revision/withdraw race | A accepts P1 while B revises or withdraws it. Processing order determines completion or refusal. P1 never silently selects P2. |
| Decline and counter availability | Verify P2's original/proposal relationship and all-decline closure. Decline never counts as proposal acceptance. Repeated decline has no duplicate effect. |
| Capacity and request matching | Enforce P3/P6 explicitly. Reject unsupported chains, excess live proposals, and mismatched requests without replacing unrelated commitments. |
| Cancellation and expiry | Root cancel closes children. Finite expiry rejects late acceptance before delayed timeout callbacks. Human named offers remain open after 60 seconds while the turn remains valid. |
| Spending | Direct ask closes when A cannot cover give. Spending that leaves enough keeps it valid. Proposal payment loss prevents only that trade; no negative or partial hand results. |
| Turn/takeover/restart | End turn, phase loss, rematch, root replacement, and relevant takeover invalidate affected commitments. Recovery bots cannot execute inherited proposals. Restart does not restore an ephemeral deal. |
| Rejoin and replay | Show only still-live authorized records after private state. Preserve null/remaining deadlines. Wrong connection/turn, future seq, repeated cid, and closed-ID replay transfer nothing. |
| Authorization and privacy | Watchers and third parties cannot settle bilateral proposals. P1's visibility applies consistently to publication, logs, snapshots, and rejoin. Never reveal private holdings in errors. |
| Bot response | Every enabled Any-N candidate passes unchanged affordability/goal/leader rules and people-first timing. Recovery bots decline. Closed-root callbacks do nothing. P7-disabled modes generate no proposals. |
| Practice and compatibility | Practice matches settlement/lifecycle. Unsupported clients cannot publish or receive executable new-mode payloads. Future named validation rejects gifts and matching types without changing valid named exchanges. |
| Receipt interaction | Owned counts and exact give/get survive changed holdings and revisions. A stale focused Accept cannot settle changed terms. Pending state does not animate an unconfirmed transfer. |

## Validation boundary

This document uses source inspection, reference checks, and diff checks.
No runtime proofs are required or claimed for this documentation-only change.
Independent Claude review must verify authority, lifecycle, races, compatibility, and the unresolved policy boundaries.
