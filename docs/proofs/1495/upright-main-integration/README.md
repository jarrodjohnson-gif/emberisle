# Current main integration

Tested sourcece3a0854a1366956cb7fa30e9adfedd617ff644a normally merges approved main974f4045.
Main authorship remains unchanged. Dependency locks and rule documents are unchanged.
Production source exactly matches main974f4045; no independently authored product/layout edits.
The existing chat proof blob remains59da8489e047870696639a764ae0093d0868ae56.

Actual results, every recorded exit0:
- Typecheck PASS.
- Registered-prove PASS,216 proofs.
- Canonical committed loosen-prove against974f PASS, one changed proof, none loosened.
- ONE complete full chat proof PASS269.4s, terminalchat prove ok, zero console errors.
  Pinned Node22.23.4/Chromium1243, cgroup2CPU plus100msbusy each200ms, team browser lock.
- Board-look PASS, original scene/draw/triangle/placement checks, zero console errors.
- Upright-table PASS,390x844/375x812 and rotation cases, original checks.
  Renderer checks run serially after chat under the same lock, without additional synthetic CPU load.

This is source-specific integration, not a causal fix for the historical15s frame or30s navigation failure.
It is not a continuation/reset of a stopped diagnostic series or20 full proof passes.
Earlier failures and independent narrow draft review remain recorded; PR1502 stays draft pending actual root validation.
