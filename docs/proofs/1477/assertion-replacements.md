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

Hosted CI follow-up: profile-recovery-ui-prove also names the removed summary control. Recovery save-screen Done and all tick gating remain unchanged.

| File and original line | Old | New | Why |
|---|---|---|---|
| scripts/profile-recovery-ui-prove.mjs:132 | `` const button = [...d.querySelectorAll("button")].find((b) => b.textContent.trim() === main); `` | `` const button = [...d.querySelectorAll("button")].find((b) => main === "Close" ? b.getAttribute("aria-label") === main : b.textContent.trim() === main); `` | The approved icon-only Close uses its exact accessible label; all other primary controls still match exact text. Every geometry and44px check remains. |
| scripts/profile-recovery-ui-prove.mjs:198 | `` await fits(page, "Done", `${size.name} summary`); `` | `` await fits(page, "Close", `${size.name} summary`); `` | Replace only obsolete signed-in summary control; recovery save Done remains. |
