# Sol builder handoff

- Agent: GPT-6.1 Sol cloud-builder-1029.
- Recorded: 2026-10-29T15:29:43Z (UTC clock).
- Tier: 1; tier 2 and 3 also eligible, subject to model pins.
- Source: issue [#1175](https://github.com/jarrodjohnson-gif/emberisle/issues/1175), PR [#1179](https://github.com/jarrodjohnson-gif/emberisle/pull/1179).
- Tested commit: `3602caf12afa15232bbe0da0469b21019fa276e4`.
- Local clone: `/tmp/emberisle-sol`, branch `sol/ci-install-1175`, clean checkout.
- Backup remote: `codex/checkpoint-sol-1179-3602caf`, verified at the tested commit by git ls-remote.
- Existing PR branch remains `c076011ba2287026f634d9ee9283fe90a322e3b8`, verified by git ls-remote.

## Completed

Added both dependency manifests to all five installed-dependency cache keys.
Added ten negative controls that reject either missing manifest in every cache key.
Content-hash fixtures show manifest-only drift changes fixed keys while old lock-only keys retain their stale hit.
Existing cold, warm, unavailable-cache, docs-only and failure assertions remain.

Checks passed:

- Root/server frozen `npm ci`; typecheck; YAML parse and exact step/job/command/gate retention; diff whitespace check.
- `ci-install-prove`: ten omission mutants rejected; both drift controls pass; install counts cold 2, warm 0, unavailable 28, docs 0.
- `registered-prove`: all 153 proofs registered.
- `auto-merge-prove`: 72 cases, 12 mutants caught.
- `label-commands-prove`: 26 workflow proof groups.
- `flake-rerun-prove`: passed.
- `loosen-prove`: default base passed; explicit original PR head base checked one changed proof, none loosened.

Raw retained output: `checks/` beside this handoff.
The root/server install, typecheck and YAML checks passed in tool output; separate raw logs were not retained.
The focused proof and explicit-base loosen check were rerun unchanged while recording this handoff.
Full prepared PR body: `pr1179-body.md` beside this handoff.
Patch and bundle: `pr1179.patch`, `pr1179.bundle` beside this handoff.
Usage percentages are unavailable.

## Publication blockers

Existing PR #1179 was NOT updated with this commit or prepared body.
The desk was NOT notified of the continuation.
REST GET issue comments and POST claim returned `Forbidden`.
Root's latest REST hub and todo-queue reads also returned `Forbidden`.
Only the backup branch preserves the commit remotely; it does not update the existing PR.
No merge, force-push or browser proof ran.
REST-only GitHub access is the user's rule; do not fall back to HTML or GraphQL.

Next: restore supported REST access, reread live hub, issue, PR, claims and exact head.
Confirm no newer competing continuation before publishing to the existing PR branch.
Publish the prepared body with its named claim/history, then obtain exact-head CI and independent Claude re-review.
A top-of-body fallback claim was prepared because the issue claim POST failed; it is not yet published.

## Next issue selection

Do not choose, claim or code another issue from cached state.
First read the live hub body and all comments after its newest Hub digest through REST.
Apply any direction naming this agent first.
Use the live queue and repository category rules.
Bugs precede new features at the same or lower priority.
Order priority p0, then p1, then p2; break ties by earliest milestone and lowest step.
Take tier 1 or lower work only when its model pin permits Sol.
Check dependencies are closed, the lane exists, eligibility status is current, and no active competing claim or open PR exists.
Scan reserved files and open PR changes across lanes, including work awaiting review.
Respect active claims, existing continuations, the open-PR limit and long-proof serialization.
Before claiming, reread the issue and every comment fresh; reread immediately after posting.
First active claim wins; pause only this agent's losing claim.

Use a named, dated and timestamped claim before code:

```text
/claim
claimed: GPT-6.1 Sol cloud-builder-1029, <YYYY-MM-DD>
timestamp: <YYYY-MM-DDTHH:MM:SSZ>
files: <exact planned paths>
```

Record source issue/PR, exact SHA, checks, remaining work and the next command in continuation history.
Do not notify the desk until publishing is possible and the notification states verified facts.
