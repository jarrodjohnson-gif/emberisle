# Bundle size headroom audit

- date: 2026-11-12
- agent: builder-size
- branch: origin/main

## Overview

All 45 chunks pass size ceilings.
Fourteen chunks have 100 bytes or less of headroom.
No ceilings were moved during this audit.

## Critical findings

- `table` is at 2,200 B gzip against its 2,200 B ceiling.
- Headroom for `table` is 0 B.
- Any added code in `table` will fail CI.
- `WayfarerOptions` has 11 B of headroom.
- `focus-trap` has 13 B of headroom.
- `eye-off` has 18 B of headroom.
- `LobbyView` has 19 B of headroom.
- `index` has 716 B of headroom on origin/main.

## Chunks within 100 bytes of ceiling

| Chunk | Gzip size (B) | Ceiling (B) | Headroom (B) | Allowance (B) |
| :--- | :--- | :--- | :--- | :--- |
| `table` | 2,200 | 2,200 | 0 | 200 |
| `WayfarerOptions` | 489 | 500 | 11 | 200 |
| `focus-trap` | 537 | 550 | 13 | 200 |
| `eye-off` | 292 | 310 | 18 | 200 |
| `LobbyView` | 2,481 | 2,500 | 19 | 200 |
| `TurnExtensionVote` | 1,370 | 1,400 | 30 | 200 |
| `PlayAgain` | 413 | 450 | 37 | 200 |
| `LobbyWaitBox` | 2,045 | 2,100 | 55 | 200 |
| `OpenTables` | 1,242 | 1,300 | 58 | 200 |
| `ProfileSheet` | 5,940 | 6,000 | 60 | 200 |
| `WinList` | 1,300 | 1,360 | 60 | 200 |
| `trade-sound` | 524 | 600 | 76 | 200 |
| `use-muted-seats` | 418 | 500 | 82 | 200 |
| `ambience` | 461 | 550 | 89 | 200 |

## Complete inventory

| Chunk | Gzip size (B) | Ceiling (B) | Headroom (B) | Allowance (B) |
| :--- | :--- | :--- | :--- | :--- |
| `table` | 2,200 | 2,200 | 0 | 200 |
| `WayfarerOptions` | 489 | 500 | 11 | 200 |
| `focus-trap` | 537 | 550 | 13 | 200 |
| `eye-off` | 292 | 310 | 18 | 200 |
| `LobbyView` | 2,481 | 2,500 | 19 | 200 |
| `TurnExtensionVote` | 1,370 | 1,400 | 30 | 200 |
| `PlayAgain` | 413 | 450 | 37 | 200 |
| `LobbyWaitBox` | 2,045 | 2,100 | 55 | 200 |
| `OpenTables` | 1,242 | 1,300 | 58 | 200 |
| `ProfileSheet` | 5,940 | 6,000 | 60 | 200 |
| `WinList` | 1,300 | 1,360 | 60 | 200 |
| `trade-sound` | 524 | 600 | 76 | 200 |
| `use-muted-seats` | 418 | 500 | 82 | 200 |
| `ambience` | 461 | 550 | 89 | 200 |
| `Reactions` | 2,498 | 2,600 | 102 | 200 |
| `ProfileRecords` | 2,248 | 2,350 | 102 | 200 |
| `Sticker` | 946 | 1,050 | 104 | 200 |
| `SeatPublicGains` | 1,681 | 1,800 | 119 | 200 |
| `x` | 170 | 300 | 130 | 200 |
| `haptics` | 1,065 | 1,200 | 135 | 200 |
| `emotes` | 463 | 600 | 137 | 200 |
| `HandRates` | 650 | 800 | 150 | 200 |
| `BuildList` | 1,440 | 1,600 | 160 | 200 |
| `DockInspection` | 1,033 | 1,200 | 167 | 200 |
| `ProfileRecovery` | 3,032 | 3,200 | 168 | 200 |
| `losses` | 1,420 | 1,600 | 180 | 200 |
| `ProfileForms` | 2,169 | 2,350 | 181 | 200 |
| `LoadingScreen` | 2,402 | 2,600 | 198 | 200 |
| `LobbyTicTacToe` | 1,392 | 1,600 | 208 | 200 |
| `SoundSheet` | 1,790 | 2,000 | 210 | 200 |
| `sheets` | 7,465 | 7,800 | 335 | 200 |
| `SetupReference` | 1,858 | 2,200 | 342 | 200 |
| `sound-extra` | 225 | 600 | 375 | 200 |
| `VictoryTargetSelect` | 618 | 1,000 | 382 | 200 |
| `OtherProfileCard` | 1,079 | 1,550 | 471 | 200 |
| `TradeToast` | 2,478 | 3,000 | 522 | 200 |
| `SeatNeeds` | 1,230 | 1,900 | 670 | 200 |
| `TradeResource` | 944 | 1,650 | 706 | 200 |
| `index` | 126,284 | 127,000 | 716 | 400 |
| `harbor-jelly` | 10,739 | 11,500 | 761 | 200 |
| `jelly-board` | 8,182 | 9,000 | 818 | 200 |
| `moments` | 4,314 | 5,700 | 1,386 | 200 |
| `IslandCanvas` | 201,231 | 203,500 | 2,269 | 664 |
| `online` | 6,611 | 9,000 | 2,389 | 200 |
| `hex-jelly` | 46,878 | 50,000 | 3,122 | 200 |

## Recommendations

- Keep imports out of `table` until the review desk trims it.
- Builders touching `LobbyView` must measure chunk size carefully before opening PRs.
- Avoid adding dependencies to `WayfarerOptions` or `focus-trap`.
