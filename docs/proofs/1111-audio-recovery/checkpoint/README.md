# #1111 investigation checkpoint — Codex-p

Stopped at the owner's explicit checkpoint request. No product fix or registered recovery proof exists yet. No claim that the live game-night incident's complete cause has been identified.

Main baseline a7592b0. Real native Chromium HTMLAudioElement diagnostic (not a resolved-play stub): abort the first dice WAV fetch, restore routing, then ask for the same cue after the existing150 ms burst gap. Both attempts reject NotSupportedError; the same cached audio element remains error.code4/readyState0/currentTime0. Restoring network does not retire or reload that errored element. This is a confirmed persistent-per-clip failure path in sound.ts start(), independent of sockets. No AudioContext exists in this implementation. The host SOUND_MS limiter expires by wall clock per-seat; no persistent global latch was found in this read.

Diagnostic only: from the repo root after npm ci, run:

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers node --input-type=module < docs/proofs/1111-audio-recovery/checkpoint/native-retry-diagnostic.mjs
```

It prints FIRST and RETRY error states; it is not a passing recovery test. It uses a permissive Chromium autoplay flag to isolate native media-fetch failure, so it does not prove mobile autoplay/interruption behavior. No browser worker remains active.

Exact next step: build scripts/audio-recovery-prove.mjs with two real-host seats, fail cue downloads in both pages, drop/rejoin one socket, restore downloads, and assert turn/trade/roll/soundboard playback recovers on both pages without reload. Preserve a failing-main result before editing runtime. Then test the narrow candidate of replacing only a cached HTMLAudioElement with a non-null media error at the next requested play; do not add speculative context resets or media changes. Candidate is not implemented or validated.

Register the completed proof in package.json and CI, verify failure on main and pass after the fix from a fresh clone, run unchanged sound/mixer/rejoin checks serially, and enforce current size budgets. Existing main index has only11 B ceiling headroom. Distinguish this reproducible media failure from the unresolved full live incident, including iOS interruption and shared-host causes.

Other active work: #1113/#1107 owns FILES/category/pasture mapping and its lazy extra-files block near start(); keep lifecycle edits separate and re-read that patch. #1106 startup/haptics wiring is separate. #716 asynchronous connection shell remains on its own open PR; do not duplicate it. Read current hub/desk/claims before resuming.
