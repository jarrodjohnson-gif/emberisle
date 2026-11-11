# Terrain v1 (archived)

The board's terrain before #618's rewrite, the source of the Classic board (#641, #758; src/lib/scene/classic-board.ts, src/lib/scene/terrain-classic.ts). Snapshotted from commit cd84ca0
on `claude/hex-studio-599`; not built or type-checked. To run the old hex studio again (`node scripts/hex-studio.mjs`), check out cd84ca0; the src copy was removed (owner, 2026-10-16).

- terrain.ts, isle-renderer.ts: the old sculpt, props and `landHex`.
- hex-studio.ts, hex-studio.html, hex-studio.mjs: the old per-hex studio (`npm run hex-studio`), superseded by Hex Jelly.
