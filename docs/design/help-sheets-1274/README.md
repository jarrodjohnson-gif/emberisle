# Help sheets: one chrome for How to play and Costs (#1305)

The #1274 audit found the two help sheets drawn two ways: a 24 px display title on one and 20 px on the other, 20 px padding, a white half-border, a 45 % white scrim, and a Costs card that scrolls as a whole so Close scrolls away.
This folder is the shared sheet spec and the pictures. Rule text, cost rows, the focus trap, Escape and focus return do not change. No `src/` file changed here.

Author: Fable (Claude Fable 5.1), 2026-11-07, on `main` at `a482f380`.

## Today

| | How to play (`HowTo.tsx`) | Costs (`CostCard.tsx`) |
|---|---|---|
| Opened from | Title (How to play), lobby (Rules), table menu row | Table menu row |
| Backdrop | `bg-white/45`, `p-safe` | `bg-white/45`, `p-safe` |
| Position | bottom of the screen under 640 px, centred above | same |
| Sheet | `bg-surface`, 20 px corners, `border-white/50`, no shadow, max 448 px, max 80 dvh | `bg-surface`, 20 px corners, one-off shadow, max 320 px (448 from 640 px), max 80 dvh |
| Title | 24 px, display face, weight 400 | 20 px / 600 (`text-title`) |
| Close | ghost icon, 44 px, focused on open, `ui_back` | same |
| Padding | 20 px | 20 px |
| Body | 14 px / 22.75 px, `zinc-600`, a focusable scroll region under a fixed title row | 15 px rows, 12 px worth list, the whole card scrolls |
| Keys | Tab cycles inside; Escape closes; focus returns to the opener | `useFocusTrap`; Escape closes; focus returns to the opener |

## The shared sheet

| Item | Value |
|---|---|
| Backdrop | mist `--ground` at 70 %, no blur. One token for both. See the question on the issue for the owner's pick. |
| Position | bottom-anchored on phones (`items-end`), centred from 640 px, inside `p-safe` (12 px or the safe-area inset). Normal reading order; nothing is reversed. |
| Sheet | white `--surface`, 20 px corners (`--radius-sheet`), `--shadow-sheet`, no border, 448 px wide at most, 80 dvh tall at most |
| Title | 20 px / 26 px, weight 600, the UI face (`text-title`), one per sheet |
| Close | 44 x 44 ghost icon at the top right of the title row, focused on open, `ui_back`, always on screen |
| Padding | 16 px; 4 px between the title row and the body |
| Body | 15 px / 22 px ink for sentences; the Costs rows stay 15 px with their chips, the worth list stays 12 px muted (meta). The body is a scroll region under the fixed title row, with a thin scrollbar (`--control-line`) so overflow shows. How to play already does this; Costs gets the same split. |
| Keys | unchanged: focus lands on Close, Tab stays inside, Escape closes and returns focus to the opener, the game state does not change |

Fortunes keeps its own sheet under #1302; the profile and trade sheets are not in this issue.

## Pictures

Real game, Chromium 153 through Playwright, device scale 1. Each sheet is opened from the Table menu on a hotseat table, so the opener is the real one. "After" is the same page with [after.css](after.css) on top.

| Size | How to play | Costs |
|---|---|---|
| 320x568 | [before](pictures/320x568-howto-before.jpg) · [after](pictures/320x568-howto-after.jpg) | [before](pictures/320x568-costs-before.jpg) · [after](pictures/320x568-costs-after.jpg) |
| 390x844 | [before](pictures/390x844-howto-before.jpg) · [after](pictures/390x844-howto-after.jpg) | [before](pictures/390x844-costs-before.jpg) · [after](pictures/390x844-costs-after.jpg) |
| 844x390 | [before](pictures/844x390-howto-before.jpg) · [after](pictures/844x390-howto-after.jpg) | [before](pictures/844x390-costs-before.jpg) · [after](pictures/844x390-costs-after.jpg) |
| 1280x720 | [before](pictures/1280x720-howto-before.jpg) · [after](pictures/1280x720-howto-after.jpg) | [before](pictures/1280x720-costs-before.jpg) · [after](pictures/1280x720-costs-after.jpg) |

Measured ([pictures/measurements.json](pictures/measurements.json)), the same before and after unless noted:

| Size | How to play sheet | Hidden body (scrolls) | Costs sheet | Costs scrolls |
|---|---|---|---|---|
| 320x568 | 296 x 454 at 12, 102 | 1259 px in a region, Close outside it | 296 x 390 (394 after) | no, it fits |
| 390x844 | 366 x 675 at 12, 157 | 854 px | 320 x 390 before, 366 x 394 after | no |
| 844x390 | 448 x 312 centred | 1032 px | 448 x 278 | no |
| 1280x720 | 448 x 576 centred | 768 px | 448 x 278 | no |

On every run: Close is inside the viewport and focused on open; Escape removes the sheet, focus returns to the Table menu button, and `state.seq` is unchanged. Zero page errors.
Title 24/400 to 20/600 on How to play; body 14 px to 15 px. Costs grows from 320 to 366 px wide at 390 so both sheets share one width rule.

## For the build issue

Size XS, `lane:hud`. Files: `HowTo.tsx`, `CostCard.tsx` (and one shared class pair in `styles.css` if the builder prefers).

Completion test:

1. `howto-prove`, `build-ready-prove` (its Costs card step), `table-menu-prove` and `first-game-coach-prove` pass. The only assertion that may need the 2026-10-25 replacement is a title size, if one exists; none was found.
2. Both sheets measure the same backdrop colour, corner radius, shadow, padding and title font at 320x568, 390x844, 844x390 and 1280x720.
3. Costs: the title row and Close stay fixed while the body scrolls at a height where it overflows (force 320x480 in the proof).
4. Focus: Close on open, Escape closes, focus returns to the opener, `state.seq` unchanged. Already asserted in `howto-prove`; add the same three lines for Costs.

## Reproduce

Run from the repo root, one browser at a time: `node docs/design/help-sheets-1274/capture.mjs`.
