# #1417: the same dark ring on every seat dot

Owner option A for #1297 (2026-11-07). Spec: [`docs/design/seat-dot-ring`](../../design/seat-dot-ring/README.md).

| What | Where |
|---|---|
| Ring `inset 0 0 0 1.5px var(--control-line)` (`#78837a`), skipped for a `transparent` dot | `src/components/game/SeatDot.tsx` |
| The chat log's three 8 px dots go through `SeatDot` | `src/components/game/Chat.tsx` |
| The lobby's own `inset 1px rgb(0 0 0 / 0.25)` ring removed; the shared ring replaces it | `src/components/game/lobby.css` |
| The turn stamp keeps its 2 px ink border and gets no second ring | `src/styles.css` (`.turn-stamp-dot`) |

## Pictures

The real game in Chromium through Playwright, device scale 2 (the seat close-ups at 3). "Before" is `main` at `a3dde1fd`; "after" is this branch.
Both come from [capture.mjs](capture.mjs) with the same crafted states: a four-seat table with Mira in Dune and Jarrod on turn, Mira winning the results, and a real host lobby with three bots, a chat line from each seat, a soundboard line and a reaction (Bot 2 is Dune there).

| Size | Table | Seats, 3x | Results | Lobby and chat |
|---|---|---|---|---|
| 430x932 | [before](pictures/430x932-table-before.jpg) · [after](pictures/430x932-table-after.jpg) | [before](pictures/430x932-seats-3x-before.png) · [after](pictures/430x932-seats-3x-after.png) | [before](pictures/430x932-results-before.jpg) · [after](pictures/430x932-results-after.jpg) | [before](pictures/430x932-lobby-before.jpg) · [after](pictures/430x932-lobby-after.jpg) |
| 390x844 | [before](pictures/390x844-table-before.jpg) · [after](pictures/390x844-table-after.jpg) | [before](pictures/390x844-seats-3x-before.png) · [after](pictures/390x844-seats-3x-after.png) | [before](pictures/390x844-results-before.jpg) · [after](pictures/390x844-results-after.jpg) | [before](pictures/390x844-lobby-before.jpg) · [after](pictures/390x844-lobby-after.jpg) |
| 375x812 | [before](pictures/375x812-table-before.jpg) · [after](pictures/375x812-table-after.jpg) | [before](pictures/375x812-seats-3x-before.png) · [after](pictures/375x812-seats-3x-after.png) | [before](pictures/375x812-results-before.jpg) · [after](pictures/375x812-results-after.jpg) | [before](pictures/375x812-lobby-before.jpg) · [after](pictures/375x812-lobby-after.jpg) |
| 820x1180 | [before](pictures/820x1180-table-before.jpg) · [after](pictures/820x1180-table-after.jpg) | [before](pictures/820x1180-seats-3x-before.png) · [after](pictures/820x1180-seats-3x-after.png) | [before](pictures/820x1180-results-before.jpg) · [after](pictures/820x1180-results-after.jpg) | [before](pictures/820x1180-lobby-before.jpg) · [after](pictures/820x1180-lobby-after.jpg) |

At 8 px the chat dots keep a 5 px fill inside the ring, so Dune's chat dot reads mostly as a ring. The packet named this case and the owner chose option A with it.

## Reproduce

From the root of the checkout to picture, one browser at a time: `node docs/proofs/1417/capture.mjs <out dir> <before|after>`.
