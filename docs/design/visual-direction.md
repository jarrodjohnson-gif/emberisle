# Emberisle — visual direction

13 October 2026. Reference implementation: `design/basalt-table`.

The attached nine screenshots were not present in this session. The audit uses the actual repository and reproducible browser frames in `test-results/before/`; it does not infer unseen screenshots. `scripts/design-shots.mjs` reproduces the title, a crafted main-phase table, an incoming offer, and the menu at 1280×720, 390×844 and 844×390. Main frames deliberately use the same hand, buildings and dice.

Rendered main-phase frames with goods and an incoming offer (same seeded island):

| Direction | 390×844 | 1280×720 |
|---|---|---|
| Basalt Table — implemented | [Phone](basalt/basalt-390-offer.png) | [Desktop](basalt/basalt-1280-offer.png) |
| Fieldwork — proposal | [Phone](basalt/fieldwork-390-offer.png) | [Desktop](basalt/fieldwork-1280-offer.png) |
| Blue Hour — proposal | [Phone](basalt/blue-hour-390-offer.png) | [Desktop](basalt/blue-hour-1280-offer.png) |

[Before phone](basalt/before-390-main.png) · [Before desktop](basalt/before-1280-main.png) · [Implemented landscape](basalt/844-offer.png). Proposal frames reuse the working geometry and show their surface, type and colour treatments; they are not alternate shipped themes.

## 1. Three directions

### A. Basalt Table — recommended

**Thesis:** A vivid painted island sits inside a thin graphite table edge; goods are chalk-faced playing pieces, and attention arrives as a decisive white stamp.

```css
.basalt {
  --table: #202A2B; --table-raised: #2B3738; --table-ink: #F7F8F4;
  --paper: #F7F8F4; --ink: #202927; --muted: #58645E;
  --accent: #D6E5AA; --sea: #395F64; --sea-shallow: #56858A;
  --timber: #285B4B; --timber-side: #173D35;
  --clay: #AF4A32; --clay-side: #74372B;
  --wool: #9EB873; --wool-side: #617744;
  --grain: #D1B14D; --grain-side: #8C722D;
  --ore: #616F80; --ore-side: #414D5B;
  --waste: #B9AF91; --waste-side: #827963;
}
```

Type: system sans for words, system rounded sans at weight 700 for the wordmark and numbers. No downloads. Surfaces: opaque graphite only where a control needs ground; opaque chalk sheets; no glass. A 1 px border and 8 px corner make the chrome feel machined rather than padded. Player colour is a marked disc, never text colour. Motion verbs: **stamp, collect, settle**.

**390×844 hero:** 12 px side inset. Four 76.5 px seat cells and the 44 px menu occupy one 44 px top row. Each cell has a 12 px mark, a short name and a 20 px points count. The entire middle is water and island. At the bottom, one 32 px instruction strip, five 66.8 px-wide goods cards at 68 px tall, four equal 52 px build buttons, a 44 px Trade/End row, then the offer. The offer has one 20 px line, a visible seconds counter, and two 44 px response buttons; 8 px padding and 4 px internal gaps. No permanent heading above the hand. Chalk card faces have a coloured resource icon, a 28 px count, and an 11 px label. An available build has a pale green tick; the armed build becomes chalk. Board tokens are chalk discs with dark numbers, red 6/8 and probability dots. The offer's outline and timer use pale green; Yes is chalk, No graphite. Exact geometry comes from layout, not an absolute overlay. With a notch, the same rows start below `max(12px, env(safe-area-inset-top))` and end above `max(12px, env(safe-area-inset-bottom))`.

**1280×720 hero:** 176 px-wide seats at x=12, y=80. A 656 px-wide bottom tray centred at x=312, with a 68 px outer hand tray, 60 px outer actions and a single-line 58 px offer including 64 px-wide Yes/No. Top right has 44 px utility buttons. The instruction is 32 px high; the latest log is a single 20 px line. The board fits the measured free rectangle, never underneath an interactive surface. Empty sea surrounds the island; there is no vignette or colour fog behind controls. Fortune counts live in the player menu on desktop; the rail keeps goods and points. The open desktop chat is a 288 px dock on the right and participates in the camera fit.

Fallback: charcoal text directly on the sea fails contrast; every text line has opaque ground. Four seat cells cannot hold full names at 390 px: use the existing disambiguated three-letter names and expose full names on tap and to assistive technology. Decorative ore figures are omitted before sacrificing readable board tokens.

### B. Fieldwork

**Thesis:** The island becomes a clean illustrated game board, with white tabs, black rules and primary-colour enamel pieces.

```css
.fieldwork {
  --table: #F4F5F0; --table-raised: #FFFFFF; --table-ink: #182824;
  --paper: #FFFFFF; --ink: #182824; --muted: #53665B;
  --accent: #245BCE; --sea: #A8C3BD; --sea-shallow: #BFD3C6;
  --timber: #246347; --timber-side: #194832;
  --clay: #BC482F; --clay-side: #803A2C;
  --wool: #A4C078; --wool-side: #6F844B;
  --grain: #E0B448; --grain-side: #947531;
  --ore: #677992; --ore-side: #475365;
  --waste: #C9BB97; --waste-side: #958669;
}
```

Type: system sans, Georgia only for the large title. Surfaces: flat white, 1 px dark rules, 4 px corners; no transparency. Icons are pictograms with resource labels, numbers are bold black. Motion verbs: **slide, click, stack**. All controls have the same 44 px minimum hit area and the same responsive footprint as A.

**390×844 hero:** one top seat row, a pale sea, and an island with distinctly coloured flat caps. A 366 px white bottom tray has 68 px goods, 52 px builds and a 44 px action row. Goods each have a 4 px vertical resource stripe. The bottom offer is 98 px tall, with a blue rule, a black offer sentence and 44 px blue Yes/outlined No. The sheet reads like a player reference card. Blue indicates action only; the four player marks remain unchanged.

**1280×720 hero:** 176 px seat rail with open white cells, 656 px bottom tray; 58 px inline offer. Instruction is a 32 px white tab, connected visually by 1 px rules to the hand. The left rail and bottom tray feel like printing on the edge of a board. Dice have dark pips on white squares. A new turn slides a white label down 6 px then disappears after 1800 ms.

Fallback: light seat outlines disappear on pale pasture; give marks a dark outer rim. Transparent white tabs do not qualify as this direction. Keep them opaque. More white surface area gives this direction a lighter tone but can compete with number tokens.

### C. Blue Hour

**Thesis:** The game feels like a quiet evening around a blue felt table, with polished dark tokens and luminous cream numerals.

```css
.blue-hour {
  --table: #1C2941; --table-raised: #2C3B54; --table-ink: #F3F3EB;
  --paper: #F3F3EB; --ink: #1C2941; --muted: #B6C4D3;
  --accent: #E8C777; --sea: #314E68; --sea-shallow: #55788D;
  --timber: #2F6855; --timber-side: #25493F;
  --clay: #AC5642; --clay-side: #743A31;
  --wool: #8DAA76; --wool-side: #596E4C;
  --grain: #C9AA60; --grain-side: #8E7640;
  --ore: #708196; --ore-side: #47566B;
  --waste: #AFA58A; --waste-side: #7D7563;
}
```

Type: system sans with system serif for turn moments only. Surfaces: opaque blue felt represented by solid CSS; 10 px corners and one shallow shadow. No bitmap felt. Motion verbs: **breathe, turn, glide**. Gold appears only on the active player, timer and ready ticks.

**390×844 hero:** a dark blue sea, single 44 px seat row and a compact blue tray. Goods are 68 px high with cream counts and muted terrain fills. The incoming offer remains at the bottom at 98 px high, with gold rule and 44 px cream Yes/blue No. The board has lower saturation and dark number discs with cream faces. A turn cue is a 1800 ms cream serif stamp; no endless ambient shimmer.

**1280×720 hero:** 176 px blue rail at left, 656 px blue bottom tray and 58 px inline offer. Board materials have cool shadows, grain remains gold. Cream numerals make the tokens read like casino chips. Desktop chat remains a 288 px dock. No blue full-screen panels in ordinary play.

Fallback: theatrical lighting makes clay and forest alike on small screens; preserve neutral daylight on the island and put the blue in the sea and chrome. Gold cannot be body text on chalk; use ink. Cream fails AA on the mid-tone ore swatch; its card uses #51617A with #F3F3EB ink. Wool and grain use #1C2941 ink on their fills. Board-side swatches stay as listed.

## 2. Compare and decide

| Constraint / complaint | Basalt Table | Fieldwork | Blue Hour |
|---|---|---|---|
| Board gets more pixels | Narrow rail + smaller tray + tighter verified camera fit | Same geometry | Same geometry |
| Portrait / landscape / 44 px / safe areas | One top row; landscape 260 px side tray | Same | Same |
| AA / colour-blind seats | Opaque ground, measured pairs, existing marks | Opaque white, dark rules, existing marks | Opaque blue, cream ink, existing marks |
| Reduced motion | Static stamps and counts, same hold time | Static tab and counts | Static label and counts |
| Bottom trade / resolution line | In-flow dock; latest result replaces log | Same | Same |
| Phone sheet / desktop chat dock | Preserved; controls enlarged | Preserved | Preserved |
| Font / chrome budget | 0 font bytes; CSS + SVG | 0 font bytes; CSS + SVG | 0 font bytes; CSS + SVG |
| Turn owner and next action | Chalk armed control, marked active seat, terse instruction | Blue tab and rule | Gold tick and cream instruction |
| Readable gains | 2200 ms stamped goods; persistent totals | 2200 ms stacked tabs | 2200 ms cream labels |
| Affordability | Check + cost icons + accessible shortage | Blue check + cost icons | Gold check + cost icons |
| Trade easy to miss | Contrast jump at bottom + numeric timer | Blue rule + timer | Gold rule + timer |
| Win explains score | Large total + point-contribution equation | Same | Same |
| Title / lobby feel like a game | Oversized wordmark; seat selection folds away | Printed cover; white roster | Evening wordmark; blue roster |
| 390 px chrome / tiny chat controls | Compact cards; every input/button ≥44 px | Same | Same |
| Token/terrain distinction | Opaque chalk faces, dark rim, neutral illumination | Chalk faces need dark rims | Dark discs need brighter numerals |
| Distinctness / implementation risk | Strongest change from current beige; moderate CSS/layout work | Cleanest, closest to a web UI | Cohesive, highest terrain readability risk |

**Recommendation — Basalt Table.** The current beige glass makes every element blend into one soft web page. Basalt introduces a clear material hierarchy: painted terrain, chalk goods, graphite controls. It earns its contrast through opaque ground and makes space through smaller geometry. White marks the next action; pale green marks opportunity. The island supplies the colour. The merged main palette uses Ember #E23D2E, Tide #2D6EE8, Dune #F3ECD9 and Pine #8A4FD3; their triangle, bars, ring and plus remain. It is a more decisive change than Fieldwork and keeps more daylight readability than Blue Hour. The existing game logic, marks, trade protocol and low-poly scene survive. No new font, illustration library or post-processing effect is needed.

## 3. Implementation spec

### Tokens

These are real CSS values. Tailwind aliases in `src/styles.css` map `--color-bg`, `--color-surface`, `--color-fg`, `--color-muted`, `--color-border`, resource colours and motion values to this sheet. Keep a light semantic theme for sheets; do not invert every utility indiscriminately.

```css
:root {
  --table: #202A2B;
  --table-raised: #2B3738;
  --table-ink: #F7F8F4;
  --table-muted: #BDC9C3;
  --table-line: #81918A;
  --paper: #F7F8F4;
  --ground: #E8EBE7;
  --ink: #202927;
  --muted: #58645E;
  --line: #C2CBC3;
  --control-line: #75837A;
  --accent: #D6E5AA;
  --accent-ink: #40542B;
  --sea: #395F64;
  --sea-shallow: #56858A;
  --timber: #285B4B; --timber-on: #FFFFFF; --timber-side: #173D35;
  --clay: #AF4A32; --clay-on: #FFFFFF; --clay-side: #74372B;
  --wool: #9EB873; --wool-on: #202927; --wool-side: #617744;
  --grain: #D1B14D; --grain-on: #202927; --grain-side: #8C722D;
  --ore: #616F80; --ore-on: #FFFFFF; --ore-side: #414D5B;
  --waste: #B9AF91; --waste-side: #827963;
  --gain: #10562A; --loss: #8A2219; --danger: #B3261E;
  --font-ui: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-numeral: ui-rounded, 'SF Pro Rounded', system-ui, sans-serif;
  --space-1: 4px; --space-2: 8px; --space-3: 12px;
  --space-4: 16px; --space-5: 20px; --space-6: 24px; --space-8: 32px;
  --radius-control: 8px; --radius-card: 8px; --radius-chip: 12px;
  --radius-sheet: 20px;
  --shadow-control: 0 2px 0 rgb(0 0 0 / 0.16);
  --shadow-sheet: 0 12px 32px rgb(11 24 23 / 0.24);
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-snap: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --duration-press: 80ms; --duration-quick: 150ms;
  --duration-base: 220ms; --duration-settle: 280ms;
  --duration-gain: 2200ms; --duration-turn: 1800ms;
  --chat-sheet-height: min(420px, calc(100dvh - max(12px, env(safe-area-inset-top)) - 68px - var(--active-offer-height, 0px) - var(--active-prompt-height, 0px) - var(--keyboard-inset, 0px)));
}
```

Type scale: micro 11/14 px weight 600 (resource name only); caption 12/16 px 500; body 15/22 px 500; title 20/26 px 600; number 28/32 px 700 with tabular figures; display 56/60 px 800, tracking −2 px. Wordmark at 390: 52/56 px; at 1280: 64/64 px. Use sentence case, never uppercase paragraphs. Numeric information is always visible in text, not only icon area or animation.

Spacing: use the sheet above; gaps between dock rows 4 px; seat cells 4 px; interior card padding 8 px; sheet padding 20 px. Edges use `max(12px, env(safe-area-inset-*)))`. Focus: 2 px sea-ink outline, 2 px offset on light surfaces; 2 px chalk outline on dark surfaces. Control boundary on dark surfaces uses `--table-line` (not a translucent hairline). Disabled controls keep ink readable; remove opacity dimming from essential labels.

Motion: **collect** uses ease-out for 220 ms entry, 1540 ms still hold, 440 ms exit; whole gain 2200 ms with 150 ms stagger. **stamp** uses ease-snap for 220 ms entry (scale 0.96→1), holds to 1620 ms, ease-in for 180 ms exit; turn total 1800 ms. **settle** uses ease-out for 280 ms, cards lift 3 px, press 0.97 over 80 ms. No recurring UI pulse. Legal board marks retain their existing 1200 ms breathing cue, static under reduced motion. Reduced motion removes all animation and transition, shows the same information for the same wall-clock durations, and freezes sheep, wagons, miners, water and the wayfarer immediately. A preference change during movement cancels that movement. Counts and the log remain after temporary stamps clear.

### Layout rules

At 390, seat row and menu share one line. Online chat/reactions are a separate compact utility row only where needed; they never sit over points. Bottom stack is 366 px maximum within 12 px margins, plain flex layout. At 1280 it is 656 px maximum; the instruction lives in the top row, saving a bottom row. On phones Stronghold is labelled “Upgrade”, with “Stronghold” as its accessible name and full name in Costs. Landscape has 44 px goods, 90 px offers and a pinned Trade/End row. Landscape uses a 260 px left column capped at 42vw, under the 44 px header; End turn stays pinned, and the latest offer stays reachable. Every variable-height stack is measured by the existing camera `chromeInsets`. Offer mount, unmount, local No, changes to offer height and a lazy sheet landing must trigger a camera remeasure after React commits, including reduced motion.

At 320 px, the bottom stack may scroll; its offer stays pinned and keyboard scroll padding keeps actions above it. No absolute offer over the island during ordinary play. With phone chat open, the incoming offer or robbery choice is docked immediately above the sheet, reserves its own height, and remains clear of points. When an asker also chooses a robbery victim, the victim picker stacks above the offer and both heights are reserved. The visual viewport lifts chat above the keyboard; short landscape typing hides presets and filters. Phone inputs are 16 px to prevent Safari focus zoom. No extra rotated-phone hint. The island's tighter fit must pass projection checks for all corners and docks at every viewport before shipping. A zoomed or rotated board stays under player control; only the default fit changes. Sheets may temporarily cover the island when explicitly opened; resting chrome must give the board more pixels than the baseline in the same state.

### Components, in repository order

Sizes below are width×height in CSS px. `auto` means intrinsic content height, capped where specified. “Turn” never changes public opponent information or claims a watcher has a turn.

| Component | Rest | Player's turn | Attention | Tokens / sizes at 390; 1280 | Hidden → reveal |
|---|---|---|---|---|---|
| **Hud** | Porous frame; no backdrop panel | One instruction: “Your turn · Build or trade”; shorter placement/roll instructions | Inline error on chalk; one latest log line | table/paper/ink; 366×auto; 656×auto; row gaps 4 | Build controls appear only in main; Roll only for actor; layers open on explicit control |
| **SeatRail** | Graphite 44 px cells, 12 px marked disc, name, bold points | Chalk active cell, dark ink, fixed underline; no ripple | Reconnection icon + “Away”; accessible text and the player menu say reconnecting, unread reactions | table/table-ink/table-line; four 71×44 cells +44 menu; 176×44 per seat | Counts omitted in narrow cells; full name/counts via PlayerMenu; retain marks in every rendering |
| **Hand** | Five chalk cards with resource icon and label; 0 stays readable | Same cards; do not reorder by affordability | +N/−N badge holds before fading, one 3 px lift | paper/ink/resource colours/gain/loss; five 66.8×68; five 124.8×52 inside 656 tray with 8 px padding, 4 px gaps | No hand before any setup goods; all five persist once play starts |
| **Dice** | 28 px chalk dice, 6 px dark pips, bold sum | Next to Roll/End, never another permanent result paragraph | Existing result flight settles once; reduced motion static | paper/ink/danger; intrinsic width×32 both; centre result cap 280×80 | Hidden before first result; roll moment expires; current dice remain |
| **TurnMoment** | Absent | Chalk 28 px “Your turn” with marked disc and graphite edge | Stamps once, 1800 ms; no input capture | paper/ink/shadow-control; intrinsic width×64 both, max-width free board hole | Live own roll only; no replay on reconnect; tap/key dismisses; hotseat names actor |
| **Announcer** | Assistive live regions; latest visible log belongs to Hud | Own turn announced once | Error/offer/result announced once; countdown announces 5 seconds only | body; visually hidden 1×1 both | Live change only; never duplicate roll/hand announcements |
| **GainFloats** | Absent | Only local hand's deltas | 2200 ms +2 Timber/−1 Ore chalk stamps with icon; 150 ms stagger | paper/gain/loss/resource; intrinsic width×36 per line both | Live delta; spending on pieces does not make redundant loss stamps; queued behind roll; not opponents/watchers |
| **CostCard** | Absent | Same factual cost sheet | Focused sheet, four cost rows + scoring | paper/ink/muted/resource; 320×auto; 448×auto; max-height 80dvh | Table menu → Costs; Close/Escape restore opener focus |
| **BuildCost** | 20 px resource chips with count above 1 | Missing chip has explicit −N badge; Ready uses tick | Newly available button settles once | resource/on/danger; chip intrinsic×20 in Costs; 16 px high with 9 px icons inside build tiles | On build controls and CostCard; full shortage through aria-description, no hover dependency |
| **PlaceList** | Absent | Keyboard list of legal targets | Focus ring and marked selection, never only colour | paper/ink/sea-ink; max-width 366; 320; max-height 240 | Keyboard placement request; board remains primary pointer interaction |
| **PlaceChip** | Absent | Selected touch location has a 44 px Cancel + Place row | Chalk Place, accessible selected target | table/paper/ink; intrinsic×44 both | Tap legal target → confirm; inside measured stack, never fixed over hand; Escape cancels |
| **TradeButton** | Hidden outside actor main | 44 px graphite Trade, exchange icon | Chalk focus ring when opened | table/table-ink/table-line; 88×44; intrinsic×44 | Opens TradePanel; restores focus on close |
| **TradePanel** | Absent | Chalk composer; “Give” and “Want” groups; rate from real dock | 44 px +/−; clear insufficient-goods text | paper/ink/resource/danger; 366×auto; 512×auto; max-height 80dvh | Trade → composer; Ask or bank action closes; phase change closes; modal applies only to composer |
| **TradeToast** | No offer: one collapsed outcome log line, announced through the persistent Announcer region | Asker sees waiting/declines, receiver sees Yes/No | Bottom graphite card with pale green rule, sentence, seconds, chalk Yes; final 5s numeric emphasis | table/table-ink/accent; 366×98 receiver, intrinsic if multiline; 656×58 | Incoming event mounts in flow; no focus stealing, no backdrop, aria-modal false; No removes receiver card and refits; resolution is one line |
| **TakeFromBar** | Absent | Marked player choices with 44 px hit area | “Take from” plus full names; above open phone chat | paper/ink/player marks; 366×auto; 656×60 | Wayfarer target selection; disappears after choice, focus follows result |
| **DiscardBar** | Absent | Five 44 px numeric picks, visible selected/required count | Chalk form; too many choices in danger ink; confirm only when exact | paper/ink/danger; 366×auto; 656×auto | Seven + local debt; not every seat's hidden goods; safe scroll on landscape |
| **FortuneTray** | One Fortunes ×N control | Chalk cards, count, one-line effect, Play | New-this-turn/used/blocked reason in readable ink; 44 px choice chips | paper/ink/resource; 366×auto; 656×auto, capped below seat strip | Explicit control; Close/Escape restores focus; phase change closes; no raw selects in main HUD |
| **TurnCountdown** | Small numeric clock when server provides deadline | Names the waited-on seat | At 10s use warning ink, static bar under reduced motion | paper/ink/danger; intrinsic×28 both | Online deadline only; no fictitious practice timer |
| **Chat** | 44 px chat trigger, compact unread count; preview lets clicks through | No auto-open on turn | Mention mark, readable sender marks; controls 44×44 minimum | paper/ink/muted/table; phone 390×min(420px,100dvh−safe-top−68px−reserved-choice−keyboard); desktop 288×min(360px,50vh) | Tap/Enter → bottom sheet on phones, dock on desktop; minimise 44 px; log scrolls; presets scroll horizontally instead of swallowing sheet height |
| **Reactions** | 44 px trigger | No special turn treatment | Picker 44 px targets; brief existing reaction floats outside score text | paper/ink/player marks; picker 288×auto both | Trigger or player menu; floats never erase VP; motion reduced to static timed image |
| **TableMenu** | Graphite 44×44 ellipsis | Same place, no new button | Chalk popover with 44 px rows and visible focus | table/table-ink/paper/ink/shadow-sheet; 256×auto both | Tap → costs/rules/sound/code/leave; current leave confirmation preserved |
| **PlayerMenu** | Absent | Owner facts only; other seats keep private goods private | Chalk popover; full name/mark, score, reconnect, mute, reaction | paper/ink/muted; 366×auto; 176×auto beneath rail; landscape 288 | Seat tap → menu; Escape/outside closes; no score overlap at rest |
| **Lobby** | Chalk cover with 56 px rounded code and four roster rows | Ready is one clear chalk action; Start replaces priority when everyone ready | One state line: player shortage / ready count / ready | paper/ink/muted; 366×auto, cap55vh; 384×calc(100dvh−48px) | Copy controls 44 px; lobby roster is public; actions pinned; chat scrolls independently |
| **WinScreen** | Absent | Winner shown with mark and large total | Equation lists actual outpost, stronghold, path, army and hidden point contributions; no invented tie story | paper/ink/accent-ink; 366×auto; 672×auto, max-height safe viewport | Real winner opens focused score sheet; Look around → 44 px return chip below the safe header and portrait online tools; table labels full words with horizontal scroll |
| **HowTo** | Absent | Same short rules | Opaque chalk sheet, 44 px Close; semantic paragraphs | paper/ink/muted; 366×auto; 448×auto; max-height80dvh | Title/menu → rules; Close/Escape refocus; no marketing tutorial overlay |

### Title and board

The title is the game's cover: rounded bold wordmark; Play is the sole primary; online controls underneath. Name and colour selection fold into “Your seat” to remove the first-screen form impression, with selected name and marked disc visible. Expanding shows a 44 px name field and four 44 px swatch targets, preserving link/taken-colour behaviour. All secondary actions remain explicit; do not gate online hosting behind practice. Lobby actions use 44 px minimum height and remain reachable without scrolling past chat.

Board: preserve the 25° fitted lean, orthographic play camera, soft single-key daylight, player pieces and marks, docks and world-aligned tokens. Paint terrain in the resource swatches; side tints use the listed `*-side` values. Water uses the two listed sea values, 3% ripple modulation, no bright hotspot. Tokens are opaque, 0.34 world radius, 0.06 thickness, face radius 0.29; near-black rim; 6/8 danger ink with five probability pips. Reduce decorative texture noise; nothing crosses the 0.4 world-radius token clearance. Tighten the fitted island extents only as far as every corner and dock passes the browser proof.

Sheep already graze and the wayfarer already walks. Preserve them. Add one ore cart per ore tile, moving 0.10 world units in a 6 second loop, and one small miner pick-arm per ore tile rotating 0.22 radians in a 4 second loop. Figures have no lantern light or particles. Merge fixed cart/miner parts; animate only the arm and cart transform. Cart ore remains visible at rest. Place the groups 0.62 world units from centre, scale body within 0.16 world units, keep them off tokens and coastal seams. Added mesh budget: 3 meshes per ore tile; idle render stays 12fps; zero decorative updates with reduced motion. Ground production flashes once; no rapid repeated flashes.

## 4. Ten changes with the largest return

| # | Component | Before → after | Safe alone? |
|---|---|---|---|
| 1 | Hud / styles | Beige translucent panels → opaque graphite edge and chalk sheets | Yes, tokens + scoped styles together |
| 2 | SeatRail | 224 px rail / two phone rows → 176 px rail / one compact phone row | Yes, with geometry proof |
| 3 | Hand | Giant filled pills → 68 px chalk cards, resource glyph, strong count | Yes |
| 4 | Hud / BuildCost | Wrapping mixed buttons → four equal build tiles, readable cost, Ready tick | Yes |
| 5 | TradeToast / IslandCanvas | Top floating offer → in-flow bottom card; resolve to one line; refit on changes | No, ship both together |
| 6 | Hud / PlaceChip | Persistent rotation hint and floating confirmation → no hint, measured confirm row | Yes |
| 7 | TurnMoment / GainFloats / Hand | Short cues with reduced-motion fades → 1800/2200 ms stamps, fully static reduced mode | No, timing and motion CSS together |
| 8 | Chat / button / Reactions | 20–32 px controls → 44 px targets; one scrolling presets row | Yes |
| 9 | EmberisleApp / Lobby | Name/colour form first → cover wordmark and folded seat selection; pinned lobby actions | Yes |
| 10 | WinScreen / scene | Unexplained winner and still ore → contribution equation, loaded wagons/miners | Yes, each can ship separately |

## Verification boundary

Browser captures and software GL verify layout and interactions, not sustained performance on a physical iPhone or Safari's visual rasterisation. Report actual test results in `docs/research/visual-audit.md`. Do not label deployment complete without a successful production build and host smoke test; do not claim live hosting changed when only the checkout changed.
