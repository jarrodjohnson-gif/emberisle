# Tray inset audit: historical CI evidence

Updated 2026-11-17 by Codex-p (GPT-6.1 Sol).
Original audit: builder-proofs, 2026-11-12; exact model unrecorded.
This note corrects evidence attribution. It changes no HUD, renderer, proof or budget.

## Which run supplied the measurements

The measurements below come from [CI run 43263174994](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/43263174994)
on PR #1547, feature head `e21054c7542a241b3b6aad2853f2573608832413`.
Both cited jobs report checkout `b6cb39c762895df7a0dc9b9c090b4fe1eed04fbc`, the tested merge with base `c0f71001ccb68984662af2f224c1ac9252ca4574`.
The original audit named `3475e541`; this note does not claim that tree supplied these results.
A source `console.log` is not a run. I read the decoded historical job logs for this revision.

[Browser-a a2, job 131340310056](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/43263174994/job/131340310056)
prints these exact `tray-prove` lines:

```text
390x844 main: bottom inset measured 228, declared 232
1280x720 main: bottom inset measured 164, declared 168
430x932 main: bottom inset measured 228, declared 232
```

| Viewport | Declared bottom, before safe-area addition | Historical measured bottom | Difference |
|---|---:|---:|---:|
|390x844 touch|232 px|228 px|4 px|
|430x932 touch|232 px|228 px|4 px|
|1280x720 desktop|168 px|164 px|4 px|
|844x390 touch|12 px|Not measured by this bottom-inset check|Not measured|

The landscape declaration also adds `safe.bottom`, as do the other declarations.
The historical [playHole source](https://github.com/jarrodjohnson-gif/emberisle/blob/e21054c7542a241b3b6aad2853f2573608832413/src/lib/scene/mobile-fit.ts#L99)
specifies that 12 px bottom, not zero.
The [landscape fixture](https://github.com/jarrodjohnson-gif/emberisle/blob/e21054c7542a241b3b6aad2853f2573608832413/scripts/tray-prove.mjs#L32)
has no `inset` flag, so the [bottom measurement block](https://github.com/jarrodjohnson-gif/emberisle/blob/e21054c7542a241b3b6aad2853f2573608832413/scripts/tray-prove.mjs#L211) does not run there.
Do not infer a landscape measured value or margin from its column-layout assertions.
The feature and tested-merge versions of `tray-prove.mjs` have the same blob hash, `91a561723c07fabd0c882380c914a08fd18c343f`.

## What the historical proofs establish

Job 131340310056 logs `hud-safe-area-prove: ok` and `tray-prove: ok`.
The tray check compares measured and declared bottom insets within 4 px at the three sizes above.
The historical [source comment](https://github.com/jarrodjohnson-gif/emberisle/blob/e21054c7542a241b3b6aad2853f2573608832413/src/lib/scene/mobile-fit.ts#L88)
attributes that declared 4 px to sub-pixel font differences. It does not prove shadow clearance.

[Browser-b job 131340874861](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/43263174994/job/131340874861)
logs `reflow-prove: ok` and `upright-table-prove: ok`.
The historical [reflow source](https://github.com/jarrodjohnson-gif/emberisle/blob/e21054c7542a241b3b6aad2853f2573608832413/scripts/reflow-prove.mjs#L1)
checks title wordmark/Join reachability and horizontal overflow in its stated fixtures.
Its 120 px uncovered, pointer-reachable island assertion uses hotseat main with every fortune kind held.
Those fixtures are 640x360, 320x568, 1280x720, 844x390 and 390x844.
The log records that assertion at all five sizes. This is scoped evidence, not universal WCAG certification.

The historical [upright-table source](https://github.com/jarrodjohnson-gif/emberisle/blob/e21054c7542a241b3b6aad2853f2573608832413/scripts/upright-table-prove.mjs#L1)
covers its crafted main-turn camera, gutters, names, tray and text checks at its listed phone fixtures.
It allows a side dock's boat beyond the side edges while constraining its stated top/bottom and inspect targets.
It does not prove zero clipping or pick obstruction across all supported screens.
Neither proof supplies the withdrawn blanket camera-frustum or shadow-clearance claim.

## This revision's checks and limits

I verified the two historical job logs, checkout identity, cited source and link targets.
I checked diff whitespace. I ran no new browser proof or physical-device test for this documentation edit.
This PR's earlier docs-only CI did not supply the historical measurements above.
Current-head CI and any later runtime acceptance remain separate from that historical evidence.
