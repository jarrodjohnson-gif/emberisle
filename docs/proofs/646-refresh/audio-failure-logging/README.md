# #873 failure-only audio wait diagnostics

Proof commit `be8098f5391025681f45494266215fd95ad08103` adds failure-only snapshots around the existing registered `audio-recovery-prove` native wait. All 189 original lines and 13 original assertion/check lines remain byte-for-byte in order; no old assertion was replaced. The original predicate, 8000ms timeout, 50ms polling and post-wait assertions remain. On a rejected wait, three read-only snapshot attempts run in parallel, bounded overall by 1000ms; the original error object is rethrown. No runtime, server, protocol, store, registration, dependency, lock or budget change is included.

Fresh no-local clone `/workspace/p873-audio-logging-validation` at `be8098f` used frozen root and server `npm ci`. Proof and external helper `node --check` passed; registered-prove passed all 152 registrations; loosen-prove against `9147dea62489a39c79270d583e581d8a5eea16de` reported one changed proof, none loosened. A first combined setup command accidentally attempted checkout from `/workspace` and returned “not a git repository”; no installs ran in that attempt. The explicit fresh-clone working directory corrected setup and both installs succeeded. That setup transcript was not saved.

| Serial run | Exit | Elapsed | Result |
| --- | ---: | ---: | --- |
| Native | 0 | 8.27s | All 20 checks passed; no failure snapshots |
| Synthetic fulfilled | 1 (expected) | 6.95s | Three fulfilled snapshots; same original error object rethrown |
| Synthetic rejected | 1 (expected) | 6.77s | Three rejected snapshots; same original error object rethrown |
| Synthetic timeout | 1 (expected) | 7.39s | Three timeout snapshots; same original error object rethrown |

Each synthetic control emitted one `RECOVERY_WAIT_FAILURE` record for Ember, Tide and Pine. The saved negative-control helper waits for the real native predicate to succeed, then injects a single synthetic error; it is not a reproduction of the CI failure. It also makes snapshot evaluation reject or hang in the corresponding modes. The uncaught exception monitor confirms the same injected error object escaped. Before/after source hashes match in all four runs. These controls verify diagnostic behavior; they do not establish an audio fix, CI root cause, relationship to #873, or failure frequency. The prior [35220 CI failure and passive controls](../audio-ci-2026-10-27/README.md) remain retained.

## Invocation and artifacts

All four runs were serial inside `flock /tmp/emberisle-team-browser.lock python - <<'PY'`, with the orchestrator working directory `/workspace/p873-audio-logging-validation`. The copied environment removed `CHROMIUM_PATH` and set `PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers`. Native child argv was `['node', 'scripts/audio-recovery-prove.mjs']`. Each control used `['node', '--require', '/workspace/audio-logging-negative-control.cjs', 'scripts/audio-recovery-prove.mjs']`, with `AUDIO_CONTROL_ROOT` set to the fresh clone, `AUDIO_CONTROL_TRACE` set to its named trace under `/workspace/873-audio-logging-output`, and `AUDIO_CONTROL_MODE` set to `fulfilled`, `rejected` or `timeout`. The source hash manifests cover tracked source, scripts, server, package and CI files using `git ls-files` and hashes. Exact child argv and timing are in `results.json`.

[Records](records.json) list original byte lengths and SHA-256 hashes alongside archive hashes. [Raw](raw/) contains all 16 run outputs and manifests, the actual negative-control helper, and four static/install logs, each compressed separately. Each archive was decompressed and compared byte-for-byte with its source. No extra browser run is claimed here.

— Codex-p; parent: Codex-p; Model: GPT-6.1 Terra
