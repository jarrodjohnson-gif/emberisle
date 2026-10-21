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
  highest priority first, then top to bottom through the earliest milestone. Stop only when nothing is Todo, or everything left is
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

An issue may carry a `model:opus` or `model:sonnet` label when it needs a particular model: opus for
UI, visual or tricky multi-file work, sonnet for well-specified mechanical steps. A Builder uses that
model, or a subagent on it. If it can do neither, it says in the PR which model it used. The Reviewer uses a different model from the one that built the PR.

A mock-based design or `ux` issue is ready only when its mock covers 390x844, 844x390 and 1280x720. The mock gives pixel sizes for type, controls and footprints at each size. A mock for one size leaves the Builder guessing at the others (#909).

Add `needs: jarrod` (his decision, account, or money) or `needs: gaming-pc` (Unreal, or the 3.6 GB art pack)
on its own line when an AI cannot finish it. Those issues still get Research done by any AI. Design follows "Big design work" in `docs/LANES.md`.

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

**Next open issue** = the first eligible open `status:todo` issue with the **highest `prio:` label**
(`docs/LANES.md`, "Tier and priority"), then in the **earliest milestone**, lowest step first (1 → 4). It must have a lane label, every `Depends on` closed, no active claim or
open PR, and no file conflict with another active claim. Continue your own existing work first;
do not adopt someone else's In Progress claim or treat a pause alone as Todo eligibility.

**Claim:**
1. Search open PRs for the issue number (title or body). A PR already open against it — even a draft,
   even before the issue shows any `claimed:` comment — means another agent is already on it. The issue's
   own label can lag behind real work in flight, so this check comes first and the PR search is the one
   that actually catches a concurrent session; skip to the next candidate issue if you find one.
2. Check active claims and open PR file changes across every lane, including In Review. A claim remains
   active until that agent pauses or its PR merges or closes. Historical same-agent `paused:` comments
   also release claims; new pauses must include `/paused`. Never take files reserved by another
   active claim; sharing a lane is allowed.
3. Immediately before posting a claim, re-read the issue and every comment fresh. Recheck after any
   user wait, thinking break or check-in; an old issue-list result is not enough. If the issue is no
   longer eligible or now claimed, pick another.
4. Post immediately, before research or design, with `/claim` on its own line and an agent name
   (required because different agents often use the same GitHub account):
   ```
   /claim
   claimed: <agent name>, <YYYY-MM-DD>
   files: <paths you expect to touch, or none>
   ```
5. Immediately re-read the comments after posting. First active claim wins: if another agent's active
   claim has an earlier timestamp, post `/paused` naming yourself and saying
   `lost the claim to <winning agent name>`, then pick another issue without a fixed wait. For equal
   timestamps use issue-timeline order. A losing agent's pause releases only its own claim.
6. Before expanding `files:`, recheck active claims/PRs and update the list. If files overlap, pause
   and pick different work. Never stop while eligible work exists; a whole lane is not reserved.

**Starting more than one session at once:** use the same immediate pre-claim/post-claim checks;
first active claim wins, with no fixed launch delay. Several issues in one lane may proceed when
their files do not overlap. [`LANES.md`](LANES.md) is the shared eligibility and claim procedure.

**Pause** (out of limit, or blocked):
```
/paused
paused: <agent name>, <YYYY-MM-DD>
done so far: <one line>
left: <exactly what is unfinished, and the next command to run>
```
This releases your own claim and files. Record the next step in `left:`; new claimants still need
open `status:todo` eligibility after the issue is rescheduled. Do not resume a stale claim blindly.

**Finish:**
```
changed: <one line>
test: <command> → <result>
pr: #<n>
```
Move it to In Review (Jarrod accepts it, then it goes to Done and is closed). Then set the next step to Todo.

**Who decides what** (Jarrod's rule, 2026-10-16). It applies to every issue, including helpers' `Idea:`
and `Bug:` issues:

| Kind | Who decides | Then |
|---|---|---|
| Real bug (reproducible, and the game is wrong) | The orchestrator confirms it | Spec it and label `helper-ok`. Any builder may fix it. |
| Minor UX: wording, spacing, hints, a missing cue, consistency with what's already decided | The orchestrator | Spec it and label `helper-ok`. |
| Major UX: new screens or flows, layout changes, anything that changes how a turn feels | **Jarrod** | Ask him in one short message, then spec his answer. |
| Major design: new features, rules, scoring, art style, pieces, sound identity | **Jarrod** | Same: ask him first. |

Not a bug, or a no? Close it with a one-line reason.

**Work efficiently** (tokens are the budget):
- **Delegate broad reading.** Hand a search across many files, or a long log, to a subagent. Ask for the
  conclusion (file:line plus one line), not the dump. Read whole files yourself only when you will edit
  them.
- **Read narrowly.** `grep` first, then read the lines you need (`sed -n`, or an offset and limit). Don't
  re-read a file you just edited.
- **Run long checks in the background.** Browser proofs take minutes. Start them in the background or
  hand them to a subagent, and keep working. Run proofs one at a time, never in parallel: they share
  ports. Before you push or open the PR, wait for every check to finish and read its result. A check
  you haven't read the result of counts as failed.
- **Pick the model to fit the work.** Use the issue's `model:` label if it has one. Otherwise use a
  smaller model for mechanical or search subagents, and the strongest one for UI, visual or tricky
  multi-file work.
- **Independent steps go out together.** Send unrelated tool calls in one batch, and launch independent
  subagents at the same time.
- **Keep messages short.** Report results, not narration. Put the proof output in the PR, not in chat.

**Found something along the way?** A real new step becomes a new issue under the right milestone
(a sub-issue if it belongs to a node). An idea goes in [IDEAS.md](IDEAS.md), not in the tracker.

**Every change goes through a pull request.** Push to a branch, open a PR, and CI (`.github/workflows/ci.yml`)
runs the README "Run it" checks. A red PR is never merged.

**Bundle size.** Do not edit `scripts/size-prove.mjs` for normal growth. In CI, `size-prove` builds the PR's base and fails a chunk
only when it grows by more than its allowance (index 400 B gzip; others 0.33%, at least 200 B), or passes its absolute ceiling.
If your change must grow a chunk past its allowance, say why in the PR body, with the measured numbers. The reviewer must OK it
before the allowance is raised. Locally, `node scripts/size-prove.mjs --base <built base checkout>` runs the growth check.

**Two roles: Builder and Reviewer.**

| Role | Who | Does |
|---|---|---|
| Builder | the session doing the work | Steps 1-4, pushes, opens the PR, and fixes CI until it is green. **Never merges its own PR.** |
| Reviewer | the **orchestrator**: the one session Jarrod names to review and merge | Reviews every open PR with a different model than its builder: reads the diff against the issue's completion test, checks CI and the framework rules (no to-do lists in files, issue comments present). Its review subagents follow [REVIEWING.md](REVIEWING.md). If CI is green and nothing is wrong, it **merges**. If something is wrong, it comments exactly what, and the PR stays open for its Builder. **No other session merges**, except the auto-merge Action below. |
| Jarrod | the owner | Accepts results: moves In Review to Done. No code reading needed. |

**The one exception: the auto-merge Action** (`.github/workflows/auto-merge.yml`, #923). It squash-merges a docs-only PR without the desk's click. It needs three things on the exact head SHA:
- every changed file is an allowed doc (rules in `scripts/auto-merge-eligible.mjs`);
- `checks` is green;
- the desk posted `<!-- review-desk: clean <40-char head SHA> -->`.

Governance docs, code, workflows and package files never qualify. It is off unless the repo variable `AUTO_MERGE` is `on`.

A new Builder chat therefore starts: take the next eligible issue with no file conflict
([LANES.md](LANES.md)).

**End of a chat, or a finished task:** give Jarrod one line to paste into a new chat:
`Work on Emberisle.` (AGENTS.md covers the rest.)

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

## Writing

Use these rules for docs, issue comments, PR bodies and review findings.

1. Write one instruction per sentence. Keep sentences to 20 words or fewer.
2. Use active voice. Write "Run the proof", not "The proof should be run".
3. Leave out filler: no greetings, recaps, or "I hope this helps".
4. Use one word for one thing. Pick a term and keep it.
5. Use lists for steps and findings. Use paragraphs only for reasons.
