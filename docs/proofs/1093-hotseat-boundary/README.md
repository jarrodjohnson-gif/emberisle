# Drain pending sound pumps before the hotseat Leave baseline (#1093)

Builder: Codex-open-table-833, GPT-6.1 Sol. Prerequisite #1089/#1092 is merged.
Implementation `99b2d75`; current main `47d5b7d` merged normally at `cbfe69c`.
Verification uses the fresh clone `work/verify1093-boundary`, frozen root/server
installs, Node 24.19 and Chromium/SwiftShader. Browser runs are serial.

The cheap recorder's existing native timer delegator now counts pending pump
callbacks. A callback remains counted while it runs and synchronously rearms;
`finally` decrements it even when the callback throws. A failed native timer
registration rolls back its increment and rethrows the same error. The stable
wrapper, native returned handle, delay, receiver and argument delegation remain.
No additional clock, trace record or stack is added for this accounting.

The existing quiet predicate additionally requires zero pending callbacks.
Its original playback count tracking and `now - window.__quietAt >= quietMs`
term remain inside the original **400ms quiet interval / 4000ms deadline**.
There is no extra implementation wait. The Leave assertion/message, native
input, first-play wait, slice, background-music exclusion and every other
original proof byte remain. Application code and sound files are unchanged
relative to current main; no clip is substituted or delayed in the implementation.

`line-audit.py` removes only the four declared changes and requires exact equality
to the complete original proof. Changed proof lines: initialization 51,
callback accounting 62–64, native registration 70–72, and predicate 379.
The existing registered `hotseat-prove` remains the product proof and CI entry;
these evidence controls do not introduce another product proof command.

## Controls and limits

- `predicate-controls.mjs` extracts the actual old/new predicate source. A quiet
  interval with a pending pump is accepted by the old predicate and rejected by
  the new one. Drained work passes, and a new playback count still restarts quiet.
  A real Playwright wait with the actual new predicate rejects an undrained pump
  at its existing 4000ms timeout. The observed wall duration includes protocol
  overhead and does not redefine that bound.
- `delegation.mjs` executes the actual init hook against a synthetic native timer
  boundary. It retains the old delegation/stack/clock checks and verifies pending
  accounting through a synchronous rearm, callback throw and registration throw.
  These are operation/contract checks, not native timing measurements.
- `late-pump.mjs` is a control-only preload. After a drained setup it requests real
  `ui_back` and `card_play` sounds through the served sound module, holding one
  real pump's native timer for 750ms instead of 150ms. The implementation's original
  bounded wait then runs unchanged. `validate-late.py` checks native arm/fire and
  audio ordinals, a pending start, a drained baseline, the actual scratch clip
  before quiet, and acceptance within 4000ms after at least 400ms quiet.
- The existing #1089 extra-clip preload adds one explicit `back_001` at native
  Leave pointerup. The original Leave assertion must still fail; the existing
  metadata validator checks the explicit injection's ordinal and baseline slice.

The counter follows the current unminified, synchronous function named `pump`,
which has one outstanding timer and is not cancelled by the served sound module.
It is not a general scheduler or a claim that all future delayed sounds are absent.
The real-module control confirms recognition on current main. Historical heavier
#1092 timing remains historical; this change does not establish the original CI
`back_001` request origin or a CPU cause.

## Reproduce

From an installed checkout with Chromium available:

```sh
npm run hotseat-prove
node docs/proofs/1093-hotseat-boundary/delegation.mjs
node docs/proofs/1093-hotseat-boundary/predicate-controls.mjs
BOUNDARY_EVIDENCE=/tmp/late.json node --import ./docs/proofs/1093-hotseat-boundary/late-pump.mjs scripts/hotseat-prove.mjs
python3 docs/proofs/1093-hotseat-boundary/validate-late.py /tmp/late.json
node --import ./docs/proofs/1089-hotseat-provenance/extra-clip.mjs scripts/hotseat-prove.mjs
python3 docs/proofs/1089-hotseat-provenance/validate-control.py test-results/hotseat-leave-diagnostic.json
python3 docs/proofs/1093-hotseat-boundary/line-audit.py
```

The extra-clip command deliberately exits 1 at the original assertion. Final raw
traces and output are recorded alongside this note. CI and independent review
are separate from local validation. No merge or CI retry by this builder.

## Recorded results

After the main sound-level merge, the full normal proof passes with exactly
`click_001`. The full real-module delayed-pump run also passes: pending 1 at
7850.7ms, last pump fired 8785.2ms, baseline 9043.0ms with pending 0
and 407.2ms quiet. The measured bounded wait spans
1192.3ms, inside the unchanged 4000ms deadline. These are explicit
control timings, not claims about ordinary CI performance.

The extra-clip run exits 1 at the original assertion with
`["/audio/click_001.wav", "/audio/back_001.wav"]`; the full diagnostic and existing metadata
validator confirm the explicit injection. Both cheap-collector and predicate
controls pass, including the real 4000ms TimeoutError (observed wall 4007ms).
Pure-control predicate/hook bytes were unchanged by the main merge.

At validation commit `cbfe69c`, typecheck/build, registration 131, loosen 1 existing
proof changed with none loosened, and the complete original-line audit pass.
Size passes every unchanged ceiling/growth limit against freshly built
main `47d5b7d`: index 125169 B versus 125173 B (−4 B, allowance 400 B),
ceiling 125200 B. No product-source or registration diff against main.
Final publication-head build bytes are reported on the PR after the evidence
commit; the recorded logs identify this validation commit.
