# Profile permissions: current-main refresh

Normal maincaf88c6 merge at2f9eba3 resolves only the two registration conflicts.
All main commands, conditions and matrix legs remain; permissions runs once.
The strict compatibility proof matches reviewed10efa80 byte-for-byte (`scope.log`).
No runtime, existing proof, security limit or budget changed.

Fresh clone `work/verify1019-oct25`, Node v24.19.0, frozen root/server installs.
Permissions15 checks and four native temporary descriptors pass under umask000.
The existing durable-write proof passes47 checks.
Types/build/registered138/loosen0 and all size ceilings/allowances pass.
Built merge index:125191/125200 B gzip, +1/400 against freshly built main125190.

Commands: `npm ci`, `npm --prefix server ci`, `npm run profile-permissions-prove`,
`node --import ./server/register.mjs server/profile-write-prove.mjs`, `npm run typecheck`,
`npm run build`, `npm run registered-prove`,
`npm run loosen-prove -- --base caf88c6d7254bfd1beab69e9e2c02a981afc056c`,
`node scripts/size-prove.mjs --base /path/to/built-main-caf88c6`.

This refresh runs main's actual legacy-file lock implementation.
The directory-lock16 checks and public-marker controls remain prior approved-runtime evidence, not fresh results.
Earlier mutations were not repeated for registration-only resolution.
Final evidence commit changes documentation only. Exact-head CI and independent review remain separate.
