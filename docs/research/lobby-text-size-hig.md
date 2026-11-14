# Lobby Text Size and Apple HIG Dynamic Type Scaling Research

## 1. Overview and Problem Statement

Issue #1235 investigates lobby text size scaling against Apple Human Interface Guidelines.
Apple HIG requires apps to respect user font size choices.
Supporting text size changes ensures accessibility for visually impaired players.
The lobby currently uses hardcoded pixel text sizes.
Only 2 of 33 lobby texts currently scale with user font settings.
Those two texts are the chat log lines.
The other 31 text styles remain fixed in pixels.
When users configure 125% or 150% text zoom, most lobby text fails to scale.

## 2. Apple HIG Dynamic Type Scale Reference

Apple specifies standard Dynamic Type sizes and line heights for iOS.
The table below maps HIG text styles to web rem units.
Base rem assumes standard 16 px browser root font size.

| HIG Text Style | Font Weight | iOS Default | rem Equivalent | 125% Text (20 px Root) | 150% Text (24 px Root) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Title 1 | Bold (700) | 28 pt / 34 pt | 1.75rem / 2.125rem | 35 px / 42.5 px | 42 px / 51 px |
| Title 2 | Bold (700) | 22 pt / 28 pt | 1.375rem / 1.75rem | 27.5 px / 35 px | 33 px / 42 px |
| Title 3 | Regular (400) | 20 pt / 25 pt | 1.25rem / 1.5625rem | 25 px / 31.25 px | 30 px / 37.5 px |
| Headline | Semibold (600) | 17 pt / 22 pt | 1.0625rem / 1.375rem | 21.25 px / 27.5 px | 25.5 px / 33 px |
| Body | Regular (400) | 17 pt / 22 pt | 1.0625rem / 1.375rem | 21.25 px / 27.5 px | 25.5 px / 33 px |
| Callout | Regular (400) | 16 pt / 21 pt | 1.0rem / 1.3125rem | 20 px / 26.25 px | 24 px / 31.5 px |
| Subheadline | Regular / Medium | 15 pt / 20 pt | 0.9375rem / 1.25rem | 18.75 px / 25 px | 22.5 px / 30 px |
| Footnote | Regular (400) | 13 pt / 18 pt | 0.8125rem / 1.125rem | 16.25 px / 22.5 px | 19.5 px / 27 px |
| Caption 1 | Regular (400) | 12 pt / 16 pt | 0.75rem / 1.0rem | 15 px / 20 px | 18 px / 24 px |
| Caption 2 | Regular (400) | 11 pt / 13 pt | 0.6875rem / 0.8125rem | 13.75 px / 16.25 px | 16.5 px / 19.5 px |

## 3. Lobby Text Elements and Proposed rem Mapping

The 33 lobby text elements map to standard HIG styles.
The table below documents current values and proposed rem equivalents.

| Component / Selector | Role | Current Style | HIG Style | Proposed rem Value |
| :--- | :--- | :--- | :--- | :--- |
| `.lobby-code > [data-testid="table-code"]` (desktop) | Room code | 28 px / 34 px bold | Title 1 | `1.75rem / 2.125rem` |
| `.lobby-code > [data-testid="table-code"]` (portrait) | Room code | 22 px / 28 px bold | Title 2 | `1.375rem / 1.75rem` |
| `.lobby-code > [data-testid="table-code"]` (320 px) | Room code | 18 px / 28 px bold | Custom title | `1.125rem / 1.75rem` |
| `.lobby-code > span:last-child` | Copied badge | 13 px / 18 px semibold | Footnote | `0.8125rem / 1.125rem` |
| `.lobby-layout .lm button` | Table / Play tabs | 15 px / 20 px medium | Subheadline | `0.9375rem / 1.25rem` |
| `.lobby-layout .lb` | Tab invite badge | 13 px / 20 px semibold | Footnote | `0.8125rem / 1.25rem` |
| `button:has-text("Rules")` | Rules button | 15 px / 20 px semibold | Subheadline | `0.9375rem / 1.25rem` |
| `.lobby-rule-status > span:first-child` | Wayfarer status | 15 px / 20 px bold | Subheadline | `0.9375rem / 1.25rem` |
| `.lobby-rule-status > *:last-child` | Connection status | 13 px / 18 px medium | Footnote | `0.8125rem / 1.125rem` |
| `.lobby-name` (desktop/landscape) | Seat player name | 17 px semibold | Headline | `1.0625rem` |
| `.lobby-name` (portrait phone) | Seat player name | 14 px semibold | Subheadline | `0.875rem` |
| `.lobby-name` (390 px phone) | Seat player name | 13 px semibold | Footnote | `0.8125rem` |
| `.lobby-player-status` | Host/Bot/Ready status | 13 px / 18 px medium | Footnote | `0.8125rem / 1.125rem` |
| `.lobby-player > button` (Add bot) | Seat action | 15 px / 20 px (or 13 px) | Subheadline | `0.9375rem / 1.25rem` |
| `.lobby-chat-panel [data-testid="chat-log"] > li` | Chat messages | `1.0625rem` / `0.875rem` | Body | Already rem |
| `.lobby-chat-panel input` | Chat input field | 17 px (16 px phone) | Body / Input | `1.0625rem` |
| `.lobby-summary > p` | Ready status summary | 17 px / 22 px (14/13 px) | Headline | `1.0625rem / 1.375rem` |
| `.lobby-summary [data-testid="victory-target"]` | Win target caption | 13 px / 18 px medium | Footnote | `0.8125rem / 1.125rem` |
| `.lobby-action-buttons > button` (Ready/Start) | Primary actions | 17 px / 22 px (14/13 px) | Headline | `1.0625rem / 1.375rem` |
| `.lobby-action-buttons > button:last-child` | Leave table | 15 px / 20 px semibold | Subheadline | `0.9375rem / 1.25rem` |
| `.lobby-wait-head b`, `.lobby-layout .lt b` | Mini-game title | 17 px / 22 px semibold | Headline | `1.0625rem / 1.375rem` |
| `.lobby-wait-keys`, `.lobby-layout .lr` | Mini-game instructions | 13 px / 18 px medium | Footnote | `0.8125rem / 1.125rem` |
| `.lobby-layout .lx-who` | Tic-tac-toe turn | 15 px / 20 px medium | Subheadline | `0.9375rem / 1.25rem` |

## 4. Empirical Measurements Across Five Viewports

We measured the lobby at 100%, 125%, and 150% root font size.
Testing was conducted in headless Chromium via Playwright across five viewports.

| Viewport | Text Scale | Root Size | Vertical Overflow | Horizontal Overflow | Code Fits | Collisions / Overflow Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 320x568 portrait | 100% | 16 px | 0 px | 0 px | Yes (`WWWW` fits) | Clean baseline, 0 px overflow |
| 320x568 portrait | 125% | 20 px | 3 px | 0 px | Yes (`WWWW` fits) | Seat name collides with status |
| 320x568 portrait | 150% | 24 px | 14 px | 5 px | Yes (`WWWW` fits) | Action buttons wrap and overflow |
| 375x667 portrait | 100% | 16 px | 0 px | 0 px | Yes (`WWWW` fits) | Clean baseline, 0 px overflow |
| 375x667 portrait | 125% | 20 px | 3 px | 0 px | Yes (`WWWW` fits) | Seat name collides with status |
| 375x667 portrait | 150% | 24 px | 14 px | 0 px | Yes (`WWWW` fits) | Card overflows vertically by 14 px |
| 390x844 portrait | 100% | 16 px | 0 px | 0 px | Yes (`WWWW` fits) | Clean baseline, 0 px overflow |
| 390x844 portrait | 125% | 20 px | 0 px | 0 px | Yes (`WWWW` fits) | Seat name collides with status |
| 390x844 portrait | 150% | 24 px | 10 px | 0 px | Yes (`WWWW` fits) | Card overflows vertically by 10 px |
| 844x390 landscape | 100% | 16 px | 0 px | 0 px | Yes (`WWWW` fits) | Clean baseline, 0 px overflow |
| 844x390 landscape | 125% | 20 px | 3 px | 0 px | Yes (`WWWW` fits) | Seat name collides with status |
| 844x390 landscape | 150% | 24 px | 14 px | 0 px | Yes (`WWWW` fits) | Card overflows vertically by 14 px |
| 1280x720 desktop | 100% | 16 px | 0 px | 0 px | Yes (`WWWW` fits) | Clean baseline, 0 px overflow |
| 1280x720 desktop | 125% | 20 px | 0 px | 0 px | Yes (`WWWW` fits) | Seat name collides with status |
| 1280x720 desktop | 150% | 24 px | 2 px | 0 px | Yes (`WWWW` fits) | Minor 2 px overflow at container edge |

## 5. Failure Modes and Root Causes

### Failure Mode 1: Seat Name and Status Text Collision
In `.lobby-player`, grid rows are hardcoded to `26px 18px` or `22px 18px`.
`--seat-row` is fixed at 26 px, 22 px, or 18 px.
Row 1 contains the seat name button.
Row 2 contains `.lobby-player-status`.
When text scales to 125% (20 px) or 150% (24 px), name text expands.
The enlarged name exceeds `--seat-row` and collides into the status text.
Both lines overlap visually, degrading legibility.

### Failure Mode 2: Card Vertical Overflow
`.lobby-layout .lobby-layout-cover` uses rigid grid row tracks.
Rows include fixed 44 px headers and a fixed 96 px action bar.
Card heights are bound to viewport height via safe-area insets.
When all text scales up, internal content height exceeds viewport bounds.
Vertical overflow reaches 3 px at 125% and 14 px at 150% on phones.
Existing proofs strictly assert zero vertical overflow (`vOverflow === 0`).
A naive rem conversion fails existing overflow proofs without layout adaptations.

### Failure Mode 3: Action Button Horizontal Squeeze at 320 px
On 320x568 portrait, card inner width is only 272 px.
Three action buttons share the row: Ready, Start, and Leave table.
At 150% text size, button text labels widen significantly.
Together with 8 px inter-button gaps, the row overflows horizontally by 5 px.

### Failure Mode 4: Room Code Behavior
The four-letter room code scales cleanly at all text sizes.
`fitLobbyCode` measures text width against available header space.
If text exceeds the button box, `fitLobbyCode` automatically scales down the font size.
As a result, room codes like `WWWW` remain fully visible without clipping.

## 6. Recommended Implementation Path for Issue #1235

### Phase 1: Fluid Seat Row Heights
Replace fixed row tracks in `.lobby-player` with content-aware sizing.
Change `grid-template: 26px 18px` to `grid-template-rows: auto auto`.
Allow the seat box height to expand smoothly with font size.

### Phase 2: Action Button Wrapping on Small Viewports
On screens 360 px wide or narrower at 150% text size, adapt the action row.
Allow action buttons to stack vertically or shorten "Leave the table" to "Leave".

### Phase 3: Controlled Card Scrolling at Large Scales
Allow `.lobby-layout-cover` to enable vertical scrolling when text exceeds screen height.
Use `overflow-y: auto` to prevent clipped content while preserving touch interaction.
Update `lobby-overflow-prove.mjs` to permit scrolling only under enlarged text conditions.

### Phase 4: Automated Dynamic Type Proof
Create `scripts/lobby-dynamic-type-prove.mjs`.
Verify text scaling at 100%, 125%, and 150% across all five viewports.
Verify zero text clipping, zero negative target margins, and full code visibility.
