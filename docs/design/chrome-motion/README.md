# Chrome motion: the three pulses and the gain token (#1299)

The #1274 audit found three keyframes that animate `box-shadow` (law 11 allows transform and opacity only) and a gain-duration token that says 2200 ms while the hand holds 2500 ms and fades over 500 ms.
This folder maps each pulse to its trigger, its consumers and its proof lines, and specifies the same pulse drawn with opacity. No trigger, duration, easing or reduced-motion rule changes. No `src/` file changed here.

Author: Fable (Claude Fable 5.1), 2026-11-07, on `main` at `a482f380`.

## The three pulses today

| Pulse | Keyframes | What animates | Trigger (unchanged) | Consumers | Proof lines that read it |
|---|---|---|---|---|---|
| Build ready | `build-ready`, `styles.css:88-91`, 320 ms `--ease-snap` | `transform` 1.04 at 50 % and an inset 2 px `#46c27f` `box-shadow` at 50 % | `Hud.tsx:219-239`: a build newly payable after a roll or trade gets the class; `animationend` clears it, or a 400 ms timer under reduced motion | Build tiles `Hud.tsx:496`; the award badge `SeatRail.tsx:61` | `build-ready-prove.mjs:261-290` (class present, `animationName` is `build-ready`, or `none` under reduced motion); `longest-army-prove.mjs:257-261` (badge `animationName`) |
| My numbers | `my-number-glow`, `styles.css:328-335`, 1200 ms ease-out | `transform` 1.12 at 25 % and a `box-shadow` halo 0 to 4 px to 0 | `MyNumbers.tsx:43-50`: a roll of one of the seat's numbers lights the chip for `MY_NUMBER_GLOW_MS` (1200), remounted by key | The lit chip `MyNumbers.tsx:61` | `my-numbers-prove.mjs:128-133` (`data-lit` on one chip, gone after 1.2 s); no animation name is asserted |
| Fortunes cue | `fortune-cue-glow`, `styles.css:338-345`, 1600 ms ease-out, once | a `box-shadow` halo 0 to 6 px to 0 on a ring span over the button | `Hud.tsx:194-199, 277`: keyed on `turn|current`, so it runs once at the start of a turn with a playable fortune; `data-done` stops a replay on remount | The ring span inside the Fortunes button | `fortune-cue-prove.mjs:76-95` (name `fortune-cue-glow`, one iteration, one animation, same start time after a state change; reduced motion: `none`, zero animations, a still `box-shadow`) |

One more colour animation: the seat card carries `transition-colors duration-200` (`SeatRail.tsx:143`) for the on-turn brightening. Since #1275 both colours are white (`--table` and `--paper`), so it animates nothing.

Reduced motion today: the global rule (`styles.css:283-286`) stops every animation and transition; `.my-number-lit` and `.fortune-cue-glow` repeat that, and the cue draws a still 2 px accent outline instead.

## The same pulses with opacity

The rule: the pulsing element keeps its scale; the ring becomes a layer over it (`::after`, or the ring span that already exists) with a fixed `box-shadow` whose `opacity` runs the same curve. Nothing else changes. [after.css](after.css) is the proposed `styles.css` change, line for line.

| Pulse | Element keeps | New layer | Opacity curve | Names the proofs read |
|---|---|---|---|---|
| Build ready | `build-ready`: scale 1.04 at 50 %, 320 ms | `.build-ready::after`, inset 0, inherited corners, `inset 0 0 0 2px #46c27f` | `build-ready-ring`: 0, 1 at 50 %, 0 | `build-ready` stays on the tile, so `animationName`, `animationend` and the class checks hold |
| My numbers | `my-number-glow`: scale 1.12 at 25 %, 1200 ms | `.my-number-lit::after`, `0 0 0 4px rgb(36 109 114 / .35)` | `my-number-ring`: 0, 1 at 25 %, 0 | none asserted today |
| Fortunes cue | the ring span, 1600 ms, once, `data-done` | the same span, now with a fixed `0 0 0 6px rgb(36 109 114 / .35)` and `opacity: 0` at rest | `fortune-cue-glow`: 0, 1 at 40 %, 0 | `fortune-cue-glow`, one iteration, one animation: all hold. The reduced-motion still outline stays and sets `opacity: 1`. |
| Seat card | | | | `transition-property: none` on `.seat-card`; no proof reads the 200 ms |

The build tile is already `position: relative`; the award badge and the number chip get `position: relative` so the layer fits them. The layers take no pointer events and have no text, so nothing changes for a screen reader.

What the owner sees: the same green ring on a ready tile, the same teal halo on the lit number and on the Fortunes button, at the same moments. The pictures below freeze each pulse at its peak, before and after.

## The gain token

| Where | Value | Who reads it |
|---|---|---|
| `src/styles.css:200` | `--duration-gain: 2200ms` | nobody in `src/` (the only other mention is `docs/design/visual-direction.md:166`) |
| `src/components/game/Hand.tsx:23-25` | `FLASH_MS = 2500`, `FADE_MS = 500`, `CUE_MS = 3000` | the cue's JS timer |
| `src/components/game/hand-motion.css:63-67` | `goods-cue 3000ms`: opacity 1 from 4 % to 83.3334 % (2500 ms), then to 0 (500 ms) | the fill, the loss ring and the tab |
| `scripts/hand-cards-prove.mjs:623`, `scripts/trade-tabs-prove.mjs:348` | assert name `goods-cue` and duration `3s` | |

Reconcile: set `--duration-gain: 2500ms` and add `--duration-gain-fade: 500ms` beside it, with a comment that `Hand.tsx` holds the same two numbers. `hand-motion.css` then runs `goods-cue` for `calc(var(--duration-gain) + var(--duration-gain-fade))`, which computes to the same 3000 ms, so the two proof lines hold without change. The keyframe percentages stay, with a comment naming the 2500 / 500 split. No timing changes. Calm/Brisk speeds stay with #539 and #1064.

## Lifecycle

The triggers are untouched, so these cases behave as today. Listed so the build issue can check them.

| Case | Build ready | My numbers | Fortunes cue |
|---|---|---|---|
| Navigation away and back (title, then a new table) | `wasReady` starts at the mounted key: no pulse on mount | `seen` starts at the mounted roll count: no glow on mount | `glowed` is empty on mount: the cue runs once if a fortune is playable, as today |
| Rejoin after a drop | same: no pulse on mount | same: no glow | runs once on the rejoined turn, as today |
| Rematch | the hand goes from the old hand to empty: nothing is newly ready | no roll yet: nothing lights | no fortunes yet: no ring |
| Reduced motion | class on, no animation, timer clears at 400 ms; the layer stays at opacity 0 | chip lit, no animation; the layer stays at opacity 0 | no animation; a still 2 px outline at opacity 1 |

## Pictures

Real game, Chromium 153 through Playwright, device scale 2. One state change starts all three pulses: Jarrod gets wood and brick (Path becomes ready), the dice roll one of his numbers (its chip lights), and he holds a wayfarer at the start of his turn (the Fortunes button gets its cue). The capture pauses each animation at its peak: build ready at 160 ms, my numbers at 300 ms, the cue at 640 ms. "After" is the same page with [after.css](after.css) on top.

| Size | Normal motion | Reduced motion |
|---|---|---|
| 390x844 | [before](pictures/390x844-normal-before.jpg) · [after](pictures/390x844-normal-after.jpg) | [before](pictures/390x844-reduced-before.jpg) · [after](pictures/390x844-reduced-after.jpg) |
| 844x390 | [before](pictures/844x390-normal-before.jpg) · [after](pictures/844x390-normal-after.jpg) | [before](pictures/844x390-reduced-before.jpg) · [after](pictures/844x390-reduced-after.jpg) |
| 1280x720 | [before](pictures/1280x720-normal-before.jpg) · [after](pictures/1280x720-normal-after.jpg) | [before](pictures/1280x720-reduced-before.jpg) · [after](pictures/1280x720-reduced-after.jpg) |

[pictures/measurements.json](pictures/measurements.json) records, per picture, which animations were running and at what time, and the computed `box-shadow`, `opacity`, `transform` and `animation-name` of the Path tile and its layer, the lit chip and its layer, and the cue ring. Under reduced motion every run reports no animations and the still cue outline. Zero page errors.

## For the build issue

Size XS, `lane:hud`. Files: `src/styles.css` (the three keyframe blocks, the two tokens), `src/components/game/hand-motion.css` (the duration expression), `src/components/game/SeatRail.tsx` (drop `transition-colors duration-200`).

Completion test:

1. `build-ready-prove`, `longest-army-prove`, `my-numbers-prove`, `fortune-cue-prove`, `hand-cards-prove` and `trade-tabs-prove` pass unchanged. No assertion is replaced: every name and duration they read is kept.
2. A new check in `build-ready-prove` and `fortune-cue-prove`: at the peak frame the pulsing element's own `box-shadow` equals its resting value, and the layer's `opacity` is 1. Under reduced motion the layer's `opacity` is 0 (build, numbers) or 1 with the still outline (cue).
3. `grep -n "box-shadow" src/styles.css` inside `@keyframes` returns nothing.
4. `--duration-gain` reads 2500ms, `--duration-gain-fade` 500ms, and `goods-cue` still computes to 3 s.

## Reproduce

Run from the repo root, one browser at a time: `node docs/design/chrome-motion/capture.mjs`.
