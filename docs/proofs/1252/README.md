# Proof: Selected trade-card name contrast (#1252)

Owner decision (2026-11-06): white selected surface (`var(--paper)`) with ink border cue (`var(--ink)`), keeping existing goods token colours.

## Contrast Measurements

Measured in real browser DOM against rendered cards across desktop and phone viewports (`1280x720`, `390x844`, `844x390`).

| Card | Old Selected Ratio (`#f3f6f5`) | Old Status | New Selected Ratio (`#ffffff`) | New Status |
|---|---|---|---|---|
| Brick | 4.447:1 | FAIL (< 4.5:1) | 4.836:1 | PASS (>= 4.5:1) |
| Wheat | 4.235:1 | FAIL (< 4.5:1) | 4.605:1 | PASS (>= 4.5:1) |
| Stone | 4.393:1 | FAIL (< 4.5:1) | 4.777:1 | PASS (>= 4.5:1) |

Unselected cards on both give and want sides also measure >= 4.5:1 (Brick: 4.836:1, Wheat: 4.605:1, Stone: 4.777:1).

## Automated Control Test

`scripts/trade-contrast-prove.mjs` executes:
1. **Control phase**: injects the old `--table-raised` background (`#f3f6f5`), measures rendered elements, verifies contrast falls below 4.5:1, and captures `before-<viewport>.png`.
2. **Production phase**: evaluates standard production styling (`#ffffff`), measures rendered elements, verifies contrast meets or exceeds 4.5:1, and captures `after-<viewport>.png`.
3. Verifies both give and want side selections, unselected states, and zero console/page errors.

## Screenshots

- 1280x720: [Before](screenshots/before-1280x720.png) | [After](screenshots/after-1280x720.png)
- 390x844: [Before](screenshots/before-390x844.png) | [After](screenshots/after-390x844.png)
- 844x390: [Before](screenshots/before-844x390.png) | [After](screenshots/after-844x390.png)
