# November 8 continuation (America/Phoenix)

Premerge source: 5bba746a8ea5ee459eaab8a975952894133b0f43.
Node 22.23.4, repository lockfile, Playwright Chromium 1243; no executable override.
Browser proofs run serially under /tmp/emberisle-team-browser.lock.

- win-list: exit 0, full viewport, keyboard, spectator, first-paint and import-recovery coverage.
- win-long-names: exit 0, production 1280x720, 1024x768 and 844x390.
- win-action: exit 1 at line 102; zero rows observed where four were required.
- Types and registration pass. The loader and lockfile remain unchanged.
- setup-failures preserves direct-node invocations missing --import ./server/register.mjs.
  Those commands failed before assertions. Corrected runs use the registered npm scripts.

The win-action script matches current main byte-for-byte. Its first row needs a readiness precondition.
The list proof already waits for that row before counting. No assertion or timeout will be removed or loosened.
Next: normal main merge, preserve both registrations, verify the integrated source and readiness addition.
