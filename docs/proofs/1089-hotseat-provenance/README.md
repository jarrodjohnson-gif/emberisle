# Hotseat Leave failure records (#1089 / #1092)

Builder: Codex-open-table-833, GPT-6.1 Sol. Current main `672a54f` merged normally
at `7703b8f`. Cheap collector implementation `afaf9b1`; fresh independent clone
`work/verify1092-cheap`, frozen root/server installs, Node 24.19.0 and Chromium/SwiftShader.
Browser proofs ran serially.

## Collection and emission

Cheap input/audio/pump records are collected on passing runs too. **Only the original
Leave assertion's failure emits or saves them.** This follows the desk's fresh review:
there is no per-sound or per-timer stack capture. The sole stack is for the native Leave
click itself, as requested. No application code changes.

[Exact diff against current main](source.diff): fs import line 9; collector lines 33–68;
one audio record at line 74; failure capture/rethrow lines 383–398. The original assertion
condition/message, 400 ms / 4000 ms quiet invocation/predicate, state wait, 2000 ms first-play
wait, slice and every other original proof line remain in order. Only the import is
extended and the assertion reindented. [Line audit](line-audit.py) and [loosen](loosen.log)
pass. No pending-queue guard, added wait, retry, clip filter or sound substitution is here.

On failure the full record is written to `test-results/hotseat-leave-diagnostic.json`,
already covered by CI's artifact upload. Its last 80 records and original baseline/slice
are printed. Capture errors still rethrow the original failure.

## Added work on the success path

These are operation counts from the source and a delegation control, **not latency or
CPU-cost measurements**:

| Hook invocation | Added record work |
|---|---|
| Non-music playback start | 1 clock read, 1 small record object, 1 trace push, scalar field/index reads/writes |
| Pump timer arm | 1 WeakMap lookup, counter/field updates, 1 clock read, 1 record and trace push |
| Pump timer fire | 1 clock read, 1 record and trace push, original callback delegation |
| Native input | One small record/clock read/push plus target fields; a stack only on the Leave click |

Audio reuses the path already parsed into the original `__plays` array; it does not parse
another URL. Argument forwarding creates the ordinary rest-argument arrays in the timer
hook. One stable wrapper is allocated per original pump callback, then reused through a
WeakMap instead of allocating a closure every re-arm. The original callback itself is
wrapped (its identity at native registration is therefore different); the replacement
identity is stable. Delay, native returned handle, receiver and arguments are delegated.
Non-pump callbacks pass through with their original identity. The current served-source
sound pump has one outstanding timer at a time; this is not a general timer scheduler.

[Delegation control](delegation.log) executes the actual extracted init hook against a
synthetic native timer/media boundary. It verifies stable wrapper reuse, unchanged
non-pump identity, delay/handle/receiver/argument delegation and native play return value.
Two pump cycles plus one audio start perform exactly five clock reads and five trace
pushes, with zero audio/pump stack fields. [Results](delegation.json) and the
[reproduction harness](delegation.mjs) are retained. Native browser timing is not inferred
from this synthetic control.

Five passive capture listeners and the timer delegator still have overhead. The hook
recognizes the unminified function named `pump`, currently unique in src. A future rename
can invalidate it; missing records do not prove an empty queue. Records show observed
inputs/playback/timer order, not private queue contents or the original request site of
a queued clip. The Leave-click stack is the capture listener's stack, not an audio stack.

## Fresh validation

- [Full normal proof](normal.log): exit 0, exactly `click_001`, no diagnostic output or file.
- [Explicit extra-clip control](control.log): exit 1 through the unchanged original
  assertion. A control-only marker records the one extra `back_001` on native Leave
  pointerup; no timer is delayed. [Raw data](control.json), [validation](validation.json)
  and [independent audit](control-audit.log) retain baseline 24 and original observed
  `[back_001, click_001, click_001]`, 150 records, 27 starts, 26 pump arms and 25 fires.
  Every audio ordinal/path matches `__plays`; baseline/slice, trusted Leave events and
  explicit injection ordinal/time are checked. Audio/pump stack count is **0** and the
  native Leave-click stack count is **1**.
- [Types](types.log), [build](build.log), [registration129](registered.log),
  [loosen](loosen.log) and [all fixed size limits](size.log) pass. Index 125135 B versus
  built main 125138 B (−3 B / 400 B); no budget changes. The existing hotseat proof remains
  the CI entry, with no new product proof command.

The previous heavier collector's trace at [73139f3](https://github.com/jarrodjohnson-gif/emberisle/blob/73139f3/docs/proofs/1089-hotseat-provenance/control.json)
recorded an earlier scratch cue after its baseline and before native Leave/injection.
That is a historical observation with heavier hooks, not a representative timing or
root-cause measurement. The cheap trace above supersedes it for this PR. The original CI
`back_001` request origin remains unknown. #1093 stays gated on this task's review/closure;
no boundary fix is mixed in.

## Reproduce

With frozen dependencies and Chromium installed, from the repository root:

```sh
PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers npm run hotseat-prove
PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node --import ./docs/proofs/1089-hotseat-provenance/extra-clip.mjs scripts/hotseat-prove.mjs
python3 docs/proofs/1089-hotseat-provenance/validate-control.py test-results/hotseat-leave-diagnostic.json
python3 docs/proofs/1089-hotseat-provenance/line-audit.py
node docs/proofs/1089-hotseat-provenance/delegation.mjs
```

The extra-clip command deliberately exits 1. The validator defaults to the published raw
trace when no path is supplied. Local validation is separate from new-head CI and
independent review. No merge was performed.
