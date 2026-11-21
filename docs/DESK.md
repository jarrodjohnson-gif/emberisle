# The flow: builders, signals and the dispatcher

Jarrod set this flow on 2026-11-21. It replaces the review desk. There is no long-running chat that reviews, merges or keeps a ledger.

- **A builder chat owns one issue to the end.** It builds, waits for CI, has a different model review the PR, fixes the findings and stops.
- **GitHub holds the state.** A workflow puts one signal label on every open PR: green, yellow or red.
- **A workflow merges.** Auto-merge squashes a PR that is green and reviewed. No chat merges.
- **The dispatcher only starts chats.** It reads the labels and fills free slots. It never opens a diff or a review.

Where an older document says "the desk", read it this way: a review is your own reviewer subagent, a merge is auto-merge, and a question for Jarrod is the `needs-owner` label.

## Why the desk went

Every chat starts at about 84K tokens before it reads anything, and every wake re-reads the whole chat. The two desks of 2026-11-21 used 153K and 168K just to take over. One stopped reviewing 29 minutes in, the other called for a replacement after 37 minutes, and nine green PRs then sat with no reviewer. 41 of their 53 turns did nothing but answer a wake. A chat that lives for one PR has none of these costs.

## Signals

`scripts/pr-signal.mjs` sets the label after every CI run, push, review comment and label change, and once an hour. Never set a `signal:` label by hand.

| Label | Means | Who acts |
|---|---|---|
| `signal:yellow` | In progress: building, CI running or red, review pending, or findings to fix | The PR's builder chat. If it has none, the dispatcher starts one. |
| `signal:green` | `checks` is green and the newest review is clean, both at the exact head | Auto-merge |
| `signal:red` | Waits for Jarrod: `needs-owner` is on the PR without `owner-ok` | Jarrod |

A draft PR gets no signal.

## A builder chat

One chat takes one issue, or one batch of up to three PRs it is told to finish. Pick and claim the issue as [AGENTS.md](../AGENTS.md) and [LANES.md](LANES.md) say. Then:

1. **Build and open the PR**, ready for review, with `Agent: <your agent name>` and your model in the body.
2. **Wait for CI with `subscribe_pr_activity`.** Never sleep or poll. Fix a red CI.
3. **When `checks` is green on the head, start one reviewer subagent** with the Agent tool.
   - Its model is never yours, and never a model that built any part of the PR. Sonnet 5.5 reviews Opus work and Opus 5.5 reviews Sonnet work. Haiku 5.5 may review a docs-only PR.
   - Give it [REVIEWING.md](REVIEWING.md), the PR number and the full head SHA.
   - It posts its review on the PR itself. You never write, edit or delete a review comment.
4. **Fix its findings**, push, wait for green, and start a fresh reviewer on the new head. Do this three times at most.
5. **Stop when the PR is done.** Done means the newest review is clean at the head and `checks` is green there. Set the issue to `status:in-review`, unsubscribe from the PR, post one last line, and end. Auto-merge does the rest.

**When you need Jarrod**, add the `needs-owner` label to the PR and post one comment that starts `Blocked:` or `Question:`, with the options and your recommendation. Do this when:

- the PR changes anything a player sees or hears. Put real screenshots in the PR body first, at 440x956 and 956x440, or the audio;
- the review still has findings after three rounds;
- the issue needs a design decision ([AGENTS.md](../AGENTS.md) rule 12).

Then finish what does not depend on the answer, unsubscribe and end. The next chat for that PR picks up his answer.

**Never:**

- merge, or add `owner-ok`;
- subscribe to PR #699, post `To desk:`, or edit #916;
- start a session;
- keep a chat alive to wait for a merge or for Jarrod.

## The review comment

The reviewer subagent posts one comment per review, in this shape. The gate and auto-merge read it, so the shape is exact.

```
<!-- review-desk -->
Clean.
<!-- review-desk: clean <full 40-character head SHA> -->
Reviewer: <model> · Builder: <model> · Head: <full 40-character head SHA>
```

A review with blocking findings lists them, each with `file:line`, in place of the `Clean.` and marker lines. It keeps the first and last lines. Copy the SHA from the API, never type it.

## Merging

`.github/workflows/auto-merge.yml` squashes a PR at its checked head when all of these hold:

- `checks` is completed and green on the head;
- the newest review comment is clean at that head, and its reviewer differs from its builder;
- `needs-owner` is absent, or `owner-ok` is present;
- the PR touches no governance file: `AGENTS.md`, `CLAUDE.md`, `README.md`, the rule documents in `docs/`, `.claude/`, `.github/` apart from `ci.yml`, and the merge scripts themselves. Jarrod merges those by hand.

Two repo variables switch it off. `AUTO_MERGE` is `on` today; anything else stops all auto-merging. Setting `AUTO_MERGE_CODE` to `off` stops it for code PRs only, and leaves small docs PRs merging. To re-check one PR, run the auto-merge workflow by hand with its number.

Red on `main` after a merge is `prio:p0`. The dispatcher starts a builder for it first.

## Jarrod

- **A red PR waits for you.** Read its last `Blocked:` or `Question:` comment. To approve a look or a sound, add the `owner-ok` label. To answer a question, comment on the PR. The dispatcher sends a builder back to a red PR once you have commented or labelled it.
- **Your dated words on an issue or PR are owner policy.** A row for [DECISIONS.md](DECISIONS.md) goes in its own small PR, which you merge.
- **The Desk Decisions page is retired.** Nothing reads it.

## The dispatcher

One small chat, on Haiku 5.5. Jarrod starts it at claude.ai/code on the emberisle repo: `Run the Emberisle dispatcher. Read "The dispatcher" in docs/DESK.md.`

It keeps no ledger. Everything it needs is in the PR list and in the session ids it started.

**Every tick, in this order:**

1. List the open PRs once, with only these fields: `number`, `title`, `draft`, `labels`, `updated_at`. Never read a PR body, a diff, a review, #916 or #699.
2. **Archive finished chats.** Archive a chat you started when its PR is merged, closed, green or red, or 6 hours after you started it.
3. **Count live chats.** A chat is live for 4 hours after you start it, or while one of its PRs was updated in the last 3 hours.
4. **Send help to orphans.** An orphan is a `signal:yellow` PR updated in the last 7 days, with no live chat and no update for 3 hours. A `signal:red` PR that changed since it turned red is an orphan too. Start one PR-owner chat for up to three orphans. Start two such chats per tick at most.
5. **Fill the builder slots**, while fewer than five chats are live in all:

   | Slot | Model | Takes |
   |---|---|---|
   | `claude-opus-a` | `claude-opus-5-5` | `tier:1` |
   | `claude-sonnet-a` | `claude-sonnet-5-5` | `tier:2` or `tier:3` |
   | `claude-sonnet-b` | `claude-sonnet-5-5` | `tier:2` or `tier:3` |

   Skip a slot whose last chat is still live.
6. **Set the next tick** with one `send_later` for 120 minutes. Then post `·` and end the turn.

**Start chats with `create_session`**, `source_url` `https://github.com/jarrodjohnson-gif/emberisle`, and a title that starts `(auto)` and names the slot and PR numbers.

- **Builder prompt:** `Work on Emberisle as builder "<slot>", model <model>. Read AGENTS.md and docs/DESK.md, "A builder chat". Take one eligible <tier> issue, a prio:p0 first, and follow that section to the end. Then stop.`
- **PR-owner prompt:** `You own these open Emberisle PRs until each is done: <numbers>. Your agent name is <slot>, model <model>. Read AGENTS.md and docs/DESK.md, "A builder chat". For each PR, read its newest comments, then follow steps 2 to 5 of that section. Take no new issue. Then stop.` Use Opus 5.5 for a PR whose issue is `tier:1`, and Sonnet 5.5 otherwise.

**The dispatcher never** reviews, merges, labels, comments on GitHub, answers a question, or reads a chat's transcript. It posts in its own chat only when `create_session` fails, once, with the error.

**Its own size.** A tick adds about 2K tokens. When `get_session` shows more than 300K, tell Jarrod once: "Please start a fresh dispatcher," with the start line. Check this once a day, not every tick. If PRs sit yellow for half a day with no chat, the tick chain broke: start a fresh dispatcher.

**Permissions.** The repo's `.claude/settings.json` allows `create_session`, `archive_session`, `send_later`, `get_session` and `send_message`. Only Jarrod changes it. If one is denied, say which, once, and carry on.

## Keep it cheap

- **One chat, one issue.** Never run a builder chat for days ([LANES.md](LANES.md), "Sub-agents and usage limits").
- **No always-on chat subscribes to anything.** A builder subscribes only to its own PR, and unsubscribes when the PR is done or blocked.
- **No token thresholds.** A chat ends because its work is done. The only size rule is the dispatcher's.
- **Reviewers rely on CI** and don't rerun the suite ([REVIEWING.md](REVIEWING.md)).
- **Never start Fable or Astra as a session.** A builder calls Fable as a subagent for design work ([LANES.md](LANES.md)).
- **Don't write `@codex`** unless you mean to start a Codex task.

## Builders that are not Claude chats

Codex, Gemini, Grok and helpers can't start a Claude reviewer. They open the PR ready for review and stop. The dispatcher sees a yellow PR with no chat and starts a PR-owner chat, which reviews it and fixes the findings.

## Left over from the desk

- Issue #916 and the inbox PR #699 are no longer read. The `desk-board` workflow still writes its table to #916 and its lines to #699; nothing acts on them.
- `desk-gate` still sets its status on every PR. It checks the same review footer that auto-merge reads.
- Nobody files issues, sets tiers, keeps the `anytime` queue at 5 or releases a dead claim. The desk did these. Jarrod starts an issue-writer chat when the ready list runs short.
- The Monday hub digest and rules batch ([FRAMEWORK.md](FRAMEWORK.md) section 10) have no owner yet. Jarrod starts a chat for them when he wants one.
