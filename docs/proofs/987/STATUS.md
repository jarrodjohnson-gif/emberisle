# #987 status

This note replaces the 2026-10-26 checkpoint. That note described candidate 85187aa. That candidate is not this pull request.

PR #1277 ships the seatless redial. Runtime head: `b0432eb4d7fa5c712a053e9c60ff2885db4202e7`. Builder: Grok 4.7. This status rewrite is 2026-11-04.

The title redials discovery after the host drops. Delays are 1, 2, 4, 8 and 15 seconds. A new list resets the delay. Close clears the stale list. Unmount cancels the socket and the timer.

Checks on `b0432eb` passed before this note. Those were open-table-prove, pages-prove, typecheck, loosen-prove and size-prove. CI `checks` also passed on that head. Removing the redial fails the backoff case.

Logs in this folder belong to the earlier candidate. `connected-cleanup-failure.log` is that old failure. Those logs are not the `b0432eb` run.
