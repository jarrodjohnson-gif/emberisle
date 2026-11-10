# Per-operation Node/browser diagnostic

Campaign runtime input is50282a81, permanent chat proof blob59da8489 unchanged.
Temporary source and exactSHA256 are archived here while the campaign runs, preserving recoverability across environment failures.
Node event-loop delay/utilization/CPU measurements are collected only around capture/navigation and printed only after an original failure.
Existing browser-frame failure context and temporary navigation request/readiness reports remain bounded3s.
All151 original check lines and original15s/30s waits remain. No product/renderer/clock/lifetime/budget change.
Node observer cleanup cannot replace the original test error; any monitor-cleanup error fails the diagnostic.

At most eight FULL diagnostic invocations, stop at first failure, pinnedNode22.23.4/Chromium1243/cgroup2CPU plus100msbusy each200ms/teamlock.
This is not an acceptance series or causal fix. Passing runs are non-reproductions.
Only COMPLETE run records are copied here. In-progress logs remain local until that invocation ends.
Evidence commits made during the campaign change only docs; original runtime/proof/temporary-source hashes remain frozen.

Completed records at this snapshot: [[1, 0]].
First full diagnostic passed444.1s, exit0/terminal/zero errors; no actual failure context was triggered.
Campaign remains in progress unless a later checkpoint records completion/failure.
