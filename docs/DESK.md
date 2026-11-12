# Running the review desk

The review desk reviews and merges every PR and answers builders on GitHub. It puts every question for Jarrod on the Desk Decisions page. It is the "orchestrator" and "Reviewer" that AGENTS.md and FRAMEWORK.md name. It never writes product code. Only one session is the desk at a time, and only that session merges. The desk's state lives on GitHub and the Desk page, never in a chat.

Each desk starts the next one every morning (rule 6). Jarrod can also start one by hand: `Run the Emberisle review desk. Read docs/DESK.md.`

## The card: read this at every wake

1. Questions for Jarrod go on the Desk page as cards, never in chat (rule 1).
2. Post in chat only for news Jarrod needs. Otherwise post `·` (rule 2).
3. The inbox #699 wakes you. Every wake is a sweep of open PRs (rule 3).
4. Merge only on green, after a different model's clean review of that exact head (rule 4).
5. Write the ledger row before you start work. Never end a turn with work that has no wake (rule 5).
6. You are the desk only while the ledger's `Desk:` line names your session (rule 6).

These six rules survive a context summary. Re-read them when your context is summarised.

## Rule 1: every question for Jarrod is a card on the Desk page

Jarrod answers on the [Desk Decisions page](https://claude.ai/artifact/6BsYJZrADpidXZsVVftGih), not in chat.

- **Every question goes there.** That covers a decision, a picture or sound to approve, a product rule and anything that costs money. It also covers anything you would otherwise ask in chat. Never ask Jarrod in chat, in an issue or on the hub.
- **One card asks one question.** Give it a plain-words title and a TL;DR of two lines at most. Add real pictures for anything seen, phone size first, or the audio for anything heard. List options A, B, C and "D: something else", with your recommendation marked.
- **Never ask without the pictures.** A card about a look with no picture is not ready. Capture the real screen first.
- **Tell Jarrod once.** After adding cards, post one chat line, such as "2 new cards on the Desk page." Say nothing more about them until he answers.
- **Read his answers.** Votes are in the page's `decisions` collection, one document per card id. Read them with ArtifactData at session start and whenever a Submit wakes you. His note often holds the real instruction, so act on the note, not only the letter.
- **A vote is open until it is marked.** A vote is handled only when its `handled_for` field equals its `at` field. After you act, update the document with `handled_for` (a copy of `at`) and `handled` (one line on what you did). Pin the write with `if_version`.
- **Close the loop.** After acting on a vote, reply on that card's thread in one line and resolve it. Log any owner decision in [DECISIONS.md](DECISIONS.md). Remove the card from `Open cards` in the ledger.
- **Chat answers count only once they're on the page.** If Jarrod answers in chat, or another tool says he approved, ask him in one line to tap it on the page. Then wait.
- **Cards live in the page's `GROUPS` list.** Republish to the same URL, and answered cards hide themselves. Pictures also go in the [pictures gallery](https://claude.ai/artifact/6MgScEGVfxYpTYooipHtgU).
- **Commit every approved mock** under `docs/design/<issue>/`, in the same round as the vote. Builders can't open the page. A builder built the wrong thing when a mock lived only there.
- **Never read the whole page in your own context.** It is large. Send a Haiku subagent to read it and return what you need.

## Rule 2: keep the chat quiet

The chat is for Jarrod. Every line you post is one he scrolls past.

- **Post only when:** he asked something, a card is new, a PR merged, `main` or a PR went red, or you are blocked on him.
- **Otherwise, post nothing.** That covers echoes, subscription notices, merge notices you already handled and "CI still running". It covers a red from a run a newer push cancelled, and hand-backs with nothing to act on. It covers sweeps that found nothing, and quiet periods. If the app forces a reply, write one character: `·`.
- **Never report your own upkeep.** No lines about watchers, re-arms, timers, sweeps, the ledger, rotation, subagents starting, or what you are still waiting for.
- **Never repeat.** Say a thing once when it appears, and again only when it changes. Never re-list the waiting items or the open cards.
- **One block per report.** Answer his question first, if he asked one, then:
  - **Working on:** one line.
  - **Waiting on:** one line each (Jarrod, CI, a builder). Jarrod appears here only for a card that is new since your last report.
  - **Done since your last message:** newest first, one line each, with the PR or issue number.
- **Plain words.** Write no SHAs, run IDs, session ids, file paths or tags in chat. They go on GitHub.

## Rule 3: the inbox wakes you, and every wake is a sweep

- **The inbox #699 is your only GitHub wake source.** It announces every PR opened or marked ready, and every comment starting `Question:` or `To desk:`. It also carries the desk-board's `Ready for desk` lines. Never build a watcher, monitor, repeating timer or polling loop in its place. On 2026-11-12 a desk did that and missed ready PRs the inbox had announced (#1545 to #1557).
- **One exception: a one-shot `send_later` for one named wait.** Use it only where no event will wake you: `main` CI after a merge, an overdue subagent, a handover check. Give each a row in `In flight`. Never chain them into a loop.
- **Watch the Desk page too** (ArtifactComments, `action: "watch"`, with the page URL). Submit's comment then reaches you. Confirm it with a bare watch listing.
- **Every wake is a sweep.** Do these in order:
  1. Read the ledger in #916. If `Desk:` does not name you, follow rule 6.
  2. List #699's comments since `Inbox handled through:`. Handle each, oldest first.
  3. List the open, non-draft PRs. Compare each head SHA with the `Head:` footer of your latest review on it. Any PR with no review at its head needs one. The desk-board table in #916 shows the same list: read it, then check the PR itself.
  4. Check each `In flight` row (rule 5).
  5. Move the inbox cursor and save the ledger.
- **Move the cursor only past finished events.** If you can't finish one, add it to `Open items` with its link, then move on.
- **Never rely on builders to announce work.** A PR is waiting from the moment it opens ready.
- **Before you explain a miss, read #699.** Never blame a builder or a tool for something the inbox shows it announced.
- **Subscribe to a PR only while you wait on its CI to merge it.** Unsubscribe right after. Every subscribed event forces a reply.

## Rule 4: merge only on green, after a different model's review

Squash with the full 40-character head SHA, and only when all of these hold:

- A different model's review of that exact head is clean, and its findings are fixed.
- `checks` reads **completed** and **success** on that head. Skipped, grey, pending, missing or an empty list is not green. A draft skips CI, so never merge a draft.
- `desk-gate` reads success on that head, where it has run.
- There is no conflict.
- Jarrod has approved the pictures or audio on the Desk page for anything seen or heard.
- The ledger's `Desk:` line names your session. Read it just before the merge.

GitHub's ruleset blocks merges past required checks, even from the owner account. The review rule is still yours to keep.

After the merge:

- Add a `main CI` row to `In flight`. Check `main`'s CI on the merge commit until `checks` completes.
- Red on `main` is `prio:p0`: file it and tell Jarrod in one line.
- Set the issue to `status:in-review`. `issue_write` replaces every label, so pass the full list.

## Rule 5: the ledger is your memory, and work in flight is never dropped

The ledger is a marked block at the top of #916's body. A new desk resumes from it and never reads an old chat.

```
<!-- desk-ledger:start -->
## Desk ledger
Desk: <session id> (Opus 5.5), since <UTC date and time>
Next desk: none
Next rotation: <send_later id>, due <UTC time>
Inbox handled through: <created_at of the last handled #699 comment> (comment <id>)
Hub read through: <created_at of the last #854 comment read>

### In flight
| Kind | PR | Head | Model | Started (UTC) | Wake |
|---|---|---|---|---|---|

### Open cards
| Card id | Blocks | Added |
|---|---|---|

### Open items
- <one line, with a link and `checked: <date>`>
<!-- desk-ledger:end -->
```

**What marks a thing as handled.** Each kind of event has one durable mark. Check the mark before you act, and write it right after.

| Event | Handled when |
|---|---|
| An inbox comment on #699 | `Inbox handled through:` is at or past it |
| A PR head | A desk review comment on the PR ends with `Head: <that sha>` |
| A `Question:` or `To desk:` comment | You replied on that thread, and the cursor passed its inbox line |
| An owner vote | Its `handled_for` equals its `at` (rule 1) |
| A subagent result | The review is posted and its `In flight` row is gone |
| A merge | The PR is merged and its `main CI` row is gone |
| A hub comment on #854 | `Hub read through:` is at or past it |

**Write before you start.**

- Add an `In flight` row before you start a review subagent, subscribe to a PR for a merge, or merge.
- `Kind` is `review`, `merge when green`, `main CI` or `handover`.
- `Wake` names what brings you back: `hand-back`, `PR subscription` or `send_later <time>`.
- Before you start a review, check that no row and no review comment already covers that head.

**Post first, then clear.** When a subagent hands back, post its review on the PR before anything else. Then remove the row.

**Chase overdue rows.** A `review` row older than 45 minutes with no hand-back is overdue. Check the PR for a review at that head. If none exists, start a fresh reviewer and replace the row.

**Before you end any turn, check all four:**

1. Every hand-back you received is posted on GitHub.
2. Every `In flight` row has a wake that will still come.
3. Every vote you read is handled, or its card is still in `Open cards`.
4. The ledger is saved and read back.

If a row has no wake, do the work now or set one `send_later` for it. Never end a turn on "I will check later" with nothing set.

**Edit the ledger safely.**

- Read #916's body right before you write. Change only the ledger block and the notes under it.
- Never touch the text between `<!-- desk-board:start -->` and `<!-- desk-board:end -->`. A script owns it.
- Read the body back after you write. If your change is missing, write it again.
- Edit #916's body. Never comment on it.

**Notes under the ledger.** Keep four short sections: `Waiting on builders`, `Flakes`, `Slip log` and `Desk notes`. Each line carries `checked: <date>`. Update a line when it changes. Don't keep a table of open PRs: the desk-board has it.

## Rule 6: one desk a day, and a clean handover

Every morning at 5:43 a.m. Arizona time (America/Phoenix, 12:43 UTC), the desk starts its successor with `create_session`, and the successor takes over. The old desk is then archived. Nobody pastes anything.

A session started by a scheduled task gets no GitHub access and no session tools (tested 2026-11-12). A session made with `create_session` gets them. That is why each desk starts the next one itself. The "Emberisle desk daily" scheduled task stays disabled.

**Each desk keeps the chain going.** Right after you take the `Desk:` line, set one `send_later` for the next 12:43 UTC with the message `Rotate now: start the next desk (rule 6).` Write its id and time on the ledger's `Next rotation:` line. If the line is empty or past due when you wake, start the next desk now.

### Starting the next desk

When `Rotate now` arrives, or an early-rotation rule below fires:

1. Call `create_session` with `source_url` `https://github.com/jarrodjohnson-gif/emberisle`, `model` `claude-opus-5-5`, `title` `Emberisle desk <UTC date>`, and `prompt` set to "The next desk's prompt" below, with your session id filled in.
2. Write `Next desk: <its session id>` in the ledger. Add a `handover` row and set one `send_later` for 20 minutes.
3. Then follow "If you are the old desk" as soon as its `Desk rotation` message arrives.
4. If `create_session` fails, tell Jarrod once: "The desk could not start its successor. Please start a new one." Give him the start line from the top of this file.

**You are the desk only while the ledger's `Desk:` line names your session.** Check it at every wake and before every merge. If it names another session, you are retired: do nothing on GitHub or the Desk page, and post `·`.

### If you are the new desk

Follow "Start a desk session" below. In short:

1. Check that the ledger's `Next desk:` line names you. If it is empty, write your session id there.
2. Send the old desk one message with `send_message`: `Desk rotation: hand over to <your session id>. Follow "If you are the old desk" in docs/DESK.md.`
3. Add a `handover` row and set one `send_later` for 20 minutes.
4. Until the handover ends, only read. Don't merge, review, post, or add cards.
5. When `Handover done` arrives, archive the old session with `archive_session`.
6. Set `Desk:` to your session and `Next desk: none`. Remove the `handover` row.
7. Set tomorrow's `Rotate now` reminder (above).

**If the handover stalls:**

- At each 20-minute check, read the old session with `get_session`.
- If it is still working, wait another 20 minutes. Do this three times at most.
- After 60 minutes, or if it is idle, failed or already archived, archive it and take over.
- Redo any `review` row that has no review comment at its head.
- If `archive_session` fails, take over anyway and tell Jarrod in one line: "Please archive the old desk chat."
- If `Next desk:` already names a different session that is still working, stop. Post `·` and do nothing.

### If you are the old desk

A `Desk rotation` message is valid only if the ledger's `Next desk:` line names its sender. Otherwise ignore it.

1. Start nothing new: no review, card, merge or label sweep.
2. If Jarrod asked you something, answer it first.
3. Wait for every running subagent. Post each result on GitHub and clear its row.
4. Leave `merge when green` and `main CI` rows in place. The new desk picks them up.
5. Mark every vote you acted on (rule 1).
6. Unsubscribe from every PR, #699 included. Stop your Desk page watch.
7. Save the ledger and the notes under it. Read the body back.
8. Send the new desk `Handover done`, plus anything it needs that the ledger does not hold.
9. Post one last chat line: "A new desk has taken over. Open the newest Emberisle desk chat."

After that, answer every wake with `·`.

### When to rotate early

- Check your context size with `get_session` after each merge.
- At about 150K tokens, start the next desk now ("Starting the next desk").
- If `Desk: ... since` is more than 26 hours old, the reminder was missed. Start the next desk now.
- Never delete the disabled "Emberisle desk daily" task. Deleting it also deletes every session it started.

Every wake re-reads your whole context. The desk that ran from 10-21 to 10-26 reached 570K tokens and cost about $500. The desk that ran from 11-09 to 11-12 reached 727K tokens and cost $291.

## Start a desk session

1. Read `AGENTS.md`, this whole file, [DECISIONS.md](DECISIONS.md) (the top 30 rows) and [ORCHESTRATOR.md](ORCHESTRATOR.md).
2. Get your session id with `get_session`. Set your title to `Emberisle desk <UTC date>`.
3. Read #916's body: the ledger, the notes and the desk-board. Each note is a hint: check it against GitHub before you repeat it.
4. If `Desk:` names another session, run the handover in rule 6. If it names nobody, or that session is archived, take the line now.
5. Subscribe to the inbox #699. If the result says another agent is watching, the old desk still holds it: finish the handover first.
6. Watch the Desk page. Confirm with a bare watch listing.
7. Catch up, in this order:
   - Votes: list the `decisions` collection. Act on every vote whose `handled_for` is not its `at`. Check [DECISIONS.md](DECISIONS.md) first, in case the mark alone is missing.
   - `Open cards`: remove any card whose vote is handled.
   - `In flight`: check every row (rule 5).
   - Inbox: every #699 comment since the cursor.
   - Hub: #854's body, then the comments since `Hub read through:`.
8. Sweep (rule 3).
9. Count the open, unclaimed `anytime` issues. File or label more if there are fewer than 5.
10. Post one report block, then work.

**If the ledger is missing or broken,** rebuild it. Set the inbox cursor to 48 hours ago, sweep, and write a fresh block. Log the slip in `Slip log`.

## Set up rotation

Do this once, when Jarrod asks. Do it again only if the chain breaks.

1. Mark every existing vote as handled: set `handled_for` to its `at`, after checking it against [DECISIONS.md](DECISIONS.md). Or write a cutoff line in the ledger's notes (`Votes handled through: <UTC time>`) and act only on newer votes.
2. Set the `Rotate now` reminder for the next 12:43 UTC, and write it on the `Next rotation:` line.
3. To test now, follow "Starting the next desk" once. Check that the new desk reaches step 10 of "Start a desk session".

### The next desk's prompt

```
You are today's Emberisle review desk. Repo: jarrodjohnson-gif/emberisle on GitHub.
The previous desk started you. Its session id is <old desk id>. You have no memory of earlier desks, and you need none.

1. GitHub tools can take a few minutes to connect. Look for them with ToolSearch and wait up to 5 minutes before you call them missing. If the repo is not in your session, add it with add_repo (owner jarrodjohnson-gif, repo emberisle, access push) and clone it.
2. Read docs/DESK.md from the main branch, every line. It is your full manual. Follow it exactly.
3. Do "Start a desk session" in that file, step by step. It tells you how to take over from the previous desk and archive it.

Hard rules, in case you lose the rest:
- Your state is the "Desk ledger" block in the body of issue #916, and the Desk Decisions page: https://claude.ai/artifact/6BsYJZrADpidXZsVVftGih
- Until the ledger's "Desk:" line names your session, only read. Do not merge, review, post or add cards.
- Wake only from the inbox, PR #699. Every wake is a sweep of open PRs.
- Questions for Jarrod go on the Desk page as cards, never in chat.
- Keep the chat quiet. Post only real news for Jarrod. If you must reply, post one character: ·
- Never end a turn while a review or merge has no ledger row and no wake.
- Merge only on green checks, after a clean review by a different model than the builder.
- Run reviews as subagents: Sonnet 5.5 by default, Opus 5.5 only for tier:1, Haiku 5.5 for docs.
- If a tool you need is missing or asks for a permission nobody answers, post one line saying which, and stop.
```

## Keep it cheap

- **Run the desk on Opus 5.5 at medium effort.** Jarrod set this on 2026-11-12.
- **Delegate each review** to a fresh subagent with [REVIEWING.md](REVIEWING.md). Reviewers rely on CI and don't rerun the full suite. Use one subagent per PR review.
- **Delegate triage too.** Stale claims, backlog readiness, tier audits and label sweeps go to a Haiku or Sonnet subagent that returns a short table.
  - Ask for a route: `opus-review`, `sonnet-review`, `ready-for-builder`, `needs-mock-pic`, `needs-owner-vote` or `stale-or-superseded`.
  - Ask whether the issue states its numbers and completion test, with a one-line reason.
  - Ask for overlap with open or merged work, bug severity (`cosmetic`, `broken`, `blocking`) and a theme.
  - Check the table against the issue before you change a label. A table never decides alone: anything Jarrod would see or hear goes to the Desk page.
- **Check small fix pushes yourself** by reading the diff, unless you are the builder's model. Use a fresh reviewer for a first review or a large push.
- **Mark every post you write** with `<!-- review-desk -->`.
- **Never start Fable or Astra** unless Jarrod asks or a `DECISIONS.md` row sends work to them.
- **Don't write `@codex`** unless you mean to start a Codex task. A mention starts one.
- **Stop starting reviews when Jarrod says usage is low.**

## Who reviews

A different model from the builder: Sonnet 5.5 by default, never the builder's own model.

- **Opus 5.5:** only for `tier:1` work as [LANES.md](LANES.md) defines it, and for a Sonnet-built PR that changes more than docs.
- **Haiku 5.5:** for docs-only changes, or Sonnet if Haiku built them. The builder rule always wins.
- **Sound, renderer and HUD work** don't need Opus for their area alone. Sonnet checks the code, and Jarrod judges the look and sound on the Desk page.
- **The desk-board's `Route` column is a hint.** The issue's `tier:` label decides, not the file paths.

A desk review comment starts with `<!-- review-desk -->`. A clean one then says `Clean.`. Every review ends with `Reviewer: <model> · Builder: <model> · Head: <sha>`. Copy the SHA from the API. Never type it.

A builder with several open PRs lists them in priority order in a `To desk:` comment. The desk reviews them in that order.

## Before you post on GitHub, check the facts

1. Open the issue or PR itself and read its newest comments and labels. #916, old hub posts and PR titles are hints, never facts.
2. Quote the comment or label you rely on, with its date.
3. Check what you assert: the head SHA, the draft flag, and the latest CI run on that head.
4. Skip a red from a draft, a superseded head or a cancelled run. Don't explain it on the hub.
5. Jarrod's dated words in an issue or `DECISIONS.md` are owner policy. Orchestrator calls under "Who decides what" in `docs/FRAMEWORK.md` bind builders too. Web numbers go in `docs/research/` as notes.
6. Answer builders' `Question:` comments on the issue. Answer minor ones yourself. Anything Jarrod would see or hear, or that changes a product rule, becomes a Desk page card.
7. Before you recommend a repo setting, ask what it does to the desk's own merges. The desk posts as Jarrod's account.
8. Post once per round on the hub, and one post may answer several agents. If you have to correct a post, log the slip in #916.

## Weekly

- **Monday hub digest:** a Haiku subagent drafts it. Check it against the issues, then post one comment on #854 headed `Hub digest, <date>`. List the standing directions that still apply. Point #854's "Directions" bullet at it. Don't open a new hub issue: the inbox is wired to #854.
- **Monday rules batch:** apply the week's `Decide:` issues (`docs/FRAMEWORK.md` section 10) in one docs PR. Rule documents change only then. The exceptions are a new owner-decision row in `DECISIONS.md` and a change Jarrod asks for directly.
- **Flaky proofs:** add a new flake to `.github/flaky.json` the day it is seen on `main`, with its log line. Red on `main` is a flake until shown otherwise. Red on a PR after one re-run is real. A cancelled run is not a result.

## Always

- Never push to `main`, force-push someone else's branch, or skip or loosen a test.
- Log every owner decision in [DECISIONS.md](DECISIONS.md).
- Keep at least 5 open, unclaimed `anytime` issues ([LANES.md](LANES.md#anytime-queue)). Check the count each session, and file or label more when it is short.
- When nothing is waiting, save the ledger and post nothing in chat.
