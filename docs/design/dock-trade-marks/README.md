# Dock trade marks that blend into the island

Issue [#1491](https://github.com/jarrodjohnson-gif/emberisle/issues/1491). A picture mock: no game code is merged.
Author: Claude Opus 5.5 (builder 2), 2026-11-12. Base: `main` at `2486e10`.

**Why.** On the #881 card (2026-11-09) Jarrod said the screen-sized trade chips were "terrible when zoomed out theyre huge ... the close up looks fine, but is there way to incorpoate the trade symbol in a more naturla way? perhaps one thats better looking and blends into invrioment." The chips stay the same size on screen while the island shrinks, so zoomed out they cover whole hexes.

**What this mock does.**
- **Three options**, each drawn on the island itself, so each one scales with the camera like the piers and goods piles.
- **No text in any of them.** The good is shown by its own symbol (the HUD's), the rate by white pips: two for 2:1, three for 3:1.
- **How they were drawn.** They were prototyped in the real renderer and photographed from the real build.
- **No game code merges.** The prototype is kept here as [`prototype.patch`](prototype.patch), so every picture can be reproduced.

## The options

| | A. Painted plank (recommended) | B. Flag on a mast | C. Standing sign |
|---|---|---|---|
| **What it is** | Today's plank on the end of each pier, repainted: the good's colour, its symbol and the pips. A little larger than today's (0.42 × 0.21 instead of 0.36 × 0.165). | A short mast on the pier head flies the same mark as a flag, facing the camera. | The same mark on a board on two posts at the pier's root, facing the camera. |
| **An owned dock** | A swallow-tailed pennant in the owner's colour on the pier head. | The same pennant, under the flag. | The same pennant, on top of the sign. |
| **Zoomed out** | A small coloured plank at the end of each pier, smaller than the goods pile; it scales with the island, so it never covers a hex. At this size it reads as the good's colour, not its symbol. | A small coloured flag above the pier head. The mast barely shows from the camera's height, so the flag looks as if it floats. | A small coloured sign at the shoreline beside the dockhouse. |
| **Close up** | The clearest: symbol and pips are largest, flat on the deck like a painted sign. | Clear, upright. | Clear, upright, but partly in front of the dockhouse on some docks. |

In all three:
- **A 3:1 dock's symbol** is a ring of five dots in the five goods' colours, meaning any good.
- **No cream.** The marks use white and the goods' colours. Today's plank has a cream border, which this replaces.
- **Ownership is public,** so nothing hidden is shown.
- **An owned dock reads by shape as well as colour:** the pennant is only there when the dock is owned, and it has a swallow tail. The boat's sail already wears the owner's colour today; that stays.

## Pictures

Each picture comes from the real build:
- **The game:** seed 14, four seats on one device, Ember to play. Ember owns the 3:1 dock (an outpost) and the wood dock (a stronghold); Tide owns the brick dock.
- **Sizes:** 390×844, 820×1180 and 844×390, each zoomed right out (the game's least zoom, 0.8), at the home view, and close up on Ember's wood dock at the game's most zoom (2.4).
- **Rows:** *Main* is today's board. *Old tags* is the branch `codex/560-owned-dock-labels` (PR #881) at `29675fbb`, for comparison.

All 63 pictures are in [`pictures/`](pictures/), named `<option>-<size>-<1-out|2-home|3-close>.jpg`; each is under 300 KB. The old-tags branch is older than main, so its HUD differs; only the docks are being compared.

### Zoomed right out (the case Jarrod raised)

| | 390×844 | 820×1180 | 844×390 |
|---|---|---|---|
| Old tags | ![](pictures/old-tags-390x844-1-out.jpg) | ![](pictures/old-tags-820x1180-1-out.jpg) | ![](pictures/old-tags-844x390-1-out.jpg) |
| Main today | ![](pictures/main-390x844-1-out.jpg) | ![](pictures/main-820x1180-1-out.jpg) | ![](pictures/main-844x390-1-out.jpg) |
| A. Painted plank | ![](pictures/a-painted-plank-390x844-1-out.jpg) | ![](pictures/a-painted-plank-820x1180-1-out.jpg) | ![](pictures/a-painted-plank-844x390-1-out.jpg) |
| B. Flag on a mast | ![](pictures/b-flag-on-mast-390x844-1-out.jpg) | ![](pictures/b-flag-on-mast-820x1180-1-out.jpg) | ![](pictures/b-flag-on-mast-844x390-1-out.jpg) |
| C. Standing sign | ![](pictures/c-standing-sign-390x844-1-out.jpg) | ![](pictures/c-standing-sign-820x1180-1-out.jpg) | ![](pictures/c-standing-sign-844x390-1-out.jpg) |

### The home view

| | 390×844 | 820×1180 | 844×390 |
|---|---|---|---|
| Old tags | ![](pictures/old-tags-390x844-2-home.jpg) | ![](pictures/old-tags-820x1180-2-home.jpg) | ![](pictures/old-tags-844x390-2-home.jpg) |
| Main today | ![](pictures/main-390x844-2-home.jpg) | ![](pictures/main-820x1180-2-home.jpg) | ![](pictures/main-844x390-2-home.jpg) |
| A. Painted plank | ![](pictures/a-painted-plank-390x844-2-home.jpg) | ![](pictures/a-painted-plank-820x1180-2-home.jpg) | ![](pictures/a-painted-plank-844x390-2-home.jpg) |
| B. Flag on a mast | ![](pictures/b-flag-on-mast-390x844-2-home.jpg) | ![](pictures/b-flag-on-mast-820x1180-2-home.jpg) | ![](pictures/b-flag-on-mast-844x390-2-home.jpg) |
| C. Standing sign | ![](pictures/c-standing-sign-390x844-2-home.jpg) | ![](pictures/c-standing-sign-820x1180-2-home.jpg) | ![](pictures/c-standing-sign-844x390-2-home.jpg) |

### Close up on Ember's wood dock

| | 390×844 | 820×1180 | 844×390 |
|---|---|---|---|
| Old tags | ![](pictures/old-tags-390x844-3-close.jpg) | ![](pictures/old-tags-820x1180-3-close.jpg) | ![](pictures/old-tags-844x390-3-close.jpg) |
| Main today | ![](pictures/main-390x844-3-close.jpg) | ![](pictures/main-820x1180-3-close.jpg) | ![](pictures/main-844x390-3-close.jpg) |
| A. Painted plank | ![](pictures/a-painted-plank-390x844-3-close.jpg) | ![](pictures/a-painted-plank-820x1180-3-close.jpg) | ![](pictures/a-painted-plank-844x390-3-close.jpg) |
| B. Flag on a mast | ![](pictures/b-flag-on-mast-390x844-3-close.jpg) | ![](pictures/b-flag-on-mast-820x1180-3-close.jpg) | ![](pictures/b-flag-on-mast-844x390-3-close.jpg) |
| C. Standing sign | ![](pictures/c-standing-sign-390x844-3-close.jpg) | ![](pictures/c-standing-sign-820x1180-3-close.jpg) | ![](pictures/c-standing-sign-844x390-3-close.jpg) |

### Side by side, close up (820×1180, cropped from the pictures above, not enlarged): old tags, main today, A, B, C

![](pictures/compare-close-820x1180.png)

## The lite board (software GPU)

The lite board has no harbour shore: plain piers and boats, and no plank. Today a lite dock shows its trade only on the boat's sail: "2:1" or "3:1" in text, with the 2:1 sail banded in its good's colour. Option A carries over to lite: the prototype draws the same painted plank on each plain pier's root (on piers facing the camera, the sail covers the pier's end), so no dock is left without a mark. The sail keeps the owner's colour, as today. B and C were not drawn on lite; each would need the same small addition.

| | 390×844 | 820×1180 | 844×390 |
|---|---|---|---|
| Lite today, home view | ![](pictures/lite-main-390x844-2-home.jpg) | ![](pictures/lite-main-820x1180-2-home.jpg) | ![](pictures/lite-main-844x390-2-home.jpg) |
| Lite today, close up | ![](pictures/lite-main-390x844-3-close.jpg) | ![](pictures/lite-main-820x1180-3-close.jpg) | ![](pictures/lite-main-844x390-3-close.jpg) |
| Lite with A, home view | ![](pictures/lite-a-painted-plank-390x844-2-home.jpg) | ![](pictures/lite-a-painted-plank-820x1180-2-home.jpg) | ![](pictures/lite-a-painted-plank-844x390-2-home.jpg) |
| Lite with A, close up | ![](pictures/lite-a-painted-plank-390x844-3-close.jpg) | ![](pictures/lite-a-painted-plank-820x1180-3-close.jpg) | ![](pictures/lite-a-painted-plank-844x390-3-close.jpg) |

The zoomed-out lite pictures are in `pictures/` too (`lite-*-1-out.jpg`).

## Cost

The numbers come from `scripts/size-prove.mjs --base <main build>`, run on a build of each option alone. In each build the switch is fixed at build time, so the bundler drops the other options and today's text plank.

| | Where | `harbor-jelly` chunk (gzip) | `IslandCanvas` chunk (gzip) | Against the limits |
|---|---|---|---|---|
| A. Painted plank | Scene (`src/lib/scene/harbor-jelly.ts`), plus the pennant colour in `isle-renderer.ts` | **+670 B** (10,737 → 11,407) | +51 B | Under the 11.50 kB ceiling; over the 200 B growth allowance by 470 B |
| B. Flag on a mast | Scene, same files | +702 B (→ 11,439) | +55 B | Under the ceiling; 502 B over the allowance |
| C. Standing sign | Scene, same files | +720 B (→ 11,457) | +49 B | Under the ceiling; 520 B over the allowance |

- **None of them is an overlay.** Each is part of the scene, so each one scales with the camera, which is what Jarrod asked for.
- **Most of the bytes are shared:** the goods' symbols (the HUD's own SVG paths, drawn onto the plank's texture) and the pennant.
- **Whichever he picks, the build needs his OK** to raise the `harbor-jelly` growth allowance (allowances move only with the owner, DECISIONS 2026-10-25), or a slimmer symbol set.

## Recommendation

**A, the painted plank:** it keeps the plank players already know, it is the clearest close up and the quietest zoomed out, and it costs the least.

## How to reproduce

1. `git apply docs/design/dock-trade-marks/prototype.patch` on `main` at `2486e10`.
2. Run `node docs/design/dock-trade-marks/capture.mjs <repo> <outDir> <label> <a|b|c>`. Leave the option off for today's board. Point it at a checkout of `29675fbb` for the old tags. Add `LITE=1` for the lite board.

Nothing here is game code; the build starts only after Jarrod picks on the Decisions page.
