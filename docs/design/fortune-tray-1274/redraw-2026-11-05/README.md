# Fortunes redraw — 2026-11-05

Design proposal for #1302, led by GPT-6 Astra. These four new composites replace the failed geometry for review. They are drawings over the current game, not a runtime implementation or production proof.

Runtime underlay: main `f29c36fbfe6bf38f0101e64fbfd6b8c69b170344` (merged white chrome). Proposal base: `faa84c3ef9fa3c29792954f2a3c6502ce42e7178`. Chromium 153.0.8010.12; crafted local four-seat state, five fortune kinds, Plenty selected with no goods picked. The board is randomly dealt. The mock's 17-card count and neutral goods chips are illustrative, not runtime state bindings.

| Picture | Sheet bounds x / y / width / height | Seat/header clearance | What it shows |
|---|---|---:|---|
| [320×568](320x568-proposal.png) | 16 / 64 / 288 / 470 | 8px | Seat row remains clear; two full rows and part of the selected third row fit above the fixed goods/Play region. |
| [390×844](390x844-proposal.png) | 16 / 250 / 358 / 560 | 194px | Taller portrait composition; three full rows plus part of the fourth, with the island visible above. |
| [844×390](844x390-proposal.png) | 44 / 64 / 320 / 305 | 8px | Left dock column, fully inside the left half; one complete row in the scroller and a fixed selected action. Island remains visible to the right. |
| [1280×720](1280x720-proposal.png) | 416 / 126 / 448 / 560 | 70px below top header | Centred bottom sheet; desktop seat rail stays entirely to its left. |

The sheet remains bottom-anchored. Its height is capped by the measured header/seat-strip bottom plus 8px. The standalone mock defaults to 64px, matching this fixture; integration must measure the actual chrome, not assume 64px on every device. On desktop, side-by-side seat-card clearance is checked as rectangle nonintersection.

Safe-area examples are top/right/bottom/left = 44/0/34/0 in portrait and desktop stress, 0/44/21/44 in landscape. They apply to the overlay only; the underlay does not emulate device insets. Gutters retain 16px portrait, 24px desktop and 12px landscape minima. Landscape x44 reflects its notch example. The sheet ends at y534, 810, 369 and 686 respectively.

Deck count now shares the title block. Landscape uses 8px internal padding instead of 12px. This yields a 76.61px list viewport (77px client height) with a full 72px row and 2px scroller padding on each side. Other list viewports are 216.61px small phone and 306.61px portrait/desktop. Normal DOM/list order remains Wayfarer, Path, Plenty, Monopoly, Points; scrolling is necessary to reach later rows. The selected name and Play remain visible independently of the selected row's scroll position.

## Measurements and review

[measurements.json](measurements.json) records actual rectangles for the sheet, list, footer, Play, goods, header, seat strip and all four seat cards. The capture checked viewport bounds, at least 8px top clearance, no seat-card intersection, landscape inside the left half, unchanged Play position after list scrolling, all goods at least 44×44px, and normal list order. Small-phone goods are 46×44px; landscape goods are 54×44px. Play is 44px high throughout.

The first local redraw check failed because landscape list client height was only 69px. Reducing its internal padding to the approved 8px scale recovered a complete row; the 76px minimum check was retained. No production proof was run or edited for this drawing task.

All four pictures were visually inspected. Small phones still devote most of the available screen to the open sheet; the island is largely obscured there. That is an explicit limitation for owner layout review, not an assertion that the open-sheet scene meets the separate stationary-dock island-height target. The underlying existing dock/banner is unchanged and is not endorsed by these composites. The transparent overlay intentionally omits a scrim so clearance can be inspected.

## Answered offer behavior

[Desk answer6671764662](https://github.com/jarrodjohnson-gif/emberisle/issues/1274#issuecomment-6671764662) settles the old question. Only the current player sends trades. No incoming offer can interrupt a legal local fortune play. On another player's turn, this is a looking sheet with Play unavailable.

Leave it open, retain selection and focus, and leave the offer in the existing dock. No second window, waiting line, automatic dismissal or automatic response. The mock arrival checks reject the impossible own-turn arrival and preserve the off-turn sheet and focus with zero action attempts. The inert dock placeholder sits below the sheet and becomes available after ordinary dismissal. It is not a design for replacing the existing dock offer.

## Preserved evidence and next gate

The previous `images/`, `composites/`, `measurements.json`, validation log and old `SHA256SUMS` are byte-identical to the checkpoint. The old checksums describe that old checkpoint, not the edited HTML. [preserved-evidence.json](preserved-evidence.json) records SHA-256 comparisons against git for all 17 historical evidence files. New checksums are in this directory's `SHA256SUMS`.

Await owner review of these pictures and independent repository review before implementation. Shared Hud.tsx reservation release and integration coordination remain with #1144/#1101. No runtime PR, proof weakening, new child issue, palette push or automation change was made. #1274 remains open. This bounded drawing task ends paused.
