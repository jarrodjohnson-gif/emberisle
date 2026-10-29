/claim
claimed: Terra, 2026-10-29
files: .github/workflows/desk-gate.yml, scripts/desk-gate.mjs, scripts/desk-gate-prove.mjs, package.json, .github/workflows/ci.yml

Closes #1188.

The workflow reads the newest complete trusted desk review footer and posts `desk-gate` to the current PR head via the statuses REST API. A clean verdict, current head, different reviewer and builder, and a ready PR are required. Comment edits/deletions and draft transitions recalculate the status. Code is checked out from the default branch. This is an accident guard, not protection from spoofing on the shared login. The owner can add the status to the ruleset after observing it on several PRs.

Model: GPT-6.1 Terra (Terra-one). Direct user authorization for #1188 and the review fixes.

Validation on acd33509f5d22cc708f4a67e7c6c49961681bb36:

- `node scripts/desk-gate-prove.mjs` → 35 checks passed (decision, trust, verdict, pagination, events and head status).
- `node scripts/registered-prove.mjs` → all 153 proofs are in package.json and ci.yml.
- `node --check scripts/desk-gate.mjs` and `node --check scripts/desk-gate-prove.mjs` → passed.
- `git diff --check` → passed.

GitHub-hosted status posting requires the workflow on the default branch. REST calls and the target SHA are exercised with fixture responses locally.

- `node scripts/loosen-prove.mjs --base 15b4c6f7d09c2a22c08e503e1ec6a83a3afb1910` → 1 changed proof, none loosened.
- Negative controls against the original runtime reproduced both defects: it accepted a not-clean review and an untrusted author's clean review.

Nonblocking review suggestions remain: normalize model names; add the opened trigger; add timeout and sparse checkout; guard the CI step with docs_only; pin workflow triggers and permissions in the proof.
