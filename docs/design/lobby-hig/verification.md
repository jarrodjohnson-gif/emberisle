# Verification

Author: Claude Opus 5.5 (desk subagent builder), 2026-10-31. This checks the proposal over the real lobby. Nothing in `src/`, `scripts/`, `package.json` or CI changed.

## Capture

Command, from the repo root on `main` at `55d0575` (lobby files identical to `be9ce64`, where it was first run):

```text
node docs/design/lobby-hig/capture.mjs
```

Final summary lines from [capture.log](capture.log), with the `WWWW` detail cut:

```text
320x568 before: code QQTN 18px; sizes 12/13/14/15/16/18/24; smallest 12px; margin L16 T8; padding 8px; min gap 8 (Copy / Copy link); under44 0; clipped 0; card scroll 0,0; chat log 0px; add bot lines 2; text padding <8: none; follows text size 2/33
320x568 after: code QQTN 18px; sizes 12/13/15/17/18/24; smallest 12px; margin L16 T8; padding 8px; min gap 8 (Copy / Copy link); under44 0; clipped 0; card scroll 0,0; chat log 48px; add bot lines 2; text padding <8: none; follows text size 2/33
375x667 before: code G8HC 24px; sizes 13/14/15/16/24; smallest 13px; margin L16 T16; padding 8px; min gap 8 (Copy / Copy link); under44 0; clipped 0; card scroll 0,0; chat log 131px; add bot lines 1; text padding <8: none; follows text size 2/33
375x667 after: code G8HC 22px; sizes 13/15/17/22/24; smallest 13px; margin L16 T16; padding 8px; min gap 8 (Copy / Copy link); under44 0; clipped 0; card scroll 0,0; chat log 131px; add bot lines 1; text padding <8: none; follows text size 2/33
390x844 before: code 5QFZ 24px; sizes 13/14/15/16/24; smallest 13px; margin L16 T16; padding 12px; min gap 8 (Copy / Copy link); under44 0; clipped 0; card scroll 0,0; chat log 284px; add bot lines 1; text padding <8: none; follows text size 2/33
390x844 after: code 5QFZ 22px; sizes 13/15/17/22/24; smallest 13px; margin L16 T16; padding 12px; min gap 8 (Copy / Copy link); under44 0; clipped 0; card scroll 0,0; chat log 284px; add bot lines 1; text padding <8: none; follows text size 2/33
844x390 before: code ZECJ 28px; sizes 13/14/15/16/24/28; smallest 13px; margin L16 T16; padding 8px; min gap 8 (Copy / Copy link); under44 0; clipped 0; card scroll 0,0; chat log 62px; add bot lines 2; text padding <8: none; follows text size 2/33
844x390 after: code ZECJ 28px; sizes 13/15/17/24/28; smallest 13px; margin L16 T16; padding 8px; min gap 8 (Rules / rename-seat); under44 0; clipped 0; card scroll 0,0; chat log 62px; add bot lines 2; text padding <8: none; follows text size 2/33
1280x720 before: code RKXD 28px; sizes 13/14/15/24/28; smallest 13px; margin L40 T24; padding 20px; min gap 8 (Copy link / Invite); under44 0; clipped 0; card scroll 0,0; chat log 128px; add bot lines 1; text padding <8: none; follows text size 2/33
1280x720 after: code RKXD 28px; sizes 13/15/17/24/28; smallest 13px; margin L40 T24; padding 20px; min gap 8 (Copy / Rules); under44 0; clipped 0; card scroll 0,0; chat log 128px; add bot lines 1; text padding <8: none; follows text size 2/33
chromium 153.0.8010.12; 10 pictures; browser errors 0
```

`WWWW` header fit, from the same log:

| Size | Before, normal | After, normal | Before, "Copied" | After, "Copied" |
|---|---|---|---|---|
| 320 × 568 | Fits, 13.78 px clear | Fits, 13.78 px clear | Code clipped; two buttons squeezed | Code clipped; two buttons squeezed |
| 375 × 667 | "Copy link" padding under 8 px | Fits, 12.84 px clear | Three buttons squeezed | "Copy link" squeezed |
| 390 × 844 | Fits, 11.41 px clear | Fits, 19.84 px clear | Two buttons squeezed | "Copy link" squeezed |
| 844 × 390 | Fits | Fits | Fits | Fits |
| 1280 × 720 | Fits | Fits | Fits | Fits |

The "Copied" cases belong to PR #1181.

## The existing lobby proof, with the proposal applied

A throwaway copy of `scripts/lobby-layout-prove.mjs` added `after.css` to each page. It was never committed. Its assertions were not edited.

Unmodified copy on current main (baseline):

```text
lobby-layout-prove: ok; real host, two clients, six viewports; zero browser errors
```

With the final `after.css`:

```text
390x844: chat 52.31%; two columns; 44px targets / 8px gaps; no card/people scroll; copy/invite/rules/target/chat/reaction/ready/start passed
844x390: chat 39.48%; two columns; 44px targets / 8px gaps; no card/people scroll; copy/invite/rules/target/chat/reaction/ready/start passed
1280x720: chat 41.57%; two columns; 44px targets / 8px gaps; no card/people scroll; copy/invite/rules/target/chat/reaction/ready/start passed
375x667: rename button tappable; bubbles clear of the name and status
390x640: rename button tappable; bubbles clear of the name and status
AssertionError [ERR_ASSERTION]: React sheep: inside card
```

That failure is the scrolled-out sixth emoji at 320 × 568 (README row 22). A second diagnostic run skipped only that check for emoji. Every other 320 assertion then passed:

```text
DIAG React sheep scrolled outside card x 314.0..358.0 card 16..304
320x568: rename button tappable; bubbles clear of the name and status
lobby-layout-prove: ok; real host, two clients, six viewports; zero browser errors
```

Two earlier drafts failed this check and were dropped. A 12 px row gap gave 50.5% chat at 390 × 844 and 39.4% at 1280 × 720. A 12 px card padding at 375 gave 7.16 px emoji gaps.

## Limits

- This container has no SF Pro. `ui-rounded` and `system-ui` fall back to Inter here. On iPhone, widths differ slightly.
- Desktop Chromium reports every safe-area inset as 0. Rows 20 and 21 are checked by reading the CSS, not by pictures.
- The text-size check sets the root font size from 16 px to 20 px. iOS Dynamic Type does not change rem on its own.
- Device scale is 1. Pictures are 1× PNGs.
- Each run gets new random room codes from the host.
