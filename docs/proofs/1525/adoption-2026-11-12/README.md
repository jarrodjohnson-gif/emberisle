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

## Historical runtime comparison

The remediable runtime gap was addressed: official npm node@22.23.4 installed into /workspace/emberisle-historical-runtime; the existing Playwright installer downloaded Chromium revision1243 from cdn.playwright.dev. No repository dependencies changed. Browser launch preflight passed, actual version153.0.8010.12.

ONE historical-runtime diagnostic at frozen f9f7ea5fe8c18ad637fc4660bc258a6b626c98cd also completed exit0, all four seats and zero errors, no BOUNDARY_FAILURE report. Node22.23.4/Chromium1243/2CPU plus100ms busy every200ms, team lock, original guards retained. Start/end hashes match. FullChrome was supplied explicitly through CHROMIUM_PATH; historical executable/channel configuration beyond revision1243 is not established. Source/runner/versions/preflight/log/exit/hashes are retained under historical-runtime/. The diagnostic source is the same archived diagnostic-source.txt in this directory. No further diagnostic runs were attempted.

No remaining installation blocker was found. What remains missing is evidence from an ACTUAL failing dismissal/state/navigation boundary: expected and received sequence, marker/exit timing, RAF and browser responsiveness, pending/failed local requests, renderer/process health at that failure. Neither passing diagnostic supplies it. No causal source change is justified; existing historical failures remain open and the PR stays draft. Next authorized investigation should capture that failure with a bounded trace on a frozen checkout, rather than repeating unchanged passing diagnostics. Exact-head draft CI is skipped, not green. Independent review remains pending.
