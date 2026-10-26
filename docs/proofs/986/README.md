# Open rematch listing regression (#986)

Builder: GPT-6 1026-0601hh (Codex-p3), signed Codex-p. Base main0f5690d.
Regression checkpointe9df7c3; runtime fix06a4eb8; full-suite evidence head7f91878.
The later review follow-up only adds exact listing-count assertions and trims scratch/full logs.

A finished open game releases its listing slot. The guarded registerOpenTable(room) call after freezeRoster()
reclaims a free slot for its rematch, preserves an already-listed successor and keeps private rooms hidden.
The one-slot policy, roster attribution, colors, seat ordering, settings and client runtime stay unchanged.

## Proof

before.log records the real failure on the original handler: free-slot discovery lists0 rooms, expected1 (exit1).
after.log records the identical proof passing with only the two-line handler addition.
Three scenarios restore a completed game, authenticate all three seats and start a real rematch:
free slot lists playing; occupied slot preserves its successor; private rematch stays absent.
HTTP and WS agree. Each case verifies winner-first order, colors and the new saved frozen roster.
The review follow-up also checks rematch seated3/successor seated1 and total4.
Every original assertion remains. The existing server test chain registers the extended proof in CI.

## Validation

Fresh independent locked-install clone at06a4eb8, Node24.19.0.
fresh/results.json records passing static/build/registered146/loosen1-none/size checks and the FIRST FAILED aggregate run.
The full successful npm test result is fresh/server-final.json: exit0, 518.88s.
fresh/server-final-tail.log retains the actual final output, including all three rematch cases.
fresh/open-table.log is the independent focused completion proof.
preservation.json audits original proof, runtime, lockfile and registration preservation before review strengthening.

Two earlier aggregate attempts failed in unchanged rejoin welcome and lobby bot-roll checks.
Keep their exact failure tails in server-welcome-failure-tail.log and server-lobby-failure-tail.log under fresh/.
Their timings/exits remain in results.json and server-confirmation.json. Both checks passed independently on main and head;
their full-suite failures were never called passes. No assertion or timeout was weakened or skipped.
The final complete run passed both and every remaining server proof.

Final7f91878 source/build/clean/remote audit passed; index124337/125200 B, base124340 B, -3/400 B.
The earlier tested code-head measured124333 B. All budgets and lockfiles stay unchanged.
The review requested removal of the scratch runner, full suite logs and build logs; their compact actual tails/summaries remain.
No browser proof was run locally for this server-only fix. GitHub CI runs its complete configured suite.
Independent review6409958401 called the fix/proof correct; exact-head CI remains required before merge.

Review follow-up: strict open-table proof, registered146 and loosen1-none pass again. No previous assertion changed; seated/total assertions are additive. See review-open-table.log, review-registered.log and review-loosen.log.
