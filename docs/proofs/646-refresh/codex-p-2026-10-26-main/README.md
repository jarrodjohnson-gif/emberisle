# Public Need current-main maintenance

Codex-p (GPT-6.1 Sol), 2026-10-26. Existing PR #873 / issue #646.
Continues the published Codex-open-table-833 adoption; original Codex-858 and predecessor authorship remains intact.

## Eligibility and model pin

Fresh issue/PR/comments/reviews/refs were checked against UTC before code or label changes.
Last claim/PR activity was2026-10-22T20:23:47Z, PR comment6350503424.
The head commit was2026-10-22T18:34:05Z; no newer claim, resume, review or push existed.
At2026-10-26T01:08:53Z, the48-hour pin expiry had passed2026-10-24T20:23:47Z.
LANES91 explicitly says the first builder to notice removes an expired pin and records it.
Only model:opus was removed; every other label/status remained intact.
The rule, timestamps and original labels are recorded in eligibility.json.
Expiry record: issue comment6405986968; continuation:6405987582.
No new model pin, duplicate adoption claim, invented claim success or another agent's release occurred.
No competing current Need handler/chip builder was found.

## Reconciliation scope

Normal merge4232a45b5921f1754566414660b2684a8425a9ad has these parents:

- Published Need head18f6794c01059051108f913016522751a4b61b89.
- Actual main9bde9861490662ef3e95e90db5cfa2dc7874fd55.

Conflicts were additive: host import, CI registrations, size ceiling and seven size fixtures.
Host retains both the Need and current open-table imports.
CI retains every main step, plus the server Need step and browser Need once in suitea3.
Every fixture retains every main value and the original SeatNeeds1780 entry.
Size policy remains exact main plus the original SeatNeeds1900 ceiling.
No ceiling, allowance, fixture baseline, dependency or lockfile was raised or refreshed.

Strict source audit passes:

- Every main file is exact outside the existing Need hooks/contracts and shared registrations.
- Host normalizes to exact main after removing only the original Need import/projection/persistence/transition/handler additions.
- Network table normalizes to exact main after removing only the original Need interface/send additions.
- Own Need modules, both proofs, TradePanel and SeatRail remain byte-identical to18f6794.
- Both lockfiles remain exact main.
- All main package/CI registrations and fixture values remain intact.

scope.json records checks/blob hashes; scope.py documents the normalization audit.
Main profile, connection-health, lobby-leave, transport and seat behavior remain preserved.
#997 result journaling and #970 Ruffle MIME hooks remain separate unmerged host work.
#867 public gains, #706 turn markers and #883 Table/Bank routes remain independent branches.
No unmerged feature was ported; #883 must preserve NeedPicker when branches later reconcile.
No new design, layout, proof, runtime attribute or assertion change was added.
The reserved army proof and other unrelated proof sources remain exact main.

## Validation

Independent fresh head/base clones used frozen root/server installs.
All required checks pass at exact4232a45, with fresh size base9bde986:

- Typecheck, registered148, size-delta, default loosen1-none, build and size.
- Full npm test,311.00s, including current leave and profile-seat177 checks.
- Dedicated server Need proof,0.84s; it is not included in npm test.
- Browser Need proof,11.09s; unchanged trade proof,88.69s.
- Clean checkout after all server/browser processes exited.

The full server suite also passes profile-auth118, profile-edit92 and open-table slot cleanup checks.
Those already-passed component checks were not rerun individually.
Browser Need covers real hosted seats,250ms delayed echoes, rapid selection, public privacy, rejoin and matching-trade clearing.
It also covers local bank-trade clearing, two-own-turn expiry and the unchanged map hole.
Existing assertions, tolerances, deadlines, inbox guards and stable-state comparisons remain exact18f6794.
No broad unrelated browser suite or old mutation-control repetition is claimed.

Node24.19.0, pinned Playwright1.63.0/default headless shell153.0.8010.12.
CHROMIUM_PATH is omitted; PLAYWRIGHT_BROWSERS_PATH selects the installed pinned browser.
No Node22 local claim.
Browser proofs ran strictly serially, with no checkout writes, builds or evidence copying during Vite activity.
Commands, exact commits, timings, raw output and exits remain in fresh/.

Actual merge-head size output:

```text
ok   index growth: base 124341 B, PR 124402 B, +61 B, allowance 400 B
ok   SeatNeeds: 1.77 kB gzip, ceiling 1.90 kB
size-prove: all chunks inside ceiling and growth allowance
```

The optional whole-parent whitespace audit exits2 on inherited main raw logs/tool whitespace.
Those main files remain byte-identical; no raw log or unrelated source was reformatted.
The reconciliation-only whitespace audit against current main exits0.
Both diagnostic logs and their status remain here; this was not a product-test failure.
The initial attempted push before that diagnostic was scoped correctly was up-to-date at18f6794.
The completed merge was subsequently committed and pushed normally.

The evidence-only head receives a separate footer-sensitive build/size/source/clean/remote audit.
Its exact output is posted on the PR, avoiding recursive evidence commits.

Fresh independent Opus review, green final-head CI and OWNER PICTURES ACCEPTANCE remain required before merge.
The earlier phone/844x390 cramped-chip/picker layout observations remain owner judgements.
No owner acceptance, new layout or taste decision is claimed here.
No builder merge, main push, force-push, new CI retry or settings change occurred.

— Codex-p

## Lossless server-output storage

The original full server output is stored as `fresh/server.log.gz` to keep the review diff compact.
Decode it with `gzip -dc fresh/server.log.gz` from this directory.
All 61302 original bytes are preserved; decoded SHA-256 is `a56fcc34088ff568927af538c27fab277598bd7acbe6158a06d0ce01adf22238`.
This storage change runs no tests and changes no recorded result.
