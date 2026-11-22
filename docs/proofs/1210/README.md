# #1210: admit the required host cue before measuring media recovery

Builder: Codex-p. Parent: Codex-p. Model: GPT-6.1 Sol. Base main: 28628f3. Tested fix source: 8d7a5f2. Usage percentages unavailable.

## First failure and cause, before any fix

The proof was driving real host turns/trades faster than its paced sound queue could drain. Production intentionally rejects a new cue when its queue reaches 8. The final bong chat line could arrive while that queue was full, so the proof waited 8000 ms for playback of a request that was never admitted. Waiting longer cannot start a dropped cue.

The FIRST failing proof used three genuine host seats and native media, with actual socket loss/rejoin, turns, resource trade and soundboard broadcast. No fake sockets or media replacement were used. Source f75aa71 preserves every original proof line. At CPU×2, Pine/p1 received the bong but retained only its initial failed media element (id 4, error 4, time 0); its only native play attempt was 938 ms, before restoration 2201 ms. Ember/Tide recovered all four files. This is cpu2-baseline-1.log.

A subsequent proof-only Vite trace retained the original sound guards and identified the exact cause in admission-cpu2-4.log: Ember/p0 received board_bong, with unlocked=true, muted=false, gain 1, burst=false, but queue length 8/full=true. Its queue contained path/outpost/dice/trade/turn cues. The request never reached start/native.play. The queue later drained but the dropped cue stayed absent. Other seats admitted and played it. This is concrete causal evidence in the real fixture; historical CI did not record these fields, so no claim is made about every old CI occurrence.

All first failures precede the fix. Full raw outputs and parsed admission-failure.json are retained. Earlier five native observational runs and three passing admission-trace runs are separately labelled with exact source versions/hashes; they are not presented as fixed-source results. The diagnostic checkpoint note is preserved verbatim in diagnosis-checkpoint.md.

## Fix and invariants

Before sending the original real-host bong, the proof now waits on every actual sound queue being empty and not pacing, using its existing 10000 ms wait helper. This is a state precondition, not a fixed sleep. A new assertion requires exactly one real post-restoration request and admission gate per seat, with audio/unlock/gain available and neither burst nor full-queue rejection. The original host send, delivery checks, 8000 ms native playback wait/poll 50, every media assertion, and 120000 ms watchdog remain unchanged.

The test-only Vite transform exposes queue/trace observations only inside this proof's server. Production source, queue cap 8, sound pacing 150 ms, assets, browser settings, dependencies, lockfile, flaky signature, budgets and registration are unchanged. No media reset or direct recovery replay is added. The original initial four intentionally failed downloads are unchanged. Every original source line remains in order, verified in final-source-audit.json.

The additive outer failure observer records named seat/file state, native play attempts, host frames and admission history. It is outside own PR #873's inner wait catch. Observer errors cannot mask the identical original proof error; native.play always receives its original calls and returns its original promise/exception even if URL observation fails. Fulfilled/rejected/timed-out snapshot and observer-failure controls are retained. No existing checkout/PR was modified.

## Actual final validation

| Case | Actual output |
| --- | --- |
| Final native, one run | 21 checks pass; every seat recovers all four files. |
| Final CPU×2, three runs | 21 checks pass each; actual host cues admitted and native media advance. |
| Remove only the new queue-readiness wait, retaining the new assertion | Run 1 passes; run 2 fails the admission assertion: Tide has queue-full=true/burst=false. This is a real readiness regression control, not an altered assertion. |
| Suppress only post-restoration board_bong in an isolated test transform | All three genuine seats receive the message and record request 1/gate 0; admission assertion fails on the first run. This behavioral control proves the fix cannot silently skip playback. |

The two mutation controls are isolated temporary checkouts, never the final source. Their exact patches and hashes are retained. The first two genuine 8000 ms failures were recorded before these intentional mutation controls. Every passing/failed control output remains; no run was retried to obtain green.

Typecheck, registered-prove 160, committed-head loosen (one changed proof, none loosened), whitespace and final observer robustness controls pass. Existing audio-recovery-prove remains registered in package.json and CI; no new proof command is added. Local native/browser runs were serial under /tmp/emberisle-team-browser.lock, with CHROMIUM_PATH unset. Actual recorded versions: Playwright 1.63.0, Chromium 153.0.8010.12, Node 24.19.0.

Source audit records unchanged original 8000 ms timeout, polling 50 ms and watchdog 120000 ms, plus the separate existing 10000 ms readiness bound. Source-only change affects this registered proof; production/bundle files are byte-identical to main, so CI handles unrelated suites.

## Reproduce

Run npm run audio-recovery-prove with the pinned browser. CPU×2 uses the exact recorded temporary preload from cpu2-preload-source.txt. The genuine pre-fix failing sources are immutable f75aa71 and 341c27b; final source is 8d7a5f2. Isolated readiness-removal and host-cue-suppression mutations are recorded as patches against 8d7a5f2. observer-controls-source.txt extracts the actual observer functions for explicit error-identity/native-call controls; its actual outputs are in observer-controls-final.log.

Jarrod's standing finish-one-then-next instruction and explicit fifth/sixth-slot authorization, including “Take another one”, permit reuse after #1218 merged. Own #873 overlap was coordinated with parent before claim; its branch and all existing five PRs remain unchanged. Fresh exact-head CI and independent Claude review remain required. This builder never merges or pushes main.

— Codex-p <codex-p@users.noreply.github.com>
