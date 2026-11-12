# Sound Effects Pipeline and Audio Debounce Audit (issue #1543)

- date: 2026-11-12
- agent: builder-touch
- lane: docs (tier 3)
- basis: commit 3475e541
- targets: `src/lib/sound.ts`, `src/lib/scene/isle-renderer.ts`, issue #1543, PR #1555

## Overview

This audit reviews audio cue triggers and touch debounce behaviors following PR #1555 (issue #1543).
PR #1555 introduced a 100 ms deferral for the water splash audio cue on open sea touches.
The deferral suppresses unwanted audio clicks during multi-touch gestures like pinch-to-zoom.
Immediate visual ripples and single-tap audio cues remain responsive.

## Sound Cue Registry in `src/lib/sound.ts`

| Sound Cue | Audio Asset | Triggering Event |
| :--- | :--- | :--- |
| `plop` | `plop.wav` | Tap on open water canvas |
| `dice_land` | `drop_001.wav` | Dice roll action dispatched |
| `path_place` | `drop_002.wav` | Path placed on board |
| `outpost_place` | `drop_003.wav` | Outpost placed on board |
| `ui_back` | `back_001.wav` | Modal back or close action |
| `your_turn` | `your_turn.wav` | Active turn arrives at local seat |

## Multi-Touch Gesture Isolation

### Mechanism
- The first pointer contact on water records coordinates and arms a 100 ms timeout.
- If a single tap finishes before 100 ms, `plop.wav` plays immediately upon pointer release.
- If a second pointer lands within 100 ms, the scheduled timer cancels cleanly.
- If pointer travel exceeds the tap slop, the audio trigger aborts.

### Visual State Independence
- Visual water ripples dispatch immediately on pointer down.
- Zero latency is added to the 3D visual scene.
- Only the HTMLAudio (`new Audio(...)`) playback call participates in the deferral window.

## Proof Verification

Audio proofs pass cleanly on commit 3475e541.
`npm run sound-mixer-prove` verifies audio loading and fallback synthesis.
`npm run your-turn-cue-prove` confirms turn alert cues.
`npm run board-touch-prove` verifies water plop audio behavior.

## Conclusion

The audio deferral cleanly isolates multi-touch gestures from single-tap water sounds.
Sound cues enhance gameplay feedback without becoming noisy during board manipulation.
