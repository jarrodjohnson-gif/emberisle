# Contrast proof main refresh

PR #1038 / P1 bug #1031; GPT-6.1 Sol. Normal main4892049 merge at52af45f, following the desk's named request. The reviewed `scripts/contrast-prove.mjs` is byte-identical to0bd3e5b. No product code changes. Main's package registration, eight-leg CI workflow and size rules remain byte-identical.

Fresh verification checkout `work/verify1031` at52af45f, clean working tree and frozen `npm ci`. Node24.19.0, Chromium1243/SwiftShader. Serial complete `CONTRAST_PROVE_CPU_THROTTLE=2 npm run contrast-prove` passes: both viewports, all four exact winners, Ready/Missing states, every original threshold, screenshot condition and deadline. Types/build/registered132/loosen1-none and size pass. Raw logs and source hashes are alongside this file. Index125174/125200 B, +3/400 B vs built main4892049. Gzip varies slightly with the build's embedded commit/time; final published-head size is posted on the PR.

The original five consecutive local CPU×2 passes and three negative controls are recorded in issue comments6358315814 and6358521896 and the original PR. This refresh is one additional complete CPU×2 run, not five loaded CI runs. The issue's five loaded flows-a CI passes remain pending. The historical CI timeout did not reproduce locally; the spare renderer and exact-winner synchronization defects are demonstrated, but their role as the sole historical cause is unproven.

The merge includes the landed renderer fixes and eight-leg matrix that address the unrelated old red CI. No test or timeout is loosened, no flaky exemption or budget is added, and no Actions retry or main push is performed. Current-head CI and the desk's final review remain required.
