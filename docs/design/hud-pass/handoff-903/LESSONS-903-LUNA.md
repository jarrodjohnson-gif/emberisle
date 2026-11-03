# Emberisle #903 — lessons from the scope correction

## What the narrow pass usefully established

The HUD and overlay pass produced a substantial evidence base against current source `51cbe384b24f5ba45c91b630ec45f6a05c162a43`: 69 measured UI views across portrait, landscape, and desktop, plus 16 static HUD direction mocks. The source review recorded concrete hierarchy, density, typography, and layout issues, with distinctions between actual controls and small readouts. The overlay review also found specific usability concerns: the portrait results view initially clips the totals column; the hotseat trade helper describes a player-trade route that is not offered; and several landscape sheets put content below the initial view without a strong overflow cue.

The review documented important product and behavior constraints that a broader recommendation should preserve or explicitly discuss: public score differs from a player's private hidden total; unavailable builds and their costs remain inspectable; the board's playing area stays fixed as phases change; approved hand behavior, placement and keyboard flows, focus return, and useful temporal feedback matter. Existing decisions and issue ownership were also recorded, including the approved hand V1 and pending Chat C dependency. These details can prevent a future redesign from breaking established semantics or duplicating work.

The evidence also supports a cross-screen design observation: repeated cream shells, nested panels, and equally weighted controls appear in the HUD and several overlays. This is a reason to examine system-wide visual hierarchy in the full review. It is not, by itself, proof that the app needs a complete revamp.

## What went wrong in the scope assumption

The pass treated GitHub #903's narrow HUD phase-one framing as the user's whole request. That framing pulled attention toward visibility, clipping, control sizes, typography, and proposed HUD directions. Jarrod had intended the first full-app UX and product-architecture assessment: examine how the whole game is organized and used, form an independent opinion about what should stay, change, or be replaced, and decide whether a revamp is warranted. The owner clarified this only after the narrow work was presented.

The mismatch was one of deliverable and decision level, not a lack of effort or evidence. The pass deeply examined selected screens but did not map the app's end-to-end structure or compare coherent product architectures. Therefore its HUD directions cannot answer the revamp question. A large volume of screenshots and mocks can create a false sense of completeness when the review has not answered the user's central product question.

## How the next review should avoid repeating it

Start by writing the intended decision and coverage in one sentence, then compare it with the issue's local scope and the user's latest direct instruction. If they differ, use the user's clarified outcome to set the review boundary and retain issue constraints as inputs to reconcile. Before capturing more screens, make a whole-app map and journey inventory. Gather evidence across entry and onboarding, identity/profile, lobby and setup, modes, gameplay, trade and chat, help, recovery, and results/progression. Use source inspection and real interaction alongside screenshots; a static mock demonstrates a proposed appearance, not runtime behavior or product architecture.

Separate findings by level: app structure and navigation; journey and interaction model; visual system; individual defects. Then state a recommendation with reasons and tradeoffs: what to keep, rethink, or replace; whether a full revamp is justified; and a coherent target structure and flows. If major alternatives help, make them meaningfully different product/interaction models. Treat visuals as explanations of the recommendation, not substitutes for it. Do not send implementation work until Jarrod chooses or approves a direction.

## Questions the whole-app review still needs to answer

- Can a new or returning player understand where to enter, what mode they are in, and what to do next?
- Do identity, lobby, setup, game, social actions, help, recovery, and results form a clear journey, including interruption, reconnect, and exit paths?
- Which concepts and controls should be global, contextual, or absent, and how should navigation preserve game state?
- Does the current interaction architecture fit the game's rules and social/hotseat use, or are local fixes masking structural friction?
- Which existing decisions and shipped behaviors are hard constraints, and which are open to reconsideration?
- What is the smallest coherent redesign that resolves evidenced structural problems, and what evidence would justify a larger revamp?

## Evidence limits

The 69 views and 16 mocks are valuable inputs to the later review, but the static mocks have not been validated as runtime interactions or as a whole-app architecture. Their render QA and board-pixel comparisons establish only the checks described in the handoff; they do not establish keyboard, focus, rotation, dynamic chat, or end-to-end behavior. Some mock defects are already recorded in the handoff and should be corrected before reuse. Current-source measurements and specific overlay observations support their stated screen-level findings, not general claims about every flow.

No objective evidence in these notes yet establishes that a full revamp is needed. The next review should reach that conclusion only after mapping and evaluating the complete product journey, then present the recommendation for Jarrod's decision. This document records lessons and handoff context; it makes no runtime changes.
