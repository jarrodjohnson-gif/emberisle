# Acting client readiness in the needs fixture (#1522)

Owned PR1520 exactb0 CI42758315547 failed server-needs-prove's original5000ms p0 state wait after rematch and before bot-rejoin completion. Exact old event order was not captured. Candidatebaseb18588a8 has identical server/src to that failed head; this branch is separate, no server change mixed into1518 and no ninth PR.

The bot fixture awaits playerC's pass acknowledgement, then acts on playerA's socket without ensuring A received its own new turn/action stamp. Cross-socket reception has no such ordering guarantee. Add the acting socket's existing5000ms state wait for its own roll phase before its roll/pass actions. Every original assertion, state/action policy and timeout remains; no action retry or product edit.

## Controlled evidence

An initial instrumented full diagnostic completed every original assertion/terminal success and recorded Nodeexit0; the outer tool unexpectedly reportedexit1 without an error. Both statuses are retained as a wrapper discrepancy, not a reproduction or clean end-to-end pass claim.

Controlled200ms delay of A's own-roll state delivery, retaining the real host and5000ms guard:
- Old fixture sends roll fromseq2/p2main; server correctly answers “The table has updated. Please try again.” Delayedseq3/p0roll then satisfies the old wait, which sends pass before rolling. Host correctly refuses “Finish your turn first.” Original p0 state wait expires; exit1, same CI signature/stage. Caller/public-frame trace retained; no secrets/private hand dumps.
- Same delay plus acting-client readiness: roll atseq3/p0roll, pass atseq4/p0main, all original full server-needs cases/terminal success, exit0. No artificial delay exists in the permanent candidate.

This demonstrates the fixture race and the repaired boundary at the same failure path. Historical CI lacks the trace, so its precise original schedule remains unproved. Full unmodified candidate validation under load, independent review and hosted CI remain pending. Existing server-needs-prove is registered in package.json and ci.yml; no new permanent proof. Eight open PR cap respected; publication as a separate PR waits for an authorized slot.
