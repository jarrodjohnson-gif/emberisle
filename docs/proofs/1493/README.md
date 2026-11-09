# Connection-health clock initialization (#1493)

The proof installed a running clock and then asked it to pause at a Node wall-clock timestamp. Browser clock synchronization or protocol latency can put that timestamp behind the already-running fake clock. Playwright rejects that as `Cannot fast-forward to the past`, before transport cases begin. Original hosted failure: PR #1481 head47b4beff, run42612449519/job129144334724. The desk's unchanged retry passed; that was not a causal fix.

Use the public `page.clock.pauseAt(new Date())` automatic installation directly. There is no separately initialized current-time clock that can overtake the target. Existing fake transport clients are constructed afterward. All transport assertions, 137ms RTT, 3s deadline, 30s spacing, host and startup cases remain unchanged. No product code changes.

Pinned environment: Node22.23.4, Playwright1.63.0, Chromium1243. Serial browser execution uses `/tmp/emberisle-team-browser.lock`.

`clock-control-source.txt` is an archived temporary diagnostic, not a new permanent proof. It ran old/new initialization on separate blank pages with an extra browser evaluation of 0/25/100ms after capturing the target. The old sequence failed10/10 in each group; direct pause passed10/10 per group and preserved exact Date plus timer firing at137ms. The extra evaluation deliberately creates stale targets: this is controlled evidence, not an identical replay of the original CI sequence.

`first-full-proof.log` is one complete local passing affected proof. The expected failed dynamic imports are controlled production recovery fixtures; their later recovery assertions passed. The required20-run loaded full-proof series is still running and is not claimed complete here. Registration passed:214 registered proofs. Hosted current-head CI and independent review remain outstanding.

## Subsequent validation — completion remains blocked

An additional blank-page diagnostic used exactly `install(); pauseAt(new Date())` with no intervening browser evaluation: **0 failures in20 samples**. Direct pause passed20/20. This distinguishes the unmodified API sequence control from the deliberately stale-target reproduction. The original hosted clock failure remains the actual observed failure, not reproduced by those20 uninstrumented blank-page samples.

The loaded full-proof series passed runs1–3, then **run4 failed** at the unchanged10000ms host startup guard, before browser/clock initialization. All four logs/exits are retained in `series/`. No retry of the full proof was started and no20-consecutive-pass claim holds. The periodic CPU process was stopped when the series failed. Narrow host-readiness diagnosis is in progress; neither a cause nor fix for that timeout is established. Registration and advisory loosen-prove passed; the latter reports one changed proof and none loosened. Draft hosted jobs are skipped, not passed.

## Host-import isolation

Under the same100ms/200ms CPU load, a narrow original fixture startup control passed once (1092ms), then stalled without stdout/stderr at10000ms. A stage-instrumented control passed twice (838/1139ms), then stalled after registering the asynchronous resolver and before host module evaluation. No room load or pending-outcome recording had started.

A fixture-only single synchronous hook chain mirrors the existing resolver's ESM alias/extension rules and preserves CommonJS requires. Its20 loaded startup samples all passed, with the unchanged10000ms limit. The first exploratory synchronous resolver incorrectly rewrote a CommonJS `ws` require and failed `Cannot find module './websocket.ts'`; that failure is preserved. Bypassing `require` contexts retains the old asynchronous resolver's ESM-only scope. No production loader changed. These controls located a stall before module evaluation; the later isolated comparison below limits causal interpretation. No independently confirmed upstream Node bug is claimed.

The permanent proof now uses this single fixture hook chain plus direct browser-clock pause initialization. Full post-change transport/host/production validation and a fresh20-consecutive-run series remain required. The earlier3-pass/1-fail series is not reset into a pass by this change.

## Isolated alternating control bounds the host claim

With browser activity excluded by the team lock,20 alternating mixed/single-hook pairs both passed. Mixed median583ms/max723ms; single median305.5ms/max518ms. Two periodic100ms/200ms CPU processes were present (the existing full-series load and this control's load). This measures reduced startup overhead from avoiding the extra asynchronous resolver worker; it does NOT reproduce or establish the cause of the earlier10000ms stalls. Those failures remain genuine and preserved. Single-hook consolidation remains a fixture-only startup optimization/candidate, not a claimed causal repair of those historical stalls. Clock stale-target cause and this host uncertainty are separate.
