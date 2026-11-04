# Review follow-up evidence

Runtime and proof changes were published at `7a5aa5437a19277a4b56de3994732ef836db6ec7`. This is a partial implementation of #1274; its eleven design decisions remain open.

## Changes

- HTML theme metadata, startup splash, and manifest ground now match mist `#f3f6f5`. This fixes the exact theme assertion that failed hosted `install-prove` on `08dfc165`; the assertion is unchanged.
- Player menus and score surfaces use opaque white chrome. The score scrim no longer blurs. Geometry and behavior are unchanged, and the public-score proof adds surface assertions without removing existing checks.
- The proposal capture is registered as `issue-1274-proposal-prove` in npm and the CI presentation suite. It supports Playwright's pinned browser and emits artifacts under `test-results`.
- Eleven schematic comparisons are published under `docs/design/issue-1274/decisions`. Each has a separate Question comment on #1274, with four options and Astra's recommendation as A. None authorizes a layout change.

Studio `#f1efe9` and renderer number-token fills are retained as scene colours. The studio horizon is calibrated across CSS and the renderer; its remaining yellow needs a coordinated approved mock, not an isolated token substitution.

## Checks and limitations

Typecheck, build, registration (176 proofs), local absolute size ceilings, unchanged install proof, and win-action proof passed. Win-action covers six viewports and all five winning triggers. Browser runs are serial under `/tmp/emberisle-team-browser.lock`; the install, win-action and public-score follow-ups use the installed pinned Playwright browser.

The original head `08dfc165` passes public-score at all three sizes. Candidate attempts retained here failed first during initial page evaluation (execution context destroyed), then at the existing post-win player-menu assertion. A diagnostic candidate copy passes all three sizes with extra state logging; that does not establish a fix for the timeout. The final exact committed candidate also passes all three sizes with every added surface assertion. This passing rerun does not explain the two earlier failures. No behavioral assertion, timeout, or size ceiling was weakened.

Hosted run [41759126184](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/41759126184) fails build at the existing index ceiling: 125451 B versus 125200 B. Its base `33e10b09` is also 125451 B, so this PR adds 0 B to that chunk. This is the open upstream [#1283](https://github.com/jarrodjohnson-gif/emberisle/issues/1283) blocker. Browser-b was skipped, so this run provides no passing hosted result for the install/chrome/presentation follow-ups. The advisory obsolete-palette assertion warning remains documented in the parent README and PR table.

The PR has not been announced ready for re-review. Independent repository review and owner visual acceptance remain required.
