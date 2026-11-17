# Adaptive game music research

- status: research
- issue: #845
- date: 2026-11-13
- author: builder-size
- revision: Codex-p (GPT-6.1 Sol), 2026-11-17

## Approval and current starting point

The [November 6 owner decision](https://github.com/jarrodjohnson-gif/emberisle/issues/845#issuecomment-6694255817) approves the [three proposed choices](https://github.com/jarrodjohnson-gif/emberisle/issues/845#issuecomment-6259084214).
The tracks are The Old Tower Inn, Market Day and Battle, with three-second linear crossfades.
The owner must listen before the implementation merges.

Current [sound.ts](../../src/lib/sound.ts#L273) uses one looping `HTMLAudioElement`, `BG_VOLUME = 0.12` and `BG_DUCK = 0.3`.
Its gain is `BG_VOLUME * (ducked ? BG_DUCK : 1) * categoryGain("music")`.
Retain its gesture unlock, retry, mute, music-toggle and sting-ducking contracts while the open policy questions wait.
The approved proposal specifies total music gain `0.25`; current code uses `0.12`. These conflict; this note chooses neither.
The approved proposal keeps title/game-over silence. The current [wanted-screen caller](../../src/components/game/EmberisleApp.tsx#L50) includes title music.
[Question 6940531449](https://github.com/jarrodjohnson-gif/emberisle/issues/845#issuecomment-6940531449) asks the owner to resolve both conflicts.
The desk placed them on card `q845-music-today`; no gain or screen-policy change is authorized before the answer.

The [October 24 level decision](../DECISIONS.md) requires levelling by type, with all game music equally loud.
Table effects and reactions have their own type levels. The owner approves targets by ear.
The observed `0.12` is not a choice of adaptive gain or a replacement levelling policy.

## Approved selection and linear transition

Use public leader points and the configured victory target.
[publicVP](../../src/lib/game/rules.ts#L251) and [victoryTarget](../../src/lib/game/rules.ts#L260) provide these inputs; hidden fortunes must not affect the music.

| Phase | Track | Public score condition |
|---|---|---|
| Calm | The Old Tower Inn | Leader below target − 3 |
| Building | Market Day | Leader at target − 3, below target − 1 |
| Tense | Battle | Leader at or above target − 1 |

Ten-point games change at 7 and 9; seven-point games change at 4 and 6.
Override the score-derived phase with Tense during discard and the wayfarer event, then return to the score-derived phase.
The rules name those phases `discard` and `robber` in [types.ts](../../src/lib/game/types.ts#L6).
A standing wayfarer or a retained dice result of seven does not identify an active event.
Keep lobby and setup Calm. “Final turns” means public match-point proximity, not predicting turns remaining.

A transition lasts three seconds, with progress `t` from 0 to 1.
Outgoing and incoming weights are `1 - t` and `t`.
At the midpoint both weights are 0.5; their sum stays 1. Do not substitute cosine/sine equal-power curves.
Retarget from the current weights when the desired track changes. Keep ducking/category controls separate from the unresolved gain choice.
Mute or music-off stops every fading track. This note selects no new playback engine or timing constants.

## Size estimates, not budgets

Assuming 128 kbps and 60–90 seconds gives the following example payload sizes.
These are calculations, not measurements of selected files or device memory. MB means 1,000,000 bytes.

- Encoded bytes: `128000 / 8 * seconds`, before container overhead.
- PCM sample bytes: `44100 * 2 * bytesPerSample * seconds`, assuming 44.1 kHz stereo.
- A 16-bit PCM file uses two bytes per sample. Web Audio channel data uses Float32 samples, requiring four bytes.

| Assumption | Seconds per track | One track MB | Three tracks MB |
|---|---:|---:|---:|
| 128 kbps encoded | 60 | 0.960 | 2.880 |
| 128 kbps encoded | 90 | 1.440 | 4.320 |
| 16-bit PCM file | 60 | 10.584 | 31.752 |
| 16-bit PCM file | 90 | 15.876 | 47.628 |
| Float32 sample data | 60 | 21.168 | 63.504 |
| Float32 sample data | 90 | 31.752 | 95.256 |

These sample-data estimates do not establish any download or device-memory ceiling.
This research sets no replacement download or memory ceiling. Choose assets and loading policy using measurements and approved limits.
Browser resampling, decoder state, copies and object overhead can add memory beyond the sample-data estimates.
The current HTML media player’s memory use cannot be inferred from the proposed Web Audio buffer calculation.

A Web Audio graph and prefetch thresholds would require design choices; this research selects neither.
Keep audio outside JavaScript chunks. Verify licences and record exact sources in [sound.md](../design/sound.md) before importing files.
Check the Battle loop seam and obtain the owner’s listening approval; this research performs no audio import or audition.

## Future verification and remaining gates

A future registered proof must check:

- Public-score thresholds for seven- and ten-point games, without hidden-fortune influence.
- Temporary Tense during discard/wayfarer events and return to the score-derived phase afterward.
- Three-second linear weights, including their midpoint and retargeting during a transition.
- Existing sting ducking, mute, music toggle, gesture retry and wanted-screen behaviour.
- Playback/resource cleanup on table exit, using the chosen implementation’s actual resource model.

These are future checks, not passing results. No runtime, audio, dependency, proof, gain setting or budget changes in this PR.
