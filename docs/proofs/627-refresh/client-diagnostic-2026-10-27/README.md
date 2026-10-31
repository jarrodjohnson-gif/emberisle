# Passive client diagnostic after authorized resume

parent: Codex-p. User reported94% five-hour and36% weekly remaining and explicitly resumed work. Those percentages are user-reported, not tool-observed. Prior workers returned usage errors; the resumed p2 terra worker can work and is limited to #873. Sol remains paused.

One candidate run and one main run, serially under /tmp/emberisle-team-browser.lock, using the same external client-observer.mjs, pinned Chromium153.0.8010.12, CHROMIUM_PATH unset, frozen root/server installs. Candidate frozen f13f52344e295aa5a984bf4d6b3e9972d2b0fe27; independent main017962a8d606ae39de97466b3b065c93635b0009. Existing src/scripts/package/CI/lock hashes are unchanged before/after each run. Helper reviewed before execution: event listeners plus interception of only title-card wait rejection; original wait invoked once with same arguments, original error rethrown, read-only post-failure snapshot bounded1200ms. Network URLs strip query/hash in events. No fixture, delay, DOM, routing or assertion changes. Synchronous observer I/O can affect timing, so these diagnostics are not equivalent proof acceptance or frequency measurements.

Command per clone:
```
env -u CHROMIUM_PATH PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers EMBER_CLIENT_ROOT=<clone> EMBER_CLIENT_TRACE=<external-jsonl> node --import /workspace/905-observer-resume/client-observer.mjs scripts/client-prove.mjs
```
Actual results:
- Candidate exit1,59.43s. Missing-table case passed; host-down title-card wait failed at the unchanged6000ms timeout. Before the failure,29 script requests report net::ERR_INSUFFICIENT_RESOURCES. Post-failure snapshot has no window.__emberisle state (screen/mode/restoring/net are null), saved-seat presence true, title-card count0. Two WebSocket frames with type `error` were recorded under the helper’s `vite-ws-frame` label. That listener watches every socket, including the game host: it does not establish that these were Vite errors. No error payload or per-frame socket URL was captured, so their origin/meaning remains unclassified. This occurrence failed with the app uninitialized; it does not show a restore timer stuck true.
- Main exit0,68.44s, `live seat, host down: title card after3131ms`, `client prove ok`. No requestfailed event appears in its trace.

These observations narrow this occurrence. They do not establish why Chromium exhausted resources, prove the keyboard diff caused it, explain every prior import failure, or erase the original unchanged client failures. #1166 remains unresolved. No product fix or test workaround is claimed.

Separately, documentation-head620d831 CI40454543207 fails browser-b(presentation), job122024859000, lobby-layout-prove167: 375x667 Copy button has7.3/7.3px text padding, required8px. Its client-prove and keyboard-fit steps pass. The failed CI excerpt is retained. Lobby component/styles/proof are byte-identical to main017962 in the validated candidate; no unrelated-cause classification or automatic retry. Next: bounded original-proof baseline comparison and ownership check before any fix. Fresh review and physical-phone acceptance remain pending.

All logs, traces, helper, results and before/after hashes are losslessly retained in raw/*.gz with records.json. Manual diagnostics are not new proofs; registered client-prove remains unchanged.

— Codex-p
