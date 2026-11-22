# The flow: builders, signals and the dispatcher

Jarrod set this flow on 2026-11-21. It replaces the review desk. There is no long-running chat that reviews, decides a merge or keeps a ledger.

- **A builder chat owns one issue to the end.** It builds, waits for CI, has a different model review the PR, fixes the findings and stops.
- **GitHub holds the state.** A workflow puts one signal label on every open PR: green, yellow or red.
- **A workflow decides every merge.** Auto-merge squashes a PR that is green and reviewed. No chat decides a merge. The dispatcher only carries out the ones the workflow's token is not allowed to make.
- **The dispatcher only starts chats.** It reads the labels and fills free slots. It never opens a diff or a review.

Where an older document says "the desk", read it this way: a review is your own reviewer subagent, a merge is decided by auto-merge, and a question for Jarrod is the `needs-owner` label.

## Why the desk went

Every chat starts at about 84K tokens before it reads anything, and every wake re-reads the whole chat. The two desks of 2026-11-21 used 153K and 168K just to take over. One stopped reviewing 29 minutes in, the other called for a replacement after 37 minutes, and nine green PRs then sat with no reviewer. 41 of their 53 turns did nothing but answer a wake. A chat that lives for one PR has none of these costs.

## Signals

`scripts/pr-signal.mjs` sets the label after every CI run, push, review comment and label change, and once an hour. Never set a `signal:` label by hand.

| Label | Means | Who acts |
|---|---|---|
| `signal:yellow` | In progress: building, CI running or red, review pending, or findings to fix | The PR's builder chat. If it has none, the dispatcher starts one. |
| `signal:green` | Auto-merge will take it: every rule under [Merging](#merging) holds at the exact head | Auto-merge |
| `signal:red` | Waits for Jarrod: `needs-owner` is on the PR without `owner-ok`, the newest review asks for his look, or the PR is green and reviewed but only he can merge it (a governance file, or `AUTO_MERGE` is off) | Jarrod |

A draft PR gets no signal.

## A builder chat

One chat takes one issue, or one batch of up to three PRs it is told to finish. Pick and claim the issue as [AGENTS.md](../AGENTS.md) and [LANES.md](LANES.md) say. Then:

1. **Build and open the PR**, ready for review, with `Agent: <your agent name>` and your model in the body. Then set your chat's title to `(auto) <your agent name> #<PR number> building` with `set_session_title`. The dispatcher reads only titles, so the title is how it knows your slot is busy.
2. **Wait for CI with `subscribe_pr_activity`.** Never sleep or poll. Fix a red CI.
3. **If the PR changes what a player sees or hears, get the look check first** ("Small look fixes need no card").
4. **When `checks` is green on the head, start one reviewer subagent** with the Agent tool. If the PR will need Jarrod (see "When you need Jarrod" below), add the `needs-owner` label first: a clean review can merge the PR within seconds, and the label is what holds it.
   - Its model is never yours, and never a model that built any part of the PR. Sonnet 5.5 reviews Opus work and Opus 5.5 reviews Sonnet work. Haiku 5.5 may review a docs-only PR.
   - Give it [REVIEWING.md](REVIEWING.md), the PR number and the full head SHA.
   - It posts its review on the PR itself. You never write, edit or delete a review comment.
5. **Fix its findings**, push, wait for green, and start a fresh reviewer on the new head. Do this three times at most.
6. **Stop when the PR is done.** Done means the newest review is clean at the head and `checks` is green there. Set the issue to `status:in-review`, unsubscribe from the PR, post one last line, and end. Auto-merge does the rest.
7. **Set your last title as the very last thing you do.** Keep `(auto) <your agent name> #<PR number>` and change the final word:
   - `done` when the PR is done;
   - `blocked` when you added `needs-owner`;
   - `(auto) <your agent name> nothing eligible` when you found no issue to take.

**When you need Jarrod**, add the `needs-owner` label to the PR and post one comment that starts `Blocked:` or `Question:`, with the options and your recommendation. Add the label as soon as you know, and always before you start the reviewer. A look check that says `small and fine` at your head means you do not need him for the look. On 2026-11-22 a design PR (#1841) merged in the same minute its builder posted two questions for Jarrod, because the label came after the clean review. Do this when:

- the PR changes anything a player sees or hears, and the look check says `big`. Put real screenshots in the PR body first, at the sizes in [REVIEWING.md](REVIEWING.md) plus Jarrod's phone (440x956 and 956x440), or the audio;
- the PR is a design, a mock or a set of options for Jarrod to choose from, even if it is docs only;
- the review still has findings after three rounds;
- the issue needs a design decision ([AGENTS.md](../AGENTS.md) rule 12).

Then finish what does not depend on the answer, unsubscribe and end. The clerk puts your question on the Desk page, and the next chat for that PR picks up his answer. Write the comment so a card can be made from it: one question, plain words, the options, your recommendation, and where the pictures are in the branch.

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
- the newest review comment is clean at that head, and its reviewer differs from its builder. A docs-only PR under 400 changed lines needs only the clean marker;
- `needs-owner` is absent and the newest review does not ask for Jarrod's look, or `owner-ok` is present;
- the PR touches no governance file: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.mcp.json`, `README.md`, the rule documents in `docs/`, `.claude/`, `.github/` apart from `workflows/ci.yml`, and the merge scripts themselves. Jarrod merges those by hand. `ci.yml` is allowed because every new proof is registered there, so the reviewer checks that no job in it was weakened.

Two repo variables switch it off. `AUTO_MERGE` is `on` today; anything else stops all auto-merging, the dispatcher's hand-over merges included: no PR is green then, a PR that would have merged turns red for Jarrod, and `merge-by-chat` comes off. Setting `AUTO_MERGE_CODE` to `off` stops it for code PRs only, and leaves small docs PRs merging. To re-check one PR, run the auto-merge workflow by hand with its number.

**The workflow can't merge a PR that changes `ci.yml`.** GitHub refuses that to a workflow's own token, and every PR that registers a proof changes `ci.yml`. The workflow then labels the PR `merge-by-chat`, and the dispatcher merges it at its next tick. `pr-signal` removes that label as soon as the PR is no longer green. If Jarrod adds a repo secret `AUTO_MERGE_TOKEN` (a token with the workflows permission), the workflow merges these itself and the label is never used.

Red on `main` after a merge is `prio:p0`. The dispatcher starts a builder for it first.

## Jarrod and the Desk page

Jarrod answers in one place: the [Desk Decisions page](https://claude.ai/artifact/6BsYJZrADpidXZsVVftGih). He does not read pull requests, labels or chats. On 2026-11-22 he said: "I need to know what is going on and a central place I can answer questions."

- **Every question for him becomes a card there.** A builder asks on its PR as "A builder chat" says. The clerk turns that into a card.
- **His answer on the page is his word.** The clerk carries it to the PR. Nobody asks him twice, and nobody asks him in chat.
- **The top of the page says what is going on.** The dispatcher writes it at every tick.
- **Rule files still need his merge by hand.** A reviewed, green PR that touches one is red, and its card says "merge this".

### What is stored

The page keeps three things in its database. Read and write them with `ArtifactData` and the page's URL. Never republish the page to add a card.

| Where | What | Who writes it |
|---|---|---|
| `cards/<card id>` | One question | The clerk |
| `decisions/<card id>` | His answer: `choice`, `label`, `note`, `at` | The page |
| `status/now` | `at`, and the lists `building`, `merged`, `problems` | The dispatcher |

A card id is `q<PR or issue number>-<two or three words>`. A card has:

- `title`: the question in plain words, and `why`: one or two short lines, the first starting `TLDR:`;
- `ref` and `href`: the PR or issue; `pr` or `issue`: its number; `head`: the PR's full head SHA when the card was written; `comment`: the id of the comment the card was made from;
- `opts`: two or three real options as `{v, l, d}`, with `rec: true` on the one you recommend. Give `ok: true` to an option only when picking it means "merge this PR as it is". The page adds "D: something else" itself;
- `merge: true` on a card that only asks him to merge a rule-file PR by hand;
- `images`: `[caption, url]` pairs. Upload each picture to the page as an asset and use the url that returns. Phone size first (440x956);
- `added`: the time, as an ISO string.

**One card asks one question.** A PR with two questions gets two cards.

### Three labels say where a red PR stands

| Label | Means | Who acts next |
|---|---|---|
| `on-desk` | Every open question on it has a card. It waits for him | Nobody |
| `answered` | He has answered, and a builder must act on it | The dispatcher sends a builder |
| `no-pictures` | It changes a look and its branch has no pictures | A builder takes them, puts them in the PR body and the branch, and removes the label. A builder that cannot take them removes the label and posts `Blocked:` saying why |

A red PR with none of the three needs a card.

### The clerk

A short Sonnet chat that the dispatcher starts only when there is something to carry. It does three jobs and stops. Its title is `(auto) clerk building`, then `(auto) clerk done`.

1. **Carry answers.** Query `decisions` for documents whose `at` is in the last 7 days. An answer is open when its `handled_for` is not its `at`. For each open answer:
   - read `cards/<id>` for the PR or issue number. An older card has no document: the digits after `q` in its id are the number;
   - if that PR or issue is closed, merged or missing, post nothing: mark the answer handled with the reason, and go on;
   - look for a comment there that starts `Owner answer (Desk page, <at>)` with this answer's `at`. If one exists, an earlier clerk posted it: do not post again;
   - otherwise post one comment that starts `Owner answer (Desk page, <at>):`, then his option's label, then his note word for word. His note is his instruction and wins over the option. "D: something else" with no note means "none of these": say so, and the builder asks again with different options;
   - a `merge: true` card never gets `owner-ok`: the next rule covers it. For any other card, add `owner-ok` only when all four hold: the option he picked has `ok: true`; his note is empty; no other card for the same PR is still unanswered; and the PR's head SHA equals the card's `head`. This is the one case where an agent adds `owner-ok`: it is his tap, carried over;
   - a `merge: true` card needs no builder: when he picks its merge option with an empty note, only mark the answer handled and leave the labels. The PR leaves the list when he merges it;
   - in every other case replace `on-desk` with `answered`, but only once no card for that PR is still unanswered. When you add `owner-ok`, remove `on-desk`;
   - keep every other label the PR has;
   - update the answer with `handled_for` (a copy of `at`) and `handled` (one line on what you did), pinned with `if_version`.
2. **Post new questions.** For each PR the dispatcher names:
   - read its newest `Blocked:` or `Question:` comment. If a card already has that comment's id and no answer yet, an earlier clerk stopped half way: add `on-desk` if it is missing and write no card. If that card has an answer, the question is closed and job 1 carries the answer: treat the PR as having no such comment;
   - if it asks about a look and the branch has no pictures, add `no-pictures`, say so in one comment, and write no card. The exception is a `Blocked:` comment that says the builder could not take pictures: write the card without them and say so in its first line;
   - a red PR with no such comment, or only a closed one, gets one card with `merge: true`: it asks him to merge the PR by hand, with a link, and says in one line why nothing merges it (a rule file, or auto-merge is switched off). If a `merge: true` card for this PR has no answer yet, write nothing and only add `on-desk`;
   - write the card or cards, then add `on-desk`.
3. **Tidy.** Delete the card of any PR that is merged or closed. His answers stay.

The clerk never decides for him, never merges, never edits a PR's code, and never answers a card.

### After his answer

The dispatcher sends a builder to a PR that carries `answered`. That builder removes `answered` first, then does what he said.

- **He picked a design option.** Build or record it. What he chose from pictures and what you built are not the same thing: if a player now sees or hears anything he has not seen, post a new `Question:` with real screenshots, and keep `needs-owner`.
- **Nothing a player sees or hears changed** after his answer (a size limit, a rule, a close, a doc): remove `needs-owner` yourself and say so in one line.
- **Never end with `needs-owner` on and no open question.** Before you stop, either remove `needs-owner` or post a new `Blocked:` or `Question:` comment. A red PR with neither has nothing for him to answer.

### Small look fixes need no card

On 2026-11-22 Jarrod chose: "agents approve bug fixes and small polish", with the note "And then Ask fable". So:

- A builder whose PR changes what a player sees or hears starts a **Fable 5.2 subagent for a look check** before it starts the reviewer. Give it the issue, real screenshots at Jarrod's phone sizes (440x956 and 956x440) and the sizes in [REVIEWING.md](REVIEWING.md), or the audio, and the "Who decides what" table in [FRAMEWORK.md](FRAMEWORK.md).
- **Only the newest look check at the current head counts.** After any push that changes what a player sees, get a new one. A `big` verdict stands: do not ask again to get a different answer.
- Fable posts one comment on the PR itself, starting `Look check:`, with the head SHA, the pictures it looked at, and one of three verdicts:
  - `small and fine`: a real bug fix, or minor UX (wording, spacing, a hint, a missing cue, consistency with something already decided), and it looks right. The PR needs no card and no `needs-owner`.
  - `small, change needed`: say exactly what. The builder fixes it and asks Fable again.
  - `big`: a new screen or flow, a layout change, a new feature, or anything that changes how a turn feels. The builder adds `needs-owner` and asks him.
- The builder never writes or edits a `Look check:` comment, and a look check counts only at the head it names.
- When Fable is unsure, the verdict is `big`.

## The dispatcher

One small chat, on Haiku 5.5. Jarrod starts it at claude.ai/code on the emberisle repo: `Run the Emberisle dispatcher. Read "The dispatcher" in docs/DESK.md.`

It keeps no ledger. Everything it needs is in the open PR list, the chat titles and the Desk page's database.

**Every tick, in this order:**

1. **List the open PRs once**, with only these fields: `number`, `title`, `draft`, `labels`, `updated_at`. Never read a PR body, a diff, a review, #916 or #699.
2. **Merge what the workflow handed over.** For each PR in the list that carries both `signal:green` and `merge-by-chat`: read that one PR's head SHA and labels again, and if both labels are still there, squash-merge it pinned to that SHA. Never merge a PR without both labels, and never add either label yourself. This step is the one exception to "never merge" in AGENTS.md rule 7, and it is yours alone. If the merge is refused, leave it and go on. If the same PR is refused at two ticks, tell Jarrod once in your chat, with its number and the error.
3. **List the chats once**: `list_sessions` with `limit: 30`. Use only rows whose title starts `(auto)` and that are not archived, and from each only the title, `created_at` and `updated_at`. If the call fails or is denied, start nothing this tick, say so once, and go to step 8.
   - A chat is **ended** when its title ends in `done`, `blocked` or `nothing eligible`.
   - A chat is **live** when it is not ended and its `updated_at` is less than 3 hours old. A builder waiting for CI is live: its title still ends in `building`.
   - A chat that is neither is **stale**: it stopped without saying so.
4. **Archive** every stale chat, every `nothing eligible` chat whose `created_at` is 6 or more hours old, and every `done` or `blocked` chat whose `updated_at` is 4 or more hours old. Leave any other chat alone. Never archive your own chat or one whose title does not start `(auto)`.
5. **Find the PRs that need a chat.** In this order:
   - a `signal:red` PR that carries `answered`, with its number in no live chat's title: Jarrod has answered;
   - a `signal:red` PR that carries `no-pictures`, with its number in no live chat's title;
   - a `signal:yellow` PR updated in the last 7 days, with no update for 3 hours, and its number in no live chat's title.

   A red PR that carries `on-desk` waits for him. Never start a chat for it, however recently it changed.
6. **Start work chats, up to the limit.** The limit is **one work chat live at a time**. Jarrod set it on 2026-11-22 ("one builder at a time until the limit resets") and only he changes it. A work chat is a builder or a PR-owner chat. The clerk does not count. While fewer work chats are live than the limit:
   - first, one PR-owner chat for the first PR from step 5 (up to three PRs in one chat when they share a builder);
   - when step 5 found nothing, one builder, in the first slot in the table that is not skipped:

   | Slot | Model | Takes |
   |---|---|---|
   | `claude-opus-a` | `claude-opus-5-5` | one `tier:1` issue, or one `tier:2` issue marked `model:opus` if no `tier:1` issue is eligible |
   | `claude-sonnet-a` | `claude-sonnet-5-5` | one `tier:2` or `tier:3` issue not marked `model:opus` |
   | `claude-sonnet-b` | `claude-sonnet-5-5` | one `tier:2` or `tier:3` issue not marked `model:opus` |

   Skip a slot while a `nothing eligible` chat for it, less than 6 hours old, is in the listing.
7. **Check the Desk page.**
   - Query `decisions` for documents whose `at` is in the last 7 days, and count the ones whose `handled_for` is not their `at`.
   - From the PR list, note every `signal:red` PR that carries none of `on-desk`, `answered` and `no-pictures`, and whose number is in no live chat's title.
   - If either is non-empty and no clerk chat is live in the listing from step 3, start one clerk chat and give it those PR numbers.
   - Write `status/now`: `at`, `building` (one line per live chat, from its title), `merged` (read the old `status/now` first: keep its lines, add the PRs your step 2 merged and any PR named in a chat title ending `done` that is gone from the list, newest first, ten at most), and `problems` (PRs red for more than a day, and anything you told Jarrod). Plain words, no SHAs.
8. **Set the next tick** with one `send_later` for 60 minutes. Then post `·` and end the turn.

**Start chats with `create_session`**, `source_url` `https://github.com/jarrodjohnson-gif/emberisle`, and one of these titles, which the chat then keeps up to date itself: `(auto) <slot> starting` for a builder, `(auto) pr-owner #<number> #<number> building` for a PR-owner chat.

- **Builder prompt:** `Work on Emberisle as builder "<slot>", model <model>. Read AGENTS.md and docs/DESK.md, "A builder chat". Take <the slot's "Takes" cell, word for word>, a prio:p0 first, and follow that section to the end, title changes included. Then stop.`
- **PR-owner prompt:** `You own these open Emberisle PRs until each is done: <numbers>. Your agent name is pr-owner, model <model>. Read AGENTS.md and docs/DESK.md, "A builder chat". For each PR, read its newest comments, then follow steps 2 to 7 of that section. If a PR carries the label answered, remove it first and do what his answer says. If it carries no-pictures, take real screenshots at 440x956, 956x440 and 1280x720, add them to the branch and the PR body, and remove that label. Your title is "(auto) pr-owner" with the PR numbers and a last word of building, then blocked if any PR ended blocked, else done. Take no new issue. Then stop.` Use Opus 5.5 for a PR whose issue is `tier:1`, and Sonnet 5.5 otherwise.
- **Clerk prompt** (model `claude-sonnet-5-5`, title `(auto) clerk building`): `You are the Emberisle clerk. Read "Jarrod and the Desk page" in docs/DESK.md and do the three jobs in "The clerk". PRs that need a card: <numbers, or none>. Then stop.`

**The dispatcher never** reviews, decides a merge, labels, comments on GitHub, writes a card, answers a question, or reads a chat's transcript. It posts in its own chat only when `create_session` fails, once, with the error.

**Its own size.** A tick adds about 8K tokens, most of it the chat listing. When `get_session` shows more than 300K, tell Jarrod once: "Please start a fresh dispatcher," with the start line. Check this once a day, not every tick. If PRs sit yellow for half a day with no chat, the tick chain broke: start a fresh dispatcher.

**Permissions.** The repo's `.claude/settings.json` allows `create_session`, `archive_session`, `send_later`, `get_session` and `send_message`. `list_sessions` and `set_session_title` are not on that list. Only Jarrod changes it. If a tool is denied, say which, once, and carry on. A builder whose title change is denied keeps working under its first title: the slot stays taken while it works, and the dispatcher frees it 3 hours after the chat goes quiet.

## Keep it cheap

- **One chat, one issue.** Never run a builder chat for days ([LANES.md](LANES.md), "Sub-agents and usage limits").
- **No always-on chat subscribes to anything.** A builder subscribes only to its own PR, and unsubscribes when the PR is done or blocked.
- **One work chat at a time** while Jarrod's weekly usage limit shows a warning (dispatcher step 6).
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
