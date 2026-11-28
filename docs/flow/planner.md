# The planner

The map is [`../DESK.md`](../DESK.md).

Builders are only as good as the issues they are handed. The old desk wrote the issues, and since 2026-11-21 nobody has. The planner is a short Opus 5.5 subagent. The dispatch thread starts it when the ready list runs low ([`dispatcher.md`](dispatcher.md), "The planner"). It writes issues and stops. It never builds, reviews or merges.

**Where the work comes from, in this order:**

1. **Jarrod's answers.**
   - Every open issue labelled `answered`: he has answered its card. The prefix of its `Owner answer (Desk page, ...)` comment is historical. Read that comment, rewrite the issue as ready work that does exactly what he said, set `status:todo`, and remove `answered` and `needs-owner`.
   - The answers the dispatch thread names in your prompt. An answer that calls for building, with no issue or PR that already carries it, becomes an issue.
2. **Backlog that is now ready.** A `status:backlog` issue moves to `status:todo` only when all of these hold: its `Depends on` issues are closed; it has a clear scope and a completion test; it carries no `needs-owner`, no `/paused` and no unanswered `Question:`; and it is not a new feature, screen, flow, layout, rule, or art or sound direction that Jarrod has not already decided.
3. **Loose ends on merged work.** Non-blocking review notes and follow-ups named in PRs merged in the last 7 days.
4. **Broken or flaky things.** A proof that failed on `main` or failed on a PR that did not touch it, and any open `bug` with no owner.
5. **[IDEAS.md](../IDEAS.md) and [VISION.md](../VISION.md).** Only a real bug fix, minor UX (wording, spacing, a hint, a missing cue, consistency with something already decided), or something a row in [DECISIONS.md](../DECISIONS.md) or [DECISIONS-archive.md](../DECISIONS-archive.md) ("Still in force") already approves. Everything else from these files is a question for him.

**Never file the same thing twice.** Before you file, search open issues, issues closed in the last 30 days and open PRs for the same work. Every issue you file ends its `Source` section with one line naming where it came from, such as `Source: decision q1829-duo-options`, `Source: PR #1851 review note 2` or `Source: IDEAS.md "whale wave"`. Search for that exact line first: if an issue has it, file nothing.

**What it writes.** Each issue follows [FRAMEWORK.md](../FRAMEWORK.md) section 5: `Deliverable`, `Completion test`, `Depends on`, `Source`. It carries one lane label, one `tier:` label set by risk as [LANES.md](../LANES.md) says, one `prio:` label, and `status:todo`. One issue is one PR's worth of work. State the numbers: sizes, counts, limits. An issue a builder would have to ask a question about is not ready: sharpen it or leave it in backlog.

**What it never decides.** A new feature, a new screen or flow, a layout change, a rule, an art or sound direction: these are Jarrod's ("Who decides what" in FRAMEWORK.md). For such work:

1. File it as `status:backlog` with `needs-owner`, and post one `Question:` on it with options and your recommendation. For a design question, start a Fable 5.2 subagent first and put its recommendation in the question. Three Fable subagents at most in one run.
2. Stop there. The dispatch thread brings the question to him as a card. When he answers, it posts his answer on the issue and adds `answered`. Your next run picks it up under source 1.

**Housekeeping, in the same run:**

- Keep at least 5 open, unclaimed `anytime` issues ([LANES.md](../LANES.md#anytime-queue)).
- Mark a claim expired only as [LANES.md](../LANES.md#picking-an-issue), step 2, says. Comment `expired: <agent>, <date>`, and set the issue back to `status:todo`.
- Keep the bodies of the three issues in [`issue-bodies.md`](issue-bodies.md) the same as that file. Replace a body that differs.
- Once a month, move `docs/DECISIONS.md` rows older than 30 days to "Still in force" in `docs/DECISIONS-archive.md`, word for word, in a PR. This PR is the one exception to "never builds". The dispatch thread gets it reviewed, and it merges with `owner-merge` ([`merging.md`](merging.md)).
- Close an issue whose work is merged, with the PR number.

**How much.** Stop when 12 unclaimed `status:todo` issues are ready across the tiers, at least 3 of them `tier:1`, or when the sources above are used up. File 15 at most in one run. End with one line: how many issues you filed, moved and closed.

**End.** Report your one line back to the dispatch thread.
