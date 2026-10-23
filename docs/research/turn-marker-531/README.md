# Current-turn marker validation, 2026-10-23

PR #706, issue #531. This adoption merges main `30737a5` normally at `9a36fd8`; the feature files and `turn-marker-prove.mjs` are byte-identical to the prior `d85dff8` head. No appearance, behavior, assertion or budget changes were made.

Fresh clone `work/verify706`, with `PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers`. Browser proofs run serially. [Focused output](turn-marker-prove.log) records 29 legal moves and seven passes at each of 1280×720, 390×844 and 844×390. It checks exactly one mounted and visible marker, its match to `state.current`, its box, the 3 px seat-colored inset ring and the visible non-color pointer.

The existing proof rejects zero and two markers on both fixtures and the live page, then verifies restoration. It also checks the 2 px phone rise while its button stays level, no rise under reduced motion, the ring and pointer on a current-player trade offer and win row, no marker on another player's offer, unchanged win-row heights, and zero console errors. No new test duplicates these existing controls.

[Manifest](manifest.json) records nine unedited PNGs, their viewport dimensions and hashes. The screenshots use Chromium's default software-GPU lite scenery and show the marker surfaces; they do not claim full-detail terrain or human visual acceptance.

| Viewport | Game | Current-player offer | Win rows |
|---|---|---|---|
| 1280×720 | [Game](turn-marker-1280x720.png) | [Trade](turn-marker-1280x720-trade.png) | [Win](turn-marker-1280x720-win.png) |
| 390×844 | [Game](turn-marker-390x844.png) | [Trade](turn-marker-390x844-trade.png) | [Win](turn-marker-390x844-win.png) |
| 844×390 | [Game](turn-marker-844x390.png) | [Trade](turn-marker-844x390-trade.png) | [Win](turn-marker-844x390-win.png) |

Prior adoption narrowed the lobby because it has no current turn before Start; trade and win rows use `data-turn-ring`, preserving exactly one `data-current-turn` on the mounted seat rail or strip. The prior adopter's non-color cue is an ink pointer, since the older per-seat glyphs were removed. These existing readings are retained for independent review, not newly accepted here.

Model provenance: the first issue claim names Grok; later adoption comments name Claude-Haiku-5.5-helper while the prior PR body names Claude Sonnet 5.5. This main refresh and verification are by Codex-open-table-833 (GPT-6.1 Sol). Independent Opus 5.5 review avoids all those named models. No independent approval is claimed.
