# Trade flow: Option A

Jarrod approved Option A on 2026-10-19 in issue #831.
The composer separates Table offers from Bank & docks exchanges.
Each route shows one exact quote and one action.

## Table

Tap a good to add one. Selected goods expose a separate remove control.
Mixed offers remain supported. The same good cannot appear on both sides.
Give quantities follow the live hand. Want quantities retain the existing limit.
The pinned footer summarizes both bags before Ask the table.
Incoming offers, hand cues, acceptance, and host settlement keep their existing behavior.

## Bank & docks

Choose one kind to give and one different kind to receive.
The composer uses the player's best owned rate: 4:1, 3:1, or 2:1.
Each exchange receives exactly one good.
The pinned footer explains missing choices, insufficient holdings, or empty bank stock.
Only a valid exchange enables the bank or dock action.
Hotseat opens this route directly because table offers require distinct players.

## Interaction

Both routes retain their own drafts while switching tabs.
Closing the composer or losing the turn clears both drafts.
Tabs support arrows, Home, and End. Bank choices support radio keyboard navigation.
The dialog traps focus, supports Escape, and restores the opener.
Controls retain 44 px touch targets. Goods scroll while the action stays visible.
Gains rise and losses fall, as Jarrod confirmed on 2026-10-19.
Selection chips and settled hand feedback use the same direction and signed amounts.
Reduced motion suppresses selection chips and keeps settled amounts static.

## Proof

`npm run trade-tabs-prove` exercises route isolation, keyboard navigation, and bank settlement.
It checks live rates, refusals, draft resets, hotseat, and three viewport sizes.
Existing trade, client, hand, and modal proofs cover the surrounding flows.
