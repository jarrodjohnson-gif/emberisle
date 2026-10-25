# Keyboard home and settled-close review fixes

Codex-p (GPT-6.1 Sol), 2026-10-25. Existing PR #905 / issue #627.
Responds to Opus review 6398535539 of 68000dd. Original Gemini/adoption authorship preserved.

Fail-first commit b623596 adds real CDP empty-board double taps in overhead/diorama and a blurred 844→500→840 short close followed by a later 820px resize. Both double taps invoke goHome. Five new assertions fail before runtime edits; all 44 previous keyboard checks pass. Raw failing-keyboard.log exits 1.

The fix makes goHome a no-op while cropped, as explicitly permitted by the desk. A 600ms quiet settle after blur/resize restores the full projection, then normal sizing, when no input/textarea has focus. Each resize restarts the timer; field focus is checked at expiry. Disposal clears the timer. Pan, focus transfer and continuing keyboard close frames remain covered. No applyPose or unrelated renderer function changes.

Focused final keyboard: 56 checks pass (44 original plus 12 new). The first fixed run has one failing NEW scale-change expectation: this width-limited island legitimately keeps its scale between 840 and 820px. The new check now measures a changed fit.top and requires the live frustum to equal that new fit, along with unchanged pan and the canvas aspect. The original 44 assertions/tolerances are unchanged. Both raw runs are retained as keyboard-focused.log (exit 1) and keyboard-focused-final.log (exit 0).

Hole safe-area cases now explicitly set hidden.plenty to both 0 and 1 and assert the landscape left/right overrides. Every previous sweep width, error guard and 0.5px tolerance remains. Focused final hole: 600 size/phase pairs, 0 failures. The earlier hole-focused.log exits 1 after a Vite navigation destroyed its execution context in the unchanged sweep; it recorded no assertion failure. The isolated rerun writes outside the checkout, with no concurrent build/source/log writes, and passes. No CI job was retried.

Focused typecheck/build/size pass. Frozen fresh main baseline b90290abf4a3cd8c63bddf1e7f939e75b71c2418: index 124284 B gzip, IslandCanvas 200566 B. Focused working build: index 124286/125200 B (+2/400), IslandCanvas 201101/202500 B (+535/662). All budgets and lockfiles unchanged. Main's renderer is byte-identical to the already-merged 3db641d renderer, so no additional main merge was needed.

Actual local runtime: Node v24.19.0, repository-pinned Playwright 1.63.0 and Chrome for Testing 153.0.8010.12. No Node 22 local claim. Long browser proofs run strictly serially. The focused checkpoint was published as d332c24 before the independent fresh-clone checks below.

Independent fresh clone /workspace/emberisle/work/p-review-verify905, frozen root/server installs: all 12 affected checks pass at d332c2441b5801ae55cc5e9eeedcecade16523f9. Keyboard56, pan, hole600/0, rotate, rotate-overlays, HUD safe-area, client, typecheck, registered146, local loosen1-none, build and size all exit 0. Commands, actual output, timing, tested commit and exit code are in fresh/.

Proof-only reinforcement 18c88aa adds a check that the live overhead frustum equals the full fitted frustum immediately after the 840px quiet settle. The already-fresh frozen clone fetched/checked out that exact commit and keyboard-final.log passes 57 checks. Runtime bytes are identical to the full-suite d332c24; every previous keyboard assertion remains. scope-final.json records hashes and scope guards; no unrelated retest is claimed on this proof-only commit.

Two fresh loosen setup errors are retained, without changing the detector. First, the single-branch clone lacked b90290ab (loosen-initial-missing-base.log, exit 1). After fetching main I incorrectly compared the old PR directly with newer main, which flags newer main server-seat/sweeper lines absent from the older branch (loosen-wrong-nonancestor-base.log, exit 1). The final local comparison uses the actual PR merge-base 3db641d and passes 1 changed proof, none loosened. This is the local merge-base check, not CI's synthetic-merge/first-parent comparison. Size separately uses the fresh current-main b90290ab build. No detector, assertion, timeout or baseline policy was edited.

Final evidence-only head receives a separate footer-sensitive build/size/hash/clean audit after commit; its exact output is posted on the PR. Required exact-head CI and fresh independent Opus review remain pending.

Real iPhone Safari and Android Chrome owner acceptance remains UNSATISFIED before merge. Required real-phone sequence includes two-finger pan, opening chat then PlaceList input, closing the keyboard, and double-tapping empty board while the keyboard is up. Cloud DOM-focus/viewport/CDP checks do not satisfy that gate. Fresh independent Opus review and green exact-head CI remain required. No builder merge, main push, force-push, settings change, test weakening or budget increase.
