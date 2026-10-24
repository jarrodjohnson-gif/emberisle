# Deterministic army/path fixtures (#1051)

Builder: Codex-open-table-833, GPT-6.1 Sol. Implementation `63f5483`; current main
`10dbecd` merged normally at `6710d0f`. Verification uses a fresh independent clone
`work/verify1051-fixture` with frozen root/server installs, Node 24.19.0 and
Chromium/SwiftShader. Browser runs are serial.

## Correction

The board seed did not fix native crypto roll-off dice. The existing greedy legal setup
and growth could fail every seed for some setup orders, before any browser assertion.
The controlled old fixture reproduces that guard failure; the original CI draws are
unknown and no natural failure-rate claim is made.

[Only fixture construction changes](source.diff). Four prescribed valid uint32 draws
`[5,2,4,3]` go through the real `rollDie` and `applyAction`: p0 rolls6, p1 rolls3, p2 rolls5,
p3 rolls4, producing the demonstrated usable order p0,p2,p3,p1. The original legal
setup/action sequence then succeeds at seed1. The original seed1–59 search and setup200
bound stay unchanged, as do all nine scenarios and their original assertions.

Only synchronous `settled` construction temporarily overrides Node crypto's single-element
Uint32 draws. Other array types delegate to native crypto. Unexpected extra dice fail a
new guard. `finally` restores the original own property descriptor, or removes the temporary
own property if the native method was inherited. Both function identity and descriptor are
checked before browser pages. The global crypto object is not replaced; production
randomness, scoring, rendering and browser crypto are unchanged.

The original null-fixture guard remains before the new seed/order checks. The entire
browser assertion and failure-diagnostic block is byte-identical to current main.
[Source line audit](line-audit.py) retains every original proof line in order, ignoring
indentation only. Existing holder, tie, minimum, layout, pulse, reduced-motion, viewport,
contrast and zero-console-error checks remain active. No assertion, seed bound, timeout or
bundle allowance was relaxed.

## Real-rule construction controls

The [harness](controls.mjs) extracts the actual fixture block and loads the real board/rules
through Vite SSR; it does not maintain a second fixture implementation.
[Full results](controls.json) and [output](controls.log):

- Normal: one deal at seed1, four real roll-off actions, nine states and all18 expected
  holder values. A second construction produces equal values for all nine full states.
- Deliberately unusable order p0,p1,p2,p3: all59 seeds fail at the unchanged original guard.
  Native function and descriptor are restored.
- Forced exception after two real entropy-consuming roll-off actions: the same function
  and descriptor are restored by `finally` on the failure path.

The [old-fixture reproducer](old-order.mjs) reads the pre-fix script at `672a54f` and uses
current real rules. It exhausts exactly59 deals/236 roll-off draws for the unusable order,
then reaches the original `the rules built every scenario on some island` error.
Its outer control restores native crypto too. [Data](old-order.json), [output](old-order.log).

| Scenario | Path holder | Army holder |
|---|---|---|
| path4 below minimum | none | none |
| path5 leads | p1 | none |
| path5 ties path5 | p1 | none |
| paths4,5,7,2 | p2 | none |
| army2 below minimum | p2 | none |
| army3 against2 | p2 | p0 |
| army3 ties army3 | p2 | p0 |
| army4 passes army3 | p2 | p1 |
| one seat holds both | p2 | p2 |

## Current-main validation

[Full unchanged browser assertion set](browser.log) passes at440×956,956×440,1280×720
and390×844 on current main10dbecd. All nine states are shown at each viewport; existing
pulse/reduced-motion and clearance checks remain. The proof also passed on the earlier
base before main advanced; the published log is the refreshed run including main's haptics.

[Types](types.log), [build](build.log), [registration130](registered.log),
[loosen](loosen.log) (one existing proof, none loosened), and [all size limits](size.log)
pass. Measured index125189 B equals built main125189 B: +0 /400 B and below125200 B.
No package/CI registration is needed because the existing registered proof contains the
new construction guards. No application, CI, budget or asset file changes in this diff.

Reproduce from a checkout with frozen dependencies and Chromium available:

```sh
node docs/proofs/1051-fixture/old-order.mjs
node docs/proofs/1051-fixture/controls.mjs
python3 docs/proofs/1051-fixture/line-audit.py
PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers npm run longest-army-prove
```

The control harnesses catch their explicitly expected fixture failures and exit0 only if
the guards and restoration checks behave. New PR CI and independent review are separate
gates; no merge was performed.
