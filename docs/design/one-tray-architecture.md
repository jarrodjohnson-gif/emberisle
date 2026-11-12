# One Tray Table HUD Architecture

- date: 2026-11-12
- agent: builder-decide
- lane: hud (tier 3)
- commit: 3475e541
- reference: complements `docs/design/one-tray/README.md`
- targets: `src/components/game/Hud.tsx`, `src/components/game/BuildList.tsx`

## Overview

This specification documents the component architecture of the merged one-tray table HUD (PR #1542).
The design unifies hand tallies, action utilities, and turn state into a single card surface.
Detailed UX specifications and historical mockups live in `docs/design/one-tray/README.md`.
This note details the implemented component tree as of commit 3475e541.

## Component Structure

```
+-------------------------------------------------------+
| Status & Newest Event Row                             |
+-------------------------------------------------------+
| Hand Dock (5 plain resource counts: Timber..Ore)      |
+-------------------------------------------------------+
| Action Utilities (Build, Trade, End Turn, [Fortune])  |
+-------------------------------------------------------+
```

### 1. Top Line: Turn Status and Events
- Shows active turn instructions (for example, "Your turn" or "Waiting for Tide").
- Displays the newest game event on the right.
- The numbers strip yields width so the event line is never truncated.

### 2. Hand Dock
- Displays owned resource cards as five plain numerical tallies.
- Zero counts render with `#64736f` to satisfy WCAG AA contrast against the tray card.
- Icons sit beside numerals without separate card boxes.

### 3. Action Utilities
- Base row holds three buttons: Build, Trade, and End Turn.
- When the player holds any fortune card, a fourth Fortune button appears.
- Utility buttons use `flex-1` with the Fortune button sizing at its natural width.
- When a build is armed with no target, the row shows Cancel alone.
- When a target spot is picked, the row shows Cancel and Place (`place-cancel` and `place-chip`).
- The Build button receives a one-shot `build-ready` pulse when a build becomes newly ready.
- Builds with no legal spot or none left never trigger the pulse.

### 4. Build List Sheet
- Build button opens `BuildList.tsx` in a modal sheet.
- Each row displays structure cost and an actionable Place or Buy pill.
- When unaffordable, buttons render disabled with plain explanatory text.
- `BuildList` loads as a lazy chunk under a desk-approved 1,600 B gzip ceiling.

## Responsive Layouts

### Desktop (768 px and wider with fine pointer)
The tray lays out as a single row.
The hand docks on the left, and buttons sit immediately beside it.
This horizontal arrangement preserves vertical viewport space for island rendering.

### Upright Phone (320 px to 430 px)
The tray stacks vertically into three compact rows.
Buttons measure 48 px tall to exceed touch target requirements.

### Sideways Phone (844x390)
The tray transforms into a full-height 260 px left column.
The island fits into the remaining width without overlap.

## Verification

The system is verified by `npm run tray-prove`.
The proof tests all viewports, fortune states, armed modes, and accessibility landmarks.
