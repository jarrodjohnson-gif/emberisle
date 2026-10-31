# Trade flow: Option B

parent: Codex-p

Jarrod chose Option B on 2026-10-26: one window, Bank as a small box.
Desk answer [6410081679](https://github.com/jarrodjohnson-gif/emberisle/issues/831#issuecomment-6410081679) confirms the shared-draft reading.
This replaces the earlier Option A tabs, approved on 2026-10-19.
The owner reviews real pictures before acceptance. No acceptance or merge is claimed.

## Shared goods

Tap a good to add one. Selected goods expose a separate remove control.
Both Table and Bank use these same give/get quantities, with no separate Bank selections.
Mixed offers remain supported. The same good cannot appear on both sides.
Give quantities follow the live hand. Want quantities retain the existing limit.
The pinned Table receipt summarizes both bags before Ask the table.
Incoming offers, hand cues, acceptance, and host settlement keep their existing behavior.

## Compact Bank box

Bank derives its kinds from a single kind in each shared bag.
The live owned rate determines the exact quote: 4:1, 3:1, or 2:1.
Each exchange receives exactly one good, regardless of the Table quantities.
The Bank box shows its own exact quote and selected get kind's current bank stock.
Its action describes the quote, stock, and current disabled reason accessibly.
Missing or mixed choices, insufficient holdings, and empty stock leave Bank visible and disabled.
Only a valid exchange enables the Bank or Dock action.
Hotseat uses the same quantity cards and Bank box, without a player-table receipt or action.

## Interaction

Closing the composer or losing the turn clears the shared draft.
The dialog traps focus, supports Escape, and restores the opener.
The named Trade goods region and native quantity buttons replace tab and radio navigation.
Removing a final quantity restores focus to its add button or the named goods region.
Controls retain 44 px targets. Goods and actions have at least 8 px gaps.
Composer text remains at least 12 px, including owned counts and short-screen overrides.
Goods scroll while both receipts and their actions stay visible.
Gains rise and losses fall, as Jarrod confirmed on 2026-10-19.
Selection chips retain their signed amounts and 220 ms motion.
Actual hand cards retain the approved Astra V1 goods-card look and existing cue timing.
Reduced motion suppresses selection chips and keeps settled amounts static.

## Proof

`npm run trade-tabs-prove` keeps its registered name and exercises the shared composer.
It checks keyboard focus, live descriptions, rates, refusals, resets, hotseat and three viewport sizes.
Real dispatches prove one-exchange settlement, bank conservation and unchanged V1 cues.
The lazy quantity-card chunk retains its genuine mounted-failure and successful-reopen checks.
Existing client, hand and trade-map proofs use the shared controls for the same outcome assertions.
Exact approved equivalents are recorded in `docs/proofs/831-refresh/codex-p-2026-10-26-option-b/old-new.md`.
Previous V1 equivalent tables remain preserved with their historical evidence.
