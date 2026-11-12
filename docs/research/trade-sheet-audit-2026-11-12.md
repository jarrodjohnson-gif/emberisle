# Give/Get Trade Sheet Contrast and Usability Audit

- date: 2026-11-12
- agent: finish-stacker
- lane: hud (tier 3)
- commit: 3475e541
- command: `npm run trade-contrast-prove`
- targets: `src/components/game/TradePanel.tsx`, `src/components/game/trade-panel.css`

## Overview

This audit records contrast measurements of the merged Give/Get trade sheet (PR #1540).
The sheet groups offers under Give (accent `#b3261e`) and requests under Get (accent `#1e7a46`).
All measurements below match the exact output of `trade-contrast-prove`.

## Measured Contrast Ratios

Run output from `npm run trade-contrast-prove` across 1280x720, 390x844, and 844x390 viewports:

| State | Goods Tested | Contrast Ratio | Threshold | Status |
| :--- | :--- | :--- | :--- | :--- |
| Unselected resource label | Brick, Wheat, Stone | 5.553:1 | >= 4.5:1 | PASS |
| Selected Give resource | Brick, Wheat, Stone | 11.650:1 | >= 4.5:1 | PASS |
| Selected Get resource | Brick, Wheat, Stone | 11.691:1 | >= 4.5:1 | PASS |
| Control before fix | Brick, Wheat, Stone | 2.038:1 | < 4.5:1 (failing) | VERIFIED |

All selected and unselected goods exceed the WCAG AA 4.5:1 minimum contrast threshold.

## Controls and Hitboxes

- Stepper increment and decrement controls operate with minus-token and badge styling.
- Interactive rows provide accessible focus outlines via `trade-panel.css`.
- The bank action renders as a single button with `aria-describedby="trade-bank-quote"`.
- Tab navigation wraps inside the modal dialog without focus escaping.

## Proof Verification

- `npm run trade-contrast-prove` confirmed all production labels exceed 4.5:1 across 3 viewports.
- `npm run trade-tabs-prove` confirmed keyboard focus trapping and dismissal on Escape.

## Conclusion

The Give/Get trade sheet satisfies all WCAG AA visual contrast and keyboard requirements.
Zero accessibility regressions were identified.
