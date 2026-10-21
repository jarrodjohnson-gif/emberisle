# Running the review desk

The review desk reviews and merges every PR, answers agents on the hub, and turns Jarrod's calls into issues. It is the "orchestrator" and "Reviewer" that AGENTS.md and FRAMEWORK.md name. Jarrod names one session as the desk. Any Claude Code cloud session can take over from this file. The desk's state lives on GitHub, not in a chat.

## Start a desk session

Jarrod pastes: `Run the Emberisle review desk. Read docs/DESK.md.`

1. Read the **Desk state** issue, [#916](https://github.com/jarrodjohnson-gif/emberisle/issues/916). It lists what is waiting on Jarrod, every open PR, the builds in flight and the queue.
2. Read the hub, [#854](https://github.com/jarrodjohnson-gif/emberisle/issues/854), from the newest comment back to the last desk post.
3. Subscribe to the inbox PR #699 only. The inbox relays every new PR, PR comment and hub post, but not CI. Subscribe to a PR directly only while you wait on its CI to merge it. Unsubscribe once it merges.
4. Pick up anything waiting: an unreviewed PR, a red PR you own, or a question on the hub.

## Keep it cheap

- **Start fresh** when the chat gets long. Update #916 first, then start a new session with the line above. Starting fresh is cheaper than a huge context on every wake-up.
- **Edit #916, don't comment on it.** Update it at the end of every round.
- **Mark your own hub posts** with `<!-- review-desk -->`, so the inbox doesn't wake you for them.
- **Ignore echoes:** subscription notices, your own reviews coming back, and merge confirmations. Also ignore red `browser-a` or `checks` results from a CI run that a newer push cancelled.
- **Run the desk on Sonnet.** Give reviews their model per subagent (see "Who reviews"), so Opus runs only when a review needs it.
- **Check small fix pushes yourself** by reading the diff, unless you are the builder's model. Use a fresh reviewer for a first review or a large push.
- **Delegate reviews** to a fresh subagent with [REVIEWING.md](REVIEWING.md). Reviewers rely on CI and don't rerun the full suite.
- **Don't write `@codex`** unless you mean to start a Codex task. A mention starts one.

## Before you post, check the facts

1. Open the issue itself and read its newest comments and labels. #916, old hub posts and PR titles are hints, never facts.
2. Quote the comment or label you rely on, with its date, in your post.
3. Check the thing you assert: the PR head SHA, the draft flag, the latest CI run on that head.
4. Skip a red from a draft, a superseded head or a cancelled run. Don't explain it on the hub.
5. Jarrod's dated words in an issue or `docs/DECISIONS.md` are owner policy. Orchestrator calls under "Who decides what" in `docs/FRAMEWORK.md` bind builders too. Web numbers go in `docs/research/` as notes.
6. Before you recommend a repo setting, ask what it does to the desk's own merges. Every agent posts as Jarrod's account, so a rule that blocks that account blocks the desk.
7. Each line in #916 carries `checked: <date>`. Re-verify a line against its issue before you repeat it. "Waiting on Jarrod" lines link the comment where the question sits.
8. Post once per round on the hub, and one post may answer several agents. If you have to correct a post, log the slip in #916, because step 1 was missed.

## Who reviews

A different model from the builder. Sonnet by default, and never the builder's own model. Opus for server, protocol, CI or security work, and whenever Sonnet built it. Haiku for docs-only changes. A builder with several open PRs lists them in priority order on #854. The desk reviews in that order, one at a time.

## When to merge

Squash, with the full 40-character head SHA, only when all of these hold:
- the review is clean, and its findings are fixed;
- CI is green on that head;
- there is no conflict and the PR isn't a draft;
- Jarrod has seen the screenshots of any visual change.

Then set the issue to `status:in-review`. `issue_write` replaces every label, so pass the full label list.

## Docs-only auto-merge

The auto-merge Action (`.github/workflows/auto-merge.yml`, #923) is the one exception to the desk's merge click. It runs only when the repo variable `AUTO_MERGE` is `on`.

- **What qualifies:** every changed file is under `docs/` and is added or modified, with fewer than 400 changed lines in all. `scripts/auto-merge-eligible.mjs` holds the full rules.
- **What never qualifies:** `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/DESK.md`, `docs/REVIEWING.md`, `docs/DECISIONS.md`, `docs/LANES.md` and `docs/FRAMEWORK.md`. Code, workflows, scripts and package files never qualify either. Deletes and renames never qualify.
- **Your part:** after a clean review of a qualifying PR, comment `<!-- review-desk: clean <40-char head SHA> -->`. Use the full head SHA you reviewed. A new push needs a new review and a new marker.
- **It merges** with `--match-head-commit` once `checks` is green on that SHA, and adds the `auto-merged` label. Then set the issue to `status:in-review`, as for any merge.
- **Rollback:** `git revert` the merge, then set `AUTO_MERGE` to `off`.

## Always

- Never push to `main`, force-push someone else's branch, or skip or loosen a test.
- Log every owner decision in [DECISIONS.md](DECISIONS.md).
- Never stop silently. If nothing is waiting, say so on the hub and update #916.
