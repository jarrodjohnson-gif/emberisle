# Active muted-reaction observation (#1495)

The original full chat proof at cb35b9bf failed the unchanged1500ms reaction restoration wait (PR1480's retained1472/checks evidence). That run did not log receipt/expiry/unmute times, so its precise cause remains unproved.

The proof waited for the sender's unrelated chat-close UI before observing the receiver's active reaction. That permits the original2000ms reaction lifetime to expire first. Move the existing sender-close check after the receiver's hidden/restored checks. Preserve every check, both1500ms waits and the product2000ms lifetime; no product code, frozen clock or lifetime extension.

## Evidence and limits

Pinned Node22.23.4, Playwright1.63.0, Chromium1243; browsers serial under the team lock.

- Reused worktree initially lacked pinned server `ws`; first full diagnostic exited13 before startup. Direct host operation showed ERR_MODULE_NOT_FOUND. Pinned npm ci repaired ws8.22.0, no lockfile change.
- Full original-source diagnostic after repair failed a30000ms screenshot before mute testing. Preserve it; it neither passes the full proof nor establishes a reaction cause.
- Copied historical focused fixtures mistakenly used obsolete `Minimize chat` while current code says `Close chat`. Their close failures are fixture errors and invalid evidence of the original flake. Reordered variant reached restoration before its later obsolete close failed. Both source/logs are retained.
- Corrected current-label old-order focused fixture passed, restoration~269ms after receipt. This is not the full proof and does not establish a cause.
- Controlled old/new fixtures each impose2200ms before the sender-close check, retaining the real2000ms lifetime. Old order: reaction entered store at2185.9ms, expired4190.1ms, then the receiver store wait timed out30000ms. New order: receipt3395.5ms, unmute3493.6ms, visible3510.9ms (~115ms), unchanged hidden/restored assertions pass, and sender close still completes afterward. Natural expiry remains~2000ms. This isolates an ordering race under explicit latency; the original observed1500ms timeout is a different failure point, not claimed identically reproduced.

The reorder removes that unrelated wait from the live-reaction observation window. Full affected proof,20 consecutive loaded full runs, exact-head hosted CI and independent review remain pending. The archived `mute-focused-reordered-current-label-source.txt` without injected latency was prepared but not run. No other archived source is counted as a permanent registered proof.

## Full-series blocker and focused lobby trace

At unchanged runtime source6d0c0236, full runs1/2 passed completely (307.6s/336.0s). Run3 failed an unchanged5000ms lobby Pine Wololo sound-bubble wait before the game/mute section. All three source-series outputs/exits/start times are preserved. The series stopped; no20-pass claim and no retry-for-green.

A focused real-host four-seat lobby diagnostic repeated20 Wololo sends, retaining5000ms bubble waits and every per-tab clear-of-name check. All20 passed, with filtered send/receive/store/DOM timestamps. It omits the preceding full layout workload and is not20 full proofs or a causal fix. Exact historical lobby failure cause remains unproved. A controlled4s producer-completion delay is being compared with observations armed before the producer call; product sound lifetime3s and all existing timeouts remain intact.

## Armed transient observers

The4s producer-completion comparison completed: old ordering failed the original5000ms Wololo wait after the3s sound bubble had appeared and expired; armed observations passed every tab's original visibility/clear-of-name check while live, then still awaited the delayed producer. Raw traces show removal before producer completion in both cases. The artificial delay is a controlled reproduction of the ordering vulnerability, not an attributed timing trace of historical full run3.

The permanent proof now arms existing lobby emoji and sound observations while the sender click completes. Every visibility/geometry/log assertion and5000ms timeout remains; the full proof scripts still run serially under the team lock. The original mute1500ms waits remain unchanged. Failure output includes its stack for future diagnosis. New full20-run validation is required for this source; prior two full passes are historical, not counted toward it.

## Reconciled source and interrupted series

The source1050a538 armed series completed three full proofs with exit0 and terminal `chat prove ok`. Run4 has only partial output, no exit record or terminal result. After the environment resumed, no proof process/lock holder existed and the tool session was unknown. The interruption cause is unknown. Run4 is incomplete, not counted as passing or as a diagnosed assertion failure. All partial/complete outputs are retained in `armed-series-interrupted/`.

A normal signed merge of canonical main b18588a8 produced9c176e79, incorporating the Sea-volume runtime changes. The chat proof blob is unchanged. A new full proof at9c176e79 passed with exit0 and terminal success (240.3s), on the2CPU environment without an extra stress process; this is ONE complete pass, not20 loaded passes. Records are in `main-series/`. Syntax and registered-prove (215 registered proofs) pass; advisory loosen reports one changed proof, none loosened. An attempted command used the nonexistent `scripts/prove-loosen-check.mjs` and failed MODULE_NOT_FOUND; the actual registered `loosen-prove` was then run successfully. Loaded20-run validation, exact-head hosted checks and independent review remain pending.

## Loaded refreshed full series stopped on capture

At fixede3fa1f5b, loaded full runs1/2 completed with exit0/terminal chat prove ok (302.4s/300.2s). Run3 failed the unchanged30000ms page.screenshot at helper101/caller516 (phone lobby-bottom844), before mute cases. Fonts had loaded; capture cause UNKNOWN. Series stopped, no run4 or20-pass claim. Raw starts/logs/exits/ends/source hashes and exact runner source are retained in loaded-series-failed-capture/. No passing retry or increased timeout.

Observed readiness after failure: cgroup OOM/high/max counters all0, about689MB of8GB memory and468MB disk free. Existing helper enables continuous GL draws, waits two renderer frames then captures; whether continued rendering starves capture is a hypothesis, not an established cause. Expanded claim records a narrow capture-only replay before any permanent fix. Every original reaction lifetime, assertion and deadline remains.

## Bounded real-frame capture scaffold

The original-helper narrow four-tab phone title/lobby replay completed42 screenshots (initial2 plus20 viewport844/640 pairs), max11475ms, zero browser errors. It DID NOT reproduce the historical30000ms timeout. Several captures were still pending after5s with active rendering and no lost context; precise original cause remains UNKNOWN.

A candidate retains the existing two actual scene draws, then stops submitting further scene draws while the original screenshot captures that real frame. Its matched narrow replay42 screenshots passed, max2104ms, zero browser errors. These are capture-only controls, not20 full proofs or proof of historical causation. The actual saved original/candidate pictures visibly contain the rendered board; no synthetic/blank image is substituted.

Controlled timer witness: real2s timer fired2000.2ms, Date/performance advanced~2207ms,128DOM RAFs ran while exactly2real scene draws were retained. Original draw hook and outside-capture GL suppression restored. This verifies the helper boundary, not product reaction timing; original full reaction/lifetime checks still must run. Raw sources/results and representative original/timer-witness captures are in capture-controls/.

Claim6759661157 read back before permanent helper edit. The helper retains the original two-real-frame15000ms guard and screenshot30000ms timeout, temporarily bounds only scene draw submissions, and restores the exact original property/GL flag on success or failure. DOM clocks/RAFs and reaction expiry remain live. If cleanup also fails, the original capture error is retained; a cleanup-only failure still fails the proof. No product renderer source, assertion, lifetime, layout, threshold, allowance or browser engine change. New full loaded validation is required for this changed scaffold; old2pass+1fail is never counted into it.

The exact committed helper at e3664e25 passed real-browser contract controls under the same load: native2s timer2002.6ms, Date/performance~2214ms and125DOM RAFs during the retained scene frame; successful capture restores the hook/flag. Controlled capture failure preserves the same Error object and restores; a deliberately failing cleanup keeps the primary capture Error; cleanup-only failure also throws. The Node `FAIL capture cleanup: controlled cleanup failure` line is an EXPECTED negative fixture observation, not a passing full proof or an erased actual failure. Browser error guard passed. These controls are archived and do not count as full chat runs.

## Bounded full series stopped at the real-frame guard

At52a4e2ef, six consecutive complete loaded full proofs passed (230.8,246.9,232.2,227.9,258.4,287.7s). Run7 failed the ORIGINAL15000ms two-real-frame wait in shot113/caller1044, after reopening desktop chat and before screenshot capture. All preceding reaction/expiry assertions passed. Series stopped:6pass+1failure, no run8/20 claim. Every raw record is in bounded-series-frame-failure/; the six successes are not a causal fix for this failure.

Precise cause UNKNOWN: no renderer identity/frame/GPU snapshot was logged by the old helper at that failure boundary. Do not widen the wait, force fake frame counts or call a passing retry a fix. Next narrow diagnostic observes actual draw calls/count, instance identity, visibility, reduced-motion and GPU context/fence readiness through the existing reduced-motion-to-chat-open path. No product edit or lifetime change.
