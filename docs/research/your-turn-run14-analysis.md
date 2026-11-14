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

TurnMoment dismissal uses a 160 ms timer (`setTimeout(() => onDismiss(), 160)`).
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
