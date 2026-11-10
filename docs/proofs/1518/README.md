# Reconnect live-gain timeout (#1518)

Hosted run42733762642 on PR1496 head413f9060 failed the unchanged30000ms resource-flash wait after its first-load seq20 no-cue check. Its exact cause is unknown. This is separate from the earlier1082 placement overlap and from landing-dust1489.

A controlled2500ms delay of the Hud module request PASSED: all five hand-count elements were already mounted before seq21. It did not reproduce the suspected startup-baseline race. Source/log/exit are retained. A delayed COMPONENT MOUNT control is a separate fixture, not the same test and not yet a result. No product edit, assertion/deadline/allowance change, frozen cue or historical cause claim.

Original-source focused ONLY=reconnect validation under100ms-busy/200ms CPU load is in progress. These are focused cases, not twenty full proofs. Browser tooling is repository-pinned and globally serial under the team lock.

Original-source ONLY=reconnect series COMPLETE:20/20 focused cases passed, each exit0 and terminal success, under2CPU quota plus100ms-busy/200ms load. All raw outputs/start times/exits and batch source retained. This did not reproduce the historical CI failure and is NOT20 full proofs or a causal fix.

The first delayed-mount fixture used a missing `jsxDEV` binding; the second missed its intended import insertion; the third attempted an ESM named import from Vite's CommonJS React wrapper. These are invalid fixture failures, not reproductions of the hosted bug; their source/logs remain retained. The corrected fixture uses the actual checked `_jsxDEV` binding. It postpones rendering the real Hud by2500ms, without changing the real hand/cue implementation or its lifetime.

The candidate permanent change adds a first-hand timber-count readiness precondition after store seq20, before the existing900ms no-replay observation and live seq21 gain. Every existing assertion and30000ms guard remains. This strengthens the baseline tested by the first-load case: a store state alone is not a rendered hand. No product or design/budget changes.

The valid delayed-mount OLD control failed the original30000ms cue wait with zero console errors: pre-gain seq20 had0 hand elements; final seq21 had all5, timber2, and0 recorded cue mounts. With the readiness barrier and the same2500ms delayed mount, every original reconnect assertion passed with zero console errors (pre-gain5 hand elements, then1 cue). This demonstrates the setup vulnerability and its repair under a controlled delay; the historical CI run lacks that trace, so its exact cause remains unproved.

An earlier barrier-control attempt ended with an undefined-store diagnostic after navigation; its original source/log are retained and not counted passing. A traced run preserved navigation events and completed all assertions. Those events include host-URL history changes and do not alone prove a reload. No causal claim is made for that earlier fixture error. Syntax and registration215 pass. Advisory loosen after committing the candidate reports1 changed proof, none loosened; the earlier pre-commit invocation examined0 changed proofs and did not validate the uncommitted diff.
