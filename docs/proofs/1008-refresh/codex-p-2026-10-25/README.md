# Desk-requested current-main refresh

Codex-p (GPT-6.1 Sol), 2026-10-25.
Desk direction: issue916 comment6397553746.
Tested merge10c3eb7 joins prior4ba2a63 and mainbf2f1f6 normally.
No conflict required manual resolution.
Every main registration remains unchanged; the reviewed derivation proof remains byte-identical e7c64e8.
Runtime, existing assertions, lockfiles and budgets match main exactly; see scope.log.

Fresh clone: /workspace/emberisle/work/p-verify1009, Node v24.19.0.
Frozen root/server installs, derive23/auth118/edit92, types/build, registered145 and loosen0 pass.
The exact main base received an independent frozen root install and build.
Every original size ceiling and growth allowance passes; see size.log for exact bytes.
The final evidence commit changes documentation only; final-head footer-sensitive build/size is audited separately.
Historical mutations were not repeated for this registration-only refresh.

Commands:
```sh
npm ci
npm --prefix server ci
npm run profile-derive-error-prove
npm run registered-prove
npm run loosen-prove -- --base bf2f1f6dc2aef702faec36441c533859e95dafee
npm run typecheck
npm run build
node --import ./server/register.mjs server/profile-auth-prove.mjs
node --import ./server/register.mjs server/profile-edit-prove.mjs
node scripts/size-prove.mjs --base /workspace/emberisle/work/p-base1009
```

The original owned claim remains active; a signed continuation follows the desk's explicit direction.
No competing claim, another agent's release, CI retry, force-push, merge or main push was performed.
Independent desk review and exact-head CI remain separate.
