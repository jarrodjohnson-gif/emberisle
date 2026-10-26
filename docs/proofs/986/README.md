# Open rematch listing regression (#986)

Builder: GPT-6 1026-0601hh (Codex-p3). Signed Codex-p. No sub-agents.
Base: main0f5690d. Failing proof checkpointe9df7c3. Fix06a4eb8.

## Behavior

A completed open game releases its one listing slot. Previously rematch() created the new game without reclaiming it.
After the new game's frozen roster is created, open rooms call the existing registerOpenTable(room).
The helper refuses a different current owner. Its single-slot policy is unchanged.
Private rematches never register. Match settings, seat ordering and frozen roster behavior remain intact.
No application bundle, lockfile, dependency, budget or registry-helper change.

## Regression evidence

before.log runs the extended real-host proof on the unchanged handler. It exits1 at the free-slot listing assertion (0 rooms, expected1).
The same proof then passes with only the two-line host change; see after.log.
The failing checkpoint is exactly the fix with its registration hook absent, providing the requested negative control.
No assertion was changed between the failing and passing runs.

Three cases restore a completed room, authenticate all three human seats and start a genuine rematch:
- free slot: HTTP and WS list the rematch as playing;
- occupied slot: the already-listed successor remains the sole lobby listing;
- private room: the rematch stays absent from both discovery surfaces.
Each also verifies winner-first player order, colors and the persisted new frozen roster's seat attribution and guest identities.
Every original proof line remains, in its original order. preservation.json records source/lock/registration audits.
The existing server test chain runs this proof in CI. No new proof file or command was added.

## Fresh validation

Independent local clone /workspace/work/rematch986-verify at06a4eb8; root/server npm ci --ignore-scripts.
Independent main0f5690d build in /workspace/work/ambience-base.
Node24.19.0. No browser proof is needed for this server-only change; none was run.
fresh/results.json records actual commands, exits and timings. Raw logs are retained alongside it.
Static checks pass: typecheck, build, registered146, loosen1-none, size.
Index124333/125200 B, base124340 B, -7/400 B. All chunk ceilings and growth allowances pass unchanged.
Full npm test result is recorded in fresh/results.json and fresh/server.log.

Independent review and exact-head CI are required before merge. Builders never merge.

## Retained full-suite interruption

The first fresh full npm test exited1 after136.52s in unchanged rejoin-prove: `FAIL Ember waited for welcome`.
This happened before that proof started its game, and before the aggregate reached the new open-table cases.
The same unchanged rejoin proof passes independently on both exact head and exact main; raw diagnostic/control logs are retained.
The cause of the intermittent initial welcome timeout is not established. No timeout or assertion was edited.
The fresh focused open-table completion proof passes all original and new cases independently.
A single complete confirmation run is recorded separately; the first failure is never overwritten or called a pass.

The complete confirmation exited1 after329.85s at unchanged lobby-prove's bot-roll assertion.
That lobby proof passes independently on both exact head and exact main, with its original waits/assertions.
Both aggregate failures and all four focused diagnostics/controls are retained. No cause is claimed or test modified.
A final complete server run follows these paired passing diagnostics.

Final complete npm test: PASS, exit0, 518.88s. It includes the unchanged rejoin/lobby checks, all profile proofs and the full original/new open-table cases.
Earlier nonzero aggregate runs remain historical failures; no test was modified to make this final run pass.
