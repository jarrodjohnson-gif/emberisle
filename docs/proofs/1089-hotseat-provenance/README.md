# Hotseat Leave failure provenance (#1089)

Builder: Codex-open-table-833, GPT-6.1 Sol. Main `5bb959c`; proof head `6cfd6ef`.
Fresh independent clone `work/verify1089-provenance`, frozen root/server installs,
Node 24.19.0, Chromium/SwiftShader. Browser runs are serial.

## Change and unchanged checks

Only `scripts/hotseat-prove.mjs` changes executable code. [Exact diff](source.diff):

- Line 9 extends the existing fs import for failure artifacts.
- Lines 33–55 record native input targets/keys/trust/timestamps and sound-pump scheduling,
  firing and lateness. Timer callback arguments, receiver, delay and return handle are delegated.
- Line 61 adds ordinal/path/timestamp/stack to the original non-music playback observation.
- Lines 370–385 catch the original Leave assertion only to save/log records, then rethrow
  the same failure. Capture errors cannot replace it. Its condition and message are unchanged.

The original 400 ms quiet predicate, 4000 ms deadline, post-Leave state wait, 2000 ms
first-play wait, observed slice and every other original proof line remain in order.
The assertion is reindented inside its catch; the fs import is extended. The [line audit](line-audit.py)
and [loosen audit](loosen.log) check this. No wait, retry, clip filtering/substitution or
application behavior is added. Instrumentation has overhead and can perturb timing.

Success emits no diagnostic or artifact. Failure writes full history to
`test-results/hotseat-leave-diagnostic.json`, already included by the existing CI artifact
upload, and prints its last 80 records with the baseline, observed slice and full clip list.
The pump hook identifies the unminified served-source function named `pump` (currently
unique in src); a future rename can invalidate that hook, and absent records do not prove
an empty queue.

## Measured checks

[Normal full proof](normal.log): exit 0, Leave exactly `click_001`, no diagnostic output or
artifact. [Explicit extra-clip control](control.log): exit 1 through the original
`not click_001.wav once` failure; no assertion is relaxed. The external [harness](extra-clip.mjs)
adds one `back_001` on native Leave pointerup and changes no timer. [Raw records](control.json)
and [validation](validation.json) retain all 140 records, 24 non-music starts, 23 pump
schedules and 22 fires. Every recorded audio ordinal/path matches the original `__plays`
array; the baseline/slice and trusted native Leave pointerdown/up/click are independently
checked by [validate-control.py](validate-control.py). The injected clip's stack names
`controlledLeaveExtraClip`, distinguishing it from queued application sounds.

[Types](types.log), [build](build.log), [registration of 129 proofs](registered.log),
[loosen](loosen.log) and [all fixed size limits](size.log) pass. Measured index 125137 B
versus built main 125141 B (−4 B / 400 B allowance); no budget changed. The existing
registered hotseat proof remains the CI entry; there is no new product proof command.

## Earlier cue observed before the injected clip

The controlled run also records a separate stale-cue boundary failure **before** the extra
clip is injected. Browser performance-clock times, independently checked from the raw JSON:

| Record | Time (ms) |
|---|---:|
| Last pre-baseline audio, ordinal 21 (`click_001`) | 7251.3 |
| Original quiet gate's last count-change time, count 21 | 7251.5 |
| Pump scheduled at 7251.3 for 150 ms, fires 301.4 ms late | 7702.7 |
| First post-baseline audio, ordinal 22 (`scratch_001`) | 7704.8 |
| Trusted native Leave pointerdown | 7764.6 |
| Trusted pointerup and controlled extra `back_001`, ordinal 23 | 7768.2 |
| Queued `click_001`, ordinal 24 | 7857.2 |

The original baseline is 21; the observed slice is `[scratch_001, back_001, click_001]`.
The earlier scratch cue occurs after the baseline and over 400 ms after the quiet count
changed, yet before both native Leave pointerdown and the injected extra clip. The recorded
pump was already scheduled before that quiet interval. Thus this instrumented run shows
that a playback-quiet interval can pass while an earlier cue remains queued. The later
injection cannot explain that earlier playback. This supports the desk's queue-boundary
hypothesis in this observation; it does **not** identify the unobserved CI `back_001` origin.
A stricter queue-drained proof boundary belongs in a separate follow-up, as the desk stated
on #1089. No such fix is mixed into this diagnostics task.

## Reproduce

From a checkout with frozen dependencies and Chromium installed:

```sh
PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers npm run hotseat-prove
PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node --import ./docs/proofs/1089-hotseat-provenance/extra-clip.mjs scripts/hotseat-prove.mjs
python3 docs/proofs/1089-hotseat-provenance/validate-control.py
python3 docs/proofs/1089-hotseat-provenance/line-audit.py
```

The second command deliberately exits 1. To validate a newly generated trace, pass
`test-results/hotseat-leave-diagnostic.json` to the validator; its fixed timestamp-order
checks describe this published observation and a different run may not contain the same
extra earlier cue. The raw recording is retained for that reason. Local results are not
CI success or independent review; no merge was performed.
