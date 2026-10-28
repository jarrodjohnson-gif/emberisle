# #883: fit a wrapped mixed receipt on a sideways phone

Builder: Codex-p; implementation: GPT-6.1 Sol, parent Codex-p. Existing issue831/PR883; no new PR or dependency. Runtimebf38f1d and additive proof86cae53 are separate commits.

## Failure and reproduction

Exact242fdea CI40550990849, job122354761625, fails the existing844x390 both-goods-rows-visible assertion. Get ends292px down the screen while the goods viewport ends286px:6px clipped. The Table receipt has two14px lines. Its column needs28+8+44=80px, making the footer97px including padding/border. Goods need244px, header45px and outer borders2px:388px total exceeds the short dialog's378px maximum by10px. Flex sizing shrinks the goods area to234px. The Bank quote's37px measured height is grid stretch, not proof of its line count.

Local native/Arial/Noto receipts happen to fit one line; their footer is83px and goods244px, so the previous local pass missed the defect. Controlled DejaVu Sans and generic monospace both produce the two-line receipt,97px footer,234px goods viewport and exactly the same292px/286px clipping geometry as CI. The CI platform font itself was not captured, so this establishes the wrapping/layout cause without claiming which font CI selected.

With the new additive regression and old242fdea runtime, the original visibility predicate fails at `844x390-no-preference-wrapped-receipt table`. The original proof was restored byte-for-byte after that negative control. No retry-to-green or assertion replacement.

## Fix and regression

Only two short-screen CSS declarations change: footer vertical padding8→4px and goods-heading line-height16→14px. They reuse existing compact spacing/line-height values and recover12px. Cards remain88px high inside their border; targets44px, interactive gaps8px and text12px remain. No wrapping is hidden, clipped, truncated or forced onto one line. Safe-area calculations and the dialog maximum remain unchanged.

The registered Trade proof gains15 lines after its existing mixed-draft check. On short screens only, the extra case sets the player receipt's font to generic monospace, requires a real two-line height, calls the same existing layout assertions, and restores the original inline font in `finally`. Native coverage remains. All762 original lines and151 original assertion lines remain in order; the added wrap assertion makes152. Package/CI, locks, dependencies, runtime logic, other source files and budgets remain exact242fdea.

After the fix, all five font controls pass. The two-line controls have goods240px and footer89px; Get ends289px inside the293px visible limit. `controls/` shows the before/after diagnostic font cases, not physical-device acceptance.

## Actual validation

Fresh no-local clone at86cae53, frozen root/server installs, pinned Chromium153.0.8010.12; all browser runs serial under the shared lock:

```text
old runtime + new regression: exit1 at intended wrapped-receipt row visibility check
five font controls on fixed runtime: pass
typecheck: pass
registered-prove: all151 proofs are in package.json and ci.yml
loosen-prove: 1 changed proof against242fdea, none loosened
trade tabs proof ok: three viewports, both motion settings, real rules settlement, zero browser errors
rotate-overlays-prove: ok
Table pictures:9 actual UI captures,0 errors
build: pass
index growth: base124370 B, PR124370 B, +0 B, allowance400 B
sheets growth: base7143 B, PR7146 B, +3 B, allowance200 B
TradeResource: existing1650 B ceiling retained
size-prove: all chunks inside ceiling and growth allowance
```

The earlier whole-PR geometry/palette equivalents still produce their documented advisory flags against the original base; this follow-up replaces no assertion. Unaffected Hand and separate Trade UI checks from242fdea remain historical, not rerun claims. The environment restarted after the serialized runner finished; all ten results and terminal logs were recovered and read before publication. No unfinished run is counted as passed.

All nine refreshed owner captures in `pictures/` were individually opened. They use the same legal-setup/controlled-conserved-hand fixture and real renderer method as the previous round. The Offline badge is expected in that store fixture; it is not a live-host session. Removal/tapping, dimming, compact selected cards, hotseat/seat differences and short horizontal Bank acceptance remain the documented owner questions. This fit fix does not settle them.

`records.json` hashes every decompressed raw payload and picture. Raw logs retain the native CI failure, controlled before/after measurements, failed old-runtime regression, complete selected checks, helpers and319 source hashes. Archived external helpers are evidence, not new unregistered CI proof scripts. Current-head CI, fresh independent Claude review and owner picture acceptance remain required. No builder merge or CI retry.
