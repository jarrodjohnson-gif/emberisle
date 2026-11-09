# Connection-health clock initialization (#1493)

The proof installed a running clock and then asked it to pause at a Node wall-clock timestamp. Browser clock synchronization or protocol latency can put that timestamp behind the already-running fake clock. Playwright rejects that as `Cannot fast-forward to the past`, before transport cases begin. Original hosted failure: PR #1481 head47b4beff, run42612449519/job129144334724. The desk's unchanged retry passed; that was not a causal fix.

Use the public `page.clock.pauseAt(new Date())` automatic installation directly. There is no separately initialized current-time clock that can overtake the target. Existing fake transport clients are constructed afterward. All transport assertions, 137ms RTT, 3s deadline, 30s spacing, host and startup cases remain unchanged. No product code changes.

Pinned environment: Node22.23.4, Playwright1.63.0, Chromium1243. Serial browser execution uses `/tmp/emberisle-team-browser.lock`.

`clock-control-source.txt` is an archived temporary diagnostic, not a new permanent proof. It ran old/new initialization on separate blank pages with an extra browser evaluation of 0/25/100ms after capturing the target. The old sequence failed10/10 in each group; direct pause passed10/10 per group and preserved exact Date plus timer firing at137ms. The extra evaluation deliberately creates stale targets: this is controlled evidence, not an identical replay of the original CI sequence.

`first-full-proof.log` is one complete local passing affected proof. The expected failed dynamic imports are controlled production recovery fixtures; their later recovery assertions passed. The required20-run loaded full-proof series is still running and is not claimed complete here. Registration passed:214 registered proofs. Hosted current-head CI and independent review remain outstanding.
