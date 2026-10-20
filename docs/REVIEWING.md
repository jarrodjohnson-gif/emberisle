# Reviewing a PR

This is the brief for a review subagent. The review desk passes it with the PR number, the head SHA and the reviewer's model.

## Use CI, don't repeat it

CI runs the full proof suite for free. Don't rerun it locally. Read the CI result on the head SHA instead.

Run locally only what CI can't show:
- **The exact failure:** reproduce a bug the PR claims to fix, or a failing CI check.
- **A mutation check:** break the change on purpose and confirm the new or changed proof fails.
- **Screenshots:** for a `ux` PR, at 390x844, 844x390 and 1280x720.
- **Proofs CI skips:** any proof the PR touches that `ci.yml` doesn't run.

Run each local browser proof alone (AGENTS.md rule 11). The review desk's machine uses `flock /tmp/claude-0/emberisle-browser.lock` for this.

## What to check

1. **A different model.** The reviewer's model is not the builder's model.
2. **Claims and scope.** The claim is posted with its files, one issue per PR, and no file overlap with another active claim.
3. **The diff against the issue.** Check its completion test, the owner comments on it, and [DECISIONS.md](DECISIONS.md).
4. **No test loosened.** Diff every changed proof against main: removed assertions, wider tolerances, dropped sizes or skipped cases.
5. **New proofs registered** in `package.json` and `.github/workflows/ci.yml`.
6. **No unrelated changes.** Use "Closes #N" only when the PR finishes the issue.
7. **Size.** Any growth beyond the allowance is explained in the PR body.
8. **Server and protocol PRs:** message validation, a stale or spoofed sender, unbounded maps or timers, and state across a restart.

## Report

Give blocking findings, then non-blocking ones, each with `file:line`. Paste real output tails, and say which checks you relied on CI for. Also flag to-do lists in files.

For a `ux` PR, attach the screenshots and don't judge the look. Visual changes wait for Jarrod.

A review subagent never merges or pushes. The review desk merges, once the review is clean, CI is green on the head SHA, and Jarrod has OK'd any visual change.
