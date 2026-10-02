# Number tokens that stay readable and uncovered (issue #134)

Sources: [docs/research/visual-polish.md](../research/visual-polish.md) §6; `numberToken`, `decorate`,
`buildLand`, `tick` (the sheep wander), `makePine`, `makeDeciduous`, and `makeSheep` in
`src/lib/scene/isle-renderer.ts`; `PAINT` (the cap colours); the #128 decision (overhead camera by default
in play, the tilted camera behind a toggle); [docs/design/mobile-camera-touch.md](mobile-camera-touch.md)
(the overhead fit this is sized against); `docs/design/wayfarer.md` (#132: the wayfarer stands on the token's
face, at `topOf + 0.07`).

## What is wrong today

`numberToken(n)` is a cream cylinder (`#f4ead6`, r 0.3, h 0.05) with a 256 px canvas label on a
`CircleGeometry(0.28)`: a 118 px Georgia digit (dark `#1c1916`, or `#c0392b` for 6 and 8) and pips as 5.5 px
dots at a 16 px pitch. On the board the dots are 0.012 world units, under 1 px at any camera. The disc is cream
on every side, so on grain (`#e0b13a`, 1.67:1) and the wastes (1.96:1) it has no edge, and the 6 and 8 differ
from the rest only by hue.

`decorate(...)` places props by `place(minR, maxR)`, a random radius from the hex centre:

| Prop | `place` today | Reach of one prop | Nearest the token's centre a prop can come |
|---|---|---|---|
| Trees (16–20) | `0.4, 0.88` | pine `0.22 × s`, s up to 1.3 → 0.29; deciduous blobs at `0.1 × s` + `0.13 × s × 1.05` → 0.30 | 0.10, which is inside the token |
| Sheep (4–5) | `0.36, 0.7` | body `0.085 × 1.35` = 0.115 | 0.25, inside the token |
| Rocks (5) | `0.4, 0.78` | `0.12 + rng() × 0.12` → 0.24 | 0.16, inside the token |

And the sheep do not stay where they were placed: `tick` picks a wander target at `ox + cos(a) × r` with
`r = 0.22 + random × 0.32`, and `ox, oz` is the **hex centre**, so a sheep's target can be 0.22 from the
token's centre, on the token. That is why the research's `09-zoom` shows trees over the 8 and the 2 and a
sheep on the 4.

## Scale this is sized against

Tokens are judged at the overhead camera, the v1 default in play (#128). With the desktop insets in
`docs/design/mobile-camera-touch.md` the island's 11.2 world units of height fill the 480 px hole at
1280×720: **43 px per world unit**, 75 at 1920×1080. The tilted camera today is about 94 px per unit at the
island's centre, 130 at the `09-zoom` distance. A hex is 83 px wide at 43 px per unit, so a token can be
about a third of that. "Readable" is a bold numeral at least 11 px tall (about 8 pt) and a pip at least 2 px
across at 43 px per unit; at 1920×1080 the same token is 20 px and 3.5 px, and the overhead camera's own zoom
(`camera.zoom` 1.0–2.4, `docs/design/mobile-camera-touch.md`) is there for a closer look.

## The token

| | Today | Now |
|---|---|---|
| Disc | `CylinderGeometry(0.3, 0.3, 0.05, 32)`, cream `#f4ead6` | `CylinderGeometry(0.34, 0.34, 0.06, 32)`, **rim colour** (below), roughness 0.6 |
| Disc position | `topOf + 0.04` | `topOf + 0.04` (face at `topOf + 0.07`, unchanged, which #132 relies on) |
| Label | `CircleGeometry(0.28, 32)` at +0.03, `MeshBasicMaterial`, 256 px canvas | `CircleGeometry(0.29, 32)` at +0.031, the same unlit material, 256 px canvas, `anisotropy = 8` |
| Face | cream `#f4ead6` | cream `#f4ead6` |
| Rim colour (the cylinder) | cream | `#1c1916` for 2–5 and 9–12; `#b3261e` for 6 and 8 |

The disc's radius 0.34 against the label's 0.29 leaves a 0.05 ring of the cylinder's top showing around the
face: 2 px at 1280×720 overhead, 3.7 px at 1920. From the tilted camera the whole cylinder side shows in the
rim colour, a dark or red puck with a cream face. 29 px across at 1280×720 overhead, 51 at 1920, 88 at
`09-zoom`.

Why a dark rim: the cream face is the contrast on the dark caps (5.35:1 on timber, 4.18 on clay, 3.89 on ore)
and the dark rim is the contrast on the light ones (`#1c1916` is 8.77:1 on grain, 8.14 on wool, 7.48 on the
wastes). The better of the two is at least 3.89:1 on every terrain. (WCAG 2 ratios from the hex values in
`PAINT`; the same rule as `docs/design/pieces.md`.) Nothing changes for the wayfarer: he stands on the face,
and `#2b2420` on `#f4ead6` is 12.8:1.

### The face

Canvas 256 × 256, the same `fillStyle`/`arc` disc of radius 124 as today. Then:

| Mark | Today | Now | On the board | At 1280 overhead |
|---|---|---|---|---|
| Digit | `bold 118px Georgia, serif`, baseline middle at y 108 (glyph about 83 px) | `bold 170px Georgia, serif`, `textBaseline = "middle"`, at (128, 96); the glyph is about 119 px tall, 0.27 on the board | 0.27 tall | 12 px (20 at 1920, 35 at zoom) |
| 6 and 8 | fill `#c0392b` | fill `#b3261e`, then `strokeText` with `lineWidth 10`, `strokeStyle #b3261e`, `lineJoin "round"`: the digit is visibly heavier than the others, not only redder | | |
| Pips | r 5.5, pitch 16, at y 188 | **r 10, pitch 26, at y 196**, fill `#1c1916` (or `#b3261e` for 6 and 8) | 0.045 each | 2 px (3.4 at 1920, 5.9 at zoom) |

The label is 0.58 across for 256 canvas px, so one canvas px is 0.00227 world units. The glyph of a 170 px
Georgia bold numeral is about 0.7 em, 119 px, so it sits in y 37–155; "12" is about 187 px wide, and the
disc's chord at y 96 is 239 px. Five pips span 104 + 20 = 124 px centred at y 196, where the chord is 207 px,
so the row fits with 41 px to spare on each side and starts 31 px below the glyph.

The 6 and the 8 therefore differ from the rest three ways: a red rim instead of a dark one, a red stroked
digit that is about 10 px heavier on the canvas, and five pips. On a clay cap (`#b5522a`) the red rim is only
1.31:1 against the ground, but on clay the cream face carries the token (4.18:1), and the red digit on the
cream face is 6.1:1 everywhere.

### Angle

Tokens lie flat. No tilt and no billboard. Overhead, which is the v1 default, a flat face is read straight
on. In the tilted camera (polar 0.7–1.02 rad from the vertical) a flat disc foreshortens to 0.52–0.76 of its
height, so the 150 px digit is still 22 px at the far pole at the default distance, and `anisotropy = 8` keeps
the canvas sharp at that angle. A billboard would turn the token into a card standing on the hex, which from
overhead is an edge, and would leave the wayfarer (#132) nothing to stand on.

## Clear space

**Nothing is placed, and nothing wanders, within 0.39 of a hex centre**: the token's 0.34 plus 0.05 of ground.
Measured at a prop's nearest point, not its position, so each kind's minimum radius is the clear radius plus
that kind's reach:

| Prop | `place(minR, maxR)` now | Reach | Nearest point to the centre |
|---|---|---|---|
| Trees | `0.70, 0.86` | 0.30 | 0.40 |
| Sheep | `0.54, 0.74` | 0.115 | 0.425 |
| Rocks | `0.64, 0.80` | 0.24 | 0.40 |

Tree counts, sheep counts, sizes, and the rng stream (`mulberry32(hashStr(h.id + h.terrain))`) are
unchanged: the same calls in the same order, only the two radii differ, so a given deal looks like the same
forest pulled back into a ring around a clearing. The outer radii come in from 0.88, 0.70, and 0.78: a prop's
far edge is then 1.16 at most, 0.19 past the cap's inradius (0.97), where today it is 1.18.

The sheep wander moves to the same ring. In `tick`:

```ts
const r = 0.54 + Math.random() * 0.2;
```

replaces `0.22 + Math.random() * 0.32`. `ox, oz` stay the hex centre, so a sheep's target is always 0.54–0.74
from it and the sheep's body never comes nearer than 0.425. The exponential approach in `tick` never
overshoots the target, so the position obeys the same bound.

Each prop gets `userData = { prop: "tree" | "sheep" | "rock", hex: h.id, reach }` with its own reach (for a
tree, `0.30 × s / 1.0` scaled by its `s`; for a rock, its dodecahedron radius; for a sheep, 0.115), so a proof
can check the rule against the built scene instead of the constants.

Boats, piers, and pieces are not in `decorate` and never sit inside a hex; the wayfarer stands on the token
by design (#132).

## Draw calls

Two meshes per token, as today (18 tokens). One canvas texture per token, as today. Props are unchanged in
number. `drawCallsPerFrame` from `ONLY=1920 node scripts/shots.mjs` (2358 on main today) does not change.

## What the screenshots must show

| Shot | Must show |
|---|---|
| `03-setup-1280x720` | All 18 numbers legible, each with its pip row countable, no tree, sheep, or rock over any token. Every timber hex is a ring of trees around a clear token. The 6 and the 8 (if dealt in frame) have a red rim and a heavier digit; the others a dark rim. |
| `09-zoom-1920x1080` | A dark puck and, if in frame, a red one, each with a cream face; pips as clear round dots; a sheep's wander never crosses a token (take the shot after the usual 1.5 s settle and compare with `03-setup`). |

Numeric checks a proof can make (`scripts/tokens-prove.mjs`, headless Chromium like `client-prove`, reading
`window.__isle` and `window.__emberisle`; the title's demo island is enough, `DEMO_SEED` is fixed, and the
practice board after "Play versus the isle" is the second sample):

1. **Clear space on placement.** For every child of `living` with `userData.prop`, with `hex` the
   `worldOfHex` of `userData.hex`: `hypot(position.x − hex.x, position.z − hex.z) − userData.reach ≥ 0.39`.
   On both boards. (The wayfarer and the boats have no `prop` and are skipped.)
2. **Clear space while wandering.** Sample every sheep's position every 100 ms for 10 s on the practice
   board; the same inequality holds at every sample.
3. **Token geometry.** For every token (the `land` children with `userData.token = n`, which `buildLand`
   sets), the cylinder's `geometry.parameters.radiusTop` is 0.34 and the label circle's radius is 0.29;
   `position.y − topOf(terrain)` is 0.04.
4. **Rim rule.** Tokens with `n` of 6 or 8 have a cylinder material colour equal to `#b3261e`; every other
   has `#1c1916`. (Compare `material.color.getHexString()`.)
5. **Contrast.** Arithmetic on the hex values: `max(contrast(#f4ead6, cap), contrast(#1c1916, cap)) ≥ 3.0`
   for each of the six `PAINT` caps (lowest today: ore, 3.89), `contrast(#b3261e, #f4ead6) ≥ 4.5`
   (6.1 today), `contrast(#1c1916, #f4ead6) ≥ 7` (16 today).
6. **Pips on the canvas.** In the browser, for a token with `n` = 5, read its label's
   `material.map.image` (the canvas) with `getImageData(0, 196, 256, 1)` and count the runs of dark pixels
   (luma under 128) along that row: exactly four, each 19–21 px long. This catches the pitch and the radius
   regressing.

`npm run client-prove` and `npm run tabs-prove` still pass.

## Files the implementation touches

- `src/lib/scene/isle-renderer.ts` — `numberToken` (disc, rim colour, label, canvas), `decorate` (the three
  `place` ranges and `userData` on each prop), `tick` (the sheep wander radius), `buildLand` (`userData.token`
  on each token)
- `scripts/tokens-prove.mjs` — new; `package.json` gets `"tokens-prove": "node scripts/tokens-prove.mjs"`

## Out of scope

- The wayfarer and the target rings (#132). This note keeps the token's face at `topOf + 0.07` for it.
- Pieces (#133). They stand on corners and never reach the token.
- Tree, sheep, and rock counts or meshes, and the draw-call budget (#135).
- The HUD's "which hexes paid" flash after a roll (the dice design, `docs/design/dice.md`).

## Implementation issue (draft)

```
Implement the rimmed number tokens and the clear ring around them

## Deliverable
For #134, per docs/design/tokens.md, in src/lib/scene/isle-renderer.ts:
- numberToken: r 0.34, h 0.06 disc in the rim colour (#1c1916, or #b3261e for 6 and 8), cream #f4ead6
  face on a r 0.29 label at +0.031, 170 px bold digit at (128, 96), stroked 10 px for 6 and 8, pips r 10
  at a 26 px pitch on y 196, anisotropy 8. The face stays at topOf + 0.07.
- decorate: trees place(0.70, 0.86), sheep place(0.54, 0.74), rocks place(0.64, 0.80); each prop tagged
  userData { prop, hex, reach }. Counts, sizes, and the rng order unchanged.
- tick: the sheep wander radius 0.54 + random × 0.2.
- buildLand: userData.token = n on each token group.
- scripts/tokens-prove.mjs (npm run tokens-prove) with the six checks in the design.
Do not start until #134 is on main. The design is the contract. Do not retune the wayfarer, the pieces,
the camera, or the prop counts.

## Completion test
ONLY=1280 node scripts/shots.mjs writes 03-setup-1280x720.png: all 18 numbers and their pips readable,
no prop over any token, every timber hex a ring of trees around a clear token, 6 and 8 with a red rim
and a heavier digit.
ONLY=1920 node scripts/shots.mjs writes 09-zoom-1920x1080.png: dark (and red) pucks with cream faces,
round countable pips, no sheep on a token; drawCallsPerFrame unchanged from main.
npm run tokens-prove → ok. npm run client-prove and npm run tabs-prove pass.

## Depends on
#134

## Parent
#134

## Source
docs/design/tokens.md

Size: S
```
