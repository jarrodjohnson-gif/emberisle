# Issue 1274 handoff — 2026-11-04

User requested a reset and an uploaded handoff. No active workers remained at this checkpoint. Do not restart completed work or duplicate the existing child issues.

## First actions

1. Check actual workers, current issue/PR claims and review comments. Read AGENTS.md, docs/FRAMEWORK.md, docs/LANES.md, docs/DECISIONS.md and hub #854 body/comments after its newest digest. Live state overrides this snapshot.
2. Check PR #1275 review and owner visual gates. Its current head already has green required CI; do not unnecessarily push over that head or repeat the ready message.
3. Resume the unfinished Fortunes design packet on this branch after inspecting its four pictures and measurement JSON. This is the next concrete unfinished work, not a request to rebuild the white-chrome slice.

## White/mist slice: PR #1275

- Branch `codex/1274-white-chrome`, head `74c6a7cf85053a163e33226687ec61b939d81fb4`, local `/workspace/emberisle`.
- PR open, not merged at handoff. Required CI **41844181807 passed**: build, server, all browser suites and checks. CI merge `eec1204f859e30a9300b70584f33a0b5794c3ea8` parents were upstream `a3914297` and PR `74c6a7c`.
- Only red job: unchanged advisory `loosen`, flagging the approved exact hand-fill expectation replacement. Replacement is isolated in `5911af3`; old/new table remains in PR body. No behavioral assertion or size ceiling was weakened by this branch.
- Requested handoff already posted: [comment 6639329862](https://github.com/jarrodjohnson-gif/emberisle/pull/1275#issuecomment-6639329862), “To desk: PR #1275 ready for re-review, head 74c6a7cf85053a163e33226687ec61b939d81fb4.” Do not repost.
- Claim and Astra-led helper attribution are in the PR body. Independent repository review and owner visual acceptance remain. Do not close #1274 for this palette slice.
- Changes: white/mist chrome tokens, exact hand palette expectation, registered chrome proof, install metadata/splash/manifest alignment, opaque player/score surfaces and removed score scrim blur, registered proposal capture, evidence/docs.
- Intentional remaining studio horizon and number-token cream need coordinated scene review; no silent scene recolour. Geometry, type, contextual fills, seat/resource colours and gameplay preserved.
- Evidence lives in `docs/proofs/1274/` and `followup/`. Local original chrome/contrast/hand/polish/chat passed; later install/public-score/win-action passed. Earlier transient chat/navigation/menu timeouts remain unexplained and retained. Do not erase or relabel them.
- Old CI failures were upstream size and duplicate botId. Gemini's #1291 merged as `a3914297`, fixing both; fresh PR CI is green. No need to keep treating those old blockers as unresolved.

## Approved decisions and ownership

All eleven owner answers are recorded in [comment 6621507049](https://github.com/jarrodjohnson-gif/emberisle/issues/1274#issuecomment-6621507049): **4=C, all others=A**. Keep contextual button fills; do not implement the historical teal-primary recommendation. The exact choices and child dependencies are in `build-order.md`. Original proposal recommendations are historical where superseded.

The takeover created children #1297–#1305. Do not create duplicates. Their runtime implementation still needs accepted mocks and ownership/file release. We prepared independent design research only, not runtime changes. Recheck scheduling and claims before further work.

Preserve stationary dock #1144/#1101 (last checked Grok), title #1216/#1151, hand #936/#799, seats #867. #706 was closed unmerged; #1271 was merged. These may change: check live state, not old issue numbers alone. Do not take unrelated issues.

## Published isolated design branches

| Scope | Branch / local worktree | Published checkpoint | State |
|---|---|---|---|
| Seat rings #1297 | `codex/1297-seat-ring-spec` / `/workspace/emberisle-seat-ring` | `b4731cdd873c25625c4d0284f04f8165f91f42ba` | Review draft complete: README, caller inventory, HTML, three PNGs, measurements/hashes. Proposed 1.5px inset control-line ring, contrast 3.9428:1 white / 3.6258:1 mist. Preserves separate current-turn outline and existing stronger TurnMoment border. Sol reviewed and corrected Empty-label copy; final captures refreshed. No runtime acceptance. |
| Button audit #1298 | `codex/1298-button-audit` / `/workspace/emberisle-button-audit` | `dc5bdf42b1b11490081aa3787ad83a657748d89f` | Review draft complete: Terra inventory, Astra proposal/state sheets, three PNGs, measurements and SHA256SUMS. Nineteen schematic swatches per frame fit at least 44px dimensions; real runtime focus/contrast/handlers remain unverified. No universal fill change. |
| Fortunes #1302 | `codex/1302-fortune-tray-spec` / `/workspace/emberisle-fortune-spec` | This handoff branch | **Unfinished** prototype, four PNGs, 96 measurement records; parent visual/source/interaction review and full spec still needed. See `../fortune-tray-1274/README.md`. |

Ring/button branches were pushed and verified by GitHub reads. They do not have new PRs from this session. Their design files are not part of palette PR #1275. Fortunes is uploaded as an explicit incomplete checkpoint, not as a passing runtime proof.

## Working rules and environment

- Use Astra for pinned design leadership; user prefers Terra, Luna and Sol for bounded helpers. Check live workers before spawning. Preserve authorship and nonoverlapping assignments.
- Never merge, push main, loosen tests, or change size ceilings. Browser runs are serial under `/tmp/emberisle-team-browser.lock`. Register every new permanent proof in npm and CI.
- Use isolated branches/worktrees. Main checkout may retain an identical untracked Fortunes directory after the checkpoint copy; byte-compare before cleanup. Preserve `work/` until needed evidence is recovered; do not blindly commit it.
- Browser/localhost/git commands sometimes need approved sandbox escalation. Preserve inherited proxy/CA settings; do not change accounts or infrastructure. There was one execution-service disconnect; it recovered on a later invocation. Recheck normally if it recurs and checkpoint affected work rather than bypassing limits.
- Temporary capture utilities were not permanent CI proofs. Design measurements are not evidence of production behavior.
- User previously enabled hourly continuation, automation id `6aea00ab36ec8191975a7fe06d6415aa`. It was not disabled here. Scheduled invocations are not continuously active workers; be candid about that distinction. Coordinate fresh sessions to avoid duplicate work.
