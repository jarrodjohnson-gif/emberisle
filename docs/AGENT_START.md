# Start here (any AI)

You are picking up Emberisle. Do not redesign it. Do not open the 4 GB zip
in this web sandbox. Do not start a second rules engine.

## 1. Read, in order

1. `docs/CURRENT.md` — the only active task
2. That task's section in `docs/TASKS.md`
3. `docs/BUILD_BIBLE.md` only if the task points at a section
4. `docs/FRAMEWORK.md` if you do not know the four gates

## 2. Claim

In `docs/TASKS.md`, set that task to `status: doing`.
In `docs/CURRENT.md`, set `owner` to a short name and today's date.
If it is not `ready`, stop and say which `blocked_by` id is unfinished.

## 3. Do one gate

The `gate` field is `research`, `build`, `wire`, or `prove`.
Do that gate only. Steps are written under the task. Follow them.
Write the result to `docs/research/<task-id>.md`.

Research gate: notes only. No feature code.
Build gate: the smallest code that can run alone.
Wire gate: connect it to the thing named in the task.
Prove gate: run the command in the task. Paste the output into the note.
If the prove fails, status stays `doing` and the note says what failed.

## 4. Advance, then stop if you are low

If the gate passed and you still have room:

- research → set `gate: build`
- build → set `gate: wire`
- wire → set `gate: prove`
- prove passed → set `status: done`, then set the next task that was
  `blocked` only by this one to `status: ready`

Update `docs/CURRENT.md` to the new gate or the next ready task.

## 5. Before you exit

Push to GitHub `jarrodjohnson-gif/emberisle` branch `main`.
The handoff is the files. Chat is not the handoff.

Five lines at the bottom of `docs/research/<task-id>.md`:

```
done: <gate>
left: <next gate or next task id>
broke: <nothing, or what>
next agent: <one sentence>
```
