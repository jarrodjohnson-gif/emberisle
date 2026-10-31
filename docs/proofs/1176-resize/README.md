# Lobby code fitting: independent checkpoint

Builder: Codex-p. Model: GPT-6.1 Sol. Parent: Codex-p.
Product/full-local-proof checkpoint: `5ef0005a3af0599a3d426dee7dd040baaf49ba39`.
Diagnostic-only proof source: `5a39dcbfa668dc08da777c173d14a2ec28023cc0`.
Before runtime: normal main merge `11dc0fd4484ecd1faa9f36ff80f1c9fe9f18ad96`.

**Owner option A accepted, 2026-10-31 00:44 UTC.**
[Answer6536699964](https://github.com/jarrodjohnson-gif/emberisle/pull/1181#issuecomment-6536699964) resolves
[Question6536338660](https://github.com/jarrodjohnson-gif/emberisle/pull/1181#issuecomment-6536338660).
Real four-character codes must fit, including WWWW/MMMM and Copy→Copied.
The 16-character display is an unsupported diagnostic that may truncate.
No4–6px type or wider lobby layout is approved.
The recorded source, runs and pictures already follow this answer.
This evidence-only update adds no browser run or runtime change.

## Hosted failure: unresolved

CI41151344387, source3ca207a, presentation job124388589073 fails the added readability assertion.
CI41152094265, source99a1d91, job124391367418 repeats the same failure.
Both report390×844 WWWW Copy→Copied: code font must remain at least as large as control labels.
Full-text containment passed immediately before that check.
Both original logs lack the failed numerical measurements.
Local Noto Sans passes do not establish hosted readability.
No runtime fix or manual CI retry is claimed.

The new proof records coherent font, tracking, viewport, text and button geometry only when readability fails.
It measures the text width at the control-label font size.
A bounded1000ms CDP observer also records actual resolved platform fonts.
Fulfilled, rejected and timed-out observer controls rethrow the exact original assertion object.
All44 assertion conditions and messages remain unchanged.
Syntax, registration161 and committed loosen1/none pass.
No full six-viewport proof rerun is claimed for this diagnostic-only step.

The bounded local real-host font matrix uses explicit controlled family overrides.
Native Noto Sans passes at21.9355px; controlled DejaVu Sans reproduces14.4906px versus15px labels.
Its code box is67.92px wide; the text needs70.19px at15px.
Controlled DejaVu Serif also fails; Arial, Liberation Sans and monospace pass.
This exercises the same failed condition and diagnostics, but does not identify the actual CI font yet.
The exact observer wrapper's three error-identity controls use the committed diagnostic source.

The second run also fails board-look-prove in presentation-3, job124391367295.
Its crystal shallow-band assertion is retained in a separate raw log.
That cause remains unproved; no scene fix or source change is included here.

Raw logs, local controlled results and diagnostic sources are under `ci-readability/`.
An initial optional TypeScript AST audit could not run because the installed shim has no createPrinter API.
The retained balanced-call comparison and independent diff inspection verify all44 unchanged assertion calls instead.

## Contract and result

[Owner direction6533773802](https://github.com/jarrodjohnson-gif/emberisle/pull/1181#issuecomment-6533773802) requests resizing instead of ellipsis.
The host issues exactly four-character room codes (`server/host.mjs:167–170`).
Those supported codes now fit during Copy→Copied changes and viewport resizing.
Longer display fixtures retain their original behavior under the accepted diagnostic scope.
This does not establish the historical 7.3px Copy-padding failure's cause.
The PR still uses Refs #1176.

The view owns one header ResizeObserver and its cleanup.
Its existing lazy parent injects a stable pure fitting callback.
The view does not import its parent; the built chunk graph has no new cycle.
The callback ignores displayed text that differs from the supported code prop.

## Validation

- Final injected source: full real-host/two-client lobby proof passes all six viewports, with zero browser errors.
- Thirty-six added records cover supported codes, both Copy→Copied states, viewport shrink/grow, font restoration and stable focus.
- Actual fitted fonts range from15.4286px to24px; no numeric minimum policy is inferred.
- All37 original assertion lines remain verbatim, including44px targets and8px padding.
- Original11dc runtime with the same strengthened proof fails at390px: WWWW clips after Copy becomes Copied.
- Final-source one-shot observer control fails at390→320: the initial fit succeeds, but viewport fitting stops.
- Both controls exit1 at the new complete-code assertion, with old button padding and targets still valid.
- Typecheck, build, registered161, committed loosen1/none and whitespace pass.
- LobbyView2242→2364B gzip: +122B, allowance200B, ceiling2500B.
- Online6307→6432B gzip: +125B, allowance200B, ceiling9000B.
- Package, CI, CSS, lockfiles and every size ceiling/allowance remain unchanged.

`size.log` uses the repository's unchanged Node gzip measurement.
Vite's printed gzip estimate differs on the same filenames.
`dist-audit.json` records their exact file hashes and byte sizes.
Rejected prototypes remain in the raw ceiling/growth logs; none is final validation.
Those early prototypes were uncommitted, so no exact source hash is asserted for them.
The earlier inline and parent-import proof logs describe superseded wiring only.

## Pictures and limits

Before and after use the pinned Playwright1.63 / Chromium153.0.8010.12 browser.
Each opens a real host lobby with three seats and injects only the displayed code fixture.
The normal case is ABCD; the supported stress is WWWW after a real Copy click.
The unsupported diagnostic is16 W characters.
Both phases wait for copy feedback to reset between cases.
Only Copied screenshots pause the browser clock to retain that transient feedback.
The full browser proof uses its unchanged real clock.
Rooms, latency and background frames can differ between captures.

| Portrait | Normal before / after | Supported WWWW + Copied before / after | Unsupported16-W diagnostic before / after |
|---|---|---|---|
| 320×568 | [Before](before-320x568-normal.png) / [After](after-320x568-normal.png) | [Before](before-320x568-copied-wide.png) / [After](after-320x568-copied-wide.png) | [Before](before-320x568-overflow.png) / [After](after-320x568-overflow.png) |
| 375×667 | [Before](before-375x667-normal.png) / [After](after-375x667-normal.png) | [Before](before-375x667-copied-wide.png) / [After](after-375x667-copied-wide.png) | [Before](before-375x667-overflow.png) / [After](after-375x667-overflow.png) |
| 390×844 | [Before](before-390x844-normal.png) / [After](after-390x844-normal.png) | [Before](before-390x844-copied-wide.png) / [After](after-390x844-copied-wide.png) | [Before](before-390x844-overflow.png) / [After](after-390x844-overflow.png) |

All18 pictures have matched code, feedback-state and viewport labels.
Long-case font sizes and text widths remain unchanged across phases.
The capture source and raw measurements are retained alongside the pictures.

## Reproduce

Run `LOBBY_LAYOUT_OUT=/tmp/lobby-fit npm run lobby-layout-prove` with the pinned browser and shared lock.
Run `npm run typecheck`, `npm run build`, `npm run registered-prove` and committed-head `npm run loosen-prove`.
Build main d91388b separately, then run `node scripts/size-prove.mjs --base <built-main>`.
The old-runtime control uses11dc runtime files with the exact final strengthened proof.
The observer control adds only `observer.disconnect()` after its first delivered fit.

The policy is settled. Independent Claude review and final owner picture acceptance remain required.
No CI retry, PR merge, main push, budget raise or old assertion replacement occurred.
