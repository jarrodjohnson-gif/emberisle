# Seat-dot ring: measured draft for decision 9

Local design draft, 2026-11-04, based on source `8bbfa1378c3573c791f700ec88f9fcc66bf0f8ed`. This is authorized #1274 follow-up research for [#1297](https://github.com/jarrodjohnson-gif/emberisle/issues/1297). The [owner approved a thin dark ring](https://github.com/jarrodjohnson-gif/emberisle/issues/1274#issuecomment-6621500441), retaining seat colours and accessible names. Width/rendering below are proposed implementation details for review. No runtime source changes or implementation acceptance are claimed.

Fresh ownership check found no comments/claim on #1297 and no competing PR; the search returned only parent PR #1275. #1297 remains backlog. Runtime implementation still needs this spec's acceptance and #1275 landing or explicit file release. Preserve #867 public gains and #1144 dock ownership.

## Review

Open [the browser-renderable comparison](index.html). Final full-page PNGs fit exactly within the requested viewports, with no document overflow:

| Viewport and picture | Document width × height | Main comparison dots | Current/proposed dot bounds |
|---|---|---|---|
| [390×844](390x844.png) | 390×844 | 16 | 12×12 CSS px |
| [844×390](844x390.png) | 844×390 | 16 | 12×12 CSS px |
| [1280×720](1280x720.png) | 1280×720 | 16 | 12×12 CSS px |

Each view shows four actual colours on white and mist, before/after, plus Dune at 8/10/12/16/20/28px and a current-turn example. The narrow landscape study uses compact explanatory text; these are diagram labels, not proposed production typography. The comparison is standalone HTML, not screenshots of the running game or a React render of SeatDot.

## Proposed ring contract

Use existing `--control-line: #78837a`, currently defined in `src/styles.css:181`. Propose **1.5px inset box-shadow** for an occupied seat dot: `inset 0 0 0 1.5px var(--control-line)`. No new colour token is needed. It consumes the outer 1.5px of the coloured fill, without changing dot bounds, baseline, margins, flex sizing or control targets. At the smallest 8px dot, the remaining central fill diameter is 5px. Review that smallest case explicitly before accepting.

The sRGB relative-luminance calculation gives **3.9428:1 against white #ffffff** and **3.6258:1 against mist #f3f6f5**, exceeding the requested 3:1 on both adjoining chrome surfaces. Full precision is in [measurements.json](measurements.json). These ratios compare solid token colours, not antialiased edge pixels. This does not claim ≥3:1 between the ring and every seat fill; the approved requirement is ring-to-chrome visibility. Names continue to identify players.

Use actual `PLAYER_COLORS` and `PLAYER_NAMES` from `src/lib/game/types.ts:35`: Ember #e23d2e, Tide #2d6ee8, Dune #f3ecd9, Pine #8a4fd3. The earlier decision-09 schematic used Dune #eadbb2; this draft corrects that illustration to the runtime palette, **not** the runtime palette to the illustration.

Keep `.seat-turn .seat-dot`'s existing **2px #263d3c outline with 2px offset** intact (`src/styles.css:213`). The inset ring is permanent; the external outline conveys current turn. The measured draft retains this outline and 12px dot bounds in both backgrounds. Do not replace outline with the new ring, erase focus outlines, introduce motion, or change `aria-current`.

Shared SeatDot stays `aria-hidden="true"`, with identity supplied by its adjacent visible/accessibility text or labelled enclosing control. The existing responsive SeatRail full-name/screen-reader and short-name pairing remains. No new colour-only label or duplicated spoken colour is proposed.

## Actual caller inventory and integration boundaries

Paths below are under `src/components/game/`; sizes are source-derived CSS px, not measured production rectangles.

| Caller | Existing dot and name source | Required later integration |
|---|---|---|
| `EmberisleApp.tsx:192,217` | Shared SeatDot, 16px identity and 28px colour choice; name form/labelled choice | Preserve input, accessible choice name and target/focus behavior. |
| `LobbyView.tsx:133` | Shared 12px; caller already adds inset black/25 ring; adjacent name or “Empty” | Replace occupied dot's weaker ring rather than layer two shadows. Retain transparent empty placeholder and its “Empty” name; do not assign a seat colour. |
| `SeatRail.tsx:84` | Shared 12px, 10px below 100px cell; adjacent full/short names | Preserve external current-turn outline, aria-current, needs, points, awards, gains and all hitboxes. |
| `SeatNeeds.tsx:81` | Shared `trade-other-dot`, 12px from trade CSS | Preserve need-chip accessible labels and trade entry behavior. |
| `TradeToast.tsx:124,146,197` | Shared 10px taker/responders, 12px offer author | Preserve attribution, terms, reply states and offer lifetime. |
| `TakeFromBar.tsx:51` | Shared 12px with victim name | Preserve legal-victim filtering and action names. |
| `PlayerMenu.tsx:106` | Shared 12px beside name | Preserve authorized ledger and focus/return; reserved by #1275. |
| `WinScreen.tsx:125,167` | Shared 16px winner and 12px row dots | Preserve winner/score names, totals, score privacy and result actions; #748 owns compact results. |
| `TurnMoment.tsx:117` | Shared `turn-stamp-dot`, 20px (16px below 359px); **already has 2px ink border** in `styles.css:253–254` | Preserve this existing stronger border and its exact dimensions. Avoid a redundant second inset ring; use explicit existing-border exception at implementation review. It already meets dark-ring intent. |
| `Chat.tsx:45,54,67` | Three custom 8px spans for sound, text and reaction lines; adjacent `line.name`; background from `line.color` | Later route through shared dot while preserving classes/inline baseline and name, or apply same shared treatment. Check historical/non-seat colours and neutral system lines before broad replacement. |

No other JSX seat-colour dot renderer was found by the source inventory search. Three-dimensional pieces, legal corner rings, goods symbols and unrelated status indicators are outside this contract. A future implementation must repeat the search against its then-current base.

## Evidence and limits

Final capture: Playwright's installed Chromium **153.0.8010.12**, device scale factor 1, local file URL, three sequential captures under `flock /tmp/emberisle-team-browser.lock`. Browser recorded zero page errors. [measurements.json](measurements.json) contains every main dot's computed fill, shadow, aria-hidden value, adjacent name and rectangle, current-turn outline values, document bounds, source SHA-256 and final PNG hashes.

An initial sandbox browser launch failed with `sandbox_host_linux.cc:41 ... Operation not permitted`; the approved local capture outside that sandbox succeeded. Two draft captures exposed document overflow (390×950 and 844×519, then landscape 844×427); the final comparison layout fits all three requested viewports. Those were comparison-layout corrections, not changes to production UI.

A temporary capture utility only exported measurements and PNGs; **no new proof script was created or registered**. Reproduce by opening index.html in Chromium with DPR 1 at the listed sizes and taking full-page screenshots; compute ring contrast using WCAG sRGB linearization. The JSON hashes identify the exact final HTML/pictures.

This evidence establishes schematic geometry and computed colours only. Production target sizes, screen-reader output, focus, clipping by ancestors, actual safe areas, zoom/DPR antialiasing and custom shadow precedence remain implementation checks. Do not infer those passes from decorative samples. Before runtime acceptance, run contrast-prove and affected title/lobby/seat/trade/chat/results proofs, including a fail-first unringed Dune check and unchanged bounds/current-turn outline checks. Any new behavioral proof must be registered in package.json and CI; do not loosen existing assertions.
