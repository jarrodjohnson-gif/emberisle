# Lanes

Take the top line in **Next up (auto)** that your tier allows. Helpers: only `helper-ok` lines.

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
   closed, no active claim, and no open PR for it (drafts count). Order: priority first (see
   [Tier and priority](#tier-and-priority)), then `docs/FRAMEWORK.md` section 7's earliest milestone, lowest step. Helpers additionally require `helper-ok` and must respect
   their open-PR limit in [`HELPERS.md`](HELPERS.md).
2. **Check files across all lanes:** read active claims and their open PRs, including work In Review.
   A `claimed:` remains active until that agent posts a later pause, or its PR merges or closes.
   Historical same-agent `paused:` comments also release claims; new pauses must include `/paused`.
   Ignore released historical claims. If your planned files overlap another active claim's files or
   PR changes, pick a different issue. A shared lane alone is not a conflict. Neither are the shared
   registration files `package.json`, `.github/workflows/ci.yml` and `scripts/size-prove.mjs`: almost
   every PR adds a line there, and the second PR to merge fixes the small conflict. Editing a different
   function in a busy file is fine too, if you name the overlapping PR in your claim and keep your hunks small.
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

## Tier and priority

When told "next", pick in this order:

1. Highest priority first: `prio:p0`, then `prio:p1`, then `prio:p2`, then no `prio:` label.
2. Within a priority, the earliest milestone and lowest step (`docs/FRAMEWORK.md` section 7).
3. If several still tie, prefer your own tier.

You may take work at your own tier or below, never above it. An issue with no `tier:` label is open
to any tier. Helpers don't use this list: they follow the queue in [`HELPERS.md`](HELPERS.md).

| Label | Kind of work | Models |
|---|---|---|
| `tier:1-deep` | Hours-long research and architecture carried through to a finished document | Claude Fable 5.1, GPT-6 Astra |
| `tier:1` | Security, server, protocol and cross-area changes | Claude Opus 5.5, GPT-6.1 Sol, and the `tier:1-deep` models |
| `tier:2` | Everyday features with real proofs | Claude Sonnet 5.5, Gemini 3.8 Flash (thinking HIGH), Grok 4.7, and every `tier:1` model |
| `tier:3` | Small single-purpose fixes, docs and screenshot QA | Claude Haiku 5.5, GPT-6 Luna, and every model above |

An issue's `model:` label, where present, names the model to build with (`docs/FRAMEWORK.md`). The
`tier:` label says which other models may also take it.

**Gemini takes clearly defined work with hard checks.** It is good at:

- UI audits: check that a card or panel works and chat overlaps nothing. Screenshot set viewports and flag anything odd.
- Minor design fixes, such as "make X fit at this viewport", with a pixel proof.
- Small defined coding, docs and scripts.

Gemini never builds a new look, animation or layout that needs taste. Split such an issue: another builder takes the design part, and Gemini takes the audit or the defined part. `model:gemini-ok` marks issues kept for Gemini.

**Big design work needs Claude Opus 5.5 or stronger.** Big design work means a new look, a layout, an animation, or a visual spec in an issue. Fable and Astra count. Any model, helpers included, may do small design that the issue text already defines, such as an icon swap or a spacing fix. Any model may also build to an approved mock.

Grok's usage limits are low, so give it one `tier:2` or `tier:3` issue at a time.

### Sub-agents and usage limits

An agent may spawn cheaper or stronger sub-agents if its platform allows it. For example, Opus can
hand a `tier:3` issue to Haiku. An agent that can't spawn stronger models, such as Gemini, stays at
its own tier or below. Pick the sub-agent by how clear the task is:

- **Fable 5.1** when the goal is unclear: open research, design, or a problem with no set answer.
- **Sonnet 5.5** for clearly defined coding. With a precise issue and completion test, it codes as well as the larger models.
- **Haiku 5.5** for small, focused fixes and checks.

Stop starting new work when your 5-hour or weekly usage limit has 5% or less left. Finish or pause
the current step, post `/paused` saying where you stopped, and leave the rest.
