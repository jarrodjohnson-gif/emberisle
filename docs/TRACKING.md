# How agents use the tracker

The task list is GitHub Issues on `jarrodjohnson-gif/emberisle`.
Files in this repo explain the game. They are not a to-do list.

Milestones are the stages, in order: `1. Documents` through `12. Download`.
Each stage has four issues: `research`, `design`, `implementation`, `test`.
A decision is an issue titled `Decide: ...`. A bug gets the `bug` label.

Several people may work at once. The labels are the lock. A comment that
does not match the label does not count.

## The one status label

Every open issue has exactly one of these. When you change status you MUST
remove the old one and add the new one in the same minute as the comment.
If you only comment, you have not taken the issue. Someone else may take it.

| Label | Write this in the comment | Meaning |
|---|---|---|
| `status:backlog` | `status: backlog` | Known. Not available. |
| `status:todo` | `status: todo` | Available. Nobody has it. |
| `status:claimed` | `status: claimed` | Named, not editing yet. |
| `status:in-progress` | `status: in-progress` | Editing now. |
| `status:paused` | `status: paused` | Stopped. The claim is kept. |
| `status:failed` | `status: failed` | The completion test failed. |
| `status:in-review` | `status: in-review` | Built. Waiting for Jarrod. |
| `status:done` | `status: done` | Accepted. Then close the issue. |
| `status:canceled` | `status: deleted` | Will not do. This is "deleted". Do not delete the issue. |

`mark:changed` is separate. Add it, and do not remove it, once any file was edited for this issue.

## What you must write

Claim, before any edit:

```
claimed: <name>, <YYYY-MM-DD>
status: claimed
files: <paths, or none>
```

```
gh issue edit <N> --repo jarrodjohnson-gif/emberisle --remove-label status:todo --add-label status:claimed
```

Start editing:

```
status: in-progress
```

Pause (you are stopping, work is not finished):

```
status: paused
changed: <one line, or nothing>
left: <what is unfinished>
```

The completion test failed:

```
status: failed
changed: <one line, or nothing>
broke: <what failed>
```

Ready for Jarrod:

```
status: in-review
changed: <one line>
test: <how to verify>
```

He accepted it:

```
status: done
changed: <one line>
test: <how you know>
```

Then close the issue. Do not close it while the label is still `status:in-progress`.

Dropping the task:

```
status: deleted
reason: <why>
```

The label for that comment is `status:canceled`.

## How to take an issue

1. List locks:

```
gh issue list --repo jarrodjohnson-gif/emberisle --state open --limit 100 --search "label:status:claimed OR label:status:in-progress OR label:status:paused"
```

2. Skip any issue in that list. Also skip an issue whose `files:` overlap a lock.
3. The next issue is the lowest-numbered open issue in the earliest milestone that is `status:todo` and whose `Depends on` issues are closed.
4. Read it again. If the label is no longer `status:todo`, stop. Someone beat you.
5. Set `status:claimed` and write the claim comment. Read it once more. If an older `claimed:` comment names someone else, remove your label and stop.
6. Set `status:in-progress` when the first edit starts.

When you finish, move the next unblocked issue in that milestone from `status:backlog` to `status:todo` if it is not already taken. Do not start it in the same minute if its `files:` would overlap yours.

Do not delete, overwrite, or bulk-move files, and do not push, unless Jarrod asked in this chat.

When a chat is long or a task finishes, give him one line:

`Continue Emberisle. Next open issue: #<number>.`
