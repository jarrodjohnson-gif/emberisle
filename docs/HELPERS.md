# Helper builders

These rules apply to anyone, or any AI, who was told they are a **helper** on Emberisle, such as a
friend and their agent working from a fork. Helpers only build. The owner (Jarrod) and his
orchestrator make every design decision and every merge.

**Where `docs/FRAMEWORK.md` conflicts with this file, this file wins.** In particular, helpers never
take the Reviewer role, never review or merge PRs, and never ask "what's next". The next task is
always the next `helper-ok` issue.

## What you may work on

- Only open issues labelled **`helper-ok`**. Their behaviour and their proof are already decided.
- One issue per pull request.
- No eligible issue left? Stop and report that. Don't pick anything else.

## Running in a loop

If you run unattended (loop or stand-by mode):
- Have at most **2 open PRs** at a time. While you're at that limit, only fix CI and answer
  reviews on them; don't start a new issue.
- With nothing to do, stay quiet: no comments, no PRs, no empty commits. Check for new
  `helper-ok` issues at most every 30 minutes.
- If an owner or reviewer closes your PR, or removes `helper-ok` from an issue, drop that issue for
  good. Never reopen a PR or redo the same work.
- After 3 failed attempts to get the same PR green, post a `paused:` comment on the issue and stop work on it.

## Never

- Make a design decision. That covers any feature, visual, colour, layout, sound, rule, wording or
  balance change beyond the issue text. If something is unclear or needs a choice, ask on the issue,
  post a `paused:` comment (below), and move on to the next `helper-ok` issue. Never build around the gap.
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
2. **Pick:** take the lowest-numbered open `helper-ok` issue that meets all of these:
   - no open PR mentions its number (drafts count);
   - no `claimed:` comment from anyone else;
   - its `Depends on` issues are closed.

   Read the whole issue and every comment on it, fresh. Together they are the spec.
3. **Claim** it right away. Add the label `status:in-progress` and comment:
   ```
   claimed: <your name>, <YYYY-MM-DD>
   files: <paths you expect to touch>
   ```
   If someone else's claim was posted before yours, drop the issue and pick again.
4. **Branch:** `git fetch upstream && git checkout -b helper/<issue#>-<slug> upstream/main`
5. **Build** exactly what the issue says, plus the proof it asks for. The proofs are the `*-prove`
   scripts in `package.json`.
6. **Check:** run these one at a time and paste the results in the PR. All must pass:
   - `npm run typecheck`
   - `npm test`
   - `npm run build && npm run size-prove`
   - `npm run <name>-prove` for every proof you added or touched, plus the proofs for the area you
     changed (see the README and `.github/workflows/ci.yml`)

   CI then runs the full set. Red CI means you fix it.
7. **PR:**
   - Push to your fork with `git push -u origin helper/<issue#>-<slug>`.
   - Open a **draft** PR into `jarrodjohnson-gif/emberisle` `main`, either in the web UI or with
     `gh pr create --draft --repo jarrodjohnson-gif/emberisle --base main --head <you>:helper/<issue#>-<slug>`.
   - In the body, put `Closes #<issue>`, what changed, and the check output.
   - Then comment on the issue, and swap its label to `status:in-review`:
   ```
   changed: <one line>
   test: <command> → <result>
   pr: #<n>
   ```
8. **Follow up:** if CI is red, fix it on the same branch. Answer each review comment, either with a
   fix or with a reply saying why not. Then go back to step 2.

**Pause** (out of time or blocked): leave the issue `status:in-progress` and comment:
```
paused: <your name>, <YYYY-MM-DD>
done so far: <one line>
left: <exactly what is unfinished, and the next command to run>
```

A different model reviews every helper PR. Merges happen only after that review, with green CI and the
owner's OK.
