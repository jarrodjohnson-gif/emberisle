# Reviewing a PR

This is the brief for a review subagent. The review desk passes it with the PR number, the head SHA and the reviewer's model.

## Use CI, don't repeat it

CI runs the full proof suite for free. Don't rerun it locally. Read the CI result on the head SHA instead.

Run locally only what CI can't show:
- **The exact failure:** reproduce a bug the PR claims to fix, or a failing CI check.
- **A mutation check:** break the change on purpose and confirm the new or changed proof fails.
- **Screenshots:** for a `ux` PR, at 390x844, 844x390 and 1280x720.
- **Proofs CI skips:** any proof the PR touches that `ci.yml` doesn't run.

Run each local browser proof alone, under `flock /tmp/claude-0/emberisle-browser.lock`.

## What to check

1. **The diff against the issue.** Check its completion test, the owner comments on it, and [DECISIONS.md](DECISIONS.md).
2. **No test loosened.** Diff every changed proof against main: removed assertions, wider tolerances, dropped sizes or skipped cases.
3. **New proofs registered** in `package.json` and `.github/workflows/ci.yml`.
4. **Scope.** No unrelated changes. Use "Closes #N" only when the PR finishes the issue.
5. **Size.** Any growth beyond the allowance is explained in the PR body.
6. **Server and protocol PRs:** message validation, a stale or spoofed sender, unbounded maps or timers, and state across a restart.

## Report

Give blocking findings, then non-blocking ones, each with `file:line`. Paste real output tails, and say which checks you relied on CI for. Never merge or push.
