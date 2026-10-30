# Delivered reaction-image audit

Issue: #120. Audit date: 2026-10-30. Model: GPT-6.

Baseline: `13f73f44f7f11b30b20eefd330452f9ac43163f2` (remote main).
All 15 local asset blob hashes match that baseline. The recursive tree was complete.

## Results

The delivered count is 15, within the requested 8–16. All filenames match the requested lowercase pattern.
All files decode as WebP. Five canvas dimensions violate the 128 × 128 requirement.
`sponge-thumbs.webp` is 47,960 bytes, exceeding both 20,000 bytes and 20 KiB.
Twelve first frames are opaque. Animated files need full composited-frame inspection before judging their background transparency.
The audit does not establish whether an opaque background was intentional or owner-approved.

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

- Fit banana-guy, dark-smile, glasses-glance, monkey-pet, and side-eye into transparent 128 × 128 canvases.
- Compress sponge-thumbs below 20,000 bytes while preserving its intended animation.
- Review opaque backgrounds against the supplied artwork and the transparent-background requirement.
- After asset approval, add an automated dimensions, bytes, filenames, and decoding check.

These are findings against #120, not authorization to change artwork or animation timing.
The historical issue comment reports one supplied image; the measured current tree contains fifteen.
