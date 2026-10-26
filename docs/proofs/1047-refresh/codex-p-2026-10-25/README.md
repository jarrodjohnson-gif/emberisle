# Profile seat alias proof: current-main refresh

Codex-p (GPT-6.1 Sol), 2026-10-25. Existing PR1048 / issue1047.
Tested merge039f303 joins original79ba06b and mainbf2f1f6 normally.
The entire original41-line alias/Origin block is byte-identical.
Removing that added block yields the entire current-main profile-seat proof byte-for-byte.
Every other source, existing proof, registration, lockfile and budget matches main exactly.
See scope.log for exact hashes and parent commits.

Fresh clone: /workspace/emberisle/work/p-verify1048, Node v24.19.0.
Frozen root/server installs pass.
Native profile-seat177, authentication118 and protocol proofs pass.
Types/build, registered144, loosen1-none and size pass.
Index124285/125200 B gzip, +6/400 B against independently built main124279 B.
The exact main size base was freshly installed/built during the immediately preceding1009 refresh; its raw logs are copied here.
All original ceilings and growth allowances pass.
The final evidence-only commit is audited separately for SHA/time footer-sensitive build/size and evidence hashes.

Former CI39982515840 failed chat-prove and longest-army-prove on79ba06b.
Historical job excerpts are retained with IDs120513429481 and120513429566.
The chat failure recorded total69, whole9, newestfalse at390x844.
The army failure recorded a null scenario fixture before browser work.
Current main includes the deterministic real-rules fixture fix e448575.
Fresh current chat and army proofs pass serially, unchanged.
Chat:167.0s, zero console errors;390x844 records total70, whole10, newesttrue,14px text.
Army passes every existing scenario/viewport and finishes longest-army-prove:ok.
No historical chat-cause or flakiness attribution is claimed from this passing local run.

Commands and native/browser exit statuses are in exit-status.json; every listed command exits0.
Root npm ci, server npm ci and the copied base install/build also exited0.
```sh
npm ci
npm --prefix server ci
node --import ./server/register.mjs server/profile-seat-prove.mjs
node --import ./server/register.mjs server/profile-auth-prove.mjs
node --import ./server/register.mjs server/proto-prove.mjs
npm run typecheck
npm run registered-prove
npm run loosen-prove -- --base bf2f1f6dc2aef702faec36441c533859e95dafee
npm run build
node scripts/size-prove.mjs --base /workspace/emberisle/work/p-base1009
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run chat-prove
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run longest-army-prove
```
The browsers use repository-pinned Playwright Chromium and run one proof at a time.
Original alias/Origin mutation controls remain historical; no logic changed in this mechanical merge.
No assertion, timeout, rate, budget, runtime or lockfile was edited.
Independent security review and exact-head CI remain required. No CI retry or merge was performed.
