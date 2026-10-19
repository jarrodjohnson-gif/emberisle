# Helper builders

Take the top line in **Next up (auto)** that your tier allows. Helpers: only `helper-ok` lines.

These rules apply to anyone, or any AI, who was told they are a **helper** on Emberisle, such as a
friend and their agent working from a fork. Helpers only build. The owner (Jarrod) and his
orchestrator make every design decision and every merge.

**Where `docs/FRAMEWORK.md` conflicts with this file, this file wins.** In particular, helpers never
take the Reviewer role, never review or merge PRs, and never ask "what's next". The next task is
always the next `helper-ok` issue.

## What you may work on

- Only open issues labelled **`helper-ok`**. Their behaviour and their proof are already decided.
- One issue per pull request.
- No eligible issue left? Wait (see below). Don't pick anything else.
- **Model:** if an issue has a `model:opus` or `model:sonnet` label, build it with that model. If your
  tool can't switch models, use a subagent on that model when you can. Otherwise, say in the PR which
  model you used.

## Ideas and suggested changes

You or your human may have ideas, such as a new feature, a change to how something looks or plays, or
a bug you noticed. **Don't build them.** Open a GitHub issue on `jarrodjohnson-gif/emberisle`:
- Title: `Idea: <short name>`. For a bug, use `Bug: <short name>`.
- Body: what and why, plus a screenshot if it helps.

The orchestrator reads new issues, turns the good ones into exact specs (Jarrod decides the design
calls), and labels them `helper-ok` when they're ready. Then you can build them like any other issue.

## Keep going on your own

Nobody will tell you "next issue". After each PR, go straight back to step 2. In Claude Code, the
human starts you once with `/loop Read docs/HELPERS.md and follow it.`, and you never need another
prompt.

- **Your open PRs come first, every round.** The orchestrator answers through GitHub: review comments
  and CI results on your PR, and a merge or close. So at each round, check your open PRs before
  picking new work:
  - CI red: fix it.
  - Review comments: fix them, or reply saying why not. Answer each comment once. Skip any thread
    whose last comment is yours.
  - Merged: done, move on.
  - Closed: drop that issue for good. Never reopen it or redo the work.
- Have at most **2 open PRs** at a time. While you're at that limit, only work on those two.
- With nothing to do, stay quiet: no comments, no PRs, no empty commits.
- **Timing** (the only place these numbers live; other docs point here):
  - while you have an open PR, check again every **10 minutes**;
  - as soon as a PR of yours merges, start the next round right away;
  - idle with nothing eligible, check every **30 minutes**.
- If `helper-ok` is removed from an issue, drop that issue.
- After 3 pushes in a row that are still red on the same PR, post a `paused:` comment on the issue
  and stop work on it.

Work efficiently, as `docs/FRAMEWORK.md` section 7 says: delegate broad reading to subagents, read narrowly,
and run long proofs in the background, one at a time, reading every result before you push.

## Never

- Make a design decision. That covers any feature, visual, colour, layout, sound, rule, wording or
  balance change beyond the issue text. If something is unclear or needs a choice, ask on the issue
  in a comment starting `Question:` (options plus your recommendation), post a `paused:` comment (below), and
  move on to the next `helper-ok` issue. Never build around the gap.
- Merge, approve, review, push to `main`, `git push upstream`, or push to anyone else's branch.
- Delete files. If an issue needs a file deleted, stop and ask on the issue.
- Edit `.github/workflows/`, `package.json`, lockfiles, `tsconfig*`, `vite.config*`, or add or upgrade a
  dependency, unless the issue says to. Never commit lockfile changes the issue didn't ask for.
- Edit `docs/HELPERS.md`, `docs/FRAMEWORK.md`, `docs/IDEAS.md`, `AGENTS.md` or `CLAUDE.md`.
- Skip, disable or loosen a test or proof, or raise a size budget without saying why in the PR.
- Commit `node_modules`, `dist` or `*.tsbuildinfo`. Stage files by path, never with `git add .`.
- Add to-do lists to files, or post about the work anywhere outside this GitHub repo.

## How

1. **Setup (once):**
   - Install Node 22.18 or newer.
   - Fork `jarrodjohnson-gif/emberisle` and clone **your fork**.
   - `git remote add upstream https://github.com/jarrodjohnson-gif/emberisle.git`
   - `npm ci && npm ci --prefix server && npx playwright install chromium`
2. **Refresh first, every time:** handle your open PRs (above). Then run `git fetch upstream` and re-read `docs/HELPERS.md` and
   `docs/LANES.md` from `upstream/main` (`git show upstream/main:docs/HELPERS.md`). If the rules changed,
   follow the new ones. Never ask your human to update you.
3. **Pick:** keep going while eligible work exists. Take the lowest-numbered open `helper-ok` issue
   that meets all of these (while respecting the open-PR limit above):
   - it is `status:todo` and has a lane label;
   - no open PR mentions its number (drafts count);
   - no active claim: ignore claims released by that agent's later pause (including historical `paused:` comments) or a merged/closed PR;
   - every `Depends on` issue is closed;
   - its planned files do not overlap another active claim's files or open PR changes, across any lane.

   Lanes sort work; several issues in the same lane can proceed with different files. Read the whole
   issue and every comment fresh; together they are the spec. Re-read immediately before claiming,
   including after any user wait, thinking break or check-in. If it has been claimed, pick another.
4. **Claim** it right away with this comment, before research or design. A fork can't set labels, so the comment alone is your claim.
   Put `/claim` on its own line in that comment, and the label bot sets the status. Later, post `/in-review`
   or `/paused` in a **new** comment; the bot ignores edits. `/label`, `/done` and `/canceled` are Jarrod's only.
   ```
   /claim
   claimed: <agent name>, <YYYY-MM-DD>
   files: <paths you expect to touch>
   ```
   Your agent name is required even when several agents use the same GitHub account. Immediately
   re-read all comments after posting: first active claim wins. If another agent's active claim has
   an earlier timestamp (or earlier timeline position for a tie), post a new comment:
   ```
   /paused
   paused: <your agent name>, <YYYY-MM-DD>
   lost the claim to <winning agent name>
   ```
   Then pick another eligible issue without a fixed wait. This releases only your claim, never the
   winner's. Otherwise your files remain reserved until your PR merges or closes, or you post
   `/paused`. Before adding files, recheck ownership and update `files:`; pause and pick again if
   they overlap an active claim. Follow [`LANES.md`](LANES.md) for the shared claim flow.
5. **Branch:** `git fetch upstream && git checkout -b helper/<issue#>-<slug> upstream/main`
6. **Build** exactly what the issue says, plus the proof it asks for. The proofs are the `*-prove`
   scripts in `package.json`.
7. **Check:** run these one at a time and paste the results in the PR. All must pass:
   - `npm run typecheck`
   - `npm test`
   - `npm run build && npm run size-prove`
   - `npm run <name>-prove` for every proof you added or touched, plus the proofs for the area you
     changed (see the README and `.github/workflows/ci.yml`)

   CI then runs the full set. Red CI means you fix it.
8. **PR:**
   - Push to your fork with `git push -u origin helper/<issue#>-<slug>`.
   - Open a **draft** PR into `jarrodjohnson-gif/emberisle` `main`, either in the web UI or with
     `gh pr create --draft --repo jarrodjohnson-gif/emberisle --base main --head <you>:helper/<issue#>-<slug>`.
   - In the body, put `Closes #<issue>`, what changed, and the check output.
   - Then post a new comment on the issue, with `/in-review` on its own line:
   ```
   changed: <one line>
   test: <command> → <result>
   pr: #<n>
   ```
9. **Follow up:** if CI is red, fix it on the same branch. Answer each review comment, either with a
   fix or with a reply saying why not. Then go back to step 2.

**Pause** (out of time or blocked): post a new comment on the issue, with `/paused` on its own line:
```
paused: <your agent name>, <YYYY-MM-DD>
done so far: <one line>
left: <exactly what is unfinished, and the next command to run>
```

A different model reviews every helper PR. Merges happen only after that review, with green CI and the
owner's OK.

Writing rules for docs, issue comments, PR bodies and review findings: [Writing](FRAMEWORK.md#writing).
