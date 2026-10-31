# Trade window: option B (owner-approved mock)

**Status:** approved by Jarrod on the Desk Decisions page, card `q883-fable`, answer B, 2026-10-26 05:26 UTC. The mock pictures below were shown on that card. They were not in the repo until now, which is why PR #883 was built from a written summary only.

**Spec for PR #883 and for the trade-window part of PR #873 (seat needs):** build what the right-hand side (B) of these pictures shows.

- `trade-AvsB-390x844.jpg`: A on the left (the two-tab build in PR #883), B on the right (the approved one), phone upright.
- `trade-AvsB-844x390.jpg`: the same, phone sideways.

## What B is (read from the picture, right-hand panel)

- One window, no tabs. The title row is "Trade" with a close button, then a short help text (two lines on a phone).
- "You give" and "You get" are two rows of five goods cards (Wood, Brick, Sheep, Wheat, Stone). Each card shows the good's icon and name in its own colour, "Have N", a big count and a plus; a minus appears once you pick it. Some cards are dimmed in the picture. The picture does not show the rule for dimming, so ask Jarrod before building it.
- Under the two rows, a small "Bank & docks" box that reads what you picked: "Bank & docks · your best rate 4:1" and "Bank 4:1: give 4 wood, get 1 brick now", with its own small "Bank 4:1" button. It is a box, not a tab.
- Under that, "Table offer" with "You give" and "You get" lines, then one big dark "Ask the table" button.
- Seat chips stay in a plain row at the top (name and points only).

## Not the same as the A pictures

A uses a "Table" tab and a "Bank & docks" tab, each with its own goods picker. Do not build that.

## Open

Jarrod said on 2026-10-27 06:39 UTC that PR #883 "is not what we approved: one with colors, a better structure". Compare this B picture with the PR's own pictures and flag every difference in the PR body before asking for review. The owner decides on the final look. These are quick mockups: the icons and type are stand-ins.

## Owner's final direction, 2026-10-27 (screenshots from Jarrod)

Jarrod sent three screenshots and said: the first two are "it" (the version he approved), "except with the third as a better layout for bank trading". He also said the tall-rectangle cards and the tapping are "kinda weird" in the current build. Pictures in [`owner-approved-2026-10-27/`](owner-approved-2026-10-27/):

1. `1-coloured-cards-phone-upright.png` and `2-coloured-cards-phone-sideways.png`: **use these for the goods cards and the overall look.** Each card shows the good's icon and name in its own colour (Wood green, Brick terracotta, Wheat gold, Stone blue-grey; an unavailable good is pale grey), "Have N", a big count and a small plus. The cards are short and squarish, not tall rectangles. The Bank box sits under the two rows with the line "Choose one kind on each side for a bank or dock exchange" and a "Bank" button; "Table offer" and a wide "Ask the table" button below. On a sideways phone the Bank box is on the left and the offer line and button on the right.
2. `3-bank-and-footer-layout-to-use.png`: **use this footer layout for bank trading.** Two columns under the cards: on the left "Table offer" (You give / You get) with the dark "Ask the table" button under it; on the right a "Bank & docks · one exchange" box that says exactly what the exchange is ("You give 4 wood. You get 1 stone."), shows "Bank stock: 11 stone.", and has one "Bank 4:1" button. Do NOT copy this picture's tall rectangle cards or its dark-green single-colour icons.

So the target is: coloured, shorter goods cards (pictures 1 and 2) plus the two-column Table offer and Bank box footer (picture 3), in one window with no tabs.

**Open questions for Jarrod (post as `Question:`, do not guess):** how a player removes a good once added (picture 1 shows only a plus; picture 3 shows a minus under the count); whether tapping the count or card again should remove one.
