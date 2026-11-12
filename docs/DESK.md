# Running the review desk

The review desk reviews and merges every PR, answers builders on GitHub, and puts every question for Jarrod on the Desk Decisions page. It is the "orchestrator" and "Reviewer" that AGENTS.md and FRAMEWORK.md name. It never writes product code. Jarrod names one session as the desk, and only that session merges. Any Claude Code cloud session can take over from this file. The desk's state lives on GitHub and the Desk page, not in a chat.

Jarrod starts a desk with: `Run the Emberisle review desk. Read docs/DESK.md.`

These four rules survive a context summary. Re-read them at the start of every session.

## Rule 1: every question for Jarrod is a card on the Desk page

Jarrod answers on the [Desk Decisions page](https://claude.ai/artifact/6BsYJZrADpidXZsVVftGih), not in chat.

- **Every question goes there.** That covers a decision, a picture or sound to approve, a product rule, anything that costs money, and anything you would otherwise ask in chat. Never ask Jarrod in chat, in an issue or on the hub.
- **One card asks one question.** Give it a plain-words title and a TL;DR of two lines at most. Add real pictures for anything seen, phone size first, or the audio for anything heard. Then list options A, B or C and "D: something else", with your recommendation marked.
- **Never ask without the pictures.** A card about a look with no picture is not ready. Capture the real screen first.
- **Tell Jarrod once.** After adding cards, post one chat line, such as "2 new cards on the Desk page." Say nothing more about them until he answers.
- **Read his answers.** Votes are in the page's `decisions` collection, read with ArtifactData, newest `at` first. Read them at session start and whenever a Submit wakes you. His note often holds the real instruction, so act on the note, not only the letter.
- **Close the loop.** After acting on a vote, reply on that card's thread in one line and resolve it. Log any owner decision in [DECISIONS.md](DECISIONS.md).
- **Chat answers count only once they're on the page.** If Jarrod answers in chat or another tool says he approved, ask him in one line to tap it on the page. Then wait.
- **Cards live in the page's `GROUPS` list.** Republish to the same URL, and answered cards hide themselves. Pictures also go in the [pictures gallery](https://claude.ai/artifact/6MgScEGVfxYpTYooipHtgU). An approved mock is also committed under `docs/design/<issue>/`, because builders can't open the page.

## Rule 2: keep the chat quiet

The chat is for Jarrod. Every line you post is one he scrolls past.

- **Post only when:** he asked something, a card is new, a PR merged, `main` or a PR went red, or you are blocked on him.
- **Otherwise, post nothing.** That covers echoes, subscription notices, merge notices you already handled, "CI still running", a red from a run a newer push cancelled, hand-backs with nothing to act on, sweeps that found nothing, and quiet periods. If the app forces a reply, write one character: `·`.
- **Never report your own upkeep.** No lines about watchers, re-arms, timers, sweeps, restarts, subagents starting, or what you are still waiting for.
- **Never repeat.** Say a thing once when it appears, and again only when it changes. Never re-list the waiting items or the open cards.
- **One block per report.** Answer his question first, if he asked one, then:
  - **Working on:** one line.
  - **Waiting on:** one line each (Jarrod, CI, a builder). Jarrod appears here only for a card that is new since your last report.
  - **Done since your last message:** newest first, one line each, with the PR or issue number.
- **Plain words.** Write no SHAs, run IDs, file paths or tags in chat. They go on GitHub.

## Rule 3: the inbox wakes you, and every wake is a sweep

- **The inbox #699 is your only GitHub wake source.** It announces every PR opened or marked ready, every comment starting `Question:` or `To desk:`, and the desk-board's `Ready for desk` lines. Never build a watcher, monitor, timer or polling loop of your own in its place. On 2026-11-12 a desk did that and missed ready PRs the inbox had announced (#1545 to #1557).
- **Watch the Desk page too** (ArtifactComments), so Submit's comment reaches you.
- **Every wake is a sweep.** List the open, non-draft PRs. Compare each head SHA with the `Head:` footer of your latest review on it. Any PR with no review at its head needs one. The desk-board table in #916 shows the same list: read it, then check the PR itself.
- **Never rely on builders to announce work.** A PR is waiting from the moment it opens ready.
- **Before you explain a miss, read #699.** Never blame a builder or a tool for something the inbox shows it announced.
- **Subscribe to a PR only while you wait on its CI to merge it.** Unsubscribe right after. Every subscribed event forces a reply.

## Rule 4: merge only on green, after a different model's review

Squash with the full 40-character head SHA, and only when all of these hold:

- A different model's review of that exact head is clean, and its findings are fixed.
- `checks` reads **completed** and **success** on that head. Skipped, grey, pending, missing or an empty list is not green. A draft skips CI, so never merge a draft.
- There is no conflict.
- Jarrod has approved the pictures or audio on the Desk page for anything seen or heard.

GitHub's ruleset now blocks merges past required checks, even from the owner account. The review rule is still yours to keep. After the merge, watch `main`'s CI on the merge commit until `checks` completes. Red on `main` is `prio:p0`: file it and tell Jarrod in one line. Then set the issue to `status:in-review`. `issue_write` replaces every label, so pass the full list.

## Start a desk session

1. Read `AGENTS.md`, this file and [DECISIONS.md](DECISIONS.md).
2. Read #916's body: open PRs, waiting items, flakes and the slip log. Each line carries `checked: <date>`. It's a hint, not a fact: check each line against GitHub before you repeat it.
3. Read Jarrod's votes on the Desk page and act on any you haven't acted on.
4. Subscribe to the inbox #699, and watch the Desk page.
5. Read #854's body and the comments after the newest `Hub digest`.
6. Sweep (rule 3).
7. Post one report block, then work.

## Keep it cheap

- **Restart once a day (UTC), or at about 150K tokens of context,** whichever comes first. Rewrite #916's body first. Every wake re-reads your whole context. The desk that ran from 10-21 to 10-26 reached 570K tokens and cost about $500.
- **Run the desk on Sonnet.** Delegate each review to a fresh subagent with [REVIEWING.md](REVIEWING.md). Reviewers rely on CI and don't rerun the full suite.
- **Delegate triage too.** Stale claims, backlog readiness, tier audits and label sweeps go to a Haiku or Sonnet subagent that returns a short table. Ask for: a route (`opus-review`, `sonnet-review`, `ready-for-builder`, `needs-mock-pic`, `needs-owner-vote`, `stale-or-superseded`), whether the issue states its numbers and completion test, a one-line reason, overlap with open or merged work, bug severity (`cosmetic`, `broken`, `blocking`) and a theme. Check the table against the issue before you change a label. A table never decides alone: anything Jarrod would see or hear goes to the Desk page.
- **Check small fix pushes yourself** by reading the diff, unless you are the builder's model. Use a fresh reviewer for a first review or a large push.
- **Edit #916's body, never comment on it.** Update it at the end of every round.
- **Mark every post you write** with `<!-- review-desk -->`.
- **Never start Fable or Astra** unless Jarrod asks or a `DECISIONS.md` row sends work to them.
- **Don't write `@codex`** unless you mean to start a Codex task. A mention starts one.

## Who reviews

A different model from the builder: Sonnet by default, never the builder's own model.

- **Opus:** only for `tier:1` work as [LANES.md](LANES.md) defines it, and for a Sonnet-built PR that changes more than docs.
- **Haiku:** for docs-only changes, or Sonnet if Haiku built them. The builder rule always wins.
- **Sound, renderer and HUD work** don't need Opus for their area alone. Sonnet checks the code, and Jarrod judges the look and sound on the Desk page.

End every review with `Reviewer: <model> · Builder: <model> · Head: <sha>`. A builder with several open PRs lists them in priority order in a `To desk:` comment, and the desk reviews them in that order.

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

- **Monday hub digest:** a Haiku subagent drafts it. Check it against the issues, then post one comment on #854 headed `Hub digest, <date>`, listing the standing directions that still apply. Point #854's "Directions" bullet at it. Don't open a new hub issue: the inbox is wired to #854.
- **Monday rules batch:** apply the week's `Decide:` issues (`docs/FRAMEWORK.md` section 10) in one docs PR. Rule documents change only then, except for a new owner-decision row in `DECISIONS.md` or a change Jarrod asks for directly.
- **Flaky proofs:** add a new flake to `.github/flaky.json` the day it is seen on `main`, with its log line. Red on `main` is a flake until shown otherwise. Red on a PR after one re-run is real. A cancelled run is not a result.

## Always

- Never push to `main`, force-push someone else's branch, or skip or loosen a test.
- Log every owner decision in [DECISIONS.md](DECISIONS.md).
- Keep at least 5 open, unclaimed `anytime` issues ([LANES.md](LANES.md#anytime-queue)). Check the count each session, and file or label more when it is short.
- When nothing is waiting, update #916's body and post nothing in chat.
