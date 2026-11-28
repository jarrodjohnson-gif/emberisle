# The flow: builders, signals and the dispatch thread

Jarrod set this flow on 2026-11-28. It replaces the dispatcher chat, the clerk, the Desk page and the two tick tasks ([`DECISIONS.md`](DECISIONS.md)).

- **One project thread runs dispatch.** "Run Ember Isle builders from the project" wakes at an hourly tick. It starts builders and owns their PRs ([`flow/dispatcher.md`](flow/dispatcher.md)).
- **A builder takes one issue or one PR.** The thread starts it as a subagent, at most 3 at a time. It builds, gets CI green and reports back.
- **The thread owns each PR to the merge.** It watches CI, gets the Fable 5.2 look check, and has a different model review the PR.
- **GitHub holds the state.** A workflow puts one signal label on every open PR: green, yellow or red.
- **A workflow decides every merge.** Auto-merge squashes a PR that is green and reviewed. The thread only carries out the merges the workflow's token is not allowed to make.
- **Jarrod answers decision cards in the thread.** A builder still asks with `needs-owner` and a `Blocked:` or `Question:` comment. The thread brings it to him, and carries his answer back.

Where an older document says "the desk", "the dispatcher", "the clerk" or "the Desk page", read "the dispatch thread".

## Who reads what

Each role reads [AGENTS.md](../AGENTS.md) and its own file. Nothing else is required.

| Role | File | Started by |
|---|---|---|
| Builder | [`flow/builder.md`](flow/builder.md) | The dispatch thread, or Jarrod |
| Reviewer subagent | [`REVIEWING.md`](REVIEWING.md) | The dispatch thread, or a builder Jarrod started |
| Dispatch thread | [`flow/dispatcher.md`](flow/dispatcher.md) | Jarrod, in the project |
| Planner | [`flow/planner.md`](flow/planner.md) | The dispatch thread |
| Anyone asking how a merge happens | [`flow/merging.md`](flow/merging.md) | |

Also: claims and the fallback ladder are in [LANES.md](LANES.md). Owner decisions are in [DECISIONS.md](DECISIONS.md). Jarrod's device, publishing and media are in [OWNER.md](OWNER.md). Helpers follow [HELPERS.md](HELPERS.md).

**An older prompt names a section of this file.** "A builder chat" is now [`flow/builder.md`](flow/builder.md). "The dispatcher", "the clerk" and "Jarrod and the Desk page" are [`flow/dispatcher.md`](flow/dispatcher.md). "The planner" is [`flow/planner.md`](flow/planner.md). "Merging" is [`flow/merging.md`](flow/merging.md).

## Why the desk went

Every chat starts at about 84K tokens before it reads anything, and every wake re-reads the whole chat. The two desks of 2026-11-21 used 153K and 168K just to take over. One stopped reviewing 29 minutes in, the other called for a replacement after 37 minutes, and nine green PRs then sat with no reviewer. 41 of their 53 turns did nothing but answer a wake. A chat that lives for one PR has none of these costs.

## Signals

`scripts/pr-signal.mjs` sets the label after every CI run, push, review comment and label change, and once an hour. Never set a `signal:` label by hand.

| Label | Means | Who acts |
|---|---|---|
| `signal:yellow` | In progress: building, CI running or red, review pending, or findings to fix | The PR's builder. If it has none, the dispatch thread starts one. |
| `signal:green` | Auto-merge will take it: every rule in [`flow/merging.md`](flow/merging.md) holds at the exact head | Auto-merge |
| `signal:red` | Waits for Jarrod: `needs-owner` is on the PR without `owner-ok`, the newest review asks for his look, or the PR is green and reviewed but it needs his yes (a governance file without `owner-merge`, or `AUTO_MERGE` is off) | The dispatch thread brings it to him |

A draft PR gets no signal.

## Rules for every chat

- Add and remove labels one at a time. Never send a whole label list (#1341).
- Never touch a `signal:` label.
- Only the dispatch thread adds `owner-ok`, `owner-merge` or an `owner-replaced` marker, to carry Jarrod's own answer. It may also add `owner-merge` under his 2026-11-28 standing delegation ([`DECISIONS.md`](DECISIONS.md)).

## Keep it cheap

- **One builder, one issue.** Never run a builder for days ([LANES.md](LANES.md), "Sub-agents and usage limits").
- **No always-on chat subscribes to anything.** A builder subscribes only to its own PR, and unsubscribes when the PR is done or blocked.
- **Three builders at a time** at most ([`flow/dispatcher.md`](flow/dispatcher.md), "Builders").
- **No token thresholds.** A builder ends because its work is done.
- **Reviewers rely on CI** and don't rerun the suite ([REVIEWING.md](REVIEWING.md)).
- **Each role reads only its own file** in `docs/flow/`, plus AGENTS.md.
- **Never start Fable or Astra as a session.** Fable runs as a subagent for design work and look checks ([LANES.md](LANES.md)).
- **Don't write `@codex`** unless you mean to start a Codex task.

## Left over from the old flows

- The Desk page and its cards are retired. Its old cards and answers are not read.
- [`flow/clerk.md`](flow/clerk.md) is now a pointer to [`flow/dispatcher.md`](flow/dispatcher.md).
- Issue #916 and the inbox PR #699 are no longer read, and nobody reads `To desk:` comments. Never subscribe to #699 or edit #916; the planner alone keeps #916's body ([`flow/issue-bodies.md`](flow/issue-bodies.md)). The `desk-board` workflow still writes its table to #916 and its lines to #699; nothing acts on them.
- `desk-gate` still sets its status on every PR. It checks the same review footer that auto-merge reads.
- The Monday hub digest has no owner yet. Jarrod starts a chat for it when he wants one.
- `docs/archive/` keeps `LOOPING.md` and `builder-kit/` for the record. Nobody follows them.
- `docs/ORCHESTRATOR.md` became [`OWNER.md`](OWNER.md) on 2026-11-22.
