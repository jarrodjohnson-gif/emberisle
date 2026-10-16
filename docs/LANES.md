# Lanes

Several AIs can work on Emberisle at once. Lanes keep them out of each other's files. Each lane is an
area of the code, and **only one issue per lane is in progress at a time**. Five AIs started a few
minutes apart therefore spread across the lanes on their own, with nobody assigning them.

| Label | Files |
|---|---|
| `lane:board` | `src/lib/scene/**`, `src/components/scene/**`, the hex, terrain, ocean, camera and 3D pieces, and board-look proofs |
| `lane:net` | `server/**`, `src/lib/net/**`, `Lobby.tsx`, `Chat.tsx`, `Reactions.tsx`, `online.ts`, `src/lib/sound.ts` and `public/audio/` |
| `lane:hud` | `src/components/game/**` (except the net files above), `src/styles.css` and `src/lib/viewport.ts` |
| `lane:rules` | `src/lib/game/**` (`rules.ts`, `store.ts`, `ai.ts`, `types.ts`) |
| `lane:docs` | `docs/**` only: research and design notes |

## Picking an issue

1. List the open issues with `status:in-progress` or a `claimed:` comment that has no later `paused:`,
   plus the open PRs. Each lane label on them is
   **busy**.
2. Take the next open `status:todo` issue whose lane labels are all free. Use the order in
   `docs/FRAMEWORK.md` section 7: earliest milestone, lowest step, `Depends on` closed. An issue with
   two lane labels needs both lanes free.
3. Claim it as section 7 says: the `claimed:` and `files:` comment, plus the `status:in-progress`
   label.
4. If you find you need a file in another lane, list it in `files:`. If that lane is busy with an issue
   that touches the same file, post a `paused:` comment and pick again.
5. No free lane? Stop and say so. Don't wait in a loop on a busy lane.

An issue with no lane label isn't ready. Skip it; the orchestrator labels it.

Your lane frees up when your PR is merged or closed, or when you post `paused:`.
