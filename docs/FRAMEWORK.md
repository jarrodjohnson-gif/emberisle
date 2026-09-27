# The Emberisle framework

This is how any AI (or person) takes the project from where it is to 100%.
If this file and another doc disagree, this file wins. [TRACKING.md](TRACKING.md)
is the label and comment protocol that goes with it.

```
Project (100% = two PCs finish a full game over the internet, see "Done" in README)
└── Level (a GitHub milestone, or an issue titled "[L<n>] ...")
    ├── Step 1  Research        label: research        title: [L<n>.1 Research] ...
    ├── Step 2  Code            label: design          title: [L<n>.2 Code] ...
    ├── Step 3  Implementation  label: implementation  title: [L<n>.3 Implementation] ...
    ├── Step 4  Debug           label: test            title: [L<n>.4 Debug] ...
    │     └── Subtask (sub-issue, label: bug)   <- one per error found, unlimited
    │           └── Subtask ... (a subtask may spawn its own subtasks)
    └── (more steps if the level needs them: every step is still one of the four kinds)
```

## The four steps

Every level has **at least four issues**, one per step, done **in order**.
A step cannot start until the step before it is closed.

| # | Step | Question it answers | Output (must be in the repo or the issue) | Done when |
|---|---|---|---|---|
| 1 | **Research** | What is true today? What exists, what is missing, what do the sources say? | A note in `docs/research/<level>.md` (use `_TEMPLATE.md`) with file paths, commands run, and their output. No code changes. | Every "Done when" line of the level can be answered from the note, and each unknown is listed. |
| 2 | **Code** | What exactly do we write? | The code (or design/spec, when the level is a design level) in its own module, plus a small proof script or unit test that runs **without** the rest of the app. | The proof runs with one command and passes. |
| 3 | **Implementation** | Does it work inside the real app? | The step-2 code wired into the host / client / build, and the README "Run it" section updated if a command changed. | The level's "Done when" can be tried end to end with the commands in the README. |
| 4 | **Debug** | Is it actually right? | The level's test run, with pasted output. **Every failure becomes a sub-issue** (see below). | The test passes with zero open sub-issues under this Debug issue. Then the level is 100%. |

GitHub labels are fixed at `research`, `design`, `implementation`, `test` (an AI cannot
create new labels through the connector). So **`design` means step 2 Code and `test` means
step 4 Debug**. The step name is always in the title: `[L13.2 Code] ...`. Milestones 1–12
were made before this file. Their `design` issues are specs (Code in doc form), and their `test` issues
are the Debug step.

A level is one parent issue titled `[L<n>] ...` with the label `level`. Its four steps are
GitHub sub-issues of it. Milestones 1–12 group their four issues by milestone instead.

## Subtasks: infinite, but always tracked

Any step can hit a problem. When it does:

1. **Do not** quietly fix it inside another issue and **do not** stop.
2. Create a sub-issue under the step you are on (GitHub "sub-issue", or write `Parent: #<n>` in the body).
   Title: what is wrong, in one line. Labels: `bug` + `status:todo`.
   Body: the exact command, the exact output, the file and line if known.
3. Work the sub-issue with the same four steps, shortened to lines in the issue:
   `research:` (why it breaks), `code:` (the fix), `implementation:` (where it went in),
   `debug:` (the command that now passes).
4. A sub-issue can have its own sub-issues. There is no depth limit.
5. The parent step closes only when all of its sub-issues are closed.

If a problem is **not** fixable by an AI (it needs Jarrod's PC, his money, his accounts,
or his decision), make it a `Decide:` issue or add `needs:jarrod` / `needs:gaming-pc`,
comment exactly what he has to do, and move on to the next level that does not need it.
Blocked is never a reason to stop working. It is a reason to pick a different level.

## Who can do which level

| Label | Meaning |
|---|---|
| `needs:gaming-pc` | Needs Unreal + the 3.6 GB art pack on Jarrod's gaming PC. A cloud AI must skip it. |
| `needs:jarrod` | Needs Jarrod's answer or account. Comment the question, then skip. |
| none of the above | Any AI with this repo can do it (cloud sessions included). |

## Picking the next thing (every AI, every session)

1. Read [README.md](../README.md) top to bottom. Run the commands in "Run it". If one fails, that is a `bug` sub-issue first.
2. List locks (TRACKING.md step 1). Resume a `status:paused` issue you can finish.
3. Otherwise take the **lowest-numbered level** that has an open step you can do (not `needs:*`),
   and inside it the **first open step** (1 → 2 → 3 → 4).
4. Claim it (TRACKING.md), do it, fill in the output, set the status, close it,
   and set the next step to `status:todo` in the same turn.
5. When you stop, the last line to Jarrod is:
   `Continue Emberisle. Next open issue: #<number>.`

## Level list

The authoritative list is the milestones and `[L<n>]` issues on GitHub. The README
has a snapshot table ("Levels") that the last agent keeps up to date.
