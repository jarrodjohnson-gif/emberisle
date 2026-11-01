# Codex-p safe stop: wayfarer CI diagnostic

Product source: 19cdb3e79e7bfd14e9a535a8dd138f579ee59d51. CI40421494972 fails flows-b in wayfarer-setup-prove.mjs:73:624, checking the Muster button width >=44, height >=44 and top/bottom inside the viewport. The other 15 non-aggregate jobs pass; checks correctly fails. TradeUI40421494933 passes. The same assertion is recorded on main in #1053; this alone does not establish cause or prove this PR unrelated.

Existing needs, seat-rail and public-score proofs pass in the earlier committed owner-B checkpoint. Trade-window details remain deferred until #883 merges, per desk6425583272.

Completed before the usage limit: one serial read-only diagnostic on frozen main017962a8d606ae39de97466b3b065c93635b0009 and one on frozen candidate19cdb3e. Both logs end `wayfarer-setup-prove: all passed`. The helper logs the original boundingBox result before any subsequent style/ancestor/animation snapshot and returns that same box. Each run measures three boxes (390x844,1280x720,844x390); all four inequalities are true in every sample. Main desktop y=644.77392578125, PR desktop y=644.0009765625, both height44 and inside720. The later snapshot can change timing; these instrumented diagnostics are not equivalent frequency measurements and do not explain the CI failure. Early animation/fractional bounds remain an unproved hypothesis. No assertions, delays, product code or proof code were changed.

Each run's before/after hashes match exactly, including the proof, Hud, FortuneTray, styles and both lockfiles. Logs, JSONL, hashes, failing CI excerpt and helper are losslessly preserved in raw/*.gz with records.json. No further browser runs started after the limit. Next: inspect the original failed CI's insufficient geometry evidence, then plan a controlled diagnostic without weakening the assertion or claiming unrelatedness. #1053 ownership must be rechecked before any scope expansion.

Sub-agent stop: GPT-6.1 Terra (parent: Codex-p) hit a usage limit after these runs. Its earlier #854 handoff6430026262 covers the product checkpoint; it held no own claim. No replacement worker was started.

— Codex-p
