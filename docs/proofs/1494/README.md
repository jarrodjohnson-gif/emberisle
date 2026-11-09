# Results-menu startup investigation (#1494)

The earlier full proof at cb66473a failed waiting30000ms for win-menu on the third viewport390x844 after the first two passed. The original failure did not print the page errors or store state, because the aggregate error assertion runs only after all cases.

This bounded change captures tag, accumulated console/page errors, list requests, store screen/phase/winner, rendered text and relevant lazy-module timings only when the existing wait fails, then rethrows the original error. Capture failure cannot replace the original exception. No readiness wait, retry, deadline, geometry assertion or viewport changed. This is observability, not a causal fix, and does not close #1494 or satisfy its20-run/root-cause completion test.

Pinned Node22.23.4, Playwright1.63.0, Chromium1243. The full temporary diagnostic passed all9 viewport cases plus spectator, live first paint, refused-chunk recovery and desktop. Exact source/output retained. The permanent change adds a defensive capture-error fallback to that diagnostic. A startup-only repeated diagnostic is in progress separately; it does not count as a full proof. Original main control pass and original failure remain distinct; no cause is inferred from a pass.
