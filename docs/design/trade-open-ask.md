# Open-ended trade asks

Design for [#561](https://github.com/jarrodjohnson-gif/emberisle/issues/561). **Proposal for owner review; no gameplay or protocol change is made by this note.** “Any good” needs explicit terms before an acceptance can move cards. The recommended contract is a binding ask for a fixed number of cards, with the responder choosing their exact goods before accepting. The two interaction choices at the end need Jarrod's decision under `docs/FRAMEWORK.md` §7; supporting implementation details are proposals for review.

## Verified current behavior

- `src/lib/game/types.ts:RESOURCES` defines timber, clay, wool, grain and ore. `src/lib/game/rules.ts:validBag` accepts only those keys and nonnegative integer counts; empty bags are valid. It does not enforce safe integers or a nonempty bag.
- `server/host.mjs:ask` permits the current seat in `main` to open a named `give`/`want` offer if it owns `give`. It rejects only a completely empty pair: **one-sided named-good gifts currently remain possible.** This note changes no runtime behavior; the future no-gift validation change is explicit below.
- `openOffer` holds one in-memory offer with identity `t${game.seq}-${++offerSeq}`, a declined-seat set, bot timers and a 20-second `until`. Replacement broadcasts `tradeClosed` before the new `tradeOffer`. `answer` currently checks a supplied ID, but also accepts an omitted ID; new open-ask replies must always supply it.
- `respond` constructs `offerTrade` on a temporary rules state, then `respondTrade`; only a successful pair replaces `room.game`. The rules recheck both hands and transfer both bags. A responder lacking goods leaves the table offer open; a failed offerer's rules validation closes it. The intermediate rules offer is never published. Successful trade sequences follow these existing rules actions; do not invent a requirement that `seq` advances by exactly one.
- `play` closes an offer when its asker loses the `main` turn or no longer owns all offered goods. Goods are not reserved: spending some offered resource only closes the ask if the remaining hand cannot cover `give`. `rematch` and `takeOver` close relevant offers; offers/timers are not persisted. `resendOffer` restores an eligible rejoining responder's remaining window and declines after its private state, without restarting the window.
- #524 is implemented through `actionStamp`, `freshAction` and `src/lib/net/table.ts:act`. Every gameplay/trade frame has fresh `cid`, `turn`, `baseSeq`, `connection`; the seat remembers 32 IDs, including refused intents. **Noncurrent `tradeAnswer` intentionally allows an older nonnegative `baseSeq` within the current turn**, but never a future sequence, wrong connection/turn or duplicate ID. Other actions require exact current sequence. Preserve this existing race allowance, subject to exact offer identity and live terms validation. Gameplay is never queued for reconnect.
- `src/lib/game/ai.ts:shouldAcceptTrade` pays only from the bot's own hand, requires receiving at least as many cards as it pays, reduces cards missing for its `goalFor` build, and avoids helping an asker tied for highest public points when ahead of the bot. `chooseTradeAsk` produces concrete one-for-one asks when one card short. `botAnswer` delays 1–2 seconds, rechecks offer and seat kind, and makes recovery seats decline. `runBots` permits one ask per bot turn and pauses on its own open ask. Practice mirrors this in `src/lib/game/store.ts:openOffer/respond`. These #363/#414 boundaries remain.

## Proposed terms and interaction

The new ask contains a concrete, nonempty offered bag and `any.count = N`, a positive safe integer. N is an exact card count, not a value score, range or unlimited request. Recommended first release: N cards may be a mixture of any of the five resources **except resources appearing positively in `give`**. There are no fortunes, pieces, bank payments or unknown resource names. The host derives this allowed set; clients cannot widen it. Reject an offer with no allowed resource. Both `give` and the selected payment use `validBag` plus safe-integer, positive-total and affordability checks; summation must also remain a safe integer. Zero entries are ignored/canonicalized away.

Disjoint positive supports ensure each party actually gives and receives goods: no gifts, empty payment, self-swap or zero-net transfer. Unequal card counts are allowed; no new exchange-rate rule is imposed. For the future implementation, named offers and counter-derived named offers must also reject gifts and zero-net transfers; otherwise they bypass this requirement. Canonicalize each resource to its net transfer and require a positive nonempty transfer in both directions. Normal two-sided named trades and their wire format remain supported. This is an explicit proposed validation change when implementation lands, not a change made by this documentation PR.

The responder sees “2 wool for any 1 card” and the eligible goods, chooses exactly N cards from their hand, then sees the concrete exchange on an **Accept** control. No default payment and no generic Yes that lets the host select goods. Selecting is local only: no reservation or transfer. Final acceptance binds the offerer to the advertised choice rule; no second offerer confirmation. Decline uses the existing per-seat decline/close behavior. A declined responder cannot later accept or counter that same new open ask; replacing it produces a new identity and clears declines. Spectators have no controls.

An exact-N eligible choice is acceptance, not a counter. To propose a different quantity or offered bag, a responder may send one **nonbinding counter suggestion per trade ID** with both concrete bags, viewed from the original asker's perspective. It must pass the same two-sided/disjoint validation, and the responder must currently own its proposed `want`. The host delivers it privately to the asker, without moving goods, reserving cards, declining the original, changing its terms, or extending any clock. It reveals no other hand information. Suggestions vanish when that offer closes. They are not executable commitments and need not survive reconnect. The responder can still accept or decline the original.

The asker may ignore a counter or use its terms to publish a **new named-good table ask**, validated through the normal current-seat ask path; the original first closes and a new ID opens for all other seats. T2 retains the open-ask path’s two-sided/nonzero validation, mandatory exact reply identity, and capability gate; republishing cannot fall back to permissive legacy gift validation. Another seat may take that new table ask. Label this action “Offer these terms to table”, not “Accept counter”; there is no targeted counter-acceptance or reservation in this proposal. A true targeted counter flow would be a separate owner decision and protocol design.

## Proposed wire contract and transitions

These are additive messages with required discriminator validation; never encode “any” as an empty named `want`.

```text
A → host: tradeAsk { give:{wool:2}, any:{count:1}, ...stamp }
host → seats: tradeOffer { tradeId:T, from:A, give:{wool:2},
                          any:{count:1}, seconds:20 }
  CLOSED → OPEN(T); no goods move; no game.seq advance merely for opening.

B → host: tradeAnswer { tradeId:T, yes:true, pay:{ore:1}, ...stamp }
  OPEN(T) → CLOSED(T,taker:B); atomically A:-2 wool,+1 ore;
  B:+2 wool,-1 ore. Broadcast existing tradeClosed {tradeId:T,taker:B},
  then normal private state/log results containing concrete goods.

B → host: tradeAnswer { tradeId:T, yes:false, ...stamp }
  OPEN(T) → OPEN(T,declined+=B), or CLOSED if all other seats declined.

B → host: tradeAnswer { tradeId:T, reply:"counter",
                       counter:{give:{wool:3},want:{ore:1}}, ...stamp }
host → A only: tradeCounter { tradeId:T, by:B, give:{wool:3},want:{ore:1} }
  OPEN(T) → OPEN(T); no transfer, seq change or deadline extension.
  A may send ordinary named tradeAsk with those terms and a fresh stamp;
  host closes T before opening T2. B must freshly accept T2.

A → host: tradeWithdraw { tradeId:T, ...stamp }
  OPEN(T) → CLOSED(T); only T's asker can withdraw; no goods move.
```

For open offers `tradeAsk` has exactly one of `want` or `any`; `tradeAnswer` is exactly accept-with-pay, decline, or counter, with incompatible fields rejected. Never let `reply:"counter"` fall through today's Boolean-coercion decline path. Require exact `tradeId` on every new-mode reply/withdraw/counter, authenticate the seat from its socket, and reject asker/self replies and declined seats. `tradeWithdraw` is new and requires the current exact action stamp. Counter stays a `tradeAnswer`, preserving the existing noncurrent same-turn parallel-stamp allowance. Explicit validation must precede side effects.

On acceptance, check `Date.now() < until` explicitly (a delayed timeout callback is not authority to accept after expiry), current game/turn/phase and exact live identity, both hands, selection whitelist/count and disjointness. Resolve `pay` to a concrete `want` and reuse the existing temporary `offerTrade` → `respondTrade` transaction. Commit/close synchronously with no asynchronous gap. On payment validation failure reject only that response; on invalidated asker/phase close the offer. Emit one committed goods event using the existing rules/log machinery. Do not expose the intermediate transaction or mutate any hand on failure.

The host's serial dispatch makes the first valid acceptance processed before expiry win; this is arrival/processing order, not client timestamp or lowest seat number. Closing T and committing the transaction occur in the same synchronous operation. Another near-simultaneous reply, replayed `cid`, late counter or old-T reply cannot find an executable T. Do not auto-retry any acceptance against T2. Old reconnect/rematch frames fail their connection/turn stamp even if an ID/counter coincidentally matches.

No reservation or clock renewal occurs while selecting, countering or declining. Expiry, replacement, explicit withdrawal, end turn/phase, loss of offered affordability, recovery takeover and rematch close T and cancel its bot timers and suggestions. Rejoin gets only remaining time after a fresh private snapshot; expired offers are closed rather than resurrected. Host restart drops the in-memory offer. Rejections do not rearm gameplay/offer deadlines, write a save or run bots; expiry itself may perform normal close/resume behavior. Successful trades retain the existing offerer's turn-window behavior.

## Bots and compatibility

For an open ask, enumerate eligible affordable concrete payment bags of exactly N cards from the bot's own hand. Bound enumeration by its holdings, total-N checks and the existing five-resource space; prune when `N > size(give)` because existing policy cannot accept. Call unchanged `shouldAcceptTrade` for each concrete `{from,give,want:pay}`. Choose an accepted candidate with smallest post-trade goal deficit, then greatest remaining spare cards for that goal, then canonical `RESOURCES` order as a deterministic tie break. If none passes, decline. Do not read opponents' private hands, invent willingness probabilities or weaken leader/card-count checks. A delayed callback rechecks live identity, expiry, bot kind, recovery status and affordability before using the shared commit path. Bots do not counter or originate open asks in this first design; `chooseTradeAsk`, one-ask-per-turn, rejection memory and 20-second pause bound remain unchanged. Practice uses the same concrete selection and validation policy, with store-owned timers; local play has no socket stamps to invent.

Required implementation surface: host open-offer record/validation/dispatch/resend/expiry, typed wire offers/replies in `src/lib/net/table.ts`, `OpenOffer`/online handlers/practice mirrors in store, payment selection and counter/withdraw controls in `TradeToast`/`TradePanel`, and a pure bot payment selector next to `shouldAcceptTrade`. The rules' `TradeOffer` remains concrete; no “any” state enters `applyAction`.

Current `src/lib/net/proto.ts` is version 1. A bump alone is insufficient: current host handshake accepts older versions and missing proto, while old UI interprets empty wants as gifts. Recommended rollout adds explicit `tradeOpenAsk:1` capability in hello/welcome, records it for every human seat, and enables publishing open asks only when all seated human clients support it; bots use host support. Legacy clients continue normal two-sided named offers with the existing wire shape. The future host rejects their one-sided or zero-net offers too; this intentional validation change prevents a legacy-message bypass of the no-gifts requirement. A late incompatible join/rejoin during T closes T before sending the legacy client any offer; an old spectator gets a safe textual summary, never an executable/gift-shaped offer. Upgraded clients omit the feature against old hosts and do not send new messages without negotiated support. The implementation must not send `any` alongside a fake empty `want`, reinterpret a legacy Yes as a payment choice, or accept missing `pay` for an open offer. Saved game/rules state needs no wildcard migration because offers remain ephemeral and accepted trades are concrete.

## Acceptance cases for the future implementation

| Case | Required observable result |
|---|---|
| One human | A gives 2 wool for any 1; B selects 1 ore and sees those concrete terms. Exactly A −2 wool/+1 ore and B +2 wool/−1 ore; others/bank unchanged; one committed trade event and T closes. Merely selecting moves nothing. |
| Quantities and invalid bags | Any-2 accepts 1 ore + 1 grain; unknown keys, unsafe/fractional/negative counts, offered-resource overlap, empty give/pay, wrong total and unaffordable pay reject without any transfer. Offering all five resources leaves no allowed payment and rejects. |
| Two simultaneous accepts | B pays ore and C pays clay using the same T and observed baseline. Exactly the first valid processed reply commits. Second gets gone/stale without losing goods; one closure/result. Duplicate fresh-baseline replay with same cid and replay after reconnect/rematch cannot transfer again. |
| Counter/decline | B's 3-wool-for-ore suggestion moves nothing and does not reset T. A publishes it as T2; late yes/counter/withdraw for T cannot affect T2. T2 needs its own acceptance. B's explicit decline counts once; all decline closes T; a declined B cannot accept original T. |
| Expiry/withdrawal | A valid-looking accept after `until` fails even before timeout callback runs. Explicit withdraw, replacement, pass, takeover and rematch close/cancel timers. No late bot/human reply moves goods; reconnect never supplies a new 20 seconds. |
| Offerer spends goods | A spends below the 2-wool commitment: T closes before bots run and late B acceptance changes nothing. Spending while still owning 2 wool leaves T valid; valid same-turn responder reply can use an older baseline but must revalidate T and both hands. |
| Responder races | Payment becomes unaffordable before processing: reject that reply, leave valid offer for others. Wrong connection/turn, future seq or duplicate cid is refused and private state resynced without deadline/save mutation. |
| Bot | Helpful affordable candidate passes unchanged acceptance policy after bounded delay; unhelpful, leader-helping or impossible payment declines. Recovery bot always declines; callback on closed/replaced offer does nothing; bots neither counter nor exceed one named ask per turn. |
| Legacy | Normal two-sided named offer/accept/decline remains supported. Once implementation lands, legacy one-sided or zero-net named offers reject without transfer, including a counter republished as T2. Old host/client combination cannot create/accept an open ask or render it as a gift. |

This design step's review is source/reference inspection and document diff checks. It runs no gameplay proofs and claims no implementation behavior beyond the verified current paths above.

## Owner decisions (recommendations, not approvals)

1. **What can satisfy “any N”?** Recommended: exactly N mixed cards from the five resources, excluding goods the asker offers, as specified above. Alternative: require all N cards to be one selected resource. This changes both wording and payment selection.
2. **Does selecting eligible goods accept immediately?** Recommended: the ask binds the offerer; the responder's concrete Accept commits, with optional nonbinding counter suggestions and republish-to-table flow. Alternative: every response is a proposal requiring the offerer's second confirmation; that requires a different pending-proposal/expiry/race design before implementation.

Sources: issue #561; `docs/research/complaints-digital.md` §16; issues #524/#363/#414 and their decision/completion comments; checkout symbols cited above. Approval of bot trading in #363 does not establish approval of this proposed open-ask UX.
