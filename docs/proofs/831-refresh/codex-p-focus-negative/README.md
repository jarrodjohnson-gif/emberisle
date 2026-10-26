# PR 883 final scoped validation

GPT-6.1 Sol; parent: Codex-p. Existing PR #883 only.

Frozen browser source: `0331546203880bb5646401c77c0430803cb93937`.
Final source audit: `830812c67798671ffb5f7331bb5606890a958ac5`.
Between those heads, runtime and both browser proofs remain byte-identical.
Only proof-archive documentation and one `size-prove.mjs` comment changed afterward.
This evidence commit changes documentation only.

## Results

Parent ran each original command and read its exit status. Both browser proofs ran serially under the shared lock.
This worker independently verified logs, final source hashes, clean frozen checkout and all archived original bytes.

| Check | Actual exit | Evidence |
| --- | --- | --- |
| Typecheck | 0 | `typecheck.log.gz` |
| Registration, all 151 proofs | 0 | `registered.log.gz` |
| Proof loosening against actual main d09d72f | 0 | `loosen.log.gz` |
| Eight size fixtures at browser source | 0 | `size-delta.log.gz` |
| Production build | 0 | `build.log.gz` |
| Size ceilings and base growth | 0 | `size.log.gz` |
| Full trade-tabs, six viewport/motion contexts and genuine failed import/reopen | 0 | `trade-tabs.log.gz` |
| Full client, including new WinScreen assertion and unchanged host-down restore | 0 | `client.log.gz` |
| Negative-focus mutation control | 1, intended new assertion | `client-focus-mutation.log.gz` |
| Eight size fixtures at final830812c | 0 | `final-size-delta.log.gz` |

Client output records both negative-tabindex directions landing on `win-menu`.
The unchanged host-down restore reached the title card after 3295 ms.
The complete client suite ended `client prove ok`.
Trade output ended `trade tabs proof ok: three viewports, both motion settings, real rules settlement, zero browser errors`.
The genuine failed import generated two expected isolated error reports before successful recovery.
No browser or build rerun occurred during this documentation step.

## Commands and environment

Original checkout: `/workspace/p883-b-frozen-validation`, frozen at0331546 throughout the parent's build and browser runs.
Node `24.19.0`; npm `11.9.0`; Chromium `153.0.8010.12`; Playwright `1.63.0`, Chromium revision `1243`.
Browser executable selection removed `CHROMIUM_PATH` and used the shared Playwright browser directory.

```sh
npm run typecheck
npm run registered-prove
npm run loosen-prove -- --base d09d72faaa3c23b426362d7a4f49df498e42e153
npm run size-delta-prove
npm run build
node scripts/size-prove.mjs --base /tmp/emberisle-873-main-size-base
env -u CHROMIUM_PATH PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers flock /tmp/emberisle-team-browser.lock npm run trade-tabs-prove
env -u CHROMIUM_PATH PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers flock /tmp/emberisle-team-browser.lock npm run client-prove
```

The separately built size base is exact `d09d72faaa3c23b426362d7a4f49df498e42e153`.
After browsers ended, this worker fetched final830812c into that frozen checkout and ran:

```sh
node scripts/size-delta-prove.mjs
```

The final frozen checkout is clean. All319 recorded source hashes match the source checkout at830812c.
See `source-sha256.json` and `audit.json`. No runtime or proof changed during archival or evidence packaging.

## Shared focus helper control

`focusableIn` affects every dialog using `useFocusTrap`, beyond trading.
The existing client proof adds a WinScreen case temporarily assigning `tabindex=-1` to Look around.
It preserves the earlier positive Tab/Shift+Tab assertions and restores the attribute before continuing.
Both forward and backward focus must reach Table menu.

Parent ran the negative control alone on private proof checkpoint `35a2e1265cbd5c1c14b33fd69cd1ceb95509128e`.
It removed only ` && el.tabIndex >= 0` from the shared helper.
The full client command above exited1 at the intended new assertion:

```text
FAIL win screen: negative tabindex button entered the Tab sequence: {"afterNegativeTab":{"id":"win-look","inDialog":true},"afterNegativeShiftTab":{"id":"win-menu","inDialog":true}}
```

No mutation was committed or pushed. Parent restored the exact helper bytes and verified the checkout clean.
Restored SHA-256: `e36dba409562b9b53fb4e3e736854b05f3ef9aa381131ece8a31f00d5969b68a`.
The hash also matches current source. `focus-mutation.json.gz` retains the original metadata.
`initial-control-README.md.gz` preserves the parent's original control record without rewriting it.

## Exact sizes and archival audit

Current Node gzip sizes: index124373/125200 B, sheets7137/7800 B, TradeResource825/1650 B.
Against exact d09d72f: index+2/400 B; sheets−8/200 B. All ceilings and allowances remain unchanged.
TradeResource is the exact former BankTradePicker component bytes; its1650 ceiling and seven1430 fixtures transfer unchanged.
The renamed chunk appears new to the base size checker. Its existing ceiling remains1650 B.

Independent archive audit reconstructed all164 original paths and compared every byte with git0331546.
The138 archived files and26 visible files matched, including all nine owner PNGs and original READMEs/tables.
Archive SHA-256 remains `6b41f29379d11b2dfd82ced2d00f617e43a8a781c75a272ee9eeb641ccc5e2ee`.
See [archive extraction and path index](../archive/README.md).
Every new `.gz` payload decompresses to its original output bytes. `SHA256.json` covers this evidence folder.

## Retained earlier failures and coordination

The intentional B-proof failure against old A remains distinct from the first source B runtime failure.
The source B runtime failure read `__emberisle` undefined; a document-write correlation remains unproved.
The earlier frozen client host-down restore failed after IslandCanvas import errors.
Passive main3194ms and candidate3365ms passes did not establish a cause. The new passing run also establishes no cause.
No source fix is claimed. Earlier failure logs remain losslessly archived; investigation is issue #1166.

Initial claim6429528519 was rejected by bot6429531876 for an ISO date where YYYY-MM-DD was required.
It was not accepted. Work continued the existing parent-authorized883 scope, without a new claim-winner assertion.
This documentation continuation uses valid dated claim6429638532. No other claim is released.
Parent owns exact-head CI, owner acceptance, PR body and independent review. No ready-state change or merge.
