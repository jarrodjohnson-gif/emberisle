# Profile writer lock: main refresh

Normal merge `de97c60` incorporates main `aeeb4134b1be24f7d3472125b8893ac2d9bd5b27`.
This refresh resolves package/CI conflicts only.
All main commands, conditions and eight browser legs remain intact, plus the lock proof once.
The four implementation/fixture files match previous integration `44730fb` byte-for-byte.
The lock algorithm and published-owner tracking match Opus-approved `470c4c7` byte-for-byte.
Scope hashes are in `scope.log`.

The reviewed exclusion algorithm publishes a complete private nonempty owner directory atomically.
Contenders remove only the exact dead marker before removing an empty directory.
Unknown same-process-PID markers recover earlier processes; this process's published markers remain live.
The store keeps ownership until process death so pending writes remain protected.
The existing one-host-per-store/PID-namespace constraint is recorded in `docs/design/profiles.md`.

The separate fixture changes still need independent review:
- Authentication privacy checks read nested marker bytes; all original assertions remain.
- Direct-store edit phases run in separate real processes, with the first exiting before reopening.
- Their clock and profile checkpoint persist; an added assertion verifies distinct process IDs.

These fixture changes are unchanged from `44730fb`; this refresh adds no new runtime or proof behavior.
No assertion, production limit or existing budget changed.
Prior negative-control results are historical, not rerun for this main-only refresh.
The earlier End-key/turn-gain CI blockers have their separate fixes on main.
This report does not claim fresh browser results.

Fresh clone: `work/verify1023-oct25`, Node v24.19.0, frozen root/server installs.
Commands and complete outputs:

```sh
npm ci
npm --prefix server ci
npm run profile-lock-prove
npm test
npm run profile-pin-queue-prove
npm run profile-unknown-cap-prove
npm run profile-reservation-recovery-prove
npm run registered-prove
npm run loosen-prove -- --base aeeb4134b1be24f7d3472125b8893ac2d9bd5b27
npm run typecheck
npm run build
node scripts/size-prove.mjs --base /path/to/built-main-aeeb413
```

All 39 commands in the native server chain pass, including auth118, write47, seats143 and edits92.
The lock regression passes56; queue83 and unknown-cap22 pass.
Reservation recovery passes two parent checks plus two12-check native children.
Registration137, loosen2 (none loosened), types/build and size pass.
Built merge index:125190/125200 B gzip, +3/400 against freshly built main125187.
Every existing chunk ceiling and allowance passes.
Runtime sources and budgets match main outside the previously reviewed lock change; footer hashes affect gzip output.
Final evidence commit changes documentation only.
Exact-head CI and independent fixture review remain required; no builder retry, merge or main push.
