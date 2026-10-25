# Usage-limit checkpoint — Codex-p

The GPT-6.1 Sol coding worker reached its usage limit during #944. This is an unfinished checkpoint, not a ready implementation.

Baseline `71ba117c390e66bf33f03644236dfad1be3b8c68` was pushed to `codex/host-player-944` before runtime edits. Its real-host proof fails on main `d37d596` because a different player's second open table is refused. The failing log is committed under `reproduction/`.

This checkpoint preserves the interrupted candidate in three files:

- `server/open-table.mjs`: a set of open listings replaces the process-wide single listing.
- `server/host.mjs`: create-time checks inspect live current host seats, using remembered guest seat bearers or an already-verified profile identity.
- `src/lib/net/table.ts`: up to 64 host-seat bearers are remembered per normalized websocket endpoint; welcome/handoff updates that memory. Create sends those same-endpoint hints. Global saved-seat credentials are never sent to another endpoint.

No store, handoff, media, lockfile, existing assertion, budget or CI changes were made. The new server proof is not yet registered. No browser proof or ready PR exists for #944.

Raw interrupted-worker output is copied beside this README. The candidate server log ends with `host-player-prove: 18 checks passed`. The typecheck log contains the TypeScript invocation without errors. Exit-status records are unavailable; these logs do not establish complete validation. No fresh-clone, browser, full-server, build, size or mutation validation is claimed for this candidate.

Resume only after fresh rules, hub, desk, claims, remote heads and PR feedback checks. Main had advanced to `251d20bf5a9547a441c745b011c29cc8b169364f` at checkpoint verification; this branch has not merged it.

Next steps:

1. Address fresh #1111 desk feedback first: merged #1119 fixes cue cache errors only. Background music errors, stalled downloads, reload silence and phone interruption remain separate failing-proof investigations.
2. Reclaim #944 only if eligible. Review this unvalidated identity contract. An authenticated profile B should not be accidentally blocked by remembered profile A bearers. Clarify guest per-seat continuity limits, multi-tab behavior, inherited host roles and create-time enforcement.
3. Build the missing browser identity-isolation proof. Test same-host reuse, cross-host non-disclosure, handoff, multiple bearer hints, blocked storage and authenticated-profile precedence.
4. Register both new proofs in package.json and CI. Keep the old global-cap assertion replacement in its own commit, with an old/new PR table citing owner comment 6326764159 and the October 25 decision. All other existing assertions stay.
5. Run fresh-clone required server/browser/static/build/size checks serially where required. Preserve every existing ceiling and allowance. Open one ready #944 PR only after those checks pass.

No claim is made that clearing guest storage cannot bypass anonymous identity continuity. No new authentication design is approved here. Keep #1108 leave/handoff and #1110 loadState work separate.

The completed work from this continuation remains on `codex/profile-derive-error-1008` at `4ba2a63` (#1009, CI green) and `codex/audio-recovery-1111` at `88bda3c` (#1119, merged by the desk after green CI). Their committed validation remains separate from this unfinished candidate.
