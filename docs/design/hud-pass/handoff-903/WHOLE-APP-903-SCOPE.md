## Owner rescope — October 20, 2026

Jarrod clarified that this is a **whole-app UX and product architecture review**.
He wants an opinion on whether Emberisle needs a full revamp, and what should be built.
A HUD legibility, clipping, or spacing audit alone does not satisfy this issue.

**Design and specification only. Use Astra at medium reasoning for architecture.**
The next agent picks up this corrected brief. No runtime implementation starts here.

## Questions this review must answer

- Is the app organized around the right player goals and mental model?
- Where do entry, modes, identity, setup, lobby, play, social actions, recovery, and results become confusing?
- Which screens, navigation paths, repeated controls, and concepts should be removed, combined, or separated?
- Does the interaction model make the next meaningful action clear without hiding useful strategy?
- What should remain because it gives Emberisle its identity?
- Is a full revamp justified, or would a focused structural redesign deliver more value?
- What is the recommended target architecture, and why is it better for players?

Architecture here means the app's structure, information hierarchy, journeys, and interaction model.
Document technical constraints when they affect that experience. Do not substitute a code-cleanup proposal.

## Scope

Walk through the real app and map its screens, states, and transitions.
Review first-time and returning-player journeys, including:

- Entry, onboarding, help, and choosing a game mode.
- Identity/profile and preferences, where currently implemented.
- Practice, hotseat, hosting/joining, lobby setup, and readiness.
- Setup, roll, building, fortunes, trade, chat, and turn ownership.
- Discovery of rules, history, secondary actions, and strategy information.
- Errors, disconnection/rejoin, leaving, results, replay, and return paths.

Distinguish observed behaviour, source-based inference, untested flows, and proposed changes.
Do not infer a structural defect solely from a small font or clipped screenshot.

## Deliverable

1. **Lead with a candid recommendation:** keep, selectively restructure, or substantially revamp, with reasons.
2. Map the current app and its main user journeys. Rank the largest structural problems by player impact.
3. State what to keep, remove, combine, and rethink. Tie every major recommendation to evidence.
4. Present **two meaningfully different app/interaction architectures**, not two HUD skins.
5. Show the target app map and critical end-to-end flows, including recovery and exit paths.
6. Use selective high-fidelity mocks to explain those flows and compare the directions.
7. Recommend one direction and explain its trade-offs, uncertainties, and migration approach.
8. Provide phased, builder-ready specs: purpose, component/screen responsibilities, states, behaviour, boundaries, and acceptance criteria.

Use 390×844, 844×390, and 1280×720 to validate the proposed critical journeys.
Pixel checks support the architectural recommendation; they are not the main deliverable.
Do not generate more HUD variants before completing the whole-app analysis.

## Design constraints and approval

- **No cream in new proposed chrome.**
- North star: **Offsuit × Catan**. Borrow restraint, purposeful hierarchy, and confident type.
- The island is the hero. Avoid generic decoration and unnecessary containers.
- Read `docs/DECISIONS.md`, `docs/design/polish.md`, `ux-review-2026-10.md`, and `jelly-ocean.md`.
- Respect existing decisions. If the recommended revamp would change one, name that conflict for Jarrod's choice.
- Do not silently replace goods V1, Chat C, game rules, scoring privacy, or board-fit behaviour.
- No new emoji outside the approved reaction system.
- Jarrod chooses the architecture before builders receive implementation issues.
- No runtime code, commit, push, or publication without Jarrod's request.

## Useful work already available

The preceding pass produced a **narrow HUD study**, not the requested architecture review.
Keep it as supporting research:

- Current renderer baseline: `51cbe384b24f5ba45c91b630ec45f6a05c162a43`.
- 69 measured UI views and 72 evidence PNGs across the three required sizes.
- Ranked HUD/source/overlay findings and 16 static HUD mock variants.
- Legibility, name/event truncation, portrait results, menu scaling, and public/private-score findings.
- Verified identical board-hole pixels for both HUD proposals at all three sizes.

These mocks are unapproved and contain known detail corrections. They are not the final architecture options.
The comparison gallery remains unfinished. Do not treat it as the owner-selected direction.

Goods #773/#909 and fortune controls #776 have landed. Chat #899 remains open.
The architecture review can proceed now. Record integration checks that require Chat C to land.

## Local handoff

Workspace:
`/Users/jarrod.johnson/Documents/Codex/2026-10-20/resume-emberisle-903-from-the-paused`

Start with:
`outputs/RESUME-WHOLE-APP-903.md`

Luna reflection:
`outputs/LESSONS-903-LUNA.md`

Current source:
`work/emberisle-current`

HUD supporting research:
`work/emberisle-current/docs/design/hud-pass/v2/`

Status: paused at 100% of the five-hour allowance. Resets October 20 at 8:20 PM Phoenix.
No runtime files changed; no commits, pushes, or PR were created.

<details>
<summary>Original narrower brief, retained for history; superseded by the owner rescope above</summary>

Owner ask (Jarrod, 2026-10-20): "Eventually would like Fable or Astra to work on UI for players' names and overall all HUD items." Not now. Another day.

## Deliverable
A full design pass on the HUD by Claude Fable 5.1 or GPT-6 Astra, in the style of the chat C audit (`docs/design/chat-c/`):
- **Audit:** the real game at 390x844, 844x390 and 1280x720. Cover the seat rail and strip (names, points, tallies, badges, turn ring), the hand, the build bar, the instruction line, the menus and the overlays. Rank the problems and cite screenshots.
- **Two directions,** each as high-fidelity mocks over real screenshots, plus one comparison board.
- **Constraints:**
  - It must fit the decisions already in docs/DECISIONS.md: goods cards V1 (#773), chat C (#899) and seat tallies (#859).
  - No emoji in the UI. Use the lucide icons or custom icons.
  - The map hole and board fit stay intact.
- Jarrod picks. Then the review desk writes the build issues, and builders work only from approved mocks.

## Wait for
#773 and #899 to land first, so the audit sees the new cards and chat.

Size: L (research)

</details>
