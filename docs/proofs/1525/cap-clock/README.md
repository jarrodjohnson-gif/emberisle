# Cap measurement clock

Nativeb36b series stopped6four-seat passes plus run7 original7500ms floor failure at7275ms.
One complete full proof passed before that series. Neither historical exact mount/Node clock offset nor product cap timing was traced.

The original Node Date.now start runs after remote paint/readability evaluations.
Both endpoints now use existing same-browser records: first moment DOM mount and first exit DOM removal.
No synthetic clock, changed lifetime, assertion, threshold or deadline enters the permanent proof.

Focused controls use pinned Node22.23.4/Chromium1243, serial team lock and no additional synthetic CPU load.
Only the observation delay is controlled; timer/DOM clocks continue normally.
All controls retain original7500–8800ms cap assertion and fade checks.

First1000ms host-delay comparison is NOT a valid old/new failure reproduction.
Old passed7946ms while browser records show8978.4ms, outside the original upper bound.
New passed8179.6ms; seven-second negative failed7183.9ms.
All sources/logs/exits retained under first-control/; never count that old run as failed.

Second2000ms delay compares the same old/new setup:
- Old: exit1, Node6158ms; actual DOM lifetime8300.7ms. False lower-bound failure reproduced.
- New: exit0, actual DOM8282.5ms, original fade checks pass.
- Seven-second fixture cap: exit1 at7165.4ms, lower bound still detects early removal.
- Nine-second fixture cap: exit1 at9162.7ms, upper bound still detects late removal.

The negatives change STAY_MS only through their temporary proof Vite transform.
Production STAY_MS remains8000; no temporary script remains registered or present.
These are focused controls, not full native validation passes.
