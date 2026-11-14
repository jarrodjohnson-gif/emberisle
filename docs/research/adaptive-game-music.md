# Adaptive game music architecture research

- status: research
- issue: #845
- date: 2026-11-13
- author: builder-size

## Background and Vision

Emberisle currently plays a single looping background track via HTMLAudioElement.
Issue #845 introduces an adaptive music system that responds to match tension.
Music evolves dynamically as players approach victory.
The owner approved three CC0 tracks and crossfade parameters on 2026-11-06.
This document details the Web Audio architecture, gain blending, and memory ceilings.

## Track Selection and Game State Triggers

The system transitions across three musical phases based on victory point thresholds.

| Phase | Track Title | Trigger Condition | Mood |
| :--- | :--- | :--- | :--- |
| **Calm** | *The Old Tower Inn* | Leader points < Target - 3 | Pastoral, relaxed opening |
| **Building** | *Market Day* | Target - 3 <= Leader points < Target - 1 | Energetic, bustling mid-game |
| **Tense** | *Battle* | Leader points >= Target - 1 | Dramatic, urgent endgame climax |

- In a standard 10 VP game, Calm plays from 0 to 6 VP.
- Building plays when any player reaches 7 or 8 VP.
- Tense plays when any player reaches 9 VP.
- Transition begins immediately when the leader points threshold changes.
- Transitions use smooth 3.0 second crossfades between tracks.

## Web Audio Gain Blending Architecture

The current HTMLAudioElement approach cannot perform sample-accurate crossfades.
The new architecture uses the Web Audio API.

```
[Track 1 BufferSource] ---> [GainNode 1] --\
[Track 2 BufferSource] ---> [GainNode 2] ---> [Master Music Gain] ---> [Destination]
[Track 3 BufferSource] ---> [GainNode 3] --/
```

### Equal-Power Crossfade Math
- Linear crossfades cause an audible 3 dB volume dip at the midpoint.
- Equal-power curves maintain constant acoustic loudness across the blend.
- The outgoing track gain follows `Math.cos(t * Math.PI * 0.5)`.
- The incoming track gain follows `Math.sin(t * Math.PI * 0.5)`.
- Ramps execute over exactly 3.0 seconds via `setValueCurveAtTime`.

### Sound Sting Ducking Integration
- Background music ducks under high-priority sound effects.
- Ducking triggers on `game_start`, `match_point`, `game_lose`, and `end_music`.
- Master music gain attenuates to 0.30 of normal volume during stings.
- Music restores smoothly over 400 ms when the sting completes.

### Volume and Mute Controls
- Master music gain multiplies by the user setting from `categoryGain("music")`.
- Toggling music off ramps gain to zero over 100 ms.
- Muting the table ramps gain to zero instantly.

## Memory Ceilings and Asset Budgeting

Audio buffers consume significant uncompressed RAM once decoded into PCM.
Strict memory boundaries prevent mobile browser tab crashes.

### Network Payload Budget
- Audio files are stored as compressed MP3 files in `public/audio/`.
- Sample rate: 44.1 kHz, 128 kbps joint stereo.
- Each track length: approximately 60 to 90 seconds.
- Per-file compressed size: under 700 KB.
- Total network transfer: under 2.1 MB across all three tracks.
- Zero audio bytes are bundled into JavaScript chunks.

### PCM Heap Memory Ceilings
- Decoded 44.1 kHz 16-bit stereo PCM consumes approximately 176.4 KB per second.
- A 90-second decoded track occupies roughly 15.8 MB of heap memory.
- Total active PCM audio memory must remain under 35 MB.
- To enforce this ceiling, the engine uses progressive lazy loading.

### Progressive Loading Lifecycle
1. **Initial load**: Fetch and decode only *The Old Tower Inn* after the first gesture.
2. **Mid-game prefetch**: Fetch *Market Day* when the leader reaches Target - 5.
3. **Endgame prefetch**: Fetch *Battle* when the leader reaches Target - 3.
4. **Game conclusion**: Stop source nodes and disconnect gain nodes on the win screen.
5. **Table exit**: Release AudioBuffer references so garbage collection reclaims heap memory.

## Mobile and Lifecycle Constraints

- **Tab visibility**: Suspend AudioContext when document visibility becomes hidden.
- **AudioContext resume**: Resume AudioContext on the first tap after visibility returns.
- **Hardware interruption**: Handle audio session route changes on iOS and Android.
- **CPU throttling**: Web Audio processing runs on a dedicated native browser thread.

## Proof and Verification Plan

A new proof script `scripts/adaptive-music-prove.mjs` will verify:

- AudioContext and GainNode graph creation.
- Equal-power gain ramp execution over 3.0 second transitions.
- Score threshold triggering for all three musical phases.
- Sting ducking attenuation and recovery timings.
- AudioBuffer reference cleanup on table exit.
