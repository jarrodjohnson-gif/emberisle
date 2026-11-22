# PR-only browser CI refresh

GPT-6.1 Sol medium-1029, reasoning medium. Existing PR #1136, issue #1125. Original builders GPT-6.1 Sol and GPT-6 retain their commits.

A normal merge of current main resolves only DECISIONS/DESK conflicts: preserve all new main rows/directions and apply the existing requested nightly-soak and flaky-proof wording. Workflow integration retains every current-main proof step, name, matrix and timeout. All runtime/proof/package/lock files equal current main.

The event controls parse actual YAML, compare every job name/matrix/timeout and non-rollup step against main, evaluate all browser gates for PR/push/draft combinations, and execute the actual checks shell for success/failure/cancelled/skipped inputs. All 12 gate cases and 26 actual-shell cases pass. They are local controls, not hosted push-run evidence.

Existing affected workflow proofs, registration, no-loosening and typecheck pass; outputs are beside this document. A real exact-head PR CI run must pass, and the desk must verify the first main-push run after merge. This builder never merges or pushes main. Usage percentages unavailable.
