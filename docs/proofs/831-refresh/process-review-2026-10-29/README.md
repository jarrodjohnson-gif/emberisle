# PR #883 process-review corrections, 2026-10-29

Builder: Codex-p (GPT-6.1 Sol). parent: Codex-p.
Scope: the two process findings in [desk6480690084](https://github.com/jarrodjohnson-gif/emberisle/pull/883#issuecomment-6480690084). Owner picture acceptance and removal/tap/dimming questions remain open.

## Current-main Hand interaction equivalent

Main was freshly fetched at `1d87e85b8ed337924a9a9a3520c8c2d1a33d25e0`; the reviewed PR source is `43758f1f0405fd8996df08c0b631745b230e2c6c`. The table below is the exact direct comparison against that main, including case and selector options. The earlier [Option B table](../codex-p-2026-10-26-option-b/old-new.md) explicitly compares merge checkpoint `9d7ff3e` to its proof-only revision: its `bankTab`/`bank-give-ore` Hand row is historical branch provenance, not a current-main comparison. It remains unchanged as historical evidence.

The replacement was already isolated from runtime in proof-equivalence commit `4ddd3149154ac6273bd4a92f9dea75c56c3bd62b`. This correction documents that existing replacement; it changes no proof line.

| File and lines | Old: current main | New: reviewed PR | Why equivalent |
|---|---|---|---|
| `scripts/hand-cards-prove.mjs:183–184` | <code>  for (let i = 0; i &lt; 4; i++) await page.getByRole(&quot;button&quot;, { name: &quot;More stone to give&quot; }).click();<br>  await page.getByRole(&quot;button&quot;, { name: &quot;More sheep to want&quot; }).click();</code> | <code>  await page.getByRole(&quot;button&quot;, { name: &quot;More Stone to give&quot;, exact: true }).click();<br>  await page.getByRole(&quot;button&quot;, { name: &quot;More Sheep to want&quot;, exact: true }).click();</code> | The shared draft chooses one give kind and one want kind. Bank quotes and dispatches one exact rate-for-one exchange independently of Table draft quantities. One Stone selection identifies ore; the real Bank 4:1 action still spends four ore and gains one wool. The exact accessible labels match the approved goods names. |

The next Bank/Dock button press, `STEP_MS` wait for wool count `2`, and exact sampled wool `2`/`+1`/lift and ore `4`/`−4`/dip expectations (lines185–187) are byte-for-byte identical against current main. Every remaining line after184 is identical too. The later real dispatcher trade, restarted animation, reduced-motion, geometry and browser-error checks remain. No assertion, timeout, motion threshold or fixture changes accompany this documentation. Source: `TradePanel.tsx:77–95` derives the kinds from the shared draft, quotes `harborRate`, checks hand affordability and bank stock, and dispatches `{ type: "bankTrade", give: g, want: w }`.

This is a source comparison, not a new browser-proof result. Parent owns fresh serialized Hand/audio validation and records actual outputs separately.

## Audio diagnostics removed from this PR

The audio proof is restored byte-exact to the pre-diagnostic `0857561^` source and current main `1d87e85b8ed337924a9a9a3520c8c2d1a33d25e0`: blob `34384454e86ae35e049f5d156b9be59128858107`. This removes only the unrelated21-line failure-snapshot wrapper. All189 baseline lines and12 `check()` lines are retained, including the native wait's8000ms timeout/50ms polling, assertions, watchdog and registration.

Diagnostic commit `085756116f36ced4e0abacbb3db5c33d37931355` remains reachable in this branch's history; its source blob is `0820f65` (abbreviated). The [original audio checkpoint](../audio-ci-2026-10-27/README.md), raw archives and hashes remain unchanged as historical evidence for that diagnostic source. Its statements about future snapshot logging apply to0857561, not to the restored current proof. The failure cause remains unproved; this restoration is not an audio-runtime fix. Own PR #873's diagnostic copy is untouched. No separate PR is opened while the group is at its four-PR cap.

Local checks for this restoration: `node --check scripts/audio-recovery-prove.mjs` and `node --check scripts/hand-cards-prove.mjs`; byte equality with both original/main audio; exact baseline line/check counts; unchanged Hand source. Browser validation is delegated to the parent and is not claimed here.
