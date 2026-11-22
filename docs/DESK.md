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
3. **When `checks` is green on the head, start one reviewer subagent** with the Agent tool. If the PR will need Jarrod (see "When you need Jarrod" below), add the `needs-owner` label first: a clean review can merge the PR within seconds, and the label is what holds it.
   - Its model is never yours, and never a model that built any part of the PR. Sonnet 5.5 reviews Opus work and Opus 5.5 reviews Sonnet work. Haiku 5.5 may review a docs-only PR.
   - Give it [REVIEWING.md](REVIEWING.md), the PR number and the full head SHA.
   - It posts its review on the PR itself. You never write, edit or delete a review comment.
4. **Fix its findings**, push, wait for green, and start a fresh reviewer on the new head. Do this three times at most.
5. **Stop when the PR is done.** Done means the newest review is clean at the head and `checks` is green there. Set the issue to `status:in-review`, unsubscribe from the PR, post one last line, and end. Auto-merge does the rest.
6. **Set your last title as the very last thing you do.** Keep `(auto) <your agent name> #<PR number>` and change the final word:
   - `done` when the PR is done;
   - `blocked` when you added `needs-owner`;
   - `(auto) <your agent name> nothing eligible` when you found no issue to take.

**When you need Jarrod**, add the `needs-owner` label to the PR and post one comment that starts `Blocked:` or `Question:`, with the options and your recommendation. Add the label as soon as you know, and always before you start the reviewer. On 2026-11-22 a design PR (#1841) merged in the same minute its builder posted two questions for Jarrod, because the label came after the clean review. Do this when:

- the PR changes anything a player sees or hears. Put real screenshots in the PR body first, at the sizes in [REVIEWING.md](REVIEWING.md) plus Jarrod's phone (440x956 and 956x440), or the audio;
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
- `ref` and `href`: the PR or issue, and `pr` or `issue`: its number;
- `opts`: two or three real options as `{v, l, d}`, with `rec: true` on the one you recommend. Give `ok: true` to an option only when picking it means "merge this PR as it is". The page adds "D: something else" itself;
- `images`: `[caption, url]` pairs. Upload each picture to the page as an asset and use the url that returns. Phone size first (440x956);
- `added`: the time, as an ISO string.

**One card asks one question.** A PR with two questions gets two cards. **A card about a look has pictures**, taken from the PR's branch; if the PR has none, the clerk says so on the PR, leaves `on-desk` off, and a builder adds them first.

### The clerk

A short Sonnet chat that the dispatcher starts only when there is something to carry. It does two jobs and stops.

1. **Carry answers.** Query `decisions` for documents whose `at` is in the last 48 hours. An answer is open when its `handled_for` is not its `at`. For each open answer:
   - read `cards/<id>` for the PR or issue number. An older card has no document: the digits after `q` in its id are the number;
   - post one comment there that starts `Owner answer (Desk page, <at>):`, then his option's label, then his note word for word. His note is his instruction and wins over the option;
   - if the option he picked has `ok: true`, add the `owner-ok` label, keeping every label the PR has. This is the one case where an agent adds `owner-ok`: it is his tap, carried over;
   - remove the `on-desk` label;
   - update the answer with `handled_for` (a copy of `at`) and `handled` (one line on what you did), pinned with `if_version`.
2. **Post new questions.** For each PR the dispatcher names (red, with no `on-desk` label): read its newest `Blocked:` or `Question:` comment, write the card or cards, and add the `on-desk` label, keeping every label the PR has. A red PR with no such comment touches a rule file: its one card asks him to merge it, with a link.

The clerk never decides for him, never merges, never edits a PR's code, and never answers a card. Its title is `(auto) clerk building`, then `(auto) clerk done`.

**After an answer**, the PR has changed, so the dispatcher sends a builder back to it at the next tick. A builder that has applied his answer exactly, and shows him nothing new, removes `needs-owner` itself and says so in one line. Anything new he would see goes back to the page as a new card.

## The dispatcher

One small chat, on Haiku 5.5. Jarrod starts it at claude.ai/code on the emberisle repo: `Run the Emberisle dispatcher. Read "The dispatcher" in docs/DESK.md.`

It keeps no ledger. Everything it needs is in the open PR list, the chat titles and the Desk page's database.

**Every tick, in this order:**

1. **List the open PRs once**, with only these fields: `number`, `title`, `draft`, `labels`, `updated_at`. Never read a PR body, a diff, a review, #916 or #699.
2. **Merge what the workflow handed over.** For each PR in the list that carries both `signal:green` and `merge-by-chat`: read that one PR's head SHA and labels again, and if both labels are still there, squash-merge it pinned to that SHA. Never merge a PR without both labels, and never add either label yourself. This step is the one exception to "never merge" in AGENTS.md rule 7, and it is yours alone. If the merge is refused, leave it and go on. If the same PR is refused at two ticks, tell Jarrod once in your chat, with its number and the error.
3. **Check the Desk page.** Query `decisions` for documents whose `at` is in the last 48 hours, and count the ones whose `handled_for` is not their `at`. From the PR list, note every `signal:red` PR without the `on-desk` label. If either list is non-empty and no clerk chat is live, start one clerk chat (see "The clerk") and give it the PR numbers. Then write `status/now`: `at`, `building` (one line per live chat, from its title), `merged` (titles of PRs that left the list since your last tick), and `problems` (PRs red for more than a day, and anything you told Jarrod). Plain words, no SHAs.
4. **List the chats once**: `list_sessions` with `limit: 30`. Use only rows whose title starts `(auto)` and that are not archived, and from each only the title, `created_at` and `updated_at`. If the call fails or is denied, start nothing this tick, say so once, and go to step 8.
   - A chat is **ended** when its title ends in `done`, `blocked` or `nothing eligible`.
   - A chat is **live** when it is not ended and its `updated_at` is less than 3 hours old. A builder waiting for CI is live: its title still ends in `building`.
   - A chat that is neither is **stale**: it stopped without saying so.
5. **Archive** every stale chat, every `nothing eligible` chat whose `created_at` is 6 or more hours old, and every `done` or `blocked` chat whose `updated_at` is 4 or more hours old. Four hours is past the 3-hour window in step 5, so archiving a chat never turns its own PR into an orphan. Leave any other chat alone. Never archive your own chat or one whose title does not start `(auto)`.
6. **Send help to orphans.** An orphan is a `signal:yellow` PR updated in the last 7 days, with no update for 3 hours, whose number is in no live chat's title. A `signal:red` PR is an orphan too when it was updated in the last 3 hours and no chat left in the listing after step 5, live or ended, has its number in its title: nobody has worked on it since Jarrod's answer. Start one PR-owner chat for up to three orphans, and two such chats per tick at most.
7. **Fill the builder slots.** There are three. A slot is taken while a live chat's title names it.

   | Slot | Model | Takes |
   |---|---|---|
   | `claude-opus-a` | `claude-opus-5-5` | one `tier:1` issue, or one `tier:2` issue marked `model:opus` if no `tier:1` issue is eligible |
   | `claude-sonnet-a` | `claude-sonnet-5-5` | one `tier:2` or `tier:3` issue not marked `model:opus` |
   | `claude-sonnet-b` | `claude-sonnet-5-5` | one `tier:2` or `tier:3` issue not marked `model:opus` |

   Start a builder in every slot that is not taken. One exception: leave a slot empty while a `nothing eligible` chat for it, less than 6 hours old, is in the listing. PR-owner chats never take a builder slot.
8. **Set the next tick** with one `send_later` for 60 minutes. Then post `·` and end the turn.

**Start chats with `create_session`**, `source_url` `https://github.com/jarrodjohnson-gif/emberisle`, and one of these titles, which the chat then keeps up to date itself: `(auto) <slot> starting` for a builder, `(auto) pr-owner #<number> #<number> building` for a PR-owner chat.

- **Builder prompt:** `Work on Emberisle as builder "<slot>", model <model>. Read AGENTS.md and docs/DESK.md, "A builder chat". Take <the slot's "Takes" cell, word for word>, a prio:p0 first, and follow that section to the end, title changes included. Then stop.`
- **PR-owner prompt:** `You own these open Emberisle PRs until each is done: <numbers>. Your agent name is pr-owner, model <model>. Read AGENTS.md and docs/DESK.md, "A builder chat". For each PR, read its newest comments, then follow steps 2 to 6 of that section. Your title is "(auto) pr-owner" with the PR numbers and a last word of building, then blocked if any PR ended blocked, else done. Take no new issue. Then stop.` Use Opus 5.5 for a PR whose issue is `tier:1`, and Sonnet 5.5 otherwise.
- **Clerk prompt** (model `claude-sonnet-5-5`, title `(auto) clerk building`): `You are the Emberisle clerk. Read "Jarrod and the Desk page" in docs/DESK.md and do both jobs in "The clerk". PRs that need a card: <numbers, or none>. Then stop.`

**The dispatcher never** reviews, decides a merge, labels, comments on GitHub, writes a card, answers a question, or reads a chat's transcript. It posts in its own chat only when `create_session` fails, once, with the error.

**Its own size.** A tick adds about 8K tokens, most of it the chat listing. When `get_session` shows more than 300K, tell Jarrod once: "Please start a fresh dispatcher," with the start line. Check this once a day, not every tick. If PRs sit yellow for half a day with no chat, the tick chain broke: start a fresh dispatcher.

**Permissions.** The repo's `.claude/settings.json` allows `create_session`, `archive_session`, `send_later`, `get_session` and `send_message`. `list_sessions` and `set_session_title` are not on that list. Only Jarrod changes it. If a tool is denied, say which, once, and carry on. A builder whose title change is denied keeps working under its first title: the slot stays taken while it works, and the dispatcher frees it 3 hours after the chat goes quiet.

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
