# #873 audio CI failure, 2026-10-27

Exact head `35220cbd036a658b1da49d330abc5c29c28b74aa` (documentation only over `b07966bb`). [CI run 40457125783](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/40457125783) completed failure: [browser-b (presentation-2), job 122033117884](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/40457125783/job/122033117884) and aggregate checks failed. The earlier b07966bb CI and TradeUI runs passed; the preceding product-source Wayfarer failure remains documented separately and its cause is unproved.

The log shows each of Ember, Tide and Pine had native playback baseline and aborted first downloads of all four target files, followed by distinct real-host seats, same-seat reconnect, a real trade, and host soundboard delivery. The `Promise.all` wait at `scripts/audio-recovery-prove.mjs:163` timed out after 8000ms waiting for every target's native playback progress on every tab. The `RECOVERY` snapshots are collected after that wait, so none were logged. This excerpt cannot identify the seat or clip that failed to advance, why it failed, or whether the failure relates to #873. The job reports no `test-results/` files to upload. No retry, runtime change, or conclusion of independence is claimed. The separate serial passive diagnostics below completed after this failure.

## Serial diagnostics

The parent ran one default pair and one CDP CPU-rate-6 pair, each candidate then main, under the shared browser lock. Candidate source `19cdb3e79e7bfd14e9a535a8dd138f579ee59d51`; main `017962a8d606ae39de97466b3b065c93635b0009`. All four runs exited 0 and each reported all 20 checks passed.

| Run | Total elapsed | Observed recovery wait |
| --- | ---: | ---: |
| Candidate, default | 7.96s | 1789ms |
| Main, default | 7.08s | 1474ms |
| Candidate, CPU rate 6 | 9.98s | 2903ms |
| Main, CPU rate 6 | 10.4s | 3332ms |

Before/after source manifests match in all four runs. The proof, `sound.ts` and `sound-extra.ts` match between the two sources; `store.ts`, `table.ts` and `host.mjs` differ. Passing controls do not establish independence from #873, a root cause, or failure frequency. Observer overhead and CDP pacing make the runs non-equivalent to uninstrumented CI.

The external preload observes the original native wait; only after an original rejection it attempts a bounded 1200ms read-only snapshot and rethrows the same error. None of these four runs failed, so that snapshot path was not exercised. `observer-default.cjs` reconstructs the exact initial observer bytes from the previous text; `observer-cpu-option.cjs` is the helper used for the optional throttle. Default traces contain browser metadata only; CPU traces also record rate 6 per page. No repeated browser run is claimed.

The actual invocation was a Python `subprocess.run` with argv `['node', '--require', '/workspace/audio-native-wait-diagnostic.cjs', 'scripts/audio-recovery-prove.mjs']`, `cwd=root`, copied environment, and stdout and stderr captured to each run log. Each entire pair's Python orchestrator ran from `/workspace` under `flock /tmp/emberisle-team-browser.lock python - <<'PY'`. The environment removed `CHROMIUM_PATH`, set `PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers`, `AUDIO_DIAG_ROOT=root`, and `AUDIO_DIAG_TRACE` to its named trace in `/workspace/873-audio-ci-output`; only the CPU pair added `AUDIO_DIAG_CPU_RATE=6`. Candidate root was `/workspace/p873-b-frozen-validation`; main root was `/workspace/p905-main017-base`. `node --check /workspace/audio-native-wait-diagnostic.cjs` exited 0 before each pair. The helper was later extended only with the optional per-page CDP branch; `observer-cpu-option.cjs` matches the CPU helper snapshot. Root/server/source checks used reads and hashes, with no source writes.

[Records](records.json) give original and compressed SHA-256 hashes and lengths; [raw](raw/) contains all 21 external diagnostic files and the raw CI step compressed individually. Each archive was decompressed and compared byte for byte with its source.

## Raw CI step excerpt

The following lines are copied with trailing whitespace trimmed for Markdown; the byte-exact step is in `raw/ci-audio-step.log.gz`. Source: `gh run view 40457125783 --job 122033117884 --log` (job and step prefixes and timestamps retained):

```text
browser-b (presentation-2)	Run npm run audio-recovery-prove	﻿2026-10-27T05:49:14.5764529Z ##[group]Run npm run audio-recovery-prove
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:14.5764943Z [36;1mnpm run audio-recovery-prove[0m
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:14.5830209Z shell: /usr/bin/bash -e {0}
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:14.5830539Z ##[endgroup]
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:14.6915643Z
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:14.6916486Z > audio-recovery-prove
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:14.6917153Z > node scripts/audio-recovery-prove.mjs
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:14.6917508Z
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:17.0006592Z ok Ember: native baseline plays and advances before failure
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:17.4668203Z ok Ember: every target first download actually aborted
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:17.4693435Z FAILED_MEDIA Ember [
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:17.4694017Z   { file: 'your_turn.wav', error: 4, readyState: 0, time: 0 },
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:17.4694633Z   { file: 'confirmation_001.wav', error: 4, readyState: 0, time: 0 },
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:17.4695511Z   { file: 'drop_001.wav', error: 4, readyState: 0, time: 0 },
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:17.4696672Z   { file: 'bong_001.wav', error: 4, readyState: 0, time: 0 }
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:17.4697210Z ]
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:17.8335380Z ok Tide: native baseline plays and advances before failure
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:18.3000393Z ok Tide: every target first download actually aborted
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:18.3023285Z FAILED_MEDIA Tide [
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:18.3024154Z   { file: 'your_turn.wav', error: 4, readyState: 0, time: 0 },
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:18.3024999Z   { file: 'confirmation_001.wav', error: 4, readyState: 0, time: 0 },
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:18.3025869Z   { file: 'drop_001.wav', error: 4, readyState: 0, time: 0 },
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:18.3026705Z   { file: 'bong_001.wav', error: 4, readyState: 0, time: 0 }
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:18.3027153Z ]
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:18.6502479Z ok Pine: native baseline plays and advances before failure
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:19.1170038Z ok Pine: every target first download actually aborted
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:19.1188768Z FAILED_MEDIA Pine [
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:19.1189410Z   { file: 'your_turn.wav', error: 4, readyState: 0, time: 0 },
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:19.1190263Z   { file: 'confirmation_001.wav', error: 4, readyState: 0, time: 0 },
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:19.1190952Z   { file: 'drop_001.wav', error: 4, readyState: 0, time: 0 },
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:19.1191666Z   { file: 'bong_001.wav', error: 4, readyState: 0, time: 0 }
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:19.1192230Z ]
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:19.1905811Z ok three distinct seats joined the real host (minimum legal table)
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:19.2362277Z ok each real host seat has a distinct player identity
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:20.2529611Z ok dropped socket rejoins the same player and seat
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:20.2530146Z ok the other host seats stay connected
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:21.1697067Z ok a real host trade transfers the offered resource after restoration
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:21.2090720Z ok host actions give all players a new turn and complete a trade
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:21.2165672Z ok host broadcasts the soundboard cue to all seats
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:29.2994056Z node:internal/modules/run_main:123
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:29.2995659Z     triggerUncaughtException(
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:29.2997218Z     ^
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:29.2997529Z
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:29.2998088Z page.waitForFunction: Timeout 8000ms exceeded.
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:29.2999092Z     at /home/runner/work/emberisle/emberisle/scripts/audio-recovery-prove.mjs:163:42
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:29.3000315Z     at /home/runner/work/emberisle/emberisle/scripts/audio-recovery-prove.mjs:163:26 {
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:29.3001115Z   log: [],
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:29.3001504Z   name: 'TimeoutError'
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:29.3001933Z }
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:29.3002129Z
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:29.3002301Z Node.js v22.23.3
browser-b (presentation-2)	Run npm run audio-recovery-prove	2026-10-27T05:49:29.3314433Z ##[error]Process completed with exit code 1.
```

— Codex-p; parent: Codex-p; Model: GPT-6.1 Terra
