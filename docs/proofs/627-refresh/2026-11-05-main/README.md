# Current-main keyboard integration

Builder: Codex-p (GPT-6.1 Sol; parent: Codex-p). Claim 6651235980.

Source commit: `9a141d317cdb4f8ea28945f95fbd01392b4ef362`.
This normal merge consumes canonical main `f5054a841358c0a1ce8173b274d16dd9298cb2b8`.
The merge applied automatically. Every original author remains.
The source audit records unchanged renderer, keyboard proof, hole proof, and both lockfiles.
No manual runtime, proof, registration, ceiling, or allowance changes occurred.

The desk requested this merge after #1307 landed (comment 6636249062).
Main now carries the owner-approved 203,500 B IslandCanvas ceiling.
This continuation does not modify that ceiling.

## Environment and checks

Node 22.23.4, Playwright 1.63.0, pinned Chromium revision 1243.
Browser proofs run strictly serially under `/tmp/emberisle-team-browser.lock`.
Logs and command exit results are retained beside this note.

The base build uses the same installed dependency tree as the PR build.
An initial base attempt linked an incomplete root installation and lacked `@ruffle-rs/ruffle`.
That failure and the resulting missing-dist growth failure remain retained.
The corrected installed-dependency base and growth checks pass.
This setup correction changes no tracked source or lockfile.

## Existing failures and acceptance gates

Prior CI 41865596812 failed server job 126699183626 after the turn-proof roll-off log.
The exact output says `FAIL Ember waited for state`; its decoded log is retained.
This differs from #1289's takeover failure reported in #1306.
Current main includes #1310, but no causal explanation follows from this integration.
The prior IslandCanvas budget failure is retained in older evidence.

The historical shallow-water colour failure remains unresolved.
A passing current board proves only the current dealt board.
The failed historical seed was not captured; no terrain, GPU, or timing cause is claimed.
Fresh exact-head CI and independent Claude review remain required.
Jarrod's physical iPhone Safari and Android Chrome checks remain unsatisfied.
Earlier interrupted client validation remains incomplete.
No manual CI retry, test weakening, speculative trim, or merge occurred.

## Results on source commit 9a141d3

- Typecheck, build, registration (179 proofs), size-delta and loosen: exit 0.
- Absolute size and installed-base growth checks: exit 0.
- IslandCanvas: main 202,141 B; PR 202,660 B; growth 519 B within 667 B.
- Index: main and PR 125,524 B; zero growth.
- Keyboard: 59 checks; SSAO, hole (600 pairs), pan, board-look and server turn: exit 0.
- Board-look retained the actual crystal frame and dealt-state diagnostics.

All five browser checks ran once on this frozen source, strictly serially.
Usage percentages were unavailable.
