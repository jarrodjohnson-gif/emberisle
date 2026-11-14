# Non-covering HUD layout and layer audit (issue #129)

> Resolves #129: Design in-game HUD layers so they never cover board elements.
> Defines persistent HUD boundaries, camera hole framing, and transient overlay layering across desktop and mobile.

Sources: [docs/design/browser-table-visuals.md](browser-table-visuals.md), [docs/design/camera-light.md](camera-light.md),
[docs/design/mobile-camera-touch.md](mobile-camera-touch.md), [src/lib/scene/mobile-fit.ts](../../src/lib/scene/mobile-fit.ts),
and [docs/DECISIONS.md](../DECISIONS.md).

## Core layout contract

The game viewport splits into two distinct operational layers:

1. **Persistent HUD chrome**: defines the static boundary insets of the board hole.
2. **Interactive 3D board scene**: scales and fits exclusively inside the computed hole.

Persistent chrome never overlaps the island, hexes, paths, or settlements.

## Desktop HUD boundaries (1280×720 and 1920×1080)

Desktop view positions controls along viewport edges, preserving a central stage for the board.

- **Left rail (x=0 to x=216)**: holds vertical player seat cards and score tallies.
- **Top bar (y=0 to y=68)**: holds game title, audio controls, log shortcut, and settings menu.
- **Bottom tray (y=H-164 to y=H)**: holds compact resource hand numbers and main action buttons.
- **Right rail (x=W-312 to x=W)**: activates when chat or trade panels open.
- The 3D camera fits the board to the remaining central hole.
- Every hex, corner, path, and dock pier remains completely unobstructed.

## Mobile HUD boundaries

Mobile views adapt insets to preserve touch targets while maximizing board visibility.

### Upright phone (390×844)

- **Top strip (68 px)**: displays a compact four-seat pill row and menu button.
- **Bottom tray (232 px)**: displays the one-tray hand numbers, Build, Trade, and End turn buttons.
- **Left and right margins (12 px)**: provide touch breathing room from screen edges.
- Camera uses a 40° forward lean to show hex relief and standing pieces.
- Island shore spans edge-to-edge with 4 px margin.
- Dock buttons and goods piles stay fully visible on screen.

### Sideways phone (844×390)

- **Left column (284 px)**: houses the stacked hand counts and action buttons.
- **Top margin (68 px)**: keeps compact status and menu buttons.
- **Bottom and right margins (12 px)**: provide minimal screen buffer.
- The island fits centrally in the broad horizontal landscape hole.

## Transient overlays and modal layering

Transient interface elements overlay the scene without altering camera positions.

### Modal trade and settings sheets

- Opening the trade panel or table menu presents a focused modal dialog.
- The background board dims slightly using a semi-transparent scrim.
- The camera does not dolly or pan when sheets open or close.
- Static declared insets in `playHole` prevent board jumping.

### Floating turn moments and alerts

- Central announcements like `TurnMoment` float over the board hole.
- They anchor using CSS variables: `--hole-top`, `--hole-bottom`, `--hole-left`, `--hole-right`.
- Centering applies to the hole bounds rather than the window bounds.
- This prevents banners from overlapping top seats or bottom tray buttons.

### Action toasts and notifications

- Temporary alerts display in designated safe zones between seat cards and the board.
- Toast containers dismiss automatically or on player tap.

## Z-index hierarchy

Interface elements stack in strict descending priority:

- **z=50**: System alerts, connection dropouts, and fatal error dialogs.
- **z=40**: Modal sheets (trade dialog, table menu, full game log).
- **z=30**: Chat bubbles, reaction pills, and seat gains tags.
- **z=20**: Persistent HUD chrome (top bar, player rail, bottom one-tray).
- **z=10**: Floating board moments (`TurnMoment`, dice roll animations).
- **z=0**: 3D WebGL canvas (`IslandCanvas` and board pickers).

## Verification and proof suite

The non-covering HUD contract is verified by automated test suites:

- Run `npm run upright-table-prove` to verify upright phone camera framing and dock reachability.
- Run `npm run pan-prove` to verify pan boundaries respect declared HUD insets.
- Run `npm run table-menu-prove` to verify table menu rows and inset consistency.
- Run `npm run board-look-prove` to verify scene triangles and light positioning.
- Run `npm run client-prove` to verify full layout stability across desktop viewports.
