# Connection-health clock initialization (#1493)

## Current local validation complete

At runtime source557e1d5d2fa73b00d01a8cbfd199e21556bf4389, **20 consecutive complete proofs passed**, every exit0 and terminal success retained in production-series/. All original assertions ran; no retries. Pinned Node22.23.4/Playwright1.63.0/Chromium1243, serial dedicated team lock,2CPU quota plus one100ms-busy/200ms CPU process. Source head/blobs and exact batch source retained. Final child-build artifact independently confirms production React, not the earlier inherited development build.

Actual production typecheck/build/base-build/size/growth and title-chunks-prove pass. Index126079B versus canonical6022600a126037B: **+42B/400B**. OpenTables1241B unchanged; all ceilings retained. Private hosting after failed discovery and all held optional-title cases pass. Exact-head hosted CI and independent review remain separate gates; this evidence-only commit changes no runtime source.

The historical checkpoint is archived for prior owner gates and superseded observations; current authority/state lives at issue1477comment6739296722.


The proof installed a running clock and then asked it to pause at a Node wall-clock timestamp. Browser clock synchronization or protocol latency can put that timestamp behind the already-running fake clock. Playwright rejects that as `Cannot fast-forward to the past`, before transport cases begin. Original hosted failure: PR #1481 head47b4beff, run42612449519/job129144334724. The desk's unchanged retry passed; that was not a causal fix.

Current initialization uses public `setFixedTime(target)`, `pauseAt(target)`, then `setSystemTime(target)`. Date is held during setup so the target cannot become stale; Date advances again afterward while timers remain paused. This also preserves a normal monotonic origin. The intermediate direct-pause approach prevented stale targets but initialized monotonic time around epoch milliseconds (~1.79e12); it is superseded. Existing fake transport clients are constructed afterward. All transport assertions, 137ms RTT, 3s deadline, 30s spacing, host and startup cases remain unchanged. No product code changes.

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

## Full combined-source series stopped on run5

Runs1–4 passed completely. Run5 passed the transport, browser, host-state, lobby and controlled production-startup assertions, then failed the unchanged zero-page-error guard with React's recovered concurrent-render error. All five raw outputs/exits/start times are retained in `single-hook-series/`. No20-pass claim holds. This error's underlying cause was lost by the original String(error) collector. One full temporary diagnostic now preserves browser-side error.cause/stack and the same error assertion; it is not a passing retry or a claimed fix. Independent blank-page diagnostics are checking a Date-freeze barrier for initialization without the direct-pause monotonic-origin jump; no permanent change yet.

## Date-freeze barrier and retained error causes

Thirty blank-page controls (10 each with0/25/100ms browser delay between fixed Date and pause) all passed. Initial monotonic values remained small (about3–110ms), Date equaled the target, timers fired at exactly137ms and both Date/performance advanced137ms. This preserves the original relative clock semantics while preventing stale targets; it does not claim to fix the uninstrumented React error.

The one full temporary render-cause diagnostic on the INTERMEDIATE direct-pause source passed all cases with zero page errors. That is not a causal repair of the run5 failure. The permanent proof now retains browser-side error causes/stacks and page labels on failure while preserving the original zero-error assertion, so a recurrence is diagnosable. A fresh full20-run series is still required for the Date-freeze barrier source.

## Current discovery fix and build-mode correction

The Date-barrier series passed5 complete runs, then run6 retained a cause: the controlled seeded failed-client recovery also rejects OpenTables, and React reports a recovered concurrent-render error caused by that rejected optional import. All six runs/cause stacks are in `barrier-series/`. The Date barrier did not fix that independent render problem.

The simple initial-failure-only control passed20/20 but omitted explicit Watch recovery. Repeating the ACTUAL failed-client-and-Watch-recovery block20 times reproduced the render error once (sample10), failing the unchanged final zero-error guard. The same harness after gating optional discovery mounting passed all20 samples and all its other original assertions, with zero page errors. This is one proof with20 repetitions of the final case, not20 full proofs. Source/results/blob IDs retained.

Title now waits for the existing openTables.load promise before mounting its optional list/mode controls. A rejected optional module therefore retains the existing null surface without entering concurrent render. Private Host/Join, saved-seat preservation, explicit Watch retry and the common lazy-loader/reload policy are unchanged. Product scope claim6754935981 was posted/read back after checking #970's separate chunks declaration and avoiding own #1341's unapproved common-loader changes.

Important artifact correction: the old in-process build followed createServer and inherited development NODE_ENV. Its purported production preview contained DEVELOPMENT React (human recoverable-error string, no minified React error marker). The matched old/new comparison deliberately retains that same mode; it is not production validation. The permanent proof now builds in an isolated pinned Node process with NODE_ENV=production. Actual production builds, size/growth checks, title-chunks coverage,20 complete full-proof runs and exact-head CI remain to be run on this final source. No assertion/error filter, deadline, ceiling or allowance changed. Typecheck and syntax pass at this step.

## Hosted failure and main reconciliation, 2026-11-10

Current-head CI run 42733762642 at 413f9060 failed two proofs: landing-dust at its sound-before-same-delay assertion (line 169), and turn-gain at the reconnect resource-flash visibility wait (line 858, original 30000 ms). Filtered original job excerpts are retained here. Aggregate checks failed. Neither failure is erased or counted as a passing retry.

The landing failure matches #1489, subsequently fixed by Gemini in merged PR #1492 after clean Claude Sonnet 5.5 review. A normal merge of canonical main b18588a8 incorporates that fix and the intervening Sea-volume feature. Turn-gain's precise cause remains unknown; a fresh passing run alone cannot establish it. Local typecheck on the reconciled head passed. The earlier twenty production health passes remain evidence for their recorded source, not twenty runs of this changed runtime input. Independent review and exact-current-head hosted checks remain gates.
