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
| Path and army tallies, award badge | keep | owner decisions #645 and PR #859 |
| Needs chips, public gains | keep | accepted work (#646, PR #867) |
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
| Height | content, at most the room under its top edge | content, at most 70 dvh | same |
| Heading | none (the card says it) | dot and name, as today | same |
| Rows | 44 px, 15 px / 22 px, 8 px apart | same | same |
| Facts and ledger | 12 px caption, as today; the ledger ends with "Hidden fortunes may add points" | same | same |
| Close | Escape, a click outside, the card again; focus returns to the card | the same, plus a 44 px Close in the heading row for touch (new, not in the mock) | same |
| Other seats | never move | never move | never move |

## Pictures

Real game, Chromium 153 through Playwright, device scale 1. Four seats: Jarrod (your own seat, on turn, one hidden point, a wayfarer in hand), Bartholomew Longfellow (a long name, largest army), Mira (Dune), Finn (no pieces, no goods, 0 points). "Watcher" is the same table seen as a spectator with Bartholomew's menu open. "After" is the same page with [after.css](after.css) on top: the hint moved into the ledger, the desktop popover, the phone bottom sheet. The counts on the line are unchanged in both.

| Size | Seats | Own seat | Opponent (Dune) | Empty seat | Watcher |
|---|---|---|---|---|---|
| 390x844 | [before](pictures/390x844-rail-before.jpg) · [after](pictures/390x844-rail-after.jpg) | [before](pictures/390x844-own-before.jpg) · [after](pictures/390x844-own-after.jpg) | [before](pictures/390x844-opponent-before.jpg) · [after](pictures/390x844-opponent-after.jpg) | [before](pictures/390x844-empty-before.jpg) · [after](pictures/390x844-empty-after.jpg) | [before](pictures/390x844-watcher-before.jpg) · [after](pictures/390x844-watcher-after.jpg) |
| 844x390 | [before](pictures/844x390-rail-before.jpg) · [after](pictures/844x390-rail-after.jpg) | [before](pictures/844x390-own-before.jpg) · [after](pictures/844x390-own-after.jpg) | [before](pictures/844x390-opponent-before.jpg) · [after](pictures/844x390-opponent-after.jpg) | [before](pictures/844x390-empty-before.jpg) · [after](pictures/844x390-empty-after.jpg) | [before](pictures/844x390-watcher-before.jpg) · [after](pictures/844x390-watcher-after.jpg) |
| 1280x720 | [before](pictures/1280x720-rail-before.jpg) · [after](pictures/1280x720-rail-after.jpg) | [before](pictures/1280x720-own-before.jpg) · [after](pictures/1280x720-own-after.jpg) | [before](pictures/1280x720-opponent-before.jpg) · [after](pictures/1280x720-opponent-after.jpg) | [before](pictures/1280x720-empty-before.jpg) · [after](pictures/1280x720-empty-after.jpg) | [before](pictures/1280x720-watcher-before.jpg) · [after](pictures/1280x720-watcher-after.jpg) |

[pictures/measurements.json](pictures/measurements.json) records, per picture, every seat's box and text, the hint's visibility, and the open menu's box, heading, facts, ledger rows, private-row count, action rows, focus on open, and whether any seat moved when the menu opened.

Measured: on desktop today, opening Jarrod's menu moves `rail-p1`, `rail-p2` and `rail-p3`; after, no seat moves on any screen. Private rows appear only on the own-seat menu; the capture throws otherwise. Escape returns focus to the tapped card on every run. Zero page errors.

## For the build issue

Size S, `lane:hud`. Files: `SeatRail.tsx` (hint out of the rail and strip, popover placement), `PlayerMenu.tsx` (ledger row, Close on phones), `Hud.tsx` (the phone menu's placement classes), `styles.css`.

Completion test:

1. `seat-rail-prove`, `public-score-prove`, `needs-prove`, `chat-prove`, `watch-ui-prove` and `fortune-tray-prove` pass. `public-score-prove:62-94` reads `hidden-point-hint` on the rail; the testid moves to the ledger row with the same text, replaced under the 2026-10-25 rule in its own commit with the old/new table. `needs-prove:237` reads the hint's boxes; same.
2. Opening any seat's menu moves no other seat at 390x844, 844x390 and 1280x720 (compare `rail-*` and `seat-*` boxes before and after).
3. The phone menu's top edge is in the bottom half of the screen; its rows are 44 px; Close is 44 px.
4. Private rows only on the own seat or at game end; the watcher sees none.
5. Escape, a tap outside and the card again all close it; focus returns to the card.

## Reproduce

Run from the repo root, one browser at a time: `node docs/design/seat-details-1274/capture.mjs`.
It writes the pictures and `measurements.json` to a new temp folder (printed on stderr). Add `--save` to write into `pictures/` here instead, replacing the committed files. The table is crafted with `window.__emberisle.setState`, not played.
