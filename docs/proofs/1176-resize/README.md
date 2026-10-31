# Lobby code fitting: independent checkpoint

Builder: Codex-p. Model: GPT-6.1 Sol. Parent: Codex-p.
Tested source: `5ef0005a3af0599a3d426dee7dd040baaf49ba39`.
Before runtime: normal main merge `11dc0fd4484ecd1faa9f36ff80f1c9fe9f18ad96`.

**The complete owner direction remains unfinished.**
[Question6536338660](https://github.com/jarrodjohnson-gif/emberisle/pull/1181#issuecomment-6536338660) asks about synthetic-length versus readable-font constraints.
The 16-character synthetic display retains its previous ellipsis behavior.
No minimum-font policy or wider lobby layout is approved here.

## Contract and result

[Owner direction6533773802](https://github.com/jarrodjohnson-gif/emberisle/pull/1181#issuecomment-6533773802) requests resizing instead of ellipsis.
The host issues exactly four-character room codes (`server/host.mjs:167–170`).
Those supported codes now fit during Copy→Copied changes and viewport resizing.
Longer display fixtures remain unchanged until the Question is answered.
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

| Portrait | Normal before / after | Supported WWWW + Copied before / after | Unresolved16-W diagnostic before / after |
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

The dependent owner policy and final owner picture acceptance remain outstanding.
No CI retry, PR merge, main push, budget raise or old assertion replacement occurred.
