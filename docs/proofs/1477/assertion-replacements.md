# Approved close and accessible-name equivalents

Authority: issue1477, owner-approved1449 functions12 and18; DECISIONS2026-10-25.
The runtime change is in separate commitdc6f8752.
Recovery-code Done in saveCode() is intentionally preserved; Continue as guest remains on signed-out views.
Visible menu-row text expectations stay unchanged. Close/Escape/focus and distinct-icon checks are additive.
No geometry, refusal, privacy, deadline or tolerance check is removed.

| File and original line | Old | New | Why |
|---|---|---|---|
| scripts/profiles-ui-prove.mjs:250 | `` await sheet(one).getByRole("button", { name: "Done" }).click(); `` | `` await sheet(one).getByRole("button", { name: "Close", exact: true }).click(); `` | Owner-approved close/name equivalent; subsequent behavior checks remain. |
| scripts/profiles-ui-prove.mjs:291 | `` await sheet(one).getByRole("button", { name: "Done" }).click(); `` | `` await sheet(one).getByRole("button", { name: "Close", exact: true }).click(); `` | Owner-approved close/name equivalent; subsequent behavior checks remain. |
| scripts/profiles-ui-prove.mjs:330 | `` await sheet(blocked).getByRole("button", { name: "Done" }).click(); `` | `` await sheet(blocked).getByRole("button", { name: "Close", exact: true }).click(); `` | Owner-approved close/name equivalent; subsequent behavior checks remain. |
| scripts/profiles-ui-prove.mjs:514 | `` await sheet(coral).getByRole("button", { name: "Done" }).click(); `` | `` await sheet(coral).getByRole("button", { name: "Close", exact: true }).click(); `` | Owner-approved close/name equivalent; subsequent behavior checks remain. |
| scripts/profiles-ui-prove.mjs:559 | `` await sheet(kelp).getByRole("button", { name: "Done" }).click(); `` | `` await sheet(kelp).getByRole("button", { name: "Close", exact: true }).click(); `` | Owner-approved close/name equivalent; subsequent behavior checks remain. |
| scripts/table-menu-prove.mjs:144 | `` const report = menu.getByRole("button", { name: "Report a bug" }); `` | `` const report = menu.getByRole("button", { name: "Report a bug, opens GitHub in a new tab", exact: true }); `` | Owner-approved close/name equivalent; subsequent behavior checks remain. |
