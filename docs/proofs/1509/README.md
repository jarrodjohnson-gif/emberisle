# #1509: the upright phone table, option A

Real game, headless Chromium, device scale 2. One practice table is saved in `table.json`.
Every picture loads that table, so before and after show the same board, hand and log.
`before` is `main` at `7d531509`. `after` is this branch.
Run `node docs/proofs/1509/shots.mjs after` to take them again.

| Size | Before | After |
|---|---|---|
| 430x932 | `430x932-before.jpg` | `430x932-after.jpg` |
| 390x844 | `390x844-before.jpg` | `390x844-after.jpg` |
| 844x390 | `844x390-before.jpg` | `844x390-after.jpg` |
| 820x1180 | `820x1180-before.jpg` | `820x1180-after.jpg` |

## The camera angle

- Today: overhead, leaned 25° off straight down, toward the player.
- New default on an upright phone or tablet: overhead, leaned 40°. Sideways and desktop keep their angles.
- `430x932-angle25.jpg` and `390x844-angle25.jpg` show the new layout at the old 25°, so the angle can be judged alone.

## Measured at 430x932 (from the hex corners on screen)

| What | Before | After |
|---|---|---|
| Island with its shore, wide | 370 px | 390 px (the side goods piles stay on screen) |
| Outer hex corners, wide | 340 px | 360 px |
| Outer hex corners, tall | 284 px | 255 px (40° shortens depth) |
| Dock top | 670 px | 678 px |
| Gutters | 12 px | 16 px |

The side boats run off the screen edges, and every dock's 44 px button and goods pile stays on screen. The owner chose
cropped boats on card `q1515-table-look` (B, 2026-11-10). The piles reach 5.72 world units across, past the shore's 5.27.
They bind first, so the shore stops about 20 px from the edges, not 4 px. The question is open on #1509.
