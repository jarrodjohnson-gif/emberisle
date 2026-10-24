# Turn-gain execution context for PR #1037

The desk requested this comparison after two failures of the same phone no-cover assertion on head `2d60399`.
This report compares executed steps, elapsed times and the runner metadata actually available.
It does not infer CPU or RAM utilization from those timestamps.

## Measured CI context

[Complete selected job/step data](ci-context.json) and [runner/turn-result extracts](runner-and-turn.json) retain the source job links.
All times below are elapsed from the job's recorded start, including setup.

| Run / head | Leg | Proofs before turn-gain | Turn-gain starts | Turn-gain duration | Result |
|---|---|---:|---:|---:|---|
| Main 40074795842 / c0d15d0 | presentation | 7 | 6:15 | 4:04 | pass |
| PR 40075407881 attempt 1 / 2d60399 | presentation | 3 | 2:35 | 3:55 | fail: 390×844 +1 |
| Same PR, desk's one rerun | presentation | 3 | 2:00 | 3:57 | fail: 390×844 +1 |

Passing main's prefix was:

1. visual-direction
2. jelly-ocean
3. waves
4. splash
5. polish-tokens
6. roll-moment
7. goods-log

Both failed prefixes were restore → upgrade → flash.
The failing proof itself was not slower than the passing main execution.
The data therefore does not establish a general slowdown or a hardware-load cause.
Earlier partition head `e970db4` also passed on its different base; its job is included for context, not treated as a controlled comparison.

The four runner extracts (main, both failed jobs and the candidate leg) use `ubuntu-latest`, agent 2.338.0 and image `ubuntu-24.04` version 20261012.334.1.
Provisioner versions differ among runs, including both outcomes.
The logs expose no CPU/RAM utilization trace or process-pressure measurement.
Runner names identify separate hosted instances, not equivalent instantaneous load.

## Assignment change

Only turn-gain moves from presentation to the existing presentation-3 leg.
That leg's prefix becomes hand-offer → chunk-fail → idle → rotate → banner-stable → roll-moment → goods-log.
Its immediate predecessors are now the same pair as passing main: roll-moment and goods-log.
It runs before board-look and dock-piles, retaining every command's physical workflow order.
This groups the turn/roll/gain proofs together and tests a context hypothesis; it does not prove why the old context failed.

The previous green presentation-3 job took 7:34.
Its insertion point was 5:41 after job start, closer to passing main's 6:15 than the failing 2:00–2:35.
Adding main's observed 4:04 gives an additive estimate of 11:38 for that leg.
That estimate is not a new CI measurement or a performance acceptance claim.
Parent #1034's timing and consecutive-green acceptance remain open.

Current main `9c29e87` was merged normally before local verification.
Its separately reviewed #1086 diagnostics are inherited unchanged; this PR edits no proof.
The older CI comparison predates that metadata addition, so a later result cannot isolate assignment from all intervening main changes.
Every original no-cover predicate and assertion remains active.
All runners, timeouts, required names, setup steps and aggregate gates remain unchanged.

## Local validation

The initial fresh-clone attempt stopped at a screenshot write with ENOENT while workspace availability was zero bytes.
That result is retained separately below; it was not an assertion change or a CI rerun.
Completed checkouts' generated dependency folders were reclaimed, preserving their source, logs and captures.
The complete target sequence was then restarted unchanged on the same implementation commit.
The [initial screenshot error](chunk-fail-prove-disk-full.log), [initial prefix](hand-offer-prove-disk-full.log) and [initial exits](disk-full-results.json) are preserved.
No failing assertion was removed or changed.

The final complete target leg passes in the exact [workflow command order](local-command-order.json):

| Order | Original proof | Process duration | Exit |
|---|---|---:|---:|
| 1 | [hand-offer-prove](local-hand-offer-prove.log) | 14.15 s | 0 |
| 2 | [chunk-fail-prove](local-chunk-fail-prove.log) | 43.05 s | 0 |
| 3 | [idle-prove](local-idle-prove.log) | 22.12 s | 0 |
| 4 | [rotate-prove](local-rotate-prove.log) | 101.01 s | 0 |
| 5 | [banner-stable-prove](local-banner-stable-prove.log) | 33.81 s | 0 |
| 6 | [roll-moment-prove](local-roll-moment-prove.log) | 98.25 s | 0 |
| 7 | [goods-log-prove](local-goods-log-prove.log) | 12.18 s | 0 |
| 8 | [turn-gain-prove](local-turn-gain-prove.log) | 249.35 s | 0 |
| 9 | [board-look-prove](local-board-look-prove.log) | 95.52 s | 0 |
| 10 | [dock-piles-prove](local-dock-piles-prove.log) | 45.22 s | 0 |

The sum of these local proof-process durations is 714.66 s.
It excludes CI setup and is not a measurement of GitHub runner performance.
[Local environment](local-environment.json) records v24.19.0, Playwright 1.63.0 and the browser cache.
CI is configured for Node 22; this local runtime difference remains a verification limit.
The full turn-gain proof passes all four viewports, reduced motion, hotseat and reconnect with zero console errors.
It emits no overlap diagnostic in this run.

[Final exits](local-results.json), [registration](local-registered.log), [loosen](local-loosen.log) and [size](local-size-prove.log) pass.
Typecheck and production build also pass.
The [complete workflow audit](local-audit.log) retains all 97 npm-run steps in physical order.
All 57 browser-b proofs run exactly once across the same eight legs.
All ten negative controls are caught, including restoring turn-gain's old assignment.
Only suite assignments are normalized when comparing the remaining workflow semantics against main.
Runners, setup, guards, artifacts, timeouts, dependencies, other jobs and aggregate gates match main.
The approved owner-decision row is preserved; every main decision remains intact.

After this push, new-head CI must confirm the hypothesis on its own runners.
The desk's one rerun of the old head is spent. No builder CI rerun was requested.
No proof, runtime, package script, assertion or size budget changes are part of this PR.

