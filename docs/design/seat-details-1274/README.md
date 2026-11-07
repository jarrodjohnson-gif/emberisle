# Seat details and the player menu (#1301)

The seat line (desktop rail, phone strip) and the player menu that opens from it, specified together.
The #1274 audit proposed moving the goods and fortune counts and the hidden-points line off the seats, and turning the desktop accordion and the phone's top menu into a popover and a bottom sheet. This folder says what stays, what moves, what is rejected, and shows it in the real game. No `src/` file changed here.

Author: Fable (Claude Fable 5.1), 2026-11-07, on `main` at `a482f380`. Final visual acceptance waits on #1297 (the dot ring) and #1298 (buttons).

## What a seat shows today

`SeatRail.tsx`: one 44 px card per seat, two lines.

| Line | Facts | Hidden when |
|---|---|---|
| 1 | dot, name (short form under 128 px), goods count, fortunes count, roll-off die, points (`+N` hidden on your own seat), away marker | counts under 200 px cells and when zero; die outside the roll-off |
| 2 | path tally, army tally; the award holder's tally wears the amber badge | never |
| under the rail or strip | "Hidden fortunes may add points." (`HiddenPointHint`), the same for every viewer | never |
| on the card | needs chips (`SeatNeeds`), public gains for 2.5 s (PR #867, open) | |

`PlayerMenu.tsx`: a heading (phone only), the needs line, four facts (Cards in hand, Fortunes held, Points shown, Wayfarers played, plus Your fortunes and Connection when they apply), the public ledger (Outposts, Strongholds, Longest path, Largest army, plus Your point fortunes and Your total on your own seat or at game end), then the action rows that apply: Trade with the bank or a dock, Offer a trade, Mention in chat, Open chat.
Desktop: the menu opens under its card and pushes the cards below it down. Phone: it floats at the top of the screen, under the strip; sideways, a 288 px box at the top right. Closes on Escape, a tap outside, or the same card again; focus goes to the first row, and back to the card on Escape.

## Kept, moved, rejected

| Fact or behaviour | Decision | Why |
|---|---|---|
| Dot, name, points, away marker | keep | identity and score |
| Goods and fortune counts on the line | **keep** (Question 1 on the issue) | hand size is play information: who to rob, who is near a seven's discard. The strip already hides them in narrow cells and the menu repeats them. |
| Path and army tallies, award badge | keep | `docs/DECISIONS.md`, 2026-10-20: seat tallies use the Route and Swords icons (PR #859) |
| Needs chips | keep | accepted work (#646) |
| Public gains on seats | keep | PR #867, open and not on `main`; this spec must not conflict with it |
| "Hidden fortunes may add points." under every rail and strip | **move** into the ledger as its last row, for every seat (Question 2) | it is a rule about the ledger, not a seat fact; on the rail it is the one line that is always on and never changes |
| Facts in the menu | keep all four, plus Your fortunes and Connection | every fact the line can hide stays one tap away |
| Private rows | keep: your own seat and game end only | `public-score-prove` guards this |
| Desktop accordion | **replace** with a popover beside the card | the other seats must not move (the issue's rule) |
| Phone menu at the top | **replace** with a bottom sheet (Question 3) | the trade rows are actions; the bottom third is where the thumb is |
| Audit: drop the counts from the line | rejected | see Question 1 |
| Audit: drop "Points shown" because the ledger repeats it | rejected for now | the ledger lists parts, not the total, for other seats |

## The menu

| Item | Desktop (rail) | Phone upright | Phone sideways |
|---|---|---|---|
| Where | a popover 8 px to the right of its card, top edges aligned, 256 px wide, above the dock | a bottom sheet across the screen, 20 px top corners, 16 px padding, bottom padding `max(16px, safe-area)` | a bottom sheet 320 px wide at the left edge, inside the dock column, clear of the island |
| Height | content, at most the room under its top edge | content, at most 50 dvh, so the top edge is always in the bottom half; past that the sheet scrolls (`overflow-y: auto`, as today) | content, at most 70 dvh of the column |
| Heading | none (the card says it) | dot and name, as today | same |
| Rows | 44 px (a `min-height`, and the row never shrinks when the sheet is capped), 15 px / 22 px, 8 px apart | same | same |
| Facts and ledger | 12 px caption, as today; the ledger ends with "Hidden fortunes may add points". The mock draws that line with `::after`; the build gives it a real node carrying `data-testid="hidden-point-hint"`, which `public-score-prove` reads. | same | same |
| Close | Escape, a click outside, the card again; focus returns to the card | the same, plus a 44 px Close in the heading row for touch (new; not in the mock and not measured) | same |
| Other seats | never move | never move | never move |

## Pictures

The real app with a set-up table (crafted with `window.__emberisle.setState`, not played), Chromium 153 through Playwright, device scale 1. Four seats: Jarrod (your own seat, on turn, one hidden point, a wayfarer in hand), Bartholomew Longfellow (a long name, largest army), Mira (Dune), Finn (no pieces, no goods, 0 points). "Watcher" is the same table seen as a spectator with Bartholomew's menu open. "After" is the same page with [after.css](after.css) on top: the hint moved into the ledger, the desktop popover, the phone bottom sheet. The counts on the line are unchanged in both.

| Size | Seats | Own seat | Opponent (Dune) | Empty seat | Watcher |
|---|---|---|---|---|---|
| 390x844 | [before](pictures/390x844-rail-before.jpg) · [after](pictures/390x844-rail-after.jpg) | [before](pictures/390x844-own-before.jpg) · [after](pictures/390x844-own-after.jpg) | [before](pictures/390x844-opponent-before.jpg) · [after](pictures/390x844-opponent-after.jpg) | [before](pictures/390x844-empty-before.jpg) · [after](pictures/390x844-empty-after.jpg) | [before](pictures/390x844-watcher-before.jpg) · [after](pictures/390x844-watcher-after.jpg) |
| 844x390 | [before](pictures/844x390-rail-before.jpg) · [after](pictures/844x390-rail-after.jpg) | [before](pictures/844x390-own-before.jpg) · [after](pictures/844x390-own-after.jpg) | [before](pictures/844x390-opponent-before.jpg) · [after](pictures/844x390-opponent-after.jpg) | [before](pictures/844x390-empty-before.jpg) · [after](pictures/844x390-empty-after.jpg) | [before](pictures/844x390-watcher-before.jpg) · [after](pictures/844x390-watcher-after.jpg) |
| 1280x720 | [before](pictures/1280x720-rail-before.jpg) · [after](pictures/1280x720-rail-after.jpg) | [before](pictures/1280x720-own-before.jpg) · [after](pictures/1280x720-own-after.jpg) | [before](pictures/1280x720-opponent-before.jpg) · [after](pictures/1280x720-opponent-after.jpg) | [before](pictures/1280x720-empty-before.jpg) · [after](pictures/1280x720-empty-after.jpg) | [before](pictures/1280x720-watcher-before.jpg) · [after](pictures/1280x720-watcher-after.jpg) |

[pictures/measurements.json](pictures/measurements.json) records, per picture, every seat's box and text, the hint's visibility, and the open menu's box, heading, facts, ledger rows, private-row count, action rows, focus on open, and whether any seat moved when the menu opened.

Two more pictures per size show the trade routes at an online table (the store's mode set to `online` with no connection, so the rows render and nothing is sent): the own menu with "Trade with the bank or a dock…" and "Open chat" (`pictures/<size>-routes-own-before.jpg`, `-after.jpg`), and Mira's with "Offer a trade…" and "Mention @Mira in chat" (`pictures/<size>-routes-opponent-before.jpg`, `-after.jpg`).

Measured: on desktop today, opening Jarrod's menu moves `rail-p1`, `rail-p2` and `rail-p3`; after, no seat moves on any screen. Private rows appear only on the own-seat menu mid-game, and on an opponent's at game end (2 rows, measured through the store with the results sheet up, not pictured); the capture throws otherwise. Every row in every "after" menu measures 44 px (before the `min-height`, the sideways sheet's rows shrank to 22 px); the capture throws under 44. All four trade routes are present; the capture throws if one is missing. Escape returns focus to the tapped card on every run. The phone sheet's box after: upright `0, 468, 390 x 376` (own), `0, 578, 390 x 266` (an opponent) and `0, 422, 390 x 422` (own, online: the 50 dvh cap holds it at the middle line and its content scrolls by 6 px); every upright top edge is at or below the middle, and the capture throws otherwise. Sideways `12, 117, 320 x 273` (70 dvh of the column), inside the dock column, bottom at the screen's bottom; there the own menu scrolls by 103 px and the online menus by 97 to 155 px. Zero page errors.

## For the build issue

Size S, `lane:hud`. Files: `SeatRail.tsx` (hint out of the rail and strip, popover placement), `PlayerMenu.tsx` (ledger row, Close on phones), `Hud.tsx` (the phone menu's placement classes), `styles.css`.

Completion test:

1. `seat-rail-prove`, `public-score-prove`, `needs-prove`, `chat-prove`, `watch-ui-prove` and `fortune-tray-prove` pass. `public-score-prove:62-94` reads `hidden-point-hint` on the rail; the testid moves to the ledger row with the same text, replaced under the 2026-10-25 rule in its own commit with the old/new table. `needs-prove:237` reads the hint's boxes; same.
2. Opening any seat's menu moves no other seat at 390x844, 844x390 and 1280x720 (compare `rail-*` and `seat-*` boxes before and after).
3. Upright, the phone menu's top edge is in the bottom half of the screen. Sideways, the sheet sits inside the dock column with its bottom edge at the screen's bottom; its top edge is wherever its height puts it (117 px down at 844x390). Rows are at least 44 px; Close is 44 px.
4. Private rows only on the own seat or at game end; the watcher sees none.
5. Escape, a tap outside and the card again all close it; focus returns to the card.
6. No trade route is lost: "Trade with the bank or a dock…" on your own seat on your main turn; "Offer a trade…" on an opponent's seat online on your main turn; "Mention @name in chat" on an opponent's seat online; "Open chat" on your own seat online.

## Reproduce

Run from the repo root, one browser at a time: `node docs/design/seat-details-1274/capture.mjs`.
It writes the pictures and `measurements.json` to a new temp folder (printed on stderr). Add `--save` to write into `pictures/` here instead, replacing the committed files. The table is crafted with `window.__emberisle.setState`, not played.
