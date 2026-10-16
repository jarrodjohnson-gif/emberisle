# Helper builders

Rules for anyone, or any AI, who builds on Emberisle from a fork. That covers friends and their
agents. The owner (Jarrod) and the orchestrator make every design call and every merge. Helpers
only build.

## What you may work on

- Only issues labelled **`helper-ok`**. Those issues are fully decided: the behaviour and the
  proof are written in the issue.
- One issue per pull request.

## Never

- Make a design decision. That covers any feature, visual, colour, layout, sound, rule, wording or
  balance change beyond the issue text. If something is unclear or needs a choice, **stop and ask
  in a comment on the issue**. Do not guess.
- Merge, approve, push to `main`, or push to anyone else's branch.
- Delete files, edit `.github/workflows/`, or skip, disable or loosen a test or proof.
- Raise a size budget in `scripts/size-prove.mjs` without saying why in the PR.
- Commit `node_modules`, `dist` or `*.tsbuildinfo`. Stage files by path.

## How

1. **Setup (once):**
   - Fork `jarrodjohnson-gif/emberisle` and clone your fork.
   - Add the main repo as `upstream`: `git remote add upstream https://github.com/jarrodjohnson-gif/emberisle.git`.
   - Install everything: `npm install`, `(cd server && npm install)`, `npx playwright install chromium`.
2. **Pick:** take the lowest-numbered open issue labelled `helper-ok` that has no open PR. Read the
   whole issue and its comments; together they are the spec.
3. **Branch:** `git fetch upstream && git checkout -b helper/<issue#>-<slug> upstream/main`.
4. **Build** exactly what the issue says, plus the proof it asks for (`scripts/*-prove.mjs`).
5. **Check:** run these one at a time, and paste the results in the PR:
   - `npx tsc --noEmit`
   - `npm test`
   - each proof you touched (`node scripts/<name>-prove.mjs`)
   - `node scripts/size-prove.mjs`
6. **PR:** push your branch, then open a **draft** pull request into upstream `main` with
   `Closes #<issue>`.
7. **Follow up:** if CI is red, fix it on the same branch. Answer each review comment with a fix or
   with a reply saying why not. Then go back to step 2 for the next issue.

A different model reviews every helper PR. Merges happen only after review, with green CI and the
owner's OK.
