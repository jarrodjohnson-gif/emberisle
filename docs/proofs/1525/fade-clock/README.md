# Exit clock observation

Native full proof80f failed p3 roll fade at125.4ms recorder age, despite CSS160ms and a real midpoint.
The callback's precise native delay was not traced. Its failure remains committed separately.

Focused serial controls add45ms work before the old MutationObserver records its timestamp.
The same proof-only Vite observer records performance.now at the real exit-target style write.
No game state, transition, timer, clock or original assertion is changed in the old/new pair.
Pinned Node22.23.4 / repository Chromium1243 / team browser lock; no synthetic CPU load in these controls.

- Old recorder: exit1, apparent116.2ms, actual observed style-write to removal165.1ms.
- Observed style-write timestamp: exit0, actual164.8ms and original fade assertions pass.
- Negative control changes only the fixture product removal timer160→80: exit1 at81.1ms, original140ms floor still fails.

These are focused controls through one live roll dismissal, not full/native passes.
Permanent proof changes only observation, without the controlled delay or shortened timer.
It fails explicitly if the observational hook is missing. Every original check/threshold remains verbatim.
