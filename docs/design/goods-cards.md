# Goods card options

Issue: [#772](https://github.com/jarrodjohnson-gif/emberisle/issues/772).

**Recommendation: C, the cream card with a coloured top band and terrain illustrations.**
The paper frame reads like a physical card.
The pictures connect the hand to the island.
Names preserve recognition when pictures become small.
Jarrod chooses the direction before implementation.

These are **local presentation prototypes inside a running practice game**.
They are proposals, not shipped UI.
Only this document, screenshots, and capture metadata belong to this change.

## Compare the four options

Open the contact sheet at full size to compare all five goods.

![Four options in the real practice game](goods-cards/comparison.jpg)

| | A · Cream edge | B · Full colour | C · Top band · recommended | D · Playing cards |
| --- | --- | --- | --- | --- |
| Frame | Cream paper; 4 px coloured edge | Full resource-coloured face | Cream paper; 6 px coloured top band | Cream paper; coloured outline; alternating ±3° tilt |
| Picture | Enlarged current symbols | Enlarged current symbols | Original faceted terrain illustrations | Same terrain illustrations |
| Benefit | Familiar, clear silhouettes | Strongest colour grouping | Physical cards with island character | Strongest playing-card character |
| Tradeoff | Least detailed art | Colour fills compete with the island | Illustrations need an owner art choice | Tilt makes tiny cards busier |

The proposed illustrations use trees and logs, stacked bricks, a sheep, bundled wheat, and faceted stone.
They are original vector drawings made for this local comparison.
No downloaded art or external asset appears.

## Sizes and content

| Layout | Viewport | Card face | Picture | Count | Name |
| --- | --- | --- | --- | --- | --- |
| Upright hand | 390×844 | 67×62 CSS px | A/B: 28 px; C/D: 32×29 px | 24 px; D corner: 17 px | 11 px |
| Sideways left column | 844×390 | 47×44 CSS px | A/B: 20×21 px; C/D: 25×22 px | 18 px; D corner: 13 px | 9 px |
| Sideways right rail | 844×390 | 60×57 CSS px | 25×25 px | 22 px | 10 px |

Dimensions describe the face before D's rotation.
The compact prototype restores names that today's compact cards hide.
The right rail compares the requested larger size; choosing artwork does not approve that layout.

A full hand shows Wood 1, Brick 3, Sheep 2, Wheat 4, and Stone 4.
An empty hand shows five explicit zeroes, dashed outlines, and muted pictures.
Count and name text keeps its full contrast at zero.

The gained frame follows a real bank trade: Stone pays for one Wood.
Wood becomes 2; its card rises 20 px and shows a resource-coloured “+1”.
The snapshot holds that state for comparison.
Resource-coloured borders and the picture identify the gaining good without relying on colour alone.

Owner direction: gains appear only on cards.
The local prototype suppresses the island's floating gain text.
A future implementation must remove that duplicated presentation from `GainFloats.tsx`.

## Upright practice game · 390×844

Each image links to its original full-resolution capture.

| State | A · Cream edge | B · Full colour | C · Top band | D · Playing cards |
| --- | --- | --- | --- | --- |
| At rest | ![A portrait rest](goods-cards/a-portrait-rest.jpg) | ![B portrait rest](goods-cards/b-portrait-rest.jpg) | ![C portrait rest](goods-cards/c-portrait-rest.jpg) | ![D portrait rest](goods-cards/d-portrait-rest.jpg) |
| Empty | ![A portrait empty](goods-cards/a-portrait-empty.jpg) | ![B portrait empty](goods-cards/b-portrait-empty.jpg) | ![C portrait empty](goods-cards/c-portrait-empty.jpg) | ![D portrait empty](goods-cards/d-portrait-empty.jpg) |
| Gained | ![A portrait gained](goods-cards/a-portrait-gained.jpg) | ![B portrait gained](goods-cards/b-portrait-gained.jpg) | ![C portrait gained](goods-cards/c-portrait-gained.jpg) | ![D portrait gained](goods-cards/d-portrait-gained.jpg) |

## Sideways left column · 844×390

| State | A · Cream edge | B · Full colour | C · Top band | D · Playing cards |
| --- | --- | --- | --- | --- |
| At rest | ![A column rest](goods-cards/a-column-rest.jpg) | ![B column rest](goods-cards/b-column-rest.jpg) | ![C column rest](goods-cards/c-column-rest.jpg) | ![D column rest](goods-cards/d-column-rest.jpg) |
| Empty | ![A column empty](goods-cards/a-column-empty.jpg) | ![B column empty](goods-cards/b-column-empty.jpg) | ![C column empty](goods-cards/c-column-empty.jpg) | ![D column empty](goods-cards/d-column-empty.jpg) |
| Gained | ![A column gained](goods-cards/a-column-gained.jpg) | ![B column gained](goods-cards/b-column-gained.jpg) | ![C column gained](goods-cards/c-column-gained.jpg) | ![D column gained](goods-cards/d-column-gained.jpg) |

The compact comparison reserves space above the hand for the raised card and its badge.
It moves the turn instruction beside the column while preserving its layout footprint.
This presentation override prevents the existing instruction from covering the gain.
It remains local to these screenshots.

## Sideways larger rail · 844×390

| State | A · Cream edge | B · Full colour | C · Top band | D · Playing cards |
| --- | --- | --- | --- | --- |
| At rest | ![A rail rest](goods-cards/a-rail-rest.jpg) | ![B rail rest](goods-cards/b-rail-rest.jpg) | ![C rail rest](goods-cards/c-rail-rest.jpg) | ![D rail rest](goods-cards/d-rail-rest.jpg) |
| Empty | ![A rail empty](goods-cards/a-rail-empty.jpg) | ![B rail empty](goods-cards/b-rail-empty.jpg) | ![C rail empty](goods-cards/c-rail-empty.jpg) | ![D rail empty](goods-cards/d-rail-empty.jpg) |
| Gained | ![A rail gained](goods-cards/a-rail-gained.jpg) | ![B rail gained](goods-cards/b-rail-gained.jpg) | ![C rail gained](goods-cards/c-rail-gained.jpg) | ![D rail gained](goods-cards/d-rail-gained.jpg) |

The larger rail fits five 60×57 faces with 3 px gaps.
The first card demonstrates the lift; its badge sits above its left edge.
The local rail lifts the badge above the header background without covering a control.
Neighbouring cards cannot all reserve 20 px of vertical lift space within this viewport.
Any implementation adopting this rail needs a separate layout decision for simultaneous gains.
The recommended artwork also fits the existing compact column, so that decision does not block the art choice.

## Greyscale · smallest cards

| State | A · Cream edge | B · Full colour | C · Top band | D · Playing cards |
| --- | --- | --- | --- | --- |
| Greyscale at rest | ![A column greyscale](goods-cards/a-column-greyscale.jpg) | ![B column greyscale](goods-cards/b-column-greyscale.jpg) | ![C column greyscale](goods-cards/c-column-greyscale.jpg) | ![D column greyscale](goods-cards/d-column-greyscale.jpg) |

All five goods retain distinct silhouettes and printed names at 47×44.
Check trees, brick rectangles, the sheep's head, wheat ears, and mountain facets when comparing pictures.
Greyscale screenshots support visual review; recognition remains an owner judgement.

## Contrast

Count and name use opaque ink `#27271f` in every option and state.
Cream faces use `#fff7e5`; empty faces use `#f1ecdf`.
B uses the resource fills below, then `#e5e2d7` for empty faces.
No text inherits the picture's empty-state opacity.

| Good | Edge, band and gain ink | B face | B count/name contrast |
| --- | --- | --- | --- |
| Wood | `#315c38` | `#acc6a4` | 8.14:1 |
| Brick | `#89422f` | `#e5b39c` | 8.06:1 |
| Sheep | `#59613a` | `#d3d9b3` | 10.27:1 |
| Wheat | `#765817` | `#efd38a` | 10.28:1 |
| Stone | `#47566b` | `#bdc9d5` | 8.94:1 |

Browser-computed count/name contrast clears 4.5:1 across all 260 measured cards.
A, C and D have a minimum of 12.75:1.
B has a minimum of 8.06:1.
The capture manifest records each contrast value and card bounds.

## Reduced motion

The media preference removes the 20 px lift immediately.
The same “+1” remains on a still border highlight.
Counts update without movement.
Every sampled card has zero running animations and zero vertical translation.
D keeps its static printed-card angle; it adds no motion.

### Upright

| State | A · Cream edge | B · Full colour | C · Top band | D · Playing cards |
| --- | --- | --- | --- | --- |
| Still gained state | ![A portrait reduced](goods-cards/a-portrait-reduced.jpg) | ![B portrait reduced](goods-cards/b-portrait-reduced.jpg) | ![C portrait reduced](goods-cards/c-portrait-reduced.jpg) | ![D portrait reduced](goods-cards/d-portrait-reduced.jpg) |

### Sideways column

| State | A · Cream edge | B · Full colour | C · Top band | D · Playing cards |
| --- | --- | --- | --- | --- |
| Still gained state | ![A column reduced](goods-cards/a-column-reduced.jpg) | ![B column reduced](goods-cards/b-column-reduced.jpg) | ![C column reduced](goods-cards/c-column-reduced.jpg) | ![D column reduced](goods-cards/d-column-reduced.jpg) |

### Sideways rail

| State | A · Cream edge | B · Full colour | C · Top band | D · Playing cards |
| --- | --- | --- | --- | --- |
| Still gained state | ![A rail reduced](goods-cards/a-rail-reduced.jpg) | ![B rail reduced](goods-cards/b-rail-reduced.jpg) | ![C rail reduced](goods-cards/c-rail-reduced.jpg) | ![D rail reduced](goods-cards/d-rail-reduced.jpg) |

## Capture method and limits

1. Check out main commit `693a1b491468984132aa186fbdd82a09c7f5b77e` in a fresh isolated clone.
2. Run `npm ci` with Node 24.19.0.
3. Start Vite on a local port with its existing configuration.
4. Launch Chromium with Playwright, touch input, and device scale factor 1.
5. Press Play and complete the actual practice roll-off and both setup rounds through production store actions.
6. Save that practice snapshot at the human's first roll.
7. Press Skip tips through its existing control before taking comparison screenshots.
8. Clone it for each comparison state and preserve its island, seats, buildings, and camera.
9. Stage the specified hand through the existing development store hook, as the hand proofs do.
10. Balance the bank against every player's hand; set main phase and refresh the sync baseline.
11. Inject browser-only card styles and vector pictures without editing runtime files.
12. Apply the full or empty hand; record computed geometry and text contrast.
13. Dispatch `bankTrade` from Stone to Wood through the production rules dispatcher.
14. Confirm Wood increases from 1 to 2 before holding the proposed gain presentation.
15. Capture at 390×844 and 844×390, including both landscape face sizes.
16. Repeat with reduced motion; capture the smallest cards through a browser greyscale filter.

Prototype state and presentation are staged explicitly.
These captures validate the proposed appearance, not a finished feature or unmodified gameplay timing.
The local capture source stays outside the PR, as issue #772 requires.
The contact sheet embeds captured screenshots; it redraws no game scene.

[Capture manifest](goods-cards/capture-manifest.json) records the base commit, browser version, viewport, action results, measurements, and image hashes.
The capture run produced 52 screenshots with no browser errors.
Assertions passed for requested sizes, viewport bounds, 4.5:1 text contrast, the bank-trade gain, and static reduced motion.
No unrelated browser suites ran.

## Source

- [`Hand.tsx`](../../src/components/game/Hand.tsx): resource cards, counts, names, gain diffs, and mounted empty hands.
- [`hand-motion.css`](../../src/components/game/hand-motion.css): current compact and reduced-motion gain cues.
- [`ResourceSymbols.tsx`](../../src/components/game/ResourceSymbols.tsx): existing five symbols used by A and B.
- [`GainFloats.tsx`](../../src/components/game/GainFloats.tsx): duplicated island gain presentation targeted by owner direction.
- [`styles.css`](../../src/styles.css): existing goods faces, resource colours, and motion preferences.
- [`hand-cards-prove.mjs`](../../scripts/hand-cards-prove.mjs): precedent for staged hands and real rules-dispatched bank trades.

Builder: GPT-6.1 Sol; the requested Opus model was unavailable.
