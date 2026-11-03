# Sea ambience restart fade correction

Owner request: PR #1015 comment 6406994854. Builder continuation: Codex-p3, signed Codex-p. Model: GPT-6.

Normal merge 1a28b61 retains original authorship and merges main beafd405d6be29c7f25dd8c99fed8750b5b184e9.
Code/asset/proof commit: 164ed5801f16bc181f76d25e63b0fc95c38e8886.

## Correction

Removed the 150 ms cosine edge envelope. The original two-second crossfaded tail, low-passed brown noise,
0.1 Hz swell and 20-second length remain. Rotate all samples of the completed loop to a natural zero crossing.
Choose the crossing with the smallest maximum difference between the first and last 10 ms.
No samples are discarded, padded or faded. Master once from the original generated candidate with the existing tool.
The common mastering targets, tolerance, true-peak ceiling and all unrelated clips remain unchanged.

Every original proof check line remains byte-identical. Two added checks require each 150 ms edge's RMS
at least 60% of its adjacent 150 ms block. These detect the previous forced dip rather than relying on seam proximity.
The original candidate fails the first new assertion after passing duration, non-silence, clipping, seam and endpoint checks.
See old-dip-control.log (expected exit 1). The new candidate passes all 12 checks.
Both proof registrations already exist, and registered-prove confirms 147 registered proofs.

## Measurements

- Asset: public/audio/amb_sea.mp3, 240788 bytes.
- SHA256: cbae4ac93fb082e708b5a2e3f4ef63c8db81373a8d6afcdf51e93d663a1be9e7.
- Integrated loudness: -30.6 LUFS. True peak: -8.5 dBTP. Decoded duration: 20 seconds.
- Peak: 0.3740852475166321 FS. RMS: 0.06642732580928266 FS.
- First/last 10 ms maximum difference: 0.01836300827562809 FS, below the unchanged 0.02 FS limit.
- Recipe decoded delta: 0. Same-toolchain regenerations are byte-identical.
- First-edge RMS/next block: 1.1701496590711338; last-edge RMS/previous block: 1.4903541347890723.
- Prior faded candidate ratios: 0.5757746922773835 and 0.46826333233471396.

three-pass-60s.wav is three consecutive copies of the decoded candidate, without an extra fade or encode.
Command: ffmpeg -v error -i public/audio/amb_sea.mp3 -af 'aloop=loop=2:size=882000' -t 60 -c:a pcm_s16le -y three-pass-60s.wav.
listening-render.json records the duration, hash and byte-identical three-pass audit.

## Validation provenance

Fresh local clone /workspace/work/ambience-verify at exact 164ed58, independent npm ci --ignore-scripts.
Main baseline: fresh /workspace/work/ambience-base at exact beafd405, independently installed and built.
Tools: Node 24.19.0; native FFmpeg 7.1.5; locked packaged encoder; Playwright 1.63.0 headless shell 153.0.8010.12.
Only the mixer browser proof ran. Browser work occurred after all builds, with no checkout edits during its run.
fresh/results.json records commands, elapsed times and actual exits; fresh/*.log contains complete output.

The first fresh loosen command failed because a local clone lacks origin/main, not because an assertion changed.
Its raw failure is retained. The same command with exact base beafd405 passes in loosen-exact-base.log.
An earlier sandboxed scratch generator stalled at the native encoder and was terminated; subsequent native checks ran with subprocess permissions.
No unrun or interrupted check is claimed as passing.

Fresh size: index 124338/125200 B, main 124337 B, +1/400 B. All ceilings and growth allowances pass unchanged.
The built audio hash equals the source hash. Both lockfiles and application runtime remain unchanged by the fade correction.
No proof assertion, detector, timeout, dependency or budget was weakened.

Fresh independent review, exact-head CI and owner listening approval remain pending. No merge or owner acceptance is claimed.
