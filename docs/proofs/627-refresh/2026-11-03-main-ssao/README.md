# Keyboard fit and half-size SSAO after the owner merge

Builder continuation: Codex-p, GPT-6.1 Sol; parent: Codex-p. Claim6615509864.
Scope is evidence only. No source, proof, registration, lockfile or budget edits.

## Source

Jarrod authored normal merge`4e6348db12d7d4266e7a4cd0bc09305c0d163857`.
Its parents are`bc2a7df96f23138ac649dddec6999612ec5b3072` and main`d5b6e48d8b6e4f0f5b39e2e78aa0253d880c3566`.
His existing commit and every earlier author remain intact; no duplicate merge follows.
It resolves Claude6597469708's SSAO conflict in resize().
The shared SSAO size call runs before both keyboard and else paths.
Free view uses ceil(w/2),ceil(h/2); play views use full CSS dimensions.
The keyboard branch still preserves saved projection, top anchoring and pan.
No change to the600ms settlement or any assertion, deadline, tolerance or frame count.
Source-audit.json records exact bytes; keyboard/hole proofs and locks match the prior PR head.

## Focused validation

Pinned Node22.23.4; Playwright1.63.0 and its pinned Chromium headless shell.
Both unchanged proofs run once on the frozen owner merge, strictly serial under`/tmp/emberisle-team-browser.lock`.

- `npm exec --yes --package=node@22.23.4 -- node scripts/keyboard-fit-prove.mjs`: exit0;59 checks passed.
- `npm exec --yes --package=node@22.23.4 -- node scripts/ssao-prove.mjs`: exit0;`ssao-prove ok`.

Keyboard coverage includes real two-finger pan, crop/close/focus transfer, native in-shell focusout ordering and settled-close behavior.
The tablet close restores aspect1.333333 after30frames while preserving pan.
SSAO reports501x301 for1001x601 free view and641x361 after1281x721 resize.
Play/diorama and overhead report1281x721; returning to free restores641x361.
Raw complete outputs and exit results are retained.
These browser tests do not provide physical-phone acceptance.

## Existing hosted checks

Automatic CI41717273583, attempt1, tests owner head4e6348; actor and triggering actor are`jarrodjohnson-gif`.
Build job126202949935 succeeds; its decoded full log is retained.
Hosted checkout is synthetic merge1bf9866 into maind5b6e48; Node22.23.4.
Typecheck/build/size pass: index125189/125200B, base125190B,−1/400B.
IslandCanvas201893/202500B, base201375B,+518/665B.
Every ceiling and allowance remains unchanged.
The archived job/run snapshots were still in progress for the wider CI suite.
No all-CI success or manual rerun is claimed.
Existing full CI covers other merged-main suites; no blanket local rerun is added.

## Gates and retained limitations

Fresh independent Claude review and exact final-head CI remain mandatory.
Jarrod's q905-test physical iPhone Safari/Android Chrome acceptance remains UNSATISFIED.
At game night: two-finger pan, chat then PlaceList input, close keyboard, empty-board double tap with keyboard up.
Cloud viewport/focus/CDP checks do not satisfy that gate.
The original client proof remains interrupted/incomplete; this continuation does not rerun or claim it passed.
Earlier F1 fail-first, failed ordering preconditions,650ms timing-inconclusive control, resource/import and Copy-padding failures remain retained.
See`../codex-p-2026-10-31-ordering/README.md` and earlier PR-body checkpoints.
No failure is attributed away by these focused passes. No merge or hardware acceptance is claimed.
