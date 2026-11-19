# iPhone Duo viewports (#1814)

Measured, not designed. `npm run duo-viewport-prove` drives the real game at the four estimated Duo Safari viewports
(CSS px, from secondary sources, not Apple): folded 466x678 and 678x466, opened 626x890 and 890x626. It changes nothing in
`src/`. Add `-- --save` to rewrite this folder. `measurements.json` holds every number; `pictures/` holds one JPG per size and
screen (title, lobby, pre-roll, build, results).

How the screens are reached: title and lobby are real (a host, a guest and a bot). The table is a practice table with the
crafted state `docs/design/button-audit/capture.mjs` uses. The results screen is that table with its phase set to `over`, so
the sheet is real and its scores are not. A chromium capture at 1x, so tap sizes are CSS px.

## What the proof fails on

Fold and unfold mid-turn, 466x678 -> 626x890 -> 890x626 -> 466x678, twice (a practice main phase with the Build list open and a
synthetic turn clock; a hosted roll-off with the real turn clock and the table menu open). Each step asserts: the page was
not reloaded, the game state and the turn deadline are unchanged, the open sheet is still open, the canvas has the new size,
the board's hex extent on screen changed (a re-fit), every hex is inside the viewport, and the last step lands on the extent
the first one had. All hold. The sheets also stay inside the viewport at every step (reported, not asserted).

## Findings (data, not failures)

Controls cut off, covered or off-screen, horizontal scroll and tap targets under 44 px, per size and screen:

| Screen | 466x678 | 678x466 | 626x890 | 890x626 |
|---|---|---|---|---|
| Title | 6 (see note) | 6 (see note) | 6 (see note) | 6 (see note) |
| Lobby | 0 | 0 | 0 | 0 |
| Pre-roll | 0 | 0 | 0 | 0 |
| Build list open | 0 | 0 | 0 | 0 |
| Results | 0 | 0 | 0 | 0 |
| Horizontal scroll, any screen | none | none | none | none |
| Targets under 44 px, any screen | none | none | none | none |

Title note: the six are the profile avatar buttons (Ember, Tide, Dune, Pine), the Seats or Practice wayfarer toggle, and the
name field "covered by summary". They sit in the collapsed Profile and Game options rows, clipped by their closing panel. I
believe these are the collapsed rows measured as they close, not a layout fault, and the title pictures show nothing cut
off. They are the same on all four sizes. Treat as a probable measurement artefact, to confirm by
hand before anyone designs around them. Controls under the island's canvas (the dock inspectors) and controls behind an open
sheet are not counted.

Law 3 (`docs/design/app-review/laws/open-questions.md`): upright, the island keeps 60 % of the height; sideways, a column of
at most 42 % of the width. Measured from the live chrome, `__isle.liveInsets()`:

| Screen | 466x678 | 678x466 | 626x890 | 890x626 |
|---|---|---|---|---|
| Pre-roll and Build, island height share | 0.563 (fails 0.60) | 0.828 | 0.667 (ok) | 0.872 |
| Pre-roll and Build, column width share | n/a | 0.437 (fails 0.42) | n/a | 0.333 (ok) |
| Results, island height share | 0.882 | 0.828 | 0.910 | 0.872 |

The fits are consistent: the declared hole (`__isle.insets()`) agrees with the live chrome to a few px on every table screen.

## Which failures likely need a layout change

1. Folded upright, 466x678: the island has 56.3 % of the height before the roll and with the Build list open, under the
   proposed 60 %. The island's hole reserves 228 px under it for the tray (68 px above), which on a 678 px screen leaves 382 px. A layout change
   (a shorter tray or a smaller header) is the only fix; a design decision for the owner.
2. Folded sideways, 678x466: the HUD column is 43.7 % of the width, over the 42 % cap, leaving the island 56.3 % of the
   width. A narrower column would meet it. A layout change.
3. The opened screens (626x890, 890x626) meet law 3 on every table screen, with nothing cut off and no tap target under
   44 px. The upright one is 0.70 wide per unit of height and still gets a 66.7 % island. No change needed from this proof.

Not checked: Safari's own toolbars and the safe areas on a foldable (the sizes are full-height estimates, `safe` insets are
0), the fold crease in a spanned layout, and a played-out results screen. Each needs a real device or a confirmed spec.
