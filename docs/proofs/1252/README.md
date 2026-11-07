# Selected trade-card name contrast (#1252)

Owner decision (2026-11-06): white selected surface with ink border cue, goods colours kept.

## Ratios

| Name | Color Token | Old Contrast (#f3f6f5) | New Contrast (#ffffff) | WCAG Status |
|---|---|---|---|---|
| Brick | `#b8533d` | 4.447:1 | 4.836:1 | PASS (>= 4.5:1) |
| Wheat | `#8c722d` | 4.235:1 | 4.605:1 | PASS (>= 4.5:1) |
| Stone | `#63748a` | 4.393:1 | 4.777:1 | PASS (>= 4.5:1) |

## Proof and Captures

The registered proof `scripts/trade-contrast-prove.mjs` verifies enabled selected and unselected cards on give and want sides across three viewports: `1280x720`, `390x844`, and `844x390`.
Screenshots of the rendered Trade window with selected cards are saved in `docs/proofs/1252/screenshots/`:
- `trade-contrast-1280x720.png`
- `trade-contrast-390x844.png`
- `trade-contrast-844x390.png`
