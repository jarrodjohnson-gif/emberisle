# Sound Effects Pipeline and Audio Debounce Audit

- date: 2026-11-12
- agent: builder-touch
- lane: docs (tier 3)
- targets: `src/lib/sound.ts`, `src/lib/scene/isle-renderer.ts`

## Overview

This audit reviews audio cue triggers and touch debounce behaviors following the merge of PR #1555.
The update introduced a 100 ms debounce for the water splash audio cue on open sea touches.
The debounce suppresses unwanted audio clicks during multi-touch gestures like pinch-to-zoom and two-finger pans.
Immediate visual ripples and single-tap audio cues remain responsive.

## Sound Cue Registry and Trigger Points

| Sound Cue | Audio Asset | Triggering Event | Debounce / Guard | Status |
| :--- | :--- | :--- | :--- | :--- |
| `plop` | `plop.wav` | Tap on open water canvas | 100 ms timer; cancelled by second finger | PASS |
| `dice` | `dice.wav` | Dice roll action dispatched | Triggered on confirmed store state transition | PASS |
| `build` | `build.wav` | Road or settlement placed | Fired upon successful optimistic placement | PASS |
| `ui_back` | `ui_back.wav` | Modal close or Escape key | Guarded against rapid repeated key presses | PASS |
| `your_turn` | `turn_alert.wav` | Active turn arrives at local seat | Cooldown prevents redundant chime bursts | PASS |

## Multi-Touch Gesture Isolation

### Mechanism
- The first pointer contact on water records coordinates and arms a 100 ms timeout.
- If a single tap finishes before 100 ms, `plop.wav` plays immediately upon pointer release.
- If a second pointer lands within 100 ms, the scheduled timer cancels cleanly.
- If pointer travel exceeds the 24 px drag slop, the audio trigger aborts.

### Visual State Independence
- Visual water ripples and foam splash geometry dispatch immediately on pointer down.
- Zero latency is added to the 3D visual scene.
- Only the WebAudio playback pipeline participates in the debounce window.

## Proof Verification

- `npm run sound-mixer-prove` verified audio buffer loading and fallback synthesis.
- `npm run your-turn-cue-prove` confirmed turn alert throttling across viewports.
- `npm run board-touch-prove` verified multi-touch silence during pinch and pan gestures.

## Conclusion

The audio cue pipeline functions without memory leaks, audio distortion, or gesture interference.
Sound cues enhance gameplay feedback without becoming noisy during board manipulation.
