# Terra builder handoff

Recorded: 2026-10-29 15:29:53 UTC  
Builder: Terra  
Model: GPT-6.1 Terra  
Tier: tier:2 under the current user direction; one eligible issue at a time.

## Existing work: #1188 / PR #1192

Local clone: `/tmp/emberisle-terra`, branch `terra/1188-desk-gate`, tested head `acd33509f5d22cc708f4a67e7c6c49961681bb36`. Root reports backup remote branch `codex/checkpoint-terra-1192-acd3350` pushed and verified. The existing PR has not been updated and the desk has not been notified: GitHub REST access returned `Forbidden`. Do not represent the backup as a PR update. Updated local PR body: `/tmp/emberisle-pr1192-body.md`.

The two blocking review findings were addressed: require a clean verdict in supported desk headings or an exact-head clean marker, and trust only OWNER, MEMBER or COLLABORATOR comments. Fixtures reject not-clean, conditional and pending headings, and untrusted authors. Nonblocking review suggestions remain in the PR body.

Validation at the tested head:

- `node scripts/desk-gate-prove.mjs` → `desk-gate-prove: 35 checks passed (decision, trust, verdict, pagination, events and head status)`.
- `node scripts/registered-prove.mjs` → `registered-prove: all 153 proofs are in package.json and ci.yml`.
- `node --check scripts/desk-gate.mjs` and `node --check scripts/desk-gate-prove.mjs` passed; `git diff --check` passed.
- `node scripts/loosen-prove.mjs --base 15b4c6f7d09c2a22c08e503e1ec6a83a3afb1910` → `loosen-prove: 1 changed proof(s) against 15b4c6f7d09c, none loosened`.
- Negative controls using the original runtime showed both defects: `old runtime incorrectly accepts not clean: success` and `old runtime incorrectly accepts untrusted author: success`.

The prepared fallback claim block is:

```text
/claim
claimed: Terra, 2026-10-29
files: .github/workflows/desk-gate.yml, scripts/desk-gate.mjs, scripts/desk-gate-prove.mjs, package.json, .github/workflows/ci.yml
```

This claim was prepared locally on 2026-10-29; no live claim timestamp is available because REST was blocked. The timestamp at the top records this handoff, not a posted claim.

## Resume

Use GitHub REST only (`gh api`); no HTML or GraphQL. Finish existing PRs or answer the desk before taking new work. Verify current live status for #1181 and its pictures when REST returns: the last captured hub said the pictures had been added and owner acceptance was pending. Verify #1192's live state and coordinate updating its branch, PR body and desk notification with root.

For new work, Terra takes tier:2 or tier:3 only, one issue at a time; avoid new server, security, protocol or CI-workflow work, taste-dependent design, and changes another active PR is midway through. Follow p0, p1, then p2; bugs precede features at the same or lower priority. Check current dependencies, model pins, claims, open PRs and file conflicts, and perform immediate pre-claim and post-claim checks. Name Terra and include date, UTC timestamp and files in the claim history. Do not select, claim or code a new issue until live REST eligibility can be verified. Never merge, push main or loosen tests; register new proofs and coordinate long browser proofs one at a time.
