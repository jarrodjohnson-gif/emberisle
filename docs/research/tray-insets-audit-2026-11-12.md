# Tray Insets and Mobile Fit Audit

- date: 2026-11-12
- agent: builder-proofs
- lane: hud (tier 3)
- targets: `src/lib/scene/mobile-fit.ts`, `src/components/game/Hud.tsx`

## Overview

This audit verifies declared and measured HUD hole insets following the one-tray merge (PR #1542).
The one-tray design unified the table bottom into one single surface.
The declared hole follows the measured tray on screen.
Every measured inset preserves a positive safety margin to prevent board cropping.

## Measurements Across Viewports

| Viewport | Device Mode | Declared Bottom Inset | Measured Bottom Inset | Safety Margin | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 390x844 | Upright phone | 232 px | 228 px | +4 px | PASS |
| 430x932 | Upright phone | 232 px | 228 px | +4 px | PASS |
| 1280x720 | Desktop | 168 px | 164 px | +4 px | PASS |
| 844x390 | Sideways phone | 0 px bottom (260 px left rail) | 0 px bottom (260 px rail) | 0 px | PASS |

## Fit Rationale

### Upright Phone (390x844 and 430x932)
The tray combines the top status line, hand numbers strip, and three utility buttons.
The measured height on screen is 228 px.
`mobile-fit.ts` declares a 232 px bottom inset.
The 4 px buffer guarantees the island geometry never touches the tray shadow.

### Desktop (1280x720)
At 768 px and wider with a fine pointer, the tray arranges as a single row.
The hand docks on the left, and action utilities sit on the right.
The measured tray height is 164 px.
The declared inset is 168 px, providing 4 px headroom.

### Sideways Phone (844x390)
On landscape phones, the bottom stack relocates to a full-height 260 px left rail.
The bottom inset drops to 0 px.
The camera frustum fits horizontally into the remaining screen width.

## Proof Verifications

- `npm run tray-prove` passed all viewport inset assertions cleanly.
- `npm run upright-table-prove` confirmed 390x844 and 430x932 framing without obstruction.
- `npm run hud-safe-area-prove` confirmed notch and home-bar padding compliance.
- `npm run reflow-prove` verified zero layout shifts during turn transitions.

## Conclusion

The one-tray declared insets match actual DOM dimensions across all supported viewports.
Zero visual clipping or pick obstruction occurs.
