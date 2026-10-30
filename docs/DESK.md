# Running the review desk

The review desk reviews and merges every PR, answers agents on the hub, and turns Jarrod's calls into issues. It is the "orchestrator" and "Reviewer" that AGENTS.md and FRAMEWORK.md name. Jarrod names one session as the desk. Any Claude Code cloud session can take over from this file. The desk's state lives on GitHub, not in a chat.

## Start a desk session

Jarrod pastes: `Run the Emberisle review desk. Read docs/DESK.md.`

1. Read the **Desk state** issue, [#916](https://github.com/jarrodjohnson-gif/emberisle/issues/916). It lists what is waiting on Jarrod, every open PR, the builds in flight and the queue.
2. Read the hub, [#854](https://github.com/jarrodjohnson-gif/emberisle/issues/854), from the newest comment back to the last desk post.
3. Subscribe to the inbox PR #699 only. The inbox relays PRs opened or marked ready, not drafts. It also relays any comment that starts with `Question:` or `To desk:`. It skips CI and hub status lines. Subscribe to a PR directly only while you wait on its CI to merge it. Unsubscribe once it merges.
4. Sweep every open PR once. A builder's push doesn't wake you, so list each PR whose head SHA differs from the head your last review named. Those need a fresh review.
5. Pick up anything waiting: an unreviewed PR, a red PR you own, or a question on the hub.

## Keep it cheap

- **Restart once a day (UTC), or when your context passes about 150K tokens,** whichever comes first. Rewrite the #916 body first. Then Jarrod starts a new session with the line above. Every wake re-reads your whole context. The desk that ran from 10-21 to 10-26 reached 570K tokens and cost about $500 (Jarrod's audit, 2026-10-26).
- **Edit #916, don't comment on it.** Update it at the end of every round.
- **Mark every post you write** with `<!-- review-desk -->`, so the inbox doesn't wake you for it.
- **Ignore echoes:** subscription notices, your own reviews coming back, and merge confirmations. Also ignore red `browser-a` or `checks` results from a CI run that a newer push cancelled.
- **Run the desk on Sonnet.** Give each review subagent its model per "Who reviews". Never start Fable or Astra unless Jarrod asks or a `DECISIONS.md` row sends the work to them.
- **Check small fix pushes yourself** by reading the diff, unless you are the builder's model. Use a fresh reviewer for a first review or a large push.
- **Delegate reviews** to a fresh subagent with [REVIEWING.md](REVIEWING.md). Reviewers rely on CI and don't rerun the full suite.
- **Don't write `@codex`** unless you mean to start a Codex task. A mention starts one.

## Talk less (owner, 2026-10-26)

These rules survive a context summary, so re-read them at the start of every desk session.

- **One desk session merges.** No second triage session: two sessions fight over labels and merges and double the polling.
- **Say nothing on a no-op.** A self-echo, a subscription notice, a merge notice you already handled, a "CI still running" event, or anything else that needs no action gets no reply at all.
- **Every report to Jarrod uses one block,** so he can see the state without scrolling:
  - **Working on:** one line.
  - **Waiting on:** who or what, one line each (Jarrod, CI, a builder).
  - **Done since your last message:** newest first, one line each, with the PR or issue number.
  Answer his question above the block when he asked one.
- **Report only what changed.** Never repeat the waiting list, the open cards or the pending PRs in an unprompted update. Say it once when it appears and again only when its state changes.
- **Plain words for the owner, short.** No tags or jargon. Answer a direct question in full; the delta-only rule is for unprompted updates.
- **Batch the owner's votes.** Pictures and decisions go on the Desk Decisions page. Nudge only when something new is waiting there.
- **Use parallel throwaway subagents for triage too.** Builder questions, stale-claim scans, tier audits and label sweeps go to a Sonnet or Haiku subagent that returns a short table or one line. The desk applies the labels and answers on the issue. Reviews keep their model per "Who reviews".
- **Triage subagents return flags, not prose.** Ask a Haiku or Sonnet subagent for a compact table: a route (`opus-review`, `sonnet-review`, `ready-for-builder`, `needs-mock-pic`, `needs-owner-vote`, `stale-or-superseded`), whether the issue already states its numbers and a completion test (yes or no), a one-line reason, and three overlap fields: `overlaps_open_or_merged` (yes or no, with the issue or PR number, which catches stale or superseded issues and two builders editing the same files), `severity` for bugs (`cosmetic`, `broken` or `blocking`), and `theme_cluster` (so the desk can batch related owner cards together). The desk checks the table against the issue before it changes a label or promotes anything. A subagent never decides alone: anything the owner would see or hear, and anything that changes a product rule, goes to the Desk Decisions page, whatever the table says.

## Before you post, check the facts

1. Open the issue itself and read its newest comments and labels. #916, old hub posts and PR titles are hints, never facts.
2. Quote the comment or label you rely on, with its date, in your post.
3. Check the thing you assert: the PR head SHA, the draft flag, the latest CI run on that head.
4. Skip a red from a draft, a superseded head or a cancelled run. Don't explain it on the hub.
5. Jarrod's dated words in an issue or `docs/DECISIONS.md` are owner policy. Orchestrator calls under "Who decides what" in `docs/FRAMEWORK.md` bind builders too. Web numbers go in `docs/research/` as notes.
6. Before you recommend a repo setting, ask what it does to the desk's own merges. The desk posts as Jarrod's account, so a rule that blocks that account blocks the desk.
7. Each line in #916 carries `checked: <date>`. Re-verify a line against its issue before you repeat it. "Waiting on Jarrod" lines link the comment where the question sits.
8. Post once per round on the hub, and one post may answer several agents. If you have to correct a post, log the slip in #916, because step 1 was missed.

## Who reviews

A different model from the builder. Sonnet by default, and never the builder's own model. Opus only for `tier:1` work as `docs/LANES.md` defines it, and for a Sonnet-built PR that changes more than docs. Haiku for docs-only changes, or Sonnet if Haiku built them. The builder rule always wins. Sound, renderer and HUD work don't need Opus for their area alone. Sonnet checks the code, and Jarrod judges the look and sound. End every review with `Reviewer: <model> · Builder: <model> · Head: <sha>`. A builder with several open PRs lists them in priority order in a `To desk:` comment on #854. The desk reviews in that order, one at a time.

## When to merge

Squash, with the full 40-character head SHA, only when all of these hold:
- the review is clean, and its findings are fixed;
- CI is green on that head: `checks` shows **completed** and **success**, not skipped, grey, pending or missing. A draft skips it, and a skipped required check counts as passing, so never merge on a skipped `checks`. An empty check list means CI hasn't started, not that it passed. The owner account can merge past required checks, so this rule is the only guard. #1168 merged on pending checks on 2026-10-26;
- there is no conflict and the PR isn't a draft;
- Jarrod has seen the screenshots of any visual change.

After the merge, watch `main`'s CI on the merge commit until `checks` is completed. Red on `main` is `prio:p0`: tell Jarrod and file it. Then set the issue to `status:in-review`. `issue_write` replaces every label, so pass the full label list.

## Weekly

- **Monday, post a hub digest** on #854. A Haiku subagent drafts it. Check it against the issues before posting. Post one comment headed `Hub digest, <date>`, listing the standing directions that still apply. Then replace the "Directions" bullet in #854's body with a pointer to it. Agents read #854's body, then only the comments after the newest digest. Don't open a new hub issue: the inbox workflow is wired to #854.
- **Batch the `Decide:` issues** (`docs/FRAMEWORK.md` section 10) and apply them in one docs PR. Rule documents change only in this Monday batch. The one exception is a new row in `docs/DECISIONS.md` for an owner decision.
- **Add any new flaky proof to `.github/flaky.json`** the day it is seen on `main`, with its log line. Red on `main` is a flake until shown otherwise. Red on a PR after one re-run is real. A run marked cancelled is not a result.

## Always

- Never push to `main`, force-push someone else's branch, or skip or loosen a test.
- Log every owner decision in [DECISIONS.md](DECISIONS.md).
- Never stop silently. If nothing is waiting, say so on the hub and update #916.
