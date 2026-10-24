# Turn moment placement after a refit (#1096)

On main `10dbecd`, the unchanged 390×844 turn/gain proof fails its original
`"Your turn" never covers a hand tab ["+2"]` assertion. A read-only browser
observer records the placement callback, its actual geometry reads, parent
inline style changes, and the proof's own frame arrays. It does not change the
app, proof predicate, sample visibility, hold or deadline.

Run from an installed checkout:

```sh
ONLY=390x844 STAGE_EVIDENCE=/tmp/stage-observer.json \
  node --import ./docs/research/turn-hand-clearance/observer.mjs scripts/turn-gain-prove.mjs
```

`observer.log` is the original failure; `observer.json` is the complete trace.
Times are page `performance.now()` milliseconds, not paint timestamps:

| Event | Time | Geometry |
| --- | ---: | --- |
| Parent inline hole update | 44909.3 | top500, bottom56, left/right12 |
| Original bad frame2200 | 44924 | moment y610.5–677.5, centre/shift0; grain tab y644.83–666.83 |
| Resize callback starts | 44924.1 | reads area y500–788, HUD y620–810, moment y610.5–677.5 |
| Callback returns | 44924.8 | DOM still centre/shift0 |
| Callback microtask | 44924.9 | DOM still centre/shift0 |
| Next frame2201 | 44936.9 | moment top545, shift−65.5, moved |

The obstacle was present and the callback read it correctly. Existing placement
math chooses top545, leaving its original 8px gap above the HUD. The sampled
frame precedes resize delivery; React state also defers the callback's DOM
application. This establishes stale sampled DOM placement, not a CPU cause or
actual painted overlap. Instrumentation adds call overhead; this is an observed
main reproduction, not proof of the exact callback ordering in the earlier CI
run. The separate controlled case tests the source defect directly. A size-only
observer additionally misses position-only
hole changes altogether.

The fix leaves `HARD`, `SOFT`, `GAP`, `bands` and `fit` unchanged. The hook owns
translate and its two diagnostic attributes synchronously. It observes shell
inline style changes in a mutation microtask as well as area resizes, so refits
are measured before the next RAF reader. Both observers disconnect on cleanup.
The one consumer relinquishes React ownership of those three properties; cue
visibility, content, animation, expiry and reduced-motion behavior are unchanged.
No new RAF loop, timer or ReactDOM import enters the application.

## Controlled regression

The registered `npm run stage-prove` mounts the real hook in React with the
recorded hole/HUD/gain geometry. It checks the first frame of both same-size
position changes and size-changing refits, a dependency rerender while moved,
and restoration to centre. The original source uses its original tuple consumer
binding through a small fixture adapter; all cases/assertions run for both APIs.
No placement algorithm is copied into the fixture.

`stage-old.log`: original hook fails no-cover on both first and following
position-only frames (centre/shift0), and fails immediate centre restoration.
`stage-fixed.log`: same cases pass, retaining visible text and the existing 8px
gap. The negative control initially ran against untouched main source in the
fresh verification clone, before copying the implementation; it exited1 on the
geometry assertions, with zero browser errors. The fixed run exited0.

Full unchanged turn/gain and final static/build/size results are recorded alongside
this note when validation completes. Local runtime is Node24.19, Playwright's
installed Chromium with SwiftShader for the full game proof; CI uses its own
configured Node version. These local runs do not claim CI acceptance.

## Viewed captures

The unchanged full-game proof produced the committed [390×844](turn-gain-390x844-turn.png),
[844×390](turn-gain-844x390-turn.png) and [1280×720](turn-gain-1280x720-turn.png)
turn captures. All three were viewed; cue and controls remain legible and clear.
These are ordinary turn captures, not screenshots of the forced refit interval.
The first-frame refit assertions and raw geometry are the regression evidence.
`screenshots.json` records original byte sizes and SHA-256 hashes.
