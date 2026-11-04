# Research: fast counteroffers and “Looking for X” trading

- Step: Research, [#769](https://github.com/jarrodjohnson-gif/emberisle/issues/769), child of #561.
- Date checked: 2026-10-18.
- Draft research: Codex-fast-trading (GPT-6.1 Sol); continuation: Codex-fast-trading-luna (GPT-6 Luna).
- Source baseline first read: `82594c74504381e9eb8596695a3d71e7577e1a74`; relevant trade paths were rechecked on fresh main at `ea9be1d4dcfc7d58dacd25e2e281e0998e41e237`.
- Scope: public documentation and local source review. No accounts, public games, purchases, or live-game measurements.

## Recommendation and authority

Follow the documented Colonist pattern: explicit give/receive directions, visible responses, and editable counteroffers.
Add request-only discovery as a separate stage before a fully specified deal.
These are research recommendations; current Colonist behavior remains unverified during this check.

Use this distinction throughout the design:

- **Concrete offer:** published terms authorize one settlement when the other player accepts.
- **Counteroffer:** changed, complete terms authorize settlement when the addressed player accepts.
- **Request-only ask:** “Looking for 1 stone” invites proposals. Publishing the ask authorizes no transfer.
- **Response proposal:** names both players' exact payments. The asker chooses one proposal through Accept.

This avoids confusing an interest signal with a gift or a completed trade.
It also preserves one Accept for an agreed deal.
A proposal submission and its later acceptance are different actions, not two confirmations of one deal.

The latest [owner request](https://github.com/jarrodjohnson-gif/emberisle/issues/561#issuecomment-6250347429) requires actual counteroffers and request-only asks.
It specifically says the asker picks one response.
The earlier [decision](https://github.com/jarrodjohnson-gif/emberisle/issues/561#issuecomment-6244802140) permits mixed payments and exactly N eligible cards for “any N”.
It requires exact selected payment before Accept, one Accept, no gifts, and no matching resource types across directions.
These remain constraints. The later request expands negotiation beyond the earlier nonbinding counter suggestion.
Jarrod still needs to choose the interaction policies listed below.

Draft [PR #692](https://github.com/jarrodjohnson-gif/emberisle/pull/692) owns `docs/design/trade-open-ask.md`.
This research neither edits that file nor repeats its detailed protocol specification.

## Evidence: newly checked and inherited

Public pages were retrieved on 2026-10-18. Retrieval does not establish current in-game behavior.

| Source | Evidence checked now | Limit |
|---|---|---|
| [CATAN base rules, 2020 PDF](https://www.catan.com/sites/default/files/2021-06/catan_base_rules_2020_200707.pdf), Domestic Trade | Players negotiate single or multiple cards; counteroffers are allowed. Gifts and matching-resource trades are prohibited. | Tabletop authority, not digital UI evidence. Domestic Trade appears on printed pages 4 and 7. |
| [CATAN Universe publisher announcements through Steam](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=544730&count=100&maxlength=0) | Retrieved 100 announcements. The dated entries below explicitly discuss trade behavior. | Historical publisher statements; no current client test. |
| [Universe 2.3.5, 2023-08-14](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5839532486224947132) | AI waits for the human's response to trade offers before proceeding in single-player. | Does not specify a timeout or negotiation algorithm. |
| [Universe 2.2.5, 2021-08-17](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4516534149073339447) | “Counteroffer icon now consistent again.” | Establishes an implemented counteroffer signal then; not today's exact controls. |
| [Universe 2.2.4, 2021-07-05](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4032392655102974053) | Mobile “Hide Tradeboard” button became responsive again. | Establishes hide/show affordance then; no measured ergonomics. |
| [Universe FAQ](https://catanuniverse.com/en/faq/) | Five/six-player special-turn text distinguishes domestic and maritime trade. | No sufficiently detailed request-only or counteroffer acceptance contract. |
| [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Focus enters a modal; Tab stays inside; Escape closes; focus normally returns to its invoker. | Accessibility guidance, not competitor behavior. |
| [W3C target-size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Minimum target criterion uses 24 CSS pixels, with specified exceptions including spacing. | Does not establish a competitor's target sizes or mandate Emberisle's larger 44-pixel aim. |

Earlier local research supplies useful leads, with weaker current verification:

- [Competing games](competing-games.md), dated 2026-09-27: entry friction, reliability, and social play.
- [Mobile UX benchmark](mobile-ux-benchmark.md), dated 2026-10-05: trade direction, response icons, and phone noise.
- [Digital complaints, item 16](complaints-digital.md#16-the-trade-menu-is-confusing-bank-trading-hidden-docks-opaque-no-open-ended-offers): bank visibility and open-ended demand.
- [Bot trading](bot-trading.md), dated 2026-10-05: shipped bot policy and timing, not proposed negotiation behavior.
- [UX improvements](ux-ui-improvements.md): unobscured touch targets, keyboard focus, and comprehension checks.

The benchmark attributes these patterns to Colonist's [2023 trade article](https://blog.colonist.io/improving-the-colonist-trade-system/):

- Give/receive directions follow the hand's spatial model.
- Per-player responses distinguish accepting, rejecting, and deciding.
- Players can counteroffer, including when they cannot afford the original ask.
- Wildcard offers and joining others' counteroffers are described.
- A bank tab separates maritime transactions from negotiation.

It also attributes filtering and hideable mobile offers to the [Rush development article](https://blog.colonist.io/colonist-rush-development/).
Both articles returned HTTP 403, Cloudflare error 1010, during this check.
`colonist.io/keyboard-shortcuts` and `en.boardgamearena.com/doc/Gamehelpcatan` returned the same error.
These are observed site denials, not demonstrated environment allowlist failures. No access bypass was attempted.
The earlier Colonist design issue `https://github.com/colonistio/design/issues/297` returned API HTTP 404.
The old quotes remain inherited evidence; this check cannot establish whether that issue was removed or made private.

A Dovetail trading article URL redirected to `live.catanconsoleedition.com/news/catan-console-edition-trading`.
Its retrieved HTML contained no substantive trading instructions. It supplies no evidence for this comparison.

## Comparison of fast trading patterns

“Best” requires task measurements and player comprehension evidence. Public descriptions alone cannot establish a winner.
Colonist supplies the closest documented interaction model through inherited research; Universe supplies newly checked historical product lessons.

| Product or pattern | What the evidence supports | Implication for Emberisle | Unknown |
|---|---|---|---|
| Colonist, published design as recorded locally | Directional give/receive, response icons, counteroffers, wildcard offers, separate bank tab. | Keep exact directional receipts and compact response states. Prefill a counter from the original terms. | Current behavior, request-only selection contract, races, click counts, keyboard behavior. |
| Colonist Rush, recorded locally | Hideable mobile offers and filtering reduce distracting offer noise. | Keep negotiation bounded and collapsible; do not cover the board with stacked dialogs. | Current filtering rules and measured speed improvement. |
| Universe, publisher patch history checked now | Counteroffer icon, mobile tradeboard hiding, AI waiting for a human response. | Make counters recognizable, allow board access, and give humans time to answer. | Current UI, exact acceptance sequence, request-only support, measured latency. |
| CATAN tabletop negotiation | Active player participates; others can propose changed terms; exact bilateral exchange follows agreement. | Model each counter or request response as one complete two-player deal. | Tabletop rules do not define network, focus, expiry, or discovery UI. |
| Bank/dock transaction | Fixed identical-resource ratios, with no other player's consent. | Show a separate immediate exchange path and live rate. | No reason to route these through counteroffer or request selection. |

Do not hide every unaffordable offer automatically when counteroffers exist.
A player unable to pay two wheat might still offer one stone.
Keep Accept unavailable with an explanation, while allowing a legal changed proposal.
This reconciles the noise lesson with the owner's expanded negotiation request.

No checked source proves request-only “Looking for X, choose one response” is a current competitor feature.
That flow comes from Jarrod, not a claim about Colonist or Universe.

## Concrete actor and state implications

The following is a candidate contract for design review, not an approved protocol.
Names describe concepts rather than new message names.

**Actors:** A is the active player and asker; B and C are other seated players.
The host validates and settles. Watchers read public negotiation without acting.
Keep B–C exchange outside these flows unless Jarrod changes the active-player rule.

| Flow | Example and candidate transitions | Who can settle? |
|---|---|---|
| Concrete bilateral offer | A publishes “I give 1 wood; I get 1 stone.” Open → accepted or closed. | B's Accept settles the displayed deal once. |
| “Any N” offer | A publishes 1 wood for any two eligible cards. B selects 1 brick and 1 sheep. | B sees that exact receipt, then Accept settles once. A has already committed to the choice rule. |
| Actual counteroffer | B edits the example to “A gives 2 wood; B gives 1 stone,” then publishes it to A. | A accepts that exact counter once. Publishing or receiving it transfers nothing. |
| Request-only ask | A publishes “Looking for 1 stone,” with no payment promise. Open request → proposals → selected or closed. | Neither publication nor “interested” status settles anything. |
| Response to request | B proposes “B gives 1 stone; A gives 1 wood.” C proposes stone for sheep. | A accepts one complete proposal. Close the request and invalidate its siblings atomically. |
| Counter to a response | A changes B's demand to “A gives 1 brick; B gives 1 stone.” | B must accept the new exact terms; selecting a draft cannot bind B to changed terms. |

A request response needs both sides even though the request names only one side.
Otherwise the asker cannot compare prices or authorize their own payment.
“Offer stone” must therefore open a payment choice or publish a fully specified bilateral proposal.
Never interpret the request's missing payment as “give nothing.”

Each published deal needs an identity, parent identity, revision, authorship, exact bags, and an authoritative deadline.
Acceptance must identify the immutable revision actually displayed, not whichever revision happens to be newest.
Treat changed terms as a new revision requiring a new intentional Accept.
Do not reuse a prior player's Yes or move a newly changed deal under a focused Accept button.

Suggested state distinctions:

- Local draft: editable, unpublished, no other player commitment.
- Sending: await host acknowledgment; prevent duplicate submission.
- Open: published and eligible for responses or acceptance.
- Responded: an independent proposal exists; this does not mean accepted.
- Settling: one acceptance is pending; prevent duplicate activation.
- Completed: authoritative successful transfer and named partner.
- Closed: withdrawn, expired, superseded, invalidated, or declined, with a visible reason.

Keep response status distinct from deal status.
“B proposed” is neither “B accepted” nor “B declined.”

## Acceptance, cancellation, and race expectations

These are recommended acceptance cases for the later design and implementation.
They do not claim current support.

| Case | Expected safe result |
|---|---|
| Two players accept a concrete offer together | Host commits at most one settlement. The other gets “Already traded with B.” |
| A accepts B while B revises the proposal | Accept succeeds only for the exact still-valid revision A viewed; otherwise refresh without transfer. |
| A accepts B and C together | Commit one request selection; invalidate every remaining proposal. Never buy both accidentally. |
| B withdraws while A accepts | Host ordering determines one result: withdrawn or completed. All clients converge on that result. |
| A spends the proposed payment before selection | Revalidate live holdings. No negative hand or partial transfer; show why the proposal cannot complete. |
| B spends the offered stone before selection | Revalidate B's holdings. Mark that proposal unavailable; do not imply stone cards were reserved. |
| A withdraws the request | Close its children. Late submissions and accepts cannot reopen it. |
| B closes an editor | Discard or retain only the local draft; do not withdraw a published proposal implicitly. |
| A changes “1 stone” to “2 stone” | Publish a new request revision; invalidate responses whose terms belonged to the old revision. |
| A closes the trade sheet | Keep close and withdraw separate. Explain whether published negotiation remains open. |
| Offer expires or active turn ends | Reject late settlement and close associated proposals. Countering must not silently extend the turn. |
| Client retries after reconnect | Reconcile authoritative status; never replay acceptance as a fresh deal. |
| Observer or stale connection acts | Reject unauthorized action using the existing seat and connection validation model. |
| Any deal contains gifts, negative counts, or matching resource types | Reject before publishing a binding deal and again before settlement. |

Prefer host-ordered settlement with live revalidation over reserving cards during discovery.
Reservation would change building and bank-trade freedom; that needs an explicit owner decision.
A request-only draft may omit a payment, but a settling deal must never omit it.

No timeout value is inferred from competitor descriptions.
Current Emberisle offers last 20 seconds; response proposals need an explicit parent-deadline policy.
Recommend one bounded parent window, without renewal on every counter.
Keep the existing total-turn cap effective throughout negotiation.

## Speed, touch, keyboard, and feedback

These are proposed evaluation criteria, not measured competitor timings or approved UI layouts.

- Preserve “You give” and “You get” beside the final action, including counts and player names.
- Show owned counts beside payment selectors. Distinguish “not owned” from “not selected.”
- Prefill counteroffer terms from the original deal. Show changed amounts without reversing their meaning.
- For requests, put the requested goods above competing exact receipts; label each proposer.
- Compare proposals without closing and reopening separate modals.
- Prefer stable proposal positions over live price sorting that moves Accept during a tap.
- Collapse details when needed; keep response count and withdrawal discoverable.
- Keep chat, board targets, and End turn usable at portrait and landscape sizes.
- Aim for 44-pixel primary touch targets, following existing local UX guidance; measure actual hit rectangles.
- Separate Accept, Counter, Withdraw, and End turn targets. Never rely on hover or long-press for required information.
- Support Tab, Shift+Tab, Enter, and Space on native controls. Avoid global acceptance shortcuts while typing chat.
- Keep any modal's focus contained and restore it on close, following W3C guidance.
- Announce one new counter or proposal politely. Do not announce every countdown tick or steal focus on arrival.
- Keep silent mode and reduced motion usable through text and status alone.
- Acknowledge a tap locally; show Sending until the host responds. Never animate goods as transferred before host success.
- Show Completed, Expired, Withdrawn, or Unavailable explicitly. A disappearing card alone cannot explain the outcome.

Measure actions after entering Trade and report each participant separately:

| Task | Proposed interaction budget to evaluate |
|---|---|
| Accept an unchanged concrete deal | One Accept after reading the exact receipt. |
| Counter an existing deal | Counter → edit needed counts → Send counter. No re-entry of unchanged terms. |
| Publish request-only ask | Choose requested goods → Ask. Do not force a speculative payment first. |
| Answer request | Choose payment terms → Send proposal. The receipt shows both players' obligations. |
| Select response | Read competing receipts → Accept one. No extra confirmation after that Accept. |

Count resource changes separately from action buttons; larger quantities legitimately need more inputs.
Record tap-to-feedback, submit-to-host-result, and request-to-completion separately.
Compare touch and keyboard errors, abandoned negotiations, counter depth, and turn time.
A fast animation does not establish fast negotiation or comprehension.
Use a controlled delayed connection to verify pending, timeout, and stale-result explanations.

## Local baseline and integration boundaries

Source reading at the recorded commit found:

- `server/host.mjs`, `openOffer`: one table offer, per-offer identity, 20-second expiry, replacement closure, delayed bot answers.
- `ask` permits only the active player during main phase and validates bags and offered holdings.
- `respond`: No records a decline; Yes attempts the existing two-sided rules actions and publishes the resulting state.
- `src/components/game/TradeToast.tsx`: exact directional receipt, waiting/declined icons, shortage reason, Yes/No, and countdown.
- `src/lib/game/store.ts`: matching practice offer/answer machinery.
- Existing `offerLine` can describe a one-sided ask. That wording does not implement proposal collection or asker selection.

Current `ask` rejects both bags empty, but does not require both bags nonempty.
The future no-gift requirement therefore needs explicit validation across every settlement path.
This note does not present existing one-sided acceptance as an approved request-only implementation.

Existing bot policy is documented in [bot trading](bot-trading.md).
No source establishes how those bots should price counters or answer request-only asks.
Recommend retaining current concrete-offer behavior while separately deciding bounded proposal behavior.
Takeover bots should retain their conservative decline policy.

Tracker checks found no exact fast-trading research child before #769 was created.
#561's draft #692 remains the design node; #757 concerns expanded-offer board/chat space.
Existing layout, response-icon, and bank-rate work does not implement this negotiation contract.
No runtime, shared proof, package, or reserved design file changed here.

## Questions requiring Jarrod's decisions

These questions concern new policies, not whether to perform the requested research.

1. **Who sees competing proposals?** Recommend public terms, matching the existing public table-offer model.
   Private responses reduce comparison pressure but introduce a new hidden negotiation model.
2. **What happens to the original offer after a counter?** Recommend keeping it independently valid until accepted, withdrawn, or expired.
   Alternative: a counter replaces that responder's original acceptance opportunity. Either choice needs explicit status wording.
3. **Can a player keep several responses open?** Recommend one live response per seat per parent, replaced by explicit revision.
   Unlimited responses permit comparison within one seat's alternatives but increase noise and mis-selection risk.
4. **Can anyone join someone else's counter?** Recommend addressed bilateral counters first; no implicit third-party acceptance.
   Colonist's inherited jump-in pattern needs distinct authorization and receipts before adoption.
5. **How long does discovery last?** Recommend one bounded parent deadline, with counters inheriting its remaining time.
   Extending the window helps slow readers but can prolong the turn; never silently reset its total cap.
6. **Do request responses have to supply the exact request?** Recommend exact requested goods initially.
   Allow changed quantities through explicitly labeled counteroffers rather than presenting them as matching responses.
7. **Do bots participate in the new flows?** Recommend separate bounded policy review before enabling proposal generation.
   Existing build-goal evaluation is evidence for concrete offers, not approval of counter chains or request pricing.

The designer should record answers on #561 before treating these recommendations as binding rules.
No new implementation children are necessary merely to duplicate that existing design step.

## Validation and handoff

Research validation: checked source attribution, local symbols, issue linkage, and the single-file diff.
No gameplay tests ran; this document changes no runtime behavior.
Public-site restrictions prevent current hands-on competitor verification, but leave the semantic comparison useful.
Different-model review must check the distinction between owner requirements, historical evidence, and suggested policy.
The next authorized step is review, followed by reconciliation of #561's design through its existing owner.
