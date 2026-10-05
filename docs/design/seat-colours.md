# Seat marks alongside colour

**Recommendation:** keep the current four seat colours and pair each seat with one fixed geometric mark. Colour stays part of the Catan-like look; the mark and written name provide separate ways to tell the seats apart. Use the same mapping on pieces, the seat strip, chat names, trade notices and score rows. A player's chosen colour never changes their mark.

## The four marks

| Seat | Existing colour | Mark | Mark ink on the seat colour | Contrast |
|---|---|---|---|---:|
| Ember | `#c45c3e` | Solid triangle | Dark `#1c1916` | 4.123:1 |
| Tide | `#2a8f8a` | Two parallel bars | Dark `#1c1916` | 4.495:1 |
| Dune | `#e4c9a0` | Open circle | Dark `#1c1916` | 10.967:1 |
| Pine | `#3d6b4f` | Plus sign | Cream `#fff6e8` | 5.740:1 |

These marks have different outlines and fill patterns: triangle, paired lines, ring and cross. Keep them simple and repeat them without rotation or animation. The ink-to-seat contrast is above 3:1 for each mark, the WCAG minimum for meaningful non-text graphics. Tide's 4.495:1 is just below 4.5:1; none of these marks should be used to set ordinary text colour, which needs 4.5:1.

On the board, target an 8 px mark with strokes and gaps around 2 px at the smallest supported overhead view. Put the triangle, bars and circle on a flat, unobstructed roof or plate. Put the plus on the same kind of surface with the cream ink. Paths project to only about 6 px wide today, so give the path mark a local seat-colour patch around 12 px wide inside its proposed skirt. Verify that patch after the pieces in #238 land; if the final path shape cannot contain it, adjust the path badge rather than shrinking the mark below a visible line.

In the seat strip and text rows, use a 12 px or larger version beside the existing name. In compact selectors, show the name whenever the layout permits and retain the mark when it truncates. The mark is a small sign beside familiar UI, not a new row of controls or a separate legend players must memorize.

## Why colour alone is not enough

The following ratios are luminance contrast between the current sRGB seat colours. They are useful for showing why two colours can have similar lightness, but they are not colour-difference scores and do not predict how any one person sees hue.

| Pair | Luminance contrast |
|---|---:|
| Ember – Tide | 1.09:1 |
| Ember – Pine | 1.45:1 |
| Tide – Pine | 1.58:1 |
| Tide – Dune | 2.44:1 |
| Ember – Dune | 2.66:1 |
| Dune – Pine | 3.85:1 |

The strongest pair still has one member (Dune) whose colour-only relationship to the light island terrain is weak. A palette refresh could improve some hue pairs, but it would still leave identity dependent on colour and require another round of piece-to-terrain checks. The geometric marks are the smaller and more dependable design change for this stage.

## Contrast method and limits

Ratios use the WCAG relative-luminance calculation on the opaque flat sRGB values above: linearize each normalized channel at 0.04045, weight it by 0.2126 / 0.7152 / 0.0722, then divide the lighter luminance plus 0.05 by the darker luminance plus 0.05. These figures describe mark ink against the seat-colour patch, not the rendered 3D piece against every terrain tile.

The implementation still needs a visual pass at phone and desktop sizes and in the tilted camera: lighting, texture, shadows, antialiasing and tone mapping can reduce the effective contrast. Simulated deuteranopia, protanopia and tritanopia renders, plus feedback from players with colour-vision differences, are useful follow-up checks. Neither the ratios here nor a simulation alone proves accessibility.

## Sources

- [WCAG 2.2: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) — colour must not be the only visual way to convey information.
- [WCAG 2.2: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) — meaningful graphical objects need 3:1 contrast against adjacent colours.
- [WCAG 2.2: Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) — ordinary text needs 4.5:1.
- [WCAG 2.2 relative luminance](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance) — contrast calculation used above.
- [Piece scale and terrain contrast](pieces.md) — current overhead scale, piece geometry and terrain checks.
- `PLAYER_COLORS` in `src/lib/game/types.ts` — source of the four seat colours.
