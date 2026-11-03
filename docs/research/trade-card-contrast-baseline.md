# Trade-card text contrast baseline

Issue [#1252](https://github.com/jarrodjohnson-gif/emberisle/issues/1252) reports low contrast on selected Brick, Wheat and Stone cards. This records a measurement only. The visual treatment is still an owner decision.

## Method

On main `db959639dc19aa16a6fbff3dd25551b5c64e8c2d`, a temporary Playwright harness opened the real Trade panel in a practice fixture. It used Chromium 153.0.8010.12 from Playwright's pinned browser and ran under `/tmp/emberisle-team-browser.lock`. The fixture gave the acting seat five of each good and left 14 of each in the bank. Each measured Add button was enabled.

At 390×844, 844×390 and 1280×720, the harness measured each card on the Give and Want sides. It read each name before selection, clicked Add, read it again, then removed the selection. That produced 36 observations: three viewports × two sides × three goods × two states.

The name and button backgrounds were transparent with opacity 1. The first opaque background was the card itself. The table uses the browser's computed foreground and that card background, with the WCAG sRGB relative-luminance formula. Ratios are rounded to three decimals.

## Results

All six viewport/side combinations gave the same colors and ratio for each row.

| Good | State | Text | Card background | Contrast |
|---|---|---|---|---:|
| Brick | Unselected | `#b8533d` | `#ffffff` | 4.836:1 |
| Brick | Selected | `#b8533d` | `#f3f6f5` | 4.447:1 |
| Wheat | Unselected | `#8c722d` | `#ffffff` | 4.605:1 |
| Wheat | Selected | `#8c722d` | `#f3f6f5` | 4.235:1 |
| Stone | Unselected | `#63748a` | `#ffffff` | 4.777:1 |
| Stone | Selected | `#63748a` | `#f3f6f5` | 4.393:1 |

The selected rows are below 4.5:1 and match the token calculations in #1252. The unselected rows are above 4.5:1 in this fixture. These are computed CSS colors, not pixel-sampled anti-aliased glyphs or a measurement of disabled cards.

## Limits

The harness did not test a new background or change the interface. It did not decide how selection should look, and it did not replace the acceptance proof requested by #1252. The first diagnostic launch failed before opening a browser because it omitted the repository's TypeScript loader; the recorded run used `node --import ./server/register.mjs`.
