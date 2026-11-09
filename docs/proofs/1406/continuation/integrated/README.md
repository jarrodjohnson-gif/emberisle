# Integrated desktop results verification

Source commit: 5af47993a36f706d84a357325cc88d271d8d4b1a.
Canonical base: 3ed2c19635c003644d2f3f41cf3789f60f713148.
Normal merge 348705d4 retains current-main behavior and every proof registration.
The sole CI conflict keeps both results proofs under the current browser-job condition.
The only runtime difference from canonical main is the approved desktop card width.

Node 22.23.4; locked Playwright 1.63.0 / default Chromium 1243.
Browser proofs ran serially under /tmp/emberisle-team-browser.lock.
No browser executable override, dependency lock, size limit or allowance changed.

| Command | Result |
|---|---|
| npm run win-action-prove | exit 0; all six viewport groups, seven hosted win fixtures, persistence/reload and pre-win privacy |
| npm run win-list-prove | exit 0; complete list, keyboard, spectator, first-paint and failed-import recovery checks |
| npm run win-long-names-prove | exit 0; real production table at 1280x720, 1024x768 and 844x390 |
| npm run typecheck | exit 0 |
| npm run registered-prove | exit 0 |
| npm run loosen-prove -- --base refs/remotes/canonical/main | exit 0; one changed proof, none loosened |
| node scripts/size-prove.mjs --base /workspace/work/1406-base | exit 0; every absolute ceiling and growth allowance passes |

The first premerge win-action run observed zero lazy rows where four were required.
The readiness commit adds the same first-row wait used by win-list-prove.
Every original win-action proof line remains unchanged and in order (original-lines.log).
All counts, geometry, privacy assertions and existing timeouts remain unchanged.
The failure and the earlier missing-loader errors remain in the parent evidence directory.

The default loosen run used stale fork origin/main and flagged historical main changes.
loosen-prove.log preserves that result; loosen-canonical.log uses the correct explicit canonical base.
The detector is unchanged. These are different baselines, not a retry for green.

source.json pins runtime, proof, workflow and lockfile hashes.
pictures/ holds the integrated production screenshots and exact geometry measurements.
The 1280x720 view was also inspected visually: all seven headings and every total fit.
SHA256.json audits these evidence payloads. Hosted CI and independent Claude review remain separate gates.
