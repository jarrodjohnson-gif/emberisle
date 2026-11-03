# Issue 1274: proposed decisions and build boundary

Prepared 2026-11-03 by Astra. This is a review proposal, not an accepted specification. The owner comments on #1274 explicitly keep all eleven decisions open. The current request to take the issue authorizes work, but does not select between the eleven alternatives.

## Eleven recommended answers

| # | Proposed answer | Reason and implementation consequence |
|---|---|---|
| 1 | Adopt 60% clear viewport height as the 390×844 portrait baseline; document safe-area and short-screen exceptions. | Define the measured rectangle independently of the camera. A declaration of a hole does not prove the island fits it. Never refit on phase changes. |
| 2 | Adopt 8/12/20 for controls/chips/sheets going forward. | Matches the current tokens and later mock direction; requires explicit replacement of the recorded 12/16/24 decision. Leave radii untouched in the initial colour fix. |
| 3 | Accept approximately 42% at 320×568 with the same dock slots. | Moving the instruction into the header would break consistency without reaching 60%. Preserve a readable board and 44px targets; shrink card widths, not targets. |
| 4 | Teal #246d72 as the single primary fill. | Matches the proposed white/mist direction. Apply after approval across all variants/callers; retain current primary colours in the initial fix. |
| 5 | Keep the approved 10px uppercase hand name as an explicit exception. | V1 is already approved; a type migration is a separate visual change and consumes scarce narrow-card width. |
| 6 | Prototype and approve the 360px right-column landscape title. | At 844×390 it leaves 484px for the island. Include small-height overflow and keyboard screenshots before implementation. |
| 7 | Keep accepted lobby HIG scale as a named exception. | Do not undo the accepted #1220 proposal in a global primitive change. |
| 8 | Bottom-anchor the fortune sheet, with a fixed bottom action region for the selected fortune. | Bottom anchoring alone cannot put every list-row Play action in the bottom third. Keep normal reading/DOM order; selection plus fixed Play resolves the requirement. Needs a mock. |
| 9 | Keep existing seat colours and identity with a dark ring; do not revive seat marks. | Preserve the recorded colour-identity decision. Names and accessible labels provide identity alongside colour; a ring makes Dune visible but is not a new identity encoding. |
| 10 | Approve the intent, not the inaccurate 656×184 dimensions; prototype a corrected desktop dock. | Seven controls are listed, not eight. Use seven equal columns, or explicitly name an eighth action. See geometry below. |
| 11 | Adopt 16px portrait gutters and 24px desktop gutters, including safe areas. | Use max(gutter, inset) consistently; calculate children from available width, not fixed 52/62/79/111px widths. |

## Corrections required before a dock mock is called buildable

- Portrait row heights total 202px: 62+32+44+44+20. Four 8px gaps and two 8px paddings make 250px, not 252px. A 1px border on each side explains 252px, but then inner width also loses 2px. Specify border-box versus content-box and derive all cell widths.
- At 358px outer width and 8px padding, five 62px cards plus four 8px gaps exactly consume 342px without borders. Four build columns are 79.5px, not 79px; three action columns are 108.67px, not 111px. Grid fractions avoid cumulative overflow.
- At 288px outer width and 8px padding, five equal cards are 48px with four 8px gaps. Five 52px cards need 292px even before padding. Build columns are 62px. These remain above the 44px target floor. With borders, use fractions and verify actual hit areas.
- A 252px dock at y=576 ends at 828, leaving 16px at 844. A 34px bottom safe area moves its top to 558 and reduces the clear hole from 508px to 490px (58.1% of viewport). Therefore an unconditional 60% assertion contradicts safe-area support.
- Desktop: five 88px cards plus four 8px gaps consume 472px. A 176px instruction column plus one 8px gap totals 656px before padding/borders. A 656px outer dock with 8px horizontal padding has 640px available; either reduce cards to 84.8px or widen the outer dock to 672px. Prefer a 672px prototype with the requested 88px cards. Seven action columns fit at about 86.9px in 656px content width, retaining readable cost chips. Height should be derived from rows, not forced to 184px.
- Desktop 656px centred in 1280px starts at x=312; y=524 plus 184px leaves 12px, contradicting the proposed 24px desktop gutter. A 672px box starts at x=304. Derive y from the measured height and max(24px,bottom inset).
- Landscape: the proposed 320×270 dock at y=104 ends at 374. Hand44+turn32+build44+action44+meta20+tools44, five gaps40, and padding16 total 284px. The tools cannot be silently added inside 270px. Starting those slots at y=90 gives 284px ending374; build begins y=190, violating the stated y≥195 reach criterion. A new landscape mock must reconcile vertical budget, reach and tools.
- The text forbids every translucent surface but explicitly requests a 70% backdrop. Define the scrim as an exception, separate from opaque content surfaces.
- The text says three weights, then uses 500/600/700/800. Keep approved existing type until a corrected scale is approved.
- Replacing End turn with Yes/No for an offer conflicts with a literal stable-action-position interpretation. Reserve named slots and specify focus retention, cancel behavior, simultaneous offer/discard priority, and spectator states before code.
- The stationary dock must cover roll-off, setup, roll, main, robber, discard, victim selection, game over, spectators, reconnect, incoming/outgoing offers and keyboard placement. Showing a fixed empty box is insufficient if controls escape it.

## Work that can proceed now

1. Correct chrome cream to the already approved white-on-mist direction while preserving geometry, variants, type and runtime behavior. Retain compatibility token names; deleting all aliases is unnecessary churn. Preserve the scene palette and studio horizon. Audit shared hand tokens against the documented V1 exception before changing them.
2. Capture baseline and corrected screenshots at 390×844, 844×390, 320×568 and 1280×720. Extend appropriate existing proofs only with meaningful checks for approved colour behavior; do not assert the proposed dock geometry as approved.
3. Produce corrected static mock(s) and a state/slot matrix for the stationary dock, including real safe-area dimensions. The output is a concrete decision packet, not runtime UI.
4. Run existing contrast, build and relevant screenshot/browser checks. Do not loosen assertions or move size budgets. Any replaced obsolete approved-design assertion belongs in a separate commit with its old/new mapping.

Do not fold the issue's claimed “safe steps 1–3” together: button variants, primary colour, global type, radius, removal of all translucency and new motion treatment exceed the already settled cream correction.

## Implementation partition after approval

- Foundation: shared semantic palette aliases, button hierarchy and type, surfaces/edges, reduced-motion treatment. Own styles.css and ui/button.tsx centrally.
- Dock: a pure phase-to-slot model plus one responsive shell; integrate existing action handlers rather than duplicate game logic. Own Hud.tsx, TradeToast.tsx, DiscardBar.tsx, TakeFromBar.tsx, PlaceChip.tsx and mobile-fit.ts together.
- Hand/seats: approved V1 preservation, responsive card widths, seat ring, external player popover/sheet. Own Hand.tsx, hand-motion.css, SeatDot.tsx, SeatRail.tsx, PlayerMenu.tsx.
- Secondary screens: title, lobby, trade, menus, chat, win, and help/cost/fortune sheets in small coherent passes. Keep existing online/offline, host/guest, keyboard and screen-reader behavior.
- Verification: slot rectangle equality through all phases; no overflow at four sizes; safe areas and zoom; primary count within the active surface; focus return and one modal; enabled/disabled reasons; human offer persistence, bot offer timeout and turn transitions. Run long browser proofs serially and register any new proof in both package.json and CI.

Do not close #1274 after the colour slice; it remains the design/implementation umbrella until the decisions and remaining scope are resolved.

## Reviewable layout study

Open [index.html](index.html). This standalone schematic has eleven phase choices and a 0/34px bottom safe-area switch. It is proposed, not shipped. Its controls are illustrative; it has no engine, networking, camera, focus trap, real hand artwork or production cost symbols. It deliberately exposes geometry separately from those dependencies. Short resource initials are placeholders, not proposed production copy. The small build labels and costs are not final typography.

This study chooses a **250px dock without a layout-consuming border** (an outline supplies the edge). This corrects the original arithmetic rather than claiming its 252px was measured. Therefore upright y=578, small y=302, and small board height=234px (41.2%). At a 34px bottom inset those become y=560 and y=284, with board heights492 and216px (58.3% and38.0%). Recommendation 3 means accepting a roughly42% baseline and a smaller safe-area case, not promising exactly42% always. The board is a labelled rectangle, not a renderer-fit assertion.

| Viewport | Proposed dock | Geometry decision |
|---|---|---|
| 390×844 | x16 y578, 358×250 | Rows62/32/44/44/20 + four8px gaps +16px padding. Five62px cards. |
| 320×568 | x16 y302, 288×250 | Five48px cards; four62px build slots. Do not use the impossible52px cards. |
| 844×390 | x12 y142, 320×232 | Rows44/32/44/44/20 +32px gaps +16px padding. Menu/Chat move to y64 above the dock; builds begin y242, inside the lower half. This is an explicit new recommendation, not the issue's unbuildable270px stack. |
| 1280×720 | x304 y520, 672×176 | Five88px cards +176px instruction column +8px gap +16px padding. Seven action cells. Rows80/44/20 +16px gaps +16px padding. |

Landscape keeps a344px column; it does not silently apply the portrait16px gutter to both sides of a320px dock. The exact12px column inset is a proposed landscape exception to question11. With34px bottom inset the dock moves to y124; its builds still begin y224. Top/left/right safe areas, larger text, keyboard, narrower landscape, hand effects and expanded content remain follow-up captures before implementation approval. The top landscape tools are a reach tradeoff and need explicit approval. If bottom tools are mandatory, a different composition must be chosen; the issue's six-row270px stack cannot satisfy its own numbers.

### Proposed state and slot contract

All states retain hand, instruction, build, action and meta rectangles. Desktop places builds and actions in seven fixed columns. Slot stability is geometric; an action's meaning may change only with the explicit phase transition and announcement.

| State | Instruction | Three action slots | Special handling before build |
|---|---|---|---|
| Main | Roll result and next step | Trade / Fortunes / End turn | Unavailable builds explain costs or lack of a legal location. |
| Roll | Roll prompt | Trade / Fortunes / Roll | Only Roll primary; availability comes from engine rules. |
| Other turn | Name and turn | Trade / Fortunes / Waiting | Trade policy must match existing game rules; mock is illustrative. |
| Incoming offer | Summary; no human-offer timer | Yes / No / Details | Long terms in Details; do not discard any terms. Restore previous focus only if its control still exists. |
| Discard | Required quantity and selection | Clear / Selection count / Discard | Discard disabled until exact count. Required discard outranks offers; retain the pending offer until answered, cancelled or the turn ends (landed #1249); preserve the separate bot timer policy. |
| Victim | Choose player | Up to three player names | Legal victims only; keep unused slots inert. |
| Setup | Specific piece instruction | Cancel / Selection status / Place | Place disabled until a legal selection; cancellation follows engine rules. |
| Robber | Choose hex | Cancel / Selection status / Move | Whether Cancel is available follows existing rules. |
| Spectator | Watching and turn | Inert placeholders | No private hand or fortune data in production. Mock hand is synthetic layout filler. |
| Reconnect | Connection state | Inert placeholders | Preserve room state and avoid stale dispatch; retry comes from connection owner. |
| Game over | Winner | Results / Table / Play again | Host-only restart; guests get existing allowed destination. |

Roll-off, outgoing offer, keyboard placement and simultaneous interruptions need real fixtures as part of the existing dock work. The selector is not a claim to cover those mechanics. A permanent slot must not create a second enabled action or a keyboard dead end. Reusing a focused slot for an unrelated destructive action must require fresh activation after the state update.

## Reuse the active work; do not build a second dock

Live PR metadata checked 2026-11-03. All entries below were open at that check; state must be refreshed before taking a claim.

| Area | Existing work | Route for issue1274 |
|---|---|---|
| Stationary phone dock | [#1144](https://github.com/jarrodjohnson-gif/emberisle/pull/1144), head7c077835, issue1101 | Use its fixed slots/TradeSlot as the integration base after ownership is coordinated. Its current body records unresolved size fixtures, dead taps, connection bounds and320/short-landscape discard coverage. Do not fork a competing runtime dock under1274. This mock is an arithmetic/decision supplement. |
| Title | [#1117](https://github.com/jarrodjohnson-gif/emberisle/pull/1117), [#1216](https://github.com/jarrodjohnson-gif/emberisle/pull/1216) | Preserve1117's approved copy/flow and newer proof selectors. Review the1216 minimal front/Play design alongside question6 before adding a third title direction. |
| Hand | [#936](https://github.com/jarrodjohnson-gif/emberisle/pull/936), [#799](https://github.com/jarrodjohnson-gif/emberisle/pull/799) |936 proposes a right goods rail and changes camera insets;799 offers card-face directions. Keep the present hand exception; resolve those choices before width/name/rail migration. |
| Seats | [#706](https://github.com/jarrodjohnson-gif/emberisle/pull/706), [#867](https://github.com/jarrodjohnson-gif/emberisle/pull/867) | Preserve current-turn motion/hitbox contract and public-only gains. Apply any approved ring/style change without replacing their logic or exposing opponent hands. |
| Lobby | [#1271](https://github.com/jarrodjohnson-gif/emberisle/pull/1271) | Preserve the accepted mini-games shelf and Table/Play games controls. Its new chunk ceiling requires its own owner approval; this issue does not grant it. |

Recommended order: land the narrowly approved chrome colour slice; review these eleven recommendations and the geometry study; coordinate with1144's claimant on its existing blockers; then implement only accepted geometry on that branch or its landed successor. Desktop is a separate follow-up after question10. Titles, hands, seats and lobby remain with their existing work until claims and accepted designs are reconciled. New behavioural proofs belong in package.json and CI; temporary mock measurement scripts are review evidence, not new runtime proofs.

## One owner approval bundle

Proposed answer for one review, with any exceptions named in the reply:

> Accept this proposed direction: (1) roughly 60% portrait board-height baseline, with measured safe-area exceptions; (2) 8/12/20 radii; (3) roughly 42% small-phone baseline, falling to 38% with a 34px bottom inset in this study; (4) teal #246d72 primary; (5) preserve the approved 10px uppercase hand-name exception; (6) develop the 360px right-column landscape title through the existing title design work; (7) preserve lobby's accepted HIG type scale; (8) bottom-anchor Fortunes with selected-card Play in a fixed bottom action region and normal reading order; (9) retain seat colours and add a dark ring, without new seat marks; (10) use the corrected 672×176 seven-control desktop composition as the next mock baseline; (11) 16px portrait / 24px desktop gutters with safe areas, plus the explicit 12px inset inside the existing 344px landscape column.
>
> For the dock study, approve taking the corrected 250px portrait and 232px landscape compositions into the existing #1144 work after its ownership and blockers are resolved. Landscape Menu/Chat sit above the dock as shown. This is approval to develop and verify the direction, not acceptance of schematic card faces, placeholder costs, small type, incomplete phases, or runtime behaviour.

The title and fortune layouts still need their concrete follow-up mocks before runtime implementation. This bundle consolidates the decisions; it does not silently approve unseen screens or supersede the existing hand/title proposals. None of it is accepted unless the owner explicitly selects it.
