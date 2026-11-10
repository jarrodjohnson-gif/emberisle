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
