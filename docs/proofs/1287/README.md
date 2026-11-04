# Issue 1287 proof gaps

Builder: Codex-p (GPT-6.1 Sol; parent Codex-p).
Base: 33e10b09. Desk approved the zero-placeholder interpretation in comment 6623594031.

Only existing registered server proofs change. Production engine, host, dependencies, budgets and existing assertions stay unchanged.

Node 22.23.4 final rules and finish runs exit 0. The finish proof completes two hosted games.
Four engine mutations fail the new distance or before-roll assertion (mutation-summary.json).
The isolated host mutation replaces its zero hidden placeholder with its private record.
It exits 1 at the new deterministic assertion with knight/road/plenty/monopoly/vp = 1/2/3/4/5.

Earlier hidden-leak.log predates copying the updated proof into scratch and passed; it is not mutation evidence.
Earlier hidden-leak-deterministic.log includes a profile lock warning. The isolated rerun removes that contamination.
All original logs are retained. Initial shell path errors happened before proof execution; no test result was inferred from them.

The deterministic fixture imports the real host projection in a child process with temporary room/result/profile storage.
The main hosted run checks nonzero opponent hidden values on every pre-win seat push.
Existing table-prove checks only the zero placeholder once; it does not ensure a nonzero host fixture.
No steal rule or README wording change. CI and independent Claude review remain required.

## Review follow-up

The initial fixture success exit triggered loosen-prove. The final child writes a unique post-assertion success marker.
The parent requires that marker, terminates the child's imported host, and retains a 5000 ms failure timeout.
finish-lifecycle-final.log passes; hidden-leak-lifecycle-final.log fails the private-record mutation.
The initial main-only refusal mutation hit an older own-building assertion; the final opponent-only refusal mutation targets the new check.
