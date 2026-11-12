# Adoption attempt, 2026-11-12

Model: GPT-6.1 Sol; builder Sol-adopt1527.

The first sandbox-only launch failed before browser startup with listen EPERM.
It was rerun once with local networking enabled; this was an environment correction, not a passing retry.

The ensuing ONLY=online run is INVALID as exact-head validation: it began at 81bb576 and reached p3, but the builder prematurely merged current main while Vite was serving the checkout. It completed before termination could be delivered. No result counts toward validation or causal evidence. Raw output is retained in baseline.log. The baseline.exit.txt is 0, but this is invalid mixed-source evidence, not a valid pass.

Runtime: Node24.19.0, system Chromium154.0.8037.57, 2 CPU cgroup, separate Node load busy100ms every200ms; serialized by team flock. Historical Node22/Chromium1243 results remain separate.

Clean normal merge: 4dbb18da7222e3f28a7dcca63a3162021de26587. No manual conflict resolution, production/proof edits, ceiling changes, or assertion edits. Historical unresolved failures remain unresolved.

## Frozen diagnostic

One four-seat diagnostic invocation at merged head4dbb18da completed with exit0 and zero console errors. It reused the archived failure-only diagnostic: unchanged original checks/deadlines and all four online seats, capturing state/DOM/renderer/pending-request details only after an original wait fails, bounded3s then rethrowing that original error. No BOUNDARY_FAILURE snapshot occurred. This is not a full proof or a causal fix, and does not restart or clear the stopped historical13-pass/run14-failure campaign.

The same Node24/system Chromium154/2CPU/load runtime was used. frozen-source-sha256.txt and diagnostic-start/end-hashes.log prove no scoped source changed during this run. Diagnostic source/runner, exact output and exit are retained. Temporary executable was removed. Syntax and typecheck pass; registered-prove reports all220 proofs registered. No production/proof/assertion edits were justified by this run.

Unresolved blocker: historicalp0 originalgone1000, p1 originalloaded30000 and p2 originalnavigation30000 failed without a causal trace. Current runtime differs from historicalNode22/Chromium1243. Next investigation must obtain a failure with process/frame health and state/DOM/request snapshot on a frozen checkout, ideally using that historical runtime, before choosing any fix. A passing rerun cannot establish its cause. Do not restart a20-run campaign or change any guard to obtain green.
