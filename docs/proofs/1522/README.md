# Acting client readiness in the needs fixture (#1522)

Owned PR1520 exactb0 CI42758315547 failed server-needs-prove's original5000ms p0 state wait after rematch and before bot-rejoin completion. Exact old event order was not captured. Candidatebaseb18588a8 has identical server/src to that failed head; this branch is separate, no server change mixed into1518 and no ninth PR.

The bot fixture awaits playerC's pass acknowledgement, then acts on playerA's socket without ensuring A received its own new turn/action stamp. Cross-socket reception has no such ordering guarantee. Add the acting socket's existing5000ms state wait for its own roll phase before its roll/pass actions. Every original assertion, state/action policy and timeout remains; no action retry or product edit.

## Controlled evidence

An initial instrumented full diagnostic completed every original assertion/terminal success and recorded Nodeexit0; the outer tool unexpectedly reportedexit1 without an error. Both statuses are retained as a wrapper discrepancy, not a reproduction or clean end-to-end pass claim.

Controlled200ms delay of A's own-roll state delivery, retaining the real host and5000ms guard:
- Old fixture sends roll fromseq2/p2main; server correctly answers “The table has updated. Please try again.” Delayedseq3/p0roll then satisfies the old wait, which sends pass before rolling. Host correctly refuses “Finish your turn first.” Original p0 state wait expires; exit1, same CI signature/stage. Caller/public-frame trace retained; no secrets/private hand dumps.
- Same delay plus acting-client readiness: roll atseq3/p0roll, pass atseq4/p0main, all original full server-needs cases/terminal success, exit0. No artificial delay exists in the permanent candidate.

This demonstrates the fixture race and the repaired boundary at the same failure path. Historical CI lacks the trace, so its precise original schedule remains unproved. Full unmodified candidate validation under load, independent review and hosted CI remain pending. Existing server-needs-prove is registered in package.json and ci.yml; no new permanent proof. Eight open PR cap respected; publication as a separate PR waits for an authorized slot.

## Full candidate validation

At fixed sourcec263f426178f6d7745aff1225dee4d59d285997b,20/20 consecutive COMPLETE unmodified candidate server-needs proofs passed under2CPU quota plus100ms-busy/200ms CPU load, pinned Node22.23.4. Every exit0 and terminal needs server prove ok; no retry. Raw logs/exits/start times/source hash/CPU metadata/batch in full-series/. This is20 full server-needs proofs, separate from chat validation and from the latency-injected controls.

Syntax/registered215/advisory loosen1-none loosened pass. Final evidence commit changes no server/src/package/workflow source. No hosted CI or independent review claimed. Candidate stays on a separate pushed feature branch while all eight owned/adopted PR slots are occupied; no ninth PR or cap exception assumed. Original assertions/5000ms guard and host stale-action rejection unchanged.

## Current main integration and publication slot

The desk merged1520 as0ae586d6 after unchangedb0 CI run42758315547 eventually passed on attempt4. Its earlier server-needs failure remains retained; a passing retry did not fix this race. The merge freed one of the authorized eight slots.

Normal main merge5ec84c73 incorporates current0ae586d6. Verified server/src/lib/package/lockfile inputs are identical to the twenty-run candidatec263; current main's Hud font change is unrelated to this Node proof. One additional COMPLETE exact-merge-head server-needs proof passed without extra load, exit0/terminal success. Registered215 and advisory loosen1-none loosened pass against current main. This does not claim twenty separate runs on the merge commit. New-head hosted CI and independent review remain pending.
