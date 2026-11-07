# PR905 current-main maintenance

Codex-p (GPT-6.1 Sol), 2026-10-26. Existing PR #905 / issue #627.
Original Gemini and prior adoption authorship remain intact.

Normal merge `96ad756ca4cb1d824e19070021c56457eb4cf260` has these parents:

- Published PR head `6bf1ed4b110e79ce88b6c8e855262dd4ad748d8f`.
- Current main `074faf0a2405484369b511655a78d768a964d28d`.

The merge applied automatically, without manual conflict resolution.
Package and CI retain every main registration, plus keyboard-fit once.
All 1,565 main files match, except existing feature files and keyboard registrations.
Renderer, keyboard proof and hole proof remain byte-identical to `6bf1ed4`.
Main's Hud, styles, robber-prompt proof and nightly soak policy remain exact.
Budgets, detector, dependencies and both lockfiles remain unchanged.
`scope-merge.json` records blob hashes, parents and preservation checks.
The initial scope-report attempt incorrectly requested an absent old robber-prompt blob.
The corrected report handles absent files explicitly; no runtime or proof changed.

The independent validation clone used frozen root/server installs at exact `96ad756`.
The dedicated size base used frozen main `074faf0`, built freshly.
Local tools: Node 24.19.0, pinned Playwright 1.63.0 and Chrome 153.0.8010.12.
No Node 22 local result is claimed.

All ten required checks pass in the intended pinned browser setup:

- Typecheck, registered147, loosen1-none, build and size.
- Keyboard57, hole600/0, rotate-overlays, robber-prompt and full client.

`fresh/exit-status.json` records commands, working directories, tested commits, timings and exits.
`validation-runner.py` records the setup and strict serial execution.
All browser proofs ran individually, without checkout writes, builds or evidence copying during Vite activity.
Evidence was copied only after all browser/server processes exited.
The validation clone was clean afterward.

The initial keyboard run explicitly selected full Chrome through `CHROMIUM_PATH`.
It exited1 after39.04s: phone/tablet cropped-home samples found the crop already cleared.
Both actual failures and snapshots remain in `fresh/keyboard.log`.
This run differed from the prior harness and CI's default headless-shell launch.
No claim about exact goHome/settle timing is made from those snapshots.

The environment correction omitted `CHROMIUM_PATH` and retained `PLAYWRIGHT_BROWSERS_PATH`.
The unchanged proof then used the pinned default headless shell and passed57 checks in19.54s.
Its raw output remains separately in `fresh/keyboard-headless.log`.
No runtime, assertion, frame count, timeout or600ms timer was edited.
The initial failure remains visible for independent review.

All remaining browser checks used the same pinned default headless-shell setup.
Keyboard already covers real touch pan; no separate pan rerun was needed.
The source audit found no renderer/projection change from the reviewed head.
Robber-prompt covers390x844,844x390,1280x720, real7/other-seat waiting, Take-from, cleanup and Knight.

Actual merge-head gzip output against fresh main074faf0:

```text
ok   index growth: base 124337 B, PR 124340 B, +3 B, allowance 400 B
ok   IslandCanvas growth: base 200569 B, PR 201098 B, +529 B, allowance 662 B
size-prove: all chunks inside ceiling and growth allowance
```

The final evidence-only head receives its own footer-sensitive build/size/source/clean/remote audit.
Its exact bytes and audit output are posted on the PR, avoiding recursive evidence commits.

Fresh independent Opus registration/proof-delta review and green final-head CI remain required.
Real iPhone Safari and Android Chrome acceptance remains UNSATISFIED before merge.
Required sequence: two-finger pan; chat then PlaceList input; keyboard close; cropped empty-board double tap.
Cloud viewport/focus/CDP checks do not establish hardware acceptance.
Desk correction6403071308 confirms no real-phone result exists.
The separate home-glide-on-keyboard-open follow-up remains outside this PR.
No builder merge, main push, force-push, CI retry, settings change or budget increase occurred.

— Codex-p
