# Agents

**Told to "work on Emberisle", or something like it?** Then:

0. **Read the Agent hub, issue [#854](https://github.com/jarrodjohnson-gif/emberisle/issues/854), first, at the start of every round.** Do any direction there that names your agent before picking other work.
1. You are a **Builder**. Follow [`docs/FRAMEWORK.md`](docs/FRAMEWORK.md) section 7, and pick an issue
   using [`docs/LANES.md`](docs/LANES.md).
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
6. **Still nothing eligible?** Post one line on #854 saying so and which issues you skipped and why. The
   review desk replies with work. Don't stop silently.

**Told you are a helper**, for example a friend's AI working from a fork? Read #854, then take work
from the helper queue, issue [#851](https://github.com/jarrodjohnson-gif/emberisle/issues/851), and follow
[`docs/HELPERS.md`](docs/HELPERS.md). It wins over everything else here.

Game rules and setup: [`README.md`](README.md).

Writing rules for docs, issue comments, PR bodies and review findings: [Writing](docs/FRAMEWORK.md#writing).
