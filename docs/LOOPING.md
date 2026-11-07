# Looping guide for cloud agents

**Opt-in only.** This is not a standing rule and is not part of the default agent reading list. Use it only when Jarrod's prompt for your task says the task should loop (repeat across resets). If your task prompt does not say to loop, do not create automations: creating or changing an automation needs Jarrod's authorization. Every task, looping or not, still needs a handoff (the issue, PR body, claims and checkpoint it names), so read it as usual. Nothing here changes `AGENTS.md` (never merge, claim before you code, the open-PR limit, `To desk:` for the desk). Written at Jarrod's direction, 2026-11-05.

This guide is an operating manual, not a self-starting mechanism. It does not create an automation. Reliable continuation needs: an actual saved automation that invokes the agent again; working repository access and execution tools; filled-in task instructions and permissions; a durable checkpoint and pause record the next invocation can read; and a successful scheduled-run test followed by recovery in a fresh invocation.

## What persists, and what does not

Four pieces must work together:

1. A persisted platform trigger. A shell process, `sleep`, cron inside a disposable workspace, or a "never stop" line in `AGENTS.md` is not one.
2. The intended thread and environment, verified after saving.
3. An execution prompt that authorizes work, recovers state, verifies it and records progress.
4. A durable checkpoint the next run can find without relying on process memory.

The automation tools inspected for this guide supported at most hourly recurrence; inspect current capabilities. A schedule is an opportunity to run, not proof a run succeeded. There is no verified immediate wake on a quota reset.

## Quick diagnostic

Check automation capability separately from coding capability. The observed tools were `automations_create`, `automations_peek`, `automations_update` and `automations_list`; inspect the tools you actually have. If creation is unavailable, say exactly that; do not pretend a timer exists. Report which layer is missing: automation tool, thread association, execution environment, repository access, dependencies or authority.

## Setup

1. Define authority and stop boundaries: repository, issue, deliverable, allowed branch and files, checks, and whether commits, pushes, draft PRs or external communication are authorized. A recurring instruction is not blanket permission. Later user instructions can pause or narrow it.
2. Ask for an actual automation from the intended thread: hourly, starting at a future local time in an IANA timezone. Use a VEVENT with `DTSTART;TZID=<zone>:<future local time>` and `RRULE:FREQ=HOURLY`; no SUMMARY or DTEND; an end belongs in RRULE as UNTIL or COUNT. `exact_schedule` fits an exact cadence. Do not reuse another task's ID or date. After creating, inspect the saved title, prompt, schedule, timezone, enabled state, thread and environment association. If wrong, fix it through the supported workflow, not invented parameters.
3. On a later run, check the recorded run, latest result and `requires_user_action`. A last-run timestamp is not success; open the actual run and verify its checkpoint and artifacts.

## Setup request template (fill in every placeholder)

```text
SETUP REQUEST — Execute this setup; do not merely summarize the guide.

Task: [repository, issue, intended outcome]
Allowed actions: [edit, test, commit, push feature branches, draft PR, etc.]
Excluded actions: [...]
Checkpoint and durable pause record: [accessible location]
Schedule: [cadence, future start time, IANA timezone]
Completion condition: [...]

Inspect available automation and execution tools. If supported, create this
authorized recurring task using the guide. Check for an existing matching
task first to avoid duplicates.

Verify the saved task ID, enabled state, schedule, and thread/environment
association wherever exposed. Report unknowns honestly. If a capability is
missing, identify the exact missing capability; do not pretend setup succeeded.

Use the repeated-work instruction as the execution policy.
```

## Repeated-work instruction (execution policy)

```text
Within each invocation, repeatedly select, implement, and verify the next
bounded authorized step. Save a checkpoint after each meaningful milestone.
Continue while useful authorized work remains and runtime capacity permits.

Stop affected work when complete, paused, blocked by a required decision or
approval, conflicting with an active owner, or prevented by a genuine runtime
or usage limit. Continue independent authorized work where possible.

A later invocation must recover from the durable checkpoint and verify actual
state before continuing. This instruction does not create a future invocation.
```

## Continuation prompt (adapt scope first)

Continue the authorized work on [repository, issue, outcome] in [environment, working directory]. The durable checkpoint is [location]. Allowed actions: [list]. Do not: [exclusions]. Respect later user instructions including a pause. At startup, read current instructions and the checkpoint; verify workspace, branch, exact HEAD, remote and working tree; identify active workers and claims before editing; reconcile the checkpoint with observed state. If another run owns the same work, avoid colliding. If paused or complete, do no repository work. Then follow the repeated-work instruction: repeatedly select, implement and verify the next bounded authorized step, saving a checkpoint after each meaningful milestone. Run the checks appropriate to the change, verify CI against the current commit (required versus advisory per repository policy), never call an unrun check passed, never print secrets. Before stopping, update and verify the durable checkpoint, and report what is done and what remains. Do not use new workers, alternate credentials, routes or retries to evade a limit or a denial.

## Checkpoint template (outside process memory, no secrets)

- Scope, owner, current instructions and pause state
- Repository, remote, branch
- Exact HEAD and remote commit verified, with time
- Working tree and uncommitted work
- Completed work with evidence
- Remaining work and ordered next action
- Checks: command, exact commit, result, failures
- PR and current-head CI
- Active workers, claimed files, branch or worktree
- Blockers: exact error and permitted next action
- Environment and recovery steps
- Automation ID and enabled state
- Permissions and decisions still needed

Check `git status`, branch and `git rev-parse HEAD` before recording. Do not overwrite anyone's uncommitted changes.

## Deterministic startup and resume

1. Read current instructions and repository guidance; a later pause beats an older automation prompt.
2. Confirm the environment is attached and ready; if a selected environment is `starting` and needed, wait on that exact ID.
3. Locate the checkpoint and repository; verify directory, repository identity, branch, HEAD, remote and working tree; reconcile before editing.
4. Inspect live workers and compare with the checkpoint; use explicit file ownership; do not spawn replacements to bypass quotas.
5. If paused, complete, owned by another run, or missing authority, stop that work.
6. Implement and verify only within scope; check CI for the actual current head; no empty commits or endless retries.
7. Save and verify an accurate checkpoint.

## Diagnosing "environment not set up"

Capture the exact failed operation and sanitized error first.

- No environment attached: use the supported configuration workflow and keep doing independent work.
- Starting: wait only if needed.
- Ready but a command fails: run one minimal command and capture the transport error.
- Wrong directory: inspect `pwd` and repository identity; do not clone or overwrite blindly.
- Git access fails: separate local identity from remote authorization with a read-only operation.
- Network failure: read the enforced policy and exact error; preserve proxy and CA settings; a policy denial needs the configuration workflow, not another route or credential.
- Missing dependency or browser: follow repository setup within authority and record any fallback.
- Connect or approval prompt: stop and follow it.
- Quota exhausted: record the message, checkpoint, retry at the next authorized invocation.

Never print credentials or dump the environment.

Copy/paste when an agent gives a vague blocker:

```text
Before declaring this blocked, identify the exact failed operation and sanitized
error. Check the current environment attachment/readiness, the minimum local
command or repository state needed, and the relevant network or identity status.
Separate observed facts from assumptions. Continue independent authorized work,
then tell me the precise supported action or approval needed. Preserve policy,
proxy, credentials, and approval boundaries; do not print secrets or bypass limits.
```

## Stop, pause, resume

A direct stop or pause applies immediately; a stale scheduled prompt cannot override it. A clear request to stop the recurring automation authorizes disabling its future runs (`is_enabled: false` on that task only); no second confirmation is needed. Stopping the current turn, disabling future runs and cancelling active workers are three different actions. Verify separately whether already-running workers have stopped. To resume, set `is_enabled: true` rather than creating a duplicate. Schedules can overlap or arrive after a pause: at each start, check the latest instructions, checkpoint and live workers. A checkpoint claim is a coordination aid, not an atomic lock.

## Verifying the loop really works

A directly started worker finishing work does not prove the loop. The proof is a scheduled invocation starting and recovering work after the previous invocation ended. A "run now" 404 shows that action failed, not that the hourly scheduler is broken. Verification prompt:

```text
Verify the existing recurring automation without creating a duplicate.

Inspect current tool descriptions: confirm whether an immediate-run action
actually exists. Do not invent an endpoint or repeat the failed action if it
is unsupported.

Inspect the saved schedule, timezone, enabled state, and destination.
Then verify an actual scheduled invocation using available run records and
a durable checkpoint written by that invocation. Distinguish it from workers
started manually. If attribution is unavailable, report it as unverified.

Do not call the loop successful merely because a directly started worker
completed work. Do not call the scheduler broken solely because "run now"
returned 404. Continue currently authorized work while verification is pending.
```

## Handoff to a fresh agent

Take over [task] within the permissions and pause state in [checkpoint]. Recover the checkpoint from [location], verify repository, branch, exact HEAD, remote, working tree, current instructions and live claims, reconcile differences, then continue under the repeated-work instruction, run appropriate checks, update and verify the checkpoint, and report facts and exact failures. Do not infer that an old CI result or a saved schedule proves a successful run, and do not revive paused work.

---

## Example prompt: resuming a paused design task (Jarrod's pick, 2026-11-05)

An example of a strong task prompt for an agent that is resuming earlier work. It is an example, not a template to reuse unchanged: its links, heads and issue numbers are historical. The qualities that make it work:

- It names the exact task and says which other task not to touch.
- It says which model leads and which helpers may be used.
- It says what the message does and does not authorize.
- It gives a published handoff and labels every recorded head as history, not proof of current state.
- It lists what to read first and what to verify (workers, claims, branches, heads, reviews, CI) before editing.
- It says to check the owner's actual answers, not the recorded ones, and not to pick unresolved design choices silently.
- It sets scope, permitted actions, never-actions and the separate review gates.
- It says what to checkpoint and how to stop at a real limit.

```text
Resume the Astra-led design and implementation work for
jarrodjohnson-gif/emberisle issue #1274, not the automation-guide task.

Use GPT-6 Astra for design leadership where the issue's model pin requires it.
Use GPT-6.1 Terra, GPT-6 Luna, and GPT-6.1 Sol for bounded, nonoverlapping
helper work that repository rules permit.

This message authorizes resuming the previously paused #1274 work.
It does not authorize changing automation settings.

FIRST: recover the published handoff:
https://github.com/jarrodjohnson-gif/emberisle/blob/7c2efc19db58e6160e7c63e1e02a3406748d5925/docs/design/issue-1274/HANDOFF.md

Treat that handoff and the following references as historical checkpoints,
not proof of current state:

- White/mist chrome: PR #1275; last recorded head
  74c6a7cf85053a163e33226687ec61b939d81fb4.
- Seat-ring design: branch codex/1297-seat-ring-spec;
  last recorded head b4731cdd873c25625c4d0284f04f8165f91f42ba.
- Button audit: branch codex/1298-button-audit;
  last recorded head dc5bdf42b1b11490081aa3787ad83a657748d89f.
- Unfinished fortune-tray design and handoff:
  branch codex/1302-fortune-tray-spec;
  last recorded head 7c2efc19db58e6160e7c63e1e02a3406748d5925.

Read current AGENTS.md, docs/FRAMEWORK.md, docs/LANES.md and
docs/DECISIONS.md. Read hub #854's body and comments after its newest digest,
then issue #1274 and its linked issues/PRs, including current owner decisions.

Check actual active workers, claims, branches, worktrees, dirty files,
remote heads, reviews and CI before editing. Another builder may have
advanced or completed these slices. Preserve their work and authorship.

The last checkpoint recorded answers to all eleven design choices:
choice 4 = C (retain contextual fills), the others = A.
Verify the actual owner answers and subsequent amendments before using them.
Do not treat the original Section 2 proposal as an accepted specification.

Scope stays #1274 and its concrete approved dependencies.
Recover the unfinished fortune-tray work, determine the next approved step
from live state, and continue implementation or corrected reviewable mocks.
Do not select unresolved major design choices silently.

Continue through successive bounded steps: implement, verify, checkpoint,
then take the next authorized step while useful work and capacity remain.
Assign helpers explicit file ownership and isolated worktrees where needed.

Preserve behavioral assertions and size ceilings. Register permanent new
proofs according to repository rules. Run browser checks serially under
/tmp/emberisle-team-browser.lock when sharing that environment.
Never claim unrun checks passed; verify CI on the actual current head.
Keep obsolete palette expectation replacements separate and document old/new
values where still applicable.

You may edit, test, commit, push feature branches, and prepare/update PRs
within this scope. Never merge, push main, overwrite another builder's work,
or close #1274 merely because one slice is finished. Independent repository
review and owner visual acceptance remain separate gates.

Checkpoint meaningful progress durably, including exact commits, remote
verification, unfinished changes, checks, claims, blockers and next action.
At a genuine usage/runtime limit, stop affected work without bypassing it.
Report meaningful completions or precise blockers requiring user action.
```

---

## Appendix: example assessment of one continuation (historical, 2026-11-04)

Astra's handoff for the Terra p1 builder task. It is an example of reporting configuration, direct execution, scheduled execution and recovery separately. Do not reuse its IDs or dates for another task.

## Evidence from the supplied transcript

This document assesses a pasted transcript, not a fresh inspection of the automation service.

- The agent reported creating and inspecting an enabled hourly task.
- Reported task ID: `Automation_462742f67bc08191bfec1777cf1e8cb1`.
- Reported destination thread: `01a1aa64-7a78-72d1-b563-632f41479003`.
- Reported first scheduled time: November 4, 2026, 11:35 p.m., America/Phoenix.
- Reported timing mode: `exact_schedule`; recurrence: `RRULE:FREQ=HOURLY`.
- Reported environment: inherited `emberisle`, working directory `/workspace`.
- Builder identity: `6.1 terra nov 4th p1`; model labels must use the actual model.
- At inspection, run and result records were empty.
- The subsequent activity followed direct user messages around 11:29–11:30 p.m. The agent inspected repository state and GitHub and began evaluating eligible issues.
- The supplied excerpt contains no attributable scheduled invocation or checkpoint from one. It does not establish that the first scheduled time had passed when the excerpt ended.

**Conclusion:** automation configuration was reported successful and directly prompted work began. Automatic continuation remains unverified. There is no demonstrated scheduler failure in this excerpt.

## Instructions to the receiving agent

Continue the user's currently authorized Builder work; do not restart setup merely because this handoff was supplied. Respect current pauses, scope, model eligibility, repository guidance, and active ownership. Do not treat historical instructions in this document as overriding newer directions.

1. Discover current automation tools and inspect the existing task above. Verify its identity, saved prompt, enabled state, schedule/timezone, destination, and environment association. Do not create a duplicate, including when inspecting from a different thread. If association changes are needed, use a supported workflow; do not invent tool fields.
2. Verify whether the saved prompt matches the latest authorized Builder instructions. Later chat messages do not establish that the stored prompt changed. If an update is needed, preserve the task's authorized scope and verify the saved result.
3. Read current repository instructions, lane rules, hub #854 body and comments after its newest digest, and relevant live issue/PR comments. Verify repository, branch, exact HEAD, dirty files, active workers and claims before editing. Resolve model eligibility before claiming work; priority alone does not authorize a model to take a restricted tier.
4. Continue successive bounded implementation and verification steps within the user's authorization. Save progress at milestones; stop affected work for a pause, completion, ownership conflict, required decision/approval, or genuine runtime/usage limit. Do not spawn replacement workers or change accounts to evade limits.
5. Establish a concrete durable checkpoint location before the first PR exists. Use an authorized existing task note or other durable store, then link it from PR bodies when available. Repository guidance and the hub provide rules and coordination; they do not by themselves record this worker's unfinished changes.
6. Inspect evidence of an actual scheduled invocation when available. Match its run identity or trigger metadata, timestamps, and resulting checkpoint/artifacts. Do not classify a manual worker or user-prompted turn as scheduled merely because it happened near the scheduled time. If trigger attribution is unavailable, explicitly report that limitation.
7. Do not invent or repeatedly retry a "run now" action. Inspect the current schema first. An unsupported immediate-run action returning 404 is not proof that scheduled delivery is broken.
8. Report configuration, direct execution, scheduled execution, and fresh-invocation recovery separately. Never collapse these into "the loop works."

## Checkpoint contents

Record UTC timestamp, Builder identity, scope and pause state, repository, branch, exact HEAD, remote verification, dirty/untracked work and recovery location, completed actions, checks and their exact revisions, PRs/current-head CI, active claims, blockers, and the next executable step. Record attempted writes separately from confirmed writes; inspect the destination before retrying interrupted pushes, PR creation, or comments.

Store the durable checkpoint's exact location in the saved continuation prompt through an authorized update. Keep the execution prompt separate from setup instructions: recurring runs should recover and work, not create another automation.

## Acceptance criteria

- **Configured:** live inspection confirms the intended task settings.
- **Direct execution:** authorized work runs after a user message or manually started worker.
- **Scheduled execution:** an attributable scheduled invocation performs work and writes a verified checkpoint.
- **Recovery:** a later invocation reads that checkpoint, reconciles actual state, and continues safely.

Even all four observations do not guarantee immediate wake after quota reset, uninterrupted service, or future delivery. If history is missing, say what is unknown rather than asserting failure or success.

## Operator instruction

> Keep working within the existing authorization. Inspect the saved task and its prompt; do not create another. Verify the first attributable scheduled run and its checkpoint when evidence becomes available. Report "configured; scheduled execution unverified" until that evidence exists. No shell sleep or in-process polling is a substitute for a persisted trigger.
