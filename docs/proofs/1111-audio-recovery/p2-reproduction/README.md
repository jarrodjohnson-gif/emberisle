# Native recovery reproduction before runtime edits

Codex-p2 (GPT-6.1 Sol), 2026-10-25.
Baseline: main d37d596, merged with predecessor checkpoint at 0a891ac.
No runtime source differs from main.

Run `CHROMIUM_PATH=/usr/bin/chromium node scripts/audio-recovery-prove.mjs`.
The browser uses native HTMLAudioElement and records playing/timeupdate events, without replacing play().
Three real host seats satisfy the host's minimum; all three are tested.
Each page first plays an unrelated baseline cue with native time advancement.
The first downloads of four untouched target cues are then aborted, producing native error4/readyState0.
One socket drops and rejoins the same player/seat; the other seats remain connected.
Downloads resume. Actual host gameplay cycles every player's turn, rolls dice, accepts a trade and broadcasts soundboard audio.
All pages keep their document identity and receive actual host state/chat messages.
All twelve target seat/file pairs fail native playing and time advancement after restoration.
Other cues continue playing. This isolates cached per-clip media failure, not a stopped queue or missing host state.

The initial two-seat attempt failed setup because the host requires at least three players; its output is retained.
The initial legal-table run and the strengthened host-message/roll run both reproduce the media failure.
No claim covers iOS/Android interruption, reload persistence, or the entire live game-night incident.

Final strengthened baseline: failing-main-final.log.
It checks distinct player identities and exact donor decrement/recipient increment for the real host gift trade.
Native playback observation has an eight-second deadline, under a 120-second whole-proof watchdog.
The lightweight HTML harness imports the real store and sound modules without rendering the game UI.
Chromium uses --autoplay-policy=no-user-gesture-required to isolate native fetch/decode recovery from autoplay permissions.
It makes no full-UI, audible-device-output or mobile policy/interruption claim.
