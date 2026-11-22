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
| Not ringed | A `transparent` colour: the lobby passes it for an empty seat (`LobbyView.tsx:144`). |
| Kept | The on-turn outline, `2px solid var(--ink)` at 2 px offset (`styles.css`, `.seat-turn .seat-dot`). It sits outside the dot; the ring sits inside. |

The ring is not a new identity mark. Names and `aria` text still name the seat. `SeatDot` stays `aria-hidden`.

## Pictures

Real game, Chromium 153 through Playwright, device scale 1 (the lobby at 2, the seat close-ups at 3). "After" is the same page with [after.css](after.css) added on top.
The title is the real title. The lobby is a real host (Jarrod) with a guest (Josh) and a bot, which takes Dune. The table and the results are crafted with `window.__emberisle.setState`, not played: Mira sits in Dune, Jarrod is on turn, so Mira's dot has no outline and the before pictures show the problem.

| Size | Title | Lobby (the mist screen) | Table | Player menu | Results | Seats, 3x close-up |
|---|---|---|---|---|---|---|
| 390x844 | [before](pictures/390x844-title-before.jpg) · [after](pictures/390x844-title-after.jpg) | [before](pictures/390x844-lobby-before.jpg) · [after](pictures/390x844-lobby-after.jpg) | [before](pictures/390x844-table-before.jpg) · [after](pictures/390x844-table-after.jpg) | [after](pictures/390x844-menu-after.jpg) | [after](pictures/390x844-results-after.jpg) | [before](pictures/390x844-seats-3x-before.png) · [after](pictures/390x844-seats-3x-after.png) |
| 844x390 | [before](pictures/844x390-title-before.jpg) · [after](pictures/844x390-title-after.jpg) | [before](pictures/844x390-lobby-before.jpg) · [after](pictures/844x390-lobby-after.jpg) | [before](pictures/844x390-table-before.jpg) · [after](pictures/844x390-table-after.jpg) | [after](pictures/844x390-menu-after.jpg) | [after](pictures/844x390-results-after.jpg) | [before](pictures/844x390-seats-3x-before.png) · [after](pictures/844x390-seats-3x-after.png) |
| 1280x720 | [before](pictures/1280x720-title-before.jpg) · [after](pictures/1280x720-title-after.jpg) | [before](pictures/1280x720-lobby-before.jpg) · [after](pictures/1280x720-lobby-after.jpg) | [before](pictures/1280x720-table-before.jpg) · [after](pictures/1280x720-table-after.jpg) | [after](pictures/1280x720-menu-after.jpg) | [after](pictures/1280x720-results-after.jpg) | [before](pictures/1280x720-seats-3x-before.png) · [after](pictures/1280x720-seats-3x-after.png) |

The player menu and the results have an "after" picture only. The results picture has Mira winning, so the winner's dot is the pale one (owner note in `app-review/final/README.md`).

### What the capture checks

[pictures/measurements.json](pictures/measurements.json) holds, for every dot on each screen, before and after: its box, fill, ring, on-turn outline, the first painted surface behind it, whether it is `aria-hidden`, and the name assistive technology gets beside it. The capture fails on any of these:

1. A dot's box changes between before and after. None did.
2. A dot is left without a ring after. None was.
3. A dot is not `aria-hidden`, or has no name beside it. Every dot is `aria-hidden="true"`; the name comes from the enclosing control or the text next to it: "Your seat", "Ember", "Tide", "Dune", "Pine" on the title; "Jarrod · host", "Josh", "Bot" in the lobby; "Jarrod, 9 goods, 3 points" and the like on the seats; "Mira" on the menu heading; "Mira wins" and the table rows on the results. Nothing about the name changes, because the ring is a `box-shadow` on an `aria-hidden` span.
4. The ring reads under 3:1 against the surface actually behind the dot. Measured: every dot on every screen sits on white (`rgb(255, 255, 255)`), the lobby's seat rows included (`lobby.css:78`), so the measured ring contrast is 3.94:1 everywhere. The mist figure (3.63:1) is the token case for a dot placed on `--ground`; no dot sits on mist today.

It passed with zero page errors.

## Callers, read on `main` at `5b83aa1e`

All through the shared `SeatDot` unless the row says otherwise. Sizes are CSS px. Not in this table: the away marker (`SeatRail.tsx:96`), a struck ring drawn in the text colour, which is not a seat dot.

| Caller | Dots | Surface | Note |
|---|---|---|---|
| `EmberisleApp.tsx:221, 246` | 16 (your seat), 4 x 28 (colour choice) | white | The picked swatch keeps its 2 px `#1c1915` border (`:244`, the old ink; a separate nit). |
| `ProfileSheet.tsx:111, 189` | 16, 4 x 28 | white | Same as the title. |
| `LobbyView.tsx:144` | 12 | white seat row | Has its own `inset 0 0 0 1px rgb(0 0 0 / 0.25)` ring (`lobby.css:183`, 1.84:1 on white). Remove that line; the shared ring replaces it. An empty seat passes `transparent`: it is `visibility: hidden` on the host's screen, where the row has an Add bot button (`lobby.css:89`), and shown but transparent on a guest's; the ring skips a transparent fill, so neither draws a hollow circle. |
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
5. Every dot stays `aria-hidden` with its name beside it, as measured here.

## Reproduce

Run from the repo root, one browser at a time: `node docs/design/seat-dot-ring/capture.mjs`.
It starts a host and the dev server, drives the title, a lobby with a guest and a bot, and a crafted four-seat table, and writes the pictures and `measurements.json` to a new temp folder (printed on stderr). Add `--save` to write into `pictures/` here instead, replacing the committed files.
