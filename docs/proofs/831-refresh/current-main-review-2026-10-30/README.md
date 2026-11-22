# PR #883 current-main comparison, 2026-10-30 UTC

Builder: Codex-p (GPT-6.1 Sol). Parent: Codex-p.
This documentation addresses [desk 6513935730](https://github.com/jarrodjohnson-gif/emberisle/pull/883#issuecomment-6513935730).
The date above uses current UTC.

## Exact comparison basis

- Freshly fetched `origin/main`: `55acb2398d6d8967ef61b2d11f46da379f7e9f82`.
- Reviewed PR source: `2638b775ed0dd2f10f25e343433a61aafed2de4e`.
- Compare direct trees, using `git diff 55acb2398d6d8967ef61b2d11f46da379f7e9f82 2638b775ed0dd2f10f25e343433a61aafed2de4e -- <paths>`.
- This new commit changes only this README. Existing runtime and proof changes described below belong to the whole PR.
- Historical `b90290ab→d18ee9f` rows remain historical comparisons; they do not identify current main.
- Earlier `bankTab`/`bank-give-ore` rows describe the branch checkpoint before shared-draft equivalents.

## Current-main replacement table

These cells quote exact source lines, including case, selector options, signs and diagnostic text.
Line numbers identify main first, then the reviewed PR.

| File and lines: main → PR | Old: current main | New: reviewed PR | Why equivalent |
|---|---|---|---|
| `scripts/client-prove.mjs:260–261 → 260–261` | <code>  await page.getByRole(&quot;button&quot;, { name: &quot;More stone to give&quot; }).click();<br>  await page.getByRole(&quot;button&quot;, { name: &quot;More sheep to want&quot; }).click();</code> | <code>  await page.getByRole(&quot;button&quot;, { name: &quot;More Stone to give&quot;, exact: true }).click();<br>  await page.getByRole(&quot;button&quot;, { name: &quot;More Sheep to want&quot;, exact: true }).click();</code> | The shared draft selects ore and wool using the capitalized goods names. Exact matching narrows both selectors. The following Bank/Dock click and practice-bank behavior checks remain byte-identical. |
| `scripts/trade-map.test.mjs:132 → 141` | <code>    assert(Math.abs(delta.y - (side === &quot;give&quot; ? -12 : 12)) &lt;= 1, `${side} motion: ${JSON.stringify(delta)}`);</code> | <code>    assert(Math.abs(delta.y - (side === &quot;give&quot; ? 12 : -12)) &lt;= 1, `${side} motion: ${JSON.stringify(delta)}`);</code> | Owner-confirmed gains rise and losses fall. Give now moves down 12px; want moves up 12px. The 220ms duration and 1px tolerance remain unchanged. |
| `scripts/trade-map.test.mjs:139 → 148` | <code>  console.log(&quot;motion: give -12px / get +12px in 220ms; reduced motion shows selected count instantly&quot;);</code> | <code>  console.log(&quot;motion: give +12px / get -12px in 220ms; reduced motion shows selected count instantly&quot;);</code> | Update the diagnostic text to match the measured direction. The reduced-motion count and zero-animation checks remain unchanged. |

Motion authority: [owner answer 6262941514](https://github.com/jarrodjohnson-gif/emberisle/issues/831#issuecomment-6262941514) records “gains rise, losses fall”.
The selector carries a negative give sign and positive want sign.
The motion replacement preserves the sampled animation, duration, tolerance and reduced-motion behavior.

## Replacement provenance

- `4ddd3149154ac6273bd4a92f9dea75c56c3bd62b` isolates shared-draft proof replacements and documentation from runtime changes.
- That commit replaces the historical client tab/radio interactions with today's capitalized exact selectors.
- Its trade-map blob is already identical to the reviewed PR: `4207a9f` (abbreviated).
- `663530749574c539cf9085e9c8ad27681e49541a` originally introduces the motion sign assertion and diagnostic replacements.
- That original feature commit mixes runtime and proofs. No isolated historical motion replacement commit is claimed.
- `d18ee9f4f8af83eac46635526e8b288831c468d5` records later evidence; it does not introduce those motion replacements.

## Remaining trade-map diff

The direct comparison also changes the mixed-kind check's message. Its disabled requirement remains intact.

| File and lines: main → PR | Old: current main | New: reviewed PR | Why equivalent |
|---|---|---|---|
| `scripts/trade-map.test.mjs:88 → 89` | <code>    assert(await bank().isDisabled(), &quot;bank must reject mixed kinds&quot;);</code> | <code>    assert(await bank().isDisabled(), &quot;Bank must reject mixed kinds from the shared draft&quot;);</code> | The Bank action must still reject mixed kinds. The new message identifies the shared draft. |

The following lines are additive against current main; no old assertion occupies their place:

```js
    assert.equal(await bank().count(), 1, "mixed table quantities retain the visible Bank action");
    assert.equal(await panel.getByTestId("trade-hint").textContent(), "Choose one kind on each side for a bank or dock exchange.");
    assert.equal(await panel.getByRole("radio").count(), 0, "Bank uses shared quantities with no separate kind selector");
    // Remove one requested kind through its actual shared quantity control: both receipts update together.
    await panel.getByRole("button", { name: "Fewer Stone to want", exact: true }).click();
    assert.equal(await panel.getByTestId("trade-give-timber").getByRole("status").textContent(), "2");
    assert.equal(await panel.getByTestId("trade-want-wool").getByRole("status").textContent(), "1");
    assert.equal(await panel.getByTestId("trade-hint").textContent(), "You give 4 wood. You get 1 sheep.");
    assert.match(await preview.textContent(), /You give: 2 wood.*You get: 1 sheep/, "Bank kind derivation preserves the exact shared Table quantities");
    assert(await bank().isEnabled(), "one shared give kind and get kind enable an exact one-exchange quote despite Table quantities");
```

PR line 93 removes requested Stone through the shared quantity control; both receipts then reflect that selection.
The existing mixed-receipt assertion before this block remains unchanged.
The enabled guard at PR 160 precedes the unchanged rate-specific quote and real settlement.
Every direct trade-map hunk appears above. No geometry, settlement, invalid-press or reduced-motion check is removed.

## Focus trap is a runtime change

`src/lib/focus-trap.ts:7` changes runtime behavior across dialogs:

| Old: current main | New: reviewed PR | Effect |
|---|---|---|
| <code>  return [...(root?.querySelectorAll&lt;HTMLElement&gt;(FOCUSABLE) ?? [])].filter((el) =&gt; !el.hasAttribute(&quot;disabled&quot;));</code> | <code>  return [...(root?.querySelectorAll&lt;HTMLElement&gt;(FOCUSABLE) ?? [])].filter((el) =&gt; !el.hasAttribute(&quot;disabled&quot;) &amp;&amp; el.tabIndex &gt;= 0);</code> | Keep disabled controls excluded; also exclude every control whose DOM tabIndex is negative. |

The broad `button` selector previously included buttons with `tabindex="-1"`.
The runtime filter now removes them from the focus trap's candidates.
Original feature commit `6635307` introduces that filter; this docs update does not change it.

Additive proof commit `35a2e1265cbd5c1c14b33fd69cd1ceb95509128e` adds eighteen client lines 456–473.
The proof sets Look around's tabindex to −1, focuses Back to menu, then presses Tab and Shift+Tab.
Both directions must remain on `win-menu`; the proof restores the original tabindex afterward.
Existing win tab-order checks and subsequent Look around behavior remain.
This is an additive check, separate from the client selector replacements above.

## Seven size fixtures

Each fixture is reformatted from compact lines to one property per line.
Each gains exactly one semantic entry: `"TradeResource": 1430`.
Every pre-existing key and value remains identical after JSON parsing.

| Fixture under `scripts/fixtures/size/` | Main keys | PR keys | Semantic change |
|---|---:|---:|---|
| `base-old.json` | 21 | 22 | Add `TradeResource: 1430`; retain all old values. |
| `base-with-legacy.json` | 23 | 24 | Add `TradeResource: 1430`; retain all old values. |
| `base.json` | 22 | 23 | Add `TradeResource: 1430`; retain all old values. |
| `fail.json` | 22 | 23 | Add `TradeResource: 1430`; retain all old values. |
| `new-chunk.json` | 22 | 23 | Add `TradeResource: 1430`; retain all old values. |
| `over-ceiling.json` | 22 | 23 | Add `TradeResource: 1430`; retain all old values. |
| `pass.json` | 22 | 23 | Add `TradeResource: 1430`; retain all old values. |

The fixture 1430 value is a synthetic chunk measurement, not a ceiling or allowance.
Original feature `6635307` adds `BankTradePicker: 1430`; rename commit `a8a603e` transfers it to `TradeResource` unchanged.
The whole PR adds the owner-approved `TradeResource` 1650 B ceiling to `scripts/size-prove.mjs` versus current main.
The rename transfers the existing branch ceiling unchanged. This docs update changes no size policy or fixture.

## Static audit and limits

- Inspected every direct diff hunk for client, trade-map, focus-trap and all seven fixture files.
- Verified exact replacement cells against both Git trees.
- Verified each fixture's parsed object equals main plus only `TradeResource: 1430`.
- Verified the reviewed trade-map blob equals proof-only commit `4ddd314`.
- Ran `git diff --check`; this README is the sole changed file.
- No browser proof, build or new runtime validation ran for this documentation-only change.

Owner removal/tap/dimming questions and picture acceptance remain unresolved.
Parent owns PR body updates and picture-link repinning; repinning does not imply new captures.

— Codex-p <codex-p@users.noreply.github.com>; parent: Codex-p; Model: GPT-6.1 Sol
