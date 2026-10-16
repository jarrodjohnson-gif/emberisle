# Textures

The island's terrain no longer loads photo textures: since #599 every tile is built in code. Since #624 they are the Hex
Jelly scenes (`src/lib/scene/hex-jelly.ts`, prompt in `docs/design/hex-jelly-prompt.md`), drawn on the board by
`src/lib/scene/jelly-board.ts` (`docs/design/jelly-board.md`). This folder stays for any future image asset.
