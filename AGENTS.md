# Agents

## Map

- Rules: [`docs/FRAMEWORK.md`](docs/FRAMEWORK.md)
- Picking work: [`docs/LANES.md`](docs/LANES.md)
- Helpers: [`docs/HELPERS.md`](docs/HELPERS.md)
- Review desk: [`docs/DESK.md`](docs/DESK.md), with live state in issue [#916](https://github.com/jarrodjohnson-gif/emberisle/issues/916)
- Owner decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md) (read before you design or build)
- Feature designs: [`docs/design/`](docs/design/)
- Game rules: [`README.md`](README.md)
- Agent hub: issue [#854](https://github.com/jarrodjohnson-gif/emberisle/issues/854). Helper queue: issue [#851](https://github.com/jarrodjohnson-gif/emberisle/issues/851).

## Rules for every agent (Claude, ChatGPT/Codex, Cursor, Gemini, Grok, helpers)

These are short on purpose. Follow all of them, every round.

1. **Start each round by reading the Agent hub, issue [#854](https://github.com/jarrodjohnson-gif/emberisle/issues/854).** Do any direction that names you first.
2. **Pick work in this order:** `prio:p0`, then `prio:p1`, then `prio:p2` (`docs/LANES.md`). Helpers take the queue in [#851](https://github.com/jarrodjohnson-gif/emberisle/issues/851).
3. **Claim before you code.** Comment on the issue: `/claim`, `claimed: <your agent name>, <date>`, `files: <paths>`. If you can't comment (a 403), put that block at the top of your PR body.
4. **One issue per PR. At most 2 open PRs per agent.** At the limit, work only on those two.
5. **Don't park drafts.** Open the PR as ready for review once your own checks pass. If CI goes red, fix it or say why on the PR.
6. **Register every new proof** in `package.json` and `.github/workflows/ci.yml`, next to its neighbours. A proof that CI never runs doesn't count.
7. **Never merge, never push to `main`, never force-push someone else's branch, never skip or loosen a test.**
8. **Build with the issue's `model:` label.** A `tier:` label says which other models may take it.
9. **Busy files are fine.** `package.json`, `ci.yml` and `scripts/size-prove.mjs` never count as overlap. A different function in a file another PR touches is fine if you name that PR in your claim.
10. **Never stop, and never ask the desk for work.** If the lineup and the ready list are empty, work down the fallback ladder in [`docs/LANES.md`](docs/LANES.md#when-nothing-is-eligible) yourself. Post on #854 only when every rung is empty.
11. **Run long browser proofs one at a time**, and paste real output in the PR. Never estimate numbers.
12. **Don't make design decisions.** Ask on the issue with `Question:` and your recommendation, post `/paused`, and move on.

## The full procedure

**Told to "work on Emberisle", or something like it?** Then:

0. **Read the Agent hub, issue [#854](https://github.com/jarrodjohnson-gif/emberisle/issues/854), first, at the start of every round.** Do any direction there that names your agent before picking other work.
1. You are a **Builder**. Follow [`docs/FRAMEWORK.md`](docs/FRAMEWORK.md) section 7, and pick an issue
   using [`docs/LANES.md`](docs/LANES.md).
   Take the top line in **Next up (auto)** that your tier allows. Helpers: only `helper-ok` lines.
2. Never merge. Only the orchestrator session that Jarrod names merges PRs, after a review by a
   different model.
3. If Jarrod named a specific issue, do that one instead, still checking its prerequisites, claims and files.
4. **Need a decision?** Post it as a comment on the issue, starting with `Question:`, giving the options and your
   recommendation. Add `/paused` on its own line, then move to the next eligible issue. Never wait for an
   answer in chat. The orchestrator answers minor questions and Jarrod answers major ones, on the issue
   (rules in `docs/FRAMEWORK.md`, "Who decides what").
5. **Keep working while eligible work exists.** Pick open `status:todo` issues with a lane label,
   closed dependencies, no active claim or open PR, and no file overlap with another active claim.
   Lanes sort work; they do not lock it. Follow [`docs/LANES.md`](docs/LANES.md): re-read immediately
   before posting `/claim` with `claimed: <agent name>, <date>` and `files:`, then re-read immediately afterward.
   `package.json`, `.github/workflows/ci.yml` and `scripts/size-prove.mjs` never count as file overlap.
   First active claim wins; a loser posts `/paused` naming itself and the winner, then picks another
   without a fixed wait. File reservations last until that agent pauses or its PR merges or closes.
6. **Still nothing eligible?** Work down the fallback ladder in [`docs/LANES.md`](docs/LANES.md#when-nothing-is-eligible). Post one line on #854 only if every rung is empty, naming the issues you skipped and why.

**Told you are a helper**, for example a friend's AI working from a fork? (Josh's agent is a full builder, not a helper, even from his fork: see `docs/LANES.md`.) Read #854, then take work
from the helper queue, issue [#851](https://github.com/jarrodjohnson-gif/emberisle/issues/851), and follow
[`docs/HELPERS.md`](docs/HELPERS.md). It wins over everything else here.

Game rules and setup: [`README.md`](README.md).

Writing rules for docs, issue comments, PR bodies and review findings: [Writing](docs/FRAMEWORK.md#writing).
