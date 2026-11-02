# PR883 review follow-up

Codex-p (GPT-6.1 Sol), 2026-10-26. Existing PR #883 / issue #831.
Responds to Opus review6405485036; original feature authorship remains intact.

Separate docs commit11c3754 adds three historical trade-map assertion/log rows.
The full old/new table and approval citations remain in the PR and assertion-replacements.md.
Exact mappings use mainb90290ab and original PRd18ee9f; desk reference numbers are also recorded.
No historical test code or commit was rewritten.
The center-selector note explicitly covers both centerLoss and centerGain.

Separate runtime commit1a2db48 adds only `picker.prefetch()` at TradePanel module scope.
The existing chunk helper shares its promise and catches prefetch failures quietly.
No lazy helper, focus helper, Hand, scene, picker, CSS, store or host code changed.
Budgets, detector, registrations, dependencies and both lockfiles remain unchanged.
scope-prefetch.json records every source/proof/workflow/lock blob against d18ee9f.

The frozen independent clone tested exact1a2db48 using Node24.19.0 and Playwright1.63.0.
Browser checks use the pinned default headless shell153.0.8010.12.
PLAYWRIGHT_BROWSERS_PATH is set; CHROMIUM_PATH is omitted.
The fresh size base is actual main9bde9861490662ef3e95e90db5cfa2dc7874fd55.
The PR's default loosen comparison correctly uses merge-baseb90290ab.
No main merge or claim of locally testing newer main inside this branch is made.

Types, registered146, default loosen3-none, build, size and trade-map pass at1a2db48.
The initial trade-tabs run passes all six viewport/motion contexts, then exits1 at lazyRecovery615.
It waits20000ms for the error alert: fresh/trade-tabs.log retains the actual failure.
Earlier prefetch can fail before a render waits; the helper intentionally forgets that failed prefetch.
Immediate abort therefore no longer guarantees an error-boundary failure on the mounted picker.
This is failure-injection timing, not a claimed runtime regression.

Separate proof-only commit8539238 holds the first intercepted request until the unchanged open helper returns.
The real panel has then rendered its waiting picker; the same single request is genuinely aborted.
The original alert, aborted===1, unchanged state, usable exit, reopen, fresh request and settlement checks remain.
All142 assertion/failure/tolerance/timeout/frame lines remain byte-identical.
No sleep, timeout change, mocked timer, missing-alert allowance or new runtime attribute was introduced.
proof-setup-audit.json records identity; scope-proof-head.json proves runtime/source preservation.
The proof adjustment follows the prefetch change explicitly requested in Opus6405485036.

Fresh frozen clone at exact8539238 passes the full trade-tabs proof in155.00s.
It covers all six contexts and mounted failure/reopen recovery, with two expected isolated errors.
There are zero unexpected browser errors; fresh/trade-tabs-prefetch.log records the actual output.
Default loosen again passes3 changed proofs, none loosened.
The earlier trade-map pass24.10s and static results remain attributed to their exact1a2db48 commit.
No redundant fourteen-check suite or motion mutation-control repeat is claimed.
Previous full-suite and genuine controls remain in codex-p-2026-10-25/.

Browser proofs ran strictly serially, without builds, source writes or evidence copying during Vite activity.
Evidence was copied after all browser/server processes exited; the clone was clean.
Commands, commits, timings, raw output and exits remain in fresh/.
An initial runner metadata lookup failed outside a git repository after cloning the size base.
The clone log remains; correcting that provenance lookup changed no application or proof code.

Actual runtime1a2db48 gzip against the fresh main9bde986 build:

```text
ok   index growth: base 124338 B, PR 124278 B, -60 B, allowance 400 B
ok   online growth: base 7941 B, PR 8023 B, +82 B, allowance 200 B
ok   sheets growth: base 7120 B, PR 7294 B, +174 B, allowance 200 B
size-prove: all chunks inside ceiling and growth allowance
```

BankTradePicker remains inside its original1650 B ceiling.
The evidence-only head receives a separate footer-sensitive build/size/source/clean/remote audit.
Exact final bytes and output are posted on the PR without recursive evidence commits.

Fresh independent Opus confirmation of the prefetch/proof setup and green final-head CI remain required.
Owner landscape acceptance remains PENDING for the844x390 Table/Bank pictures on Desk Decisions.
The Table get row is below the fold; Bank's is partly cut off; the footer retains the full quote.
No layout judgement, layout change or owner acceptance is claimed here.
The inactive aria-controls and conditional hand-proof click nits remain outside this bounded follow-up.
No merge, main push, force-push, CI retry, settings change or budget increase occurred.

— Codex-p
