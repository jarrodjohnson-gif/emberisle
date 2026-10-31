# Emberisle #903 — corrected whole-app architecture brief

## What Jarrod actually wants

A full app UX/product architecture review, with a candid recommendation on whether a full revamp is needed.
This is design, architecture and specification work. Do not implement runtime code.
Use Astra at medium reasoning for architecture, per Jarrod's latest steering.

Latest user correction:
> this review was supposed to be overall arechture.. not just are pixels showing clearly, or is stuff being hidden by other UI. we have never had an agent look at aour whole app. meaning we wanted to do a full revamp if needded and your opinon on what we shoul d do. is that what you did?

Root answered no, acknowledged following #903's narrower HUD scope too literally, and committed to expanding the review.

The next session must review the app's structure, navigation, onboarding/entry, modes, identity/profile, setup, lobby, gameplay interaction model, social/chat/trade, help, recovery and end-of-game journey.
It must deliver a clear keep/rethink/replace recommendation, an opinionated coherent target architecture and user flows, and phased builder-ready specs.
Do not start by making more pixel or clipping checks. Those are supporting evidence, not the purpose.
Make major revamp options genuinely different product/interaction architectures. No cream. Borrow Offsuit's restraint, not its black theme or poker layout.
Jarrod chooses before builders receive implementation work.

## Why paused

Five-hour usage reached100%; weekly31%. User instructions require saving state and stopping at95% short or98% weekly.
No Linear issue matched Emberisle903; this project uses GitHub issue903. No external checkpoint comment was posted because Jarrod requires confirmation for outward-facing sends.
No commits, pushes, PR, publishing or runtime game edits occurred.

## Work already completed, narrower than the actual goal

Current source captured at51cbe384b24f5ba45c91b630ec45f6a05c162a43 (main after goods#909).
New detached worktree:
/Users/jarrod.johnson/Documents/Codex/2026-10-20/resume-emberisle-903-from-the-paused/work/emberisle-current

The older paused checkpoint/source is intact:
/Users/jarrod.johnson/Documents/Codex/2026-10-20/work-on-emberisle-issue-903-https/outputs/PAUSED-903.md

New design packet (local, uncommitted):
work/emberisle-current/docs/design/hud-pass/v2/
- README.md/audit.json: ranked HUD audit, seven owner checklist categories.
- source-audit.md and overlay-audit.md: independent reviews.
- design-spec.md: HUD-only A Open rim and B Sea shelf specs/component responsibilities.
- evidence/:72PNGs,69 measured UI snapshots across390×844/844×390/1280×720, legal fixture, capture logs and manifests.
- mocks/:16static HTML/PNG HUD directions.
- mock-qa.json: all16rendered; proposed text>=12px, buttons>=44px, no offscreen buttons or pageerrors.
- pixel-qa.json: both directions' main board holes pixel-identical to renderer source at all3sizes.
- index.html and comparison.html: gallery/comparison scaffold generated, but not final validated deliverables.
- comparison-board.png and QA.md are NOT yet created, and index currently links them. Do not call gallery finished.

Architecture review has NOT been performed. Do not claim HUD findings answer the whole-app question.

## Relevant source and prior research

- src/components/game/EmberisleApp.tsx is the primary screen/flow entrypoint.
- src/components/game/Lobby.tsx, TableMenu.tsx, PlayerMenu.tsx, Hud.tsx, WinScreen.tsx, online.ts and store.ts need whole-app flow review.
- Read AGENTS.md, docs/FRAMEWORK.md, docs/LANES.md, docs/DECISIONS.md.
- Read GitHub#854 hub and#916 desk state, then#903 latest comments. No conflicting#903PR was found in this session.
- Current#903 owner references: docs/design/polish.md (Offsuit×Catan), ux-review-2026-10.md, jelly-ocean.md with later no-cream override.
- Offsuit App Store:https://apps.apple.com/us/app/offsuit-texas-holdem-poker/id6446099491
- Root visually viewed owner-supplied table and stats images through CUA. Do not bundle Offsuit images.
- #773goods/#909 and#776fortunecontrols have landed. #899ChatC remains open; source has latest decisions no filter row/preview pills, Copylog in Table.
- Hand V1 and ChatC were fixed inputs to the narrow HUD phase. Whole-app architecture may recommend changes, but label conflicts with approved decisions for Jarrod, do not silently override them.

## Narrow HUD work limits / fixes if reused

- Both static HUD directions preserve approved hand appearance and size but reposition its crop within reserved HUD space. Be explicit about this if interpreting fixed-hand constraint.
- The opponent detail mock was rendered with public-score hero and2outposts visually missing even though HTML contains them. Likely global CSS class collision with .score-hero. Resolve before presentation if reused.
- Opponent detail mock says Lucke has12goods/2fortunes, but current coherent fixture has0heldfortunes for opponents. Correct to12/0 if reused.
- End turn is the filled primary even while builds are affordable; compare against existing contextual-priority rules. Flag as proposal departure or revise.
- No mock keyboard/focus/dynamic chat/rotation behavior is proved by static HTML. Only actual-game evidence records specific clicked interactions.
- Current gallery audit initially uses main counts12/11/7 for sub12DOM text; complete inventory includes CSS-visible text behind overlays and is not a defect count.
- Known actual small controls: landscape own-player bank/dock action270×20px; five desktopdiscard inputs48×36px.
- Current portraitresults table333px inside324px clips totals initially; existing#748/#878 scope.

## Artifact sources and tool state

Scratch scripts (review artifact generation only, not runtime implementation):
work/art/build-directions.mjs, work/art/hand-crops.json, work/art/design-spec.md
work/build-review.mjs
work/evidence/capture-current.mjs and supplementary script (inspect work/evidence for exact filename)

Original worktree node_modules is symlinked into new worktree; package-lock files were verified identical.
No new npm install was run. Old session npmci reported onehigh vulnerability; no remediation.
Browser sandbox launch initially failed Permission denied; escalated local render succeeded.
All spawned subagents finished. CUA has an ephemeral Offsuit reference tab only.
No active server or browser capture should remain from agent-owned scripts (they closed in finally).

## Next session start

Check usage, then reread Jarrod's corrected scope above.
Use Astra medium to evaluate whole-app architecture. Map actual screens/states and user journeys, inspect source and walk the real app.
Produce the opinion first: what is structurally wrong, whether to revamp, what stays, and the target architecture.
Only then use selected visuals to explain the recommendation. No runtime implementation, commit or push without Jarrod's request.

Reset: October 20, 2026 at 8:20 PM Phoenix
