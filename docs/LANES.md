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
   **This is the one claim rule. Other files link here.**
   - A `claimed:` stays active until that agent posts a later `/paused`, or its PR merges or closes.
   - Historical same-agent `paused:` comments also release claims. New pauses must include `/paused`.
   - **A claim expires after 48 quiet hours** (Jarrod, 2026-11-22). Quiet means no open PR for the issue and no push to its branch for 48 hours. With no branch, count 48 hours from the claim comment.
   - An expired claim is gone. Any builder may take the issue: comment `expired: <the old agent's name>, <date>`, then claim it as usual.
   - Before it expires, only Jarrod may release another agent's claim (`released: <name>, <YYYY-MM-DD>` or `paused:` with that agent's exact name); every agent on the shared owner login can post these, so this is by agreement and the bot does not enforce it. Agents release only their own claims.
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

An issue with no lane label isn't ready. Skip it; the planner labels it.

Your claim and its file reservations release when your PR merges or closes, or when you post
`/paused` identifying your own agent. Pausing does not make an issue eligible until it is open
`status:todo` again; do not claim paused In Progress work as a shortcut around the eligibility check.

## Tier and priority

When told "next", pick in this order:

1. Highest priority first: `prio:p0`, then `prio:p1`, then `prio:p2`, then no `prio:` label.
   Bugs come first (owner decision, 2026-10-24): at any priority, take an open bug (broken for a player, or red CI that blocks merging) before a new feature.
2. Within a priority, the earliest milestone and lowest step (`docs/FRAMEWORK.md` section 7).
3. If several still tie, prefer your own tier.

You may take work at your own tier or below, never above it. An issue with no `tier:` label is open
to any tier. Helpers don't use this list: they follow the queue in [`HELPERS.md`](HELPERS.md).

| Label | Kind of work | Models |
|---|---|---|
| `tier:1-deep` | Hours-long research and architecture carried through to a finished document | Claude Fable 5.2, GPT-6 Astra |
| `tier:1` | Work where a mistake is costly or hard to see: authentication, profile or room persistence and migration, wire-protocol or saved-state compatibility, hidden-information projection, host admission and security, or a change that must land in host and client together | Claude Opus 5.5, GPT-6.1 Sol, and the `tier:1-deep` models |
| `tier:2` | Everyday features with real proofs, including large, cross-lane or visually ambitious ones that state their files, behaviour and a completion test | Claude Sonnet 5.5, Claude Opus 4.6 and older Claude models run through AWS (see below), Cursor Composer, Gemini 3.8 Flash (thinking HIGH), Grok 4.7, GPT-6.1 Terra, GLM 5.3 and Kimi K3 (the last three provisional, see below), and every `tier:1` model |
| `tier:3` | Small single-purpose fixes, docs and screenshot QA | Claude Haiku 5.5, GPT-6 Luna, and every model above |

**What sets a tier (desk, 2026-10-26).** Risk sets the tier. Breadth, owner interest and a `model:` pin do not raise it: a large scene, layout or CSS change with a completion test is `tier:2`, and a pin only narrows who may claim. Use `tier:1-deep` only for open-ended research or architecture where no one can pre-specify the deliverable (the cloud migration, a whole-app UX review). A design doc with listed contents is `tier:2`, or `tier:1` if it specifies a protocol or hidden-information change. Give epics and umbrella issues no build tier of their own: label each child by its own risk. When an issue mixes both kinds, split the safe `tier:2` part off first, as was done for #1141 and #1156.

**Tier and model labels.** Every issue carries a `tier:` label. Any model at that tier or below may take it. Nobody assigns builders.

A `model:` label is optional. It narrows the tier: only that model, or a subagent on it, may claim the issue. It never widens the tier.

- **Why a pin exists:** to keep an issue for the model that already started it, or for a model that is known to do well on that kind of work. A pin is not a work assignment. Builders still claim with `/claim`.
- **Resuming:** an agent that pauses work it means to finish adds `model:<its model>` and a `resume: <agent name>` line to its `/paused` comment. Nobody else claims the issue.
- **Expiry:** a pin lapses after 48 hours with no claim or PR activity. The first builder to notice removes it and says so in one line. The issue is then open to its tier again. Anyone may remove a pin that has no `/claim` or `resume:` behind it.
- **Names:** short, with no version number: `model:fable`, `model:opus`, `model:sonnet`, `model:haiku`, `model:sol`, `model:terra`, `model:astra`, `model:luna`, `model:gemini`, `model:grok`, `model:kimi`, `model:glm`. Only `model:opus`, `model:sonnet` and `model:gemini-ok` exist today. The first builder or desk to need another creates it. Versions live in the tier table.
- **`model:gemini-ok`** marks issues kept for Gemini. It is a hint, not a pin: other models at the tier may still claim them.

**Gemini takes clearly defined work with hard checks.** It is good at:

- UI audits: check that a card or panel works and chat overlaps nothing. Screenshot set viewports and flag anything odd.
- Minor design fixes, such as "make X fit at this viewport", with a pixel proof.
- Small defined coding, docs and scripts.

Gemini never builds a new look, animation or layout that needs taste. Split such an issue: another builder takes the design part, and Gemini takes the audit or the defined part. `model:gemini-ok` marks issues kept for Gemini.

**Big design work needs Claude Opus 5.5 or stronger.** Big design work means a new look, a layout, an animation, or a visual spec in an issue. Fable and Astra count. Any model, helpers included, may do small design that the issue text already defines, such as an icon swap or a spacing fix. Any model may also build to an approved mock.

**Design issues start in backlog.** The planner files an issue that changes a layout, a look or an animation as `tier:1` and `status:backlog`. Backlog is not eligible. The planner moves it to `status:todo` only when the issue links an Astra or Opus spec or an approved mock that settles the exact sizes, states and wording. A proof-only issue that measures the current screen (no change to `Hud.tsx`, `styles.css` or any visible look) is not design and may be `tier:2`.

**New models start provisional.** The tier table lists every model with a settled tier. A model Jarrod adds that is not in it may claim `tier:3` issues at once, one at a time. After two of its PRs merge with a clean review by a different model, Jarrod adds it to the table at the tier its record supports. Claude Opus 4.6 and older Claude models run through AWS are in it at `tier:2` and `tier:3` (Jarrod, 2026-10-23); they never take `tier:1`, big design work, or a review of a `tier:1` PR. A claim names its model and version in the agent name (`claimed: Claude Sonnet 5.5, 2026-10-22`); Cursor, which picks its model per run, names it in the PR body (`Model: ...`). The label bot cannot check this, so the reviewer does. A claim by an unnamed model, or on an issue above the model's tier (`tier:3` for a provisional new model), is void: any builder may take the issue, saying why in one line.

Grok's usage limits are low, so give it one `tier:2` or `tier:3` issue at a time.

**GPT-6.1 Terra (Jarrod, 2026-10-26):** provisional `tier:2`. It takes one issue at a time until two of its PRs have merged after a clean review by a different model. Then it is simply `tier:2`. It never takes `tier:1` work, design that needs taste, or a review of a `tier:1` PR. It is not Astra: OpenAI's own figures put it below Sol and Astra on terminal coding, and an independent index puts it a few points below Sol. Say `Model: GPT-6.1 Terra` in the PR body, because Codex chats often misreport their model.

**Bedrock models (Jarrod, 2026-10-21):** GLM 5.3 and Kimi K3 are provisional `tier:2`. Each takes one issue at a time until two of its PRs have merged after a clean review by a different model. Then it is simply `tier:2`. Neither takes `tier:1` work, design that needs taste, or a review of a `tier:1` PR. gpt-oss is not used. Setup: [`setup-bedrock-agents.md`](setup-bedrock-agents.md).

**Abilities within a tier.** Nobody assigns these builders to issues, and nobody adds new tier labels for them. A `model:` pin is optional (see Tier and model labels). Each model looks up its own tier in the table above and takes the top eligible issue at or below it. The table below is for self-checking: if an eligible issue sits in the "Avoid" column for your model, skip it and take the next.

| Model | Good at | Avoid |
|---|---|---|
| Kimi K3 | Well-defined features with hard proofs, long unattended runs, multi-file changes | Quick turnarounds: it is slow, about 44 minutes a ticket on one private benchmark ([Superconductor](https://www.superconductor.com/blog/kimi-k3-benchmark)). That never lets it skip a `prio:p0` issue. |
| GLM 5.3 | Defined coding, terminal and script work, reviewing Kimi K3's PRs | Design that needs taste |
| Grok 4.7 | Everyday `tier:2` features and fixes | More than one issue at once (low usage limits) |
| GPT-6.1 Terra | Small and medium well-specified fixes and features, docs, proofs that CI checks, layout fixes with a screenshot proof. Fast and cheap. | Long multi-file refactors, hard terminal or long-horizon work, anything that touches the server, security or protocol, and a change another PR is mid-way through. It guesses when unsure: post `Question:` and `/paused` instead of picking. It is not a first reviewer of a `tier:1` or Sol PR. |

Until two of its PRs have merged, a provisional model takes no second issue. Like every builder, it puts progress in its PR body and names its model there.

**The builders (Jarrod, 2026-10-20):**

| Builder | Models | Takes |
|---|---|---|
| Codex | GPT-6.1 Sol, GPT-6.1 Terra | Sol: server, net, rules and bots (`tier:1`). Terra: `tier:2` only, provisional. |
| Cursor | Any model it picks, Opus included | Any lane, at the tier of the model it uses |
| Josh's agent | Claude Opus 5.5, Sonnet 5.5 and Haiku 5.5, free to use any of them | Any lane, as a full builder. It follows AGENTS.md, not HELPERS.md, and pushes branches to this repo, never a fork. |
| Jarrod's Claude | Opus and Sonnet subagents | UI builds from approved mocks, defined fixes and docs |
| Fable and Astra | Fable 5.2, GPT-6 Astra | Design passes and research only (`tier:1-deep`) |
| Gemini | Gemini 3.8 Flash | Audits and defined checks only |

Every builder names the model that wrote each PR in the PR body, and says so again if a later push used a different model. The reviewer differs from every model named.

Other agents, Copilot included, take one small issue at a time until a review shows their work holds up.

### Sub-agents and usage limits

An agent may spawn cheaper or stronger sub-agents if its platform allows it. For example, Opus can
hand a `tier:3` issue to Haiku. An agent that can't spawn stronger models, such as Gemini, stays at
its own tier or below. Pick the sub-agent by how clear the task is:

- **Fable 5.2** when the goal is unclear: open research, design, or a problem with no set answer.
  - Any builder calls a Fable subagent as needed for design, UX and UI work. That covers a mock, a design pass, or a check of a layout or design proof.
  - The builder still writes the PR. The reviewer differs from every model named.
- **Sonnet 5.5** for clearly defined coding. With a precise issue and completion test, it codes as well as the larger models.
- **Haiku 5.5** for small, focused fixes and checks.

**Fresh sessions, not long chats.** Start a fresh chat for each issue, or for a batch of 3 to 5 tiny fixes. Never run one builder chat for days.
- **Why:** every wake re-reads the whole chat. One Fable chat that orchestrated builder subagents from 11-11 to 11-16 reached 637K tokens and cost $774, about $37 per merged PR. A builder that ends near 100-150K tokens costs a few dollars an issue.
- **Same name:** keep the same agent name across sessions, so the 4-PR limit (AGENTS.md rule 4) still counts every PR.
- **No ledger needed:** claims, #854 and PR bodies already carry the state between sessions.
- **No long chats:** if you run subagents, check your context at every wake. At 150K, finish the running subagents, post where you stopped in your PR body, and end. The dispatcher starts the next chat.

Stop starting new work when your 5-hour or weekly usage limit has 5% or less left. Finish or pause
the current step, post `/paused` saying where you stopped, and leave the rest.

## When nothing is eligible

**Fix your own first.** Does one of your PRs have review findings or red CI? Fix it before you claim anything new or open another PR.

An empty ready list is not a reason to stop. Work down this ladder yourself and take the first rung that has anything. Claim as usual. Only if all four rungs and the [anytime queue](#anytime-queue) are empty, post a `Nothing eligible` line on #854.

1. **Adopt a finished-but-stuck PR.** A PR with no push for 24 hours is stale. A red PR with `on-desk` waits for Jarrod: leave it.
   - Comment `/claim adopt PR #N` on its issue.
   - Merge current main into its branch with a merge commit. Never rebase or force-push.
   - Fix conflicts, get CI green, and run the focused proof.
   - Then follow [`docs/flow/builder.md`](flow/builder.md) from step 4: your own reviewer, on a different model.
   - Don't widen its scope. It counts toward your open-PR limit (AGENTS.md rule 4).
2. **Finish the head of a chain.** A chain is blocked by its first issue. If the head's claim has expired ([Picking an issue](#picking-an-issue), step 2), take it.
3. **Always-useful work.** Write the missing test for a recently merged feature. Split an oversized issue into small, fully labelled ones. Close duplicates with a one-line reason.
4. **Research gaps.** Read `docs/research/` and the #903 review notes. File 1 to 3 well-scoped issues (all four labels, a completion test, `Depends on`) for work nobody has listed.

Only the planner moves a `status:backlog` issue to `status:todo` ([`docs/flow/planner.md`](flow/planner.md)). Every issue carries a status, lane, tier and prio label. Never leave one unlabelled.

## Anytime queue

Issues labelled `anytime` are safe work. Take one when the ready list and the four rungs give you nothing.

- Only the planner adds `anytime` ([`docs/flow/planner.md`](flow/planner.md)). A design issue held for a spec or mock is never `anytime`.
- Find them with `gh issue list --label anytime --state open`. Take the highest `prio:` first.
- An `anytime` issue still has a `tier:` label. Stay at or below your tier. The planner sets the tier by risk, as for any issue.
- Claim it as usual. It is eligible with `status:todo` or `status:backlog` if nothing blocks it and no PR is open.
- The planner keeps at least 5 open, unclaimed `anytime` issues. Each has a lane, a tier, a prio and a completion test.
- If fewer than 5 remain, the planner files or labels more at its next run.

What belongs in the queue:

- Proof hardening for a gap a review or a flake report flagged.
- A missing test for a registered proof or a recently merged feature.
- Docs and plain-language fixes under the [Writing rules](FRAMEWORK.md#writing). Never change a rule's meaning or a DECISIONS row.
- Size-trim audits: find bytes to cut under an existing ceiling. Never move a ceiling.
- Flaky-signature audits: match a flake to `.github/flaky.json`, then fix its cause. Never add or widen a `flaky.json` pattern. Remove an entry only after the fix is proven.

