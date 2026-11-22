# Fresh validation for the PR #883 process cleanup

Codex-p. parent: Codex-p. Tested source `8c7401d248539bc45ef6817c929d7c13b201035d`; subsequent `7cd551b` changes documentation only. The fresh no-local clone is `/workspace/p883-process-validation`; root and server `npm ci --no-audit --no-fund` completed without lockfile changes. Local Node24.19.0 differs from CI Node22.23.3. Playwright1.63 uses the pinned Chromium153.0.8010.12. Both browser commands ran sequentially with `/tmp/emberisle-team-browser.lock`, `PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers`, and CHROMIUM_PATH unset.

Actual results:

```text
hand-cards-prove: ok
exit0;58.925seconds; all existing viewports/motion/geometry/deltas and bank settlement guards
audio-recovery-prove: 20 checks passed; native recovery in 1833ms
exit0;7.757seconds; three real host seats, aborted downloads, same-seat reconnect and native playback
registered-prove: all 151 proofs are in package.json and ci.yml
exit0
loosen-prove --base43758f1: exit1 (advisory)
FAIL scripts/audio-recovery-prove.mjs: removed or edited check line: throw originalError;
FAIL scripts/audio-recovery-prove.mjs: check count fell from 17 to 16
```

The exact complete command output and result objects are gzip archives below, indexed by records.json with both compressed and raw SHA256. The first detector invocation failed with sandbox `spawnSync git EPERM`; it is retained in loosen-delta.log.gz/static-results.json.gz. The authorized invocation then reached the actual detector and produced the two quoted flags. Neither is claimed as a pass. The detector was not edited. The diagnostic catch/rethrow was removed at the desk's explicit request: direct awaited native playback failure still rejects, and the resulting audio proof is byte-identical to both pre-diagnostic0857561^ and comparison main1d87e85. All189 original lines and12check-call lines remain. No gameplay assertion, tolerance, timeout, registration or budget is removed or relaxed.

source-audit.json.gz records byte comparisons and changed paths. The Hand proof is unchanged from43758f1; all its lines after184 equal current main, including exact four-ore/one-wool transfer and motion guards. No runtime, layout, dependencies, lockfiles or budgets changed. The older audio failure's cause remains unproved. The prior diagnostic/evidence checkpoint remains in history and own PR873; a new diagnostics PR is deferred at the four-PR cap. Owner questions/picture acceptance and fresh independent Claude review remain pending. These checks do not represent physical phone acceptance or a new layout proof.
