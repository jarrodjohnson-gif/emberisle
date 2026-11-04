# Button audit: local decision packet

Draft for #1298 under #1274 decision 4C. Recommendations are pending; this packet grants no runtime approval. [Approved answers](../issue-1274/build-order.md) preserve contextual fills. No universal primary colour, destructive colour, type migration or screen hierarchy is selected here.

Open [the schematic](index.html). Captures: [390×844](390x844.png), [844×390](844x390.png), [1280×720](1280x720.png). These are static state sheets, not runtime screenshots. Each includes the seven current variants, native disabled, an illustrative focus ring, inspectable unavailable action, resource selection, four primitive sizes and consequence controls. See [source inventory](inventory.md) for caller coverage and source links.

## Minimal consistency proposal — pending

Keep `default` and `primary` as equal foreground fills; keep secondary bordered, sea/accent ink, and outline/ghost transparent. Names alone must not decide contextual priority. Preserve title AI/Watch switching, lobby Start, HUD selected actions, Fortune resource paint, trade overrides, need-picker styling and menu glass/selected controls. A future implementation should document these contracts before consolidating any alias. This draft proposes no replacement fill.

Keep the existing 44px default/sm/icon and 48px lg baseline and current 8px control token. Do not overwrite caller geometry: PlaceList has its own minimum, build tiles have 52px height, and title split controls override radius/width. The 12px comment in the primitive is stale relative to the 8px token; reconcile the comment separately if implementation is authorized. Preserve the accepted lobby HIG scale and 10px uppercase hand-name exceptions; sheet headings are documentation typography, not proposed game type.

Keep the 2px sea-ink focus outline with 2px offset and verify it against each actual background before implementation acceptance. Native disabled Ask/Bank/Discard remains inert. Keep `aria-disabled` builds and Fortune choices focusable for inspection; never replace them globally with native disabled. The primitive suppresses press sound but does not block click for `aria-disabled`; caller guards, reasons and HUD hint/disarm behavior must remain. Focus visibility is shown as a static outline here, not tested keyboard behavior.

There is no destructive primitive variant. Preserve current Leave confirmation and its Stay/Leave ordering, bot-removal labels and trade decline/cancel behavior. A semantic consequence does not itself authorize a red fill. Any new destructive variant or hierarchy needs an explicit decision and actual confirmation/keyboard captures. The schematic's Stay/Leave/No grouping is a comparison, not a proposed combined dialog.

## Source and rendering boundary

[Primitive](../../../src/components/ui/button.tsx#L5) defines variant/size/focus/disabled classes; [tokens](../../../src/styles.css#L25) define fills, with [radius/resource colours](../../../src/styles.css#L139). [HUD](../../../src/components/game/Hud.tsx#L434) and [Fortune](../../../src/components/game/FortuneTray.tsx#L37) own inspectable behavior; [Table menu](../../../src/components/game/TableMenu.tsx#L105) owns consequence/confirmation. The inventory was copied from Terra's local source snapshot, with links rebased. Native buttons and unrelated controls are outside its scope.

The HTML uses noninteractive spans and copied current token values. It has no Tailwind compilation, game imports, handlers, sound, hover/press transitions or accessibility tree representative of runtime. Swatch widths/padding are compact documentation layout (including 8px horizontal padding at wider viewports), not exact production widths or a recommendation to change padding. Focus and selection outlines are explanatory; selection colours must be checked against the caller's actual styles. Resource examples show two of five paints; inventory identifies all contextual cases for later runtime capture. No contrast compliance or focus-return result is claimed.

## Checks and limits

Final Chromium capture ran serially under `/tmp/emberisle-team-browser.lock`, using a temporary `/tmp/button-audit-capture.cjs`; no new permanent proof script was added. Browser launch required sandbox escalation after the sandbox rejected Chromium startup. [Measurements](measurements.json) record all 19 swatch rectangles, computed fills/text/radii/outlines and six panel rectangles per viewport.

| Viewport | Measured document | Panel bottom (CSS px) |
|---|---|---|
| 390×844 | 390×844 | 788.3125 |
| 844×390 | 844×390 | 303.65625 |
| 1280×720 | 1280×720 | 349.15625 |

All three documents fit their viewport; all swatches measure at least 44×44, with lg 48px tall. The final landscape capture was visually inspected: all six cards and footer are visible. These measurements concern only the schematic. Safe areas, zoom, real font metrics, engine states, keyboard refusal/activation, focus restoration, CSS precedence and runtime contrast remain unverified. Runtime source and test registrations were not changed. No claims, external posts or commits were made by this draft worker. Hub refresh was attempted but blocked by sandbox networking; parent supplied the fresh ownership check.

Before runtime work, refresh #1216/title, #1220/lobby, #1276/menu-chat and #1298 ownership and obtain acceptance of the proposed consistency contract. Runtime examples should cover every contextual family listed in the inventory at all three sizes, with enabled/selected/focus/disabled and inspectable states. Existing hierarchy stays intact while those decisions are pending.
