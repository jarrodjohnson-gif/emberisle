# Static-root discovery CI fix

PR #882 / issue #833, GPT-6.1 Sol. Implements the desk's app-fix request6390658852 after headf9270fc failed flows-a. Actual CI run40140623576/job121011530535 failed haptics-prove:607 on three WebSocket HTTP200 upgrade responses from its root static preview at8453; [raw excerpt](ci-failure-excerpt.log). Main4892049 passed that unchanged proof. The prior production-root heuristic incorrectly assumed every built root origin was a rules host.

The native server now inserts a constant emberisle-host meta marker only while serving its built index.html. The raw build and static previews stay unmarked. OpenTables enables its seatless discovery socket only for that marker or an explicit ?host= link. There is no probe request, extra endpoint or HTTP polling. Host/Join/Play behavior and all existing discovery privacy/lifecycle rules remain. This is an advertised capability, not authentication. Existing HTTP caching/content-type/path handling stays intact; only the built index body receives the marker.

Fresh frozen-install checkout work/verify882-oct24, implementation02808c5 and calibrationd9e80c0. Node24.19.0, Chromium1243/SwiftShader. Every normal command exited0:

- New registered open-host-prove: **static root opens0 WebSockets**, supports offline play and has no browser errors; native root marker opens exactly one real discovery socket and displays the native open room; an explicit host link from the unmarked static build discovers only the selected native host.
- Full unchanged haptics-prove: cold source/production, unsupported and failed optional modules, land/pay/turn/toggle/fortune/win/trade, all strict browser-error and timing assertions pass.
- Unchanged open-table-prove and title-chunks-prove pass; Pages /emberisle/ and the full renamed-prefix control pass, with no errors or failed resources.
- Native serve-prove and native open-table-prove pass, including HTTP/HEAD/traversal/avatar hosting and open/private/restart/recovery-to-win behavior.
- Types/build/registered136/loosen4-none/size pass. Existing caps/allowances unchanged.

The [old-gate control](static-origin-control.py) builds f9270fc's OpenTables component against the fixed host and runs the same new production proof. It fails exactly `automatic discovery opens no WebSocket on a static root build`. The fixed source is restored byte-for-byte in finally and rebuilt before the full normal haptics sequence. The failed old-gate output is intentional calibration, not a passing normal run.

[Scope audit](logs/scope-audit.py): open-table, title-chunks, haptics, native serving and native open-table proof bytes equal reviewedf9270fc. All old budgets/fixtures/server commands remain. Package and entire eight-leg CI differ from f9270fc only by one open-host registration/flows-b step. #1094's other builder's main.tsx/sound/startup proof are untouched. Active #716/#812/#873/#970/#997 host changes use separate functions or MIME entries; serveStatic's index body marker does not overlap them.

All raw outputs and hashes are committed here. Runtime build sizing is in logs/final-runtime-size.log; final published-head gzip numbers are posted on the PR because commit/time injection changes them slightly. No proof assertion, timeout or budget was relaxed. No Actions retry, force-push, merge or main push was performed. Independent delta review and new-head CI remain pending.
