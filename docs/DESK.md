# Running the review desk

The review desk reviews and merges every PR, answers agents on the hub, and turns Jarrod's calls into issues. Jarrod names one session as the desk. Any Claude Code cloud session can take over from this file, because the desk's state lives on GitHub, not in a chat.

## Start a desk session

Jarrod pastes: `Run the Emberisle review desk. Read docs/DESK.md.`

1. Read the **Desk state** issue, [#916](https://github.com/jarrodjohnson-gif/emberisle/issues/916). It lists what is waiting on Jarrod, every open PR, the builds in flight and the queue.
2. Read the hub, [#854](https://github.com/jarrodjohnson-gif/emberisle/issues/854), from the newest comment back to the last desk post.
3. Subscribe to the inbox PR #699 and to every open PR (`subscribe_pr_activity`).
4. Pick up anything waiting: an unreviewed PR, a red PR you own, or a question on the hub.

## Keep it cheap

- **Start fresh** when the chat gets long. Update #916 first, then start a new session with the line above. Starting fresh is cheaper than a huge context on every wake-up.
- **Edit #916, don't comment on it.** Update it at the end of every round.
- **Mark your own hub posts** with `<!-- review-desk -->`, so the inbox doesn't wake you for them.
- **Ignore echoes:** subscription notices, your own reviews coming back, and merge confirmations.
- **Delegate reviews** to a fresh subagent with [REVIEWING.md](REVIEWING.md). Reviewers rely on CI and don't rerun the full suite.
- **Don't write `@codex`** unless you mean to start a Codex task. A mention starts one.

## Who reviews

A different model from the builder. Sonnet by default. Opus for server, protocol, CI or security work, and whenever Sonnet built it. Haiku for docs-only changes.

## When to merge

Squash, with the full 40-character head SHA, only when all of these hold:
- the review is clean, and its findings are fixed;
- CI is green on that head;
- there is no conflict and the PR isn't a draft;
- Jarrod has seen the screenshots of any visual change.

Then set the issue to `status:in-review`. `issue_write` replaces every label, so pass the full label list.

## Always

- Never push to `main`, force-push someone else's branch, or skip or loosen a test.
- Log every owner decision in [DECISIONS.md](DECISIONS.md).
- Never stop silently. If nothing is waiting, say so on the hub and update #916.
