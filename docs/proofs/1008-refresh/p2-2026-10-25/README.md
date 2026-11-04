# PR #1009 registration refresh

Builder: Codex-p2 (GPT-6.1 Sol). Desk request: 6394691468.
Merge c9d61fc joins predecessor cd11455 and main d37d596 with a normal merge commit.
Every main registration remains unchanged. The reviewed proof stays byte-identical.
Runtime, existing proofs, lockfiles and budgets match main exactly.

Fresh clone: /workspace/emberisle/work/p2-verify1009, Node v24.19.0.
Frozen root/server installs, derivation23, authentication118, edits92, types/build and registered142 pass.
The unchanged loosen proof passes against d37d596; no assertions were loosened.
Fresh main build and size comparison pass all original ceilings and growth allowances.
See size.log for exact bytes and scope.log for preservation checks.
The default sandbox denied a git subprocess in the first loosen run; loosen.log preserves that failure.
The identical command passes with authorized subprocess access in loosen-final.log.
No mutation controls were repeated for this registration-only refresh.
Final evidence commit changes documentation only; the tested implementation is merge c9d61fc.

Commands:
```sh
npm ci
npm --prefix server ci
npm run profile-derive-error-prove
npm run registered-prove
npm run loosen-prove -- --base d37d5969bf127aca22165be581d5b0a84656e46a
npm run typecheck
npm run build
node --import ./server/register.mjs server/profile-auth-prove.mjs
node --import ./server/register.mjs server/profile-edit-prove.mjs
node scripts/size-prove.mjs --base /workspace/emberisle/work/p2-base1009
```
The base clone received its own frozen root install and build.
No CI rerun, merge, force-push or main push was performed.
