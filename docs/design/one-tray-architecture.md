# One Tray Table HUD Architecture

- date: 2026-11-18
- agent: builder-decide
- lane: hud (tier 3)
- commit: 6e95aeb0
- reference: complements [docs/design/one-tray/README.md](one-tray/README.md)
- targets: `src/components/game/Hud.tsx`, `src/components/game/BuildList.tsx`, `src/components/game/Hand.tsx`, `src/components/game/hand-motion.css`, `src/components/game/MyNumbers.tsx`, `src/components/game/TradeButton.tsx`, `src/styles.css`, `src/lib/viewport.ts`

## Overview

This note documents the implemented one-tray table HUD component tree at commit `6e95aeb0`.
Read [docs/design/one-tray/README.md](one-tray/README.md) for UX rules, visual tokens, and slice history.

## Component Structure

```
+-------------------------------------------------------+
| Top Line (Status, Desktop MyNumbers, Newest Event)    |
+-------------------------------------------------------+
| Hand Dock (5 Resource Columns: Timber..Ore)           |
+-------------------------------------------------------+
| Action Row (Main, Roll, Armed, or Pinned Footer)      |
+-------------------------------------------------------+
```

### 1. Top Line: Status, Numbers, and Events

- `Hud.tsx` renders turn instructions from `phaseCopy` (for example, `"Your turn"`, L46) and `waitingCopy` (L55-72).
- On another seat's main turn, `waitingCopy` reads `"Wait for <name> to build or trade"` (`Hud.tsx:70`).
- The newest event sits on the right and truncates with ellipsis (`Hud.tsx:482`).
- `MyNumbers` sets `shrink-0` and `max-w-[62%]` (`MyNumbers.tsx:53`), scrolling horizontally inside its box.
- In desktop `.tray-top`, CSS sets `flex-shrink: 1` on `.my-numbers` (`styles.css:548`) and `min-width: 9rem` on `.tray-event` (`styles.css:549`).
- Desktop puts `MyNumbers` in the top line (`Hud.tsx:476`).
- A sideways phone puts `MyNumbers` under the action row (`Hud.tsx:592`).
- An upright phone omits `MyNumbers` (`Hud.tsx:476, 592`).

### 2. Hand Dock

- `HandDock` renders five resource columns without card borders (`Hand.tsx:113-126`, `hand-motion.css:107`).
- Each column stacks the icon above the numeral and the name below (`hand-motion.css:13`).
- On short screens (`max-height: 480px`), CSS hides the resource name (`hand-motion.css:40-46`).
- A `1 px` `#e3eae7` divider sits halfway between adjacent columns (`hand-motion.css:110`).
- Zero counts and labels use `#64736f` (`hand-motion.css:112`).

### 3. Action Row and Armed Modes

- Outside the sideways column, `.action-utilities` holds Build (`build-open`), `TradeButton`, optional `Fortune · N`, and `End turn` (`Hud.tsx:551-571`).
- Without a held fortune, CSS grid sizes those buttons into equal columns (`styles.css:270`), overriding `flex-1` on Build (`Hud.tsx:561`).
- With a fortune held, `action-utilities[data-fortunes]` switches to `flex-wrap: nowrap` (`styles.css:272`).
- Every button grows with `flex: 1 1 auto` (`styles.css:273, 539-540`), and button icons hide (`styles.css:275`).
- Tray action buttons stand `48 px` tall (`styles.css:277, 287, 543`).
- Arming a build without a picked spot shows `Cancel` alone (`build-cancel`, `Hud.tsx:547-550`).
- Picking a spot shows `Cancel` and `Place` (`place-cancel`, `place-chip`, `Hud.tsx:542-546`).
- Before a roll, `.hud-roll` puts any held `Fortune · N` beside `Roll` at a 1:2 width ratio (`Hud.tsx:574-584`, `styles.css:542-544`).
- When any build is ready, Build shows the `.build-ready-mark` corner check badge (`Hud.tsx:111-115, 565`, `styles.css:259`).
- A newly ready build pulses Build once: `320 ms`, scale `1.04`, `2 px` `#46c27f` inset ring (`styles.css:88-91`).
- Builds with no legal spot or none left never trigger the pulse (`Hud.tsx:250-265`).
- Reduced motion disables the pulse animation and transform (`styles.css:417-420`).

### 4. Build List Sheet

- Tapping Build opens `BuildList` in a modal dialog sheet (`Hud.tsx:630-634`, `BuildList.tsx:46`).
- Ready rows display cost chips and a `Place` or `Buy · N left` pill (`BuildList.tsx:80-98`).
- Unready rows omit cost chips and show the reason text instead (`BuildList.tsx:78-79`).
- Unready rows use `aria-disabled` to stay focusable (`BuildList.tsx:64`).
- Tapping an unready row calls `refuseQuietly(reason)`, playing the error cue and announcing the reason (`BuildList.tsx:68-70`).
- `BuildList` loads as a lazy chunk under a `1,600 B` gzip ceiling (`scripts/size-prove.mjs:112`).

## Responsive Layouts

`viewport.ts` defines `phone` as a coarse pointer or width under `768 px` (`viewport.ts:8`).
It defines `portrait` as `innerHeight > innerWidth` (`viewport.ts:9`).

### Desktop (Fine Pointer, 768 px and Wider)

- `.hud-tray` uses a two-column CSS grid (`styles.css:291-296`).
- The top line spans both columns, and the hand sits beside the action or roll row (`styles.css:294-296`).

### Upright Phone (`phone && portrait`)

- The tray spans the bottom width up to `720 px` (`Hud.tsx:436`) and stacks its rows vertically.

### Sideways Phone (`phone && !portrait`)

- The outer wrapper is a full-height `260 px` left column capped at `42vw` (`Hud.tsx:436`).
- The tray sits at the column's foot and grows only as tall as its rows (`Hud.tsx:436, 464-466`).
- The top line stacks status above the left-aligned newest event (`styles.css:284-285`).
- On an unarmed main turn, `End turn` moves to a pinned footer beside compact dice (`Hud.tsx:342, 359-367, 569, 593`).
- Before a roll, the roll row places dice and any held `Fortune · N` beside `Roll` (`Hud.tsx:574-584`).

## Verification

- `npm run tray-prove` checks `390x844`, `844x390`, `1280x720`, and `430x932` (`scripts/tray-prove.mjs:32-37`).
- It verifies main turn rows, `44 px` targets, `12 px` minimum text, and viewport bounds (`scripts/tray-prove.mjs:186-212`).
- It checks `BuildList` row states, blocked-row refusals, focus return, armed `Cancel`, held fortunes, `Roll`, and off-turn states (`scripts/tray-prove.mjs:246-377`).
- It checks measured insets against declared `playHole` insets within `4 px` (`scripts/tray-prove.mjs:213-226`).
- It also checks goods divider centring at `390x844`, `440x956`, `844x390`, and `1280x720` (`scripts/tray-prove.mjs:382-424`).
