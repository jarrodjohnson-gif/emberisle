# Review assertion equivalents

Approved by the 2026-10-25 decision and desk review on #1117. Original line numbers refer to origin/main before the title migration.

| File:line | Old | New | Why |
|---|---|---|---|
| `scripts/watch-ui-prove.mjs:262` | Throw if Watch exists with a three-character code. | Require exactly one Watch button, disabled with a three-character code. | The approved title always shows Watch; the original error-sequence, lobby refusal and title-screen checks still prove that an incomplete code sends nothing. |
