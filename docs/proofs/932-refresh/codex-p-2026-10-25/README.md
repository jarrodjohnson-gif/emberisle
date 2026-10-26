# Offline stale-sweeper hardening: current-main refresh

Codex-p (GPT-6.1 Sol), 2026-10-25. Existing PR934 / issue932.
Tested merge78368df joins priorac67f84 and current main3db641d normally.
The three feature files match bothac67f84 and originalb9b0ca4 byte-for-byte.
Their hashes and unchanged activation/probe-exclusion guards are recorded in scope.log.
All application runtime, other proofs, registrations, lockfiles and budgets match main exactly.
Main advanced during the fresh fetch because the desk merged PR1009.

Fresh clone: /workspace/emberisle/work/p-verify934, Node v24.19.0.
Independent size base: /workspace/emberisle/work/p-base934 at3db641d6744617ebc55a3dbb6add1ce34855a72b.
Frozen root/server installs and the independent base install/build pass.
Offline stale-pr-sweeper-prove passes27 groups with fake APIs, including disabled mode and isolated permission-probe fixtures.
Types/build, registered145, loosen1-none and size pass.
Index124287/125200 B gzip, +4/400 B against built main124283 B.
Every original ceiling and allowance passes.
The final evidence-only commit is audited separately for embedded SHA/time footer changes and committed evidence hashes.

The original CI39938016583 failed Wayfarer setup, job120362440462.
Its exact assertion checked44px minimum button dimensions and viewport bounds; no failed rectangle was logged.
The retained historical excerpt establishes the failure, not a timing or flakiness cause.
Fresh unchanged Wayfarer setup passes serially, including1280x720 Off-mode fortune/Muster behavior.
It also passes390x844 and844x390, sticky settings and join/rejoin/reload/restart/rematch persistence.
This local pass does not establish the old CI failure's cause or guarantee new-head CI.

Every command in exit-status.json exits0. Install/base-build command statuses also equal0.
```sh
npm ci
npm --prefix server ci
npm run stale-pr-sweeper-prove
npm run typecheck
npm run registered-prove
npm run loosen-prove -- --base 3db641d6744617ebc55a3dbb6add1ce34855a72b
npm run build
node scripts/size-prove.mjs --base /workspace/emberisle/work/p-base934
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run wayfarer-setup-prove
```
The browser uses repository-pinned Playwright Chromium; no other browser proof ran concurrently.
Original eight mutation controls and B1 live verification remain historical; they were not repeated for a byte-identical merge.

No activation, live permission probe, workflow dispatch, PR closure, label mutation or settings change was performed.
A single read-only variable query returned403, so the live repository variable value is unverified.
The owner-gated workflow condition is preserved; this work does not authorize activation.
No test, timeout, rate, budget, detector or lockfile was edited.
Independent Opus review and exact-head CI remain required.
