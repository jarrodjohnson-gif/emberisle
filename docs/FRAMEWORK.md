# The Fractal Build

How work is organized on Emberisle. It is written for any AI, whether it has five minutes left
or no limit at all, and for Jarrod. **The GitHub tracker is the task list.** Files in this repo
explain how the game and the code work. They never hold a to-do list.

## 1. The idea in one picture

Every piece of work is a **node**. Every node runs the same four steps, in order:

| # | Step | Question | Output |
|---|---|---|---|
| 1 | **Research** | What is true? What does this node need? | A note (`docs/research/<topic>.md`, or the issue comment if it is short). It also **files the child nodes** it found. |
| 2 | **Design** | What exactly will we build? | A spec (`docs/design/<topic>.md`), or the interface and test plan in the issue. |
| 3 | **Implementation** | Build it. | Code plus a proof script or test, in a pull request. |
| 4 | **Testing** | Is it right, from a fresh clone? | The test command and its pasted output. Each failure becomes a **Bug** child node. |

Research is the step that grows the tree. When Research on a node finds that the node is really
several pieces, each piece becomes a child node, and each child runs the same 1-2-3-4.
Children can have children. There is no depth limit.

```
Dice randomizer                                 (a node from the build plan)
 ├─ 1 Research ─► finds 3 pieces, files them as children:
 │    ├─ Server RNG ........ 1 Research · 2 Design · 3 Implementation · 4 Testing   ← leaf
 │    ├─ Fairness proof .... 1 · 2 · 3 · 4                                           ← leaf
 │    └─ Dice animation .... 1 Research ─► finds: mesh, snap-to-face, sound
 │          ├─ Mesh ............ 1 · 2 · 3 · 4
 │          └─ Snap-to-face .... 1 · 2 · 3 · 4 …
 ├─ 2 Design          (the parent's own design ties the children together)
 ├─ 3 Implementation  (wires the finished children into the game)
 └─ 4 Testing         (the parent's test: the whole feature works)
```

Established names for the same idea: a Work Breakdown Structure (project management), a
Hierarchical Task Network (AI planning), and the spiral model (software).

## 2. Three rules that keep the tree honest

1. **Stop rule.** A node stops splitting when one person or AI can do all four steps in **one
   session, and in one pull request with one test**. That node is a **leaf**, and it is simply built.
2. **Just in time.** Research files only the **next** layer of children, in Backlog. Nobody
   pre-generates empty issues. The tree grows where work actually reaches.
3. **Done means runs.** A Testing step is done only when its command passes **from a fresh clone**,
   and the output is pasted in the issue. A test that "should pass" is not done.

## 3. Sized for any AI

Every issue says its size in the body:

| Size | Meaning | Good for |
|---|---|---|
| `Size: XS` | Under 15 minutes. One file, or one note. | An AI with almost no limit left |
| `Size: S` | One session, one PR | Most steps |
| `Size: M` | Too big. Split it with a Research step first. | Nobody; split it |

- **Small limit left?** Take one `XS` or `S` step. If you run out mid-step, leave the pause
  comment (section 7). The next AI resumes from it. Half-done work is fine if the comment says exactly where it stopped.
- **No limit (Cursor, a long session)?** Loop: finish a step, set the next one to Todo, take it, and repeat,
  top to bottom through the earliest milestone. Stop only when nothing is Todo, or everything left is
  `needs: jarrod` or `needs: gaming-pc`.

## 4. How it maps onto GitHub

| Framework | GitHub |
|---|---|
| Project (one goal, a start and an end) | This repo plus one GitHub **Project** board, "Emberisle" |
| Stage, in order | **Milestone** named `<n>. <Stage>` with a one-line description of its job |
| Node | **Issue**, filed under the milestone of its stage |
| Child node | **Sub-issue** of the parent issue (GitHub allows 8 levels and 100 children per issue) |
| Step (1-4) | Its own issue. Title starts with the step verb. Label `research`, `design`, `implementation`, or `test`. |
| Decision | Issue titled `Decide: ...`. Anything waiting on it says `Depends on: #N`. |
| Bug | Issue with the label `bug`, as a sub-issue of the step that found it |
| Status | The Project **Status** field (section 6) |

There is no "seed" or "master" issue. The README says what the project is, and the issues say what is next.
A parent node with sub-issues is fine. It is a real piece of the game, not a list of everything.

## 5. Issue format

**Title:** imperative and specific, starting with the step:
`Research how Unreal opens a socket`, `Design the glow and click-to-place flow`,
`Implement the host-button connection`, `Test twenty rolls against the server log`.

**Body:**

```
## Deliverable
What exists when this is done (a file, a function, a screen, a note).

## Completion test
How we know. A command and its expected output, or an exact thing to look at.

## Depends on
#N, #M (or: none)

## Source
file:line, or a doc section this came from (for example docs/BUILD_BIBLE.md §6)

Size: XS | S
```

Add `needs: jarrod` (his decision, account, or money) or `needs: gaming-pc` (Unreal, or the 3.6 GB art pack)
on its own line when an AI cannot finish it. Those issues still get Research and Design done by any AI.

## 6. Statuses

`Backlog → Todo → In Progress → In Review → Done`, plus `Canceled`.

| Status | Meaning |
|---|---|
| Backlog | Known, not scheduled. Research files new children here. |
| Todo | Picked for now. Any AI may take it. |
| In Progress | Claimed. Someone is on it. |
| In Review | Built and tested. Waiting for Jarrod to accept. |
| Done | Accepted. The issue is closed. |
| Canceled | Will not do. Close the issue as "not planned". Never delete it. |

The Project board's Status field is the truth. **An agent whose tools cannot set Project fields** (the
GitHub connector in cloud sessions cannot) uses the matching label (`status:backlog`, `status:todo`,
`status:in-progress`, `status:in-review`, `status:done`, `status:canceled`) and says so in its comment.
Jarrod's board automation, or the next agent with `gh`, syncs the field from the label.

## 7. Workflow rules for every AI

**"What's next?" with no project named:** list Jarrod's projects as numbered options (In Progress
first, then on hold), each with its next open issue, and ask which one. Do not start until he picks.

**Next open issue** = one already In Progress that you can resume (read its last pause comment);
otherwise the first **Todo** in the **earliest milestone**, lowest step first (1 → 4), skipping
anything whose `Depends on` is still open.

**Claim:**
1. Re-read the issue. If it is In Progress with a `claimed:` comment from someone else, skip it.
2. Never take an issue whose files overlap an In Progress issue's files.
3. Move it to In Progress and comment:
   ```
   claimed: <AI name>, <YYYY-MM-DD>
   files: <paths you expect to touch, or none>
   ```

**Pause** (out of limit, or blocked):
```
paused: <AI name>, <YYYY-MM-DD>
done so far: <one line>
left: <exactly what is unfinished, and the next command to run>
```
Leave it In Progress. The next AI resumes from `left:`.

**Finish:**
```
changed: <one line>
test: <command> → <result>
pr: #<n>
```
Move it to In Review (Jarrod accepts it, then it goes to Done and is closed). Then set the next step to Todo.

**Found something along the way?** A real new step becomes a new issue under the right milestone
(a sub-issue if it belongs to a node). An idea goes in [IDEAS.md](IDEAS.md), not in the tracker.

**Every change goes through a pull request.** Push to a branch, open a PR, and CI (`.github/workflows/ci.yml`)
runs the README "Run it" checks. Only green PRs are merged, and only Jarrod merges.

**End of a chat, or a finished task:** give Jarrod one line to paste into a new chat:
`Continue Emberisle: take the next open issue per docs/FRAMEWORK.md.`

**Ask Jarrod before:** deleting, overwriting, or bulk-moving files; pushing to `main`; and anything
outward-facing (posting outside this repo, sharing links, or spending money).

## 8. Ideas vs issues

Ideas live in [IDEAS.md](IDEAS.md), never straight in the tracker. When Jarrod decides to build one:
1. Create a node issue for it under the right milestone (or a new milestone, if it is a new stage), in Backlog.
2. Give it its `Research ...` step issue, in Todo. That is enough: Research files the rest.
3. Mark the idea line `→ #<issue number>`.

## 9. External bug logs

If bugs live in an outside log, do not copy each one. Make one pointer issue per milestone:
`Eng: <topic> — Log IMP-06, 13, 14`, listing the item ids and saying the details live in the log.
