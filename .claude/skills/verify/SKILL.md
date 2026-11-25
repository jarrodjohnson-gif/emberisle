---
name: verify
description: Build the game and play a full practice turn before opening a PR.
---

Use repository-pinned Node and installed lockfile dependencies.
1. Run `npm run build` to produce the actual game in `dist/`.
2. Run `flock /tmp/emberisle-team-browser.lock npm run verify-play`.
   The script starts and stops its own production preview.
3. Inspect the temporary 440x956 screenshots printed for each step.
4. Put its exact final `verify-play: PASS` line in the PR body.
   If it cannot run, say why in the PR body.
5. Preserve failures and screenshots; fix the cause. Never widen a wait,
   hide console errors or retry merely for green.

For an interactive view, run `npm run preview -- --host 127.0.0.1`.
The script starts practice, plays legal setup, rolls, ends the person's
turn and observes the next player. No state injection, sleeps or retries.
Console errors, uncaught exceptions and bounded step/total limits fail it.
