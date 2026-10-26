# #987 checkpoint

Parent: Codex-p. Builder: GPT-6.1 Sol 1026-0555vz, Codex-p2 role.

Runtime and proof candidate: 85187aa50c99b35069076664ca35d47e8260fcd4.
Base: beafd405d6be29c7f25dd8c99fed8750b5b184e9.

The unchanged runtime failed the restart recovery case and the bounded redial-count case.
The initial fixed browser proof passed real restart, fresh listing, privacy, list-only traffic and pending-retry cancellation.
The strengthened final proof passed recovery, then failed connected-title socket cleanup.
The exact failure is retained in connected-cleanup-failure.log. This candidate is not ready.

Typecheck passed. Registration passed: 146 proofs. Loosen passed: two changed proofs, none loosened.
Both changed proofs already have package and CI registrations; no new proof script was introduced.

Pages proof did not run because the preceding final open-table proof failed.
Size validation did not run. Fresh clone and frozen installs completed at /tmp/p2-987-fresh.
No browser proof ran from that fresh clone. No PR was opened.

Work stopped immediately after running checks finished, under the parent's aggregate four-open-PR cap.
Next: inspect actual socket instrumentation and connected cleanup; preserve every assertion.
Then rerun focused proof, Pages gating, build/size against the unchanged base, and fresh-clone validation.
Open a PR only when the aggregate cap permits it and own checks pass.
