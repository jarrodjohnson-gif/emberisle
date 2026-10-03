# Research: the island's frame budget at a phone size (issue #310)

- gate worked: research
- date: 2026-10-03
- agent: Claude Code

## What I read

`src/lib/scene/isle-renderer.ts` (constructor 127-131 and 206-212, `setTitleMode`, `setView`, `resize` 360-382,
`tick` 441-500); `node_modules/three/examples/jsm/postprocessing/EffectComposer.js` and `SSAOPass.js` (three 0.186.1);
`scripts/shots.mjs`; `docs/research/mobile.md`; `npm run build` output.

## How it was measured

`node scripts/shots.mjs --budget --size 390x844 --coarse` (touch device, pointer: coarse, device pixel ratio 3) and
`node scripts/shots.mjs --budget --size 1920x1080` (desktop baseline), both in the `play` screen after "Play versus the isle".
Headless Chromium on **SwiftShader** (software GL on a shared CPU). For each pixel ratio 1, 2, 3 the script drives
`window.__isle` through: overhead (SSAO off, what a coarse pointer gets), free with SSAO off, and free with SSAO sized
`css` (as shipped), `half` (half of CSS px) and `canvas` (full canvas pixels). Each row is 1.5 s warm-up then a 6 s window
(15 s at pixel ratio 3) of `requestAnimationFrame` gaps and WebGL draw calls.

**Limits, stated plainly.** SwiftShader is a CPU rasteriser: it is fill-rate bound, so it exaggerates pixel cost and
hides what a phone GPU does well. These are not phone numbers; read them as ratios. The machine was shared with other
sessions, so a single row is noisy (the same configuration repeated at pixel ratio 1 moved by up to 2x, and rows at
pixel ratio 2 and 3 have only 1 to 10 frames). Only differences of 2x or more are trusted below. Real frame times
need a phone (`needs: jarrod`).

## What is true

Pasted from the two runs above (`ms/frame` is the mean gap; `p50` the median; `calls` is draw calls per frame).

### Phone viewport, 390x844, coarse pointer

| pixel ratio | view | SSAO target | canvas | frames | ms/frame | p50 | calls |
|---|---|---|---|---|---|---|---|
| 1 | overhead, SSAO off | - | 390x844 | 40 | 152 | 133 | 477 |
| 1 | free, SSAO off | - | 390x844 | 27 | 221 | 217 | 326 |
| 1 | free, SSAO css (shipped) | 390x844 | 390x844 | 6 | 1092 | 1233 | 655 |
| 1 | free, SSAO half | 195x422 | 390x844 | 16 | 402 | 350 | 655 |
| 1 | free, SSAO canvas | 390x844 | 390x844 | 6 | 989 | 1050 | 654 |
| 2 | overhead, SSAO off | - | 780x1688 | 19 | 334 | 350 | 477 |
| 2 | free, SSAO off | - | 780x1688 | 8 | 656 | 500 | 327 |
| 2 | free, SSAO css (shipped) | 390x844 | 780x1688 | 4 | 1583 | 1983 | 654 |
| 2 | free, SSAO half | 195x422 | 780x1688 | 1 | 1950 | 1950 | 656 |
| 2 | free, SSAO canvas | 780x1688 | 780x1688 | 3 | 1906 | 2633 | 655 |
| 3 | overhead, SSAO off | - | 1170x2532 | 21 | 715 | 700 | 477 |
| 3 | free, SSAO off | - | 1170x2532 | 8 | 1831 | 2050 | 327 |
| 3 | free, SSAO css (shipped) | 390x844 | 1170x2532 | 4 | 2462 | 3150 | 655 |
| 3 | free, SSAO half | 195x422 | 1170x2532 | 10 | 1537 | 1550 | 655 |
| 3 | free, SSAO canvas | 1170x2532 | 1170x2532 | 4 | 3029 | 5200 | 656 |

### Desktop baseline, 1920x1080

| pixel ratio | view | SSAO target | canvas | frames | ms/frame | p50 | calls |
|---|---|---|---|---|---|---|---|
| 1 | overhead, SSAO off | - | 1920x1080 | 26 | 217 | 167 | 484 |
| 1 | free, SSAO off | - | 1920x1080 | 14 | 433 | 417 | 473 |
| 1 | free, SSAO css (shipped) | 1920x1080 | 1920x1080 | 3 | 1967 | 2583 | 948 |
| 1 | free, SSAO half | 960x540 | 1920x1080 | 3 | 2489 | 2517 | 948 |
| 1 | free, SSAO canvas | 1920x1080 | 1920x1080 | 4 | 1675 | 2067 | 948 |
| 2 | overhead, SSAO off | - | 3840x2160 | 5 | 1483 | 1583 | 484 |
| 2 | free, SSAO off | - | 3840x2160 | 4 | 1379 | 1467 | 473 |
| 2 | free, SSAO css (shipped) | 1920x1080 | 3840x2160 | 3 | 2028 | 2083 | 948 |
| 2 | free, SSAO half | 960x540 | 3840x2160 | 2 | 3275 | 3333 | 948 |
| 2 | free, SSAO canvas | 3840x2160 | 3840x2160 | 2 | 2208 | 2350 | 948 |
| 3 | overhead, SSAO off | - | 5760x3240 | 12 | 1322 | 1217 | 484 |
| 3 | free, SSAO off | - | 5760x3240 | 4 | 3083 | 3850 | 473 |
| 3 | free, SSAO css (shipped) | 1920x1080 | 5760x3240 | 3 | 3933 | 3550 | 948 |
| 3 | free, SSAO half | 960x540 | 5760x3240 | 2 | 5308 | 5450 | 948 |
| 3 | free, SSAO canvas | 5760x3240 | 5760x3240 | 2 | 4917 | 5033 | 948 |

The desktop rows are too slow in software to say more than: the same shape, about 2x the pixels, about 2x the time.

### Findings

1. **Cost follows pixels, and pixel ratio is the biggest lever.** Free view with SSAO off at 390x844 goes 221 ms (ratio 1),
   656 ms (ratio 2), 1831 ms (ratio 3): about 3x then 8x for 4x and 9x the pixels. Today
   `setPixelRatio(min(devicePixelRatio, 2))` (isle-renderer.ts:128) so a phone that reports 3 already pays the ratio-2 cost,
   and ratio 2 is already about 3x ratio 1. This is the first child: cap it lower on coarse pointers (1.5 renders 2.25x the
   pixels of ratio 1, against 4x).
2. **SSAO already runs at CSS resolution, not canvas resolution.** `resize()` calls `composer.setSize(w, h)` (which sizes every
   pass to `w * pixelRatio`) and then `ssao.setSize(w, h)` with CSS pixels, which wins. The "ssaoTarget" column shows it:
   390x844 under a 780x1688 or 1170x2532 canvas. So "run SSAO at half resolution" means half of CSS (195x422), a quarter of the
   pixels of the shipped pass, not a quarter of the canvas. At ratio 1 (SSAO target equals canvas) half resolution cut the
   frame 1092 ms to 402 ms, about 2.7x. At ratio 2 and 3 the rows are within noise of each other (1, 4 and 10 frames),
   so the half-resolution gain there is not proven by this run. The `canvas` rows (SSAO at full canvas pixels, the
   un-shipped alternative) are not cheaper than shipped, which supports keeping it at CSS size.
3. **SSAO doubles draw calls and costs 2x to 5x the frame.** Free view draws 326 calls without SSAO and 655 with it
   (the `SSAOPass` re-renders the whole scene for normals, 345 vs 692 in the first run). At pixel ratio 1 on the phone
   it is 221 ms to 1092 ms (shipped) or 402 ms (half). Coarse pointers already get overhead with SSAO off, which is
   the right default; **nothing here argues for SSAO on a phone.**
4. **Overhead is cheaper than free even with more draw calls.** Overhead issues 477 calls against free's 326 (the whole island is in the
   frustum) yet runs 221 ms to 152 ms at ratio 1 and 656 ms to 334 ms at ratio 2. So the cost is fill, not call count, in software;
   on a real phone draw calls matter more, and #287's halving was the right lever there. Not separable on SwiftShader.
5. **Title-mode 30 fps gate.** It works as designed: in the phone run, calls per rAF gap dropped 326 to 161 and the median gap
   went 133 ms to 17 ms, meaning the gate skips every other rAF tick (`tick` returns before `composer.render()`). It can save
   nothing when a frame already takes over 33 ms, which is every row above except at ratio 1 overhead on a fast device. The
   value of the gate on a phone is a 60 Hz or 120 Hz device that could otherwise burn 60 or 120 renders a second behind a card;
   that needs real hardware to size. The desktop run shows no difference (24 vs 24 frames), because software rendering is slower
   than 30 fps there.
6. **The loop never idles, and cannot just stop.** `tick` renders every frame even when no state, camera or pointer changed. A plain
   dirty flag would freeze the scene: the water, foam, trees, sheep, boats and lantern all animate from `clock` time. Two
   frames 1 s apart differed in 21% of pixels on the phone viewport and 54% at 1920x1080 (`idle.changedPixelsPct`), all ambient.
   So the child is "render at a low rate (say 10 to 15 fps) when nothing moved, full rate while a camera drag, a walk, a mark pulse or a
   state change is in flight", not "stop rendering". A turn is mostly waiting, so most frames would be the cheap kind. The
   mark pulse (`emissiveIntensity` over `sin(t * 4)`) is only live while marks are highlighted; it must count as motion.
7. **Chunk cost.** `npm run build`: `IslandCanvas-Ch7qe_iu.js` 652.56 kB (167.34 kB gzip), `index-9VpFuaNT.js` 340.66 kB (105.36 kB
   gzip). The island imports `three` itself plus five addons: `OrbitControls`, `EffectComposer`, `RenderPass`, `SSAOPass`,
   `OutputPass` and `BufferGeometryUtils`. All of the 652 kB is three.js and its addons; I did not size the addons separately
   (a bundle visualiser run would). Dropping SSAO (never used on a phone) would remove only `SSAOPass` and its shaders,
   the one avoidable piece, and the core renderer would stay. Splitting the chunk further would not shrink what a phone
   downloads, since every file is needed to draw the island. **The right child is a size budget proof for `dist/assets`**,
   not a split.

## What I am not sure about

- Every ratio here is SwiftShader. A phone GPU is far less fill-bound and more draw-call and bandwidth bound, so the pixel ratio lever
  is probably smaller than 8x and the draw-call lever bigger. The order of the children is safe; the sizes of the wins are not.
- The pixel ratio 2 and 3 rows have 1 to 10 frames each. Re-run on a quiet machine, or on a phone, before quoting a number from them.
- Whether 1.5 is the right cap is a looks question (a 390 pt wide canvas at 1.5 is 585 px)
  that needs a phone to judge: `needs: jarrod`.

## Prove output

```
$ node scripts/shots.mjs --budget --size 390x844 --coarse   # and --budget --size 1920x1080
row {"size":"390x844","pr":1,"view":"free","ssao":"off", ... "msAvg":221,"calls":326.4}
(rows pasted in the tables above; full JSON in test-results/shots/budget-390x844.json)
$ npm run typecheck
> tsc --noEmit        (exit 0)
```

## Handoff

```
done: measured the matrix, wrote this note; scripts/shots.mjs gained --size, --coarse and --budget
left: nothing in this note. Children filed in Backlog: #329 cap pixel ratio 1.5 on coarse pointers; #330 SSAO at half
      CSS size; #331 idle render loop; #332 size budget proof for dist/assets; #333 Decide: real-phone re-measure (needs: jarrod)
broke: nothing; `node scripts/shots.mjs` (17 shots) and `node scripts/shots.mjs --size 390x844 --coarse` (8 shots) both exit 0
next agent: take #329 to #332 as Todo is set
```
