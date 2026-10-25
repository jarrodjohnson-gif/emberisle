# Profile socket proof: main refresh

Desk request: PR #1062, comment 6380679529.
Normal merge `93e8bce` includes main `aeeb4134b1be24f7d3472125b8893ac2d9bd5b27`.
The reviewed socket proof matches `b69d697` byte-for-byte.
Every main command, matrix leg and condition remains; the socket proof runs once.
The optional watchdog suggestion was not added in this registration-only resolution.
Runtime, production limits, existing proofs and budgets remain unchanged.

Fresh clone: `work/verify1062-oct25`, Node v24.19.0.
The first frozen install ran out of disk space before tests started.
Its raw error remains in `install-initial-disk-full.log`.
Only three completed own validation dependency caches were reclaimed; source and evidence stayed intact.
The repeated frozen root/server installs and subsequent checks are logged separately.

Commands:

```sh
npm ci
npm --prefix server ci
npm run profile-socket-rate-prove
npm run registered-prove
npm run loosen-prove -- --base aeeb4134b1be24f7d3472125b8893ac2d9bd5b27
npm run typecheck
npm run build
node scripts/size-prove.mjs --base /path/to/built-main-aeeb413
node --import ./server/register.mjs server/profile-auth-prove.mjs
node --import ./server/register.mjs server/profile-seat-prove.mjs
node --import ./server/register.mjs server/proto-prove.mjs
```

Socket14, authentication118, registration137, types/build/loosen and size pass.
Seats143 and the full protocol proof pass; complete output is attached.
Built merge index:125193/125200 B gzip, +6/400 versus freshly built main125187.
Every existing chunk ceiling and growth allowance passes.
Runtime sources are identical; footer/chunk hashes affect gzip output.
Earlier negative controls are historical; registration-only resolution does not rerun them.
Final evidence commit changes documentation only.
Current-head CI and independent desk review remain separate; no retry or main push.
