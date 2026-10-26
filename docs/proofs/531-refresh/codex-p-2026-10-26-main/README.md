# PR #706 normal-main refresh, 2026-10-26

Tested merge: `2f90d3edaecb0a05f4f002a6855f406f32dfb8fe`.
Parents: original `5bc47761d2fad17f4a3fd4c164e10308fbb8707b` and main `beafd405d6be29c7f25dd8c99fed8750b5b184e9`.
The merge applied automatically and preserved original authorship.
All new commits use Codex-p <codex-p@users.noreply.github.com>.

The marker proof, SeatRail, TradeToast and WinScreen remain byte-exact original head.
Main's Wayfarer styles remain beside the unchanged marker CSS.
Both lockfiles, size budgets and reserved longest-army proof remain exact main.
The marker retains one package registration and one CI step.
No runtime, assertion, tolerance, timeout, geometry, dependency or budget edits occurred.

## Reproduction

Fresh independent local clone, detached at the tested merge:

```sh
npm ci
(cd server && npm ci)
npm run typecheck
node scripts/registered-prove.mjs
node scripts/loosen-prove.mjs --base beafd405d6be29c7f25dd8c99fed8750b5b184e9
npm run build
# Another fresh clone checked out beafd405, ran npm ci and npm run build.
node scripts/size-prove.mjs --base /tmp/p706-main/base
# Run each browser proof serially, with CHROMIUM_PATH unset:
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run turn-marker-prove
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run hud-safe-area-prove
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run hole-prove
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run seat-rail-prove
```

Node24.19.0; pinned Playwright1.63 browser1243 headless shell.
All raw outputs are in `logs/`.
The nine `screenshots/turn-marker-*` images were viewed individually.
Trade and win captures use the existing synthetic fixtures, not a natural winner.
Owner visual acceptance remains pending.

## Retained diagnostics

The first safe-area command exited13 before host startup because server dependencies were missing.
`safearea.log` retains that setup failure. `server-install.log` records the correction.
`safearea-installed.log` is the subsequent unchanged proof.
The first loosen command hit sandbox `spawnSync git EPERM`, after its self-checks.
`loosen.log` retains that failure; `loosen-permitted.log` records the same command with subprocess permission.
`static-status.json` includes the original failed loosen attempt; use the permitted output for the final result.
The full whitespace diagnostic flags historical raw evidence already on the original branch.
Source and registration diff whitespace passes. Historical raw logs were preserved.

Full server/army/title/Pages suites were not repeated for this automatic merge.
The focused marker, geometry and static checks cover the affected surfaces.
New exact-head CI and independent different-model review remain required.
No merge, main push, force-push or CI retry occurred.

— Codex-p

## Results

- Marker: PASS;29/32/29 legal moves, seven passes at each viewport; live zero/duplicate controls pass.
- Safe area: PASS;269 checks, zero console errors;233.56seconds.
- Hole: PASS;500 size/phase pairs;161.38seconds.
- Seat rail: PASS;18.74seconds.
- Typecheck, registration147, permitted loosen0-none, build, source audit and size: PASS.
- Index:124313/125200 B gzip; base124336; growth−23/400 B.
- All chunk ceilings and growth allowances remain unchanged and pass.

Sources are hashed in logs/source-SHA256.json for the final evidence-only-head audit.
