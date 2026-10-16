# Lanes

Several AIs can work on Emberisle at once. Lanes sort work by code area; **they do not lock an
entire area**. Several issues in the same lane may be active at once when their claimed files do
not overlap. Claims reserve files, including while a PR waits for review.

| Label | Files |
|---|---|
| `lane:board` | `src/lib/scene/**`, `src/components/scene/**`, the hex, terrain, ocean, camera and 3D pieces, and board-look proofs |
| `lane:net` | `server/**`, `src/lib/net/**`, `Lobby.tsx`, `Chat.tsx`, `Reactions.tsx`, `online.ts`, `src/lib/sound.ts` and `public/audio/` |
| `lane:hud` | `src/components/game/**` (except the net files above), `src/styles.css` and `src/lib/viewport.ts` |
| `lane:rules` | `src/lib/game/**` (`rules.ts`, `store.ts`, `ai.ts`, `types.ts`) |
| `lane:docs` | `docs/**` only: research and design notes |

## Picking an issue

1. **Find eligible work:** an open `status:todo` issue with a lane label, every `Depends on` issue
   closed, no active claim, and no open PR for it (drafts count). Use `docs/FRAMEWORK.md` section 7's
   order: earliest milestone, lowest step. Helpers additionally require `helper-ok` and must respect
   their open-PR limit in [`HELPERS.md`](HELPERS.md).
2. **Check files across all lanes:** read active claims and their open PRs, including work In Review.
   A `claimed:` remains active until that agent posts a later pause, or its PR merges or closes.
   Historical same-agent `paused:` comments also release claims; new pauses must include `/paused`.
   Ignore released historical claims. If your planned files overlap another active claim's files or
   PR changes, pick a different issue. A shared lane alone is not a conflict.
3. **Re-check immediately before claiming:** re-read the issue and all comments, not a cached list.
   Do this again after any user wait, thinking break or check-in. Recheck eligibility and file
   ownership; if someone has claimed it, pick another. Post the claim before research or design:

   ```
   /claim
   claimed: <agent name>, <YYYY-MM-DD>
   files: <paths you expect to touch, or none>
   ```

   The agent name is required: different agents often post through the same GitHub account.
4. **Re-read immediately after posting:** first active claim wins. If another agent's active claim
   has an earlier timestamp, release only your own claim with a new comment and pick another issue:

   ```
   /paused
   paused: <your agent name>, <YYYY-MM-DD>
   lost the claim to <winning agent name>
   ```

   Compare agents, not GitHub account names. A loser's pause never releases the winner's claim.
   For equal timestamps, the earlier comment in the issue timeline wins. No fixed wait is needed.
5. **Keep the file list current:** before adding files, recheck other active claims/PRs and update
   `files:`. If the added files conflict, post `/paused` identifying your agent and pick another issue.
6. **Keep going:** never stop while eligible work exists. A busy file means choose different work,
   not reserve its entire lane. If none is eligible, follow the applicable workflow's idle guidance;
   helpers use the Timing block in [`HELPERS.md`](HELPERS.md).

An issue with no lane label isn't ready. Skip it; the orchestrator labels it.

Your claim and its file reservations release when your PR merges or closes, or when you post
`/paused` identifying your own agent. Pausing does not make an issue eligible until it is open
`status:todo` again; do not claim paused In Progress work as a shortcut around the eligibility check.
