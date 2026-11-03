# Delivered reaction-image audit

Issue: #120. Audit date: 2026-10-30. Model: GPT-6.

Baseline: `13f73f44f7f11b30b20eefd330452f9ac43163f2` (remote main).
All 15 local asset blob hashes match that baseline. The recursive tree was complete.

## Governing standard

The [October 16 sticker decision](../design/emotes.md#stickers-a-drop-a-png-pipeline-decision-2) and the updated [issue #120](https://github.com/jarrodjohnson-gif/emberisle/issues/120) govern this audit: square canvases up to 256 × 256 px, at most 50 KB per file, and no more than 24 stickers. A 128 × 128 source is preferred. PNG with transparency is preferred; WebP is accepted. Backgrounds must be transparent unless an owner-approved exception is documented. Animation, frame-count, and duration limits are unspecified.

The earlier #120 criteria of exactly 128 × 128, a 20 KB completion limit, and 8–16 stickers are superseded, as is its roughly 15 KB delivery guidance. They are historical comparisons, not current acceptance criteria.

## Results

The 15 delivered files are within the 24-sticker cap. All filenames match the lowercase pattern and all files decode as WebP. All measured canvases fit within 256 × 256, but four are nonsquare and need dimension correction: `banana-guy.webp`, `dark-smile.webp`, `glasses-glance.webp`, and `monkey-pet.webp`. The square `side-eye.webp` is 256 × 256 and meets the current dimension limit. All files meet the current 50 KB cap; the largest, `sponge-thumbs.webp`, is 47,960 bytes.

Twelve first frames are opaque and fail the retained transparency requirement unless an owner-approved exception is documented for the affected asset. This audit does not establish whether those backgrounds were intended or approved. The two animated files, `daffy-shock.webp` and `sponge-thumbs.webp`, need full composited-frame review to assess transparency beyond the first frame.

For historical comparison only, five canvases differ from the superseded 128 × 128-only criterion, `sponge-thumbs.webp` exceeds the superseded 20 KB completion limit, and the count of 15 fell within the superseded 8–16 target.

| File | Bytes | First-frame canvas | First frame opaque | Frames |
|---|---:|---|---|---:|
| banana-guy.webp | 8,834 | 118 × 256 | false | 1 |
| ben-10.webp | 6,800 | 128 × 128 | false | 1 |
| daffy-shock.webp | 6,326 | 128 × 128 | true | 4 |
| dark-smile.webp | 1,248 | 196 × 256 | true | 1 |
| glasses-glance.webp | 10,724 | 249 × 256 | true | 1 |
| goggles-guy.webp | 2,998 | 128 × 128 | true | 1 |
| leo-laugh.webp | 3,450 | 128 × 128 | true | 1 |
| memoji-scheme.webp | 3,050 | 128 × 128 | true | 1 |
| mike-sully.webp | 2,792 | 128 × 128 | true | 1 |
| monkey-pet.webp | 8,016 | 254 × 256 | false | 1 |
| old-grump.webp | 4,176 | 128 × 128 | true | 1 |
| shrek-smirk.webp | 2,256 | 128 × 128 | true | 1 |
| side-eye.webp | 2,866 | 256 × 256 | true | 1 |
| sponge-thumbs.webp | 47,960 | 128 × 128 | true | 22 |
| wide-eyes.webp | 2,844 | 128 × 128 | true | 1 |

## Reproduce

Run from the repository root with ImageMagick installed:

```sh
identify -format '%f %m %wx%h %[opaque] %b\n' src/assets/emotes/*
```

ImageMagick prints each animation frame separately. Compare the logical first-frame canvas for the size requirement.
Subsequent animation frames can be smaller delta rectangles; those are not independent canvas-size failures.
Read exact file bytes with `stat`, rather than summing frame sizes.

## Bounded follow-ups

- Correct the four nonsquare canvases to meet the current square and maximum-dimension requirements.
- Review the 12 opaque first frames against the transparency requirement and document any owner-approved exceptions. Review all composited frames of both animated files.
- After asset approval, add an automated dimensions, bytes, filenames, and decoding check.

These findings do not authorize artwork changes or decide animation treatment.
The historical issue comment reports one supplied image; the measured current tree contains fifteen.
