# HANDOFF — Emberisle (pause, 2026-09-21)

**2026-09-24:** The product is a **downloadable PC/Mac Unreal game**, not a phone website.
The spec for the other AI is **[docs/BUILD_BIBLE.md](BUILD_BIBLE.md)** (also on GitHub).
Grok owns the rules host and this spec. Unreal owns the 4 GB island.

Next agent: **read `docs/BUILD_BIBLE.md` first**, then this file, then `docs/VISION.md`.

## Product

**Emberisle** — original-art digital hex settler for Jarrod Johnson and friends.
Host locally, tunnel (Cloudflare) so friends join the same table. No accounts.
Rebrand of a classic 19-hex settler game (not using Catan names in UI).

User: Jarrod Johnson, Phoenix. SuperGrok. GitHub: `jarrodjohnson-gif`.
Repo: https://github.com/jarrodjohnson-gif/emberisle (public)

## Visual north star (this is the job)

User rejected every “low-poly Three.js Catan” look. The target is the
**photoreal white-slab hex diorama** stills:

- `public/refs/hex-north-star.jpg`
- `public/refs/hex-north-star-2.jpg`
- Chat attachments: `/workspace/attachments/0F5C468C-…` and `53F186B6-…`

Look: each hex is a **raised platform with pale stone / off-white vertical walls**.
Terrain sits *on top* (grass, wheat, red dunes, sculpted rock, pines). Packed
flush. Dark water, wet coastal rocks, sand strip, late-afternoon light, mine
smoke, white sheep on pasture.

Drive folder (connected): https://drive.google.com/drive/folders/1dRcRfPWFTDgnj6O9uJkghHn_11dR0t-F  
File: **`CATAN_PACKED.zip` ~3.79 GB** (`file_id` `1yKecbj0lXK1cLO958PuBn4LXLwX0_48l`).
Blender/Unreal pack. **Do not download into the web client.** Optional later:
extract a few small GLBs (sheep, pine, rock) and instance those.

Meng To Threads video was the first reference; user then sent these stills and
said “I was thinking more like this.” The stills win.

Animations **yes** in Three.js: sheep graze, grass/wheat/pines sway, smoke,
water, boats rock, wayfarer walks. Not: Cycles/Unreal path tracing in-browser.

## What already works (sandbox)

Playable vs 3 bots + hotseat. Rules engine is real:

- 19 hexes, tokens 2–12 (no 7), snake setup, second-settle goods
- Production, 7 → discard half (round down, >7 cards), robber, steal
- Distance rule, finite bank, knight-before-roll, monopoly drains, VP hidden
- Longest path DFS (forks + enemy split), largest army
- AI greedy enough to finish a game

Preview: `startup.sh` → Vite on **port 8080**. Was **UP** at pause.
Hard-refresh after renderer edits (`IsleRenderer` is a singleton on the canvas).

## Layout (sandbox is source of truth)

```
src/lib/game/types.ts      resources, phases, GameState
src/lib/game/hex.ts        axial, hexToWorld, vertex/edge ids
src/lib/game/board.ts      generateGame, hexHeight, worldOfHex
src/lib/game/rules.ts      applyAction (pure reducer)
src/lib/game/ai.ts         chooseBotAction
src/lib/game/store.ts      Zustand + bot effect
src/lib/scene/isle-renderer.ts   THE LOOK — start here
src/components/scene/IslandCanvas.tsx
src/components/game/Hud.tsx
src/components/game/EmberisleApp.tsx   title / play / vs-AI / hotseat / host-join
src/lib/multiplayer/p2p.ts + signaling.server.ts + routes/api/rtc.ts
public/textures/{forest,pasture,fields,hills,mountains,desert}.jpg
public/refs/hex-north-star.jpg  (+ -2)
docs/{VISION,ROADMAP,PROCESS,BUGS,HANDOFF}.md
```

Names in UI: Timber / Clay / Wool / Grain / Ore; Outpost / Stronghold / Path;
Fortunes; Wayfarer (robber). Players Ember / Tide / Dune / Pine.

## Last visual change (unverified in preview)

`isle-renderer.ts`:

- White stone slabs: `SLAB = 0.26`, `STONE = 0xefeae0`
- `makeHexTile` extrudes a **white wall**, textured cap on top
- Darker water `0x2a6a78`, fog/clear `0x6a93a0`
- SSAO via EffectComposer (can be expensive / muddy — turn off if broken)
- Tokens at `SLAB + height * 0.35 + 0.08`
- Trees: pine cones + icosahedron blobs (still cheap vs the still)
- Wheat matchsticks **removed**; clay blobs **removed**
- Sheep wander; boats rock; wayfarer in black robe + white wrap

IsleRenderer does **not** HMR. After edits, remount canvas or hard refresh.

## GitHub vs sandbox

| Place | Contents |
|---|---|
| Sandbox `/workspace` | Full app, textures, refs, running preview |
| GitHub `emberisle` | README + `docs/*.md` only |

**First job if sandbox might be wiped: push `src/lib/game`, `src/lib/scene`,
`src/components/game`, `src/components/scene`, `public/textures`, `public/refs`,
`startup.sh`.** Use GitHub `push_files`. Binary jpgs may need another path.

Issues:

1. https://github.com/jarrodjohnson-gif/emberisle/issues/1 white-slab hexes
2. https://github.com/jarrodjohnson-gif/emberisle/issues/2 living hexes
3. https://github.com/jarrodjohnson-gif/emberisle/issues/3 trade + P2P tables
4. https://github.com/jarrodjohnson-gif/emberisle/issues/4 **push full source**

## Next steps (do in this order)

1. **Dump source to GitHub** (issue #4). Highest risk.
2. **Screenshot vs north star.** If slabs are not obviously white stone walls,
   fix `makeHexTile` (taller walls, no bevel color leak, grout between hexes).
3. **Coast:** dark water, foam ring already exists, add wet rocks + sand strip
   at the rim. Reference still has this.
4. **Terrain dioramas** one type at a time — pasture (grass + sheep + stones),
   then wheat, then ore (rock mass + mine mouth + smoke particles), then pines.
   Stop using photo-stickers as the whole identity of a hex.
5. HUD: light glass, smaller, must not cover the island.
6. Trade panel. Then wire P2P (`/api/rtc` exists) to `applyAction` with host authority.

## Do not

- Restart as a 2D Catan clone or R3F rewrite (vanilla Three.js on purpose)
- Load the 3.8 GB zip into the client
- Gold-plate HUD / trade while the island still looks like toys
- Invent Catan trademarks in UI copy
- `git commit` locally unless asked; GitHub API is how this repo was updated
- Trust chat memory — this file + issues are the log

## Stack / preview

TanStack Start + Vite + React + Tailwind + Zustand + Three.js r180+.
Port **8080**. `AGENTS.md` in repo root is the app-builder contract (follow it).
No auth. PGlite is in the scaffold; game state is in-memory Zustand.

Connectors already authorized: **GitHub**, **Google Drive**.

## User quotes that matter

- “Looks much better but still looks like shit.”
- “I was thinking more like this?” + the white-slab still
- “Would animations like [Blender reddit] be possible?” → living yes, Cycles no
- “Set this up properly in a repo”
- “Usage close to 0, write down what you did so another AI can work”
