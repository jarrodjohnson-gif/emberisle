# Emberisle: S-tier setup review (advisory, read-only)

Date: 2026-10-21. Repo: `/home/user/emberisle`. Nothing was edited or posted.

Plain-language note: a "proof" is a test script (`scripts/*-prove.mjs`). "CI" is the robot that runs every proof on each pull request (PR). A "required check" is a CI job GitHub insists is green before a PR can merge. A "flake" is a test that fails now and then with no code change.

## What I measured (facts, not opinions)

- Last 100 CI runs on PRs: 63 green, 8 red, 27 cancelled (a new push cancelled the old run), 2 running. So **27 of 35 "reds" were cancellations, not failures.** Of the 8 real reds, 2 were drafts (the `checks` job fails drafts on purpose, `.github/workflows/ci.yml:433-436`).
- Last 100 CI runs on `main` itself: 74 green, **24 red**, 2 cancelled. Every red I inspected (12 of them) was a browser proof flaking: `chat-prove` (x2), `tokens-prove` (x2), `countdown-prove` (x3), `tabs-prove-4` (x2), `board-touch-prove` (x2), `flash-prove`, `hotseat-prove`, `rotate-overlays-prove`. Code on `main` was never actually broken.
- `.github/flaky.json` lists only 4 flakes (countdown, rotate-overlays, hotseat, turn-gain). **Five of the nine proofs that actually flaked on main are not in the list**, so the automatic one-time re-run (`flake-rerun.yml`) cannot fire for them. In the last 30 CI completions, flake-rerun ran 3 times and skipped 27 (CI was green).
- Latest green `main` run, per job: `build` 0-1m, `server` 5m, `browser-a (a1/a2/a3)` 9/11/10m, `browser-b (flows-a)` **22m**, `(flows-b)` 16m, `(presentation)` 17m, `(presentation-2)` 13m. Wall clock for a PR is set by `flows-a`. Billable minutes are 0 (public repo), so CI costs time, not money.
- Nightly soak (`soak.yml`, 5x every browser proof): 3 of the last 5 nights failed. Flakes are real and ongoing.
- `main` ruleset (id 25571799), read live: blocks deletion and force-push, requires a PR with 0 approvals, requires 8 checks (`checks`, `build`, `server`, `browser-a`, `browser-b (flows-a|flows-b|presentation|presentation-2)`), **does not** require the branch to be up to date with main (`strict: false`, good). Bypass actors: Repository admin (always) **and an Integration (a GitHub App, id 5415158) with "always" bypass.** That second one is almost certainly the app from the dropped auto-merge attempt. `docs/DECISIONS.md:13` does not mention it.
- Churn: 56 commits in 7 days; 21 touched `ci.yml`, 17 touched the rule docs (AGENTS/FRAMEWORK/LANES/DESK/HELPERS/REVIEWING). Most `ci.yml` commits are proof registrations required by AGENTS.md rule 6, which is by design.
- Hub issue #854: created 2026-10-19, already 143 comments. Desk state #916 is a single edited body (good design).
- Open PRs: 33, of which 10 drafts and roughly 20 on the desk's "stale" list. All but Josh's are authored by the owner account.

## (A) Freeze list: already strong, do NOT change

1. **The `checks` aggregator pattern** in `ci.yml:426-442`: `if: always()` plus explicit `test ... = success` for every job. This is the correct way to stop a skipped job counting as a pass. Keep it exactly as is.
2. **The 8 required checks, including the 7 individual names.** They look redundant next to `checks`, but they are defense in depth: a PR that edits `ci.yml` to drop a job from `checks.needs` still cannot merge, because the named check never reports. Keep all 8. The only cost is that re-sharding needs one owner click in the ruleset.
3. **`strict: false` on required checks.** Requiring "up to date with main" would force a 25-minute re-run on every other open PR after each merge. Leave it off.
4. **Concurrency cancel on PR pushes, never on main** (`ci.yml:21-23`). Correct. Cancelled runs look red; that is a reading habit, not a bug.
5. **Drafts skip the suites** (`ci.yml:27`). Keep.
6. **Docs-only fast path** (`changes` job, `ci.yml:26-71`). Docs PRs finish in about a minute while still reporting all required checks green. Keep, including README/AGENTS/CLAUDE being treated as code.
7. **Per-PR size growth budget** (`scripts/size-prove.mjs`, built against the merge base). Keep.
8. **`registered-prove` and `loosen-prove`** (`scripts/registered-prove.mjs`, `scripts/loosen-prove.mjs`). Loosen runs the *base's* copy so a PR cannot weaken the check that judges it (`ci.yml:167-190`). Keep loosen advisory (not required): its line-matching gives false positives on legitimate refactors.
9. **Workflows that touch PR metadata never check out PR code** (`flake-rerun.yml`, `stale-pr-sweeper.yml`, `review-desk-inbox.yml`, `next-up.yml`, `auto-merge.yml`). This is the right security posture for `pull_request_target` and `workflow_run`. Keep.
10. **Desk state as one edited issue body (#916), the inbox PR #699, and `<!-- review-desk -->` markers.** Cheap and sound.
11. **"A different model reviews"** rule and the `code-reviewer` subagent being read-only (`.claude/agents/code-reviewer.md` rule 1). Keep.
12. **Label bot with claim replay** (`label-commands.yml`). It is complex but it works, it is proven (`label-commands-prove`), and it is the only thing that makes shared-account claims honest. Do not rewrite it.
13. **Nightly Pages publish, not on every merge** (`pages.yml`). Keep.

## (B) Top 8 changes, ranked by value

| # | Change | Value | Cost | Risk | Who |
|---|---|---|---|---|---|
| 1 | **Add the five missing flakes to `.github/flaky.json`** (`chat-prove`, `tokens-prove`, `tabs-prove-4`, `board-touch-prove`, `flash-prove`) with their log signatures, so `flake-rerun` can do its job. Then fix the three worst at the source, one issue each. | Highest. Removes most "red main" and most desk wake-ups about reds. | 1 small PR for the list; 3 small PRs for root causes | Low. A wrong pattern just means no re-run. | Agent |
| 2 | **Remove the leftover GitHub App bypass** from the `main` ruleset (actor 5415158, "always"). It can push to main around every check. | High (safety). | 1 click: Settings > Rules > main > Bypass list | None if the app is the dropped auto-merge app. Verify its name first. | Owner |
| 3 | **Rebalance `browser-b`**: move about 4 proofs from `flows-a` (22m) to `presentation-2` (13m). Target 15-17m each. | PR wall time drops ~5 min; fewer timeouts. | 1 PR, `ci.yml` and `soak.yml` only | Low. Keep the four suite names unchanged so the ruleset needs no edit. | Agent |
| 4 | **Make drafts show grey, not red**: on `browser-a` and `checks`, skip when the PR is a draft instead of exiting 1. A draft cannot merge anyway, and `ready_for_review` starts a fresh run. | Ends a whole class of confusing reds. | 2 lines in `ci.yml` | Very low. Tiny window between "ready" and the new run posting, but the desk merges by hand after reading CI. | Agent |
| 5 | **Fix the one contradiction that burns desk tokens**: `.claude/agents/code-reviewer.md` rule 3 says "run the CI config / test command yourself rather than trusting a green checkmark", while `docs/REVIEWING.md:5-8` says "CI runs the suite for free, don't rerun it". Reviewers obey the agent file. Change rule 3 to "rely on CI's result on the head SHA; run locally only what REVIEWING.md lists". | Large token saving per review. | 1 line | None | Agent |
| 6 | **Retire or mark `docs/ORCHESTRATOR.md` as superseded.** It says "all 9 checks", "check in every ~30 min with send_later", "Jarrod accepts In Review", all of which contradict `DESK.md` and the ruleset. Also fix `FRAMEWORK.md` §6 ("In Review: waiting for Jarrod to accept") and `FRAMEWORK.md:233` ("No other session merges") to match "the desk merges on its own". Add `status:claimed`/`status:paused` to the §6 table since the bot sets them. | Stops new desks and builders learning stale rules. | 1 docs PR | None | Agent |
| 7 | **Rotate the hub.** Open `#854` is at 143 comments in 2 days. Start a new hub issue weekly (or at 200 comments), put "current hub: #N" in `AGENTS.md`, and close the old one with one pointer comment. Keep #916 and #699 permanent. | Cuts stale-comment confusion; cheaper reads. | 1 small docs edit, then a weekly 2-minute desk task | Low | Agent writes the rule, desk does it |
| 8 | **Skip `npx playwright install --with-deps` on a Playwright cache hit** in the 7 browser jobs (use the cache step's `cache-hit` output). | Saves 1-2 min per job, every run. | 7 `if:` lines in `ci.yml` and 4 in `soak.yml` | Low; if the cache is stale the install runs. | Agent |

### Do NOT do (tempting, but wrong for a tired owner)

- **Do not rebuild auto-merge.** It saved one click a day and cost a week of setup, a ruleset collision and a dangling bypass. The desk's hand merge is the safety net. (Already decided, `DECISIONS.md:14`; keep it decided.)
- **Do not reduce the required checks to only `checks`.** See freeze item 2.
- **Do not turn on "require branches to be up to date".**
- **Do not turn `loosen` into a required check.** It will block honest refactors.
- **Do not move proofs into a manifest file to stop `ci.yml` churn.** It would be a third registration system, and `registered-prove` would need rewriting. The churn is one line per new proof and is harmless.
- **Do not give every agent its own GitHub account now.** It is the right long-term answer but is a multi-day change to the label bot (`ALLOWED_USERS`), the claim replay and every builder's setup. Log it as a future decision instead.
- **Do not enable the stale-PR sweeper until the close/keep list is approved** (`stale-pr-sweeper.yml:1`). Enabling early will close PRs the owner wants.
- **Do not add more tiers, model labels or lanes.** `LANES.md` already has 4 tiers, 11 model names and 5 lanes; most are unused.
- **Do not rewrite `label-commands.yml`.**

## (C) CI: the five highest-value improvements

1. **Flake coverage (reliability, signal).** `flaky.json` covers 4 of 9 observed flakers, so the auto re-run rarely fires and `main` reads red one push in four. Fix: items B1. Also make the `soak` job open or update a tracking issue per failing proof (it already writes an issue at `soak.yml:134-152`; check it names the proof) and have the desk add any new flaker to `flaky.json` the same day. Rule of thumb for the owner: **red `main` means a flake until someone shows otherwise; red on a PR after a re-run means a real failure.**
2. **Shard balance (speed).** `flows-a` 22m vs `presentation-2` 13m. One rebalancing PR; keep the four names. Expected PR time: ~25m to ~18m. Do not add a fifth suite: that needs a ruleset click.
3. **Draft and cancelled reds (signal).** B4 for drafts. For cancellations nothing to change in CI; add one line to `DESK.md` "Before you post": "a run marked *cancelled* is not a result". It is already half there (`DESK.md:19`).
4. **Install time (speed, cost in wall time).** Every browser job runs `npm ci` twice and `playwright install --with-deps` even on a cache hit. B8 saves 1-2 min per job. A bigger but still safe win: in `browser-b`, the four suites each rebuild nothing (they download `dist`), good; `browser-a` suites do not need `dist` at all, good. Leave the structure.
5. **Required checks list and flaky handling: verdict.** The 8-name list is right, keep it. `strict: false` is right. Flake handling design (`scripts/flake-rerun.mjs`) is sound: one re-run only, only when *every* failed job matched a known signature, never checks out PR code, neutralises workflow commands in logs (`flake-rerun.mjs:46`). Its only weakness is the short list in `flaky.json`. One small gap: it re-runs on `main` pushes too, which is fine, but nobody reads the second result; the desk should treat `main` as green if attempt 2 is green.

Required-check names are hard-wired in three places: the ruleset, `ci.yml` job names, and `scripts/flake-rerun.mjs:10` (`AGGREGATE_JOBS`). Write that down once in `DECISIONS.md` so nobody renames a suite casually.

## (D) Steady state: issue to merge in 8 steps

1. **Work appears.** The owner says what he wants (in chat or on an issue). The desk writes it as an issue with the four labels (`status:todo`, `lane:`, `tier:`, `prio:`) and a completion test. The `Next up` bot (`next-up.yml`, every 15 min) lists eligible issues in priority order.
2. **A builder claims.** Any agent reads #854, takes the top eligible line, and comments `/claim` with its agent name, date and files. The label bot flips the status and refuses a second claimant. First claim wins.
3. **The builder builds** on a branch, runs its own proof locally, registers any new proof in `package.json` and `ci.yml`, and opens a **ready** (not draft) PR naming its model.
4. **CI runs** (`ci.yml`): typecheck, build, size budget, server proofs, 3 browser-a parts, 4 browser-b parts. About 18-25 minutes. If the only failures are known flakes, `flake-rerun` re-runs them once by itself.
5. **The inbox wakes the desk** (`review-desk-inbox.yml` comments on PR #699). The desk (Sonnet) hands the PR to one `code-reviewer` subagent on a model different from the builder's, with `REVIEWING.md`.
6. **Findings go on the PR.** Blocking findings: the builder fixes and pushes (CI re-runs, old run cancelled). Clean: the desk moves on. Visual change: the desk shows the owner the screenshots and waits for one word.
7. **The desk merges by hand**: squash, pinned to the exact head SHA, only when review is clean, CI is green on that SHA, no conflict, not a draft. The desk sets the issue to `status:in-review` and edits #916.
8. **The owner accepts results.** He reads #916's "Waiting on Jarrod" section, answers decisions and screenshot questions, and (per `FRAMEWORK.md`) moves accepted work to Done. Pages publishes `main` nightly.

What the owner clicks in steady state: answer questions, approve screenshots, and (rarely) edit the ruleset. Nothing else.

## (E) Risks of the multi-agent setup, one mitigation each

1. **Shared owner account.** Every builder, the desk and the bots post as `jarrodjohnson-gif`. Any agent can `/done`, edit #916, or (with the admin bypass) push to `main`; GitHub cannot tell them apart, and the audit trail is the agent-name line. *Mitigation now:* remove the App bypass (B2) and keep the desk's rule "never push to main" in every agent prompt; log the per-agent-account change as a future decision with a date.
2. **Stale state.** Three copies of "what is true" exist: #916 body, #854 comments, and the issue itself; today's confusion came from reading the first two. *Mitigation:* `DESK.md` "Before you post" already says the issue is the fact. Add the hub rotation (B7) and the `checked: <date>` habit to every #916 line (`DESK.md:33`) and stop there.
3. **Reviewer cost.** Reviews and wake-ups are most of the desk's tokens; the `code-reviewer` agent file tells reviewers to re-run CI (B5). *Mitigation:* B5, plus "one review subagent per PR, Haiku for docs" which `DESK.md:38` already says.
4. **Flakes train agents to ignore red.** With `main` red one push in four, builders and the desk learn to shrug at red, and a real failure slips. *Mitigation:* B1, and the rule "red after one re-run is real".
5. **Rule-doc churn.** 17 commits to the rule docs in a week; each new agent model reads a slightly different ruleset. *Mitigation:* declare a freeze: rule docs change only through a `Decide:` issue the owner answers, at most once a week, and `ORCHESTRATOR.md` is retired (B6).
6. **Stale PR pile (33 open, ~20 stale).** Each one holds file reservations and confuses "next up". *Mitigation:* the owner answers the close/keep list once; then the sweeper (`STALE_PR_SWEEPER=on`) keeps it clean without further clicks.

## What I could not verify

- Which GitHub App actor 5415158 is. The API path for app installations is blocked from this session. The owner can see its name in Settings > Rules > main > Bypass list.
- Whether the three `flake-rerun` runs that executed actually triggered a re-run, and whether the re-run went green. Job logs for other workflows were not read.
- The desk's real token spend per review or per wake-up. No numbers exist in the repo; the statement "most tokens go to reviews and wake-ups" is from today's context.
- The collaborator list (API blocked). I relied on `DECISIONS.md:52` for Josh's Write access.
- Whether the owner's GitHub plan limits concurrent runners. With 9 jobs per PR run and several PRs pushed at once, queueing (not job length) may be part of the "20+ minutes".
- Runtime per proof inside `flows-a`; the 4-proof move in B3 should be sized from a job log, not guessed.
