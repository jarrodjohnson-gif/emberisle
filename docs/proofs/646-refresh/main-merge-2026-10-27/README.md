# Main refresh validation for #873

Codex-p. Merge helper: GPT-6.1 Terra. Log-summary helper: GPT-6 Luna.
This is builder validation, not an independent code review.

## Frozen commits

- Tested normal merge: `37d59016034576641a212108bc46e3663baa001b`.
- First parent: `3a589de42aefbca6d7a85e730bcb6a09aac8d374`.
- Main parent and size baseline: `df5777beba6aa4b28be6741ff4822496c20f6833`.
- Result tree: `29680e6f21d51fae7ac5731d024b48fa1ff9b787`.

The merge had no conflicts or manual resolutions. Original authorship remains intact.
Incoming runtime changes concern IslandCanvas, board generation, harbor packing and IsleRenderer.
Incoming proofs include connection health, spiral, dock piles, many-seed packing, jelly ocean and WebGL recovery.
Both proof registration files retain the existing Needs and audio registrations.
No unmerged #883 or #1181 code was copied.

`merge-audit.json` records nine blobs preserved exactly from the first parent.
They include the Needs/audio proofs, SeatNeeds, PlayerMenu, TradePanel, transport, host and both lockfiles.
All 325 tracked source files matched frozen HEAD during validation and after the final control.
Five documentation artifacts were generated inside the validation clone, including version pictures and the fallback screenshot.
Their bytes are archived. They are not replacements for main's committed pictures.
The merge checkout received no generated runtime or proof changes.

## Initial failures and corrected build setup

The initial serial sweep completed 42 checks: 40 passed and two failed.
`restore-prove` timed out after 30000 ms waiting for the initial table code.
`version-prove` timed out after 60000 ms waiting for lobby, before its client-stamp assertion.
Both ran after `connection-health-prove` rebuilt `dist` programmatically in development mode.
This local cross-suite order differed from CI's separate jobs.
The programmatic build's exported hostUrl selected 8787 for a page served on another port.
The fresh production baseline selected the page's actual port.

A single observed restore control reproduced the same failure without modifying the registered proof.
It recorded the page at `http://127.0.0.1:38939/` dialing `ws://127.0.0.1:8787/`.
The socket was refused. The failure snapshot showed title screen, no lobby, and `Lost the table`.
The observer reads diagnostic state after the original rejection and rethrows that error.
Its snapshot has a 1200 ms bound. Observer overhead makes it unsuitable for acceptance timing.
The control exited1; it is not a passing proof or an audio diagnosis.

A normal production rebuild restored the served-host default without source changes.
The unchanged restore, chunk-failure and version proofs then passed against that production build.
The frozen main production restore also passed.

```text
candidate board times: 2672,1316,2429,1501,2151 ms; median 2151, max 2672
main board times: 2857,1568,1447,1636,1930 ms; median 1636, max 2857
restore budget: five reloads; median 3000 ms; every run below 6000 ms
production version: host metadata, fallback, production stamp, mismatch, legacy/invalid hosts and reset passed
needs server prove ok
```

These are individual control samples, not a statistical performance comparison.
No timeout, assertion, tolerance, resource budget or allowance changed.
Restore budget overrides and inherited NODE_ENV were unset.
A preliminary browser launch lacked the cache path and failed before any proof ran.
The actual sweep and controls used Playwright's installed Chromium 153.0.8010.12.
They set PLAYWRIGHT_BROWSERS_PATH and ran serially under the team browser lock.

## Static and size checks

Fresh no-local clones used frozen client and server installs.
Typecheck, registration, loosen, build and size checks passed.
Registration reported 154 proofs. Loosen compared two changed proofs against main and found none loosened.

```text
final production index: 124761/125200 B gzip; +154/400 B against main 124607
final production IslandCanvas: 200936/202500 B; +0/663 B against main 200936
SeatNeeds: 1895/1900 B gzip; new chunk against main, existing PR ceiling unchanged
table: 2118/2200 B gzip; +27/200 B against main 2091
size-prove: all chunks inside ceiling and growth allowance
```

The initial CLI production build and final rebuilt production build have separate raw logs.
The larger development build measurements are retained separately and are not reported as production sizes.

## Retained CI failure and gates

Earlier pushed-head CI 40463564922 failed lobby-layout at 375x667.
Invite padding measured 8.0/7.9 against the unchanged 8 px requirement.
The first three viewports passed. Audio-recovery passed; server was cancelled and aggregate checks failed.
The current local lobby proof passed all six viewports; that pass does not explain the earlier CI failure.
PR #1181 belongs to its existing worker and remains separate.
Earlier audio and client/resource failures remain cause-unproved.
The local development-build ordering explains this local restore control, not those earlier CI incidents.

Trade integration still waits for #883's approved B implementation and merge.
Its dimming, desktop/hotseat and seat-chip questions remain open.
This refresh does not complete #646 or claim owner acceptance or independent review.

## Initial sweep: actual results

| Existing command | Exit | Seconds |
| --- | ---: | ---: |
| `npm run needs-prove` | 0 | 21.337 |
| `npm run seat-rail-prove` | 0 | 18.669 |
| `npm run spiral-prove` | 0 | 0.965 |
| `npm run connection-health-prove` | 0 | 21.577 |
| `npm run render-recovery-prove` | 0 | 26.963 |
| `npm run webgl-recovery-prove` | 0 | 8.693 |
| `npm run hole-prove` | 0 | 160.154 |
| `npm run hand-offer-prove` | 0 | 14.265 |
| `npm run chunk-fail-prove` | 0 | 47.780 |
| `npm run restore-prove` | 1 | 31.233 |
| `npm run sounds-prove` | 0 | 146.610 |
| `npm run audio-recovery-prove` | 0 | 7.927 |
| `npm run music-prove` | 0 | 12.764 |
| `npm run climber-prove` | 0 | 83.054 |
| `npm run idle-prove` | 0 | 22.982 |
| `npm run upgrade-prove` | 0 | 42.485 |
| `npm run flash-prove` | 0 | 97.510 |
| `npm run reflow-prove` | 0 | 21.697 |
| `npm run rotate-prove` | 0 | 103.956 |
| `npm run banner-stable-prove` | 0 | 46.490 |
| `npm run howto-prove` | 0 | 93.256 |
| `npm run visual-direction-prove` | 0 | 44.119 |
| `npm run jelly-ocean-prove` | 0 | 59.711 |
| `npm run waves-prove` | 0 | 14.426 |
| `npm run splash-prove` | 0 | 117.560 |
| `npm run polish-tokens-prove` | 0 | 14.041 |
| `npm run roll-moment-prove` | 0 | 104.529 |
| `npm run goods-log-prove` | 0 | 21.079 |
| `npm run stage-prove` | 0 | 2.144 |
| `npm run turn-gain-prove` | 0 | 277.560 |
| `npm run win-action-prove` | 0 | 271.227 |
| `npm run lobby-overflow-prove` | 0 | 12.951 |
| `npm run lobby-layout-prove` | 0 | 69.469 |
| `npm run table-menu-prove` | 0 | 41.689 |
| `npm run version-prove` | 1 | 62.598 |
| `npm run build-ready-prove` | 0 | 89.402 |
| `npm run board-look-prove` | 0 | 114.068 |
| `npm run dock-piles-prove` | 0 | 52.312 |
| `npm run dock-piles-many-seeds-prove` | 0 | 14.049 |
| `npm run roll-log-prove` | 0 | 25.617 |
| `npm run public-score-prove` | 0 | 66.259 |
| `npm run hand-hidden-prove` | 0 | 99.350 |

## Build correction and controls: actual results

| Recorded operation | Exit | Seconds |
| --- | ---: | ---: |
| `changed-build-observed-restore` | 1 | 31.272 |
| `production-rebuild` | 0 | 1.332 |
| `production-hosturl` | 0 | 0.079 |
| `production-restore` | 0 | 25.616 |
| `production-chunk-fail` | 0 | 47.342 |
| `production-version` | 0 | 22.408 |
| `main-production-restore` | 0 | 25.215 |
| `server-needs` | 0 | 2.270 |
| `production-size` | 0 | 0.105 |

The result JSON files retain exact commands, working directories, UTC times, durations, exits and log hashes.
`changed-build-observed-restore` is the retained failing diagnostic, not a successful check.
These external runners and observers are archived diagnostics, not new CI proof entry points.
Every exercised regression proof remains registered and unchanged by this refresh beyond incoming main.

## Read the raw evidence

`records.json` maps each archive to its original path, byte count and SHA256 hashes.
Read a log with `gzip -dc raw/<name>.gz`.
Verify all archived bytes from this directory:

```python
import gzip, hashlib, json, pathlib
root = pathlib.Path('.')
for record in json.loads((root / 'records.json').read_text())['files']:
    packed = (root / record['archive']).read_bytes()
    assert hashlib.sha256(packed).hexdigest() == record['gzipSha256']
    data = gzip.decompress(packed)
    assert len(data) == record['bytes']
    assert hashlib.sha256(data).hexdigest() == record['sha256']
```
