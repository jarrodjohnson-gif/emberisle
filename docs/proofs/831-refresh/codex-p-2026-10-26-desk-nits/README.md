# PR 883 desk nits

GPT-6.1 Sol; parent: Codex-p. Continue desk comment 6424597548.

## Quantity module rename

The component bytes remain identical. The lazy import and genuine failed-request matchers follow the new path.
Every existing proof assertion remains. Only module names change in the existing budget and fixtures.

| Old path or key | New path or key | Unchanged value |
| --- | --- | --- |
| `src/components/game/BankTradePicker.tsx` | `src/components/game/TradeResource.tsx` | Exact component bytes |
| `TradePanel.tsx`: `./BankTradePicker` | `./TradeResource` | Same lazy loader and prefetch |
| `trade-tabs-prove.mjs`: failed-request route `BankTradePicker\.tsx` | `TradeResource\.tsx` | Same real request abort and recovery checks |
| `trade-tabs-prove.mjs`: expected-error filter `BankTradePicker\.tsx` | `TradeResource\.tsx` | Same error filtering |
| `scripts/size-prove.mjs`: `BankTradePicker` | `TradeResource` | 1650 B gzip ceiling |
| `scripts/fixtures/size/base.json`: `BankTradePicker` | `TradeResource` | 1430 |
| `scripts/fixtures/size/pass.json`: `BankTradePicker` | `TradeResource` | 1430 |
| `scripts/fixtures/size/over-ceiling.json`: `BankTradePicker` | `TradeResource` | 1430 |
| `scripts/fixtures/size/base-old.json`: `BankTradePicker` | `TradeResource` | 1430 |
| `scripts/fixtures/size/fail.json`: `BankTradePicker` | `TradeResource` | 1430 |
| `scripts/fixtures/size/new-chunk.json`: `BankTradePicker` | `TradeResource` | 1430 |
| `scripts/fixtures/size/base-with-legacy.json`: `BankTradePicker` | `TradeResource` | 1430 |

No numeric budget, allowance or fixture value changes. Historical documents retain their original names and numbers.
Browser validation belongs to the parent's serial frozen run.

Validation: typecheck, JavaScript syntax and diff whitespace checks pass. The eight size fixture cases pass outside the sandbox.
The sandbox suppressed child-process output; its initial fixture run failed output checks. No source fix followed that environment result.
