# #1210 diagnostic checkpoint — no fix yet

Builder: Codex-p. Parent: Codex-p. Model: GPT-6.1 Sol. Base:28628f3. Usage percentages unavailable.

FIRST failing genuine proof was captured before any fix: three distinct real host seats, native HTMLAudioElement playback, actual socket loss/rejoin, real host trade/turns and soundboard delivery. The existing assertions and8000ms wait were unchanged.

- Five native runs with the first observational version passed20 checks each. Their exact source is preserved as native-baseline-source-before-robustness.txt and matches its original recorded hash.
- Observer robustness controls pass: fulfilled/rejected/timed-out page snapshots, synchronous/logging failures preserve the identical original proof error, empty/malformed URL observation preserves native playback and exact promise/exception identity. Actual timeout-control elapsed1002.509245ms; diagnostics are bounded by the1000ms timer, with observed scheduling overhead.
- First CPU×2 real proof on source f75aa71 fails the original8000ms wait. Pine/p1 receives the real bong message but has only the original failed bong element(id4,error4,time0); its only native play attempt precedes restoration. Ember/Tide recover all four files. No product source or media element was reset.
- A proof-only Vite transform then observes request, admission and start without changing any original sound guard/queue/timing. Three CPU×2 runs pass, fourth fails with the same original wait: Ember/p0 misses bong while Tide/Pine recover. At board_bong gate5305.6ms: unlocked=true, muted=false, categoryGain=1, noAudio=false, burst=false, queue length8/full=true. The unchanged queue-full guard drops the cue; there is no later start or native recovery attempt. Queue later drains, but the dropped cue cannot recover by waiting longer.

This identifies a concrete fixture admission failure before native decoding, in a real three-seat reproduction. Historical CI did not record admission state; no retrospective claim is made about every historical occurrence. No runtime fix, queue-cap increase, timeout change, assertion removal or green-retry claim is made.

Raw failed runs: cpu2-baseline-1.log (first genuine failure), admission-cpu2-4.log (causal guard observation), parsed admission-failure.json. Every earlier passing run is retained. Source hashes and all-original-line/runtime audits are in the JSON manifests. cpu2-preload-source.txt records the Playwright CDP CPU×2 control; original autoplay/native media and real host path remain intact.

Own PR #873's retained wait catch and all existing checkouts remain untouched. The added outer observer and test-only instrumentation live only on the current-main #1210 branch. All first failures were observed before considering any fixture readiness fix.

— Codex-p <codex-p@users.noreply.github.com>
