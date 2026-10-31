# PR #706 main/audio refresh

parent: Codex-p

- Previous head: `8a280a81fb50580f1280ad6d188b6897807f6e4d`.
- Frozen main: `d09d72faaa3c23b426362d7a4f49df498e42e153`.
- Automatic normal merge: `4e2bb014fbcc0ed07f0057515c2a7d24682bec35`.
- Merge author and committer: Codex-p <codex-p@users.noreply.github.com>.
- Main includes merged audio proof correction #1142 (`3b087043`), requested by desk comment6420909685.
- No manual conflict resolution, runtime changes, assertion edits, lockfile edits or budget increases.
- Marker proof, SeatRail, TradeToast and WinScreen remain byte-exact previous head.
- Locks, size budgets, reserved army proof, audio proof and audio runtime remain byte-exact frozen main.

## Fresh independent validation

`git clone --no-local --branch codex/p706-audio-main-20261026 /workspace/emberisle /workspace/p706-audio-validation`

Frozen root and server `npm ci` both exited0. Logs stayed outside the Vite checkout at `/workspace/706-refresh-output`.

Browser proofs ran serially inside one `flock /tmp/emberisle-team-browser.lock` acquisition.
`PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers`; `CHROMIUM_PATH` was unset.
Playwright's default headless launch reported Chromium `153.0.8010.12`; installed browser revision1243.
The API's `chromium.executablePath()` reports the paired regular Chromium path; default headless uses the installed headless shell.

| Command | Actual result |
| --- | --- |
| `node scripts/turn-marker-prove.mjs` | PASS, exit0: 29/30/32 moves at1280x720/390x844/844x390; seven passes each. Live zero/two-marker controls pass. |
| `node scripts/audio-recovery-prove.mjs` | PASS, exit0:20 checks; native recovery1526ms. All twelve seat/clip pairs play and advance. |
| `npm run typecheck` | PASS, exit0 |
| `npm run registered-prove` | PASS, exit0:151 proofs registered in package and CI |
| `npm run loosen-prove -- --base d09d72faaa3c23b426362d7a4f49df498e42e153` | PASS, exit0:0 changed proofs, none loosened |
| `npm run build` | PASS, exit0 |
| `node scripts/size-prove.mjs --base /tmp/emberisle-873-main-size-base` | PASS, exit0: every ceiling and growth allowance unchanged |

Separately built baseline is exact frozen main. Its build output is retained in `base-build.log.gz`.
Index:124353/125200 B gzip, versus main124371 B:−18/400 B. Sheets:+69/200 B.
The source whitespace check passes. `source-sha256.json.gz` records318 source/registration hashes.
`preservation.json.gz` records exact comparisons. All verbose raw output is losslessly gzip-compressed; `SHA256.json` hashes each archive.

The initial worktree command lacked a local tracking ref and exited128 before creating a worktree.
An explicit fetch resolved setup; its diagnostic is retained. Neither browser proof failed or needed a retry.

Full server, broad UI, safe-area, hole and army suites were not repeated for this automatic merge.
This focused local pass does not establish a week without CI recurrence under #1111.
Fresh exact-head CI, independent different-model review and owner visual acceptance remain pending.
No ready-state change, workflow retry, new PR, merge to main or main push occurred.

— Codex-p; parent: Codex-p
