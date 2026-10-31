# Review assertion equivalents

Approved by the 2026-10-25 decision and desk review on #1117. Original line numbers refer to origin/main before the title migration.

| File:line | Old | New | Why |
|---|---|---|---|
| `scripts/watch-ui-prove.mjs:262` | Throw if Watch exists with a three-character code. | Require exactly one Watch button, disabled with a three-character code. | The approved title always shows Watch; the original error-sequence, lobby refusal and title-screen checks still prove that an incomplete code sends nothing. |

The original ten replacements are tabulated in [README.md](README.md). The rows below document every additional probe/setup edit requested by desk comment 6394469697. No detector, threshold, timeout, accessibility or failure check is bypassed.

| Base file:line | Old | New | Why |
|---|---|---|---|
| `scripts/title-prove.mjs:50/73` | Resolve root `--color-fg` and collect buttons whose **computed background** equals it. The first PR version temporarily used `classList.contains("bg-fg")`. | Resolve approved `#285550` and collect buttons whose **computed background** equals it; class-only probe removed. | Measures the real new primary fill, rather than a class name. Exact primary-button-set assertion remains. |
| `scripts/title-prove.mjs:92/97/101` | Watch absent at 0/3 characters; available at 4. | Watch visible **and disabled** at 0/3; explicitly enabled at 4. | Retains the input-validity gate and all polite live-region checks. |
| `scripts/title-chunks-prove.mjs:72` | Wait for optional module request while title is idle. | For WayfarerOptions only, press Wayfarer rules before waiting for the request. | The rules body now loads when its sheet opens; held/failed network interception and deadline remain. |
| `scripts/title-chunks-prove.mjs:125` | Click settings `summary`. | Wait for Wayfarer rules dialog (opened by the controlled fixture). | Same held-module test, inside the approved sheet. |
| `scripts/title-chunks-prove.mjs:129/130` | Iterate Practice/Online/Hotseat, find `<label> wayfarer` combobox. | Iterate Play against bots/Host a table online/Pass this device, find exact label. | Same three `inputValue() === "on"` assertions. |
| `scripts/title-chunks-prove.mjs:133` | Select Off on Online wayfarer. | Select Off on Host a table online. | Same store action, selected value and online store check. |
| `scripts/title-chunks-prove.mjs:138/139` | Press Host after optional settings fail. | Close rules sheet, then press Host after optional settings fail. | Retains real hosting and lobby-arrival failure isolation. |
| `scripts/wayfarer-setup-prove.mjs:30` | Initial wait for Play. | Initial wait for Play against bots. | Renamed entry, same wait. |
| `scripts/wayfarer-setup-prove.mjs:32` | Open settings summary. | Open Wayfarer rules button. | Entry moved into the approved sheet. |
| `scripts/wayfarer-setup-prove.mjs:38` | Map ai/hotseat/online to Practice/Hotseat/Online wayfarer. | Map them to Play against bots/Pass this device/Host a table online. | Same selectOption(mode), 44px geometry and AA contrast checks. |
| `scripts/wayfarer-setup-prove.mjs:42` | Press Play/Four seats, one table/Host a table from disclosure. | Close rules, then press Play against bots/Pass this device/Host a table. | Actual creation and all rule/persistence checks remain. |
| `scripts/wayfarer-setup-prove.mjs:60` | Set three old-labelled choices Off. | Set three renamed choices Off, then close sheet. | Same three choices and Off value before sticky-choice tests. |
| `scripts/wayfarer-setup-prove.mjs:67` | Return to title, wait Play, open summary. | Return to title, wait Play against bots, open rules sheet. | Same menu reset path. |
| `scripts/wayfarer-setup-prove.mjs:72` | Open summary, set Practice Off, press Play. | Open sheet, set Play against bots Off, close, press Play against bots. | Same no-target fortune fixture and exact resulting-state assertion. |
| `scripts/chat-prove.mjs:467` | Width vw−24, left≥11, bottom>vh−20. | Width vw−32, left=16±1, bottom=vh−16±1. | Approved portrait margins; tighter position checks. Original 55% height limit at :466 is **unchanged**; card trimmed to 464px by padding. Lobby geometry below is untouched. |
| `scripts/chunk-fail-prove.mjs:262` | Preserved link field, empty later field, Watch count 0. | Same field checks, Watch count 1 and disabled, plus bots primary. | Always-visible idle Watch; retains stale-link/reload and primary checks. |
| `scripts/chunk-fail-prove.mjs:267` | Empty field and Watch count 0 after reload. | Empty field and Watch count 1 and disabled after reload. | Same stale-code failure check for the approved visible disabled control. |
| `scripts/polish-tokens-prove.mjs:84/85` | `buttonStyle(page, "Play")`. | `buttonStyle(page, "Play against bots")`. | Only selector changes; exact radius 8px, duration 0.08s and easing assertions stay. |
| `scripts/reflow-prove.mjs:63` | Locate `3 bots, no network`. | Locate exact `Just you and three bots. No network needed.` | Same one-subtitle, visibility, viewport and reflow assertions; HUD tests untouched. |
| `scripts/contrast-prove.mjs:48–82` | Probe old button/helper labels; sample raw transparent backgrounds/root surface and source-selected error token. | Probe renamed labels, enable Join using ABCD, render an error, measure actual text and card colors; composite transparent ancestors. | Measures the painted neutral-card background and actual enabled-control/error colors. All 4.5:1 thresholds, island pixel checks and failure conditions stay. |
| `scripts/contrast-prove.mjs:106` | Scan EmberisleApp for forbidden text-accent/text-sea classes. | Scan EmberisleApp **and** extracted Title for the same forbidden classes. | Retains source guard after component extraction. |
| `scripts/pages-prove.mjs:44/51–54/68–70` | Wait Play; read Online wayfarer inline; arm audio waiter before Play. | Wait Play against bots; open rules, read Host a table online and close; arm audio waiter before the **first** sound-producing rules click. | First click fetches/caches audio; subsequent Play can reuse it. Original 5000ms timeout, prefix, HTTP 200, manifest/icon and zero-error assertions stay. |
| `scripts/title-layout-prove.mjs:9` | Default output `docs/proofs/1102`. | Default `test-results/title-1102`; explicit `TITLE_PROOF_OUTPUT` may capture committed evidence. | Routine proof runs leave committed screenshots alone. |
| `scripts/connection-health-prove.mjs:483/484` | Read failed-module URLs immediately after store fallback. | Wait with the existing `until` helper for both preload reports, then run the **unchanged exact URL-set assertion**. | Lazy Title mounts its optional discovery parent after store recovery. Wait for the render/import phase; do not remove either failure check or alter any deadline. |
| `scripts/connection-health-prove.mjs:429/472` | Click Play in the cancellation and quiet-peer fixtures. | Click Play against bots. | Two selectors introduced by the main merge; every transport nonce, timing, health, geometry and failure assertion stays. |
| Existing click/wait/label probes across the migrated scripts (including chat, chunk-fail, polish, contrast, client, hotseat, haptics, install, lobby, open-host/open-table, visual and scene proofs) | Play; Four seats, one table; old Wayfarer labels. | Play against bots; Pass this device; approved rules labels, with sheet open/close only where necessary. | Selector/setup migration only. All original behavioral, geometry, accessibility and failure predicates, timing limits, seeds and loops remain. |


Historical `main-failing-control.log` and `wayfarer-existing.log` replace the personal workspace prefix with `<repo>/`; results and failures are retained. The nonblocking Title-prefetch/stripLink cleanup is deferred from this review fix.

## Second desk review, B1/S1–S6

Proof changes are separate from runtime changes. `title-layout-prove` adds listed-table/error coverage (three entries from one real table plus two list-response fixtures because the server limits public hosting per IP), Unicode names, identity/lock/helper/heading visibility, approved desktop/landscape placement, and 44px/8px sheet checks. No existing predicate is removed.

| File / setup | Old | New | Why |
|---|---|---|---|
| `scripts/title-chunks-prove.mjs:72` | Click rules before waiting for its module request. | Wait for the module request without any click; open rules only inside the held/failed interaction cases. | Restore the issue’s idle-prefetch guarantee while retaining all held/failed checks. |

The before-fix overflow proof fails at 844x390 with wordmark y=−207. Desk comment 6402475580 explicitly approves the chat width and Watch assertion equivalents; the owner accepted the existing pictures in comment 6402771837.

The restored Wayfarer prefetch can retry the intentionally aborted target on opening its sheet. The console filter now recognizes only that exact controlled `target + "?retry="` URL in addition to the existing target URL; the no-unrelated-errors assertion is unchanged. This probe-only change is separate from runtime code.

## Third desk review (comment on 2026-10-31 04:52), adopter Claude Opus 5.5 (builder 2)

| File:line | Old | New | Why |
|---|---|---|---|
| `scripts/title-chunks-prove.mjs:124` (main) | `check((await settings.locator("summary").textContent()).includes("Online: on"), "settings summary stays eager")`: the eager settings shell shows while the optional module is held. | `check(dialog "Wayfarer rules" isVisible() && settings comboboxes === 0, "rules dialog opens eagerly while the settings module is held")`, after the existing dialog `waitFor()`. | This replaces the PR's earlier line, `"rules sheet entry stays eager"`, which checked that the button just clicked was visible and so was always true (desk finding 1). The new line protects the same thing as main's: the eager shell is open while the module is held. Mutation: releasing the module before the check fails it (`AssertionError … rules dialog opens eagerly while the settings module is held`); the real code passes. |
| `scripts/title-chunks-prove.mjs:61` (console filter) | Console errors were ignored only for the controlled target URL. | Also ignores the controlled `target + "?retry="` URL. | Listed here as the desk asked (finding 2): it widens the error filter by exactly that one URL, which the restored Wayfarer prefetch requests when it retries the intentionally aborted target. Any other console error still fails the proof. |

Pictures (finding 2: a 390x844 listed picture, plus the rules and colour sheets) are not added. Jarrod answered `q1117-interim` on 2026-10-31 ("too busy and not good Apple UI/UX"), so this title won't ship and the redesign follows #1216. New pictures of this look would not be used. The test work above stays as the base for the redesign.
