# Framework: linear stage-gate microtasks

This is the method Emberisle uses so a new AI can finish one small thing and leave
the next AI a clean start. It is not a new invention. It is three old ideas
stacked:

| Name people already use | What it means here |
|---|---|
| **Work breakdown structure (WBS)** | One project, split into tiny numbered tasks (`T0.1`, `T1.2`) |
| **Stage-gate** (also called phase-gate) | A task cannot be "built" until its research note exists. It cannot be "done" until a prove step passes |
| **Kanban** | Each task is `blocked`, `ready`, `doing`, or `done` |

The four gates on every task, always in this order:

1. **Research** — read, decide, write a short note. No new code.
2. **Build** — make the thing, in the smallest place that proves it.
3. **Wire** — connect it to the neighbor (menu, socket, Unreal, sound).
4. **Prove** — run a check a stranger can repeat. Paste the result in the note.

If an agent only has a little usage left, it does **one gate** and stops.
The next agent continues at the next gate. That is the point.

Do not call this Scrum, and do not open a hundred unscoped bugs.
The board is a **line**: task N stays `blocked` until the task in `blocked_by` is `done`.
The only side track is Phase 3 (Unreal on Jarrod's PC), because this sandbox
cannot open the 4 GB zip.

Linear.app is the same board in another UI. We use GitHub issues plus
`docs/TASKS.md` because GitHub is already connected. `docs/TASKS.md` wins
if an issue and the file disagree.

## Files an agent touches

| File | Role |
|---|---|
| `docs/AGENT_START.md` | Read this first. How to claim and how to stop |
| `docs/CURRENT.md` | The one task that is active |
| `docs/TASKS.md` | The full line of tasks and their gates |
| `docs/research/T0.1.md` (etc.) | The research note and the prove output |
| `docs/BUILD_BIBLE.md` | Product, UX, sounds, rules. Do not freelance |
| `docs/FRAMEWORK.md` | This file |

## Definition of done (one gate)

- The gate's steps in `TASKS.md` are finished.
- A note exists at `docs/research/<id>.md` with: what you did, what you did not do, the prove output if this was Prove.
- `TASKS.md` gate field moved forward, or `status: done` if Prove passed.
- `CURRENT.md` points at the next gate or the next task.
- Committed to `jarrodjohnson-gif/emberisle` on `main`.

## Definition of ready (a task may be claimed)

- `status` is `ready`.
- `blocked_by` is empty or those ids are `done`.
- The Research section lists the files to open. If it does not, the task is not ready. Fix the task text before coding.
