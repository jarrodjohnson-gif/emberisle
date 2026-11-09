# Turn-gain diagnostics for PR 1446

PR source: 009dc9c7d601decf179c722a12297460113f0f87.
Canonical base: 3ed2c19635c003644d2f3f41cf3789f60f713148.
Node 22.23.4; locked Playwright 1.63.0, default Chromium 1243.
Both unmodified proofs ran once, serially, under the team browser lock.
No test, runtime, tolerance, deadline or budget changed for this diagnosis.

CI42564704204 attempt1: 16 successful jobs; presentation-3 and aggregate checks failed.
The results suite, server and build passed. The failed step was turn-gain-prove, job128988958118.
The redirected log download returned Forbidden. No alternate route was attempted.

The desk supplied the actual hosted excerpt in PR comment6732928452:
-1280x720 refit centring: popup centre592,281 versus new hole centre592,540; shift0.
-Hole containment: popup y248.9..313.1 versus new hole y396..684.
The desk directs no turn-gain or related runtime/proof change in this PR.
A repeat hosted failure belongs to a separate issue. Owner picture acceptance remains required.

Local PR control: exit1, two failures.
-390x844 own-hand cue matching: stray grain+2 at63696.3ms.
-390x844 reconnect: resource-flash visibility timeout30000ms at line789.

Local base control: exit1, one failure.
-1280x720 locator.evaluate timeout30000ms; see the preserved stack in base-control.log.

These three signatures differ. Neither local control reproduces the known hosted refit failure.
No common cause, flake classification or fix is established. A passing retry cannot erase these failures.
Early progress summaries missed the base's caught timeout because it lacked a FAIL prefix; this final account corrects them.

The desk reported retrying the failed job once. API confirmed run_attempt2 and triggering_actor jarrodjohnson-gif.
The builder did not trigger a retry. Inspect attempt2 before reporting its result.

This evidence is on a separate feature branch. The reviewed PR head remains009dc9c7, unchanged.
No new PR, main push, force push, merge, deployment or infrastructure change.
