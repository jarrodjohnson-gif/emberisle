# White chrome validation

This evidence covers the colour-only implementation in issue #1274. The dock proposal is separate, under `docs/design/issue-1274/`.

Local browser runs use system Chromium 154.0.8037.57 because the pinned Playwright browser was absent. Browser runs were serial under `/tmp/emberisle-team-browser.lock`. CI still needs to run with its pinned browser.

## Passed checks

- `chrome-prove`: rendered title, menu and sheets at 1280×720, 390×844, 844×390 and 320×568.
- Negative control: browser-only injection of the old cream palette fails the exact white surface assertion.
- `contrast-prove`, `hand-cards-prove`, `polish-tokens-prove`: passed on the original checkout plus palette change.
- Type checking, build, registration and size ceilings: passed after merging main `12d3493`.
- Unchanged baseline `fa8b967` passes `chat-prove`.

The later merge of `d5b6e48` adds only upstream stage-proof and evidence changes. It changes no runtime files.

## Retained failures and limits

The first candidate chat run timed out waiting for Fay's table code after navigation. The baseline passed. The cause was not established, and a later pass does not establish a fix.

The new chrome proof initially passed RGBA into an RGB luminance calculation. That produced NaN; consuming only RGB fixes the test arithmetic.

Its initial generic scroll-width check also found existing menu overflow. Unchanged baseline reports scrollWidth 258 and clientWidth 256. This new palette proof retains viewport containment but does not add a generic content-overflow requirement. Existing layout proofs are unchanged.

Early sandbox and missing-browser attempts failed before useful validation. The initial logs were overwritten before recovery; their tool outputs remain in the conversation. Those attempts are not passing checks.

The size run checks absolute ceilings only, not base-relative growth. Runtime changes are seven CSS colour substitutions; no JavaScript or dependency changes were introduced.

The exact hand palette assertion was replaced in separate commit `5911af3`. Empty/held colours change from `#eeece7`/`#fff9f0` to `#f3f6f5`/`#ffffff`. Exact equality, contrast and every other existing assertion remain.

## Final chat run and advisory audit

The final unmodified candidate `chat-prove` passed in 165.3 seconds with zero console errors. Its runtime/proof sources match `1f39c3e`; subsequent commits add only upstream stage-proof changes and documentation. The earlier failure remains unexplained and retained.

`loosen-prove` flags the one exact hand palette replacement, as expected for the documented obsolete-assertion replacement. This advisory result is not reported as passing. The replacement is isolated in `5911af3` and the PR contains the old/new table. No detector, tolerance or budget was changed.
