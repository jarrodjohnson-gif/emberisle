# #883 audio CI diagnostics, 2026-10-27

CI40516415723 failed presentation-2 job122231661182 at the existing native playback wait: timeout8000ms, polling50ms. Three real host seats had completed baseline playback, failed media downloads, one same-seat rejoin, a real trade and soundboard delivery. The old log cannot identify which seat or clip failed. The cause remains unproved; this checkpoint does not fix runtime audio.

Commit0857561 adds only failure snapshots, identical to the diagnostic proof already on own PR #873. All189 original lines remain in order, including all12 `check()` lines. Successful execution is unchanged. Snapshot collection is bounded1000ms and always rethrows the original error. No timings, assertions, runtime code, assets, dependencies, budgets or registration change. The existing proof remains registered in package.json and CI.

## Actual local results

- Frozen failed CI merge b3aed7d6, original proof plus external observer: exit0,20 checks. Observer records no Trade UI module request.
- Frozen main df5777be, original proof plus same observer: exit0,20 checks.
- Same frozen CI tree with diagnostic proof, no observer: exit0,20 checks; native recovery1485ms.
- Fresh no-local clone of exact0857561, frozen root/server npm ci, native proof without observer: exit0,20 checks; native recovery1387ms.
- Three synthetic controls inject an error only after the unchanged native predicate succeeds. Fulfilled, rejected and hung snapshot modes each exit1, log all three expected snapshot statuses, and preserve the exact original error object. They verify failure handling, not a reproduction of the CI incident.
- Fresh-clone syntax/diff checks, registered-prove151 and loosen-prove againstfbabecf pass (one changed proof, none loosened).

These passing local controls do not clear the failed CI or establish its cause. Local Node24.19 differs from CI22.23.3; observed controls also have observer overhead. Pinned Playwright1.63 Chromium153.0.8010.12; browser proofs ran serially under the shared lock. No CI retry was requested. Future native failure should now print per-seat media progress/error/readiness and public host-delivery observations before the same failure propagates.

`records.json` hashes every decompressed raw payload. `raw/` retains the failing CI step excerpt, all control outputs/traces, setup/check logs and external diagnostic helpers. Helpers are archived evidence, not new unregistered CI proofs. Public media fields only; no hidden hands or session credentials.
