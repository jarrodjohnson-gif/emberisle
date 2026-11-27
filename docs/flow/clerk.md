# The clerk and the Desk page

The map is [`../DESK.md`](../DESK.md).

## Jarrod and the Desk page

Jarrod answers in one place: the [Desk Decisions page](https://claude.ai/artifact/6BsYJZrADpidXZsVVftGih). He does not read pull requests, labels or chats. On 2026-11-22 he said: "I need to know what is going on and a central place I can answer questions."

- **Every question for him becomes a card there.** A builder asks on its PR, or on the issue when there is no PR yet ([`builder.md`](builder.md), "When you need Jarrod"). The clerk makes the card.
- **His answer on the page is his word.** The clerk carries it to the PR or issue. Nobody asks him twice, or in a chat.
- **The top of the page says what is going on.** The dispatcher writes it at every tick.
- **Rule files still need his yes.** A reviewed, green PR that touches one is red. Its card asks "merge this?". While auto-merge is on, his tap merges it.

## What is stored

The page keeps three things in its database. Read and write them with `ArtifactData` and the page's URL. Never republish the page to add a card.

| Where | What | Who writes it |
|---|---|---|
| `cards/<card id>` | One question | The clerk, or the planner for an issue |
| `decisions/<card id>` | His answer: `choice`, `label`, `note`, `at` | The page. The clerk adds `handled_for`, `handled`, `comment`, `log` and `logged` |
| `status/now` | `at`, and the lists `building`, `merged`, `problems` | The dispatcher |

A card id is `q<PR or issue number>-<two or three words>`. A card has:

- `title`: the question in plain words. `why`: one or two short lines, the first starting `TLDR:`.
- `ref` and `href`: the PR or issue. `pr` or `issue`: its number.
- `head`: the PR's full head SHA when the card was written. Every card for a PR carries it.
- `comment`: the id of the comment the card was made from.
- `opts`: two or three real options as `{v, l, d}`, with `rec: true` on the one you recommend.
- `ok: true` on an option only when picking it means "merge this PR as it is". The page adds "D: something else" itself.
- `merge: true` on a card that only asks him whether to merge a rule-file PR.
- `images`: `[caption, url]` pairs. Upload each picture to the page as an asset, and use the url that returns. Phone size first (440x956).
- `added`: the time, as an ISO string.

**One card asks one question.** A PR with two questions gets two cards.

## Three labels say where a red PR stands

| Label | Means | Who acts next |
|---|---|---|
| `on-desk` | Every open question on it has a card. It waits for him | Nobody |
| `answered` | He has answered, and a builder must act on it | The dispatcher sends a chat |
| `no-pictures` | It changes a look, and its branch has no pictures | A chat takes them, puts them in the PR body and the branch, and removes the label. A chat that cannot take them removes the label and posts `Blocked:` saying why |

A red PR with none of the three needs the clerk. The same labels work on an issue.

## The clerk

A short Sonnet chat. The dispatcher starts it only when there is something to carry. It does four jobs and stops.

**Rules for every job:**

- Add and remove labels one at a time. Never send the whole label list.
- Never touch a `signal:` label.
- Keep every label you were not told to change.
- Never decide for him, merge, edit a PR's code, or answer a card.
- The decisions log in job 4 is the only file you change.

### 1. Carry answers

Query `decisions` for documents whose `at` is in the last 7 days. An answer is open when its `handled_for` is not its `at`. For each open answer:

1. Read `cards/<id>` for the PR or issue number. An older card has no document: the digits after `q` in its id are the number.
2. If that PR or issue is closed, merged or missing, post nothing. Mark the answer handled with the reason, and go on.
3. Look for a comment there that starts `Owner answer (Desk page, <at>)` with this answer's `at`. If one exists, an earlier clerk posted it. Do not post again.
4. Otherwise post one comment that starts `Owner answer (Desk page, <at>):`. Then give his option's label, then his note word for word.
   - His note is his instruction, and it wins over the option.
   - "D: something else" with no note means "none of these". Say so: the builder asks again with different options.
5. Pick the labels:
   - **A `merge: true` card** never gets `owner-ok`.
     - Act on it only when he picked its merge option with an empty note.
     - Read the PR's head SHA once.
     - If it equals the card's `head`, end your comment with `<!-- owner-merge: <that SHA> -->`. Then add `owner-merge`, and remove `on-desk`.
     - If the head has moved, add nothing. Remove `on-desk`, so job 2 writes a fresh card.
     - If the PR is already merged, only mark the answer handled.
     - If he picked `A: merged it` on a switched-off card, only mark the answer handled: he merged it on GitHub, and no builder has anything to do.
     - Never add `owner-merge` when the option he picked has no `ok: true`.
   - **Any other card** gets `owner-ok` only when all four hold:
     - the option he picked has `ok: true`;
     - his note is empty;
     - no other card for the same PR is still unanswered;
     - the PR's head SHA equals the card's `head`.
     Then end your `Owner answer` comment with `<!-- owner-ok: <that SHA> -->`, and add the label after the comment is posted. Without that marker for the head, auto-merge reads the label as absent. This is the one case where an agent adds `owner-ok`: it is his tap, carried over. Then remove `on-desk`.
   - **In every other case,** replace `on-desk` with `answered`. Do this only once no card for that PR or issue is still unanswered.
6. Update the answer with `handled_for` (a copy of `at`), `handled` (one line on what you did) and `comment` (the card's `comment`). Pin it with `if_version`. Tidy may then delete the card.
7. In the same update, set `log: true` when his answer is a standing rule. See "Which answers are standing rules" below.

### 2. Post new questions

For each PR or issue the dispatcher names:

1. Read its newest `Blocked:` or `Question:` comment.
   - If a card already has that comment's id and no answer yet, an earlier clerk stopped half way. Add `on-desk` if it is missing, and write no card.
   - If a card with that comment's id has an answer, or a decision carries that comment's id, the question is closed. Treat the PR as having no such comment. Tidy deletes answered cards, so check `decisions` too.
2. If it asks about a look and the branch has no pictures, add `no-pictures`. Say so in one comment, and write no card.
   - The exception is a `Blocked:` comment that says the builder could not take pictures. Write the card without them, and say so in its first line.
3. If it is `Blocked: CI run needs approval` on a fork PR, write one card.
   - It links the PR's checks page and asks him to press "Approve and run".
   - Its options are `A: approved it` and `B: close the PR`. Neither has `ok: true`.
4. A red PR with no open question:
   - **Red for a rule file or a switched-off auto-merge:** `needs-owner` is absent, and the newest review is clean at the head. Write one card with `merge: true`.
     - It links the PR, carries its `head`, and says in one line why it needs his yes.
     - Its first option is `A: merge it` with `ok: true`.
     - When either auto-merge switch is off, his tap can't merge it. The first option is then `A: merged it`, with no `ok: true`. The card tells him to press Merge on GitHub.
     - If a `merge: true` card for this PR has no answer yet, write nothing. Only add `on-desk`.
   - **Red for any other reason:** add `answered`, and write no card. The next chat removes `needs-owner` or asks again (#1602 on 2026-11-22).
5. Write the card or cards, then add `on-desk`.

### 3. Tidy

1. Delete the card of any PR or issue that is merged or closed.
2. Delete any card whose answer is handled and carries `comment`. His answers stay in `decisions`. An older handled answer without `comment` keeps its card until its PR closes.
3. If a `clerk/decisions-log` PR closed without merging, he turned those rows down. Set `log: false` on the decisions that name it.

### 4. Log his decisions

Query `decisions` for documents with `log: true` and no `logged` field. If there are none, skip this job. Otherwise:

1. Find the branch.
   - If a PR from the branch `clerk/decisions-log` is open, add to it.
   - If none is open, and the branch exists and is ahead of main, open the PR from it.
   - Otherwise start the branch from main.
2. If a decision's card id is already in that PR's rows, add no row for it. An earlier clerk stopped half way. Still set its `logged` in step 5.
3. Add one row per decision at the top of the table in `docs/DECISIONS.md`.
   - A row has the date, the rule in one bold sentence, his note in quotes, and the card id.
   - If the note is empty, quote his option's label.
   - Change nothing else in the file, and no other file.
4. Open the PR ready for review. Its body is `Agent: clerk`, `Model: claude-sonnet-5-5`, and one line per decision with its card id. It has no issue and no claim.
5. Set `logged` to the PR's number on every decision this job found. That includes the ones whose row was already there.

Then it is a PR like any other. The dispatcher sends a chat to get it reviewed. Once it is red, job 2 gives it a `merge: true` card. One PR holds every decision until he merges it. New rows move its head, so it is reviewed again and gets a fresh card.

**Which answers are standing rules.** A standing rule outlasts the one PR or issue it was asked on. Later work must follow it.

- Yes: "release all three, and let any claim expire after 48 quiet hours". Every later claim follows it.
- Yes: "one builder at a time until the limit resets". Every dispatcher tick follows it.
- Yes: a raised size ceiling, a standing permission, or a design choice for a whole screen.
- No: "A: merge it" on a rule-file PR. It ends with that merge.
- No: "A: close as replaced" on one PR, or a look he approved on one PR.

### End

1. Set your title to `(auto) clerk done`.
2. Last, if `get_session` shows a `parent_session_id`, send that chat `tick` with `send_message`.
