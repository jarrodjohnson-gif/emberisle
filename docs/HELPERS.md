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

1. Fork `jarrodjohnson-gif/emberisle`. Create a branch named `helper/<issue#>-<slug>`.
2. Read `README.md` and `docs/FRAMEWORK.md`.
3. Build exactly what the issue says.
4. Run these one at a time, and paste the results in the PR:
   - `npx tsc --noEmit`
   - `npm test`
   - each proof the issue names (`node scripts/<name>-prove.mjs`)
5. Open a **draft** pull request into `main` with `Closes #<issue>`.
6. If CI is red, fix it on the same branch. Answer each review comment, either with a fix or a
   reply saying why not.

A different model reviews every helper PR. Merges happen only after review, with green CI and the
owner's OK.
