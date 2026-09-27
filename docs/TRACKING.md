# How agents use the tracker

The task list is GitHub Issues on `jarrodjohnson-gif/emberisle`.
Files in this repo explain the game. They are not a to-do list.

The framework (what the steps are and how errors become subtasks) is
[FRAMEWORK.md](FRAMEWORK.md). This file is only the lock protocol.

Levels: milestones `1. Documents` to `12. Download`, then `[L13]`, `[L14]`, and so on as parent issues.
Each level has four steps, in order: Research (`research`), Code (`design`),
Implementation (`implementation`), and Debug (`test`). Errors become `bug` sub-issues.
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

No `gh`? (Cloud sessions have none.) Use the GitHub connector: `issue_write` with `method: update` and
the full new `labels` list, then `add_issue_comment`.

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

2. A `status:paused` issue stays claimed. Resume it if you can do its `left:` line. If you cannot, leave it paused. Do not start an issue that needs that deliverable. You may claim a later issue whose source is already in the repo and whose work does not need the paused deliverable.
3. Otherwise skip every issue in that lock list, and skip an issue whose `files:` overlap a lock.
4. The next issue is the lowest-numbered open issue in the earliest milestone that is `status:todo` and whose `Depends on` issues are closed.
5. Read it again. If the label is no longer `status:todo`, stop. Someone beat you.
6. Set `status:claimed` and write the claim comment. Read it once more. If an older `claimed:` comment names someone else, remove your label and stop.
7. Set `status:in-progress` when the first edit starts.

When the completion test passed, set `status:done`, close the issue, and set the next issue to `status:todo` in the same turn. Do not stop to wait.

Do not delete, overwrite, or bulk-move files. Push only to your own branch and open a PR. Jarrod merges.

When a chat is long or a task finishes, give him one line:

`Continue Emberisle. Next open issue: #<number>.`
