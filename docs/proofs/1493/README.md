# Connection-health proof history

PR #1496 records the source-specific results, retained failures and current review gates:
https://github.com/jarrodjohnson-gif/emberisle/pull/1496

Raw run logs and timestamp/exit records were removed from the checkout at the desk's request. They remain in prior commit history and in the builder's external archive at `/workspace/work/resume-nov9/1496-adoption/retained-proofs/`.

Earlier loaded-run counts apply only to their recorded sources. They are not validation of later main integrations. The clock setup fix has since landed independently through #1658; this PR preserves the remaining fixture and optional discovery recovery changes. Current validation belongs in the PR body, alongside the exact source commit and independent review.
