# A builder chat

This is everything a builder or PR-owner chat needs from the flow. The map is [`../DESK.md`](../DESK.md). Claim rules are in [`../LANES.md`](../LANES.md#picking-an-issue), "Picking an issue". Before you build, search [`../DECISIONS.md`](../DECISIONS.md) and [`../DECISIONS-archive.md`](../DECISIONS-archive.md) for your issue's files and words.

One chat takes one issue, or one batch of up to three PRs it is told to finish. Pick and claim the issue as [AGENTS.md](../../AGENTS.md) and [LANES.md](../LANES.md) say. Then:

1. **Build and open the PR**, ready for review, with `Agent: <your agent name>` and `Model: <your model>` in the body. Then set your chat's title to `(auto) <your agent name> #<PR number> building` with `set_session_title`. The dispatcher reads only titles, so the title is how it knows your slot is busy.
2. **Wait for CI with `subscribe_pr_activity`.** Never sleep or poll. Fix a red CI.
3. **If the PR changes what a player sees or hears, get the look check first** ([Small look fixes need no card](#small-look-fixes-need-no-card)).
4. **When `checks` is green on the head, start one reviewer subagent** with the Agent tool.
   - If the PR will need Jarrod ([When you need Jarrod](#when-you-need-jarrod)), add the `needs-owner` label first. A clean review can merge the PR within seconds, and the label is what holds it.
   - Its model is never yours, and never a model that built any part of the PR. Sonnet 5.5 reviews Opus work, and Opus 5.5 reviews Sonnet work. Haiku 5.5 may review a docs-only PR.
   - Give it [REVIEWING.md](../REVIEWING.md), the PR number and the full head SHA.
   - It posts its review on the PR itself. You never write, edit or delete a review comment.
5. **Fix its findings**, push, wait for green, and start a fresh reviewer on the new head. Do this three times at most.
6. **Stop when the PR is done.** Done means the newest review is clean at the head, and `checks` is green there. Set the issue to `status:in-review`, unsubscribe from the PR, and post one last line.
7. **Set your last title.** Keep `(auto) <your agent name> #<PR number>` and change the last word:
   - `done` when the PR is done;
   - `blocked` when you added `needs-owner`;
   - `(auto) <your agent name> nothing eligible` when you found no issue to take.
8. **Then wake the dispatcher, as the very last thing you do.** If the dispatcher started you and `get_session` shows a `parent_session_id`, send that chat the one word `tick` with `send_message`. It starts the next chat at once. If the call is denied, or there is no parent, skip it: the hourly tick still comes.

## Labels

- Add and remove labels one at a time. Never send a PR's or an issue's whole label list: that wipes the others (#1341).
- Never touch a `signal:` label. `scripts/pr-signal.mjs` sets it.
- Never add `owner-ok` or `owner-merge`. Only the clerk adds them, carrying Jarrod's tap.

## When you need Jarrod

Add the `needs-owner` label to the PR, and post one comment on the PR that starts `Blocked:` or `Question:`. With no PR yet, add `needs-owner` to the issue and post the comment there. Add the label as soon as you know, and always before you start the reviewer. On 2026-11-22 a design PR (#1841) merged in the same minute its builder posted two questions, because the label came after the clean review.

Ask him when:

- the look check says `big`. Put real screenshots in the PR body first, at the sizes in [REVIEWING.md](../REVIEWING.md) and at his phone sizes (440x956 and 956x440), or the audio;
- the PR is a design, a mock or a set of options for him to choose from, even if it is docs only;
- the review still has findings after three rounds;
- the issue needs a design decision ([AGENTS.md](../../AGENTS.md) rule 12).

Write the comment so a card can be made from it: one question, plain words, the options, your recommendation, and where the pictures are in the branch. Then finish what does not depend on the answer, unsubscribe and end. The clerk puts your question on the Desk page. The next chat for that PR picks up his answer.

## After his answer

The dispatcher sends a chat to a PR that carries `answered`. That chat removes `answered` first, then does what he said.

- **He picked a design option.** Build or record it. If a player now sees or hears anything he has not seen, post a new `Question:` with real screenshots, and keep `needs-owner`.
- **Nothing a player sees or hears changed** after his answer (a size limit, a rule, a close, a doc): remove `needs-owner` yourself and say so in one line.
- **Never end with `needs-owner` on and no open question.** Before you stop, either remove `needs-owner` or post a new `Blocked:` or `Question:`. A red PR with neither has nothing for him to answer.

## Small look fixes need no card

On 2026-11-22 Jarrod chose "agents approve bug fixes and small polish", with the note "And then Ask fable". So:

- A PR that changes what a player sees or hears gets a **Fable 5.2 subagent for a look check** before the reviewer. Give it the issue, real screenshots at 440x956, 956x440 and the sizes in [REVIEWING.md](../REVIEWING.md), or the audio, and the "Who decides what" table in [FRAMEWORK.md](../FRAMEWORK.md).
- **Only the newest look check at the current head counts.** After any push that changes what a player sees, get a new one. A `big` verdict stands: do not ask again to get a different answer.
- Fable posts one comment on the PR, starting `Look check:`, with the head SHA, the pictures it looked at, and one verdict:
  - `small and fine`: a real bug fix, or minor UX (wording, spacing, a hint, a missing cue, consistency with something already decided), and it looks right. The PR needs no card and no `needs-owner`.
  - `small, change needed`: it says exactly what. Fix it and ask Fable again.
  - `big`: a new screen or flow, a layout change, a new feature, or anything that changes how a turn feels. Add `needs-owner` and ask him.
- When Fable is unsure, the verdict is `big`.
- You never write or edit a `Look check:` comment.

## The review comment

The reviewer subagent posts one comment per review, in this shape. The gate and auto-merge read it, so the shape is exact.

```
<!-- review-desk -->
Clean.
<!-- review-desk: clean <full 40-character head SHA> -->
Reviewer: <model> · Builder: <model> · Head: <full 40-character head SHA>
```

A review with blocking findings lists them, each with `file:line`, in place of the `Clean.` and marker lines. It keeps the first and last lines. Copy the SHA from the API, never type it.

## Fork PRs

CI does not run on a PR from a fork until Jarrod approves the run. If a fork PR has no `checks` run at its head:

1. Add `needs-owner` to the PR.
2. Post `Blocked: CI run needs approval`, with a link to the PR's checks page.
3. Set your title to `blocked` and end. The clerk writes an "approve the run" card.

## Builders that are not Claude chats

Codex, Gemini, Grok and helpers can't start a Claude reviewer. They open the PR ready for review and stop. The dispatcher sees a yellow PR with no chat and starts a PR-owner chat. That chat reviews it and fixes the findings.

## Never

- merge, or add `owner-ok` or `owner-merge`;
- change `docs/DECISIONS.md`, unless your PR also changes another rule document. Only Jarrod can merge a PR that touches it, so one line there holds your whole PR. The clerk logs his decisions ([`clerk.md`](clerk.md), job 4). If a PR you own already changes it, put main's copy back and say so in one line. The clerk's `clerk/decisions-log` PR is the exception: there you review and fix only, and never remove a row. While that PR is open, its rows count as decisions too;
- read #854 when the dispatcher started you;
- start a session;
- keep a chat alive to wait for a merge or for Jarrod.
