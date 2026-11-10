# Per-operation Node/browser diagnostic

Campaign STOPPED after two complete full diagnostic passes444.1/380.9s and run3 failure.
No run4 or eight-pass acceptance claim. Source, hash, runner and every complete record are retained.
Runtime input50282a81, permanent chat proof blob59da8489 unchanged; documentation-only commits do not change those inputs.
PinnedNode22.23.4/Chromium1243/cgroup2CPU plus100msbusy each200ms/teamlock.

Run3 fails the ORIGINAL15000ms two-frame guard at reactions-phone.jpg in quickReactions.
This is an actual failure of that guard, at a different capture from the earlier historicaldesktop failure.
Post-failure snapshot: baseline815, current/saved817, same renderer, attempts2/completed2.
Document visible, motion not reduced, renderer running/connected, no lost context, fence37145 (SIGNALED).
Node histogram maximum delay8833.204223ms, p991593.835519ms, CPU1860.277ms, operation elapsed23332.045ms.
The operation monitor also includes readiness/baseline work BEFORE the15s wait; its total is not the wait's exact elapsed time.
No frame-completion/predicate timestamps were recorded, so this does NOT prove the frames met the original deadline.
No quota/OOM/renderer-counter/polling cause is claimed.

Temporary source added only per-operation Node observations and existing bounded browser/request failure reports.
All151 original check lines and waits remain; no renderer hook, product clock, timer, lifetime, dependency or budget change.
Reports are bounded3s; original errors and cleanup semantics remain. Monitor cleanup cannot replace the primary error.
Temporary source removed after failure; existing permanent proof remains registered216.

Next bounded step: actual browser frame-completion and predicate-poll timestamps plus Node wait boundaries.
Use the real prefix through this capture, preserve originalguard and record subset scope explicitly.
Do not restart this failed series for green or call passing diagnostics a causal fix.
