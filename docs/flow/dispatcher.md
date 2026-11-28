# The dispatch thread

One project thread runs Ember Isle: "Run Ember Isle builders from the project", in the "Ember Isle builds" project. The map is [`../DESK.md`](../DESK.md).

It replaced the dispatcher chat, the clerk, the Desk page and the two tick tasks on 2026-11-28 ([`../DECISIONS.md`](../DECISIONS.md)). The handoff plan is [#854, comment 7235352184](https://github.com/jarrodjohnson-gif/emberisle/issues/854#issuecomment-7235352184).

- **It starts builders and owns their PRs.** Each builder is a subagent that takes one issue or one PR.
- **It asks Jarrod with decision cards** in this thread, and carries his answers to GitHub.
- **It keeps its state in the repo and the project memory.** A long chat loses detail at every context reset.

## Never

- Never merge, except the hand-over merge in step 2.
- Never decide for Jarrod. Only he answers a card. His 2026-11-28 standing delegation says what Claude decides for him ([`../DECISIONS.md`](../DECISIONS.md)).
- Never add `owner-ok`, `owner-merge` or an `owner-replaced` marker except to carry his own answer, or under that delegation.
- Add and remove labels one at a time. Read the labels just before every write. Never send a whole label list (#1341).
- Never touch a `signal:` label.
- Never ask Jarrod to paste a token or a secret.

## The hourly tick

One scheduled tick wakes this thread every hour. Every tick runs these steps, in order.

1. **List the open PRs once.** Take only `number`, `title`, `draft`, `labels`, `updated_at` and the head SHA. A skipped or cancelled run on an old head is not a failure: check the head SHA before you act.
2. **Merge what the workflow handed over.** Do this for each PR with both `signal:green` and `merge-by-chat`.
   - Read that PR's head SHA and labels again, and the newest comment by `github-actions[bot]` that carries `<!-- merge-by-chat: <SHA> -->`.
   - If both labels are still there and the head equals that SHA, squash-merge it, pinned to that SHA.
   - If there is no such comment, or its SHA is not the head, do not merge.
   - Never merge a PR without both labels. Never add either label yourself.
   - This is the one exception to "never merge" in AGENTS.md rule 7. It belongs to this thread alone.
   - If the merge is refused, read the `auto-merge` job log first. Raise it as an alarm if it is refused at two ticks.
3. **Check the outcome alarms.** Check results, not whether a chat is alive. Raise an alarm when:
   - no builder is running and `status:todo` issues exist;
   - a reviewed, green PR is more than 2 hours old;
   - a card has waited more than 24 hours for Jarrod;
   - CI on `main` is red. That is `prio:p0`: start a builder for it first.

   Act on each alarm at this tick. Name the ones you could not clear in the nightly post (step 9).
4. **Carry his answers** ([Owner answers](#owner-answers)).
5. **Bring new questions to him** ([Questions for Jarrod](#questions-for-jarrod)).
6. **Start builders, up to 3 at a time** ([Builders](#builders)).
7. **Finish the PRs builders handed back** ([A builder's PR](#a-builders-pr)).
8. **Start the planner if it is needed** ([The planner](#the-planner)).
9. **After 8 PM America/Phoenix, post what shipped**, once a day ([The nightly post](#the-nightly-post)).

## Builders

- **At most 3 builders run at a time.** Jarrod set three on 2026-11-27 ([`../DECISIONS.md`](../DECISIONS.md)). Only he changes it. The planner does not count.
- Each builder takes one issue, or one PR that needs work. Take PRs first:
  1. a red PR that carries `answered`. Jarrod has answered;
  2. a red PR that carries `no-pictures`;
  3. a yellow PR updated in the last 7 days, with no update for 3 hours and no builder on it.
- A red PR that carries `on-desk` waits for him. Start no builder for it.
- When no PR needs one, start a builder in the first free slot:

| Slot | Model | Takes |
|---|---|---|
| `claude-opus-a` | `claude-opus-5-5` | one `tier:1` issue, or one `tier:2` issue marked `model:opus` if no `tier:1` issue is eligible |
| `claude-sonnet-a` | `claude-sonnet-5-5` | one `tier:2` or `tier:3` issue not marked `model:opus` |
| `claude-sonnet-b` | `claude-sonnet-5-5` | one `tier:2` or `tier:3` issue not marked `model:opus` |

Skip a slot for 6 hours after its builder reports `nothing eligible`.

**The builder's prompt:** `Work on Emberisle as builder "<slot>", model <model>. Read AGENTS.md and docs/flow/builder.md. Take <the slot's "Takes" cell, word for word>, a prio:p0 first. Open the PR ready for review, get checks green, and report back with the PR number, the head SHA and the CI result. Do not review your own PR.`

For a PR, name the PR and what it needs in place of the issue. A builder that fixes findings takes the same PR again.

## A builder's PR

The thread owns each PR from the builder's report to the merge.

1. **CI.** Watch `checks` and `loosen` on the head. A red that is the PR's own goes back to a builder.
2. **The look check.** A PR that changes a look, a sound, a design or a colour gets a Fable 5.2 look check first. It follows [`builder.md`](builder.md), "Small look fixes need no card".
3. **The review.** Start one reviewer subagent on a model that built no part of the PR. Sonnet 5.5 reviews Opus work, and Opus 5.5 reviews Sonnet work. Give it [`../REVIEWING.md`](../REVIEWING.md), the PR number and the full head SHA.
4. **Findings.** Start a builder to fix them, then review the new head.
5. **Two fix rounds at most.** A PR that fails review twice gets no third round. Post one line on it, and have the planner split its issue into smaller issues.
6. **A governance PR** merges with `owner-merge`. Add it only under the standing delegation, or to carry his tap ([`merging.md`](merging.md)).

## Questions for Jarrod

A builder asks with `needs-owner` and one `Blocked:` or `Question:` comment, on the PR or on the issue ([`builder.md`](builder.md), "When you need Jarrod").

1. List open PRs and issues with `needs-owner`. Take each one with none of `on-desk`, `answered` and `no-pictures`.
2. Read its newest `Blocked:` or `Question:` comment.
3. A look question with no pictures on the branch gets `no-pictures` and one comment. It gets no card yet.
4. `Blocked: CI run needs approval` on a fork PR: the card links the PR's checks page and asks him to press "Approve and run".
5. Otherwise make one decision card per question. Give two or three real options, mark the one you recommend, and add phone-size pictures (440x956) when they matter.
6. Note the PR's head SHA on the card. Then add `on-desk`.

A reviewed, green PR that is red only for a rule file is not a question. The standing delegation covers it (step 6 above).

## Owner answers

When Jarrod taps a card, carry his answer at once.

1. Post one comment on the PR or issue. It starts `Owner answer (Desk page, project card <date time UTC>):`. Then give his option, then his note word for word. His note wins over the option.
2. Add the marker his answer calls for, for the PR's exact head SHA:
   - `<!-- owner-merge: <SHA> -->`, then the `owner-merge` label, when he says to merge a rule-file PR;
   - `<!-- owner-ok: <SHA> -->`, then the `owner-ok` label, when he approves a PR that carries `needs-owner`, with no note and no other open card on it;
   - an `owner-replaced` marker, when he approves replaced test lines (the 2026-11-28 `owner-replaced` row in [`../DECISIONS.md`](../DECISIONS.md), from #1916).
3. If the head moved since the card, add no marker. Make a fresh card for the new head.
4. Remove `on-desk`. If a builder must still act on his answer, add `answered`.

**The prefix is historical.** `scripts/auto-merge-eligible.mjs` reads markers only in a comment that starts `Owner answer (Desk page`. Keep that exact prefix. A comment under the standing delegation starts `Owner answer (Desk page, standing delegation 2026-11-28)`.

**Log his standing rules.** A standing rule outlasts the one PR or issue it was asked on. Examples are a new limit, or a design choice for a whole screen. A merge, a close or a look on one PR is not one.

- Add one row per rule at the top of the table in [`../DECISIONS.md`](../DECISIONS.md): the date, the rule in one bold sentence, his words in quotes, and the card.
- Put the rows in one PR from the branch `clerk/decisions-log`. The branch keeps its old name, because [`../REVIEWING.md`](../REVIEWING.md) and [`builder.md`](builder.md) name it.
- Add to that PR while it is open. It merges like any governance PR.

## The planner

Start one planner subagent on Opus 5.5 ([`planner.md`](planner.md)) when any of these holds:

- a builder reported `nothing eligible` in the last 6 hours;
- an open issue carries `answered`;
- fewer than 5 open issues carry `status:todo`;
- a PR failed review twice (step 5 of [A builder's PR](#a-builders-pr)).

Start at most one planner in 12 hours. Give it the answers and PR numbers it needs in its prompt.

## The nightly post

At the first tick after 8 PM America/Phoenix, post one short message in this thread for Jarrod. Post it once a day.

- **Merged:** each PR merged since the last post.
- **Parked:** each PR or issue that waits, and why.
- **Decided for him:** every call made under the standing delegation. He can undo any of them.
- **Alarms:** any alarm from step 3 still open.

Plain words, no SHAs.

## Permissions

If a tool is denied, stop that step and name the tool in the nightly post. Never work around it.
