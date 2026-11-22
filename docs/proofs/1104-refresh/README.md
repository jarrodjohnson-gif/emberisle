# PR #1104 current-main refresh, 2026-10-30

Builder: Codex-p. Parent: Codex-p. Model: GPT-6.1 Sol. Sixth slot authorized in the parent session. Usage percentages unavailable.

Normal merge `e4fd018` preserves original head `66ee3a1` and merges main `13f73f4`. The proof is byte-identical to the original head, including the requested next-frame sample. App source, dependencies, lockfile, CI, assertions and budgets equal main. The historical owner instruction to leave this PR unmerged remains; this builder never merges.

## Actual results

- `npm run stage-prove`: 25 checks pass, zero browser errors; includes same-frame size-changing writer/reader RAFs and its following settled frame.
- Identical proof against only `stage.ts` from `f334d47`: exit 1, seven failed checks, including no-cover and least-move clearance in the same-frame size-changing case. Its next-frame case passes. Zero browser errors. The temporary fixture used current package metadata/dependencies; no tracked runtime file was changed.
- `npm run typecheck`, `npm run registered-prove` (157), `npm run loosen-prove -- --base origin/main` (one changed proof, none loosened), `git diff --check`, both builds and size ceilings/base-growth pass.
- Index: main 124611 B, PR 124610 B, -1 B within the unchanged 400 B allowance. Raw outputs include every chunk; the one-byte differences are measured build output, not a claimed product change.
- Playwright 1.63.0, Chromium 153.0.8010.12, Node v24.19.0. Browser runs were serial under `/tmp/emberisle-team-browser.lock`, `PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers`, with `CHROMIUM_PATH` unset.

Initial default-sandbox runs failed before proof assertions: Chromium shutdown EPERM, Vite local listen EPERM, and loosen's child `git` spawn EPERM. Those raw failures stay in `*-sandbox-failure.log`; authorized unsandboxed reruns pass. `results.json` records that first static batch, including its failed loosen attempt; `focused-results.json` records the successful retry and expected negative-control exit 1. No failure is removed or represented as passing.

The old PR CI audio-recovery failure is retained in the PR history. This proof-only refresh does not identify its cause. Fresh remote exact-head CI and independent Claude review remain required. No CI retry or merge is performed by this builder.

## Reproduce the negative control

Copy the current unchanged `scripts/stage-prove.mjs` and package metadata to a temporary Vite root; place `git show f334d47:src/components/game/stage.ts` at `src/components/game/stage.ts` there, and use the same installed dependencies. Run `node scripts/stage-prove.mjs` from that root with the pinned browser and serial lock. The proof imports the real hook; no assertion changes or timers are added. `provenance.json` records source/proof hashes and identical-control-proof verification.

— Codex-p <codex-p@users.noreply.github.com>
