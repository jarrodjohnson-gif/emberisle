# Looping guide for cloud agents

**Opt-in only.** This is not a standing rule and is not part of the default agent reading list. Use it only when Jarrod's prompt for your task says the task should loop (repeat across resets). If your task prompt does not say to loop, do not create automations: creating or changing an automation needs Jarrod's authorization. Every task, looping or not, still needs a handoff (the issue, PR body, claims and checkpoint it names), so read it as usual. Nothing here changes `AGENTS.md` (never merge, claim before you code, the open-PR limit, `To desk:` for the desk). First written at Jarrod's direction on 2026-11-05. Rewritten on 2026-11-09 from the fuller Codex guide Jarrod supplied.

This guide explains how to arrange repeated, authorized coding work that can recover from a reset. It is a design and operator guide; it does not create, enable, disable, or run an automation. Replace every placeholder with values for your own task. An automation for one project must not be reused for another by copying its ID.

## What persists, and what does not

Four pieces must work together:

1. **A persisted trigger:** a platform automation schedules a new invocation. A shell process, `sleep`, cron inside a disposable workspace, or an `AGENTS.md` instruction to “never stop” is not the same thing.
2. **The intended thread and environment:** the task must be associated with the right context and configured environment. Verify what the platform actually saved.
3. **An execution prompt:** each invocation must ask the agent to do an authorized unit of work, recover state, verify it, and record progress. A reminder alone does not authorize or specify implementation.
4. **A durable checkpoint:** the next invocation must be able to locate the task, branch, exact state, constraints, and next action without relying on a previous process's memory.

The available automation tools support persisted schedules, an enabled flag, private inspection, and recorded run details. The most frequent scheduled recurrence is hourly. They do not establish an immediate wake on quota reset, guaranteed execution or delivery, unlimited usage, or an exemption from approvals. A schedule is an opportunity to run, not proof a run succeeded. A reset can destroy process memory and local-only files. Durable remote state is useful only if it is actually saved, accessible, and verified.

**Evidence labels:** Tool descriptions establish the available fields and documented behavior. Creating from the intended thread and then inspecting the association is a practical workflow inferred from the create schema, which does not expose thread or environment selectors. Availability of a specific environment, immediate wake, quota behavior, runtime capacity, and delivery success must be observed in your own setup; they cannot be guaranteed by a prompt. Tool names and capabilities can change, so inspect current tool descriptions before use.

## A–Z setup

### Quick diagnostic: can this agent actually provide the mechanism?

Check automation capability separately from coding capability. An agent may have working automation tools while its shell is unavailable, or a working shell with no platform automation tools. Neither capability proves the other exists.

The observed tools were `mcp__codex_apps__automations_create`, `mcp__codex_apps__automations_peek`, `mcp__codex_apps__automations_update`, and `mcp__codex_apps__automations_list`. Other clients may expose different names or none. Inspect the actual available tools and their descriptions. If creation is unavailable after supported tool discovery, say exactly that: a prompt, shell command, or invented tool name cannot supply the missing platform capability. Use the client's supported setup route if available; otherwise explain the gap without pretending a timer has been created.

Conversely, do not call an entire environment unsupported merely because one command failed. Report which layer is missing: automation tool, thread association, execution environment, repository access, dependencies, or authority. The decision tree below diagnoses those layers separately.

### Verified example, not a new setup

The original task was saved as **Build Emberisle issue 1274**, ID `6aea00ab36ec8191975a7fe06d6415aa`, with `is_enabled: true`, `timing_mode: exact_schedule`, `default_timezone: America/Phoenix`, and `environment_selection: inherited`. Its saved environment had working directory `/workspace` and a destination Codex thread. Its historical VEVENT began `20261103T120100` in America/Phoenix and used `RRULE:FREQ=HOURLY`. Do not reuse this ID or historical date for another task.

A later read exposed a last-run timestamp, but `next_run_time`, `run_details.last_run`, and `run_details.latest_result` were null and delivery status was unknown. That verifies saved configuration and a recorded timestamp, not successful execution, automatic quota-reset detection, or guaranteed delivery. No timer settings were changed while preparing this guide.

### 1. Define the authority and stopping boundaries

Decide the repository, issue, expected deliverable, allowed branch and files, checks, whether commits, pushes, draft PRs, or external communication are authorized, and what requires a fresh decision. Provide a durable source of task instructions and a checkpoint location. A recurring instruction preserves the scope you gave; it is not blanket permission to alter accounts, infrastructure, production, or unrelated repositories. Later user instructions can pause or narrow it.

Choose the intended thread and attach/configure the intended execution environment through the available environment workflow. In a managed cloud environment, use the runtime's environment status tool. Its reported instance is the thread's managed instance; do not substitute an old instance ID if no environment is attached. Configuration changes go through the environment configuration workflow and its user review. If a Connect, Reconnect, installation, or approval flow appears, stop for that flow; do not bypass it.

### 2. Ask for an actual automation

A concrete request to the assistant could be:

> In this thread, create an hourly automation starting at [future local time] in [IANA timezone] to continue [repository and issue] within the scope and permissions below. On each run, follow the continuation prompt and checkpoint at [durable location]. Inspect the created task and report the saved schedule, enabled state, thread and environment association, and any missing details. Do not deploy, contact people, or change infrastructure without separate authorization. [Insert task scope, allowed actions, and stop conditions.]

Choose a time in the future using your personal timezone, not the machine's timezone. The following is a **parameter illustration, not an executable call**; substitute a real future date and timezone and replace the prompt. `exact_schedule` fits an explicit clock time or exact cadence. Flexible dayparts use `flexible_schedule`; a polling condition watch uses `condition_watch` and a recurring schedule.

```yaml
title: Continue Example Issue
prompt: "Resume the authorized work on [repository/issue] using [checkpoint location] and the agreed continuation instructions."
schedule: |
  BEGIN:VEVENT
  DTSTART;TZID=<IANA_TIMEZONE>:<FUTURE_LOCAL_YYYYMMDDTHHMMSS>
  RRULE:FREQ=HOURLY
  END:VEVENT
timing_mode: exact_schedule
default_timezone: <IANA_TIMEZONE>
```

The tool expects a VEVENT, with no `SUMMARY` or `DTEND`. An end date or count for a recurring schedule belongs in `RRULE` as `UNTIL` or `COUNT`. Relative one-time requests use `dtstart_offset_json` when supported, an empty schedule, and `exact_schedule`. Do not request more than hourly scheduled invocations. This example is a coding task, not a condition watch. A supported webhook is a separate, connector-specific feature; do not assume it signals usage reset or substitute polling for an explicitly requested event.

The exposed create call accepts title, prompt, schedule, timing mode, and optional timezone/offset. It does not expose thread or environment inputs in this version. Create from the intended thread and inspect the returned association; do not assert that inheritance worked without evidence. Only create an automation when the user has authorized future work.

### 3. Give each invocation a continuation prompt

Adapt this prompt, including the specific scope and permissions, before use:

```text
Continue the authorized work on [repository, issue, and intended outcome] in
[environment and expected working directory]. The durable checkpoint is
[location and retrieval method]. Allowed actions: [specific actions]. Do not
[explicit exclusions]. Respect all later user instructions, including a pause;
a stale scheduled prompt does not override them.

At startup, inspect current instructions and the checkpoint, verify the actual
workspace, branch, exact HEAD, remote and working tree, and identify active
workers and claims before editing. Reconcile the checkpoint with observed state;
do not assume either is current. If another run owns the same work, avoid
colliding and report the overlap. If paused or complete, do no repository work.

Choose one useful bounded next step within scope. Diagnose a claimed blocker
with narrow checks, preserve policy and approval boundaries, and continue
independent authorized work when possible. Never print secrets. Run the checks
appropriate to the change and report actual results and exact failures. Verify
CI against the current commit, distinguish required from advisory checks using
repository policy, and never call an unrun check passed.

Before stopping, update the durable checkpoint with the observed state, exact
commit and remote verification, checks, unresolved blockers, active claims,
and next action. Save or publish it only as authorized, then verify where it
can be recovered. Report what was accomplished and what remains. Do not use
new workers, alternate credentials, routes, or retries to evade a limit or an
explicit denial.
```

This prompt is a template, not a replacement for the repository's instructions or user decisions. A task requiring a decision, interactive approval, or missing authority must stop at that boundary and explain the concrete next step.

### 4. Verify creation and later execution

After creation, inspect the returned success/error and task ID, then privately inspect the specific task with `automations_peek` when necessary. Record the ID in a safe handoff for this task only. Check the title, prompt, schedule, timezone, timing mode, enabled state, thread ID and environment selection, environment configuration and working directory where provided. `inherited`, `explicit`, and `none` describe the saved selection; null details mean unknown and an empty environment list means none attached. An environment marked connected is not evidence a past run executed there. If the association is missing or wrong, resolve it through the supported thread/environment configuration workflow and its user review, then inspect again. The exposed update schema also has no thread, environment, or timing-mode input. If the available workflow cannot make the change, report that capability gap; do not invent parameters.

On a later invocation, inspect the recorded run and latest result, timestamps, status, and any `requires_user_action` flag. A last-run timestamp by itself is not success; null or missing run/result/next-run fields and `delivery_status: unknown` do not prove success, failure, or that the task never ran. `in_progress` is recorded automation state, not a list of live worker processes. Open the actual run where available and verify its checkpoint and artifacts. If the tool returns an error, report it instead of claiming creation or execution succeeded. Use task listing when the user asks to view tasks; use private lookup for a specific task.

### 5. Acceptance test for your own setup

This is a proposed test, **not a claim that this guide ran it**:

1. With authorization, create a limited, safe scheduled task in the intended thread and inspect its saved settings as above. Pick a future time and a small reversible task.
2. Allow a scheduled invocation to occur; inspect its recorded result and actual run. Confirm the intended environment and working directory from observations inside the run, without exposing secrets.
3. Verify that the run wrote a checkpoint to the agreed durable location, and independently read it back. Confirm that it identifies its exact work and next action.
4. In a fresh invocation, recover from that checkpoint and reconcile it with the actual repository state. Confirm that it avoids duplicate or conflicting work and respects the current pause state.
5. Test a stop instruction and, separately, a schedule pause only when authorized. Verify the relevant task or worker state; do not infer one from the other. Document any unavailable evidence or failure and fix the underlying setup through supported controls.

## Checkpoint template

Keep a checkpoint outside ephemeral process memory; use an agreed durable repository or other authorized store. Avoid secrets, tokens, private environment dumps, and sensitive IDs that are not needed. A local copy can help, but verify a remotely recoverable copy if recovery may occur in another environment. Do not commit unrelated work, blindly commit everything, or push without authorization.

```markdown
# Work checkpoint — [task] — [UTC timestamp]
- Scope, owner, current user instructions and pause state: [...]
- Repository and canonical remote: [...]; branch: [...]
- Exact HEAD: [...]; remote branch/commit verified at [time]: [...]
- Working tree and uncommitted/untracked work: [...]
- Completed and evidence/artifact links: [...]
- Remaining work and ordered next action: [...]
- Checks: command or check name, exact commit, result and relevant failures: [...]
- PR and current-head CI links/status, required versus advisory per policy: [...]
- Active workers, ownership/claimed files, branch/worktree and last observation: [...]
- Blockers: exact error, attempted narrow checks, permitted next action: [...]
- Environment and recovery instructions: [configuration name, expected cwd, safe retrieval steps]
- Automation ID and enabled state, if needed for this task: [...]
- Permissions and decisions still needed: [...]
```

Check `git status`, branch, `git rev-parse HEAD`, and the actual remote state before recording them. Verify any push and remotely accessible checkpoint rather than assuming a command completed. Do not overwrite someone else's uncommitted changes. For a different thread or environment, explicitly locate and recover the checkpoint and reconcile it against the remote; neither local files nor conversation memory are guaranteed to follow.

## Deterministic startup and resume

1. Read current user instructions and applicable repository guidance; a later pause takes precedence over an older automation prompt. Identify scope and permitted actions.
2. Check whether an environment is attached and ready. If a selected environment is explicitly marked `starting` and its files or commands are needed, use `wait_for_environment` with that exact selected ID. Continue independent connector work if available; do not wait unnecessarily. If startup fails, report it and continue what is possible.
3. Locate the checkpoint and repository; verify directory, mount, repository identity, branch, HEAD, remote, and working tree. Check for user changes and current upstream state. Reconcile discrepancies before editing.
4. Inspect actual live workers using the collaboration tool when available, and compare their claims with the checkpoint. Agent names in old context can be stale. Shared filesystems require explicit file ownership, isolated branches/worktrees where useful, and coordination. Spawn helpers only when authorized or otherwise permitted by current instructions; model-specific overrides require the appropriate supported configuration. Do not spawn replacements to bypass quotas.
5. If the task is paused, completed, already owned by another active run, or lacks necessary authority, stop the affected work. Otherwise choose a bounded next action. Preserve genuine approval, authentication, and network policy boundaries.
6. Implement and verify only within scope. Check CI for the actual current head: an old failure does not prove the new head failed, and an old pass does not prove the new head passed. If CI is stale, use the repository's normal supported process; do not manufacture empty commits or retry endlessly to conceal failure. Independent review and owner acceptance remain separate from CI.
7. Save an accurate checkpoint and report actual results, remaining work, and the precise blocker, if any. Confirm the durable location is readable. Never claim a test, deployment, or review occurred without evidence.

## Diagnose “environment not set up”

First capture the exact operation, sanitized error, time, and whether it is local execution, network, authentication, or an approval. A vague label is a starting hypothesis, not a diagnosis. In managed cloud environments, consult the runtime status at startup and for network/authentication failures. Before network work, read its networking guidance and inspect the policy snapshot `/etc/codex/network-policy.json`. Preserve inherited proxy, CA trust, authentication headers, and guard variables; never print credential values, dump the environment, or read secret files. Ready observations require `observations_current: true` and the individual state `ready`; network policy must be `enforced`. Even then, readiness does not guarantee a specific command or API is authorized.

### Decision tree

1. **No managed environment attached?** Confirm current thread status. Do not reuse a previous instance ID. Request or use the supported environment configuration and user-review workflow; proceed with independent available connector work.
2. **Selected environment starting?** If needed, wait on the exact selected environment ID. If startup fails, report the specific failure and perform independent work if possible.
3. **Ready/connected but command transport fails?** Run one minimal supported command and capture the sanitized transport error. Configuration readiness and executor transport are different. Retry normally on a later invocation if appropriate; do not repeatedly replace workers or assume readiness proves command execution.
4. **Command works but directory or mount is wrong?** Inspect `pwd`, directory listing, and repository identity without exposing secrets. Locate the configured workspace; if absent or detached, use the supported configuration workflow. Do not clone or overwrite blindly.
5. **Repository exists but Git access fails?** Distinguish local repository identity from remote authorization with a narrow read-only operation. Check readiness and intended identity configuration, not secret values. Use the existing configured client; if identity or setup is missing, request the supported connection/configuration step.
6. **Network command fails?** Inspect the sanitized exact error, enforced policy and runtime status. Distinguish proxy/transport failure, DNS/TLS, service authorization and explicit policy denial. Preserve proxy and CA settings. Use a sanctioned escalation only when appropriate; a policy denial requires the configuration workflow, not alternate routes or credentials.
7. **Dependencies or browser missing?** Inspect repository instructions and installed tools. Install the project's appropriate dependencies only within authorization and network policy. A documented system-browser fallback may support a check, but record the actual browser and limits; a screenshot or prototype check is not production proof.
8. **Interactive Connect/Reconnect/approval?** Stop at the prompt, explain the exact requested action, and wait for the user or authorized workflow. Do not bypass it.
9. **Quota or capacity exhausted?** Record the actual message, save progress if possible, and wait for the next available authorized invocation. There is no verified special immediate wake on reset. Do not launch substitute workers or accounts to evade a limit.

| Observation | Narrow check | Permitted remedy | Ask the user when |
|---|---|---|---|
| No attached environment | Current thread's runtime status | Use supported configuration workflow; work independently where possible | Attachment/configuration requires their review or choice |
| Startup pending or failed | Selected ID and status; startup error | Wait only for the needed selected environment; report failure | Configuration or approval is needed to fix it |
| Executor transport disconnected | Minimal supported command and exact error | Retry normally when appropriate; retain checkpoint | Service/configuration intervention is needed |
| Wrong directory or missing mount | `pwd`, safe listing, repository identity | Locate correct configured workspace; preserve existing files | Required mount or environment selection needs user configuration |
| Git credential/authorization error | Read-only remote operation and readiness for intended identity | Use configured CLI and supported connection workflow | Reconnect, account choice, or authorization is required |
| Network/proxy or policy error | Exact error; current enforced policy and status | Preserve proxy/CA; supported configuration or approved escalation | Explicit denial or approval requires user action |
| Missing package or browser | Repository setup instructions and installed version | Authorized normal dependency setup or recorded supported fallback | Installation or access exceeds authority, or a required choice is unresolved |
| Approval prompt | Record the requested action and reason | Stop and follow the approval flow | Approval or connection must be provided |
| Quota/capacity | Actual platform message and task state | Checkpoint and retry at an available authorized invocation | A plan/account decision or other user action is required |

For managed cloud identity selection, the runtime guidance permits reading the non-secret manifest at `OIC_MANIFEST_PATH` if present, selecting the intended configured alias, and using its documented selectors for the command. Do not inspect credential contents, invent aliases, substitute credentials, or start interactive login simply because a token is not visible. The runtime status describes the managed instance and configured HTTP/credential readiness, not VPN health or every authorization outcome. Read its relevant networking, VPN, or Docker references when those operations are actually needed.

Copy/paste this instruction when an agent gives a vague blocker:

```text
Before declaring this blocked, identify the exact failed operation and sanitized
error. Check the current environment attachment/readiness, the minimum local
command or repository state needed, and the relevant network or identity status.
Separate observed facts from assumptions. Continue independent authorized work,
then tell me the precise supported action or approval needed. Preserve policy,
proxy, credentials, and approval boundaries; do not print secrets or bypass limits.
```

## Stop, pause, resume, and overlapping runs

A direct instruction to stop current work or pause a repository scope applies immediately; a stale scheduled prompt cannot override it. Stopping the present turn is distinct from disabling future scheduled invocations. Pausing the automation requires a separately authorized update of that task's `is_enabled` flag; inspect the result. For example, the update arguments `{ "jawbone_id": "<THIS_TASK_ID>", "is_enabled": false }` illustrate a pause and have not been executed by this guide. Use the actual ID for the intended task only. Cancelling or stopping active subagents is another distinct action and should be confirmed from live worker state. Disabling a future schedule alone does not establish that an already running worker stopped. Resuming must honor the latest user instruction and current state.

No magic wording is required: a clear request to cancel or pause the recurring automation authorizes disabling its future runs. A request not to resume repository work while discussing its setup does not necessarily cancel the schedule. Interpret the user's actual intent, state what was stopped, and never ask again for authorization already given. To resume a saved automation, the corresponding supported update is `is_enabled: true`; inspect it again rather than creating a duplicate.

For repeated work, save checkpoints at milestones and before long or risky operations, not only at a planned final response. An abrupt process failure may prevent a final checkpoint. Reconcile Git, existing artifacts and active workers on recovery; incomplete checkpoint text is not permission to repeat side effects.

In the observed case underlying this guide, stale automation prompts continued to arrive after a direct pause of repository work; the agent respected the pause, and the schedule was not disabled without a separate instruction. Schedules can overlap or arrive after a pause. At each start, check the latest instructions, checkpoint, and actual workers; avoid duplicate side effects and conflicting file ownership. A checkpoint claim is a coordination aid, not an atomic distributed lock; use a real supported lock when concurrent operations require one, and verify ownership. Where a project prescribes a local lock for shared browser work, use it only within its actual scope; a machine-local lock does not coordinate separate machines. Do not assume a stale claim is live or remove it without checking.

## Handoff to a fresh agent

```text
Take over [task] only within the permissions and current pause state in
[checkpoint]. Recover the checkpoint from [durable location], then independently
verify the repository, branch, exact HEAD, remote, working tree, current user
instructions, and live worker claims. Reconcile any differences before editing.
Use the deterministic resume and blocker diagnosis in [guide location].
Continue one bounded authorized step, run appropriate checks, and update and
verify the durable checkpoint. Report facts, exact failures, and the next action;
do not infer that an old CI result or a saved schedule proves a successful run.
If access, approval, or scope is missing, complete independent work and state
the precise supported action needed. Do not bypass limits or revive paused work.
```

## Emberisle builder loop (ready to paste)

Use this to start a looping Builder in a Codex thread. Replace the one bracketed time. It follows the steps above and adds the repository rules from `AGENTS.md`.

```text
In this thread, create an hourly automation starting at [FUTURE LOCAL TIME]
in America/Phoenix to continue Emberisle builder work in
jarrodjohnson-gif/emberisle within the scope and permissions below. Inspect
the created task and report the saved schedule, enabled state, thread and
environment association, and any missing details. Do not deploy, contact
people, or change infrastructure without separate authorization.

First run the quick diagnostic from docs/LOOPING.md and check automations_list
for an existing matching task so you do not create a duplicate.

Create it with title "Build Emberisle", timing_mode exact_schedule,
default_timezone America/Phoenix, and a VEVENT with DTSTART;TZID=America/Phoenix
set to the future local time and RRULE:FREQ=HOURLY (no SUMMARY, no DTEND).
Then inspect it with automations_peek.

Automation prompt:
Continue the authorized work on jarrodjohnson-gif/emberisle as a Builder. The
durable checkpoint is the status comment on the issue you are working plus your
PR body. Allowed: read the repo, edit, run checks, commit, push feature
branches, open ready (not draft) PRs, post /claim, Question: and To desk:
comments. Do not: merge, push to main, force-push, skip or loosen a test, move
a size ceiling or allowance, make design decisions, create other automations,
or ask Jarrod questions in chat. Respect any later pause. At startup read
AGENTS.md, docs/LANES.md and docs/DECISIONS.md and hub issue #854 (body, then
comments after the newest Hub digest), and do any direction that names you.
Handle your own open PRs first (desk comments, CI on the exact current head).
Then take the top eligible issue by prio:p0, p1, p2. Build only with the
issue's model: label, and skip it if you cannot run that model (a tier: label
says which models may take it). Claim before you code with a comment:
/claim, claimed: <your agent name>, <date>, files: <paths>. One issue per PR,
at most 4 open PRs. Register every new proof in package.json and ci.yml. Run
long browser proofs one at a time and paste real output in the PR. A Question:
is not a stop: finish what does not need the answer, then take the next issue. Follow the continuation prompt and the
deterministic startup and resume steps in docs/LOOPING.md. If the fallback
ladder in docs/LANES.md and the anytime queue are empty, post one
"To desk: nothing eligible" on #854.
```

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
