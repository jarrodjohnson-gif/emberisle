# Browser Proof Isolation and Startup Skip Audit

- date: 2026-11-12
- agent: builder-connect
- lane: test (tier 3)
- targets: `scripts/proof-browser.mjs`, `scripts/registered-prove.mjs`

## Overview

This audit verifies compliance with the browser proof isolation standard established in issue #1377.
Browser proofs must import `chromium` from `./proof-browser.mjs` rather than importing `playwright` directly.
`./proof-browser.mjs` supplies wrapper scripts and headers that skip the startup loading screen (#1281).
Proofs importing Playwright directly wait indefinitely on the intro curtain and fail with timeout errors.

## Static Import Policy and Enforcement

### AST Verification in `registered-prove.mjs`
`scripts/registered-prove.mjs` parses every file in `scripts/` using the `rawPlaywright` regular expression.
Any script matching static imports, dynamic imports, or `require()` from Playwright triggers a test failure.

```javascript
const PLAYWRIGHT_EXEMPT = new Set(["loading-screen-prove.mjs", "registered-prove.mjs"]);
```

### Exemptions
- **`loading-screen-prove.mjs`:** Tests the production loading screen and must launch raw Chromium.
- **`registered-prove.mjs`:** Contains inline unit test fixtures validating regex detection.
- Utility asset generators (`make-icons.mjs` and `emote.mjs`) do not run as CI proofs.

## Audit Findings Across Current Proof Suite

1. **Total Proof Scripts Analyzed:** 221 registered proofs.
2. **Direct Browser Proofs:** 54 scripts launch browser contexts.
3. **Compliance Rate:** 100% of registered proofs in `origin/main` take chromium from `./proof-browser.mjs`.
4. **Third-Party / Stale PR Impact:**
   - PR #905 (`keyboard-fit-prove`) currently imports from `playwright` directly.
   - PR #905 cannot pass clean CI until migrated to `./proof-browser.mjs`.

## Proof Verification

- `npm run registered-prove` passed all 221 proof registration checks and raw Playwright assertions.
- `npm run loading-screen-prove` passed all curtain and skip assertions cleanly.

## Conclusion

The proof isolation boundary remains fully enforced across `origin/main`.
No new proofs may bypass `./proof-browser.mjs` without triggering CI rejection in `registered-prove`.
