# Emberisle — Jelly Ocean

Approved direction: the Jelly Diorama concept, adapted to a continuous ocean rather than a square water block. The hex island remains the hero. The UI is a restrained cream table edge, with one SVG symbol family and strong resource counts. This supersedes the Basalt implementation in PR #591. Implementation issue: #592.

## Appearance

System sans and rounded system numerals; no downloaded fonts. Opaque cream text surfaces over an aquamarine ocean. The terrain uses warmer pasture, grain and clay paint, real low-poly grain fields and small clay outcrops. Four mineral/earth bands follow the hex walls; there is no square slab, tank border or squared-off sea. Number discs are cream, dark ink, red 6/8 and probability dots. Existing player colours and distinct marks remain.

The ocean is one unlit shader mesh with shallow turquoise, a broad transition to deeper water and faint moving cellular caustics. Water opacity is 0.88, so a submerged visitor reads as a subdued silhouette before surfacing. Fog and the clear colour meet at the outer water edge. No image textures, reflection capture, transmission pass or extra post-processing is introduced.

```css
:root {
  --ground: #EEECE7; --paper: #FFF9F0;
  --ink: #263D3C; --muted: #555E58;
  --table: #FFF9F0; --table-raised: #F2EEE5;
  --table-ink: #263D3C; --table-muted: #555E58;
  --line: #CBCFC6; --control-line: #78837A; --table-line: #78837A;
  --accent: #246D72; --accent-ink: #246D72;
  --sea: #158E9A; --sea-shallow: #65D8CB;
  --timber: #2F6A4F; --timber-on: #FFFFFF; --timber-side: #173D35;
  --clay: #B8533D; --clay-on: #FFFFFF; --clay-side: #74372B;
  --wool: #B2CE80; --wool-on: #263D3C; --wool-side: #617744;
  --grain: #E3C462; --grain-on: #263D3C; --grain-side: #8C722D;
  --ore: #63748A; --ore-on: #FFFFFF; --ore-side: #414D5B;
  --waste: #DFC99A; --waste-side: #827963;
  --gain: #10562A; --loss: #8A2219; --danger: #B3261E;
  --radius-control: 8px; --radius-chip: 12px; --radius-sheet: 20px;
  --shadow-control: 0 1px 0 rgb(24 51 45 / 0.12);
  --shadow-sheet: 0 10px 28px rgb(24 51 45 / 0.18);
}
```

The existing component behaviour and responsive geometry in [visual-direction.md](visual-direction.md) remain, with these changes:

| Component | Current treatment |
|---|---|
| Hud / SeatRail | Cream frame, small marked discs, dark names/points, thin active underline and fixed dot outline. No text sits directly on water. |
| Hand | Five cream cards, 62 px in portrait, 52 px on desktop, 44 px in short phone view. A compact icon/count row and 11 px label replace the stacked illustration. Content reserves the top corner for gain/loss badges, even during the 3 px card lift. Zero values stay opaque. |
| ResourceSymbols / BuildCost | Shared CSS-coloured SVG timber, bricks, fleece, grain and ore symbols. Counts and costs keep their actual game values and accessible shortage descriptions. |
| Dice | Cream faces, dark pips, control-line boundary. Existing roll timing and screen-reader summary remain. |
| Build controls | Four compact tiles; small Ready ticks, cost symbols and the armed state in dark ink. End turn retains its existing priority rule. |
| TradeToast | Opaque cream bottom dock, 2 px teal top rule, dark timer, 44 px Yes/No. Yes uses ink fill. Offers above open phone chat reserve their height. Resolutions collapse to one log line. |
| Chat / menus / lobby / win | The light semantic tokens recolour these surfaces. Safe areas, keyboard handling, 44 px controls, focus return and the real victory-contribution equation remain. |
| GainFloats / TurnMoment | Readable 2200 ms gains and 1800 ms turn stamps on cream. Reduced motion keeps them fully static for the same duration. |

Body ink on paper is 11.05:1; muted ink 6.41:1; teal ink 5.72:1. The control boundary is 3.77:1. Resource fill/ink pairs are 4.78:1 or higher. Type scale, 4/8/12/16/20/24/32 px spacing and the three motion curves remain as specified in the earlier component sheet.

## Ocean visits

`src/lib/scene/ocean-life.ts` owns a client-local generator, independent of the game RNG. A new island seeds its own decorative schedule from the public terrain layout. Chat, trades, rolls and the same island's state updates do not restart visits.

One visitor at a time. First visit after 8–16 seconds. Quiet interval after a visit: 20–44 seconds. Species weights: dolphin 0.55, turtle 0.35, whale 0.10. The camera's measured free rectangle chooses a clear water lane before spawning; a visitor without enough space waits 6–10 seconds for another attempt. The scheduler never shrinks the island to fit an animal.

| Visitor | Centre radius | Reach | Visit | Arc | Motion |
|---|---:|---:|---:|---:|---|
| Dolphin | 6.4 world units | 0.70 | 18 s | 0.48 rad | Tail beat 0.16 rad; one 0.42-world-unit surface hop centred on second 8. |
| Turtle | 6.2 | 0.45 | 27 s | 0.36 rad | Two merged flipper pairs paddle 0.18 rad, at 1.7 rad/s. |
| Whale | 6.9 | 1.10 | 30 s | 0.32 rad | Slow tail beat; one 3 s breath centred on second 12. |

Narrow lanes may use 0.6 of the listed arc. Visitors surface/dive over 2 seconds. A faint wake remains on the water plane. The complete visitor geometry stays beyond the island, piers and interactive build targets. Animals cast no shadows, are never pickable and add at most 4 visible meshes. The entire reusable visitor pool is built once and disposed with the renderer.

These are ambient events. They do not produce goods, steal, change the weather's game effect, alter dice or add log entries.

## Island work

- **Grain:** one merged field per hex; stalks lie 0.49–0.82 world units from the token centre. One farmer's merged body/hat/loaded basket and one harvesting arm add 2 meshes. Desynchronised 18 s cycles: harvest during seconds 0–8, pause, take a 0.10-world-unit step during 10–16, rest. Walking bob is 0.006; the arm sweeps 0.28 rad. The step follows a tangent around the token.
- **Ore:** existing merged loaded cart, miner and pickaxe remain. Cart travel is ±0.05 over a 6 s cycle, with 0.035 rad side sway and 0.018 rad fore/aft sway. Pickaxe swing is 0.22 rad over 4 s. Work phases differ by hex.
- **Pasture:** sheep keep their bounded grazing routes. Heading interpolation takes the shortest angle, avoiding full turns at the ±π boundary. Sheep and all workers stay out of token faces.
- **Clay:** three small low-poly outcrops per hex, outside the 0.4-world-unit token clearance.

Ambient work advances its own clock only while motion is enabled. A hidden page returns before all scene work. Reduced motion freezes water, wakes, visitors, sheep, boats, trees, farmers and carts immediately; game changes still render. Resuming continues an interrupted visit rather than catching up on time spent hidden.

## Proofs

`npm run jelly-ocean-prove` checks real species routes at 1280×720, 390×844 and 844×390, the random scheduler, coast/target clearance, crop geometry, the visitor mesh budget, full game/RNG isolation, and hidden/reduced-motion freezing. It runs in CI. `visual-direction-prove` retains measured board-space, 44 px controls, contrast, keyboard-safe chat and offer checks. Actual browser frames and a shortened wildlife showcase are saved in [jelly/](jelly/).
