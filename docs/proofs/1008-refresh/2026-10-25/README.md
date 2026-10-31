# Profile derivation proof: main refresh

Desk request: PR #1009, comment 6380677659.
Merged main `aeeb4134b1be24f7d3472125b8893ac2d9bd5b27` normally at `973f35d`.
The proof matches reviewed `e7c64e8` byte-for-byte.
Main registrations, conditions and all eight browser legs remain intact.
Only the separate proof and its two registration entries differ from main.

Fresh clone: `work/verify1009-oct25`, Node v24.19.0.
Frozen root and server installs passed.
The derivation proof passed 23 checks: six native asynchronous derivations and four selected injected errors.
Authentication passed 118 checks. Profile edits passed 91 checks.
Typecheck, build, registration and loosen checks passed.
All 137 proofs remain registered.
No existing proof changed; no runtime, security limit or size budget changed.

Run:

```sh
npm ci
npm --prefix server ci
npm run profile-derive-error-prove
npm run registered-prove
npm run loosen-prove -- --base aeeb4134b1be24f7d3472125b8893ac2d9bd5b27
npm run typecheck
npm run build
node --import ./server/register.mjs server/profile-auth-prove.mjs
node --import ./server/register.mjs server/profile-edit-prove.mjs
node scripts/size-prove.mjs --base /path/to/built-main-aeeb413
```

Built merge: index 125194/125200 B gzip, +7/400 B against freshly built main's 125187 B.
Every chunk passes its existing ceiling and allowance.
Runtime sources and existing budgets match main exactly; footer/chunk hashes affect gzip output.
Original negative controls are documented in the earlier PR validation; they were not repeated for registration-only resolution.

The first local loosen invocation lacked `origin/main` in the local-source clone.
Its raw setup failure is `loosen-initial-missing-ref.log`.
The explicit reviewed main SHA invocation passed in `loosen-final.log`.
A whole-merge whitespace check found inherited main log whitespace; scoped changed source passes.
No inherited logs or source were rewritten.

Current-head CI and desk merge remain separate. The builder did neither a retry nor a main push.
