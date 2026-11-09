# Owner D: restore the results card width

Authority: PR1446 desk6741832985, owner q1446-results-width D. Claim6742748333.
Main2f050c3d merged normally atc76a8906; no conflicts. No rebase or force push.
Runtime sourcecb66473a restores max-w-2xl672px and removes only three sm:px-2 overrides.
All table cells now retain existing4px padding. Font sizes, names, headers and totals remain unchanged.
No number-column, name-gap, truncation or budget change was needed.

Controlled browser measurements used the same long-name fixture at1280x720,1024x768 and844x390.
Before768 images show the rejected width on merged source.
Restore672 images show the same table before the padding fix.
Later padding2/0 and column/gap experiments are measurements only, never product changes.

| Viewport | Restored672 wrapper/table | With4px padding wrapper/table | Body font |
|---|---|---|---|
|1280x720|622/670.20px|622/622px|14px|
|1024x768|622/670.20px|622/622px|14px|
|844x390|638/638px|638/638px|12px, existing short-screen rule|

The actual production-source win-long-names proof passes all three sizes without CSS overrides.
Its after672 pictures and measurements show every full name, header and total without sideways scrolling.
The registered proof and every assertion remain unchanged.
Types, registration, advisory guard and size pass. Index+11/400B; WinList-1/200B; all ceilings pass.
Full hosted win-action PASS all six viewport groups, all triggers, persistence/restart/reload and pre-win privacy.
Extra unchanged win-list FAILED after two viewport passes, waiting for win-menu at390x844 (30000ms, script108/130).
One unchanged canonical2f050c3d win-list control PASS all cases. The differing result establishes no cause or fix.
No retry of the branch proof, assertion change, timeout relaxation or unrelated source edit followed.
The branch failure remains unresolved and is not called a flake. Fresh hosted checks and desk triage remain required.
Local proofs and controlled measurements do not establish independent review or owner picture acceptance.
