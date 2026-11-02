# Quiet ambience mastering type

PR #1015 / issue #1014, GPT-6.1 Sol. Implements owner comment6387641061: a separate quiet ambience type, unique category coverage in the mixer proof, shared-tool levelling and a concrete clip for listening. Normal main0c0e0c3 mergef15d2a5 retains original authorship. Runtime validation at70f4d06; later changes only add calibration/evidence.

TYPE_OF.ambience contains only amb_sea; its target is −30.6 LUFS, preserving the owner's quoted bed level. Every existing type, target, 1 LU tolerance and −1 dBTP ceiling is unchanged. The mixer proof additionally checks the physical-asset partition, including ambience. Its entire original runtime-key groups and mixer checks remain byte-identical to main. Playback, Sound UI and defaults remain the separate #662/#669 integration.

The raw PCM recipe is unchanged: low-passed brown noise, 0.1 Hz swell, 20 seconds, two-second tail crossfade and cosine endpoint landing. The generator's normal output now masters its freshly encoded original once through shared levelFile. --raw supplies the original for the shared CLI --new path. Each regeneration starts from the original, never from an already mastered file.

## Actual measurements

| Property | Result |
|---|---:|
| Integrated loudness / own target | −30.6 / −30.6 LUFS |
| True peak | −8.4 dBTP |
| Decoded duration | 20.000 s (882000 mono frames at44100 Hz) |
| Decoded sample peak / RMS | 0.382240623 / 0.067319552 |
| First/last10 ms maximum difference | 0.001019373 FS (0.1019%, below unchanged2% limit) |
| Rebuilt waveform maximum difference | 0 |
| MP3 size | 240788 bytes |
| MP3 SHA256 | bfe40ad07db180577a7cd4b0378cf065f17e9b995db5da4a14add15e7b75aa2e |

The container probe reports20.035918 s including MP3 padding; decoded audio is exactly20 s. The built public copy matches the source bytes. Exact clip approval remains with the owner.

## Validation

A new isolated clone work/verify1015-type-oct24 used frozen npm ci. Native FFmpeg/ffprobe7.1.5 perform the existing shared measurement/mastering; pinned @ffmpeg-installer/ffmpeg1.1.0 (encoder20181210-g0e8eb07980) remains the raw encoder and seam decoder. CI already installs native FFmpeg for audio-level-prove; the own loop step now follows that existing setup. No runner or infrastructure changes. This updated shared-tool recipe requires native ffmpeg/ffprobe; the earlier PATH-independent generator result belongs to the historical recipe.

All normal commands exited0: loop10, audio-level-prove42 physical files, full sound-mixer-prove42 runtime keys plus42-asset partition, types/build/registered133/loosen1-none/size. Two local regenerations are byte-identical and match the shipped waveform. Original loop proof bytes and limits are unchanged.

[Controls](controls.py) reject a bad seam, silence and a duplicate ambience/effect classification at the intended assertions. Temporary category edits restore byte-for-byte. [Scope audit](logs/scope-audit.mjs) confirms all41 old audio files, original PCM recipe, old mastering types/targets/algorithms, original runtime mixer proof body, src/server files and eight-leg CI remain; package/CI add only the pinned encoder and own registered loop step. Only the ambience candidate changes audio bytes.

The full source, measurements and raw outputs are alongside this note. Size at the tested runtime: index125173/125200 B gzip, +3/400 B vs built main0c0e0c3; all caps and allowances pass. Final published-head sizes belong in the PR because the build embeds commit/time.

The initial verification checkout still had the generated candidate as a tracked modification, so checkout to the asset commit was refused. After confirming those bytes exactly matched the saved asset commit, only that disposable checkout's asset was restored and the full final tests ran on the committed asset. No failed checkout was counted as validation. No new capture, playback/UI change, skipped assertion, budget increase, retry or merge.
