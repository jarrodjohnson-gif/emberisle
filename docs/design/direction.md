# Visual direction, chosen 2026-10-14

**Status:** chosen by Jarrod from the mockup at `docs/design/mockups/2026-10-phone-main.webp`
(phone portrait, main phase, an offer open). This file turns that picture into numbers. Where
the mockup and an existing design note disagree, this file wins. The UX decisions already
made still hold: the offer is a docked card with Yes / No and a timer (never a modal), chat
is a bottom sheet on phones, 44 px targets, safe areas, AA contrast, reduced motion.

## The idea in one line

A cream paper chip system on a flat teal table, with the island sitting directly on the
teal. No glass, no dark sea vignette, no gradients. Every control is a chip: cream fill,
thin dark outline, soft shadow, rounded corners, one icon and one or two words.

## Tokens (`src/styles.css`, replace the current `--color-*` set)

```
--color-table:    #9fdcd8;  /* the teal everything sits on; also the ocean */
--color-table-2:  #8fd0cc;  /* the faint tile pattern drawn on the table, 6% darker */
--color-paper:    #fbf7ee;  /* chip and card fill */
--color-paper-2:  #f3eee2;  /* a pressed chip, a disabled chip's fill */
--color-ink:      #22312f;  /* text, icons, the chip outline (at 1 px, 0.9 alpha) */
--color-ink-2:    #5f6b69;  /* secondary text, disabled text */
--color-outline:  rgb(34 49 47 / 0.9);
--color-yes:      #244a47;  /* the filled primary button (Yes, End turn when it is the move) */
--color-yes-text: #fbf7ee;
--color-teal-ink: #1f7f7a;  /* the timer, links, "Your turn" dot */
--color-no:       #b23a2e;  /* danger text only; never a fill */
--shadow-chip:    0 2px 0 rgb(34 49 47 / 0.18), 0 6px 14px rgb(34 49 47 / 0.10);
--shadow-card:    0 3px 0 rgb(34 49 47 / 0.18), 0 10px 24px rgb(34 49 47 / 0.12);
--radius-chip:    14px;
--radius-card:    18px;
--radius-tile:    16px;
```

Seat colours stay `PLAYER_COLORS` (Ember `#e23d2e`, Tide `#2d6ee8`, Dune `#f3ecd9`,
Pine `#8a4fd3`). The seat dot is a 14 px round of the seat colour with the 1 px ink outline;
the acting seat's dot gets a second 2 px ring in ink at 3 px offset.

The old `--color-sea` / `--color-accent` are removed; the title screen and menus use the same
tokens (title = paper card on the teal table).

## Type

One rounded humanist sans, system first: `"Nunito", "Avenir Next Rounded", "Segoe UI",
system-ui, sans-serif`. Load Nunito 600/700/800 from Google Fonts, latin subset only,
`font-display: swap`; it is under 60 KB. Scale (phone / desktop):

| Role | Size | Weight |
|---|---|---|
| Score and goods count | 26 / 30 px | 800 |
| Chip label, button text | 17 / 18 px | 700 |
| Turn line, offer text | 17 / 18 px | 600 |
| Goods label under count | 14 / 15 px | 700 |
| Log line, timer | 15 / 16 px | 600 |

Text is always `--color-ink` on paper; `--color-ink-2` for secondary and disabled.

## The chip (one primitive, `src/components/ui/chip.tsx`)

- Fill `--color-paper`, 1 px solid `--color-outline`, `--radius-chip`, `--shadow-chip`.
- Min height 44 px (phone) / 40 px (desktop). Padding 10 px 14 px. Icon slot 20 px, 8 px gap.
- Pressed: fill `--color-paper-2`, shadow collapses to the 2 px hard line, translateY(1px).
- Disabled: fill `--color-paper-2`, text and icon `--color-ink-2`, no shadow, outline at 0.5.
- Primary (filled): fill `--color-yes`, text `--color-yes-text`, same outline and shadow.
- A card is a chip with `--radius-card`, `--shadow-card`, padding 14–16 px, that holds chips.

## The table and the island

- The page background is `--color-table` with a faint hex-tile pattern in `--color-table-2`
  (CSS, one repeating SVG, 48 px cell, 6% contrast). The canvas is transparent over it: the
  ocean in the scene is the same teal (`0x9fdcd8`) so board and page are one surface. Remove
  the dark radial sea gradient and the vignette.
- The island keeps its sand rim; brighten it to `0xe9d9b8`. Terrain paints are retuned toward
  the mockup: forest `0x2f5a3a`, pasture `0xa6c96a`, grain `0xd9b64a`, clay `0xb8502e`,
  ore `0x7f8b96`, waste `0xd8c8a0`. Number tokens stay cream `0xf4ead6`.
- Light rig: one warm directional key (`0xfff2dc`, 1.1, from the north-west, 55° elevation),
  hemisphere fill sky `0xdff6f4` / ground `0xc9b58f` at 0.6, shadow map 2048, radius 4.
  Shadows soft and short; nothing black.

## Phone portrait layout, top to bottom (390×844, the mockup)

1. **Seat row** (`SeatRail`): a horizontal row of chips, one per seat, 8 px gap, 12 px side
   margin, 10 px from the safe top. Chip = seat dot, name (max 6 chars, "You" for the local
   seat), score right-aligned at 26 px/800. The acting seat's chip has the ringed dot. A last
   `…` chip (44 px square) opens the table menu. The row scrolls sideways at 5+ seats.
2. **Board**: fills the space between the seat row and the turn line; the island fit uses
   the whole width. No chrome over it except the floating moments (`TurnMoment`, `GainFloats`).
3. **Turn line** (`Announcer` for the current line): one paper chip, full width, 12 px
   margins. A 10 px `--color-teal-ink` dot, then "Your turn · Build or trade" / "Mira's turn ·
   Rolling". The persistent log stays in the chat sheet; this line is the latest only.
4. **Goods tiles** (`Hand`): five paper tiles in a row, 8 px gap, `--radius-tile`. Each: a
   20 px icon (timber trees, clay bricks, wool cloud, grain sheaf, ore peak; two-tone SVG in
   the good's colour), the count at 26 px/800, the label at 14 px/700. Gains and losses use
   the existing +N/-N float over the tile.
5. **Action card** (`Hud` bottom): one paper card holding two rows of chips, 8 px gap.
   - Row 1, four equal chips: **Path**, **Outpost**, **Upgrade**, **Fortune**. Each shows the
     name and, under it, its cost as 16 px good icons with a count when more than one
     (`BuildCost`). Affordable and placeable: a small ink check after the name. Not affordable:
     disabled style with the missing goods' icons outlined in `--color-no`. No legal spot: the
     cost line reads "No spot" in `--color-ink-2` (`PlaceList` keeps the spots themselves).
   - Row 2: **Trade** chip (arrows icon) left; the two dice as 44 px paper squares with pips
     and the sum beside them in the middle; **End turn** chip right, primary-filled when the
     roll is done and nothing is pending.
6. **Offer card** (`TradeToast`): a paper card below the action card (or docked above it when
   there is no room), 12 px margins: seat dot, "Mira offers 2 wool for 1 ore" at 17 px/600,
   the timer right-aligned in `--color-teal-ink` ("20 s", counting down). Under it two
   full-width buttons, 56 px tall: **Yes** primary-filled, **No** plain chip. A resolved offer
   collapses into one log line.
7. **Chat** stays the bottom sheet; its dock button becomes a chip in the seat row's menu
   chip or a floating paper chip above the turn line when there are unread lines.

Everything respects the home-bar inset: the offer card (or the action card) sits 8 px above
`env(safe-area-inset-bottom)`.

## Phone landscape and desktop

- Landscape (844×390): the seat row becomes a left column of chips (one per seat, stacked),
  the action card and goods tiles stack in a right column, the board takes the middle. The
  offer card docks bottom-centre over the board's lower edge.
- Desktop (1280×720 and up): seat column top-left, goods tiles and the action card
  bottom-centre at a max width of 760 px, the turn line above them, the offer card
  bottom-right at 380 px wide. The table pattern and paper chips are identical; only sizes
  move to the desktop column of the type table.

## Build order (each one PR, each shippable alone)

1. Tokens, font, chip primitive, teal table with pattern, transparent canvas and teal ocean,
   dark-sea gradient and vignette removed. Nothing else moves yet.
2. Seat row chips and the turn line.
3. Goods tiles with icons.
4. Action card: build chips with cost and affordance, dice pair with sum, Trade, End turn.
5. Offer card and the resolved-offer log line.
6. Terrain retune and light rig.
7. Landscape and desktop layouts.
8. Title, lobby, menus, win screen on the same tokens.

Proofs: `contrast-prove` holds the AA numbers; `hud-safe-area-prove`, `reflow-prove`,
`rotate-overlays-prove` hold the layout; each PR adds or updates a screenshot in
`test-results/` and the reviewer compares it to the mockup.
