# Seat dots: the thin dark ring (#1297)

Owner decision 9 of #1274 (2026-11-03): keep the seat colours and names, and put a thin dark ring on every seat dot so Dune shows on white.
This folder is the spec and the pictures. No `src/` file changed.

Author: Fable (Claude Fable 5.1), 2026-11-07, on `main` at `5b83aa1e`.
It builds on Astra's schematic study from `codex/1297-seat-ring-spec` (`index.html`, `390x844.png`, `844x390.png`, `1280x720.png`, `measurements.json`), which stays in this folder as the earlier packet.

## The ring

| Item | Value |
|---|---|
| Ring | `box-shadow: inset 0 0 0 1.5px var(--control-line)` |
| Colour | `#78837a`, the existing control edge (`src/styles.css`, `--control-line`) |
| Contrast | 3.94:1 on white, 3.63:1 on mist `#f3f6f5`, 3.34:1 against Dune's own fill `#f3ecd9` |
| Box | Unchanged. The ring is inset, so the dot keeps its size, margins and baseline. |
| Where | One line in `src/components/game/SeatDot.tsx`. Every caller gets it. |
| Not ringed | A `transparent` colour (the lobby's empty seat, already `visibility: hidden`). |
| Kept | The on-turn outline, `2px solid var(--ink)` at 2 px offset (`styles.css`, `.seat-turn .seat-dot`). It sits outside the dot; the ring sits inside. |

The ring is not a new identity mark. Names and `aria` text still name the seat. `SeatDot` stays `aria-hidden`.

## Pictures

Real game, Chromium 153 through Playwright, device scale 1. "After" is the same page with [after.css](after.css) added on top.
Mira sits in Dune. Jarrod is on turn, so Mira's dot has no outline and the before pictures show the problem.

| Size | Title | Table | Player menu | Results | Seats, 3x close-up |
|---|---|---|---|---|---|
| 390x844 | [before](pictures/390x844-title-before.jpg) · [after](pictures/390x844-title-after.jpg) | [before](pictures/390x844-table-before.jpg) · [after](pictures/390x844-table-after.jpg) | [after](pictures/390x844-menu-after.jpg) | [after](pictures/390x844-results-after.jpg) | [before](pictures/390x844-seats-3x-before.png) · [after](pictures/390x844-seats-3x-after.png) |
| 844x390 | [before](pictures/844x390-title-before.jpg) · [after](pictures/844x390-title-after.jpg) | [before](pictures/844x390-table-before.jpg) · [after](pictures/844x390-table-after.jpg) | [after](pictures/844x390-menu-after.jpg) | [after](pictures/844x390-results-after.jpg) | [before](pictures/844x390-seats-3x-before.png) · [after](pictures/844x390-seats-3x-after.png) |
| 1280x720 | [before](pictures/1280x720-title-before.jpg) · [after](pictures/1280x720-title-after.jpg) | [before](pictures/1280x720-table-before.jpg) · [after](pictures/1280x720-table-after.jpg) | [after](pictures/1280x720-menu-after.jpg) | [after](pictures/1280x720-results-after.jpg) | [before](pictures/1280x720-seats-3x-before.png) · [after](pictures/1280x720-seats-3x-after.png) |

The results picture has Mira winning, so the winner's dot is the pale one (owner note in `app-review/final/README.md`).

[pictures/measurements.json](pictures/measurements.json) holds every dot's box, fill and ring, before and after, on each screen.
The capture fails if any dot's box changes or any dot is left without a ring. It passed with zero page errors.

## Callers, read on `main` at `5b83aa1e`

All through the shared `SeatDot` unless the row says otherwise. Sizes are CSS px.

| Caller | Dots | Surface | Note |
|---|---|---|---|
| `EmberisleApp.tsx:221, 246` | 16 (your seat), 4 x 28 (colour choice) | white | The picked swatch keeps its 2 px ink border. |
| `ProfileSheet.tsx:111, 189` | 16, 4 x 28 | white | Same as the title. |
| `LobbyView.tsx:144` | 12 | white | Has its own `inset 0 0 0 1px rgb(0 0 0 / 0.25)` ring (`lobby.css:183`, 1.6:1). Remove that line; the shared ring replaces it. |
| `LobbyTicTacToe.tsx:45, 47, 102` | 12 | white | No change needed. |
| `SeatRail.tsx:84` | 12 (10 under 100 px cells) | white seat card | Keeps the on-turn outline and `aria-current`. |
| `PlayerMenu.tsx:106` | 12 | white | Phone menu heading. |
| `SeatNeeds.tsx:81` | 12 | white | `trade-other-dot` in the trade window. |
| `TradeToast.tsx:118, 140, 191` | 10, 12, 10 | white | Offer author and responders. |
| `TakeFromBar.tsx:51` | 12 | white | Victim choice. |
| `WinScreen.tsx:125, 167` | 16, 12 | white | Winner and table rows. |
| `TurnMoment.tsx:117` | 20 (16 under 360 px) | white stamp | Already has a 2 px ink border (`styles.css`, `.turn-stamp-dot`). Keep that; give it no second ring. |
| `Chat.tsx:45, 54, 67` | 3 custom 8 px spans | white | Not `SeatDot`. Route them through `SeatDot` or copy the ring. At 8 px the fill centre is 5 px (see the question on the issue). |

## For the build issue

Size XS, `lane:hud`. Files: `SeatDot.tsx`, `lobby.css` (one line out), `Chat.tsx` (three spans), `styles.css` (the turn-stamp exception).

Completion test:

1. `contrast-prove` passes and gains one check: the ring colour against white and mist is at least 3:1.
2. `seat-rail-prove`, `title-prove`, `lobby-prove`, `win-action-prove` and the trade proofs pass unchanged. No dot box changes.
3. A fail-first check: Dune's dot on a white seat card carries the ring; without the `SeatDot` change the check fails.
4. The on-turn outline and `aria-current` still move with the turn (`seat-rail-prove` already checks this).
5. Names stay in the accessibility tree as today.

## Reproduce

Run from the repo root, one browser at a time: `node docs/design/seat-dot-ring/capture.mjs`.
It starts the dev server, drives a four-seat hotseat table, and writes the pictures and `pictures/measurements.json`.
