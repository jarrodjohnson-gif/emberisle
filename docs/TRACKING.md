# How agents use the tracker

The task list is GitHub Issues on `jarrodjohnson-gif/emberisle`. Files in this repo explain how the game works. They are not a to-do list. Do not add tasks to a markdown file.

Milestones are the stages, in order: `1. Documents` through `12. Download`. Each milestone's description is its one-line job.

Each stage has four issues, labeled in order: `research`, `design`, `implementation`, `test`. A decision is its own issue titled `Decide: ...`. A bug is an issue with the `bug` label.

## Status

The board status, once a Project exists, is:

Backlog → Todo → In Progress → In Review → Done, plus Canceled.

- Backlog: known, not scheduled.
- Todo: picked for now.
- In Review: built, waiting for Jarrod.
- Done: he accepted it. Close the issue.

Until the Project board exists, treat the open issues as the list. Do not invent a second status inside a file.

## What to do next

If nobody named a project: this repo is the only one. Do not start a second.

Next issue:

1. An issue already In Progress, if you claimed it or the claim is yours.
2. Else the lowest-numbered open issue in the earliest open milestone whose `Depends on` issues are all closed.

## Claiming

Re-read the issue. If a comment starts with `claimed:` and the issue is In Progress, skip it. Otherwise comment `claimed: <name>, <date>` and start. Never work two issues that edit the same file.

## Done

Comment one line: what changed, and how to test it. Move the issue to In Review if you cannot close it yourself. Close it only when the completion test in the issue passed and Jarrod has accepted it, or when he already said to close this kind of step.

A new real step becomes a new issue under the right milestone. An idea goes in `docs/IDEAS.md` first, and becomes an issue only after Jarrod says to build it. Then mark the idea `→ #<number>`.

Do not delete, overwrite, or bulk-move files, and do not push, unless he asked for that in this chat.

When a chat is long or a task finishes, give him one line he can paste into a new chat:

`Continue Emberisle. Next open issue: #<number>.`
