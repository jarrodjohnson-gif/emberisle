# Diagnostic Analysis of Run 14 in your-turn-stay-prove (#1575)

## Overview

This note documents observations from the run 14 failure of `your-turn-stay-prove`.
The failure occurred during loaded execution on issue #1525.
The root cause of run 14 remains unknown.
Issue #1575 tracks finding the actual cause.

## Observed Failure Symptoms

Run 14 produced three distinct timeout symptoms during 2-CPU synthetic load execution:
1. Seat p0 timed out at 1000 ms waiting for the turn-moment element to unmount.
2. Seat p1 timed out at 30,000 ms waiting for state sequence 20 arrival.
3. Seat p2 timed out at 30,000 ms during initial browser page navigation.

## Unconfirmed Hypotheses

The following hypotheses are unconfirmed working theories.
None has been reproduced in isolation.

### Hypothesis 1: Exit Timer Latency (Unconfirmed)

[TurnMoment.tsx:83](../../src/components/game/TurnMoment.tsx#L83) uses a 160 ms timer:
`exitTimer.current = setTimeout(() => setUp(null), 160);`
Under CPU contention, timer dispatch or React unmounting could delay beyond 1000 ms.
Confirming check: log wall-clock deltas around timer firing and DOM removal under CPU load.
Ruling-out check: reproduce 1000 ms timeout when timer dispatch delta measures under 200 ms.

### Hypothesis 2: Event-Loop Contention During State Loading (Unconfirmed)

The proof fixture polls incoming messages while the client imports dynamic modules.
Frequent timer polling could compete with script compilation on 2-CPU systems.
Confirming check: measure event loop lag while tracking dynamic import completion times.
Ruling-out check: prove state arrival delays occur without any dynamic import in flight.

### Hypothesis 3: Dev Server Bundling Latency (Unconfirmed)

Cold browser navigations trigger on-demand module bundling by Vite.
CPU throttling could extend bundling time beyond the 30-second navigation deadline.
Confirming check: inspect Vite request timestamps during failed page navigations.
Ruling-out check: observe navigation timeouts when all modules are already cached and warm.

## Next Steps

Issue #1575 remains open to isolate and reproduce the failure mechanism.
Assertions and timeouts in `your-turn-stay-prove.mjs` must not be loosened.

## Failure capture checked on 2026-11-23

The proof now records the three original failing boundaries: navigation, state loading and turn-pill dismissal.
A failure prints bounded JSON with Node wait spans, event-loop max/p99 and utilization since that page opened,
pending/completed request paths without queries, and a browser snapshot of public lifecycle and exit metadata.
Browser long tasks are passive observations. The post-failure read falls back to `unavailable` after a one-second
Node deadline, then the original error is rethrown. Native clocks, waits, assertions and seat-socket routing stay intact.
No game payload, credentials, hidden hands or seed are recorded.

An external control delayed only p0's tap-exit callback from 160 to 1,600 ms, after its normal eight-second cap case.
The unchanged 1,000 ms dismissal guard failed with its original `TimeoutError`. Exactly one diagnostic JSON record
parsed: the pill was still present, exit start was 14,798.8 ms and the browser snapshot was at 15,817.4 ms, with no
removal timestamp yet. The other three seats and the final zero-browser-error check passed; the control ended with
one failure. This validates capture of a deliberately late exit. It is not a reproduction of natural CPU starvation.
The control's Node loop maximum, 464.5 ms, covers the whole page and does not locate or explain that failure.

One full unforced invocation then passed every online, practice, reduced-motion and hotseat case, with zero browser
errors. It used the existing two-CPU quota (`cpu.max` 200000/100000), the original 100 ms busy task every 200 ms,
repository-pinned tools and the serial browser lock. The owned CPU fixture stopped and was reaped. The first load
runner had a shell quoting error before launching a browser; its source is retained separately from the corrected run.
A comment and this note changed after the successful run; executable proof behaviour did not.

Raw controls, parsed JSON, runner metadata, source hashes and logs are retained outside the checkout in
`/workspace/work/resume-nov9/1575-observe/`. The histories are bounded, and a post-failure snapshot may arrive after
the relevant event or be unavailable. Node and browser clocks are reported separately. A pending module path or an
event-loop maximum alone establishes no cause. The natural run-14 failure was not reproduced; its cause is still
unknown. No product repair, twenty post-fix passes or issue completion is claimed.
