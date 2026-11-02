# Quiet ambience with the expanded audio inventory

Codex-p (GPT-6.1 Sol), 2026-10-26. Existing PR #1015 / issue #1014.
Continues published7d0eb7d work; original authorship remains intact.
Owner comment6387641061 requires an isolated quiet ambience mastering type.
Owner approval of the exact clip remains PENDING before merge.

Normal mergecf1f5082038d5b74de3fd475e2b2ea8047b023a2 has these parents:

- Published PR7d0eb7de06bf5001299d2bfb5dc9a950f7e04ed3.
- Actual main9bde9861490662ef3e95e90db5cfa2dc7874fd55.

The merge applied automatically, without manual conflict resolution or source fixes.
Current main has55 physical audio files; the ambience candidate brings the total to56.
All55 main audio files remain byte-exact; every main type list and target remains exact.
The full current-main runtime mixer proof body remains byte-identical.
All other main files remain exact except the existing asset-only feature and registration differences.
The partition audit verifies these facts and records actual counts.
No sound.ts, sound-extra, mapping, playback, UI, setting, default, application or server change was added.
Automatic main integration preserves the current versions of those files.

The own candidate, generator, loop proof and credits remain byte-identical to7d0eb7d.
The shared tool recipe still masters the original raw synthesis once, at−30.6LUFS.
No shipped file was regenerated, re-levelled or remastered during this refresh.
The existing loop proof generates scratch outputs to verify deterministic repeatability and recipe agreement.
Those outputs are removed by the proof; the shipped file remains unchanged.

Exact shipped asset:

```text
public/audio/amb_sea.mp3
bytes: 240788
sha256: bfe40ad07db180577a7cd4b0378cf065f17e9b995db5da4a14add15e7b75aa2e
decoded duration: 20 seconds
integrated loudness: -30.6 LUFS
true peak: -8.4 dBTP
decoded seam maximum: 0.001019373448798433 FS (0.1019373448798433% FS)
decoded recipe delta maximum: 0
```

The two-second tail crossfade,0.1Hz swell, low-pass brown-noise recipe and CC0 credits remain intact.
The seam bound remains below2%FS; the non-silence and no-clipping guards remain unchanged.
The target remains a separate ambience type, outside reactions/effects/music mastering lists.
All main targets,1LU tolerance and−1dBTP ceiling remain unchanged.

The main branch still lacks the PR's packaged FFmpeg dependency.
The original exact @ffmpeg-installer/ffmpeg1.1.0 dependency and lock entries remain necessary.
The root lockfile remains byte-identical to7d0eb7d; all main locked packages remain exact.
No dependency or lockfile refresh occurred; installs used frozen npm ci.
The server lockfile, size policy and every main package/CI step remain intact.
Ambience-loop is registered once, following main's existing FFmpeg/audio-level setup.
Main's nightly soak policy remains unchanged.

Independent fresh clone and fresh main-base clone used frozen installs at exactcf1f508/main9bde986.
Local tools: Node24.19.0; native FFmpeg/ffprobe7.1.5; pinned packaged encoder1.1.0.
The full mixer uses pinned Playwright1.63.0/default headless shell153.0.8010.12.
CHROMIUM_PATH is omitted; PLAYWRIGHT_BROWSERS_PATH selects the installed pinned browsers.
No Node22 local result is claimed.

All required checks pass at exactcf1f508:

- Ambience loop10, including scratch regeneration, decoded duration/non-silence/no-clipping/seam/recipe and credits checks.
- All56-file loudness proof, including the unchanged quiet ambience target.
- Full mixer56-key runtime checks and56-asset unique mastering partition.
- Typecheck, registered147, default loosen1-none, build and size.
- Built public-asset byte comparison and clean checkout.

Raw commands, exits, tested commits and timings remain in fresh/exit-status.json.
Full output remains in fresh/*.log; validate.py records the serial sequence.
The browser proof ran alone, without checkout writes/builds/evidence copying during Vite activity.
Evidence was copied only after the mixer/browser/server exited.
The existing three negative controls remain in docs/proofs/1014-ambience-type/; no unnecessary repeat is claimed.

The first scope audit encountered sandbox spawnSync git EPERM before validation.
scope-initial-sandbox-diagnostic.txt retains the actual diagnostic excerpt.
The scope audit passed with managed subprocess permission; no source or threshold changed.

Actual merge-head size against fresh main9bde986:

```text
ok   index growth: base 124340 B, PR 124333 B, -7 B, allowance 400 B
ok   sound-extra growth: base 225 B, PR 225 B, +0 B, allowance 200 B
size-prove: all chunks inside ceiling and growth allowance
```

All ceilings and allowances remain unchanged, including index125200B/400B growth.
The final evidence-only head receives its own footer-sensitive build/size/source/clean/remote audit.
Its exact output is posted on the PR, avoiding recursive evidence commits.

Fresh independent Opus review, green final-head CI and exact-clip owner listening approval remain required.
The published7d0eb7d listen link remains valid because the asset is byte-identical.
Parent playback/UI integration remains separate under #662/#669.
No builder merge, main push, force-push, CI retry, settings change or budget increase occurred.

— Codex-p
