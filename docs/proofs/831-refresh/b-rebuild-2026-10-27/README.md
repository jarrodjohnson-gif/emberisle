# Approved B trade-window rebuild

Codex-p. Runtime: GPT-6.1 Sol. Quote-equivalence preparation: GPT-6 Luna.
This is builder validation, not independent review or owner acceptance.

## Changes and frozen sources

The full-width compact Bank box now precedes Table offer on normal-height screens.
On short screens, Bank sits left of Table, matching the landscape reference.
The Bank action sits beside its quote. Ask the table fills its column.
The live heading reports the selected rate, or the best owned rate before selection.
The quote names its real Bank/Dock rate, give/get goods and immediate exchange.
Bank stock remains in the exact accessible description without a separate visible line.
Goods use the existing V1 resource palette and lighter neutral borders.
The title is bold; online help matches the supplied B text.
Both goods rows fit all three proof viewports, preserving 44px controls, 8px gaps and 12px text floors.

Runtime commits are 616659d,069d71c and105e9bc.
Full behavior/geometry validation ran at a41a577.
The only later runtime change replaced two border-colour tokens; no dimensions or logic changed.
That final colour source 105e9bc was rebuilt, size-checked and captured again.
The separate Trade UI proof passed at a51d3cb with runtime bytes identical to 105e9bc.

Only TradePanel.tsx, TradeResource.tsx and trade-panel.css change runtime.
Store, rules, host, focus trap, dependencies, both locks, registration files and budgets remain unchanged from c9eacc4.

## Checks actually run

Fresh no-local validation and base clones used frozen dependencies.
The actual merge-base build is d09d72faaa3c23b426362d7a4f49df498e42e153.
Browser checks ran serially under the team lock using Chromium 153.0.8010.12.

```text
npm run typecheck: exit0
npm run registered-prove: all 151 proofs registered
npm run loosen-prove -- --base c9eacc4: one changed proof, none loosened
npm run build: exit0
node scripts/size-prove.mjs --base <built d09 clone>: exit0
npm run trade-tabs-prove: three viewports, both motion settings, real rules settlement, zero browser errors
12 new B geometry samples: Bank placement/action width, five good colours, bold title, both rows visible
npm run hand-cards-prove: exit0
npm run rotate-overlays-prove: exit0
node --import ./server/register.mjs scripts/trade-map.test.mjs: exit0, zero browser errors
final owner capture: nine actual UI pictures, zero page/console errors
```

Final production gzip measurements:
- index 124371/125200 B, +1/400 against base 124370.
- sheets 7188/7800 B, +45/200 against base 7143.
- TradeResource 833/1650 B. The existing approved ceiling remains unchanged.

The registered Trade proof contains the added B assertions; no new proof entry point was created.
The existing separate Trade UI workflow still invokes trade-map.test.mjs directly.
All recorded originals and exact stage-specific logs are archived below.

## Retained failures and approved equivalents

The first run at af35573 failed the old Ask-before-Bank Tab sequence.
B's Bank-before-Table order changes the expected traversal, not the focus guarantee.
The separate 997b7b1 commit keeps every target, Tab press, disabled-control skip and modal wrap check.

Nine valid quote expectations changed in their own 34076b9 commit.
Two separate Trade UI expectations changed in their own a51d3cb commit.
The fixture goods, counts, live 4/3/2 rates and exact stock descriptions remain checked.
The exact tables are quote-equivalents.md, focus-equivalence.md and trade-map-equivalents.md.
No numeric threshold, timeout or assertion was deleted or relaxed.

The new Bank-placement assertion rejects the old c9eacc4 runtime in a negative control.
That control exits1 at the expected portrait Bank-above-Table assertion.
Its proof injection is restored exactly; no old-runtime change is retained.

The first real pictures at 997b7b1 exposed a clipped selected Get row on desktop.
The new all-viewport visibility predicate rejects two retained desktop geometry samples from that run.
CSS 069d71c compacts text spacing without reducing touch targets or control gaps.
The full Trade proof then passes with the stronger all-viewport row check.
Both early picture sets and the initial failure log remain archived.

## Current pictures and limits

The nine pictures in pictures/ show initial, affordable and disabled states at 390x844, 844x390 and 1280x720.
They use the real renderer after terrain readiness and additional actual draw frames.
No WebGL stub or HTML/CSS overlay supplies the island or dialog.
This is a controlled online-mode store fixture, not a live host session or end-to-end playthrough.
Legal seeded setup precedes controlled conserved hands. The stored fixture identifies its actual seed and inputs.
The visible Offline chip reflects this fixture's absent transport.
All captured controls meet the existing 44px guard; all quantity controls fit their goods viewport.

Remaining differences and questions are explicit:
- Seat cards and their extra details remain unchanged, pending question6440584919.
- Existing dimming eligibility and hotseat Bank-only behavior remain unchanged while their questions are unanswered.
- Short-screen selected cards place minus beside add to preserve 44px targets and visible rows; the reference places it below.
- Desktop uses the normal-height B structure; the supplied mock has no desktop or hotseat-specific view.
- Resource art and colours reuse approved V1 assets; the mock calls its icons and typography stand-ins.
- The real island/background and fixture goods differ from the quick mock.

The owner hold remains. Fresh independent review and owner picture acceptance are required.
No claim is made that unresolved differences are approved.

## Evidence

records.json maps every gzip payload to its original path, byte count and SHA256 values.
pictures.json records the final renderer, quote and geometry observations.
raw/final-source-audit.json.gz records 329 source hashes and the exact 9+2 replaced quote lines.
The two expected action-order entries remain present in reversed order.
All other original proof lines remain present; new geometry assertions add coverage.

Read a log with gzip -dc raw/<name>.gz.
Verify archives and current pictures from this directory:

```python
import pathlib, json, gzip, hashlib
root = pathlib.Path('.')
manifest = json.loads((root / 'records.json').read_text())
for item in manifest['files']:
    packed = (root / item['archive']).read_bytes()
    assert hashlib.sha256(packed).hexdigest() == item['gzipSha256']
    data = gzip.decompress(packed)
    assert len(data) == item['bytes']
    assert hashlib.sha256(data).hexdigest() == item['sha256']
for item in manifest['pictures']:
    assert hashlib.sha256((root / item['file']).read_bytes()).hexdigest() == item['sha256']
```
